// ============================================================================
// PHASE 3c — COMPLEXITY (heuristic): McCabe-style estimate = 1 + decision
// points (if/for/while/case/&&/||/?:) over the whole file, plus max brace depth.
// Full score up to `max_ok`, linearly down to 0 at `zero_at`.
// This is a style signal, NOT a proof of algorithmic complexity.
// ============================================================================
import { stripNoise } from "./lex.js";

const DECISIONS = [/\bif\b/g, /\bfor\b/g, /\bwhile\b/g, /\bcase\b/g, /&&/g, /\|\|/g, /\?/g];

export function evaluateComplexity({ source, cfg }) {
  const clean = stripNoise(source);
  const cc = 1 + DECISIONS.reduce((n, re) => n + (clean.match(re) || []).length, 0);
  let depth = 0, maxDepth = 0;
  for (const ch of clean) { if (ch === "{") maxDepth = Math.max(maxDepth, ++depth); else if (ch === "}") depth--; }

  const score = cc <= cfg.max_ok ? 100 : Math.max(0, Math.round((10000 * (cfg.zero_at - cc)) / (cfg.zero_at - cfg.max_ok)) / 100);
  return {
    metric: "complexity", status: "ok", score,
    evidence: `estimated cyclomatic complexity ${cc} (full marks up to ${cfg.max_ok}); max nesting depth ${maxDepth}`,
    details: { cyclomatic: cc, maxDepth },
  };
}
