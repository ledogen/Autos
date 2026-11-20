---
id: BUG-245
type: bug
status: open
severity: minor
opened: 2026-11-19
source: owner, 2026-11-19 — "The mission details overlay when you're running a courier mission. The reward line stutters and moves every time the second timer goes off."
relates: BUG-235, src/main.js, index.html
---
lane: unplaced

# BUG-245: The courier overlay's reward line moves every second

## Next steps
Owner: look at the card notes-1119b-look. Fix on branch land/notes-1119b, not landed.

## Summary
The overlay under the readout (#job-promise) is centred, and its width follows its widest line. The courier's Clock row printed the minutes unpadded ("finish in 9:59 …" then "10:00" or "0:59"), so the box changed width when the minutes crossed a digit and the Reward row in it shifted.

## Description
Two causes, both in `src/main.js`. (1) `_updateJobPromise` rewrote the box's whole `innerHTML` whenever any text changed, which is every second on a courier job (the Clock row counts down), so the Reward row and its icon were destroyed and re-created each tick. (2) `_promiseRows` printed the clock's minutes unpadded, so the box (which is as wide as its widest row) changed width when the minutes gained or lost a digit. Fix: the rows are built only when their label, icon or struck-out state change; the live text and colour are written into the same elements; minutes are padded to two digits; `font-variant-numeric: tabular-nums` on the box.

## Tracker
- [x] Clock line keeps one width
- [x] Browser check (cdp-smoke `offer` step): the box and its rows keep their rectangles and the same elements across 5 ticks; the same step FAILS on the old main.js
- [ ] Owner look

## Open questions
- If the stutter you saw was a vertical jump, say so: the Clock row appears and goes away once, which moves the rows below it by 22 px.

## Files
`src/main.js` (_promiseRows) · `index.html`

## Log
- 2026-11-19: fix on land/notes-1119b (not landed). Old code fails the new smoke check, new code passes. The vertical case (the Clock row appearing once) is unchanged.
