// GATE (FEAT-124, owner 2026-10-19 — ONE schedule, no modes): the automatic's shift points follow a
// time-weighted throttle average.
//
// Drives stepDrivetrain alone with the rear wheels PINNED to a slow road-speed ramp (the fuel-map gate's
// method), so the shift logic is measured with nothing else in the loop:
//   1. floored = today's schedule: every upshift at shiftUpRPM (both engines, both boxes);
//   2. a light foot short-shifts: first upshift far below shiftUpRPM, top gear by 60 mph;
//   3. a keyboard feathering W through the real ramps shifts like a pad held at the same average,
//      and neither hunts;
//   4. kickdown: a floor held kickdownDelay drops a gear, a feathered tap does not.
//
// Run: node test/shift-schedule.mjs   (self-checking; exits non-zero on failure)

import { stepDrivetrain } from '../src/drivetrain.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { ENGINES } from '../data/engines.js'
import { TRANSMISSIONS } from '../data/transmissions.js'
import { makeIgnitionState, RUNNING } from '../src/ignition.js'

const DT = 1 / 60, MS_PER_MPH = 0.44704
let failures = 0
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗'} ${msg}`); if (!ok) failures++ }

// Ramp road speed from 0 at `mphPerS`, the pedal given per step by pedalAt(t, P). Returns every shift
// as { t, mph, from, to, rpm } (rpm = the coupled rpm it shifted at).
function ramp (P, pedalAt, { mphPerS = 1, toMph = 110 } = {}) {
  const vs = { throttle: 0, brake: 0, wheelOmega: [0, 0, 0, 0], ignition: makeIgnitionState(RUNNING) }
  const shifts = []
  let g = 1
  for (let i = 0; ; i++) {
    const t = i * DT, mph = t * mphPerS
    if (mph > toMph) break
    const v = mph * MS_PER_MPH
    vs.throttle = pedalAt(t, P)
    vs.wheelOmega.fill(v / P.wheelRadius)
    const before = vs.drivetrain?.coupledRPM ?? 0
    stepDrivetrain(vs, P, DT, v)
    if (vs.drivetrain.gear !== g) { shifts.push({ t, mph, from: g, to: vs.drivetrain.gear, rpm: before }); g = vs.drivetrain.gear }
  }
  return { shifts, vs }
}
// A keyboard: W held for `duty` of every second, through the game's own press/release ramps.
const feather = (duty) => {
  let s = 0, last = -1
  return (t, P) => {
    if (t !== last) { s = (t % 1) < duty ? Math.min(1, s + P.throttleRampRate * DT) : Math.max(0, s - P.releaseRampRate * DT); last = t }
    return s
  }
}
// No gear visited, left and re-entered within 1.5 s.
const hunts = (shifts) => shifts.filter((s, i) => i >= 2 && s.to === shifts[i - 2].to && s.t - shifts[i - 2].t < 1.5).length

const boxes = [
  ['V6 + 4R44E', { ...RANGER_PARAMS }],
  ['V6 + 5R55E', { ...RANGER_PARAMS, ...TRANSMISSIONS['5r55e'] }],
  ['I4 + 5R55E', { ...RANGER_PARAMS, ...ENGINES.duratec23, ...TRANSMISSIONS['5r55e'] }],
]

console.log('1. floored = today: every upshift at shiftUpRPM')
for (const [name, P] of boxes) {
  const { shifts } = ramp(P, () => 1, { toMph: 130 })   // the I4's 4→5 at 6000 rpm is ~119 mph
  const n = P.gearRatios.length - 1
  check(shifts.length === n && shifts.every(s => s.to === s.from + 1 && Math.abs(s.rpm - P.shiftUpRPM) < 60),
    `${name}: ${n} upshifts, each at ~${P.shiftUpRPM} rpm (${shifts.map(s => `${Math.round(s.rpm)}@${s.mph.toFixed(0)}mph`).join(', ')})`)
}

