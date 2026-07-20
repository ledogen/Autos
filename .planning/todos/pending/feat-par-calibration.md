---
id: FEAT-30
type: feature
status: open
opened: 2026-07-20
severity: minor
source: FEAT-29 resolution — par oracle shipped, PAR_REF uncalibrated
relates_to: FEAT-29 (par oracle, src/par.js), story-mode beta mission harness (src/mission.js),
  .planning/story-mode/DESIGN.md "The economy: par, payout, wear"
depends_on: nothing — needs recorded drives, which the beta mission harness now produces
---

# FEAT-30: Calibrate PAR_REF against real drives

## Request

`PAR_REF` in `src/par.js` (μ 0.75, accel 2.8, brake 5.5, vMax 28, junctionRadius 18) is a
first-pass guess. It currently prices a winding mountain leg at ~55-60 km/h average. Nobody has
checked that against a human actually driving the same route in the Ranger.

Payout is margin against par (SM-INV-4) and the whole balance problem is "negative on a lazy day,
positive on a brave one" — so a par that is uniformly unbeatable, or uniformly free, breaks the
economy before any of the economy exists.

## Method

1. Drive N missions from the beta harness (pause menu → story mode (beta)), recording elapsed vs
   par and the grade letter.
2. Look at the *shape* of the error, not just the mean: does par systematically over-price
   switchbacks (μ too high on tight radii), under-price straights (vMax too low), or mis-price
   junction transits (junctionRadius)?
3. Tune `PAR_REF` — **never the vehicle** (SM-INV-2). Add a debug-panel folder for the reference
   constants if hand-tuning proves fiddly (dev tooling, not a player surface).

## Acceptance

- [ ] A recorded set of ≥10 human drives with elapsed/par pairs across varied terrain.
- [ ] `PAR_REF` tuned so a competent, committed drive lands near ratio 1.0 and a casual drive
      lands clearly above it — the payout curve has to be able to go negative.
- [ ] The report-only human-drive bound in `test/par-oracle.mjs` upgraded from "plausible" to an
      actual recorded fixture, if a stable one exists.
- [ ] Residual bias documented in the ticket resolution (which road character par still misreads).
