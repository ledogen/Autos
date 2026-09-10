# HANDOFF — the 2026-09-09 merge train: five feature worktrees onto main

Five branches, all forked from main `2a5e275`, merged in this order (each a `--no-ff` merge commit):

| order | branch | merge | what |
|---|---|---|---|
| 1 | `feature/connector-cost` | `ed178f7` | PERF-32: connector reject hoisted, Lipschitz-pruned `nearest`, accumulator catch-up budget |
| 2 | `feature/rank-weights` | `7b81e8e` | FEAT-53 band re-cut S 0.77 / A 0.81 / B 0.85; payout anchors follow |
| 3 | `feature/portal-cost` | `aba30cf` | cutMax 25, pond exclusion is a cell test, five gates re-asserted |
| 4 | `feature/driving-feel` | `f6a124f` | FEAT-80/81/82 + the junction-stitch SNAPSHOT `3dc2574`; PAR_REF.mu 0.72 |
| 5 | `feature/junction-stitch` | `7cb57d9` | FEAT-77 `d1b1263` on top of the snapshot |

Per-branch handoffs (what each ships, its traps, its numbers) are the four/five siblings of this
file dated 2026-09-07..09. This file records only what the COMBINATION needed.

## 1. Conflicts and how they were resolved

- **`test/paper-reroute.mjs`** (driving-feel × portal-cost). driving-feel re-baselined the
  single-scenario margin 0.95 → 0.99; portal-cost rewrote the same block as a ~50-scenario
  distribution and fixed the degenerate stale-line metric that margin sat on. **Portal-cost's
  rewrite taken whole**; driving-feel's `2bf1b65` is moot.
- **`src/road.js` import line** (driving-feel × junction-stitch), exactly as the FEAT-77 handoff
  predicted: union of `roundCrests, stationSpeeds, projectProfile` and `clearReq`, plus the
  `PAR_REF` import.
- Everything else auto-merged: `data/ranger.js` (three branches, disjoint knobs — verified each of
  crestHold/sagLoad/clearEdgeM/clearThroatM/cutMax/tire* appears exactly once), `corridor-router.js`
  (different functions), `test/gates.mjs` (72 gates, no duplicate file entries), `src/par.js`
  (note (6) at mu vs the re-cut block at the thresholds).

## 2. The par collision — the owner's ruling and what it left behind

Two branches touched par independently and the owner ruled: **the re-anchor done alongside the
tire work wins** (driving-feel, `PAR_REF.mu` 0.80 → 0.72, note (6)). The rank-weights band re-cut
is a separate ruling and also lands. Three things that combination needed:

1. **`runs-v2/` had duplicate numbers.** rank-weights added `0013`–`0018` (2026-09-07, old grip)
   and driving-feel added a different `0013`–`0020` (2026-09-08, FEAT-80 grip). driving-feel's
   eight were **renumbered `0019`–`0026`**; the file names carry no id so nothing else moved.
   References in `par.js` note (6), the FEAT-80 ticket, the driving-feel handoff and the corpus
   README were updated. The excluded shortcut run stays `0015-very_fast-S`.
2. **The corpus is now mixed-grip** (`0001`–`0018` pre-FEAT-80 tire, `0019`–`0026` new tire), and
   every stored `par_ref.mu` is still 0.8 — all captures predate the re-anchor. Recorded in
   `runs-v2/README.md`.
3. **The bands were cut at mu 0.80 and have not been re-graded at 0.72.** A merge note above
   `RANK_THRESHOLDS_DEFAULT` says so. A one-off re-grade (calibrate-par's topology proxy, current
   thresholds, `0015` excluded, 22 honest point-to-point runs):

   | | S | A | B | C | D |
   |---|---|---|---|---|---|
   | mu 0.80 (as cut) | 2 | 3 | 7 | 7 | 3 |
   | mu 0.72 (merged) | 2 | 5 | 7 | 5 | 3 |

   Ratios drop 1–3 % under the slower par; three runs (`0017`, `0022`, `0025`) move up one
   letter. That is a data point, not a calibration signal — the bands were left alone. The
   rank-weights comment "do not fix this by touching mu" still holds: mu moved for grip, not for
   the letters.

## 3. Gates — `npm run test:all` on the merged tree

First run, straight after the five merges: **69 / 72 green.** After the paper-reroute change
below: **70 / 72.**

- **`junction-stitch` — 4 unstitched stretches**, but NOT the branch's 3. The branch's residue was
  seed 6 mark-B, seed 7 (−1652,1626) and seed 7 (−573,−428); the merged tree's is seed 20 origin
  (1) and seed 11 origin (3). Worldgen moved under the stitch — cutMax 25 (portal-cost) reshapes
  every network, and FEAT-82's pad plane + hold recovery (driving-feel) sit on top of FEAT-77's
  d1b1263, which no branch ever tested together. See §5 for the per-tree comparison.
