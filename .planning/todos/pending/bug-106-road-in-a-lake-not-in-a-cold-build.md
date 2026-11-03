---
id: BUG-106
type: bug
status: open
severity: major
opened: 2026-11-03
source: owner capture /Users/ledogen/Downloads/autos-capture-1793661649555.json (seed 163384989, free roam, mark
  (−36091, 46673)) — "road in a lake". Owner, 2026-11-03: "document this as another thing we need to fix, also on main"
relates: SM-INV / feedback "every world generated COLD" (a world must not depend on how the player got there),
  src/road-network-client.js (network adoption), PERF-30 (the network worker), the pond discs
  (network-worker-parity), test/restream-invariance.mjs
---

# BUG-106 — a road runs through a lake, and a cold build has no road there

## What the capture shows (orchestrator probe, 2026-11-03)

**The replay does NOT reproduce it.** In the game, the truck stood on run `g:-57,72,1:-57,73,2` at the mark (hit 1,
gradeY 86.05 m, ground 86.09 m). A cold headless build of the same seed and params, centred on the mark, has **no road
at all** there (`node test/replay.mjs <capture>`: hit 0, runKey undefined, 0 on-road points in the region).

So the road the owner saw is not the road a cold build makes. The lake presumably follows the cold rules, and the road
does not. That points at history: the network the game had adopted depended on where the stream centre had been.
- The capture was taken 2.5 s after a 2.4 km teleport: the last stream-centre jump was (−33718, 46989) → (−36091, 46673)
  at t = 403.1 s, and the capture was at 405.6 s.
- Two explanations are possible:
  1. a stale network from the previous window was still adopted at capture time, and its far edge (outside its
     invariant interior) drew a road the new window would not have;
  2. a real window-variance in the network build.
- If (1), it would heal on the next adoption. Whether it healed in game was not checked.

Either way, this breaks the cold-generation rule: what the player sees must not depend on how they got there.

## Measure first

- Re-run the capture's `streamCenterHistory` through the network client headless and see which network was adopted at
  t = 405.6 s, and whether a later adoption removes the road.
- If the road survives adoption, bisect the window: which stream centre puts a run at the mark, and is that run in the
  invariant interior of that window.

## Acceptance

- [ ] The capture's mark gets the same road (or no road) in game as in a cold build, after any teleport history.
- [ ] No road is drawn through a pond or lake: if a road and a lake meet, the road has its causeway (MESH == PHYSICS).
- [ ] restream-invariance / network-worker-parity cover the failing history.
