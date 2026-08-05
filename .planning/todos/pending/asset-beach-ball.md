---
id: ASSET-03
type: asset
status: open
severity: minor
opened: 2026-08-03
updated: 2026-08-03
blocked-by: FEAT-59
relates: FEAT-06, FEAT-36
---

# ASSET-03: Beach ball

**Lawn furniture** — a satellite prop, not a destination. It is placed *with* a POI model
(ASSET-09..20) inside a zone, so it inherits that POI's provenance: an awning and a fire pit beside a
log cabin read as *that cabin's*. Lawn furniture should not spawn on bare ground with nothing to
belong to; without an anchor it reads as litter, not habitation.

## Request

A classic segmented beach ball. Camp/lakeside dressing, and the most obvious first candidate for
dynamic prop physics — a light sphere the truck can punt across a pad is the cheapest possible
demonstration that props are no longer scenery.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤320** (low-subdiv icosphere; silhouette matters more than shading) |
| Texture | one albedo, **256×256** — coloured panels, or vertical-stripe UV; alternative is per-panel material slots if that stays under the palette's slot budget |
| Real size | 0.40 m diameter |
| Origin | **centre**, not base-seated — it is a sphere and will be simulated |
| Forward | n/a (rotationally symmetric; no yaw convention) |
| Collision | `{ shape: 'sphere', radius: 0.20, mass_kg: 0.15, restitution: 0.75 }` |

## Acceptance

- `assets/models/beach-ball.glb` exists, export-clean under ASSETS.md settings, texture embedded.
- Sources committed: `assets/models/src/beach-ball.blend` + `beach-ball.py`.
- Origin is the sphere centre (documented in the registry entry — it deviates from the base-seated
  default and will bite whoever places it otherwise).
- Tri count within budget; material names stable.
- Loads and places in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- Collision metadata carries `mass_kg`/`restitution` beyond FEAT-59's shape+dims minimum. Those
  fields are **inert until dynamic prop physics exists** (FEAT-36, itself blocked on the FEAT-48
  physics-adapter seam) — carried
  now so nothing is re-plumbed later, per FEAT-59's rule.
- Until then it is a static prop like the rest of this set; that is not a failure of this ticket.
