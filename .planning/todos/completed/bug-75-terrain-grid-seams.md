---
id: BUG-75
type: bug
status: done
severity: minor
opened: 2026-09-27
source: owner, portfolio scene 10 (treeline, 560/−384) — "made more visible by recent changes"
relates: PERF-03 (`_computeGridNormals` — one-sided differences at the chunk border, documented as "already discontinuous"), FEAT-84 (relief + mottle make the lighting step readable; slope-keyed rules key off the same normal)
---

# BUG-75: terrain grid seams — a straight shading step along chunk borders

## What it is

`_computeGridNormals` takes central differences inside a chunk and ONE-SIDED differences on its
four border rows (there is no neighbour sample in the 65×65 grid). The two chunks either side of a
border therefore disagree on the normal along it, and everything keyed off the normal steps
there: the lighting, the FEAT-05 bump, the FEAT-84 relief blend, the slope-gated rules (cliff
share, steep-face bare rock, under-rock green). Pre-FEAT-84 the flat palette hid it; with relief
and dither it reads as a straight line across a slope (scene 10, lower half).

## Fix

Give the border rows a real neighbour: sample the CARVED analytic height one cell outside the
chunk (`analyticHeight(x ± cell, z)` — the same surface the neighbour's own Y grid is built
from, so both sides compute the same normal regardless of load order). 4 × 65 samples per chunk.
Measure the build-time cost (`_flushPendingQueue` stage 2 is ~1 ms today); if it shows, the
Worker could ship a 67×67 halo instead (WORKER_SOURCE change).

## Acceptance

- Scene 10 and an overhead of any dirt/rock slope crossing a chunk border: no straight step.
- `carve-mesh-smoothness` / terrain gates green; per-chunk build cost noted.

## Resolution (2026-09-27)

Fixed as proposed: `_computeGridNormals(geom, cx, cz)` takes the carved `analyticHeight` one cell
outside the chunk for its four border rows (analyticHeight composes water + road carve, the same
surface the grid Y is built from), so both chunks compute the same normal on a shared border in
any load order. All three call sites (build, both recarve paths) pass the chunk coords. Scene 10
re-shot: the straight step across the dirt slope is gone. Gates 44/45 (standing road-clearance).
Cost: 4 × 65 analytic samples per chunk build (~1 ms, not re-measured under the profiler).
