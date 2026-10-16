// test/damage-engine-temp.mjs — FEAT-51 gate: engine temperature from fuel power vs radiator condition.
//
// Owner spec (2026-10-16), no coolant mechanic — radiator CONDITION is the cooling capacity:
//   · a good radiator holds the 100 °C operating temperature (gauge mid) at any load
//   · 110 °C (gauge H) is where engine damage and power loss start
//   · a 0% radiator holds idle just below the mark (109 °C) and overheats under any real load
//   · a 50% radiator holds the stock engine just below the mark at FULL load (peak power, WOT)
// Heat follows fuel (drivetrain fuelPowerW), so the drivetrain side is pinned here too.

import { DamageModel, DAMAGE_PARAMS as D } from '../src/damage.js'
import { stepDrivetrain } from '../src/drivetrain.js'
import { RANGER_PARAMS } from '../data/ranger.js'

let fail = 0
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fail = 1 }
const P = () => ({ ...RANGER_PARAMS })

/** One drivetrain step at a forced engine speed (rear wheels spun to that coupled rpm, 1st gear). */
function fuelAt (rpm, throttle, extra = {}) {
  const p = { ...P(), ...extra }
  const ratio = p.gearRatios[0] * p.finalDrive
  const om = rpm * p.converterCouplingSR / (60 / (2 * Math.PI)) / ratio
  const vs = { throttle, brake: 0, wheelOmega: [0, 0, om, om] }
  stepDrivetrain(vs, p, 0.004, om * p.wheelRadius)
  return vs.drivetrain.fuelPowerW
}

console.log('§1 the drivetrain publishes the fuel power heat is made from')
{
  ok(fuelAt(750, 0) === RANGER_PARAMS.engineIdlePowerW, `idle burns the idle floor (${RANGER_PARAMS.engineIdlePowerW} W)`)
  const peak = fuelAt(5200, 1)
  console.log(`  WOT @ 5200 rpm: ${(peak / 1000).toFixed(1)} kW (radiator rated ${RANGER_PARAMS.radiatorRatedW / 1000} kW)`)
  ok(Math.abs(peak - RANGER_PARAMS.radiatorRatedW) / RANGER_PARAMS.radiatorRatedW < 0.02, 'stock peak power == the rated load, so "50% holds full load" is the stock engine at its worst')
  ok(fuelAt(5200, 1, { _engineDamageScale: 0.5 }) === peak, 'a damaged or overheating engine burns the same fuel — damage never cools it')
  const vs = { throttle: 1, wheelOmega: [0, 0, 0, 0], ignition: { state: 'off' } }
  stepDrivetrain(vs, P(), 0.004, 0)
  ok(vs.drivetrain.fuelPowerW === 0, 'engine off burns nothing')
}

/** Hold a constant fuel power on a given radiator; returns the model after `secs`. */
function soak (radiator, heatW, secs, T0 = 100, dt = 0.02) {
  const d = new DamageModel({ params: {} })
  d.set('radiator', radiator); d.engineTempC = T0
  const p = P(), vs = { drivetrain: { fuelPowerW: heatW, engineRPM: 750 }, throttle: 0 }
  for (let t = 0; t < secs; t += dt) d.step(vs, p, dt)
  return d
}
const IDLE = RANGER_PARAMS.engineIdlePowerW, FULL = RANGER_PARAMS.radiatorRatedW

console.log('§2 steady state — the owner anchors')
{
  // Overheat wear is off for the pure-temperature checks so the engine doesn't degrade under them.
  const keep = D.durOverheat; D.durOverheat = Infinity
  // 2 h: a dead radiator at idle approaches its 109 °C with a ~22 min time constant.
  const T = (r, w) => soak(r, w, 7200, 100, 0.05).engineTempC
  const rows = [['100% full', T(1, FULL), 98, 102], ['100% idle', T(1, IDLE), 97, 100.5],
    ['50% full', T(0.5, FULL), 108.5, 109.5], ['0% idle', T(0, IDLE), 108.5, 109.5],
    ['60% full', T(0.6, FULL), 98, 104]]
  for (const [n, t, lo, hi] of rows) ok(t >= lo && t <= hi, `${n}: settles at ${t.toFixed(1)} °C (${lo}-${hi})`)
  ok(T(0.45, FULL) > D.tempHotC, `45% full load overheats (${T(0.45, FULL).toFixed(1)} °C)`)
  ok(T(0, 0.2 * FULL) >= D.tempMaxC - 1e-9, '0% radiator at a 20% cruise load runs away to the clamp')
  D.durOverheat = keep
}

