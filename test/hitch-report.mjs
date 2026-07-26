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

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { launchChrome, connect, keyEvent, sleep } from './lib/cdp.mjs'

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
if (!['drive', 'stream'].includes(SCENARIO)) { console.error(`unknown scenario ${SCENARIO}`); process.exit(1) }

const qs = new URLSearchParams({ prof: '1', hitch: String(HITCH_MS) })
if (SEED && SEED !== '6') qs.set('seed', SEED)
const APP = `http://localhost:${PORT}/index.html?${qs}`

try { const r = await fetch(`http://localhost:${PORT}/index.html`); if (!r.ok) throw 0 }
catch { console.error(`No server on :${PORT}. Run \`npm run dev\` first.`); process.exit(1) }

launchChrome(APP, { port: CDP_PORT, headed: HEADED })
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

// Throttle AFTER settling — a 4× CPU penalty applied during load just makes the wait long, and the
// question is about steady-state play on a slow machine, not about load.
if (CPU > 1) { await client.cmd('Emulation.setCPUThrottlingRate', { rate: CPU }); await sleep(1500) }

// ── measurement window ───────────────────────────────────────────────────────────────────────
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
    await evalOk(`(()=>{ const x=${sweep.x0} + ${dx}, z=${sweep.z0}; const y=(typeof window.terrain==='function')? window.terrain(x,z):100; window.__view(x, y+45, z, ${Math.PI / 2}, -0.55); return true })()`)
  }
  await sleep(sweep ? 500 : 2000)
}
if (SCENARIO === 'drive') await keyEvent(client, 'w', false)

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
console.log(`\n════ hitch report — ${SCENARIO}, preset ${PRESET}, cpu ×${CPU}, ${DURATION}s ════`)
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

if (OUT) {
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify({ meta: { scenario: SCENARIO, preset: PRESET, seed: SEED, cpu: CPU, duration: DURATION, hitchMs: HITCH_MS }, stats, report: rep }, null, 2))
  console.log(`  written: ${OUT}\n`)
}
client.close()
process.exit(0)
