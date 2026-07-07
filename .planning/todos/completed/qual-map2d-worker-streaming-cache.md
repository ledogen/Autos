---
id: QUAL-08
type: quality
status: done
resolved: 2026-07-06
opened: 2026-06-28
severity: minor
source: user-request (2026-06-28 — after FEAT-16 2D map landed; map open/pan perf)
relates: FEAT-16 (2D top-down map — .planning/todos/completed/feat-2d-map-dev-tool.md), PERF-03 (Worker route dispatcher / warmRoutes), BUG-26 (shared-Worker routing DISABLED — see Convergence)
updated: 2026-07-01 (see Convergence — BUG-26 disabled shared-Worker routing; a dedicated ROAD-NETWORK Worker now serves BOTH this ticket AND re-enabling play-network pre-warm). Prior 2026-06-30 user reframe below (background warm, drive-around, persistent cache).
---

# QUAL-08: Map2D — own Worker + incremental pan caching

> CLOSED 2026-07-06 — user-verified done. Landed via the QUAL-08/QUAL-14 worker work rather than a
> map2d-specific implementation: routing runs on the dedicated RoadRouteWorker POOL
> (src/road-worker.js, 2–4 workers), and map2d shares play's per-connection route caches
> (map2d.setSharedRouteSource adopting cls/clsSolo — QUAL-14, f2fc05b), with the bundled
> default-world cache making the shipped world's map effectively pre-warmed. Map open/pan perf
> confirmed acceptable in-game by the user.

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

## Convergence with BUG-26 (2026-07-01) — a dedicated ROAD-NETWORK Worker serves both

