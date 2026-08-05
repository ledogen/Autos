---
id: ASSET-01
type: asset
status: open
severity: minor
opened: 2026-08-03
updated: 2026-08-03
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
