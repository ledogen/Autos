// M4-06: suspension damping characterization
// Scenario: scenarios/m4-06-bump-response.json — IC at rest, driver drives over a single bump.
// Expects: total Fz transient decays to < 10% of peak deviation within 1.5s. No NaN.

import { run, assertNoNaN, totalFz } from './lib-log.mjs'

const STATIC_TOTAL_FZ = 1360 * 9.81

run(({ log, fail, pass }) => {
  const nan = assertNoNaN(log)
  if (nan) return fail(nan)
  pass('no NaN/Inf in any frame')

  // Find the time of the peak deviation from static equilibrium.
  let peakDev = 0, peakFrame = -1
  for (let i = 0; i < log.frames.length; i++) {
    const dev = Math.abs(totalFz(log, i) - STATIC_TOTAL_FZ)
    if (dev > peakDev) { peakDev = dev; peakFrame = i }
  }

  if (peakDev < STATIC_TOTAL_FZ * 0.05) {
    return fail(`No significant bump transient (peak deviation ${peakDev.toFixed(0)} N < 5% of m·g). Drive over a bump while recording.`)
  }
  pass(`peak total-Fz deviation ${peakDev.toFixed(0)} N at frame ${peakFrame} (t=${log.get(log.frames[peakFrame], 't').toFixed(2)} s)`)

  // 1.5 seconds after the peak, deviation must be < 10% of peak.
  const tPeak = log.get(log.frames[peakFrame], 't')
  const settleThreshold = peakDev * 0.10
  let settled = false, settledFrame = -1
  for (let i = peakFrame + 1; i < log.frames.length; i++) {
    const t = log.get(log.frames[i], 't')
    if (t - tPeak < 1.5) continue
    // Check that ALL subsequent frames within a small window stay under threshold
    // (one frame dipping under by luck isn't "settled")
    let stableHere = true
    for (let j = i; j < Math.min(i + 5, log.frames.length); j++) {
      if (Math.abs(totalFz(log, j) - STATIC_TOTAL_FZ) > settleThreshold) {
        stableHere = false; break
      }
    }
    if (stableHere) { settled = true; settledFrame = i; break }
  }

  if (!settled) {
    // Look at the actual deviation 1.5s after peak for diagnostic context
    let probe = -1
    for (let i = peakFrame + 1; i < log.frames.length; i++) {
      if (log.get(log.frames[i], 't') - tPeak >= 1.5) { probe = i; break }
    }
    const probeDev = probe >= 0 ? Math.abs(totalFz(log, probe) - STATIC_TOTAL_FZ) : NaN
    fail(`Bump did not settle within 1.5s. Threshold ${settleThreshold.toFixed(0)} N, ` +
         `deviation at t+1.5s ≈ ${probeDev.toFixed(0)} N. Damping too low or N too few?`)
  } else {
    const settleTime = log.get(log.frames[settledFrame], 't') - tPeak
    pass(`settled within ${settleTime.toFixed(2)} s of peak (under ${settleThreshold.toFixed(0)} N threshold)`)
  }
})
