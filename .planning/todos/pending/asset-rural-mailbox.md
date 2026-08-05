---
id: ASSET-22
type: asset
status: open
severity: minor
opened: 2026-08-03
updated: 2026-08-03
blocked-by: FEAT-59
relates: FEAT-46, ASSET-32, ASSET-31
---

# ASSET-22: Rural mailbox

**Road furniture** — repeats along the network, never a destination. It makes a road read as
maintained and inhabited *between* POIs, at a density no POI model can carry. Placed from road
geometry rather than scattered at random.

## Request

A steel mailbox on a weathered timber post at the roadside — flag up or down, slightly canted, a
dented one here and there. Small, endlessly repeatable, and the closest thing this asset class has to
a **load-bearing gameplay object**: `.planning/story-mode/missions.md` §2 describes the paper route
as *"a fixed stack of papers, a wide fan of delivery POIs"* — and there is currently nothing in the
world to deliver **to**. The newspaper roll asset already exists; its target does not.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤250** — it will be the most-repeated object in the game; treat the budget as hard |
| Texture | one albedo, **512×256** — galvanised steel, rust at the seams, timber grain, a faint house number |
| Real size | 0.20 m wide × 0.48 m deep box, 1.15 m to the box top |
| Origin | base-seated: post foot at y=0 |
| Forward | −Z (box **opening** faces −Z; the flag is on the −X side) |
| Collision | `{ shape: 'box', dims: [0.20, 1.15, 0.48] }` — knockable, not a wall |

Flag modelled **up** (a delivery target reads better raised) as a separate, stably-named node, so a
down state is a transform rather than a second model.

## Acceptance

- `assets/models/mailbox.glb` exists, export-clean under `.planning/research/ASSETS.md` settings.
- Sources committed: `assets/models/src/mailbox.blend` + `mailbox.py`.
- Tri count within budget — verified, not estimated. At this repeat count it is the only number in
  the ticket that really matters.
- The flag is an addressable child node with a stable name.
- Reads as a mailbox in silhouette at ~40 m from a moving vehicle.
- Loads and places in-world through the FEAT-59 model import service.

## Notes

- Own work → no `CREDITS.md` entry needed.
- **The one asset in the class most likely to need density instancing.** Mailboxes along a road are
  exactly the *scatter* case that is FEAT-59's **deferred** palette/`InstancedMesh` criteria, not its
  core per-mesh path. A few placed by hand is fine to prove the asset; a populated route is not, and
  will want that deferred work finished first. Say so before anyone plans the paper route around it.
- **Ships as scenery with no interaction.** Throw detection, delivery scoring, and the papers-
  remaining budget are all paper-route mission work; `.planning/story-mode/missions.md` §2 and
  DESIGN.md govern. This ticket only guarantees a target exists to aim at.
- The house number is texture, and should be varied by **UV offset into a shared strip**, not by a
  second texture — that is the cheapest possible way to make a repeated object stop reading as a
  clone.
- Pairs with ASSET-32 (uncle's van).
