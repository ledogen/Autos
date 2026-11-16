---
id: BUG-181
type: bug
status: open
severity: minor
opened: 2026-11-15
source: owner, 2026-11-15 — "the "tow takes you to the nearest auto shop" card landed after i got towed."
relates: FEAT-184, BUG-178, src/main.js, data/dialogue.js
---
lane: unplaced

# BUG-181: The tutorial's tow card landed after the tow

## Next steps
Orchestrator: land `land/clock-1116`; owner: replay the worst day's tow.

## Summary
In the tutorial's flat-tire leg, mom's "The tow takes you to the nearest auto shop" card (`tut-tow`) is meant to be read
before the tow is taken. It could arrive after it.

## Description
`_toggleRecovery` opened the recovery menu at once and only QUEUED `tut-tow` (`_tut`). The queue plays one card at a
time (`_pumpTut`: nothing while another card is up), and the spare's card (`tut-spareflat`, "Call a tow: X") is usually
still up when the player presses X, so the tow card waited behind it while the menu's tow button was already live: a
click towed the truck and the card played after, at the shop. Fix: in the evening, while `tut-tow` is unseen, X queues
the card with a `done` that opens the menu; the menu cannot open before the card ends. Seen once (dialogue seen-gate),
so it never shows again. `_towTo` / `_updateParkTriggers` untouched.

## Tracker
- [x] The tow card is up, and the menu is not, after X; the menu opens when the card ends
- [x] cdp-smoke `opening` asserts it (SMOKE_STEPS=boot,opening PASS)
- [ ] Owner replay

## Files
`src/main.js` (`_toggleRecovery`) · `test/cdp-smoke.mjs`

## Log
- 2026-11-15: f26b0d77 on land/clock-1116. SMOKE_STEPS=boot,opening PASS (opening 127 s).
