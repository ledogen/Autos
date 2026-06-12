---
phase: 09-road-surface
plan: "10"
subsystem: road-mesh
tags: [road, rendering, depth-bias, skirts, polygonOffset, geometry]
dependency_graph:
  requires: []
  provides: [ribbon-depth-bias, ribbon-edge-skirts, road-decal-params]
  affects: [src/road-mesh.js, data/ranger.js, src/debug.js, src/main.js]
tech_stack:
  added: []
  patterns: [polygonOffset material bias, renderOrder draw order, per-section skirt verts]
key_files:
  created: []
  modified:
    - src/road-mesh.js
    - data/ranger.js
    - src/debug.js
    - src/main.js
decisions:
  - "vertsPerSection = (CROSS_SEGS+1)+2 = 13 — skirt bottom verts at deterministic local indices CROSS_SEGS+1 (left) and CROSS_SEGS+2 (right) for Plan 09-12 test harness"
  - "Skirt winding: left skirt CCW from -right outside (tL0→bL0→tL1, tL1→bL0→bL1); right skirt CCW from +right outside (tR0→tR1→bR0, bR0→tR1→bR1)"
  - "onRoadMaterialChange callback added to main.js callbacks object to allow live polygonOffset updates without full road rebuild"
metrics:
  duration: ~20 minutes
  completed: 2026-06-12
---

# Phase 9 Plan 10: Ribbon Depth-Bias + Edge Skirts Summary

**One-liner:** Ribbon material wins depth over terrain via polygonOffset (negative factor/units) + renderOrder=1, with 0.4m downward edge skirts using asphalt-dark color to close see-through gaps.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Ribbon depth-bias material + skirt/offset params + sliders | 47fccec | data/ranger.js, src/road-mesh.js, src/debug.js, src/main.js |
| 2 | Ribbon edge skirts in sweepRibbon geometry | 3312089 | src/road-mesh.js |

## What Was Built

### Task 1: Depth-Bias Material + Params + Sliders

**data/ranger.js** — Added three new params after the pothole block (line 331):
- `roadSkirtDepth: 0.4` — vertical apron depth below ribbon edge (metres)
- `roadPolygonOffsetFactor: -1` — negative pulls ribbon toward camera in depth
- `roadPolygonOffsetUnits: -1` — negative depth-units bias paired with factor

**src/road-mesh.js** — Modified shared `_material` constructor to enable depth bias:
- `polygonOffset: true`
- `polygonOffsetFactor: params.roadPolygonOffsetFactor ?? -1`
- `polygonOffsetUnits: params.roadPolygonOffsetUnits ?? -1`
- Set `mesh.renderOrder = 1` on all ribbon and junction footprint meshes in `_buildRoadTile`

**src/debug.js** — Added three sliders to Road Surface folder:
- `Skirt Depth (m)` — range 0–1.5 step 0.05, fires `fireSurface` (geometry rebuild)
- `PolyOffset Factor` — range -4–0 step 0.5, fires `fireMaterial` (live material) + `fireSurface`
- `PolyOffset Units` — range -8–0 step 0.5, fires `fireMaterial` (live material) + `fireSurface`

**src/main.js** — Added `onRoadMaterialChange(factor, units)` callback that writes directly to `roadMeshSystem._material.polygonOffsetFactor/Units` for live update without full rebuild.

### Task 2: Edge Skirts in sweepRibbon

**src/road-mesh.js** sweepRibbon function:
- `vertsPerSection = (CROSS_SEGS + 1) + 2` = 13 per section (11 top + 2 skirt bottom verts)
- `nVerts = N_LONG * vertsPerSection` — all per-section index math updated to use `vertsPerSection`
- After the top-surface `j` loop, two skirt verts emitted per section:
  - `leftSkirtIdx = i*vertsPerSection + (CROSS_SEGS+1)` — same XZ as j=0 edge, vy = edgeY - skirtDepth
  - `rightSkirtIdx = i*vertsPerSection + (CROSS_SEGS+2)` — same XZ as j=CROSS_SEGS edge
  - Both colored with asphalt base (RC,GC,BC = 0.15,0.15,0.17)
