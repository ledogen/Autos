---
id: BUG-26
type: bug
status: completed
resolved: 2026-07-01
resolution: "ROOT CAUSE (via [BUG26] probe): the road router and terrain heightfield gen SHARE one Web Worker (FIFO); route pre-warm jobs flooded the queue and STARVED terrain `generate` for seconds after a road-param change / while flying (WORKER-STARVED, +recv=0 → white void). Main-thread gating on terrain-pending did NOT work (can't reorder the Worker's internal FIFO). FIX (main.js USE_WORKER_ROUTING=false): route ONLY on the main thread (road.streamNetwork, ~3.5 ms/frame, no frame drops); leave the route dispatcher unset so warmRoutes no-ops and the Worker is terrain-only → no starvation. User-verified fixed. TRADE-OFF: the PERF-03 off-thread route pre-warm is disabled; if routing spikes reappear, the RIGHT long-term fix is a DEDICATED route Worker (separate from terrain) — the QUAL-08 'own Worker' direction — then flip USE_WORKER_ROUTING back on. Diagnostic probes stripped."
opened: 2026-06-30
severity: medium
source: user-report
note: "UPDATED 2026-06-30 (see UPDATE section — symptom evolved, perf.js probe + screenshot captured). Now: after ANY road-param change (e.g. wAlt) the WHOLE view goes to white VOID for ~5 s at a steady 60 FPS, with the PROPS and the ROAD RIBBON still fully rendered — only the terrain ground is missing. Ribbon drawn ⇒ routing FINISHED, so the blank is NOT the router; it's a FULL terrain Worker regen: a road-param change runs reinitWorker + rebuildAllChunksFromWorker (disposes all ~49 chunks, regenerates their base heightfields in the Worker ≈ 5 s). But the base heightfield is SEED-only — a road param changes only the CARVE, not the ground — so the full regen is wasted. PRIME FIX: re-carve in place / keep old terrain until new is ready (don't dispose+regen base heightfields for a road-only change). Secondary: re-warm the route cache after invalidateCache (road.streamNetwork runs 7 ms/frame cold, 2955 ms/422 calls) + shared-Worker FIFO route/terrain contention. ORIGINAL note (historical): switching rows↔graph blanked terrain 1–several s (thought to be a one-shot cold band route); root cause is actually the full Worker regen."
---

# BUG-26: Terrain stalls for seconds before reloading after a road-network-type switch

## ROOT CAUSE CONFIRMED 2026-06-30 — shared Worker starves terrain generation (read this first)

A `[BUG26]` probe (1 Hz dump of frameGap + terrain queue/inflight/recv/built + chunk Y-range, temporary,
in src/terrain.js `bug26Snapshot` + src/main.js setInterval — STRIP once fixed) pinned it unambiguously:

**During the void, per the dump:**
- `frameGap = 7–8 ms` → **the main render loop is HEALTHY, not frozen.** (`LOOP-FROZEN` only appears while
  the tab is HIDDEN = normal rAF pause; recv stays 0 then too, so it is not an rAF issue.)
- `queue = 0` → **not a flush stall** (nothing is waiting to build).
- `+recv = 0` while `inflight` (pendingWorker) climbs **49 → 63 → 68 → 83 → 90** → **the Worker stops
  delivering `generate` (heightfield) replies**; the main thread keeps requesting (as the flying camera
  reveals new chunks) but gets nothing back. Then the Worker unsticks and dumps a **burst**
  (`+recv=97 +built=52`) and terrain snaps back in.
- `Y = [58, 242]` throughout; **`CHUNK-FLOATING` never fired** → heights are fine. The "chunks floating
  way above" the user saw are just isolated chunks marooned in the white void (and cull flicker), NOT a
  wrong-Y bug.

**Root cause:** the terrain Worker is **shared** between terrain `generate` and road `route`
(`warmRoutes` → `postRouteJobs`) jobs on a single FIFO. After a road-param change in graph mode, route
pre-warm **floods the Worker with route jobs**, and heightfield generation **starves behind them for
seconds** until they drain. This is the shared-Worker FIFO — originally the TERTIARY hypothesis, actually
the PRIMARY cause. The main-thread `road.streamNetwork` (3.44 ms/frame cold) is real but NOT the freeze
(loop stayed at 7–8 ms). The earlier "full terrain regen is slow" framing is also secondary — the regen
would be fast if the Worker weren't blocked on routes.

