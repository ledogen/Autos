---
id: ASSET-01
type: asset
status: done
severity: minor
opened: 2026-08-03
updated: 2026-08-18
closed: 2026-08-18
blocked-by: FEAT-59
relates: FEAT-06, FEAT-46
---

# ASSET-01: Pink lawn flamingo

**Lawn furniture** — a satellite prop, not a destination. It is placed *with* a POI model
(ASSET-09..20) inside a zone, so it inherits that POI's provenance: an awning and a fire pit beside a
log cabin read as *that cabin's*. Lawn furniture should not spawn on bare ground with nothing to
belong to; without an anchor it reads as litter, not habitation.

## Request

A plastic pink lawn flamingo on a pair of wire legs. Roadside/camp set dressing — the cheapest
possible signal that a human decorated a place. Belongs at lay-by pads and POIs (FEAT-46), in ones
and twos, occasionally in an absurd flock.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤400** |
| Texture | none preferred — flat Principled BSDF, pink body + black beak tip + grey legs as separate material slots |
| Real size | ~0.28 m wide × 0.85 m tall (incl. legs) |
| Origin | base-seated: leg tips at y=0 after export |
| Forward | −Z (bird faces −Z) |
| Collision | `{ shape: 'box', dims: [0.28, 0.85, 0.45] }` — knockable, not a wall |

Legs are the tri sink. Author them as 4–6-sided tubes, not cylinders, and do **not** model the
ground spike below the base.

## Acceptance

- `assets/models/flamingo.glb` exists, export-clean under `.planning/research/ASSETS.md` settings
  (glTF Binary, Draco off, +Y up, modifiers applied, transforms applied).
- Sources committed: `assets/models/src/flamingo.blend` + `flamingo.py` (parametric generator).
- Tri count within budget; material names stable and distinctive (not `Material.001`).
- Loads and places in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- Colour is the whole joke; keep the pink saturated enough to read at 40 m against green.
- A flock variant is a *placement* concern, not a second model.

## Resolution (2026-08-18)

Shipped as **two poses**, not one model — the owner asked for the reference photo's
pair. `-a`/`-b` suffix follows `trailer-home-a`.

| File | Pose | Tris | W x H x L (m) |
|---|---|---|---|
| `assets/models/flamingo-a.glb` | head up, alert | **358** / 400 | 0.160 x 0.868 x 0.494 |
| `assets/models/flamingo-b.glb` | head down, grazing | **344** / 400 | 0.160 x 0.587 x 0.725 |

Sources: `assets/models/src/flamingo.blend` + `flamingo.py` (one generator, both poses;
only the neck/beak spine tables differ). Registered as `flamingoUp` / `flamingoDown` in
`data/prop-models.js`.

**Deviations from the spec above, deliberate:**

- **Beak is yellow with a black tip**, not a black tip on an unstated body colour — the
  owner's call, and it matches the reference photo. Eyes are black tetrahedra, a fifth
  material folded into `FlamingoDark` alongside the beak tip (4 materials total:
  `FlamingoBody` `FlamingoBeak` `FlamingoDark` `FlamingoLeg`; only `FlamingoBody` is
  meant to be recoloured).
- **Width is 0.160 m, not 0.28.** A real lawn flamingo is a thin two-piece moulding; 0.28
  would have read as a goose. Collision boxes in the registry are measured off the GLBs,
  per-pose, and use `size` (not the `dims` this ticket wrote — `dims` silently falls back
  to a 1.6 m cube).
- **Height 0.868 m** for the up pose vs the spec's ~0.85 — within tolerance, and the
  reference's leg:neck ratio would not survive shortening it.

Audit: four views + numeric pass, each model **in isolation** — clipping clean, coplanar
clean, non-manifold/loose-vert clean, 0 inverted-face ray hits, base seated at exactly
y = 0. (The side-by-side source scene reports 24 coplanar pairs *between* the two birds;
that is an artefact of two identical bodies offset only in X, not a defect — each exports
alone.)

**Still needed before they appear in-world:** there is no lawn-furniture scatter system.
`data/prop-models.js` has exactly one pool tag, `missionGiver`, and a flamingo is not a
place that hands out work — so both entries ship untagged and are `spawnModel()`-only. A
POI-satellite scatter pass (the ticket's "placed *with* a POI") is separate work.

### Fix, 2026-08-19 — grazing bill was misaligned (owner spotted it)

`NECK_B`'s last three stations curled BACKWARD (y 0.428 -> 0.362), so the skull tapered
rearward while `BEAK_B` shot forward: a **112.5 deg kink** that bolted the bill onto the
underside of the head with a visible shelf. Pose A's equivalent joint is +17.3 deg.

Rebuilt the descent so it is still heading down-forward at the beak root — joint now
**+16.6 deg**, matching pose A. The head was also widened (0.030 -> 0.034 half-width)
because the neck runs dead straight through it in this pose, and without extra bulge
there is no bend to read a skull against and it goes snake-like.

Cost: pose B grew from 0.665 m to **0.725 m** long. Registry collision box updated to
match; tris unchanged at 344.

The joint angle is now checked as arithmetic, not by eye — a kink that large was invisible
in a whole-body screenshot and only showed under a close crop.

## Loadability — 2026-08-24 posture change

**This ticket is closed on the model.** Getting it into the world is **FEAT-71 (POI-satellite scatter for lawn furniture)**, not this ticket.

Standing posture (owner, 2026-08-24): *an asset ticket closes when the `.glb` ships.* The harness
that places it is a separate, consolidated ticket per asset class. Holding a row of finished models
open behind one missing consumer made the tracker read as unfinished work when the outstanding
action was a single system, named once.
