// GATE (BUG-244): the automatic does not hunt at steady inputs.
//
// The owner (2026-11-19): "The automatic transmission hunts and seeks really bad". A steady input on a
// constant grade must not make the box change its mind: this gate drives the full vehicle (stepPhysics, the
// game's own tires/struts/drivetrain) on an infinite analytic plane, sweeps grade × input × starting speed
// (the input a pad held still, or a keyboard feathering W at a fixed duty), and counts REVERSALS: a shift
// answered by the opposite shift within REVERSE_S. Where no gear holds a steady speed at that input the box
// may still change gear (the driver closes that loop), but never back within REVERSE_S.
//
// Starting speed is set with the truck already in the gear whose coupled rpm sits nearest 2000, and the box
// held for its first second while its acceleration estimate warms up, so the opening shifts are the box
// choosing on a measured road, not the harness handing it a state. An upshift at the WOT upshift point
// (a kickdown revving out) is the engine out of rpm, not a change of mind, and is not counted.
//
// Run: node test/shift-hunt.mjs [--map]   (--map prints every cell; self-checking, exits non-zero on a hunt)

import * as THREE from 'three'
import { stepPhysics } from '../src/physics.js'
import { computeStaticEquilibrium } from '../src/suspension.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { TRANSMISSIONS } from '../data/transmissions.js'
import { makeEngineCtx } from './lib/engine-ctx.mjs'

const DT = 1 / 60, RPM_PER_RAD = 60 / (2 * Math.PI)
// A reversal within 4 s of the shift it undoes is a hunt. On main (2026-11-20) the hunting cells reversed every
// 3.1–4.5 s (1-2-1 at 30 ↔ 36 km/h on 12–15 %); the fix's minimum stay (shiftLookahead) is 4 s.
const RUN_S = 40, REVERSE_S = 4
const MAP = process.argv.includes('--map')
const GRADES = [0, 0.02, 0.04, 0.06, 0.08, 0.10, 0.12, 0.15]
// A pad held at a fixed pedal, and a keyboard feathering W: held for `duty` of every second through the
// game's own press/release ramps (throttleRampRate / releaseRampRate), as test/shift-schedule.mjs does.
const PEDALS = [0.15, 0.25, 0.35, 0.5, 0.7, 1.0, { duty: 0.3 }, { duty: 0.5 }, { duty: 0.7 }]
const label = (p) => typeof p === 'number' ? `pedal ${p.toFixed(2)}` : `W ${(p.duty * 100).toFixed(0)} %  `
const SPEEDS = [20, 50, 80, 110]   // km/h at the start

function freshParams (box) {
  const P = { ...RANGER_PARAMS, ...TRANSMISSIONS[box] }
  P._tireFz = [0, 0, 0, 0]; P._suspForceAccum = [0, 0, 0, 0]
  P._hubNormalXZ = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 }))
  return P
}

// One cell: a steady pedal on a constant grade from v0. Returns the shift list and the hunts in it.
export async function runCell (box, grade, pedal, kmh, ctx, { runS = RUN_S, stop = null, gear = null } = {}) {
  const P = freshParams(box)
  let key = 0
  const pedalAt = typeof pedal === 'number' ? () => pedal
    : (t) => (key = (t % 1) < pedal.duty ? Math.min(1, key + P.throttleRampRate * DT) : Math.max(0, key - P.releaseRampRate * DT))
  const p0 = typeof pedal === 'number' ? pedal : pedal.duty
  const tanT = grade, theta = Math.atan(grade)
  const N = new THREE.Vector3(0, Math.cos(theta), Math.sin(theta))
  const queryContacts = (cx, cy, cz, r) => {
    const h = -tanT * cz, gd = h + r - cy
    return gd > 0 ? [{ normal: N.clone(), depth: gd, contactPoint: new THREE.Vector3(cx, h, cz) }] : []
  }
  const eq = computeStaticEquilibrium(P)
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), N)
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(quat)
  const v0 = kmh / 3.6, w0 = v0 / P.wheelRadius
  const coupledIn = (g) => w0 * P.gearRatios[g - 1] * P.finalDrive * RPM_PER_RAD / P.converterCouplingSR
  let g0 = 1
  for (let g = 1; g <= P.gearRatios.length; g++) if (Math.abs(coupledIn(g) - 2000) < Math.abs(coupledIn(g0) - 2000)) g0 = g
  if (gear) g0 = gear   // a stale gear, as a re-seat can leave it
  const vs = {
    position: new THREE.Vector3(0, 0, 0).addScaledVector(N, eq.bodyY), velocity: fwd.clone().multiplyScalar(v0),
    quaternion: quat.clone(), angularVelocity: new THREE.Vector3(),
    steerAngle: 0, throttle: p0, brake: 0, smoothThrottle: p0, smoothBrake: 0,
    wheelSteerAngles: [0, 0, 0, 0],
    wheelDebug: [0, 1, 2, 3].map(() => ({ fn: 0, fy: 0, sa: 0, c: 0, omega: 0, fz: 0 })),
    wheelOmega: [w0, w0, w0, w0], slipLong: [0, 0, 0, 0], slipLat: [0, 0, 0, 0],
    strutComp: [...eq.strutComp], strutCompVel: [0, 0, 0, 0], handbrake: false,
    drivetrain: { engineRPM: 750, gear: g0, shiftTimer: 1, activeGear: g0, throttleAvg: p0 },   // 1 s: the box's acceleration estimate warms up before it may shift
  }
  const shifts = []
  let g = g0, rpm = 0, dist = 0, tStop = null
  for (let s = 1; s <= runS / DT; s++) {
    vs.throttle = pedalAt(s * DT); vs.brake = 0
    // The driven axle's rpm in this gear as the box reads it this step: the rev-out test (engine out of rpm).
    const axleRpm = 0.5 * (vs.wheelOmega[2] + vs.wheelOmega[3]) * P.gearRatios[g - 1] * P.finalDrive * RPM_PER_RAD / P.converterCouplingSR
    stepPhysics(vs, P, DT, queryContacts, ctx)
    const d = vs.drivetrain, ng = d.shifting ? d.shiftTo : d.gear   // the box's decision: autoShiftTime's drive cut runs on top
    if (ng !== g) { shifts.push({ t: s * DT, from: g, to: ng, kmh: vs.velocity.dot(fwd) * 3.6, rpm, axleRpm, spin: d.wheelspin }); g = ng }
    rpm = d.coupledRPM
    const v = vs.velocity.dot(fwd); dist += v * DT
    if (stop && stop(v * 3.6, dist)) { tStop = s * DT; break }
  }
  const hunts = []
  for (let i = 1; i < shifts.length; i++) {
    const a = shifts[i - 1], b = shifts[i]
    // An upshift with the driven axle at the WOT upshift point is the engine out of rpm (a kickdown revving out,
    // spinning or not), never a hunt.
    if (b.to === a.from && b.t - a.t < REVERSE_S && !(b.to > b.from && b.axleRpm >= P.shiftUpRPM)) hunts.push({ pair: `${Math.min(a.from, a.to)}-${Math.max(a.from, a.to)}`, dt: b.t - a.t })
  }
  return { g0, shifts, hunts, tStop, vEnd: vs.velocity.dot(fwd) * 3.6, gEnd: g }
}

