// test/hitch-report.mjs — streaming-hitch attribution harness (PERF-26).
//
// Answers the question the cumulative buckets cannot: WHICH streaming subsystem is responsible for
// the dropped frames during play. It drives the app over CDP with the ?hitch instrumentation on,
// then reads back per-frame attribution (src/perf.js) and prints a lift table — mean frame period
// on frames where each streaming event fired, against the control group of frames where NO
// streaming event fired at all.
//
// The `--cpu=N` flag is the point of the tool. Hitches on a fast machine are rare and jittery; CPU
// throttling (CDP Emulation.setCPUThrottlingRate) reproduces a low-power machine deterministically,
// so the ranking is stable run to run and an A/B of a smoothing fix is actually measurable.
//
// PREREQ: dev server on :8000 (`npm run dev`). Not a gate — never run by `npm test`.
//
// USAGE:
//   node test/hitch-report.mjs --scenario=drive  --cpu=4 --duration=45
//   node test/hitch-report.mjs --scenario=stream --cpu=6 --preset=Low --duration=60
//   node test/hitch-report.mjs --scenario=drive  --cpu=4 --out=perf-runs/before.json
//
// FLAGS: --scenario=drive|stream  --cpu=N (throttle factor, 1 = off)  --duration=SECONDS
//        --preset=Low|Normal|High|Ultra  --seed=N  --hitch=MS (threshold, default 24)
//        --speed=M/S (stream sweep)  --out=FILE  --headed  --port/--cdp
//
// READING THE OUTPUT:
//   lift    — meanMs on frames carrying the tag, minus meanMs on quiet frames. The ranking column.
//   cpu     — mean in-loop JS time on those frames. cpu ≈ mean ⇒ a CPU budget is being blown, and
//             the per-hitch `top` buckets name which one. cpu << mean ⇒ the cost is GPU-side
//             (first draw of the committed geometry, buffer upload, shader compile) and no CPU
//             budget will fix it — the commit itself has to be spread or pre-warmed.
//   +N shaders on a hitch line ⇒ a program compiled that frame; that is the whole stall.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { launchChrome, connect, keyEvent, sleep, startTracing, TRACE_CATEGORIES } from './lib/cdp.mjs'

const argv = process.argv.slice(2)
const flag = (k, d) => { const f = argv.find(a => a.startsWith(`--${k}=`)); return f ? f.split('=').slice(1).join('=') : d }
const has = k => argv.includes(`--${k}`)
const SCENARIO = flag('scenario', 'drive')
const PRESET   = flag('preset', 'Normal')
const SEED     = flag('seed', '6')
const DURATION = Number(flag('duration', 45))
const CPU      = Number(flag('cpu', 1))
const HITCH_MS = Number(flag('hitch', 24))
const SPEED    = Number(flag('speed', 20))
const OUT      = flag('out', '')
const HEADED   = has('headed')
const PORT = Number(flag('port', 8000)), CDP_PORT = Number(flag('cdp', 9222))
// GPU-side reproduction (2026-09-29): --window=W,H --dpr=N put the render at the owner's retina pixel
// count (an Air is ~2× DPR, 4× the pixels of the default 1400×900 window), and --eval=JS runs once
// after the settle, before the window — e.g. "window.__terrain()._terrainUniforms.uSurfOn.value=0"
// for a textures-off A/B.
const WINDOW = flag('window', '1400,900'), DPR = Number(flag('dpr', 1)), EVAL = flag('eval', '')
// --truck: the stream sweep carries the TRUCK (teleported along the sweep at --speed) instead of the
// freecam, so the chase camera and the truck's synchronous ensureChunk 3×3 — the path a freecam
// never exercises — are the ones measured. 200 mph = --speed=89.
const TRUCK = has('truck')
// --trace=FILE (PERF-28): a Chrome trace over the measurement window, then a split of every long frame
// period into loop JS / GC / other main-thread tasks (worker replies, timers) / idle main thread. The
// in-loop buckets cannot see between frames; "off-CPU" above lumps all four together.
const TRACE = flag('trace', '')
if (!['drive', 'stream'].includes(SCENARIO)) { console.error(`unknown scenario ${SCENARIO}`); process.exit(1) }

const qs = new URLSearchParams({ prof: '1', hitch: String(HITCH_MS), nomenu: '1' })   // FEAT-41: skip the menu; this harness wants the world on screen
if (SEED && SEED !== '6') qs.set('seed', SEED)
const APP = `http://localhost:${PORT}/index.html?${qs}`

try { const r = await fetch(`http://localhost:${PORT}/index.html`); if (!r.ok) throw 0 }
catch { console.error(`No server on :${PORT}. Run \`npm run dev\` first.`); process.exit(1) }

