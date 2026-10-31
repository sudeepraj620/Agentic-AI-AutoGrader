// ============================================================================
// PHASE 3d — SIMILARITY / ORIGINALITY (heuristic): normalise both programs to
// a token stream (identifiers → ID, numbers → NUM, comments gone), build
// 4-token shingles and compare with Jaccard similarity. Renaming variables
// does NOT hide a copy. The result is a FLAG for a human, never a verdict.
// ============================================================================
import { stripNoise } from "./lex.js";

const KEEP = new Set(("auto break case char const continue default do double else enum extern float for goto if inline int long " +
  "register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while " +
  "main printf scanf puts getchar putchar malloc calloc free strlen strcmp fgets fprintf stdin stdout stderr NULL").split(" "));

function shingles(src, k = 4) {
  const tokens = stripNoise(src).replace(/^\s*#.*$/gm, " ").match(/[A-Za-z_]\w*|\d+(?:\.\d+)?|\S/g) || [];
  const norm = tokens.map((t) => (/^[A-Za-z_]/.test(t) ? (KEEP.has(t) ? t : "ID") : /^\d/.test(t) ? "NUM" : t));
  const set = new Set();
  for (let i = 0; i + k <= norm.length; i++) set.add(norm.slice(i, i + k).join(" "));
  return set;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function evaluateSimilarity({ source, references, cfg }) {
  if (!references?.length) return { metric: "similarity", status: "skipped", score: null, evidence: "no reference submissions supplied", details: {} };
  const mine = shingles(source);
  const scores = references.map((r, i) => ({ reference: `reference ${i + 1}`, similarity: Math.round(jaccard(mine, shingles(r)) * 1000) / 1000 }));
  const max = Math.max(...scores.map((s) => s.similarity));
  const flagged = max >= cfg.threshold;
  const score = flagged ? Math.round(10000 * (1 - (max - cfg.threshold) / (1 - cfg.threshold))) / 100 : 100;
  const pct = (x) => (x * 100).toFixed(1) + "%";
  return {
    metric: "similarity", status: "ok", score,
    evidence: flagged
      ? `FLAGGED: ${pct(max)} structural overlap with a reference (threshold ${pct(cfg.threshold)}) — needs human review`
      : `highest overlap ${pct(max)} is below the ${pct(cfg.threshold)} threshold`,
    details: { flagged, max, scores },
  };
}
