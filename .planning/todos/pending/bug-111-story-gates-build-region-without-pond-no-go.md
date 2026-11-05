---
id: BUG-111
type: bug
status: open
severity: minor
opened: 2026-11-05
source: Spare, found while fixing BUG-110 (feature/spare a2c5173c)
relates: BUG-110 (the spawn replica now injects the pond no-go; this is the region network's half), main.js setWaterNoGo
---
lane: Spare

# BUG-111: story gates build their region network without the pond no-go

A test-harness fidelity gap, not a game bug. main.js injects the pond no-go (`setWaterNoGo`) before the
first stream, so the game's roads route around ponds. BUG-110 made the headless spawn replica do the same.
The gates' REGION networks still don't: world-determinism, region-pieces, expedition-camp,
demolition-site and camp-edge-census. So near a pond, the roads they measure aren't the game's.

Wiring it in moves what those gates measure, so it is its own pass. Each gate's pins get re-read and
re-justified, never bumped blind.

## Acceptance

- [ ] Every story gate's region network is built with the game's pond no-go (one shared helper, not five copies).
- [ ] Each gate's moved pins are listed with old → new and why, in this ticket.
- [ ] All five gates green.
