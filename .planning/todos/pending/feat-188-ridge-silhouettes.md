---
id: FEAT-188
type: feature
status: open
severity: minor
opened: 2026-11-08
source: owner, 2026-11-08 — "love the firewatch rings suggestion. lets put it down as optional pre-alpha. for now lets just tune the fog, since it will play into the success of the rings later anyway."
relates: FEAT-180 (lighting; the fog tune comes first), FEAT-180 piece 6 (shade skirt, the far-terrain start)
---
lane: Spare

# FEAT-188: far ridge silhouettes — layered haze bands computed from the real terrain

**Optional, pre-alpha** (owner, 2026-11-08). Starts after FEAT-180's fog tune, which sets the colours the
bands blend between.

## What

From a peak the world visibly ends ~160 m out (Normal; ~290 m Ultra) in fog over a flat below-horizon
fill: "floating in the void" (owner's feat180-review note, 2026-11-08). Spare's survey of the options
(fog wall = today; painted skybox mountains; a coarse far-terrain copy; layered ridge silhouettes, the
Firewatch look). The owner picked the silhouettes, **computed from our own `height()`, not painted**:

- Sample `height()` out to ~12 km in ~720 directions. For each direction and each of ~4 distance bands,
  keep the highest ridge elevation angle.
- Draw the bands as one strip at the horizon, behind the loaded terrain. Flat colours, faceted (ART-STYLE).
- The nearest band is the **fog colour** (continues the fogged near land, no seam). The farthest band is
  the **sky's horizon colour** (the far ranges melt into the sky). The bands between step from one to the other.
- Ridges sit where the real mountains are (seed + position decide them).

Spare's cost estimate: ~58,000 `height()` calls per rebuild, ~12 ms, run in the terrain worker (it
already imports `height()`), rebuilt every ~250 m of travel; ~6,000 tris in one draw call. Near fog,
draw distance and the perf budgets are unchanged. Effort ~1–2 days.

Later, not this ticket: the real far terrain (coarse copy). Piece 6's shade skirt already builds unloaded
ground to 1.2 km. That job means re-tuning the fog at every hour, plus treeless far land and the coarse/fine seam (week-class).

## Acceptance

- [ ] From a local peak at 06, 09, 12, 16, 19 and night, the horizon shows banded ridges rather than flat fill;
      the owner's look on the review seeds.
- [ ] Nearest band matches the fog colour and farthest the sky's horizon colour at every hour (no seam
      against the fogged land, no band against the sky).
- [ ] The profile is a pure function of seed and position: a headless gate.
- [ ] Frame cost: the rebuild runs off the main thread; drawing is one draw call; measured ms stated.
