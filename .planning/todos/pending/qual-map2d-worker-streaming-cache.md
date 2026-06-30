---
id: QUAL-08
type: quality
status: open
opened: 2026-06-28
severity: minor
source: user-request (2026-06-28 — after FEAT-16 2D map landed; map open/pan perf)
relates: FEAT-16 (2D top-down map — .planning/todos/completed/feat-2d-map-dev-tool.md), PERF-03 (Worker route dispatcher / warmRoutes)
updated: 2026-06-30 (user reframe — see "Reframe" below: warming can be FULLY BACKGROUND / no open-time race; warm progressively as the player drives; persistent generate-once region cache)
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

## Reframe (2026-06-30 — user)

Two clarifications that make this both easier and more clearly worth doing:

1. **Warming can be FULLY background — there is no open-time race to win.** The player won't start the
   game with a "map" item, so map generation can be hidden entirely. It does NOT need to be ready on the
   first open or finish within any deadline — as long as the warm runs off the critical path and isn't
   noticeable, a slow trickle is fine. This *relaxes* acceptance item 1: the bar is "warming never
   stutters the game," not "fully streamed before first open." (If the player opens it early and part is
   blank, that's acceptable — it fills in.)
2. **Warm slowly as the player DRIVES.** Rather than a one-shot stream at world load, continuously
   pre-warm the map network in the background following the player's movement (low-priority trickle), so
   by the time they first open the map the region they've driven through is already populated. Cadence =
   a slow drive-around warm, not a load-time burst.
3. **Generate ONCE, store, retrieve — persistent region cache.** Today a far pan effectively
   regenerates the whole network (`_startStream` restarts the radius growth around the new center). It
   should instead generate each world region once, keep it, and retrieve it when the cursor returns —
   a persistent tile/ring cache keyed by world region, accumulated as the player drives + pans, never a
   per-pan full rebuild. (This is acceptance item 2, strengthened: the cache should *grow and persist*
   for the session, not just avoid re-streaming the current band.)

These don't change the mechanism QUAL-08 already proposes (off-thread build + incremental region
cache) — they relax the timing bar (background trickle, no deadline) and make the caching goal explicit
(persistent, generate-once, accumulate-as-you-drive).

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

- Background warming **never stutters the game** — the map network builds off the critical path
  (own Worker / off-thread), trickling slowly as the player drives. No open-time deadline: partial/blank
  on an early open is fine as long as it fills in without a hitch.
- The map region the player has driven through is **already populated** by the time they first open it
  (drive-around pre-warm), with no main-thread hitch on open.
- Each world region is **generated once and persists for the session** — a far pan / return retrieves
  cached data instead of regenerating; panning **extends** into newly-revealed region only (no redundant
  full-band rebuild on every pan past the drift threshold).
- Still window-invariant + read-only (no effect on the live play network / physics), and still
  reflects the current seed + `roadNetworkMode` / graph knobs being validated.
- Keep the render decoupled (canvas / reusable texture) so the FEAT-16 "graduate to a fluttering 3D
  map prop" path stays open.

## Out of scope

The gameplay map-prop itself (FEAT-16 Future) — this ticket is the streaming/perf plumbing that makes
it viable, not the prop.
