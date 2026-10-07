---
id: ASSET-54
type: asset
status: open
severity: minor
opened: 2026-10-06
relates: FEAT-96 (freight — the job this rides in), ASSET-38 (lumber bundle — same wood palette), cargo.md (master cargo list)
---

# ASSET-54: Sheets of plywood

**Cargo** — visible load, real mass, never a scoring axis (items.md §4). It rides **strapped** to
the bed (FEAT-96's weld), so it never moves relative to the truck. Freight is durable: its job is
the mass, which loads the rear springs, raises the centre of gravity and lengthens braking. The
player sees it in the mirror for the whole job, so the silhouette has to say what it is from the
chase camera.

## Request

A stack of 4 × 8 ft plywood sheets lying flat, pale wood faces with darker layered edges as geometry, strapped.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤200** |
| Materials | flat colours per ART-STYLE.md, faceted |
| Real size | 2.44 × 1.22 m sheets, stack ~0.25 m tall (about 12 sheets) |
| Fits the bed | longer than the 1.8 m bed floor: it rides on the **lowered tailgate**, ≤ 1.4 m wide (the 1.22 m width fits between the wheel tubs only if it rides above them) |
| Origin | base-seated, centred on the footprint |
| Forward | −Z |
| Collision | box · `mass_kg: 220–350` |

## Acceptance

- `assets/models/plywood-sheets.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
- Reads as what it is from the chase camera with the truck moving.