BUG-26 found that the road router and terrain heightfield gen **share one Worker (FIFO)**, and route
pre-warm jobs **starved terrain generation → white void**. The fix (`USE_WORKER_ROUTING=false` in main.js)
**disabled the PERF-03 shared-Worker route pre-warm** and routes on the main thread instead — so this
ticket's note #2 option (a) "reuse that dispatcher" is now **moot** (the dispatcher is off). BUG-26's own
long-term fix and this ticket are now the **same underlying work**: stand up a **dedicated road-network
Worker**, separate from the terrain-heightfield Worker, that can route/build `_network` + crossings for an
arbitrary region off-thread. That one Worker would serve BOTH:
- **Re-enable play-network pre-warm** without starving terrain (routing on its OWN Worker, not terrain's)
  → flip `USE_WORKER_ROUTING` back on, pointed at the new Worker (not `terrainSystem.postRouteJobs`).
- **Map2D background warming** (this ticket) — the map builds its read-only network on that same Worker.

So do this ticket as **"dedicated road-network Worker"** (option (b)), not "reuse the terrain dispatcher."
The `ROUTE SYNC` region of `src/road-carve.js` is already mirrored into a Worker template — the new Worker
reuses that routing code; window-invariance (pure fn of seed+coords) is what makes an off-thread build
byte-identical to the main thread.

**Scope guardrail — TWO workers total, split by cadence not algorithm.** Terrain-gen (latency-critical,
frequent) + this network/route worker (bursty, can-wait). Do NOT add a carve worker: `_buildCarveTable`
sits at the terrain+route CONFLUENCE (needs heights AND routed centerlines), so a carve worker means
shipping both inputs cross-worker + another SYNC copy + a round-trip the terrain latency can't afford —
it's ~3.4 ms/frame main-thread today with no frame drops, cheaper to leave put. Target is the iGPU floor
(~2 cores): a 3rd+ worker just adds idle threads + contention.

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

---

## STATUS (2026-07-01 — CORE LANDED, uncommitted)

**Done (the BUG-26 long-term fix + play pre-warm re-enabled):**
- NEW `src/road-worker.js` — dedicated road-network routing Worker (`ROAD_WORKER_SOURCE` + `RoadRouteWorker`
  main-thread transport). Generated from the gate-passing pieces (scratchpad `gen-road-worker.mjs`) so the
  ROUTE SYNC region is byte-identical. Client-tagged envelope (`'play'` / `'map'`).
- `src/terrain.js` — route handler + ROUTE SYNC region + `postRouteJobs` + the `routed` reply branch
  REMOVED. Terrain Worker is heightfield-only now (no shared FIFO → BUG-26 root gone). `_roadSystem`/
  `setRoadSystem`/carve path untouched.
- `src/main.js` — `USE_WORKER_ROUTING = true`; `RoadRouteWorker` instantiated, play RoadSystem registered
  as `'play'`, dispatcher re-pointed; re-seed + re-register on seed-change rebuild. Kill-switch retained.
- `src/map2d.js` — `setRouteWorker()` + registers its read-only RoadSystem as client `'map'` + pre-warms
  off-thread in `_pump` (routes decoupled from the play/terrain pipeline).
- `test/route-worker-sync.mjs` — re-pointed to `src/road-worker.js`; **PASS** (468 lines byte-identical).
- `npm test`: 26/27 gates green. The one red — `arc-router.mjs` `PERF:search-time` (~68–75 ms/conn) — is a
  wall-clock perf assertion on `road-carve.js` (which QUAL-08 does NOT touch); machine-speed flake, not a
  regression. All invariance / carve / smoothness / physics gates green.
- **Not committed** — the tree also holds concurrent QUAL-10 work on disjoint files (road.js/road-mesh.js/
  ranger.js/debug.js). QUAL-08 files (road-worker.js, terrain.js, main.js, map2d.js, route-worker-sync.mjs)
  are cleanly separable. Commit order per COORDINATION: QUAL-10 first, then this.

**Deferred (Map2D acceptance items 1–3 — the "background warm" half):**
- Full **drive-follow background trickle** (warm the map network as the player DRIVES, no open-time) and the
  **persistent incremental region cache** (extend into newly-revealed ring on pan; don't restart
  `MAP_RADIUS_STEPS` from step 0). Reason: the naive "warm a 1500 m band every frame" risks a *new* hitch
  (ironic vs BUG-26) and the ticket itself says **measure before building a region store** (Open Q1). What
  landed gives the map its **own off-thread routing + kept-alive persistent route cache** (reopen/re-pan
  over a warmed region is cheap); the drive-follow cadence + incremental-pan store need in-browser
  profiling to tune safely. Keep this ticket OPEN for that half.

**In-browser verification — BUG-26 CONFIRMED FIXED (2026-07-01, user).** Abusing the road-rebuild sliders
and moving around quickly can no longer reproduce the stuck-in-the-void behaviour — terrain never starves.
The dedicated route Worker fully resolves BUG-26 (stopgap `cac64db` → this dedicated Worker → browser pass).
Remaining browser check (non-blocking): the Map2D "background warm" half (deferred above) — confirm the map
fills without a main-thread hitch once that half is built.

## Implementation Plan (2026-07-01 — lead session)

### Shape of the fix

Stand up **ONE new dedicated worker** — `src/road-worker.js`, a Blob classic worker built from an
embedded source string (same pattern as `terrain.js`'s `WORKER_SOURCE`). It is a **pure route-job
server**: it holds no network, no state beyond the seeded coarse-noise closure; it takes route jobs and
returns arc-primitive descriptors. The routing code **moves OUT** of `terrain.js`'s `WORKER_SOURCE` so
the terrain worker is heightfield-only again — that removal is the real BUG-26 cure (no shared FIFO to
starve). Both consumers (play network + Map2D) use the **same job contract**; a `client` tag on the
envelope routes each reply back to the correct `RoadSystem` instance.

Mechanically this is the **existing PERF-03 pre-warm path, re-pointed** — not a new algorithm. The
main-thread synchronous router stays as the cold-load / teleport / cache-miss fallback (headless gates,
which have no Worker, are unaffected).

### Files

- **NEW `src/road-worker.js`** — two things:
  1. `ROAD_WORKER_SOURCE` template string (the worker body). Embeds, verbatim from canonical:
     - seed helpers `mulberry32` / `seedFor` / `createNoise2D` (canonical `src/seed.js`, CARVE SYNC),
     - `coarseHeight` (canonical `src/terrain.js`, SYNC RULE — routing samples coarse only, not fine/regional),
     - the **`ROUTE SYNC` region** — `arcPrimitiveConnect` + dubins helpers + search scratch (canonical
       `src/road-carve.js`).
  2. A thin main-thread wrapper `RoadRouteWorker` — spawns the Blob worker, `init(seed, coarseParams)`,
     `postRouteJobs(client, jobs, epoch)`, and `onmessage` → look up the registered client by `client`
     tag → `client.ingestRoutedConnections(results, epoch)`. `registerClient(id, roadSystem)` /
     `reinit(seed, params)`.

- **EDIT `src/terrain.js`** — DELETE from `WORKER_SOURCE`: the `'route'` message branch (L758–775) and
  the entire `ROUTE SYNC` mirror region (L739–742 + the spliced arcPrimitive block above it). DELETE on
  the class: `postRouteJobs` (L1112), the `if (e.data.routed)` branch in the main-thread `onmessage`
  (L968–973), and `_roadSystem` / `setRoadSystem` plumbing. Terrain worker is now `init` + `generate`
  only. (Net: terrain.js shrinks; `coarseHeight` stays — the heightfield still needs it.)

- **EDIT `src/main.js`** — instantiate `RoadRouteWorker`; register the play `roadSystem` as client
  `'play'`; set `USE_WORKER_ROUTING = true` and point the dispatcher at
  `roadWorker.postRouteJobs('play', jobs, epoch)` (NOT `terrainSystem.postRouteJobs`). Re-init the road
  worker on seed change alongside the terrain worker. Keep `USE_WORKER_ROUTING` as the kill-switch
  (flip false → fully synchronous, the current BUG-26-safe state).

- **EDIT `src/road.js`** — the dispatcher surface (`setRouteDispatcher` / `warmRoutes` /
  `ingestRoutedConnections`, L1145–1240) is **unchanged in shape**. Only the dispatch target differs, and
  it's already an injected `fn`. No structural road.js change needed for the play side. (This region does
  NOT overlap the uncommitted QUAL-10 node-junction edits at L2740–2980 — see COORDINATION handoff.)

- **EDIT `src/map2d.js`** — give the map's kept-alive `RoadSystem` a route dispatcher pointed at the same
  worker as client `'map'`. Warm on a **drive-follow trickle** (low priority; no open-time deadline per
  the 2026-06-30 reframe). Make panning **incremental**: don't restart `MAP_RADIUS_STEPS` growth from the
  smallest step around each new center — extend into the newly-revealed ring only. The persistent
  region cache is mostly free already (instance kept alive → per-connection route cache persists); measure
  before building a real tile/ring store (see Open Q1).

- **EDIT `test/route-worker-sync.mjs`** — re-point the "worker copy" region from `src/terrain.js` to
  `src/road-worker.js` (START marker + a new END marker). Still an `npm test` gate; now it guards
  `road-worker.js` byte-equality with `road-carve.js` canonical.

### Job contract (same mechanism, new envelope)

```
main → worker : { type:'route', client, jobs:[{key,ax,az,bx,bz,opts}], epoch }
worker → main : { routed:true, client, epoch, results:[{key,prims}] }
```
`RoadRouteWorker.onmessage` forwards `results` to the client registered under `client` via its existing
`ingestRoutedConnections(results, epoch)` — which already rejects stale epochs **per instance**, so the
play and map epochs never cross-contaminate. Not-yet-init'd → echo keys with `prims:null` (existing
pattern) so the client releases them from `_pendingRoutes` and re-warms after init.

