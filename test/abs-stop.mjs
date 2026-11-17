// test/abs-stop.mjs — anti-lock brakes (src/abs.js) on the real stepPhysics.
//
// Full-pedal stops from 25 m/s on flat ground, ABS off vs on, at dry (μ 0.8) and loose (μ 0.35)
// grip, straight and with the wheel turned. Asserts what a period ABS is for:
//   • off, loose: the fronts lock (the baseline is real — otherwise the rest proves nothing)
//   • on: no wheel sits locked above the cut-out speed for long, the front valves cycle in the
//     real 3–15 Hz band, the stop is at most 20 % longer than locked wheels, and steered it turns
//     (locked fronts plough straight on).
// Why "longer" is allowed: in this tire model a locked tire still makes ~97 % of peak force
// (s = slip × tireRelaxationLength = 0.135 m at 100 % slip, still near the curve's crest), where a
// real road tire on asphalt falls to ~70–80 %. So no ABS can out-stop locked wheels here — every
// cycle below the crest is lost distance, bought back as steering. 10–20 % is what real ABS costs on
// loose surfaces.
//   • off: the abs state passes the pedal through untouched.
// BUG-191 (owner, 2026-11-17: "rolling off the throttle and immediately applying the brakes…
// sometimes it just totally coasts"): full throttle for 1/3 s from 5–40 km/h, lift, brake ONE step
// later at pad-trigger pressures 30/60/100 %, both grips. The rears are still spun up at the brake
// step; before the fix the reference latched there, all four valves dumped and the truck coasted
// 14–220 m where ABS off stops in 0.6–40 m. Pins: ABS on ≤ 1.5 × ABS off, and never all four cylinders
// vented together for > 0.1 s while the pedal is down above the cut-out. The 1.5 is not slack: on loose
// ground at a part pedal right after full throttle it measures 1.36–1.47 (10–20 km/h) — the squat has
// unloaded the fronts, they genuinely start to lock, and the valves then re-apply at absReapplyRate from
// 0.8 × that low first lock pressure. A tuning question, not the latch (BUG-191 log).

import * as THREE from 'three'
import { stepPhysics } from '../src/physics.js'
import { computeStaticEquilibrium } from '../src/suspension.js'
import { makeAbs } from '../src/abs.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { makeEngineCtx } from './lib/engine-ctx.mjs'

const DT = 1 / 60
const flat = () => 0
const queryContacts = (cx, cy, cz, r) => {
  const gd = r - cy
  return gd > 0 ? [{ normal: new THREE.Vector3(0, 1, 0), depth: gd, contactPoint: new THREE.Vector3(cx, 0, cz) }] : []
}

async function stop ({ abs, mu, steer = 0, V0 = 25, pedal = 1, thr = 0 }) {
  const P = { ...RANGER_PARAMS, abs, frictionCoeff: mu }
  P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]
  P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))
  const eq = computeStaticEquilibrium(P)
  const w = V0 / P.wheelRadius
  const vs = {
    position: new THREE.Vector3(0, eq.bodyY, 0), velocity: new THREE.Vector3(0, 0, -V0),
    quaternion: new THREE.Quaternion(), angularVelocity: new THREE.Vector3(),
    steerAngle: steer, throttle: 0, brake: 0, smoothThrottle: 0, smoothBrake: 0,
    wheelSteerAngles: [steer, steer, 0, 0],
    wheelDebug: [0, 1, 2, 3].map(() => ({ fn: 0, fy: 0, sa: 0, c: 0, omega: 0, fz: 0 })),
    wheelOmega: [w, w, w, w], wheelPhase: [0, 0, 0, 0], slipLong: [0, 0, 0, 0], slipLat: [0, 0, 0, 0],
    strutComp: [...eq.strutComp], strutCompVel: [0, 0, 0, 0], handbrake: false,
    drivetrain: { engineRPM: 750, gear: 1, shiftTimer: 0, activeGear: 1, SR: 0, TR: 2 },
    abs: makeAbs(),
  }
  const ctx = await makeEngineCtx(vs, P, { groundFn: flat, extent: 256, cell: 4 })
  vs.throttle = vs.smoothThrottle = thr
  for (let s = 0; s < (thr ? 20 : 30); s++) stepPhysics(vs, P, DT, queryContacts, ctx)   // settle onto the tires (thr: spin the rears up)
  if (thr) { vs.throttle = vs.smoothThrottle = 0; stepPhysics(vs, P, DT, queryContacts, ctx) }   // lift, brake one step later
  const z0 = vs.position.z, x0 = vs.position.x
  let lockedT = 0, pulses = 0, t = 0, passThrough = true, prev = [0, 0], vented = 0, ventedMax = 0
  vs.brake = vs.smoothBrake = pedal
  while (t < 15) {
    stepPhysics(vs, P, DT, queryContacts, ctx); t += DT
    const v = Math.hypot(vs.velocity.x, vs.velocity.z)
    if (v < 0.3) break
    if (v > P.absMinSpeed + 1 && vs.wheelOmega.some((o, i) => i < 2 && Math.abs(o) * P.wheelRadius < 0.2 * v)) lockedT += DT
    for (const i of [0, 1]) { if (vs.abs.mode[i] === 2 && prev[i] !== 2) pulses++; prev[i] = vs.abs.mode[i] }
    if (vs.abs.p.some(p => p !== pedal)) passThrough = false
    vented = v > P.absMinSpeed && vs.abs.p.every(p => p < 0.02) ? vented + DT : 0
    ventedMax = Math.max(ventedMax, vented)
  }
  ctx.dispose()
  const dist = Math.hypot(vs.position.x - x0, vs.position.z - z0)
  const heading = Math.atan2(vs.position.x - x0, -(vs.position.z - z0)) * 180 / Math.PI
  return { dist, t, lockedT, pulseHz: pulses / 2 / t, passThrough, heading: Math.abs(heading), ventedMax }   // per front channel
}

