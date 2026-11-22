---
id: BUG-256
type: bug
status: closed
severity: minor
opened: 2026-11-22
source: orchestrator, 2026-11-22 — the main.js smoke failed 3 of 9 runs at "opening": "off the road with the brake off, the evening did not put the truck back on it"
relates: FEAT-217, FEAT-184, BUG-173, DEC-219, DEC-230, test/cdp-smoke.mjs
---
lane: unplaced

# BUG-256: the smoke's off-road spot rolled the truck onto the shoulder, so the evening never reset it

## Next steps
None: closed. A test fix only (no `src/` change); safe to land.

## Summary
The opening step seated the truck "off the road" at the first point 25–45 m beside the road nearest to wherever 5 s of
W had left it. W is held for wall time, so the drive's length, and with it the pick, varied run to run. Some picks sat on
a slope: with the brake off the truck rolled ~38 m down into the 10 m band past the road's side that DEC-219 keeps safe
(6.2 m from the centreline), so the game rightly never reset it. Test fixture, not a game defect.

## Description
### Reproduction (seed 1872706826, the tutorial seed)
A probe in the opening step swept the old pick over the truck positions a drive could end at (the nearest road point
±120 m, 6 m steps: 19 distinct picks) and tried each twice: seat, brake off, 10 sim-s.
- (-205, 489): rolled 38.8 m, closest 6.2 m to the road, never reset (2 of 2).
- (-214, 495) and (-222, 499): rolled 26–33 m along the edge of the band, reset late (5.1–6.8 s of play, not 4).
- The other 16: reset at 4.0 s, as the rule says (two of them, seated 13–17 m out, rolled onto the road first).
The game's rule is position-only: off the road = more than 15 m from the centreline (roadHalfWidth 5 + offRoadM 10), not
parked, 20 m from every place. A truck that rolls into the band and sits there is on the shoulder by DEC-219. A player
there can drive back or press R, so there is no soft lock.

### Fix
`test/cdp-smoke.mjs`: one in-page finder, `flatSpot(lo, hi)`, serves both spots. It is the BUG-173 / DEC-230 shoulder
pick made general: the flattest point within 300 m of the joint at lo–hi m from the road, graded under 1.5 % (under the
rolling resistance, so the truck stays put with the brake off), clear of hard props within 6 m, 90 m from every place.
Off the road is 20–45 m (5 m past where the countdown starts), the shoulder 11–14 m as before. The pick no longer
depends on the drive. Neither check changed. The failure message now names the truck's distance to the road, how far it
moved from its seat, its speed, the brake and the tutorial phase.

## Tracker
- [x] Root cause found and reproduced deterministically (one pick of 19 fails 2 of 2)
- [x] Fixture fixed in the test; both checks unchanged
- [x] Opening subset repeated with the fix: see Log
- [x] Full smoke and pad e2e green

## Decisions
- 2026-11-22, agent (precedent DEC-230, the owner's ruling on the same kind of fixture fix): the off-road spot takes the
  shoulder spot's flat pick. No new ruling: the game behaviour and both assertions are unchanged.

## Files
`test/cdp-smoke.mjs`

## Log
- 2026-11-22: probe as above. Fix 526f2f6e. `SMOKE_STEPS=boot,story,opening` with the fix: 10 of 10 PASS (opening
  210–219 s). Full `cdp-smoke`: PASS 42 steps, zero console errors (opening 201.8 s). `pad-e2e`: ALL OK. `run-all
  --changed=test/cdp-smoke.mjs`: 1/1 green. Before: the full smoke failed 3 of 9 runs tonight; the probe failed 2 of 2 at one pick.
