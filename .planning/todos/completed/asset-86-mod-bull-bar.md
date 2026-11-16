---
id: ASSET-86
type: asset
status: done
severity: minor
opened: 2026-11-16
closed: 2026-11-16
source: owner, 2026-11-16 — approved the FEAT-204 set with the round-3 changes (DEC-341)
relates: FEAT-204, DEC-340, DEC-341, assets/models/mod-bull-bar.glb
---
lane: A

# ASSET-86: The bull bar: one bent tube with a welded crossbar

**Vehicle visual mod** (FEAT-204): a bolt-on part shown on the hero Ranger when fitted.

## Next steps
None here: the `.glb` shipped. Wiring it into the game is FEAT-204's (a separate agent).

## Summary
The plain bull bar the owner chose (DEC-341): one continuous 68 mm black tube from mount plates under the bumper, round the bumper's lower lip, rising with a 10° forward lean into a hoop whose top sits at headlamp-centre height, and one 60 mm crossbar welded in at bumper height. The skid-plate variant was dropped; its round-2 generator stays in `wip/bull-bar/`.

## Description
| Field | Value |
|---|---|
| File | `assets/models/mod-bull-bar.glb` (glTF binary, no Draco/KTX2, no textures, flat-shaded) |
| Triangles | **1360** (evaluated) |
| Real size | 0.876 x 0.373 x 0.476 m (W x L x H); hoop top z 0.864, front y 2.13 + tube |
| Origin + forward | `ranger.glb`'s own origin and frame: forward −Z, +Y up, ground plane y = 0. Not centred on itself. |
| Materials | `BullBarSteel` only (the bolts went into it with the skid plate's material). Not recolourable. |
| Mount points | frame-horn mount plates at glTF (±0.366, 0.470, −1.830); they run back under the bumper into the body (nothing floats) |
| Collision | none: a visual on the truck body, whose collider is unchanged |
| Generator | `assets/models/src/mod-bull-bar.py` (+ `.blend`; shares `assets/models/src/mod_partlib.py`) |

**Mount (the wiring agent reads this).** Built in `ranger.glb`'s frame: add the loaded scene as a CHILD of the loaded ranger body with **no offset** (identity transform), and do it **after** the ranger loads, because the loader hides small root children (ASSETS.md § Conventions the vehicle loader depends on).

## Tracker
- [x] `.glb` at `assets/models/mod-bull-bar.glb`, 0 inverted faces (ray check), 0 images
- [x] 0 part-vs-part overlap in both fitted sets (rack + rack lights + bull bar + toolbox; solo lights + bull bar + toolbox)
- [x] Headless generator committed with paths from `__file__`
- [x] Owner approval (DEC-341)

## Decisions
- DEC-340 (bent tube, one welded crossbar), DEC-341 (plain, lean kept, lower bend fine).

## Links
Review sheets (git-invisible): `wip/feat-204-common/renders/r3-rack-lights-*.png`, `r3-solo-lights-*.png`.

## Files
`assets/models/mod-bull-bar.glb` · `assets/models/src/mod-bull-bar.py` · `assets/models/src/mod-bull-bar.blend` · `assets/models/src/mod_partlib.py`

## Log
- 2026-11-16: shipped on land/feat-204-models (round 3). Not wired into the game.