const fails = []
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg) }
const f = (r) => `dist ${r.dist.toFixed(1)} m, t ${r.t.toFixed(2)} s, front locked ${r.lockedT.toFixed(2)} s, ${r.pulseHz.toFixed(1)} dumps/s/front channel, heading ${r.heading.toFixed(1)}°`

for (const mu of [0.8, 0.35]) {
  const off = await stop({ abs: false, mu }), on = await stop({ abs: true, mu })
  console.log(`μ ${mu}  off: ${f(off)}\n        on:  ${f(on)}`)
  check(off.passThrough, `μ ${mu}: ABS off passes the pedal straight through`)
  check(on.lockedT < 0.25, `μ ${mu}: ABS on, fronts locked < 0.25 s above cut-out (${on.lockedT.toFixed(2)} s)`)
  check(on.dist <= off.dist * 1.2, `μ ${mu}: ABS stop ≤ 1.2 × locked stop (${on.dist.toFixed(1)} vs ${off.dist.toFixed(1)} m)`)
  if (mu < 0.5) {
    check(off.lockedT > 1, `μ ${mu}: baseline really locks the fronts (${off.lockedT.toFixed(2)} s)`)
    check(on.pulseHz > 3 && on.pulseHz < 15, `μ ${mu}: front valves cycle at 3–15 Hz (${on.pulseHz.toFixed(1)})`)
    const offS = await stop({ abs: false, mu, steer: 0.05 }), onS = await stop({ abs: true, mu, steer: 0.05 })
    console.log(`μ ${mu} steered  off: ${f(offS)}\n                 on:  ${f(onS)}`)
    check(onS.heading > offS.heading + 5, `μ ${mu}: steers under ABS (${onS.heading.toFixed(1)}° vs locked ${offS.heading.toFixed(1)}°)`)
  }
}
for (const mu of [0.8, 0.35]) for (const pedal of [1, 0.6, 0.3]) for (const kmh of [5, 10, 20, 40]) {
  const o = { mu, pedal, thr: 1, V0: kmh / 3.6 }
  const off = await stop({ ...o, abs: false }), on = await stop({ ...o, abs: true })
  const tag = `lift→brake μ ${mu} pedal ${pedal} from ${kmh} km/h`
  check(on.dist <= off.dist * 1.5, `${tag}: ABS ${on.dist.toFixed(2)} m vs off ${off.dist.toFixed(2)} m`)
  check(on.ventedMax <= 0.1, `${tag}: all four vented ≤ 0.1 s (${on.ventedMax.toFixed(2)} s)`)
}
if (fails.length) { console.log(`\n${fails.length} FAIL`); process.exit(1) }
console.log('\nabs-stop: all PASS')
