---
id: ASSET-12
type: asset
status: open
severity: minor
opened: 2026-08-03
updated: 2026-08-03
blocked-by: FEAT-59
relates: FEAT-46, FEAT-32, ASSET-11
---

# ASSET-12: Lumber yard

**POI model** — a destination, not dressing. It anchors a zone (FEAT-46 lay-by pads / FEAT-21 POI
scatter) and gives lawn furniture (ASSET-01..08) something to belong to. A POI carries provenance:
whatever is scattered around it should read as *its* stuff.

## Request

Stacked and banded dimensional lumber, timber racks, an offcut pile. Reads as industry without a
building — good beside a sawmill, and good alone as evidence that a road exists for a reason.

## Spec

**Ships as a small kit, not one mesh** — a yard is *composed* at placement (rotated, repeated,
scattered at varying density), so a single monolithic model would be a fixed diorama. Three pieces:

| Piece | Tris | Real size | Origin | Collision |
|---|---|---|---|---|
| `lumber-stack` | ≤450 | 4.0 × 1.2 × 1.0 m | base-seated, centred | box, full dims |
| `timber-rack` | ≤600 | 5.0 × 1.5 × 2.5 m | base-seated, centred | box, full dims |
| `offcut-pile` | ≤350 | 2.0 × 2.0 × 0.6 m | base-seated, centred | box, full dims |

| Field | Value |
|---|---|
| Texture | **one shared 1024×1024 albedo across all three pieces** — sawn-end grain, board faces, banding straps |
| Forward | −Z (board run along Z) |

Board ends do all the work; the sawn-end grain is what makes a stack read as lumber rather than as a
grey box. Do not model individual boards — the stack is a box with a good texture and a notched
silhouette.

## Acceptance

- `assets/models/lumber-stack.glb`, `timber-rack.glb`, `offcut-pile.glb` exist, all export-clean
  under `ASSETS.md` settings.
- Sources committed: one `assets/models/src/lumber-yard.blend` + `lumber-yard.py` generating all
  three (they share a texture, so they share a source).
- All three reference the same embedded albedo — confirm the texture is not duplicated into each
  `.glb` at full size, or accept the cost explicitly and note it.
- Tri counts within budget; material names stable.
- All three load and place in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- **Three `.glb` files, one ticket.** That is a deliberate exception to the class's one-asset-per-
  ticket rule: the pieces are meaningless apart and share a texture and a generator. If the kit grows
  past three, split it.
- The one asset in the set that genuinely wants *density scatter* rather than placement — which is
  FEAT-59's deferred palette/instancing criteria, not its core path. Until that lands, place a
  handful per yard by hand.
- Pairs with ASSET-11 (sawmill).
