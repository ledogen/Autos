---
id: BUG-08
type: bug
severity: minor
status: folded
opened: 2026-06-11
phase_origin: 08-road-routing
resolves_phase: 9
folded_into: 09-road-surface
source: user-observation
note: "FOLDED INTO Phase 9 (2026-06-11 discuss-phase) — junctions/ribbon mesh require window-invariant splines (D-16). Will auto-close on Phase 9 completion."
---

# BUG-08: Roads visibly re-shape in real time as you fly and new map streams in

## Symptom

Observed flying the free-cam over an already-visible road: the road **updated/shifted in real time**
as more of the map streamed into view. A centerline you already flew past changed shape once a new
streaming window kicked in. Visual "pop" / non-persistence of road geometry while moving.

NOT being fixed yet — captured for later (user request).

## Root cause hypothesis (not yet confirmed)

The road network is rebuilt per **streaming window**, and the geometry of a fixed world location is NOT
invariant to the view center — so when the window shifts, already-seen roads can come out different.

- `_streamNetwork(center)` (src/road.js) re-streams whenever the center moves more than
  `PROTO_REGEN_MOVE = 96 m`, building anchors/runs over `[center ± radius]`.
- The post-processing passes all operate over the **windowed** polyline and therefore depend on the
  window extent, not just on world coords:
  - inter-row same-direction overlap run-splitting (`PROTO_COVER_*` spatial hash, registered per-stream),
  - `_removeLoops`, `_removeSelfCrossings`, `_limitCurvature` (excisions depend on what is in-window),
  - collinear simplify / dedupe.
- So the same world road can be emitted with slightly different points / splits / excisions in window A
  vs window B → when the re-stream fires mid-flight, the visible spline changes.

This is **center-variant non-invariance**, distinct from the center-FIXED determinism that Phase 8
verified (two builds at the *same* center are identical — D-03). The intended contract is that roads are
a pure function of `(seed, world coords, params)` and should NOT depend on the streaming center/history;
this bug is a violation of that stronger invariance.

## Likely fix directions (for later)

- Make the network **tile/window-invariant**: build each macro-row run over a canonical, center-independent
  extent (e.g. anchor-chain keyed only on macro grid, not the current window), so re-streams reproduce the
  identical run for a given world region. Post-process per-run deterministically from canonical extents.
- Or cache emitted runs by deterministic world key and never re-derive a run that was already built, only
  extend the frontier.
- Ensure loop/curvature/overlap passes are computed on canonical run extents, not the transient window.

## Files

- `src/road.js` — `_streamNetwork` (windowing + `PROTO_REGEN_MOVE`), `PROTO_COVER_*` run-splitting,
  `_removeLoops` / `_removeSelfCrossings` / `_limitCurvature`, `this._network` keying.
- `src/main.js` — `roadSystem.update(streamCenter)` (re-stream cadence in the render loop).

## Notes

- Severity minor for now (visual only), BUT matters more for **Phase 9**: the ribbon mesh will be built
  from these splines, so a re-stream that shifts the centerline would rebuild/shift the road mesh under
  the truck. Worth resolving before/with Phase 9.
- Related: the Phase-8 determinism gate only checked same-center reproducibility, so this slipped through.
