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

## Owner rulings (2026-10-31)

The design moved on from "the truck stops at them":

- **The barricades are loose physics objects, 10 kg each.** The player can drive straight through them
  and they smash out of the way.
- **The edge is a fade, not a wall.** 10 m past the planners' wall (2410 m) the screen fades to black
  over 0.5 s, and the truck is put back on the nearest job road at 2390 m or less, facing inward along
  it. The 2500 m invisible wall stays as the backstop.
- A junction just inside 2400 m pushes its legs' rows out to 20 m along each leg, possibly a few metres
  past the fade line, so on those roads you fade just before the row. Accepted: the fade stays at 2410 m.

## Built (2026-10-31, feature/run-shape)

- **Rows** — poi.js `_barrierRow` (the camp's row, generalised: yaw from the road's tangent, each
  barricade on the deck's plane under it, `n` its normal) and `_edgeRows`: every edge off the planners'
  graph, at each crossing of the 2400 m circle, slid `poiRowNodeClearM` (20 m) clear of both edge ends.
  The camp's edge keeps its pad row. `poiSystem.barricades()`.
- **Loose bodies** — debris.js `roadBarrier` (10 kg). The terrain and road colliders exist only in the
  ring the truck streams (a loose barricade 2 km off fell through the world), so main.js stands a far row
  as three plain models on the deck's plane, swaps them for pinned, no-damage debris bodies at exactly
  those poses within 120 m, and back to upright models past 200 m or at an edge return.
- **The edge fade** — main.js `_checkEdge` / `_edgeReturn`: past 2410 m, `#camp-fade` to black, a
  tow-style reseat at `poiSystem.returnPoint()` (10 m samples of the job roads and the inside stretch of
  every road out, at ≤ 2390 m; the nearest, headed inward), the rows stood back up, fade in. It works
  during a job (the 2500 m wall does not). A deliberate debug teleport disarms it until the truck is back
  inside, like the wall.
- The camp lost its barricade boxes (`_barrierBox`): its collision is its registry entry again.
- Gates: expedition-camp section 2 finds the crossings independently (0 without a row on seeds 1 and 6:
  18 and 22 crossings), checks every barricade on its deck plane (worst 1.5 cm, steepest deck 20.7°) and
  the return from past every row. cdp-smoke `edge`: drive at a row, smash it, fade, come back at
  ≤ 2391 m facing in, the row stood back within 5 cm.
- **Census, seeds 1–100 (2026-10-31, test/camp-edge-census.mjs `rows`): 0 crossings without a row.**
  Roads out per region 13–32 (median 22), 2207 in all, a row on every one; the camp placed on all 100.
  24 rows (1.1 %, on 21 seeds) stand past the fade line: the junction-just-inside case, accepted.

## Acceptance

- [x] Every road edge crossing the story wall carries a barricade row (headless census, 100 seeds:
      0 crossings without one; the camp's crossing keeps its own).
- [x] Rows stand on the deck, striped faces inward, as loose bodies near the truck; the truck smashes
      through them, and past 2410 m it fades back to a road inside, facing in (owner, 2026-10-31).
- [x] expedition-camp, region-pieces, story-poi gates green; cdp-smoke passes.

## Follow-ups (2026-11-01, from BUG-103)

- **The map now draws the edge at the fade line with a tick per row** (BUG-103 ruling (f), map2d.js
  `_drawRegion`): the 2500 m ring is gone from the sheet.
- **Return spots stop short of every row** (owner, 2026-11-01: the camp's row stands at its pad,
  ~30 m inside the wall, so the return seated the truck just past the barricades and it crashed back
  through them). `_returnSpots` drops a spot on a row's far side or within poiEdgeReturnM inside it;
  on seed 3852053035 the camp road's last spot moved from 17 m past the row to 20 m inside it.
- [ ] Rows are not placed on BUG-63 `~p` parallel runs (they are absent from `networkGraph`). Measure
      how often a parallel crosses the wall, or close it as not occurring.
