// GATE (BUG-129/130): the carved ground beside roads has no cliffs the earthwork does not have. A CEILING gate.
//
// On random seeds (pond no-go wired), lines across every run every 8 m of arc, both sides, 5.3–28 m out at 0.1 m, on
// analyticHeight. A STEP is > 0.5 m between neighbours 0.1 m apart, off the asphalt and away from bores (portal faces
// are by design). Steps are clustered into sites per run/side within 6 m of arc and classed by the resolve flip
// across them: a switchback's ARM FLIP (the same run, its arc jumping), a RUN FLIP, or IN-SECTION.
//
// GATING: no arm-flip site (BUG-130: every distinct pass of the winner's run is a rival, faded in, so the union is
// symmetric at the flip; main had 12 on these seeds, up to 10.09 m), and the other sites under CEIL (ratcheted:
// lower it when it improves). Reported: the worst site per class.
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { wirePondNoGo } from './lib/pond-no-go.mjs'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'

const SEEDS = ['24316861', '861989012']   // random seeds (the BUG-129 census)
const R = 900, STEP = 0.5
// in-section + run-flip sites over STEP. 2026-11-07 (BUG-130): 7 on these two seeds (main before it: 14, worst 8.69 m, plus 12 arm flips up to 10.09 m)
const CEIL = 7
const sites = []
for (const S of SEEDS) {
  const ws = parseWorldSeed(S), road = new RoadSystem(ws, P)
  wirePondNoGo(road, ws, P); road.setRadius(R + 300); road.update(new THREE.Vector3(0, 0, 0))
  const terr = makeTerrainHeadless(ws, P, road)
  const cls = (x0, z0, x1, z1) => {
    const n0 = road._resolveRoadSurface(x0, z0), n1 = road._resolveRoadSurface(x1, z1)
    for (const [n, x, z] of [[n0, x0, z0], [n1, x1, z1]]) {
      if (!n) continue
      const a = n.arcS + (x - n.point.x) * n.tangent.x + (z - n.point.z) * n.tangent.z
      if (road.tunnelSpanAt(n.runKey, a, -30) || (n.rivals ?? []).some((rv) => road.tunnelSpanAt(rv.runKey, rv.arcS, -30))) return 'bore'
      if (Math.abs((x - n.point.x) * n.tangent.z - (z - n.point.z) * n.tangent.x) < (P.roadHalfWidth ?? 5) + 0.5) return 'deck'
    }
    if (!n0 || !n1) return 'in-section'
    if (n0.runKey !== n1.runKey) return 'run-flip'
    const a0 = n0.arcS + (x0 - n0.point.x) * n0.tangent.x + (z0 - n0.point.z) * n0.tangent.z, a1 = n1.arcS + (x1 - n1.point.x) * n1.tangent.x + (z1 - n1.point.z) * n1.tangent.z
    return Math.abs(a1 - a0) > 5 ? 'arm-flip' : 'in-section'
  }
  for (const [k, e] of road._network) {
    if (k.endsWith('~p') || !e.polyCum) continue
    const L = e.polyCum.at(-1)
    for (let s = 4; s < L - 4; s += 8) {
      if (road.tunnelSpanAt(k, s)) continue
      const c = road.runPointAt(k, s); if (Math.hypot(c.x, c.z) > R) continue
      const q = road.runPointAt(k, s + 0.5), tx = (q.x - c.x) / 0.5, tz = (q.z - c.z) / 0.5
      for (const side of [1, -1]) {
        let prev = null
        for (let l = 5.3; l <= 28; l += 0.1) {
          const x = c.x + side * tz * l, z = c.z - side * tx * l, h = terr.analyticHeight(x, z)
          if (prev != null && Math.abs(h - prev) > STEP) {
            const kind = cls(c.x + side * tz * (l - 0.1), c.z - side * tx * (l - 0.1), x, z)
            if (kind !== 'bore' && kind !== 'deck') {
              const near = sites.find((o) => o.S === S && o.k === k && o.side === side && o.kind === kind && Math.abs(o.s - s) < 6.1)
              if (near) { if (Math.abs(h - prev) > near.d) Object.assign(near, { d: Math.abs(h - prev), s, x, z }) }
              else sites.push({ S, k, side, s, kind, d: Math.abs(h - prev), x, z })
            }
          }
          prev = h
        }
      }
    }
  }
}
let fails = 0
for (const kind of ['arm-flip', 'run-flip', 'in-section']) {
  const q = sites.filter((o) => o.kind === kind).sort((a, b) => b.d - a.d)
  console.log(`${kind}: ${q.length} sites with a step > ${STEP} m${q.length ? `, worst ${q[0].d.toFixed(2)} m at ${q[0].S} (${q[0].x.toFixed(1)}, ${q[0].z.toFixed(1)}) ${q[0].k}` : ''}`)
}
const arm = sites.filter((o) => o.kind === 'arm-flip').length, rest = sites.length - arm
if (arm) { fails++; console.log(`  FAIL ${arm} switchback arm-flip site(s) step > ${STEP} m`) }
if (rest > CEIL) { fails++; console.log(`  FAIL ${rest} in-section/run-flip sites > ceiling ${CEIL}`) }
else if (rest < CEIL) console.log(`  (${rest} < ceiling ${CEIL}: lower CEIL to ${rest})`)
console.log(fails ? `FAIL: ${fails}` : 'PASS')
process.exit(fails ? 1 : 0)
