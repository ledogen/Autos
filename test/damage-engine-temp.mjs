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
  const lim = fuelAt(5700, 1)
  ok(lim > 0.8 * peak, `pinned on the rev limiter (5700 rpm, WOT): still burning ${(lim / 1000).toFixed(0)} kW — a limiter cuts in bursts, it does not idle the engine`)
  ok(fuelAt(5200, 1, { _engineDamageScale: 0.5 }) === peak, 'a damaged or overheating engine burns the same fuel — damage never cools it')
  const vs = { throttle: 1, wheelOmega: [0, 0, 0, 0], ignition: { state: 'off' } }
  stepDrivetrain(vs, P(), 0.004, 0)
  ok(vs.drivetrain.fuelPowerW === 0, 'engine off burns nothing')
}

/** Hold a constant fuel power on a given radiator; returns the model after `secs` of real time. */
function soak (radiator, heatW, secs, T0 = 100, dt = 1 / 60) {
  const d = new DamageModel({ params: {} })
  d.set('radiator', radiator); d.engineTempC = T0
  const p = P(), vs = { drivetrain: { fuelPowerW: heatW, engineRPM: 750 }, throttle: 0 }
  for (let t = 0; t < secs; t += dt) d.step(vs, p, dt)
  return d
}
const IDLE = RANGER_PARAMS.engineIdlePowerW, FULL = RANGER_PARAMS.radiatorRatedW

console.log('§2 steady state — the owner anchors')
{
  // Read the equilibrium straight off the heat balance: the temperature where coolingW == heat. The
  // hot mass is a real-time leniency knob, so a dead radiator at idle takes hours to settle — a soak
  // would be testing patience, not the anchors.
  const p = P()
  const eq = (r, w) => {
    const d = new DamageModel({ params: {} }); d.set('radiator', r)
    let lo = D.tempAmbientC, hi = 2000
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (d.coolingW(m, p) < w) lo = m; else hi = m }
    return lo
  }
  const rows = [['100% full', eq(1, FULL), 98, 102], ['100% idle', eq(1, IDLE), 97, 100.5],
    ['50% full', eq(0.5, FULL), 108.5, 109.5], ['0% idle', eq(0, IDLE), 108.5, 109.5],
    ['60% full', eq(0.6, FULL), 98, 104]]
  for (const [n, t, lo, hi] of rows) ok(t >= lo && t <= hi, `${n}: settles at ${t.toFixed(1)} °C (${lo}-${hi})`)
  ok(eq(0.45, FULL) > D.tempHotC, `45% full load overheats (equilibrium ${eq(0.45, FULL).toFixed(1)} °C)`)
  ok(eq(0, 0.2 * FULL) > D.tempMaxC, '0% radiator at a 20% cruise load has no equilibrium short of the clamp')
}

