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

## Ruled (owner, 2026-10-26)

The first fix (Z while parked = the pull, everywhere) was jarring at a real campsite. The confirm card
moved the camera straight onto the site, with no hunt-card preview of its vibe first. The owner
picked option 1 of three:

- **The cab and mom's door: Z while parked opens the card at once.** The view does not move, so
  nothing is skipped. `_toggleCampSeek` passes `zParked` to `_updateParkTriggers`, which treats it as
  the pull only when there is no campsite.
- **A campsite: Z while parked previews.** The hunt card shows the vibe bar and the ring, and the
  prompt reads **"park again to make camp"**. Releasing and re-pulling the brake commits, as when
  you drive up to a site.
- **Space on a camp card is its back** (Esc / pad B's button, `_cardBackButton`): cancel on the
  confirm card, leave at the truck or mom's, back on the sleep slider. That is just looking at the
  site, saying no thanks, releasing the brake and driving away. **Space never breaks a made camp**:
  the player must pick "break camp" before the camera returns to the truck. Ignored mid-fade and on
  key repeat. Z on a card is unchanged (the tent is hidden while a card is up).

## Acceptance

- [ ] Parked on campable ground, press Z: the hunt card shows the vibe and ring, the prompt says
      "park again to make camp", and the camera stays put. Release and re-pull: the confirm card opens.
- [ ] Parked on the shoulder off camping ground, press Z: the truck-sleep card opens at once.
- [ ] Parked ON the road ribbon, press Z: the prompt still says "park on the shoulder to sleep in the truck" (no card).
- [ ] Not parked: Z still only arms the hunt (unchanged).
- [ ] Space closes the confirm card (cancel) and the truck / mom's card (leave), and steps back from the
      sleep slider. Space on a made camp does nothing.
