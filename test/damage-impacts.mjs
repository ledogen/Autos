// test/damage-impacts.mjs — SM-3 gate: the impact model matches the ratified calibration.
//
// Every number here is an owner ruling (2026-08-19), quoted in mph but MEASURED as contact impulse.
// The conversion is `v_eq = J / mass` — the speed a hit would have shed had it stopped the truck
// dead — so a glancing blow prices as the small hit it is rather than as the speed you were doing.
//
//   armor      10 mph → 10%   ·  60 mph → 100%   (and 60 mph is the fatal-crash threshold)
//   headlight  10 mph → 10%   ·  60 mph → 100%   unprotected
//   radiator   10 mph →  5%   ·  60 mph →  50%   unprotected
//   engine     10 mph →  1%   ·  60 mph →  20%   unprotected
//
//   armor absorbs 90% at full health, 10% at 10% health
//   alignment does nothing below 30 mph, saturates at 80 mph (±2° camber, ±0.5° toe)
//
// The armor rule is the load-bearing one: a crushed bumper is WHY the next tap kills the radiator.

import { DamageModel, DAMAGE_PARAMS as D, MPH, impactDamage, armorPassThrough } from '../src/damage.js'
import { RANGER_PARAMS as P } from '../data/ranger.js'

const MASS = P.mass
let fail = 0
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail = 1 }
const near = (a, b, tol = 0.005) => Math.abs(a - b) <= tol

/** Impulse of a square, dead-stop collision at `mph` — the reference the calibration is quoted in. */
const impulseAt = (mph) => MASS * mph * MPH

/** Land one hit at `mph` on `region` with the armor of that region forced to `armorC`. */
function hit (region, mph, armorC) {
  const d = new DamageModel({ params: {} })
  if (armorC !== undefined) {
    for (const id of ['armorFront', 'armorLeft', 'armorRight', 'armorRear']) d.set(id, armorC)
  }
  const r = d.applyImpact(region, impulseAt(mph), MASS)
  return { d, r }
}

console.log('§1 unprotected component curves hit the owner\'s anchors exactly')
for (const [mph, eng, rad, hl] of [[10, 0.01, 0.05, 0.10], [60, 0.20, 0.50, 1.00]]) {
  const { d } = hit('front', mph, 0)          // armor destroyed → nothing absorbed
  ok(near(1 - d.get('engine'), eng),      `${mph} mph: engine takes ${((1 - d.get('engine')) * 100).toFixed(1)}% (want ${(eng * 100).toFixed(0)}%)`)
  ok(near(1 - d.get('radiator'), rad),    `${mph} mph: radiator takes ${((1 - d.get('radiator')) * 100).toFixed(1)}% (want ${(rad * 100).toFixed(0)}%)`)
  ok(near(1 - d.get('headlightL'), hl),   `${mph} mph: headlight takes ${((1 - d.get('headlightL')) * 100).toFixed(1)}% (want ${(hl * 100).toFixed(0)}%)`)
}

console.log('\n§2 armor takes its own curve — floored, saturating at 80 mph, square-law (owner 2026-08-20)')
{
  // Body panels were ~4x too sensitive at low speed. Three requirements at once: NOTHING below a
  // floor, a defined write-off speed, and a square-law rise. The components deliberately keep the
  // old two-point law — the owner judged those about right.
  for (const [mph, want] of [[10, 0.00], [20, 0.020], [45, 0.250], [80, 1.00]]) {
    const { d } = hit('front', mph, 1)
    ok(near(1 - d.get('armorFront'), want, 0.005),
      `${mph} mph: front bumper takes ${((1 - d.get('armorFront')) * 100).toFixed(1)}% (want ${(want * 100).toFixed(1)}%)`)
  }
  ok(hit('front', 9, 1).d.get('armorFront') === 1, 'below the 10 mph floor a body panel takes NOTHING — a parking-lot tap is free')
  // Square-law is the whole point: doubling the speed over the floor must quadruple the damage.
  const a = 1 - hit('front', 10 + 17.5, 1).d.get('armorFront')
  const b = 1 - hit('front', 10 + 35.0, 1).d.get('armorFront')
  ok(near(b / a, 4, 0.05), `doubling speed-over-floor quadruples the damage (x${(b / a).toFixed(2)}) — energy, not impulse`)
  // The fatal threshold is 60 mph and armor now saturates at 80, so the two no longer coincide.
  // That is a deliberate consequence of the owner's re-anchor, pinned so it cannot drift silently.
  // Death and total armor loss are the SAME impact by design (owner restored this 2026-08-23 after
  // the armor re-anchor briefly split them): the hit that writes off a bumper outright is the hit
  // that kills you.
  ok(D.fatalMph === D.impactArmor.fullMph,
    `death and total armor loss are the same impact — both ${D.fatalMph} mph`)
}

console.log('\n§3 armor absorption follows the ratified two anchors')
ok(near(armorPassThrough(1.0), 0.10),  `full-health armor passes ${(armorPassThrough(1.0) * 100).toFixed(0)}% (absorbs 90%)`)
ok(near(armorPassThrough(0.1), 0.91, 0.02), `10%-health armor passes ${(armorPassThrough(0.1) * 100).toFixed(0)}% (absorbs ~10%)`)
ok(near(armorPassThrough(0.0), 1.00),  'destroyed armor passes everything')

