// ============================================================================
// PHASE 1 — EXECUTION FOUNDATION: compile C, run the binary, capture
// stdout/stderr/exit code, enforce a wall-clock timeout and an output cap.
//
// HONEST LIMITS: this is best-effort process control, NOT a security sandbox.
// A hostile submission can still touch your files or network. Run the whole
// server inside a container/VM if the code you grade is not trusted.
// ============================================================================
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const WIN = process.platform === "win32";

export const makeWorkdir = () => fs.mkdtemp(path.join(os.tmpdir(), "autograder-"));
export const removeWorkdir = (dir) => fs.rm(dir, { recursive: true, force: true });

// Run a command to completion (or kill it) and always resolve with a record.
export function execCapture(cmd, args, { input = "", timeoutMs = 1000, maxBytes = 65536, cwd, env } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    let stdout = "", stderr = "", timedOut = false, truncated = false, spawnError = null, settled = false;

    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });

    const finish = (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, code, signal, timedOut, truncated, spawnError, durationMs: Date.now() - started });
    };
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);

    const collect = (which) => (chunk) => {
      if (stdout.length + stderr.length > maxBytes) { truncated = true; child.kill("SIGKILL"); return; }
      if (which === "out") stdout += chunk.toString(); else stderr += chunk.toString();
    };
    child.stdout.on("data", collect("out"));
    child.stderr.on("data", collect("err"));
    child.on("error", (e) => { spawnError = e.message; finish(null, null); });
    child.on("close", (code, signal) => finish(code, signal));
    child.stdin.on("error", () => {}); // program exited before reading all input
    child.stdin.end(input);
  });
}

// "main.c:12:5: warning: ... [-Wunused-variable]" → structured diagnostics.
export function parseDiagnostics(stderr) {
  const out = [];
  const re = /^main\.c:(\d+):(\d+): (warning|error|fatal error): (.*)$/gm;
  let m;
  while ((m = re.exec(stderr))) out.push({ line: +m[1], col: +m[2], level: m[3] === "warning" ? "warning" : "error", msg: m[4] });
  return out;
}

// Compile ONCE; the resulting binary is reused for every test case.
export async function compileC(source, dir, limits, { sanitize = false } = {}) {
  const src = path.join(dir, "main.c");
  await fs.writeFile(src, source);
  const exe = path.join(dir, (sanitize ? "prog_san" : "prog") + (WIN ? ".exe" : ""));
  const args = [
    "-std=c11", "-Wall", "-Wextra", "-O0",
    ...(sanitize ? ["-fsanitize=address,undefined", "-fno-omit-frame-pointer"] : []),
    "-o", exe, src, "-lm",
  ];
  const r = await execCapture("gcc", args, { timeoutMs: limits.compile_timeout_ms, maxBytes: 200000, cwd: dir });
  const ok = !r.spawnError && !r.timedOut && r.code === 0;
  const stderr = r.spawnError ? `gcc not available: ${r.spawnError}` : r.timedOut ? "compilation timed out" : r.stderr.replaceAll(dir + path.sep, "");
  return { ok, exe, stderr, diagnostics: parseDiagnostics(stderr) };
}

// Run the compiled binary on one input. Status vocabulary (used by the
// correctness analyzer and by the runtime-failure cap policy):
//   ok | timeout | crash | runtime_error | execution_error | output_limit
export async function runProgram(exe, input, limits, { sanitize = false, timeoutScale = 1 } = {}) {
  // Best-effort memory limit on POSIX. Sanitizer builds reserve huge virtual
  // memory, so ulimit -v is skipped for them.
  const useUlimit = !WIN && limits.memory_mb > 0 && !sanitize;
  const [cmd, args] = useUlimit
    ? ["sh", ["-c", `ulimit -v ${limits.memory_mb * 1024} 2>/dev/null; exec "$0"`, exe]]
    : [exe, []];
  const env = sanitize ? { ASAN_OPTIONS: "detect_leaks=1", UBSAN_OPTIONS: "print_stacktrace=0" } : undefined;
  const timeoutMs = limits.run_timeout_ms * timeoutScale;

  const r = await execCapture(cmd, args, { input, timeoutMs, maxBytes: limits.max_output_bytes, cwd: path.dirname(exe), env });

  let status = "ok", reason = "";
  if (r.spawnError) { status = "execution_error"; reason = r.spawnError; }
  else if (r.timedOut) { status = "timeout"; reason = `exceeded the ${timeoutMs} ms time limit`; }
  else if (r.truncated) { status = "output_limit"; reason = `printed more than ${limits.max_output_bytes} bytes`; }
  else if (r.signal) { status = "crash"; reason = `terminated by signal ${r.signal}`; }
  else if (r.code !== 0) { status = "runtime_error"; reason = `non-zero exit code ${r.code}`; }
  return { status, reason, stdout: r.stdout, stderr: r.stderr, code: r.code, durationMs: r.durationMs };
}
