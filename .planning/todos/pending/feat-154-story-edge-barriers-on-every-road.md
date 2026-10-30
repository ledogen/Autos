---
id: FEAT-154
type: feature
status: open
severity: major
opened: 2026-10-30
source: owner, 2026-10-30 — "make a ticket (preferably up front) that says we need to put barriers on all roads that lead out of the playable area for story mode. most still just have the invis wall."
relates: FEAT-103 (the camp's three Type III barricades, poi.js `_barriers`, POI_PARAMS.poiCampBarriers), ASSET-71 (`roadBarrier` registry key), FEAT-28 (region wall), BUG-85 (region splits)
---
lane: A

# FEAT-154: Every road leaving the story play area ends at barricades, not an invisible wall

## What

FEAT-103 put three 3 m Type III barricades across the paved road past the expedition camp — striped
faces toward the player, 0.5 m gaps, shoulders open, each seated on its deck and mirrored into the
camp body's collision (MESH == PHYSICS). Every OTHER road that crosses the 2400 m story wall still
stops the truck with the invisible wall. The owner wants the camp's treatment on all of them: the
same barricade row at every road crossing of the wall, so the edge of the play area reads as a road
closure everywhere, not as a glass wall.

## Where to look

- `src/poi.js` `_barriers` (FEAT-103) — the siting and seating of the camp's row; lift it into a
  per-crossing routine and run it for every edge that crosses the wall, not only the camp's.
- Each row needs a body to hang its boxes on: the camp's ride on the camp body. Elsewhere a static
  body per crossing (physics-engine adapter handle), or one body for all the rows.
- The wall itself stays (the invisible one is the backstop; a barricade is 3 m, a truck can leave
  the deck). Shoulders stay open as at the camp.
- Census: `test/camp-edge-census.mjs` already walks the crossings for the camp; extend it to count
  crossings and assert a row on each.

## Acceptance

- [ ] Every road edge crossing the story wall carries a barricade row (headless census, 100 seeds:
      0 crossings without one; the camp's crossing keeps its own).
- [ ] Rows are on the deck, striped faces inward, mirrored into physics; the truck stops at them.
- [ ] expedition-camp, region-pieces, story-poi gates green; cdp-smoke passes.
