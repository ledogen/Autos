// test/penetration-failsafe.mjs — BUG-24 gate.
//
// The catastrophic-penetration failsafe (physics.js Step 1) must fire ONLY on genuine tunnelling
// (hub center below the surface, depth > wheelRadius) — never on a resolvable deep contact. A wheel
// crossing the intended ~0.25 m road-over-shoulder step has contact depth ~0.31 m (step + loaded tire
// deflection) but its hub center is still above ground; that must resolve through the suspension force
// chain (tire→strut→body), NOT a hard position teleport.
//
// We drive the REAL stepPhysics with a controllable flat-surface mock queryContacts (wheel-radius
// queries only — body-sphere queries are ignored so this isolates the wheel/suspension/failsafe path),
// settle the truck, then:
//   A. step the ground up 0.25 m  → assert NO teleport (no per-frame position jump beyond integration)
//      and the body climbs via suspension force (the natural chain).
//   B. raise the ground above the hub center (depth > wheelRadius) → assert the failsafe STILL fires
//      (a single-frame position snap) — the true-tunnel safety net is intact.

import * as THREE from 'three'
import { RANGER_PARAMS as P } from '../data/ranger.js'
import { stepPhysics } from '../src/physics.js'
import { getWheelPosition } from '../src/suspension.js'

const DT = 1 / 60

// Per-step scratch arrays the suspension substep expects pre-allocated (main.js:106-110).
P._tireFz = [0, 0, 0, 0]
P._suspForceAccum = [0, 0, 0, 0]
P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))

let groundY = 0
// Wheel-radius contacts only → isolates the failsafe/suspension wheel path from body-sphere contacts.
const queryContacts = (cx, cy, cz, r) => {
  if (Math.abs(r - P.wheelRadius) > 1e-9) return []
  const depth = groundY + r - cy
  if (depth <= 0) return []
  return [{ normal: new THREE.Vector3(0, 1, 0), depth, contactPoint: new THREE.Vector3(cx, groundY, cz) }]
}
const queryVertexContacts = () => []

function mkState (py) {
  return {
    position: new THREE.Vector3(0, py, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    quaternion: new THREE.Quaternion(0, 0, 0, 1),
    angularVelocity: new THREE.Vector3(0, 0, 0),
    steerAngle: 0, throttle: 0, brake: 0, smoothThrottle: 0, smoothBrake: 0,
    wheelAngles: [0, 0, 0, 0], wheelSteerAngles: [0, 0, 0, 0],
    strutComp: [0.05, 0.05, 0.05, 0.05], strutCompVel: [0, 0, 0, 0],
    slipLong: [0, 0, 0, 0], slipLat: [0, 0, 0, 0],
    wheelOmega: [0, 0, 0, 0],
    wheelDebug: [0, 1, 2, 3].map(() => ({ fn: 0, fy: 0, sa: 0, c: 0, omega: 0, fz: 0 })),
    handbrake: false,
  }
}

// Start slightly above contact so settling never starts with a large embed.
const vs = mkState(0.70)
for (let i = 0; i < 300; i++) stepPhysics(vs, P, DT, queryContacts, queryVertexContacts)

const pySettle = vs.position.y
const vySettle = vs.velocity.y
console.log(`settle: py=${pySettle.toFixed(4)} vy=${vySettle.toFixed(5)}`)

let fail = 0
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail = 1 }

ok(Math.abs(vySettle) < 0.02, `truck settled on flat ground (|vy| ${Math.abs(vySettle).toFixed(4)} < 0.02)`)

// ── Scenario A: deep-but-resolvable step up → suspension resolves it, no teleport ───────────────────
// The step is sized so the post-step contact depth lands in the CRITICAL WINDOW (0.3 m, wheelRadius):
// the OLD flat-0.3 threshold fires here (teleport) while the BUG-24 fix (depth > wheelRadius) does not.
// In-game this window is reached by the intended ~0.25 m road-over-shoulder step PLUS the loaded outer
// wheel's standing deflection (~0.06 m) → ~0.31 m (capture rangersim-capture-1782632966689, f111/f236).
console.log('\nA) ground steps up into the critical depth window (0.3 m, wheelRadius):')
groundY = 0.30
const hubA = getWheelPosition(0, vs, P)   // _rotateVector set by the last stepPhysics call (settle)
const depth0 = groundY + P.wheelRadius - hubA.y
console.log(`  post-step contact depth = ${depth0.toFixed(3)} m`)
ok(depth0 > 0.3 && depth0 < P.wheelRadius,
  `step lands in the regression window (0.3 < depth ${depth0.toFixed(3)} < wheelRadius ${P.wheelRadius}) — old threshold WOULD teleport`)
let worstJump = 0
let pyBefore = vs.position.y
for (let i = 0; i < 40; i++) {
  const vyPrev = vs.velocity.y
  const pyPrev = vs.position.y
  stepPhysics(vs, P, DT, queryContacts, queryVertexContacts)
  // Force-only integration moves position by ≈ vy·dt + a·dt² (a·dt² ≤ ~0.01 m even at huge tire force).
  // A failsafe teleport adds maxEmbed (≫ 0.05 m) on top. So any per-frame |Δpy − vyPrev·dt| > 0.05 m
  // is a position write, i.e. the failsafe fired.
  const integ = Math.abs((vs.position.y - pyPrev) - vyPrev * DT)
  if (integ > worstJump) worstJump = integ
}
const climbed = vs.position.y - pyBefore
ok(worstJump < 0.05, `no teleport across 40 frames (worst |Δpy − vy·dt| = ${worstJump.toFixed(4)} m < 0.05)`)
ok(climbed > 0.10, `body climbed toward the new surface via suspension force (Δpy = +${climbed.toFixed(3)} m > 0.10)`)

// ── Scenario B: genuine tunnel (surface above hub center) → failsafe MUST still fire ─────────────────
console.log('\nB) ground raised above the hub center (true tunnel, depth > wheelRadius):')
const vs2 = mkState(pySettle)
groundY = 0
for (let i = 0; i < 60; i++) stepPhysics(vs2, P, DT, queryContacts, queryVertexContacts)  // re-settle clean
const hub = getWheelPosition(0, vs2, P)  // _rotateVector was set by the last stepPhysics call
groundY = hub.y + 0.10                    // surface 0.10 m ABOVE hub center → depth = 0.10 + wheelRadius
const depthExpected = groundY + P.wheelRadius - hub.y
const pyPrev = vs2.position.y, vyPrev = vs2.velocity.y
stepPhysics(vs2, P, DT, queryContacts, queryVertexContacts)
const jump = (vs2.position.y - pyPrev) - vyPrev * DT
console.log(`  hub center y=${hub.y.toFixed(3)}, groundY=${groundY.toFixed(3)}, expected depth ${depthExpected.toFixed(3)} (> wheelRadius ${P.wheelRadius})`)
ok(depthExpected > P.wheelRadius, `test sets up a true tunnel (depth ${depthExpected.toFixed(3)} > wheelRadius ${P.wheelRadius})`)
ok(jump > 0.15, `failsafe still rescues a true tunnel (position snap = +${jump.toFixed(3)} m > 0.15)`)

console.log('\n' + '═'.repeat(56))
if (fail) { console.log('PENETRATION-FAILSAFE: FAIL'); process.exit(1) }
console.log('PENETRATION-FAILSAFE: PASS — failsafe fires on tunnels, not on resolvable shoulder steps ✓')
