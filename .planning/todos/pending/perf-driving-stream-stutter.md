---
id: PERF-05
type: perf
status: open
opened: 2026-06-25
severity: major
source: user-observation
note: "AWAITING DATA — user is compiling a Chrome DevTools Performance recording + perfDump on the Windows machine (Intel Ultra 7 / Arc 140) to confirm which of the two suspects below dominates. Do NOT apply a fix blind; the two suspects have different fixes. This is the runtime-fps half of the perf work; PERF-04 (bundler) does NOT touch it."
---

# PERF-05: Frame stutter while driving when terrain streams (steady-state, post-init)

## Progress

**2026-06-25 — diagnosed + Tier 1 landed (commit b48001e). ⏳ RE-PROFILE PENDING.**

Chrome Performance traces (logs/{surface pro,m4} chromeperf.json.gz) settled it: Surface Pro
(i5-7300U / HD 620) had **71 steady-state dropped frames** (~2.1 s jank); M4 had **0** (max main task
0.14 ms). Self-time *inside the dropped frames*: **`_buildCarveTable` 22.7%**, **GC/`(program)` 16%**
(per-chunk `new PlaneGeometry`), **WebGL render/upload ~30%**. **Suspect 2 (sync routing) is DEAD** —
zero `arcPrimitiveConnect` on the main thread; PERF-03 pre-warm wins. `_detectJunctions` looked big in
aggregate (5.6%) but is NOT a dropped-frame driver.

Tier 1 done: geometry pooling (kills the 16% GC) + `MAX_BUILDS_PER_FRAME` 4→1 + stripped the
frame-loop `console.log`. Determinism-safe; 11/11 gates green. perfAdd/perfDump probes KEPT for the
re-profile.

**NEXT: re-record a driving Performance trace on the Surface Pro and compare dropped-frame count.**
If the hitch persists and `_buildCarveTable` still dominates → Tier 2 (spatial-bin the carve
per-vertex search — risky, carve bug history, needs a switchback gate). If GPU-bound → accept or
Tier 3 (last resort). Only then clean up the perfAdd/perfDump TEMP probes.



## Symptom

Persistent frame hitches *while driving* on the Windows laptop (Intel Ultra 7 266 / Arc 140) — "always,
when terrain loads," well after initialization, **even on the Near draw-distance preset**. Not the cold
load (that's PERF-04/PERF-01); this is steady-state. Invisible on the M4 Air (fast unified-memory GPU
hides the per-chunk upload tail), exposed on the Intel/Arc + Windows-driver box. Hurts the core
"honest, smooth to drive" feel.

PERF-02 (completed) fixed the *request-loop* row-spike (nearest-first + per-frame budget). This ticket
covers the hitch that REMAINS after PERF-02 — two distinct main-thread tail costs PERF-02 did not touch.

## Suspect 1 — per-chunk mesh build + GPU upload on the main thread

`TerrainSystem._flushPendingQueue` (`src/terrain.js:1773`) runs entirely on the main thread when a
Worker height-reply arrives, per chunk:

- `new THREE.PlaneGeometry(64×64)` → 4,225 verts allocated fresh + `rotateX` over all of them
  (`:1795`) — fresh allocation every chunk = GC pressure (classic stutter source).
- a 4,225-iter Y-write loop (`:1810`), then `_computeGridNormals` (`:1826`), `_writeChunkVertexColors`
  (`:1839`), `_buildCarveTable` (`:1806`) — already instrumented via `perfAdd('flush.*')`.
- `new THREE.Mesh` (shared `this._material` MeshPhongMaterial — good, shader compiles once, NOT
  per-chunk) + `scene.add` (`:1842`).
- The off-budget part: the new BufferGeometry's **GPU buffer upload happens later at first draw**, which
  `BUILD_MS_BUDGET` (a CPU budget) does not account for. Arc 140 + Windows driver upload ≫ M4.

On Near you still stream a new chunk on every boundary crossing → one of these every time → "always,
when terrain loads."

