// BUG-258 (A) gate: a junction leg's bank never ends in a standing cliff at the resolver's footprint.
//
// Near a junction _carveCrossSection widens the core by jc.widen, which pushed the bank's toe cap past the
// resolver's footprint (_resolveFootHW, 36 m). The resolver stopped there while the bank still had weight, so the
// fill or cut ended in a cliff (main: 3.03 m at seed 308883464 (−557, 163)). The fix caps the toe at the footprint.
//
// Over every junction leg of three story regions (as built), within the widen reach (roadJunctionCarveRadius of
// the leg's node arc), both sides: lateral transects 33–39 m at 0.1 m. PASS when
//   · no ground step > 0.5 m within 0.1 m whose carved side resolves ≥ 34 m off its run (a bank cut off by the
//     footprint; steps from other sources are not this gate's);
//   · the road deck (lateral −4..4 m) is unchanged, 0.000 m, against the same instance with the toe cap lifted
//     (the pre-fix carve; also proves the transects see the old cliff at the owner's site).
import { buildWorld, rig } from './bug258-crease-census.mjs'
import { REGION_RADIUS_M } from '../src/story.js'

const SITES = [
  { seed: '308883464', x: -557, z: 163 },   // the measured site: 3.03 m on main
  { seed: '662660690' },                    // census sites (random worlds): footprint steps on main
  { seed: '2426652846' },
]
const STEP = 0.5, DS = 0.1, LAT0 = 33, LAT1 = 39
let fail = 0
const ok = (c, msg) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${msg}`); if (!c) fail++ }

// Point + unit normal at arc s along a run's polyline (polyCum space, the junction arcs' space).
function pose (e, s) {
  const P = e.points, C = e.polyCum
  let i = 1; while (i < P.length - 1 && C[i] < s) i++
  const a = P[i - 1], b = P[i], L = C[i] - C[i - 1] || 1, t = Math.min(1, Math.max(0, (s - C[i - 1]) / L))
  const tx = (b.x - a.x) / L, tz = (b.z - a.z) / L
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, nx: -tz, nz: tx }
}

for (const site of SITES) {
  const t0 = Date.now(), W = buildWorld(site.seed), { terr, road } = rig(W.seed, W.road)
  const h = terr.analyticHeight, raw = terr.rawHeightWorld
  // The pre-fix carve on this instance only: the toe cap no longer reads the footprint (_carveCrossSection reads
  // _resolveFootHW for nothing else).
  const carve = road._carveCrossSection
  const lifted = (f) => {
    road._carveCrossSection = function (...a) { this._resolveFootHW = () => Infinity; try { return carve.apply(this, a) } finally { delete this._resolveFootHW } }
    try { return f() } finally { delete road._carveCrossSection }
  }
  // Worst step on a transect that sits at a bank END: the carved side of the jump resolves ≥ 34 m off its run, i.e.
  // the footprint cut the bank off (steps from other sources — a switchback flip, a bore — are not this gate's).
  const scan = (at) => {
    let prev = h(...at(LAT0)), worst = null
    for (let d = LAT0 + DS; d <= LAT1 + 1e-9; d += DS) {
      const cur = h(...at(d)), j = Math.abs(cur - prev)
      if (j > STEP && !(worst?.jump >= j)) {
        const a = at(d - DS), b = at(d), q = Math.abs(prev - raw(...a)) > Math.abs(cur - raw(...b)) ? a : b
        const nr = road._resolveRoadSurface(q[0], q[1]), lat = nr ? Math.hypot(q[0] - nr.point.x, q[1] - nr.point.z) : 0
        if (lat >= 34) worst = { jump: j, x: b[0], z: b[1], lat }
      }
      prev = cur
    }
    return worst
  }
  road._detectNodeJunctions()
  const R = road._params.roadJunctionCarveRadius ?? 7
  const tally = () => ({ worst: { jump: 0 }, cliffs: new Set(), m: 0 })
  const now = tally(), pre = tally()
  let legs = 0, deck = 0, siteWorstPre = 0
  for (const [key, arcs] of road._junctionCarveArcs) {
    const e = road._network.get(key); if (!e?.points || e.points.length < 2) continue
    const L = e.polyCum[e.polyCum.length - 1]
    for (const jc of arcs) {
      const n = pose(e, jc.arc); if (Math.hypot(n.x - W.C.x, n.z - W.C.z) > REGION_RADIUS_M) continue
      legs++
      for (let s = Math.max(0, jc.arc - R); s <= Math.min(L, jc.arc + R); s += 0.5) {
        const q = pose(e, s)
        for (const side of [-1, 1]) {
          const at = (d) => [q.x + side * d * q.nx, q.z + side * d * q.nz]
          for (const [t, st] of [[now, scan(at)], [pre, lifted(() => scan(at))]]) {
            if (!st) continue
            t.cliffs.add(`${key}|${jc.arc}|${side}`); t.m += 0.5
            if (st.jump > t.worst.jump) t.worst = st
            if (t === pre && site.x !== undefined && Math.hypot(st.x - site.x, st.z - site.z) < 30) siteWorstPre = Math.max(siteWorstPre, st.jump)
          }
        }
        for (const d of [-4, 0, 4]) {
          const x = q.x + d * q.nx, z = q.z + d * q.nz
          deck = Math.max(deck, Math.abs(h(x, z) - lifted(() => h(x, z))))
        }
      }
    }
  }
  const f = (t) => `${t.cliffs.size} cliffs, ${t.m.toFixed(1)} m of step, worst ${t.worst.jump.toFixed(2)} m` +
    (t.worst.x !== undefined ? ` at (${t.worst.x.toFixed(0)}, ${t.worst.z.toFixed(0)}), ${t.worst.lat.toFixed(1)} m off its run` : '')
  console.log(`seed ${site.seed}: ${legs} junction legs, built + scanned ${((Date.now() - t0) / 1000).toFixed(0)} s; pre-fix carve: ${f(pre)}`)
  ok(now.cliffs.size === 0, `bank-end steps > ${STEP} m: ${f(now)}`)
  ok(deck < 5e-4, `road deck vs the pre-fix carve: ${deck.toFixed(3)} m (0.000)`)
  if (site.x !== undefined) ok(siteWorstPre > 2, `pre-fix carve at the owner's site (${site.x}, ${site.z}): ${siteWorstPre.toFixed(2)} m (the transects see the old cliff, > 2 m)`)
}
console.log(fail ? `FAIL: ${fail}` : 'PASS')
process.exit(fail ? 1 : 0)
