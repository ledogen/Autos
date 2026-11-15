---
id: FEAT-222
type: feature
status: closed
severity: minor
opened: 2026-11-14
source: owner, 2026-11-14, card feat207-try note — "all configurable parts should be accessible from debug>vehicle"
relates: FEAT-207, FEAT-212, DEC-206, src/debug-menu.js
---
lane: B

# FEAT-222: Debug > Vehicle: a nested "part selector" that fits parts like the auto shop

## Next steps
Lane B builds it after FEAT-207 lands (the axle ratios are a part it must cover).

## Summary
A new group at the top of debug > vehicle where every configurable part is fitted the way the auto shop would fit it, for quick part testing. When a fitted part drives a slider already in the debug list, the slider updates too, so the owner has a baseline to tune from.

## Description
From the owner's answer on the FEAT-207 card (owed/feat207-try):

> all configurable parts should be accessible from debug>vehicle. i see the final drive box there but we should reorganize the menu so there's a nested "part selector" up top that just fits the components in the same way the auto shop would to expedite part testing. try to make it logically organized and easy to find everything. ideally if a part is manipulating a slider that's already in that list it updates the slider too when fitted so I have a baseline to tune from if necessary.

## Tracker
- [x] A nested "part selector" at the top of debug > vehicle, fitting parts as the auto shop does
- [x] Every configurable part is reachable there, logically grouped and easy to find (final drive, differential, tires, and so on)
- [x] Fitting a part updates the matching existing slider, so it is the baseline to tune from
- [x] Debug-menu reorganisation does not break the existing slider keys or the debug-slider gates

## Files
`src/debug-menu.js` · `data/parts.js`

## Log
- 2026-11-14: minted from the owner's inbox by the scribe. Nothing built.

## Resolution (2026-11-14)
On main via land/feat-222 (3800b84d, merge e607bd5f): debug > Vehicle > Part selector, one dropdown per socket (axle ratios 3.45 / 3.55 / 3.73 / 4.10 included), each pick goes through PartsSystem.fit like the shop (DEC-206). Gates 32/32, smoke on main 26/26 (wip/orch/smoke-1114e.log). Limits: a dropdown does not follow a later shop fit; a pick resets that socket to a new part.
