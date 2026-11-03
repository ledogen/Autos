---
id: BUG-105
type: bug
status: open
severity: major
opened: 2026-11-03
source: owner capture /Users/ledogen/Downloads/autos-capture-1793661257788.json (seed 163384989, free roam, mark
  (−12734, 14911)) — "legs intersecting". Owner, 2026-11-03: "document this as another thing we need to fix, also on main"
relates: BUG-104 (two legs of ONE node overlap — a different pair shape), FEAT-77 (the clearance rule), test/lib/close-pairs.mjs,
  BUG-64 (earthwork between close roads)
---

# BUG-105 — two roads that share no node graze each other with no crossing

## What the capture shows (orchestrator probe, 2026-11-03)

The replay reproduces it exactly (`node test/replay.mjs <capture>`: run, arc and grade match the game). Two runs pass
within 120 m of the mark:

| run | length | end degrees | bores |
|---|---|---|---|
| `g:-20,23,1:-20,23,2` | 966 m | 2 / 3 | — |
| `g:-21,23,1:-12669676,14798347,-1` | 857 m | 2 / 3 (a promoted T) | 68–174 m |

They share NO node. Their centrelines come within **5.7 m** in plan, at **0.7 m** of height difference, at
(−12730, 14910), and stay within 12 m of each other for about 28 m. The pavements are ~7 m wide, so they overlap, and
no at-grade crossing is registered there. In game it reads as two roads running into each other.

This is not BUG-104's shape (two legs of one node lying on top of each other). It is two unrelated runs that either
should have crossed at a registered crossing or should have kept clear.

## Acceptance

- [ ] A census over enough seeds says how common it is (close pairs with no shared node and no registered crossing).
- [ ] At this mark, the two runs either cross at a registered crossing or keep the FEAT-77 clearance.
- [ ] The capture replays clean.
- [ ] The fix keeps every world window-invariant (the invariance and restream gates stay green).
