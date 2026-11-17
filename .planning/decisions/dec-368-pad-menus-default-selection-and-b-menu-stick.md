---
id: DEC-368
status: draft
decided: 2026-11-17
area: ui
governs: FEAT-254, src/menu-nav.js, src/gamepad.js, src/hud-menu.js
supersedes:
---
# DEC-368: A menu always opens with a button selected (main menu aside); the B menu takes the left stick

**Ruling.** "Make sure that a button is always selected at default except for the main menu. Warn me if you think some things should default to nothing." And: "Navigating the B menu should be possible to do with the left analog stick as well as d-pad."

**Why.** The camp menu opened with nothing highlighted until the D-pad was pressed (owner's Windows play test).

**Replaces.** Nothing. Narrows the BUG-109 / FEAT-133 rule "a card's first press only places the highlight" to the cards that appear while driving; the cards the player opens parked now wake on their main action (menu-nav.js WAKE_CARDS). DEC-062 stands (no new buttons, no gestures: the stick is a second input for the same walk).

**Source.** Owner, card tutorial-test-drives and inbox 20261117080832-7d3h, 2026-11-17. Status draft: the list of menus that should default to nothing is the owner's call (FEAT-254's audit).
