---
id: FEAT-283
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "Change the "use" button to say "eat" for all food items. Also, when you hover the "eat" button, it should show you how much hunger you're going to rec…"
relates: FEAT-250, FEAT-230, BUG-211, FEAT-122, DEC-417
---
lane: SM-3 (items and food)

# FEAT-283: Food items say "Eat"; hovering it previews the hunger recovered

## Next steps
A lane changes the label and builds the preview.

## Summary
The Use button on food items reads "Eat". Hovering it shows how much hunger it will recover: maybe a green box on the hunger bar, moved to the post-meal level.

## Description
Owner's words, verbatim (inbox 20261118062707-vgo6):

> Change the "use" button to say "eat" for all food items. Also, when you hover the "eat" button, it should show you how much hunger you're going to recover. Maybe draw a green box around the hunger bar and move it to the post-meal level.

## Tracker
- [ ] The button on every food item reads "Eat"
- [ ] Hovering Eat shows the hunger it will recover
- [ ] The preview is a green box round the hunger bar, shown at the post-meal level (he said "maybe")

## Decisions

## Open questions
- The green-box preview is a "maybe": confirm or choose another form.

## Links
FEAT-250, FEAT-230, BUG-211, FEAT-122, DEC-417

## Files
the inventory item card (src/inventory*.js, src/main.js) · the hunger bar

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261118062707-vgo6).
