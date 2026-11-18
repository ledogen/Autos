// test/rockslide-director.mjs — FEAT-26 gate: the rock slide director's pure parts (src/rockslide.js).
//
// The rate (a memoryless draw, mean 20 km), the release timing (the truck is v·T from the impact point when the rocks
// go), candidacy on synthetic ground (a cut that qualifies; too shallow, too low, a terrace, a fall line along the road,
// a blind crest, a tunnel, a run end that do not), the batch layout, and the director end to end on a straight run with
// a fake road and debris: it releases on time, holds while the truck is stopped, drops its pick when the truck turns
// round, and a forced trigger on a parked truck releases at the nearest candidate. Seeded RNG throughout.
//
// Run: node test/rockslide-director.mjs

import { SLIDE, ARRIVAL, nextArmM, releaseDue, arrivalS, faceAt, lineClear, candidateAt, batchBodies, runAt, RockslideDirector } from '../src/rockslide.js'
import { mulberry32 } from '../src/seed.js'

let fail = 0
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fail = 1 }

console.log('§1 the rate — Exp(mean 1/perKm)')
{
  const rng = mulberry32(26), n = 20000, d = Array.from({ length: n }, () => nextArmM(rng))
  const mean = d.reduce((a, b) => a + b, 0) / n / 1000
  const within2 = d.filter(x => x < 2000).length / n
  ok(Math.abs(mean - 1 / SLIDE.perKm) < 0.03 / SLIDE.perKm, `mean ${mean.toFixed(2)} km between slides (want ${1 / SLIDE.perKm})`)
  ok(Math.abs(within2 - (1 - Math.exp(-2 * SLIDE.perKm))) < 0.01, `P(next one within 2 km) ${(100 * within2).toFixed(1)} % = 1 − e^(−2/20) = ${(100 * (1 - Math.exp(-2 * SLIDE.perKm))).toFixed(1)} %`)
}

console.log('§2 release timing')
{
  const face = { dropM: 9, toeD: 6 }
  const T = arrivalS(face, 5 + 6 - 2.5)
  ok(Math.abs(T - (ARRIVAL.a + ARRIVAL.b * 3 + 8.5 / ARRIVAL.vRoad)) < 1e-9, `arrival ${T.toFixed(2)} s for a 9 m face, toe 6 m out, near lane`)
  ok(releaseDue(20 * T, 20, T) && !releaseDue(20 * T + 0.5, 20, T) && !releaseDue(-1, 20, T), 'due at exactly v·T ahead, not before, never once past')
}

// Synthetic ground: a straight run along +x at y 0. Left of the tangent (+z) a cut rises at `deg` from `toe` m past the
// deck edge (5 m) for `drop` m, then a bench. Optional: a crest on the road at x = cx (height ch), a fall line skewed
// along the road (`skew` × the across slope), a terrace (the toe lifted).
const ground = ({ deg = 45, toe = 6, drop = 9, cx = null, ch = 0, skew = 0, ramp = 0 } = {}) => (x, z) => {
  let h = Math.max(0, Math.min(z - 5, toe)) * Math.tan(ramp * Math.PI / 180)   // a gentle ramp up to the toe: a terrace
  const d = z - (5 + toe)
  if (d > 0) h += Math.min(drop, d * Math.tan(deg * Math.PI / 180)) + skew * x
  if (cx != null) h += ch * Math.max(0, 1 - Math.abs(x - cx) / 30)
  return h
}
const RUN = (L = 1500, spans = null) => ({ points: [{ x: 0, y: 0, z: 0 }, { x: L, y: 0, z: 0 }], polyCum: [0, L], tunnelSpans: spans })
const station = { x: 600, y: 0, z: 0, tx: 1, tz: 0 }

console.log('§3 candidacy')
{
  const f = faceAt(ground(), station, 1)
  ok(f && f.side === 1 && Math.abs(f.toeD - 6) <= 1 && f.dropM > 6 && f.fall.z < -0.9, `a 45° cut, 9 m, toe 6 m out qualifies on its side (drop ${f?.dropM.toFixed(1)} m, fall line toward the road)`)
  ok(!faceAt(ground(), station, -1), '…and the flat side does not')
  ok(!faceAt(ground({ deg: 30 }), station, 1), `a 30° face does not (min ${SLIDE.minDeg}°)`)
  ok(!faceAt(ground({ drop: 3 }), station, 1), `a 3 m face does not (min ${SLIDE.minDropM} m)`)
  ok(!faceAt(ground({ toe: 12 }), station, 1), `a toe 12 m out does not (max ${SLIDE.toeMaxM} m)`)
  ok(!faceAt(ground({ ramp: 25, toe: 7 }), station, 1), `a face whose toe stands ${(7 * Math.tan(25 * Math.PI / 180)).toFixed(1)} m up a 25° ramp does not (max ${SLIDE.toeMaxDy} m: a terrace)`)
  ok(!faceAt(ground({ skew: 0.8 }), station, 1), 'a fall line running along the road does not')
  const hill = ground({ cx: 540, ch: 6 })
  ok(!lineClear(hill, { x: 500, y: 1.3, z: 2.5 }, { x: 600, y: 0.5, z: 2.5 }) && lineClear(ground(), { x: 500, y: 1.3, z: 2.5 }, { x: 600, y: 0.5, z: 2.5 }), 'a 6 m crest between eye and impact point blocks the line; flat ground does not')
  const c = candidateAt(null, ground(), RUN(), 600, 1, 20)
  ok(c && c.side === 1 && c.D >= 20 * c.T, `a candidate at 20 m/s: sight checked over ${c?.D.toFixed(0)} m ≥ v·T (${(20 * c?.T).toFixed(0)} m)`)
  ok(!candidateAt(null, ground({ cx: 540, ch: 6 }), RUN(), 600, 1, 20), 'a crest on the approach (blind) is not a candidate')
  ok(!!candidateAt(null, ground({ cx: 540, ch: 6 }), RUN(), 600, -1, 20), '…but the same cut approached from the other side is')
  ok(!candidateAt(null, ground(), RUN(1500, [{ s0: 560, s1: 590 }]), 600, 1, 20), 'a tunnel on the approach is not')
  ok(!candidateAt(null, ground(), RUN(), 20, -1, 20) && !candidateAt(null, ground(), RUN(), 60, 1, 20) && !!candidateAt(null, ground(), RUN(), 60, -1, 20), `within ${SLIDE.endClearM} m of a run end, or with the approach off the run, is not`)
  ok(!candidateAt({ poiPadBlocked: () => true }, ground(), RUN(), 600, 1, 20), 'a POI apron at the impact point is not')
}

