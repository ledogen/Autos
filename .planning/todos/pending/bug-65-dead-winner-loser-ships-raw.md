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

## State on main @ 9bf4545 (2026-09-14)

One row left: seed 6 mark-B (−3040,4908), 13.2 m over 84 m with 6.1 m of height. The seed 11
(1385,−1170) row went away when the pass-2 loser walk kept the fixed throat (variant B of the
2026-09-10 pass) — its planned winner is no longer deleted there, so the plan holds. Same mechanism
elsewhere, from the nine fresh windows of 2026-09-11: seed 90 (−837,1618) is a planned pair whose
T probe answers "no T" three times and ships raw (88 m at 16 m, 17.7 m of height); seed 526302544
(−736,−308) is two legs of node −1,−1,0 with NO plan at all (80 m at 11 m) and may be a sibling
class; seed 67 (−1688,165) is a promoted side road hugging its sibling near its far node (28 m).

## Pictures

- Seed 6 (−3040,4908) overhead + plan drawing (the arms of a switchback whose apex is the node):
  https://claude.ai/code/artifact/28c7b3aa-0137-44ec-a97d-a9b235a41ad2

## Cost estimate

A re-plan pass touches only nodes with a dead planned winner — two or three per window. Each is a
node plan (~2 ms) plus one T probe (~40 ms, measured on seed 11), so 50–150 ms on a 6–7 s build:
1–2 %. The memo (`_v2MergeMemo`, keyed by node) needs a second key for the re-plan so the first
pass's answer is not returned.

## Acceptance

- [ ] seed 6 mark-B (−3040,4908) gone from `road-clearance` (seed 11 (1385,−1170) already is); seed 90 (−837,1618) too if it is the same mechanism
- [ ] `junction-stitch` stays green
- [ ] `promoted-node-id`, `restream-invariance`, `world-determinism`, `road-connectivity` green

## Ruling 2026-09-14 (owner) and what it did not cover

The owner exempted the two arms of a SWITCHBACK from the clearance rule (legs of one node that
leave it within ~30° of each other are one road doubling back). `test/road-clearance.mjs` now
carries that exemption (`HAIRPIN_DEG` 30, bearing over the first 24 m). Measured, the seed 6
(−3040, 4908) pair does not meet it: its arms leave the apex 43° apart (5.8 m apart at 4 m out,
24.7 m at 40 m) and then PINCH back to 19.8 m at 80 m as the −5,6,1 leg curls toward its sibling.
So this row stays, it is still the dead-winner mechanism above, and the gate stays red on it —
the owner's rule is "true clearance is necessary to enforce; leave red or fix verifiably".
