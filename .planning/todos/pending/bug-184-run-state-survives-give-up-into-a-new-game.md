---
id: BUG-184
type: bug
status: open
severity: major
opened: 2026-11-16
source: owner, 2026-11-16, inbox — "I failed out of it run with a damaged wheel and I used the give up menu button. Then I I started a new game and accepted the tutorial. Once I got in game, I noticed that the wheel with functional tire is behaving as if it is popped and the wheel is destroyed. I can see sparks, I can hear the sound effect playing of a wheel metal on pavement. Additionally, when I opened the map I saw the map of my previous world for a brief second. I think we should focus on doing better resets between matches and game modes"
relates: BUG-183, src/main.js, src/damage.js, src/map2d.js
---
lane: A (after FEAT-229 lands)

# BUG-184: A destroyed wheel and the old map survive give-up into a new game

## Next steps
Lane A: reproduce, then extend BUG-183's one reset point from menus to ALL per-run state.

## Summary
After give-up with a destroyed wheel, a new game starts with that wheel still destroyed (sparks, metal-on-road sound) although its tire shows as fine, and the map briefly shows the previous world. The owner: "we should focus on doing better resets between matches and game modes". BUG-183 built one reset point for menus; this is the same class for vehicle damage, audio, effects and the map's cached tiles.

## Tracker
- [ ] Reproduced: give-up with a destroyed wheel, new game, wheel still destroyed
- [ ] Audit: every piece of per-run state (damage, wheels, tires, audio loops, particle effects, map tiles and waypoint, GPS, alerts, clocks) and where a new run resets it
- [ ] One reset path for a new run and for a mode change; nothing per-run survives
- [ ] Smoke step: wreck a wheel, give up, new game, assert a healthy truck and a map of the new seed

## Log
- 2026-11-16: filed from the owner's inbox note.
