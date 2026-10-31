// ============================================================================
// PHASE 2 — CORRECTNESS: run every test case against the already-compiled
// binary and compare actual vs expected output. Every failed case keeps its
// input, expected and actual output — the "concrete failing input" evidence
// the assignment brief asks for.
// ============================================================================
import { runProgram } from "./runner.js";

// Whitespace policy: ignore trailing spaces per line and trailing blank lines.
export const normalize = (s) =>
  String(s).replace(/\r\n/g, "\n").split("\n").map((l) => l.replace(/\s+$/, "")).join("\n").replace(/\s+$/, "");

export async function evaluateCorrectness({ exe, tests, limits }) {
  const cases = [];
  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    const run = await runProgram(exe, t.input, limits);
    let status = run.status, reason = run.reason;
    if (status === "ok") {
      if (normalize(run.stdout) === normalize(t.expected)) status = "pass";
      else { status = "fail"; reason = "output differs from expected output"; }
    }
    cases.push({
      name: t.name || `case ${i + 1}`, status, reason,
      input: t.input, expected: t.expected,
      actual: run.stdout.slice(0, 500), stderr: run.stderr.slice(0, 300), durationMs: run.durationMs,
    });
  }
  const passed = cases.filter((c) => c.status === "pass").length;
  return {
    metric: "correctness", status: "ok",
    score: round2((100 * passed) / cases.length),
    evidence: `${passed}/${cases.length} test cases passed`,
    details: { passed, total: cases.length, cases },
  };
}

const round2 = (n) => Math.round(n * 100) / 100;
