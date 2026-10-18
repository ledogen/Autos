---
id: FEAT-123
type: feature
status: open
severity: minor
opened: 2026-10-17
blocked-by: ASSET-13, FEAT-121
relates: FEAT-50 (fuel + the pump visit — shipped the machinery this reuses), ASSET-13 (the station
  model), ASSET-74 / FEAT-105 (the general store's park box + big pad), FEAT-121 (item tracker)
---

# FEAT-123: The gas station's store side — stock, storefront lot, its own pumps

## Request

Owner ruling, 2026-10-16: **the gas station IS the convenience store**, a different version of the
general store with its own offerings, both for sale and for missions. You either park at the storefront
or at the pump. FEAT-50 split the lone **gas pump** out as its own POI (refuel only, four to a region)
and left the station as a placeholder cube that posts work. This ticket makes the station real.

## Scope

- **Model:** ASSET-13 joins the `gasStation` pool in `data/prop-models.js` by tag, and nothing else
  in `src/poi.js` changes. It needs a big-pad kind (18 × 12 m forecourt), the same blocker as ASSET-13
  itself (`src/poi.js` PAD_KINDS, as FEAT-105 did for the farm).
- **Two zone kinds on the model, authored as data:**
  - `pumpZones` beside its islands. FEAT-50's pump visit picks them up unchanged:
    `_pumpInReach`, the curtains and the tow destination all read `q.pumpZones`.
  - A `park` box for the storefront lot (ASSET-74's stall mechanism): park there for offers and the
    shop.
- **Stock:** its own list for sale (snacks, basic items, the jerry can). This needs the item system
  (FEAT-121) to have somewhere to put what you buy, and the shop UI to buy it with.
- The station keeps its SOURCES row and every offer, pool and reward it has today.

## Acceptance

- The station renders as ASSET-13 on its own pad kind.
- Pulling alongside its islands opens the same pump visit as a lone pump.
- Parking in the storefront lot opens its offers and its shop, as two different zones.
- The tow's "nearest place that sells fuel" includes stations, which falls out of `q.pumpZones`.
