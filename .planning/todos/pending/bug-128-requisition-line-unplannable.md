---
id: BUG-128
type: bug
status: open
opened: 2026-11-07
severity: critical
source: Lane A, while gating FEAT-154 (2026-11-07)
owner: Lane A
relates_to: SM-INV-7 (the run must be winnable), FEAT-157 (requisition lines), FEAT-154 (barricade rows), BUG-124 (the
  same class: a run-critical job that can't plan)
---

# BUG-128: on some worlds a requisition line can't be planned, so the run can't be won

## What happens

On random world 3109505264, the requisition line `reqFuel` does not plan: expedition-camp's check "every line plans
from its source to the camp … reqFuel (no route)" fails. The win needs every line, so that run can't be won
(SM-INV-7).

The same world also fails "from past every row the fade returns … near the row" on 4 barricade rows.

## Evidence (Lane A)

- Already on main: it fails the same with Lane A's FEAT-154 change stashed, and with the planner from before BUG-125
  (7fb41583's `mission.js`). So it is not BUG-124, BUG-125 or FEAT-154.
- The gate's two seeds (1 and 6) pass both checks, which is why it never showed.

## Root cause (Lane A, 2026-11-07): two halves, the same mismatch

Both halves are a road that **bows past the wall between two nodes that are inside it**.

1. **Planning.** The planner's graph (`mission.js _roll`, guard 1 via `buildGraphAdj`) admitted an edge when its two
   NODES were inside the wall (2400 m), even if its ROAD went past it. On 3109505264 one does: it runs out to 2485 m,
   past the 2410 m fade line. Dijkstra's shortest path from reqFuel's gas station (at 2317 m) to the camp used that
   edge. Guard 2 (every route point inside the wall) refused the finished route, rightly, because the fade would yank
   the truck off mid-job. Nothing searched again, so the line was null on every roll. An in-wall route exists: with
   that edge removed, the station still reaches the camp's inner node, 3849 m and 5337 m from its two nodes.
2. **Placement.** On 3873008110 the fuel line's only gas station stood at 2393 m ON such a road (nodes at 2159 m and
   2369 m, the road out to 2489 m). The stretch from the station to either node leaves the wall, so no route from it
   could pass guard 2, and it posted no job at all. The pad pool admitted a pad when its edge's nodes were inside the
   wall and the pad was within `radius − halfLen − 20` = 2473 m. That bound is older than the wall and its fade, and
   it let POIs stand past the fade: pumps at 2440 m and 2443 m, a school at 2432 m, a residence at 2446 m.

## Fix

- **One test, `mission.js edgeLeaves(road, a, b, inside)`:** does the edge's ROAD leave `inside`, sampled every 10 m
  along its routed centerline?
- **Planner:** `_roll` drops every edge `edgeLeaves` flags from its graph (`_bowingEdges`, cached per network revision
  and region), so Dijkstra only finds routes guard 2 accepts. This is constructive for every job, not only the lines.
- **Placement:** the pool's FEAT-67 rule ("its edge must be one the planner can use") now also asks `edgeLeaves`. A
  pad on such a road stays in the pool, set aside: no POI stands on it (`_assignRoster`'s `offWall`), but coverage
  siting keeps it in its sample, because it is still a place the player drives. The pad records are unchanged.
- Placement and planning now share one definition of "inside the wall" by construction.
- **What is constructive and what is sampled.** By construction, no line can fail any more because a road leaves the
  wall: no source stands on such a road, and no route can use one. What is only sampled is connectivity. If a bowing
  road were the only link between two parts of the region, dropping it would split the planner's graph. No census
  world came near it (every line planned on all 51), but that is a sample, not a guarantee. The orchestrator ruled the
  placement half go on 2026-11-07, as a correctness fix (unreachable POIs; an unwinnable run, SM-INV-7).

## Census (51 worlds: 3109505264 and 50 random; `wip/bug128-final.mjs` in the Lane A worktree, before = main)

| | before | after |
|---|---|---|
| a requisition line that can't plan | 2 worlds (3109505264 reqFuel; 3873008110 reqCrew + reqFuel) | **0** |
| a POI on a road that leaves the wall | 8 worlds, 10 POIs | **0** |
| a POI past the 2410 m fade | 4 (gasPump 2443 m, 2440 m; school 2432 m; residence 2446 m) | **0** |
| paper customers on such a road / past the fade | 0 / 0 | 0 / 0 |

- **POIs moved: 52 on 11 worlds.** Eight of those worlds had a POI on such a road, and the roster re-solves round it:
  a slot that loses its pad takes the next, and the slots below follow. On the other three (3441186333, 4183509901,
  66943497) only the coverage-sited pumps and shops move, 300–1300 m. Coverage's swap pass depends on the order
  it tries its candidates, so dropping candidates changes its path even when none of them was chosen. Before the
  pads were kept in the sample, it was 73 POIs on 12 worlds.
- **Live boards (the planner half alone): 11 of 993 offers changed, on 6 worlds:** 2 newly planned (the two lines),
  0 lost, 9 re-routed.
- **World fingerprint vs main (86d5747f): 54 of 54 identical.** Seed 6's and seed 11's story windows place no POI on
  such a road, so nothing in them moves.

## The 4 fade-return rows on 3109505264 (a separate cause; the gate's expectation, not the game)

Rows 1–2 stand on a road that dips into the circle with both ends outside it (nodes at 2453 m and 2458 m). Rows 3–4
stand on roads out of a node at 2339 m that is inside the wall but off the planners' graph, a stranded pocket. No
return spot sits behind such a row, so the fade correctly puts the truck on the nearest real road, 135–528 m away.
expedition-camp now exempts **a row whose road has no end on the planners' graph** (the orchestrator's option (b),
gate only; the props are harmless). A return on the row's own road also counts within 100 m, because a shallow wall
crossing puts its first spot 10 m inside about 42 m along.

Across the 51 worlds the old check failed 250 rows on 47 worlds, 188 of them unconnected. After the exemption and
the own-road rule, 27 connected rows on 15 worlds still miss it. All 27 return inside the wall, on a road, facing in:
14 to their own road 149–264 m along (where it runs nearly tangent to the wall), the rest to a nearer road 45–97 m
away. The gate keeps its pinned seeds (1, 6, 2167923713) and is not loosened further (orchestrator, 2026-11-07).

## Acceptance

- [x] Root cause named on 3109505264.
- [x] A census on ≥ 50 random seeds: how many worlds have a line that can't plan (any line, not only fuel), before
      and after.
- [x] Every line always plans: a constructive guarantee where the lines' sources and the camp are placed, or a
      fallback that never blocks the win.
- [x] The 4 fade-return rows on 3109505264 are explained (same cause or separate).
- [x] expedition-camp pins it on a random-seed sample (reported as a sample): 3109505264 (the planning half) and
      3873008110 (the placement half), with 1, 6 and 2167923713. Green on all five.
