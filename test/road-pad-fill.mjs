// GATE (run-all): node test/road-pad-fill.mjs   [--verbose]
//
// BUG-82 — JUNCTION PADS ARE WELL-SHAPED, WATERTIGHT AND SKIRTED.
//
// The pad fill used to ear-clip the ring: every triangle spanned the pad, red-green halving kept them
// slivers (aspect p95 131, max 444), and computeVertexNormals averaged across the slivers into 11°
// shading streaks — the owner's "wrinkles" (capture bug-82-seed244091065-pad-wrinkles.json). The fill
// is now padFillDelaunay (road-carve.js): even outline + hex lattice, Delaunay-connected. Over every
// ≥3-leg pad in the battery windows this asserts, on the ACTUAL mesh buildJunctionFootprint returns:
//
//   shape     triangle aspect (longest edge² ÷ area; equilateral 2.3): p95 ≤ 6, max ≤ 40. The max is
//             ring-forced, not fill-made: the ring builder emits 0.07–0.13 m stubs beside mouth corners
//             and the fill keeps every ring point (the mouth corners weld to the ribbon end), so a thin
//             triangle sits on each stub. They are tiny, and computeVertexNormals is area-weighted, so
//             they carry no shading. The old ear-clip fill ran p95 398, max 141 343.
//   coverage  top area == ring area (no hole, no overlap, nothing paved outside), every top tri up
//   chord     field minus the flat triangle, ≤ CHORD_MAX wherever the field itself is smooth: |y''| <
//             0.1 /m on a ±0.5 m stencil at the corners, edge mids and centroid, so a kink anywhere in
//             the triangle is seen. The field's own creases (where the solved pad eases onto the leg
//             fields, e.g. a 21 cm ridge at seed 3 (-1327, -1002)) are out of scope: no mesh follows a kink.
//   skirt     every wall faces outward, every pad and deg-2 connector has one, none sits on a mouth
//   weld      (ribbon-pad weld) every pad vertex on a WELDED leg's mouth chord (road.js leg.weld) is
//             also a vertex of the real ribbon tiles, to the bit — same x, y, z — so the ribbon ends on
//             the pad's mouth edge and the two meshes share it. Ribbon tiles are built with
//             _buildRoadTile, exactly as the game builds them.
//
// Reported, not asserted: Delaunay fallbacks (earClip path), shading-normal error off-crease, ms/pad
// (wall-clock asserts are flaky — CLAUDE.md).

import { RANGER_PARAMS as P } from '../data/ranger.js'
import { WINDOWS, buildWindow } from './lib/road-battery.mjs'
import { RoadMeshSystem } from '../src/road-mesh.js'
import { padFillDelaunay } from '../src/road-carve.js'
import { parseWorldSeed } from '../src/seed.js'
import { CHUNK_SIZE } from '../src/terrain.js'

const VERBOSE = process.argv.includes('--verbose')
const ASPECT_P95 = 6, ASPECT_MAX = 40, CHORD_MAX = 0.06, CREASE = 0.1

const inTri = (px, pz, ax, az, bx, bz, cx, cz) => {
  const d1 = (px - bx) * (az - bz) - (ax - bx) * (pz - bz)
  const d2 = (px - cx) * (bz - cz) - (bx - cx) * (pz - cz)
  const d3 = (px - ax) * (cz - az) - (cx - ax) * (pz - az)
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
}
const q = (a, f) => a[Math.min(a.length - 1, Math.floor(f * a.length))]

let pads = 0, deg2 = 0, fallbacks = 0, ms = 0
const aspects = [], normDev = [], fails = []
let worstChord = 0, worstChordAt = ''
let mouthWalls = 0, flipped = 0, noSkirt = 0
let weldVerts = 0, weldMiss = 0, weldLegs = 0, legsTotal = 0

