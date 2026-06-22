---
id: PERF-03
type: perf
status: open
opened: 2026-06-21
severity: major
source: user-observation
---

# PERF-03: Push more chunk-build work into the terrain Worker (enable greater draw distance)

## Symptom / goal

Generating a burst of chunks at once (e.g. ~10 on a fast boundary cross) causes a perceptible stutter,
and draw distance (`RING_RADIUS = 2`, 5×5) is held back by per-chunk main-thread cost. Goal: push draw
distance further without hitching by moving more of the chunk-build pipeline off the main thread.

## Root cause (from code)

The Worker (`WORKER_SOURCE` in `src/terrain.js`) does only the **cheap, parallel** part — sampling the
3-layer noise into a raw 65×65 `Float32Array` (`terrain.js` worker `generate` handler, ~`:305-315`). All
the **expensive** work runs on the main thread *after* the Worker returns, capped at
`MAX_BUILDS_PER_FRAME = 2` (`:43`):

- `_buildCarveTable(cx, cz)` (`:854`) — calls into the road system (`queryNearest`/`collectSplines`,
  instrumented `carve.collectSplines` `:906`). **Main-thread because it needs road data.**
- geometry build + carve blend in `_flushPendingQueue` (instrumented `terrain.flushPendingQueue` `:475`).
- `geometry.computeVertexNormals()` per chunk (`:835`, `:790`) — recomputes every face normal.
- `_writeChunkVertexColors` (`:1131`) — per-vertex color write.

So a 10-chunk burst = ≥5 frames of "2× (carve + geometry + normals + colors)" → the stutter. The Worker
already removed noise sampling; deleting the Worker would push that back on-thread and make it WORSE.
The case for the Worker is performance; the lever for draw distance is to move *more* into it.

## Fix directions (ordered by leverage)

1. **Measure first.** The `perfAdd` buckets already exist (`terrain.updateChunkRing`,
   `terrain.flushPendingQueue`, `dispatch.buildCarveTable`, `carve.collectSplines`). Run a 10-chunk
   burst in-browser and get the real split between carve / geometry / normals / colors before optimizing.
   May want finer timers around `computeVertexNormals` and `_writeChunkVertexColors` specifically.
2. **Eliminate `computeVertexNormals()`.** Analytic normals already exist for physics (`analyticNormal`).
   Write normals directly from the noise gradient (in the Worker or main thread) and delete the whole
   per-chunk normal pass.
3. **Return geometry+colors from the Worker, not just heights.** Have the Worker emit ready-to-upload
   position/normal/color typed arrays so the main thread only does `setAttribute` (near-free).
4. **Off-thread the carve (hard part).** Carve needs road geometry (`queryNearest`), which is why it
   stays main-thread. To move it, ship the relevant road splines to the Worker. Largest change; do last.
5. **Worker pool** (`navigator.hardwareConcurrency`) — a single Worker processes the burst serially;
   a pool parallelizes it.

## Acceptance

- Draw distance can be increased (e.g. `RING_RADIUS` 2→3) without a perceptible boundary-cross hitch.
- Per-frame main-thread chunk-build cost is bounded and dominated by cheap `setAttribute`, not by
  `computeVertexNormals` / per-vertex work.
- Determinism + invariance gates stay green (`invariance`, `restream-invariance`, `ribbon-carve`).

## Files

- `src/terrain.js` — `WORKER_SOURCE` `generate` handler, `_flushPendingQueue`, `_buildCarveTable`,
  `computeVertexNormals` sites (`:790`, `:835`), `_writeChunkVertexColors` (`:1131`), `RING_RADIUS` (`:42`).

## Relationships

- **PERF-02** (open) — frame-spreads the request/dispatch loop (nearest-first, per-frame budget). PERF-03
  reduces the per-chunk *build cost* itself. Complementary: PERF-02 spreads the spike, PERF-03 shrinks it
  and unlocks more draw distance. Likely tackle PERF-02 first (cheap, low-risk), then PERF-03.
- Relates to the deferred Worker single-source collapse (see CLAUDE.md / memory
  project_terrain_worker_constraints) — worth resolving the `WORKER_SOURCE` duplication before growing
  the Worker's responsibilities.
