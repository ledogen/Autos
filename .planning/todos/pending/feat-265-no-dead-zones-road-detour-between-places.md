---
id: FEAT-265
type: feature
status: open
severity: major
opened: 2026-11-17
source: owner, 2026-11-17 — "I would consider this a bad seed. ... To go from the food vendor to larrys is simply too far. I feel like it creates a dead zone in the map that a player is less willing to visit because trips in and out of there take so long and that dead zone may not provide a critical service like gas or access to an auto shop."
relates: DEC-070, DEC-064, DEC-054, DEC-053, FEAT-13, src/road-graph.js, src/road.js, src/poi.js
---
lane: engine & world

# FEAT-265: No dead zones — places a long drive apart that are close on the map

## Next steps
World-gen lane (Opus): diagnose the owner's capture and census the measure on random seeds; bring him options as
map sheets. Investigation only; nothing is built until he picks.

## Summary
On seed 3200351065 the drive from the food vendor to Larry's is far longer than the map distance suggests, and the
lower-right third of the region reads as a dead zone: trips in and out take long and it may hold no gas or auto shop.
The owner has "seen enough of these to know it's going to be a problem". He wants it fixed by construction if
possible, not by patching the finished network, and is wary of added world-gen time.

## Description
Capture: `Logs/autos-capture-1794961736544.json` (place capture, story mode, Normal, seed 3200351065, mark x −343,
z 1375).

The owner's own first idea, in his words: "after the road network is generated, we can search for these 'islands'
and generate a road to reconnect them. For example, on this seed there's already a spur near the bottom right gas
station that would not be super costly to connect back up near the auto shop. the main thing i dont like about this
approach is the extra world gen time it adds. Since it doesn't really fix connectivity by construction, it lets the
roads fall out of the algorithm and then tries to patch connectivity. Any other approaches." And: "It may very well
be that gameplay-wise, this seed is just as winnable as any other but as a player I look at it and I say, 'Ooh, I
don't really like this seed.'"

Background (orchestrator, from the code): the network's topology is an Urquhart graph over blue-noise sites
(`src/road-graph.js`: the Delaunay triangulation minus each triangle's longest edge), then a degree cull to 3, then
routing, where an edge that cannot be routed is dropped. The Delaunay triangulation bounds the detour between any
two sites (road distance stays within about 2× the straight line); Urquhart gives that bound up, so long detours
around a missing edge are a known property of the graph family, before the cull, a failed route or the region's
edge removes anything more.

To establish: the measure that matches what he sees (candidates: stretch = road distance ÷ straight-line distance
between places; drive time to the nearest gas / auto shop; the share of the region more than N minutes from both),
which stage removed the edge whose absence makes this dead zone (Urquhart's longest-edge rule, the degree cull, a
failed route, the region boundary), how common it is on random seeds, and what each option costs in build time and
in added road length.

Options to evaluate (none chosen):
- A. His patch: after the network is built, find the worst pairs and route a reconnecting road.
- B. By construction at the topology stage: keep Urquhart, then re-admit the already-computed Delaunay edges whose
  absence leaves a stretch above a limit, shortest first (a bounded-stretch graph). Decided on the abstract graph
  before any road is routed. Must stay window-invariant (identical whatever window the world is generated from).
- C. Change which edge the degree cull drops: the one whose loss lengthens detours least.
- D. Place services by road distance (every part of the region within N minutes of gas and an auto shop): no roads
  added; fixes "no critical service" but not "the trip is long".
- E. Reject a region that fails the measure and regenerate.

Bound by: DEC-070 (connectivity goes up; add options, not roads; keep the network sparse), DEC-064 (no
road-character retune), cold generation only, no standard seeds, world-gen picks shown as screenshot sheets.

## Tracker
- [ ] The capture diagnosed: the stretch food vendor → Larry's, and the stage that removed the missing edge
- [ ] A measure agreed with the owner, censused on ≥ 30 random seeds
- [ ] Options shown as map sheets (before/after per option, same seeds), with build time and added road length
- [ ] The owner's pick built; fingerprint differences explained; a gate on the measure

## Open questions
- DEC-070 says "add options, not roads" and to keep the network sparse. Options A and B add roads. The owner's own
  first idea adds a road, so this may be a deliberate exception: his call.

## Files
`src/road-graph.js` · `src/road.js` · `src/poi.js`

## Log
- 2026-11-17: minted by the orchestrator from the owner's capture and note.
