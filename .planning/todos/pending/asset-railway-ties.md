---
id: ASSET-52
type: asset
status: open
severity: minor
opened: 2026-10-06
relates: FEAT-96 (freight — the job this rides in), cargo.md (master cargo list)
---

# ASSET-52: Railway ties

**Cargo** — visible load, real mass, never a scoring axis (items.md §4). It rides **strapped** to
the bed (FEAT-96's weld), so it never moves relative to the truck. Freight is durable: its job is
the mass, which loads the rear springs, raises the centre of gravity and lengthens braking. The
player sees it in the mirror for the whole job, so the silhouette has to say what it is from the
chase camera.

## Request

Four or five creosoted railway ties (sleepers) stacked flat, dark brown-black, faceted ends, strapped. Real ties are 2.6 m long.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤300** |
| Materials | flat colours per ART-STYLE.md, faceted |
| Real size | 2.6 × 0.9 m footprint (ties 2.6 × 0.23 × 0.18 m), ~0.4 m tall |
| Fits the bed | longer than the 1.8 m bed floor: it rides on the **lowered tailgate**, ≤ 1.4 m wide |
| Origin | base-seated, centred on the footprint |
| Forward | −Z |
| Collision | box · `mass_kg: 300–450` |

## Acceptance

- `assets/models/railway-ties.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
- Reads as what it is from the chase camera with the truck moving.
