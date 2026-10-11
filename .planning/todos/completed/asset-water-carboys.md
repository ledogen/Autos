---
id: ASSET-50
type: asset
status: cancelled
severity: minor
opened: 2026-10-06
closed: 2026-10-10
resolution: "CANCELLED — killed by the owner 2026-10-10. The model was built (freight-2 batch) but never
  promoted; its builder was removed from assets/models/src/freight-2.py and its cargo.md row deleted. The bulk-water freight slot goes to ASSET-75 (IBC tote)."
relates: FEAT-96 (freight — the job this rides in), cargo.md (master cargo list)
---

# ASSET-50: Water carboys

**Cargo** — visible load, real mass, never a scoring axis (items.md §4). It rides **strapped** to
the bed (FEAT-96's weld), so it never moves relative to the truck. Freight is durable: its job is
the mass, which loads the rear springs, raises the centre of gravity and lengthens braking. The
player sees it in the mirror for the whole job, so the silhouette has to say what it is from the
chase camera.

## Request

Four 5-gallon (19 L) water carboys in a plastic carrier crate, blue-tinted clear plastic with a cap. The water is the mass.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤300** |
| Materials | flat colours per ART-STYLE.md, faceted; tinted clear plastic per rule 7 |
| Real size | ~0.6 × 0.6 m footprint, ~0.55 m tall |
| Fits the bed | Ranger bed floor ≈ 1.8 m × 1.4 m; the footprint must sit inside it |
| Origin | base-seated, centred on the footprint |
| Forward | −Z |
| Collision | box · `mass_kg: 80–90` |

## Acceptance

- `assets/models/water-carboys.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
- Reads as what it is from the chase camera with the truck moving.
