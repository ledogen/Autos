---
id: BUG-170
type: bug
status: open
severity: minor
opened: 2026-11-14
source: owner, 2026-11-14 inbox — "Got stuck in the tutorial again mom says Go ahead and patch the tire. This one's on me, but The cart system says I'm five dollars short so I…"
relates: FEAT-212, FEAT-213, FEAT-217, src/service.js
---
lane: B

# BUG-170: Maintenance and Shop tabs: an element is a few pixels too wide (horizontal scrollbar)

## Next steps
Lane B finds the over-wide element. (The $5-short soft lock from the same note is in FEAT-217.)

## Summary
In the auto shop, the Maintenance and Shop tabs show a horizontal scrollbar that moves about 5 px in total. The Jobs tab does not. Some element is slightly too wide.

## Description
Inbox 526f:
> Got stuck in the tutorial again mom says Go ahead and patch the tire. This one's on me, but The cart system says I'm five dollars short so I can't check out. Also Some element inside the maintenance tab and shop tab are slightly too wide so i get a system horizontal scroll bar that translates like 5 total pixels. It doesn't appear on the jobs tab

## Tracker
- [ ] No horizontal scrollbar on the Maintenance or Shop tabs at the owner's canvas size and at other sizes

## Files
`src/service.js` · `index.html` (styles)

## Log
- 2026-11-14: minted from the owner's inbox by the scribe. Nothing built.
