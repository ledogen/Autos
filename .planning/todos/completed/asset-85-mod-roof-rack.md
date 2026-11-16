---
id: ASSET-85
type: asset
status: done
severity: minor
opened: 2026-11-16
closed: 2026-11-16
source: owner, 2026-11-16 — approved the FEAT-204 set with the round-3 changes (DEC-341)
relates: FEAT-204, DEC-340, DEC-341, assets/models/mod-roof-rack.glb
---
lane: A

# ASSET-85: The roof rack: a steel utility basket on the cab roof

**Vehicle visual mod** (FEAT-204): a bolt-on part shown on the hero Ranger when fitted.

## Next steps
None here: the `.glb` shipped. Wiring it into the game is FEAT-204's (a separate agent).

## Summary
A low tubular steel basket, 1.15 x 0.56 m over its tubes, centred on the Ranger's cab roof panel (1.32 x 0.58 m): two loops, a forward-leaning wind fairing, 11 floor bars, four clamp feet whose straps hook over the roof edge into the door gap. Its upper loop's front run is where `mod-light-bar-rack`'s pod brackets weld on.

## Description
| Field | Value |
|---|---|
| File | `assets/models/mod-roof-rack.glb` (glTF binary, no Draco/KTX2, no textures, flat-shaded) |
| Triangles | **1588** (evaluated) |
| Real size | 1.416 x 0.555 x 0.298 m (W x L x H, clamp straps included; basket 1.15 x 0.56 m, floor z 1.700, rail top z 1.828) |
| Origin + forward | `ranger.glb`'s own origin and frame: forward −Z, +Y up, ground plane y = 0. Not centred on itself. |
| Materials | `RackSteel` (black tube), `RackClamp` (roof clamp straps + foot bolts; black since DEC-341, name kept), `RackRubber` (foot pads). None recolourable. |
| Mount points | feet at glTF (±0.620, 1.601, +0.330) and (±0.620, 1.601, −0.040), on the roof deck |
| Collision | none: a visual on the truck body, whose collider is unchanged |
| Generator | `assets/models/src/mod-roof-rack.py` (+ `.blend`; shares `assets/models/src/mod_partlib.py`) |

**Mount (the wiring agent reads this).** Built in `ranger.glb`'s frame: add the loaded scene as a CHILD of the loaded ranger body with **no offset** (identity transform), and do it **after** the ranger loads, because the loader hides small root children (ASSETS.md § Conventions the vehicle loader depends on).

## Tracker
- [x] `.glb` at `assets/models/mod-roof-rack.glb`, 0 inverted faces (ray check), 0 images
- [x] 0 part-vs-part overlap in both fitted sets (rack + rack lights + bull bar + toolbox; solo lights + bull bar + toolbox)
- [x] Headless generator committed with paths from `__file__`
- [x] Owner approval (DEC-341)

## Decisions
- DEC-340 (fit the cab roof footprint), DEC-341 (roof clamp hardware black).

## Links
Review sheets (git-invisible): `wip/feat-204-common/renders/r3-rack-lights-*.png`, `r3-solo-lights-*.png`.

## Files
`assets/models/mod-roof-rack.glb` · `assets/models/src/mod-roof-rack.py` · `assets/models/src/mod-roof-rack.blend` · `assets/models/src/mod_partlib.py`

## Log
- 2026-11-16: shipped on land/feat-204-models (round 3). Not wired into the game.
