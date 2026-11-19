// GATE (BUG-236): at a gentle degree-2 CONNECTOR bend the NODE decides BUG-90's bank run-off — if either leg's
// high edge faces the connector's inside, both legs run their bank off to flat at the node.
//
// Main ran it off on ONE leg only: the two legs share one start bank (the P4 camber chain), but each read the sign at
// its OWN cutback (10 m out), where a leg that slews to its own bank is already flat. So 0° met 10.7° at the node of
// the owner's capture (seed 1225608752, (−765.9, 222.7)), and the connector blended that 0.95 m edge disagreement
// into a +28 cm hump, a −32 cm dip and a crease. Checks, at that site and at the 7 census sites of the same cause
// (60-seed census, wip/bug-236/census.mjs):
//   1. both legs' bank at the node agree (away-from-node frame, a continuous bank reads a and −a): |aA + aB| < MAX_MIS
//      (main 3.4–12.7°);
//   2. the tire deck (terrain analyticHeight, potholes off) walked along the connector core at the wheel tracks
//      (lat ±1.785): worst deviation from an 8 m straightedge ≤ the site's bar. The capture site's bar is 5 cm (main
//      28 cm). At the census sites what is left is the wider connector-bend class (matched banks, both 0°, still bump:
//      82 of 203 bends > 15 cm, its own diagnosis), so their bar pins the branch's value + 1 cm;
//   3. the drawn ribbon (leg sections + connector strip) within NEAR of the node vs physics: < MAX_MP.
import * as THREE from 'three'
import { RoadSystem } from '../src/road.js'
import { RoadMeshSystem } from '../src/road-mesh.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { parseWorldSeed } from '../src/seed.js'
import { wirePondNoGo } from './lib/pond-no-go.mjs'
import { makeTerrainHeadless } from './lib/terrain-headless.mjs'
import { CHUNK_SIZE } from '../src/terrain.js'

// seed, node x, z, wheel-track bar (m), main's bump (m, for the report)
const SITES = [
  ['1225608752', -765.9, 222.7, 0.05, 0.282],   // the owner's capture
  ['3872516096', 915.0, 157.7, 0.081, 0.163],
  ['4287028224', 570.9, 186.1, 0.054, 0.057],
  ['2215738496', -756.9, -500.2, 0.161, 0.296],
  ['2215738496', 557.8, -22.4, 0.053, 0.064],
  ['2619533952', -735.0, 440.2, 0.160, 0.217],
  ['3245191168', 285.1, 223.1, 0.235, 0.154],   // worse: main's leftover crest-side bank filled a matched-bank sag
  ['3075315200', 550.4, 7.0, 0.177, 0.162],
]
const MAX_MIS = 0.5, MAX_MP = 0.02, NEAR = 40, D = 180 / Math.PI
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
for (const [S, X, Z, BAR, MAIN] of SITES) {
  const { ws, road, T, nodes } = build(S)
  let nd = null
  for (const [, v] of nodes) if (v.deg2 && v.legs.length === 2 && Math.hypot(v.pos.x - X, v.pos.z - Z) < 0.5) nd = v
  const tag = `${S} (${X}, ${Z})`
  if (!nd) { console.log(`  ${tag}: connector node not found`); fails++; continue }
  // 1. the two node banks
  const away = (l) => { const e = road._network.get(l.runKey), st = l.arc < 1e-6
    return (st ? 1 : -1) * road.camberProfile(st ? 0 : e.polyCum.at(-1), l.runKey) * D }
  const [aA, aB] = nd.legs.map(away), mis = Math.abs(aA + aB)
  // 2. the wheel tracks through the connector core (between the two mouths, ±2 m)
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
      return T.analyticHeight(p.x + (b.z - a.z) / l * lat, p.z - (b.x - a.x) / l * lat, undefined, nd.nodeY + 4) })
    for (let i = 8; i < y.length - 8; i++) if (i * 0.5 >= c0 - 2 && i * 0.5 <= c1 + 2) bump = Math.max(bump, Math.abs(y[i] - (y[i - 8] + y[i + 8]) / 2))
  }
  // 3. the drawn ribbon near the node vs physics
  const mesh = new RoadMeshSystem({ add () {} }, road, null, P, ws)
  mesh._getTunnelMaterial = mesh._getPortalMaterial = () => null
  const secs = [], section = mesh._ribbonSection, keys = new Set(nd.legs.map(l => l.runKey))
  mesh._ribbonSection = function (px, pz, arcS, runKey, cs, params, out) {
    const q = section.call(this, px, pz, arcS, runKey, cs, params, out)
    if (keys.has(runKey)) secs.push(Float64Array.from(out))
    return q
  }
  const d2 = mesh._buildDeg2Ribbon
  let d2v = null
  mesh._buildDeg2Ribbon = function (n, params, sampleY) { const g = d2.call(this, n, params, sampleY); if (n === nd) d2v = g?.attributes?.position?.array ?? null; return g }
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
  const bad = [mis >= MAX_MIS && 'banks', bump > BAR && 'bump', (mp >= MAX_MP || !d2v || nV < 50) && 'ribbon'].filter(Boolean)
  fails += bad.length
  console.log(`  ${tag}: node banks ${aA.toFixed(2)}° / ${aB.toFixed(2)}° (mismatch ${mis.toFixed(2)}°, bar ${MAX_MIS}°) · wheel-track bump ${(bump * 100).toFixed(1)} cm (bar ${(BAR * 100).toFixed(1)}, main ${(MAIN * 100).toFixed(1)}) · ribbon vs physics ${(mp * 100).toFixed(2)} cm over ${nV} verts${d2v ? '' : ' (no connector strip)'}${bad.length ? '  FAIL ' + bad.join(',') : ''}`)
}
if (fails) { console.log(`FAIL: ${fails} checks over the bar`); process.exit(1) }
console.log('PASS')
process.exit(0)
