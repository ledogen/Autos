// test/profile.mjs — external performance profiler for RangerSim (PERF-08 harness).
//
// Drives the app over CDP (test/lib/cdp.mjs) against the ?prof=1 dev handles in src/main.js
// (__q quality preset, __ri renderer.info, __perfData perf buckets + frame-dt ring, __world
// fill/telemetry, __lever single-axis A/B toggles). Captures a Chrome trace (--trace) for
// test/trace-report.mjs and writes a run.json with frame-time percentiles + samples.
//
// PREREQ: HTTP server on :8000 (`npx serve .`). Not a gate — never run by `npm test`.
//
// USAGE:
//   node test/profile.mjs --scenario=idle   --preset=Normal --duration=30 --trace
//   node test/profile.mjs --scenario=coldload --seed=42 --trace
//   node test/profile.mjs --scenario=drive  --preset=Normal --duration=60
//   node test/profile.mjs --scenario=stream --preset=Normal --duration=40
//   node test/profile.mjs --scenario=idle --preset=Normal --lever=propCastShadow:0 --lever=pixelRatio:1.5
//
// FLAGS: --scenario=coldload|idle|drive|stream  --preset=Low|Normal|High|Ultra  --seed=N
//        --duration=SECONDS  --trace  --lever=name:value (repeatable)  --noaa  --headed
//        --out=DIR (default perf-runs/)  --label=NAME (run dir name suffix)
//
// Scenarios:
//   coldload — trace starts BEFORE navigation (fresh profile dir); records time-to-rsReady and
//              time-to-ring-complete. Preset applies only after load (coldload measures defaults).
//   idle     — settle at spawn, then measure a quiet window (GPU/shadow/shader cost isolation).
//   drive    — hold W for the duration (physics + streaming under real play).
//   stream   — freecam sweep +X at ~20 m/s, ground-relative height (forces routing/stream load).

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launchChrome, connect, startTracing, keyEvent, sleep } from './lib/cdp.mjs'

// ── args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const flag = (k, d) => { const f = argv.find(a => a.startsWith(`--${k}=`)); return f ? f.split('=').slice(1).join('=') : d }
const has = k => argv.includes(`--${k}`)
const SCENARIO = flag('scenario', 'idle')
const PRESET   = flag('preset', 'Normal')
const SEED     = flag('seed', '6')
const DURATION = Number(flag('duration', 30))
const TRACE    = has('trace')
const HEADED   = has('headed')
const NOAA     = has('noaa')
const LEVERS   = argv.filter(a => a.startsWith('--lever=')).map(a => { const [n, v] = a.slice(8).split(':'); return { name: n, value: Number(v) } })
const OUT_BASE = flag('out', join(process.cwd(), 'perf-runs'))
const LABEL    = flag('label', '')
const PORT = 8000, CDP_PORT = Number(flag('cdp', 9222))
if (!['coldload', 'idle', 'drive', 'stream'].includes(SCENARIO)) { console.error(`unknown scenario ${SCENARIO}`); process.exit(1) }

const qs = new URLSearchParams({ prof: '1' })
if (SEED && SEED !== '6') qs.set('seed', SEED)
if (NOAA) qs.set('noaa', '1')
const APP = `http://localhost:${PORT}/index.html?${qs}`

try { const r = await fetch(`http://localhost:${PORT}/index.html`); if (!r.ok) throw 0 } catch { console.error(`No server on :${PORT}. Run \`npx serve .\` first.`); process.exit(1) }

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const runName = [stamp, SCENARIO, PRESET, `seed${SEED}`, ...LEVERS.map(l => `${l.name}-${l.value}`), LABEL].filter(Boolean).join('_')
const outDir = join(OUT_BASE, runName)
mkdirSync(outDir, { recursive: true })

// ── boot ─────────────────────────────────────────────────────────────────────
// coldload navigates AFTER tracing starts so the import waterfall + bootstrap land in the trace.
launchChrome(SCENARIO === 'coldload' ? 'about:blank' : APP, { port: CDP_PORT, headed: HEADED })
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
// ring-complete = generated ring fully built: (2·(ring+warm)+1)² chunks present.
const RING_COMPLETE = `(()=>{ const w = window.__world && window.__world(); if (!w) return false; const n = 2*(w.ring+w.warm)+1; return w.chunks >= n*n })()`

const run = { meta: { scenario: SCENARIO, preset: PRESET, seed: SEED, duration: DURATION, levers: LEVERS, noaa: NOAA, headed: HEADED, url: APP, date: new Date().toISOString() }, coldload: null, gpuTimerExt: null, samples: [], frameStats: null, buckets: null }

let trace = null
if (TRACE && SCENARIO === 'coldload') trace = await startTracing(client, join(outDir, 'trace.json'))

