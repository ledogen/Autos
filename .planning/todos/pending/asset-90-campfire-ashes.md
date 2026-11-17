---
id: ASSET-90
type: asset
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 (inbox 20261117103006-j5xw) — "Let's also remake a campfire model that doesn't have the three logs, just ashes at the bottom."
relates: FEAT-264, DEC-393, ASSET-24, assets/models/campfire.glb, src/campfire.js
---
lane: C

# ASSET-90: The dead campfire — ashes only, no logs

**Camp gear** — the burnt-out state of the ASSET-24 fire pit (`campfire.glb`), shown after a long sleep at a camp (FEAT-264).

The same stone ring and ash bed as `campfire.glb`, with the three logs and the charred coal spiral gone: a flat grey ash heap inside the stones, a few paler fragments and one or two charred stubs no taller than the ring. Cold: nothing in it glows.

## Spec

| Field | Value |
|---|---|
| Tri budget | at most the live model's own count (read it from `campfire.glb`); the floor of ~1000 tris is for POI buildings, this prop is smaller and may sit under it |
| Materials | flat colours per ART-STYLE.md, no textures, faceted: reuse `FireAsh` and `FireStone` by name (substring-matched), no `FireLog`, no `FireCoal` |
| Real size | the same footprint as `campfire.glb` (stone ring unchanged, camp-gear's 6 m pad nest keeps holding); ash heap below the ring's top |
| Origin | base-seated at ground level, centred on the ring, same as `campfire.glb` |
| Forward | −Z, rotationally symmetric like ASSET-24 (yaw-randomised on placement); keep the empty `FireFlameAnchor` node so the loader treats both alike |
| Collision | none (soft), as ASSET-24 |

Conventions: `.planning/research/ASSETS.md` (glTF 2.0 binary at `assets/models/campfire-dead.glb`, no Draco/KTX2, textures none) and `.planning/research/ART-STYLE.md`. Headless generator in its own checkout beside the other `assets/models/src/*.py`.

## Acceptance
- [ ] `.glb` at `assets/models/campfire-dead.glb`, flat-shaded, within the tri budget.
- [ ] Same footprint and origin as `campfire.glb`; `camp-gear.mjs` stays green with it.
- [ ] `src/campfire.js` swaps it in on `setDead(true)` (model registry entry; hides the live model).
- [ ] Review render beside the live model.
- [ ] The owner's look.
