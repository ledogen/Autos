---
id: FEAT-272
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "We should remove the new stock timers that show up under a POI's icon. I think it's clutter. In the hover menu for firewood, instead of available for,…"
relates: FEAT-271, FEAT-273, FEAT-137
---
lane: Places and Missions

# FEAT-272: Firewood hover says "new stock in", not "available for"

## Next steps
A lane changes the wording.

## Summary
On the firewood vendor's hover card the timer line reads "available for". Firewood is always available, even after the timer, so the line should read "new stock in".

## Description
Owner's words, verbatim (inbox 20261118010708-kmdu):

> We should remove the new stock timers that show up under a POI's icon. I think it's clutter. In the hover menu for firewood, instead of available for, I think it should say new stock in. Since Firewood is always available, even after that timer expires. I also think we should change Larry and the firewood vendor to yellow/purple Backgrounds so they each get their own color. Then put the P in Larry's diamond up top on the mission card and the firewood one can still say haul so we have a consistent style across the map.

Part of one owner message (inbox 20261118010708-kmdu) split into three asks: FEAT-271, FEAT-272, FEAT-273.

## Tracker
- [x] The firewood hover text reads "new stock in <time>" instead of "available for"

## Decisions

## Open questions
- Do other shelf-stock vendors also say "available for"? He named firewood only.

## Links
FEAT-271, FEAT-273, FEAT-137

## Files
the POI hover card (src/main.js, src/map*.js)

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261118010708-kmdu).
- 2026-11-17 ui-1117b: a stock line (firewood yard) says "new stock in:"; test/offer-board.mjs follows. Look pending.