if (SCENARIO === 'coldload') {
  const navStart = performance.now()
  await client.cmd('Page.navigate', { url: APP })
  const tReady = await waitFor('window.__rsReady === true', 120000)      // ms from navigate
  const tRing = await waitFor(RING_COMPLETE, 120000, 200)                // ms from ready
  void navStart
  run.coldload = { msToReady: Math.round(tReady), msToRingComplete: Math.round(tReady + tRing) }
} else {
  await waitFor('window.__rsReady === true', 120000)
  await waitFor(RING_COMPLETE, 90000, 200).catch(() => console.error('warn: ring never completed pre-measure; continuing'))
  if (PRESET !== 'Normal') { await evalOk(`window.__q(${JSON.stringify(PRESET)})`); await waitFor(RING_COMPLETE, 90000, 200).catch(() => {}) }
  for (const l of LEVERS) {
    const ok = await evalOk(`window.__lever(${JSON.stringify(l.name)}, ${l.value})`)
    if (!ok) { console.error(`unknown lever: ${l.name}`); process.exit(1) }
  }
  await sleep(4000)   // let preset/lever churn (shadow realloc, ring builds) settle out of the window
}

// one-time GPU timer probe — expected ABSENT on ANGLE/Metal; harness relies on A/B + trace GPU track.
run.gpuTimerExt = await evalOk(`(()=>{ const c=document.querySelector('canvas'); const gl=c&&c.getContext('webgl2'); return gl? gl.getExtension('EXT_disjoint_timer_query_webgl2')!==null : null })()`)

// ── measurement window ───────────────────────────────────────────────────────
if (TRACE && SCENARIO !== 'coldload') trace = await startTracing(client, join(outDir, 'trace.json'))
const snapStart = await evalOk('window.__perfData()')
const t0 = performance.now()

if (SCENARIO === 'drive') await keyEvent(client, 'w', true)
let sweep = null
if (SCENARIO === 'stream') {
  const w = await evalOk('window.__world()')
  sweep = { x0: w.pos.x, z0: w.pos.z, speed: 20 }   // m/s along +X — crosses macro-cells (256 m grid)
}

while (performance.now() - t0 < DURATION * 1000) {
  if (sweep) {
    const dx = ((performance.now() - t0) / 1000) * sweep.speed
    // ground-relative camera height (freecam under terrain renders sky-only — BUG-34 lesson)
    await evalOk(`(()=>{ const x=${sweep.x0 + dx}, z=${sweep.z0}; const y=(typeof window.terrain==='function')? window.terrain(x,z):100; window.__view(x, y+45, z, ${Math.PI / 2}, -0.55); return true })()`)
  }
  await sleep(sweep ? 500 : 5000)   // stream repositions every 500ms; others just wake to sample
  if (performance.now() - t0 >= run.samples.length * 5000) {   // ~5s sampling cadence either way
    const ri = await evalOk('window.__ri()')
    const world = await evalOk('window.__world()')
    run.samples.push({ tMs: Math.round(performance.now() - t0), ri, world })
  }
}
if (SCENARIO === 'drive') await keyEvent(client, 'w', false)

const snapEnd = await evalOk('window.__perfData()')
if (trace) { const t = await trace.stop(); console.log(`trace: ${t.outPath} (${t.eventCount} events)`) }

// ── stats ────────────────────────────────────────────────────────────────────
// Frame dts for the window: the ring buffer holds ~60s at 60fps; take the tail covering the
// measurement window (144 = generous frames/s bound so a fast display doesn't under-cover).
const frames = snapEnd.frames.slice(-Math.min(snapEnd.frames.length, Math.round(DURATION * 144)))
const sorted = [...frames].sort((a, b) => a - b)
const pct = p => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0
run.frameStats = {
  n: sorted.length,
  meanMs: +(frames.reduce((s, v) => s + v, 0) / (frames.length || 1)).toFixed(2),
  p50: +pct(0.50).toFixed(2), p95: +pct(0.95).toFixed(2), p99: +pct(0.99).toFixed(2),
  maxMs: +(sorted[sorted.length - 1] ?? 0).toFixed(2),
  droppedPct: +(100 * frames.filter(v => v > 25).length / (frames.length || 1)).toFixed(2),   // >1.5 vsync @60Hz
  fpsMean: +(1000 / (frames.reduce((s, v) => s + v, 0) / (frames.length || 1))).toFixed(1),
}
// Bucket deltas over the window (cumulative counters → diff start/end).
run.buckets = {}
for (const [label, b] of Object.entries(snapEnd.buckets)) {
  const s = snapStart.buckets[label] ?? { ms: 0, n: 0 }
  const dMs = b.ms - s.ms, dN = b.n - s.n
  if (dN > 0) run.buckets[label] = { ms: +dMs.toFixed(1), n: dN, avgMs: +(dMs / dN).toFixed(3) }
}

writeFileSync(join(outDir, 'run.json'), JSON.stringify(run, null, 2))
console.log(`run:   ${join(outDir, 'run.json')}`)
if (run.coldload) console.log(`cold:  ready ${run.coldload.msToReady} ms, ring-complete ${run.coldload.msToRingComplete} ms`)
console.log(`frame: p50 ${run.frameStats.p50} ms  p95 ${run.frameStats.p95} ms  p99 ${run.frameStats.p99} ms  dropped ${run.frameStats.droppedPct}%  (~${run.frameStats.fpsMean} fps)`)
console.log(`gpu timer ext: ${run.gpuTimerExt === null ? 'no webgl2 ctx' : run.gpuTimerExt ? 'AVAILABLE' : 'absent (expected on ANGLE/Metal)'}`)
client.close()
process.exit(0)
