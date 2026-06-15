---
phase: 09-road-surface
plan: 15
status: superseded
superseded_by: 09-24
subsystem: road-mesh
tags: [dirt-skirt, vertex-color, cosmetic, superseded]
dependency_graph:
  requires: ["09-14"]
  provides: [dirt-brown-skirts]
  affects: [src/road-mesh.js, data/ranger.js, src/debug.js]
key_files:
  created: []
  modified: []
decisions:
  - "Not executed — scope delivered in full by plan 09-24 (deferred 09-15 cosmetic scope)."
metrics:
  completed: 2026-06-15
  tasks_completed: 0
  tasks_total: 2
  files_changed: 0
---

# Phase 9 Plan 15: Dirt-Brown Ribbon Edge Skirts — Superseded

**Status:** SUPERSEDED by plan 09-24. Not executed.

## Why superseded

Plan 09-24's own objective states it is "the deferred 09-15 cosmetic scope."
It delivered this plan's entire `must_haves` set:

| 09-15 must_have | Delivered by 09-24 |
|---|---|
| Ribbon edge skirt reads dirt-brown, not asphalt-dark | `sweepRibbon` skirt verts colored from `roadDirtColor` (road-mesh.js ~193, ~314) |
| Tunable param + debug color picker | `roadDirtColor: 0x6b5a3e` in data/ranger.js + `addColor` picker in debug.js |
| Color/material change only — skirt geometry unchanged | 09-24 changed vertex colors only |

Verified in source: `roadDirtColor` present in src/road-mesh.js, data/ranger.js, src/debug.js.

See 09-24-SUMMARY.md for the delivering implementation.