launchChrome(APP, { port: CDP_PORT, headed: HEADED, windowSize: WINDOW, extraArgs: DPR !== 1 ? [`--force-device-scale-factor=${DPR}`] : [] })
const client = await connect({ port: CDP_PORT })
const evalOk = async expr => { const r = await client.evalJS(expr); if (r.err) throw new Error(`eval: ${r.err}`); return r.val }
const waitFor = async (expr, timeoutMs, pollMs = 250) => {
  const t0 = performance.now()
  while (performance.now() - t0 < timeoutMs) {
    const r = await client.evalJS(expr)
    if (!r.err && r.val) return performance.now() - t0
    await sleep(pollMs)
  }
  throw new Error(`timeout waiting for: ${expr}`)
}
const RING_COMPLETE = `(()=>{ const w = window.__world && window.__world(); if (!w) return false; const n = 2*(w.ring+w.warm)+1; return w.chunks >= n*n })()`

// ── settle: load, ring fill and the route-warm tail all belong to LOAD, not to play ──────────
await waitFor('window.__rsReady === true', 120000)
await waitFor(RING_COMPLETE, 90000, 200).catch(() => console.error('warn: ring never completed pre-measure'))
if (PRESET !== 'Normal') { await evalOk(`window.__q(${JSON.stringify(PRESET)})`); await waitFor(RING_COMPLETE, 90000, 200).catch(() => {}) }
await waitFor('(()=>{ const r = window.__road && window.__road(); return r ? (r.pending === 0 && r.lastWarm) : true })()', 90000, 500)
  .catch(() => console.error('warn: route warm never drained'))
await sleep(4000)
if (EVAL) { await evalOk(EVAL); await sleep(1500) }

// Throttle AFTER settling — a 4× CPU penalty applied during load just makes the wait long, and the
// question is about steady-state play on a slow machine, not about load.
if (CPU > 1) { await client.cmd('Emulation.setCPUThrottlingRate', { rate: CPU }); await sleep(1500) }

// ── measurement window ───────────────────────────────────────────────────────────────────────
const tracer = TRACE ? await startTracing(client, TRACE, { categories: `${TRACE_CATEGORIES},v8` }) : null
await evalOk('window.__hitchReset()')
const t0 = performance.now()
if (SCENARIO === 'drive') await keyEvent(client, 'w', true)
let sweep = null
if (SCENARIO === 'stream') {
  const w = await evalOk('window.__world()')
  sweep = { x0: w.pos.x, z0: w.pos.z }
}
while (performance.now() - t0 < DURATION * 1000) {
  if (sweep) {
    const dx = ((performance.now() - t0) / 1000) * SPEED
    if (TRUCK) await evalOk(`(()=>{ window.__teleport(${sweep.x0} + ${dx}, ${sweep.z0}, ${Math.PI / 2}, 0.5); return true })()`)
    else await evalOk(`(()=>{ const x=${sweep.x0} + ${dx}, z=${sweep.z0}; const y=(typeof window.terrain==='function')? window.terrain(x,z):100; window.__view(x, y+45, z, ${Math.PI / 2}, -0.55); return true })()`)
  }
  await sleep(sweep ? 500 : 2000)
}
if (SCENARIO === 'drive') await keyEvent(client, 'w', false)
if (tracer) await tracer.stop()   // before the read-backs below, which are long frames of their own

const rep = await evalOk('window.__hitches()')
const frames = (await evalOk('window.__perfData()')).frames.slice(-Math.round(DURATION * 144))
if (CPU > 1) await client.cmd('Emulation.setCPUThrottlingRate', { rate: 1 })

// ── report ───────────────────────────────────────────────────────────────────────────────────
const sorted = [...frames].sort((a, b) => a - b)
const pct = p => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0
const stats = {
  n: sorted.length, p50: +pct(0.50).toFixed(1), p95: +pct(0.95).toFixed(1), p99: +pct(0.99).toFixed(1),
  maxMs: +(sorted[sorted.length - 1] ?? 0).toFixed(1),
  droppedPct: +(100 * frames.filter(v => v > HITCH_MS).length / (frames.length || 1)).toFixed(2),
}
const q = rep.quiet
console.log(`\n════ hitch report — ${SCENARIO}, preset ${PRESET}, cpu ×${CPU}, ${DURATION}s, ${WINDOW} @${DPR}x${EVAL ? ', eval' : ''} ════`)
console.log(`frame:  p50 ${stats.p50}  p95 ${stats.p95}  p99 ${stats.p99}  max ${stats.maxMs} ms   over-${HITCH_MS}ms ${stats.droppedPct}%`)
console.log(`window: ${rep.frames} frames, ${rep.hitches.length} hitches recorded`)
if (q) console.log(`quiet:  ${q.frames} frames with NO streaming event — mean ${q.meanMs.toFixed(1)} ms (cpu ${q.meanCpuMs.toFixed(1)}), max ${q.maxMs.toFixed(1)}\n`)
else console.log(`quiet:  none — every frame carried a streaming event (lift column unavailable)\n`)

