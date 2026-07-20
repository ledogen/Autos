// GATE (FEAT-31): the testing lab's automatic timing gates and the numbers they derive.
//
// The lab exists to produce ONE number a machine can't: the fraction of the truck's measured
// envelope a human realizes through transitions (the `k` in PAR_REF = k × measured, FEAT-30).
// That number comes out of the skidpad as mu_realized = v²/(g·R), derived from a LAP TIME. So the
// lap timing and the derivation have to be right, or the calibration is built on sand — and a
// timing bug is invisible by eye (a lap that reads 21.0 s instead of 20.5 s just looks like you
// drove slightly worse).
//
// This drives LabSystem with synthetic, exactly-known car paths and checks the numbers it reports.
// Pure node — LabSystem builds THREE geometry but never needs a renderer.
import * as THREE from 'three'
import { LabSystem, PADS, RUMBLES, STRIP_Z, DRAG_LEN, RUMBLE_LEN, RUMBLE_W, rumbleSurface } from '../src/lab.js'

const DT = 1 / 60
const G = 9.81
let fails = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
  if (!ok) fails++
}

// A LabSystem fed by a mutable car object we drive by hand.
function makeLab () {
  const car = { x: 0, z: 0, speed: 0, brake: 0, throttle: 0 }
  const lab = new LabSystem(new THREE.Group(), () => car)
  lab.enter()
  return { lab, car }
}

// ── 1. skidpad lap → mu ─────────────────────────────────────────────────────────────────────────
// Drive an EXACT circle at an exact speed; the reported lap time and mu must match closed form.
for (const pad of PADS) {
  const { lab, car } = makeLab()
  const v = Math.sqrt(0.55 * G * pad.r)          // a plausible mu 0.55 lap for this radius
  const lapT = 2 * Math.PI * pad.r / v
  const omega = v / pad.r
  // Start on the timing radial (the +Z point of the ring — the pad's strip-side edge) and go
  // round twice.
  let theta = Math.PI / 2
  const steps = Math.ceil(lapT * 2.2 / DT)
  for (let i = 0; i < steps; i++) {
    car.x = pad.cx + pad.r * Math.cos(theta)
    car.z = pad.cz + pad.r * Math.sin(theta)
    car.speed = v
    lab.update(DT)
    theta += omega * DT
  }
  const best = lab.best.get(pad.name)
  check(`${pad.name}: a lap is timed`, !!best, 'no lap recorded')
  if (!best) continue
  check(`${pad.name}: lap time within 2% of closed form`,
    Math.abs(best.value - lapT) / lapT < 0.02, `got ${best.value.toFixed(2)}s expect ${lapT.toFixed(2)}s`)
  check(`${pad.name}: derived mu recovers the input mu`,
    Math.abs(best.mu - 0.55) < 0.02, `got ${best.mu.toFixed(3)} expect 0.550`)
}

// ── 2. a slow crawl must not be mistaken for a fast lap ─────────────────────────────────────────
{
  const pad = PADS[1]
  const { lab, car } = makeLab()
  // Sit ON the timing radial jittering across it — the classic double-trigger.
  for (let i = 0; i < 600; i++) {
    car.x = pad.cx + (i % 2 ? 0.05 : -0.05)
    car.z = pad.cz + pad.r
    car.speed = 0.4
    lab.update(DT)
  }
  check('jittering on the timing line produces no phantom laps', !lab.best.get(pad.name),
    `recorded ${lab.best.get(pad.name)?.value.toFixed(2)}s`)
}

