// GATE (BUG-138): a tunnel's portal never stands inside another bore.
//
// Two legs of one T that both dive into the hill ~10 m out run their bores 11 m apart there, so the 10.6 m masonry
// collar of one (road-mesh.js buildPortalRing) stood inside the other's bore: a stone block 0.9–2.2 m off the
// centreline, 1–4 m before the other's portal (seed 717319401, a 10.4 m/s jolt in the drive soak), and the other's
// upper arch 6 m up inside the first. The collar is now clipped by the sibling-tube test the tube itself uses.
//
// Every true portal ring on the seed, built as the road tile builds it, is tested against every other run's bore
// DRIVING ENVELOPE (inside R − 0.25 m, above its floor) at each triangle's corners, edge midpoints and centroid.
// Main before BUG-138: 2 of 22 rings on this seed (both at that T, each in the other's bore); a 10-seed census found
// no others (234 rings).
//
// BUG-147, the same class from the other side: a leg that leaves an UNDERGROUND junction (a T promoted into its
// trunk's bore) in the open ran into the trunk's closed lining — seed 4076238903's side road at (1734, −1393), a
// 25.0 m trench (right at cutMax, so classed CUT), walled 10–13 m in by both trunk tubes, drawn and collider. At every
// node of degree ≥ 3, each leg's lane (lat −4/0/+4, 1 m over its deck, 1–30 m out) where it is NOT in its own bore
// is tested against the other legs' driving envelopes. Main before: 1 node on that seed; 0 on 8 random seeds.
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RoadMeshSystem } from '../src/road-mesh.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { wirePondNoGo } from './lib/pond-no-go.mjs'

const SEEDS = ['717319401', '4076238903']
const R = P.tunnelBoreRadius ?? 8, ENV = R - 0.25
let rings = 0, fails = 0, lanes = 0, laneFails = 0
for (const S of SEEDS) {
  const ws = parseWorldSeed(S), road = new RoadSystem(ws, P)
  wirePondNoGo(road, ws, P); road.setRadius(1300); road.update(new THREE.Vector3(0, 0, 0))
  const rm = new RoadMeshSystem({ add () {}, remove () {} }, road, null, P, S)
  const bores = []
  for (const [k, e] of road._network) for (const sp of e.tunnelSpans ?? []) bores.push({ k, e, sp })
  const RP = {}
  // `strict`: the point's perpendicular foot must lie inside the span — so a point in front of a mouth is not "in"
  // the bore (the rings keep the plain nearest-point test; a lane runs up to a portal by design)
  const inBore = (b, x, y, z, strict = false) => {
    const pts = b.e.points, cum = b.e.polyCum
    let best = Infinity, bs = 0
    for (let i = 1; i < pts.length; i++) {
      if (cum[i] < b.sp.s0 || cum[i - 1] > b.sp.s1) continue
      const ax = pts[i - 1].x, az = pts[i - 1].z, dx = pts[i].x - ax, dz = pts[i].z - az, L2 = dx * dx + dz * dz
      const t0 = L2 > 0 ? ((x - ax) * dx + (z - az) * dz) / L2 : 0
      if (strict && (t0 < 0 || t0 > 1)) continue
      const t = Math.max(0, Math.min(1, t0))
      const s = cum[i - 1] + (cum[i] - cum[i - 1]) * t
      if (s < b.sp.s0 || s > b.sp.s1) continue
      const d2 = (x - ax - dx * t) ** 2 + (z - az - dz * t) ** 2
      if (d2 < best) { best = d2; bs = s }
    }
    if (best >= ENV * ENV) return false
    const h = y - road.runProfile(bs, b.k, RP).gradeY
    return h > 0.05 && best + h * h < ENV * ENV
  }
  for (const own of bores) for (const [pArc, sign] of [[own.sp.s0, -1], [own.sp.s1, +1]]) {
    const geo = rm.buildPortalRing(own.k, pArc, sign, P)
    if (!geo) continue
    rings++
    const c = road.runPointAt(own.k, pArc)
    const near = bores.filter(b => b.k !== own.k && b.e.points.some(q => Math.hypot(q.x - c.x, q.z - c.z) < 40))
    const pos = geo.attributes.position.array, ix = geo.index.array
    let hit = null
    for (let t = 0; t < ix.length && !hit; t += 3) {
      const v = [0, 1, 2].map(j => [pos[3 * ix[t + j]], pos[3 * ix[t + j] + 1], pos[3 * ix[t + j] + 2]])
      const samples = [...v, ...[[0, 1], [1, 2], [2, 0]].map(([p, q]) => v[p].map((u, j) => (u + v[q][j]) / 2)), v[0].map((u, j) => (u + v[1][j] + v[2][j]) / 3)]
      for (const [x, y, z] of samples) for (const b of near) if (inBore(b, x, y, z)) { hit = { b, x, y, z }; break }
    }
    if (hit) { fails++; console.log(`  FAIL ${S} ${own.k}'s portal at arcS ${pArc.toFixed(1)} stands in ${hit.b.k}'s bore at (${hit.x.toFixed(1)}, ${hit.y.toFixed(1)}, ${hit.z.toFixed(1)})`) }
  }
  // BUG-147: open lanes at a node inside a sibling's bore
  const byNode = new Map()
  for (const [k, e] of road._network) for (const [c, atStart] of [[e.cellA, true], [e.cellB, false]]) {
    if (!c || !e.points?.length) continue
    const n = c.join(','); if (!byNode.has(n)) byNode.set(n, [])
    byNode.get(n).push({ k, e, atStart })
  }
  for (const [n, legs] of byNode) {
    if (legs.length < 3) continue
    const sib = bores.filter(b => legs.some(l => l.k === b.k))
    if (!sib.length) continue
    for (const l of legs) {
      lanes++
      const L = l.e.polyCum[l.e.polyCum.length - 1]
      let hit = null
      for (let d = 1; d <= 30 && !hit; d++) {
        const s = l.atStart ? d : L - d
        if (s < 0 || s > L || road.tunnelSpanAt(l.k, s)) continue
        const p = road.runPointAt(l.k, s), g = road.runProfile(s, l.k, RP), y = g.gradeY + 1
        for (const off of [-4, 0, 4]) for (const b of sib) if (b.k !== l.k && inBore(b, p.x + g.tz * off, y, p.z - g.tx * off, true)) { hit = { b, d }; break }
      }
      if (hit) { laneFails++; console.log(`  FAIL ${S} node ${n}: ${l.k}'s open lane runs inside ${hit.b.k}'s bore ${hit.d} m out`) }
    }
  }
}
console.log(`${rings} portal rings on ${SEEDS.join(', ')}: ${fails} stand inside another bore`)
console.log(`${lanes} legs at bored junctions: ${laneFails} run in the open inside a sibling's bore`)
fails += laneFails
console.log(fails ? `FAIL: ${fails}` : 'PASS — no portal stands inside another bore, and no open lane runs inside one')
process.exit(fails ? 1 : 0)
