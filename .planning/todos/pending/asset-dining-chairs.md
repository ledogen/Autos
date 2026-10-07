---
id: ASSET-59
type: asset
status: open
severity: minor
opened: 2026-10-06
relates: FEAT-97 (fragile — the job this rides in), FEAT-96 (the strapped-cargo layer), ASSET-60 (dining table — same set), cargo.md (master cargo list)
---

# ASSET-59: Four dining chairs

**Cargo** — visible load, real mass, never a scoring axis (items.md §4). It rides **strapped** to
the bed (FEAT-96's weld), so it never moves relative to the truck. The player looks at it in the
mirror for the whole job, so the silhouette has to say what it is from the chase camera.

## Request

Four wooden dining chairs, two stacked seat-to-seat on two, strapped. **One chair mesh, instanced ×4.** The cheap early fragile job: someone's old set.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤400** |
| Materials | flat colours per ART-STYLE.md, faceted; wood colour a recolour hook (worn vs nice set) |
| Real size | one chair ~0.45 × 0.5 m, ~0.9 m tall; the group ~1.0 × 1.0 m |
| Fits the bed | Ranger bed floor ≈ 1.8 m × 1.4 m; the footprint must sit inside it |
| Origin | base-seated, centred on the footprint |
| Forward | −Z |
| Collision | box (the group) · `mass_kg: 20–35` |

## Acceptance

- `assets/models/dining-chairs.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
- Reads as what it is from the chase camera with the truck moving.
