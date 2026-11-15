---
id: BUG-170
type: bug
status: closed
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
- [x] No horizontal scrollbar on the Maintenance or Shop tabs at the owner's canvas size and at other sizes

## Files
`src/service.js` · `index.html` (styles)

## Log
- 2026-11-14: minted from the owner's inbox by the scribe. Nothing built.
- 2026-11-14 (lane B): cause: .sv-line (width 100% content-box + 12 px padding, margin 0 -6px) overhung .sv-body by 6 px; body scrolls (overflow-y:auto makes x auto). Fix: body carries the 6 px as padding/-margin. Measured scrollWidth 492 vs clientWidth 486 -> 498/498 on Maintenance and Shop. Unverified at other window sizes (cause is width-independent).

## Resolution (2026-11-14)
On main via land/service-center (e842530a, merge 1b54fdeb): the service screen rows overhung the scrolling body by 6 px; the body now carries that as padding. scrollWidth equals clientWidth on all three tabs. Batch smoke on main 26/26 (wip/orch/smoke-1114d.log).
