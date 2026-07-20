// test/impostor-ab.mjs — headless A/B harness: billboard impostors vs their 3D originals.
//
// For a tree cluster at world (x,z), orbit the freecam at billboard distance and capture each
// vantage twice: TRUTH (setLodRing(99) — every streamed chunk renders full 3D) and BILLBOARD
// (setLodRing(0) — everything beyond the camera chunk renders impostor quads). Saves the PNG
// pairs for eyeballing and computes in-page pixel metrics over the CHANGED region (the pixels
// the swap actually touched): changed-pixel count, mean RGB of each side, and centroid shift —
// i.e. "how wrong is the billboard's colour/brightness/position vs the real prop".
//
// PREREQ: dev server for the checkout under test (worktree: `npm run dev -- --port 8031`).
// USAGE:
//   node test/impostor-ab.mjs [--x=-120] [--z=187] [--r=160] [--yaws=4] [--port=8031]
//                             [--wait=9000] [--outdir=shots] [--litgain=..] [--eval=JSEXPR]
//   --eval runs an arbitrary expression once after boot (sweep hook, e.g. tweak a uniform).
// Not a gate — never run by `npm test`.

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launchChrome, connect, sleep } from './lib/cdp.mjs'

const flag = (k, d) => { const f = process.argv.find(a => a.startsWith(`--${k}=`)); return f ? f.slice(k.length + 3) : d }
const X = Number(flag('x', -120)), Z = Number(flag('z', 187))
const R = Number(flag('r', 160)), YAWS = Number(flag('yaws', 4))
const PORT = Number(flag('port', 8031)), WAIT = Number(flag('wait', 9000))
const OUTDIR = flag('outdir', join(process.cwd(), 'shots'))
const LITGAIN = flag('litgain', null)
const EVAL = flag('eval', null)
const TAG = flag('tag', 'ab')
mkdirSync(OUTDIR, { recursive: true })

// Ground-relative camera/target heights (underground-camera trap — see test/screenshot.mjs).
const { RANGER_PARAMS } = await import('../data/ranger.js')
const { parseWorldSeed } = await import('../src/seed.js')
const { makeTerrainHeadless } = await import('./lib/terrain-headless.mjs')
const { rawHeightWorld } = makeTerrainHeadless(parseWorldSeed('6'), RANGER_PARAMS, null)
const targetY = rawHeightWorld(X, Z) + 8            // aim at canopy height over the cluster

const APP = `http://localhost:${PORT}/index.html`
try { const r = await fetch(APP); if (!r.ok) throw 0 } catch { console.error(`No server on :${PORT}.`); process.exit(1) }

const { cleanup } = launchChrome(APP, { port: 9223 })
const client = await connect({ port: 9223 })
await sleep(WAIT)
for (let i = 0; i < 30; i++) {
  const r = await client.evalJS(`typeof window.__view === 'function' && typeof window.__props === 'function'`)
  if (r.val === true) break
  await sleep(500)
}

