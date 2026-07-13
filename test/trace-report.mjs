// test/trace-report.mjs — Chrome trace JSON → markdown perf report (PERF-08 harness).
//
// Consumes traces captured by test/profile.mjs. Attribution rules learned in PERF-05:
//   * NEVER trust the default/first thread — find the renderer main thread by its
//     thread_name metadata ('CrRendererMain') and the GPU process main by 'CrGpuMain'.
//     Multiple renderer processes may exist (about:blank, devtools); pick the busiest.
//   * Self-time, not total-time: a parent's duration includes children — subtract them,
//     otherwise FunctionCall swallows everything and the table lies.
//
// USAGE: node test/trace-report.mjs <trace.json> [--top=30] [--out=report.md]
//
// Sections: thread inventory · renderer-main self-time by event (top N) · user_timing
// (src/perf.js buckets mirrored via performance.measure) · GPU process busy % · verdict line
// (GPU-bound indicator: GPU busy high while renderer main idle).

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'

const argv = process.argv.slice(2)
const pos = argv.filter(a => !a.startsWith('--'))
const flag = (k, d) => { const f = argv.find(a => a.startsWith(`--${k}=`)); return f ? f.split('=')[1] : d }
if (!pos[0]) { console.error('usage: node test/trace-report.mjs <trace.json> [--top=30] [--out=report.md]'); process.exit(1) }
const TRACE = pos[0]
const TOP = Number(flag('top', 30))
const OUT = flag('out', join(dirname(TRACE), 'report.md'))

const raw = JSON.parse(readFileSync(TRACE, 'utf8'))
const events = raw.traceEvents ?? raw
if (!Array.isArray(events)) { console.error('unrecognized trace format'); process.exit(1) }

// ── thread inventory (metadata) ──────────────────────────────────────────────
const threadNames = new Map()   // `${pid}:${tid}` -> name
const procNames = new Map()     // pid -> name
for (const e of events) {
  if (e.ph === 'M' && e.name === 'thread_name') threadNames.set(`${e.pid}:${e.tid}`, e.args?.name ?? '?')
  if (e.ph === 'M' && e.name === 'process_name') procNames.set(e.pid, e.args?.name ?? '?')
}
// Busy µs per thread from complete ('X') events. X events NEST (a task contains its children);
// summing durations double-counts wildly (workers showed 35 s "busy" in a 22 s wall). Exact busy
// = union of [ts, ts+dur] intervals per thread.
const intervalsByThread = new Map()
let tMin = Infinity, tMax = -Infinity
for (const e of events) {
  if (e.ts != null && e.ph !== 'M') { if (e.ts < tMin) tMin = e.ts; const end = e.ts + (e.dur ?? 0); if (end > tMax) tMax = end }
  if (e.ph === 'X' && e.dur > 0) {
    const k = `${e.pid}:${e.tid}`
    if (!intervalsByThread.has(k)) intervalsByThread.set(k, [])
    intervalsByThread.get(k).push([e.ts, e.ts + e.dur])
  }
}
const busyByThread = new Map()
for (const [k, iv] of intervalsByThread) {
  iv.sort((a, b) => a[0] - b[0])
  let busy = 0, curS = -Infinity, curE = -Infinity
  for (const [s, e] of iv) {
    if (s > curE) { busy += curE - curS > 0 ? curE - curS : 0; curS = s; curE = e }
    else if (e > curE) curE = e
  }
  busy += curE - curS > 0 ? curE - curS : 0
  busyByThread.set(k, busy)
}
const wallUs = tMax - tMin
const threadsOf = name => [...threadNames.entries()].filter(([, n]) => n === name).map(([k]) => k)
const busiest = keys => keys.sort((a, b) => (busyByThread.get(b) ?? 0) - (busyByThread.get(a) ?? 0))[0]
const mainKey = busiest(threadsOf('CrRendererMain'))
const gpuKey = busiest(threadsOf('CrGpuMain'))
if (!mainKey) { console.error('no CrRendererMain thread found — wrong categories or truncated trace'); process.exit(1) }

// ── renderer-main self-time by event name ────────────────────────────────────
// Sort X events by ts; sweep with a stack to subtract nested child durations (self-time).
const mainX = events.filter(e => e.ph === 'X' && `${e.pid}:${e.tid}` === mainKey && e.dur > 0)
  .sort((a, b) => a.ts - b.ts || b.dur - a.dur)