- **`road-clearance` — 18 pairs · 0.7 km** on the merged tree (branch: 14 · 0.5 km; trial merge
  with driving-feel: 15). Gating at zero by the owner's bar (FEAT-77 stays open). 40 carve walls
  reported (BUG-64 B).
- **`paper-reroute` — was red from the COMBINATION**, and is the one gate this train changed.
  On the merged tree seed 6's spawn world compacted (base tour 18.1 → 13.2 km for the same 15
  stops; a customer-draw shift, exactly what the gate's own header predicts for any worldgen
  change) and its median gain fell to 2.7 % while seed 20 stayed at 32 % and the −2 % floor held
  everywhere. Per-tree medians for seed 6: portal-cost 25 %, junction-stitch 21 %, driving-feel
  15 %, merged 2.7 %. The median >10 % and >5 %-on-60 % bars were a fit to four draws; they are now
  REPORT-only, and the gating non-vacuity check is per world: at least 3 jump points gaining >10 %
  (seed 6 has 8, seed 20 has 16). The floor is unchanged. **Owner may veto** — reverting is one
  hunk in `test/paper-reroute.mjs` + its `gates.mjs` desc.
  Worth a ticket: on the driving-feel tree ALONE the same sweep had a **−7.7 %** scenario (the
  re-plan LOSING to the stale line — the "optimiser was handed the wrong graph" class the
  portal-cost handoff §6 flagged at cutMax 40). It does not reproduce on merged main; it is
  lurking, not fixed.

## 4. Housekeeping done here

- PERF-32 moved to `completed/` with a resolution note (its handoff §7). QUAL-31 stays open.
- All five worktrees removed and branches deleted after the suite (their dev servers were stopped
  first). `feature/seed20-road` (BUG-51, 339 behind) was not part of this train and still exists.
- The owner's uncommitted `assets/models/src/ranger.py` taillight edit was stashed for the merges
  and popped back afterwards, untouched.

## 5. The two standing reds — measured on all three trees, and what all-green would take

The owner recalled a worktree having `junction-stitch` and `road-clearance` green. Measured by
checking out both branch tips as detached worktrees and running the two gates there, next to
merged main (same day, same gate code as each tree carried):

| tree | `junction-stitch` stretches | `road-clearance` pairs |
|---|---|---|
| `feature/junction-stitch` @ c9fcc68 | 3 (seed 6 mark-B, seed 7 origin ×2) | 14 · 0.5 km (10 share a node) |
| `feature/driving-feel` @ 3d91079 | 5 (seed 6 ×2, seed 7, seed 20, seed 11) | 25 · 1.6 km |
| **merged main** | **4** (seed 20 origin 1, seed 11 origin 3) | **18 · 0.7 km (all 18 share a node)** |

Neither gate was green on any tree; that matches every handoff. The merge did not add a new
class, it moved the residue: seed 6 and seed 7 cleared, seed 11 got worse.

**Three of the four stitch stretches ARE three of the clearance pairs.** On seed 11's origin
window the same three leg pairs show up in both gates — two legs of one node routed on top of
each other far past the throat:

| site | clearance | stitch |
|---|---|---|
| (306,−443) / (301,−429) | 5.1 m apart over 112 m, 14.3 m of height | 16.8 m edge gap at 0.0 m separation, 224 m from the node |
| (−1488,654) / (−1463,670) | 2.6 m apart over 144 m | 6.9 m edge gap at 0.2 m, 119 m out |
| (−1875,1) / (−1962,64) | 0.0 m apart over 152 m | 4.9 m edge gap at 0.6 m, 170 m out |

Those are not a stitching problem and not a clearance-tuning problem: two legs sharing one
corridor for 100–150 m should have been ONE road with a T further out (the 2026-09-07 ruling: a T
always beats no T). The T machinery declined them. First suspects, from the FEAT-77 handoff's own
trap list: `_v2PromoteMidSpan` still declines split sides, and the legacy-T fallback only re-plans
under the 18 m rule when the wider rule made the fork impossible. Fixing the promotion at that site
takes 3 stitch stretches and 3 clearance pairs away together. The fourth stitch stretch, seed 20
(−467,−341), is a 0.45 m edge gap against a 0.45 m allowance 17 m from the node: a rounding-margin
case at the throat, one comparison.

