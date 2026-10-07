---
id: ASSET-64
type: asset
status: open
severity: minor
opened: 2026-10-06
relates: FEAT-97 (fragile — the job this rides in), FEAT-96 (the strapped-cargo layer), cargo.md (master cargo list)
---

# ASSET-64: Full-length mirror

**Cargo** — visible load, real mass, never a scoring axis (items.md §4). It rides **strapped** to
the bed (FEAT-96's weld), so it never moves relative to the truck. The player looks at it in the
mirror for the whole job, so the silhouette has to say what it is from the chase camera.

## Request

A tall mirror in a wooden frame standing on edge, wrapped in a moving blanket with the glass showing at one end. The glass is one reflective-looking flat material (rule 7).

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤200** |
| Materials | flat colours per ART-STYLE.md, faceted; glass per rule 7; blanket a flat colour |
| Real size | ~0.6 × 1.7 m, ~0.08 m thick |
| Fits the bed | Ranger bed floor ≈ 1.8 m × 1.4 m; the footprint must sit inside it |
| Origin | base-seated, centred on the footprint |
| Forward | −Z |
| Collision | box · `mass_kg: 15–30` |

## Acceptance

- `assets/models/full-length-mirror.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
- Reads as what it is from the chase camera with the truck moving.
