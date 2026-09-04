// test/damage-filter-puncture.mjs — SM-3 gate: the air filter and tire punctures.
//
// Both were in DESIGN.md from the start and neither was in the first ratified track list; the owner
// added them on 2026-08-23. They are gated together because they share a shape — each is a cheap
// consumable whose failure is felt somewhere else.
//
//   AIR FILTER  clogs on the air the engine breathes (the same rpm x load the engine wear track
//               already integrates — airflow is what carries the dust in), and does NOTHING until
//               it is nearly gone, then multiplies engine wear hard. That asymmetry is the mechanic:
//               the filter is cheap and the warning is loud, and letting it bottom out silently is
//               what kills the engine.
//   PUNCTURE    a worn tire pops when a bump-stop hit finds it. Same peak force the spring track
//               reads, because it is the same event — the suspension slamming through its travel is
//               what pinches a carcass against the rim.

import { DamageModel, DAMAGE_PARAMS as D } from '../src/damage.js'

let fail = 0
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fail = 1 }
const DT = 1 / 60
const P = { engineIdleRPM: 750, engineRedlineRPM: 5500 }
const fresh = () => new DamageModel({ params: P })
const d0 = fresh()   // for pure threshold/curve queries
/** Sustained driving at a normalised insult of `x` (1.0 = redline at full throttle). */
const drive = (d, x, secs) => {
  const rpmN = Math.sqrt(x)                       // insult = rpmN^2 * load, load = 1
  const vs = { drivetrain: { engineRPM: P.engineIdleRPM + rpmN * (P.engineRedlineRPM - P.engineIdleRPM) }, throttle: 1 }
  for (let i = 0; i < secs / DT; i++) d.step(vs, P, DT)
}

console.log('§1 the air filter lasts the owner\'s 30 minutes of hard driving')
{
  // "Hard driving" is the duty cycle the tire and brake fits use — sustained high rpm under load,
  // which reads about 0.5 on this normalised insult.
  const d = fresh()
  drive(d, 0.5, 30 * 60)
  ok(d.get('airFilter') <= 0.02, `30 minutes of hard driving finishes the filter (left ${(d.get('airFilter') * 100).toFixed(1)}%)`)
  const half = fresh(); drive(half, 0.5, 15 * 60)
  ok(Math.abs(half.get('airFilter') - 0.5) < 0.03, '...and it is linear in the air moved, so half the drive is half the filter')

  const gentle = fresh(); drive(gentle, 0.1, 30 * 60)
  ok(gentle.get('airFilter') > 0.7, 'gentle driving barely touches it — it clogs on airflow, not on the clock')
}

console.log('\n§2 it does nothing until it is nearly gone, then it is savage')
{
  const d = fresh()
  for (const c of [1.0, 0.5, D.filterKnee]) {
    d.set('airFilter', c)
    ok(d.filterEngineMultiplier() === 1, `at ${(c * 100).toFixed(0)}% the filter costs the engine nothing`)
  }
  d.set('airFilter', 0)
  ok(Math.abs(d.filterEngineMultiplier() - D.filterEngineMult) < 1e-9,
    `a completely blocked filter wears the engine ${D.filterEngineMult}x faster`)
  d.set('airFilter', D.filterKnee / 2)
  const mid = d.filterEngineMultiplier()
  ok(mid > 1 && mid < D.filterEngineMult / 2,
    `halfway past the knee it is ${mid.toFixed(1)}x — back-loaded, so the last stretch is the punishing one`)

  // The coupling is real: the same drive costs the engine far more on a dead filter.
  const clean = fresh(); drive(clean, 0.8, 120)
  const dirty = fresh(); dirty.setDurability('airFilter', 1e-9)   // force it to bottom out at once
  drive(dirty, 0.8, 120)
  ok((1 - dirty.get('engine')) > 5 * (1 - clean.get('engine')),
    'two minutes of the same driving costs the engine many times more once the filter is gone')
}

console.log('\n§2b a crash does not clog a filter')
{
  // Owner ruling 2026-08-23. A filter sits behind the grille, but a collision does not block it,
  // and putting a consumable on the armor's damage path is not what armor is for. Guarded twice —
  // an empty `regions` list the impact loop can never match, and no impact curve for the class —
  // so this pins the OUTCOME rather than either mechanism.
  for (const region of ['front', 'left', 'right', 'rear']) {
    const d = fresh(); d.setAll(1)
    for (const id of ['armorFront', 'armorLeft', 'armorRight', 'armorRear']) d.set(id, 0)  // worst case
    d.applyImpact(region, 1360 * 80 * 0.44704, 1360)                                        // fatal-grade hit
    ok(d.get('airFilter') === 1, `an 80 mph ${region} impact through destroyed armor leaves the filter untouched`)
  }
  const d = fresh(); d.setAll(1)
  for (const id of ['armorFront', 'armorLeft', 'armorRight', 'armorRear']) d.set(id, 0)
  d.applyImpact('front', 1360 * 80 * 0.44704, 1360)
  ok(d.get('engine') < 1 && d.get('radiator') < 1, '...while the things behind that bumper that SHOULD take it, did')
}

