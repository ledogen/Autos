---
id: FEAT-93
type: feature
status: closed
closed: 2026-10-26
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

- [x] A fresh tire (100%) driven hard into a rockslide rock punctures; the same rock at a crawl does not.
      Headless gate in the shape of `test/damage-rim-strike.mjs`.
- [x] Road, potholes and terrain still cannot puncture a tire above 50% (existing
      `damage-filter-puncture` assertions unchanged).
- [x] Non-hazard debris (cargo, thrown barrels) never triggers this path.
- [x] Same scripted hit → same result every run.

## Blocked on

A rock to hit: FEAT-26 / FEAT-27 (rockslides) or the cut hazard pass. The damage-side threshold can be
built and gated against a scripted debris hit before either lands.

## Resolution (2026-10-26, Lane B, feature/machine)

Built candidate 1, the force threshold on debris-core contacts, damage side only. No rockslide exists
yet (FEAT-26/27), so the in-game rock is the debug throw (Debris → Throw Projectile = rock, F).

- `DEBRIS_TYPES.rock.hazard = true` → the body's `userData.hazard` (src/debris.js). Rocks only.
- The adapter's `maxContactImpulse` fills a second per-shape array counting ONLY hazard bodies
  (src/physics-engine.js). `readRimStrikes` turns it into `vehicleState.rimHazard[4]`, the core force in N.
- `damage.step`: `rimHazard[i] ≥ hazardPunctureMult × static wheel load` pops tire i, whatever its
  condition. Same pop path as a bump-stop puncture: the flat, the bang.
- Gate `test/damage-hazard-puncture.mjs`.

**The threshold sits ABOVE rim yield, not under it as the ticket suggested.** The measured peak core
force, with the real truck driven into a resting 40 kg rock across 7 lateral offsets:

| mph | worst line | lines past 100 kN |
|---|---|---|
| 5 | 82 kN | 0/7 |
| 10 | 0 | 0/7 |
| 15 | 62 kN | 0/7 |
| 20 | 148 kN | 1/7 |
| 25 | 169 kN | 3/7 |
| 30 | 204 kN | 3/7 |
| 40 | 365 kN | 4/7 |

A crawl can spike the core to 82 kN: the rock is taller than the 0.15 m rubber band, so the rim
pinches it as the wheel climbs. Rim yield is 85 kN, so any threshold at or under yield pops tires at
walking pace, which breaks this ticket's own "the same rock at a crawl does not". It sits at 30 × static
wheel load ≈ 100 kN instead, with an 18% margin over the worst crawl. Consequence: an 85–100 kN hit
marks the rim a little and leaves the tire up. Lower `hazardPunctureMult` to bias toward
punctures; under ~25 it starts popping crawls.

The spread from one line to the next is how the rock tumbles. It is not noise: the same hit replays
to the same force.

Owed: an in-game feel check (throw a rock, drive into it at 10 and 30 mph). Wear does NOT lower this
threshold (the ticket's optional idea). Worn tires already pop on ordinary bump-stop hits.
