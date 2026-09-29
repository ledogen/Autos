// test/bug76-browser-probe.mjs — RAINY-DAY (not a gate; needs a running dev server).
// BUG-76 in the real game: teleport the truck along the owner's seed-"w" route at its recorded pace,
// park at the mark, then compare the ground the WHEELS read (analyticHeight) with the Box3D colliders
// the CHASSIS hits (terrain heightfield = group 1, road trimesh / statics = groups 3|4) on a 0.5 m grid.
// Healthy: wheel compression ~0.03 m, truck y ≈ 179.33, no collider point > 0.15 m above the wheel
// ground (a fresh load reads +0.067 terrain / +0.053 road: triangle-vs-analytic discretisation). The bug: compression 0, y 179.51, chunk (3,9)'s heightfield + road trimesh 0.3–0.68 m high.
//
// Run: node test/bug76-browser-probe.mjs [devPort=8000] [path|direct]
import { launchChrome, connect, sleep } from './lib/cdp.mjs'
import { BUG76_MARK, BUG76_ROUTE } from './lib/bug76-route.mjs'

const APP = Number(process.argv[2] || 8000), MODE = process.argv[3] || 'path', PORT = 9300 + (APP % 100)
const { x: X, z: Z } = BUG76_MARK
const { cleanup } = launchChrome(`http://localhost:${APP}/?nomenu&seed=w`, { port: PORT })
const c = await connect({ port: PORT })
const ev = async e => { const r = await c.evalJS(e); if (r.err) throw new Error(JSON.stringify(r)); return r.val }
for (let i = 0; i < 120; i++) { if (await ev('!!window.__rsReady').catch(() => false)) break; await sleep(500) }
await sleep(4000)
if (MODE === 'path') {
  // ~0.9 s per waypoint ≈ the capture's pace (43 s over 69 points)
  for (let i = 0; i < BUG76_ROUTE.length; i++) {
    const [x, z] = BUG76_ROUTE[i], [nx, nz] = BUG76_ROUTE[Math.min(i + 1, BUG76_ROUTE.length - 1)]
    await ev(`window.__teleport(${x}, ${z}, ${Math.atan2(nx - x, nz - z)}, 0.5)`)
    await sleep(600)
  }
}
await ev(`window.__teleport(${X}, ${Z}, 0, 0.5)`)
await sleep(8000)
const out = await ev(`(() => {
  const ts = window.__terrainSystem(), rs = window.__roadSys(), pe = window.__physicsEngine, vs = window.__vs
  let worstT = -Infinity, worstP = -Infinity, raised = 0
  for (let dx = -8; dx <= 8; dx += 0.5) for (let dz = -8; dz <= 8; dz += 0.5) {
    const x = ${X} + dx, z = ${Z} + dz, a = ts.analyticHeight(x, z, rs.carveHint(x, z))
    for (const [mask, isT] of [[1n, true], [12n, false]]) {
      const h = pe.castRay({ x, y: a + 30, z }, { x: 0, y: -1, z: 0 }, 60, { collidesWith: mask }); if (!h) continue
      const d = h.point.y - a; if (isT) worstT = Math.max(worstT, d); else worstP = Math.max(worstP, d); if (d > 0.15) raised++
    }
  }
  return { carY: +vs.position.y.toFixed(3), compression: (vs.wheelDebug || []).map(w => +(w.c ?? 0).toFixed(3)),
           terrainColliderMaxAboveWheelGround: +worstT.toFixed(3), otherColliderMaxAbove: +worstP.toFixed(3), raisedPoints: raised }
})()`)
console.log(JSON.stringify(out))
console.log(out.raisedPoints === 0 && out.compression.every(v => v > 0.01) ? 'HEALTHY' : 'BUG-76 SYMPTOM PRESENT')
c.close(); cleanup(); process.exit(0)
