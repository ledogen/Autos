---
id: FEAT-271
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "We should remove the new stock timers that show up under a POI's icon. I think it's clutter. In the hover menu for firewood, instead of available for,…"
relates: FEAT-137, FEAT-259, FEAT-272, FEAT-273, FEAT-210, data/map-icons.js
---
lane: Places and Missions

# FEAT-271: Remove the new-stock timers under a POI icon

## Next steps
A lane removes the label (map/list).

## Summary
The new-stock countdown shown under a POI icon is clutter. Remove it.

## Description
Owner's words, verbatim (inbox 20261118010708-kmdu):

> We should remove the new stock timers that show up under a POI's icon. I think it's clutter. In the hover menu for firewood, instead of available for, I think it should say new stock in. Since Firewood is always available, even after that timer expires. I also think we should change Larry and the firewood vendor to yellow/purple Backgrounds so they each get their own color. Then put the P in Larry's diamond up top on the mission card and the firewood one can still say haul so we have a consistent style across the map.

Part of one owner message (inbox 20261118010708-kmdu) split into three asks: FEAT-271, FEAT-272, FEAT-273.

## Tracker
- [x] No new-stock timer under any POI icon on the map

## Decisions

## Open questions

## Links
FEAT-137, FEAT-259, FEAT-272, FEAT-273, FEAT-210, data/map-icons.js

## Files
src/map*.js · data/map-icons.js

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261118010708-kmdu).
- 2026-11-17 ui-1117b: the under-icon stock timer is gone from the map (status().nextText retired too). Look pending.
