// test/pad-rumble.mjs — FEAT-247 gate: the controller-vibration mixer (src/pad-rumble.js).
//   silent at rest; bounded 0..1 even with every source at once; monotone in impact force (and in every source);
//   the master scales it (off = silent); the continuous signals read off a vehicle state are 0 at rest AND in a smooth
//   cruise (BUG-206), and rise with slip, a jolt, loose ground and speed; the motor mapping (texture and slip on the light motor, impacts on the heavy one).
import { rumbleMix, continuousSignals, strutHighPass, bentLevel, bentPhaseStep, RUMBLE_GAINS } from '../src/pad-rumble.js'

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

// BUG-206: cruising on smooth asphalt commands exactly zero; texture is loose ground, a jolt is a change of ground slope.
const rolling = (o) => ({ velocity: { x: 0, y: 0, z: -20 }, slipVel: [0.3, 0.2, 0.4, 0.3], strutCompVel: [0.1, -0.1, 0.1, -0.1], ...o })
const PAVED = 0.1   // main.js _looseSurfaceFactorAt on asphalt (params.dustPavedFactor)
const cruise = continuousSignals(rolling({}), { dustPavedFactor: PAVED, _wheelRunout: [0, 0, 0, 0] }, [], PAVED, 0.28)   // 0.28 m/s = the asphalt high band's max at 80 km/h
ok(Object.values(cruise).every(v => v === 0) && JSON.stringify(rumbleMix(cruise)) === '{"strong":0,"weak":0}', `smooth cruise at 72 km/h: every level exactly 0 ${JSON.stringify(cruise)}`)
const kerb = continuousSignals(rolling({ velocity: { x: 0, y: 0, z: -8 } }), {}, [], PAVED, 2.5)
ok(kerb.jolt > 0.5 && rumbleMix(kerb).strong > 0 && rumbleMix(kerb).weak > 0, `a kerb strike (2.5 m/s high band at 8 m/s) jolts both motors: ${kerb.jolt.toFixed(2)}`)
const gravel = continuousSignals(rolling({}), {}, [], 1, 0), crawl = continuousSignals({ ...rolling({}), velocity: { x: 0, y: 0, z: -3 } }, {}, [], 1, 0)
ok(gravel.rough > 0.9 && crawl.rough < gravel.rough && rumbleMix(gravel).weak > 0, `loose ground buzzes, more with speed: ${crawl.rough.toFixed(2)} at 3 m/s, ${gravel.rough.toFixed(2)} at 20`)
ok(continuousSignals(rolling({ slipVel: [8, 0, 0, 0] }), {}, []).slip > 0.5 && continuousSignals(rolling({}), {}, [true, false, false, false]).flat > 0.9
  && continuousSignals(rolling({ velocity: { x: 0, y: 0, z: -7.6 } }), { _wheelCondition: [0.25, 1, 1, 1] }, []).bent > 0.9, 'a slide, a flat and a bent wheel each read when rolling')
// The high-pass: a 1.2 Hz body heave of 0.3 m/s is mostly rejected, a kerb's 0.1 s strut spike passes.
const run = (f) => { const st = { x: [0, 0, 0, 0], y: [0, 0, 0, 0] }; let m = 0; for (let k = 0; k < 300; k++) { const v = f(k / 60); const o = strutHighPass([v, v, v, v], 1 / 60, st); if (k > 60) m = Math.max(m, o) } return m }
const heave = run(t => 0.3 * Math.sin(2 * Math.PI * 1.2 * t)), spike = run(t => (t > 2 && t < 2.1 ? 2 : 0))
ok(heave < 0.1 && spike > 1, `strut high-pass: 1.2 Hz heave 0.30 → ${heave.toFixed(3)} m/s, kerb spike 2 → ${spike.toFixed(2)}`)
const tex = rumbleMix({ rough: 1, slip: 1 }), hit = rumbleMix({ impact: 1 })
ok(tex.strong === 0 && tex.weak > 0 && hit.strong > hit.weak, 'mapping: texture and slip on the light motor only, an impact mostly on the heavy one')

