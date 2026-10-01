---
id: BUG-70
type: bug
status: closed
severity: minor
opened: 2026-09-20
closed: 2026-09-29
resolution: wont-fix (owner ruling — playable residue, accepted)
source: >
  road-clearance residue after BUG-66's B7 departure test (feature/bug-65-66, 2026-09-14).
  Battery row: seed 3 (1976,−889), 27.8 m vs a 28.5 m rule over 16 m with 8 m of height,
  470 m from the shared node 2,−1,2. BUG-66's frontmatter called this "a graph node with the
  same shape" — that was a misread of the row; it is not a junction mouth.
relates_to: BUG-66 (closed — B7 is mouth-bounded and never sees this),
  the 2026-09-10 re-convergence cull rung (_v2ConflictPairs / _v2DeleteFor / _v2DetourSafe),
  FEAT-77
---

# BUG-70 — two legs of one node re-converge 470 m out and the cull rung does not take them

## What happens

Seed 3's legs off node 2,−1,2 part normally, run apart, and then come back together at
(1976,−889): 27.8–28.2 m apart over 16 m with 8 m of height between the decks, against a 28.5 m
rule. That is the **re-convergence** class the 2026-09-10 rung was built for — but the rung does not
fire here.

Two candidate reasons, neither confirmed:

1. **The interval test.** `_v2ConflictPairs` emits `reconverge` only for a shared-node pair whose
   interval inside the rule is ≥ 60 m and starts past the geometric throat. This one is 16 m, so it
   never becomes a candidate at all.
2. **The detour test.** Even if it were emitted, `_v2DeleteFor` culls only when `_v2DetourSafe`
   finds a ≤ 4-hop detour in the wide graph without the longer member. Unchecked here.

If (1) is the whole story, the fix is a threshold question and needs care: the 60 m floor is what
keeps the rung from eating short marginal overlaps, and the owner's standing ruling is that a T
always beats no T — culling an edge is the heaviest possible response to a 16 m pinch. The
mid-span planner is the other lever: two legs that re-converge for 16 m at 8 m of height may want
a T out there rather than a deletion.

## Owner's read, 2026-09-20

Same as BUG-69 — technically a violation, playable as is. Minor. The gate stays red on it (no
length threshold, no report-only, per 2026-09-14).

## Acceptance

- [ ] seed 3 (1976,−889) clears 28.5 m, or is culled/T'd with the connectivity test satisfied
- [ ] the 60 m interval floor, if changed, is re-measured against the battery: no T lost
      (`promoted-node-id` core count 19), no connectivity regression
- [ ] `junction-stitch`, `restream-invariance`, `world-determinism`, `road-connectivity`,
      `mission-network` green

## Resolution 2026-09-29 — closed by the owner, no code change

Closed as **accepted residue**, not fixed. The seed 3 (1976,−889) row is exactly as the ticket
describes: a 16 m re-convergence pinch at 27.8 m against the 28.5 m rule, below the cull rung's
60 m interval floor, so the rung never sees it. Neither candidate reason was pursued because the
owner's 2026-09-20 read stands — technically a violation, playable as is — and the two levers on
offer (lowering the 60 m floor, or a mid-span T out there) each risk more than a 0.7 m pinch costs:
the floor is what keeps the rung from eating short marginal overlaps, and a T always beats no T
(2026-09-07 ruling), so deleting a leg over 16 m is the wrong-sized response.

Consequence for the gates: `road-clearance` stays red on its "seed3 origin" row with no open
ticket behind it (the "lone-pine spawn" row is BUG-69, still open). Per the 2026-09-14 ruling the
gate carries no length threshold and no report-only mode, so the red is the intended record of
this accepted pinch. If that ever becomes a nuisance, the decision to revisit is the owner's.
