---
id: PERF-05
type: perf
status: completed
opened: 2026-06-25
closed: 2026-06-25
severity: major
source: user-observation
resolution: "Tier 1 (geometry pooling + MAX_BUILDS_PER_FRAME 4→1, commit b48001e) removed the severe build spikes; the residual is render/GPU-bound on the low-end iGPU, resolved by running the Near draw-distance preset (what it exists for). User confirms stutter 'pretty much gone' on Near. Suspect 2 (sync routing) confirmed dead even on slow HW. Tier 2/3 not pursued — carve fell to 4.1% of dropped-frame time post-Tier-1, no longer the bottleneck."
---

# PERF-05: Frame stutter while driving when terrain streams (steady-state, post-init)

## Resolution (2026-06-25) — RESOLVED

**Test machines:** SLOW = Surface Book/Pro, i5-7300U / Intel HD 620 (the box that stutters).
FAST = MacBook Air M4 (never stutters). (Original ticket guessed Intel Ultra 7 / Arc 140 — actual
slow box was the HD 620, even weaker, which only sharpens the conclusion.)

**Diagnosis (Chrome Performance traces, `logs/*chromeperf*` + `logs/{surface t1,m4 tier 1}`):**
attribute CPU self-time *inside the dropped frames*, and detect the real main thread by the tid that
runs `loop()` (NOT the `CrRendererMain` thread_name — they can differ; counting the wrong tid gave a
false "0 dropped frames" reading mid-investigation). Baseline slow box: 65 steady frames >16.7 ms,
**31 >33 ms** (visible freezes), max 701 ms. Costs: `_buildCarveTable` 22.7%, GC/`(program)` 16%
(per-chunk `new PlaneGeometry`), WebGL render ~30%. **Suspect 2 (sync routing) DEAD** — zero
`arcPrimitiveConnect` on main thread; PERF-03 pre-warm holds even on the slow box.

**Fix that shipped — Tier 1 (commit b48001e), determinism-safe, 11/11 gates green:**
- Geometry pooling (`_acquireChunkGeometry`/`_releaseChunkGeometry`, cap 32) — recycle chunk
  BufferGeometry instead of `new PlaneGeometry` + dispose per chunk (X/Z grid + UV + index are
  chunk-invariant; only Y/normal/color change). Kills the per-chunk alloc + non-deterministic GC pause.
- `MAX_BUILDS_PER_FRAME` 4→1 — bounds the worst frame; one chunk's carve already blows BUILD_MS_BUDGET
  on the slow box.
- Free win: removed the per-frame `[terrain build]` console.log + `_flushMs`/`_flushN` from the loop.

**Outcome:** post-Tier-1 the severe freezes dropped 31→8 (>33 ms) and total excess-jank 2047→1503 ms,
but at Normal the slow box gained many small 16–33 ms overruns (p95 right on the 60 fps line) and the
user felt **no real change** — because the residual bottleneck is **render/GPU** (HD 620 saturated:
WebGL + `(program)` GPU-wait dominate; `_buildCarveTable` fell to 4.1%), not terrain CPU. On the
**Near** draw-distance preset (9 visible chunks vs Normal's 25, road radius 192 vs 320) the stutter is
**pretty much gone** — user-confirmed. Near is the intended low-end setting.

**Not pursued:** Tier 2 (carve spatial-bin) — carve is no longer the bottleneck. Tier 3 (shadow-map
1024², off-frame upload) — available if someone later wants Normal smooth on weak iGPUs; lowest ROI.

**Probe cleanup deferred to PERF-04:** the `perfAdd`/`perfDump`/`perfMark` harness (`src/perf.js` +
imports in terrain/road/road-mesh/main) is RETAINED because its `perfMark` load-timeline marks in
`main.js` instrument the cold load — exactly PERF-04's (bundler) target. Strip the whole harness when
PERF-04 closes, not before, so we don't lose load instrumentation. (The one frame-loop `console.log`
CLAUDE.md objects to is already gone.)



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
