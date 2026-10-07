---
id: ASSET-47
type: asset
status: open
severity: minor
opened: 2026-10-06
relates: FEAT-96 (freight — the job this rides in), ASSET-27 (pallet — reuse its base mesh)
---

# ASSET-47: Pallet of bagged goods — potting soil / concrete

**Cargo** — visible load, real mass, never a scoring axis (items.md §4). It rides **strapped** to
the bed (FEAT-96's weld), so it never moves relative to the truck. Freight is durable: its job is
the mass, which loads the rear springs, raises the centre of gravity and lengthens braking. The
player sees it in the mirror for the whole job, so the silhouette has to say what it is from the
chase camera.

## Request

Plastic bags of potting soil, about 18 kg each, cross-stacked in layers on the ASSET-27 pallet. The
bags are soft, rounded pillows modelled as faceted geometry rather than boxes, with a printed-band
colour and no texture. Use around five layers, roughly 20 bags.

**Second variant: concrete bags.** Use the same bag mesh in a grey recolour, as a shorter stack of
about 12 bags at 36 kg each, because concrete is denser.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤300** (pallet included) |
| Materials | flat colours per ART-STYLE.md, faceted; bag colour a recolour hook (potting soil / concrete) |
| Real size | 1.2 × 1.0 m pallet footprint, ~0.8 m tall overall |
| Fits the bed | Ranger bed floor ≈ 1.8 m × 1.4 m; the footprint must sit inside it |
| Origin | base-seated, centred on the footprint |
| Forward | −Z |
| Collision | box · `mass_kg: potting soil 300–400, concrete 350–450` |

## Acceptance

- `assets/models/potting-soil-pallet.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
- Reads as what it is from the chase camera with the truck moving.
