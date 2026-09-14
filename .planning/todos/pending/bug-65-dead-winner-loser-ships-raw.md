---
id: BUG-65
type: bug
status: pending
severity: medium
opened: 2026-09-10
source: >
  road-clearance / junction-stitch residue after the 2026-09-10 pass (seed 6 mark-B (−3040,4908),
  seed 11 origin (1385,−1170)) — traced in the merge planner's skip log.
---

# BUG-65 — a loser whose winner dies ships raw, and hugs the THIRD leg

## What happens

At a node with three legs that leave together (seed 6 node −5,7,1: legs to −5,6,1, −5,8,1, −6,8,2;
seed 11 node 1,−2,0: legs to 2,−3,2, 3,−2,1, 2,−1,1), `_v2NodeMerges` assigns roles first-come:
leg A loses to winner W; the pair (A, third leg C) is then skipped with `role: A would cede to C`.
The T for (A, W) probes fine. Then the CROSSING RUNG deletes W (`_v2DeleteFor`: W crosses C,
W is the longer member). The plan for A still names the dead W; `_v2PromoteOne` finds no trunk
and A ships on its pure line — which runs 13 m (seed 6, 84 m long) / 1.9 m (seed 11, 88 m long)
from C, the leg it was never planned against. `road-clearance` and `junction-stitch` both report
it. The code already names the class: "the dead-winner rule can void a plan at assembly after this
layer sanctioned by it … Known residue, deterministic and censused".

## Why it is not a one-liner

Plans are pure per node and must not read delete verdicts (`_v2DeleteFor` reads plans through
`_v2CededExtents` — reading back would be a cycle). The natural fix is a SECOND plan pass after
the delete set is frozen (R4 `_v2DelFrozen`): re-plan every node one of whose planned winners
died, with the dead edges in the node's `drop` set, so the loser pairs with the next sibling.
`_v2MergeMemo` is keyed by node only — the re-plan needs its own key (node + dead set) or a
memo bump. Alternatively the role pass could rank winners by "survives the crossing invariant",
but that is the same cycle by another name.

## Acceptance

- [ ] seed 6 mark-B (−3040,4908) and seed 11 origin (1385,−1170) gone from `road-clearance`
- [ ] seed 11 (1385,−1172) gone from `junction-stitch`
- [ ] `promoted-node-id`, `restream-invariance`, `world-determinism`, `road-connectivity` green

## Ruling 2026-09-14 (owner) and what it did not cover

The owner exempted the two arms of a SWITCHBACK from the clearance rule (legs of one node that
leave it within ~30° of each other are one road doubling back). `test/road-clearance.mjs` now
carries that exemption (`HAIRPIN_DEG` 30, bearing over the first 24 m). Measured, the seed 6
(−3040, 4908) pair does not meet it: its arms leave the apex 43° apart (5.8 m apart at 4 m out,
24.7 m at 40 m) and then PINCH back to 19.8 m at 80 m as the −5,6,1 leg curls toward its sibling.
So this row stays, it is still the dead-winner mechanism above, and the gate stays red on it —
the owner's rule is "true clearance is necessary to enforce; leave red or fix verifiably".