const newCtx = async (box) => makeEngineCtx({ position: { x: 0, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } }, freshParams(box))
// Performance from rest (report): 0–100 km/h floored on the flat, and a climb of 400 m up 10 % and 15 %
// floored and at half pedal. A hunt fix must leave these unchanged or better.
export async function perf (box) {
  const out = {}
  const run = async (key, grade, pedal, stop) => { const ctx = await newCtx(box); out[key] = (await runCell(box, grade, pedal, 0, ctx, { runS: 120, stop })).tStop; ctx.dispose() }
  await run('0-100 flat WOT', 0, 1, (k) => k >= 100)
  await run('0-60 flat 50%', 0, 0.5, (k) => k >= 60)
  for (const gr of [0.10, 0.15]) for (const p of [1, 0.5]) await run(`400 m up ${gr * 100}% at ${p * 100}%`, gr, p, (k, d) => d >= 400)
  return out
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--perf')) {
    for (const box of ['4r44e', '5r55e']) console.log(box, JSON.stringify(Object.fromEntries(Object.entries(await perf(box)).map(([k, v]) => [k, v && +v.toFixed(2)]))))
    process.exit(0)
  }
  let failures = 0
  for (const box of ['4r44e', '5r55e']) {
    let cells = 0, bad = 0, total = 0
    const pairs = {}, periods = []
    for (const grade of GRADES) for (const pedal of PEDALS) for (const kmh of SPEEDS) {
      // A fresh world per cell: the chassis body carries the last cell's pose otherwise.
      const ctx = await newCtx(box)
      const r = await runCell(box, grade, pedal, kmh, ctx)
      ctx.dispose()
      cells++
      if (r.hunts.length) {
        bad++; total += r.hunts.length
        for (const h of r.hunts) { pairs[h.pair] = (pairs[h.pair] || 0) + 1; periods.push(h.dt) }
      }
      if (MAP || r.hunts.length) console.log(`  ${box} ${(grade * 100).toFixed(0).padStart(2)}% ${label(pedal)} from ${String(kmh).padStart(3)} km/h (gear ${r.g0}): ` +
        `${r.shifts.length} shifts, ${r.hunts.length} hunts, ends gear ${r.gEnd} at ${r.vEnd.toFixed(0)} km/h` +
        (r.hunts.length ? `  [${r.shifts.map(s => `${s.from}→${s.to}@${s.t.toFixed(1)}`).join(' ')}]` : ''))
    }
    periods.sort((a, b) => a - b)
    const med = periods.length ? periods[periods.length >> 1].toFixed(2) : '—'
    console.log(`${box}: ${bad}/${cells} cells hunt, ${total} reversals, median reversal ${med} s, pairs ${JSON.stringify(pairs)}`)
    if (bad) failures++
  }
  console.log(`\nSHIFT-HUNT GATE: ${failures ? `${failures} box(es) hunt` : 'no reversal within ' + REVERSE_S + ' s at steady inputs ✓'}`)
  process.exit(failures ? 1 : 0)
}
