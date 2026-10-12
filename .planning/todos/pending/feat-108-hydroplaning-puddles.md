---
id: FEAT-108
type: feature
status: open
severity: minor
opened: 2026-10-12
requires: FEAT-107 (rain)
source: owner, 2026-10-12 — "dependent feature requests on rain, but possibly stupid, would be hydroplaning
  as a dynamic obstacle. Slightly different texture … try to naturally detect low points, and if it's a
  certain puddle size then we'll start to run calculations based on the wear of your tires — this pool is
  heavy, it's gonna be a problem for anything with less than 50% tread. Start to bring in subtle effects
  that mess with the player as their car wears, which incentivises replacing their tires earlier."
relates: FEAT-107 (rain — the water source), the tire-tread grip curve in `src/damage.js` (exponent-4
  condition → μ, `tireMuAtZero` 0.55 paved / 0.35 dirt), `params._tireMuScale[i]` (`src/physics.js:910`,
  the hook), `RoadSystem.runProfile(arcS).gradeY` (the road's own height along its arc — puddles sit at
  its local minima, no new detector needed), FEAT-106 (potholes — same "see it, judge it, steer" split-
  second decision), `src/water.js` (ponds are NOT puddles; different scale, different system)
invariants: feedback_emergent_over_injected (the hazard is geometry + tread + speed, never a "puddle hit"
  rule), SM-INV-12 (puddle placement from seed + geometry only), SM-INV-10 (no tread number on the
  puddle; the player reads the puddle's size and knows their tires)
---

# FEAT-108: Hydroplaning — puddles at the road's low points

## Request

During rain, water collects at the road's low points. Big enough puddles make a worn tire float.
A fresh tire cuts through. The player sees the puddle, judges its size, and either lifts, steers,
or trusts their rubber. As the tires wear the same puddles get scarier, which is the nudge to
replace them before they are bald.

## Shape (proposal, not ratified)

- **Placement**: local minima of `runProfile(arcS).gradeY` along each run, plus crown-side ditch
  dips. Size grows with rain intensity and how long it has rained, drains after. Pure function of
  seed + route + clock; nothing saved.
- **Physics**: hydroplaning is a μ collapse that depends on speed, water depth and tread. The real
  relation is roughly v_hydro ∝ √(tire pressure) over film depth; here one curve:
  `μ_wet(v, depth, tread)` on `params._tireMuScale[i]` for the wheel inside the puddle. A 100%
  tire at 60 km/h in a shallow puddle barely notices; a 40% tire floats and the steering goes
  light. Numbers tuned on headless drives, not in-game feel alone.
- **Look**: a flat darker disc with a faint sky reflection on the ribbon, spray on entry. Flat-colour
  style, no texture. A "low performance" mode that skips the reflection.
- **Feedback**: steering goes light and the engine note rises as the drive wheel spins up. No HUD.

## Open (owner)

- Does a puddle move par? Same question as FEAT-107. If par ignores puddles, they are pure tip tax,
  which matches "subtle effects that mess with the player".
- Puddles on dirt roads: mud instead? Out of scope here unless ruled in.

## Acceptance

- Headless: same route, same inputs, three tread levels → time and max lateral slip ordered
  fresh < half < bald through a fixed puddle.
- Placement deterministic per seed (world-determinism gate).
- A fresh tire at par speed through a typical puddle does not lose the car.
- Frame cost measured and reported.
