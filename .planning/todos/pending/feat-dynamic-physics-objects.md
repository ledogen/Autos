---
id: FEAT-36
type: feature
status: open
opened: 2026-07-17
severity: minor
source: user-request
relates_to: FEAT-06 (props), FEAT-35 (multi-vehicle), FEAT-26/27 (rockslides), story mode (the log
  drag + chain constraint; SM-3 wear model for damage coupling)
depends_on: FEAT-48 (physics engine adapter seam) — this ticket is not startable before it lands
note: "A couple of dynamic physics objects at a time — rocks, a trash can, barrels — that tumble when
hit. RESCOPED 2026-07-29: the load-bearing architecture decision this ticket escalated has been MADE
(owner) — a third-party engine becomes the physics core for everything including the vehicle, behind
a swappable adapter seam (backend: Box3D, fallback Rapier). That work is FEAT-48 and this ticket now
sits on top of it, which removes most of what was hard here: solver generalization, primitive
colliders, object↔object narrow phase, sleeping and two-way coupling all come from the engine. What
remains is authoring: shapes, masses, spawn/despawn, a causesDamage flag."
---

## ⚠ Rescoped 2026-07-29 — the escalated decision is resolved

This ticket's "Load-bearing decision — the physics-lib ban [ESCALATE]" section below has been
**decided by the owner: adopt a third-party physics engine as the core for everything, vehicle
included, behind a thin adapter seam.** Chosen backend **Box3D** (Erin Catto, C17, MIT), fallback
Rapier. Neither option this ticket framed was chosen — not "extend our solver," not "scoped exception
for debris only." The reasoning is in **FEAT-48**, which is now a hard prerequisite.

**Build against the FEAT-48 adapter, never against the engine directly.** No engine type may leak
into this ticket's code — that is what keeps the backend swappable.

**What that removes from this ticket** — nearly all of the original "real work":

| Was the hard part | Now |
|---|---|
| Generalize the solver to N bodies | The engine, via the FEAT-48 adapter |
| Primitive colliders (sphere/capsule/box) | The engine — **and boxes are free**, which was the expensive item |
| Object↔object narrow phase | The engine |
| Object↔vehicle two-way coupling | The engine — **two-way by default**, no bridge, no kinematic proxy |
| Sleeping settled bodies | The engine |
| Inertia correct enough to tumble | The engine (the hand-rolled world-frame diagonal inertia could not — see FEAT-48) |

**What actually remains here** is authoring and integration, not physics:

- Shape/mass/material choice per debris type; hooking FEAT-06's instanced prop geometry to bodies.
- **Spawn/despawn against streaming** — deterministic for world fixtures (a rockpile), run-layer for
  dressing. Still real work, and still the place a leak or a hitch would show up.
- **A `causesDamage` flag per physics prop** [owner, 2026-07-29] — see the damage section below.
- Count cap and debug tunables.

**Read the sections below as historical context**, not as the plan. The solver analysis was correct
when written; the conclusion was superseded.

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

- ~~**Which decision above**, first and foremost.~~ **RESOLVED 2026-07-29** — see the rescope note at
  the top of this file. Third-party engine behind the FEAT-48 adapter; backend Box3D, fallback Rapier.
- ~~**How solid, how heavy:** hittable hazards or kickable set dressing?~~ **DECIDED 2026-07-29
  (owner): a per-prop `causesDamage` flag.** Nothing has to hurt for the first pass. Eventually
  **boxes and trash cans don't hurt; rocks and logs do** — so damage is a selectable property of the
  prop type, not a property of "being a dynamic body." Implementation note: the flag gates whether a
  contact impulse is *reported to the wear model*, not whether the contact happens — so the physics is
  identical either way and only the consumer changes. That keeps this ticket free of a hard dependency
  on SM-3: emit impulse magnitude at a seam, and let the wear model subscribe when it exists.
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
- Built entirely against the FEAT-48 adapter — no direct engine import in this ticket's code.
- Hard count cap; settled bodies deactivate; run-layer + flag-gated off in headless; `npm test` green.
- New tunables (mass, restitution, friction, spawn set) exposed where debug is live.

## Related

- The existing solver this builds on: `src/physics.js` (sequential-impulse body contact, BUG-27;
  quaternion 6DOF integrator; `queryContacts`).
- Instanced prop geometry for the debris meshes: FEAT-06 ([[project_feat06_props_scope]]).
- Enables solid AI cars: `feat-multi-vehicle-ai-traffic.md` (FEAT-35).
- Hazard-impact / wear coupling if debris can hurt you: FEAT-26 + story economy (shared wear model).
