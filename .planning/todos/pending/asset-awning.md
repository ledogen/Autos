---
id: ASSET-06
type: asset
status: open
severity: minor
opened: 2026-08-03
updated: 2026-08-03
blocked-by: FEAT-59
relates: FEAT-06, FEAT-46, ASSET-04
---

# ASSET-06: Awning

**Lawn furniture** — a satellite prop, not a destination. It is placed *with* a POI model
(ASSET-09..20) inside a zone, so it inherits that POI's provenance: an awning and a fire pit beside a
log cabin read as *that cabin's*. Lawn furniture should not spawn on bare ground with nothing to
belong to; without an anchor it reads as litter, not habitation.

## Request

A free-standing camp awning — striped fabric canopy on four poles, slightly slack, guy lines
optional. The one asset in this set with real footprint: it defines a *space* rather than occupying
a point, so a pad with one on it reads as occupied from a long way off.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤450** |
| Texture | one albedo, **512×256** — fabric stripes; alternative is per-panel material slots if the stripes stay coarse |
| Real size | 3.0 m × 2.5 m footprint, 2.2 m eave / 2.5 m ridge |
| Origin | base-seated: pole feet at y=0, centred on the footprint |
| Forward | −Z (open front faces −Z) |
| Collision | poles only — `{ shape: 'boxes', dims: 4× [0.06, 2.2, 0.06] at footprint corners }`; the canopy is **not** collidable |
| Materials | canopy is **double-sided** (`DoubleSide`) — it is visible from underneath |

Sag the canopy in the mesh; do not plan on cloth simulation. No guy lines unless they cost <30 tris.

## Acceptance

- `assets/models/awning.glb` exists, export-clean under ASSETS.md settings, texture embedded.
- Sources committed: `assets/models/src/awning.blend` + `awning.py`.
- Canopy renders correctly from below (double-sided survives the export, or the registry entry
  states that the consumer must set it).
- Tri count within budget; material names stable.
- Loads and places in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- **Two open questions for whoever places it**, not for this ticket: (1) a 3 m canopy at 2.2 m is
  tall enough to matter to the truck — placement must keep it clear of drivable ground; (2) it is the
  first prop in the set whose shadow is a *shape* rather than a blob, so check it against the baked
  shadow path (PERF-21) before scattering any.
- Free-standing, **not** attached to a camper/trailer — no vehicle to attach it to exists.
