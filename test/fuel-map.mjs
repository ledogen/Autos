// GATE (FEAT-50): the fuel map and the tank. Pure math, no world: buildFuelMap is a function of the
// engine entry, and stepFuel / stepDrivetrain are called directly with a hand-built vehicleState.
//
// What it locks down:
//   1. The Vulcan 3.0's table lands on its real-data anchors: idle burn, best-BSFC level and where
//      the efficient island sits, and steady top-gear cruise mpg on the truck's own road load
//      (fueleconomy.gov 2002 Ranger 2WD 3.0 L auto: 15 / 20 / 17 mpg).
//   2. Shape: burn rises with pedal at every rpm and with rpm at every pedal; decel fuel cut-off is
//      exactly zero; the lookup agrees with the model between grid points.
//   3. Engines are data: a patched engine entry builds a different table without touching the base.
//   4. Driving style shows up: a light foot at 55 mph burns far less than flooring it at 55 mph,
//      through the real drivetrain (the box kicks down, rpm climbs, the cells get hot).
//   5. The tank: an empty tank kills the engine and it cannot catch; free roam's floor never runs dry.
//   6. The low-fuel sputter: it starts with ~2 real minutes of fuel left, stumbles irregularly at ~10 s
//      on average, tighter and deeper toward empty, takes real torque, and is deterministic.
//
// Run: node test/fuel-map.mjs [--print]     (--print dumps the whole table for review)

import { buildFuelMap, fuelRateGph, fuelGramsPerS, fuelMapFor, stepFuel, makeFuelState } from '../src/fuel.js'
import { InventorySystem } from '../src/inventory.js'
import { stepDrivetrain, engineTorqueAt } from '../src/drivetrain.js'
import { catchTime, makeIgnitionState, RUNNING } from '../src/ignition.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { ENGINES } from '../data/engines.js'
import { TRANSMISSIONS } from '../data/transmissions.js'

const DT = 1 / 60
let failures = 0
const check = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) failures++ }
const P = { ...RANGER_PARAMS }
const map = buildFuelMap(P)
const KG_PER_GAL = 2.82

if (process.argv.includes('--print')) {
  const cols = map.pedals.filter((_, j) => j % 2 === 0)
  for (const [label, grid, fmt] of [['gal/h', map.gph, v => v.toFixed(2)], ['BSFC g/kWh', map.bsfc, v => (isNaN(v) ? '-' : Math.round(v) + '')]]) {
    console.log(`\n${label}  rpm \\ pedal ` + cols.map(p => p.toFixed(1).padStart(6)).join(''))
    map.rpms.forEach((r, i) => console.log(String(r).padStart(18) + map.pedals.map((_, j) => j % 2 ? null : fmt(grid[i][j]).padStart(6)).filter(Boolean).join('')))
  }
}

console.log('\n1. real-data anchors')
const idle = fuelRateGph(map, P.engineIdleRPM, 0)
check(idle >= 0.25 && idle <= 0.5, `idle ${idle.toFixed(2)} gal/h within 0.25–0.5 (a 3 L V6 idles on ~0.3–0.5)`)
let best = { v: Infinity }
map.rpms.forEach((r, i) => map.pedals.forEach((p, j) => { if (map.bsfc[i][j] < best.v) best = { v: map.bsfc[i][j], r, p } }))
check(best.v >= 250 && best.v <= 310, `best BSFC ${best.v.toFixed(0)} g/kWh within 250–310 (old pushrod two-valve)`)
check(best.r >= 1500 && best.r <= 3000 && best.p >= 0.6, `…at ${best.r} rpm, pedal ${best.p} — low rpm, high load (lug it, don't rev it)`)

// Steady top gear on the params' own road load: aero ½ρ·CdA·v² + rolling Cr·m·g, the same terms
// physics.js applies. Top gear coupled rpm from road speed; pedal = the torque that load needs.
const cruiseMpg = (mph, Q = P, m = map) => {
  const v = mph * 0.44704
  const F = 0.5 * 1.225 * Q.aeroDragArea * v * v + Q.rollingResistanceCoeff * Q.mass * 9.81
  const rpm = v / Q.wheelRadius * Q.gearRatios.at(-1) * Q.finalDrive * 30 / Math.PI
  const pedal = F * v / (rpm * Math.PI / 30) / engineTorqueAt(rpm, Q.engineTorqueCurve)
  return mph / fuelRateGph(m, rpm, pedal)
}
const m55 = cruiseMpg(55), m60 = cruiseMpg(60), m70 = cruiseMpg(70)
check(m55 >= 22 && m55 <= 30, `steady 55 mph ${m55.toFixed(1)} mpg within 22–30 (EPA lab hwy ≈ 26, sticker 20)`)
check(m60 > m70, `60 mph (${m60.toFixed(1)}) beats 70 mph (${m70.toFixed(1)}) — aero costs`)

