---
id: PERF-10
type: perf
status: done
severity: major
created: 2026-07-13
closed: 2026-07-13
---

# Prop InstancedMeshes draw full capacity — hidden slots were 85 % of all scene triangles

## Problem

Every prop InstancedMesh (and the PERF-07 shadow-blob mesh) set `mesh.count = capacity` at
construction and never lowered it. Hidden slots are zero-scale matrices — invisible, but every
one of the ~24k capacity slots still ran the vertex stage of the MAIN pass and (for casters) the
shadow pass, every frame. Measured at Normal idle (PERF-08 Phase 2): 2.26M triangles drawn, of
which compaction removes 1.9M (84 %). The `propCountCompact` A/B lever isolated it: main-thread
busy 31.6→19.9 %, gpu 13.3→8.2 %.

## Fix (src/props/prop-system.js + prop-shadow-blobs.js)

Occupied-prefix draw: each record keeps an occupancy bitmap (`occ`) and high-water mark (`top`);
alloc raises `top`, release shrinks it while the top slot is free, `_flush()` writes
`mesh.count = top`. Slots stay pre-hidden so free slots inside the prefix render degenerate.
The free list already fills low indices first, so the prefix stays tight under streaming churn.
`__lever propCountCompact` now A/Bs back to the OLD full-capacity behaviour (v=0).

## Verified

- Idle Normal (warm-drained window): tris 2.26M → 0.36M, calls 80, p99 18.7 ms, dropped 0.31 %,
  main 18.9 %, gpu 10.5 %.
- Screenshot at (-38,183) junction forest: identical prop field + shadows vs pre-fix.
- Gates: props / prop-road-clearance / rock-collision-proxy / rock-collision-mesh green; full
  suite green (known-red GRAPH-REACHABILITY excepted).