const selfUs = new Map()   // name -> { us, n }
const stack = []           // { end, childUs }
for (const e of mainX) {
  while (stack.length && stack[stack.length - 1].end <= e.ts) {
    const f = stack.pop()
    const s = selfUs.get(f.name) ?? { us: 0, n: 0 }
    s.us += Math.max(0, f.dur - f.childUs); s.n++
    selfUs.set(f.name, s)
  }
  if (stack.length) stack[stack.length - 1].childUs += e.dur
  stack.push({ name: e.name, end: e.ts + e.dur, dur: e.dur, childUs: 0 })
}
while (stack.length) {
  const f = stack.pop()
  const s = selfUs.get(f.name) ?? { us: 0, n: 0 }
  s.us += Math.max(0, f.dur - f.childUs); s.n++
  selfUs.set(f.name, s)
}
const mainBusyUs = [...selfUs.values()].reduce((s, v) => s + v.us, 0)

// ── user_timing (performance.measure mirror of src/perf.js buckets) ──────────
// measures arrive as async nestable pairs (ph 'b'/'e', cat blink.user_timing) or 'X'.
const timing = new Map()      // name -> { us, n }
const timingIv = []           // { name, ts, dur } — kept for hitch-window intersection below
const openB = new Map()       // name:id -> ts
const addTiming = (name, ts, dur) => {
  const s = timing.get(name) ?? { us: 0, n: 0 }; s.us += dur; s.n++; timing.set(name, s)
  timingIv.push({ name, ts, dur })
}
for (const e of events) {
  if (!e.cat || !e.cat.includes('blink.user_timing')) continue
  if (e.ph === 'X' && e.dur > 0) addTiming(e.name, e.ts, e.dur)
  else if (e.ph === 'b') openB.set(`${e.name}:${e.id}`, e.ts)
  else if (e.ph === 'e') {
    const k = `${e.name}:${e.id}`
    if (openB.has(k)) { addTiming(e.name, openB.get(k), e.ts - openB.get(k)); openB.delete(k) }
  }
}

