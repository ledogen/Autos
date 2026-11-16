---
id: BUG-175
type: bug
status: closed
severity: major
opened: 2026-11-15
source: owner, 2026-11-15 — "I think there's still a stutter whenever I switch on the truck lights for the first time And it also seems like it was triggered when the service station lights turned on when I parked. i dont think we have this issue with reverse or brake lights."
---
lane: Spare

# BUG-175: Stutter the first time the truck lights or a POI's lights switch on

## Next steps
Owner: the first headlight switch of a session at night, and parking in a service station (branch `proto/feat-221-exposure`, :3885). Then close.

## Summary
Two causes, both a change in the scene's light count. The bay light (BUG-174) was a real recompile; the truck lights were not a recompile, their first draw was the cost. Both fixed.

## Description
Owner's words in `source`. Measured headless (`wip/bug-175/hitch.mjs`, seed 6, 23:00, a nonce in every vertex shader so the GPU
driver's shader cache is cold, as on the first run after an update; one key pressed first, because the page's first key starts
the audio, ~100 ms, which the game has long paid by then):
- Bay light appearing (a point light added): +128 programs, worst frame 216–1133 ms. The suspect, confirmed.
- First low-beam switch: worst frame 150 ms, +0 programs. The suspect refuted for the lamps: PERF-21's prewarm had compiled the
  variants; the first DRAW of each variant made the driver build its pipeline (the profile: 336 ms waiting in getProgramInfoLog).
  Brake / reverse do not hitch because their states are drawn by day long before night.
- Rejected: keeping the six spots always in the light state (no variants at all) costs ~3.5–5 ms GPU per frame lamps-off.

## Tracker
- [x] Hitch measured, cause confirmed (bay light) / refined (truck lights: first draw, not compile)
- [x] Fixed: bay light never added or removed (BUG-174); light-state warm-ups draw one scissored pixel
- [x] Before/after: first low beams 150 → 16.8 ms worst frame; bay light 216–1133 ms → no event (never added)
- [ ] Owner has looked / driven it

## Decisions
None governing (PERF-21 / BUG-98 are tickets, not records).

## Open questions
None.

## Links
PERF-21, BUG-98 (the prewarm and sweep this extends), BUG-174, FEAT-219.

## Files
`src/vehicle-model.js` (`_drawWarm`, used by `prewarmLightPrograms` and `compileLightState`) · `src/main.js` (sweep comment)

## Log
- 2026-11-15 (Spare): c74264e5. Sweep step now a 1-pixel draw, 0.40 ms CPU. Logs in `wip/bug-175/` (git-invisible).
- 2026-11-15: CLOSED. On main since 3393c6ad. The owner's answer on card lighting-bundle-look raised only the bay light; orchestrator read that as no objection here.
