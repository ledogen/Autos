---
id: FEAT-36
type: feature
status: closed
opened: 2026-07-17
updated: 2026-09-22
closed: 2026-09-22
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

## ⚑ STATUS 2026-09-22 — gap 1 INVERTED, gap 4 CLOSED; still open on gaps 2 + 3

**⚑ CLOSED 2026-09-22 — owner ruling: "close now, spin out the rest."**

The close condition churned twice on 2026-09-22 (first "close once lawn furniture settles in
world", then "rigid bodies don't belong in the lawn-furniture ticket at all", which left FEAT-71
unable to carry it) and the owner settled it by closing this ticket on what has shipped and moving
the remainder to a fresh ticket rather than holding this one open indefinitely.

**This deliberately overrides the 2026-08-15 no-partial-close ruling.** That ruling existed to stop
a requirement quietly becoming a non-requirement; the requirement has not been dropped, it has been
re-homed with its reasoning intact, which is the thing that ruling was protecting against. Closing
by decision, not by drift.

### What shipped under FEAT-36

- `src/debris.js` — dynamic rigid-body props entirely against the `physics-engine.js` adapter, no
  engine type leaks. Convex hull from the GLB's own vertices (every mesh, in template space),
  density-derived mass/inertia, hard cap with oldest-reclaim.
- Two-way truck↔debris coupling from the engine's shared impulse pass. Gate `test/debris-coupling.mjs`.
- The throw mechanic (debug panel → Physics Props → F: paper / barrel / rock) and its tunables.
- Real art: ASSET-30's `drum-closed.glb` replaced the placeholder barrel; ASSET-29/30 both closed.
- **Stacking, 2026-09-22 (the last gap closed here).** `stackLayout()` + `spawnStack()` build a
  deterministic stack of upright drums — two layers of three, each resting squarely on the one
  below — plus a **Spawn Barrel Stack** debug button that drops one 8 m ahead of the truck on the
  terrain. New gate `test/debris-stack.mjs` asserts the layout is pure, the stack settles without
  drift and sleeps, and two fresh worlds settle to **bit-identical** transforms (measured Δ = 0).
  That discharges gap 3 (object↔object) and pins the determinism gap 2's successor will build on.

  Two findings worth keeping, both from building it:
  - A side-lying hex-packed barrel pyramid — the obvious picture of "stacked barrels" — collapses
    every run, because cylinders on their sides roll out from under the load (measured 0.65 m of
    base spread). That is honest physics; real pyramids need chocks. Drums stack upright, flat end
    on flat end, and that is what `STACK_QUAT` records.
  - `PhysicsEngine.addCylinder` anchors a cylinder by its **base**, not its centre, while its
    docstring claimed "centered at yOffset". Docstring corrected (`src/physics-engine.js`). Callers
    placing a cylinder by its centre are half a height out — including two scenarios in
    `test/debris-coupling.mjs`, which still pass and were left alone, but the next author should
    know.

### What was spun out — **FEAT-83**

`feat-83-world-placed-dynamic-debris.md` carries the remainder, undiminished:

- **Gap 2** — deterministic `(seed, coords)` world-fixture spawn/despawn against streaming
  (SM-INV-12). Nothing in the world places a body; everything is player-thrown or debug-spawned.
- **Gap 1** — `causesDamage` per prop type. Not merely unbuilt: SM-3 shipped without it, so the
  default is ON for everything. Harmless while debris is a debug surface, a gameplay bug the day a
  body stands beside a road. FEAT-83 lists it first for that reason.

Gap 4 (real art) closed here. Placement of static POI dressing is **FEAT-71** and is explicitly not
this lineage — the owner ruled rigid bodies out of that ticket the same day.

The 2026-08-15 ruling stands — this ticket does not close on the landed throw slice. But two of the
four gaps have moved underneath it, in opposite directions. **The architecture is NOT superseded:**
the FEAT-48 adapter is the physics core and `src/debris.js` is intact and unchanged. Only the
*status* of the gaps has changed.

