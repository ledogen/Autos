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
Cause: `_promiseRows` in `src/main.js` printed `${mm}` unpadded (the font is monospace, so only the digit count matters). Fix: minutes padded to two digits, and `font-variant-numeric: tabular-nums` on the box. Only that line's text changed; the overlay's HTML was already written only when it differs (`_jpHtml`).

## Tracker
- [x] Clock line keeps one width
- [ ] Browser check: the Reward row's box does not move across 5 ticks
- [ ] Owner look

## Open questions
- If the stutter you saw was a vertical jump, say so: the Clock row appears and goes away once, which moves the rows below it by 22 px.

## Files
`src/main.js` (_promiseRows) · `index.html`

## Log
- 2026-11-19: fix on land/notes-1119b (not landed).
