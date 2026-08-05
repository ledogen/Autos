---
id: ASSET-07
type: asset
status: open
severity: minor
opened: 2026-08-03
updated: 2026-08-03
blocked-by: FEAT-59
relates: FEAT-06, FEAT-46
---

# ASSET-07: Potted plant

**Lawn furniture** — a satellite prop, not a destination. It is placed *with* a POI model
(ASSET-09..20) inside a zone, so it inherits that POI's provenance: an awning and a fire pit beside a
log cabin read as *that cabin's*. Lawn furniture should not spawn on bare ground with nothing to
belong to; without an anchor it reads as litter, not habitation.

## Request

A terracotta pot with a leafy plant in it. Doorstep and porch dressing for cabins and POIs
(FEAT-46) — the small domestic detail that the flamingo and gnome are the loud version of.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤500** (pot ~120, foliage the rest) |
| Texture | one albedo + **alpha** for the leaf cards, **512×512** |
| Real size | 0.30 m pot diameter, ~0.65 m overall height |
| Origin | base-seated: pot base at y=0 |
| Forward | −Z (nominal; the plant is near-symmetric) |
| Collision | `{ shape: 'cylinder', radius: 0.15, height: 0.30 }` — **the pot only**, foliage is not collidable |

Foliage as a handful of crossed alpha-tested cards, not modelled leaves.

## Acceptance

- `assets/models/potted-plant.glb` exists, export-clean under ASSETS.md settings, texture embedded.
- Sources committed: `assets/models/src/potted-plant.blend` + `potted-plant.py`.
- Foliage renders as **alpha-test** (`alphaTest`, `transparent: false`) — not alpha-blend. Blended
  foliage sorts wrong against itself and against the existing vegetation.
- Tri count within budget; material names stable.
- Loads and places in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- **This is the asset most likely to fight the prop pipeline.** The alpha-tested material differs
  from the shared opaque palette material, which the shadow-bake scratch meshes and the impostor bake
  both assume (FEAT-59's deferred criteria call this out). Keep it on the *placed* per-mesh path;
  do not scatter it at density until that is resolved.
- Leaf silhouette does all the work at distance — spend the alpha budget on the outline, not detail.