console.log('§4 the batch')
{
  const H = ground(), f = faceAt(H, station, 1), rng = mulberry32(4)
  let nOk = true, inPatch = true, above = true, along = true
  for (let k = 0; k < 50; k++) {
    const b = batchBodies(H, f, [0.3, 0.4, 0.5, 0.6], rng)
    nOk &&= b.length >= SLIDE.rocksMin - 1 && b.length <= SLIDE.rocksMax
    for (const r of b) {
      inPatch &&= Math.hypot(r.position.x - f.rel.x, r.position.z - f.rel.z) <= SLIDE.patchM * Math.SQRT1_2 + 0.01
      above &&= r.position.y > H(r.position.x, r.position.z)
      const vh = Math.hypot(r.velocity.x, r.velocity.z)
      along &&= Math.abs(Math.hypot(vh, r.velocity.y) - SLIDE.v0) < 1e-6 && (r.velocity.x * f.fall.x + r.velocity.z * f.fall.z) > 0.99 * vh
    }
  }
  ok(nOk, `${SLIDE.rocksMin}–${SLIDE.rocksMax} rocks a batch`)
  ok(inPatch && above, `every rock inside the ${SLIDE.patchM} m patch and clear of the ground`)
  ok(along, `released at ${SLIDE.v0} m/s down the fall line`)
}

console.log('§5 the director on a straight run (fake road + debris)')
{
  const H = ground(), e = RUN()
  const road = { _network: new Map([['r', e]]), queryNearest: (x, z) => ({ runKey: 'r', arcS: x }), poiPadBlocked: () => false, junctionPadBlocked: () => false }
  const spawned = []
  const debris = { load () {}, spawn (kind, position) { spawned.push(position); return spawned.length }, remove () {} }
  const run = (v, { from = 100, steps = 4000, turnAt = null, stopAt = null } = {}) => {
    spawned.length = 0
    const d = new RockslideDirector({ debris, road: () => road, heightAt: H, rng: mulberry32(9) })
    d.armed = true   // armed by the rate (not forced: a forced trigger on a parked truck releases at once)
    let x = from, vx = v, rel = null
    for (let k = 0; k < steps; k++) {
      if (turnAt != null && x > turnAt) vx = -Math.abs(vx)
      if (stopAt != null && x > stopAt) vx = 0
      d.update(1 / 60, { x, y: 0, z: 2.5, vx, vz: 0 })
      if (d.events && !rel) rel = { x, pick: d.last }
      x += vx / 60
    }
    return { d, rel }
  }
  const { rel } = run(20)
  const ahead = rel && rel.pick.imp.x - rel.x
  ok(rel && Math.abs(ahead - 20 * rel.pick.T) < 20 / 60 + 1e-6, `at 20 m/s it releases ${ahead?.toFixed(1)} m before the impact point = v·T (T ${rel?.pick.T.toFixed(2)} s), ${spawned.length} rocks`)
  ok(rel && rel.pick.imp.x > 100 + 20 * rel.pick.T, '…at a candidate the truck was still far enough from')
  const stopped = run(20, { stopAt: 101 })
  ok(!stopped.d.events, 'a truck that stops before the release gets none (the pick is held)')
  const turned = run(20, { turnAt: 101 })
  ok(!turned.d.events || turned.rel.x <= 101 && turned.d.last.imp.x < turned.rel.x, 'a truck that turns round does not get the slide it was heading for')
  const parked = (() => {
    spawned.length = 0
    const d = new RockslideDirector({ debris, road: () => road, heightAt: H, rng: mulberry32(9) })
    d.trigger()
    for (let k = 0; k < 120 && !d.events; k++) d.update(1 / 60, { x: 600, y: 0, z: 2.5, vx: 0, vz: 0 })
    return d
  })()
  ok(parked.events === 1 && Math.abs(parked.last.imp.x - 600) <= 80, `forced on a parked truck: released at the nearest candidate (${parked.last && (parked.last.imp.x - 600).toFixed(0)} m off)`)
  // Unforced: the odometer arms it at a mean of 20 km.
  const d = new RockslideDirector({ debris, road: () => road, heightAt: H, rng: mulberry32(11) })
  let x = 100, n = 0
  for (let k = 0; k < 60 * 60 * 60; k++) { d.update(1 / 60, { x, y: 0, z: 2.5, vx: 25, vz: 0 }); x += 25 / 60; if (x > 1400) x = 100 }
  ok(d.events >= 2 && d.events <= 12, `an hour at 25 m/s (90 km) on all-candidate road: ${d.events} slides (Poisson mean ≈ 4.5)`)
}

console.log(fail ? '\nFAIL — the rock slide director drifted' : '\nPASS — rate, timing, candidacy and the director hold')
process.exit(fail)