console.log('\n2. shape')
let monoP = true, monoR = true
map.rpms.forEach((r, i) => { for (let j = 2; j < map.pedals.length; j++) if (map.gph[i][j] <= map.gph[i][j - 1]) monoP = false })
// Up to peak power only: past ~5000 rpm the WOT curve falls away (5800 → 150 N·m), so a fixed pedal
// FRACTION moves less air and honestly burns less. That is the curve's shape, not a table fault.
for (let j = 1; j < map.pedals.length; j++) for (let i = 1; map.rpms[i] <= 5000; i++) if (map.gph[i][j] <= map.gph[i - 1][j]) monoR = false
check(monoP, 'burn rises with pedal at every rpm')
check(monoR, 'burn rises with rpm at every pedal, up to peak power')
check(fuelRateGph(map, 2500, 0) === 0 && fuelRateGph(map, 1300, 0) === 0, 'decel fuel cut-off: a lifted foot above dfcoRPM burns exactly nothing')
check(fuelRateGph(map, 1100, 0) > 0.3, `…and below it the engine is fuelled, not half-cut (${fuelRateGph(map, 1100, 0).toFixed(2)} gal/h at 1100)`)
let worst = 0
for (const [r, p] of [[1630, 0.37], [2210, 0.52], [3333, 0.81], [4890, 0.12], [900, 0.03]]) {
  const exact = fuelGramsPerS(P, r, p) * 3.6 / KG_PER_GAL
  worst = Math.max(worst, Math.abs(fuelRateGph(map, r, p) - exact) / exact)
}
check(worst < 0.02, `bilinear lookup within 2 % of the model between grid points (worst ${(worst * 100).toFixed(2)} %)`)

console.log('\n3. engines are data')
const upgraded = buildFuelMap({ ...P, ...ENGINES.vulcan30, etaIndicated: 0.40 })
check(upgraded.gph[8][12] < map.gph[8][12], `a patched entry (η 0.375 → 0.40) builds its own, leaner table (${upgraded.gph[8][12].toFixed(2)} vs ${map.gph[8][12].toFixed(2)} gal/h)`)
check(ENGINES.vulcan30.etaIndicated === 0.375 && buildFuelMap(P).gph[8][12] === map.gph[8][12], '…and the base entry and its table are untouched')
const a = fuelMapFor(P)
check(fuelMapFor({ ...P }) === a, 'the per-params cache reuses the table while nothing changed')
check(fuelMapFor({ ...P, fmepA: 120 }) !== a, '…and rebuilds it the moment an input moves')
// The swap the debug menu does: Object.assign the 2.3 Duratec I4 over the V6's flat params.
// EPA 2002 Ranger 2WD: 2.3 L ≈ 3 mpg better than the 3.0 L in every column — the gap is the anchor.
const I4 = Object.assign({ ...P }, ENGINES.duratec23)
const i4map = fuelMapFor(I4)
check(i4map !== a && fuelRateGph(i4map, I4.engineIdleRPM, 0) < idle, `the Duratec I4 swaps in its own table and idles leaner (${fuelRateGph(i4map, I4.engineIdleRPM, 0).toFixed(2)} vs ${idle.toFixed(2)} gal/h)`)
let i4kW = 0; for (let r = 1000; r <= I4.engineRedlineRPM; r += 50) i4kW = Math.max(i4kW, engineTorqueAt(r, I4.engineTorqueCurve) * r * Math.PI / 30 / 1000)
check(i4kW >= 104 && i4kW <= 110, `…makes its rated 107 kW (143 hp) peak (${i4kW.toFixed(1)} kW)`)
const gap = cruiseMpg(60, I4, i4map) - m60
check(gap >= 2 && gap <= 4.5, `…and cruises ${gap.toFixed(1)} mpg better than the V6 at 60 (EPA gap ≈ 3)`)
// …and its 5R55E: a floored ramp through the gears upshifts at the I4's own shift point, not the V6's.
const I45 = Object.assign({ ...I4 }, TRANSMISSIONS['5r55e'])
const ramp = { throttle: 1, brake: 0, wheelOmega: [0, 0, 0, 0], ignition: makeIgnitionState(RUNNING) }
const shifts = []
for (let mph = 0, g = 1; mph < 90; mph += 0.02) {
  const v = mph * 0.44704; ramp.wheelOmega.fill(v / I45.wheelRadius); stepDrivetrain(ramp, I45, DT, v)
  if (ramp.drivetrain.gear !== g) { shifts.push(ramp.drivetrain.coupledRPM); g = ramp.drivetrain.gear }
}
check(shifts.length === 3 && shifts.every(r => Math.abs(r - I45.shiftUpRPM) < 50), `I4 + 5R55E floored: 1→2→3→4 by 90 mph, each at ~${I45.shiftUpRPM} rpm (${shifts.map(Math.round).join(', ')})`)

