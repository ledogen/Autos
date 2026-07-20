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
import { LabSystem, PADS } from '../src/lab.js'

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
  // Start on the timing radial (the -Z point of the ring) and go round twice.
  let theta = -Math.PI / 2
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
    car.z = pad.cz - pad.r
    car.speed = 0.4
    lab.update(DT)
  }
  check('jittering on the timing line produces no phantom laps', !lab.best.get(pad.name),
    `recorded ${lab.best.get(pad.name)?.value.toFixed(2)}s`)
}

// ── 3. drag strip: 400 m at constant speed times exactly ────────────────────────────────────────
{
  const { lab, car } = makeLab()
  const v = 20                                    // m/s, constant → 400 m in exactly 20 s
  car.x = 0; car.z = 5; car.speed = v
  for (let i = 0; i < Math.ceil(30 / DT); i++) { car.z -= v * DT; lab.update(DT) }
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
  car.x = 0; car.z = -50; car.speed = 10
  for (let i = 0; i < Math.ceil(20 / DT); i++) { car.z += 10 * DT; lab.update(DT) }
  check('crossing the start line backwards does not arm a run', !lab.best.get('drag 400 m'))
}

// ── 5. braking arms on the brake input, and voids if the throttle comes back ────────────────────
{
  const { lab, car } = makeLab()
  const v0 = 30, a = 7
  car.x = 0; car.z = 0; car.speed = v0; car.brake = 1; car.throttle = 0
  let v = v0
  for (let i = 0; i < Math.ceil(10 / DT) && v > 0; i++) {
    car.z -= v * DT; v = Math.max(0, v - a * DT); car.speed = v
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
  car.x = 0; car.z = 0; car.speed = 30; car.brake = 1; car.throttle = 0
  for (let i = 0; i < 60; i++) { car.z -= 0.5; lab.update(DT) }
  car.throttle = 1; car.brake = 0
  for (let i = 0; i < 60; i++) { car.z -= 0.5; lab.update(DT) }
  car.brake = 1; car.throttle = 0; car.speed = 0.1
  lab.update(DT)
  check('a braking run that gets back on the throttle is voided', !lab.best.get('braking'),
    `recorded ${lab.best.get('braking')?.value}`)
}

// ── 6. braking below the arming speed is ignored (a parking-lot stop is not a brake test) ───────
{
  const { lab, car } = makeLab()
  let v = 10
  car.x = 0; car.z = 0; car.speed = v; car.brake = 1
  for (let i = 0; i < 200 && v > 0; i++) { car.z -= v * DT; v = Math.max(0, v - 5 * DT); car.speed = v; lab.update(DT) }
  check('a low-speed stop does not register as a braking test', !lab.best.get('braking'))
}

console.log(fails === 0 ? '\nPASS lab-timing' : `\nFAIL lab-timing (${fails})`)
process.exit(fails === 0 ? 0 : 1)
