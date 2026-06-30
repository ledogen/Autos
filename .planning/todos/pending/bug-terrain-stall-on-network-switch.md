---
id: BUG-26
type: bug
status: open
opened: 2026-06-30
severity: medium
source: user-report
note: "Switching road network type (rows↔graph, debug panel) leaves you floating over void for a long time (1–several s) before terrain starts reappearing; once it starts it fills snappily. Reproduces on an M4 Air → NOT framerate/GPU-bound; it's a SCHEDULING/critical-path stall, not raw machine speed. Prime suspect: invalidateCache() throws away the road route cache AND the warmRoutes pre-warm, so the terrain rebuild pays full COLD synchronous arc-routing for the whole band (graph mode = many edges) on the critical path — the exact hitch the PERF-03 pre-warm exists to hide, now un-hidden and multiplied. Needs a timing probe to confirm WHICH step eats the time before fixing."
---

# BUG-26: Terrain stalls for seconds before reloading after a road-network-type switch

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

- [ ] Probe identifies the dominant delay step (route vs per-chunk carve vs worker FIFO), recorded here.
- [ ] Switching rows ↔ graph reloads terrain within a small fraction of a second (no multi-second void),
      on the same M4 baseline.
- [ ] No regression to normal driving stream (PERF-05) or the cold-load path; `npm test` stays green.

## Relationships

- **PERF-03** (completed) — built the worker route pre-warm specifically to hide synchronous routing
  hitches. This bug is that hitch resurfacing because `invalidateCache()` discards the pre-warm on a
  re-route. The fix likely extends the pre-warm to cover the post-invalidate rebuild.
- **PERF-05** (completed) — `MAX_BUILDS_PER_FRAME = 1` / `BUILD_MS_BUDGET = 3 ms` were tuned for steady
  driving; they may be too conservative for a one-shot full regen (hypothesis 2 fix touches them).
- **FEAT-13** (open, active) — graph mode is where this bites hardest; relevant while iterating on the
  graph router.
