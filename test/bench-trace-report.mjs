// test/bench-trace-report.mjs — PERF-48: a `playtest-bench.mjs --profile` trace → where every thread's time went. NOT a gate.
//
//   node test/bench-trace-report.mjs <run dir> [--json=out.json]     every *.trace.json.gz in the run dir
//
// Per trace (one phase of one session):
//   threads   busy ms/s per thread of every process (the union of its top-level task intervals, so nested events are not
//             double-counted), with the per-second p50 / p99 / worst for the busy ones
//   js        the sampling profiler's JS time per thread, grouped by the frame-loop section a sample sits under (the
//             first function below `loop` on its stack: stepPhysics, render, …), then self time by function in each
//   gc        garbage-collection pauses per thread (MinorGC = the young generation's scavenge, MajorGC = mark-compact):
//             ms/s, count, worst, and the bytes they freed per second (≈ the allocation rate, for a heap that is not growing)
import { createReadStream, readdirSync, writeFileSync } from 'node:fs'
import { createGunzip } from 'node:zlib'
import { createInterface } from 'node:readline'
import { join, basename } from 'node:path'

const dir = process.argv[2]
const outJson = process.argv.find(a => a.startsWith('--json='))?.slice(7)
if (!dir) { console.error('usage: node test/bench-trace-report.mjs <run dir> [--json=out.json]'); process.exit(1) }
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] }
const TOP_TASKS = new Set(['ThreadControllerImpl::RunTask', 'RunTask', 'ThreadPool_RunTask', 'TaskQueueManager::ProcessTaskFromWorkQueue'])

// Chrome's streamed JSON puts one event per line; a 300 s drive is over a GB, past what one JSON.parse can hold, so read
// it line by line and keep only the events this report uses.
const KEEP = new Set(['ThreadControllerImpl::RunTask', 'RunTask', 'ThreadPool_RunTask', 'TaskQueueManager::ProcessTaskFromWorkQueue', 'Profile', 'ProfileChunk', 'MinorGC', 'MajorGC', 'FireAnimationFrame'])
async function analyse (file) {
  const ev = []
  const rl = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity })
  for await (let l of rl) {
    if (l.length < 3 || l[0] !== '{' || l.startsWith('{"traceEvents"')) continue
    if (l.endsWith(',')) l = l.slice(0, -1)
    let e; try { e = JSON.parse(l) } catch { continue }
    if (e.ph === 'M' || KEEP.has(e.name)) ev.push(e)
  }
  const pname = new Map(), tname = new Map()
  for (const e of ev) if (e.ph === 'M') { if (e.name === 'process_name') pname.set(e.pid, e.args.name); if (e.name === 'thread_name') tname.set(`${e.pid}:${e.tid}`, e.args.name) }
  let t0 = Infinity, t1 = -Infinity
  for (const e of ev) if (e.ts && e.ph !== 'M') { if (e.ts < t0) t0 = e.ts; if (e.ts > t1) t1 = e.ts }
  const wall = (t1 - t0) / 1e6
  const label = k => `${pname.get(+k.split(':')[0]) ?? '?'} / ${tname.get(k) ?? k}`

  // ── busy per thread: union of top-level task intervals, and per second ─────────────────────────────────────────────
  const iv = new Map()
  for (const e of ev) if (e.ph === 'X' && e.dur > 0 && TOP_TASKS.has(e.name)) { const k = `${e.pid}:${e.tid}`; (iv.get(k) ?? iv.set(k, []).get(k)).push([e.ts, e.ts + e.dur]) }
  const threads = []
  for (const [k, a] of iv) {
    a.sort((x, y) => x[0] - y[0])
    const nS = Math.ceil(wall), perS = new Float64Array(nS + 1)
    let busy = 0, cs = -1, ce = -1
    const add = (s, e) => { busy += e - s; for (let t = s; t < e;) { const sec = Math.floor((t - t0) / 1e6), end = Math.min(e, t0 + (sec + 1) * 1e6); perS[sec] += end - t; t = end } }
    for (const [s, e] of a) { if (s > ce) { if (ce > cs) add(cs, ce); cs = s; ce = e } else if (e > ce) ce = e }
    if (ce > cs) add(cs, ce)
    const sec = [...perS.slice(1, nS - 1)].map(x => x / 1000)   // whole seconds only
    threads.push({ thread: label(k), key: k, msPerS: +(busy / 1000 / wall).toFixed(1), p50: +pct(sec, 0.5).toFixed(0), p99: +pct(sec, 0.99).toFixed(0), worst: +Math.max(0, ...sec).toFixed(0) })
  }
  threads.sort((a, b) => b.msPerS - a.msPerS)

  // ── JS samples per thread ──────────────────────────────────────────────────────────────────────────────────────────
  const profs = new Map()   // `${pid}:${id}` -> { key, nodes: Map, samples: [], deltas: [] }
  for (const e of ev) {
    if (e.name === 'Profile') profs.set(`${e.pid}:${e.id}`, { key: `${e.pid}:${e.tid}`, nodes: new Map(), samples: [], deltas: [] })
    else if (e.name === 'ProfileChunk') {
      const p = profs.get(`${e.pid}:${e.id}`); if (!p) continue
      const d = e.args.data, cp = d.cpuProfile ?? {}
      for (const n of cp.nodes ?? []) p.nodes.set(n.id, n)
      if (cp.samples) { p.samples.push(...cp.samples); p.deltas.push(...(d.timeDeltas ?? [])) }
    }
  }
  const js = {}
  const fname = n => { const c = n.callFrame, f = c.url ? c.url.split('/').pop().split('?')[0] : ''; return `${c.functionName || '(anon)'}${f ? ' ' + f + ':' + (c.lineNumber + 1) : ''}` }
  for (const p of profs.values()) {
    const T = js[label(p.key)] ??= { totalMs: 0, idleMs: 0, gcMs: 0, sections: {} }
    for (let i = 0; i < p.samples.length; i++) {
      const n = p.nodes.get(p.samples[i]); if (!n) continue
      const dt = (p.deltas[i + 1] ?? p.deltas[i] ?? 0) / 1000   // a sample's weight is the gap to the next one
      if (dt <= 0 || dt > 100) continue
      const fn = n.callFrame.functionName
      if (fn === '(idle)' || fn === '(program)') { T.idleMs += dt; continue }
      if (fn === '(garbage collector)') T.gcMs += dt
      T.totalMs += dt
      // the section: the node whose parent is `loop` (main thread) or the outermost named frame (workers)
      let s = n, chain = []
      while (s) { chain.push(s); s = p.nodes.get(s.parent) }
      const li = chain.findIndex(x => x.callFrame.functionName === 'loop')
      const sec = li > 0 ? fname(chain[li - 1]) : li === 0 ? 'loop (self)' : (chain.at(-3) ? fname(chain.at(-3)) : fname(n))
      const S = T.sections[sec] ??= { ms: 0, self: {}, file: {} }
      S.ms += dt; S.self[fname(n)] = (S.self[fname(n)] ?? 0) + dt
      const file = n.callFrame.url ? n.callFrame.url.split('/').pop().split('?')[0] : '(native)'
      S.file[file] = (S.file[file] ?? 0) + dt
    }
  }
  for (const T of Object.values(js)) {
    for (const k of ['totalMs', 'idleMs', 'gcMs']) T[k] = +(T[k] / wall).toFixed(1)   // → ms/s
    T.sections = Object.fromEntries(Object.entries(T.sections).sort((a, b) => b[1].ms - a[1].ms).slice(0, 25).map(([k, S]) => [k, {
      msPerS: +(S.ms / wall).toFixed(1),
      top: Object.entries(S.self).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([f, ms]) => [f, +(ms / wall).toFixed(2)]),
      byFile: Object.entries(S.file).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([f, ms]) => [f, +(ms / wall).toFixed(2)]),
    }]))
  }
  for (const k of Object.keys(js)) if (js[k].totalMs < 1) delete js[k]

  // ── GC per thread ──────────────────────────────────────────────────────────────────────────────────────────────────
  const gc = {}
  for (const e of ev) {
    if (e.ph !== 'X' || (e.name !== 'MinorGC' && e.name !== 'MajorGC')) continue
    const G = gc[label(`${e.pid}:${e.tid}`)] ??= { minor: { n: 0, ms: 0, worst: 0, freedMB: 0 }, major: { n: 0, ms: 0, worst: 0, freedMB: 0 } }
    const g = e.name === 'MinorGC' ? G.minor : G.major, ms = e.dur / 1000
    g.n++; g.ms += ms; g.worst = Math.max(g.worst, ms)
    const b = e.args?.usedHeapSizeBefore, a = e.args?.usedHeapSizeAfter
    if (b != null && a != null) g.freedMB += (b - a) / 1048576
  }
  for (const G of Object.values(gc)) for (const g of [G.minor, G.major]) {
    g.perS = +(g.n / wall).toFixed(2); g.msPerS = +(g.ms / wall).toFixed(2); g.worst = +g.worst.toFixed(1); g.freedMBperS = +(g.freedMB / wall).toFixed(2)
    delete g.ms; delete g.freedMB
  }
  return { file: basename(file), wallS: +wall.toFixed(1), threads: threads.filter(t => t.msPerS >= 1), js, gc }
}