for (const W of WINDOWS.filter((w) => /^seed[367] origin$/.test(w.name))) {
  const road = buildWindow(W, P)
  const ribbons = []
  const mesh = new RoadMeshSystem({ add(o) { if (o.material === mesh._material) ribbons.push(o.geometry) } }, road, null, P, parseWorldSeed(W.seed))
  // Bore + portal materials build canvas textures (browser-only); geometry is all this gate reads.
  mesh._getTunnelMaterial = mesh._getPortalMaterial = () => null
  // Real ribbon tiles round every pad, indexed by exact vertex position (Float32, as drawn).
  const tiles = new Set()
  for (const node of road._detectNodeJunctions().values()) {
    if (node.deg2 || !node.ring) continue
    const R = (node.ringMaxR ?? 15) + 15
    for (let tx = Math.floor((node.pos.x - R) / CHUNK_SIZE); tx <= Math.floor((node.pos.x + R) / CHUNK_SIZE); tx++)
      for (let tz = Math.floor((node.pos.z - R) / CHUNK_SIZE); tz <= Math.floor((node.pos.z + R) / CHUNK_SIZE); tz++) tiles.add(`${tx},${tz}`)
  }
  for (const key of tiles) { const [tx, tz] = key.split(',').map(Number); mesh._buildRoadTile(tx, tz, key) }
  const ribbonY = new Map()
  for (const g of ribbons) {
    const p = g.attributes.position.array
    for (let v = 0; v < p.length; v += 3) { const k = `${p[v]},${p[v + 2]}`; const a = ribbonY.get(k); if (a) a.push(p[v + 1]); else ribbonY.set(k, [p[v + 1]]) }
  }
  for (const node of road._detectNodeJunctions().values()) {
    const t0 = performance.now()
    const geo = mesh.buildJunctionFootprint(node, P)
    const dt = performance.now() - t0
    if (!geo) continue
    const isPad = !node.deg2 && node.legs.length >= 3 && node.ring
    const at = `${W.name} (${node.pos.x.toFixed(0)},${node.pos.z.toFixed(0)})`
    const pos = geo.attributes.position.array, idx = geo.index.array, nrm = geo.attributes.normal.array

    // Split top (up-facing asphalt) from skirt walls.
    const top = [], wall = []
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2]
      const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2]
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, L = Math.hypot(nx, ny, nz)
      if (ny / L > 0.35) top.push(t)
      else if ([[a, b], [b, c], [c, a]].some(([p, r]) => pos[p] === pos[r] && pos[p + 2] === pos[r + 2])) wall.push([t, nx / L, nz / L])
    }

    // Skirt (pads AND deg-2 connectors).
    if (!wall.length) { noSkirt++; fails.push(`${at} has no skirt`) }
    const inside = (x, z) => top.some((t) => { const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3
      return inTri(x, z, pos[a], pos[a + 2], pos[b], pos[b + 2], pos[c], pos[c + 2]) })
    const m = node.deg2 ? null : road._junctionMouths(node)
    for (const [t, nx, nz] of wall) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3
      const mx = (pos[a] + pos[b] + pos[c]) / 3, mz = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3
      // On a mouth = the wall runs ALONG the chord (centroid on its line, inside its ends). A wall on a
      // short ring stub leaving a mouth corner touches the chord's end and is not one.
      if (m && m.legs.some((l) => { const ux = mx - l.cx, uz = mz - l.cz
        return Math.abs(ux * l.dx + uz * l.dz) < 0.05 && Math.abs(ux * l.dz - uz * l.dx) < m.halfWidth - 0.05 })) mouthWalls++
      if (inside(mx + nx * 0.2, mz + nz * 0.2) && !inside(mx - nx * 0.2, mz - nz * 0.2)) flipped++
    }
    if (!isPad) { deg2++; continue }

    pads++; ms += dt
    const ring = node.ring, n = ring.length
    // Same outline rule as RoadMeshSystem._buildPadGeometry (PAD_FILL_SPACING 1.5, CROSS_SEGS 8 per mouth).
    const mouthOf = (p) => m.legs.findIndex((l) => { const ux = p.x - l.cx, uz = p.z - l.cz
      return Math.abs(ux * l.dx + uz * l.dz) < 0.05 && Math.abs(ux * l.dz - uz * l.dx) <= m.halfWidth + 0.05 })
    const mouthEdge = (i) => { const k = mouthOf(ring[i]); return k >= 0 && k === mouthOf(ring[(i + 1) % n]) }
    if (!padFillDelaunay(ring, 1.5, (i, L) => mouthEdge(i) ? 8 : Math.ceil(L / 1.5))) {
      fallbacks++; if (VERBOSE) console.log(`  fallback ${at}`)
    }

    // Weld: every top vert on a welded leg's mouth chord is a ribbon vertex, bit for bit.
    const welded = m.legs.map((l) => { const g = node.legs.find((a) => a.runKey === l.runKey && (a.arc < 1e-6 ? 1 : -1) === l.s); return !!(g && g.weld) })
    legsTotal += m.legs.length; weldLegs += welded.filter(Boolean).length
    const topV = new Set(); for (const t of top) for (let e = 0; e < 3; e++) topV.add(idx[t + e])
    for (const v of topV) {
      const k = mouthOf({ x: pos[v * 3], z: pos[v * 3 + 2] })
      if (k < 0 || !welded[k]) continue
      weldVerts++
      const ys = ribbonY.get(`${pos[v * 3]},${pos[v * 3 + 2]}`)
      if (!ys || !ys.includes(pos[v * 3 + 1])) { weldMiss++; if (VERBOSE) console.log(`  weld miss ${at} (${pos[v * 3].toFixed(2)},${pos[v * 3 + 2].toFixed(2)}) ${ys ? 'y off by ' + Math.min(...ys.map((y) => Math.abs(y - pos[v * 3 + 1]))).toFixed(4) : 'no ribbon vertex'}`) }
    }

    // Coverage: top XZ area == ring area, every top tri up-facing (signed XZ area < 0).
    let ringA = 0
    for (let i = 0; i < n; i++) { const a = ring[i], b = ring[(i + 1) % n]; ringA += a.x * b.z - b.x * a.z }
    ringA = Math.abs(ringA) / 2
    let topA = 0, down = 0
    const F = (x, z) => road._nodeSurfaceTop(node, x, z)
    const curv = (x, z) => { const h = 0.5, f0 = F(x, z)
      return Math.max(Math.abs((F(x + h, z) - 2 * f0 + F(x - h, z)) / (h * h)), Math.abs((F(x, z + h) - 2 * f0 + F(x, z - h)) / (h * h)),
        Math.abs((F(x + h, z + h) - F(x + h, z - h) - F(x - h, z + h) + F(x - h, z - h)) / (4 * h * h))) }
    let padAspMax = 0
    const creaseV = new Set()                             // vertices touching a creased triangle
    for (const t of top) {
      const p = [0, 1, 2].map((e) => idx[t + e] * 3)
      const s2 = (pos[p[1]] - pos[p[0]]) * (pos[p[2] + 2] - pos[p[0] + 2]) - (pos[p[2]] - pos[p[0]]) * (pos[p[1] + 2] - pos[p[0] + 2])
      if (s2 >= 0) down++
      const area = Math.abs(s2) / 2
      topA += area
      const L2 = Math.max(...[0, 1, 2].map((i) => (pos[p[i]] - pos[p[(i + 1) % 3]]) ** 2 + (pos[p[i] + 2] - pos[p[(i + 1) % 3] + 2]) ** 2))
      const asp = L2 / (area + 1e-9)
      aspects.push(asp); padAspMax = Math.max(padAspMax, asp)
      // Chord at centroid + edge mids, only where the field is smooth over the whole triangle.
      const W7 = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1 / 3, 1 / 3, 1 / 3], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5]]
      if (W7.some((w) => curv(w[0] * pos[p[0]] + w[1] * pos[p[1]] + w[2] * pos[p[2]],
        w[0] * pos[p[0] + 2] + w[1] * pos[p[1] + 2] + w[2] * pos[p[2] + 2]) >= CREASE)) { for (const v of p) creaseV.add(v / 3); continue }
      for (const w of W7.slice(3)) {
        const x = w[0] * pos[p[0]] + w[1] * pos[p[1]] + w[2] * pos[p[2]]
        const y = w[0] * pos[p[0] + 1] + w[1] * pos[p[1] + 1] + w[2] * pos[p[2] + 1]
        const z = w[0] * pos[p[0] + 2] + w[1] * pos[p[1] + 2] + w[2] * pos[p[2] + 2]
        const e = Math.abs(F(x, z) + (P.roadJunctionApronLift ?? 0) - y)
        if (e > worstChord) { worstChord = e; worstChordAt = `${at} at (${x.toFixed(1)},${z.toFixed(1)})` }
      }
    }
    if (padAspMax > ASPECT_MAX) fails.push(`${at} aspect max ${padAspMax.toFixed(0)}`)
    if (down) fails.push(`${at} ${down} top tri(s) face down`)
    if (Math.abs(topA - ringA) > 1e-3 * ringA) fails.push(`${at} top area ${topA.toFixed(1)} m² vs ring ${ringA.toFixed(1)} m²`)

    // Shading-normal error at interior, off-crease vertices (report only).
    const edge = new Set()
    for (const [t] of wall) for (let e = 0; e < 3; e++) edge.add(idx[t + e])
    for (let v = 0; v < pos.length / 3; v++) {
      if (edge.has(v) || creaseV.has(v) || nrm[v * 3 + 1] < 0.5) continue
      const x = pos[v * 3], z = pos[v * 3 + 2]
      const e = 0.25, gx = (F(x + e, z) - F(x - e, z)) / (2 * e), gz = (F(x, z + e) - F(x, z - e)) / (2 * e)
      const L = Math.hypot(gx, 1, gz)
      normDev.push(Math.acos(Math.min(1, (-gx * nrm[v * 3] + nrm[v * 3 + 1] - gz * nrm[v * 3 + 2]) / L)) * 180 / Math.PI)
    }
  }
}

