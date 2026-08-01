---
id: FEAT-30
type: feature
status: completed
opened: 2026-07-20
closed: 2026-08-01
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

## Progress 2026-07-20

**Envelope measured** (`test/measure-vehicle-limits.mjs`, headless, no AI driver — open-loop
constant-steer skidpad, so there is no path-following to get wrong):
0→100 9.48 s · 400 m 16.98 s · vMax 46.3 m/s · braking 7.04 m/s² · **skidpad mu 0.577 mean,
0.51–0.66 across R 8–103 m** (flat — no falloff at tight radii).

Two findings:
- **`PAR_REF.mu = 0.75` is above the truck's measured 0.577.** Par currently asks for corner speeds
  unreachable at any skill level. This is wrong independent of difficulty tuning.
- **vMax is nearly a free parameter.** 42.6 vs 30.0 moved par by under a second — these roads are
  curvature-limited essentially everywhere. **mu is the dial**; accel/brake secondary.

**Lab shipped** (FEAT-31) with the skidpad that produces the missing number: a lap gives
`mu_realized = v²/(g·R)`, and `mu_realized / 0.577` IS `k` at that radius.

**What remains: the human laps.** That is the whole of this ticket now.

## Method

1. Drive laps on each lab skidpad (25 / 60 / 150 m) and each drag/braking run; record the derived
   numbers off the lab panel. Then drive N missions from the beta harness, recording elapsed vs par
   and the grade letter.
2. Look at the *shape* of the error, not just the mean: does par systematically over-price
   switchbacks (μ too high on tight radii), under-price straights (vMax too low), or mis-price
   junction transits (junctionRadius)?
3. Tune `PAR_REF` — **never the vehicle** (SM-INV-2). Add a debug-panel folder for the reference
   constants if hand-tuning proves fiddly (dev tooling, not a player surface).

## Acceptance

- [x] A recorded set of ≥10 human drives with elapsed/par pairs across varied terrain.
- [x] `PAR_REF` tuned so a competent, committed drive lands near ratio 1.0 and a casual drive
      lands clearly above it — the payout curve has to be able to go negative.
- [ ] The report-only human-drive bound in `test/par-oracle.mjs` upgraded from "plausible" to an
      actual recorded fixture, if a stable one exists.
- [x] Residual bias documented in the ticket resolution (which road character par still misreads).

## Resolution (2026-08-01)

**PAR_REF recalibrated against 20 unique labelled human drives** (`runs/*.json`, felt labels off
the result-card calibration form) with the new rainy-day fitter `test/calibrate-par.mjs`
(rebuilds each run's par input from its exported topology, per-run junction-correction factor,
sweeps mu × accel × brake against felt-class targets).

**Shipped: mu 0.62 → 0.90 · accel 2.8 → 3.0 (measured) · brake 5.5 → 7.0 (measured).**
Owner-picked from three candidate bands (balanced-bias point).

Findings, per the acceptance's "document the residual bias":
- At mu 0.62 par was uniformly generous: felt-SLOW drives graded A at ratio ~0.85. Broken
  independent of taste — a lazy drive must not beat par (SM-INV-4's arithmetic).
- The pass-2 ×0.85 "realization fraction" had the sign backwards: the reference is
  centerline-bound while a human cuts the line with the road width, so effective centerline mu
  EXCEEDS skidpad grip. The twisty-route bias in the residuals pointed straight at it.
- Under mu 0.90/3.0/7.0: felt-par → ~0.92 median, felt-slow → ~0.99, felt-very-slow → ~1.2,
  straighter/twistier residual halves balanced (+0.02/−0.05 log). Felt-par = 1.00 exactly is
  unreachable under any physically-flavoured knobs — the felt labels carry ±1-class noise
  ("fast" runs sit above "par" runs) — so par stays ~8% generous to a committed drive.
- Acceptance item 3 (upgrade the par-oracle report-only human bound to a fixture): NOT done —
  the felt labels proved too noisy to pin a stable single-run fixture; the 20-run set + fitter
  in-repo is the reproducible artifact instead. Re-run `node test/calibrate-par.mjs` whenever
  new labelled runs land.

Knock-on: every par time shrinks ~15-19%, so FEAT-53 payouts (k·par) shrink with them and
ratios rise — folded into FEAT-53 Phase D (k retune) rather than compensated here.
