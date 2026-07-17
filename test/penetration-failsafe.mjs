// test/penetration-failsafe.mjs — BUG-24 gate.
//
// The catastrophic-penetration failsafe (physics.js Step 1) must fire ONLY on genuine tunnelling —
// now `depth > 2·wheelRadius`, the whole wheel swallowed (hub center a full radius BELOW the surface).
// Never on a resolvable deep contact: a wheel crossing the intended ~0.25 m road-over-shoulder step has
// contact depth ~0.31 m (step + loaded tire deflection) but its hub center is still above ground; that
// must resolve through the suspension force chain (tire→strut→body), NOT a hard position teleport.
//
// The threshold widened from wheelRadius to 2·wheelRadius (2026-07-16): hub-center-at-the-surface still
// preempted hits the solvers recover from on their own. Everything below the line belongs to Step 3b's
// Baumgarte, which bleeds penetration out at ≤ MAX_CORRECTION per step instead of snapping.
//
// We drive the REAL stepPhysics with a controllable flat-surface mock queryContacts (wheel-radius
// queries only — body-sphere queries are ignored so this isolates the wheel/suspension/failsafe path),
// settle the truck, then:
//   A. step the ground up 0.25 m → assert NO teleport (no per-frame position jump beyond integration)
//      and the body climbs via suspension force (the natural chain).
//   B. raise the ground just above the hub center (wheelRadius < depth < 2·wheelRadius) → assert NO
//      teleport. This band is the point of the widened threshold: the OLD trigger fired here.
//   C. bury the hub a full radius under (depth > 2·wheelRadius) → assert the failsafe STILL fires
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

// Re-settle a clean truck on flat ground and return its front-left hub height.
function settledHub () {
  const s = mkState(pySettle)
  groundY = 0
  for (let i = 0; i < 60; i++) stepPhysics(s, P, DT, queryContacts, queryVertexContacts)
  return { s, hub: getWheelPosition(0, s, P) }   // _rotateVector was set by the last stepPhysics call
}

// One step against a raised surface → the position change NOT explained by integration (= a teleport).
function stepJump (s) {
  const pyPrev = s.position.y, vyPrev = s.velocity.y
  stepPhysics(s, P, DT, queryContacts, queryVertexContacts)
  return (s.position.y - pyPrev) - vyPrev * DT
}

// ── Scenario B: hub center under the surface but < 2·wheelRadius → solver's job, NOT the failsafe ────
// The band the widened threshold hands back to Step 2.5/3b. The OLD `depth > wheelRadius` trigger
// teleported here; the force chain + Baumgarte resolve it without a snap.
console.log('\nB) hub center just under the surface (wheelRadius < depth < 2·wheelRadius):')
{
  const { s, hub } = settledHub()
  groundY = hub.y + 0.10                  // 0.10 m above hub center → depth = wheelRadius + 0.10
  const depthB = groundY + P.wheelRadius - hub.y
  console.log(`  hub center y=${hub.y.toFixed(3)}, groundY=${groundY.toFixed(3)}, depth ${depthB.toFixed(3)}`)
  ok(depthB > P.wheelRadius && depthB < 2 * P.wheelRadius,
    `sets up the widened band (wheelRadius ${P.wheelRadius} < depth ${depthB.toFixed(3)} < 2·wheelRadius ${(2 * P.wheelRadius).toFixed(3)}) — old threshold WOULD teleport`)
  const jump = stepJump(s)
  ok(Math.abs(jump) < 0.05, `no teleport in the widened band (|Δpy − vy·dt| = ${Math.abs(jump).toFixed(4)} m < 0.05)`)
}

// ── Scenario C: genuine tunnel (wheel fully swallowed) → failsafe MUST still fire ────────────────────
console.log('\nC) hub buried a full radius under (true tunnel, depth > 2·wheelRadius):')
{
  const { s, hub } = settledHub()
  groundY = hub.y + P.wheelRadius + 0.10  // depth = 2·wheelRadius + 0.10
  const depthC = groundY + P.wheelRadius - hub.y
  const jump = stepJump(s)
  console.log(`  hub center y=${hub.y.toFixed(3)}, groundY=${groundY.toFixed(3)}, depth ${depthC.toFixed(3)} (> 2·wheelRadius ${(2 * P.wheelRadius).toFixed(3)})`)
  ok(depthC > 2 * P.wheelRadius, `test sets up a true tunnel (depth ${depthC.toFixed(3)} > 2·wheelRadius ${(2 * P.wheelRadius).toFixed(3)})`)
  ok(jump > 0.15, `failsafe still rescues a true tunnel (position snap = +${jump.toFixed(3)} m > 0.15)`)
}

console.log('\n' + '═'.repeat(56))
if (fail) { console.log('PENETRATION-FAILSAFE: FAIL'); process.exit(1) }
console.log('PENETRATION-FAILSAFE: PASS — failsafe fires on tunnels, not on resolvable shoulder steps ✓')
