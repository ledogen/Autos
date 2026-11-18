---
id: BUG-211
type: bug
status: open
severity: major
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "Eating one potato took me to full and then eating another didn't seem to increase my hunger any further. This is on the 8002 dev server."
relates: FEAT-250, FEAT-230, FEAT-283
---
lane: bug (alpha by default)

# BUG-211: Eating a second potato after one took hunger to full changes nothing

## Next steps
Check the satiety counter against the potato's value and the cap.

## Summary
One potato filled the hunger bar and a second one seemed to add nothing. FEAT-250 makes hunger a satiety counter that foods stack into, so this may be the cap, or the stacking not working. Seen on the 8002 dev server.

## Description
Owner's words, verbatim (inbox 20261118062542-4cas):

> Eating one potato took me to full and then eating another didn't seem to increase my hunger any further. This is on the 8002 dev server.

## Tracker
- [ ] A second potato eaten at "full" has a visible, defined effect (more satiety, or a clear "you are full" message)
- [ ] The counter and the bar agree

## Decisions

## Open questions
- Is full a hard cap (eating more wasted) or should the counter go past it? FEAT-250 says foods stack.

## Links
FEAT-250, FEAT-230, FEAT-283

## Files
src/hunger*.js · src/main.js

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261118062542-4cas).
