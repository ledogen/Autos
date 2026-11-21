---
id: BUG-248
type: bug
status: closed
severity: major
opened: 2026-11-20
source: orchestrator, 2026-11-20 — cdp-smoke step "save" failed twice on seed 6: "the truck was not moving when the page was killed (0.0 m/s at (-2205.3, 734.4), propanePallet from residence)"
relates: FEAT-159, FEAT-162, FEAT-42, src/traction.js, test/cdp-smoke.mjs, test/wheel-collapse.mjs
---
lane: unplaced

# BUG-248: A collapsed front wheel strangles the throttle assist; the smoke's offer drive crashes the truck

## Next steps
Closed on land/smoke-save-stuck. The orchestrator lands it and smokes main.

## Summary
Two faults stacked. The GAME: with one front wheel written off (FEAT-162 collapse, hub jammed at ω = 0) the throttle
assist (on by default) took the two-front MEAN as ground speed, read the healthy rears as ~50 % slipping and held the
pedal at ~20 %: 2 km/h where the ratified drag allows ~68. The TEST: the offer step held W 6 s with no steering past
seed 6's first bend and let the truck coast unbraked into the scenery at ~19 m/s on every run.

## Description
### Measurements (browser, seed 6, story)
- Reproduced on boot,story,offer,save with the residence forced (1 fail in 6). At the road seat the loads were
  diagonal, fz [6069, 1773, 1092, 5575] N, and under 15 s of full throttle ω [1.6, 0, 0, 1.8] rad/s, 0.6 m/s,
  rpm ~1400. Setting wheelFR = wheelRL = 0 by hand gives the same signature: fz [6473, 1486, 655, 5679],
  ω [2, 0, 0, 2], 0.73 m/s, assist cap 0.27. So two wheels were collapsed (condition 0), not pinned by a prop.
- Where the wheels went: the offer step's 6 s hold from the burger joint's road point (-762, -948) leaves the road at
  the bend (2.5 m off the centreline at 6 s, 17.5 m/s), runs 20 m off-road and hits scenery at 19-20 m/s
  (20 → 3.5 m/s at (-676, -982.5)). Every traced run crashed: front armor −0.2, both fronts −0.06. The jalopy roll
  (wheels 0.7-1) plus the crash's random severity (the coast is wall-clock: the promise-box ticks, then the save
  step's park) sometimes writes off a wheel or two (one run: RR at 0 before the save step). Intermittent for that reason.
- Throttle assist with FR alone at 0, 6 s from rest at the residence: assist ON 0.59 m/s, cap 0.21, rpm 1283;
  assist OFF 8.0 m/s. Headless (wheel-collapse): front-left collapsed 66.7 km/h off, 1.9 km/h on.
- Ruled out by measurement: the pad seat (12 seats onto the yard ornaments, no rim force, no wheel change), the
  strapped pallet (clean wheels + pallet drive normally), stall / neutral (gear 1, ignition running).

### Fix
- `src/traction.js`: the reference speed is the FASTER undriven front (an ESC's drive-slip reference), so a jammed
  front cannot pull it down. In a turn the outer front reads up to track/2R fast (~4 % at 20 m).
- `test/cdp-smoke.mjs` offer step: 4 s of W (~25-30 m, still on the straight, past the 25 m start zone), then park.

## Tracker
- [x] Cause measured (collapsed wheels from the offer step's crash; assist reference halved by a jammed front)
- [x] Throttle assist references the faster front
- [x] wheel-collapse gate covers the assist-on case (failed before the fix: 1.9 km/h; after: 70.8 km/h)
- [x] Smoke offer step stops on the road

## Files
`src/traction.js` · `test/wheel-collapse.mjs` · `test/cdp-smoke.mjs`

## Log
- 2026-11-20: 41ab2477 traction fix + gate; offer step stops (4 s + park): 2 subset runs stop 0.3 m off the
  centreline with no damage change. Affected gates 37/37 green (--serial; the 2 browser gates below). pad-e2e ALL OK.
  Full smoke run 1: red in step "camp" ("Z did not close the truck face", 2 s wall wait; untouched code, load 13).
  The retry was stopped by the owner's quiet-machine hold: the full smoke is still OWED before landing.
