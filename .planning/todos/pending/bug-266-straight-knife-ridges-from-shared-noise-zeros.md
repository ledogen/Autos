---
id: BUG-266
type: bug
status: open
severity: minor
opened: 2026-11-25
source: orchestrator, 2026-11-25, from the BUG-258 (B) measurement (lane s, branch proto/bug-258-jagged-edges @ 83d1108a)
relates: BUG-258, src/terrain-height.js
---
lane: engine & world

# BUG-266: Dead-straight knife ridges where the noise layers share their zeros

## Next steps
Measure a per-octave offset fix (lane s, measurement only): how many straight ridges go, and how far the raw world moves (streams, ponds, roads, spawn). Then the owner picks, with BUG-258 (B), on a card. A raw-world change: nothing lands without his word.

## Summary
The four coarse noise layers are all zero at the same points. There the ridge term reaches its full height, so the ground forms a straight knife ridge at the full 281 m. One such point is the world origin.

## Description
Found by the BUG-258 (B) agent, not yet reproduced by a second measurement:
- Every world has h(0, 0) = 281.25 m, the full amplitude.
- In 146 of 200 random seeds a straight max-height ridge at least 100 m long runs through the origin. The spawn search starts within 100 m of it.
- The same happens at every lattice vertex of the lowest layer (about a 2 km spacing).
- BUG-258 (B) rounds these ridges; it does not make them less straight.

## Tracker
- [ ] Cause confirmed by a second measurement
- [ ] Fix measured (straight ridges before → after; raw-world shift on ≥ 60 paired regions)
- [ ] Owner's pick
- [ ] Built to the pick, gates + fingerprint

## Decisions
None yet.

## Open questions
- Is a different raw world for every seed acceptable for this? (Owner.)

## Links
BUG-258 · card `bug258-ridges-b-pick`

## Files
`src/terrain-height.js` (`coarseHeight`)

## Log
- 2026-11-25: minted from the BUG-258 (B) agent's report.
