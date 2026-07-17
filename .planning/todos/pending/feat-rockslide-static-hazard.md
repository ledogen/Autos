---
id: FEAT-27
type: feature
status: open
opened: 2026-07-15
severity: minor
source: user-idea
relates_to: FEAT-09 (generic contact pipeline → debris — the physics substrate this needs), FEAT-26 (rockslide ambush — the dynamic/timed variant; this is the static sibling), FEAT-06 (prop palette — boulder/med-stone meshes to reuse)
depends_on: FEAT-09 Phase 2 (static obstacle contacts), FEAT-09 Phase 3 (dynamic debris — for rocks that scatter when clipped)
---

# FEAT-27: Static rockslide hazard — a rockfall already on the road to drive around

## Request (user)

A rockslide that has **already come to rest on the road** — a pile of rocks blocking part (or all)
of a road stretch that the player simply has to **avoid / pick a line around**. No timing, no
tracking; it's a placed obstacle. Uses the same **FEAT-09 rigid-body debris** as the rocks, so
clipping the edge of the pile shoves individual rocks rather than hitting an invisible wall.

This is the **static sibling of FEAT-26**: same rock bodies, opposite dynamics — FEAT-26 is a timed
tumbling ambush, FEAT-27 is a stationary obstacle field.

## Why this links to FEAT-09

Sits mostly on **FEAT-09 Phase 2** (static obstacle contacts): the resting rocks are fixed colliders
in the contact list — the truck gets correct normal + suspension response driving over the small
ones and is blocked by the big ones, via a bounded spatial-hash broad-phase (not O(wheels × rocks)).

**Phase 3 makes it feel alive:** rocks that are small enough to move should **scatter/roll when
clipped** rather than behaving as immovable studs — so a glancing hit knocks stones aside (two-way
coupling), while the medium boulders read as hard blockers. So: big rocks ≈ static blockers, small
rocks ≈ dynamic-but-heavy debris. Do NOT reimplement rigid bodies here — reuse FEAT-09.

## Relationship to FEAT-26

Ideally FEAT-26 and FEAT-27 share **one rock spawner / obstacle-field module** with two modes:
- **FEAT-27 static:** deterministic, seeded placement — a rest state, no release timing.
- **FEAT-26 dynamic:** tumbling descent + player-timed release (the ambush).

A FEAT-26 event that finishes and leaves rocks on the road is essentially a FEAT-27 field — the
two should converge on the same resting-debris representation and cleanup path.

## Open questions (scope in plan mode when picked up)

- **Placement / determinism.** Static ⇒ this SHOULD be seeded and window-invariant like the rest of
  worldgen (unlike FEAT-26's live-tracking non-determinism). Where do slides site — under a steep
  uphill face adjacent to the road (reuse road-carve grade data), biased to specific stretches, or
  purely random-seeded along edges? Density: how often does a driver encounter one?
- **Blockage geometry.** Partial (drive around on remaining lane/shoulder) vs full (must stop /
  find another way — is there another way?). Guarantee the network stays traversable, or is a hard
  block an intended dead-stop hazard? Interacts with route/graph reachability.
- **Rock size mix.** How many medium blockers vs small scatterable rocks, and the visual read of a
  believable rockfall pile (reuse FEAT-06 boulder + med-stone palette; possibly FEAT-25 med-stones).
- **Big-rock behavior.** Truly immovable (static contact) or extremely heavy dynamic (can be nudged
  at speed but won't casually roll)? Feel + stability call — must not destabilize vehicle physics.
- **Does the carve/road mesh need to know?** Or is it purely props + contacts laid on top of the
  finished road surface (preferred — no re-carve)?
- **Map + cleanup.** Should the 2D map (`map2d`) mark a blocked/hazard stretch? Do static piles
  persist across stream-out/in (seeded ⇒ regenerate identically) vs despawn?

## Acceptance (when picked up)

- [ ] A seeded, window-invariant rockfall pile appears on qualifying road stretches at a believable
      sparse density (same determinism guarantees as road-graph generation).
- [ ] The player must steer around it: medium rocks block (correct normal + suspension via FEAT-09
      Phase 2 static contacts), small rocks scatter when clipped (FEAT-09 Phase 3 two-way coupling).
- [ ] Broad-phase bounded (spatial hash); per-field and concurrent counts capped.
- [ ] Network traversability handled deliberately (guaranteed line-around, or intended hard block —
      decided, not accidental).
- [ ] No regression on road-network gates; vehicle feel not destabilized (rainy-day physics asserts
      green); headless gates stay deterministic.