**Fix (decide at implementation):** terrain generation must not be starved by route work. Options:
1. **Gate route pre-warm on terrain-idle (lowest effort, main-thread only):** don't dispatch `warmRoutes`
   route jobs while terrain `generate` jobs are in flight (`terrainSystem` pendingWorker above a small
   threshold). Terrain wins the Worker first; routes pre-warm in the gaps. No Worker/CARVE-SYNC changes.
2. **Dedicated route Worker** separate from the terrain Worker (the QUAL-08 "own Worker" direction) so the
   two job classes never contend.
3. **Worker-side priority** for `generate` over `route` (buffer route jobs, process one between generates).

Option 1 is the fast win; verify by re-running the `[BUG26]` probe (WORKER-STARVED should vanish while
driving after a param change).

## UPDATE 2026-06-30 — symptom EVOLVED + probe captured (earlier analysis, superseded above)

The gross multi-second "blank → long pause → snap back" is largely gone, but the underlying defect
remains and now shows a different way. New repro + a `perf.js` dump were captured:

**New repro:** reload → spawn in → change ANY road-generator param (e.g. `roadGraphWAlt` > 1.05) → the
map re-streams → **drive fast**. You can now **outrun the rendered terrain edge and float in the void —
with all the PROPS still present around you.** NO frame drops, NO laggy feel. "It feels like it's just
not loading terrain quickly even though it could."

**Probe evidence (perf.js, seed 6, after a wAlt change):**
- **Load dump (cache WARM):** `road.streamNetwork` = 0.7 ms / 180 frames ≈ **free** (route cache hits).
  Terrain is the only real cost (`flush.buildCarveTable` 3.42 ms avg). Baseline is healthy.
- **Steady dump (AFTER the param change):**
  - `road.streamNetwork` = **2955.7 ms / 422 calls = 7.0 ms per frame** — now DOMINATES the profile.
  - `flush.buildCarveTable` fired only **15×** in the whole ~10 s window → terrain is **STARVED**, not
    budget-capped (render 0.6 ms avg, plenty of headroom, no dropped frames).
  - Two `[Violation] 'setTimeout' handler took ~1.5 s` (main.js:376 = the debounced rebuild) + two
    `rebuildAllChunksFromWorker — disposing 49 chunks / 0 chunks (FULL terrain regen)`.

**Refined diagnosis (confirms hypothesis 1, reframed as SUSTAINED not one-shot):** the param change's
`invalidateCache()` drops the route cache AND resets the pre-warm, and they **stay cold**. So
`_streamNetwork` runs **cold arc-routing every frame, chasing the moving vehicle** (7 ms/frame sustained,
not a single band route). Terrain carve depends on the routed centerlines, so the ring **can't fill ahead
of a fast drive** — only 15 chunks carved in 10 s despite spare frame budget. **Props stream independent
of road routing**, so they populate while terrain lags → the signature "floating in void WITH the props."
No frame drops because the machine has headroom; the terrain fill is *starved/serialized*, not slow.