**Gap 1 — `causesDamage` has INVERTED. It is now a gate on a LIVE subscriber, not an emit-and-wait.**
The 2026-08-15 text says "SM-3 owns the subscriber and does not exist yet; emit at the seam and let
the wear model subscribe when it lands." SM-3 has since landed on main: `src/damage.js`
(`DamageModel`, `feedContact`) is stepped every fixed physics step from `src/main.js` (~4940), and
`PhysicsEngine.maxContactImpulse` now has two live consumers — that chassis impact read, and
`readRimStrikes` (`src/physics.js:194`).

It landed **without the flag**, so the default flipped from off to on: today *every* non-ground
chassis contact feeds the wear model regardless of what hit the truck. The only filter is
`DAMAGE_PARAMS.impactMinMph` (a speed floor derived from the impulse) plus
`classifyImpactRegion` returning null for ground contacts — neither of which knows a rock from a
trash can. A hard-thrown 18 kg drum is therefore already priced as a crash.

That reverses the work item. It was "add an emitter"; it is now "add the gate before non-damaging
props are shipped into the world." The 2026-07-29 ruling it has to satisfy is unchanged — *boxes
and trash cans don't hurt; rocks and logs do* — and so is the property that made it cheap: the flag
gates the **report**, never the contact, so the physics is byte-identical either way. Consumer side
is no longer hypothetical: wire `DEBRIS_TYPES` (`src/debris.js:24`) through to the `feedContact`
call rather than inventing a new seam.

**Gap 4 — real art is CLOSED as far as this ticket can close it. Do not re-open an ASSET ticket.**
ASSET-29 (plastic barrel) and ASSET-30 (steel drum) are both in `completed/`, and all four barrels
ship: `barrel-plastic.glb`, `drum-closed.glb`, `drum-open.glb`, `drum-crushed.glb`. The orphaned
`test-barrel.glb` / `.blend` / `.py` noted on 2026-08-15 are gone from disk. Three of the four
barrels are modelled but unregistered in `data/prop-models.js` (only `drumClosed` and `testRock`
are) — per the asset-closure posture (owner, 2026-08-24) that is **not** an open asset ticket:
an ASSET ticket closes when the `.glb` ships, and getting a model into the world is the consumer's
job. Here that consumer is gap 2.

The one genuine placeholder left is `test-rock.glb` (20 tris), which has no ASSET ticket of its
own. If world-placed rockpiles want real rock art, mint an ASSET ticket for it — do not hold this
one open on it.

**Gaps 2 and 3 are unchanged and are the whole remaining scope.** Nothing in the world places a
body; debris is still player-thrown only, so deterministic `(seed, coords)` spawn/despawn against
streaming (SM-INV-12) is untouched, and with no stacks, pile behaviour is still untested. The
neighbouring placement tickets to coordinate with rather than duplicate: **FEAT-71**
(POI-satellite placement) and **FEAT-74** (POI model pools) are the scatter solvers for static
props, and **FEAT-26 / FEAT-27** (rockslides) are the hazard consumers — FEAT-26 already carves
this ticket's remaining scope out of its own.

## ⚑ STATUS 2026-08-15 — first slice LANDED, ticket STAYS OPEN

**Owner ruling, 2026-08-15: this does not close until the requirements below are met.** An earlier
close on the landed slice was reverted the same day — the throwable-debris slice is real work that
shipped, but it is not this ticket's acceptance, and closing on a partial is how a requirement
quietly becomes a non-requirement.

**What is left — the four gaps are the remaining scope, not footnotes:**

1. **`causesDamage` per prop type.** The seam exists and is unused:
   `PhysicsEngine.maxContactImpulse` reports impulse magnitude, and the flag gates whether that
   report reaches the wear model — *not* whether the contact happens, so the physics is identical
   either way. SM-3 owns the subscriber and does not exist yet; emit at the seam and let the wear
   model subscribe when it lands, rather than blocking on it.
