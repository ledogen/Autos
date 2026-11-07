---
id: BUG-124
type: bug
status: open
opened: 2026-11-07
severity: critical
source: Lane B, chasing a cdp-smoke 'pad' miss after FEAT-178, reported to the orchestrator 2026-11-07
owner: Lane A (the opening's first job, FEAT-147/170, BUG-117)
relates_to: BUG-117 (every other job waits for the casserole, which makes this run-blocking), FEAT-170 (the tutorial
  evening and its skip), FEAT-147 (mom's job → the courier to Larry)
---

# BUG-124: on some worlds mom's casserole can't be planned, so the run can't start

## What happens

On world 2646203056 (seen as `2646203056/K`), `missionSystem.planOffer` returns null for mom's first offer (the
casserole to Larry's): every `_roll` fails, the mission error reads "no route found for any offer here", and the
offer is dropped. The opening can't be taken, played or skipped (View hold / M). Since BUG-117 every other job
waits for the casserole, so on such a world the run is blocked from the start.

## Evidence (Lane B, `CarGame-machine/wip/feat-178/probe-skip.mjs <port> <seed> [runs]`, run through the slot)

- Main 7b6fa35a: 3/3 not taken. The truck seats fine at mom's (upright, parked, 2.80 m from her marker); the
  board's first state stays 'live' with 1 offer; the mission is 'idle'.
- Main with 8a7f1d3a reverted: 2/2 not taken. Main before FEAT-178 (e3feee76^1): 2/2 not taken. Not caused by
  FEAT-178; deterministic for this world.
- Path: `_skipOpening` → `_takeFirstJob` → `enterFromPoi` → `_planOne` → `planOffer` → null.
- The smoke's pad step uses a blank (random) seed, so it hit this world by chance: ~1 smoke in 4 recently.

## Not yet known

Why no route mom → Larry's is found here: the `_roll` / destWish constraints, or road connectivity between the
two POIs (both should be in the story region's main piece).

## Acceptance

- [ ] Root cause named on 2646203056.
- [ ] A census on random seeds (≥ 50): how many worlds can't plan the casserole, before and after.
- [ ] The casserole always plans (a constructive guarantee where it is placed, not a retry), or the opening has a
      fallback that never blocks the run.
- [ ] A gate pins it on a random-seed sample (reported as a sample), and the smoke's pad step stops missing.
