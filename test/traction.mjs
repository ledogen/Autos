// test/traction.mjs — FEAT-159 throttle assist + traction control (src/traction.js) on the real stepPhysics.
//
// Flat ground (or a cross-slope plane), assist off vs on, asserting what each assist is for:
//   throttle assist — a keyboard full-throttle launch holds the rears near the slip target, wears far
//     less tread (damage.js's own formula: ∫ max(0, slip speed − 0.15 m/s) dt) and is no slower than
//     the best fixed pedal; full-S reverse likewise; it steps aside for a power drift and a handbrake
//     U-turn; with it off a floored launch still lights the tires up (the burnout exists).
//   traction control — one rear on low grip (open diff): the wheel-speed gap is braked down and the
//     launch is faster; a power-oversteer entry is caught.
//   both off — the state passes everything through (cap 1, no TC pressure) and the run is identical.
// `--matrix` prints the owner's table instead: diff × ground × worn rear × forward/reverse × keyboard/pad.

import * as THREE from 'three'
import { stepPhysics } from '../src/physics.js'
import { computeStaticEquilibrium } from '../src/suspension.js'
import { makeTraction } from '../src/traction.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { makeEngineCtx } from './lib/engine-ctx.mjs'

const DT = 1 / 60, MPH = 0.44704
const SLIP_FLOOR = 0.15   // damage.js tireSlipFloor — the no-wear floor

/**
 * Drive one scenario. `input(t, vs)` returns { throttle, brake, steer, handbrake } each step (the
 * keyboard ramp is the caller's: rampKbd below). Stops at `until(vs, t)` or `tMax`.
 */
