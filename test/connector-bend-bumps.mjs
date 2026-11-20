// GATE (BUG-236): a degree-2 CONNECTOR bend is one road through the node — no hump, dip or crease where two runs meet.
//
// The 60-seed census (wip/bug-236/census2.mjs) found 82 of 203 connector bends with a wheel-track bump over 15 cm
// against an 8 m straightedge, in four classes, one or more sites each here plus the owner's capture:
//   1. different banks at the node: BUG-90 ran one leg's bank off, the other kept the shared start bank (the capture,
//      seed 1225608752 (−765.9, 222.7): +28 cm hump, −32 cm dip, a crease) — the node now decides for both legs;
//   2. the node a sag or crest the profile never smoothed: two separately solved runs meet with a grade break (worst
//      2973054976 (956.3, −66.4), 55 cm) — now one parabolic vertical curve centred on the node;
//   3. the connector blending two runs' EXTENDED grades (worst 4082309632 (255.5, −692.1), 34 cm) and
//   4. their extended cross-sections (worst 3138363520 (874.2, −108.8), 38 cm) — the core now has its own deck: height a
//      cubic in arc length (C1 to each run at its mouth), the crown about its centre line, a bank run linearly between.
// Checks per site:
//   banks  the legs' banks at the node agree (away frame, a continuous bank reads a and −a): |aA + aB| < 0.5°;
//   bump   the tire deck (terrain analyticHeight, potholes off) along the core at the wheel tracks (±1.785 m), worst
//          deviation from an 8 m straightedge ≤ the site's bar (main is over it at every site);
//   joint  the legs meet at the node on one height and one grade: |Δy| < 2 mm, |Δgrade| < 1 %;
//   field  the core's design surface is continuous: max |2nd difference| at 0.1 m over |lat| ≤ 4.7 m < 1.5 cm (a frame
//          that tears across a chord bisector or at a mouth reads its step here);
//   grade  DEC-409: within 90 m of the node the built grade never exceeds max(24 %, the run's own solved grade there) + 0.5 %;
//   ribbon the drawn ribbon (leg sections + connector strip) within 40 m of the node vs physics: < 2 cm.
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RoadMeshSystem } from '../src/road-mesh.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { wirePondNoGo } from './lib/pond-no-go.mjs'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { CHUNK_SIZE } from '../src/terrain.js'

