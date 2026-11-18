---
id: FEAT-286
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "Put a light campfire button in the camp menu. If you wake up before first light, there's nothing to look at because the screen is totally black."
relates: FEAT-264, DEC-397, DEC-393, DEC-404
---
lane: SM-3 (camp)

# FEAT-286: A "Light campfire" button in the camp menu

## Next steps
The owner drives it (card bugs-1117-gps-food-camp-drive) and answers the cost question.

## Summary
Add a Light campfire button to the camp menu. Waking before first light leaves a black screen with nothing to look at.

## Description
Owner's words, verbatim (inbox 20261118064935-5l8d):

> Put a light campfire button in the camp menu. If you wake up before first light, there's nothing to look at because the screen is totally black.

## Tracker
- [x] The camp menu has a Light campfire button
- [x] Lighting the fire gives something to see on waking before first light
- [ ] Owner has driven it; cost question answered

## Decisions
- Built (32afea07): "light the fire" on the camp card, shown only with camp made and the fire dead (the wake after a sleep over 2 h, DEC-393). It relights through the cook's own path, `_relightFire()` (DEC-397), free and instant [DEFAULT, owed]. Pad-reachable: menu-nav walks the camp card's visible buttons. The smoke's deadFire step checks it shows only at a dead fire, relights it, hides after and passes no time.

## Open questions
- Does lighting cost an item or time (matches, kindling)? He did not say. DEC-397 already relights the fire when the player cooks.

## Links
FEAT-264, DEC-397, DEC-393, DEC-404

## Files
the camp menu (src/main.js, camp card) · CampfireFx

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261118064935-5l8d).
- 2026-11-17 32afea07: cp-light (index.html), `_relightFire` shared with the cook (src/main.js), smoke deadFire step extended. Unverified: the owner's drive.
