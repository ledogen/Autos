---
id: FEAT-307
type: feature
status: closed
severity: minor
opened: 2026-11-19
source: owner, 2026-11-19 — "There should be a confirmation for asking for a toe."
relates: FEAT-50, FEAT-172, DEC-031, DEC-450, src/main.js
---
lane: unplaced

# FEAT-307: Confirm before calling a tow

## Next steps
Owner: look at the card notes-1119b-look. Built on branch land/notes-1119b, not landed.

## Summary
On the Recovery card a tow button (to the gas station, to the service center) now only opens a second face: the tow, its distance, its price, the hours on the hook, "call the tow — $P" and "back". Nothing is spent until "call the tow".

## Description
Same card, same buttons the pad and keyboard already drive (menu-nav focuses the buttons; Esc / B still closes the card, which forgets the ask). The tutorial's tow lesson allows the new buttons. Wording is [DEFAULT]. The tire service (also paid, from the same card) is not changed.

## Tracker
- [x] Tow buttons open a confirm that shows price and time
- [x] Smoke step: asking spends nothing; back returns to the list; the tutorial's tow clicks the confirm
- [ ] Owner look

## Decisions
- 2026-11-19, owner: see DEC-450.

## Open questions
- Read "toe" as "tow". Right?
- Should the tire service call ($ and time too) get the same confirm? Not built.
- Wording ("call the tow — $P", "back") is a [DEFAULT].

## Files
`src/main.js` (_updateRecovery, _RC_ACT, _TUT_TOW) · `test/cdp-smoke.mjs`

## Log
- 2026-11-19: built on land/notes-1119b (not landed). Smoke 41 steps and pad-e2e green on the branch.
