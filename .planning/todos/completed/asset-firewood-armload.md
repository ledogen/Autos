---
id: ASSET-37
type: asset
status: completed
severity: minor
opened: 2026-09-30
relates: FEAT-91 (firewood haul load), FEAT-88 (haul cargo body), ASSET-36 (the conveyor it drops from)
closed: 2026-10-06
---

# ASSET-37: Firewood armload (cargo)

**Cargo** — visible load, real mass, never a scoring axis (items.md §4). The piece the firewood haul
is made of.

## Request

A loose armload of **four to six split logs** fused into one piece — the unit a person would carry,
not a tidy bundle. Split faces pale, bark dark, ends showing. Loose enough that a bedful of them reads
as a heap of firewood, not as a stack of crates.

**Why an armload and not a single split:** a real split is ~3–4 kg, so a ~250 kg load would be ~70
rigid bodies piled in a moving bed — too many to simulate. One armload ≈ 20 kg ≈ one body, and ~8
of them make the ~150 kg load (FEAT-91 load table).

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤250** |
| Materials | flat colours per ART-STYLE.md, faceted — split face, bark, end grain (desaturated: it's nature) |
| Real size | ~0.45 m long × ~0.35 × 0.25 m |
| Origin | bbox centre (debris.js hulls the mesh and centres it) |
| Forward | −Z along the log length |
| Collision | hull-from-mesh; **the silhouette must be convex-friendly** — the hull is the convex hull of the whole armload, so a splayed shape becomes a fat blob. Keep it compact. `mass_kg: ~20` |

## Acceptance

- `assets/models/firewood-armload.glb` exported clean; sources in `assets/models/src/`.
- Two or three variants (different split arrangements) welcome if they stay within budget each —
  a bed of identical armloads reads as copy-paste.
- Tri count within budget; material names stable.

## Resolution (2026-10-06) — SUPERSEDED by the shrink-wrapped bundle, which shipped

The owner replaced the loose armload with a **shrink-wrapped firewood bundle** on 2026-10-04, the
thing a roadside vendor actually sells. It ships with the ASSET-36 kit (f037556, merged 305a3cf):

| File | Tris | Collision size (m) |
|---|---|---|
| `firewood-bundle-a.glb` | 100 | 0.32 × 0.31 × 0.42 |
| `firewood-bundle-b.glb` | 102 | 0.29 × 0.33 × 0.43 |
| `firewood-bundle-c.glb` | 86 | 0.27 × 0.30 × 0.39 |

- Each bundle is 6–9 separately modelled splits, packed loose and settled into contact, 4 materials,
  zero images. Budget was 250 per piece.
- **Mass 11 kg** (`src/debris.js` `bundleA..C`), not ~20 kg. A haul is 10–15 bundles (FEAT-88).
- Collision is hull-from-mesh. **Box3D caps a hull at 255 half-edges**, so the generator re-packs
  from the next seed when the hull exceeds 42 vertices. This applies to any hull-from-mesh cargo.
- `BundleWrap` (clear film, BLEND alpha 0.14, single-sided, middle half of the length only) is the
  only alpha material.
- Sources live in the ASSET-36 generator, `assets/models/src/splitting-yard.py`.
