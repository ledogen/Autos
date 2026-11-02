---
id: BUG-104
type: bug
status: open
severity: major
opened: 2026-11-02
source: Spare's BUG-69 census, 2026-11-02 — seed 10 (1566, −949), 1400 m window: two legs of one node overlap for ~160 m
relates: BUG-69 (the census that found it), FEAT-77 (the clearance rule and its close-pairs walk), BUG-64 (earthwork composition between close roads), BUG-63 (`~p` parallel runs), BUG-67 (junction geometry)
---
lane: Spare

# BUG-104: two legs of one node lie on top of each other for ~160 m

## What

At seed 10, world (1566, −949), two legs leaving one junction run with their centrelines 5.8 m
apart and 5.1 m of height between them for about 160 m. The pavements sit on top of each other and
no crossing is registered, so from above it reads as one wide road with two centre lines
(`CarGame-spare/wip/bug-69/seed10-overlapping-legs.png`). The worst of the six real clearance
misses in Spare's 12-world census (seeds 1–12, 1400 m; 176 close pairs): every miss is two legs of
one node, and this is the only one where the roads physically overlap rather than sit too close.

The same census found two gaps in the measuring tool itself, noted here so they are not lost:
- the close-pairs walk (`test/lib/close-pairs.mjs`) does not exclude a registered at-grade
  CROSSING, so a crossing 250 m from the shared node (seed 4) is reported as a miss;
- a `~p` parallel half (BUG-63) running 22.8 m from its sibling for 148 m (seed 4) is a miss by
  the rule, and the rule has no opinion yet on parallels.

## Measure first (Spare, 2026-11-02)

- How the two legs come to share the corridor: same departure direction out of the node, a
  side-route hugging a trunk past the band (BUG-69's class), a T promoted onto a leg, or a
  parallel key. Which pass puts them there, and what each leg's route "wanted".
- How often: the census across seeds 1–100 (the FEAT-77 battery's walk, overlap = centrelines
  under one road width apart for ≥ 20 m), so the owner can rank it against BUG-69 (a).
- Whether BUG-67's junction geometry or BUG-69's occupancy price would move it, or whether it
  needs its own remedy (a departure-direction veto at the node, or a merge of the two legs into
  one).

## Acceptance

- [ ] Cause named, with the pass that produces it.
- [ ] Frequency over 100 seeds recorded here, with the worst three sites.
- [ ] A remedy proposed with its census and world-change footprint (how many run keys move),
      for the owner's go/no-go — nothing that re-routes the world lands without one.
- [ ] The two measuring-tool gaps either fixed in the walk or ticketed on FEAT-77.

## Measured — Spare, 2026-11-02

**Frequency (seeds 1–100, 1400 m; the FEAT-77 battery walk with the crossing exclusion; overlap =
centrelines under one road width (10 m) apart for ≥ 20 m):** 5 overlaps in 5 worlds — 4 between two
legs of one node, 1 between two separate roads. No `~p` parallel overlaps. Probe:
`CarGame-spare/wip/bug-69/overlap100.mjs <firstSeed> <count>`.

| seed, spot | overlap | class |
|---|---|---|
| **41 (−1110, 1372)** | 136 m; 3.0 m apart at closest, 4.9 m height gap | two separate roads (halves of two different promoted Ts) |
| **87 (843, 1583)** | 56 m; 3.3 m, 2.3 m | one node — a promoted T's half beside a plain leg |
| **10 (1566, −949)** | 52 m; 5.8 m, 5.1 m | one node — a promoted T's half beside a plain leg |
| 52 (−722, 1135) | 40 m; 5.3 m, 0.5 m | one node — two plain legs |
| 51 (1818, 30) | 28 m; 5.4 m, 7.3 m | one node — two plain legs |

**Cause (seed 10, from the planner's own log).** Edge `1,-2,1|2,-2,0` and edge `2,-2,0|3,-1,0` leave
node `2,-2,0` into the same valley. The planner saw it — `pin-overwrite … @2,-2,0 (R6 counted — inside
the rule by 22.7 m over 296 m)` — and the T ladder tried to merge them: `promote-legacy: … has no T
under the rule`, then `promote-residual: g:1,-2,1:2,-2,0 shipped as the best available T — departure
grade 46% > cap 38%`. The edge took a mid-span T on another trunk instead, and its half that still runs
to `2,-2,0` keeps the overlapping line. Nothing after the ladder catches it: the re-convergence rule
(owner 2026-09-10, delete the longer of two legs that part and come back) skips any interval touching
the shared node's throat — "the junction's own business" — and the crossing rung only fires on proper
crossings. Two legs that never part are always node-anchored, so a failed T leaves them as they are.
Seeds 51, 52 and 41 never appear in the T ladder's log at all (uncapped probe:
`wip/bug-69/skips.mjs`) — their pairs never became conflict pairs in the plan layer; the overlap
exists only in the shipped geometry.

**Remedy tried — REJECTED** (branch `proto/bug-104-hug-delete`, env `BUG104_HUG`): count a
node-anchored interval whose legs have not parted by the throat cap (4 × 30 m) as a re-convergence,
so the delete rung judges it. Over seeds 1–100: **0 of the 5 shipped overlaps resolved**, while the
plan layer's coarse samples flagged many legs that are fine on the shipped roads — **~200 runs deleted**
(6139 → 5936 run keys, 501 key lines changed). The plan layer is the wrong place: it does not see
these overlaps, and what it does see it over-reports.

**What would work, for the owner's go (not built):** a check on the SHIPPED geometry, after assembly —
two runs whose pavements overlap (centrelines < one road width for ≥ 20 m, outside throats and
crossings) drop the shorter one when its endpoints stay connected without it (the delete rung's own
detour test). Footprint by construction: only the 5 overlapping runs over 100 seeds plus whatever
the junctions at their ends re-stitch (a T losing a leg may become a deg-2 connector) — every other
run keeps its key. It still deletes a road the player could have driven, so it is the owner's call
against the standing "connectivity goes up" ruling; the alternative is to leave 5 % of worlds with a
doubled stretch of road.