// seed, node x, z, class, wheel-track bar (m), main's bump (m, for the report)
const SITES = [
  ['1225608752', -765.9, 222.7, 'capture', 0.06, 0.282],
  ['3872516096', 915.0, 157.7, 'class 1', 0.06, 0.163],
  ['2215738496', -756.9, -500.2, 'class 1', 0.09, 0.296],
  ['2619533952', -735.0, 440.2, 'class 1', 0.07, 0.217],
  ['2973054976', 956.3, -66.4, 'class 2', 0.10, 0.552],
  ['4082309632', 255.5, -692.1, 'class 3', 0.10, 0.335],
  ['3138363520', 874.2, -108.8, 'class 4', 0.10, 0.376],
]
const MAX_MIS = 0.5, MAX_DY = 0.002, MAX_DG = 0.01, MAX_D2 = 0.015, MAX_MP = 0.02, NEAR = 40, D = 180 / Math.PI
const P = { ...RANGER_PARAMS, potholeEnabled: false }, hw = P.roadHalfWidth ?? 5, W = P.roadWidth ?? 10
let fails = 0
const worldOf = new Map()
const build = (S) => {
  if (worldOf.has(S)) return worldOf.get(S)
  const ws = parseWorldSeed(S), road = new RoadSystem(ws, P)
  const water = wirePondNoGo(road, ws, P); road.setRadius(1300); road.update(new THREE.Vector3(0, 0, 0))
  const T = makeTerrainHeadless(ws, P, road, { sampleAt: (x, z, s, raw) => water.streamCarveSample(x, z, s, raw) })
  const w = { ws, road, T, nodes: road._detectNodeJunctions() }
  worldOf.clear(); worldOf.set(S, w)
  return w
}
for (const [S, X, Z, CLS, BAR, MAIN] of SITES) {
  const { ws, road, T, nodes } = build(S)
  let nd = null
  for (const [, v] of nodes) if (v.deg2 && v.legs.length === 2 && Math.hypot(v.pos.x - X, v.pos.z - Z) < 0.5) nd = v
  const tag = `${CLS} ${S} (${X}, ${Z})`
  if (!nd) { console.log(`  ${tag}: connector node not found`); fails++; continue }
  // banks + joint: each leg in its away-from-node frame
  const leg = nd.legs.map((l) => {
    const e = road._network.get(l.runKey), L = e.polyCum.at(-1), st = l.arc < 1e-6, a0 = -(e.arcOrigin ?? 0)
    const prof = (d) => road.runProfile(a0 + (st ? d : L - d), l.runKey).gradeY
    return { e, L, st, prof, bank: (st ? 1 : -1) * road.camberProfile(st ? 0 : L, l.runKey) * D }
  })
  const mis = Math.abs(leg[0].bank + leg[1].bank)
  const dy = Math.abs(leg[0].prof(0) - leg[1].prof(0))
  const dg = Math.abs((leg[0].prof(0.5) - leg[0].prof(0)) / 0.5 + (leg[1].prof(0.5) - leg[1].prof(0)) / 0.5)
  // grade (DEC-409): built vs solved (the routed points) over node → 90 m, 1 m stations
  let gOver = 0
  for (const g of leg) {
    const P0 = g.e.points, cum = g.e.polyCum
    const solvedAt = (d) => { const s = g.st ? d : g.L - d; let i = 0; while (i < cum.length - 2 && cum[i + 1] < s) i++
      const t = (s - cum[i]) / ((cum[i + 1] - cum[i]) || 1); return P0[i].y + (P0[i + 1].y - P0[i].y) * t }
    for (let d = 0; d + 1 <= Math.min(90, g.L); d += 1) {
      const built = Math.abs(g.prof(d + 1) - g.prof(d)), solved = Math.abs(solvedAt(d + 1) - solvedAt(d))
      gOver = Math.max(gOver, built - Math.max(0.24, solved) - 0.005)
    }
  }
  // bump: the wheel tracks through the connector core (between the two mouths, ±2 m)
  const arc = nd.deg2, pts = []
  for (let s = 0; s <= arc.totalLen; s += 0.5) {
    let i = 0; while (i < arc.polyCum.length - 2 && arc.polyCum[i + 1] < s) i++
    const t = (s - arc.polyCum[i]) / (arc.polyCum[i + 1] - arc.polyCum[i] || 1), a = arc.points[i], b = arc.points[i + 1]
    pts.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })
  }
  const c0 = arc.markPhase ? arc.markPhase.aCum : 0, c1 = arc.markPhase ? arc.markPhase.bCum : arc.totalLen
  let bump = 0
  for (const lat of [-1.785, 1.785]) {
    const y = pts.map((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], l = Math.hypot(b.x - a.x, b.z - a.z) || 1
      return T.analyticHeight(p.x + (b.z - a.z) / l * lat, p.z - (b.x - a.x) / l * lat, undefined, nd.nodeY + 6) })
    for (let i = 8; i < y.length - 8; i++) if (i * 0.5 >= c0 - 2 && i * 0.5 <= c1 + 2) bump = Math.max(bump, Math.abs(y[i] - (y[i - 8] + y[i + 8]) / 2))
  }
  // field: the design surface on continuous offset lines (vertex-bisector sweep), mouth − 3 .. mouth + 3
  const Pp = arc.points, cum = arc.polyCum, o = { grade: 0, lateral: 0 }
  const vn = Pp.map((_, i) => { let tx = 0, tz = 0
    for (const [a, b] of [[i - 1, i], [i, i + 1]]) { if (a < 0 || b >= Pp.length) continue
      const dx = Pp[b].x - Pp[a].x, dz = Pp[b].z - Pp[a].z, l = Math.hypot(dx, dz) || 1; tx += dx / l; tz += dz / l }
    const l = Math.hypot(tx, tz) || 1; return [tz / l, -tx / l] })
  const off = (s, lat) => { let i = 0; while (i < cum.length - 2 && cum[i + 1] < s) i++
    const t = Math.max(0, Math.min(1, (s - cum[i]) / ((cum[i + 1] - cum[i]) || 1))), a = Pp[i], b = Pp[i + 1]
    const nx = vn[i][0] + (vn[i + 1][0] - vn[i][0]) * t, nz = vn[i][1] + (vn[i + 1][1] - vn[i][1]) * t
    const x = a.x + (b.x - a.x) * t + nx * lat, z = a.z + (b.z - a.z) * t + nz * lat
    return road._connectorDesignAt(arc, x, z, o) ? o.grade + o.lateral : NaN }
  let d2 = 0
  for (let lat = -4.7; lat <= 4.7 + 1e-9; lat += 0.5) {
    let y0 = NaN, y1 = NaN
    for (let s = Math.max(0, c0 - 3); s <= Math.min(arc.totalLen, c1 + 3); s += 0.1) {
      const y = off(s, lat), d = Math.abs(y - 2 * y1 + y0); if (d > d2) d2 = d; y0 = y1; y1 = y }
  }
  for (let s = Math.max(0, c0 - 3); s <= Math.min(arc.totalLen, c1 + 3); s += 0.5) {
    let y0 = NaN, y1 = NaN
    for (let lat = -4.7; lat <= 4.7 + 1e-9; lat += 0.1) { const y = off(s, lat), d = Math.abs(y - 2 * y1 + y0); if (d > d2) d2 = d; y0 = y1; y1 = y }
  }
  // ribbon: the drawn ribbon near the node vs physics
  const mesh = new RoadMeshSystem({ add () {} }, road, null, P, ws)
  mesh._getTunnelMaterial = mesh._getPortalMaterial = () => null
  const secs = [], section = mesh._ribbonSection, keys = new Set(nd.legs.map(l => l.runKey))
  mesh._ribbonSection = function (px, pz, arcS, runKey, cs, params, out) {
    const q = section.call(this, px, pz, arcS, runKey, cs, params, out)
    if (keys.has(runKey)) secs.push(Float64Array.from(out))
    return q
  }
  const d2r = mesh._buildDeg2Ribbon
  let d2v = null
  mesh._buildDeg2Ribbon = function (n, params, sampleY) { const g = d2r.call(this, n, params, sampleY); if (n === nd) d2v = g?.attributes?.position?.array ?? null; return g }
  const tiles = new Set()
  for (let dx = -NEAR; dx <= NEAR; dx += NEAR / 2) for (let dz = -NEAR; dz <= NEAR; dz += NEAR / 2) tiles.add(`${Math.floor((X + dx) / CHUNK_SIZE)},${Math.floor((Z + dz) / CHUNK_SIZE)}`)
  for (const t of tiles) { const [a, b] = t.split(',').map(Number); mesh._buildRoadTile(a, b, t) }
  let mp = 0, nV = 0
  const check = (x, y, z) => {
    if (Math.hypot(x - X, z - Z) > NEAR) return
    const d = Math.abs(T.analyticHeight(x, z, undefined, y + 0.3) - y); nV++; if (d > mp) mp = d
  }
  for (const v of secs) for (let j = 0; j < v.length / 3; j++) {
    if (Math.abs((j / (v.length / 3 - 1) - 0.5) * W) <= hw - 0.05) check(v[3 * j], v[3 * j + 1], v[3 * j + 2])
  }
  const onPave = (x, z) => pts.some(p => Math.hypot(p.x - x, p.z - z) < hw - 0.05)
  if (d2v) for (let j = 0; j < d2v.length / 3; j++) if (onPave(d2v[3 * j], d2v[3 * j + 2])) check(d2v[3 * j], d2v[3 * j + 1], d2v[3 * j + 2])
  const bad = [mis >= MAX_MIS && 'banks', bump > BAR && 'bump', (dy >= MAX_DY || dg >= MAX_DG) && 'joint', !(d2 < MAX_D2) && 'field',
    gOver > 0 && 'grade', (mp >= MAX_MP || !d2v || nV < 50) && 'ribbon'].filter(Boolean)
  fails += bad.length
  const cm = (v) => (v * 100).toFixed(1)
  console.log(`  ${tag}: banks ${leg[0].bank.toFixed(2)}° / ${leg[1].bank.toFixed(2)}° · bump ${cm(bump)} cm (bar ${cm(BAR)}, main ${cm(MAIN)}) · joint ${(dy * 1000).toFixed(1)} mm, ${cm(dg)} % · field ${cm(d2)} cm · grade ${gOver > 0 ? '+' + cm(gOver) + ' % over' : 'ok'} · ribbon ${cm(mp)} cm / ${nV} verts${d2v ? '' : ' (no strip)'}${bad.length ? '  FAIL ' + bad.join(',') : ''}`)
}
if (fails) { console.log(`FAIL: ${fails} checks over the bar`); process.exit(1) }
console.log('PASS')
process.exit(0)
