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

### 2026-07-28 — `_networkRev` does NOT churn. Correcting my own hypothesis.

The "why does `_networkRev` churn during streaming" question above was based on a wrong guess.
Measured over the same 60 s / 1200 m / `--cpu=4` sweep, with counters on all three bump sites and on
the `_degreeDrops` memo:

```
_networkRev bumps:  _streamNetwork=0   invalidateCache=0   invalidateProfileCaches=0
_degreeDrops:       3530 calls, 3525 hits, 5 MISSES, 0 evictions
warmRoutes >20 ms:  4 frames (74.8, 29.3, 69.8, 33.7 ms)
```

`_networkRev` never moved. The `_lastBandSig` gate in `_streamNetwork` works exactly as designed,
and the memo is 99.86 % effective. **There is no churn and no cache bug to fix.**

The real mechanism: `_degreeDrops` is keyed on the WINDOW `mx0:mx1:mz0:mz1`, and the sweep advances
the band one macro-column at a time. 1200 m / 256 m = 4.7 columns → **5 cold misses, one per column
crossing**, each a full `_degreeDropSet` over the whole box, all inside a single frame. The miss sigs
show it plainly — `-3:7:-3:4`, `-2:8:-3:4`, `-1:9:-3:4`: the box marching east one column at a time.
4 misses landed on hitch frames; that is the entire warmRoutes problem.

So this is not a caching problem at all. It is the SAME pattern as the terrain-carve fix that already
worked here: **an oversized atomic unit that no ms budget can bind.** 5 events in 60 s, ~40 ms each.

### Why the fix is safe by construction (the useful part)

`_degreeDropSet` is already documented as ORDER-FREE and WINDOW-INVARIANT — v2 of that algorithm was
sequential and was abandoned precisely because each drop changed the next node's decision (the
QUAL-14 percolation trap). v3 makes every decision a bounded-radius pure function of the graph:
Phase 1 candidates are a 1-hop local rule; Phase 2 drops a candidate iff its endpoints reconnect
within `hopCap` hops in (graph − ALL candidates).

Two consequences, both free:

1. **It is divisible.** Order-freedom means Phase 2's per-candidate checks can be spread across
   frames under an ms budget without changing the result. That is exactly the carve fix's shape, and
   here the correctness argument is already written down and gate-enforced.
2. **It is incrementally cacheable.** A decision is a pure function of a candidate's bounded
   neighbourhood, so it is valid in ANY window containing that neighbourhood — which is precisely
   what window-invariance asserts and what `graph-cull-radius-invariance` gates. Caching per
   CANDIDATE PAIR instead of per WINDOW would make a one-column shift recompute only the genuinely
   new candidates, not all of them.

Option 2 is the better fix (removes the work rather than spreading it); option 1 is the safer first
step and they compose. `warmRoutes` is pre-warm with `PREWARM_MARGIN` of slack by design, so it is
allowed to lag a few frames — deferring it is legitimate, not a compromise.

Do NOT widen the box or add hysteresis: that makes misses rarer without making the spike smaller,
and the spike is the complaint.

`warm.scan` spikes on the same 5 frames — a new column brings genuinely new edges to scan and
dispatch. Budget it the same way; `PREWARM_MAX_JOBS` already caps dispatch but not the scan.

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

## Shipped 2026-07-27 — commits 629b358, 55ea827 (both on main)

**629b358 — instrumentation.** The full-frame partition (`frame.preStream` / `frame.road.warmRoutes`
/ `frame.postStream`) plus the ribbon tile sub-buckets. Zero-cost when `?hitch` is off. The heap
probe was built and then dropped before shipping: headless Chrome reports a static `usedJSHeapSize`
even with `--enable-precise-memory-info`, so it measured nothing and would have misled.

**55ea827 — the contained half of the warmRoutes fix.** `_buildUrquhart` memoised its `persist=true`
path only, and `warmRoutes` is the `persist=false` caller — so it re-derived the graph every 32 m
while `sig` is quantised to 256 m, rebuilding a byte-identical Delaunay+Urquhart most calls. Keyed on
the existing `sig`, cleared from `_invalidateProto` (verified sole path by which sites/params change;
`setWaterNoGo` routes through it). 30 affected gates green including the invariance gates.

Also fixed the stale `no-ops under BUG-26` comment at the call site.

### What the fix was worth, and what it was NOT