// ── hitch attribution ────────────────────────────────────────────────────────
// A "hitch" = a TOP-LEVEL main-thread task > HITCH_US (a >20 ms task at 60 Hz guarantees a
// missed vsync). For each, intersect the src/perf.js user_timing intervals (?prof=1 emits one
// per perfAdd call, real timestamps) to name whose time it was; top child X events cover the
// uninstrumented remainder (GC, layout, shader compile, texture upload...).
const HITCH_US = 20000
const hitches = []
{
  const ends = []   // stack of enclosing-event end timestamps → empty = top-level
  for (const e of mainX) {
    while (ends.length && ends[ends.length - 1] <= e.ts) ends.pop()
    if (ends.length === 0 && e.dur > HITCH_US) hitches.push({ ts: e.ts, dur: e.dur })
    ends.push(e.ts + e.dur)
  }
}
for (const h of hitches) {
  const inWin = new Map()
  for (const iv of timingIv) {
    const o = Math.min(h.ts + h.dur, iv.ts + iv.dur) - Math.max(h.ts, iv.ts)
    if (o > 0) inWin.set(iv.name, (inWin.get(iv.name) ?? 0) + o)
  }
  const childs = new Map()
  for (const e of mainX) {
    if (e.ts > h.ts && e.ts + e.dur <= h.ts + h.dur && e.dur > 1000) {
      childs.set(e.name, (childs.get(e.name) ?? 0) + e.dur)
    }
  }
  h.buckets = [...inWin.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
  h.childs = [...childs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
}

// ── GPU process busy ─────────────────────────────────────────────────────────
const gpuBusyUs = gpuKey ? (busyByThread.get(gpuKey) ?? 0) : 0
const gpuBusyPct = gpuKey ? 100 * gpuBusyUs / wallUs : null
const mainBusyPct = 100 * mainBusyUs / wallUs

// ── report ───────────────────────────────────────────────────────────────────
const ms = us => (us / 1000).toFixed(1)
const lines = []
lines.push(`# Trace report — ${TRACE}`)
const runJson = join(dirname(TRACE), 'run.json')
if (existsSync(runJson)) {
  const r = JSON.parse(readFileSync(runJson, 'utf8'))
  lines.push('', `**Run:** ${r.meta.scenario} · ${r.meta.preset} · seed ${r.meta.seed} · ${r.meta.duration}s` +
    (r.meta.levers?.length ? ` · levers: ${r.meta.levers.map(l => `${l.name}=${l.value}`).join(', ')}` : ''))
  if (r.frameStats) lines.push(`**Frames:** p50 ${r.frameStats.p50} ms · p95 ${r.frameStats.p95} ms · p99 ${r.frameStats.p99} ms · dropped ${r.frameStats.droppedPct}% · ~${r.frameStats.fpsMean} fps`)
  if (r.coldload) lines.push(`**Cold load:** ready ${r.coldload.msToReady} ms · ring-complete ${r.coldload.msToRingComplete} ms`)
}
lines.push('', `Wall: ${(wallUs / 1e6).toFixed(1)} s · renderer main busy ${mainBusyPct.toFixed(1)}%` +
  (gpuBusyPct != null ? ` · GPU process busy ${gpuBusyPct.toFixed(1)}%` : ' · GPU thread not found'))
if (gpuBusyPct != null) {
  const verdict = gpuBusyPct > 60 && mainBusyPct < 50 ? 'GPU-BOUND (GPU saturated while main thread has headroom)'
    : mainBusyPct > 70 ? 'CPU/main-thread-bound'
    : gpuBusyPct > mainBusyPct ? 'leaning GPU-bound' : 'leaning CPU-bound'
  lines.push('', `**Verdict:** ${verdict}`)
}
lines.push('', '## Threads', '', '| process | thread | busy ms |', '|---|---|---|')
for (const [k, n] of [...threadNames.entries()].filter(([k]) => (busyByThread.get(k) ?? 0) > 1000).sort((a, b) => (busyByThread.get(b[0]) ?? 0) - (busyByThread.get(a[0]) ?? 0)).slice(0, 12)) {
  const pid = k.split(':')[0]
  lines.push(`| ${procNames.get(Number(pid)) ?? pid}${k === mainKey ? ' ◀ main' : k === gpuKey ? ' ◀ gpu' : ''} | ${n} | ${ms(busyByThread.get(k) ?? 0)} |`)
}
lines.push('', `## Hitches (top-level main tasks > ${HITCH_US / 1000} ms): ${hitches.length}`)
if (hitches.length) {
  lines.push('', '| t (s) | dur ms | perf buckets inside | biggest child events |', '|---|---|---|---|')
  for (const h of hitches.slice(0, 25)) {
    lines.push(`| ${((h.ts - tMin) / 1e6).toFixed(1)} | ${ms(h.dur)} | ${h.buckets.map(([n, u]) => `${n} ${ms(u)}`).join(' · ') || '—'} | ${h.childs.map(([n, u]) => `${n} ${ms(u)}`).join(' · ') || '—'} |`)
  }
  // aggregate: which bucket dominates hitches overall
  const agg = new Map()
  for (const h of hitches) for (const [n, u] of h.buckets) agg.set(n, (agg.get(n) ?? 0) + u)
  lines.push('', `**Hitch-time by bucket:** ${[...agg.entries()].sort((a, b) => b[1] - a[1]).map(([n, u]) => `${n} ${ms(u)} ms`).join(' · ') || 'uninstrumented'}`)
}
lines.push('', `## Renderer main self-time (top ${TOP})`, '', '| event | self ms | count | % busy |', '|---|---|---|---|')
for (const [name, s] of [...selfUs.entries()].sort((a, b) => b[1].us - a[1].us).slice(0, TOP)) {
  lines.push(`| ${name} | ${ms(s.us)} | ${s.n} | ${(100 * s.us / mainBusyUs).toFixed(1)}% |`)
}
if (timing.size) {
  lines.push('', '## user_timing (src/perf.js buckets)', '', '| bucket | total ms | count | avg ms |', '|---|---|---|---|')
  for (const [name, s] of [...timing.entries()].sort((a, b) => b[1].us - a[1].us)) {
    lines.push(`| ${name} | ${ms(s.us)} | ${s.n} | ${(s.us / 1000 / s.n).toFixed(2)} |`)
  }
} else {
  lines.push('', '_No user_timing events — run the app with ?prof=1 (test/profile.mjs does this automatically)._')
}
lines.push('')
writeFileSync(OUT, lines.join('\n'))
console.log(OUT)