// In-page capture + metrics helper. Grab inside a rAF callback (WebGL canvas has no
// preserveDrawingBuffer — same-frame read, the BUG-34 shot-canvas pattern).
await client.evalJS(`window.__ab = (() => {
  const W = 875
  const grab = () => new Promise(res => requestAnimationFrame(() => {
    const src = document.querySelector('canvas')
    const h = Math.round(src.height / src.width * W)
    const cc = document.createElement('canvas'); cc.width = W; cc.height = h
    const ctx = cc.getContext('2d')
    ctx.drawImage(src, 0, 0, W, h)
    res({ data: ctx.getImageData(0, 0, W, h).data, w: W, h })
  }))
  const metric = (A, B) => {
    const n = A.w * A.h, W2 = A.w
    const mask = new Uint8Array(n)
    let mad = 0
    for (let p = 0; p < n; p++) {
      const i = p * 4
      const d = Math.abs(A.data[i]-B.data[i]) + Math.abs(A.data[i+1]-B.data[i+1]) + Math.abs(A.data[i+2]-B.data[i+2])
      mad += d
      if (d > 30) mask[p] = 1
    }
    let changed = 0, sumA = [0,0,0], sumB = [0,0,0], cxA = 0, cyA = 0, cxB = 0, cyB = 0, wA = 0, wB = 0
    let inner = 0, sumIA = [0,0,0], sumIB = [0,0,0]
    for (let p = 0; p < n; p++) {
      if (!mask[p]) continue
      const i = p * 4, x = p % W2, y = (p / W2) | 0
      changed++
      for (let c = 0; c < 3; c++) { sumA[c] += A.data[i+c]; sumB[c] += B.data[i+c] }
      const lA = A.data[i]+A.data[i+1]+A.data[i+2], lB = B.data[i]+B.data[i+1]+B.data[i+2]
      cxA += x*lA; cyA += y*lA; wA += lA
      cxB += x*lB; cyB += y*lB; wB += lB
      // interior: 2-px erosion of the changed mask — excludes silhouette/AA edge pixels, so the
      // interior means compare canopy COLOUR without the opaque-quad-vs-leafy-gaps footprint bias
      if (x > 1 && y > 1 && x < W2-2 && y < A.h-2 &&
          mask[p-2] && mask[p+2] && mask[p-2*W2] && mask[p+2*W2]) {
        inner++
        for (let c = 0; c < 3; c++) { sumIA[c] += A.data[i+c]; sumIB[c] += B.data[i+c] }
      }
    }
    const f = v => +v.toFixed(1)
    return {
      changedPct: +(100*changed/n).toFixed(2),
      meanAbsDiff: +(mad/(3*n)).toFixed(2),
      mean3D: sumA.map(s => f(s/Math.max(changed,1))),
      meanBB: sumB.map(s => f(s/Math.max(changed,1))),
      inner3D: sumIA.map(s => f(s/Math.max(inner,1))),
      innerBB: sumIB.map(s => f(s/Math.max(inner,1))),
      innerPct: +(100*inner/n).toFixed(2),
      centroid3D: [f(cxA/Math.max(wA,1)), f(cyA/Math.max(wA,1))],
      centroidBB: [f(cxB/Math.max(wB,1)), f(cyB/Math.max(wB,1))],
    }
  }
  return { grab, metric, shots: {} }
})()`)

if (LITGAIN != null) {
  const r = await client.evalJS(`window.__props().setImpostorLitGain(${Number(LITGAIN)})`)
  if (r.err) { console.error('litgain eval failed:', r.err); process.exit(1) }
}
if (EVAL != null) { const r = await client.evalJS(EVAL); console.log('eval:', JSON.stringify(r)) }

const stats = await client.evalJS(`typeof __impAtlasStats === 'function' ? __impAtlasStats() : null`)
console.log('atlasStats:', JSON.stringify(stats.val))

const results = []
for (let k = 0; k < YAWS; k++) {
  const az = (k / YAWS) * Math.PI * 2
  const camX = X + R * Math.sin(az), camZ = Z + R * Math.cos(az)
  const camY = Math.max(rawHeightWorld(camX, camZ) + 26, targetY + 12)
  // freecam YXZ forward at pitch 0 is (-sin yaw, 0, -cos yaw): yaw/pitch that look AT the cluster
  const fx = X - camX, fy = targetY - camY, fz = Z - camZ
  const len = Math.hypot(fx, fz)
  const yaw = Math.atan2(-fx, -fz)
  const pitch = Math.atan2(fy, len)

  const shots = {}
  for (const [mode, ring] of [['3d', 99], ['bb', 0]]) {
    await client.evalJS(`window.__props().setLodRing(${ring}); window.__view(${camX}, ${camY}, ${camZ}, ${yaw}, ${pitch})`)
    await sleep(k === 0 && mode === '3d' ? 6000 : 3000)   // stream + budgeted LOD re-pool
    await client.evalJS(`window.__ab.grab().then(s => { window.__ab.shots['${mode}'] = s })`)
    await sleep(300)
    const shot = await client.cmd('Page.captureScreenshot', { format: 'png' })
    const p = join(OUTDIR, `${TAG}_yaw${k}_${mode}.png`)
    writeFileSync(p, Buffer.from(shot.result.data, 'base64'))
    shots[mode] = p
  }
  const m = await client.evalJS(`window.__ab.metric(window.__ab.shots['3d'], window.__ab.shots['bb'])`)
  if (m.err) console.error('metric error:', m.err)
  console.log(`yaw ${k} (az ${(az * 180 / Math.PI).toFixed(0)}°):`, JSON.stringify(m.val))
  results.push({ yaw: k, az: +(az * 180 / Math.PI).toFixed(0), ...m.val })
}
writeFileSync(join(OUTDIR, `${TAG}_metrics.json`), JSON.stringify({ atlas: stats.val, results }, null, 2))
console.log('metrics →', join(OUTDIR, `${TAG}_metrics.json`))
client.close()
cleanup()
process.exit(0)
