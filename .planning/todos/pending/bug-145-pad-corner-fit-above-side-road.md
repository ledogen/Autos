---
id: BUG-145
type: bug
status: open
severity: minor
opened: 2026-11-08
source: Lane B, BUG-137's scans
relates: BUG-137 (same node), road.js _mergeCarve (the 0.55 m duck cap), BUG-122 (the 0.15 m designed edge)
---
lane: B

# BUG-145: a pad corner stands 0.95 m above its side road, and the duck cap leaves a 0.54 m drop

Seed 917338424, BUG-137's node. In the corner between the side road and the trunk at (−212.4, −540.8), the pad's
fitted surface stands 0.95 m above the side road's own surface. `_mergeCarve`'s 0.55 m duck cap then holds the dirt
beside the pad's edge 0.4 m low: a 0.54 m drop at the edge, where 0.15 m is designed.

## Acceptance

- The pad's corner fit follows the side road there, and the edge drop is the designed ~0.15 m.
- The cause named: the corner fit, or the cap.
