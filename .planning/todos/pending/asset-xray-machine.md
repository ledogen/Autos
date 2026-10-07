---
id: ASSET-45
type: asset
status: open
severity: minor
opened: 2026-10-06
relates: FEAT-97 (fragile — the job this rides in), FEAT-96 (the strapped-cargo layer)
---

# ASSET-45: Security x-ray machine

**Cargo** — visible load, real mass, never a scoring axis (items.md §4). It rides **strapped** to
the bed (FEAT-96's weld), so it never moves relative to the truck. The player looks at it in the
mirror for the whole job, so the silhouette has to say what it is from the chase camera.

## Request

An airport-style baggage x-ray scanner: boxy beige-grey housing, lead-curtained tunnel, short conveyor stubs, a console. Heavy and delicate.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤500** |
| Materials | flat colours per ART-STYLE.md, faceted; clear materials per rule 7 if it has glass |
| Real size | ~1.6 × 0.8 m footprint, ~1.3 m tall, conveyor stub at each end |
| Fits the bed | Ranger bed floor ≈ 1.8 m × 1.4 m; the footprint must sit inside it |
| Origin | base-seated, centred on the footprint |
| Forward | −Z |
| Collision | box · `mass_kg: 300–400` |

## Acceptance

- `assets/models/xray-machine.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
- Reads as what it is from the chase camera with the truck moving.
