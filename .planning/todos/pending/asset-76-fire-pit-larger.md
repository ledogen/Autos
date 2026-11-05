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

- [x] fire-pit.glb at 1.2×, build.py and .blend updated alongside; registry box matches.
- [x] dist-assets and poi-yard gates green; the pit still seats on the yard pad (footing 3 cm below grade).

## Progress

**2026-11-05 (Lane C, cargame-a1) — exported at 1.2× (ce22542f), awaiting the owner's look.**

- One `SCALE = 1.2` applied to the finished mesh in `finish()` (and to `FireFlameAnchor`), not a
  per-parameter edit: the joints, cap, footing, logs, mortar inset and the fallen block's offset are ~15
  separate absolute numbers, so scaling only R_OUT / R_IN / COURSE_H would have left them at 1.0×. The
  parameters stay the 1.0× design; the comment on SCALE says so.
- Measured off the GLBs: 1.052 → 1.262 m across, top 0.300 → 0.360 m, footing −0.030 → −0.036 m (it
  scales too: 3.6 cm below grade). 644 tris, 0 inverted of 300 rays, 6 materials, unchanged.
- Registry box `[1.05, 0.33, 1.05]` → `[1.26, 0.40, 1.26]`.
- **Headless export now works** (the standing "headless never exports" line above is out of date):
  `OUT_DIR` derives from the script's own path (it was hard-wired to the main checkout, so a lane
  export would have written into main), and `_ui_override()` returns `{}` with no window, the items.py rule.
  `/Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 --python assets/models/src/fire-pit.py`
- Gates: dist-assets, poi-yard, poi-collider, model-palette, model-variant green. The 24 other
  AFFECTED gates (9 heavy) were left to the landing's full suite: the owner was gaming on the shared machine.
