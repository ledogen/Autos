---
id: ASSET-75
type: asset
status: open
severity: minor
opened: 2026-10-09
relates: FEAT-96 (freight — the job this rides in), ASSET-50 (water carboys — what this replaces), cargo.md (master cargo list)
---

# ASSET-75: IBC tote (caged bulk water tank)

**Cargo** — visible load, real mass, never a scoring axis (items.md §4). Freight: it rides
**strapped** to the bed (FEAT-96's weld). The water is the mass.

## Provenance

Minted from the owner's review note on the 2026-10-09 overnight batch, scrapping the ASSET-50
carboys: *"I guess I don't know what a 'Carboy' is. I was referring to the large metal reinforced
plastic containers that hold 500 gallons."* That object is an **intermediate bulk container**
(IBC tote): a translucent white HDPE cube tank inside a galvanised steel tube cage on a pallet
base, with a screw cap on top and a valve at the bottom front. Standard sizes are 275 gal (1040 L)
and 330 gal (1250 L); nothing in the family is 500 gal, so model the 330.

## Request

One 330-gallon IBC tote, filled (a water line visible through the translucent tank a little
below the cap), strapped to the bed. The cage does the silhouette work: a lattice of horizontal
and vertical steel tubes around a bulging white cube, on a steel or plastic pallet base, with
the valve and cap as the only extra reads.

## Spec

| Field | Value |
|---|---|
| Tri budget | **~1500** (owner's floor from the 2026-10-09 review: ~1000 minimum for bed cargo; the cage lattice is where it goes) |
| Materials | flat colours per ART-STYLE.md, faceted; `ToteTank` translucent white, one clear material per rule 7 (alpha ~0.5, single-sided); `ToteCage` galvanised grey; `ToteBase` dark; `ToteCap` / `ToteValve` red or black |
| Real size | 1.2 × 1.0 m footprint, ~1.17 m tall (330 gal); tank bulges to the cage |
| Fits the bed | Ranger bed floor ≈ 1.8 m × 1.4 m; the footprint sits inside it with the valve facing −Z (tailgate) |
| Origin | base-seated, centred on the footprint |
| Forward | −Z (valve end) |
| Collision | box · `mass_kg: 1250 full` — **over the Ranger's payload**; the job is a *partly filled* tote, `mass_kg: 400–700`, and the water line should sit where that mass says it does |

## Acceptance

- `assets/models/ibc-tote.glb` exported clean; sources in `assets/models/src/`.
- Cage lattice is geometry, tank reads translucent with a water line, valve and cap present.
- Tri count ~1500; material names stable; straps double-sided and hugging the cage.
- Reads as what it is from the chase camera with the truck moving.
