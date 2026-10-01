---
id: ASSET-37
type: asset
status: open
severity: minor
opened: 2026-09-30
relates: FEAT-91 (firewood haul load), FEAT-88 (haul cargo body), ASSET-36 (the conveyor it drops from)
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
