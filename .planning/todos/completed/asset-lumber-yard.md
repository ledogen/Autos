---
id: ASSET-12
type: asset
status: done
severity: minor
opened: 2026-08-03
relates: FEAT-46, FEAT-32, ASSET-11, FEAT-91
updated: 2026-10-10
closed: 2026-10-10
---

# ASSET-12: Lumber yard

## Resolution (2026-10-10) — shipped

Three pieces shipped: `lumber-stack.glb` **792** tris (1.30 × 0.68 × 4.05 m, 60 boards in two stickered units, no banding — a loose yard stack, owner 2026-10-09), `timber-rack.glb` **552** (5.19 × 2.50 × 1.50 m, safety-orange three-post double-sided cantilever rack, timbers across the arms), `offcut-pile.glb` **480** (2.50 × 0.42 × 3.0 m, 40 pieces settled by a Blender rigid-body sim and baked, so every piece rests on real contacts). Boards ARE modelled — the spec's "a box with a good texture" predates ART-STYLE. Materials LumberFace, LumberEnd, RackSteel. **Source is `assets/models/src/lumber.py` + `lumber.blend`, one generator shared with ASSET-38** (same materials; one kit = one generator), not the `lumber-yard.py` the acceptance named. Registered, untagged.

Closes on the model (owner posture 2026-08-24: an asset ticket closes when the `.glb` ships). Promoted 2026-10-10 from the overnight review batch after the owner's per-row verdict on the review page; registered in `data/prop-models.js` (loadable through FEAT-59's model service). Placement: dressing for the sawmill — FEAT-91 / the POI pools of FEAT-74.


**POI model** — a destination, not dressing. It anchors a zone (FEAT-46 lay-by pads / FEAT-21 POI
scatter) and gives lawn furniture (ASSET-01..08) something to belong to. A POI carries provenance:
whatever is scattered around it should read as *its* stuff.

## Amended 2026-09-30 — dressing for the sawmill (FEAT-91)

Briefly ruled the region-1 haul giver (combined with a firewood yard) and then **superseded the same
day**: firewood got its own splitting yard (ASSET-36) and lumber moved to the **sawmill in region 2**
(ASSET-11, FEAT-91). This kit goes back to what it was — **dressing** — and its natural home is the
sawmill premises: lumber stacks and timber racks around the mill. The sawmill's loading rack is
ASSET-11's, not this kit's.

**Art style correction.** This ticket predates `.planning/research/ART-STYLE.md`, which now rules
**flat colours, no textures, faceted**. The texture line in the spec below is superseded — board-end
read comes from geometry (notched ends, a darker end-grain material), not from an albedo. ART-STYLE
wins wherever this ticket disagrees.

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
| Texture | ~~one shared 1024×1024 albedo~~ **none — flat colours per ART-STYLE.md** (amended 2026-09-30): board face, end grain and banding strap as separate stable materials |
| Forward | −Z (board run along Z) |

Board ends do all the work; the sawn-end grain is what makes a stack read as lumber rather than as a
grey box. Do not model individual boards — the stack is a box with a good texture and a notched
silhouette.

## Acceptance

- `assets/models/lumber-stack.glb`, `timber-rack.glb`, `offcut-pile.glb` exist, all export-clean
  under `ASSETS.md` settings.
- Sources committed: one `assets/models/src/lumber-yard.blend` + `lumber-yard.py` generating all
  three (they share a texture, so they share a source).
- Flat-colour materials only, names stable (`LumberFace`, `LumberEnd`, `Banding` or similar).
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
