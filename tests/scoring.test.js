import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { validateRules, aggregate, RulesError } from "../grader/scoring.js";

const rules = () => JSON.parse(fs.readFileSync(new URL("../rules/rules.json", import.meta.url), "utf8"));
const ok = (metric, score, extra = {}) => ({ metric, status: "ok", score, evidence: "", details: {}, ...extra });
const cases = (...statuses) => ({ cases: statuses.map((status, i) => ({ name: `c${i}`, status })) });

test("default rules validate", () => assert.ok(validateRules(rules())));

test("invalid rules are rejected with every problem listed", () => {
  const r = rules(); r.metrics.correctness.weight = -1; r.scale = 0;
  assert.throws(() => validateRules(r), (e) => e instanceof RulesError && e.errors.length >= 2);
});

test("weighted aggregation", () => {
  const out = aggregate([ok("correctness", 100, { details: cases("pass") }), ok("static_analysis", 50), ok("complexity", 100), ok("similarity", 100)], rules());
  // 0.5*100 + 0.2*50 + 0.15*100 + 0.15*100 = 90
  assert.equal(out.raw_score, 90);
  assert.equal(out.final_score, 90);
});

test("skipped metric weight is renormalised", () => {
  const out = aggregate([ok("correctness", 100, { details: cases("pass") }), ok("static_analysis", 100), ok("complexity", 100),
    { metric: "similarity", status: "skipped", score: null, evidence: "no refs" }], rules());
  assert.equal(out.raw_score, 100);
  assert.equal(out.rows.find((r) => r.metric === "similarity").effective_weight, 0);
});

test("runtime-failure cap applies only when ALL cases fail at runtime", () => {
  const base = [ok("static_analysis", 100), ok("complexity", 100), ok("similarity", 100)];
  const all = aggregate([ok("correctness", 0, { details: cases("timeout", "crash", "timeout") }), ...base], rules());
  assert.equal(all.cap.applied, true);
  assert.equal(all.final_score, 20);
  assert.ok(all.raw_score > 20, "raw score is retained");

  const partial = aggregate([ok("correctness", 33.33, { details: cases("timeout", "pass", "fail") }), ...base], rules());
  assert.equal(partial.cap.applied, false);

  const wrong = aggregate([ok("correctness", 0, { details: cases("fail", "fail") }), ...base], rules());
  assert.equal(wrong.cap.applied, false);
});

test("cap policy can be disabled by rules", () => {
  const r = rules(); r.runtime_failure_cap.enabled = false;
  const out = aggregate([ok("correctness", 0, { details: cases("timeout") }), ok("static_analysis", 100), ok("complexity", 100), ok("similarity", 100)], r);
  assert.equal(out.cap.applied, false);
});

test("errored analyzer is excluded and warned about", () => {
  const out = aggregate([ok("correctness", 100, { details: cases("pass") }), { metric: "static_analysis", status: "error", score: null, evidence: "boom" }, ok("complexity", 100), ok("similarity", 100)], rules());
  assert.equal(out.raw_score, 100);
  assert.ok(out.warnings.some((w) => w.includes("static_analysis")));
});

test("missing enabled metric is an error under missing_metric_policy=error", () => {
  assert.throws(() => aggregate([ok("correctness", 100)], rules()), /produced no result/);
});

test("compile failure cap", () => {
  const out = aggregate([ok("correctness", 0), ok("static_analysis", 100), ok("complexity", 100), ok("similarity", 100)], rules(), { compiled: false });
  assert.equal(out.final_score, 0);
  assert.equal(out.cap.kind, "compile_failure");
});