Honest A/B at `--cpu=4`, memo off vs on: `warm.degreeDrops` 89 → 42 ms, `warm.urquhart` ~7 → ~1.4 ms.
Real, but it did **not** close the ticket — total `warmRoutes` on the worst frames barely moved
(72.7/68.2/35.6/32.4 with the memo, against 69.6/64.7/34.6/32.0 without). My first hypothesis — that
the repeated graph rebuild *was* the cost — was wrong, and the memo alone does not fix this.
Run-to-run variance on the worst frames is high (57–144 ms for the same configuration), so trust the
within-mechanism split below, not cross-run worst-frame deltas.

### The remaining cost, now named (this is the open work)

`frame.road.warmRoutes` decomposes into three, and the graph build was the small one:

| bucket | worst frames at 4× | what it is |
|---|---|---|
| `warm.degreeDrops` | 42.2, 41.4, 40.7, 34.9 ms | `_degreeDropSet` recompute. Its own memo keys on `_networkRev`, which churns while streaming, so it re-runs constantly. |
| `warm.scan` | 36.2, 32.2 ms | `_warmScan` — `_edgeDeps` / `_corridorDiscsFor` / `_soloClearOf` dependency + corridor-disc work. |
| `warm.urquhart` | ~1.4 ms | now memoised; done. |

Neither remaining one is a graph rebuild, so neither is fixable with another cache at the window
level. **Step 1 below has since been answered — see the 2026-07-28 section: `_networkRev` does not
churn, and the real mechanism is 5 cold window misses, one per 256 m macro-column crossing.**

1. ~~Understand why `_networkRev` bumps so often during streaming.~~ ANSWERED: it never bumps.
2. **Cache `_degreeDropSet` per CANDIDATE PAIR rather than per WINDOW** — sound because the decision
   is a bounded-radius pure function (see below). A one-column shift then recomputes only the new
   candidates. This is the fix that removes the work.
3. **Budget Phase 2 across frames** — safe because the algorithm is order-free by design, and
   `warmRoutes` is pre-warm with slack. Safer first step; composes with 2.

The `warm.*` buckets are shipped, so this starts from the split rather than re-deriving it.

## 2026-07-28 — `warm.degreeDrops` FIXED. The per-candidate cache was the wrong target.

Branch `feature/perf-26`. **Before implementing option 2 above, I benchmarked the inside of
`_degreeDrops` — and it does not spend its time where this ticket assumed.** Cold-miss split over 6
marching macro-columns, seed 6, headless 1× (`_urqMemo` cleared each column to reproduce a true
column crossing):

| term | per cold column | share |
|---|---|---|
| `_buildUrquhart` at the wide margin | 6.2–13.1 ms | **~80 %** |
| `_degreeDropSet` (Phase 1 + Phase 2 BFS) | 1.2–2.1 ms | ~16 % |

So **caching `_degreeDropSet` per candidate pair (option 2) would have attacked 16 % of the cost.**
The order-freedom / window-invariance reasoning in "Why the fix is safe by construction" is all
correct — it was just pointed at the small term. Recording this because the same trap (assume, then
optimise) is what this ticket has now sprung three times.

### The actual cause: one margin serving two consumers with very different reach

`_degreeDrops` built its graph at `roadGraphMargin + roadGraphCullMaxHops + 1` = 3 + **8** + 1 = **12**
cells of padding. That margin is right for `_cullNetwork`, which runs its `detour()` BFS over the
returned `dg` out to `roadGraphCullMaxHops` (8). But it is sized for the wrong consumer: the *drop
set* comes from `_degreeDropSet`, whose Phase-2 BFS reaches only `roadGraphDegreeDetourHops` (**4**),
so margin 3 + 4 + 1 = **8** already contains the full detour neighbourhood of every in-window
candidate — exactly the window-invariance argument this ticket already relies on.

`warmRoutes` — the every-32 m caller that owns the hitch — reads only `.drop`. It was paying a
margin-12 delaunay (1261 edges) every column crossing to compute a set a margin-8 one (645 edges)
decides identically.

**Fix (`src/road.js`, `_degreeDrops`):** compute `drop` from the margin-8 build, and make `dg` a
**lazy getter** for the margin-12 build so only the cull / one-ring callers pay for it. When the two
margins coincide, `_urqMemo` returns the same object and nothing is doubled.

**Verification.**
- *Decisions unchanged:* margin-12 vs margin-8 drop decisions compared on every edge with both
  endpoints in the window, across 6 columns — **107 compared, 0 mismatches**.
