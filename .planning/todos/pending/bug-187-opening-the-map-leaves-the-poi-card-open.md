---
id: BUG-187
type: bug
status: open
severity: minor
opened: 2026-11-16
source: owner, 2026-11-16, inbox — "If you're at a POI and you open your map, it should close the POI card, even if you're parked. We just end up with UI conflicts"
relates: BUG-183, src/main.js, src/map2d.js, src/offer-board.js
---
lane: Map batch

# BUG-187: Opening the map at a POI leaves the POI card open

## Next steps
Owner: open the map parked at a POI with its card up. The card goes; the next brake pull brings it back as before.

## Summary
Opening the map while parked at a POI should close the POI card; today both show and conflict.

## Tracker
- [x] Opening the map closes the POI card, parked or not (the player's M / View opens run `_closeMenus('map')` first; the parked offer cards are now registered menus)
- [x] The card comes back as it normally would after the map closes (the next brake pull; the smoke's offer step now does M, sees the card gone, closes the map, re-parks and takes the job)

## Files
`src/main.js` (`_menu('offers', …)`, `_closeMenus(except)`, the M handler and the tutorial's M-tap) · `test/cdp-smoke.mjs` (offer step)

## Log
- 2026-11-16: filed from the owner's inbox note.
- 2026-11-16 (lane C, land/map-batch): the offer cards (a giver's, Larry's route; not the tutorial scenario's round, not a no-POI quick job) register in BUG-183's `_menus`, so every transition closes them too. The map the OFFER opens (route preview behind the card, mission.js `_setMapOpen`) is unchanged; only the player's own open shuts menus. Interpretation, owner to confirm: "the POI card" = the parked offer card, plus the pump / shop / camp / recovery menus, which `_closeMenus('map')` also shuts.
- 2026-11-16: smoke `boot,story,offer` PASS (28.4 s story + 13 s offer on a loaded box). Picture: wip/map-batch/poi-map.png (map open at the parked giver, no card). A bare unpark-and-park in place needs ~1.5 s between the two for the 10 Hz poll to see the edge; a shop-type giver opens its shop screen first, then Jobs.
