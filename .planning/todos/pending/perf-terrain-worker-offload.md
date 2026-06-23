---
id: PERF-03
type: perf
status: open
opened: 2026-06-21
updated: 2026-06-23
severity: major
source: user-observation
note: "2026-06-23: reframed as the umbrella 'move heavy streaming work off the main thread' ticket. The DOMINANT cost is ROAD ROUTING, not terrain chunk build (profiled this session) — see Workstream A. Tier 1 sizing wins (radius/band/margin) already SHIPPED (commit f514727) and cut load ~6.6x; Workstream A is the Tier 2 follow-up. Terrain chunk-build offload (original scope) is Workstream B."
---

# PERF-03: Move heavy streaming work off the main thread (road routing + terrain chunk build)

## Symptom / goal

20 s reload + painful fly-stutter on a mid-range machine (i9-12th / RTX A2000). Profiling (2026-06-23,
headless harness) showed the dominant cost is **synchronous road routing on the main thread**, not
terrain. Goal: the main thread never blocks on routing or chunk build — both stream in asynchronously
like terrain heightmaps already do.

---

## Workstream A — Road routing offload (the Tier 2 follow-up — DOMINANT lever)

### Profiled root cause (2026-06-23)

Road routing (`arcPrimitiveConnect` hybrid-A*) runs **synchronously on the main thread** in
`_streamNetwork`, and a full network re-stream fires on every 256 m macro-cell crossing. Measured
(warmed JIT; cold / real-hardware worse):

- per-connection arc search ≈ 12–21 ms (dominated by the `(256+2·margin)²` lattice)
- `_sliceNetwork` ≈ 1 ms (negligible); `queryNearest` 15–93 µs (fine)
- so routing ≈ the entire streaming cost.

### Tier 1 — sizing (SHIPPED 2026-06-23, commit f514727)

Shrank the work to match the visible terrain footprint instead of ~16× it:
`setRadius 640→320`, `CANONICAL_HALF_WIDTH 4→2` (±1024→±512 m in X), `PROTO_MARGIN 200→120`.
Result (warmed): first-stream **3399→514 ms (6.6×)**; per-crossing hitch **avg 429→83, worst 557→121 ms**;
59→19 connections. All 8 gates green. This is a one-time shrink — it does NOT remove routing from the
frame, so a ~100 ms crossing hitch remains. Tier 2 (below) removes it.

### Tier 2 — offload routing to the Worker (this workstream)

Routing is pure/deterministic; inputs are tiny (seed, mx, mz, params), outputs are small primitive
lists (`centerlineFromDescriptors` descriptors) — ideal Worker payload (unlike dense polylines /
RANGER_PARAMS, see project_terrain_worker_constraints). Move `arcPrimitiveConnect` + the per-connection
centerline build into the Worker; the main thread consumes routed connections asynchronously and
assembles `this._network` as they arrive (mirrors terrain chunk consumption). Removes the routing hitch
from the frame entirely, regardless of radius/band size.

**The hard part — roads are needed SYNCHRONOUSLY where routing currently guarantees them:**
- physics `queryNearest` on the first frames (truck must land on a road/carved surface),
- `_buildCarveTable` (terrain carve reads road geometry),
- spawn placement (`resolveSpawn` → `ensureTile`).
Done naively, the truck spawns on un-carved terrain with no road until the Worker replies. Needs:
block spawn on the first route(s) only, and a graceful "no road yet" fallback for queryNearest/carve
(terrain-only surface) until the async network fills. This is the bulk of the work and risk.

**Determinism/invariance:** the Worker must produce byte-identical routes to the main thread (same
cost model, same canonical headings) so `invariance` / `restream-invariance` / `road-minradius` stay
green. `arcPrimitiveConnect`/`dubinsPrimitives` are NOT currently in `WORKER_SOURCE` (main-thread only)
— they'd need adding to the Worker source and keeping in sync (like the carve bodies).

---

## Workstream B — Terrain chunk-build offload (original PERF-03 scope; enables draw distance)

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

0. **Stop building the carve table TWICE per chunk (pure redundancy — do first, lowest risk).**
   On-hardware profiling (2026-06-23, M4) showed `dispatch.buildCarveTable` AND `flush.buildCarveTable`
   each fire once per chunk (~6 + ~5 µs/chunk avg; the two biggest non-`frame.terrain.update` buckets).
   The Worker's own `generate` handler explicitly **ignores** the carve table it is sent (terrain.js
   ~`:292`: "DOES NOT bake carve into heights — heights remain RAW"). So the table built + transferred
   at dispatch (`_updateChunkRing` ~`:809`) is **never used**, and because the transfer *consumes* the
   buffer, `_flushPendingQueue` (~`:1241`) **rebuilds it from scratch** for the mesh + colors. Fix:
   don't build/transfer at dispatch at all — build it ONCE in `_flushPendingQueue` (where it's actually
   consumed), and just send `{type:'generate', cx, cz, key}` to the Worker. Removes one full carve-table
   build per chunk (and a 34 KB transfer) with no behavior change. (The Worker carveTable param +
   destructure can then be deleted too.)

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
