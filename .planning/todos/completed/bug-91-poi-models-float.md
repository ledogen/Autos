---
id: BUG-91
type: bug
status: completed
severity: minor
opened: 2026-10-20
closed: 2026-10-20
relates: ASSET-13, FEAT-46, FEAT-71
---

# BUG-91: every POI model floated 15 cm over its own pad

## Symptom

Found while placing ASSET-13 (the gas station), the first POI with a drivable slab. Sampled in a live
story run (seed 6): the ground under the station's pad was **0.150 m below the model's base,
everywhere on the pad**. So the slab's top stood 18 cm above the dirt the wheels ride, and the
truck sank 18 cm into the forecourt. Every other POI had the same gap; the check below fails first
on mom's house at exactly 15.0 cm.

## Cause

`q.y` is the pad's **design top**. `src/road.js` `_poiPadCarve` grades the bench to
`q.y − roadClearanceMargin` (0.15 m on the Ranger's params). Over a dirt pullout it emits no
`padTopY`, so physics rides that same carved dirt.

Three consumers stood the POI on `q.y` instead:

- the model and the fallback cube (`src/main.js` `_rebuildPoiMarkers`);
- the static collider body (`src/terrain-physics.js` `PoiPhysics.sync`);
- the analytic contact (`src/poi.js` `_boxesContact`).

The yard satellites were already right (FEAT-71 stands them on `analyticHeight`). The camp seat in
`main.js` already corrected for the same gap ("Seat on the REAL ground, not pad.y").

## Fix

- `src/poi.js` stamps **`q.baseY = q.y − roadClearanceMargin`** once, at roster assignment. The
  default is the same as the carve's.
- The three consumers read `q.baseY`.
- `q.y` stays the pad's record, because the carve keys off it.

## Gate

`test/story-poi.mjs`: *every POI's base (model, cube, colliders) is the carved ground under it*.
`analyticHeight` at each model origin must equal `q.baseY` within 1 cm. It passes, and it fails at
15.0 cm with the old `q.baseY = q.y` (mutation-checked).
