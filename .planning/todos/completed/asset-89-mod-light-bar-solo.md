---
id: ASSET-89
type: asset
status: done
severity: minor
opened: 2026-11-16
closed: 2026-11-16
source: owner, 2026-11-16 — approved the FEAT-204 set with the round-3 changes (DEC-341)
relates: FEAT-204, DEC-340, DEC-341, assets/models/mod-light-bar-solo.glb
---
lane: A

# ASSET-89: Roof light pods, solo version: on their own bridge bar

**Vehicle visual mod** (FEAT-204): a bolt-on part shown on the hero Ranger when fitted.

## Next steps
None here: the `.glb` shipped. Wiring it into the game is FEAT-204's (a separate agent).

## Summary
The same four lamps on their own low channel bar across the roof deck just behind the windscreen header, on two cast feet with black gutterless clamps hooking over the roof edge into the door gap. Used when the lights are owned without the rack.

## Description
| Field | Value |
|---|---|
| File | `assets/models/mod-light-bar-solo.glb` (glTF binary, no Draco/KTX2, no textures, flat-shaded) |
| Triangles | **2808** (evaluated) |
| Real size | 1.420 x 0.144 x 0.365 m (W x L x H, clamps included); lamp axis z 1.808, lens faces at y 0.216 (Blender frame) |
| Origin + forward | `ranger.glb`'s own origin and frame: forward −Z, +Y up, ground plane y = 0. Not centred on itself. |
| Materials | `LightBarSteel` (bar, feet, clamps since DEC-341, studs, loom), `LightBarChrome` (bezels), `LightBarReflector` (**runtime hook: emissive when on**), `LightBarGlass` (clear, BLEND, single-sided). Same names as the rack model. |
| Mount points | feet at glTF (±0.600, 1.602, −0.125), on the roof deck |
| Collision | none: a visual on the truck body, whose collider is unchanged |
| Generator | `assets/models/src/mod-light-bar.py` (+ `.blend`; shares `assets/models/src/mod_partlib.py`) |

**Mount (the wiring agent reads this).** Built in `ranger.glb`'s frame: add the loaded scene as a CHILD of the loaded ranger body with **no offset** (identity transform), and do it **after** the ranger loads, because the loader hides small root children (ASSETS.md § Conventions the vehicle loader depends on).

## Tracker
- [x] `.glb` at `assets/models/mod-light-bar-solo.glb`, 0 inverted faces (ray check), 0 images
- [x] 0 part-vs-part overlap in both fitted sets (rack + rack lights + bull bar + toolbox; solo lights + bull bar + toolbox)
- [x] Headless generator committed with paths from `__file__`
- [x] Owner approval (DEC-341)

## Decisions
- DEC-340 (own bridge member when there is no rack), DEC-341 (roof clamp hardware black).

## Links
Review sheets (git-invisible): `wip/feat-204-common/renders/r3-rack-lights-*.png`, `r3-solo-lights-*.png`.

## Files
`assets/models/mod-light-bar-solo.glb` · `assets/models/src/mod-light-bar.py` · `assets/models/src/mod-light-bar.blend` · `assets/models/src/mod_partlib.py`

## Log
- 2026-11-16: shipped on land/feat-204-models (round 3). Not wired into the game.
