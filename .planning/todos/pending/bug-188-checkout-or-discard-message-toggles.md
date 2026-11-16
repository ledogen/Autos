---
id: BUG-188
type: bug
status: open
severity: minor
opened: 2026-11-16
source: owner, 2026-11-16, inbox — "If I just keep hitting B with something in my cart at the auto shop, it shows checkout or discard before you leave, then hides it, then shows it, then hides it every time I press the button. It would be nice if it appeared like an alert, so when you press B for the first time, it shows up checkout or discard before you leave, and then auto hides itself after a second. That way it doesn't seem like something that you're toggling, it seems like A message."
relates: src/main.js, src/alerts.js
---
lane: unplaced (UI, Sonnet)

# BUG-188: "Checkout or discard before you leave" toggles on each B press

## Next steps
A UI lane.

## Summary
At the auto shop with a full cart, each B press shows then hides the message, so it reads as a toggle. The owner wants an alert: the first press shows it, and it hides itself after about a second.

## Tracker
- [ ] First B press shows the message; it hides itself after about 1 s
- [ ] Further presses re-show it and never hide it early
- [ ] Uses the existing alert style (src/alerts.js) if it fits

## Log
- 2026-11-16: filed from the owner's inbox note.
