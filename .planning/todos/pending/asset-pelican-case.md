---
id: ASSET-39
type: asset
status: open
severity: minor
opened: 2026-10-06
relates: FEAT-97 (fragile — the job this rides in), FEAT-96 (the strapped-cargo layer)
---

# ASSET-39: Pelican case (fragile catch-all)

**Cargo** — visible load, real mass, never a scoring axis (items.md §4). It rides **strapped** to
the bed (FEAT-96's weld), so it never moves relative to the truck. The player looks at it in the
mirror for the whole job, so the silhouette has to say what it is from the chase camera.

## Request

A large hard-shell equipment case: ribbed black or safety-orange shell, latches, two handles, wheel pair at one end. The catch-all for fragile jobs whose contents are flavour text ("survey instruments", "lab glassware"). The tough end of the fragile range.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤200** |
| Materials | flat colours per ART-STYLE.md, faceted; clear materials per rule 7 if it has glass |
| Real size | ~1.0 × 0.45 × 0.55 m (a long equipment case) |
| Fits the bed | Ranger bed floor ≈ 1.8 m × 1.4 m; the footprint must sit inside it |
| Origin | base-seated, centred on the footprint |
| Forward | −Z |
| Collision | box · `mass_kg: 15–40 (per contents)` |

## Acceptance

- `assets/models/pelican-case.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
- Reads as what it is from the chase camera with the truck moving.