console.log('§3 pace and consequences')
{
  const d = new DamageModel({ params: {} }); d.set('radiator', 0); d.engineTempC = 100
  const p = P(), vs = { drivetrain: { fuelPowerW: FULL, engineRPM: 750 }, throttle: 0 }
  let t = 0; while (d.engineTempC < D.tempHotC) { d.step(vs, p, 0.02); t += 0.02 }
  ok(t > 7 && t < 13, `0% radiator, full load: 100 → 110 °C in ${t.toFixed(1)} s (~10 s, realistic)`)
  ok(d.get('engine') > 0.99999 && p._engineDamageScale > 0.999, `nothing to speak of at the mark itself (${d.engineTempC.toFixed(2)} °C, power x${p._engineDamageScale.toFixed(4)})`)
  for (let i = 0; i < 250; i++) d.step(vs, p, 0.02)
  ok(d.get('engine') < 1 && p._engineDamageScale < 1, `over the mark: engine wearing (${(d.get('engine') * 100).toFixed(1)}%) and power derated (${p._engineDamageScale.toFixed(2)})`)
  d.set('radiator', 1); vs.drivetrain.fuelPowerW = IDLE
  while (d.engineTempC > D.tempHotC) d.step(vs, p, 0.02)
  const worn = d.get('engine')
  for (let i = 0; i < 3000; i++) d.step(vs, p, 0.02)
  ok(d.engineTempC < 101 && Math.abs(p._engineDamageScale - d.engineScale()) < 1e-12, 'cooled back down: the power loss is temporary, only the wear stays')
  ok(d.get('engine') === worn, '...and below the mark the wear stops')
  // Exact rate: a minute at 115 °C costs 30% of an engine.
  const e = new DamageModel({ params: {} }); e.engineTempC = 115; e.set('radiator', 0)
  const hold = { drivetrain: { fuelPowerW: 0, engineRPM: 750 } }
  const tau = D.tempOffTau; D.tempOffTau = Infinity
  for (let i = 0; i < 3000; i++) e.step(hold, {}, 0.02)
  D.tempOffTau = tau
  ok(Math.abs((1 - e.get('engine')) - 0.30) < 0.005, `a minute at 115 °C costs ${((1 - e.get('engine')) * 100).toFixed(1)}% of the engine (30%)`)
}

console.log('§4 engine off, gauge, damage-disabled')
{
  const d = soak(1, 0, 8 * 3600, 100, 1)
  ok(d.engineTempC < D.tempAmbientC + 1, `8 h off: back to ${d.engineTempC.toFixed(1)} °C — the morning is a cold start`)
  const g = new DamageModel({ params: {} })
  for (const [c, f] of [[90, 0], [100, 0.5], [110, 1]]) { g.engineTempC = c; ok(g.tempGaugeFrac() === f, `${c} °C reads ${f} on the gauge`) }
  ok(new DamageModel({ params: {} }).engineTempC === D.tempAmbientC, 'a new model starts cold')
  D.enabled = false
  const off = soak(0.75, FULL, 600, 25)
  D.enabled = true
  ok(off.engineTempC > 95, `damage disabled still warms the engine (${off.engineTempC.toFixed(1)} °C) — temperature is state, not wear`)
}

console.log(fail ? '\nFAIL — the engine temperature model has drifted' : '\nPASS — radiator condition sets cooling directly; the owner anchors hold')
process.exit(fail)
