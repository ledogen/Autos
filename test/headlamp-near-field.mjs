// GATE (BUG-210): the high beam lays no hard bright edge on the ground by the bumper.
//
// The owner: "On the ground right in front of the front bumper, the high beams illuminate the ground differently.
// There's a sharp, bright cutoff line." Cause: the high-beam pattern was a round 28° disk plus a 33° halo, so it threw
// peak candela 12–30° below the axis, onto the ground 1–3 m ahead; at 1/d² that near field read 10–70× the road at 10 m,
// and the 57° cone edge cut it off within 0.2 m of ground (0 → 78 between 0.5 and 0.7 m ahead of the lamp). Fix: the
// pattern is squashed below the axis (HEAD_TUNE.highCoreDownDeg, a real high beam's few-degree vertical spread).
//
// The ground illuminance on the lamp's centreline by three.js's spot formula (r184 lights_pars_begin + the cookie):
//   E(d) = I · pattern(0, el)/peak · smoothstep(cos angle, cos(angle·(1−penumbra)), cos θ) · r^−decay · window(r) · (h / r)
// for the lamp 0.55–0.75 m over flat ground. RULE: within 4 m of the lamp neither beam's illuminance rises faster than
// RISE_MAX of its near-field maximum per metre: the low beam's own soft ramp (1.1–1.5 /m), never the old high beam's edge
// (2.6 /m at 0.55 m ahead, re-checked below as the control by setting highCoreDownDeg back to the round disk's 28°).
import { lowBeam, highBeam, HEAD_TUNE as T } from '../src/vehicle-model.js'

const RISE_MAX = 1.6   // per metre, of the near-field maximum
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t) }
let fail = 0
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fail = 1 }

function profile (beam, I, ang, pen, dist, h) {
  let peak = 0
  for (let el = -60; el <= 10; el += 0.25) for (let az = -60; az <= 60; az += 1) peak = Math.max(peak, beam(az, el))   // drawCookie's normalisation
  const out = []
  for (let d = 0.3; d <= 30; d += 0.02) {
    const r = Math.hypot(d, h), el = -Math.atan2(h, d) * 180 / Math.PI
    const cone = smooth(Math.cos(ang), Math.cos(ang * (1 - pen)), d / r), win = Math.max(0, 1 - (r / dist) ** 4) ** 2
    out.push({ d, E: I * beam(0, el) / peak * cone * win / Math.max(r ** T.decay, 0.01) * (h / r) })
  }
  return out
}
const steepest = (b, I, a, p, D, h) => {
  const near = profile(b, I, a, p, D, h).filter(r => r.d <= 4), max = Math.max(...near.map(r => r.E))
  let rise = 0, where = 0
  for (let i = 1; i < near.length; i++) { const g = (near[i].E - near[i - 1].E) / (near[i].d - near[i - 1].d) / max; if (g > rise) { rise = g; where = near[i].d } }
  return { rise, where }
}
for (const h of [0.55, 0.65, 0.75]) {
  for (const [name, b, I, a, p, D] of [['low', lowBeam, T.lowIntensity, T.lowAngle, T.lowPenumbra, T.lowDistance], ['high', highBeam, T.highIntensity, T.highAngle, T.highPenumbra, T.highDistance]]) {
    const { rise, where } = steepest(b, I, a, p, D, h)
    ok(rise <= RISE_MAX, `${name} beam, lamp ${h} m up: steepest rise within 4 m ${rise.toFixed(2)} of its near max per m (at ${where.toFixed(2)} m ahead)`)
  }
}
const keep = T.highCoreDownDeg
T.highCoreDownDeg = T.highCoreDeg   // the round disk (before BUG-210)
const old = steepest(highBeam, T.highIntensity, T.highAngle, T.highPenumbra, T.highDistance, 0.65)
T.highCoreDownDeg = keep
ok(old.rise > RISE_MAX, `control: the old round high beam fails the rule (${old.rise.toFixed(2)} per m at ${old.where.toFixed(2)} m ahead)`)
console.log(fail ? '\nFAIL' : '\nPASS')
process.exit(fail)
