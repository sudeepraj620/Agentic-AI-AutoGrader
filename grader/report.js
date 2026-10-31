// ============================================================================
// PHASE 6 — REPORTS: one structured JSON report (machine-readable) and one
// plain-text rendering (student-readable). Both are built from the same data,
// so they cannot disagree. Includes failing inputs and an honest limitations list.
// ============================================================================
export const LIMITATIONS = [
  "Timeouts and output caps are best-effort process control, not a secure sandbox; memory limits are POSIX-only and not applied to sanitizer runs.",
  "Correctness reflects only the supplied test cases; passing them does not prove the program is correct for all inputs.",
  "Complexity and similarity are heuristics: not a formal complexity proof and not a definitive plagiarism finding.",
  "Skipped or errored analyzers are excluded and the remaining weights renormalised; check the 'skipped' rows before trusting a grade.",
];

export function buildReport({ agg, compile, rules, log }) {
  const cases = agg.rows.find((r) => r.metric === "correctness")?.details?.cases || [];
  return {
    schema: "autograder.report/1",
    summary: { raw_score: agg.raw_score, final_score: agg.final_score, scale: agg.scale, letter: agg.letter, cap: agg.cap, warnings: agg.warnings },
    compile: { ok: compile.ok, diagnostics: compile.diagnostics, stderr: compile.stderr.slice(0, 2000) },
    metrics: agg.rows,
    failed_cases: cases.filter((c) => c.status !== "pass"),
    limitations: LIMITATIONS,
    rules_used: rules,
    log,
  };
}

export function toText(rep) {
  const s = rep.summary, L = [];
  L.push("AUTOGRADER REPORT", "=".repeat(60));
  L.push(`Final score : ${s.final_score}/${s.scale}  (grade ${s.letter})`);
  L.push(`Raw weighted: ${s.raw_score}/${s.scale}`);
  L.push(`Cap policy  : ${s.cap.applied ? "APPLIED — " : "not applied — "}${s.cap.reason}`);
  s.warnings.forEach((w) => L.push(`Warning     : ${w}`));
  L.push("", "METRICS", "-".repeat(60));
  for (const m of rep.metrics) {
    const sc = typeof m.score === "number" ? m.score.toFixed(2) : "n/a";
    L.push(`${m.metric.padEnd(16)} ${m.status.padEnd(8)} score ${sc.padStart(6)}  weight ${(m.effective_weight * 100).toFixed(1).padStart(5)}%  → ${m.contribution.toFixed(2)} pts`);
    L.push(`    ${m.evidence}`);
  }
  if (!rep.compile.ok) { L.push("", "COMPILER OUTPUT", "-".repeat(60), rep.compile.stderr); }
  if (rep.failed_cases.length) {
    L.push("", "FAILED TEST CASES", "-".repeat(60));
    for (const c of rep.failed_cases) {
      L.push(`[${c.status}] ${c.name}: ${c.reason}`, `  input    : ${JSON.stringify(c.input)}`, `  expected : ${JSON.stringify(c.expected)}`, `  actual   : ${JSON.stringify(c.actual)}`);
    }
  }
  const staticM = rep.metrics.find((m) => m.metric === "static_analysis");
  if (staticM?.details?.findings?.length) {
    L.push("", "STATIC FINDINGS", "-".repeat(60));
    staticM.details.findings.forEach((f) => L.push(`  line ${f.line}: [${f.level}] ${f.msg}`));
  }
  L.push("", "LIMITATIONS", "-".repeat(60), ...rep.limitations.map((x) => `  - ${x}`));
  return L.join("\n");
}