console.log('\n2. a light foot short-shifts into the low-rpm cells')
for (const [name, P] of boxes) {
  // The 1→2 point is set by the anti-hunt band, not shiftUpLightRPM: 2nd must land a band above its
  // own downshift point, and the 4R44E's 2.47→1.47 step is 1.68×, so ~3200 rpm on the V6 box.
  const { shifts } = ramp(P, () => 0.25, { toMph: 60 })
  const top = P.gearRatios.length
  check(shifts.length && shifts[0].rpm < 0.65 * P.shiftUpRPM && shifts.at(-1).to === top && hunts(shifts) === 0,
    `${name} at 25 %: first upshift ${Math.round(shifts[0]?.rpm)} rpm (< 65 % of ${P.shiftUpRPM}), top gear ${top} by 60 mph (${shifts.map(s => `${s.from}→${s.to}@${s.mph.toFixed(0)}`).join(' ')})`)
}

console.log('\n3. keyboard feathering shifts like a pad held at the same average')
for (const [name, P] of boxes) {
  const keys = ramp(P, feather(0.4), { toMph: 70 })
  // The keyboard's mean pedal, measured over the same run, held constant on the "pad".
  let sum = 0, n = 0; const f = feather(0.4)
  for (let i = 0; i * DT * 1 <= 70; i++) { sum += f(i * DT, P); n++ }
  const pad = ramp(P, () => sum / n, { toMph: 70 })
  const pairs = pad.shifts.map(p => keys.shifts.find(k => k.from === p.from && k.to === p.to))
  const worst = Math.max(...pad.shifts.map((p, i) => pairs[i] ? Math.abs(pairs[i].mph - p.mph) : Infinity))
  check(hunts(keys.shifts) === 0 && hunts(pad.shifts) === 0 && worst <= 6,
    `${name}, mean ${(sum / n).toFixed(2)}: same upshifts within ${worst.toFixed(1)} mph (≤ 6), no hunting — keys ${keys.shifts.map(s => `${s.from}→${s.to}@${s.mph.toFixed(0)}`).join(' ')} / pad ${pad.shifts.map(s => `${s.from}→${s.to}@${s.mph.toFixed(0)}`).join(' ')}`)
}

console.log('\n4. kickdown: a held floor drops a gear, a feathered tap does not')
{
  const P = { ...RANGER_PARAMS }
  // Cruise 40 mph on a light foot (3rd, ~2000 rpm — under kickdownRPM), then floor it or tap it once.
  const run = (tapS) => {
    const v = 40 * MS_PER_MPH
    const vs = { throttle: 0.2, brake: 0, wheelOmega: [0, 0, 0, 0].fill(v / P.wheelRadius), ignition: makeIgnitionState(RUNNING) }
    for (let i = 0; i < 20 / DT; i++) stepDrivetrain(vs, P, DT, v)
    const g0 = vs.drivetrain.gear
    let downAt = null
    for (let i = 0; i < 3 / DT; i++) {
      vs.throttle = i * DT < tapS ? 1 : 0.2
      stepDrivetrain(vs, P, DT, v)
      if (downAt === null && vs.drivetrain.gear < g0) downAt = i * DT
    }
    return { g0, downAt }
  }
  const floor = run(3), tap = run(0.3)
  check(floor.downAt !== null && floor.downAt >= P.kickdownDelay - DT && floor.downAt < P.kickdownDelay + 0.2,
    `floored from gear ${floor.g0} at 40 mph: kicks down after ${floor.downAt?.toFixed(2)} s (kickdownDelay ${P.kickdownDelay} s)`)
  check(tap.downAt === null, `a 0.3 s tap at the floor does not (gear ${tap.g0} held)`)
}

console.log(`\nSHIFT-SCHEDULE GATE: ${failures ? `${failures} FAILURE(S)` : 'all checks passed ✓'}`)
process.exit(failures ? 1 : 0)
