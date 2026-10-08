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

## Built 2026-10-08 — branch `feature/feat-105`

**Owner rulings (2026-10-08):** min spacing ~250 m; "we don't need a whole ton more spawn
possibilities, just unlock what we need + margin"; seed layouts may reshuffle. The farm pad is
**22 m along x 11.2 m deep**, with the barn gable (doors) to the road at one end and the yard
beside it. A region with no farm-size spot falls back to a lay-by and the broadside barn, with no
yard. A farm yard takes **5–9** clutter props.

**What shipped (`src/poi.js`):**

- **Several pads per edge, NOT a scan.** A full 20 m scan was built and measured first: 145–188
  pads and 6–8 s per build, against today's 41–54 and 0.9 s. That is a flood, not "need +
  margin". So each edge keeps `poiCandidates` (6) random tries per pad kind. Every try that passes
  is kept, as long as it is `poiPadSpacing` (250 m) along the edge from the last one kept.
  `_placeOnEdge` → `_padsOnEdge`.
- **Pad kinds.** A roster model declares a registry `pad: { halfLen, halfWid }` (the barn's is
  11 x 5.6). `padKinds()` derives the kinds from the roster, pass 1 sites each kind on its own
  tries, and a slot draws only from pads of its kind. Taking a pad also removes every pad of
  another kind on the same edge within 250 m (`padsClash`). `fallbackModel` covers the
  no-farm-pad case.
- **`seatAlong`** (registry): slides a model along its own +X, so the barn stands at one end of its
  pad. **`yardCount`** (registry): the farm yard takes 5–9.
- **`barn` / `barnBroadside`**: one .glb, two registry entries. `barn` is gable-to-road on its
  farm pad, with a yard beside it. `barnBroadside` is the fallback.
- **Earthwork before water in `_evaluate`.** The water probes cost about 15× the earthwork lattice,
  and the cap rejects most sites first. This is pure reordering of reject tests: the same pads
  are accepted. It took the seed-11 build from 2028 ms to 807 ms with both pad kinds, below the
  old single-kind ~940 ms.

**Traps hit:**

- Pad ids carry the pad's index as `@n`, **never `#n`**. An offer id is `${poiId}#slot#gen`, and
  `offer-board.js` splits it on `#`. The first build used `#`, and `story-poi` caught it when
  `board.take()` returned null.
- `story-poi`'s coverage-optimality check now judges lay-bys against lay-bys, which matches the
  roster: a slot draws only from its own pad kind.

**Census (2500 m region at each seed's real spawn):** see pois.md § Pad supply. Lay-bys went from
41–54 to 52–69, farm pads are 16–27 (3 needed), and every seed fills 23/23 with all three farms
on farm pads. The median nearest-neighbour distance went from 360–560 m to 296–437 m. The minimum
is 133–228 m, up from 88–224 m before.

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
