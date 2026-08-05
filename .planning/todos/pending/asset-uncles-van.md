---
id: ASSET-32
type: asset
status: open
severity: minor
opened: 2026-08-03
updated: 2026-08-04
blocked-by: FEAT-59
relates: FEAT-46, ASSET-22, ASSET-19
---

# ASSET-32: Uncle's van

**POI model** — a destination, not dressing. It anchors a zone (FEAT-46 lay-by pads / FEAT-21 POI
scatter) and gives lawn furniture (ASSET-01..08) something to belong to. A POI carries provenance:
whatever is scattered around it should read as *its* stuff.

## Request

A tired panel van with the delivery service's name hand-painted on the side, back doors open, bundles
of papers visible inside. `.planning/story-mode/opening.md` describes the uncle as *"a guy with a
van"* — this is that van. It is the first place in the game that gives the player a reason to drive,
and — since the day job is gone by the end of the opening beat — the early game's **only** constant.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤2200** |
| Texture | one albedo, **1024×1024** — hand-painted signage, faded paint, road grime, dull glass |
| Real size | 5.2 m long × 2.0 m wide × 2.3 m tall |
| Origin | base-seated: tyre contact patches at y=0, centred on the footprint |
| Forward | −Z (nose faces −Z; **rear doors therefore open toward +Z**) |
| Collision | `{ shape: 'box', dims: [2.0, 2.3, 5.2] }` |

Rear doors are **modelled open and baked** — the van is never seen closed, and open doors are what
make it read as working rather than parked. Paper bundles inside are part of the same `.glb`; they do
not need to match ASSET-27's crate or the newspaper cargo asset.

## Acceptance

- `assets/models/uncle-van.glb` exists, export-clean under `.planning/research/ASSETS.md` settings.
- Sources committed: `assets/models/src/uncle-van.blend` + `uncle-van.py`.
- The signage material has a **stable, distinctive name** — the delivery service is unnamed in the
  docs, so the lettering will change once it is named, and that must not require a re-model.
- Fits a 14 × 8 m lay-by pad (`poiPadHalfLen 7.0` / `poiPadHalfWid 4.0`, `src/poi.js`) with room to
  park alongside.
- Tri count within budget; material names stable.
- Loads and places in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- **Static prop, not a vehicle** — same caveat as ASSET-09. Do not route through
  `src/vehicle-model.js`.
- **The uncle himself is not in this asset.** He has no name and no described appearance in any
  planning doc, and the only humanoid in the class (ASSET-20) is deliberately a statue with no
  character pipeline behind it. The van stands in for him; a modelled uncle is a character-art
  decision the owner has not made.
- Whether this van is *the* mission-giver POI or set dressing that resembles one is a FEAT-46
  placement question, not this ticket's. Author it so either works.
- Pairs with ASSET-22 (mailbox): the van is where the papers come from, the mailboxes are where they
  go.
