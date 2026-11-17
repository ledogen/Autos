// test/pad-rumble.mjs — FEAT-247 gate: the controller-vibration mixer (src/pad-rumble.js).
//   silent at rest; bounded 0..1 even with every source at once; monotone in impact force (and in every source);
//   the master scales it (off = silent); the continuous signals read off a vehicle state are 0 at rest and rise with
//   slip, road texture and speed; the motor mapping (texture and slip on the light motor, impacts on the heavy one).
import { rumbleMix, continuousSignals, RUMBLE_GAINS } from '../src/pad-rumble.js'

let fail = 0
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fail = 1 }

const rest = { velocity: { x: 0, y: 0, z: 0 }, slipVel: [0, 0, 0, 0], strutCompVel: [0, 0, 0, 0] }
const c0 = continuousSignals(rest, { _wheelRunout: [0, 0, 0, 0] }, [false, false, false, false])
ok(Object.values(c0).every(v => v === 0) && JSON.stringify(rumbleMix(c0)) === '{"strong":0,"weak":0}', 'at rest every level is 0 and the mix is silent')
ok(JSON.stringify(rumbleMix({})) === '{"strong":0,"weak":0}', 'no sources, no vibration')

const all = Object.fromEntries(Object.keys(RUMBLE_GAINS).map(k => [k, 5]))   // far out of range on purpose
const m = rumbleMix(all, RUMBLE_GAINS, 1.5)
ok(m.strong === 1 && m.weak === 1, 'every source at once, over-range, at the high master is clamped to 1')
const neg = rumbleMix({ impact: -3 })
ok(neg.strong === 0 && neg.weak === 0, 'a negative level is silent')

let mono = true, prev = { strong: -1, weak: -1 }
for (let f = 0; f <= 1.0001; f += 0.05) {
  const x = rumbleMix({ impact: f })
  if (x.strong < prev.strong || x.weak < prev.weak) mono = false
  prev = x
}
ok(mono, 'monotone (non-decreasing) in impact level over 0..1')
ok(rumbleMix({ impact: 1 }).strong > rumbleMix({ impact: 0.2 }).strong, 'a harder hit is stronger')
let every = true
for (const k of Object.keys(RUMBLE_GAINS)) {
  const lo = rumbleMix({ [k]: 0.3 }), hi = rumbleMix({ [k]: 0.9 })
  if (hi.strong < lo.strong || hi.weak < lo.weak) every = false
}
ok(every, 'every source is monotone')
ok(rumbleMix({ impact: 1 }, RUMBLE_GAINS, 0).strong === 0, 'master off = silent')
ok(rumbleMix({ impact: 0.4 }, RUMBLE_GAINS, 0.5).strong < rumbleMix({ impact: 0.4 }, RUMBLE_GAINS, 1).strong, 'low is quieter than normal')

const rolling = (o) => ({ velocity: { x: 0, y: 0, z: -20 }, slipVel: [0, 0, 0, 0], strutCompVel: [0, 0, 0, 0], ...o })
const rough = continuousSignals(rolling({ strutCompVel: [0.5, -0.5, 0.5, -0.5] }), {}, [])
const smooth = continuousSignals(rolling({}), {}, [])
ok(smooth.rough === 0 && rough.rough > 0.5, `road texture: smooth ${smooth.rough}, washboard ${rough.rough.toFixed(2)}`)
const slow = continuousSignals({ ...rolling({ strutCompVel: [0.5, -0.5, 0.5, -0.5] }), velocity: { x: 0, y: 0, z: -2 } }, {}, [])
ok(slow.rough < rough.rough, 'the same texture is felt less at a crawl')
ok(continuousSignals(rolling({ slipVel: [8, 0, 0, 0] }), {}, []).slip > 0.5 && continuousSignals(rolling({}), {}, [true, false, false, false]).flat > 0.9
  && continuousSignals(rolling({}), { _wheelRunout: [0.04, 0, 0, 0] }, []).bent > 0.9, 'slip, a flat and a bent wheel each read when rolling')
const tex = rumbleMix({ rough: 1, slip: 1 }), hit = rumbleMix({ impact: 1 })
ok(tex.strong === 0 && tex.weak > 0 && hit.strong > hit.weak, 'mapping: texture and slip on the light motor only, an impact mostly on the heavy one')

console.log(fail ? '\nFAIL' : '\nPASS')
process.exit(fail)