// ── 3. drag strip: 400 m at constant speed times exactly ────────────────────────────────────────
// The strip runs along +X at z = STRIP_Z (rotated 2026-07-20 to share the skidpads' axis and keep
// the facility compact).
{
  const { lab, car } = makeLab()
  const v = 20                                    // m/s, constant → 400 m in exactly 20 s
  car.x = -5; car.z = STRIP_Z; car.speed = v
  for (let i = 0; i < Math.ceil(30 / DT); i++) { car.x += v * DT; lab.update(DT) }
  const best = lab.best.get('drag 400 m')
  check('drag 400 m is timed', !!best)
  if (best) check('drag time within 1% of 400/v', Math.abs(best.value - 20) / 20 < 0.01,
    `got ${best.value.toFixed(2)}s`)
  if (best) check('a flying start is flagged ROLLING, and no accel is derived',
    /ROLLING/.test(best.detail) && !best.derived, best.detail)
}

// ── 4. drag strip is directional — rolling backwards over the line starts nothing ───────────────
{
  const { lab, car } = makeLab()
  car.x = 50; car.z = STRIP_Z; car.speed = 10
  for (let i = 0; i < Math.ceil(20 / DT); i++) { car.x -= 10 * DT; lab.update(DT) }
  check('crossing the start line backwards does not arm a run', !lab.best.get('drag 400 m'))
}

// ── 4b. driving the strip's length OFF the strip must not trigger it ────────────────────────────
{
  const { lab, car } = makeLab()
  car.x = -5; car.z = STRIP_Z + 40; car.speed = 20     // parallel, 40 m to the side
  for (let i = 0; i < Math.ceil(30 / DT); i++) { car.x += 20 * DT; lab.update(DT) }
  check('a parallel run beside the strip does not trigger the gates', !lab.best.get('drag 400 m'))
}

// ── 5. braking arms on the brake input, and voids if the throttle comes back ────────────────────
{
  const { lab, car } = makeLab()
  const v0 = 30, a = 7
  car.x = 0; car.z = STRIP_Z; car.speed = v0; car.brake = 1; car.throttle = 0
  let v = v0
  for (let i = 0; i < Math.ceil(10 / DT) && v > 0; i++) {
    car.x += v * DT; v = Math.max(0, v - a * DT); car.speed = v
    lab.update(DT)
  }
  const best = lab.best.get('braking')
  check('braking run is captured', !!best)
  if (best) {
    const expect = v0 * v0 / (2 * a)
    check('braking distance within 3% of v²/2a', Math.abs(best.value - expect) / expect < 0.03,
      `got ${best.value.toFixed(1)}m expect ${expect.toFixed(1)}m`)
    const gotA = parseFloat(best.derived.match(/([\d.]+) m\/s/)[1])
    check('derived decel recovers the input decel', Math.abs(gotA - a) / a < 0.02,
      `got ${gotA} expect ${a}`)
  }
}
{
  const { lab, car } = makeLab()
  car.x = 0; car.z = STRIP_Z; car.speed = 30; car.brake = 1; car.throttle = 0
  for (let i = 0; i < 60; i++) { car.x += 0.5; lab.update(DT) }
  car.throttle = 1; car.brake = 0
  for (let i = 0; i < 60; i++) { car.x += 0.5; lab.update(DT) }
  car.brake = 1; car.throttle = 0; car.speed = 0.1
  lab.update(DT)
  check('a braking run that gets back on the throttle is voided', !lab.best.get('braking'),
    `recorded ${lab.best.get('braking')?.value}`)
}

// ── 6. braking below the arming speed is ignored (a parking-lot stop is not a brake test) ───────
{
  const { lab, car } = makeLab()
  let v = 10
  car.x = 0; car.z = STRIP_Z; car.speed = v; car.brake = 1
  for (let i = 0; i < 200 && v > 0; i++) { car.x += v * DT; v = Math.max(0, v - 5 * DT); car.speed = v; lab.update(DT) }
  check('a low-speed stop does not register as a braking test', !lab.best.get('braking'))
}

