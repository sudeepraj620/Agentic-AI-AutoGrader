// ============================================================================
// The single choke point for everything that runs untrusted code.
//   - binds to 127.0.0.1 ONLY (never expose this port to a network)
//   - grades one submission at a time (a queue), so timings stay meaningful
//   - GET /api/rules   → the default external rules file (rules/rules.json)
//   - GET /api/health  → is gcc present? is the sanitizer runtime usable?
//   - POST /api/grade  → { source, tests, rules?, references? } → report JSON
// ============================================================================
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gradeSubmission, InputError } from "./grader/coordinator.js";
import { RulesError } from "./grader/scoring.js";
import { toText } from "./grader/report.js";
import { execCapture, makeWorkdir, removeWorkdir, compileC } from "./grader/runner.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const RULES_FILE = path.join(here, "rules", "rules.json");
const PORT = Number(process.env.PORT) || 8788;

const app = express();
app.use(express.json({ limit: "1mb" }));

let chain = Promise.resolve();
const enqueue = (fn) => { const p = chain.then(fn); chain = p.catch(() => {}); return p; };

const loadRules = async () => JSON.parse(await fs.readFile(RULES_FILE, "utf8"));

app.get("/api/rules", async (req, res) => {
  try { res.json(await loadRules()); } catch (e) { res.status(500).json({ error: `cannot read rules/rules.json: ${e.message}` }); }
});

let healthCache = null;
app.get("/api/health", async (req, res) => {
  if (healthCache) return res.json(healthCache);
  const v = await execCapture("gcc", ["--version"], { timeoutMs: 4000 });
  const gcc = !v.spawnError && v.code === 0;
  let sanitizer = false;
  if (gcc) {
    const dir = await makeWorkdir();
    try {
      const limits = { compile_timeout_ms: 15000 };
      const c = await compileC("int main(void){return 0;}", dir, limits, { sanitize: true });
      sanitizer = c.ok;
    } finally { await removeWorkdir(dir); }
  }
  healthCache = { gcc, gccVersion: gcc ? v.stdout.split("\n")[0] : null, sanitizer };
  res.json(healthCache);
});

app.post("/api/grade", async (req, res) => {
  try {
    const { source, tests, references } = req.body || {};
    const rules = req.body?.rules || (await loadRules());
    const report = await enqueue(() => gradeSubmission({ source, tests, rules, references }));
    res.json({ ...report, text_report: toText(report) });
  } catch (err) {
    if (err instanceof RulesError || err instanceof InputError) return res.status(400).json({ error: err.message, errors: err.errors });
    console.error("grade error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`AutoGrader API on http://127.0.0.1:${PORT}  (localhost only)`);
  console.log("  WARNING: this server compiles and runs submitted C code. Use a container/VM for untrusted code.");
});
