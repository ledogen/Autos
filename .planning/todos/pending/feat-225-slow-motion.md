---
id: FEAT-225
type: feature
status: open
severity: minor
opened: 2026-11-15
source: owner, 2026-11-15 — "post alpha feature - slow motion. I think because we use a fixed physics time step ... we should be able to slow down the game clock and if anything it should take load off of the machine ... detecting when a crash is going to come up ... rock slide ... change the camera angle ... really useful for diagnostics like physics glitches"
---
lane: unplaced

# FEAT-225: Slow motion (post-alpha)

## Next steps
Post-alpha. Nobody until the owner places it.

## Summary
Run fewer fixed physics steps per real second. Load falls, as the owner says. The one catch: at 10 % speed the physics advances only 25 times a second, so the picture must be drawn as a blend of the last two physics states (interpolation) or it looks steppy. Uses: crash and rock-slide moments with a camera cut, and a diagnostics slow-down.

## Tracker
- [ ] Built to the owner's words above
- [ ] Owner has looked / driven it
