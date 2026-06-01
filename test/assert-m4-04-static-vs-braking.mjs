// M4-01, M4-04: load transfer under braking
// Scenario: scenarios/m4-04-static-vs-braking.json — IC at 60 km/h forward, driver applies brake.
// Expects: front Fz rises and rear Fz falls when brake > 0.5; total ≈ m·g; no NaN.

import { run, assertNoNaN, totalFz } from './lib-log.mjs'

const STATIC_TOTAL_FZ = 1360 * 9.81

run(({ log, fail, pass }) => {
  const nan = assertNoNaN(log)
  if (nan) return fail(nan)
  pass('no NaN/Inf in any frame')

  // Partition: braking frames vs non-braking frames.
  const brakingFrames = []
  const cruiseFrames  = []
  for (let i = 0; i < log.frames.length; i++) {
    const brk = log.get(log.frames[i], 'brk')
    if (brk > 0.5) brakingFrames.push(i)
    else if (brk < 0.05) cruiseFrames.push(i)
  }

  if (brakingFrames.length < 5) {
    return fail(`Insufficient braking frames (${brakingFrames.length}). Hold brake while recording.`)
  }
  pass(`${brakingFrames.length} braking frames, ${cruiseFrames.length} cruise frames`)

  // Mean front/rear Fz during cruise and braking
  const meanFz = (frames, prefix1, prefix2) => {
    let sum = 0
    for (const i of frames) {
      const f = log.frames[i]
      sum += log.get(f, prefix1) + log.get(f, prefix2)
    }
    return sum / frames.length
  }

  if (cruiseFrames.length >= 5) {
    const cruiseFront = meanFz(cruiseFrames, 'fl_fz', 'fr_fz')
    const cruiseRear  = meanFz(cruiseFrames, 'rl_fz', 'rr_fz')
    const cruiseTotal = cruiseFront + cruiseRear
    if (Math.abs(cruiseTotal - STATIC_TOTAL_FZ) / STATIC_TOTAL_FZ > 0.10) {
      fail(`Cruise total Fz ${cruiseTotal.toFixed(0)} N differs from m·g ${STATIC_TOTAL_FZ.toFixed(0)} N by >10%`)
    } else {
      pass(`cruise total Fz ≈ m·g (${cruiseTotal.toFixed(0)} N)`)
    }
  }

  const brakeFront = meanFz(brakingFrames, 'fl_fz', 'fr_fz')
  const brakeRear  = meanFz(brakingFrames, 'rl_fz', 'rr_fz')

  // Load transfer assertion: front rises, rear falls during braking.
  // Compare against static weight distribution (55/45 front/rear per ranger.js).
  const staticFront = STATIC_TOTAL_FZ * 0.55
  const staticRear  = STATIC_TOTAL_FZ * 0.45

  if (brakeFront <= staticFront * 1.05) {
    fail(`Front Fz under braking (${brakeFront.toFixed(0)} N) did not rise meaningfully above static (${staticFront.toFixed(0)} N)`)
  } else {
    pass(`front Fz rose under braking: ${staticFront.toFixed(0)} → ${brakeFront.toFixed(0)} N`)
  }

  if (brakeRear >= staticRear * 0.95) {
    fail(`Rear Fz under braking (${brakeRear.toFixed(0)} N) did not fall below static (${staticRear.toFixed(0)} N)`)
  } else {
    pass(`rear Fz fell under braking: ${staticRear.toFixed(0)} → ${brakeRear.toFixed(0)} N`)
  }

  // Conservation: total Fz under braking should still be near m·g (longitudinal transfer, not lost mass)
  const brakeTotal = brakeFront + brakeRear
  if (Math.abs(brakeTotal - STATIC_TOTAL_FZ) / STATIC_TOTAL_FZ > 0.20) {
    fail(`Braking total Fz ${brakeTotal.toFixed(0)} N drifted >20% from m·g (load not just transferred but created/destroyed)`)
  } else {
    pass(`braking total Fz ≈ m·g (${brakeTotal.toFixed(0)} N)`)
  }
})