const rows = Object.entries(rep.tags).map(([tag, s]) => ({ tag, ...s, lift: q ? s.meanMs - q.meanMs : NaN }))
  .sort((a, b) => (b.lift - a.lift) || (b.meanMs - a.meanMs))
console.log(`  ${'tag'.padEnd(22)}${'frames'.padStart(8)}${'events'.padStart(8)}${'meanMs'.padStart(9)}${'lift'.padStart(8)}${'cpuMs'.padStart(8)}${'maxMs'.padStart(8)}${'hitch%'.padStart(8)}`)
for (const r of rows) {
  console.log(`  ${r.tag.padEnd(22)}${String(r.frames).padStart(8)}${String(r.events).padStart(8)}${r.meanMs.toFixed(1).padStart(9)}${((r.lift >= 0 ? '+' : '') + r.lift.toFixed(1)).padStart(8)}${r.meanCpuMs.toFixed(1).padStart(8)}${r.maxMs.toFixed(1).padStart(8)}${(100 * r.hitches / r.frames).toFixed(1).padStart(8)}`)
}

console.log(`\n  ── worst 12 frames ──`)
for (const h of rep.hitches.slice().sort((a, b) => b.ms - a.ms).slice(0, 12)) {
  const ev = Object.entries(h.ev).map(([k, v]) => `${k}×${v}`).join(' ') || '—'
  const top = h.top.map(([l, v]) => `${l} ${v}`).join(', ') || '—'
  console.log(`  ${h.ms.toFixed(1).padStart(7)}ms  cpu ${h.cpu.toFixed(1).padStart(6)}  unattr ${(h.unattr ?? 0).toFixed(1).padStart(6)}${h.prog ? `  +${h.prog}sh` : '     '}  [${ev}]  ${top}`)
}

// Off-CPU share: hitch time not explained by any JS in the loop. High share ⇒ commit-side/GPU cost.
const lost = rep.hitches.reduce((s, h) => s + (h.ms - (q ? q.meanMs : 16.7)), 0)
const lostCpu = rep.hitches.reduce((s, h) => s + Math.max(0, h.cpu - (q ? q.meanCpuMs : 8)), 0)
console.log(`\n  excess frame time in hitches: ${lost.toFixed(0)} ms — ${(100 * lostCpu / (lost || 1)).toFixed(0)}% explained by in-loop CPU, ${(100 * (1 - lostCpu / (lost || 1))).toFixed(0)}% off-CPU (GPU/upload/compile/GC)\n`)

