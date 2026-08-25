---
id: BUG-57
type: bug
status: open
severity: major
opened: 2026-08-24
source: owner ruling 2026-08-24 (Option 1) on the graph-topology (j) stacks
relates: BUG-55 (the resolution ladder this extends), BUG-56 (the surviving-pair stitching —
  what this ticket deletes, that one reconciles), graph-topology (j)
---

# BUG-57: hairpin-stack tangles fall through to the delete rung

**Owner ruling (2026-08-24):** "Hairpins are desired, but if you zoom out and look at what
these actually are, they're not really hairpins. They're tangled messes of roads that don't
drive nice. They're not even all that tight of corners." Option 1: resolve them through the
BUG-55 merge/suppress ladder. This NARROWS the 2026-08-23 'angle' ruling, it does not repeal
it: >135° pairs still never MERGE (a fork at a reversal is geometric nonsense); angle simply
stops shielding a tear-grade pair from DELETE.

## The three stacks and their measured blockers (seed 6, gate window (4500,600), at `4c72378`)

| # | Pair (shared node) | Tear | Victim (longer) | Blocked by |
|---|---|---|---|---|
| 1 | `3,1,0\|4,1,1 × 3,-1,1\|3,1,0` (3,1,0) | 52 m, gap 7.9 m | `3,-1,1\|3,1,0` | **floor** (52 < 60); NOT angle — the turn is 49° |
| 2 | `4,1,1\|5,1,0 × 3,1,0\|4,1,1` (4,1,1) | 90 m, gap 11.5 m | `3,1,0\|4,1,1` | **angle** (153°) + **bundle shield** (both legs cede to spine `5,0,1\|4,1,1`) |
| 3 | `6,3,0\|6,4,1 × 5,3,2\|6,3,0` (6,3,0) | 94 m, gap 9.2 m, leftover 48 after the covered 46 m merge | `5,3,2\|6,3,0` | **angle** (138°) + **floor** (48 < 60) |

All six member edges reconnect in 5–6 hops — deletion is connectivity-viable everywhere.
Predicted minimal outcome: deleting `3,1,0|4,1,1` clears stacks 1+2 (stack 1's pair
evaporates with it), deleting `5,3,2|6,3,0` clears stack 3. The cluster walk decides the
actual set; with the lowered floor stack 1 may instead/also nominate `3,-1,1|3,1,0` — measure
and show the resulting map before committing.

## The three changes

1. **Lift the angle shield in delete nomination** (`angleExempt` in `_v2DeleteFor`): an
   angle-declined pair that is TEAR-grade proceeds to nomination. Merge stays angle-blocked.
2. **Stack floor** (PENDING OWNER RULING — see ROAD-CLOSEOUT-PLAN.md): shelf-grade tears
   (maxDy ≥ 3 m) nominate at leftover ≥ 30 m instead of 60. LOCKSTEP: the BFS possible-victim
   vetting must widen to the identical geometry-only test (trap #2 — nomination and vetting
   share one floor, always).
3. **Bundle drops a deleted LOSER** — mirror of the shipped dead-winner rule, needed for
   stack 2's victim: today "deleting a bundled leg rips a limb out of a composed junction"
   (measured 87 m carve crease), which is why the bundle shield is absolute. Make the
   assembly/bundle-solve exclude a deleted member's plan (watch acyclicity:
   `_v2DeleteFor → _v2DisjointFor → _v2BundleSolve` must not recurse back into
   `_v2DeleteFor`), then relax the shield to leftover-based.

## Verification

- The three stacks resolve; graph-topology **(j) expected GREEN** (all 217 violating samples
  live in these stacks).
- **Full BUG-55 battery again**: the widened vetting means prior deletions are no longer
  byte-guaranteed — every one of the eleven marks, the six origin probes, and overlap-census
  re-verified; any changed resolution is investigated, not waved through. Cluster-path
  refusals are the expected failure mode and the nest resolver is the safety net.
- Bench A/B (the vetting test runs on more path edges).
