---
id: PERF-14
type: perf
status: done
severity: major
created: 2026-07-13
closed: 2026-07-13
---

# Streaming stutter: prop scatter ran 100–190 ms synchronously on every chunk-row entry

## Symptom / diagnosis (PERF-08 harness, stream scenario + hitch attribution in trace-report)

Consistent 1–2 missed frames whenever the world streams a new chunk row (driving AND freecam).
Hitch attribution at 60 m/s freecam: 39 top-level main-thread tasks >20 ms in 40 s, p99 92.6 ms —
**frame.props.update owned 4.68 s of the 4.9 s total hitch time** (terrain/ribbon/road budgets all
behaved). Entering a row scattered ~5 chunks synchronously in ONE frame at 20–40 ms each.

Two深 sub-causes found while slicing:
1. Per-candidate sampler chains are µs-scale on average but the FIRST query into a fresh
   WATER_CELL paid 13–58 ms of lazy pond/stream detection (rim casts + flow traces) inside the
   scatter (or inside the terrain carve blend, whoever got there first).
2. The FEAT-25 stream-rock boost passes (attempts ≈ 10× base) only yielded after PLACING — a
   channel-less chunk burned the whole pass (hundreds of streamAt walks, 12–19 ms) in one
   un-sliceable step.

## Fix (determinism/window-invariance untouched — same rng streams, same order, same output)

- `prop-scatter.js`: `scatterChunkGen` — the scatter body as a generator yielding per candidate
  (boost passes yield BEFORE the channel-miss continue); `scatterChunk` = drain-all wrapper
  (gates/fixtures unchanged). Placement records now carry `gy` (scatter-time ground sample) so
  the commit phase never re-samples heightAt.
- `prop-system.js`: scatter is QUEUED nearest-first and stepped under a per-frame budget
  (3 ms; 50 ms burst until the first full drain). Placements commit atomically per chunk.
  HARD RADIUS: the 3×3 chunks around the VEHICLE force-complete synchronously (prop collision
  must exist under the truck; freecam passes no hard point). `drainScatter()` for gates/teleports.
  update() signature: `update(x, z, ring, hardX?, hardZ?)` (main.js passes vehicleState).
- `water.js`: `warmRegion(bbox, deadlineMs)` — budget-pumped detection pre-warm filling exactly
  the caches the lazy path reads (cellData / _pondForBasin / _streamForSaddle) with a per-cell
  skip-list. main.js pumps 2 ms/frame over a 768 m lookahead — detection is warm long before
  scatter or carve touches it.
- main.js: perf buckets frame.props.update / frame.water.sync / frame.water.warm (TEMP D-arc).

## Verified

- Browser stream sweep 60 m/s: 39 hitches → **2**, dropped 1.06 % → **0.06 %**, p99 92.6 → 18.5 ms.
- 120 m/s (≈ 2× freecam top speed): 8 hitches/40 s, dropped 0.17 %, p99 18.5 ms.
- Headless repro (perf-runs/bench-propupdate.mjs pattern): worst update 3.4 ms over a 1200-frame
  60 m/s sweep.
- Screenshot at the (-38,183) junction forest: pixel-identical prop field.
- npm test green (known-red GRAPH-REACHABILITY excepted).

## Residual (not scheduled)

The remaining rare hitches are single atomic units: a road-heavy chunk's `_buildCarveTable`
(~16–18 ms) and a single stream flow-trace inside warmRegion (unit > budget). If the user still
feels them: slice the carve table build per-row across frames, and/or slice the flow trace.
