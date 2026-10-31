// End-to-end: real gcc, real processes. Skipped automatically if gcc is absent.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { gradeSubmission } from "../grader/coordinator.js";
import { SAMPLES } from "../src/samples.js";

const hasGcc = spawnSync("gcc", ["--version"]).status === 0;
const rules = () => JSON.parse(fs.readFileSync(new URL("../rules/rules.json", import.meta.url), "utf8"));
const sample = (id) => SAMPLES.find((s) => s.id === id);
const grade = (id, r = rules()) => { const s = sample(id); return gradeSubmission({ source: s.source, tests: s.tests, references: s.references, rules: r }); };
const metric = (rep, name) => rep.metrics.find((m) => m.metric === name);

test("correct program scores high", { skip: !hasGcc }, async () => {
  const rep = await grade("correct");
  assert.equal(metric(rep, "correctness").score, 100);
  assert.ok(rep.summary.final_score > 90);
  assert.equal(rep.summary.cap.applied, false);
});

test("wrong answer gets partial credit, no cap, and a concrete failing input", { skip: !hasGcc }, async () => {
  const rep = await grade("wrong");
  assert.ok(metric(rep, "correctness").score > 0 && metric(rep, "correctness").score < 100);
  assert.equal(rep.summary.cap.applied, false);
  assert.ok(rep.failed_cases[0].expected && "actual" in rep.failed_cases[0]);
});

test("infinite loop: all cases time out and the final score is capped at 20", { skip: !hasGcc }, async () => {
  const r = rules(); r.limits.run_timeout_ms = 300;
  const rep = await grade("loop", r);
  assert.ok(rep.failed_cases.every((c) => c.status === "timeout"));
  assert.equal(rep.summary.final_score, 20);
  assert.ok(rep.summary.raw_score > 20);
});

test("crash is capped too", { skip: !hasGcc }, async () => {
  const rep = await grade("crash");
  assert.ok(rep.failed_cases.every((c) => ["crash", "runtime_error"].includes(c.status)));
  assert.equal(rep.summary.final_score, 20);
});

test("compile error is reported and capped at 0", { skip: !hasGcc }, async () => {
  const rep = await grade("compile");
  assert.equal(rep.compile.ok, false);
  assert.ok(rep.compile.stderr.length > 0);
  assert.equal(rep.summary.final_score, 0);
});

test("renamed copy is flagged by similarity", { skip: !hasGcc }, async () => {
  const rep = await grade("copy");
  assert.equal(metric(rep, "similarity").details.flagged, true);
});

test("grading is reproducible", { skip: !hasGcc }, async () => {
  const a = await grade("wrong"), b = await grade("wrong");
  assert.equal(a.summary.final_score, b.summary.final_score);
  assert.deepEqual(a.metrics.map((m) => m.score), b.metrics.map((m) => m.score));
});
