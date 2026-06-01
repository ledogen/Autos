// M4-02: per-wheel hub independence
// Scenario: scenarios/m4-02-asymmetric-bump.json — at rest, driver drives over a one-sided bump.
// Expects: one side's tire Fz transients while the opposite side stays near static; no NaN.

import { run, assertNoNaN, totalFz } from './lib-log.mjs'

const STATIC_TOTAL_FZ = 1360 * 9.81 // m·g, ranger curb weight
const STATIC_TOLERANCE = 0.10       // allow 10% slop in steady frames

run(({ log, fail, pass }) => {
  const nan = assertNoNaN(log)
  if (nan) return fail(nan)
  pass('no NaN/Inf in any frame')

  // Find a frame range where left-vs-right asymmetry shows up.
  // Asymmetry = |(fl_fz - fr_fz) + (rl_fz - rr_fz)| at some frame >> at rest.
  let maxAsym = 0, maxFrame = -1
  for (let i = 0; i < log.frames.length; i++) {
    const f = log.frames[i]
    const dF = (log.get(f, 'fl_fz') - log.get(f, 'fr_fz')) +
               (log.get(f, 'rl_fz') - log.get(f, 'rr_fz'))
    const a = Math.abs(dF)
    if (a > maxAsym) { maxAsym = a; maxFrame = i }
  }
  if (maxAsym < 500) {
    fail(`No significant L/R asymmetry observed (max |ΔFz| = ${maxAsym.toFixed(0)} N). ` +
         `Drive the car over the asymmetric bump while recording.`)
  } else {
    pass(`L/R asymmetry observed: ${maxAsym.toFixed(0)} N at frame ${maxFrame}`)
  }

  // Sanity: total Fz never exceeds a hard bound (no spring blow-up)
  const totals = log.frames.map((_, i) => totalFz(log, i))
  const maxTotal = Math.max(...totals)
  if (maxTotal > STATIC_TOTAL_FZ * 5) {
    fail(`Total Fz peak ${maxTotal.toFixed(0)} N > 5× static ${(STATIC_TOTAL_FZ*5).toFixed(0)} N`)
  } else {
    pass(`peak total Fz ${maxTotal.toFixed(0)} N within bound`)
  }

  // First frame should be near static equilibrium (loaded scenario, at rest)
  const first = totals[0]
  if (Math.abs(first - STATIC_TOTAL_FZ) / STATIC_TOTAL_FZ > STATIC_TOLERANCE) {
    fail(`Frame 0 total Fz ${first.toFixed(0)} N differs from m·g ${STATIC_TOTAL_FZ.toFixed(0)} N by >${STATIC_TOLERANCE*100}%`)
  } else {
    pass(`frame 0 total Fz ≈ m·g (${first.toFixed(0)} N)`)
  }
})
