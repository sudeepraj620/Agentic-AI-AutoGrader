// ============================================================================
// PHASE 3a — MEMORY SAFETY: rebuild with AddressSanitizer + UBSan, rerun the
// tests, and look for sanitizer reports on stderr. If the sanitizer runtime is
// missing (common on Windows/macOS toolchains) the metric is SKIPPED — never
// guessed — and the scoring layer renormalizes the weights.
// ============================================================================
import { compileC, runProgram } from "./runner.js";

const REPORT = /AddressSanitizer|LeakSanitizer|runtime error:/;

export async function evaluateMemory({ source, dir, tests, limits }) {
  const build = await compileC(source, dir, limits, { sanitize: true });
  if (!build.ok) {
    return { metric: "memory_safety", status: "skipped", score: null,
      evidence: "sanitizer build failed — toolchain likely lacks libasan/libubsan", details: { stderr: build.stderr.slice(0, 400) } };
  }
  let counted = 0, clean = 0;
  const issues = [];
  for (const t of tests) {
    const run = await runProgram(build.exe, t.input, limits, { sanitize: true, timeoutScale: 5 });
    if (run.status === "timeout") continue; // not a memory verdict
    counted++;
    const hit = run.stderr.split("\n").find((l) => REPORT.test(l));
    if (hit) issues.push({ case: t.name, report: hit.trim().slice(0, 200) }); else clean++;
  }
  if (!counted) return { metric: "memory_safety", status: "skipped", score: null, evidence: "no test case ran to completion under the sanitizer", details: {} };
  return {
    metric: "memory_safety", status: "ok", score: Math.round((10000 * clean) / counted) / 100,
    evidence: issues.length ? `${issues.length}/${counted} runs triggered a sanitizer report` : `${counted}/${counted} runs were sanitizer-clean`,
    details: { issues },
  };
}
