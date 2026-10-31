// ============================================================================
// PHASE 3b — STATIC ANALYSIS: compiler diagnostics (gcc -fsyntax-only with
// strict warnings) plus a short list of banned unsafe C functions.
// score = 100 - warnings*W - errors*E - banned*B   (penalties live in rules.json)
// ============================================================================
import path from "node:path";
import fs from "node:fs/promises";
import { execCapture, parseDiagnostics } from "./runner.js";
import { stripNoise } from "./lex.js";

const BANNED = /\b(gets|strcpy|strcat|sprintf)\s*\(/g;

export async function evaluateStatic({ dir, source, limits, cfg }) {
  const file = path.join(dir, "main.c");
  await fs.writeFile(file, source);
  const r = await execCapture("gcc", ["-std=c11", "-fsyntax-only", "-Wall", "-Wextra", "-Wpedantic", file],
    { timeoutMs: limits.compile_timeout_ms, maxBytes: 200000, cwd: dir });
  if (r.spawnError) return { metric: "static_analysis", status: "error", score: null, evidence: `gcc not available: ${r.spawnError}`, details: {} };

  const diags = parseDiagnostics(r.stderr.replaceAll(dir + path.sep, ""));
  const warnings = diags.filter((d) => d.level === "warning");
  const errors = diags.filter((d) => d.level === "error");

  const clean = stripNoise(source), banned = [];
  let m;
  while ((m = BANNED.exec(clean))) banned.push({ line: clean.slice(0, m.index).split("\n").length, level: "banned", msg: `banned unsafe function ${m[1]}()` });

  const score = Math.max(0, 100 - warnings.length * cfg.warning_penalty - errors.length * cfg.error_penalty - banned.length * cfg.banned_penalty);
  return {
    metric: "static_analysis", status: "ok", score,
    evidence: `${warnings.length} warning(s), ${errors.length} error(s), ${banned.length} banned call(s)`,
    details: { findings: [...errors, ...warnings, ...banned].slice(0, 20) },
  };
}
