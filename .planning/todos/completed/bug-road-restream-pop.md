---
id: BUG-08
type: bug
severity: minor
status: closed
opened: 2026-06-11
phase_origin: 08-road-routing
resolves_phase: 9
folded_into: 09-road-surface
source: user-observation
note: "FOLDED INTO Phase 9 (2026-06-11 discuss-phase) — junctions/ribbon mesh require window-invariant splines (D-16). Will auto-close on Phase 9 completion."
closed: 2026-06-21
resolution: "Proven invariant by the road-invariance harness (Phase 2 world-anchored run identity). Standing regression guards in npm test."
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

## Resolution (2026-06-21)

Proven no longer reproducible. The road network is now a pure function of `(seed, world-coords,
params)`, invariant to streaming center AND streaming history — the exact contract this bug violated.
Fixed by Phase 2 of the invariance harness (world-anchored run identity + arc origin in `src/road.js`).

Standing regression guards (both in `npm test`, exit 0 with exact-zero deltas):

- `test/restream-invariance.mjs` → `DRIVE-IN-MATCHES-FRESH`: drives east into (0,0) from x=-800
  re-streaming each frame (the literal BUG-08 "fly while map streams in" scenario), then asserts the
  fixed region == a fresh build — 2588 on-road pts, geomΔ=0, gradeΔ=0, camberΔ=0. Plus
  `REVISIT-MATCHES-FRESH` (far-jump to x=1200 and return) and `WITHIN-CELL-SKIP-PRESERVES-CACHE`.
- `test/invariance.mjs` → `GEOMETRY-INVARIANT`: two builds at centers 800 m apart emit byte-identical
  network geometry in the overlap (130/130 pts); `ARCS-INVARIANT` / `GRADEY-INVARIANT` worst Δ 0.

Caveat: gates run on the harness synthetic coarse-height (seed 6), but BUG-08 is a structural
windowing/excision invariance independent of the height function, and the gates drive the real
`RoadSystem` streaming/slicing/post-process paths named in the root-cause section above.
