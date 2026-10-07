---
id: ASSET-57
type: asset
status: open
severity: minor
opened: 2026-10-06
relates: FEAT-96 (freight — the job this rides in), cargo.md (master cargo list)
---

# ASSET-57: Job box (jobsite tool chest)

**Cargo** — visible load, real mass, never a scoring axis (items.md §4). It rides **strapped** to
the bed (FEAT-96's weld), so it never moves relative to the truck. Freight is durable: its job is
the mass, which loads the rear springs, raises the centre of gravity and lengthens braking. The
player sees it in the mirror for the whole job, so the silhouette has to say what it is from the
chase camera.

## Request

A steel jobsite box: a long, low, lockable chest on skids, lid with gas struts, painted a saturated brand-neutral colour. The valuable end of freight.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤300** |
| Materials | flat colours per ART-STYLE.md, faceted; paint a recolour hook |
| Real size | ~1.2 × 0.6 m footprint, ~0.7 m tall |
| Fits the bed | Ranger bed floor ≈ 1.8 m × 1.4 m; the footprint must sit inside it |
| Origin | base-seated, centred on the footprint |
| Forward | −Z |
| Collision | box · `mass_kg: 150–250` |

## Acceptance

- `assets/models/job-box.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
- Reads as what it is from the chase camera with the truck moving.
