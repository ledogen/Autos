---
id: FEAT-254
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 — "Navigating the B menu should be possible to do with the left analog stick as well as d-pad."
relates: FEAT-136, src/gamepad.js
---
lane: unplaced

# FEAT-254: Pad menus: something is always selected, and the B menu takes the left stick

## Next steps
A free lane (Sonnet), with the UI bundle: audit every menu for a default selection, add left-stick navigation to the B menu, report any menu where no default is right.

## Summary
Two pad menu fixes from the owner's Windows play test. The audit ruling is under Decisions.

## Description
The main menu is exempt from the default-selection rule.

## Tracker
- [ ] Audit table: every menu, its default selection
- [ ] Camp menu opens with a button selected
- [ ] B menu navigable by left stick and D-pad
- [ ] Owner warned where no default is right

## Decisions
- 2026-11-17, owner (tutorial-test-drives card): "Some menus don't have a selection by default, for example, in the camping menu First nothing is highlighted until the player presses the d-pad. Do an audit of all UI menus and make sure that a button is always selected at default except for the main menu. Warn me if you think some things should default to nothing"
