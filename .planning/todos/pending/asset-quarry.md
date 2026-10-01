---
id: ASSET-35
type: asset
status: open
severity: minor
opened: 2026-09-30
relates: FEAT-91 (the quarry haul giver — this model is its POI), FEAT-88 (haul), FEAT-46 (lay-by pads)
---

# ASSET-35: Quarry (haul yard, region 3)

**POI model** — a destination, not dressing. The region-3 **haul yard** of FEAT-91 (region 3 only):
it posts heavy rock hauls, gives and takes courier jobs, and its loading chute is the haul's loading
beat.

## Request

A small working rock quarry at the roadside: a stockpile of broken stone, a **steel loading chute**
(an inclined ramp off the stockpile, open at the low end over a truck bay), a rusted hopper or
retaining wall behind it, a scale-house shack or a parked loader as scale cue. Reads as heavy and
dusty from a distance; the chute is the thing the eye goes to.

The chute is functional: rocks are released at its top and roll down it into the bed of a truck
parked in the bay (owner, 2026-09-30: *"rocks spawn and roll off of a ramp and drop into the bed"*).
Its geometry is a collider, so the ramp surface has to be a clean plane the rocks can roll on — no
lips or seams that catch them.

## Spec

| Field | Value |
|---|---|
| Tri budget | **≤3000** |
| Materials | flat colours per ART-STYLE.md, faceted — stone grey (desaturated), chute steel (a saturated safety yellow or rust orange: man-made reads saturated) |
| Real size | ~18 m × 12 m footprint, chute top ~3.5 m, chute low end ~1.4 m above ground (clears a Ranger bed rail at 1.14 m + drop) |
| Origin | base-seated, centred on the footprint |
| Forward | −Z = the road-facing side, bay open to it so a truck can pull straight in |
| Collision | stockpile + wall: coarse boxes; **chute: its own convex hull matching the ramp surface exactly** |
| Named empties | `BayRock` (truck-sized ~3 × 6 m, bed end marked), `ReleaseRock` (top of the chute, where rocks spawn) |

## Acceptance

- `assets/models/quarry.glb` exported clean under `.planning/research/ASSETS.md`; sources
  `assets/models/src/quarry.blend` + `quarry.py`.
- A Ranger reversed or driven into `BayRock` sits with its bed under the chute's low end.
- A rock released at `ReleaseRock` rolls down the chute without snagging (checked once the loader in
  FEAT-91 exists).
- Tri count within budget; material names stable.
