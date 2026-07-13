// test/screenshot.mjs — headless in-browser screenshot tool for RangerSim (visual troubleshooting).
//
// Drives Chrome over the DevTools Protocol (node's built-in global WebSocket + fetch — no playwright)
// to load the running app, jump the freecam to a world position, and save a PNG. Use it to eyeball any
// visual change (junctions, ribbons, carve, props, sky) without hand-driving the truck.
//
// PREREQ: an HTTP server on :8000 — `npx serve .` (usually already running if you have the app open).
//         (file:// breaks ES modules.) WebGL renders headless via --use-angle=metal on macOS.
//
// USAGE:
//   node test/screenshot.mjs <x> <z> [y] [--height=40] [--pitch=-0.9] [--zoff=32] [--seed=6] [--wait=6500] [--out=path]
//   node test/screenshot.mjs -38 183            # look down at the junction at world (-38, 183)
//   node test/screenshot.mjs -38 183 106 --height=55 --pitch=-1.1
//
// It places the freecam at (x, y+height, z+zoff) looking down toward -Z (yaw 0, pitch). In freecam the
// terrain + roads stream around the CAMERA (D-21), so any world XZ builds even far from spawn. Relies on
// the `window.__view` dev handle (main.js → camera.placeFreecam).
//
// Prints the saved PNG path on success. Not a gate — never run by `npm test`.

import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const argv = process.argv.slice(2)
const pos = argv.filter(a => !a.startsWith('--'))
const flag = (k, d) => { const f = argv.find(a => a.startsWith(`--${k}=`)); return f ? f.split('=')[1] : d }
if (pos.length < 2) { console.error('usage: node test/screenshot.mjs <x> <z> [y] [--height=40] [--pitch=-0.9] [--zoff=32] [--seed=6] [--wait=6500] [--out=path]'); process.exit(1) }

const X = Number(pos[0]), Z = Number(pos[1])
const HEIGHT = Number(flag('height', 40)), PITCH = Number(flag('pitch', -0.9)), ZOFF = Number(flag('zoff', 32))
const SEED = flag('seed', '6'), WAIT = Number(flag('wait', 6500))
// Camera base Y: GROUND-RELATIVE by default. The old fixed default (110) sat BELOW the terrain
// over most of the seed-6 map (spawn area is ~150–190 m) — the camera ended up inside the
// mountain and every shot came back sky-white, which cost a whole false "renderer is broken"
// investigation (2026-07-08). Sample the raw terrain under the camera AND the look target
// headlessly and float HEIGHT above the higher of the two; an explicit [y] positional still wins.
let Y
if (pos[2] !== undefined) { Y = Number(pos[2]) } else {
    const { RANGER_PARAMS } = await import('../data/ranger.js')
    const { parseWorldSeed } = await import('../src/seed.js')
    const { makeTerrainHeadless } = await import('./lib/terrain-headless.mjs')
    const { rawHeightWorld } = makeTerrainHeadless(parseWorldSeed(SEED), RANGER_PARAMS, null)
    Y = Math.max(rawHeightWorld(X, Z + ZOFF), rawHeightWorld(X, Z))
    console.log(`ground-relative Y: terrain ${Y.toFixed(1)} m + height ${HEIGHT} m`)
}
const OUT = flag('out', join(process.cwd(), `screenshot_${X}_${Z}.png`))
// --port: point at a different server (e.g. a worktree's own `npx serve . -l 8017`) — the
// default :8000 is usually the MAIN checkout, not necessarily the code you just edited.
const PORT = Number(flag('port', 8000)), CDP = 9222
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
// default seed is 6 (main.js `_urlSeed ?? '6'`) — only add the query when overriding, so the common case
// loads the bare URL (a ?seed= query has proven flaky to load headlessly).
const APP = (SEED && SEED !== '6') ? `http://localhost:${PORT}/index.html?seed=${SEED}` : `http://localhost:${PORT}/index.html`
const sleep = ms => new Promise(r => setTimeout(r, ms))

// Server up?
try { const r = await fetch(APP); if (!r.ok) throw 0 } catch { console.error(`No server on :${PORT}. Run \`npx serve .\` first.`); process.exit(1) }

const userDir = mkdtempSync(join(tmpdir(), 'rangersim-cdp-'))
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${userDir}`, '--use-angle=metal', '--window-size=1400,900', APP], { stdio: 'ignore' })
const cleanup = () => { try { chrome.kill() } catch {} try { rmSync(userDir, { recursive: true, force: true }) } catch {} }
process.on('exit', cleanup); process.on('SIGINT', () => { cleanup(); process.exit(1) })

async function pageWs () { for (let i = 0; i < 60; i++) { try { const t = await (await fetch(`http://localhost:${CDP}/json/list`)).json(); const p = t.find(x => x.type === 'page' && x.webSocketDebuggerUrl); if (p) return p.webSocketDebuggerUrl } catch {} await sleep(250) } throw new Error('no page target') }

const ws = new WebSocket(await pageWs()); await new Promise(r => ws.onopen = r)
let _id = 0; const pend = new Map()
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } }
const cmd = (method, params = {}) => new Promise(res => { const id = ++_id; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })) })
// CDP nests the payload: message.result = { result: {type,value}, exceptionDetails }.
const evalJS = async expr => { const m = await cmd('Runtime.evaluate', { expression: expr, returnByValue: true }); const R = m.result || {}; if (R.exceptionDetails) return { err: R.exceptionDetails.text || JSON.stringify(R.exceptionDetails) }; return { val: R.result?.value } }

await cmd('Page.enable'); await cmd('Runtime.enable')
// chrome was launched with APP already; wait for the initial terrain + road stream, then place the cam.
await sleep(10000)
let placed = null
for (let i = 0; i < 20; i++) {   // the module sets window.__view once main.js finishes importing
  const r = await evalJS(`(()=>{ if(typeof window.__view==='function'){ window.__view(${X}, ${Y + HEIGHT}, ${Z + ZOFF}, 0, ${PITCH}); return 'ok' } return 'pending' })()`)
  if (r.err) { console.error('eval error:', r.err); ws.close(); process.exit(1) }
  if (r.val === 'ok') { placed = 'ok'; break }
  await sleep(500)
}
if (placed !== 'ok') { console.error('window.__view handle never appeared'); ws.close(); process.exit(1) }
await sleep(WAIT)    // stream terrain+roads around the new camera position
const shot = await cmd('Page.captureScreenshot', { format: 'png' })
writeFileSync(OUT, Buffer.from(shot.result.data, 'base64'))
ws.close()
console.log(OUT)
process.exit(0)
