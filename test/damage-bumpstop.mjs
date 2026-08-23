// test/damage-bumpstop.mjs — SM-3 gate: bump-stop hits are EVENTS priced on peak force.
//
// This track was rewritten on 2026-08-20 after the owner drove it: repeatedly hitting the lab ramp
// at 30-40 mph, plainly bottoming the suspension, cost almost nothing. The cause was the SHAPE, not
// the coefficient. It integrated force x time above a floor, and a landing spike is enormous but
// lasts ~15 ms, so the integral barely saw it — while a long gentle lean on the stops accumulated
// forever. That is backwards for a spring: what takes the set out of one is peak STRESS, once.
//
// So a bump-stop contact is now ONE EVENT, priced on its peak, square-law. Measured on the lab
// ramp, a 40 mph landing peaks around 21 kN and a 30 mph one around 16 kN, which is the range the
// numbers below are anchored in.
//
// It also carries the alignment CROSSTALK (owner): hitting a bump really hard is what throws a real
// truck's alignment out. Its floor is deliberately far above the spring floor — ordinary bottoming
// must never touch alignment, or every rough road would knock the truck out of line.

import { DamageModel, DAMAGE_PARAMS as D } from '../src/damage.js'

let fail = 0
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fail = 1 }
const DT = 0.004

/** Drive one bump-stop event through step(): on the stop at `peakN`, then off it. */
function bump (d, peakN, corner = 0, steps = 5) {
  const vs = { bumpForce: [0, 0, 0, 0] }
  for (let i = 0; i < steps; i++) { vs.bumpForce[corner] = peakN; d.step(vs, {}, DT) }
  vs.bumpForce[corner] = 0
  d.step(vs, {}, DT)
}
const fresh = () => new DamageModel({ params: {} })

console.log('§1 a bump-stop hit is priced on its PEAK, not on how long it lasted')
{
  const brief = fresh(); bump(brief, 20000, 0, 2)
  const long  = fresh(); bump(long,  20000, 0, 200)
  ok(Math.abs(brief.get('springFront') - long.get('springFront')) < 1e-12,
    'the same 20 kN peak costs the same whether it lasts 2 steps or 200 — leaning is not damage')
  ok(brief.get('springFront') < 1, '...and it does cost something')

  // The regression this gate exists for: a hard, brief landing must beat a soft, long one.
  const hard = fresh(); bump(hard, 21000, 0, 4)     // ~40 mph ramp landing
  const soft = fresh(); bump(soft, 4000, 0, 400)    // a long lean just over the floor
  ok((1 - hard.get('springFront')) > 20 * (1 - soft.get('springFront')),
    'a brief 21 kN landing costs far more than a long 4 kN lean — the shape that was wrong before')
}

console.log('\n§2 the floor is absolute, and the curve is square')
{
  const under = fresh(); bump(under, D.springForceFloor - 1)
  ok(under.get('springFront') === 1, `below the ${D.springForceFloor / 1000} kN floor a stop costs nothing at all`)

  const f = D.springForceFloor
  const a = fresh(); bump(a, f + 10000)
  const b = fresh(); bump(b, f + 20000)
  const ratio = (1 - b.get('springFront')) / (1 - a.get('springFront'))
  ok(Math.abs(ratio - 4) < 0.05, `doubling force-over-floor quadruples the damage (x${ratio.toFixed(2)}) — peak stress, square-law`)

  const kill = fresh(); bump(kill, D.springBumpFullN)
  ok(kill.get('springFront') <= 0.001, `one hit at ${D.springBumpFullN / 1000} kN destroys the spring outright`)
}

console.log('\n§3 the hit lands on the axle that took it')
{
  const d = fresh(); bump(d, 20000, 0)          // front-left
  ok(d.get('springFront') < 1 && d.get('springRear') === 1, 'a front-corner landing wears the FRONT springs only')
  const e = fresh(); bump(e, 20000, 3)          // rear-right
  ok(e.get('springRear') < 1 && e.get('springFront') === 1, '...and a rear-corner landing the REAR springs only')
}

