---
id: PERF-22
type: perf
status: open
opened: 2026-07-16
severity: major
source: PERF-21 GPU audit (feature/gpu-graphics worktree)
relates: [PERF-05 (GPU-bound), PERF-12 (tier scaling), FEAT-06c (prop impostors — the prop half of this)]
note: "Terrain is the last big vertex-load lever: every chunk is a full 65×65 grid regardless of
distance. NOT implemented in the PERF-21 pass — terrain.js chunk building is under active
world-gen/CPU work on another worktree; coordinate before starting."
---

# PERF-22: Distance LOD for terrain chunk geometry

Every terrain chunk is a full-resolution 65×65 vertex grid (8,192 tris) whether it is under the
truck or 500 m away. Resident triangle load by tier (visible+warm+keep rings):

| Tier   | resident chunks | resident tris |
|--------|-----------------|---------------|
| Low    | 25              | ~205k         |
| Normal | 49              | ~401k         |
| High   | 169             | ~1.38M        |
| Ultra  | 289             | ~2.37M        |

Frustum culling halves what is actually drawn, but High/Ultra still push >0.5–1M terrain tris per
frame, and per-frame shadow re-render (while driving) rasterizes receivers again. Distant chunks at
1 m grid resolution are pure waste — at 256 m a 65×65 chunk spans ~100 px on screen.

## Proposal

- 2 LOD levels first: full 65×65 within N chunks of the camera, 33×33 (or 17×17) beyond.
  Halving grid res per axis cuts distant-chunk tris 4× (16× at 17×17); Ultra's resident load drops
  from ~2.4M to well under 1M.
- Crack handling: simplest first cut = 1-row skirt dropped at LOD-boundary chunk edges (fog +
  distance hide it); proper T-junction stitching only if skirts show.
- LOD radius per quality tier (join the lodRing/propRing family in QUALITY_PRESETS).
- Re-mesh on LOD change reuses the existing chunk build queue (MAX_BUILDS_PER_FRAME cap) — treat a
  LOD flip like a re-stream of that chunk; hysteresis of ±1 chunk so a boundary camera doesn't
  thrash rebuilds.

## Coordination warning

`terrain.js` chunk building/streaming is concurrently being reworked on the world-gen/CPU worktree.
Rebase on their merge and re-audit `_buildChunk`/geometry pool before implementing.

## Acceptance

- High/Ultra resident terrain triangles reduced ≥50% with no visible cracks at LOD seams from
  driving height and chase camera.
- No new streaming hitch (LOD re-meshes ride the existing per-frame build cap).
- Affected gates green (`carve-mesh-smoothness`, `road-smoothness`, surface invariance) — physics
  sampling must remain analytic (LOD is render-only; collision reads analyticHeight, not the mesh).