const files = readdirSync(dir).filter(f => f.endsWith('.trace.json.gz')).sort()
const all = []
for (const f of files) {
  const r = await analyse(join(dir, f)); all.push(r)
  console.log(`\n═══ ${r.file} (${r.wallS} s)`)
  console.log('threads (busy ms/s · per-second p50 / p99 / worst):')
  for (const t of r.threads) console.log(`  ${t.msPerS.toFixed(1).padStart(7)}  ${String(t.p50).padStart(4)} / ${String(t.p99).padStart(4)} / ${String(t.worst).padStart(4)}  ${t.thread}`)
  for (const [th, T] of Object.entries(r.js)) {
    console.log(`js ${th}: ${T.totalMs} ms/s (gc ${T.gcMs})`)
    for (const [s, S] of Object.entries(T.sections)) {
      if (S.msPerS < T.totalMs * 0.02) continue
      console.log(`  ${S.msPerS.toFixed(1).padStart(6)}  ${s}`)
      for (const [fn, ms] of S.top) if (ms >= S.msPerS * 0.05) console.log(`           ${ms.toFixed(2).padStart(6)}  ${fn}`)
    }
  }
  console.log('gc:')
  for (const [th, G] of Object.entries(r.gc)) console.log(`  ${th}: minor ${G.minor.perS}/s ${G.minor.msPerS} ms/s worst ${G.minor.worst} ms freed ${G.minor.freedMBperS} MB/s · major ${G.major.perS}/s ${G.major.msPerS} ms/s worst ${G.major.worst} ms freed ${G.major.freedMBperS} MB/s`)
}
if (outJson) writeFileSync(outJson, JSON.stringify(all, null, 1))
