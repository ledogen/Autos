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

console.log('\n§2 the floor is absolute, and the curve saturates')
{
  const under = fresh(); bump(under, D.springForceFloorFront - 1)
  ok(under.get('springFront') === 1, `below the ${D.springForceFloorFront / 1000} kN FRONT floor a stop costs nothing at all`)
  // The floor is PER AXLE (owner, 2026-08-23). The truck lands nose-first and the front carries more
  // static load, so one shared floor made the front wear faster on every ordinary bump; the front's
  // is now higher, which is a statement about which hits are harmless rather than a rate fudge.
  ok(D.springForceFloorFront > D.springForceFloorRear, 'the front floor sits above the rear')
  {
    const mid = (D.springForceFloorFront + D.springForceFloorRear) / 2
    const fr = fresh(); bump(fr, mid, 0)      // front-left
    const rr = fresh(); bump(rr, mid, 2)      // rear-left
    ok(fr.get('springFront') === 1 && rr.get('springRear') < 1,
      `a ${(mid / 1000).toFixed(0)} kN hit is free at the front and costs the rear — the axles have their own floors`)
  }

  const f = D.springForceFloorFront
  const a = fresh(); bump(a, f + 10000)
  const b = fresh(); bump(b, f + 20000)
  const ratio = (1 - b.get('springFront')) / (1 - a.get('springFront'))
  // SUB-LINEAR since 2026-10-12 (owner, capture 1791793263302): the square law priced a 3.5 g road
  // sag — 31.5 kN on one front stop — at 0.2%, and "a bump of that severity should cause 3%". A
  // saturating curve is also the physical shape: the coil never sees more than full-bump stress.
  const want = Math.pow(2, D.springBumpExp)
  ok(ratio > 1 && ratio < 2 && Math.abs(ratio - want) < 0.02,
    `doubling force-over-floor multiplies the damage by ${want.toFixed(2)} (x${ratio.toFixed(2)}) — more, but less than double: it saturates`)

  // The reference hit is per axle too: the front's jounce bumper is a long progressive elastomer
  // that takes most of a landing, the rear's is a short snubber that hands it to the pack.
  const ref = fresh(); bump(ref, D.springBumpRefNFront)
  ok(Math.abs((1 - ref.get('springFront')) - D.springBumpRefDmg) < 1e-9,
    `one hit at ${D.springBumpRefNFront / 1000} kN costs a FRONT corner exactly ${D.springBumpRefDmg * 100}% — the capture's slam`)
  const refR = fresh(); bump(refR, D.springBumpRefNRear, 2)
  ok(Math.abs((1 - refR.get('springRear')) - D.springBumpRefDmg) < 1e-9,
    `one hit at ${D.springBumpRefNRear / 1000} kN costs a REAR corner the same ${D.springBumpRefDmg * 100}%`)
  ok(D.springBumpRefNFront > D.springBumpRefNRear, 'the front takes a harder hit for the same cost than the rear')
  const huge = fresh(); bump(huge, 5e6)
  ok(huge.get('springFront') >= 0 && huge.get('springFront') < 0.5, 'an absurd 5 MN hit takes more than half the spring, and the track never goes below 0')
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
  //
  // BANDS RE-ANCHORED 2026-09-14 for the front's own curve (owner: "reduce front spring damage from
  // both collisions and over travel"). The 14.6% above is exactly the complaint — seven 2 m landings
  // wrote the front springs off. Floor 5 -> 12 kN and destroy force 300 -> 450 kN put a 2 m landing
  // at about 2.1% per corner (~4% per axle, ~24 landings), and take ordinary bumps under 12 kN to
  // nothing at all. The PEAK FORCES are unchanged measurements — only what they cost moved.
  //
  // RE-ANCHORED AGAIN 2026-10-12 on a SATURATING curve (owner, capture 1791793263302: a 31.5 kN
  // front stop hit from a 3.5 g road sag "should cause 3%", it cost 0.2%). Owner's anchors: that
  // hit 3% per corner, a 2 m drop ~7% per landing, a 10 m drop ~30% per landing. The 10 m force
  // (294 kN per corner) is a headless level drop; the others are the lab's. Bands hold the capture
  // and the 10 m end exactly; the 2 m drop lands at ~6% per corner (~12% per landing, ~8 landings)
  // because the three anchors do not sit on one power law.
  // EASED 2026-10-15 after the owner drove it ("a little too much damage, threshold about right"):
  // reference cost 3% -> 2.2%, floors untouched, so every band below scales by 0.73.
  for (const [h, peakN, lo, hi] of [[0.5, 2400, 0, 0.01], [1.0, 23000, 1, 2.5], ['capture', 31500, 2.1, 2.3], [2.0, 75600, 3.5, 6], [10.0, 294000, 9, 14]]) {
    const d = fresh()
    bump(d, peakN)
    const lost = (1 - d.get('springFront')) * 100
    console.log(`  ${typeof h === 'number' ? `a ${h} m drop` : `the ${h} hit`} (${(peakN / 1000).toFixed(1)} kN on the stops) costs the front springs ${lost.toFixed(1)}%`)
    ok(lost >= lo && lost <= hi, `...within the intended ${lo}-${hi}% band`)
  }
  // The no-harm floor still holds at the bottom: a gentle landing must be free.
  ok(fresh().get('springFront') === 1 && (() => { const d = fresh(); bump(d, D.springForceFloorFront - 1); return d.get('springFront') === 1 })(),
    'a bump-stop touch below the floor still costs nothing')
}

console.log(fail ? '\nFAIL — the bump-stop model has drifted' : '\nPASS — bump-stop hits are peak-priced events, and hard ones throw the alignment')
process.exit(fail)