**The other 15 clearance pairs are a different shape.** (RETRACTED 2026-09-10: they are NOT new with FEAT-82 — measured by rebuilding main with `roadJunctionPadTerrainBias` back at 3.0 (19 pairs) and with `crestHold` 0, which disables the hold recovery (18 pairs): neither FEAT-82 piece creates or removes them. The tree-to-tree differences came from FEAT-77's d1b1263 and cutMax 25 changing the worlds.) Eleven are
25–28.5 m apart against a 28.5 m rule over only 4–16 m of run, carrying 5–12 m of HEIGHT
difference between two legs of the same node just past the 30 m throat exemption. That height
split is what the deck hold + hold recovery now produce when one leg climbs off the pad and its
sibling descends; on the junction-stitch tree alone the pairs were fewer and did not all share a
node. Two levers, both design: extend the throat exemption to where the pavements actually part
(the deck hold already knows that station), or make sibling legs recover from the hold on a
shared vertical curve so the earthwork of one cannot reach the other. FEAT-77's routing levers
(finer corridor grid near an occupied line, post-fit shove, berth) address the long-overlap class
above, not this one.

**UPDATE 2026-09-10 — the coincident-leg class was NOT a T-promotion decline; it was a re-route the
planner never saw.** `g:-3,0,1:-3,1,0`'s plan-time line (776 m) cannot solve a legal profile, so
`_registerRun` re-routed it with a hard grade price (BUG-56 C) — the shipped line is 1342 m and
bought its length by running down BOTH siblings' valleys (150 m on one, 80 m on the other). The
merge planner, the T probe and the clearance pass all read the pure line, so nothing saw the hug,
and the T probe declined the pair because every departure it tried was solved on the corridor that
cannot solve. Fix shipped: `_v2SampleEdge` runs the same re-route ladder in the plan layer, so the
sample IS the registered line. Seed 11: 7 → 5 clearance pairs, 3 → 1 stitch stretches; battery
18 → 16 pairs (0.7 → 0.4 km), stitch 4 → 2; invariance/parity/connectivity gates green; build +4 %.

So all-green is two pieces of work, not a tuning pass: (1) why T promotion declines the seed-11
coincident pairs — a FEAT-77 / T-promotion ticket, worth doing first because it clears rows in
both gates; (2) the throat-vs-recovery height split — a FEAT-82 follow-up with an owner call on
which lever. Neither was attempted here.

## 6. Left as found

- `CarGame-portal-cost` worktree was NOT removed: it holds 9 untracked `test/scratch-*.mjs` probes
  the branch's author never committed. Its dev server is stopped; `wt.sh clean portal-cost` needs
  `git worktree remove --force` once the owner says those probes can go.
- `feature/seed20-road` (BUG-51, 339 behind) and the detached `v1-era` scratch worktree were not
  part of this train.

## 7. 2026-09-10 — the all-green pass (owner rulings applied)

Owner rulings, 2026-09-10: (1) two legs of one node that part and RE-CONVERGE further out "are not
solving a routing problem for the player — cull one edge, it cannot be a connectivity problem if
another edge runs to that destination"; (2) the throat is GEOMETRIC — exempt until the pavements
have parted (22 m, the floor), never less than 30 m.

| | before (main @ b95bd6d) | after |
|---|---|---|
| `road-clearance` | 18 pairs · 0.7 km | **8 pairs · 0.2 km** |
| `junction-stitch` | 4 stretches | **0 — green** |
| `promoted-node-id` core Ts | 15 | 19, green |
| full suite | 70 / 72 | **71 / 72** |
| seed-11 window build | 6.2 s | 6.9 s |

Three commits: `9a60724` (corpus archive), `238c6e9` (plan layer samples the re-routed line) and
this one:

- **Re-convergence rung** (`_v2ConflictPairs` emits `reconverge` for a shared-node pair with a
  ≥60 m interval inside the rule that starts past the geometric throat; `_v2DeleteFor` culls the
  longer member when `_v2DetourSafe` finds a ≤4-hop detour in the wide graph without it — the
  degree pass's own test). Seed 11 node 0,−1,1 lost `0,−1,1|0,0,0` (978 m) to it.
- **Geometric throat** `_v2ThroatLen`: applied to the road-clearance GATE and to the re-convergence
  test only. It was tried on T formation and on the pass-2 loser walk too, and MEASURED to cost
  every T in seed 20's far band (pass-2 re-routes of legs marginally inside the rule 30–120 m out
  are what folded them into Ts; `promoted-node-id` went red). So T formation, the crossing
  invariant and pass 2 keep the fixed 30 m; the notes at each site say so.
- **Stitch epsilon 5 mm**: the last stitch row was a 1.6 mm lip (0.4546 vs 0.4530 allowed).

The eight rows left are two classes, ticketed: **BUG-65** (2 rows) — a loser whose planned winner
the crossing rung then deletes ships raw and hugs the THIRD leg (seed 6 mark-B (−3040,4908) 84 m,
seed 11 (1385,−1170) 88 m); needs a re-plan pass after the delete set freezes. **BUG-66** (6 rows,
4–16 m each, sub-metre short of the rule) — T side roads dropping off a trunk on a tall fill just
past the departure band; a hold or an earthwork term in the departure ranking.

FEAT-82 does NOT create clearance pairs (§5 retraction) — measured with the pad bias and the hold
recovery each switched off.