// ── 7. rumble lanes: the surface the suspension will be measured against ────────────────────────
// These feed the damage/wear model (SM-INV-5), whose calibration anchor is a severity THRESHOLD —
// light bump-stop contact must not damage, hard contact must. That only means anything if the
// ladder of inputs is exactly what it claims to be, so amplitude, period, and the C1 continuity
// that keeps the solver honest are all asserted here rather than eyeballed.
{
  for (const r of RUMBLES) {
    const at = (x, z = r.z) => rumbleSurface(x, z).y
    // Amplitude + period, sampled in the middle of the lane away from the fades.
    let peak = 0, trough = 1
    for (let x = 20; x < 100; x += 0.002) { const y = at(x); if (y > peak) peak = y; if (y < trough) trough = y }
    check(`rumble ${r.name}: peak height is ${r.amp * 1000} mm`,
      Math.abs(peak - r.amp) < 1e-4, `got ${(peak * 1000).toFixed(1)} mm`)
    check(`rumble ${r.name}: troughs return to the plane`, trough < 1e-6, `got ${trough}`)
    check(`rumble ${r.name}: crest spacing is ${r.spacing * 1000} mm`,
      Math.abs(at(50 + r.spacing / 2) - at(50 + r.spacing * 1.5)) < 1e-9
      && Math.abs(at(50) - at(50 + r.spacing)) < 1e-9)

    // C1 continuity: a sawtooth would hand the solver an unbounded impulse and we would be
    // measuring the integrator, not the suspension. Bound the second difference.
    let worst = 0
    for (let x = 20; x < 100; x += 0.005) {
      const d2 = (at(x + 0.005) - 2 * at(x) + at(x - 0.005)) / (0.005 * 0.005)
      worst = Math.max(worst, Math.abs(d2))
    }
    const bound = r.amp * 0.5 * (2 * Math.PI / r.spacing) ** 2 * 1.05   // |y''| of a raised cosine
    check(`rumble ${r.name}: profile is C1 (curvature bounded, no sawtooth)`, worst <= bound,
      `worst |y''| ${worst.toFixed(1)} vs bound ${bound.toFixed(1)}`)

    // Lateral feather: full height mid-lane, exactly zero outside it.
    check(`rumble ${r.name}: zero outside the lane`,
      at(50, r.z + RUMBLE_W / 2 + 0.01) === 0 && at(50, r.z - RUMBLE_W / 2 - 0.01) === 0)
    check(`rumble ${r.name}: no cliff at the lane edge`,
      at(50 + r.spacing / 2, r.z + RUMBLE_W / 2 - 0.05) < r.amp * 0.15,
      `edge height ${at(50 + r.spacing / 2, r.z + RUMBLE_W / 2 - 0.05).toFixed(4)}`)

    // Longitudinal fade so entering the lane is not a kerb strike.
    check(`rumble ${r.name}: fades in at the lane start`, at(0.05) < r.amp * 0.15)
    check(`rumble ${r.name}: zero before and after the lane`,
      at(-1) === 0 && at(RUMBLE_LEN + 1) === 0)
  }
  // The lanes must not overlap each other, nor the drag strip.
  for (const r of RUMBLES) {
    check(`rumble ${r.name}: clear of the drag strip`, rumbleSurface(50, STRIP_Z).y === 0)
  }
  const zs = RUMBLES.map(r => r.z).sort((a, b) => a - b)
  check('rumble lanes do not overlap', zs.every((z, i) => i === 0 || z - zs[i - 1] > RUMBLE_W))
}

// ── 8. the flat parts of the lab are actually flat ──────────────────────────────────────────────
{
  const pts = [[0, 0], [200, STRIP_Z], [DRAG_LEN, STRIP_Z], ...PADS.map(p => [p.cx, p.cz])]
  check('drag strip and skidpads sit on the flat plane',
    pts.every(([x, z]) => rumbleSurface(x, z).y === 0),
    JSON.stringify(pts.map(([x, z]) => rumbleSurface(x, z).y)))
}

console.log(fails === 0 ? '\nPASS lab-timing' : `\nFAIL lab-timing (${fails})`)
process.exit(fails === 0 ? 0 : 1)
