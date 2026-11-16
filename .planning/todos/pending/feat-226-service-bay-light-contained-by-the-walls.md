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
Ticketed only (owner, 2026-11-15); nobody is on it. When a lane takes it: pick a containment that needs no
real-time shadow (DEC-227), measure its GPU cost with the paired active-cycles test, then show the owner.

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
- [ ] Owner looks

## Decisions
- 2026-11-15, owner: "just ticket the bay light. kill realtime shadows for now" (DEC-227).

## Files
`src/main.js` (`SERVICE_LIGHT`, `_bayLight`, `_placeBayLight`) · `src/poi-night.js`
