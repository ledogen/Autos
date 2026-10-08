// GATE (owner-reported 2026-10-07, Larry's house "damaged my rims and was weirdly bouncy"):
// the POI marker's ENGINE collider (PoiPhysics) is the same solid the wheel path resolves
// (PoiSystem._boxesContact), and a truck-sized body driven into it stops rigidly.
//
// Before the fix the marker existed ONLY in the analytic wheel query, so the chassis drove into
// the trailer and the tires alone pushed back — the bounce, and the rim strikes.
//
//   (1) PARITY — at 4000 random sphere probes around a yawed trailer (one box) and a yawed
//       splitting yard (seven offset boxes), engine.contactSphere and _boxesContact agree on
//       hit / no-hit wherever the probe is not within a hair of the surface.
//   (2) RIGID — a 1800 kg box fired at the trailer's long wall at 10 m/s stops at the wall:
//       it never gets more than a few cm inside, and it does not rebound.
//
// Run: node test/poi-collider.mjs

import { createPhysicsEngine } from '../src/physics-engine.js'
import { PoiPhysics } from '../src/terrain-physics.js'
import { PoiSystem } from '../src/poi.js'
import { PROP_MODELS } from '../data/prop-models.js'

let fail = 0
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail++ }

const eng = await createPhysicsEngine({ gravity: { x: 0, y: -9.81, z: 0 } })
const poiPhys = new PoiPhysics(eng)
const pois = new PoiSystem({ getParams: () => ({}) })
const markers = [
  { id: 'trailer', x: 40, y: 3, z: -20, modelYaw: 0.7, collision: PROP_MODELS.trailerHomeA.collision },
  { id: 'yard', x: -60, y: 1, z: 30, modelYaw: -2.1, collision: PROP_MODELS.splittingYard.collision },
]
poiPhys.sync(markers, 1.6)
check(poiPhys.bodyCount === 2, `one static body per marker (got ${poiPhys.bodyCount})`)

// (1) parity. A probe whose two answers differ only because it grazes the surface (depth below a
// millimetre in either model) is float noise, not a mismatch.
let seed = 12345
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
let probes = 0, hits = 0, mismatch = 0
for (const q of markers) {
  for (let i = 0; i < 2000; i++) {
    const cx = q.x + (rnd() - 0.5) * 18, cy = q.y + rnd() * 4.5 - 0.5, cz = q.z + (rnd() - 0.5) * 18
    const r = 0.1 + rnd() * 0.5
    const a = pois._boxesContact(q, 0.8, cx, cy, cz, r)
    const e = eng.contactSphere({ x: cx, y: cy, z: cz }, r)
    probes++
    if (a) hits++
    const eDepth = e.length ? Math.max(...e.map(h => h.depth ?? 0)) : 0
    if (!!a !== e.length > 0 && Math.max(a?.depth ?? 0, eDepth) > 1e-3) mismatch++
  }
}
check(mismatch === 0 && hits > 200,
  `engine collider == wheel-query solid at ${probes} probes (${hits} hits, ${mismatch} mismatches)`)

// (2) rigid stop. The trailer's long wall faces model +Z; fire along -Z_model from outside it.
// Gravity off so the block flies level — this pins the wall, not the ground.
const t = markers[0]
const cs = Math.cos(t.modelYaw), sn = Math.sin(t.modelYaw)
const toWorld = (lx, lz) => ({ x: t.x + lx * cs + lz * sn, z: t.z - lx * sn + lz * cs })
const wallHalf = t.collision.size[2] * 0.5
const start = toWorld(0, wallHalf + 3)
const eng2 = await createPhysicsEngine({ gravity: { x: 0, y: 0, z: 0 } })
new PoiPhysics(eng2).sync([t], 1.6)
const hb = { x: 0.9, y: 0.6, z: 2.2 }                       // ~Ranger footprint, long axis along the shot
const blk = eng2.createBody({ type: 'dynamic', position: { x: start.x, y: t.y + 1.0, z: start.z },
  quaternion: { x: 0, y: Math.sin(t.modelYaw * 0.5), z: 0, w: Math.cos(t.modelYaw * 0.5) }, bullet: true })
eng2.addBox(blk, { ...hb, y: hb.y }, { friction: 0.3, restitution: 0, density: 1800 / (8 * hb.x * hb.y * hb.z) })
const v0 = 10
eng2.setVelocity(blk, { x: -sn * v0, y: 0, z: -cs * v0 }, { x: 0, y: 0, z: 0 })   // model -Z
const p = {}, qq = {}, lin = {}, ang = {}
let minLz = Infinity
for (let i = 0; i < 120; i++) {
  eng2.step(1 / 60, 4)
  eng2.getTransform(blk, p, qq)
  const lz = sn * (p.x - t.x) + cs * (p.z - t.z)            // block centre, model-local z
  minLz = Math.min(minLz, lz)
}
eng2.getVelocity(blk, lin, ang)
const vOut = sn * lin.x + cs * lin.z                         // +ve = moving back away from the wall
const intrude = (wallHalf + hb.z) - minLz
check(intrude < 0.05, `block stops at the wall (deepest intrusion ${(intrude * 100).toFixed(1)} cm)`)
check(vOut < 0.5, `no rebound (outward speed after 2 s ${vOut.toFixed(2)} m/s, fired at ${v0})`)

if (fail) { console.log(`\n${fail} check(s) failed`); process.exit(1) }
console.log('\nall poi-collider checks passed')
