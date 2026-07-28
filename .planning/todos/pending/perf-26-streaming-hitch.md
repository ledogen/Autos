---
id: PERF-26
type: perf
status: partial
opened: 2026-07-26
severity: major
source: user report — periodic stutter while driving, worst on low-power machines
relates: [PERF-02 (frame-spread build budgets), PERF-05 (MAX_BUILDS_PER_FRAME=1), PERF-13 (initial-fill burst), PERF-21 (prop LOD ring), PERF-22 (terrain geometry LOD)]
---

# PERF-26: streaming hitches — attribution harness + resumable builds

Play is interrupted by a periodic stutter as terrain/road/props stream in. Cumulative perf buckets
could not identify it: they answer "where did the total go", never "what made THIS frame 40 ms".

## Done

**Attribution layer** (`src/perf.js`, commit b5267bb). Per-frame bucket deltas + discrete streaming
event tags, closed out against a hitch threshold, keeping two clocks — in-loop CPU vs the rAF
period. The gap between them separates "a CPU budget was blown" from "the commit stalled the GPU".
`frame.physics` is now bucketed too (catch-up substeps were landing in no bucket). Enabled by
`?hitch=<ms>`, independent of `?prof`, cheap enough to leave on during play; `__hitchDump()` prints
the table in-browser. `test/hitch-report.mjs` drives it over CDP and prints a lift table against a
control group of frames where nothing streamed; `--cpu=N` throttles to reproduce a low-power
machine deterministically. Not a gate.

**Resumable terrain carve** (`src/terrain.js`, commit 57b9a0e). The dominant cause — see the commit
for the measured before/after. Key finding for anyone picking this up: the hitch is 100% main-thread
CPU (off-CPU share is negative), so visual smoothing — fade-in, slower pop-in, dithered LOD — would
not have helped at all. The fix is always to make an oversized atomic unit divisible so the existing
ms budget can bind.

## Measured 2026-07-27 — the ranking below is WRONG; `warmRoutes` owns the remaining hitch

Instrumentation branch `perf-26-instrument` (worktree `../CarGame-perf26`, commit d981670),
**measurement-only, not merged**. Two 60 s `--scenario=stream --cpu=4` runs, Normal preset, seed 6
(`perf-runs/perf26-instrumented.json`, `perf-runs/perf26-stream2.json` — note `perf-runs/` is
gitignored, so those are worktree-local and die with the worktree; the numbers below are the record).

### Result: the unattributed time was never GC — it was `roadSystem.warmRoutes()`

Once the loop was fully partitioned, `unattr` collapsed from 60–73 ms to **0.0–0.6 ms** and a single
new bucket absorbed all of it. Every one of the worst frames across both runs is `frame.road.warmRoutes`:

| run | worst frames (ms) | `frame.road.warmRoutes` within them | `unattr` |
|-----|-------------------|--------------------------------------|----------|
| 1   | 84.2, 83.0, 48.7, 46.0, 43.3 | 69.6, 64.7, 34.6, 32.0, 32.6 | 0.6 → 0.0 |
| 2   | 114.2, 92.7, 62.1, 51.4      | 91.3, 77.5, 42.9, 36.0       | 0.1 → 0.0 |

Run 1: p50 16.7, p99 20.4, 0.28 % over 24 ms. Run 2: p50 16.7, p99 24.2, 1 % over 24 ms.

**Why this was missed for so long: `main.js:2904` says warmRoutes "no-ops now (USE_WORKER_ROUTING=
false → no dispatcher)". That comment is STALE — `main.js:322` sets `USE_WORKER_ROUTING = true`, so
the dispatcher is wired and the call runs every frame.** The code read as dead, so nobody bucketed
it. Fix the comment whatever else happens here.

The *routing* is off-thread as designed; the cost is the main-thread work that decides WHAT to
route. Every time the center moves `PREWARM_WARM_MOVE` (32 m), `warmRoutes` runs `_buildUrquhart()`
over the band + `PREWARM_MARGIN` and then `_degreeDrops()` over the same box — a full graph rebuild
on the main thread — before dispatching ≤ 16 jobs (`road.js:1432-1463`). That rebuild is the 30–91 ms.

This is the same shape as the carve fix that worked: an oversized atomic unit that no ms budget can
bind. `PREWARM_MAX_JOBS` caps the *dispatch*, but nothing caps the graph rebuild that precedes it.

### Corrections to the ranking below

- **Item 3's GC hypothesis is dead.** With the loop fully partitioned there is no room left for a GC
  pause: `unattr` ≈ 0 on every hitch frame. Do not spend an allocation profile on this.
  (The heap probe itself returned 0 MB / 0 collections — headless Chrome reports a static
  `usedJSHeapSize` even with `--enable-precise-memory-info`, so that probe is unreliable and should
  not be trusted on its own. The `unattr` ≈ 0 result is the load-bearing evidence, not `heapΔ`.)