console.log('\n4. driving style, through the real drivetrain')
// 55 mph held on the wheels; one run with a light foot, one floored. Same road speed, same minute.
// FEAT-124's throttle-averaged schedule lets the light foot short-shift into top gear (low-rpm cells)
// while the floored run holds the WOT gear, so the saving is the pedal axis AND the gear. The first
// 10 s are discarded: the gearbox walks up from 1st while the throttle average settles.
const burnAt = pedal => {
  const vs = { throttle: pedal, brake: 0, wheelOmega: [0, 0, 0, 0].fill(55 * 0.44704 / P.wheelRadius), ignition: makeIgnitionState(RUNNING), fuel: makeFuelState(P) }
  const p = { ...P }
  for (let t = 0; t < 10; t += DT) { stepDrivetrain(vs, p, DT, 55 * 0.44704); stepFuel(vs, p, DT) }
  const gal0 = vs.fuel.gal
  for (let i = 0; i < 60 / DT; i++) { stepDrivetrain(vs, p, DT, 55 * 0.44704); stepFuel(vs, p, DT) }   // integer steps: exactly 60 s
  return { gal: gal0 - vs.fuel.gal, gear: vs.drivetrain.gear, rpm: vs.drivetrain.engineRPM }
}
const light = burnAt(0.42), wot = burnAt(1)
// 2.0× on the pedal axis alone (pedal-blind schedule, both in 2nd); the short-shift into 3rd lifts it
// to ~3.2×. 2.6 sits between, so losing the short-shift fails here.
check(wot.gal > light.gal * 2.6 && light.gear > wot.gear, `floored burns ${(wot.gal / light.gal).toFixed(1)}× a light foot over the same minute (gear ${wot.gear} @ ${wot.rpm.toFixed(0)} vs gear ${light.gear} @ ${light.rpm.toFixed(0)} rpm)`)
check(Math.abs(light.gal - fuelRateGph(map, light.rpm, 0.42) * P.fuelBurnScale / 60) < 1e-6, `the burn is the table × fuelBurnScale (${P.fuelBurnScale}×), nothing else`)

console.log('\n5. the tank')
const dry = { ignition: makeIgnitionState(RUNNING), drivetrain: { engineRPM: 3000, pedal: 1 }, fuel: { gal: 0.001, floorGal: 0, dry: false } }
for (let t = 0; t < 1; t += DT) stepFuel(dry, P, DT)
check(dry.fuel.gal === 0 && dry.fuel.dry && dry.ignition.state === 'off', 'running the tank dry kills the engine')
check(catchTime(dry, P) === Infinity, '…and an empty tank never catches (the starter grinds)')
const roam = { ignition: makeIgnitionState(RUNNING), drivetrain: { engineRPM: 3000, pedal: 1 }, fuel: { gal: 0.9, floorGal: 0.825, dry: false } }
for (let t = 0; t < 60; t += DT) stepFuel(roam, P, DT)
check(roam.fuel.gal === 0.825 && roam.ignition.state === RUNNING, "free roam's floor holds: the tank stops there and the engine keeps running")
const off = { ignition: { ...makeIgnitionState(), state: 'off' }, drivetrain: { engineRPM: 0, pedal: 1 }, fuel: makeFuelState(P) }
stepFuel(off, P, 1)
check(off.fuel.gal === P.fuelTankGal, 'a stopped engine burns nothing')

console.log('\n6. the low-fuel sputter')
// Hold a steady 3000 rpm at 70 % pedal from 3 gal down to empty, logging every stumble.
const sputterRun = () => {
  const vs = { ignition: makeIgnitionState(RUNNING), drivetrain: { engineRPM: 3000, pedal: 0.7 }, fuel: makeFuelState(P, 0) }
  vs.fuel.gal = 3
  const log = []; let minScale = 1, t = 0, burnS = null
  for (; vs.fuel.gal > 0 && t < 3600; t += DT) {
    const n = vs.fuel.sputters
    stepFuel(vs, P, DT)
    if (vs.fuel.sputters > n) log.push({ t, left: vs.fuel.gal / vs.fuel.avgGalPerS, depth: vs.fuel.sputterDepth })
    minScale = Math.min(minScale, vs.fuel.torqueScale)
  }
  return { log, minScale, tEmpty: t }
}
const sp = sputterRun()
const gaps = sp.log.slice(1).map((e, i) => e.t - sp.log[i].t)
const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length
const half = Math.floor(gaps.length / 2)
const early = gaps.slice(0, half).reduce((a, b) => a + b, 0) / half, late = gaps.slice(half).reduce((a, b) => a + b, 0) / (gaps.length - half)
check(sp.log.length > 4 && sp.log[0].left <= P.sputterWarnS && sp.log[0].left > P.sputterWarnS - 30,
  `the first stumble comes with ${sp.log[0]?.left.toFixed(0)} s of fuel left (warning at ${P.sputterWarnS} s)`)
