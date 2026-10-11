---
id: ASSET-47
type: asset
status: done
severity: minor
opened: 2026-10-06
relates: FEAT-96 (freight — the job this rides in), ASSET-27 (pallet — reuse its base mesh)
updated: 2026-10-10
closed: 2026-10-10
---

# ASSET-47: Pallet of bagged goods — potting soil / concrete

## Resolution (2026-10-10) — shipped

Both variants: `potting-soil-pallet.glb` **1952** tris (yellow bags, the green end third a Miracle-Gro leaf green) and `concrete-pallet.glb` **2384** (grey bags, red logo stripe near one end). 18 rounded rectangular bags each, SIX a layer in three crossing layers so the stack is a 0.96 m square box (owner: a box, nothing sticking out, don't simulate flop). Materials SoilBag / ConcreteBag (recolour hooks), SoilPrint / ConcretePrint, PalletWood, Strap. Source `src/freight-3.py`.

Closes on the model (owner posture 2026-08-24: an asset ticket closes when the `.glb` ships). Promoted 2026-10-10 from the overnight review batch after the owner's per-row verdict on the review page; registered in `data/prop-models.js` (loadable through FEAT-59's model service). The ticket's tri budget was overruled by the owner 2026-10-09 (≈1000-tri floor for bed cargo — model the actual pieces; straps double-sided over the load's hull, running out to the bed tie-downs at x = ±0.70 so the load reads as strapped to the TRUCK, loads long-axis down −Z). Placing it in the bed is FEAT-96 (freight) / FEAT-97 (fragile) via `data/freight.js`, not this ticket.


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

> **As built (2026-10-10/11):** potting soil 18 bags × 18 kg + 20 kg pallet = **344 kg** (jobs roll
> 300–400). Concrete 18 × 80 lb bags (36 kg) + 20 kg pallet = **670 kg**, fixed — a deliberate
> overload that rolls (owner, 2026-10-10; cargo.md).

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤300** (pallet included) |
| Materials | flat colours per ART-STYLE.md, faceted; bag colour a recolour hook (potting soil / concrete) |
| Real size | 1.2 × 1.0 m pallet footprint, ~0.8 m tall overall |
| Fits the bed | Ranger bed floor ≈ 1.8 m × 1.4 m; the footprint must sit inside it |
| Origin | base-seated, centred on the footprint |
| Forward | −Z |
| Collision | box · `mass_kg: potting soil 300–400, concrete 350–450` — **as built 344 / 670** (see above) |

## Acceptance

- `assets/models/potting-soil-pallet.glb` exported clean; sources in `assets/models/src/`.
- Tri count within budget; material names stable.
- Reads as what it is from the chase camera with the truck moving.
