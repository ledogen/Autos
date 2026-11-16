---
id: FEAT-241
type: feature
status: open
severity: minor
opened: 2026-11-16
source: owner, 2026-11-16 — "We should select the factory blue, green, red, black, sliver, champagne and white color. When the jalopy is rolled, it will get one of these. So you start each new run with a random factory color"
relates: FEAT-204, data/vehicle-models.js, src/model-service.js
---
lane: unplaced

# FEAT-241: Each run's truck gets a random factory colour

## Next steps
A lane: pick the seven factory paints from references, roll one per run, show the owner a sheet of the seven.

## Summary
The starting truck (the jalopy, SM-INV-7) is rolled with one of seven factory colours: blue, green, red, black, silver,
champagne, white. A new run starts with a random one.

## Description
- The seven should be the 1998–2003 Ranger's factory paints, from reference photos or paint-code charts, flattened to the
  art style (ART-STYLE.md: flat, saturated man-made objects).
- The recolourable coat is the material `RangerPaint` (`paint` in data/vehicle-models.js).
- The roll is run-layer randomness: fixed for the run, re-rolled on a new run, reset through the per-run reset path
  (BUG-184).
- Applies to story runs. Free roam, the menu stage and the tutorial: see Open questions.

## Tracker
- [ ] Seven factory colours in data, each named
- [ ] A new run rolls one; it holds for the run and survives save and resume
- [ ] The owner has looked at a sheet of the seven on the truck

## Open questions
- Does the tutorial's truck have a fixed colour (first impression), or is it rolled too?
- Free roam and the menu stage: rolled, or today's red?
- Is the roll from the world seed (same seed, same colour) or independent of it?
