---
id: FEAT-243
type: feature
status: open
severity: minor
opened: 2026-11-16
source: owner, 2026-11-16 — "Wheel dust and smoke that's in the shadow of a mountain still appears as Lit by sunlight Is there a cheap way we can change the Brightness of the particles from a simple shade test I'm okay if the particles just inherit the lighting of the ground below them if that's cheaper"
relates: DEC-227
---
lane: unplaced

# FEAT-243: Wheel dust and smoke take the shade of the ground under them

## Next steps
A free lane: find the cheapest shade test and show before/after.

## Summary
Dust and smoke in a mountain shadow render as sunlit. Darken them by a cheap shade test, or let them inherit the lighting of the ground below.

## Description
Real-time shadows are off (DEC-227), so find what the terrain uses for its shading (baked or analytic) and sample that at the emitter. Measure the cost; no new per-particle work on the main thread if it can be avoided.

## Tracker
- [ ] Particles in terrain shade are darker than particles in sun
- [ ] Cost measured and reported
- [ ] Owner has looked
