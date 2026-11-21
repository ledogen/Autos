---
id: FEAT-322
type: feature
status: open
severity: minor
opened: 2026-11-20
source: owner, 2026-11-20 — "the PARK(space) in blue is left over from some really early attempts at the button prompts. update it to match our current style"
relates: FEAT-90, FEAT-125, DEC-431, src/park-badge.js, index.html
---
lane: unplaced

# FEAT-322: The park prompt uses the current keycap style, not the blue PARK badge

## Next steps
Lane c2: shot of the prompt, then close on land/wave2-1120.

## Summary
Every "park to …" prompt led with a blue PARK badge holding the Space keycap (FEAT-90's early look). The other prompts
put the keycap in line with the words ("hold [F] to pump"). The park prompt now does the same: "park [Space] to sleep at
mom's house". Same words, same keycap (keyboard and pad halves), the badge and its CSS deleted.

## Description
`parkPrompt()` in `src/park-badge.js` returns `park ${keycap('Space')} <rest>`; a text that does not start with "park"
gets `park [Space] · ` in front, as before. Deleted: `parkBadge()`, the `.park-badge` rule and `#job-cancel .park-badge`
in `index.html`. The park zone's PARK stencil (`.pz-badge`, owner 2026-10-21) is a different thing and stays; it only
loses the old class it no longer needed.

## Tracker
- [x] parkPrompt draws the shared keycap in line
- [x] The badge's markup and CSS deleted
- [ ] Shot of a park prompt in game

## Files
`src/park-badge.js` · `index.html` · `src/main.js` (comment)

## Log
- 2026-11-20: c2, land/wave2-1120.
