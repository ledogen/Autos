---
id: ASSET-36
type: asset
status: open
severity: minor
opened: 2026-09-30
relates: FEAT-91 (the region-1 haul yard), ASSET-37 (the firewood it drops)
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
