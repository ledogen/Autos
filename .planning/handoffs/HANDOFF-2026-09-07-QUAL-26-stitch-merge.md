# HANDOFF — merging `feature/stitch` into main — 2026-09-07

**Two changes to `src/road.js`, both one-liners with long comments. No conflicts expected: main has
not moved since the branch point (`977c344`) and nothing else touches these lines. §1 is the thing to
read before merging — this ships FOUR FEWER T junctions than main, deliberately, and you should agree
with the reasoning before it lands.**

Branch `feature/stitch` @ `7a22c3a`+, worktree `/Users/ledogen/CodeShit/CarGame-stitch`, dev on :8101.

---

## 1. READ THIS FIRST — the acceptance tests RANK, they do not veto

| | main | this branch |
|---|---|---|
| `junction-stitch` violations | 80 | **66** |
| promoted T junctions | 39 | **44** |
| closest promoted T to another junction | 31.9 m | **47.7 m** |
| affected gates green | 36 of 37 | **36 of 37** |

**Better than main on every axis.** An earlier revision of this branch was not: it treated a failed
departure test as a veto and shipped 35 Ts, four fewer than main. The owner rejected that on sight —
*"the wye geometry is generally a bad thing to have, we would prefer them to be Ts"* — and the
measurement then showed the ruling was not a preference but a correction.

**DECLINING A PROMOTION DOES NOT REMOVE THE DECK STEP IT OBJECTS TO. IT MAKES IT WORSE.** Promoting
PINS the side road's start to the trunk's deck at P, and that constraint is what holds the two decks
together. Measured at the seven junctions the veto version declined, worst nearby deck step:

| site | main | declined | ranked (this branch) |
|---|---|---|---|
| seed 11 (−1754,−280) | 5.04 m | **13.20 m** | **2.65 m** |
| seed 7 (−221,885) | 2.81 m | 4.70 m | **2.13 m** |
| seed 6 (1922,856) | 2.69 m | 4.46 m | **2.56 m** |
| seed 20 (−1106,120) | 2.32 m | 3.17 m | **1.75 m** |
| seed 11 (−1756,−490) | 2.78 m | 6.68 m | 2.79 m |

Five of seven got worse when declined. Ranking is better than main at four and equal at three,
because it picks the best fork and rung rather than the first that happens to clear.

So the tests keep the job they are good at — choosing where and how to fork — and lose the one they
should never have had: refusing a junction over a defect that gets worse without it. Residuals are
counted (`promote-residual`), not hidden, and they are `junction-stitch`'s subject.

## 2. What actually changed

**(a) `_v2DepartureAccepts`: `padR` 15 → 10, and its verdict became advisory.** A DEFECT FIX, not a tuning call. FEAT-76 exempted
`roadJunctionCutback + roadHalfWidth` = 15 m from its B3/B6 departure tests. That is exactly the
"instrument margin" R3 (owner, 2026-08-31) removed when it ruled *"a pad reaches 10 m AT MOST — the
ruled bar, not the built reach"*. Measured: **31 of the 34 junction-stitch violations sitting at a
promoted T fell in that 10–15 m ring.** They were real; the test was looking past them.

**(b) A T MAY NOT CROWD AN EXISTING JUNCTION** — the trunk-slice guard in `_v2PromoteOne` and
`_v2PromoteMidSpan` goes from `MINREG` to a flat **45 m**. `MINREG` only asks that road be left over;
it never asked that the new node clear the pads at either end. At 30 m a T lands beside an existing
junction, both cut their ribbons back 10 m, and the run between them ships ~11 m of asphalt under two
overlapping pads — the owner's render 04 (seed 7, −1666/1632 beside −1684/1658, 31.6 m apart with
5.9 m of height between them), which they called *"really fucked up… a different bug class"*.

It is not cosmetic. **`mission-network` caught that stub EVAPORATING between stream windows** — a
mission drop-point road that exists when the mission is planned and is gone when the play system
streams there. Two promoted Ts 32 m apart at (3063,999)/(3088,978). The 45 m guard fixes it and takes
the closest T-to-junction across the battery from 31.9 m to 47.7 m.

**(c) `_v2NodeMerges`: `MINREG` 30 → 20.** The floor on the shortest shared throat worth merging,
commented "pad-dressing territory". But a pad reaches 10 m by rule and 13.5 m as built (BUG-59), so
**13–30 m was owned by neither the pad nor a merge** — and every one of junction-stitch's 80
violations sat in that hole (10–28 m from the node, median 12). Swept before choosing: 30 → 80 sites,
20 → 75, 14 → 77. Below ~20 it gets worse again: a throat that short cannot host a departure band at
all, so admitting it only produces declines.

