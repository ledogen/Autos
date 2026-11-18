---
id: BUG-226
type: bug
status: open
severity: critical
opened: 2026-11-18
source: lane agent (FEAT-278), 2026-11-18 — found while taking screenshot sheets
relates: FEAT-278, FEAT-292, FEAT-265, BUG-225, src/story.js, src/poi.js, src/road-network-worker.js
---
lane: Engine & world

# BUG-226: The same seed builds a different story world from one run to the next (seeds 914219767, 873064618)

## Next steps
Reproduce, find which input is not a function of the seed, fix at the source, pin with a gate.

## Summary
On main, two of five seeds tried built a different story world on each start: mom's house at (210,470) on one run
and (112,214) on the next, with a different POI roster. Seeds 4182, 77031 and 1018248781 were stable. A seed must
give one world, always (cold generation; "the seed is an absolute determinism machine").

## Description
Found in the browser (the real app, workers on) with `wip/feat-278/roster.mjs <port> <seed>` in
/Users/ledogen/CodeShit/CarGame-land-feat34: it starts a story run on the seed and prints mom's position and the POI
roster. Not known yet: whether the headless (synchronous, no worker) build shows it, when it started (FEAT-265
option 3, FEAT-292 and BUG-225 all changed world build on 11-18), or whether it is a race between the network worker
and the main thread (the order results arrive in) rather than the seed.

## Tracker
- [ ] Reproduced, with the rate on 20+ random seeds.
- [ ] Root cause named.
- [ ] Fixed at the source.
- [ ] A gate pins run-to-run identity.

## Log
- 2026-11-18 minted by the orchestrator from the FEAT-278 agent's report.