console.log('\n§4 THE point of armor: a crushed bumper is why the next tap kills the radiator')
const fresh = hit('front', 30, 1.0).d
const crushed = hit('front', 30, 0.0).d
const dFresh = 1 - fresh.get('radiator'), dCrushed = 1 - crushed.get('radiator')
console.log(`  30 mph into the radiator: fresh bumper ${(dFresh * 100).toFixed(1)}% · crushed bumper ${(dCrushed * 100).toFixed(1)}%`)
ok(dCrushed > dFresh * 8, `the same hit is ${(dCrushed / dFresh).toFixed(1)}× worse with no bumper left (want > 8×)`)

console.log('\n§5 side hits stay on their side')
{
  const { d } = hit('left', 60, 0)
  ok(d.get('wheelFL') < 0.99 && d.get('wheelRL') < 0.99, 'a left hit damages both left wheels')
  ok(d.get('wheelFR') > 0.999 && d.get('wheelRR') > 0.999, 'a left hit leaves the right wheels alone')
  ok(d.get('headlightL') > 0.999 && d.get('headlightR') > 0.999, 'a left hit breaks no headlight (they sit behind the FRONT bumper)')
  ok(d.get('engine') > 0.999 && d.get('radiator') > 0.999, 'a left hit reaches neither engine nor radiator')
}
{
  const { d } = hit('front', 60, 0)
  ok(d.get('headlightL') < 0.001 && d.get('headlightR') < 0.001, 'a 60 mph front hit destroys BOTH headlights')
}

console.log('\n§6 alignment: dead below 30 mph, saturated by 80')
for (const mph of [20, 29]) {
  const { d } = hit('front', mph, 0)
  ok(d.camberOffsetDeg.every(c => c === 0) && d.toeOffsetDeg.every(t => t === 0), `${mph} mph bends nothing`)
}
{
  const { d } = hit('front', 80, 0)
  const maxCam = Math.max(...d.camberOffsetDeg.map(Math.abs))
  const maxToe = Math.max(...d.toeOffsetDeg.map(Math.abs))
  console.log(`  80 mph: camber [${d.camberOffsetDeg.map(c => c.toFixed(2)).join(', ')}]°  toe [${d.toeOffsetDeg.map(t => t.toFixed(2)).join(', ')}]°`)
  ok(maxCam > 0 && maxCam <= D.alignMaxCamberDeg + 1e-9, `camber lands inside ±${D.alignMaxCamberDeg}° (peak ${maxCam.toFixed(2)}°)`)

  ok(maxToe > 0 && maxToe <= D.alignMaxToeDeg + 1e-9, `toe lands inside ±${D.alignMaxToeDeg}° (peak ${maxToe.toFixed(2)}°)`)
  ok(d.camberOffsetDeg[2] === 0 && d.camberOffsetDeg[3] === 0, 'a front hit does not bend the rear axle')
}
{
  // Randomness is real (two different draws) but SEEDED, so a run replays identically (INFRA-03).
  const a = new DamageModel({ seed: 99 }); a.set('armorFront', 0); a.applyImpact('front', impulseAt(80), MASS)
  const b = new DamageModel({ seed: 99 }); b.set('armorFront', 0); b.applyImpact('front', impulseAt(80), MASS)
  const c = new DamageModel({ seed: 12 }); c.set('armorFront', 0); c.applyImpact('front', impulseAt(80), MASS)
  ok(JSON.stringify(a.camberOffsetDeg) === JSON.stringify(b.camberOffsetDeg), 'same seed → identical bend (replayable)')
  ok(JSON.stringify(a.camberOffsetDeg) !== JSON.stringify(c.camberOffsetDeg), 'different seed → different bend (it IS random)')
}

console.log('\n§7 the fatal-crash threshold is the 60 mph the armor curve tops out at')
ok(hit('front', 59, 1).r.fatal === false, '59 mph is survivable')
ok(hit('front', D.fatalMph, 1).r.fatal === true, '`${D.fatalMph} mph is fatal`')
ok(hit('front', D.fatalMph, 1).r.fatal === true, '...and full armor does NOT save you — the deceleration kills, the bumper only decides what breaks')

console.log('\n§8 impulse, not speed: a glancing hit prices as the small hit it is')
{
  // Same 60 mph closing speed, but only a fifth of the impulse actually transferred.
  const d = new DamageModel({ params: {} }); d.set('armorFront', 0)
  d.applyImpact('front', impulseAt(60) * 0.2, MASS)
  const took = 1 - d.get('headlightL')
  console.log(`  a 60 mph glance transferring 20% of the impulse costs the headlight ${(took * 100).toFixed(0)}%`)
  ok(near(took, impactDamage(12 * MPH, D.impactHeadlight), 0.01), 'it prices as a 12 mph hit (0.2 × 60), which is what impulse-based means')
  ok(took < 0.25, 'and it is nowhere near the 100% a square 60 mph hit costs')
}

console.log(fail ? '\nFAIL — the impact model has drifted from the ratified calibration' : '\nPASS — impact model matches the ratified calibration')
process.exit(fail)
