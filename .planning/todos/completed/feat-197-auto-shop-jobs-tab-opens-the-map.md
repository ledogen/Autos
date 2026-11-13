---
id: FEAT-197
type: feature
status: closed
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

## Resolution (2026-11-13)

Landed on main via land/feat-197 (b42c3392 cherry-picked): the Jobs tab holds one `go to jobs` button; it opens the shop's offers on the offer card over the map; Decline, Esc or pad B returns to the shop on its Jobs tab. 9/9 affected gates green; screenshots in CarGame-land-199/wip/feat-199/shop-*.png.