- Index buffer expanded: `nQuads = (N_LONG-1)*CROSS_SEGS + (N_LONG-1)*2`
  - Left skirt quads: CCW from -right outside face
  - Right skirt quads: CCW from +right outside face
- Top-surface `vy = gradeY + crownY + tiltY + pY` formula **unchanged**
- `terrain-worker.js` **not touched**

## Static Acceptance Checks (All Pass)

```
grep -c "roadSkirtDepth|roadPolygonOffsetFactor|roadPolygonOffsetUnits" data/ranger.js  → 7
grep -c "polygonOffset:" src/road-mesh.js                                               → 2
grep -c "polygonOffsetFactor|polygonOffsetUnits" src/road-mesh.js                       → 2
grep -c "renderOrder" src/road-mesh.js                                                  → 3
grep -c "roadSkirtDepth|roadPolygonOffsetFactor|roadPolygonOffsetUnits" src/debug.js    → 7
node --check data/ranger.js && node --check src/road-mesh.js && node --check src/debug.js  → PASS
grep -c "polygonOffset|roadSkirtDepth|renderOrder|skirt|vertsPerSection" terrain-worker.js → 0
grep -c "transparent:.*true" src/road-mesh.js                                           → 0
grep -c "skirtDepth|roadSkirtDepth" src/road-mesh.js                                    → 4
grep -c "vertsPerSection" src/road-mesh.js                                              → 24
grep -v '^[[:space:]]*[/*]' src/road-mesh.js | grep -c "i * (CROSS_SEGS + 1) + j"     → 0
grep -c "gradeY + crownY + tiltY + pY" src/road-mesh.js                                → 1
```

## Human Verification Required

**The browser checkpoint from this plan cannot be automatically verified (no headless WebGL per CLAUDE.md). A human must run the following steps:**

### Setup

Start a local HTTP server from the repo root:
```
python3 test/nocache-server.py
```
or:
```
npx serve .
```
Then open `http://localhost:8000` (or whichever port) in a browser.

### Verification Steps

1. **Sliders exist:** Open the debug panel (backtick key). Navigate to Roads → Road Surface. Confirm three new sliders are present: `Skirt Depth (m)`, `PolyOffset Factor`, `PolyOffset Units`.

2. **Ribbon draws over terrain:** Fly the free cam (if available) over a road section on rolling terrain. The asphalt ribbon should read as a clean solid surface on top of terrain — no dithering, z-fighting, or camo pattern where terrain is at or below ribbon height.

3. **Skirt apron visible:** At ribbon edges, a dark vertical apron (~0.4 m deep) should hang below each edge. The ribbon should not look like a paper-thin floating sheet — there should be a visible downward face at each edge.

4. **Live polygonOffset update (no rebuild stall):** Drag `PolyOffset Factor` slider to -3. The ribbon should visibly sit more firmly on top with no rebuild stall — the update should be instant (live material, not a full road rebuild).

5. **Skirt depth rebuild:** Drag `Skirt Depth (m)` to 1.0. After the road rebuilds (short delay), skirts should be visibly deeper.

### Expected Pass Criteria

- Ribbon surface reads clean/solid over coplanar terrain (no z-fight shimmer)
- Dark vertical skirt face visible at both ribbon edges
- PolyOffset sliders respond instantly (live material update)
- Skirt depth slider triggers a rebuild and changes skirt depth
- No transparency, no see-through ribbon top surface

### Known Limitation Until Plan 09-11

On steep terrain where the ground rises above the ribbon edge height, terrain may still poke through between the skirt faces and the terrain surface. Plan 09-11 (terrain carve below ribbon) will close this gap. The ribbon's depth-bias and skirts fix the z-fighting and close the downward edge gap; the upward poke-through is the carve plan's domain.

## Deviations from Plan

**None** — plan executed exactly as written. The `onRoadMaterialChange` callback approach was explicitly specified in the plan's action block as the path to take when no material handle was available in debug.js scope.

## Known Stubs

None — all three params are fully wired (ranger.js → material constructor at startup, sliders in debug.js, live update callback in main.js).

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Self-Check: PASSED

- src/road-mesh.js modified: FOUND
- data/ranger.js modified: FOUND  
- src/debug.js modified: FOUND
- src/main.js modified: FOUND
- Commit 47fccec exists: FOUND
- Commit 3312089 exists: FOUND