- **`props.lodSwap` is correlation, not cause.** It still tops the tag-lift table (+6.2, +9.8) purely
  because `lodSwap×6` happens to fire on the same frames as the warm rescan; `frame.props.update`
  reads 3.1–4.6 ms on those very frames. The lift table ranks *co-occurrence*, which is exactly the
  trap that sent the last session at the ribbon. Read the per-hitch `top` buckets, not the lift column.
- **Item 1 (road ribbon) did not reproduce as a top contributor.** `road.tile` lift is +0.2 (run 1)
  and +1.7 (run 2), against the +12 ms recorded earlier, and not one of the six new ribbon
  sub-buckets ever reached a hitch's top-8. The earlier +12 ms is unexplained — possibly a contended
  machine. **Re-measure before touching the ribbon**; on this evidence it is not the problem.

### Harness defect found: `--scenario=drive` measures nothing

A 60 s `--scenario=drive --cpu=4` run recorded **3602 frames with zero streaming events** (every
frame in the quiet control group). Cause: holding W from spawn, the truck travels ~55 m and then
stops permanently at (-119.2, 176.6) — identical terminal position throttled and unthrottled, so it
is an obstacle/spawn-heading problem, not a throttling artefact. The ring never advances a chunk, so
nothing streams. **The drive scenario has never exercised streaming; only `stream` results are
valid.** Fix the scenario (or the spawn heading) before quoting any drive-scenario number.

### The instrumentation itself

Three additions, each aimed at one open question below:

1. **Ribbon tile sub-buckets** (`road-mesh._buildRoadTile`) — `ribbon.lut`, `ribbon.samplePts`,
   `ribbon.trim`, `ribbon.meshAdd`, `ribbon.tunnel`, `ribbon.pads`. Accumulated into locals and
   emitted once per tile so the `continue` paths can't leak a bracket. `lut` is split from
   `samplePts` on purpose: `spline.getLength()` is what BUILDS the Curve arc-length LUT (200
   `getPoint` calls) and `getPointAt` only binary-searches it — "the LUT construction" and "the 256
   samples" have different fixes. `ribbon.pads` deliberately wraps the *whole* pad block including
   the two `_detect*` map iterations, which rescan every junction node in the network once per built
   tile — a suspect the original note didn't list.
2. **Full-frame partition** (`main.js`) — `frame.preStream`, `frame.road.warmRoutes` (the one
   unbucketed call inside the streaming block), `frame.postStream`. Together with the existing
   buckets these cover the loop end to end. `frame.gps.update` → `post.gps.update` because it now
   nests inside `postStream` and `perf.js` sums every `frame.*` label to compute `unattr`.
3. **Heap probe** (`perf.js` + `hitch-report.mjs`) — per-frame `usedJSHeapSize` delta on every hitch
   record (`heapΔ` column) plus a window summary (MB/frame, collection count, how many hitch frames
   ran one). `cdp.mjs` gains `--enable-precise-memory-info` so the value isn't quantised to 100 KB.

**Reproduce:** from the worktree, start its own dev server on a free port, then
`node test/hitch-report.mjs --scenario=stream --cpu=4 --duration=60 --port=<P> --cdp=<C>`.
(Ports 8000/8010/8011/8071 and CDP 9222 were in use by other work; pass free ones.)

**Of the three, item 2 was the one that mattered.** Partitioning the whole loop before guessing is
what turned "60–73 ms in no bucket" into a named function in a single run. The lesson from the
reverted slicing attempt generalises: do not act until a bucket names the cost, and make sure the
buckets can *reach* every part of the frame — an unbucketed region is indistinguishable from GC.

## Next steps (supersedes the ranking below)

1. **Fix the stale comment at `main.js:2904`** — it claims warmRoutes no-ops. One line, do it first
   so the next reader isn't misled the same way.
2. **Make the warm rescan divisible or cheaper.** Options, cheapest first — measure, don't assume:
   - Cache/incrementally update the Urquhart graph across warm calls instead of rebuilding the whole
     band+margin box every 32 m. The band shifts by one macro-column at a time; the rebuild is
     almost entirely redundant work.
   - Move `_buildUrquhart` + `_degreeDrops` for the warm scan off the main thread (the router is
     already on a worker; this is the selection step that stayed behind).
   - Failing both, make it resumable under an ms budget the way the carve fix was — the pattern that
     already worked once here.
   Note `_buildUrquhart(..., persist=false)`, so the warm copy is throwaway and does not touch the
   streaming graph — that should make caching it safe, but verify against window-invariance
   (see `project_reachability_window_noise` / the restream-invariance gate) before trusting it.
