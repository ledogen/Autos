// RAINY-DAY (not in run-all): node test/assert-m4-05-wheel-lift-ramp.mjs <a recorded scenario log .json>
// M4-05: airborne wheel contributes zero Pacejka force
// Scenario: scenarios/m4-05-wheel-lift-ramp.json — IC at 50 km/h forward, driver hits ramp/curb to lift a wheel.
// Expects: at least one frame where one wheel has fz=0 (airborne), and its fy/sa also ≈ 0 (D-14 gate).

import { run, assertNoNaN } from './lib-log.mjs'

const CORNERS = ['fl', 'fr', 'rl', 'rr']

run(({ log, fail, pass }) => {
  const nan = assertNoNaN(log)
  if (nan) return fail(nan)
  pass('no NaN/Inf in any frame')

  // Find frames where any wheel is airborne (fz == 0)
  let airborneFrames = 0
  let consistencyViolations = []
  for (let i = 0; i < log.frames.length; i++) {
    const f = log.frames[i]
    for (const c of CORNERS) {
      const fz = log.get(f, `${c}_fz`)
      if (fz <= 0) {
        airborneFrames++
        // D-14: airborne wheel must have zero Pacejka contribution.
        // fl_fn here is the post-Pacejka normal force (same as fz when grounded).
        // When fz=0 (airborne), fy MUST be 0 (no lateral force) and sa MUST be 0.
        const fy = log.get(f, `${c}_fy`)
        const sa = log.get(f, `${c}_sa`)
        const fn = log.get(f, `${c}_fn`)
        if (Math.abs(fy) > 1e-3) {
          consistencyViolations.push(`frame ${i} ${c}: fz=0 but fy=${fy.toFixed(3)} N`)
        }
        if (Math.abs(sa) > 1e-3) {
          consistencyViolations.push(`frame ${i} ${c}: fz=0 but sa=${sa.toFixed(4)} rad`)
        }
        if (Math.abs(fn) > 1e-3) {
          consistencyViolations.push(`frame ${i} ${c}: fz=0 but fn=${fn.toFixed(3)} N`)
        }
      }
    }
  }

  if (airborneFrames === 0) {
    return fail(`No airborne frames in log. Drive the car onto the ramp/curb hard enough to lift a wheel.`)
  }
  pass(`${airborneFrames} corner-frames airborne (across ${log.frames.length} frames × 4 corners)`)

  if (consistencyViolations.length > 0) {
    // Report at most 5 to keep output sane
    for (const v of consistencyViolations.slice(0, 5)) fail(v)
    if (consistencyViolations.length > 5) fail(`...and ${consistencyViolations.length - 5} more`)
  } else {
    pass('airborne wheels have fy=0, sa=0, fn=0 (D-14 gate holds)')
  }
})
