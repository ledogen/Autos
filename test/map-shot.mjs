// test/map-shot.mjs — FEAT-68 checkpoint tooling: capture the in-game 2D map (map2d) headlessly.
//
// Opens the app over CDP (shared client in test/lib/cdp.mjs), shows the map via the window.__map2d
// dev handle, frames a (cx, cz, r) world box, raises the map's stream radius to cover it, polls the
// map's own network stream until it reports full, lets the background raster settle, and saves a
// PNG. The map IS the network-validation surface (FEAT-16), so this is the gallery's map renderer.
//
// USAGE:
//   node test/map-shot.mjs [--seed=20] [--cx=0] [--cz=0] [--r=2500] [--port=8000] [--out=path]
//   node test/map-shot.mjs --seed=20 --r=2500 --port=3343 --out=perf-runs/map-20.png
//
// NOTE: --r raises the map's radius CAP too (free roam caps at 2000 otherwise). The framed box is
// the square ±r; the streamed network is the circle of radius r+margin around (cx, cz).

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchChrome, connect, sleep } from './lib/cdp.mjs'

const argv = process.argv.slice(2)
const flag = (k, d) => { const f = argv.find(a => a.startsWith(`--${k}=`)); return f ? f.split('=')[1] : d }
const SEED = flag('seed', '6')
const CX = Number(flag('cx', 0)), CZ = Number(flag('cz', 0)), R = Number(flag('r', 2500))
const PORT = Number(flag('port', 8000)), CDP = 9222
const OUT = flag('out', join(process.cwd(), `map_${SEED}_${CX}_${CZ}.png`))
const POLL_TIMEOUT = Number(flag('timeout', 120)) * 1000

const APP = SEED !== '6' ? `http://localhost:${PORT}/index.html?seed=${SEED}` : `http://localhost:${PORT}/index.html`
try { const r = await fetch(APP); if (!r.ok) throw 0 } catch { console.error(`No server on :${PORT}.`); process.exit(1) }

launchChrome(APP, { port: CDP })
const client = await connect({ port: CDP })
await sleep(10000)

// Open FIRST (show() sizes the canvas — frameBounds is documented "call AFTER show()"), then
// widen the stream and frame the box. setRadiusTarget while open kicks the chunked stream.
let ok = null
for (let i = 0; i < 20; i++) {
  const r = await client.evalJS(`(()=>{
    if (typeof window.__map2d !== 'function') return 'pending'
    const m = window.__map2d()
    m.show()
    m.setRadiusCap(${R + 300})
    m.setRadiusTarget(${R + 100})
    m.frameBounds(${CX - R}, ${CZ - R}, ${CX + R}, ${CZ + R})
    return 'ok' })()`)
  if (r.err) { console.error('eval error:', r.err); client.close(); process.exit(1) }
  if (r.val === 'ok') { ok = true; break }
  await sleep(500)
}
if (!ok) { console.error('window.__map2d handle never appeared'); client.close(); process.exit(1) }

// Poll the map's own stream state until the network is fully built out to the target radius.
const t0 = Date.now()
for (;;) {
  const r = await client.evalJS(`window.__map2d()._streamFull`)
  if (r.val === true) break
  if (Date.now() - t0 > POLL_TIMEOUT) { console.error('map stream did not complete in time'); break }
  await sleep(1000)
}
// Re-frame (marks the background dirty) so the settled redraw includes the fully-streamed network.
await client.evalJS(`window.__map2d().frameBounds(${CX - R}, ${CZ - R}, ${CX + R}, ${CZ + R})`)
await sleep(4000)   // background raster redraws once per settled pan/zoom — let it land
const shot = await client.cmd('Page.captureScreenshot', { format: 'png' })
writeFileSync(OUT, Buffer.from(shot.result.data, 'base64'))
client.close()
console.log(OUT)
process.exit(0)
