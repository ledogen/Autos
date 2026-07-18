---
id: FEAT-36
type: feature
status: open
opened: 2026-07-17
severity: minor
source: user-request
relates_to: FEAT-06 (props), physics.js body-contact solver (BUG-27), FEAT-35 (multi-vehicle), FEAT-26/story (hazards, items)
note: "A couple of dynamic physics objects at a time — rocks, a trash can, barrels — that tumble when
hit. The machinery mostly exists: physics.js already has a sequential-impulse contact solver with
friction + restitution (the BUG-27 body-contact code) on a 6DOF quaternion integrator. The new work
is object↔object and object↔vehicle contacts (today it's body-vs-terrain only) + primitive colliders.
Load-bearing DECISION: the 'no physics libs' rule was written for the VEHICLE's learning/tuning value
— it's weakest for a tumbling barrel. Extend our solver vs. scoped exception — decide, don't drift."
---

# FEAT-36: Dynamic physics objects (debris rigid bodies)

## Context

The world is static except the truck. This adds **a couple of loose rigid bodies at a time** — rocks,
a trash can, barrels — that get knocked around, tumble, and settle. Not a destruction system; a few
convincing dynamic props.

The foundation is already here, which is why this is tractable hand-rolled:

- `src/physics.js` runs a **6DOF quaternion rigid-body integrator** and a **sequential-impulse
  (Gauss-Seidel) contact solver** with **restitution + tangential friction** (the BUG-27 plastic
  body-contact code, sphere probes vs terrain triangles via `queryContacts`). A barrel is the same
  integrator + solver with a simpler shape and no drivetrain.
- FEAT-06 already instances prop geometry; debris variants slot into that palette.

## The real work (what's genuinely new)

- **Object↔terrain** is basically already done (reuse the sphere-probe contact against `queryContacts`).
- **Object↔vehicle** contacts — hit a barrel with the truck and it flies. The truck's body-contact
  solver must talk to the debris bodies (shared contact/impulse pass). This is the fun part and the
  real coupling; it also unlocks FEAT-35 (solid AI cars).
- **Object↔object** contacts — barrels bumping each other. Needed only lightly at "a couple at a time";
  a broad-phase over single-digit bodies is trivial.
- **Primitive colliders** — sphere / capsule / box for the debris shapes (sphere probes may suffice for
  rocks; a barrel wants a capsule/cylinder to lie and roll right).
- **Spawn/despawn with streaming**, deterministic placement where they're world-fixtures (a rockpile),
  run-layer-random where they're dressing.

## Load-bearing decision — the physics-lib ban [ESCALATE, do not resolve in a ticket]

`CLAUDE.md`: no physics libs (Cannon/Rapier/Ammo) — rationale: *learning, tuning transparency, terrain
control* for the hand-rolled **vehicle** physics. That rationale barely applies to a tumbling barrel:
debris needs to look right, not teach or be tunable. So debris is exactly where the ban is weakest.
Two honest paths — **make this a deliberate decision, not a drift**:

- **Extend our own solver (default lean).** We already have the integrator + sequential-impulse
  contacts; generalize them to N non-vehicle bodies with primitive shapes. Keeps the codebase
  dependency-free and self-documenting, matches the project's hand-rolled ethos, and at "a couple at a
  time" the solver's weaknesses (deep stacks jitter) never bite. More code, full control.
- **Scoped exception: a WASM lib (e.g. Rapier) for non-vehicle debris only.** The vehicle physics stays
  hand-rolled (the ban's real intent); debris rides a mature solver. Buys robustness cheap, costs a
  dependency + a bridge between two physics worlds (debris↔vehicle contacts across the boundary get
  awkward — arguably worse than one solver).

Owner's call. The lean is "extend our own" because we're most of the way there and the two-solvers
bridge is the ugly part — but it's explicitly the owner's to make.

## Open design questions (decide at planning)

- **Which decision above**, first and foremost.
- **How solid, how heavy:** are these hittable hazards (a rock that dents you — ties to FEAT-26 hazard
  impacts + the shared wear model) or just kickable set dressing? Hazard coupling is a bigger scope.
- **Count + settling:** hard cap (single digits); sequential-impulse jitters on piles, so no barrel
  stacks. Sleep/deactivate settled bodies to keep them off the hot loop.
- **Determinism (SM-INV-12):** world-fixture debris deterministic from `(seed, coords)`; dressing/
  knocked-around state is run-layer. Headless gates run zero dynamic bodies (flag-gated).
- **Items (story):** some debris might be a container (a barrel with a part in it) — that's the
  item/mission layer, out of scope here but a natural hook; reserve it, don't build it.

## Acceptance

- A few loose rigid bodies (rock / barrel / trash can) rest on terrain, tumble when the truck hits
  them, respond to gravity + friction + restitution, and settle (then sleep).
- Object↔vehicle contact works both ways (truck shoves barrel; barrel nudges truck plausibly) via the
  shared impulse pass — no separate fragile hack.
- The physics-lib decision is recorded (extend-vs-exception) before implementation.
- Hard count cap; settled bodies deactivate; run-layer + flag-gated off in headless; `npm test` green.
- New tunables (mass, restitution, friction, spawn set) exposed where debug is live.

## Related

- The existing solver this builds on: `src/physics.js` (sequential-impulse body contact, BUG-27;
  quaternion 6DOF integrator; `queryContacts`).
- Instanced prop geometry for the debris meshes: FEAT-06 ([[project_feat06_props_scope]]).
- Enables solid AI cars: `feat-multi-vehicle-ai-traffic.md` (FEAT-35).
- Hazard-impact / wear coupling if debris can hurt you: FEAT-26 + story economy (shared wear model).
