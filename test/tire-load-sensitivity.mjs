// test/tire-load-sensitivity.mjs — FEAT-80 gate: grip is NOT linear in load.
//
// Owner ruling 2026-09-08: "tire friction scales indefinitely with normal force" was the bump
// yaw-kick — a 16–21 kN landing spike let one wheel push 4–5× its static grip sideways for a frame.
// gripLoad(Fn) maps the normal load to the grip-carrying load: a Pacejka-pDy2 linear falloff across
// the normal range, then a hard knee at the carcass's rated load past which grip FALLS, floored so an
// overloaded tire is never a puck. This gate pins the shape at the shipped defaults and pins that the
// off switch (sensitivity 0, overload drop 0) is the pre-FEAT-80 model bit-for-bit, so every older
// physics gate still measures what it says it measures when it runs with the load terms zeroed.
//
// Pure tire.js maths — no engine, no THREE.

import { computeTireForces, gripLoad } from '../src/tire.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'

let fails = 0
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails++ }

const F0 = P.tireNominalLoad, Fr = P.tireRatedLoad
check(F0 > 0 && P.tireLoadSensitivity > 0 && Fr > F0 && P.tireOverloadDrop > 0,
  `defaults are ON: F0 ${F0} N, k ${P.tireLoadSensitivity}, Fr ${Fr} N, drop ${P.tireOverloadDrop}`)

// §1 identity at the nominal load, zero when airborne.
check(Math.abs(gripLoad(F0, P) - F0) < 1e-3 * F0, `Fg(F0) ≈ F0 within 0.1 % (softplus tail) (${gripLoad(F0, P).toFixed(1)})`)
check(gripLoad(0, P) === 0, 'Fg(0) == 0 — an airborne wheel has no grip')

// §2 shape: rises to a peak near the rated load, then falls hard, never below the floor, C0 everywhere.
let prev = 0, peakF = 0, peakFn = 0, maxStep = 0, monoUpToKnee = true
for (let Fn = 0; Fn <= 30000; Fn += 10) {
  const Fg = gripLoad(Fn, P)
  if (Fn <= Fr && Fg < prev - 1e-9) monoUpToKnee = false
  if (Fg > peakF) { peakF = Fg; peakFn = Fn }
  maxStep = Math.max(maxStep, Math.abs(Fg - prev))
  prev = Fg
}
check(monoUpToKnee, 'Fg is monotone non-decreasing up to the rated load')
check(peakFn >= 0.9 * Fr && peakFn <= 1.3 * Fr, `Fg peaks near the rated load (peak ${peakF.toFixed(0)} N at ${peakFn} N)`)
const at2Fr = gripLoad(2 * Fr, P)
check(at2Fr < 0.5 * peakF, `2×rated carries < half the peak grip load (${at2Fr.toFixed(0)} vs ${peakF.toFixed(0)} N)`)
check(gripLoad(3 * Fr, P) >= 0.15 * Fr - 1e-9, `3×rated still holds the floor (${gripLoad(3 * Fr, P).toFixed(0)} ≥ ${0.15 * Fr})`)
check(maxStep < 25, `no jump: max Δ per 10 N step ${maxStep.toFixed(2)} N`)

// §3 weight transfer costs an axle grip: Fg(F0+Δ) + Fg(F0−Δ) < 2·Fg(F0) for every Δ.
let transferCosts = true
for (let d = 100; d <= F0; d += 100) {
  if (gripLoad(F0 + d, P) + gripLoad(F0 - d, P) >= 2 * gripLoad(F0, P) - 1e-9) transferCosts = false
}
check(transferCosts, 'lateral load transfer reduces the axle grip sum')

// §4 the knee bounds a landing spike: at 18 kN (measured SM-3 landing peak) grip is < 1.2× static.
check(gripLoad(18000, P) < 1.2 * F0, `18 kN landing carries ${gripLoad(18000, P).toFixed(0)} N of grip load (< 1.2× static ${F0})`)

// §5 off switch == old model, bit-for-bit, through computeTireForces.
const OFF = { ...P, tireLoadSensitivity: 0, tireOverloadDrop: 0 }
let identical = true
for (const Fn of [0, 500, 3400, 9000, 18000, 40000]) {
  for (const [sx, sy] of [[0, 0], [0.02, 0], [0, 0.05], [0.1, -0.07], [0.5, 0.5]]) {
    const a = computeTireForces(sx, sy, Fn, OFF, 1)
    const mu = OFF.frictionCoeff, C = Math.max(1, Math.min(1.99, OFF.pacejkaC)), B = OFF.pacejkaB, E = OFF.pacejkaE
    const sMag = Math.hypot(sx * (OFF.tireStiffnessLong ?? 1), sy * (OFF.tireStiffnessLat ?? 1))
    const x = sMag / (OFF.tireSlipVelRef ?? 1), Bx = B * x
    const Fmag = mu * Fn * OFF.pacejkaD * Math.sin(C * Math.atan(Bx - E * (Bx - Math.atan(Bx))))
    const want = sMag < 1e-9 ? 0 : Math.hypot(Fmag * sx / sMag, Fmag * sy / sMag)
    if (Math.abs(Math.hypot(a.Flong, a.Flat) - want) > 1e-9 * Math.max(1, want)) identical = false
  }
}
check(identical, 'sensitivity 0 + drop 0 reproduces μ·Fn·D·Pacejka exactly')

// §6 the live path uses it: at the defaults a 9 kN wheel makes LESS force than linear would.
const live = computeTireForces(0.5, 0, 9000, P, 1), lin = computeTireForces(0.5, 0, 9000, OFF, 1)
check(Math.abs(live.Flong) < 0.85 * Math.abs(lin.Flong), `computeTireForces at 9 kN: ${live.Flong.toFixed(0)} N vs linear ${lin.Flong.toFixed(0)} N`)

console.log(fails ? `\n${fails} FAIL` : '\nALL PASS')
process.exit(fails ? 1 : 0)