**Refined fix directions:**
1. **Re-warm the route cache after `invalidateCache()`** (don't leave it cold) so `_streamNetwork` gets
   cache hits (~0 ms) instead of 7 ms/frame cold routing — the PERF-03 pre-warm should cover the
   post-invalidate rebuild + follow the vehicle, not reset to cold.
2. **Find why terrain built only 15 chunks in 10 s** (starved, not capped): is the carve blocked waiting
   on cold routes, or is the chunk look-ahead ring too short to stay ahead at speed? Let terrain use the
   available headroom (raise/adapt the build budget when the ring is behind the vehicle).
3. **Decouple the terrain heightfield from road carve** so ground can appear ahead of routing (props
   already do — terrain shouldn't be gated on the cold router while props aren't).

**Screenshot (2026-06-30, seed 6, graph mode, after a road-param change):** the WHOLE view is white
void — not just past the rendered edge — at 30 km/h and a steady **60 FPS**, and it "just chills like
this for ~5 s." Crucially, the **props AND the road ribbon are fully rendered** over the void; only the
terrain ground is missing. This sharpens the diagnosis:

- The road **ribbon is drawn → routing has FINISHED**. So the blank is NOT gated on the cold router; the
  7 ms/frame `road.streamNetwork` is a real but secondary cost. The blank is the **terrain worker
  regenerating every chunk from scratch**.
- The console shows `rebuildAllChunksFromWorker — disposing 49 chunks (FULL terrain regen)` + repeated
  `[terrain-worker] init complete. worldSeed = 6` → a road-param change runs `reinitWorker` +
  `rebuildAllChunksFromWorker`, **disposing ALL 49 chunks and regenerating their base heightfields in the
  Worker**. ~49 chunks serialized in the Worker ≈ the observed ~5 s. Main thread has nothing to draw for
  terrain → white void at 60 FPS while props/ribbon (built from other paths) render fine.

**PRIME fix (new, strongest lever): don't full-regen the terrain for a ROAD-only param change.** The base
terrain heightfield is a pure function of the SEED — a road param (wAlt, grade, etc.) changes only the
ROAD CARVE, not the ground. So `reinitWorker` + full base-heightfield regen is wasted work: it should
**re-carve in place** (the carve table is already a main-thread `buildCarveTable` pass) on the existing
chunks, or at minimum **keep the old terrain visible until the new chunks are ready** (double-buffer /
generation-stamp swap) instead of disposing all 49 up front. That alone should kill the 5 s void. Verify
whether the Worker bakes the carve into the heightfield (CARVE SYNC) — if so, decouple base-height (seed,
cache across road changes) from carve (cheap re-apply) so a road tweak never regenerates base terrain.

Secondary levers still apply: re-warm the route cache after `invalidateCache` (kill the 7 ms/frame cold
routing); and the shared Worker FIFO may interleave route pre-warm jobs ahead of terrain gen (hypothesis
3), worsening the regen time while driving.

Everything below is the ORIGINAL (pre-evolution) analysis, kept for context. The probe called for in the
original "Probe plan" is now done (above): the ~5 s blank is a FULL terrain Worker regen triggered by a
road-only param change; `road.streamNetwork` cold routing is a secondary cost.

## Symptom

After changing the road **Network Mode** (rows ↔ graph) in the debug panel — and to a lesser degree
other road re-route actions — the terrain disappears and you float over empty void for a noticeably
long time (≈1–several seconds) before chunks start reappearing. Once they *start*, they fill in
**snappily**. Reproduces on an **M4 MacBook Air**, so it is **not** framerate / GPU-bound — the work
itself is fast (hence "snappy when it loads"); something is *delaying the start*. It is worst on a
network-type switch and lighter on plain slider re-routes.

## Repro

1. Open debug panel (backtick), Roads → Network Mode.
2. Toggle rows → graph (or graph → rows).
3. Watch: terrain holds, then blanks to void, then a long pause, then snaps back in.

## Pipeline (investigated)

A road param change fires `callbacks.onRoadParamChange` → **`debouncedRoadRebuild()`**
(`src/main.js:359`, 150 ms debounce — the debounce is NOT the "WHILE"). After the debounce it runs, in
ONE synchronous callback:

1. `roadSystem.invalidateCache()` — clears `_network` + tiles + viz, **bumps roadGeneration, drops the
   per-connection route cache, and resets `_lastWarmCenter` so the pre-warm must rescan** (`road.js:850`,
   `:1132`).
2. `roadMeshSystem.clearAll()` — drops all ribbon tiles.
3. `roadSystem.update(c)` — re-streams the network. Because step 1 emptied the route cache **and** the
   pre-warm hasn't run, `_streamNetwork` routes the whole band **COLD + SYNCHRONOUSLY on the main
   thread** (the arc-search the PERF-03 worker pre-warm normally hides — 12–21 ms *per crossing*; graph
   mode has many edges → easily hundreds of ms to seconds).
4. `terrainSystem.reinitWorker(...)` — posts `init` to the shared Worker.
5. `terrainSystem.rebuildAllChunksFromWorker()` — **disposes every chunk** (`terrain.js:1122`) and clears
   pending. Re-request happens on the next `update()` (no center-unchanged gate — `_updateChunkRing`
   re-requests immediately, 8/frame, so the re-request itself is NOT what's delayed).

### Why the start is delayed (ranked hypotheses — confirm with a probe before fixing)

1. **PRIME: cold synchronous graph routing on the critical path.** The whole reason `warmRoutes` +
   the worker route path (PERF-03 WS-A) exist is that synchronous routing is a per-crossing hitch.
   `invalidateCache()` discards both the route cache and the pre-warm, so step 3 (and/or the per-chunk
   carve in `_buildCarveTable` → `collectChunkSplinePoints`, which needs the routed network) pays the
   FULL cold arc-search for the band, in graph mode, all at once. Matches every symptom: worst on a
   network switch (cache fully cold), graph-heavier than rows, fast machine doesn't help (it's serialized
   routing, not GPU), "snappy once cached."
2. **SECONDARY: per-chunk carve cold-routing, serialized at 1 chunk/frame.** Even if step 3 routes the
   band, each rebuilt chunk's `_buildCarveTable` resolves the road; any cold tile pays arc-search, and
   chunk builds are capped at `MAX_BUILDS_PER_FRAME = 1` / `BUILD_MS_BUDGET = 3 ms`. ~25 chunks × a cold
   carve at 1/frame = a multi-second drip — exactly "floating for a WHILE."
3. **TERTIARY: shared-Worker FIFO.** Terrain `generate` and road `route` jobs share ONE Worker. Less
   likely here (pre-warm is a ≤4-job trickle gated on 32 m of movement, so a *stationary* switch
   dispatches no route jobs), but worth ruling out for the moving case.

## Probe plan (do FIRST — don't fix blind)

Wrap the steps of `debouncedRoadRebuild` (`src/main.js:359`) in `performance.now()` timestamps and log
each delta: invalidateCache, the `roadSystem.update(c)` re-stream, reinitWorker, rebuildAllChunksFromWorker.
The existing `[terrain] rebuildAllChunksFromWorker — disposing N chunks` console probe (`terrain.js:1123`)
already marks the dispose instant — add a "first chunk built" timestamp in `_flushPendingQueue` and a
"ring full" timestamp. Then switch rows→graph and read which delta dominates:
- If `roadSystem.update(c)` dominates → hypothesis 1 (cold band route on main thread).
- If dispose→first-built is small but ring-full is far out → hypothesis 2 (per-chunk cold carve, 1/frame).
This decides the fix; the two need different changes. Diagnostics belong in `test/`-style probes per
CLAUDE.md, but a temporary timestamp log in the debounced callback is the fastest read here.

## Fix directions (after the probe pins it)

- **Pre-warm before invalidating / route off the critical path:** kick the worker pre-warm for the NEW
  mode and let `_streamNetwork` find cache hits, instead of paying a cold synchronous band-route in the
  debounced callback. Possibly: don't drop the whole route cache on a mode switch if the new mode can
  re-derive lazily; or warm the new band first, THEN dispose terrain.
- **Don't blank terrain until the road is ready:** reorder so chunks are disposed/rebuilt only once the
  new network is routed (keep the old terrain visible through the route instead of voiding early), or
  re-carve in place (generation-stamp path already exists) rather than full dispose+regenerate.
- **Transiently raise the build budget during a full regen** (`MAX_BUILDS_PER_FRAME` / `BUILD_MS_BUDGET`)
  so the ring refills in a few frames instead of dripping at 1/frame — helps hypothesis 2.

## Acceptance

- [x] Probe identifies the dominant delay step — DONE (2026-06-30): `road.streamNetwork` cold routing
      (7 ms/frame, 2955 ms/422 calls) after a param change; terrain carve starved (15 carves/10 s).
- [ ] After a road-param change, `road.streamNetwork` returns to ~0 ms/frame while driving (route cache +
      pre-warm re-warmed, not left cold) — no sustained 7 ms/frame cold routing chasing the vehicle.
- [ ] Driving fast after a re-route does NOT outrun the terrain edge (no floating over void with props);
      terrain fills ahead using the available frame budget, on the M4 baseline.
- [ ] Switching rows ↔ graph reloads terrain within a small fraction of a second (no multi-second void).
- [ ] No regression to normal driving stream (PERF-05) or the cold-load path; `npm test` stays green.

## Relationships

- **PERF-03** (completed) — built the worker route pre-warm specifically to hide synchronous routing
  hitches. This bug is that hitch resurfacing because `invalidateCache()` discards the pre-warm on a
  re-route. The fix likely extends the pre-warm to cover the post-invalidate rebuild.
- **PERF-05** (completed) — `MAX_BUILDS_PER_FRAME = 1` / `BUILD_MS_BUDGET = 3 ms` were tuned for steady
  driving; they may be too conservative for a one-shot full regen (hypothesis 2 fix touches them).
- **FEAT-13** (open, active) — graph mode is where this bites hardest; relevant while iterating on the
  graph router.
