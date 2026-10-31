// ============================================================================
// PHASE 5 — COORDINATOR: the "main agent". It validates the input, compiles
// once, decides which analyzers can run, runs each one in isolation (a crash in
// one analyzer cannot sink the grade), then hands the results to scoring.js.
// Every decision is streamed to `log` — governance you can watch.
// ============================================================================
import { makeWorkdir, removeWorkdir, compileC } from "./runner.js";
import { evaluateCorrectness } from "./correctness.js";
import { evaluateMemory } from "./memory.js";
import { evaluateStatic } from "./staticAnalysis.js";
import { evaluateComplexity } from "./complexity.js";
import { evaluateSimilarity } from "./similarity.js";
import { validateRules, aggregate, METRICS } from "./scoring.js";
import { buildReport } from "./report.js";

export class InputError extends Error {
  constructor(errors) { super(`Invalid input: ${errors.join("; ")}`); this.name = "InputError"; this.errors = errors; }
}

function validateInput({ source, tests, references }) {
  const e = [];
  if (typeof source !== "string" || !source.trim()) e.push("source must be non-empty C code");
  else if (source.length > 200_000) e.push("source is larger than 200 KB");
  if (!Array.isArray(tests) || tests.length === 0) e.push("at least one test case is required");
  else if (tests.length > 50) e.push("at most 50 test cases are allowed");
  else tests.forEach((t, i) => { if (typeof t?.input !== "string" || typeof t?.expected !== "string") e.push(`test ${i + 1} needs string "input" and "expected"`); });
  if (references && (!Array.isArray(references) || references.some((r) => typeof r !== "string"))) e.push("references must be an array of strings");
  if (e.length) throw new InputError(e);
}

export async function gradeSubmission({ source, tests, rules, references = [] }, onLog = () => {}) {
  const logLines = [];
  const log = (kind, msg) => { logLines.push({ kind, msg }); onLog({ kind, msg }); };

  validateRules(rules);
  validateInput({ source, tests, references });
  const limits = rules.limits;
  const enabled = (m) => rules.metrics[m].enabled;
  const on = METRICS.filter(enabled);

  log("plan", `plan: compile once → ${on.join(" → ")} → weighted score → cap policy → report.`);
  const dir = await makeWorkdir();
  try {
    const compile = await compileC(source, dir, limits);
    log(compile.ok ? "observe" : "error", compile.ok ? "compile: OK (gcc -std=c11 -Wall -Wextra)" : `compile: FAILED — ${compile.diagnostics.length} diagnostic(s)`);

    const results = [];
    const run = async (name, fn) => {
      if (!enabled(name)) return;
      log("analyzer", `${name}: running`);
      try {
        const r = await fn();
        results.push(r);
        log(r.status === "ok" ? "observe" : "warn", `${name}: ${r.status}${typeof r.score === "number" ? ` (score ${r.score})` : ""} — ${r.evidence}`);
      } catch (err) {
        results.push({ metric: name, status: "error", score: null, evidence: `analyzer crashed: ${err.message}`, details: {} });
        log("error", `${name}: analyzer crashed — ${err.message}`);
      }
    };

    if (compile.ok) {
      await run("correctness", () => evaluateCorrectness({ exe: compile.exe, tests, limits }));
      await run("memory_safety", () => evaluateMemory({ source, dir, tests, limits }));
    } else {
      for (const m of ["correctness", "memory_safety"]) {
        if (enabled(m)) results.push({ metric: m, status: "ok", score: 0, evidence: "not run: compilation failed", details: {} });
      }
    }
    await run("static_analysis", () => evaluateStatic({ dir, source, limits, cfg: rules.metrics.static_analysis }));
    await run("complexity", async () => evaluateComplexity({ source, cfg: rules.metrics.complexity }));
    await run("similarity", async () => evaluateSimilarity({ source, references, cfg: rules.metrics.similarity }));

    const agg = aggregate(results, rules, { compiled: compile.ok });
    log("verdict", `raw weighted score ${agg.raw_score}; final ${agg.final_score}/${agg.scale} (${agg.letter}). ${agg.cap.reason}.`);
    return buildReport({ agg, compile, rules, log: logLines });
  } finally {
    await removeWorkdir(dir);
  }
}
