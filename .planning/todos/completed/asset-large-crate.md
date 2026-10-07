---
id: ASSET-68
type: asset
status: done
severity: minor
opened: 2026-10-07
updated: 2026-10-07
relates: ASSET-28, ASSET-27, FEAT-96, FEAT-97
---

# ASSET-68: Large crate

**Cargo** — the big sibling of the ASSET-28 small crate: one per pallet instead of four. Plain and
FRAGILE variants, same as the small one.

## Spec (as built)

| Field | Value |
|---|---|
| Tri budget | ≤350 (built 300) |
| Texture | plain: none · fragile: one 512×512, stencil only |
| Real size | **0.81 m cube** — the small crate's 0.45 × 1.8, made a cube (owner 2026-10-07) |
| Origin | base-seated and centred |
| Forward | −Z (stencilled faces ±Z) |
| Collision | `{ shape: 'box', dims: [0.81, 0.81, 0.81], mass_kg: 45 }` (mass a placeholder) |

One per 1.20 × 1.00 pallet with 195 / 95 mm margin. Four slat bands and four lid boards (the small
crate has three) so the boards stay plank-sized.

## Resolution (2026-10-07)

`assets/models/large-crate.glb` + `large-crate-fragile.glb`, built by the shared
`assets/models/src/crate.py` (the `LARGE` size spec), registered as `largeCrate` /
`largeCrateFragile` in `data/prop-models.js`. Stacks flush, normals clean.
