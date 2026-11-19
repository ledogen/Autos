---
id: FEAT-301
type: feature
status: closed
severity: minor
opened: 2026-11-19
source: owner, 2026-11-19 (inbox) — "The hunger preview you get from an item doesn't really show you where the hunger is going to end up because it goes off the scale I think when you're hovering the eat icon it should just show you where the energy will end up just show you the post-eaten energy state"
relates: DEC-438, FEAT-283, FEAT-250, DEC-376, DEC-417, src/inventory-screen.js, src/main.js (_previewEat)
---
lane: SM-3 items and food (Sonnet)

# FEAT-301: Hovering the eat icon shows the post-meal ENERGY state, not a hunger preview that runs off the scale

## Next steps
A lane changes the eat preview (`eatPreview` / `_previewEat`) to draw where the energy bar will end up, not the hunger recovered.

## Summary
Owner's words:
> The hunger preview you get from an item doesn't really show you where the hunger is going to end up because it goes off the scale I think when you're hovering the eat icon it should just show you where the energy will end up just show you the post-eaten energy state

Today (FEAT-283): hovering Eat on a food item previews the hunger recovered on the hunger bar. When a meal is bigger than the room left on the bar the preview "goes off the scale", so it does not say where the bar ends up. The owner wants the preview to show the resulting ENERGY state after eating.

The scribe's reading: energy is the player-facing bar that hunger feeds (DEC-376, hunger is one satiety counter; being hungry costs energy), so "the post-eaten energy state" is the energy bar drawn at its after-eating level, clamped to the scale.

## Description
(See Summary.)

## Tracker
- [x] Hovering or pad-highlighting Eat draws the energy bar at its post-meal level
- [x] Never past the scale; a meal that overflows reads as a full bar
- [x] Gate / smoke step holds it
- [ ] Owner has looked

## Open questions
- CONFLICT, FEAT-283: its Summary says the hover "shows how much hunger it will recover: a green box on the hunger bar". This request replaces that with the energy state. Both ticket and DEC-438 say it; the owner confirms he wants the hunger box gone, not shown beside the energy.
- Does the energy bar show the effect of the hunger (DEC-376: one satiety counter), or does eating add energy directly? Needs the builder to read DEC-376 and FEAT-250 and tell the owner which number moves. Not decided here.

## Links
FEAT-283, FEAT-250.

## Files
`src/inventory-screen.js` (eatPreview) · `src/main.js` (_previewEat) · `src/hud-menu.js`

## Log
- 2026-11-19: minted by the intake scribe from the owner's inbox note. No code touched.
- 2026-11-19: land/small-1119. Read "energy" as the Energy meter's hunger strip: eating moves only the satiety counter (DEC-376), never the energy hours. The green box is gone; hover draws the strip and its word at `DaySystem.leftAfterMeal`, which eat() itself now uses. test/meal-waste.mjs: 20 meals over hungry / fed / capped states, preview == result. If the owner meant the energy strip itself, nothing there moves on eating: ask. Owner look open.
