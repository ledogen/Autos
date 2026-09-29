---
id: QUAL-33
type: quality
status: pending
severity: minor
opened: 2026-09-27
relates: BUG-76 (the stale carve this caused), BUG-63 (promotion existence varies with the window),
  FEAT-77 (clearance re-route), QUAL-21 (the precedent: degree drops decided over a WIDE graph)
---

# QUAL-33 — T promotions flip with the stream window because clearance partners are window-picked

## What

In free roam, whether a mid-span T promotion exists can depend on where the stream window sits.
- Measured at seed "w", T at (245, 604), R 320: the T is there when the window is centred within
  ~200 m. From 250 m west it is gone.
- The plan layer declines it with `promote-replan: g:1,0,2:0,1,2 the trunk rerouted out from under
  the plan`. That happens because the FEAT-77 clearance re-route picks its partners from what is
  routed inside the window, so the trunk's geometry differs.
- Removing the T moves the road there by 0.61 m.

BUG-76 made the built world FOLLOW such flips: the adopt diff re-carves what moved. That removes the
physics symptom, but not the flip.

## Why it is only minor for now

`test/road-flip-distance.mjs` measures where flips happen:
- 114–140 m at the closest, R 320;
- none within 100 m;
- none at all out to 300 m at R 576.

So the driven surface is deterministic. The costs are a re-carve roughly every adopt, and a possible
visible re-seat 100–150 m out. That is beyond the ~160 m draw distance only on the lower bound.
Story mode is unaffected (frozen region).

## Direction

Decide clearance partners (and anything else the plan layer reads) over a fixed WIDE graph around
each edge, independent of the window. This is the pattern QUAL-21 used for the degree drops. Cost:
extra pass-1 routes in the network worker, to be measured against PERF-27's cold-load numbers.

## Acceptance

- [ ] `test/road-flip-distance.mjs` reports no flips out to 300 m at R 320 on its paths; raise
      FLIP_FLOOR to match
- [ ] Cold-load (story-coldload) and driving hitch budgets don't regress
- [ ] `test/adopt-reconcile.mjs` over-invalidation drops (it will: fewer adopts are dirty)
