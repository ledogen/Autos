// GATE (BUG-139): a rock prop pushes a wheel out the way it came — it never reads a point outside it as inside, and never
// reports the depth that physics.js's tunnelling failsafe teleports on.
//
// The owner, 2026-11-07: tumbling over, or driving onto, partly buried rock props teleported the truck up. sphereVsMesh
// (src/props/prop-collider.js) judged a wheel centre inside a rock by the NEAREST face's normal; at an edge or vertex
// shared by several faces the one picked can face away, and 2.3 % of points just outside the game's rocks read inside,
// at depth r + distance (up to 4 m). A truly inside centre read r + distance too. Past 2r either fires Step 1's failsafe.
//   1. CONTACT: points around every rock and boulder variant of the palette (seed 6), against an independent inside test
//      (three-ray majority): no outside point reads inside (depth > r), and no depth ever reaches 2r (an inside centre
//      keeps BUG-54's way out, r + distance, held under 1.9 r).
//   2. DRIVE + TUMBLE: the truck over a half-buried rock on flat ground (the rock mirrored into the engine as the game
//      does), driven at 5/10/15 m/s and tumbled sideways onto it: no step's wheel query reaches 2r.
import * as THREE from 'three'
import { buildPalette } from '../src/props/prop-palette.js'
import { sphereVsMeshInstance } from '../src/props/prop-collider.js'
import { stepPhysics } from '../src/physics.js'
import { computeStaticEquilibrium } from '../src/suspension.js'
import { makeQueryContacts } from '../src/world-contacts.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { DEFAULT_VEHICLE_MODEL } from '../data/vehicle-models.js'
import { makeEngineCtx } from './lib/engine-ctx.mjs'

const r = RANGER_PARAMS.wheelRadius, DT = 1 / 60
let fails = 0
const check = (ok, msg) => { console.log(`${ok ? '[PASS]' : '[FAIL]'} ${msg}`); if (!ok) fails++ }
const pal = buildPalette('6')
const rocks = [...pal.variants.rock, ...pal.variants.boulder].map(v => v.collision).filter(c => c?.tris)

// ── 1. contact ────────────────────────────────────────────────────────────────────────────────────────────────────
const parity = (tris, px, py, pz, dx, dy, dz) => {
  let n = 0
  for (let i = 0; i < tris.length; i += 9) {
    const ax = tris[i], ay = tris[i + 1], az = tris[i + 2]
    const e1x = tris[i + 3] - ax, e1y = tris[i + 4] - ay, e1z = tris[i + 5] - az, e2x = tris[i + 6] - ax, e2y = tris[i + 7] - ay, e2z = tris[i + 8] - az
    const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x, a = e1x * hx + e1y * hy + e1z * hz
    if (Math.abs(a) < 1e-12) continue
    const f = 1 / a, sx = px - ax, sy = py - ay, sz = pz - az, u = f * (sx * hx + sy * hy + sz * hz)
    if (u < 0 || u > 1) continue
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x, v = f * (dx * qx + dy * qy + dz * qz)
    if (v < 0 || u + v > 1) continue
    if (f * (e2x * qx + e2y * qy + e2z * qz) > 1e-9) n++
  }
  return n & 1
}
const inside3 = (t, x, y, z) => parity(t, x, y, z, 0.577, 0.577, 0.577) + parity(t, x, y, z, -0.6, 0.48, 0.64) + parity(t, x, y, z, 0.3, -0.9, 0.316) >= 2
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
let outPts = 0, falseIn = 0, maxDepth = 0
for (let k = 0; k < 20000; k++) {
  const c = rocks[k % rocks.length], R = c.radius + r
  const x = (rnd() * 2 - 1) * R, y = (rnd() * 2 - 1) * R, z = (rnd() * 2 - 1) * R
  const hit = sphereVsMeshInstance(x, y, z, r, c.tris, 0, 0, 0, 0, 1)
  if (hit) maxDepth = Math.max(maxDepth, hit.depth)
  if (inside3(c.tris, x, y, z)) continue
  outPts++
  if (hit && hit.depth > r + 1e-9) falseIn++
}
check(falseIn === 0, `${rocks.length} rock/boulder meshes, ${outPts} points outside them: ${falseIn} read INSIDE (main: 2.3 %, up to 4 m deep)`)
check(maxDepth < 2 * r, `the deepest rock contact is ${maxDepth.toFixed(3)} m (the failsafe fires past 2r = ${(2 * r).toFixed(3)} m; main 12.4 m)`)