They are load-bearing on each other, and (a) is only safe BECAUSE its verdict stopped being a veto —
measuring from the ruled 10 m bar while still refusing on failure is what produced the worse-than-main
revision above.

## 3. Cost — it IS slower, and the owner accepted it knowingly

`bench-worldgen`, two runs, mean:

| seed | cold routing | 3×3 ensure | runs |
|---|---|---|---|
| 6 | +2 % | +1 % | 28 → 28 |
| 1337 | +8 % | +19 % | 29 → 31 |
| 42 | **+33 %** | **+56 %** | 18 → 19 |

**~+14 % cold, ~+25 % on the ensure loop**, and the cost tracks new promotions exactly — a seed that
gains no runs pays nothing. `MINREG` is the driver: it admits more candidates into
`_v2PromotableFor`, and each candidate costs a real profile solve per rung.

In absolute terms **~+0.3 s** on cold routing. Against the 33 s cold-boot-to-driving re-baselined
2026-09-07 (PERF-27), where two thirds is terrain and not routing, that is **under 1 % of what a
player waits**.

## 4. Verification

- `npm test` on the branch: **36 of 37 affected gates green.** The one red is `junction-stitch`,
  which has never been green — it is BUG-56's target bar, not a regression detector. Everything the
  road subsystem can reach passes, including `graph-topology`, `road-connectivity`,
  `promoted-node-id`, `road-grade`, `pad-census`, `node-pin`, `wye-release`, `world-determinism`,
  `road-worker-parity` and `network-worker-parity`.
- Violations by class, measured: **at a promoted T 34 → 19; at an ordinary junction 46 → 46.** The
  ordinary-junction class is untouched and cannot be reached by admitting more merges — nothing
  bounds how fast two legs of one node may part vertically. That is the pairwise deck rule, still
  owed, and it is what stands between 65 and zero.
- Departure angle across the surviving Ts: median 56° → 72°, acute (<60°) 21 of 38 → 10 of 35.
- Owner reviewed eight before/after renders and called the improvement *"genuine, just subtle"*:
  https://claude.ai/code/artifact/0a6a97d8-8307-4ccb-bc45-3f8ff215f468

## 5. DELIBERATELY NOT IN THIS BRANCH — the R6 bar

The owner ruled 2026-09-07 that **R8 wins over R6 at exactly 10 m**: R6 declines a merge whenever the
pair keeps `2*halfWidth` of centre separation, while R8 (ruled the next day) says at 10 m the decks
share an edge. They contradict, and every violation sits in the gap.

The fix — `minSep >= 2 * HWn + 4`, requiring real daylight rather than one road width — was built and
measured: it buys **3 stitch violations and 4 T promotions**, the smallest of the three changes, and
it is exactly the 4 Ts §1 gives up. The owner dropped it on those numbers.

**The ruling stands; the code does not yet match it.** A comment at the decline site records this so
the next person applies `minSep >= 2 * HWn + 4` rather than re-opening which rule wins.

## 6. NOW IN THE BRANCH (was a recommendation) — the crowding guard

Found from the owner's review of render 04 (seed 7, −1666/1632), which they called *"really fucked
up… a different bug class"*. It is:

- a **promoted T** at (−1666, 1632) and an ordinary 3-way junction at (−1684, 1658)
- **31.6 m apart, 5.9 m of height between them** — an 18.7 % grade
- each cuts its ribbons back 10 m for a pad, so the run ships ~11 m of asphalt between two
  overlapping pads

Verified NOT caused by QUAL-30 (identical on the pre-QUAL-30 build). It is FEAT-76's own guard:
`_v2PromoteOne` only requires the trunk slices be `>= MINREG`, so **a T may land 30 m from an
existing junction by design**. Raising that specific guard to 45 m was measured:

| | as built | guard 45 m |
|---|---|---|
| closest T-to-junction | 31.9 m | **47.7 m** |
| Ts crowding another junction | **4** | **0** |
| promoted Ts | 39 | 36 |
| `junction-stitch` | 62 | 64 |

**Shipped**, after `mission-network` proved it was a correctness issue and not only a cosmetic one.
Relates to BUG-59 (pads sized without regard to their neighbours).

## 7. Merge

```bash
bash ~/.claude/skills/worktree/scripts/wt.sh merge stitch
```

Then `npm run test:all` on main — the branch only ran the affected set, and `play-area` is held back
from it.
