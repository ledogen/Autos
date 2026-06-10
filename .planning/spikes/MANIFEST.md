# Spike Manifest

## Idea

Replace Phase 8's per-tile west→east A* road router (which forces the road to climb every
mountain in its path and can't route the locked steep coarse terrain) with a **valley-following
trunk**: seed anchors snapped down to valley floors, route a single global least-cost trunk
(cost dominated by altitude + grade, soft grade penalty) over a wide window so it **wraps around**
high ground, then slice that one continuous polyline into per-tile Catmull-Rom splines (seam
continuity falls out for free). Determinism + infinite extent via lazy per-macro-cell anchors.

Goal: confirm the road follows valleys and goes **around** the big mountain near the lone-pine
spawn instead of climbing it — on the real, locked coarse terrain.

## Requirements

_(Design decisions that emerge from spiking — non-negotiable for the real build. Updated as spikes run.)_

- Routing must run on the **real** `coarseHeight` (Phase 7 locked: amplitude 150 m, freq 0.0005,
  4 octaves, ridgeSharpness 1.6) — not a mock.
- **VALIDATED (spike 001, in-sim):** the valley-following architecture works. Endless roads as a
  deterministic chain of valley-snapped macro-anchors (256 m grid) connected by a **soft-cost A\***
  (altitude + grade dominated, finite over-cap penalty), streamed around the view center like
  terrain chunks. Roads prefer valleys and wrap around mountains. Confirmed by user.
- **Cost model:** `edgeCost = wDist·horiz + wAlt·h + wGrade·grade² + wOver·max(0,grade−maxGrade)`.
  User-tuned defaults: **wAlt 0.85, wGrade 400, wOver 8000, maxGrade 0.15**.
- **Route quality (in progress):** add a **turn penalty** (A* state carries heading; `wTurn` per-45°)
  for true switchbacks / long straights; **bound anchor gradient-descent** (≤0.45·spacing) to avoid
  parallel duplicate roads; **dedupe identical segments**; **collinear-simplify** the path before
  splining to remove micro-jogs and overshoot self-intersections.
- **Prototype lives in-sim**, not a standalone harness: the real sim already has freecam + lil-gui +
  spline debug viz, so tuning there beats a 2D canvas. Non-destructive `RoadSystem` proto path
  (does not touch the per-tile spawn API) gated behind Roads → "Valley Trunk (proto)".
- **User sign-off (in-sim):** pathing looks good, switchbacks read as real switchbacks, loops/dups
  resolved. wTurn 120. **Deferred to post-functional tuning:** slight coarseness (10 m grid) and a
  few unnatural loop-backs — polish, not blockers.

## Real-build scope (what "road generation actually works" means)

The proto only renders a debug centerline. To replace the failed per-tile router for real:
1. Make the valley trunk the actual `RoadSystem` output (retire the per-tile A* / hard-block path).
2. **Queryable for spawn:** `queryNearest(x,z) → {point, tangent}` over the streamed network so
   `resolveSpawn` (D-07) puts the truck on the road facing down it.
3. **Per-tile slicing** of the continuous polylines so downstream (Phase 9 surface) consumes stable
   per-tile splines; seam C0/C1 is automatic (one curve sliced).
4. **Sparseness / spurs (D-01):** a trunk + occasional spurs, not an east road on every macro-row.
5. Determinism + lazy infinite generation preserved (already true of the streaming-anchor model).
6. Then re-run the Phase-8 verification / seam exit gate.

## Spikes

| # | Name | Type | Validates | Verdict | Tags |
|---|------|------|-----------|---------|------|
| 001 | valley-route-wraps-mountain | standard | Global least-cost trunk (altitude+grade-dominated, soft grade) wraps around the peak via low ground instead of climbing it | ✅ VALIDATED (in-sim) | routing, terrain, astar |
| 002 | continuous-slice-seams | standard | Slicing one continuous polyline at 64 m boundaries gives C0/C1-continuous per-tile splines with no seam machinery | PENDING (trivial — one continuous polyline) | splines, seams |
| 003 | lazy-deterministic-anchors | standard | Seeded valley-snapped anchors generated lazily per region → deterministic trunk computable near any query without global state | ✅ VALIDATED (folded into 001 streaming model) | determinism, infinite |
