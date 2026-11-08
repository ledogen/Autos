---
id: BUG-148
type: bug
status: open
severity: minor
opened: 2026-11-08
source: Lane B, BUG-147's gate run on seed 169372896
relates: BUG-147 (the seed joins junction-edge-lip once this is fixed), BUG-122 (PAD_DIRT_EXTRA stops at the ring)
---
lane: B

# BUG-148: terrain dirt pokes 1.8 cm through a steep pad just inside its rim

Seed 169372896, the 3-leg junction at (55.7, −864.8). junction-edge-lip's POKE rebuilds the terrain mesh's dirt on its
1 m grid, using the worst triangle split. At (46.0, −856.7), 0.2 m inside the ring, that dirt stands 0.018 m above the
pad top. This is the same on main, on `land/bug-147` and on `land/bug-146`, so neither of those changes it.

The pad falls 0.165 m per 0.25 m there (66 %). The likely mechanism: outside the ring the rim-hold band keeps the dirt
only `clearanceMargin` (0.15 m) under the node surface, because BUG-122 stops `PAD_DIRT_EXTRA` at the ring. A 1 m
cell's flat triangle spanning a crease in that steep surface then interpolates above the pad.

Cosmetic: a sliver of tan showing through the asphalt. Physics rides the pad top inside the ring.

## Acceptance

- No POKE failure at this pad (dirt under the pad top at every sampled point inside the ring).
- BUG-122's kerb unchanged: the rim still drops the designed ~0.15 m.
- Then seed 169372896 joins junction-edge-lip's `SEEDS` (BUG-147's wall site); that needs BUG-146 landed as well.
