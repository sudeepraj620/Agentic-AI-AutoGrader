import { useEffect, useState } from "react";
import {
  Play, Cpu, FileCode2, Gauge, Download, AlertTriangle, CheckCircle2, XCircle,
  Clock, Plus, Trash2, Settings2, ShieldCheck, Loader2,
} from "lucide-react";
import { SAMPLES } from "./samples.js";

const C = { bg: "#0b1220", panel: "#111a2e", line: "#22304f", text: "#e6ecf8", dim: "#8fa0c0", faint: "#5d6e92",
  ok: "#34d399", warn: "#fbbf24", bad: "#f87171", accent: "#60a5fa" };
const LABEL = { correctness: "Correctness", memory_safety: "Memory safety", static_analysis: "Static analysis", complexity: "Complexity", similarity: "Similarity" };
const scoreColor = (p) => (p >= 80 ? C.ok : p >= 50 ? C.warn : C.bad);
const logColor = (k) => ({ error: C.bad, warn: C.warn, verdict: C.accent, analyzer: C.dim, observe: C.ok, plan: C.faint }[k] || C.dim);

function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
}

export default function App() {
  const [health, setHealth] = useState(null);
  const [rules, setRules] = useState(null);
  const [sampleId, setSampleId] = useState("correct");
  const [source, setSource] = useState(SAMPLES[0].source);
  const [tests, setTests] = useState(SAMPLES[0].tests);
  const [refs, setRefs] = useState(SAMPLES[0].references);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then(setHealth).catch(() => setHealth({ gcc: false, offline: true }));
    fetch("/api/rules").then((r) => r.json()).then(setRules).catch(() => setError("Cannot reach the API. Is `npm run dev` running?"));
  }, []);

  function loadSample(s) {
    setSampleId(s.id); setSource(s.source); setTests(s.tests); setRefs(s.references); setReport(null); setError(null);
  }
  const patchMetric = (name, patch) => setRules((r) => ({ ...r, metrics: { ...r.metrics, [name]: { ...r.metrics[name], ...patch } } }));
  const patchTest = (i, patch) => setTests((t) => t.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function grade() {
    setRunning(true); setError(null);
    try {
      const res = await fetch("/api/grade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source, tests, rules, references: refs }) });
      const data = await res.json();
      if (!res.ok) throw new Error((data.errors || [data.error]).join("; "));
      setReport(data); setTab("overview");
    } catch (e) { setError(e.message); }
    finally { setRunning(false); }
  }

  const sample = SAMPLES.find((s) => s.id === sampleId);

  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.text }}>
      <header className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: C.line }}>
        <div className="flex items-center gap-3">
          <Gauge size={22} color={C.accent} />
          <div>
            <div className="font-semibold tracking-tight">AutoGrader</div>
            <div className="text-[11px]" style={{ color: C.faint }}>rule-driven evaluator for C programs</div>
          </div>
        </div>
        <StatusChip health={health} />
      </header>

      <main className="grid lg:grid-cols-2 gap-5 p-5 max-w-[1400px] mx-auto">
        {/* ---------------- LEFT: inputs ---------------- */}
        <div className="space-y-5">
          <Panel title="Submission" icon={FileCode2} sub="paste a C program or load a demo">
            <div className="flex flex-wrap gap-2 mb-3">
              {SAMPLES.map((s) => (
                <button key={s.id} onClick={() => loadSample(s)} className="text-[12px] px-2.5 py-1 rounded-md border"
                  style={{ borderColor: sampleId === s.id ? C.accent : C.line, color: sampleId === s.id ? C.accent : C.dim, background: sampleId === s.id ? "#16233f" : "transparent" }}>
                  {s.label}
                </button>
              ))}
            </div>
            {sample && <div className="text-[11px] mb-2" style={{ color: C.faint }}>{sample.note}</div>}
            <textarea value={source} onChange={(e) => setSource(e.target.value)} spellCheck={false} rows={14}
              className="w-full rounded-md p-3 text-[12.5px] leading-5 font-mono outline-none resize-y"
              style={{ background: "#0a101d", border: `1px solid ${C.line}`, color: C.text }} />
          </Panel>

          <Panel title="Test cases" icon={CheckCircle2} sub="input fed to stdin → expected stdout">
            <div className="space-y-2">
              {tests.map((t, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-start">
                  <input value={t.name || ""} onChange={(e) => patchTest(i, { name: e.target.value })} placeholder="name" className="field" />
                  <textarea value={t.input} onChange={(e) => patchTest(i, { input: e.target.value })} rows={1} placeholder="stdin" className="field font-mono" />
                  <textarea value={t.expected} onChange={(e) => patchTest(i, { expected: e.target.value })} rows={1} placeholder="expected stdout" className="field font-mono" />
                  <button onClick={() => setTests(tests.filter((_, j) => j !== i))} title="remove" className="p-1.5 opacity-70 hover:opacity-100"><Trash2 size={14} color={C.bad} /></button>
                </div>
              ))}
            </div>
            <button onClick={() => setTests([...tests, { name: `case ${tests.length + 1}`, input: "", expected: "" }])}
              className="mt-3 text-[12px] flex items-center gap-1" style={{ color: C.accent }}><Plus size={14} /> add test case</button>
            <div className="text-[11px] mt-4 mb-1" style={{ color: C.faint }}>Reference / peer submissions for the similarity check (one per box, optional)</div>
            {refs.map((r, i) => (
              <textarea key={i} value={r} onChange={(e) => setRefs(refs.map((x, j) => (j === i ? e.target.value : x)))} rows={3} className="field font-mono w-full mb-2" />
            ))}
            <button onClick={() => setRefs([...refs, ""])} className="text-[12px] flex items-center gap-1" style={{ color: C.accent }}><Plus size={14} /> add reference</button>
          </Panel>

          {rules && (
            <Panel title="Rules" icon={Settings2} sub="loaded from rules/rules.json — edit here or in the file">
              <div className="space-y-2">
                {Object.entries(rules.metrics).map(([name, m]) => (
                  <div key={name} className="grid grid-cols-[auto_130px_1fr_46px] items-center gap-3 text-[12px]">
                    <input type="checkbox" checked={m.enabled} onChange={(e) => patchMetric(name, { enabled: e.target.checked })} />
                    <span style={{ color: m.enabled ? C.text : C.faint }}>{LABEL[name]}</span>
                    <input type="range" min="0" max="1" step="0.05" value={m.weight} disabled={!m.enabled} onChange={(e) => patchMetric(name, { weight: +e.target.value })} />
                    <span className="font-mono text-right" style={{ color: C.dim }}>{m.weight.toFixed(2)}</span>
                  </div>
                ))}
                {health && !health.sanitizer && rules.metrics.memory_safety.enabled && (
                  <div className="text-[11px]" style={{ color: C.warn }}>Sanitizer runtime not detected — memory safety will be skipped and its weight redistributed.</div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4 text-[12px]">
                <label className="flex items-center justify-between gap-2" style={{ color: C.dim }}>time limit (ms)
                  <input type="number" className="field w-24" value={rules.limits.run_timeout_ms} onChange={(e) => setRules({ ...rules, limits: { ...rules.limits, run_timeout_ms: +e.target.value } })} /></label>
                <label className="flex items-center justify-between gap-2" style={{ color: C.dim }}>memory (MB)
                  <input type="number" className="field w-24" value={rules.limits.memory_mb} onChange={(e) => setRules({ ...rules, limits: { ...rules.limits, memory_mb: +e.target.value } })} /></label>
                <label className="flex items-center gap-2" style={{ color: C.dim }}>
                  <input type="checkbox" checked={rules.runtime_failure_cap.enabled} onChange={(e) => setRules({ ...rules, runtime_failure_cap: { ...rules.runtime_failure_cap, enabled: e.target.checked } })} />
                  runtime-failure cap</label>
                <label className="flex items-center justify-between gap-2" style={{ color: C.dim }}>cap at
                  <input type="number" className="field w-24" value={rules.runtime_failure_cap.cap} onChange={(e) => setRules({ ...rules, runtime_failure_cap: { ...rules.runtime_failure_cap, cap: +e.target.value } })} /></label>
              </div>
            </Panel>
          )}
        </div>

        {/* ---------------- RIGHT: results ---------------- */}
        <div className="space-y-5">
          <button onClick={grade} disabled={running || !rules}
            className="w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: C.accent, color: "#06101f" }}>
            {running ? <><Loader2 size={18} className="animate-spin" /> grading…</> : <><Play size={18} /> grade submission</>}
          </button>
          {error && <div className="rounded-lg p-3 text-[13px] flex gap-2" style={{ background: "#2a1418", border: `1px solid ${C.bad}`, color: "#fecaca" }}><AlertTriangle size={16} className="shrink-0 mt-0.5" /> {error}</div>}

          {!report && !running && <Panel title="Report" icon={Cpu}><div className="text-[12px]" style={{ color: C.faint }}>Pick a demo submission and press <b>grade submission</b>. Try “Infinite loop” to see the runtime-failure cap, or “Hidden memory bug” with memory safety switched on.</div></Panel>}

          {report && (
            <>
              <div className="flex gap-2 text-[12px]">
                {["overview", "json", "text"].map((t) => (
                  <button key={t} onClick={() => setTab(t)} className="px-3 py-1 rounded-md border"
                    style={{ borderColor: tab === t ? C.accent : C.line, color: tab === t ? C.accent : C.dim }}>{t}</button>
                ))}
                <span className="flex-1" />
                <button onClick={() => download("report.json", JSON.stringify(report, null, 2), "application/json")} className="flex items-center gap-1" style={{ color: C.dim }}><Download size={13} /> json</button>
                <button onClick={() => download("report.txt", report.text_report, "text/plain")} className="flex items-center gap-1" style={{ color: C.dim }}><Download size={13} /> txt</button>
              </div>
              {tab === "overview" && <Overview report={report} />}
              {tab === "json" && <pre className="codebox">{JSON.stringify({ ...report, text_report: undefined, rules_used: undefined, log: undefined }, null, 2)}</pre>}
              {tab === "text" && <pre className="codebox">{report.text_report}</pre>}
            </>
          )}
        </div>
      </main>

      <style>{`
        .field{background:#0a101d;border:1px solid ${C.line};border-radius:6px;padding:6px 8px;font-size:12px;color:${C.text};outline:none;width:100%}
        .codebox{background:#0a101d;border:1px solid ${C.line};border-radius:8px;padding:14px;font-size:12px;line-height:1.5;overflow:auto;max-height:640px;white-space:pre-wrap;color:${C.text}}
      `}</style>
    </div>
  );
}