// FEAT-287 / DEC-420: the bent wheel. Zero at >= 60 % at every speed; 25..60 % confined to 10..25 mph, peak at 17;
// below 25 % also felt at 40 mph (weaker than the peak); the pulse runs at the wheel's own turn rate.
const MPH = 0.44704
let zero60 = true
for (let mph = 0; mph <= 120; mph += 0.5) for (const c of [0.6, 0.7, 1]) if (bentLevel(c, mph * MPH) !== 0) zero60 = false
ok(zero60, 'a wheel at 60 % or better: exactly 0 at every speed 0..120 mph')
const b40 = (mph) => bentLevel(0.4, mph * MPH)
ok(b40(0) === 0 && b40(10) === 0 && b40(25) === 0 && b40(40) === 0 && b40(60) === 0, 'a 40 % wheel: 0 at 10 mph and at 25 mph and above')
let peak = 0, at = 0
for (let mph = 0; mph <= 40; mph += 0.1) if (b40(mph) > peak) { peak = b40(mph); at = mph }
ok(Math.abs(at - 17) < 0.2 && b40(13) > 0 && b40(13) < peak && b40(21) < peak, `a 40 % wheel peaks at ${at.toFixed(1)} mph (level ${peak.toFixed(2)})`)
ok(bentLevel(0.3, 17 * MPH) > bentLevel(0.55, 17 * MPH) && bentLevel(0.55, 17 * MPH) > 0, 'amplitude grows as condition falls from 60 % to 25 %')
ok(bentLevel(0.1, 40 * MPH) > 0 && bentLevel(0.1, 40 * MPH) < bentLevel(0.1, 17 * MPH) && bentLevel(0.01, 40 * MPH) > bentLevel(0.1, 40 * MPH) && bentLevel(0.1, 5 * MPH) === 0,
  `a 10 % wheel is felt at 40 mph (${bentLevel(0.1, 40 * MPH).toFixed(2)}), below the band peak, and dead under 10 mph`)
for (const w of [20.5, 48]) {   // wheel rate [rad/s]; the rim spins at w/2pi Hz. Count pulse peaks over 10 s of 1/120 s steps with a changing speed.
  const ph = [0, 0, 0, 0], vs = { velocity: { x: 0, y: 0, z: -w * 0.37 }, wheelOmega: [w, w, w, w] }
  let n = 0, prev = 0
  for (let k = 0; k < 1200; k++) { bentPhaseStep(ph, vs, { wheelRadius: 0.37 }, 1 / 120); if (ph[0] < prev) n++; prev = ph[0] }
  ok(Math.abs(n / 10 - w / (2 * Math.PI)) < 0.15, `pulse rate at wheel rate ${w} rad/s: ${(n / 10).toFixed(2)} Hz vs ${(w / (2 * Math.PI)).toFixed(2)} Hz`)
}
const sv = (z, ph) => continuousSignals({ velocity: { x: 0, y: 0, z: -z }, slipVel: [0, 0, 0, 0] }, { _wheelCondition: [0.3, 1, 1, 1] }, [], 0, 0, [ph, 0, 0, 0]).bent
ok(sv(7.6, 0) > 0.85 && sv(7.6, Math.PI) < 1e-9, 'the level is modulated: full at phase 0, zero at phase pi')
// FEAT-247 (owner 11-20): a flat tyre thumps once per turn of its wheel ("ka-thunk"), fading in over 5..15 mph.
const fl = (mph, ph) => continuousSignals({ velocity: { x: 0, y: 0, z: -mph * MPH }, slipVel: [0, 0, 0, 0] }, {}, [true, false, false, false], 0, 0, [ph, 0, 0, 0]).flat
ok(fl(30, 0) > 0.99 && fl(30, Math.PI) < 1e-9 && fl(30, Math.PI / 2) < 0.2, 'a flat is a pulse: full at phase 0, zero opposite, narrow')
ok(fl(4.9, 0) === 0 && fl(10, 0) > 0.4 && fl(10, 0) < 0.6 && fl(15, 0) > 0.99, `a flat fades in over 5..15 mph (${fl(4.9, 0)} / ${fl(10, 0).toFixed(2)} / ${fl(15, 0).toFixed(2)})`)
// FEAT-247 (owner 11-20): the kerb strike must stand over the shoulder's rumble (measured test/_kerb: 3x+ on the weak motor at 10..25 m/s)
const shoulder = rumbleMix({ rough: 1 }), strike = rumbleMix({ rough: 1, jolt: 0.4 })
ok(strike.weak >= 3 * shoulder.weak && strike.strong > 0.3 && shoulder.strong === 0 && shoulder.weak > 0.1, `kerb strike over full-speed loose ground: weak ${strike.weak.toFixed(2)} vs ${shoulder.weak.toFixed(2)} (x${(strike.weak / shoulder.weak).toFixed(1)}), strong ${strike.strong.toFixed(2)} vs 0`)
console.log('curve (level at 5/10/14/17/21/25/40 mph):')
for (const c of [0.7, 0.5, 0.3, 0.1]) console.log(`  ${c * 100}%: ` + [5, 10, 14, 17, 21, 25, 40].map(m => bentLevel(c, m * MPH).toFixed(2)).join(' '))

console.log(fail ? '\nFAIL' : '\nPASS')
process.exit(fail)
