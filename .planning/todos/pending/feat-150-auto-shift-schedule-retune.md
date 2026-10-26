---
id: FEAT-150
type: feature
status: open
severity: minor
opened: 2026-10-25
source: owner, 2026-10-25 — "auto trans really struggles to get out of first gear. maybe we should adjust the ratios" · "maybe we should lower the ratio to second a little. also the shift logic seems to prefer to lug 3rd instead of downshifting to 2nd at full throttle even if there is rpm headroom."
relates: FEAT-23 (drivetrain), FEAT-124 (one shift schedule, throttle-averaged), data/transmissions.js 4r44e, data/ranger.js shift params, test/drivetrain-climb.mjs
---
lane: B

# FEAT-150: Automatic shift schedule — hangs in 1st, lugs 3rd instead of kicking down

## Owner report (plane play-test, 2026-10-25)

1. The auto "really struggles to get out of first gear".
2. At full throttle it "prefers to lug 3rd instead of downshifting to 2nd … even if there is rpm
   headroom".

## What the numbers say (src/drivetrain.js, data/ranger.js, data/engines.js vulcan30)

Ratios 2.47 / 1.47 / 1.00 / 0.71 (the real 4R44E). Upshift at `coupled` > shiftUp, where shiftUp
slides from shiftUpLightRPM 2000 (light foot) to shiftUpRPM 5400 (floored) by the throttle average
squared. The anti-hunt rule then BLOCKS the upshift unless the next gear's coupled rpm clears
`shiftDownEff + hysteresis`, hysteresis sliding 300 → 800 with load, shiftDownEff 1300 → 2400
(kickdownRPM) with load.

- **1st hangs.** At ~70 % average throttle: shiftUp ≈ 3700, next-gear rpm = 3700 × 1.47/2.47 ≈ 2200,
  but the bar is ≈ 2070 + 550 = 2620 → blocked. The box waits until 1st reaches ≈ 4400 rpm. Even
  floored it only just passes (3214 vs 3200). The 1st→2nd step (×0.595) is the biggest in the box, so
  the hysteresis band written for the 2nd→3rd and 3rd→4th steps (×0.68, ×0.71) bites hardest here.
- **3rd lugs.** A kickdown fires only when coupled < kickdownRPM 2400. In 3rd at 2400 coupled, 2nd would
  spin 2400 × 1.47 = 3530 — 1900 rpm of headroom under the 5400 upshift, which is the owner's point.
  The ranger.js comment caps kickdown at ~shiftUpRPM/1.7 ≈ 3200 to stop an upshift re-triggering a
  downshift; with the 1.47 step the true re-trigger line is 5400/1.47 = 3670, so kickdown has room up
  to ~3200–3400.

## Candidate fix (Lane B's call, with the drivetrain-climb gate and a drive)

- kickdownRPM 2400 → ~3200 (floored downshift into the power band; still under the re-trigger line).
- The 1st→2nd hang: either lower shiftHysteresis / shiftHysteresisLight (one band for every step is
  the real defect), or make the hysteresis a fraction of the gear step rather than a flat rpm figure.
  The owner also offered a ratio change ("lower the ratio to second a little" — a numerically
  higher 2nd, e.g. the 5R55E's 1.86); prefer fixing the schedule over faking the box, and say so if
  the schedule alone is not enough.
- n = 1 drive is not calibration (standing rule): prove it on test/drivetrain-climb.mjs plus a logged
  drive (st.coupledRPM is logged for this), then the owner drives it.

## Acceptance

- [ ] From a standing start at 50–80 % throttle the box leaves 1st by ~3000 rpm on the flat.
- [ ] Floored in 3rd with ≥ 1500 rpm of headroom in 2nd, it kicks down.
- [ ] No hunting on a grade (the anti-hunt case the hysteresis exists for) — drivetrain-climb green.
- [ ] Ratios stay the real 4R44E unless the owner rules otherwise.
