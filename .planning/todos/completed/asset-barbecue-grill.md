---
id: ASSET-04
type: asset
status: done
severity: minor
opened: 2026-08-03
updated: 2026-08-24
relates: FEAT-06, FEAT-46, SM-1
---

# ASSET-04: Barbecue grill

**Lawn furniture** — a satellite prop, not a destination. It is placed *with* a POI model
(ASSET-09..20) inside a zone, so it inherits that POI's provenance: an awning and a fire pit beside a
log cabin read as *that cabin's*. Lawn furniture should not spawn on bare ground with nothing to
belong to; without an anchor it reads as litter, not habitation.

## Request

A kettle-style charcoal barbecue on three legs, lid on. Camp and cabin dressing; the anchor object
of the camp-dressing cluster (ASSET-05 propane tank, ASSET-06 awning, ASSET-08 fire pit) that turns
a bare lay-by pad into somewhere a person stayed.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤600** |
| Texture | none preferred — black enamel body + chrome-ish grate + dark legs as material slots |
| Real size | ~0.55 m diameter × 0.95 m tall (lid closed, on legs) |
| Origin | base-seated: leg tips at y=0 |
| Forward | −Z (lid handle / vent faces −Z) |
| Collision | `{ shape: 'cylinder', radius: 0.28, height: 0.95 }` |

Lid closed, one piece — no openable lid, no interior. The grate is authored but need not be
separable. Legs as low-sided tubes, same as ASSET-01.

## Acceptance

- `assets/models/bbq-grill.glb` exists, export-clean under ASSETS.md settings.
- Sources committed: `assets/models/src/bbq-grill.blend` + `bbq-grill.py`.
- Tri count within budget; material names stable.
- Loads and places in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- **Not the day-job grill.** `.planning/story-mode/opening.md` calls the player's dead-end day job
  "the grill" — that is the **burger joint** the player is fired from, a story landmark with its own
  POI model under FEAT-60, not this object. Do not let the naming collide in code or in later story
  work.
- If a lit/smoking state is ever wanted, that is a particle emitter attached at placement time, not
  a mesh variant.

## Build complete (2026-08-23) — NOT closable yet, see "What is left"

`assets/models/bbq-grill.glb` — **566 tris** against the 600 budget, 0.629 x 1.066 x 0.629 m
(w x h x d), **4 materials, 0 textures, 0 UVs**, single-sided, opaque, no Draco. Sources at
`assets/models/src/bbq-grill.{blend,py}`. Registered as `bbqGrill` in `data/prop-models.js`.

**RESHAPED AGAINST A PHOTO REFERENCE (second pass, same day).** The first build was done from
memory and got three things wrong. Measured off the photo with the ball's 315 px width scaled to a
real 0.57 m: (1) the lid-plus-bowl mass is **0.825 as tall as it is wide** and the first pass was
0.70 — it read as a flying saucer; (2) the **bowl's widest point is 0.072 m BELOW the lid joint**,
not at it, and that undercut is what makes a kettle read as a ball rather than two bowls face to
face; (3) **handle and damper were swapped** — the bar handle owns the apex and the damper is a
small disc offset onto the shoulder. Rebuilt to 0.827 / undercut / correct layout. Overall height
is now **1.07 m**, over the ticket's 0.95 m estimate but matching the real 22" kettle (1.00 m to the
crown) and the reference.

**The ash catcher is two objects, not one** (owner: *"the ashtray is floating"*). The reference has
a small dark vent housing bolted under the bowl AND, separately, a wide bright pan slung down at leg
height on a wire frame. The first pass merged them into one pale cone hanging in space with nothing
holding it. The housing now sits against the bowl and the pan is tied to all three legs by short
radial struts, aimed by `leg_point()` rather than hand-placed — move a leg and its strut follows.

**WEBER KETTLE, not a generic one and not a Coleman.** The request opened as "a Coleman-style
charcoal grill with the vent lid" and the owner corrected it to Weber before modelling. That
correction is what fixes the silhouette: domed lid overlapping the bowl at a visible lip, round
damper with a protruding lever on the crown, bar handle on the front flank, three splayed legs with
the rear two on wheels, ash catcher slung underneath. Five cues, all silhouette, all readable at
20 m through fog.

**Recolourable body (owner call 2026-08-23), which the ticket did not ask for.** Bowl and lid share
ONE material, `GrillEnamel`, so they recolour in lockstep the way a real porcelain coat does. Trim,
legs, grate and damper are fixed. `test/model-palette.mjs` passes.

| # | Colour | Linear RGB |
|---|---|---|
| 0 | Black enamel — the authored colour, must match the `.glb` | `[0.014, 0.014, 0.015]` |
| 1 | Weber red | `[0.115, 0.0055, 0.007]` |
| 2 | Bottle green | `[0.006, 0.034, 0.016]` |

