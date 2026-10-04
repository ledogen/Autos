// test/alignment-damage-wiring.mjs — BUG-79 gate: impact-bent alignment reaches the physics.
//
// src/damage.js bends one wheel's toe/camber on a hard hit and publishes the per-wheel offsets as
// params._toeOffsetDeg[i] / _camberOffsetDeg[i]. For months nothing read them (alignment.js used the
// sheet values only), so a truck the damage screen showed as bent still drove dead straight. Silent
// by construction: no crash, no NaN, just a damage track that does nothing. This gate is the alarm.
//
//   §1 IDENTITY — with the arrays absent (headless, damage off), toeOffset/camberLean return exactly
//      the sheet-only value, so the wiring cannot perturb anything when no damage exists.
//   §2 PLUMBING — a damage offset changes toeOffset/camberLean on the named corner only.
//   §3 PHYSICS — straight run at 15 m/s, no steer, ~100 m: a front wheel bent by alignMaxToeDeg
//      yaws the truck measurably; the undamaged truck holds its heading.
//
// Run: node test/alignment-damage-wiring.mjs

import * as THREE from 'three'
import { RANGER_PARAMS } from '../data/ranger.js'
import { stepPhysics } from '../src/physics.js'
import { makeVehicleState } from '../src/vehicle-state.js'
import { toeOffset, camberLean } from '../src/alignment.js'
import { DAMAGE_PARAMS } from '../src/damage.js'
import { makeEngineCtx } from './lib/engine-ctx.mjs'

const DT = 1 / 60
const V0 = 15
let fail = 0
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail = 1 }

function freshParams () {
  const P = { ...RANGER_PARAMS }
  P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]
  P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))
  return P
}

// ── §1 / §2 the pure functions ───────────────────────────────────────────────────────────────────
console.log('§1 absent damage arrays leave toeOffset/camberLean on the sheet value')
const DEG = Math.PI / 180
const sheet = freshParams()
for (let c = 0; c < 4; c++) {
  const f = c < 2, left = c === 0 || c === 2
  const toeSheet = (f ? sheet.toeFront : sheet.toeRear) || 0
  const camSheet = (f ? sheet.camberFront : sheet.camberRear) || 0
  ok(toeOffset(c, sheet) === (toeSheet === 0 ? 0 : (left ? -toeSheet : toeSheet) * DEG), `corner ${c}: toe = sheet`)
  ok(camberLean(c, sheet) === (camSheet === 0 ? 0 : (left ? -camSheet : camSheet) * DEG), `corner ${c}: camber = sheet`)
}

console.log('§2 a damage offset moves only the corner it names')
const bent = { ...sheet, _toeOffsetDeg: [0, 0, 0.4, 0], _camberOffsetDeg: [0, 0, 0, -1.5] }
for (let c = 0; c < 4; c++) {
  ok((toeOffset(c, bent) !== toeOffset(c, sheet)) === (c === 2), `corner ${c}: toe ${c === 2 ? 'moved' : 'unchanged'}`)
  ok((camberLean(c, bent) !== camberLean(c, sheet)) === (c === 3), `corner ${c}: camber ${c === 3 ? 'moved' : 'unchanged'}`)
}

// ── §3 the truck actually pulls ──────────────────────────────────────────────────────────────────
const queryContacts = (cx, cy, cz, r) => {
  const depth = r - cy
  return depth > 0
    ? [{ normal: new THREE.Vector3(0, 1, 0), depth, contactPoint: new THREE.Vector3(cx, 0, cz) }]
    : []
}
const heading = (q) => {
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q)
  return Math.atan2(-fwd.x, -fwd.z) / DEG    // degrees, + = yawed left
}

async function straightRun (toeOffsets) {
  const P = freshParams()
  if (toeOffsets) { P._toeOffsetDeg = toeOffsets; P._camberOffsetDeg = [0, 0, 0, 0] }
  const vs = makeVehicleState(P)
  vs.parked = false
  vs.velocity.set(0, 0, -V0)
  for (let i = 0; i < 4; i++) vs.wheelOmega[i] = V0 / P.wheelRadius
  vs.throttle = vs.smoothThrottle = 0.1       // light throttle, holds ~15 m/s against drag
  const ctx = await makeEngineCtx(vs, P)
  const h0 = heading(vs.quaternion)
  let dist = 0
  while (dist < 100) {
    stepPhysics(vs, P, DT, queryContacts, ctx)
    dist += vs.velocity.length() * DT
    if (!Number.isFinite(vs.position.x)) break
  }
  ctx.dispose()
  return { dHead: heading(vs.quaternion) - h0, v: vs.velocity.length(), dist }
}

console.log(`§3 straight run at ${V0} m/s, no steer, ~100 m`)
const clean = await straightRun(null)
const toe = DAMAGE_PARAMS.alignMaxToeDeg
const pulled = await straightRun([toe, 0, 0, 0])
console.log(`  undamaged:       Δheading ${clean.dHead.toFixed(4)}°  (v_end ${clean.v.toFixed(1)} m/s, ${clean.dist.toFixed(0)} m)`)
console.log(`  FL toe +${toe}°:   Δheading ${pulled.dHead.toFixed(4)}°  (v_end ${pulled.v.toFixed(1)} m/s, ${pulled.dist.toFixed(0)} m)`)
ok(Math.abs(clean.dHead) < 0.1, `undamaged truck holds heading (|Δ| ${Math.abs(clean.dHead).toFixed(4)}° < 0.1°)`)
ok(Math.abs(pulled.dHead) > 2, `bent FL toe yaws the truck (|Δ| ${Math.abs(pulled.dHead).toFixed(2)}° > 2°)`)
// +toe on FL = toe-IN (sheet convention) = FL nose points right = a right-hand pull.
ok(pulled.dHead < 0, 'FL toe-in pulls RIGHT (heading decreases)')

console.log(fail ? '\nFAIL — alignment damage does not reach the physics' : '\nPASS')
process.exit(fail)
