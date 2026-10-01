---
id: FEAT-93
type: feature
status: open
severity: minor
opened: 2026-09-30
source: owner, 2026-09-30 — "enable punctures on tires at ANY durability for specific scenarios like
  when hitting rocks from a rockslide. it shouldnt puncture for no reason … you still have to nail the
  rocks kinda hard and it feels like an avoidable incident"
relates: FEAT-26 (rockslide ambush), FEAT-27 (static rockslide), FEAT-94 (driving on a flat), items.md §7
  (tire patches, bike pump, compressor), SM-3 damage model (`src/damage.js` punctures + rim strike)
invariants: SM-INV-12 (deterministic — no roll), SM-INV-10 (no number on the HUD)
---

# FEAT-93: Hazard punctures — a hard enough rock hit pops a tire at any condition

## Request

Today a tire **cannot** puncture above 50% condition (`punctureCond` in `src/damage.js`), and below 50%
it pops on a bump-stop force threshold (84 kN at 50% → 72 kN at 25% → 30 kN at 10%). Add a **second,
condition-independent path**: a rock (rockslide debris, a static rockfall, a sharp-rock cut hazard)
hit hard enough punctures the tire **whatever its condition**.

- **Never for no reason.** Only a hazard contact can do this. Smooth road, potholes and terrain keep
  the existing wear-gated rule.
- **Avoidable.** It needs a real hit — the player has to nail the rock fairly hard. Clipping a pebble
  at walking pace does nothing. It should read as *I hit that too hard*, never as bad luck.
- **Deterministic** (SM-INV-12): a threshold on a physical quantity, not a probability roll. The same
  hit on the same rock pops the same tire every replay.

## Why (the item economy)

Without this, a player on good tires is immune to punctures and would never carry **tire patches** or
a **compressor** (items.md §7). With it, patches are worth carrying always, and the compressor turns a
2 h pump stop into 30 min. Wear still matters: worn tires pop on ordinary road hits too.

## Mechanism — to design

The signal is "how hard the rock went into the tire." The wheel's rigid core already collides with
debris bodies, and `src/damage.js` already measures the **peak debris-core contact force per corner**
for rim strikes (`rimYieldMult` ≈ 1.5 × static wheel load ≈ 5 kN for debris). Candidates:

1. **Force threshold on debris-core contacts (recommended — the measurement exists).** A puncture fires
   when that peak force passes a hazard-puncture threshold, independent of condition. It should sit at
   or somewhat below the rim-yield level so the tire usually goes before the rim, and a big hit does
   both.
2. **Penetration depth** — how far the rock's contact overlaps the wheel core. Closer to the owner's
   word "penetration," but depth is a solver artefact that depends on step size; force is more stable.

Optional: wear can still lower this threshold (a worn tire goes easier on a rock too), but never raise
it past "a hard hit on fresh rubber pops it."

Tag which contacts count: **hazard rocks only** (a flag on the debris type, like FEAT-83's
`causesDamage`), not haul cargo, not thrown barrels.

## Acceptance

- [ ] A fresh tire (100%) driven hard into a rockslide rock punctures; the same rock at a crawl does not.
      Headless gate in the shape of `test/damage-rim-strike.mjs`.
- [ ] Road, potholes and terrain still cannot puncture a tire above 50% (existing
      `damage-filter-puncture` assertions unchanged).
- [ ] Non-hazard debris (cargo, thrown barrels) never triggers this path.
- [ ] Same scripted hit → same result every run.

## Blocked on

A rock to hit: FEAT-26 / FEAT-27 (rockslides) or the cut hazard pass. The damage-side threshold can be
built and gated against a scripted debris hit before either lands.
