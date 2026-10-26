---
id: BUG-95
type: bug
status: open
severity: minor
opened: 2026-10-26
source: owner, 2026-10-26 — "When you're already parked and then bring up the camping menu with Z it still says 'Press Space to Park' but it should just open the camping menu"
relates: FEAT-45 (camp), src/main.js _updateParkTriggers / _toggleCampSeek, src/camp.js
---
lane: A

# BUG-95: Z while already parked shows "park to …" instead of opening the camp card

## What

`_updateParkTriggers` (main.js) opens the camp dialogue only on the `pulled` edge — the frame the
brake latches (`parked && !_prevParkedForPoi`). Pressing Z (`_toggleCampSeek`) when the truck is
ALREADY parked arms the hunt and repaints the tent card, which then reads "park to make camp" /
"park to sleep in the truck" at a truck that is parked. The brake has to be released and pulled again.

Fix at the root: when the hunt is armed while parked, treat it as the pull. Simplest: in
`_toggleCampSeek`, after arming, if `vehicleState.parked` reset `_prevParkedForPoi = false` so the
next 10 Hz poll sees a `pulled` edge and runs the existing branch (site → confirm, moms → moms,
else → truck, the same `camp.fast` / `onRoad` guards). No second code path for the dialogue.
If a POI or pump owns the brake there, nothing changes (those branches return first).

## Acceptance

- [ ] Parked on campable ground, press Z: the confirm card opens at once, no "park to" prompt.
- [ ] Parked on the shoulder off camping ground, press Z: the truck-sleep card opens.
- [ ] Parked ON the road ribbon, press Z: the prompt still says "park on the shoulder to sleep in the truck" (no card).
- [ ] Not parked: Z still only arms the hunt (unchanged).
