// Shared helper: blank out comments and string/char literal contents while
// keeping every character offset and newline, so line numbers stay correct.
const NOISE = /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;

export function stripNoise(src) {
  return String(src).replace(NOISE, (m, lit) =>
    lit ? lit[0] + " ".repeat(lit.length - 2) + lit[0] : m.replace(/[^\n]/g, " ")
  );
}
