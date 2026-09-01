---
id: QUAL-26
type: quality
status: open
opened: 2026-08-27
severity: minor
source: BUG-56 workstream A — A0 measured, A1 built and reverted; owner ruling 2026-08-27
  ("taper bands look pretty good right now… document it as an OPTIONAL direction")
relates_to: BUG-56 (the fork/merge pass that made the bands good enough to defer this),
  QUAL-19 (heading-gate Architecture A — DISPROVEN, do not re-attempt),
  PERF-27 (cold load — this is the budget the cost lands in),
  src/corridor-router.js (its purity contract is what this changes)
---

# QUAL-26: Sibling-clearance routing — fewer taper bands, if we ever need them

## ⚑ OPTIONAL. Do not build this speculatively.

**Owner ruling 2026-08-27: the taper bands look good enough now, so this is banked, not scheduled.**
BUG-56's B4/B5/B6/B3 made the bands themselves acceptable — median band radius 23.3 m → **33.4 m**,
camber matched through the departure (roll residual median 0.0°), departure grade capped, and the
seam bounded where the pavements touch. This ticket is what to do **if band smoothness becomes a
problem again**, not a queued improvement.

**The trigger to open it:** taper-band smoothness is unacceptable *and* the band geometry itself has
already been tuned. That ordering matters — the band is the patch, and this ticket removes the need
for the patch rather than improving it.

## The idea, in one line

A taper band is a downstream patch for a **routing** decision. Two edges leave one node and stay
inside `mergeProxM` (18 m) for 76–96 m; at that separation their cut/fill stencils write into the
same terrain vertices, which is the tear class merges exist to kill. Price the decision instead of
patching its consequence.

## Why it is worth having — A0's measurement (2026-08-27, do not re-derive)

Every one of the 59 departures in the road battery, re-routed with the winner's corridor priced as
occupied within `mergeProxM`:

| | |
|---|---|
| still connects at all | **59 / 59 (100 %)** |
| …and the profile is still feasible | 59 / 59 (100 %) |
| …and it now leaves the winner clear | **49 / 59 (83 %)** |
| length cost of the detour | median **1.00×**, 75th 1.01×, worst 1.30× |
| no route at all once the winner is occupied | **0** |

So the hugs are avoidable, and avoiding them is essentially free in road length. Only 10 of 59 are
genuinely unavoidable — both roads reaching the same valley through the same pass.

## What was ALREADY TRIED and does not work — read this before starting

**A cheap proxy for the sibling does nothing.** The purity-preserving design prices each sibling's
**chord** from the shared node (pure graph data, so no edge depends on another edge's route, the
per-edge route cache keeps its key, the Worker pre-warm keeps its parallelism, and window invariance
stays structural). It was built, swept over the whole battery, and measured:

| `wSibling` | runs | km | merges | departures |
|---|---|---|---|---|
| 0 | 254 | 196 | 35 | **35** |
| 1 | 255 | 197 | 35 | **35** |
| 2 | 255 | 197 | 34 | **34** |
| 4 | 256 | 198 | 35 | **35** |
| 8 | 256 | 198 | 34 | **34** |

No effect at any weight. The chord is simply not where the sibling's road is: the hug happens where
both roads follow the same **valley**, and a straight chord from the node leaves that valley
immediately. A0 worked because it priced the sibling's REAL corridor. The implementation was
reverted rather than shipped as an inert knob — nothing of it survives in `src/`.

**Do not re-attempt a heading pin either.** QUAL-19's heading-gate Architecture A is DISPROVEN and
the 2026-08-25 exit-heading ruling was measured wrong. The fan-out at a node must be EMERGENT
(`[[feedback_emergent_over_injected]]`) — this is a COST, never a pin.

## The design that would work

**Two passes, the second one targeted.**

1. **Pass 1** — route every edge with no sibling term. Exactly today's behaviour, unchanged.
2. **Detect the hugs** from pass-1 geometry. This is not new work: the merge planner already
   computes precisely this to decide where a taper band goes.
3. **Pass 2** — re-route only the **losers** of pairs that actually hug, pricing the winner's
   PASS-1 corridor as expensive within `mergeProxM`. The winner keeps its pass-1 route.

**Determinism survives, and structurally rather than by proof.** Pass-1 routes are a pure function
of each edge alone, so "which pairs hug" is a pure function of the graph, so the pass-2 set is too.
No ordering, no cycles. Both passes still parallelise fully across the worker pool. The router's
stated contract grows only by "…and the canonical incident set at each endpoint", which is the same
graph data `_v2EdgeDirs` already relies on being window-invariant.

## The cost, and what is NOT measured

**Estimated ~1.15× route time** — pass 1 for everything (1×) plus pass 2 for the ~16 % of runs that
carry a departure (67 departures against 412 registered runs in the battery). Cold routing today is
~17 s for a 2.8 km story region and ~114 s for the 12 km play area, single-threaded headless; the
game runs 2–4 workers, so the real wall-clock is lower. 15 % on top of that is small.

**An earlier note in this project's history said 2×. That was the naive framing** — route everything
twice — and it is wrong as a cost estimate. Recorded here so the bigger number does not get quoted
back as the reason not to do this.

**Two things genuinely unmeasured, so treat 1.15× as an estimate and not a result:**

- whether a re-routed loser creates NEW hugs that would want a third pass (cap at two and accept the
  residue, but the size of that residue is unknown);
- the end-to-end number on a built two-pass router — the 16 % comes from the departure census, not
  from running the thing.

## Acceptance

- Departures (taper bands) across the road battery fall substantially — A0's ceiling is 83 %, so
  anything under ~40 % of the reduction A0 promises means the implementation is not capturing it.
- `test/junction-stitch.mjs` improves, and its fork rows in particular.
- **No regression in connectivity**: `test/crossing-rung-parity.mjs` stays at one component per
  window and deletions do not rise. This outranks the band count — BUG-56 measured that losing a
  merge can split a network (seed 7).
- `restream-invariance`, `world-determinism`, `road-worker-parity` and `graph-topology`'s
  window-invariance check all stay green — these are the three the purity change puts at risk.
- Route time measured before and after, and reported. If it lands materially above ~1.3×, that is a
  finding worth surfacing rather than absorbing.
- The route cache is re-baked (`test/bake-route-bundle.mjs`) — every route changes.

## Where the detail lives

`.planning/HANDOFF-2026-08-27-BUG-56-build.md` — "The A decision" section, with the full A0 table
and the sweep that killed the cheap version.

## Status 2026-09-01 — the NARROW cost (R5) shipped; this ticket stays banked

The owner's R5 ruling ("a narrow sibling-departure cost, and nothing wider") landed on
`feature/corridor-router` (`e97d611`): sibling BEARINGS ride the edge spec and `corridorSearch`
prices departures within `sibConeDeg` of one on the demoted rungs only (`wSibDepart`, `sibReachM`
knobs in `roadV2`). That is deliberately NOT this ticket's full two-pass — corridors are still not
priced as occupied. Re-measure the demoted-rung population after the corridor-router branch merges;
this ticket's scope is what remains.
