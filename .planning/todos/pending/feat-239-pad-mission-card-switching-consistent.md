---
id: FEAT-239
type: feature
status: open
severity: minor
opened: 2026-11-16
source: owner, 2026-11-16, inbox — "It bothers me slightly that switching between mission cards in the map view is done with the Left and right D-pad buttons but switching between mission cards at a POI is done with shoulder buttons. I think it should be kept consistent which ultimately means moving to shoulder buttons on the map view that displaces switching between shopping mode and mission mode. If we were to use dpad for the shopping versus mission mode in map view could we guarantee that we don't need the dpad to navigate a card that appears inside the map? what else can we do?"
relates: FEAT-133, FEAT-136, src/map2d.js, src/main.js
---
lane: Map batch (answer the question first)

# FEAT-239: Pad: switching mission cards is the same control on the map and at a POI

## Next steps
Map batch agent answers the owner's question with facts; then an owed card with options.

## Summary
Mission cards switch with D-pad left/right on the map but with the shoulder buttons at a POI. The owner wants one control, which points to shoulders on the map, displacing the shopping/missions switch there. Their question: if the D-pad took the shopping/missions switch on the map, can we guarantee no card inside the map ever needs the D-pad? What else can be done?

## Tracker
- [ ] Facts: every control used on the map and inside each card that can open in it
- [ ] Options card for the owner
- [ ] Built to the pick

## Log
- 2026-11-16: filed from the owner's inbox note.
