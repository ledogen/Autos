// M4-07: ramp-slide D-06 gate
// Scenario: scenarios/m4-07-ramp-slide.json — car at rest on 10-degree ramp, no input, 3 s record.
// Expects: car slides downhill (vz grows by >0.5 m/s) and total Fz never exceeds 3× static weight.
// Currently FAILS against pre-fix physics.js (line 270 drops horizontal contact normal — D-06 / D-17).
// Will PASS after Plan 02 routes X/Z residual through _hubNormalXZ into the body force accumulator.

import { run, assertNoNaN, totalFz } from './lib-log.mjs'

// mass from data/ranger.js: 1360 kg
const STATIC_TOTAL_FZ = 1360 * 9.81

run(({ log, fail, pass }) => {
  // (1) No NaN / Inf in any frame
  const nan = assertNoNaN(log)
  if (nan) return fail(nan)
  pass('no NaN/Inf in any frame')

  // (2) Total Fz must not exceed 3× static weight (would indicate double-counting of contact force)
  const totals = log.frames.map((_, i) => totalFz(log, i))
  const maxTotal = Math.max(...totals)
  if (maxTotal > 3 * STATIC_TOTAL_FZ) {
    fail(`Total Fz peak ${maxTotal.toFixed(0)} N > 3× static ${(3 * STATIC_TOTAL_FZ).toFixed(0)} N. Possible double-count of X/Z contact force.`)
  } else {
    pass(`peak total Fz ${maxTotal.toFixed(0)} N within 3× static bound`)
  }

  // (3) Downhill slide gate: vz must grow by more than 0.5 m/s over the record window.
  // g·sin(10°) ≈ 1.70 m/s² → even with friction, velocity should grow by several m/s in 3 s.
  // 0.5 m/s is a generous lower bound that distinguishes a sliding car from a stuck one.
  const vz = log.col('vz')
  const firstVz = vz[0]
  const lastVz = vz[vz.length - 1]
  if (lastVz - firstVz <= 0.5) {
    fail(`Car did not slide downhill: vz start=${firstVz.toFixed(3)}, end=${lastVz.toFixed(3)}. X/Z routing broken?`)
  } else {
    pass(`car slid downhill: vz ${firstVz.toFixed(3)} → ${lastVz.toFixed(3)} m/s (Δ=${(lastVz - firstVz).toFixed(3)})`)
  }
})