- *Cost:* cold `_degreeDrops` **9.6 → 2.7 ms per column crossing** (57.3 → 16.3 ms over 6), −72 %.
- *Gates:* all **23 affected gates green**, including `graph-cull-radius-invariance`,
  `graph-topology`, `restream-invariance`, and `centerline-curvature`'s two-center invariance.
- *In-browser A/B*, back-to-back `--scenario=stream --cpu=4 --duration=60`, Normal, seed 6:

  | | worst warmRoutes frames | `warm.degreeDrops` | `warm.scan` | hitch excess |
  |---|---|---|---|---|
  | before | 99.2 / 91.1 ms | **48.1 / 41.4** | 32.6 / 30.6 | 2382 ms |
  | after  | 121.8 / 64.7 ms | **23.8 / 12.4** | 63.4 / 33.8 | 1443 ms |

  `warm.degreeDrops` falls by half to two-thirds, matching the deterministic headless −72 %. Treat
  the worst-frame and `warm.scan` columns as noise — a third run showed a 296 ms outlier carrying
  124 ms of `frame.physics`, nothing to do with this change. The within-mechanism bucket and the
  headless bench are the load-bearing evidence, per this ticket's own standing warning.

### `warm.scan` is now the whole remaining hitch — and it has a named mechanism

Not fixed here; investigated far enough to hand over cleanly. `_warmScan`'s `cap`
(`PREWARM_MAX_JOBS` = 16) bounds **dispatched jobs, not work done**. An edge taking a `deferred`
branch still pays full `_edgeDeps` + `_corridorDiscsFor` (+ `_soloClearOf`) and contributes no job,
so the expensive-evaluation count is unbounded by `cap` — the same "oversized atomic unit no ms
budget can bind" shape as the carve and the wide delaunay.

It compounds: `warmRoutes` only advances `_lastWarmCenter` when `!deferred`, so while the set is
incomplete the **full scan re-runs every frame**, re-evaluating the same deferring edges.

Next step is a *work* budget (edges evaluated, or ms), not a job budget. **Caveat for whoever takes
it:** a naive eval cap restarts at `edges[0]` every frame and would just re-do the same first N
forever — it needs a rotating start offset or a persistent cursor, or the tail starves and pre-warm
never completes. That is why this half was not attempted blind.

### Still open, unchanged

- **Re-measure `road.tile`** before any ribbon work. It sat at +0.2/+1.7/+0.3 lift across four runs
  against the +12 ms originally recorded; on this evidence item 1 below should probably be struck.
- **Fix or retire `--scenario=drive`.** It silently reports "no hitches" because the truck is stuck
  ~55 m from spawn, which is worse than not having the scenario at all.

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

## Closing decision (updated 2026-07-28)

**Stays open, with half the remaining scope closed.** Acceptance (no tag above ~5 ms lift) is still
unmet, but the ticket is now down to a single named mechanism.

- `warm.degreeDrops` — **DONE.** −72 % cold, decisions bit-identical, 23 gates green. See the
  2026-07-28 section; the margin, not the algorithm, was the cost.
- `warm.scan` — **the only remaining scope.** Mechanism named (job cap ≠ work cap; full rescan every
  frame while deferred), fix sketched, starvation caveat written down. Start there, not at diagnosis.
- Everything else stays measured and cleared: GC (no `unattr` left), `props.lodSwap`
  (co-occurrence — it still tops the lift table at +15.4 and it still is not the cause), prop scatter
  (+0.0), the terrain carve (fixed earlier), and — pending one re-measure — the road ribbon.
- Split nothing off. There is no separate allocation-churn ticket to write; the data killed it.

Standing lesson, now three-for-three on this ticket: **every time someone reasoned about where the
time went instead of measuring the sub-terms, they picked the wrong term** — the ribbon (reverted for
nothing), the `_networkRev` churn (never happened), and now the per-candidate cache (16 % of the
cost). Bench the split first; it took ten minutes here and redirected the whole fix.

The instrumentation branch `perf-26-instrument` / worktree `../CarGame-perf26` served its purpose and
was **deleted 2026-07-28** — everything worth keeping is on main in 629b358 + 8cd8fb0 (the ticket's
`55ea827` was re-committed as 8cd8fb0). The dropped heap probe is described above; do not rebuild it,
headless Chrome reports a static `usedJSHeapSize`.
