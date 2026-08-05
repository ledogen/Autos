---
id: ASSET-15
type: asset
status: open
severity: minor
opened: 2026-08-03
updated: 2026-08-03
blocked-by: FEAT-59
relates: FEAT-46, FEAT-21, ASSET-06
---

# ASSET-15: Farm produce market stall

**POI model** — a destination, not dressing. It anchors a zone (FEAT-46 lay-by pads / FEAT-21 POI
scatter) and gives lawn furniture (ASSET-01..08) something to belong to. A POI carries provenance:
whatever is scattered around it should read as *its* stuff.

## Request

A trestle table under a simple canopy, stacked crates of produce, a hand-painted roadside sign and an
honesty box. Small, warm, and unattended — the POI that most says *people live along this road* while
costing almost nothing to place.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤1200** |
| Texture | one albedo, **1024×1024**, with **alpha** for the produce silhouettes; hand-painted sign lettering lives here too |
| Real size | 3.0 m × 2.0 m footprint × 2.4 m tall |
| Origin | base-seated: table feet and canopy posts at y=0, centred on the footprint |
| Forward | −Z (open serving face and sign face −Z) |
| Collision | `{ shape: 'box', dims: [3.0, 1.0, 2.0] }` — the table mass only; the canopy overhead is not collidable |
| Materials | canopy is **double-sided** (visible from underneath), same as ASSET-06 |

Produce as alpha-tested cards in the crates, not modelled fruit. Crates themselves are geometry.

## Acceptance

- `assets/models/produce-stall.glb` exists, export-clean under `ASSETS.md` settings.
- Sources committed: `assets/models/src/produce-stall.blend` + `produce-stall.py`.
- Produce renders as **alpha-test** (`alphaTest`, `transparent: false`), not alpha-blend — same rule
  and the same reason as ASSET-07.
- Canopy renders correctly from below.
- Tri count within budget; material names stable.
- Loads and places in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- **Mixed opaque + alpha-test materials**, so it inherits ASSET-07's pipeline caveat: it differs from
  the shared opaque palette material that the shadow-bake scratch meshes and impostor bake assume
  (FEAT-59's deferred criteria). Keep it on the *placed* per-mesh path.
- The sign is the character of this asset. Give its material a stable, distinctive name so the
  lettering can be varied per-region later without a re-model.
- Any buying/selling *gameplay* is a story-mode ticket — `.planning/story-mode/items.md` has the
  cargo/catch vocabulary, and DESIGN.md's invariants govern. Not this ticket's business.
