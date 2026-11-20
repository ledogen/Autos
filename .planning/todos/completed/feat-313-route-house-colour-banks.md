---
id: FEAT-313
type: feature
status: closed
severity: minor
opened: 2026-11-20
source: owner, 2026-11-20 — "They're all good to land. My only complaint is the coral color and the teal windows on that house is just a little too eccentric of a color option. Also, whatever happened to using a bank of colors so that even two house models can be recolored to be a different shade?"
relates: ASSET-91, FEAT-295, DEC-454, data/prop-models.js
---
lane: free lane

# FEAT-313: Route houses draw calm colours from a bank

## Next steps
Owner looks at `wip/followups-1120/houses.jpg` (owed card followups-1120-look).

## Summary
The three porch houses landed with one colour each. They now each carry a five-entry recolour bank (siding, trim, roof, door and shutters move together), drawn per (seed, stop). The ranch's default is no longer coral and turquoise.

## Description
`data/prop-models.js`: COTTAGE_PAINT / RANCH_PAINT / CABIN_PAINT, index 0 = the authored .glb colours (test/model-palette.mjs). `src/poi.js` `_routeHouse` returns `variant: hash32('poi-route-house-paint:seed:stopId')`; `src/main.js` passes it to `spawnModel`. The ranch generator colours changed (`porch-houses.py`, RanchSiding putty tan, RanchDoor brick brown) and `ranch-deck.glb` was re-exported headless; cottage and cabin re-exported byte-identical (the export is deterministic).

## Tracker
- [x] A bank of five on each of the three houses
- [x] Ranch default no longer coral / teal
- [x] Two same-model houses differ (sheet)
- [ ] Owner look

## Decisions
- 2026-11-20, owner: see DEC-454.

## Files
`data/prop-models.js` · `src/poi.js` · `src/main.js` · `assets/models/src/porch-houses.py` · `assets/models/ranch-deck.glb`

## Log
- 2026-11-20: land/followups-1120. Sheet wip/followups-1120/houses.jpg (4 draws each, daylight, plus same-model pairs).
- 2026-11-20: land/followups-1120 gates 61/61 green (run-all --serial), cdp-smoke 42/42, pad-e2e ALL OK. Sheets: wip/followups-1120/{houses,ui,arrow}.jpg; the shoot scripts are beside them.