// ── --trace: what the main thread did across each long frame period ─────────────────────────
// A period runs from one main-thread frame start (BeginMainThreadFrame) to the next. Each class is an interval
// UNION on the renderer main thread, clipped to the period, so nested events never double-count.
// idle = no task on the main thread at all: it was waiting (GPU backpressure, or the OS gave the
// process no core — machine load). gpu = GPU-process task time in the same period, for that call.
let traceSplit = null
if (tracer) {
  const ev = JSON.parse(readFileSync(TRACE, 'utf8')).traceEvents
  const named = (n) => ev.filter(e => e.ph === 'M' && e.name === 'thread_name' && e.args?.name === n)
  const rafs = ev.filter(e => e.ph === 'X' && e.name === 'FireAnimationFrame')
  const mains = named('CrRendererMain').map(m => ({ m, n: rafs.filter(e => e.pid === m.pid && e.tid === m.tid).length })).sort((a, b) => b.n - a.n)
  const { pid, tid } = mains[0].m
  const gpuPid = ev.find(e => e.ph === 'M' && e.name === 'process_name' && e.args?.name === 'GPU Process')?.pid
  const iv = (pred) => ev.filter(e => e.ph === 'X' && e.dur > 0 && pred(e)).map(e => [e.ts, e.ts + e.dur]).sort((a, b) => a[0] - b[0])
  const union = (l) => { const o = []; for (const [a, b] of l) { const t = o[o.length - 1]; if (t && a <= t[1]) t[1] = Math.max(t[1], b); else o.push([a, b]) } return o }
  const onMain = e => e.pid === pid && e.tid === tid
  const GC = /^(MajorGC|MinorGC|V8\.GC|BlinkGC|CppGC)/
  const U = {
    task: union(iv(e => onMain(e) && e.name === 'ThreadControllerImpl::RunTask')),
    loop: union(iv(e => onMain(e) && e.name === 'FireAnimationFrame')),
    gc: union(iv(e => onMain(e) && GC.test(e.name))),
    gpu: gpuPid != null ? union(iv(e => e.pid === gpuPid && e.name === 'GPUTask')) : [],
  }
  const clip = (u, a, b) => u.reduce((s, [x, y]) => s + Math.max(0, Math.min(y, b) - Math.max(x, a)), 0)
  const minus = (u, cut) => { const o = []; for (const [a, b] of u) { let x = a; for (const [c, d] of cut) { if (d <= x || c >= b) continue; if (c > x) o.push([x, c]); x = Math.max(x, d) } if (x < b) o.push([x, b]) } return o }
  const gcOut = minus(U.gc, U.loop), other = minus(minus(U.task, U.loop), U.gc)
  // The named non-loop work that filled `other`: longest leaf-ish events outside the loop.
  const NAMED = new Set(['FunctionCall', 'EventDispatch', 'TimerFire', 'FireIdleCallback', 'v8.callFunction', 'HandlePostMessage', 'ParseHTML', 'EvaluateScript'])
  const outs = ev.filter(e => e.ph === 'X' && onMain(e) && NAMED.has(e.name) && e.dur > 2000)
  const inLoop = (e) => U.loop.some(([a, b]) => e.ts >= a && e.ts < b)
  const label = (e) => { const d = e.args?.data ?? {}; return `${e.name}${d.type ? ':' + d.type : ''}${d.functionName ? ' ' + d.functionName : ''}${d.url ? ' ' + d.url.split('/').pop().split('?')[0] + ':' + (d.lineNumber ?? '') : ''}` }
  // One BeginMainThreadFrame per frame; the app's ~29 rAF callbacks per frame each log their own FireAnimationFrame.
  const starts = ev.filter(e => onMain(e) && e.name === 'BeginMainThreadFrame').map(e => e.ts).sort((a, b) => a - b)
  const rows2 = []
  for (let i = 0; i + 1 < starts.length; i++) {
    const a = starts[i], b = starts[i + 1], ms = (b - a) / 1000
    if (ms < HITCH_MS) continue
    const busy = clip(U.task, a, b)
    rows2.push({ ms, loop: clip(U.loop, a, b) / 1000, gcIn: (clip(U.gc, a, b) - clip(gcOut, a, b)) / 1000, gcOut: clip(gcOut, a, b) / 1000,
      other: clip(other, a, b) / 1000, idle: ((b - a) - busy) / 1000, gpu: clip(U.gpu, a, b) / 1000,
      what: outs.filter(e => e.ts >= a && e.ts < b && !inLoop(e)).sort((x, y) => y.dur - x.dur).slice(0, 2).map(e => `${label(e)} ${(e.dur / 1000).toFixed(0)}`) })
  }
  const sum = k => rows2.reduce((s, r) => s + r[k], 0)
  traceSplit = { periods: starts.length - 1, long: rows2.length, ms: sum('ms'), loop: sum('loop'), gcIn: sum('gcIn'), gcOut: sum('gcOut'), other: sum('other'), idle: sum('idle'), gpu: sum('gpu'), worst: rows2.sort((x, y) => y.ms - x.ms).slice(0, 20) }
  const f = v => v.toFixed(1).padStart(7)
  console.log(`  ── trace: ${rows2.length} of ${starts.length - 1} frame periods ≥ ${HITCH_MS} ms (${TRACE}) ──`)
  console.log(`  ${'period'.padStart(7)}${'loop'.padStart(7)}${'gcIn'.padStart(7)}${'gcOut'.padStart(7)}${'other'.padStart(7)}${'idle'.padStart(7)}${'gpu'.padStart(7)}  other = non-rAF tasks (named, ms)`)
  for (const r of traceSplit.worst.slice(0, 15)) console.log(`  ${f(r.ms)}${f(r.loop)}${f(r.gcIn)}${f(r.gcOut)}${f(r.other)}${f(r.idle)}${f(r.gpu)}  ${r.what.join(' · ')}`)
  const T = traceSplit.ms || 1
  console.log(`  all long periods: ${traceSplit.ms.toFixed(0)} ms = loop ${(100 * traceSplit.loop / T).toFixed(0)}% (gc inside ${(100 * traceSplit.gcIn / T).toFixed(0)}%) · gc outside ${(100 * traceSplit.gcOut / T).toFixed(0)}% · other tasks ${(100 * traceSplit.other / T).toFixed(0)}% · idle ${(100 * traceSplit.idle / T).toFixed(0)}%  (gpu busy ${(100 * traceSplit.gpu / T).toFixed(0)}%)\n`)
}

if (OUT) {
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify({ meta: { scenario: SCENARIO, preset: PRESET, seed: SEED, cpu: CPU, duration: DURATION, hitchMs: HITCH_MS }, stats, report: rep, traceSplit }, null, 2))
  console.log(`  written: ${OUT}\n`)
}
client.close()
process.exit(0)
