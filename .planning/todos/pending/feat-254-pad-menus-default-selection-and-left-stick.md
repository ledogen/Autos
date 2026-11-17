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
Owner: drive the camp, inventory, damage and shop screens on the pad (branch land/pad-menus), and rule on the cards listed under Open questions (owed card pad-menus-look).

## Summary
Two pad menu fixes from the owner's Windows play test. The audit ruling is under Decisions.

## Description
The main menu is exempt from the default-selection rule (it already opens on its first item, owner 2026-10-25).

### Audit (src/menu-nav.js `menuContainer` / `cardContainer`)
| Menu | Default before | Default after |
|---|---|---|
| Main menu (root, setup, settings) | first item | first item (exempt, unchanged) |
| Pause menu / its settings page | first item | first item |
| Run end, towel confirm, tutorial intro card, story-seed dialog | first item | first item |
| Camp card | none (first D-pad press placed it) | its main action, else first non-text item |
| Inventory screen | none | first slot / main action |
| Damage screen | none | first part |
| Shop (service screen) | none | first button (Jobs when offered), else first row |
| Mission offer card, paper route, scenario finish, recovery card | none | none (unchanged, see Open questions) |
| Result cards (`data-result`) | none; pad keeps driving | none (unchanged) |
| Dialogue card ("press any key") | n/a | n/a |
| B menu (hold B) | top icon, abandon never | unchanged; left stick walks it as the D-pad does |
| Map's side list | first row on open | unchanged |

Mechanism: `wakeMenu` in menu-nav.js (a 100 ms poll) now also wakes `WAKE_CARDS`, and keeps a re-rendered card's highlight at the same index.

## Tracker
- [x] Audit table: every menu, its default selection
- [x] Camp menu opens with a button selected
- [x] B menu navigable by left stick and D-pad
- [x] Owner warned where no default is right
- [ ] Owner look

## Decisions
- 2026-11-17, owner (tutorial-test-drives card): "Some menus don't have a selection by default, for example, in the camping menu First nothing is highlighted until the player presses the d-pad. Do an audit of all UI menus and make sure that a button is always selected at default except for the main menu. Warn me if you think some things should default to nothing"

## Open questions
- Recommend NO default (owner's call): the mission offer card, the paper-route card, the scenario finish card, the fuel recovery card and the result cards. They appear while the truck is moving and the pad keeps driving (A is the manual upshift), so a pre-selected Accept would fire on a shift press.

## Files
`src/menu-nav.js` · `src/gamepad.js` · `test/pad-e2e.mjs` · DEC-368

## Log
- 2026-11-17: built on land/pad-menus; pad-e2e checks the stick walk. Camp / inventory / damage / shop wake not driven by hand.
