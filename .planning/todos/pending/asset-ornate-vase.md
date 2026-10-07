---
id: ASSET-41
type: asset
status: open
severity: minor
opened: 2026-10-06
relates: FEAT-97 (fragile — the job this rides in), FEAT-96 (the strapped-cargo layer)
---

# ASSET-41: Ornate vase

**Cargo** — visible load, real mass, never a scoring axis (items.md §4). It rides **strapped** to
the bed (FEAT-96's weld), so it never moves relative to the truck. The player looks at it in the
mirror for the whole job, so the silhouette has to say what it is from the chase camera.

## Request

A tall ornate vase in saturated glaze, strapped upright to a small pallet or base so it reads as secured. Grandma's vase. As fragile as the glass.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤250** |
| Materials | flat colours per ART-STYLE.md, faceted; clear materials per rule 7 if it has glass |
| Real size | ~0.35 m diameter × 0.7 m tall |
| Fits the bed | Ranger bed floor ≈ 1.8 m × 1.4 m; the footprint must sit inside it |
| Origin | base-seated, centred on the footprint |
| Forward | −Z |
| Collision | hull-from-mesh · `mass_kg: 3–8` |

## Acceptance

- `assets/models/ornate-vase.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
- Reads as what it is from the chase camera with the truck moving.