function Overview({ report }) {
  const s = report.summary;
  const pct = (s.final_score / s.scale) * 100;
  return (
    <>
      <Panel title="Grade" icon={Gauge}>
        <div className="flex items-center gap-6">
          <Ring pct={pct} label={s.final_score.toFixed(1)} />
          <div className="text-[13px] space-y-1">
            <div><span style={{ color: C.faint }}>grade </span><b className="text-lg">{s.letter}</b>
              <span style={{ color: C.faint }}> · final </span>{s.final_score}/{s.scale}
              <span style={{ color: C.faint }}> · raw weighted </span>{s.raw_score}</div>
            <div className="flex items-start gap-1.5" style={{ color: s.cap.applied ? C.warn : C.dim }}>
              {s.cap.applied ? <AlertTriangle size={14} className="mt-0.5 shrink-0" /> : <ShieldCheck size={14} className="mt-0.5 shrink-0" />}
              <span>{s.cap.reason}</span>
            </div>
            {s.warnings.map((w, i) => <div key={i} className="text-[12px]" style={{ color: C.warn }}>⚠ {w}</div>)}
          </div>
        </div>
      </Panel>

      <Panel title="Metrics" icon={Cpu} sub="score · effective weight · points contributed">
        <div className="space-y-3">
          {report.metrics.map((m) => (
            <div key={m.metric}>
              <div className="flex items-center justify-between text-[12.5px]">
                <span>{LABEL[m.metric]} <StatusTag status={m.status} /></span>
                <span className="font-mono" style={{ color: C.dim }}>
                  {typeof m.score === "number" ? m.score.toFixed(1) : "n/a"} · {(m.effective_weight * 100).toFixed(0)}% · +{m.contribution.toFixed(2)}
                </span>
              </div>
              <div className="h-1.5 rounded mt-1" style={{ background: "#1a2540" }}>
                <div className="h-1.5 rounded" style={{ width: `${m.score ?? 0}%`, background: typeof m.score === "number" ? scoreColor(m.score) : C.faint }} />
              </div>
              <div className="text-[11.5px] mt-1" style={{ color: C.faint }}>{m.evidence}</div>
            </div>
          ))}
        </div>
      </Panel>

      {!report.compile.ok && (
        <Panel title="Compiler output" icon={XCircle} accent={C.bad}><pre className="codebox !max-h-48">{report.compile.stderr}</pre></Panel>
      )}

      {report.failed_cases.length > 0 && (
        <Panel title={`Failed cases (${report.failed_cases.length})`} icon={XCircle} accent={C.bad} sub="concrete failing inputs with expected vs actual output">
          <div className="space-y-3">
            {report.failed_cases.map((c, i) => (
              <div key={i} className="rounded-md p-3 text-[12px]" style={{ background: "#0a101d", border: `1px solid ${C.line}` }}>
                <div className="flex items-center gap-2 mb-2">
                  {c.status === "timeout" ? <Clock size={13} color={C.warn} /> : <XCircle size={13} color={C.bad} />}
                  <b>{c.name}</b><span style={{ color: C.warn }}>{c.status}</span><span style={{ color: C.faint }}>{c.reason}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 font-mono">
                  {[["input", c.input], ["expected", c.expected], ["actual", c.actual]].map(([k, v]) => (
                    <div key={k}><div className="text-[10px] uppercase mb-0.5" style={{ color: C.faint }}>{k}</div><pre className="whitespace-pre-wrap break-all">{v === "" ? "∅" : v}</pre></div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel title="Pipeline log" icon={Cpu} sub="every coordinator decision">
        <div className="font-mono text-[11.5px] space-y-1">
          {report.log.map((l, i) => <div key={i} style={{ color: logColor(l.kind) }}>[{l.kind}] {l.msg}</div>)}
        </div>
      </Panel>

      <Panel title="Limitations" icon={AlertTriangle}>
        <ul className="text-[12px] space-y-1.5 list-disc pl-4" style={{ color: C.dim }}>{report.limitations.map((x, i) => <li key={i}>{x}</li>)}</ul>
      </Panel>
    </>
  );
}

function Ring({ pct, label }) {
  const r = 38, c = 2 * Math.PI * r;
  return (
    <svg width="96" height="96" viewBox="0 0 96 96">
      <circle cx="48" cy="48" r={r} fill="none" stroke="#1a2540" strokeWidth="8" />
      <circle cx="48" cy="48" r={r} fill="none" stroke={scoreColor(pct)} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${(c * Math.max(0, Math.min(100, pct))) / 100} ${c}`} transform="rotate(-90 48 48)" />
      <text x="48" y="54" textAnchor="middle" fontSize="20" fontWeight="600" fill={C.text}>{label}</text>
    </svg>
  );
}

function StatusChip({ health }) {
  if (!health) return <span className="text-[12px]" style={{ color: C.faint }}>checking…</span>;
  const good = health.gcc;
  return (
    <span className="text-[12px] px-2.5 py-1 rounded-full border flex items-center gap-1.5" style={{ borderColor: good ? C.ok : C.bad, color: good ? C.ok : C.bad }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: good ? C.ok : C.bad }} />
      {good ? `gcc ready${health.sanitizer ? " · sanitizers ✓" : " · no sanitizers"}` : health.offline ? "API offline" : "gcc not found"}
    </span>
  );
}

function StatusTag({ status }) {
  const col = status === "ok" ? C.ok : status === "skipped" ? C.faint : C.bad;
  return <span className="text-[10px] ml-1 px-1.5 py-0.5 rounded" style={{ border: `1px solid ${col}`, color: col }}>{status}</span>;
}

function Panel({ title, sub, icon: Icon, accent, children }) {
  return (
    <section className="rounded-xl p-4" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
      <div className="flex items-center gap-2 mb-3">
        {Icon && <Icon size={16} color={accent || C.accent} />}
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {sub && <span className="text-[11px]" style={{ color: C.faint }}>{sub}</span>}
      </div>
      {children}
    </section>
  );
}
