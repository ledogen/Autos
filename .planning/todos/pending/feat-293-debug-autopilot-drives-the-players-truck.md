---
id: FEAT-293
type: feature
status: open
severity: major
opened: 2026-11-18
source: owner, in chat, 2026-11-18 (DEC-428)
relates: DEC-428, DEC-084, PERF-40, feat-multi-vehicle-ai-traffic, test/lib/autopilot.mjs
---
lane: engine & world

# FEAT-293: Driving AI V1: a debug option that drives the player's truck, random turn at every junction, until any input

## Next steps
Promote the autopilot into src/, add the debug toggle, prove it on gentle roads first, then measure where it fails on steep ones.

## Summary
A debug-panel option hands the truck to the autopilot. It drives the road, takes a random turn at each junction, and drives indefinitely. Any player input takes control back.

## Description
Owner: "Also to add to tonight's pile, I'd like for you to build our testing autopilot into a full-on driving AI. The goal is an option in debug that takes control of my vehicle until I give an input. It should attempt to drive forward down the road and take a random turn at every intersection and just drive forever. I suggest testing on less steep roads at first, because the steep roads in this world are truly challenging. I will mention that I think small ML models are becoming very good. Borderline industry standard for racing games, however I leave the architectural decisions up to you for a V1 proof of concept."

## Tracker
- [ ] Architecture chosen and stated (V1), with what an ML driver would need later
- [ ] Debug option; any input hands control back
- [ ] Drives indefinitely on gentle roads: km between interventions measured
- [ ] Steep roads measured: where and why it fails
- [ ] Gates and the PERF-40 bench still work on the shared autopilot
- [ ] Owner has watched it

## Decisions
DEC-428.

## Open questions

## Links
DEC-084, PERF-40.

## Files
test/lib/autopilot.mjs, src/

## Log
- 2026-11-18 minted by the orchestrator from the owner's chat message.