**Fix direction (if Suspect 1 dominates):** lower `MAX_BUILDS_PER_FRAME` to 1; pool/reuse chunk
geometries instead of `new PlaneGeometry` per chunk (kills the per-chunk allocation + GC); consider
pre-uploading geometry off the visible frame.

## Suspect 2 — synchronous road re-routing mid-drive (likely the BIG spikes)

`RoadSystem.update(center)` (`src/road.js:871`) re-streams as the truck moves. If the truck crosses
into territory the off-thread pre-warm (`warmRoutes`, trickling only `PREWARM_MAX_JOBS = 4`,
`road.js:276`) hasn't reached yet, `_protoConnectCenterline` takes its **synchronous miss path**
(`road.js:1273`) and runs the full **12–21 ms `arcPrimitiveConnect` A\* on the main thread** — a
guaranteed dropped frame, by itself, whenever the pre-warm loses the race against driving speed. The
PERF-03 Worker pre-warm was meant to keep this off the main thread, but the synchronous fallback still
fires when the trickle falls behind.

**Fix direction (if Suspect 2 dominates):** make the synchronous route the *cold-load/teleport-only*
path it was intended to be — during normal driving, if a connection isn't pre-warmed in time, **defer
that road segment a frame** rather than routing synchronously; and/or widen `PREWARM_MARGIN` /
`PREWARM_MAX_JOBS` so the Worker stays ahead at speed.

## Free win (do regardless, low risk)

`_flushPendingQueue` runs a `console.log` **every build frame** (`src/terrain.js:1881`). Console logging
is expensive (esp. with DevTools open) and it's in the frame loop — violating CLAUDE.md's own "No
diagnostic plumbing in the frame loop." Strip it (or gate it behind a debug flag). Restores the
invariant and removes a per-frame cost; also clean up the TEMP `perfAdd`/`_flushMs`/`_flushN` probes
once profiling is done.

## Diagnosis plan (BEFORE fixing — user is gathering this)

1. Chrome DevTools Performance recording while driving on the Windows machine; find the long frames.
2. Correlate: long frames at **chunk arrivals** → Suspect 1; long frames at **road macro-cell
   crossings** → Suspect 2. (The `perfAdd` buckets `flush.buildCarveTable/gridNormals/writeVertexColors`
   + a route timer split the two.)
3. Pull `perfDump()` numbers to quantify each suspect's per-frame cost.

## Acceptance

- Driving across chunk boundaries / macro-cell crossings at speed on the Intel/Arc box produces no
  perceptible hitch; the dominant per-frame cost identified in step 2 is bounded, not a single-frame
  spike.
- No correctness regression: ring still fully populates within a few frames; road determinism +
  re-stream gates (invariance, restream-invariance, road-smoothness) stay green.
- Frame-loop `console.log` removed; TEMP perf probes cleaned up per CLAUDE.md "src/ is the product."

## Files

- `src/terrain.js` — `_flushPendingQueue` (`:1773`), `MAX_BUILDS_PER_FRAME`/`BUILD_MS_BUDGET`, geometry
  pooling; the frame-loop `console.log` (`:1881`).
- `src/road.js` — `update` (`:871`), `_protoConnectCenterline` synchronous miss path (`:1273`),
  `warmRoutes` (`:1131`), `PREWARM_MAX_JOBS`/`PREWARM_MARGIN`/`PREWARM_WARM_MOVE` (`:276`).

## Relationships

- **PERF-02** (completed) — same "spread main-thread cost across frames" family; PERF-02 fixed the
  request-loop carve spike, PERF-05 is the mesh-build + synchronous-route tail that remains on slower
  hardware. Direct follow-on.
- **PERF-03** (completed) — built the off-thread route pre-warm; Suspect 2 is the gap where its
  synchronous fallback still fires mid-drive. PERF-05 closes that gap.
- **PERF-01** (resolved) — cold-route spawn lag, same `arcPrimitiveConnect` cost but at load, not drive.
- **PERF-04** (bundler) — does NOT address this; filed separately to avoid conflation.