async function drive ({ ta = false, tc = false, mu = 0.8, muScale = [1, 1, 1, 1], diff = 'open', slope = 0,
  v0 = 0, steer0 = 0, input, until = () => false, tMax = 20, traction = true, extra = {} }) {
  const P = { ...RANGER_PARAMS, throttleAssist: ta, tractionControl: tc, frictionCoeff: mu, rearDiffMode: diff, ...extra }
  P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]
  P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))
  P._tireMuScale = muScale
  const eq = computeStaticEquilibrium(P)
  // A cross-slope plane y = slope·x (the truck faces −z, so +x is its right: positive slope = right side up).
  const n = new THREE.Vector3(-slope, 1, 0).normalize()
  const groundFn = (x) => slope * x
  const queryContacts = (cx, cy, cz, r) => {
    const dist = (cy - groundFn(cx)) * n.y
    const gd = r - dist
    return gd > 0 ? [{ normal: n.clone(), depth: gd, contactPoint: new THREE.Vector3(cx - n.x * dist, cy - n.y * dist, cz - n.z * dist) }] : []
  }
  const w = v0 / P.wheelRadius
  const vs = {
    position: new THREE.Vector3(0, eq.bodyY, 0), velocity: new THREE.Vector3(0, 0, -v0),
    quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan(slope)),
    angularVelocity: new THREE.Vector3(),
    steerAngle: steer0, throttle: 0, brake: 0, smoothThrottle: 0, smoothBrake: 0,
    wheelSteerAngles: [steer0, steer0, 0, 0],
    wheelDebug: [0, 1, 2, 3].map(() => ({ fn: 0, fy: 0, sa: 0, c: 0, omega: 0, fz: 0 })),
    wheelOmega: [w, w, w, w], wheelPhase: [0, 0, 0, 0], slipLong: [0, 0, 0, 0], slipLat: [0, 0, 0, 0],
    slipVel: [0, 0, 0, 0],
    strutComp: [...eq.strutComp], strutCompVel: [0, 0, 0, 0], handbrake: false,
    drivetrain: { engineRPM: 750, gear: 1, shiftTimer: 0, activeGear: 1, SR: 0, TR: 2 },
  }
  if (traction) vs.traction = makeTraction()
  const ctx = await makeEngineCtx(vs, P, { groundFn, extent: 512, cell: 4 })
  for (let s = 0; s < 30; s++) stepPhysics(vs, P, DT, queryContacts, ctx)   // settle onto the tires
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3()
  const out = { t: 0, slide: 0, sigSum: 0, sigN: 0, gapMax: 0, betaMax: 0, heading0: 0, yaw: 0, capMin: 1, pMax: 0,
    passThrough: true, spinMax: 0, trace: [] }
  let prevHeading = null
  while (out.t < tMax) {
    const u = input(out.t, vs)
    vs.throttle = u.throttle ?? 0; vs.brake = u.brake ?? 0; vs.handbrake = !!u.handbrake
    if (u.steer !== undefined) { vs.steerAngle = u.steer; vs.wheelSteerAngles[0] = vs.wheelSteerAngles[1] = u.steer }
    stepPhysics(vs, P, DT, queryContacts, ctx); out.t += DT
    fwd.set(0, 0, -1).applyQuaternion(vs.quaternion); right.set(1, 0, 0).applyQuaternion(vs.quaternion); up.set(0, 1, 0).applyQuaternion(vs.quaternion)
    const vF = vs.velocity.dot(fwd), vL = vs.velocity.dot(right), speed = Math.hypot(vF, vL)
    for (const i of [2, 3]) out.slide += Math.max(0, vs.slipVel[i] - SLIP_FLOOR) * DT
    const r = P.wheelRadius, vRef = 0.5 * Math.abs(vs.wheelOmega[0] + vs.wheelOmega[1]) * r
    const v2 = Math.abs(vs.wheelOmega[2]) * r, v3 = Math.abs(vs.wheelOmega[3]) * r
    const vHi = Math.max(v2, v3)
    if (vs.throttle > 0.5 || vs.brake > 0.5) { out.sigSum += (vHi - vRef) / Math.max(vHi, vRef, 1); out.sigN++ }
    out.gapMax = Math.max(out.gapMax, Math.abs(v2 - v3))
    out.spinMax = Math.max(out.spinMax, vHi - vRef)
    if (speed > 3) out.betaMax = Math.max(out.betaMax, Math.atan2(Math.abs(vL), Math.abs(vF)) * 180 / Math.PI)
    const heading = Math.atan2(-fwd.x, -fwd.z)
    if (prevHeading !== null) { let d = heading - prevHeading; d -= 2 * Math.PI * Math.round(d / (2 * Math.PI)); out.yaw += d }
    prevHeading = heading
    if (vs.traction) {
      out.capMin = Math.min(out.capMin, vs.traction.cap); out.pMax = Math.max(out.pMax, vs.traction.p[2], vs.traction.p[3])
      if (vs.traction.cap !== 1 || vs.traction.p[2] || vs.traction.p[3]) out.passThrough = false
    }
    const yawRate = vs.angularVelocity.dot(up), rRef = 0.5 * (vs.wheelOmega[0] + vs.wheelOmega[1]) * r * Math.tan(vs.steerAngle) / P.wheelbase
    out.trace.push([out.t, vF, vL, vHi - vRef, vs.traction?.cap ?? 1, yawRate, rRef])
    if (until(vs, out.t, vF)) break
  }
  out.speed = Math.hypot(vs.velocity.x, vs.velocity.z)
  out.yawDeg = Math.abs(out.yaw) * 180 / Math.PI
  out.sigMean = out.sigN ? out.sigSum / out.sigN : 0
  out.state = [vs.position.x, vs.position.y, vs.position.z, ...vs.wheelOmega]
  ctx.dispose()
  return out
}

/** The keyboard's pedal: a 0 → `to` ramp at throttleRampRate (250 ms to full). */
const rampKbd = (t, to = 1) => Math.min(to, t * RANGER_PARAMS.throttleRampRate)
const fwdLaunch = (kbd) => (t) => ({ throttle: kbd ? rampKbd(t) : 1 })
const revLaunch = (kbd) => (t) => ({ brake: kbd ? rampKbd(t) : 1 })
const to30 = (vs, t, vF) => vF >= 30 * MPH
const toRev5 = (vs, t, vF) => vF <= -5

const r1 = (x) => x.toFixed(1), r2 = (x) => x.toFixed(2)

