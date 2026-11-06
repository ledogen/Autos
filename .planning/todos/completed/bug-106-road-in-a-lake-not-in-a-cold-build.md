---
id: BUG-106
type: bug
status: closed — fixed 2026-11-06 (Spare)
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

## Resolution — Spare, 2026-11-06 (`b3d468a0` fix, `7a0e8aaf` gate leg)

**BUG-105 did not change it.** On today's main a cold build still has no road at the mark.

**Cause: the network worker's warm instance kept the FIRST build's pond discs.**
- `makeNetworkInstance(req)` installed the pond no-go from that request's discs: its window plus `pondDiscPad`,
  about 3.3 km.
- The worker reuses the instance for every later build of the same epoch, seed and params, and
  `buildNetworkSnapshot` re-applied only radius and centre.
- The capture's whole session was route epoch 1: 14 teleports, ending ~50 km from the first build at (−7571, 4361).
  So the build at the mark routed with **no ponds at all** and drew a road through a lake.
- **Reproduced exactly** (`wip/bug-106/repro.mjs`): an instance first built at the session start, reused at the
  mark, draws `g:-57,72,1:-57,73,2` 0.8 m from the mark, the run key the capture recorded. A cold build and a fresh
  instance have no road within 611 m.

**Fix (`src/road-network-worker.js`).**
- Each instance's no-go reads a disc set that grows: every build adds its request's discs, de-duplicated, before
  the pre-warm routes the window.
- Exact: each build's discs are complete for every query it makes (`pondDiscPad`). A disc added later is a pond that
  touched no earlier box, so no answer an earlier build or its cached routes relied on changes.
- `setWaterNoGo` is not re-called, because it would drop the warm caches.
- The no-go is now installed even when the first request has no discs.
- After the fix, the reused instance equals the cold build at the mark.

**Pinned:** `network-worker-parity` has a leg with the owner's history: one warm instance first built 50 km away
must equal a cold build at the capture's mark. Negative-controlled: on the unfixed worker it fails with
`g:-57,72,1:-57,73,2` and `g:-57,72,1:-56,73,1`. All 18 checks pass. The affected gates are green, and the smoke
passed 25/25 twice (one flaky `pad` failure before that, which did not repeat).

**Scope:** any session that moved more than ~3.3 km from its first build (free roam with teleports or long drives;
the map and mission clients too) was routing without ponds. Story regions built near the first build were safe.
