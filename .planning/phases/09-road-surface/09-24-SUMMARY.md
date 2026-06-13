---
phase: 09-road-surface
plan: 24
subsystem: road-mesh / debug / params
tags: [road, skirts, vertex-color, dirt-shoulder, cosmetic, SURF-05, SURF-02, D-01, D-08]
dependency_graph:
  requires: [09-22, 09-23]
  provides: [SURF-05-dirt-skirts, SURF-02-procedural-color-picker]
  affects: [src/road-mesh.js, data/ranger.js, src/debug.js]
tech_stack:
  added: []
  patterns: [vertex-color-from-hex-param, lil-gui-addColor-fireSurface]
key_files:
  created: []
  modified:
    - src/road-mesh.js
    - data/ranger.js
    - src/debug.js
decisions:
  - "Derive dirt RGB via bit-shifts on hex int (roadDirtColor >> N & 0xff) / 255 — matches linear-space convention of existing RC/GC/BC; no THREE.Color allocation needed"
  - "Place dirtR/dirtG/dirtB derivation once before the per-section loop — single extraction, no per-vertex work"
  - "Default 0x6b5a3e (muted earthen brown) chosen to match exposed earth/gravel on rural road construction"
metrics:
  duration: ~10 min
  completed: 2026-06-13
  tasks_completed: 2
  tasks_total: 3
  files_changed: 3
---

# Phase 9 Plan 24: Dirt-Brown Ribbon Edge Skirts — Summary

## One-liner

Dirt-brown edge skirts via `roadDirtColor` hex param + `addColor` picker — skirt aprons now read as unpaved earth shoulder, not asphalt.

## Autonomous Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | roadDirtColor param + Road Surface color picker | 85d6353 | data/ranger.js, src/debug.js |
| 2 | Color skirt verts from roadDirtColor | d9914c8 | src/road-mesh.js |

## What Was Built

**Task 1 — param + picker:**
- `data/ranger.js`: added `roadDirtColor: 0x6b5a3e` with SURF-05/D-08/D-01 commentary (hex RGB, muted brown)
- `src/debug.js`: `surfaceFolder.addColor(params, 'roadDirtColor').name('Dirt Shoulder Color').onChange(fireSurface)` — firing `fireSurface` triggers a full ribbon rebuild so skirt colors update live

**Task 2 — skirt vertex colors:**
- `src/road-mesh.js sweepRibbon`: derive `dirtR`, `dirtG`, `dirtB` once before the section loop using bit-shift decomposition of `params.roadDirtColor` into 0–1 linear space (matching `RC`/`GC`/`BC` convention)
- The two skirt-color write sites (`leftSkirtBase` colors and `rightSkirtBase` colors) now write `dirtR/dirtG/dirtB` instead of `RC/GC/BC`
- Top-surface asphalt base + markings (`RC`/`GC`/`BC`, centerline, edge lines) are entirely unchanged
- `vertsPerSection=13`, vertex positions, and the index buffer are untouched

## Verification

- `node --check` passes on all three modified files
- `grep -c roadDirtColor` confirms presence in ranger.js, debug.js, road-mesh.js
- `node test/spline-continuity.mjs` exits 0 — all gate fixtures pass (gentle-baseline, tile-seam-mismatch, hairpin-inner-edge, switchback-no-arm-flip, two-arms-no-undermine, camber-rate)
- `git diff --stat src/terrain-worker.js` is empty — worker untouched

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The dirt color is fully wired: param exists in ranger.js, picker fires fireSurface in debug.js, skirt verts read the derived RGB in road-mesh.js.

## Threat Flags

None. This is a cosmetic vertex-color change with no new network endpoints, auth paths, file access, or schema changes.

## Task 3 (human-verify checkpoint)

Task 3 is a `checkpoint:human-verify` gate — the combined in-sim acceptance pass for both this plan's dirt shoulders and the full D0–D5 refactor (09-18..09-23). It cannot run headless. See the CHECKPOINT block returned by the executor.

## Self-Check: PASSED

- `data/ranger.js` modified: FOUND (commit 85d6353)
- `src/debug.js` modified: FOUND (commit 85d6353)
- `src/road-mesh.js` modified: FOUND (commit d9914c8)
- All commits exist in git log
- `node test/spline-continuity.mjs` exit 0: CONFIRMED
- `git diff --stat src/terrain-worker.js` empty: CONFIRMED