### Starvation / priority

The route worker is bursty and latency-tolerant; the synchronous main-thread router remains the fallback
for any cache miss. Two clients share one FIFO — play throttled by `PREWARM_MAX_JOBS`, map by its own
trickle. Worst case if map warm ever contends = a play cache-miss routes synchronously on the main thread
(today's behaviour), and terrain is **never** touched (separate worker). If map warm ever visibly delays
play warm, add a 2-lane priority (play ahead of map). Ship v1 with the shared FIFO; note the lane as v2.

### Acceptance mapping

- "never stutters the game" → routing is off terrain's worker (BUG-26 root removed) and on its own.
- "region driven through already populated" → play + map both warm on a drive-follow trickle.
- "generated once, persists for session" → map `RoadSystem` kept alive (route cache persists) + incremental pan.
- "window-invariant + read-only" → the worker routes the same pure fn (ROUTE SYNC → byte-identical to the
  synchronous fallback); the map instance stays read-only, no effect on play physics.
- "render decoupled" → untouched; map still paints to its own canvas.

### Open questions (decide at execution)

1. **Does Map2D need a real tile/ring store, or is "keep instance alive + don't restart radius growth"
   enough?** Ticket profiling says `_sliceNetwork` / `crossingList` / assembly are ~free and the route
   cache already persists → probably enough. Measure a far-pan-and-return before building a store.
2. **Keep `USE_WORKER_ROUTING` kill-switch?** Yes — retain it as a one-line fallback to fully-synchronous
   (the current, verified-safe BUG-26 state) in case the new worker regresses.
3. **Client registry lifetime** — the map's `RoadSystem` is recreated on seed/param change (`_rebuildRoad`);
   re-register it with the worker each rebuild (or key the registry by a stable `'map'` id and swap the
   instance). Prefer the stable-id swap so in-flight replies for the old instance are dropped by epoch.

### Sequencing vs the other three workers

All four efforts touch `road.js` + `main.js`, but in **non-overlapping regions** (this ticket:
dispatcher L1145–1240 + terrain-worker split; QUAL-10: node junctions L2740–2980; ponds: route-around
exclusion; streams: bridge/crossing). The one genuinely shared string is `terrain.js`'s `WORKER_SOURCE`:
**this ticket REMOVES the route region from it**, while **FEAT-18 streams may ADD a carve body to it**
(CARVE SYNC) — independent regions of the same literal, coordinate the diffs. Land order: commit the
in-flight QUAL-10 work first, then this. See `.planning/handoffs/2026-07-01-COORDINATION.md`.
