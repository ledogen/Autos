// GATE (BUG-153): the drawn ribbon is the surface the wheel rides, across its whole width (MESH == PHYSICS).
//
// Every ribbon cross-section the tile builder draws is captured from RoadMeshSystem._ribbonSection with its run key (the
// sweep and the pad mouths' weld sections). Each top vertex strictly inside the pavement (|lat| < hw − 0.05: the stations
// 0, ±1.25, ±2.5, ±3.75) is compared with physics at the same x,z (_sampleCarveWorld at the vertex + 0.3 m, potholes
// off), where physics resolves the vertex to that same run. Main before BUG-153 framed each section on runProfile's
// incoming-chord tangent, which trails a curve by up to a chord's whole turn while physics projects onto the analytic
// centerline: the section tilted against the surface by grade × lat × tan(lag) — 188–461 vertices ≥ 2 cm per seed,
// worst 19.7 cm (BUG-149's leg lip, seed 1074499174, was 0.134 m of it). GATING: none ≥ MAX_D.
//
// Reported apart, not gated — physics is not the leg's own deck there, by design that BUG-153 does not touch:
//   - a promoted T's departure band (offCurveSpans ± 0.5): physics frames on the raw polyline chords (the points left
//     the centerline), a faceted frame the smooth ribbon cannot follow — up to 0.38 m on banked curves (2654449719).
//   - the QUAL-10 ruled blend near a junction node: physics bends toward the sibling legs' grades on the leg's own
//     pavement (the soft gap clamp leaves a sibling a few % of weight), the ribbon does not.
//   - vertices that resolve to ANOTHER run (two ribbons overlapping).
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RoadMeshSystem } from '../src/road-mesh.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { wirePondNoGo } from './lib/pond-no-go.mjs'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { CHUNK_SIZE } from '../src/terrain.js'

const SEEDS = ['273004588', '2654449719', '1074499174', '6']   // two random seeds, BUG-149's seed, the test seed
const RAD = 448, MAX_D = 0.02
const P = { ...RANGER_PARAMS, potholeEnabled: false }, hw = P.roadHalfWidth ?? 5, W = P.roadWidth ?? 10
let fails = 0
const apart = { band: [0, 0], blend: [0, 0], overlap: [0, 0] }   // [verts ≥ MAX_D, worst]
for (const S of SEEDS) {
  const ws = parseWorldSeed(S), road = new RoadSystem(ws, P)
  wirePondNoGo(road, ws, P); road.setRadius(RAD + 600); road.update(new THREE.Vector3(0, 0, 0))
  const T = makeTerrainHeadless(ws, P, road)
  road._detectNodeJunctions()
  const mesh = new RoadMeshSystem({ add () {} }, road, null, P, ws)
  mesh._getTunnelMaterial = mesh._getPortalMaterial = () => null
  const secs = [], section = mesh._ribbonSection
  mesh._ribbonSection = function (px, pz, arcS, runKey, cs, params, out) {
    const q = section.call(this, px, pz, arcS, runKey, cs, params, out)
    secs.push({ runKey, v: Float64Array.from(out) })
    return q
  }
  const n = Math.ceil(RAD / CHUNK_SIZE)
  for (let a = -n; a < n; a++) for (let b = -n; b < n; b++) mesh._buildRoadTile(a, b, `${a},${b}`)
  let verts = 0, worst = 0, worstAt = ''
  const seen = new Set()
  for (const { runKey, v } of secs) for (let j = 0; j < v.length / 3; j++) {
    const lat = (j / (v.length / 3 - 1) - 0.5) * W
    if (Math.abs(lat) > hw - 0.05) continue
    const x = v[3 * j], y = v[3 * j + 1], z = v[3 * j + 2], key = `${x.toFixed(3)},${z.toFixed(3)}`
    if (seen.has(key)) continue
    seen.add(key)
    const nr = road._resolveRoadSurface(x, z)
    if (!nr) continue
    const ph = road._sampleCarveWorld(x, z, T.rawHeightWorld(x, z), undefined, y + 0.3)?.gradeY
    if (ph == null) continue
    const d = Math.abs(ph - y)
    const e = road._network.get(runKey), ae = nr.arcS + (x - nr.point.x) * nr.tangent.x + (z - nr.point.z) * nr.tangent.z
    const sl = (x - nr.point.x) * nr.tangent.z - (z - nr.point.z) * nr.tangent.x, a = ae + (e.arcOrigin ?? 0)
    const cls = nr.runKey !== runKey ? 'overlap'
      : (e.offCurveSpans || []).some((c) => a >= c.s0 - 0.5 && a <= c.s1 + 0.5) ? 'band'
      : Math.abs(road._carveDirtY(sl, ae, runKey, nr.camberSign ?? 1, x, z) - road._carveDirtY(sl, ae, runKey, nr.camberSign ?? 1)) > 0.01 ? 'blend'
      : null
    if (cls) { if (d >= MAX_D) apart[cls][0]++; apart[cls][1] = Math.max(apart[cls][1], d); continue }
    verts++
    if (d > worst) { worst = d; worstAt = `(${x.toFixed(1)}, ${z.toFixed(1)}) ${runKey} lat ${lat.toFixed(2)}` }
    if (d >= MAX_D) fails++
  }
  console.log(`  seed ${S}: ${secs.length} drawn sections, ${verts} pavement vertices on their own deck — worst |physics − drawn| ${(worst * 100).toFixed(2)} cm at ${worstAt}`)
}
const rep = (k) => `${apart[k][0]} ≥ ${MAX_D * 100} cm, worst ${(apart[k][1] * 100).toFixed(1)} cm`
console.log(`  reported apart (physics is not the leg's own deck there): T departure bands ${rep('band')} · QUAL-10 ruled blend ${rep('blend')} · overlapping ribbons ${rep('overlap')}`)
if (fails) { console.log(`FAIL: ${fails} ribbon vertices stand ≥ ${MAX_D * 100} cm off the surface physics rides (the section frame lags the centerline: BUG-153)`); process.exit(1) }
console.log('PASS')
process.exit(0)
