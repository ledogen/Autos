---
id: ASSET-36
type: asset
status: completed
severity: minor
opened: 2026-09-30
relates: FEAT-91 (the region-1 haul yard), ASSET-37 (the firewood it drops)
closed: 2026-10-06
---

# ASSET-36: Splitting yard (haul yard, region 1)

**POI model** — a destination, not dressing. The region-1 **haul yard** of FEAT-91 (region 1 only): it
posts firewood hauls, gives and takes courier jobs, and its processor conveyor is the haul's loading
beat. *(Re-scoped 2026-09-30: first written as a piece of a combined lumber/firewood yard; the owner
then gave firewood its own yard.)*

## Request

A small roadside splitting yard: a trailer-style firewood processor (log deck, saw/splitter housing)
with an **elevating conveyor**
that climbs away from it and ends over a truck bay. Real processors load trucks exactly this way —
splits ride the belt up and tumble off the end into the bed — so this is the honest loading
mechanism for the firewood haul, and it needs no animated person. Around it: a pile of cut rounds
waiting, a heap of splits under the belt end, stacked cords, a hand-painted FIREWOOD sign.

The conveyor is functional: firewood armloads (ASSET-37) are released at the belt end and drop into
the bed. The belt itself is decoration (no moving parts required); only the release point matters.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤2500** (the whole yard) |
| Materials | flat colours per ART-STYLE.md, faceted — machine paint saturated (orange/yellow), belt dark, wood heap desaturated |
| Real size | yard ~14 × 10 m; processor ~6 × 2.4 × 2.6 m; conveyor ~7 m long, end ~2.2 m above ground |
| Origin | base-seated, centred on the yard footprint |
| Forward | −Z, conveyor running out along +X to the bay side |
| Collision | processor, wood piles: boxes; conveyor: thin box along the belt (so a truck can't drive through it) |
| Named empties | `BayFirewood` (truck-sized ~3 × 6 m, bed end marked), `ReleaseFirewood` (belt end) |

## Acceptance

- `assets/models/splitting-yard.glb` exported clean; sources in `assets/models/src/`.
- A Ranger parked in `BayFirewood` has its bed under `ReleaseFirewood`; the belt end clears the cab
  roof when the truck pulls in.
- Tri count within budget; material names stable.

## Resolution (2026-10-06) — SHIPPED, re-scoped to a firewood VENDOR

The owner re-scoped this on 2026-10-04: a roadside firewood **vendor**, not a processor + conveyor.
The Request and Spec above are superseded where they disagree with this note.

`assets/models/splitting-yard.glb` shipped across f037556 → 0f0a60f → 9349935 (merged 305a3cf).
It is in the game as the `firewoodYard` POI (`src/poi.js`), the region-1 haul giver of FEAT-91.

- **Contents:** a red towable gas-hydraulic splitter (one hose to the base-end control valve), a
  rounded pile of splits, a pyramid row of 30 shrink-wrapped bundles (11/10/9), and the ASSET-06
  awning with two camp chairs composited at `SpotAwning`.
- **Footprint:** fits the standard 14 × 8 m lay-by pad. Built footprint is 12.5 × 6.4 m.
- **Tris: 4972** against the 2500 budget, 12 materials, zero images. The overrun is the owner's
  call (the awning + chairs alone add about 560).
- **No truck bay, no conveyor.** `BayFirewood` and `ReleaseFirewood` are gone. Loading is a painted
  drop zone between the row and the pile, held as data in the `poi.js` roster (`drop`), not as a
  model empty. See FEAT-88 "As built".
- **`SpotPickup`** reserves room for the vendor's own pickup and stays EMPTY until our own non-hero
  pickup exists (ASSET-19). Never hilux.glb.
- Sources: `assets/models/src/splitting-yard.py` + `.blend` (the `wip/` copy is stale).
