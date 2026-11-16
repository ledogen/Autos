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
Map batch agent.

## Summary
Opening the map while parked at a POI should close the POI card; today both show and conflict.

## Tracker
- [ ] Opening the map closes the POI card, parked or not
- [ ] The card comes back as it normally would after the map closes

## Log
- 2026-11-16: filed from the owner's inbox note.
