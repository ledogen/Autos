---
id: ASSET-76
type: asset
status: open
severity: minor
opened: 2026-10-25
source: owner, 2026-10-25 — "brick firepit should be 20% bigger"
relates: ASSET-08 (the fire pit, shipped), FEAT-71 (yard scatter reads its collision box), FEAT-149 (it stays solid)
---
lane: C

# ASSET-76: Fire pit re-export at 1.2×

**Lawn furniture** (ASSET-08's role). Re-export `assets/models/fire-pit.glb` 20 % larger:
`assets/models/src/fire-pit.py` R_OUT 0.50 → 0.60, R_IN 0.31 → 0.372, COURSE_H 0.13 → 0.156
(everything scales — joints, cap, footing, the log); 1.2 m across. Then the registry box in
data/prop-models.js: `size: [1.05, 0.33, 1.05]` → `[1.26, 0.40, 1.26]`. Tri budget unchanged
(scale is free). Blender GUI export via blender-mcp (headless `blender -b` never exports — standing
rule); Blender was not connected when this was triaged, so the orchestrator did not do it.

## Acceptance

- [ ] fire-pit.glb at 1.2×, build.py and .blend updated alongside; registry box matches.
- [ ] dist-assets and poi-yard gates green; the pit still seats on the yard pad (footing 3 cm below grade).
