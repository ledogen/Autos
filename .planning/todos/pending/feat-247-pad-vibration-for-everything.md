---
id: FEAT-247
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 — "I just noticed vibration working for the first time Specifically it's working on 2.4 gigahertz 8-bit doh wireless 2c controller on the 2.4 gigahertz mode on Windows and I felt it on ABS triggering with the ABS setting on. Turned ABS off and it doesn't really vibrate for anything so I don't typically notice it. We should definitely add vibrations for everything. Make a new card to address vibration. Remind me how to reproduce it and then we can begin testing for feel."
relates: BUG-92, FEAT-136, src/gamepad.js
---
lane: unplaced

# FEAT-247: Controller vibration for everything, not only ABS

## Next steps
A free lane (Sonnet): list every rumble source that exists, propose the full set (impacts, landings, wheel slip, rough surface, engine start, damage, tire pop), build it behind one strength slider, and write the owed card with the exact reproduce steps.

## Summary
Rumble works on the owner's 8BitDo 2C (2.4 GHz dongle, Windows) but only ABS triggers it. Add vibration for the rest of the truck's events, then tune by feel with the owner.

## Description
Known working setup: 8BitDo Ultimate 2C, 2.4 GHz mode, Windows, Chrome, ABS setting on, brake hard. BUG-92 (rumble silent) stays open for the setups where nothing is felt.

## Tracker
- [ ] Inventory of rumble sources today
- [ ] New sources built, each with its own strength
- [ ] One master strength setting
- [ ] Owed card says how to reproduce each
- [ ] Owner has tuned the feel
