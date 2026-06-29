---
id: QUAL-08
type: quality
status: open
opened: 2026-06-28
severity: minor
source: user-request (2026-06-28 — after FEAT-16 2D map landed; map open/pan perf)
relates: FEAT-16 (2D top-down map — .planning/todos/completed/feat-2d-map-dev-tool.md), PERF-03 (Worker route dispatcher / warmRoutes)
---

# QUAL-08: Map2D — own Worker + incremental pan caching

## Problem

FEAT-16's 2D map (`src/map2d.js`) streams its own read-only `RoadSystem` synchronously on the main
thread. The first open (or a far pan, or a road-param change) routes the network in chunks
(`MAP_RADIUS_STEPS`), which spreads the ~10 s of routing across frames + paints terrain immediately —
good enough for testing, but it still **briefly blocks the main thread per chunk** and the network is
only ready *after* the user opens the map.

Two follow-ups (both "small potatoes for now", captured so they aren't lost):

1. **Own Worker — stream on world load, ready on demand.** The map should build its network OFF the
   main thread so it can stream in during world load and be *ready* the moment the player opens it (no
   open-time hitch at all). This also future-proofs the "graduate to a gameplay map prop" path (FEAT-16
   Future) — a real in-game map can't freeze the frame.

2. **Better caching — pan currently basically full-reloads.** `_startStream()` restarts the radius
   growth from the smallest step around the NEW pan center every far pan, so it effectively re-streams
   the whole band. The per-connection route cache makes the *routing* cheap on overlap, but the band
   assembly/`_detectJunctions` still redo the full window. Caching should be **incremental**: keep what
   was already streamed and only extend into the newly-revealed region as the cursor moves (a tile/ring
   cache keyed by world region, not a per-pan rebuild).

## Notes / direction (from FEAT-16 profiling)

- The cost is ENTIRELY `_streamNetwork` route computation; `_sliceNetwork` + `crossingList()` are
  ~free, and the per-connection ROUTE CACHE already persists across re-streams on one instance
  (re-stream same radius = 0.1 ms). The map does NOT need slicing at all (it reads `_network` +
  `crossingList()` only — no `_tiles`).
- The play network already routes off-thread via the **PERF-03 Worker route dispatcher**
  (`setRouteDispatcher` → `terrainSystem.postRouteJobs`) + `warmRoutes()`, with the `ROUTE SYNC` region
  of `src/road-carve.js` mirrored into `WORKER_SOURCE`. The map could either (a) reuse that dispatcher
  to pre-warm its larger-radius routes, or (b) own a dedicated lightweight Worker that builds
  `_network` + crossings for an arbitrary region and posts back drawable polylines. (b) is cleaner for
  the "ready on world load" goal and keeps the map fully decoupled from the play/terrain pipeline.
- Window-invariance (pure fn of seed + coords) is what makes any of this safe — the Worker can build
  the same network the main thread would.

## Acceptance

- Opening the map causes **no main-thread hitch** — the network is streamed off-thread (ideally
  pre-warmed during world load so it's ready on first open).
- Panning **extends** the streamed region incrementally rather than re-streaming the whole band each
  far pan (no redundant full rebuild on every pan past the drift threshold).
- Still window-invariant + read-only (no effect on the live play network / physics), and still
  reflects the current seed + `roadNetworkMode` / graph knobs being validated.
- Keep the render decoupled (canvas / reusable texture) so the FEAT-16 "graduate to a fluttering 3D
  map prop" path stays open.

## Out of scope

The gameplay map-prop itself (FEAT-16 Future) — this ticket is the streaming/perf plumbing that makes
it viable, not the prop.