2. **Deterministic world-fixture spawn/despawn against streaming.** Rockpiles keyed from
   `(seed, coords)` per SM-INV-12. Debris today is run-layer and player-thrown only — nothing in the
   world places a body. This is the item most likely to surface a leak or a streaming hitch, and it
   was called out as "still real work" in the 2026-07-29 rescope.
3. **Object↔object beyond incidental.** No stacks exist, so pile behaviour is untested.
4. **Real art — HALF CLOSED 2026-08-15.** The thrown barrel is now ASSET-30's `drum-closed.glb`
   (328 tris, ρ 86 → the ticket's 18 kg empty); `test-barrel.glb` is retired and its registry entry
   deleted, leaving the `.glb`/`.blend`/`.py` orphaned on disk. `test-rock.glb` (20 tris) is still a
   placeholder. ASSET-29 (plastic barrel) and ASSET-30's open/crushed variants remain unregistered —
   they want the SCATTER consumer, which is item 2's work, not a throw target.
   (The earlier note here said these were "not ASSET-25/26": that was a misnumbering — ASSET-25 is
   the cooking kit and ASSET-26 the shade tarp. The barrels are ASSET-29/30.)

   Swapping the model surfaced a latent bug worth keeping in mind for item 2: `_extractHull` took
   only the GLB's FIRST mesh, and GLTFLoader splits a multi-material mesh into one child per
   primitive. `drum-closed` is DrumPaint + DrumSteel, so the collider was a coin flip on exporter
   ordering between the whole drum and its two 5 cm bungs — silent, no error either way. It now
   unions every mesh, in template space. Any two-material prop added later would have hit this.

### What HAS landed (keep, do not rebuild)

Merged to main with FEAT-48 (`7bc9fb3`, branch `feature/box3d`). `src/debris.js` gives dynamic
rigid-body props built **entirely against the `physics-engine.js` adapter** — no engine type leaks
into debris code. Collider = convex hull of the GLB's own vertices; mass/inertia derived from
density. Spawned through the paper-throw mechanic (debug panel → Vehicle → Physics Props → "Throw
Projectile (F)": paper / barrel / rock), hard cap 12 with oldest-reclaim plus a clear button.
Two-way truck↔debris coupling is the engine's, verified by the `test/debris-coupling.mjs` gate and
in-browser. Placeholder art `test-barrel.glb` (44 tris) / `test-rock.glb` (20 tris) is built
parametrically (`assets/models/src/test-*.py`) and is deliberately **not** ASSET-25/26, which stay
open. Debris throws never touch paper-route scoring or inventory.

Acceptance lines already satisfied by this slice: bodies rest, tumble, settle and sleep; two-way
contact via the engine's shared impulse pass; adapter-only, no engine type leaks; hard count cap;
flag-gated off in headless; tunables in the debug panel; `npm test` green.

Untouched by the `feature/box3d-fixes` merge (2026-08-15) — that work was BUG-49/50, deployed-GLB
404s and the collider-wireframe offset; it does not go near `src/debris.js` or the four gaps above.

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

## ⚑ STATUS 2026-08-14 — first slice LANDED on `feature/box3d` (with FEAT-48)

`src/debris.js`: throwable dynamic props via the paper-throw mechanic — debug panel selector
(Vehicle → Physics Props → "Throw Projectile (F)": paper / barrel / rock), hard cap 12 with
oldest-reclaim, clear button, collider = convex hull of the GLB's own vertices, density-derived
mass/inertia. Two-way coupling with the truck verified by gate `test/debris-coupling.mjs` and
in-browser. Placeholder assets `test-barrel.glb` (44 tris) / `test-rock.glb` (20 tris) built
parametrically (assets/models/src/test-*.py, Blender 5.2 headless) — deliberately NOT the
ASSET-25/26 barrels, which stay open. Debris throws never touch paper-route scoring/inventory.

**Still open here:** the `causesDamage` flag (impulse-report seam exists —
`PhysicsEngine.maxContactImpulse`), deterministic world-fixture spawn/despawn against streaming
(rockpiles), object↔object beyond incidental, real art.

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
