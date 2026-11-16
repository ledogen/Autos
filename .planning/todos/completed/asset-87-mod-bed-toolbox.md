---
id: ASSET-87
type: asset
status: done
severity: minor
opened: 2026-11-16
closed: 2026-11-16
source: owner, 2026-11-16 — approved the FEAT-204 set with the round-3 changes (DEC-341)
relates: FEAT-204, DEC-340, DEC-341, assets/models/mod-bed-toolbox.glb
---
lane: A

# ASSET-87: The bed toolbox: a 60 in aluminium crossover box

**Vehicle visual mod** (FEAT-204): a bolt-on part shown on the hero Ranger when fitted.

## Next steps
None here: the `.glb` shipped. Wiring it into the game is FEAT-204's (a separate agent).

## Summary
A low-profile aluminium crossover (saddle) box across the bed right behind the cab, to the UWS drawing for 1998-2011 Rangers: lid flange on the bed rails on rubber pads, body hanging inside the bed clear of the walls. Diamond plate is geometry (raised studs), hinge at the cab side, two paddle latches on the rear face. It takes the bed floor from y −0.633 to −1.12 (Blender frame): bed cargo must start behind that (FEAT-204 Tracker).

## Description
| Field | Value |
|---|---|
| File | `assets/models/mod-bed-toolbox.glb` (glTF binary, no Draco/KTX2, no textures, flat-shaded) |
| Triangles | **1484** (evaluated) |
| Real size | 1.521 x 0.516 x 0.389 m (W x L x H) |
| Origin + forward | `ranger.glb`'s own origin and frame: forward −Z, +Y up, ground plane y = 0. Not centred on itself. |
| Materials | `ToolboxAluminium`, `ToolboxLatch`, `ToolboxRubber`. None recolourable. |
| Mount points | rail pads at glTF (±0.732, 1.141, +0.866), on the bed rails |
| Collision | none: a visual on the truck body, whose collider is unchanged |
| Generator | `assets/models/src/mod-bed-toolbox.py` (+ `.blend`; shares `assets/models/src/mod_partlib.py`) |

**Mount (the wiring agent reads this).** Built in `ranger.glb`'s frame: add the loaded scene as a CHILD of the loaded ranger body with **no offset** (identity transform), and do it **after** the ranger loads, because the loader hides small root children (ASSETS.md § Conventions the vehicle loader depends on).

## Tracker
- [x] `.glb` at `assets/models/mod-bed-toolbox.glb`, 0 inverted faces (ray check), 0 images
- [x] 0 part-vs-part overlap in both fitted sets (rack + rack lights + bull bar + toolbox; solo lights + bull bar + toolbox)
- [x] Headless generator committed with paths from `__file__`
- [x] Owner approval (DEC-341)

## Decisions
- none on the shape (DEC-340: stands as built; DEC-341: unchanged).

## Links
Review sheets (git-invisible): `wip/feat-204-common/renders/r3-rack-lights-*.png`, `r3-solo-lights-*.png`.

## Files
`assets/models/mod-bed-toolbox.glb` · `assets/models/src/mod-bed-toolbox.py` · `assets/models/src/mod-bed-toolbox.blend` · `assets/models/src/mod_partlib.py`

## Log
- 2026-11-16: shipped on land/feat-204-models (round 3). Not wired into the game.
