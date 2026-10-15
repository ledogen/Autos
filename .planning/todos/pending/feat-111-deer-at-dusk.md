---
id: FEAT-111
type: feature
status: open
severity: minor
opened: 2026-10-12
source: owner, 2026-10-12 — "I like deer at dusk as another source of hazard. Go ahead and mint a ticket
  so we remember to do it." Picked from a menu of new pressure sources that must route through the two
  deaths (SM-INV-1); deer route through the crash.
relates: FEAT-26 (rockslide ambush — same "spawn ahead of the player, let physics decide" machinery and
  the same run-layer timing precedent), FEAT-36 / `src/debris.js` (dynamic bodies, convex-hull colliders,
  rock↔vehicle two-way coupling, the DEBRIS_CAP discipline), `src/damage.js` (front-region panels:
  bumper → radiator → headlights; a deer strike is a front hit and needs no new damage rule),
  `SKY_CYCLE` in `src/sky.js` (dusk 18:00–20:00 — the hazard window is read from the sky, not a second
  clock), FEAT-107 (rain — a wet dusk stacks lower grip on the swerve), FEAT-47 (sleepiness — dusk is
  when a tired player is driving)
invariants: SM-INV-1 (no new death: a deer kills only via the crash/damage it causes),
  SM-INV-12 (spawn timing is run-layer randomness, flag-gated off in the gates — the ambush precedent;
  worldgen untouched), feedback_emergent_over_injected (the deer is a body with mass, never a scripted
  "deer hit" penalty), SM-INV-10 (no on-screen warning meter)
---

# FEAT-111: Deer at dusk

## Request

Deer on and beside the road around dusk (and dawn). A real body with real mass. Hitting one is a
front-end crash through the existing damage model; swerving for one is a loss of control through the
existing tire model. Speed at dusk becomes a risk the player chooses, at the time of day they are
most likely to be tired.

## Shape (proposal, not ratified)

- **When:** activity weight peaks over the SKY_CYCLE dusk band (18:00–20:00), with a smaller dawn
  peak. Deer are crepuscular — most active at dawn and dusk — so this is the honest window, not an
  invented one. Zero at midday.
- **Where:** spawned off-screen ahead of the player, at the edge of the trees, from the run-layer
  RNG (SM-INV-12). Denser where forest meets road; none in open ground. Never placed *on* the
  player's line inside braking distance — the deer has to be visible long enough to react to.
- **Behaviour — keep it dumb:** walk, freeze in the headlights, bolt in a random direction. That
  is enough. No pathfinding, no "aim at the player". Being unpredictable is the hazard.
- **Body:** a dynamic body through `debris.js` / the adapter (no engine types outside
  `physics-engine.js`). Mass ~60–90 kg (whitetail doe ~45–70, buck up to ~130). Simple hull. At
  50 mph that is ~20 kJ into the bumper; let the damage model price it.
- **Asset:** needs a deer `.glb` under the art style (flat, faceted, desaturated — it is nature).
  Mint the ASSET ticket when this one is opened, not before.
- **Cap:** its own small count budget (1–3 live), not shared with the thrown-debris cap.

## Owner ruling 2026-10-15

- **Dawn and dusk**, both.
- **A dead deer stays where it lies** and despawns once its chunk is unloaded and an hour or two
  of game time has passed. The same rule applies to rockslide debris (FEAT-26, FEAT-27).
- **More deer in R3 than in R1.** Density rises inward with the rings, like the other driving-side
  difficulty. This overrides the forest-edge weighting above as the *regional* term; forest edge can
  still decide where within a region.
- Reported over the **CB radio** (FEAT-119).

## Acceptance

- Deer appear only in the dusk/dawn window; same run seed + same clock → same spawns (headless,
  flag-gated like the ambush timing).
- A headless strike at a fixed speed produces front-region damage through `damage.js` with no
  deer-specific damage code.
- A deer is always visible for at least a braking distance at road speed before it can enter the
  player's lane.
- Frame cost measured and reported in the resolution.