// ── 2. drive over and tumble onto a half-buried rock ─────────────────────────────────────────────────────────────
const up = new THREE.Vector3(0, 1, 0)
async function run (rock, setup) {
  const P = { ...RANGER_PARAMS }
  P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]; P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))
  const eq = computeStaticEquilibrium(P)
  const vs = {
    position: new THREE.Vector3(), velocity: new THREE.Vector3(), quaternion: new THREE.Quaternion(), angularVelocity: new THREE.Vector3(),
    steerAngle: 0, throttle: 0, brake: 0, smoothThrottle: 0, smoothBrake: 0, wheelSteerAngles: [0, 0, 0, 0],
    wheelDebug: [0, 1, 2, 3].map(() => ({ fn: 0, fy: 0, sa: 0, c: 0, omega: 0, fz: 0 })), wheelOmega: [0, 0, 0, 0], wheelPhase: [0, 0, 0, 0],
    slipLong: [0, 0, 0, 0], slipLat: [0, 0, 0, 0], strutComp: [...eq.strutComp], strutCompVel: [0, 0, 0, 0], handbrake: false,
    drivetrain: { engineRPM: 750, gear: 1, shiftTimer: 0, activeGear: 1, SR: 0, TR: 2 },
  }
  setup(vs)
  const ctx = await makeEngineCtx(vs, P, { groundFn: () => 0, extent: 64, cell: 4, bed: DEFAULT_VEHICLE_MODEL.bed })
  // the rock, half buried at the origin, mirrored into the engine as terrain-physics.js does
  const n = rock.tris.length / 3, pos = new Float32Array(rock.tris), idx = new Uint32Array(n).map((_, i) => i)
  const body = ctx.engine.createBody({ type: 'static', userData: { kind: 'prop' } })
  ctx.engine.addMesh(body, pos, idx, { friction: 0.8, restitution: 0 })
  const props = { queryProps (cx, cy, cz, rr, out = []) {
    const h = sphereVsMeshInstance(cx, cy, cz, rr, rock.tris, 0, 0, 0, 0, 1)
    if (h) { const t = rr - h.depth; out.push({ normal: new THREE.Vector3(h.nx, h.ny, h.nz), depth: h.depth, contactPoint: new THREE.Vector3(cx - h.nx * t, cy - h.ny * t, cz - h.nz * t) }) }
    return out
  } }
  const qc0 = makeQueryContacts({ params: P, groundH: () => 0, groundN: () => up, props: () => props })
  let stepMax = 0
  const qc = (...a) => { const o = qc0(...a); for (const h of o) if (h.depth > stepMax) stepMax = h.depth; return o }
  let fires = 0, worst = 0
  for (let i = 0; i < 240; i++) { stepMax = 0; stepPhysics(vs, P, DT, qc, ctx); worst = Math.max(worst, stepMax); if (stepMax > 2 * r) fires++ }
  ctx.dispose()
  return { fires, worst }
}
const rock = pal.variants.rock.map(v => v.collision).sort((a, b) => b.radius - a.radius)[0]
let total = 0, worstAll = 0
const rows = []
for (const v of [5, 10, 15]) {
  const res = await run(rock, (vs) => { vs.position.set(0.7, 1.0, 9); vs.velocity.set(0, 0, -v); vs.throttle = 0.4 })
  total += res.fires; worstAll = Math.max(worstAll, res.worst); rows.push(`drive ${v} m/s: ${res.fires} (worst ${res.worst.toFixed(2)} m)`)
}
for (const [v, w] of [[6, 2], [8, 3], [10, 4]]) {
  const res = await run(rock, (vs) => {
    vs.position.set(4, 1.4, 0); vs.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.9)
    vs.velocity.set(-v, 0, 0); vs.angularVelocity.set(0, 0, w)
  })
  total += res.fires; worstAll = Math.max(worstAll, res.worst); rows.push(`tumble ${v} m/s ${w} rad/s: ${res.fires} (worst ${res.worst.toFixed(2)} m)`)
}
console.log(`  rock r ${rock.radius.toFixed(2)} m, half buried — steps reaching 2r: ${rows.join(' · ')}`)
check(total === 0, `driving over and tumbling onto a rock never reaches the failsafe (${total} steps; deepest ${worstAll.toFixed(2)} m)`)
console.log(fails ? `${fails} CHECK(S) FAILED` : 'PASS — a rock prop pushes a wheel out, it never teleports the truck')
process.exit(fails ? 1 : 0)
