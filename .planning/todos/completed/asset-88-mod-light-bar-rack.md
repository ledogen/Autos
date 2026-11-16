---
id: ASSET-88
type: asset
status: done
severity: minor
opened: 2026-11-16
closed: 2026-11-16
source: owner, 2026-11-16 — approved the FEAT-204 set with the round-3 changes (DEC-341)
relates: FEAT-204, DEC-340, DEC-341, assets/models/mod-light-bar-rack.glb
---
lane: A

# ASSET-88: Roof light pods, rack version: hung in front of the rack's front rail

**Vehicle visual mod** (FEAT-204): a bolt-on part shown on the hero Ranger when fitted.

## Next steps
None here: the `.glb` shipped. Wiring it into the game is FEAT-204's (a separate agent).

## Summary
Four round 6.5 in incandescent reflector lamps (the owner's "older style 4 reflector incandescent"), each on a welded L-bracket hung IN FRONT of the roof rack's upper front rail: lamp centres at z 1.752, 12 mm above the rail's 1.740, can tops level with the basket's top rail, plate underside 18 mm over the roof at its tightest. The loom rides on the rail to the driver's end and drops over the roof edge into the door gap. **Only fitted together with `mod-roof-rack`** (it has no feet of its own); the game picks it when both mods are owned.

## Description
| Field | Value |
|---|---|
| File | `assets/models/mod-light-bar-rack.glb` (glTF binary, no Draco/KTX2, no textures, flat-shaded) |
| Triangles | **2780** (evaluated) |
| Real size | 1.194 x 0.168 x 0.298 m (W x L x H, loom included); lens faces at y 0.274 (Blender frame) |
| Origin + forward | `ranger.glb`'s own origin and frame: forward −Z, +Y up, ground plane y = 0. Not centred on itself. |
| Materials | `LightBarSteel` (cans, brackets, studs, loom), `LightBarChrome` (bezels), `LightBarReflector` (**runtime hook: set its emissive when the lamps are on**), `LightBarGlass` (the one clear material: BLEND, single-sided). Same names as the solo model. |
| Mount points | brackets on the rack rail at glTF (x, 1.740, −0.133), x = ±0.135, ±0.405 |
| Collision | none: a visual on the truck body, whose collider is unchanged |
| Generator | `assets/models/src/mod-light-bar.py` (+ `.blend`; shares `assets/models/src/mod_partlib.py`) |

**Mount (the wiring agent reads this).** Built in `ranger.glb`'s frame: add the loaded scene as a CHILD of the loaded ranger body with **no offset** (identity transform), and do it **after** the ranger loads, because the loader hides small root children (ASSETS.md § Conventions the vehicle loader depends on).

## Tracker
- [x] `.glb` at `assets/models/mod-light-bar-rack.glb`, 0 inverted faces (ray check), 0 images
- [x] 0 part-vs-part overlap in both fitted sets (rack + rack lights + bull bar + toolbox; solo lights + bull bar + toolbox)
- [x] Headless generator committed with paths from `__file__`
- [x] Owner approval (DEC-341)

## Decisions
- DEC-340 (lights mount to the rack when both are fitted), DEC-341 (pods in front of the rail).

## Links
Review sheets (git-invisible): `wip/feat-204-common/renders/r3-rack-lights-*.png`, `r3-solo-lights-*.png`.

## Files
`assets/models/mod-light-bar-rack.glb` · `assets/models/src/mod-light-bar.py` · `assets/models/src/mod-light-bar.blend` · `assets/models/src/mod_partlib.py`

## Log
- 2026-11-16: shipped on land/feat-204-models (round 3). Not wired into the game.
