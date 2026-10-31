# AutoGrader — a rule-driven evaluator for C programs

Upload (paste) a C submission and test cases, and AutoGrader compiles it, runs it
under a time limit, scores it with five analyzers, combines the scores with
**external, editable rules** (`rules/rules.json`), and produces a grade with
evidence: failing inputs, expected vs actual output, a cap decision and limitations.

**The grading contract is reproducibility:** the same submission graded under the
same rules gives the same grade. No model is involved anywhere — the grade is code.

## Setup
Requirements: **Node 18+** and **gcc** on your PATH
(Linux: `build-essential`; macOS: Xcode CLT; Windows: MSYS2/MinGW-w64 or WSL).

```bash
npm install
npm run dev          # API on 127.0.0.1:8788 + UI on http://localhost:5173
npm test             # 16 tests (needs gcc for the 7 end-to-end ones)
```
The status chip (top right) turns green when gcc is found; it also says whether the
AddressSanitizer runtime is usable. Without it, `memory_safety` is *skipped* and its
weight is redistributed — never guessed.

## One file per idea
| Phase | Concept | File |
|------:|---------|------|
| 1 | Compile once, run with timeout / output cap / memory limit | `grader/runner.js` |
| 2 | Correctness: per-case status + failing input/expected/actual | `grader/correctness.js` |
| 3a | Memory safety (ASan + UBSan) | `grader/memory.js` |
| 3b | Static analysis (gcc strict warnings + banned functions) | `grader/staticAnalysis.js` |
| 3c | Complexity (cyclomatic estimate) | `grader/complexity.js` |
| 3d | Similarity (normalised token shingles, Jaccard) | `grader/similarity.js` |
| 4 | Rules validation, weighted score, renormalisation, **cap policies** | `grader/scoring.js` + `rules/rules.json` |
| 5 | Coordinator: validate → compile → analyzers → score | `grader/coordinator.js` |
| 6 | JSON + text reports | `grader/report.js` |
| – | The only door to untrusted code (localhost-only, one job at a time) | `server.js` |
| – | UI | `src/App.jsx`, demo submissions in `src/samples.js` |

## Scoring rules (rules/rules.json)
* Default weights: correctness 0.50 · static analysis 0.20 · complexity 0.15 · similarity 0.15 · memory safety 0.20 (**disabled** by default).
* Skipped or errored metrics are removed and the remaining weights renormalised (`skipped_metric_policy`).
* **Runtime-failure cap:** if *every* correctness case ends in `timeout / crash / runtime_error / execution_error / output_limit`, the final score is capped (default 20). Raw and final scores are both kept in the report.
* **Compile-failure cap:** a program that does not compile is capped (default 0).
* Invalid rules are rejected with every problem listed.

## Demo arc (~10 min)
1. **Correct** → ~99/100. 2. **Wrong answer** → partial credit and concrete failing inputs.
3. **Infinite loop** → all cases time out, raw ≈ 40 but final **capped at 20**.
4. **Compile error** → compiler output, capped at 0.
5. **Hidden memory bug** → passes every test; enable *memory safety* and the sanitizer catches it.
6. **Copied (renamed)** → renamed variables, but flagged against the reference.
7. Edit a weight or the time limit in the Rules panel and re-grade; download the JSON/text report.

## API
`GET /api/rules` · `GET /api/health` · `POST /api/grade` with
`{ source, tests:[{name,input,expected}], rules?, references? }` → report JSON.

## Limitations (also printed in every report)
* **This runs submitted code on your machine.** The timeout/output/memory limits are best-effort process control, **not a sandbox**. Grade untrusted code only inside a container or VM. The server binds to 127.0.0.1 on purpose — never expose it.
* Memory limits use `ulimit -v` (POSIX only) and are not applied to sanitizer runs.
* Correctness covers only the given test cases. Complexity and similarity are heuristics, not proofs or plagiarism verdicts.

## Extending it
Add analyzers (one file + one entry in `METRICS` and `rules.json`), multi-file submissions, per-test weights, or a SQLite history behind `server.js`.