aspects.sort((a, b) => a - b); normDev.sort((a, b) => a - b)
console.log(`road-pad-fill: ${pads} pads · ${deg2} deg-2 connectors · ${fallbacks} Delaunay fallback(s) · ${(ms / pads).toFixed(2)} ms/pad cold (report only; warm cost: test/_padperf.mjs)`)
console.log(`  aspect p50/p95/max   ${q(aspects, 0.5).toFixed(1)} / ${q(aspects, 0.95).toFixed(1)} / ${aspects[aspects.length - 1].toFixed(1)}   (limit p95 ${ASPECT_P95}, max ${ASPECT_MAX})`)
console.log(`  chord off-crease     ${(worstChord * 100).toFixed(1)} cm   (limit ${CHORD_MAX * 100} cm)  ${worstChordAt}`)
console.log(`  normal err off-crease p50/p95/max ${q(normDev, 0.5).toFixed(2)}° / ${q(normDev, 0.95).toFixed(2)}° / ${normDev[normDev.length - 1].toFixed(2)}° (report only)`)
console.log(`  skirt: ${flipped} flipped wall(s) · ${noSkirt} without a skirt · ${mouthWalls} on a mouth`)
console.log(`  weld: ${weldLegs} of ${legsTotal} legs welded · ${weldVerts} shared mouth verts · ${weldMiss} not on the ribbon`)
if (weldMiss) fails.push(`${weldMiss} welded mouth vert(s) are not ribbon vertices — a seam the eye can see through`)
if (q(aspects, 0.95) > ASPECT_P95) fails.push(`aspect p95 ${q(aspects, 0.95).toFixed(1)} > ${ASPECT_P95}`)
if (worstChord > CHORD_MAX) fails.push(`chord ${(worstChord * 100).toFixed(1)} cm > ${CHORD_MAX * 100} cm — ${worstChordAt}`)
if (flipped) fails.push(`${flipped} skirt wall(s) face inward`)
if (mouthWalls) fails.push(`${mouthWalls} skirt wall(s) on a leg mouth`)
for (const f of fails.slice(0, VERBOSE ? fails.length : 10)) console.log(`  FAIL ${f}`)
if (fails.length) { console.log(`FAIL — ${fails.length} problem(s)`); process.exit(1) }
console.log('PASS')
