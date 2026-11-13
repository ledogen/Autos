---
id: FEAT-197
type: feature
status: open
severity: minor
opened: 2026-11-12
source: owner, 2026-11-11 inbox — "When I'm at the auto shop looking at jobs, the jobs tab should just have a single button that says go to jobs. When you select it, it takes you to the map view where you can look at them. Pressing back returns you to the auto shop menu."
relates: [FEAT-167]
---
lane: Spare (the map card and offer board are the orchestrator's / Spare's)

# Auto shop jobs tab: one "go to jobs" button that opens the map

## What

The jobs tab holds a single button, "go to jobs". It opens the map view with the shop's offers. Back returns
to the auto shop menu, not to the world.

## Acceptance

- [ ] The tab shows only the button; select opens the map on the offers; back returns to the shop menu. Pad and mouse.

## Implementation (Spare, land/feat-199, 2026-11-12)

The Jobs tab is one `go to jobs` button. It closes the shop screen and puts up the shop's offers — the offer card over
the map, the same view parking at any giver gives. Decline (the button, Esc, pad B) reopens the shop screen on its Jobs
tab while the truck is still on the lift (main.js `_declineOffer`); Space still releases the brake and drives off.
