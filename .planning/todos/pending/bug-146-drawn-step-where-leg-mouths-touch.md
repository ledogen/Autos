---
id: BUG-146
type: bug
status: open
severity: minor
opened: 2026-11-08
source: Lane B, BUG-144's remainder
relates: BUG-144 (the pad's own tear between legs: fixed), BUG-82 (ribbon weld), BUG-105 (overlap join)
---
lane: Spare

# BUG-146: a drawn step where two nearly parallel legs' mouths touch

BUG-144 fixed the pad's own tear between two legs' bands. What is left is in the DRAWN ribbons: where two nearly
parallel legs' mouths touch, 28.7 m out from their node, their own decks differ by 0.20 m (seed 1353361482, at
(26.3, 721.3)) and 0.12 m (seed 917338424, at (99.4, −1015.8)). Past the mouths the pad must coincide with each
ribbon, so the pad can't remove it. The step is 0.143 and 0.124 m per 5 cm, at one corner per node.

junction-edge-lip names these two sites as its one exception (within 0.5 m of two touching ribbon edges).

## Acceptance

- The two legs' decks are drawn together where their mouths touch (a ribbon-level weld, or an overlap join), with no
  step over the designed lip.
- The gate's named exception is removed, and both sites pass.
