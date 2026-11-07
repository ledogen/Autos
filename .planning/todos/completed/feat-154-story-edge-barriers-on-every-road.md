---
id: FEAT-154
type: feature
status: closed
severity: major
opened: 2026-10-30
source: owner, 2026-10-30 — "make a ticket (preferably up front) that says we need to put barriers on all roads that lead out of the playable area for story mode. most still just have the invis wall."
relates: FEAT-103 (the camp's three Type III barricades, poi.js `_barriers`, POI_PARAMS.poiCampBarriers), ASSET-71 (`roadBarrier` registry key), FEAT-28 (region wall), BUG-85 (region splits)
---
lane: A

# FEAT-154: Every road leaving the story play area ends at barricades, not an invisible wall

**The last item is built (2026-11-07, Lane A, with BUG-128):** rows on BUG-63's `~p` parallel runs that cross the wall. Close it on this landing.

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
- [x] Rows are not placed on BUG-63 `~p` parallel runs (they are absent from `networkGraph`). **MEASURED 2026-11-07
      (Lane A, `wip/feat154-parallel.mjs`, the 51-world BUG-124 census):** 37 parallel runs on 28 worlds; **2 worlds**
      have one crossing the planners' wall with no row (2167923713, 3109505264, one crossing each). It occurs, so
      it is not closed: the fix is a row at each `~p` wall crossing too (poi.js barricades, plus the expedition-camp
      gate's independent crossing count). The edge fade still returns a truck that drives out there, so it is a
      missing cue, not a hole.
      **BUILT 2026-11-07 (Lane A):**
      - `road.js parallelRuns()` lists the parallels, read-only: key, cells, and the points-backed centerline
        edgeParData uses.
      - `poi.js _wallRoads` walks every graph edge once, then the parallels, for both the rows (`_edgeRows`, same skip
        rule) and the fade's return spots (`_returnSpots`).
      - expedition-camp finds the parallel crossings off the network itself and pins 2167923713: 23 of 23 rows
        there, 22 of 23 before. On 3109505264: 21 of 21.
      - The new parallel row's return lands on its own road 42 m in, which the own-road rule (BUG-128) accepts.
      - World fingerprint vs main: identical.
## Landed (orchestrator, 2026-11-07)

Merge of 4f19faf2 on main (tree identical): affected 61/61, fingerprint-world 54/54 identical, cdp-smoke 25/25.

## Follow-up — Lane A, 2026-11-07: rows stand on a plane

Each barricade is a loose body that must start at rest, so the deck under its whole footprint has to fit the plane
it is seated on (expedition-camp: within 8 cm). Rows kept a fixed 20 m from their edge's ends (`poiRowNodeClearM`),
and near a junction that was not enough.

- **Census on main, 51 worlds, 1194 rows** (`wip/rows-apron.mjs`): 25 rows on 19 worlds were more than 3 cm off
  their plane. One world failed the gate's 8 cm: 398411380, rows at 17.7 cm and 13.9 cm. Those rows stood 20 m from a
  three-leg junction whose pad reaches only 14 m, on the vertical knee where the steep leg blends into it: −37 % to
  −62 % under one barricade's 1.15 m depth. Under BUG-121's region circles, seed 6 had one at 30.7 cm, 20 m from a
  junction, on its apron.
- **Fix (`poi.js _rowOnPlane`):** a row whose barricades miss their planes by more than `poiRowFitM` (4 cm
  `[DEFAULT]`) moves to the nearest arc where they fit, 1 m at a time either way, within `poiRowSlideM` (20 m
  `[DEFAULT]`) of its wall crossing and inside the old end clearance. Failing that, it takes the best-fitting arc.
- **Judged by the fit, not a pad's reach.** A first cut moved rows off any junction or bend pad
  (`road.junctionPadBlocked`). Seven census rows still touched one: five on a bend's fillet, two on a 32 m ring's
  mouth that no 20 m slide clears. All seven fit within 3.3 cm, so the pad test was moving rows that stood fine.
- **After, 51 worlds:** 0 rows past 8 cm (1 world before), 1 past 4 cm (4.5 cm, the best its window allows), 16
  past 3 cm on 13 worlds (25 on 19 before). Worst 4.5 cm (17.7 cm before).
- **Gates:** expedition-camp green on 1, 6, 2167923713, 3109505264, 3873008110 and 398411380 (now pinned). Affected
  gates 18/18. The world fingerprint is identical to main (rows are not in it).
- **land/bug-121, scratch merge (throwaway worktree, no commit):** seed 6's 30.7 cm barricade is cleared (its worst
  fit is 3.9 cm), and expedition-camp is all green there. The only conflict was test/gates.mjs's registry text.