console.log('\n§3 punctures — fresh rubber is safe, worn rubber is not')
{
  const pop = (cond, forceN) => {
    const d = fresh(); d.set('tireFL', cond)
    for (let i = 0; i < 4; i++) d.step({ bumpForce: [forceN, 0, 0, 0] }, P, 0.004)
    d.step({ bumpForce: [0, 0, 0, 0] }, P, 0.004)
    return d
  }
  ok(pop(1.0, 500000).flat[0] === false, 'a fresh tire cannot be popped at all, by any bump')
  ok(pop(D.punctureCond + 0.05, 500000).flat[0] === false, `...nor one above the ${D.punctureCond * 100}% fragility threshold`)

  // The owner's two anchors, and the line between them.
  ok(pop(0.50, D.punctureAtHalf + 1000).flat[0] === true && pop(0.50, D.punctureAtHalf - 1000).flat[0] === false,
    `a 50% tire pops at ${D.punctureAtHalf / 1000} kN, not below it`)
  ok(pop(0.10, 31000).flat[0] === true && pop(0.10, 29000).flat[0] === false, 'a 10% tire pops at 30 kN, not at 29')
  ok(pop(0.02, 31000).flat[0] === true, '...and below 10% the threshold stops falling — it is already as fragile as it gets')
  {
    const mid = d0.punctureThreshold(0.30)
    ok(pop(0.30, mid + 1000).flat[0] === true && pop(0.30, mid - 1000).flat[0] === false,
      `a 30% tire sits on the line between them, at ${(mid / 1000).toFixed(0)} kN`)
  }

  // Deterministic, not a probability roll: the same drive pops the same tire every replay.
  ok(pop(0.30, 60000).flat[0] === pop(0.30, 60000).flat[0], 'the same hit on the same tire always gives the same answer')
}

console.log('\n§3b grip is flat-then-cliff, not linear')
{
  // Owner, 2026-08-23: a real tire at 50% tread grips very nearly like a new one. Linear charged 22%
  // of the grip for the first half of the tread, which made fresh rubber feel mandatory rather than
  // valuable. The shape must hold near-full grip for a long time and then fall away.
  const mu = (c) => { const d = fresh(); d.set('tireFL', c); return d.tireMuScale(0) }
  ok(mu(1) === 1, 'a new tire is a new tire')
  ok(mu(0.5) > 0.95, `a HALF-WORN tire keeps ${(mu(0.5) * 100).toFixed(0)}% of its grip — the whole point of the change`)
  ok(mu(0.75) > 0.99, '...and three-quarters is indistinguishable from new')
  ok(Math.abs(mu(0) - D.tireMuAtZero) < 1e-9, 'a bald tire is still a bald tire — the 0% anchor did not move')

  // The cliff has to actually be a cliff: the second half of the tread must cost far more grip than
  // the first, or this is just a gentler line.
  const firstHalf = mu(1) - mu(0.5), secondHalf = mu(0.5) - mu(0)
  ok(secondHalf > 10 * firstHalf,
    `the last half of the tread costs ${(secondHalf / firstHalf).toFixed(0)}x the grip the first half did`)
  // Monotonic, or a worn tire could out-grip a fresher one somewhere.
  let ok2 = true
  for (let c = 0; c < 1; c += 0.01) if (mu(c + 0.01) < mu(c) - 1e-12) ok2 = false
  ok(ok2, 'and grip never rises as a tire wears')
}

console.log('\n§4 what a flat actually does')
{
  const d = fresh(); d.set('tireFL', 0.3)
  const before = d.tireMuScale(0)
  for (let i = 0; i < 4; i++) d.step({ bumpForce: [80000, 0, 0, 0] }, P, 0.004)
  d.step({ bumpForce: [0, 0, 0, 0] }, P, 0.004)
  ok(d.flat[0], 'the tire is flat')
  ok(Math.abs(d.tireMuScale(0) / before - D.tireFlatMu) < 1e-9, `grip drops to ${(D.tireFlatMu * 100).toFixed(0)}% of what that tire had`)
  ok(d.flat[1] === false && d.tireMuScale(1) === 1, '...on that corner only — the others are untouched')

  const par = {}
  d.publish(par)
  ok(par._tireRateScale[0] === D.tireFlatRate && par._tireRateScale[1] === 1,
    `the carcass rate collapses to ${D.tireFlatRate * 100}% of stock on the flat corner`)
  ok(D.tireFlatRate > 0,
    'and NOT to zero — a flat tire still stacks up against its rim, and a zero rate would sink the wheel through the road')

  // A puncture is STATE, not condition: restoring conditions must also put the air back.
  d.setAll(1)
  ok(d.flat[0] === false, 'restoring every track to full also re-inflates the tire')
  const e = fresh(); e.set('tireRL', 0.2)
  for (let i = 0; i < 4; i++) e.step({ bumpForce: [0, 0, 60000, 0] }, P, 0.004)
  e.step({ bumpForce: [0, 0, 0, 0] }, P, 0.004)
  ok(e.flat[2] && e.drainPops().includes(2), 'a puncture queues exactly one pop event for the bang')
  ok(e.drainPops() === null, '...and drains, so a catch-up burst of physics steps cannot bang twice')
  e.replaceTire(2)
  ok(e.flat[2] === false && e.get('tireRL') === 1, 'fitting a new tire clears both the flat and the wear')
}

console.log(fail ? '\nFAIL — the filter/puncture model has drifted' : '\nPASS — the filter clogs on airflow and punctures need a worn tire and a hard hit')
process.exit(fail)
