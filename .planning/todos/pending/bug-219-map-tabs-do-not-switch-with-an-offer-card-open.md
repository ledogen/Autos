---
id: BUG-219
type: bug
status: open
severity: minor
opened: 2026-11-18
source: owner, in chat, 2026-11-18 ("Tabs on map view are broken"); case found by the int-1118a agent
---
lane: free lane

# BUG-219: On the map, Q and pad X do not switch tabs while a mission offer card is open

## Next steps
Owner to confirm this is the case he saw and say what Q / X should do with an offer card open.

## Summary
Parked at a giver with the map open and an offer card showing (state "offer"), Q and pad X cycle the offer cards (`map2d._hoverLocked`, src/main.js about line 2151) and never switch Missions / Shopping. Only a click on the tab header switches. Without an offer card all three inputs switch.

## Description
Owner: "Tabs on map view are broken". Not reproduced in free roam. Measured in a story run, seed 6, 12 mission rows and 13 shop rows. Also: after a pad-X swap with nothing highlighted, `_hoverPoi` keeps the old card.

## Tracker
- [ ] Owner confirms the case and the wanted behaviour
- [ ] Fix and a smoke step

## Decisions

## Open questions
Should Q / X switch tabs with an offer card open, and what then cycles the offers?

## Links

## Files
src/main.js, src/map2d.js

## Log
- 2026-11-18 minted by the orchestrator.
