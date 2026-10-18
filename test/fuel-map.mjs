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
//
// Run: node test/fuel-map.mjs [--print]     (--print dumps the whole table for review)

import { buildFuelMap, fuelRateGph, fuelGramsPerS, fuelMapFor, stepFuel, makeFuelState } from '../src/fuel.js'
import { stepDrivetrain, engineTorqueAt } from '../src/drivetrain.js'
import { catchTime, makeIgnitionState, RUNNING } from '../src/ignition.js'
import { RANGER_PARAMS } from '../data/ranger.js'
import { ENGINES } from '../data/engines.js'

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
const cruiseMpg = mph => {
  const v = mph * 0.44704
  const F = 0.5 * 1.225 * P.aeroDragArea * v * v + P.rollingResistanceCoeff * P.mass * 9.81
  const rpm = v / P.wheelRadius * P.gearRatios.at(-1) * P.finalDrive * 30 / Math.PI
  const pedal = F * v / (rpm * Math.PI / 30) / engineTorqueAt(rpm, P.engineTorqueCurve)
  return mph / fuelRateGph(map, rpm, pedal)
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

console.log('\n4. driving style, through the real drivetrain')
// 55 mph held on the wheels; one run with a light foot, one floored. Same road speed, same minute.
// Both land in the SAME gear today: FEAT-23's shift schedule is pedal-blind (shiftUpRPM 5400, tuned
// for always-WOT play), so a gentle driver cannot short-shift into a low-rpm cell yet — the saving
// here is the pedal axis alone. A pedal-aware upshift (the owner's "transmission mapping") would
// widen it; raise this band when that lands.
const burnAt = pedal => {
  const vs = { throttle: pedal, brake: 0, wheelOmega: [0, 0, 0, 0].fill(55 * 0.44704 / P.wheelRadius), ignition: makeIgnitionState(RUNNING), fuel: makeFuelState(P) }
  const p = { ...P }
  for (let t = 0; t < 60; t += DT) { stepDrivetrain(vs, p, DT, 55 * 0.44704); stepFuel(vs, p, DT) }
  return { gal: P.fuelTankGal - vs.fuel.gal, gear: vs.drivetrain.gear, rpm: vs.drivetrain.engineRPM }
}
const light = burnAt(0.42), wot = burnAt(1)
check(wot.gal > light.gal * 1.8, `floored burns ${(wot.gal / light.gal).toFixed(1)}× a light foot over the same minute (gear ${wot.gear} @ ${wot.rpm.toFixed(0)} vs gear ${light.gear} @ ${light.rpm.toFixed(0)} rpm)`)
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

console.log(`\n${'═'.repeat(64)}`)
if (failures) { console.log(`FUEL-MAP GATE: ${failures} FAILURE(S)`); process.exit(1) }
console.log('FUEL-MAP GATE: all checks passed ✓')