3. **Re-measure `road.tile`** before any ribbon work. If it stays ≈ +1 ms, delete item 1 below.
4. **Fix or retire `--scenario=drive`.** As it stands it silently reports "no hitches" because the
   truck is stuck, which is worse than not having it.

## Remaining (SUPERSEDED — kept for the reasoning, not the ranking)

Ranked by measured lift at `--cpu=4` after the carve fix. **The 2026-07-27 run contradicts this
ordering — see the corrections above.** The *reasoning* in item 1 (why the slicing attempt failed)
is still worth reading before touching the ribbon.

1. **Road ribbon tile build** — `road-mesh.js flushPendingQueue`, `MAX_ROAD_BUILDS_PER_FRAME = 1`.
   Top remaining contributor: lift ≈ +12 ms at 4×, and it always shares a frame with the terrain
   commit (both driven off the chunk ring), so `road.tile` and `terrain.chunk` have identical stats
   in every run.

   **A per-segment slicing attempt was tried and REVERTED — do not repeat it.** `_buildRoadTile`
   was made resumable exactly like the carve, yielding per ribbon slice and per junction pad, with
   scene insertion deferred to a single commit. Measured lift across three runs: 10.3 (sliced),
   11.9 (sliced), 12.9 (unsliced) — indistinguishable. 91 insertions for nothing.

   The reason it failed, which is the useful part: **the cost is not in `sweepRibbon`.** With the
   hitch record widened to 8 buckets, a 48 ms frame shows `frame.ribbon.flush` at 19.4 ms while
   `ribbon.sweepRibbon` does not even reach the top 8 (< 1.2 ms), and `ribbon.sliceNetwork` likewise.
   So ~18 ms of the tile build is in code that is currently *unbucketed*: the `getPointAt` sampling
   loop that builds `points`/`designGradeY`, the junction cutback trim, or `buildJunctionFootprint`.
   Instrument those three first. Do not slice anything until a bucket actually names the cost —
   that was the mistake here.
2. **The worst frames left are not a streaming cost at all.** At 4× the top frames are 83–89 ms with
   60–73 ms inside NO bucket, carrying `props.lodSwap×6` while `frame.props.update` reads ~4 ms.
   Cheapest next investigation, and possibly the only one worth doing — see below.

3. **`props.lodSwap` outliers** — `_syncChunkLod(budget = 6)` re-places 6 chunks/frame on a fixed
   COUNT, not an ms budget. Usually cheap, but it owns the worst frames left in the run (81 ms at
   4×) and those frames carry 60–70 ms of time inside NO bucket, with `frame.props.update` reading
   only ~3 ms. That signature is not the swap work itself — suspect a GC pause triggered by the
   unplace/place churn. Confirm with an allocation profile before optimising; if it is GC, the fix
   is to stop the swap allocating (reuse the placement arrays), not to lower the budget.
4. **Prop scatter is NOT a problem** — `props.chunk` measures a +0.0 to +0.3 ms lift. Its 3 ms/frame
   drip budget works. Do not spend effort here; the original hypothesis pointed at prop loading and
   the data cleared it.

## Acceptance

- `node test/hitch-report.mjs --scenario=stream --cpu=4` shows no tag with a lift above ~5 ms.
- No regression in cold load (`profile.mjs --scenario=coldload`: ready + ring-complete).
- Affected gates green; carve/ribbon surface gates must stay green since these are scheduling-only
  changes — any gate movement means the geometry changed and the change is wrong.

## Closing decision

Not closeable yet: acceptance requires no tag above ~5 ms lift, and `warmRoutes` is 30–91 ms at 4×.
But the ticket is now small and specific — one named function, with three ranked fix options — where
before it was an open-ended hunt. Proposed disposition:

- Do next-step 1 (the stale comment) immediately; it is free and it is what caused the miss.
- Do next-step 2 (the warm rescan). That is the whole remaining ticket.
- Split nothing off for GC or props — the measurement cleared both.
- If step 3's re-measure keeps `road.tile` near +1 ms, strike item 1 and shrink acceptance to the
  warm rescan alone.

**The instrumentation is the durable asset and should probably ship.** It is zero-cost when `?hitch`
is off (one boolean test per `perfAdd`), and the full-frame partition is what made the diagnosis
possible at all — leaving it out means the next investigation starts blind again. Decide merge vs
delete when the fix lands; do not delete the branch before then. Note the branch's
`post.gps.update` rename and the `--enable-precise-memory-info` flag are the only parts that are
merely diagnostic scaffolding; the heap probe measured nothing useful and can be dropped.