check(sp.log.every(e => e.left <= P.sputterWarnS), 'none before the warning window')
check(mean >= 7 && mean <= 13, `${sp.log.length} stumbles, ${mean.toFixed(1)} s apart on average (~10)`)
check(late < early, `they tighten toward empty (${early.toFixed(1)} s early → ${late.toFixed(1)} s late)`)
check(sp.log.at(-1).depth > sp.log[0].depth && sp.minScale < 0.2, `and deepen (${sp.log[0].depth.toFixed(2)} → ${sp.log.at(-1).depth.toFixed(2)}); torque falls to ${(sp.minScale * 100).toFixed(0)} % in the worst`)
{
  // A fill-up mid-sputter, then running low again: the second episode's first stumble must wait the
  // same ~20 s into the window as the first did — no banked progress from the last one.
  const vs = { ignition: makeIgnitionState(RUNNING), drivetrain: { engineRPM: 3000, pedal: 0.7 }, fuel: makeFuelState(P, 0) }
  const firstLeft = () => {
    const n = vs.fuel.sputters
    for (let t = 0; t < 3600 && vs.fuel.sputters === n; t += DT) stepFuel(vs, P, DT)
    return vs.fuel.gal / vs.fuel.avgGalPerS
  }
  vs.fuel.gal = 3
  const a = firstLeft()
  // Run on until the NEXT stumble is nearly due (90 % banked), then fill — the worst case for carry-over.
  for (let t = 0; t < 600 && vs.fuel.sputterPhase < 0.9 * vs.fuel.sputterNext; t += DT) stepFuel(vs, P, DT)
  vs.fuel.gal = 3                                                 // fill up
  const b = firstLeft()
  // Not equal — each episode's first gap is jittered — but never at the window's edge: banked progress
  // would fire it the moment the warning opens (≈120 s).
  check(b < P.sputterWarnS - 8, `after a fill-up the next episode's first stumble waits again (${a.toFixed(0)} s, then ${b.toFixed(0)} s of fuel left; warning at ${P.sputterWarnS})`)
}
const sp2 = sputterRun()
check(JSON.stringify(sp2.log) === JSON.stringify(sp.log), 'deterministic: the same drive stumbles at the same moments')
{
  const vs = { ignition: makeIgnitionState(RUNNING), drivetrain: { engineRPM: 3000, pedal: 0.7 }, fuel: { ...makeFuelState(P), gal: 1, floorGal: 0.825 } }
  for (let t = 0; t < 300; t += DT) stepFuel(vs, P, DT)
  check(vs.fuel.sputters === 0, "free roam's floor never sputters")
}
{
  const axle = (scale) => {   // fresh state each time: one step, same inputs, only the stumble differs
    const vs = { throttle: 0.7, brake: 0, wheelOmega: [0, 0, 20, 20], ignition: makeIgnitionState(RUNNING), fuel: { ...makeFuelState(P), torqueScale: scale } }   // ~2000 rpm in 1st, off the limiter
    const p = { ...P }
    stepDrivetrain(vs, p, DT, 7.4)
    return p._driveTorque[2] + p._driveTorque[3]
  }
  check(axle(1) > 0 && Math.abs(axle(0.3) / axle(1) - 0.3) < 1e-9, 'a stumble takes its share of drive torque at the wheels')
}

console.log('\n7. the Emergency gas can')
{
  let poured = 0
  const vs = { fuel: { ...makeFuelState(P), gal: 0, dry: true } }
  const pour = () => {   // the same rule main.js _pourGasCan applies
    const space = P.fuelTankGal - vs.fuel.gal
    if (space < 0.05) return false
    vs.fuel.gal += Math.min(P.emergencyGasGal, space); vs.fuel.dry = false; poured++
  }
  const inv = new InventorySystem({ effects: { gas: pour } })
  inv.start(); inv.grant('emergencyGas', 2)
  const count = () => inv.list().find(e => e.id === 'emergencyGas')?.n ?? 0
  check(inv.use('emergencyGas') && vs.fuel.gal === P.emergencyGasGal && !vs.fuel.dry && count() === 1,
    `a can pours ${P.emergencyGasGal} gal into a dry tank and is spent`)
  check(catchTime(vs, P) < Infinity, '…and the key can catch again')
  vs.fuel.gal = P.fuelTankGal
  check(!inv.use('emergencyGas') && count() === 1, 'a full tank refuses the can — it is kept, not wasted')
}

console.log(`\n${'═'.repeat(64)}`)
if (failures) { console.log(`FUEL-MAP GATE: ${failures} FAILURE(S)`); process.exit(1) }
console.log('FUEL-MAP GATE: all checks passed ✓')
