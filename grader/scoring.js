// ============================================================================
// PHASE 4 — RULES & SCORING: the deterministic heart of the grader.
//
// The grade is computed HERE, from analyzer results and external rules.json —
// no model, no randomness. Same submission + same rules ⇒ same grade.
//   - weights of SKIPPED / errored metrics are renormalised away
//   - raw weighted score and final score are kept separately
//   - runtime-failure cap: if EVERY test case failed with a configured runtime
//     status (timeout/crash/...), the final score is capped (default 20)
//   - compile-failure cap: a program that does not compile is capped (default 0)
// ============================================================================
export const METRICS = ["correctness", "memory_safety", "static_analysis", "complexity", "similarity"];

export class RulesError extends Error {
  constructor(errors) { super(`Invalid rules: ${errors.join("; ")}`); this.name = "RulesError"; this.errors = errors; }
}

export function validateRules(r) {
  const e = [];
  const num = (v) => typeof v === "number" && Number.isFinite(v);
  if (!r || typeof r !== "object") throw new RulesError(["rules must be an object"]);
  if (!num(r.scale) || r.scale <= 0) e.push("scale must be a positive number");
  if (!["error", "skip"].includes(r.missing_metric_policy)) e.push('missing_metric_policy must be "error" or "skip"');
  if (r.skipped_metric_policy !== "renormalize") e.push('skipped_metric_policy must be "renormalize"');

  const L = r.limits || {};
  for (const k of ["compile_timeout_ms", "run_timeout_ms", "memory_mb", "max_output_bytes"]) {
    if (!num(L[k]) || L[k] < 0) e.push(`limits.${k} must be a non-negative number`);
  }
  if (num(L.run_timeout_ms) && (L.run_timeout_ms < 50 || L.run_timeout_ms > 10000)) e.push("limits.run_timeout_ms must be between 50 and 10000");

  let enabled = 0;
  for (const m of METRICS) {
    const c = r.metrics?.[m];
    if (!c) { e.push(`metrics.${m} is missing`); continue; }
    if (typeof c.enabled !== "boolean") e.push(`metrics.${m}.enabled must be true/false`);
    if (!num(c.weight) || c.weight < 0) e.push(`metrics.${m}.weight must be a number >= 0`);
    if (c.enabled) enabled++;
  }
  if (enabled === 0) e.push("at least one metric must be enabled");
  if (r.metrics?.complexity && !(r.metrics.complexity.zero_at > r.metrics.complexity.max_ok)) e.push("complexity.zero_at must be greater than complexity.max_ok");
  if (r.metrics?.similarity && !(r.metrics.similarity.threshold > 0 && r.metrics.similarity.threshold < 1)) e.push("similarity.threshold must be between 0 and 1");
  if (r.runtime_failure_cap && !(r.runtime_failure_cap.cap >= 0 && r.runtime_failure_cap.cap <= r.scale)) e.push("runtime_failure_cap.cap must be within 0..scale");
  if (e.length) throw new RulesError(e);
  return true;
}

const round2 = (n) => Math.round(n * 100) / 100;

export function gradeLetter(pct) {
  return pct >= 90 ? "A" : pct >= 80 ? "B" : pct >= 70 ? "C" : pct >= 60 ? "D" : "F";
}

// results: [{metric,status,score,evidence,details}]  →  summary + per-metric table
export function aggregate(results, rules, { compiled = true } = {}) {
  const byName = Object.fromEntries(results.map((r) => [r.metric, r]));
  const rows = [];

  for (const name of METRICS) {
    const cfg = rules.metrics[name];
    if (!cfg.enabled) continue;
    const res = byName[name];
    if (!res) {
      if (rules.missing_metric_policy === "error") throw new Error(`enabled metric "${name}" produced no result`);
      rows.push({ metric: name, status: "skipped", score: null, configured_weight: cfg.weight, effective_weight: 0, contribution: 0, evidence: "no result (missing_metric_policy=skip)" });
      continue;
    }
    const counted = res.status === "ok" && typeof res.score === "number";
    rows.push({ metric: name, status: res.status, score: counted ? res.score : null, configured_weight: cfg.weight, evidence: res.evidence, details: res.details, counted });
  }

  const totalWeight = rows.filter((r) => r.counted).reduce((s, r) => s + r.configured_weight, 0);
  if (totalWeight <= 0) throw new Error("no enabled metric produced a score with positive weight");

  let raw = 0;
  for (const r of rows) {
    const exact = r.counted ? r.configured_weight / totalWeight : 0;   // unrounded, so contributions sum to raw
    r.effective_weight = Math.round(exact * 1e4) / 1e4;
    r.contribution = round2(exact * (r.score ?? 0) * (rules.scale / 100));
    raw += exact * (r.score ?? 0) * (rules.scale / 100);
    delete r.counted;
  }
  raw = round2(raw);

  // ---- cap policies (the final score can only go DOWN) ----------------------
  let final = raw;
  const cap = { applied: false, kind: null, limit: null, reason: "no cap policy triggered" };
  const cc = rules.compile_failure_cap;
  const rc = rules.runtime_failure_cap;
  const cases = byName.correctness?.details?.cases;

  if (!compiled && cc?.enabled) {
    final = Math.min(raw, cc.cap);
    Object.assign(cap, { applied: final < raw, kind: "compile_failure", limit: cc.cap, reason: `submission did not compile; final score capped at ${cc.cap}` });
  } else if (rc?.enabled && cases?.length && cases.every((c) => rc.statuses.includes(c.status))) {
    final = Math.min(raw, rc.cap);
    Object.assign(cap, { applied: final < raw, kind: "runtime_failure", limit: rc.cap, reason: `all ${cases.length} correctness cases failed at runtime (${[...new Set(cases.map((c) => c.status))].join("/")}); final score capped at ${rc.cap}` });
  }

  const warnings = [];
  const wsum = METRICS.filter((m) => rules.metrics[m].enabled).reduce((s, m) => s + rules.metrics[m].weight, 0);
  if (Math.abs(wsum - 1) > 0.001) warnings.push(`enabled weights sum to ${round2(wsum)}, not 1.00 — they were normalised`);
  for (const r of rows) if (r.status === "error") warnings.push(`${r.metric} analyzer errored and was excluded: ${r.evidence}`);

  return {
    rows, warnings, cap,
    raw_score: raw, final_score: round2(final), scale: rules.scale,
    letter: gradeLetter((final / rules.scale) * 100),
  };
}
