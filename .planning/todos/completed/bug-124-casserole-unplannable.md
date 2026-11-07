---
id: BUG-124
type: bug
status: closed
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

## Root cause (Lane A, 2026-11-07)

**Placement, not road connectivity.** On 2646203056 mom's and Larry's houses sit on the SAME graph edge
(`-1,0,2|0,1,1`, pads @1 and @0, 293 m apart). The planner never ends a job on its start's own edge (`mission.js
_roll`: a candidate with `edgeKey(qa, qb) === srcEdge` is skipped). The casserole's wish is strict to `larry`, which
is one POI, so it had no candidate and every roll came back null.

It happened because `poi.js _assignRoster` fills mom's `nearSpawn` slot first and then Larry's from the pads left
over. A second pad on mom's edge, at least `poiPadSpacing` (250 m) along it, is still free, and it is often among the
pads nearest the spawn.

Reproduced in node (`wip/bug124-probe.mjs` in the Lane A worktree), no browser needed.

## Fix

**Constructive, at placement.** Larry's slot carries `offEdgeOf: 'momsHouse'` (`POI_ROSTER`), and `_assignRoster`
gives an `offEdgeOf` slot no pad on that type's edges. Larry goes to the next pad the near-spawn rule picks.
Everything else in the roster fill is unchanged. The pad Larry left becomes free for the slots below him.

What this guarantees by construction: the own-edge rule can never refuse the casserole again. The census below found
no other way it fails, but that part is a sample, not a guarantee.

## Census (`wip/bug124-census.mjs`: the region built as story entry builds it, the casserole planned as main.js does)

51 worlds: 2646203056 plus 50 random seeds (the list is in the Lane A scratchpad).

- **Before:** the casserole can't be planned on **3 of 51** (2646203056, 1642881374, 2537205496): 2 of the 50 random
  seeds, 4 %. **All three are the same-edge case**, and no world failed any other way.
- **After:** **0 of 51**, and no world puts the two on one edge. Mom's and Larry's houses moved on exactly the three
  worlds that shared an edge, and nowhere else. The casserole now plans there: 1.47 km, 1.73 km and 0.24 km.
- **World fingerprint vs main** (`test/fingerprint-world.mjs`, six windows, including seed 6's and seed 11's story
  windows): 54 of 54 hashes identical. Neither window had Larry on mom's edge.

## Proof

- **Gate `casserole-plans` (heavy, about 90 s alone).** The rule itself: 40 synthetic pools through the real roster
  fill, whose only near-spawn pads share one edge. Larry never takes mom's edge; with the rule removed he takes it in
  40/40 pools. End to end: 2646203056 plus two random seeds per run, printed. These seeds are a sample.
- **Affected gates:** 18 of 18 green (19 selected, cdp-smoke needs the browser).
- **In the browser** (Lane B's `probe-skip.mjs`, through `tools/chrome-slot.sh`): on 2646203056 the skip takes the
  casserole, **2 of 2** runs (staging at mom's, parked, 2.8 m from her marker). Before the fix, Lane B's probe failed
  7 of 7 runs there.

## Checked: other single-destination strict jobs

- **Run-critical, none exposed.** The requisition lines go to the expedition camp only, and the camp's edge is never
  in the pad pool (gated by expedition-camp), so no giver shares it.
- **Not run-critical, exposed.** Six ordinary things wish strictly for a type the region has only one of:
  classNotes → school, deck → office, reel → tackleShop, and cinderBlocks / concrete / jobBox → workSite. A giver on
  that one destination's edge can never post that thing: the offer fails to plan and the giver posts one fewer job.
  It happens on **7 of the 51** census worlds, one giver and one thing each. Placement can't rule it out cheaply,
  because it couples many slots. The general fix would be the planner accepting a same-edge destination (a route
  along the shared road). Reported, not built.

## Acceptance

- [x] Root cause named on 2646203056.
- [x] A census on random seeds (≥ 50): how many worlds can't plan the casserole, before and after.
- [x] The casserole always plans (a constructive guarantee where it is placed, not a retry), or the opening has a
      fallback that never blocks the run.
- [x] A gate pins it on a random-seed sample (reported as a sample), and the smoke's pad step stops missing (its miss
      was this world: the skip takes the casserole there now, 2/2).

## Resolution (orchestrator, 2026-11-07)

Landed on main (merge of aa5ab254): affected 18/18, fingerprint-world 54/54 identical, cdp-smoke 25/25 on main. The
same-edge limit for the six non-critical strict wishes is BUG-125.
