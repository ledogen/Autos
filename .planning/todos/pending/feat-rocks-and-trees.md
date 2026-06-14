---
id: FEAT-06
type: feature
status: open
opened: 2026-06-11
source: scribe-session
---

# FEAT-06: Scatter rocks and trees on the terrain

## Request

Populate the world with rocks and trees so the terrain feels inhabited rather than bare —
environmental props scattered across the landscape.

## Notes

- Visual / environment feature. Open questions for when picked up (worth a deeper pass):
  - **Placement:** procedural scatter keyed off terrain seed/position (deterministic, seam-free
    across streamed chunks) vs. authored placement.
  - **Density rules:** e.g. trees in valleys / off-road, rocks on slopes; avoid roads & the driving line.
  - **Collision (DECIDED 2026-06-11):** everything is collidable — trees and large rocks
    participate in the physics/contact system (the truck can hit them) — **EXCEPT "small rocks"**,
    which are decorative-only (no collision; drive straight over them). Implies a size/category
    split: large rocks + trees = collidable props; small rocks = visual scatter.
  - **Geometry source:** procedural/low-poly meshes (fits no-asset constraint) vs. instanced models.
- Likely overlaps the planned **Phase 10 (POI Hooks + Polish)** — reconcile rather than duplicate.
- Captured live via scribe session during Phase 9 work; promote via `/gsd:review-backlog` when ready.
