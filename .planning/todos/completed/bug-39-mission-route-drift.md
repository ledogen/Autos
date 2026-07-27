---
id: BUG-39
type: bug
status: closed
opened: 2026-07-27
closed: 2026-07-27
severity: major
source: user report (post stream-hitch/story-mode merge) — Quick Job preview line does not always
  match the road the world actually built; sometimes it draws its own routing.
relates: [FEAT-29 (par oracle), FEAT-39 (GPS assist), FEAT-43 (region confinement), BUG-25 (window-bounded
  cull edge flips), QUAL-14 (route clearance), PERF-03 (route pre-warm)]
area: [mission.js, road.js, gps.js, map2d.js]
---

# BUG-39: Quick Job preview route drifts off the built road

## Symptom

When previewing a Quick Job, the previewed path (2D map polyline + GPS chevrons) usually traces the
road but **sometimes departs from it** — it takes a line the world never built, as if it had routed
the connection itself. Reported as worse:

- on **complex terrain**, where the router does more work per connection, and
- on **long story missions**, whose paths span many edges and many window moves.

Both point at a routing-invariance miss, not a drawing bug: the overlay is faithful to the
centerline it was handed; the centerline is not the one the carve/ribbon used.

## Where it can come from (two candidates, both in the code today)

**(A) `edgeParData` isolated-route fallback — `src/road.js:1621`.**
`MissionSystem._roll` plans on `networkGraph()` (registered `_network` edges only — correct, this is
the fix that stopped routes crossing empty hillsides) and then calls `road.edgeParData(a, b)` per
hop. On a `_network` miss (neither `g:A:B` nor `g:B:A`) it falls through to
`this._edgeCenterline(c1, c2)` — routing that edge **in isolation**, without the neighbour context
`_assembleGraphEdges` gives it (junction/deg-2 fitting, clearance nudges, self-clear, cull). That is
exactly "creates its own routing". The graph snapshot and the per-hop routing loop are not atomic: a
re-stream between them (or an edge dropped by a cull whose window moved) reopens the miss. Slow
terrain widens that window.

**(B) Stale bake vs. window-variance re-registration.**
`segments[]` holds **references to the offer-time centerline objects**, and `gps.bakeRoute` freezes
them into a polyline. A long mission drives through many streaming windows; a runKey that
re-registers with different geometry (BUG-25 edge flips, cull-window variance, QUAL-14 clearance
resolved differently with new neighbours) rebuilds the *road* while the *preview* keeps the old
curve. The far end of a long path is the most exposed — it is the least stable part of the window
when the mission is offered.

(A) explains "invents a route"; (B) explains "drifts as the mission gets longer". They are not
exclusive — fixing one may leave the other visible.

## Acceptance

1. **Headless gate (`test/`, registered in `test/gates.mjs`)**: plan a mission on ≥3 seeds (include a
   complex/mountainous one), then re-stream the world at ≥5 centers along the planned path and assert
   for every segment: its `runKey` is still registered, and the re-registered centerline is within
   **0.25 m** (max lateral deviation, sampled every 5 m) of the one the mission baked.
2. Assert `edgeParData` **never takes the isolated `_edgeCenterline` fallback** for an edge that came
   out of `networkGraph()` in the same planning pass — instrument it for the gate (a counter is fine;
   no per-frame plumbing in `src/`).
3. In-game verify: offer a long Quick Job on a complex seed, drive it end to end, confirm the GPS
   chevrons and the map polyline stay on the tarmac for the whole run.
4. Whatever the fix, `mission.segments` and the road the carve builds must be **the same curve by
   construction**, not by coincidence — if the preview cannot be guaranteed to match, it must fail
   the offer rather than draw a route the world does not have.

## Notes

- Do not "fix" this by re-routing the preview to look nicer, or by snapping the overlay to the
  nearest road surface — that hides a real invariance break (see
  `.planning/story-mode/DESIGN.md`; par is priced on these same segments, so a wrong centerline is a
  wrong par, not just a wrong line).
- Worth checking whether FEAT-43 region confinement changed which edges are registered at offer time
  vs. driven time — the mission graph is region-filtered, the streamer is not.

## Resolution (2026-07-27)

Owner could not reproduce after the story-mode/stream-hitch merge landed — drove Quick Jobs
in-game post-merge, preview stayed on the tarmac end to end. Closing as not reproducible. Neither
candidate root cause (A: isolated-route fallback, B: stale-bake-vs-window-variance) was confirmed
or fixed directly; if this resurfaces, re-open and start from the analysis above rather than
re-deriving it.
