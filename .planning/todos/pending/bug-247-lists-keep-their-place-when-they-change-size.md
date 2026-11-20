---
id: BUG-247
type: bug
status: open
severity: minor
opened: 2026-11-20
source: owner, 2026-11-20 — "Anytime we're scrolling a list that changes size, we should try to keep the cursor in the same place as the size changes. Otherwise, it's really hard to keep track of where the selected item is. For example, in settings for center softening, when that graph pops open, the whole list moves. So, we should pin the top line of the list. And when it grows to accommodate center softening, it should grow downwards. I previously submitted similar feedback for the auto shop lists, I think."
relates: FEAT-196, FEAT-212, DEC-455, index.html, src/service-screen.js
---
lane: free lane

# BUG-247: Lists keep their place when they change size

## Next steps
Owner looks at the before / after in `wip/followups-1120/ui.jpg` (owed card followups-1120-look).

## Summary
The pause box, the settings page and the shops are vertically centred on the screen, so a row that grows (the centre-softening graph, a shop node that opens) moves the whole list. Their tops are now anchored; the list grows downwards.

## Description
Earlier note: inbox 20261112055232-8l6d, FEAT-196 (the options appear once an item is selected). That made the rows expand, and the card re-centred on each expansion. Cause: `#pause-menu` is `top: 50%; translate(-50%, -50%)`, `#main-menu` is `justify-content: safe center`, `#svc-screen` is `align-items: center`. Fix in index.html and src/service-screen.js CSS.

## Tracker
- [x] Settings (pause box and main menu): the selected row's top y is unchanged when the graph opens and closes
- [x] The shop card: the node row's top y is unchanged when the tree opens
- [ ] Owner look

## Decisions
- 2026-11-20, owner: see DEC-455.

## Files
`index.html` · `src/service-screen.js`

## Log
- 2026-11-20: land/followups-1120.
