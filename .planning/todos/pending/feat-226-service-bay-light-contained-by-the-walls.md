---
id: FEAT-226
type: feature
status: open
severity: minor
opened: 2026-11-15
source: owner, 2026-11-15 — "mainly id like the service station light to be contained by the walls" … "just ticket the bay light. kill realtime shadows for now"
relates: BUG-174, FEAT-214, FEAT-223, src/main.js, src/poi-night.js
---
lane: Spare

# FEAT-226: The service station's bay light is contained by its walls

## Next steps
Owner: look at `wip/bay-light-2/sheet-final.png` (before left, after right: ceiling, door, side wall) on branch
`land/bay-light-2`, or drive into a station at night. The bay light no longer sits over the truck (DEC-228); spill is
lower but not contained, so the containment boxes stay open (still no shadow, DEC-227).

## Summary
The service bay's light (`_bayLight` in `src/main.js`, a point light with a 12 m range) shines through the station's
walls onto the ground and props outside. The owner wants it contained by the walls.

## Description
The light is one `THREE.PointLight`, always in the scene (BUG-174), placed in the bay of the nearest service station.
A point light has no notion of walls: without a shadow, everything inside its 12 m range is lit.

Real-time shadows are off the table for now (DEC-227). Options that fit that ruling, cheapest first, none measured:
- Shape the light instead of shadowing it: a downward spotlight under the ceiling, its cone sized to the bay floor,
  and a shorter range. No shadow at all; light can still leave through the open door, which is physically right.
- A shadow drawn ONCE (the light and the walls never move) and reused, never updated per frame. The truck inside the
  bay would then cast no shadow from this light. Cost: one shadow lookup in every lit material's shader (the small
  program the GPU runs per pixel), on every pixel on screen; estimated +1 to 2 % GPU as a spotlight, unmeasured.
  Must be on from boot: switching a shadow on mid-drive recompiles every shader (the BUG-175 stutter).

Orchestrator's estimate given to the owner the same day (from reading the code, anchored on the sun's shadow pass at
~9 % of GPU work): a per-frame point-light shadow here +2 to 4 %; headlight shadows +15 to 30 % at night naive,
+8 to 15 % as one shared short-range shadow, and props would not cast (their sun shadows are baked, PERF-07).

## Tracker
- [ ] Containment chosen with no real-time shadow, GPU cost measured (active cycles, paired windows)
- [ ] From outside the station at night, the walls and ground beyond them are no longer lit by the bay light
- [ ] No first-use stutter (prewarmed like BUG-175)
- [x] The ceiling no longer gives away one source over the truck: the light moved to mid-shop, 2.0 m (DEC-228)
- [ ] Owner looks

## Decisions
- 2026-11-15, owner: "just ticket the bay light. kill realtime shadows for now" (DEC-227).
- 2026-11-15, owner delegated the second-ceiling-light call; agent kept one light and moved it (DEC-228).

## Files
`src/main.js` (`SERVICE_LIGHT`, `_bayLight`, `_placeBayLight`) · `src/poi-night.js`

## Log
- 2026-11-15 (Spare, land/bay-light-2): `_bayLight` moved from lift A at 2.9 m (60 cd, 12 m) to mid-shop [-1.8, 2.0, 0],
  40 cd, 9 m. Spot at the strips tried, rejected (black ceiling). GPU, paired active cycles, seeds 49846 / 44857, noon
  and 23:00: B/A 1.009 / 1.016 / 1.008 / 1.001, every IQR spans 1.0 (no shader change). Prewarm probe: identical to
  main (0 new programs on headlight switches). Affected gates 9/9 green.