console.log('§3 two clocks: warm-up on game time, overheat on real time (owner 2026-10-16)')
{
  const p = P(), dt = 1 / 60
  const until = (d, vs, cond) => { let t = 0; while (!cond(d) && t < 3600) { d.step(vs, p, dt); t += dt } return t }
  const w = new DamageModel({ params: {} })
  const tw = until(w, { drivetrain: { fuelPowerW: IDLE, engineRPM: 750 } }, (d) => d.engineTempC >= D.tempThermostatC - 2)
  ok(tw >= 20 && tw <= 30, `healthy truck idling from cold: ${D.tempAmbientC} → ${D.tempThermostatC - 2} °C in ${tw.toFixed(1)} s (20-30 s = that many game minutes)`)

  const d = new DamageModel({ params: {} }); d.set('radiator', 0); d.engineTempC = 100
  const vs = { drivetrain: { fuelPowerW: FULL, engineRPM: 750 }, throttle: 0 }
  const t = until(d, vs, (m) => m.engineTempC >= D.tempHotC)
  ok(t >= 30 && t <= 60, `0% radiator, full load: 100 → 110 °C in ${t.toFixed(1)} s of REAL time (30-60 s)`)
  // The owner's complaint (2026-10-17): back-to-back WOT hill climbs survived on a 10% radiator at
  // the old 45 s pace. A 60 s climb at ~95 kW must now cook it before the top.
  const h = new DamageModel({ params: {} }); h.set('radiator', 0.1); h.engineTempC = 100
  const th = until(h, { drivetrain: { fuelPowerW: 95000, engineRPM: 750 } }, (m) => m.engineTempC >= D.tempHotC)
  ok(th < 60, `10% radiator, one 60 s WOT climb (~95 kW): over the mark after ${th.toFixed(1)} s`)
  ok(d.get('engine') > 0.99999 && p._engineDamageScale > 0.999 && p._hoodSteam > 0, `at the mark: no damage to speak of yet, but the hood is already steaming (${p._hoodSteam.toFixed(2)})`)
  for (let i = 0; i < 600; i++) d.step(vs, p, dt)
  ok(d.get('engine') < 1 && p._engineDamageScale < 1, `10 s over the mark: engine wearing (${(d.get('engine') * 100).toFixed(1)}%) and power derated (${p._engineDamageScale.toFixed(2)}) at ${d.engineTempC.toFixed(1)} °C`)
  d.set('radiator', 1); vs.drivetrain.fuelPowerW = IDLE
  const tc = until(d, vs, (m) => m.engineTempC <= D.tempHotC)
  console.log(`  fitted a new radiator and idled: back under the mark in ${tc.toFixed(1)} s`)
  const worn = d.get('engine')
  until(d, vs, (m) => m.engineTempC < 101)
  ok(Math.abs(p._engineDamageScale - d.engineScale()) < 1e-12 && p._hoodSteam === 0, 'cooled back down: power loss and steam are temporary...')
  ok(d.get('engine') === worn, '...only the wear stays, and below the mark it stops')

  // Shutting it off is the escape for a shot radiator: off-cooling runs on game time.
  const s = new DamageModel({ params: {} }); s.set('radiator', 0); s.engineTempC = 115
  const ts = until(s, { drivetrain: { fuelPowerW: 0 } }, (m) => m.engineTempC <= D.tempThermostatC)
  ok(ts > 3 && ts < 20, `shot radiator, engine OFF: 115 → 100 °C in ${ts.toFixed(1)} s (pull over and shut it off)`)

  // Exact rate: a minute at 115 °C costs 30% of an engine.
  const e = new DamageModel({ params: {} }); e.engineTempC = 115; e.set('radiator', 0)
  const tau = D.tempOffTau; D.tempOffTau = Infinity
  for (let i = 0; i < 3600; i++) e.step({ drivetrain: { fuelPowerW: 0 } }, {}, dt)
  D.tempOffTau = tau
  ok(Math.abs((1 - e.get('engine')) - 0.30) < 0.005, `a minute at 115 °C costs ${((1 - e.get('engine')) * 100).toFixed(1)}% of the engine (30%)`)
}

console.log('§4 engine off, gauge, damage-disabled')
{
  const d = soak(1, 0, 8 * 60, 100)
  ok(d.engineTempC < D.tempAmbientC + 1, `8 game-hours off (8 real minutes): back to ${d.engineTempC.toFixed(1)} °C`)
  const g = new DamageModel({ params: {} })
  for (const [c, f] of [[90, 0], [100, 0.5], [110, 1]]) { g.engineTempC = c; ok(g.tempGaugeFrac() === f, `${c} °C reads ${f} on the gauge`) }
  ok(new DamageModel({ params: {} }).engineTempC === D.tempAmbientC, 'a new model starts cold')
  D.enabled = false
  const off = soak(0.75, FULL, 120, 25)
  D.enabled = true
  ok(off.engineTempC > 95, `damage disabled still warms the engine (${off.engineTempC.toFixed(1)} °C) — temperature is state, not wear`)
}

console.log(fail ? '\nFAIL — the engine temperature model has drifted' : '\nPASS — radiator condition sets cooling directly; the owner anchors hold')
process.exit(fail)