if (process.argv.includes('--matrix')) {
  console.log('diff   ground      rear  dir  input  assist        t(s)   slide(m)  gap max  σ mean  cap min  TC p max')
  for (const diff of ['open', 'lsd']) {
    for (const [gname, g] of [['flat', {}], ['off-camber', { slope: 0.25 }], ['split', { muScale: [1, 1, 0.35, 1] }]]) {
      for (const [wname, worn] of [['new', 1], ['worn', 0.7]]) {
        for (const dir of ['fwd', 'rev']) {
          for (const kbd of [true, false]) {
            for (const [aname, a] of [['off', {}], ['throttle', { ta: true }], ['TC', { tc: true }]]) {
              const muScale = (g.muScale ?? [1, 1, 1, 1]).map((m, i) => i === 2 ? m * worn : m)
              const o = await drive({ diff, ...g, muScale, ...a, input: dir === 'fwd' ? fwdLaunch(kbd) : revLaunch(kbd), until: dir === 'fwd' ? to30 : toRev5, tMax: 20 })
              console.log(`${diff.padEnd(6)} ${gname.padEnd(11)} ${wname.padEnd(5)} ${dir}  ${kbd ? 'kbd' : 'pad'}    ${aname.padEnd(9)}  ${r2(o.t).padStart(6)} ${r1(o.slide).padStart(9)} ${r1(o.gapMax).padStart(8)} ${r2(o.sigMean).padStart(7)} ${r2(o.capMin).padStart(8)} ${r2(o.pMax).padStart(9)}`)
            }
          }
        }
      }
    }
  }
  process.exit(0)
}

const fails = []
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg) }

// ── Throttle assist: launches, keyboard and pad ───────────────────────────────────────────────────
const off = await drive({ input: fwdLaunch(true), until: to30 })
const on = await drive({ ta: true, input: fwdLaunch(true), until: to30 })
let best = null
for (let p = 0.3; p <= 1.001; p += 0.1) {
  const o = await drive({ input: () => ({ throttle: p }), until: to30 })
  if (!best || o.t < best.t) best = { ...o, p }
}
const onPad = await drive({ ta: true, input: fwdLaunch(false), until: to30 })
console.log(`0–30 mph keyboard: off ${r2(off.t)} s / slide ${r1(off.slide)} m / σ ${r2(off.sigMean)} · on ${r2(on.t)} s / slide ${r1(on.slide)} m / σ ${r2(on.sigMean)}`)
console.log(`0–30 mph pad: best fixed pedal ${r1(best.p)} ${r2(best.t)} s / slide ${r1(best.slide)} m · on, floored ${r2(onPad.t)} s / slide ${r1(onPad.slide)} m`)
check(on.sigMean > 0.2 && on.sigMean < 0.45, `throttle assist holds the rears near target (σ mean ${r2(on.sigMean)})`)
check(on.t <= off.t * 1.03, `keyboard launch ≤ 1.03 × unassisted (${r2(on.t)} vs ${r2(off.t)} s)`)
check(onPad.t <= best.t * 1.04, `pad launch ≤ 1.04 × the best fixed pedal (${r2(onPad.t)} vs ${r2(best.t)} s)`)
check(on.slide <= 0.8 * off.slide && onPad.slide <= 0.5 * best.slide, `launch tread wear down (keyboard ${r1(on.slide)} vs ${r1(off.slide)} m, pad ${r1(onPad.slide)} vs ${r1(best.slide)} m)`)

const revOff = await drive({ input: revLaunch(true), until: toRev5 })
const revOn = await drive({ ta: true, input: revLaunch(true), until: toRev5 })
console.log(`reverse 0–5 m/s keyboard: off ${r2(revOff.t)} s / slide ${r1(revOff.slide)} m · on ${r2(revOn.t)} s / slide ${r1(revOn.slide)} m`)
check(revOn.slide <= 0.2 * revOff.slide && revOn.t <= revOff.t * 1.05, `reverse: tread wear ≤ 0.2 × and time ≤ 1.05 × unassisted (${r1(revOn.slide)} vs ${r1(revOff.slide)} m, ${r2(revOn.t)} vs ${r2(revOff.t)} s)`)

console.log(`burnout (assist off, pad floored at rest): rear spin ${r1(best.spinMax)} m/s over the fronts`)
check(best.spinMax > 5, `with the assist off a floored launch spins the rears (${r1(best.spinMax)} m/s)`)