console.log('\n§4 alignment crosstalk — only really hard bumps, and only that corner')
{
  const mild = fresh(); bump(mild, D.alignBumpFloorN - 1000)
  ok(mild.get('alignFL') === 1 && mild.camberOffsetDeg[0] === 0,
    `a bump below the ${D.alignBumpFloorN / 1000} kN alignment floor bends nothing — ordinary bottoming is not a wheel alignment`)
  ok(mild.get('springFront') < 1, '...though it still wears the spring, which is the point of two different floors')

  // MEASURED anchors (test/collision-drop-lab.mjs, after the progressive tire carcass). These are
  // the whole reason the floor was rescaled: the stiff carcass transmits ~5x into the stops, so at
  // the old 18 kN floor an ordinary landing was an alignment event and a single 3 m drop bent a
  // corner 1.04° of a 2° cap. Alignment is meant to go only on REALLY hard bumps.
  for (const [h, peakN, maxDeg] of [[1.0, 23000, 0], [2.0, 75600, 0.05], [3.0, 76700, 0.15]]) {
    const d = fresh(); bump(d, peakN)
    const bent = Math.abs(d.camberOffsetDeg[0])
    console.log(`  a ${h} m drop (${(peakN / 1000).toFixed(0)} kN on the stops) bends camber ${bent.toFixed(3)}°`)
    ok(bent <= maxDeg + 1e-9, `...at most ${maxDeg}°, so a landing is not an alignment job`)
  }

  const hard = fresh(); bump(hard, 400000, 1)   // front-right, well over the floor
  ok(hard.get('alignFR') < 1, 'a hard enough bump DOES throw that corner out')
  ok(hard.get('alignFL') === 1 && hard.get('alignRR') === 1, '...and only the corner that took it')
  ok(Math.abs(hard.camberOffsetDeg[1]) > 0 || Math.abs(hard.toeOffsetDeg[1]) > 0,
    '...bending real geometry (camber/toe degrees), not just a condition number')

  // Same seed, same drive, same bent axle — the bend is random but SEEDED (INFRA-03).
  const r1 = new DamageModel({ params: {}, seed: 7 }); bump(r1, 40000, 1)
  const r2 = new DamageModel({ params: {}, seed: 7 }); bump(r2, 40000, 1)
  ok(r1.camberOffsetDeg[1] === r2.camberOffsetDeg[1] && r1.toeOffsetDeg[1] === r2.toeOffsetDeg[1],
    'the bend is seeded, so a run replays identically')
}

console.log('\n§5 the drop anchors, re-measured after the progressive tire carcass')
{
  // The old anchors here were ramp landings measured with a LINEAR tire spring, and they no longer
  // describe the truck: a stiff carcass transmits far more into the stops. Measured bump-stop peak
  // on the lab drops after that change — a 2 m drop reads 75.6 kN where a 4 m drop used to read 15.
  // springBumpFullN was rescaled with them (85 kN -> 300 kN); at the old value a 2 m drop destroyed
  // the springs outright. NOTE these drive ONE corner, so the whole-axle cost in game is roughly
  // double — the measured 2 m drop cost springFront 14.6% with both front corners landing.
  for (const [h, peakN, lo, hi] of [[0.5, 2400, 0, 0.01], [1.0, 23000, 0.3, 3], [2.0, 75600, 4, 12]]) {
    const d = fresh()
    bump(d, peakN)
    const lost = (1 - d.get('springFront')) * 100
    console.log(`  a ${h} m drop (${(peakN / 1000).toFixed(1)} kN on the stops) costs the front springs ${lost.toFixed(1)}%`)
    ok(lost >= lo && lost <= hi, `...within the intended ${lo}-${hi}% band`)
  }
  // The no-harm floor still holds at the bottom: a gentle landing must be free.
  ok(fresh().get('springFront') === 1 && (() => { const d = fresh(); bump(d, D.springForceFloor - 1); return d.get('springFront') === 1 })(),
    'a bump-stop touch below the floor still costs nothing')
}

console.log(fail ? '\nFAIL — the bump-stop model has drifted' : '\nPASS — bump-stop hits are peak-priced events, and hard ones throw the alignment')
process.exit(fail)
