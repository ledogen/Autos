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
