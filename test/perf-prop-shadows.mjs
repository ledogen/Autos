// test/perf-prop-shadows.mjs — PERF-07 measurement: what does prop shadow CASTING cost?
//
// Headless CDP harness (same plumbing as screenshot.mjs): loads the app, parks the freecam over
// a dense prop field, then measures rAF frame times in an A/B/A pattern:
//   A: props castShadow = true (shipped default)
//   B: props castShadow = false (all prop InstancedMeshes dropped from the sun's shadow pass)
//   A': back to true (detects warmup/thermal drift — trust the delta only if A ≈ A')
// Also reports renderer.info.render.calls per phase (the shadow pass re-draws casters).
//
// Uses the PERF-07 dev handles (main.js): window.__props() → PropSystem, window.__renderer().
// Starts its OWN static server on :8017 serving THIS checkout — so it measures the worktree,
// not whatever :8000 has. Not a gate — never run by `npm test`; results go in the PERF-07 ticket.
//
// USAGE: node test/perf-prop-shadows.mjs [--frames=240] [--x=0] [--z=0] [--wait=12000]

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const argv = process.argv.slice(2)
const flag = (k, d) => { const f = argv.find(a => a.startsWith(`--${k}=`)); return f ? Number(f.split('=')[1]) : d }
const FRAMES = flag('frames', 240), X = flag('x', 0), Z = flag('z', 0), WAIT = flag('wait', 12000)
const PORT = 8017, CDP = 9223
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const server = spawn('npx', ['serve', ROOT, '-l', String(PORT)], { stdio: 'ignore' })
const userDir = mkdtempSync(join(tmpdir(), 'rangersim-perf-'))
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${userDir}`,
    '--use-angle=metal', '--window-size=1400,900',
    // Unlock the frame rate: vsync clamps every phase to 16.67 ms and hides any cost that fits
    // in the frame budget — unlocked, the mean frame time IS the true render cost.
    '--disable-frame-rate-limit', '--disable-gpu-vsync',
    `http://localhost:${PORT}/index.html`], { stdio: 'ignore' })
const cleanup = () => {
    try { chrome.kill() } catch {}
    try { server.kill() } catch {}
    try { rmSync(userDir, { recursive: true, force: true }) } catch {}
}
process.on('exit', cleanup); process.on('SIGINT', () => { cleanup(); process.exit(1) })

for (let i = 0; i < 40; i++) { try { if ((await fetch(`http://localhost:${PORT}/index.html`)).ok) break } catch {} await sleep(250) }

async function pageWs () { for (let i = 0; i < 60; i++) { try { const t = await (await fetch(`http://localhost:${CDP}/json/list`)).json(); const p = t.find(x => x.type === 'page' && x.webSocketDebuggerUrl); if (p) return p.webSocketDebuggerUrl } catch {} await sleep(250) } throw new Error('no page target') }
const ws = new WebSocket(await pageWs()); await new Promise(r => ws.onopen = r)
let _id = 0; const pend = new Map()
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } }
const cmd = (method, params = {}) => new Promise(res => { const id = ++_id; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })) })
const evalJS = async expr => { const m = await cmd('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); const R = m.result || {}; if (R.exceptionDetails) throw new Error(R.exceptionDetails.text || JSON.stringify(R.exceptionDetails)); return R.result?.value }

await cmd('Page.enable'); await cmd('Runtime.enable')
await sleep(WAIT)   // initial terrain/road/prop stream
// Park the freecam over the prop field (terrain+props stream around the camera in freecam, D-21).
for (let i = 0; i < 30; i++) {
    const ok = await evalJS(`typeof window.__view === 'function' && typeof window.__props === 'function' ? (window.__view(${X}, 150, ${Z + 40}, 0, -0.7), 'ok') : 'pending'`)
    if (ok === 'ok') break
    if (i === 29) { console.error('dev handles never appeared'); process.exit(1) }
    await sleep(500)
}
await sleep(6000)   // stream-in around the vantage

// PERF-07: set castShadow directly (works even without the shadow-bake API) AND, when present, call
// setShadowCasting so the baked contact-shadow blobs flip visibility in lock-step (blobs ⇔ cast off).
const setCast = (v) => evalJS(`(() => {
  const P = window.__props(); let n = 0
  for (const rec of P._meshes.values()) { rec.mesh.castShadow = ${v}; n++ }
  if (typeof P.setShadowCasting === 'function') P.setShadowCasting(${v})
  return n
})()`)
const measure = async (label) => {
    const stats = await evalJS(`new Promise(resolve => {
        const t = []
        let last = 0
        const tick = (ts) => {
            if (last) t.push(ts - last)
            last = ts
            if (t.length < ${FRAMES}) requestAnimationFrame(tick)
            else {
                t.sort((a, b) => a - b)
                const mean = t.reduce((s, v) => s + v, 0) / t.length
                resolve({ mean, p50: t[(t.length / 2) | 0], p95: t[(t.length * 0.95) | 0], max: t[t.length - 1],
                          calls: window.__renderer().info.render.calls })
            }
        }
        requestAnimationFrame(tick)
    })`)
    console.log(`${label}: mean=${stats.mean.toFixed(2)} ms  p50=${stats.p50.toFixed(2)}  p95=${stats.p95.toFixed(2)}  max=${stats.max.toFixed(1)}  drawCalls=${stats.calls}`)
    return stats
}

const nMeshes = await setCast(true)
console.log(`prop meshes: ${nMeshes}  |  frames per phase: ${FRAMES}  |  vantage (${X}, ${Z})`)
const A1 = await measure('A  cast=on ')
await setCast(false)
await sleep(500)
const B  = await measure('B  cast=off')
await setCast(true)
await sleep(500)
const A2 = await measure("A' cast=on ")

const base = (A1.mean + A2.mean) / 2
console.log(`\nshadow-cast cost ≈ ${(base - B.mean).toFixed(2)} ms/frame (A/A' spread ${(Math.abs(A1.mean - A2.mean)).toFixed(2)} ms)`)
console.log(`draw calls: on=${A1.calls} off=${B.calls} (Δ=${A1.calls - B.calls})`)
ws.close()
process.exit(0)
