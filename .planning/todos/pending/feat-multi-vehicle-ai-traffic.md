---
id: FEAT-35
type: feature
status: open
opened: 2026-07-17
severity: minor
source: user-request
relates_to: FEAT-23 (drivetrain), FEAT-13/graph (road network + router), FEAT-33 (ignition), story mode (missions, SM-INV-12)
note: "A couple of AI-driven cars at a time — traffic / mission actors that follow the road network.
The physics core is already instance-ready (stepPhysics takes vehicleState as an arg and mutates in
place); the singleton is only main.js glue. Key call: AI cars use a SIMPLIFIED kinematic motion model
that follows the road graph, NOT the full Pacejka truck — cheaper, and it stops them spinning out on
honest tire physics. LOD: full solver only for cars near the player."
---

# FEAT-35: Multi-vehicle + AI traffic

## Context

The sim runs one truck. The player truck's physics, though, is already parameterized — `stepPhysics
(vehicleState, params, dt, queryContacts)` takes the state as an argument and mutates it in place
(`src/physics.js`), so the *core* is instance-ready. The singleton lives only in the glue: one
`vehicleState` object literal (`main.js:835`), one `SPAWN_STATE` template (`vehicle.js:31`, the
3-places convention — [[project_vehiclestate_three_places]]), one camera, one HUD reader.

This ticket adds **a couple of other cars at a time** — ambient traffic and/or mission actors (someone
chasing you; the guy who gets away) that drive the existing road network. The frame-budget cost of a
few extra vehicle integrations is not the risk (terrain/routing dominates the budget and is already
bounded); the work is **architecture + AI**, not physics throughput.

## Desired behaviour

- **A small number of AI cars** (a couple — single digits, cap it) exist near the player, spawned and
  despawned with the streaming world, following the road network.
- They drive plausibly: pick a route over the road graph, follow the centerline, hold a sane speed for
  the curvature/grade (the par oracle's curvature+grade data is right there), yield/stop crudely for
  the player and each other. Not race-grade AI — believable traffic.
- Mission actors are the same substrate with a goal (flee, follow, block), so the mission layer can
  spawn a named car.

## The two real pieces of work

1. **De-singleton the vehicle (glue refactor, not a physics rewrite).** The wiring holds an **array**
   of vehicle states; the step loop integrates each; spawn/despawn is tied to streaming distance. The
   camera + HUD stay bound to the player instance. Honor the 3-places vehicleState convention as it
   generalizes to N. This is the bulk of the code but it's mechanical — the physics core doesn't change.
2. **AI motion model — simplified, NOT the full truck.** [DEFAULT — the load-bearing call]
   AI cars follow the road graph with a **kinematic / arcade** model (target point on the centerline,
   speed controller from curvature+grade, simple heading lerp), not the Pacejka + suspension + converter
   stack. Two reasons: it's far cheaper, and honest tire physics will spin an AI out the moment it
   pushes — which is exactly why sim-racing AI is hard. **LOD physics:** if a full-solver AI car is ever
   wanted (a rival you can PIT, debris interactions), run the real `stepPhysics` only for cars within a
   near radius and the kinematic model beyond; the player car is always full.

## Open design questions (decide at planning)

- **Traffic vs. actors first?** Ambient traffic (atmosphere) and mission actors (scripted goal) share
  the substrate but want different spawn logic. Which drives v1?
- **How AI cars interact with the player physically:** do you collide with them (they need real-ish
  colliders and it couples to FEAT-36's object↔vehicle contacts), or are they ghost/soft for v1?
  Collision is the fun but expensive answer.
- **Spawn placement + population:** ahead-on-your-road only, or filling the visible network? Hard cap
  on count (respect the "a couple at a time" instinct — the solver and the tuning both like small N).
- **Determinism (SM-INV-12):** AI cars are a **run-layer** system — spawn/timing may be freely random,
  worldgen stays pure. Headless gates run zero AI cars (flag-gated off, FEAT-26 precedent).
- **Do AI cars have ignition/wear/fuel (FEAT-33/34)?** Almost certainly no — they're not the player's
  truck; keep them simple. Confirm.
- **Reuse the vehicle *visual*?** FEAT-vehicle-visual-swap-hook exists; AI cars likely want variant
  models. Cross-reference.

## Acceptance

- More than one vehicle exists and steps stably; the player instance is unaffected (same feel, same
  gates green). vehicleState is instanced, not a singleton; camera/HUD track the player.
- A couple of AI cars spawn/despawn with streaming and follow the road network at believable speeds
  without constantly crashing themselves (kinematic model).
- Mission layer can spawn/despawn a named actor car with a goal.
- Hard population cap; AI is a run-layer system, flag-gated off in headless gates; `npm test` green.
- New tunables (population, speed factor, spawn radius) exposed where debug is live (free roam).

## Related

- Physics core (already state-parameterized): `src/physics.js` `stepPhysics`; drivetrain FEAT-23.
- Road network + router the AI drives: road graph / `RoadSystem` (centerlines, curvature+grade).
- Object↔vehicle collision (if AI cars are solid): `feat-dynamic-physics-objects.md` (FEAT-36).
- vehicleState instancing discipline: [[project_vehiclestate_three_places]].
- Vehicle model variants: `feat-vehicle-visual-swap-hook.md`.
