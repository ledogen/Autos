---
id: FEAT-105
type: feature
status: open
severity: major
opened: 2026-10-08
source: owner, 2026-10-08 — the barn (ASSET-66) does not fit the 14 x 8 m pad; "look deeply into pad spawning and see what we can do to widen spawn criteria"
relates: FEAT-71, FEAT-96, FEAT-60, FEAT-91, ASSET-66, ASSET-65, ASSET-67
---

# FEAT-105: Pad supply — scan every edge, several pads per edge, bigger pads for farms

## The problem

Farm models don't fit a lay-by pad. The barn alone is 9.1 x 12.1 m of wall, while the pad is
14 x 8 m. The farm composite (ASSET-65..67 + the produce stall, FEAT-96) is bigger still, and a
farm also needs a yard for its clutter (FEAT-71). Today the barn ships **broadside, hanging 1.15 m
off the back of the pad** onto the carve's flat rim band (`PAD_RIM_HOLD`). With the barn filling
the pad, **a farm has no yard and no clutter** (owner ruling, 2026-10-08). That is the stopgap this
ticket replaces.

Making every pad bigger was measured and refused (FEAT-71, 2026-10-07). A 10 m-deep pad cost
about 35% of viable pads, and 5 of 8 census seeds could no longer fill the 23-slot roster. A 9 m
pad still left 2 seeds short.

## What the probe found (2026-10-08)

A throwaway probe, 3 seeds (11, 777, 6), on the `story-poi` gate's region (r = 2200 m at
4500, 600). It ran `PoiSystem._evaluate` every 20 m along every road edge, on both sides, at
several pad sizes. "Pass rate" is the share of those sample points where a pad passes every
siting test.

| Pad | Pass rate | Edges with a viable spot | Pads at 150 m spacing |
|---|---|---|---|
| 14 x 8 (today) | 12–13% | 47–51 | 117–127 |
| 14 x 8, earthwork cap off | 32–36% | 54–55 | 168–198 |
| 14 x 13 (barn, gable to road) | 4% | 34–44 | 57–69 |
| 16 x 11 (barn, broadside) | 4–5% | 37–45 | 67–78 |

The real pool on the same seeds is only **27–29** pads. Two limits explain the gap, and neither
has anything to do with pad size:

1. **Six random tries per edge** (`poiCandidates: 6`, `_placeOnEdge`). About half the edges that
   have a viable spot never get a pad, because six random positions miss it.
2. **One pad per edge, maximum** (`_placeOnEdge` returns the first hit). A 600 m edge with four
   good spots offers one.

The earthwork cap (`poiMaxCutFill: 3.0`) is the biggest single rejection. Lifting it nearly
triples the pass rate. But relaxing it means bigger visible scars on the hillside, which is a
look decision, so it is out of scope unless the owner asks.

## Scope

- **Scan, don't sample.** Walk each edge at a fixed step instead of `poiCandidates` random
  positions. Keep the result a pure function of (seed, edge), so placement stays
  window-invariant (FEAT-60). The scan can start from a per-edge hashed offset, so pads don't
  all land on the same step grid.
- **Several pads per edge**, with a minimum spacing along the arc. **The spacing is the owner's
  call.** Today the median distance to the nearest POI is 540–620 m, and the probe used 150 m
  only to measure headroom. Pad identity becomes (edge, slot index), so `poi-pick`,
  `poi-model` and `poi-variant` hashes stay keyed to which pad it is, never how many there are.
- **Per-class pad size.** A roster slot (or its model) asks for a bigger pad, for example
  `pad: { halfLen, halfWid }`. Pass 1 records, for each candidate, which sizes it passes at.
  Pass 2 fills a big-pad slot only from pads that pass at its size. Farms first; FEAT-91's
  sawmill and quarry are the next customers. The carve already reads each pad's own
  `halfLen` / `halfWid` / `cornerR`, so the terrain side needs nothing new.
- **Then give the farm its yard back.** Turn the barn to whatever orientation the owner wants
  (gable to the road, if the pad allows it), give it a `yard`, and the FEAT-71 `yardClutter` pool
  dresses it with no further code. `test/poi-yard.mjs` already gates that pool through a
  synthetic cube farm.

## Acceptance

- `pad-census`-style numbers before and after, on the 8 census seeds (pois.md § Pad supply).
  Every seed fills the full roster, with farms on their bigger pads.
- Placement stays window-invariant and deterministic: `story-poi` and `world-determinism`
  stay green.
- The free-roam road surface stays bit-identical with and without pads (the `story-poi`
  invariant).

## Caveats

- **Every seed's layout reshuffles,** mom's and Larry's houses included. The 2026-08-15 ruling
  allows reshuffling when a model pool is widened; this is a wider version of the same thing,
  so confirm with the owner before shipping.
- **The probe numbers are rough.** They ignore the edge-in-region-wall post-filter, so real
  numbers will be somewhat lower. Re-measure with the real code path.
