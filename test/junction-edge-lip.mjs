// GATE (BUG-122/123): the asphalt edge at a junction stands the designed kerb above the dirt beside it, and the dirt
// never pokes up through a junction pad.
//
// On random seeds (pond no-go wired), every ringed junction's legs are walked 2–30 m out from the node, both edges:
// the LIP is physics 5 cm inside the asphalt edge minus 5 cm outside (the edge a wheel climbs back over). Main before
// BUG-122 stood 0.30 m on most pad rims and dragged that up to 22 m along the approaches (a 75 kN strut spike at
// 15 m/s); BUG-123 then took the last 0.25–0.40 m edges, where the pad's and the leg's tops differ. GATING: no edge
// over LIP_MAX. And POKE: the terrain mesh's dirt (rebuilt as terrain.js _buildCarveTable does, on the 1 m grid,
// worst triangle split) at points up to 1.5 m inside every ring stays under the pad top. Reported: the worst lip and
// the tightest pad margin.
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { wirePondNoGo } from './lib/pond-no-go.mjs'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'

const SEEDS = ['1353361482', '369055107']   // random seeds (BUG-122's census)
const R = 1000, LIP_MAX = 0.25, hw = P.roadHalfWidth ?? 5
let fails = 0, edges = 0, worstLip = 0, worstLipAt = '', rimPts = 0, margin = Infinity
for (const S of SEEDS) {
  const ws = parseWorldSeed(S), road = new RoadSystem(ws, P)
  wirePondNoGo(road, ws, P); road.setRadius(R + 300); road.update(new THREE.Vector3(0, 0, 0))
  const terrain = makeTerrainHeadless(ws, P, road)
  road._detectNodeJunctions()
  const ph = (x, z) => road._sampleCarveWorld(x, z, terrain.rawHeightWorld(x, z), undefined, undefined)?.gradeY
  const memo = new Map()
  const meshDirt = (x, z) => {
    const key = x * 100000 + z; if (memo.has(key)) return memo.get(key)
    const raw = terrain.rawHeightWorld(x, z), nr = road._resolveRoadSurface(x, z)
    let cs = null, dRib = Infinity
    if (nr) {
      const dx = x - nr.point.x, dz = z - nr.point.z, arc = (nr.arcS ?? 0) + dx * nr.tangent.x + dz * nr.tangent.z, sl = dx * nr.tangent.z - dz * nr.tangent.x
      cs = road._carveCrossSectionBlended(nr, sl, arc, raw, undefined, x, z)
      dRib = road._ribbonEdgeDist?.(nr.runKey ?? '', arc, Math.abs(sl)) ?? Infinity
    }
    const co = road._connectorCarve(x, z, raw)
    if (co) cs = { blendW: Math.max(cs ? cs.blendW : 0, co.blendW), gradeY: cs ? co.gradeY * co.dom + cs.gradeY * (1 - co.dom) : co.gradeY }
    const m = road._mergeCarve(cs, road._junctionPadCarve(x, z, raw), undefined, dRib)
    const v = m ? raw + m.blendW * (m.gradeY - raw) : raw
    memo.set(key, v); return v
  }
  for (const node of road._nodeJunctions.values()) {
    if (!node.ring || Math.hypot(node.pos.x, node.pos.z) > R) continue
    // LIP: each leg ending at this node, both edges
    for (const [k, e] of road._network) {
      if (k.endsWith('~p') || !e.points?.length) continue
      const d0 = Math.hypot(e.points[0].x - node.pos.x, e.points[0].z - node.pos.z), d1 = Math.hypot(e.points.at(-1).x - node.pos.x, e.points.at(-1).z - node.pos.z)
      if (Math.min(d0, d1) > 4 || e.polyCum.at(-1) < 40) continue
      const fromStart = d0 <= d1, L = e.polyCum.at(-1)
      for (const side of [1, -1]) {
        edges++
        let edgeMax = 0, at = ''
        for (let s = 2; s <= 30; s += 1) {
          const a = fromStart ? s : L - s, p = road.runPointAt(k, a), q = road.runPointAt(k, a + (fromStart ? 0.5 : -0.5))
          let tx = q.x - p.x, tz = q.z - p.z; const l = Math.hypot(tx, tz); tx /= l; tz /= l
          const i1 = ph(p.x + side * tz * (hw - 0.05), p.z - side * tx * (hw - 0.05)), o1 = ph(p.x + side * tz * (hw + 0.05), p.z - side * tx * (hw + 0.05))
          if (i1 == null || o1 == null) continue
          if (i1 - o1 > edgeMax) { edgeMax = i1 - o1; at = `${S} ${k} side ${side} s ${s}` }
        }
        if (edgeMax > worstLip) { worstLip = edgeMax; worstLipAt = at }
        if (edgeMax > LIP_MAX) { fails++; if (fails <= 5) console.log(`  FAIL lip ${edgeMax.toFixed(3)} m at ${at}`) }
      }
    }
    // POKE: just inside the ring
    const ring = node.ring
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], L = Math.hypot(b.x - a.x, b.z - a.z)
      for (let t = 0; t < L; t += 1) {
        const ex = a.x + (b.x - a.x) * t / L, ez = a.z + (b.z - a.z) * t / L
        for (const off of [0.2, 0.6, 1.2]) {
          const dx = node.pos.x - ex, dz = node.pos.z - ez, d = Math.hypot(dx, dz) || 1, x = ex + dx / d * off, z = ez + dz / d * off
          if (road._signedRingDist(ring, x, z) >= 0) continue
          const top = road._nodeSurfaceTop(node, x, z); if (top == null || !isFinite(top)) continue
          const x0 = Math.floor(x), z0 = Math.floor(z), fx = x - x0, fz = z - z0
          const h00 = meshDirt(x0, z0), h10 = meshDirt(x0 + 1, z0), h01 = meshDirt(x0, z0 + 1), h11 = meshDirt(x0 + 1, z0 + 1)
          const s1 = fx + fz <= 1 ? h00 + (h10 - h00) * fx + (h01 - h00) * fz : h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz)
          const s2 = fx >= fz ? h00 + (h10 - h00) * fx + (h11 - h10) * fz : h00 + (h01 - h00) * fz + (h11 - h01) * fx
          const over = Math.max(s1, s2) - top
          rimPts++; margin = Math.min(margin, -over)
          if (over > 0) { fails++; if (fails <= 5) console.log(`  FAIL dirt ${over.toFixed(3)} m above the pad at ${S} (${x.toFixed(1)}, ${z.toFixed(1)})`) }
        }
      }
    }
  }
}
console.log(`${edges} junction leg edges: worst lip ${worstLip.toFixed(3)} m (${worstLipAt}) · ${rimPts} rim points: tightest pad margin ${(margin * 100).toFixed(1)} cm`)
console.log(fails ? `FAIL: ${fails}` : 'PASS')
process.exit(fails ? 1 : 0)
