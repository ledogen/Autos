---
id: ASSET-46
type: asset
status: open
severity: minor
opened: 2026-10-06
relates: FEAT-96 (freight — the job this rides in), ASSET-27 (pallet — reuse its base mesh)
---

# ASSET-46: Pallet of soft drinks

**Cargo** — visible load, real mass, never a scoring axis (items.md §4). It rides **strapped** to
the bed (FEAT-96's weld), so it never moves relative to the truck. Freight is durable: its job is
the mass, which loads the rear springs, raises the centre of gravity and lengthens braking. The
player sees it in the mirror for the whole job, so the silhouette has to say what it is from the
chase camera.

## Request

A pallet of shrink-wrapped soda cases, stacked about waist high. Bright case colours show through the
wrap (saturated man-made, ART-STYLE), and the wrap is one clear material (rule 7). Sits on the
ASSET-27 pallet. A full pallet is about a tonne, which is over the Ranger's payload, so build a
**short stack**.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤300** (pallet included) |
| Materials | flat colours per ART-STYLE.md, faceted; clear wrap per rule 7; case colours a recolour hook |
| Real size | 1.2 × 1.0 m pallet footprint, ~0.9 m tall overall |
| Fits the bed | Ranger bed floor ≈ 1.8 m × 1.4 m; the footprint must sit inside it |
| Origin | base-seated, centred on the footprint |
| Forward | −Z |
| Collision | box · `mass_kg: 350–450` |

## Acceptance

- `assets/models/soft-drink-pallet.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
- Reads as what it is from the chase camera with the truck moving.
