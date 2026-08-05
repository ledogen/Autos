---
id: ASSET-04
type: asset
status: open
severity: minor
opened: 2026-08-03
updated: 2026-08-03
blocked-by: FEAT-59
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
