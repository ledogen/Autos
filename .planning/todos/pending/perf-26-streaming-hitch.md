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

## Remaining

Ranked by measured lift at `--cpu=4` after the carve fix:

1. **Road ribbon tile build** — `road-mesh.js flushPendingQueue`, `MAX_ROAD_BUILDS_PER_FRAME = 1`.
   Same atomic-unit problem: one tile is 8–16 ms unthrottled (25–45 ms at 4×), which no per-frame
   cap can subdivide. It also lands in the *same* frame as the terrain commit (both are driven off
   the chunk ring), so the two stack — `road.tile` and `terrain.chunk` have identical stats in every
   run because they always co-occur. Two fixes available and they compose: slice `_buildRoadTile`
   the way the carve was sliced, and/or stagger the ribbon flush so it never shares a frame with a
   terrain commit. Currently the top remaining contributor: lift +10.3 ms at 4×.
2. **`props.lodSwap` outliers** — `_syncChunkLod(budget = 6)` re-places 6 chunks/frame on a fixed
   COUNT, not an ms budget. Usually cheap, but it owns the worst frames left in the run (81 ms at
   4×) and those frames carry 60–70 ms of time inside NO bucket, with `frame.props.update` reading
   only ~3 ms. That signature is not the swap work itself — suspect a GC pause triggered by the
   unplace/place churn. Confirm with an allocation profile before optimising; if it is GC, the fix
   is to stop the swap allocating (reuse the placement arrays), not to lower the budget.
3. **Prop scatter is NOT a problem** — `props.chunk` measures a +0.0 to +0.3 ms lift. Its 3 ms/frame
   drip budget works. Do not spend effort here; the original hypothesis pointed at prop loading and
   the data cleared it.

## Acceptance

- `node test/hitch-report.mjs --scenario=stream --cpu=4` shows no tag with a lift above ~5 ms.
- No regression in cold load (`profile.mjs --scenario=coldload`: ready + ring-complete).
- Affected gates green; carve/ribbon surface gates must stay green since these are scheduling-only
  changes — any gate movement means the geometry changed and the change is wrong.
