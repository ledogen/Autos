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

---

## Status 2026-09-07 — junction-stitch's remaining 80, decomposed. THE PREMISE HAS MOVED.

`junction-stitch` is the last red gate in the suite (67 of 68 green). BUG-56 booked that red here at
its close — *"both now QUAL-26's subject (two roads routed to the same ground)"* — so this is where
the measurement belongs. It was 105 sites then; R1–R8, FEAT-76 and QUAL-30 have taken it to **80**.

### Read this first: two thirds of this ticket's framing is obsolete

**Taper bands no longer exist.** QUAL-30 (2026-09-06) deleted `_v2BuildTaper` and the whole band
ladder; FEAT-76 replaced the wye with a T promotion where the side road simply does not exist over
the shared ground. So:

- the ⚑ OPTIONAL trigger above — *"taper-band smoothness is unacceptable and the band geometry has
  already been tuned"* — **can never fire.** There is no band to be unsatisfied with.
- the first acceptance bullet — *"departures (taper bands) across the road battery fall
  substantially"* — measures a quantity that is now always zero.
- the last acceptance bullet — *"the route cache is re-baked"* — the bake subsystem was deleted
  2026-08-19. Void.

What survives untouched is the **A0 measurement** (49 of 59 hugs avoidable at median 1.00× length)
and the **two-pass design**, both of which are about ROUTING and are unaffected by the wye's removal.

### What the 80 actually are (measured 2026-09-07, do not re-derive)

79 of 80 are `leg/edge` — two legs of the SAME junction — and one is `midspan/edge`:

| | |
|---|---|
| distance from the node | 10–28 m, **median 12** (the gate's ruled pad bar is 10 m) |
| edge separation | 0.0–2.1 m, **median 0.5** — the pavements are touching |
| deck gap across that contact | 0.25–6.40 m, **median 2.13** |
| overshoot past what the ground can slope | **median 1.64 m**, max 6.00 |

Worst reproducers: seed 11 (−1756, −266) at 6.40 m; seed 20 (−467, −341) at 6.19 m.

**Three candidate causes ruled out, with numbers:**

- **NOT the undersized pads of BUG-59.** The 10–17 m clustering brackets BUG-59's 13.5 m pad floor
  and looks like the same defect. It is not: the gate's `PADR = 10` is R3's *ruled* bar, explicitly
  "not the built reach", so growing pads improves the world and moves this gate not at all.
- **NOT camber**, despite 43 of 80 carrying reversed bank. Camber explains **11 % of the gap at the
  median** and more than half of it in only **7 of 80**. This is deck, not banking.
- **NOT the junction blend reach.** Swept live: `roadJunctionBlendLength` 30 (shipped) → **80**,
  45 → **83**, 60 → **81**. Stretching it is *worse* — it does not make two legs agree with each
  other, it only moves where each one sits, and it flattens more road so fresh pairs open.

### The mechanism

`_applyJunctionBlend` eases **each leg individually** toward a grade line (`nodeY + slopeAway·d`).
**Nothing anywhere bounds the PAIR.** At 12 m the smoothstep is ~65 % applied, so each leg still
carries ~35 % of its own solved profile; where two legs' own profiles differ by several metres that
residual is the ~1.6 m median overshoot — exactly where their edges are in contact.

### So there are now TWO candidate fixes, not one. This is an owner decision.

1. **This ticket's design — stop them sharing the ground.** Two-pass routing, losers re-routed with
   the winner's pass-1 corridor priced as occupied. A0 says 49 of 59 hugs are avoidable at median
   1.00× length. It would remove the touching pavements, so the deck question never arises.
   **It moves roads**, which is the whole reason it was banked.

   Its cost estimate is now *stale in this ticket's favour*: the ~1.15× was written when routing was
   the expensive half of world build. It no longer is. FEAT-76 took the seed-6 network from 41 s to
   5 s headless, `bench-worldgen` puts a cold r1400 network at 1.4–2.0 s per seed, and the
   2026-09-07 cold-load re-baseline (PERF-27) found **two thirds of the remaining 33 s is terrain,
   not routing**. A 15 % surcharge on the cheap half is smaller than it was when this was banked.

2. **A rule nobody has written down — let them share, but bound the divergence.** Apply BUG-56's own
   **B3 seam rule** (two decks may not diverge faster than the ground between them can slope)
   **pairwise at junction legs**, which it has never been. FEAT-76 already ports exactly this rule
   for T departures, where it is what makes a promoted T's departure honest; ordinary legs of a node
   have never been subject to it. The profile solve would treat a node's legs as a system: pin them
   jointly while their edges overlap, or price the divergence so the plan layer moves one.
   **This moves no road in plan**, which fits the owner's standing position that sharing is correct
   and emergent (FEAT-76's rejected reuse discount).

The measurement above points at (2) as the direct cause and (1) as an upstream fix that also works.
**Which one to build — or whether the 80 are worth building anything for — is the owner's call, and
is deliberately not answered here.**