All three were picked **rendered, not from the numbers**, and both non-black entries needed a second
try — for related but distinct reasons, both worth keeping:

- The **red** opened at 0.30 linear and came out fire-engine orange. Straightforward ART-STYLE rule 5
  linear trap: a tuple renders roughly 1.5x lighter than it reads. 0.115 linear is about 0.37 sRGB.
- The **green** opened at 0.048 and came out a grassy mid-tone that was visibly *lighter* than the
  red beside it — despite the smaller number. That is the luminance weighting, not the gamma: green
  carries 0.715 of perceived luminance against red's 0.213, so equal-looking tuples are nowhere near
  equal-looking colours. Matching the red's weight needs G around 0.034, and a little blue pulls it
  from grass toward bottle. Landing on grass would also have risked the grill reading as vegetation,
  since the nature palette is grey-green.

All three now sit at roughly the same rendered value, so the variant changes the ball's hue and
nothing about the model's value structure.

**Materials (4, one over the ticket's implied three):** `GrillEnamel` (bowl + lid) / `GrillSteel`
(legs, damper, ash catcher) / `GrillGrate` / `GrillTrim` (handles, wheels, ash catcher). The grate
is split off `GrillSteel` on purpose — it is the one bright cool surface and sits in shadow under
the lid, so it wants its own value. Trim must NOT merge into enamel despite both being near-black:
enamel is recoloured and trim is not, and merging them would turn the handles and wheels red.

**Collision differs from the spec, deliberately.** The ticket authored
`{ shape: 'cylinder', radius: 0.28, height: 0.95 }`, which is the *bowl*. The legs splay to a 0.60 m
stance, so a 0.28 m cylinder leaves both wheels outside the collider. Registered as
`{ shape: 'box', size: [0.624, 0.902, 0.596] }` — the measured stance. `prop-models.js` also uses
`size`, not the ticket's `dims`.

**Audit (all four canonical views + numeric, re-run after the reshape):** 0/4000 inverted first-hit
rays, 0 degenerate faces, 0 loose verts, 0 near-coplanar face pairs within 1 mm. 12 non-manifold
edges, all of them the cooking grate's boundary — it is a single flat n-gon, authored per the
ticket, and invisible with the lid on.

Defects found and fixed across the two passes: a floating white ash catcher with a visible interior,
bowl handles that read as mail slots, an invisible lid lip, a damper lever that did not protrude
past its own cap, a handle that fused with the damper into one lump at the apex, and — caught only
by the numeric pass — the damper's lever sitting **exactly flush** with its own cap, two coplanar
faces at z 1.0111 that the viewport renders cleanly and engine lighting would have flickered. It is
lifted 4 mm now (`damper_tab_lift`).

## What is left before this closes

**Placement. Nothing else.** The asset is finished and the sources are committed; the acceptance
line *"loads and places in-world through the FEAT-59 model import service"* is the only one still
open, and it is not an asset problem.

`tags: ['lawnFurniture']` is declared on the registry entry, but **nothing reads that tag**.
`src/poi.js` resolves `modelPool` for the `missionGiver` roster only — "a place that hands out
work" — and a barbecue is not one. The POI-satellite scatter this asset exists to feed has now been
minted as **FEAT-71**, which is what this ticket is blocked on. Until it lands, the grill is
`spawnModel('bbqGrill', { variant: n })`-only.

This is the same standing gap that ASSET-01 (flamingos) and ASSET-02 (gnome) each recorded
separately in their own resolutions. FEAT-71 is where it gets discharged once, for all of them.
The `gasStation` tag on ASSET-14 is a *different* gap — that one wants a POI, not a satellite —
and is deliberately not folded in.

## Closed — 2026-08-24

Model shipped 2026-08-23 (`bbq-grill.glb`, 566 tris, four flat materials, recolourable
`GrillEnamel`) and committed. The `blocked-by: FEAT-71` that held this open is discharged by
the posture change below: FEAT-71 is minted, it is the named consumer for the `lawnFurniture`
tag this asset already carries, and it tracks the placement work for the whole class.

## Loadability — 2026-08-24 posture change

**This ticket is closed on the model.** Getting it into the world is **FEAT-71 (POI-satellite scatter for lawn furniture)**, not this ticket.

Standing posture (owner, 2026-08-24): *an asset ticket closes when the `.glb` ships.* The harness
that places it is a separate, consolidated ticket per asset class. Holding a row of finished models
open behind one missing consumer made the tracker read as unfinished work when the outstanding
action was a single system, named once.
