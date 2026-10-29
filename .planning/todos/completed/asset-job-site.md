---
id: ASSET-71
type: asset
status: done
closed: 2026-10-29
severity: minor
opened: 2026-10-07
relates: FEAT-103 (the expedition camp — R1's boss; this is its model), FEAT-98 (Places and Missions)
---

# ASSET-71: The expedition camp (+ the road barrier)

**POI model** — the `expeditionCamp` type FEAT-103 adds. (The file keeps its old `job-site` name so links
survive. Until 2026-10-24 this ticket was the `workSite` construction site's model; FEAT-103 split the two —
the construction site keeps whatever placeholder-replacing model it gets later.)

A crew at the wall searching for the Roamer's old trail out. It must visibly NEED the requisition
(firewood, crew, food, fuel, gear).

## Spec (owner, 2026-10-27)

| Field | Value |
|---|---|
| Content | Hero piece: a canvas **wall tent**, door to the road, stovepipe through the roof. A **mess fly** (orange tarp) over a map table; a **survey tripod** + banded range pole; a guyed **radio mast** with a pennant. Composited from shipped models: two small tents, campfire + cooking kit, camp chairs, drums. Under-supplied on purpose: a firewood rack holding three splits, jerry cans, one drum knocked over, a few gear crates |
| Tri budget | **~5000** (as the splitting yard) |
| Materials | flat colours per ART-STYLE.md, faceted, 0 images |
| Real size | fits the 14 × 8 m lay-by pad (`poiPadHalfLen` 7 / `poiPadHalfWid` 4) |
| Origin | base-seated, centred on the pad |
| Forward | −Z = the road side |
| Collision | boxes per solid piece (wall tent, crates, drums, mast, table); fabric, guys and chairs soft |

**The barrier** is a second output of the same generator (owner, 2026-10-27: "this kit, own .glb"): one
3.0 m Type III barricade, `road-barrier.glb`. FEAT-103 places it across the road deck past the camp (the road is
blocked, not hidden), as many as the 10 m deck needs.

## Status

- 2026-10-27: modelled in `wip/`, camp 4923 tris. Owner's review (2026-10-29): two chairs clipped the
  table, one a crate; the radio crate clipped a mast guy; the fire stood too close to the fly; the roof
  jack plate was tilted against the slope. All fixed; an object-vs-object overlap check (BVH, every pair)
  now runs clean.
- The jack plate is no longer a flat box: it follows the sagged canvas and is seated 1.5 cm into it, because
  the twisted roof quads stray ±1 cm from a smooth surface. Ray-checked at 169 points: the canvas stays
  inside the plate everywhere, with ≥4 mm margin.

## Resolution (2026-10-29)

Shipped: `assets/models/expedition-camp.glb` (4931 tris / 19 materials / 0 images, x −6.79..6.81 by
z −3.56..3.90) and `assets/models/road-barrier.glb` (532 tris / 5 materials). Generator + `.blend` are in
`assets/models/src/`, and the re-export is byte-identical. Registry keys: `expeditionCamp` (9 solid boxes:
tent, table, crates, rack, two drums, cans, mast, radio crate) and `roadBarrier` (one box). Placing both is
FEAT-103's job.

## Acceptance

- `assets/models/expedition-camp.glb` + `road-barrier.glb` exported clean; generator + `.blend` in `assets/models/src/`.
- Tri counts within budget; material names stable.
