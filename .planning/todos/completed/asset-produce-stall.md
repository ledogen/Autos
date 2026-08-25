---
id: ASSET-15
type: asset
status: done
severity: minor
opened: 2026-08-03
updated: 2026-08-24
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

## Spec amendments (2026-08-17 / 2026-08-18)

The model is built and exported; the spec table above is the ORIGINAL and is superseded on
five rows by owner rulings taken during authoring. Recorded here rather than edited in place
so the original intent stays readable.

| Field | Ticket said | Shipped | Why |
|---|---|---|---|
| Form | trestle table under a canopy | **stall on a single-axle trailer** | owner direction 2026-08-17 |
| Real size | 3.0 x 2.0 x 2.4 m | **4.347 x 2.250 x 2.400 m** | the drawbar adds 1.2 m ahead of the deck; height is unchanged |
| Tri budget | <= 1200 | **1752** | see below |
| Texture | 1024x1024 albedo **with alpha** for produce | **512x384, no alpha**, sign artwork only | ART-STYLE rule 7 bans transparency; produce is modelled instead |
| Collision | `[3.0, 1.0, 2.0]` | **needs restating** — deck mass only, excluding drawbar and sign | not yet written into `data/prop-models.js` |

**On the budget.** 1752 sits inside ART-STYLE.md's 700-1800 "mid structures" band, which names
the produce stall explicitly; the ticket's 1200 predates that table (ticket 2026-08-03,
ART-STYLE verified 2026-08-05). Treat 1800 as the budget. It got there the cheap way: the
sign's lettering was 784 tris as geometry and is now one baked texture, which took the model
from 2692 down to 1752 in a single change.

**On materials.** 12, against ART-STYLE rule 6's "justify anything above ~6". Five of those are
produce colours and are not mergeable - red tomatoes and orange carrots cannot share a draw
call. The remaining seven are frame / deck / tyre / post / roof / crate / sign. This is a POI
placed a handful of times, not scatter density, so 12 draw calls is affordable; it must not be
taken as licence for anything repeated.

**Recolourable materials:** `StallRoof`, `StallSign` (swap its image for region-varied
lettering). All others are fixed.

## Acceptance

- [x] `assets/models/produce-stall.glb` exists, export-clean under `ASSETS.md` settings.
      Verified off the exported file: glTF 2.0, 1752 tris, 12 primitives, one embedded PNG,
      no extensions (no Draco), +Y up, base-seated at Y=0, serving face on -Z.
- [x] Sources committed: `assets/models/src/produce-stall.blend` + `produce-stall.py`.
- [x] ~~Produce renders as alpha-test~~ — **superseded**: produce is modelled geometry, no alpha
      anywhere in the asset. See the amendment table.
- [x] Canopy renders correctly from below (gable underside is a V ceiling, not a flat slab).
- [x] Tri count within the amended budget; material names stable.
- [→] **Loads and places in-world through the FEAT-59 model import service.** MOVED TO FEAT-74 - there is
      no `data/prop-models.js` entry yet, and the collision box needs restating for the trailer
      form. This is the only outstanding item.

## Notes

- Own work → no `CREDITS.md` entry needed.
- **Mixed opaque + alpha-test materials**, so it inherits ASSET-07's pipeline caveat: it differs from
  the shared opaque palette material that the shadow-bake scratch meshes and impostor bake assume
  (FEAT-59's deferred criteria). Keep it on the *placed* per-mesh path.
- The sign is the character of this asset. Give its material a stable, distinctive name so the
  lettering can be varied per-region later without a re-model.
- Any buying/selling *gameplay* is a story-mode ticket — `.planning/story-mode/items.md` has the
  cargo/catch vocabulary, and DESIGN.md's invariants govern. Not this ticket's business.

## Closed — 2026-08-24

Model shipped 2026-08-18 (`produce-stall.glb`, 1752 tris, 12 materials, one baked 512x384
sign). The single outstanding acceptance item was the `data/prop-models.js` entry and a
collision box restated for the trailer form — both are now **FEAT-74**, along with the
pool question (is a stall a mission giver, or a vendor like the gas pump?) which is the
owner's to answer.

## Loadability — 2026-08-24 posture change

**This ticket is closed on the model.** Getting it into the world is **FEAT-74 (POI model pools)**, not this ticket.

Standing posture (owner, 2026-08-24): *an asset ticket closes when the `.glb` ships.* The harness
that places it is a separate, consolidated ticket per asset class. Holding a row of finished models
open behind one missing consumer made the tracker read as unfinished work when the outstanding
action was a single system, named once.