// ── Throttle assist: out of the way of a drift and a handbrake U-turn ─────────────────────────────
// A handbrake flick into full throttle: while the truck out-rotates its steering the assist must pass the
// pedal untouched, so the first second is the same run with or without it.
const flick = (t) => t < 0.5 ? { steer: 0.35, handbrake: true } : { steer: -0.2, throttle: 1 }
const fOff = await drive({ v0: 10, input: flick, tMax: 0.9 })
const fOn = await drive({ ta: true, v0: 10, input: flick, tMax: 0.9 })
console.log(`handbrake flick, floored: yaw over 0.9 s off ${r1(fOff.yawDeg)}° / on ${r1(fOn.yawDeg)}°, rear spin ${r1(fOff.spinMax)} / ${r1(fOn.spinMax)} m/s`)
check(fOn.state.every((x, i) => x === fOff.state[i]), 'the assist passes the throttle through while the truck out-rotates its steering (identical run)')
// Power-over on loose ground: the rears step out before the assist can hold them, and it then stands aside.
const powerDrift = (t) => ({ steer: 0.15, throttle: t < 2 ? 0.25 : 1 })
const looseOff = await drive({ mu: 0.5, v0: 8, steer0: 0.15, input: powerDrift, tMax: 4.5 })
const looseOn = await drive({ ta: true, mu: 0.5, v0: 8, steer0: 0.15, input: powerDrift, tMax: 4.5 })
const dryOff = await drive({ v0: 8, steer0: 0.15, input: powerDrift, tMax: 4.5 })
const dryOn = await drive({ ta: true, v0: 8, steer0: 0.15, input: powerDrift, tMax: 4.5 })
console.log(`power-over at 8 m/s: loose (μ 0.5) β off ${r1(looseOff.betaMax)}° / on ${r1(looseOn.betaMax)}° · dry β off ${r1(dryOff.betaMax)}° / on ${r1(dryOn.betaMax)}° (dry: the foot feathers it — report only)`)
check(looseOn.betaMax > 0.8 * looseOff.betaMax, `power drift on loose ground with the assist on (β ${r1(looseOn.betaMax)}° vs ${r1(looseOff.betaMax)}°)`)

const uTurn = (t) => ({ steer: 0.5, handbrake: t < 1.2, throttle: t > 0.6 ? 1 : 0 })
const uOff = await drive({ v0: 10, input: uTurn, tMax: 3.5 })
const uOn = await drive({ ta: true, v0: 10, input: uTurn, tMax: 3.5 })
console.log(`handbrake U-turn from 10 m/s: heading change off ${r1(uOff.yawDeg)}° / on ${r1(uOn.yawDeg)}°`)
check(Math.abs(uOn.yawDeg - uOff.yawDeg) <= 0.1 * uOff.yawDeg, `the U-turn is the same with the throttle assist on (${r1(uOn.yawDeg)}° vs ${r1(uOff.yawDeg)}°)`)

// ── Traction control: split grip, open diff ───────────────────────────────────────────────────────
const SPLIT = { muScale: [1, 1, 0.35, 1] }
const to10 = (vs, t, vF) => vF >= 10
const splitOff = await drive({ ...SPLIT, input: fwdLaunch(false), until: to10 })
const splitOn = await drive({ tc: true, ...SPLIT, input: fwdLaunch(false), until: to10 })
console.log(`split grip 0–10 m/s, open diff: off ${r2(splitOff.t)} s, gap max ${r1(splitOff.gapMax)} m/s · TC ${r2(splitOn.t)} s, gap max ${r1(splitOn.gapMax)} m/s, brake p max ${r2(splitOn.pMax)}`)
check(splitOn.t < 0.8 * splitOff.t, `TC launches faster on split grip (${r2(splitOn.t)} vs ${r2(splitOff.t)} s)`)
check(splitOn.gapMax < 0.5 * splitOff.gapMax, `TC brakes the one-wheel spin down (gap ${r1(splitOn.gapMax)} vs ${r1(splitOff.gapMax)} m/s)`)

// ── Traction control: a power-oversteer entry on dry ground ───────────────────────────────────────
const OVER = { v0: 8, steer0: 0.25, input: (t) => ({ steer: 0.25, throttle: t < 2 ? 0.25 : 1 }), tMax: 4.5 }
const tcOff = await drive(OVER)
const tcOn = await drive({ tc: true, ...OVER })
console.log(`power-oversteer entry (8 m/s, δ 0.25, floored): off β ${r1(tcOff.betaMax)}° · TC β ${r1(tcOn.betaMax)}°`)
check(tcOff.betaMax > 30, `the baseline really oversteers (β ${r1(tcOff.betaMax)}°)`)
check(tcOn.betaMax < 15, `TC catches it (β ${r1(tcOn.betaMax)}° < 15°)`)

// ── Both off: pass-through, identical to no controller at all ─────────────────────────────────────
const none = await drive({ traction: false, input: fwdLaunch(true), until: to30 })
check(off.passThrough, 'both off: cap 1 and no TC pressure on every step')
check(none.state.every((x, i) => x === off.state[i]) && none.t === off.t, 'both off: the run is bit-identical to no controller')

if (fails.length) { console.log(`\n${fails.length} FAIL`); process.exit(1) }
console.log('\ntraction: all PASS')
