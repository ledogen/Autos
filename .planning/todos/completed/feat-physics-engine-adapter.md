---
id: FEAT-48
type: feature
status: closed
closed: 2026-08-15
opened: 2026-07-29
severity: major
source: owner decision 2026-07-29 (FEAT-36 blocking-out session)
relates_to: >
  FEAT-36 (dynamic physics objects — downstream), FEAT-35 (multi-vehicle AI traffic), FEAT-26/27
  (rockslides — a driver), story mode main mission (the log drag needs a distance/rope joint),
  SM-3 wear model (contact impulses feed the condition tracks), CLAUDE.md "Do NOT use physics libs"
  (this ticket REVERSES that rule), test/gates.mjs + test/replay.mjs (determinism + re-baselining),
  PERF-27 (cold-load budget — WASM adds to the story-mode boot path)
blocks: FEAT-36, FEAT-35, the log-drag chain constraint, rockslide-as-hazard coupling
note: "OWNER DECISION 2026-07-29: adopt a third-party physics engine as the core for EVERYTHING
including the vehicle, behind a THIN ADAPTER SEAM so the backend stays swappable. Chosen backend:
BOX3D (Erin Catto, C17, MIT). Fallback: Rapier. The seam is the risk mitigation — Box3D is v0.1.0
and its JS bindings are v0.0.2, so being wrong must cost a week, not a rewrite. DETERMINISM IS A
GO/NO-GO GATE before the migration proceeds past Phase 0. This REVERSES a documented CLAUDE.md hard
rule — deliberate and owner-made, not drift. Keep tire.js (Pacejka) and the suspension force curves."
---

# FEAT-48: Physics engine adapter seam (backend: Box3D)

## ⚑ STATUS 2026-08-14 — Phases 0–3 LANDED on `feature/box3d` (fable overnight job)

Box3D **passed Phase 0** (box3d.js 0.1.1, newer than this ticket's 0.0.2): determinism holds
run-to-run / cross-process / node-vs-browser (hash `ba6be98f42bc3b83`, now a standing gate —
`test/box3d-determinism-gate.mjs`); plain-node WASM load works; the full needed API surface exists;
cold load is 319 kB gz + 14 ms init. Bindings VENDORED at `vendor/box3d/`. Adapter is
`src/physics-engine.js` (seam grep-clean); terrain chunks mirror as heightfield colliders
(`src/terrain-physics.js`, exact composed mesh Y — MESH == PHYSICS); the vehicle rides an engine
body with tuned mass/inertia via SetMassData, our suspension/Pacejka feeding forces, CLEAN CUTOVER
(owner chose no A/B flag). Gates 51/51 green; before/after feel traces in `test/baselines/`
(driving scenarios match legacy to sub-cm; slam is the reviewed divergence). CLAUDE.md amended.

**Status updates 2026-08-15 (post-shakedown):**
- ✅ **Feel SIGNED OFF by the owner** after the full debris-contact shakedown (exact manifolds,
  enveloping, rim tracking; the within-step proxy experiment was reverted on feel — see commits).
  The formal `assert-m4-*` recordings are OPTIONAL RIGOR now — the owner's extended drive covered
  more ground than the canned maneuvers.
- ✅ **Inertia axes FIXED** (owner-approved): body-frame x now carries inertiaPitch, z carries
  inertiaRoll — the physically correct assignment (roll is about the longitudinal axis). The
  legacy world-frame swap is retired; feel baseline re-recorded. Pending one owner drive.
- ⏰ **Cross-machine determinism DEFERRED → INFRA-03** (owner ships before touching the Windows
  machine; the ticket is the reminder).
- **Single-precision** — the engine build is float32; ~1 mm position granularity at 10 km from
  origin. Fine at story-region scale; far teleports would want the double build or origin rebasing.
- ~~Known gap: chassis-vs-tunnel-bore-wall contact~~ **CLOSED 2026-08-14** — RoadPhysics mirrors
  road tiles (ribbon + pads + tunnel bores) as engine trimeshes, so the chassis collides with
  bore linings now. See also QUAL-25 (chassis collider fidelity, owner watch item).

## The decision [OWNER, 2026-07-29]

**Adopt a third-party physics engine as the core for everything — vehicle included — behind a thin
adapter so the backend is swappable.**

**Chosen backend: [Box3D](https://github.com/erincatto/box3d)** — Erin Catto's 3D engine. C17, MIT,
zero dependencies, "Soft Step" solver (the Box2D v3 TGS-Soft lineage). Chosen because it is new,
well-regarded, and from a developer with an exceptional track record in exactly this problem domain.

**Fallback if it doesn't pass muster: Rapier**, then Jolt. This is the explicit owner position —
Box3D is the pick, and the seam plus the Phase 0 gate below is how we find out cheaply if it was
wrong.

### Why the seam, specifically

Box3D is **v0.1.0** (~37 commits at time of writing, pull requests disabled) and the JS bindings
([`box3d.js`](https://github.com/isaac-mason/box3d.js), npm `box3d.js`) are **v0.0.2, single
maintainer, published 2026-07-01**. The engine's pedigree is excellent; its *track record* does not
exist yet, and the binding layer is one person's side project.

That is an acceptable risk **only** if swapping backends is a week of adapter work rather than a
re-migration. Hence: consumers (`physics.js`, `suspension.js`, `terrain.js`, debris) talk to the
adapter, never to the engine. **No engine type may leak past the seam** — not a handle, not a vector
type, not an enum.

Also recorded honestly: **there is no LLM training data for Box3D.** CLAUDE.md states this codebase is
primarily maintained by LLM sessions, so every future session will read headers rather than recall the
API. That is a real, ongoing tax and an argument for keeping the adapter surface *small* and
*thoroughly commented* — the adapter is the documentation.

### Considered and rejected

- *Extend the hand-rolled solver* — the accumulated-impulse Gauss-Seidel base is good, but every shape
  pair is hand-written, box–box (SAT + manifold clipping) is a week-plus of the bug-prone kind, and the
  inertia representation can't tumble correctly (below).
- *Engine for debris only, hand-rolled vehicle, kinematic proxy* — two integrators, a coupling
  boundary, no single source of truth. Per-body solver choice buys nothing once the engine is
  everywhere: **all contacts become two-way by default**, which was the goal.

**This reverses CLAUDE.md's `Do NOT use physics libs (Cannon/Rapier/Ammo)` rule**, whose stated
rationale was *learning, tuning transparency, terrain control* for the vehicle. Weighed against
generalized reusable physics and chosen. **Amend CLAUDE.md in the landing commit, not before** —
CLAUDE.md describes what the codebase *is*.

## Phase 0 — determinism + gates [GO/NO-GO, do this first]

**No migration work proceeds until this passes.** This is not a bake-off; it is a fitness test on the
chosen backend, with a documented fallback if it fails.

1. **Stand up the adapter interface** (below) with a Box3D implementation covering only what the test
   needs: a body, a heightfield collider, a raycast, a fixed-step advance.
2. **Determinism harness.** Drop a body onto a heightfield, run ~10k fixed steps, hash the final
   transform + a mid-run sample. Assert reproducibility:
   - **run-to-run** in the same process, and across fresh processes;
   - **node vs. browser** (the gates are pure-node; the game is a browser — both must agree);
   - **machine vs. machine** — this Mac vs. the Windows thin client (INFRA-01). SIMD paths differ
     (SSE2/Neon, `BOX3D_DISABLE_SIMD` exists) and this is where cross-platform determinism usually
     breaks. If SIMD must be disabled for determinism, **measure the perf cost and record it.**
3. **WASM loads in the pure-node harness** with no bundler step. `test/*.mjs` never touch Vite
   (CLAUDE.md) — if `box3d.js` cannot load headlessly under plain node, that is a hard blocker.
4. **Binding coverage audit.** The bindings cover "most APIs." Confirm the *narrow surface this
   project needs* is present: heightfield collider, raycast, contact-impulse readout, distance joint,
   sleep control, and per-body mass/inertia. **A gap here is a Phase 0 failure, not a mid-migration
   surprise.**
5. **Cold-load cost.** Measure the WASM fetch+init against the story-mode boot path (PERF-27: 14.7 s
   baked / 42.8 s unbaked today). Box3D's reported ~320 kB minzipped vs Rapier ~600 kB / Jolt ~840 kB
   is a reason it was attractive — verify it rather than inherit the claim.

**Exit:** determinism holds on all three axes, WASM loads headlessly, the needed API surface exists,
and cold-load impact is acceptable. **If any fail → swap the adapter implementation to Rapier and
re-run Phase 0.** Consumers are unaffected by construction; that is the whole point of doing this
first.

## The adapter surface (keep it small)

The narrow surface is possible because **we are not adopting anyone's vehicle controller** — see the
warning below. Roughly:

- **World:** create, fixed-step advance, gravity, destroy.
- **Bodies:** dynamic / static / kinematic; mass + inertia; transform get/set; velocity get/set;
  apply impulse at a point; sleep + wake.
- **Colliders:** sphere, capsule, box, convex hull, **heightfield**; friction/restitution material;
  collision filtering.
- **Queries:** raycast (returns point, normal, distance, **and the body hit**), shape cast, overlap.
- **Contacts:** per-contact impulse magnitude readout, at a seam the wear model can subscribe to later.
- **Joints:** distance/rope (the log-drag chain), and whatever else a later ticket needs.

Explicitly **not** in the adapter: any vehicle abstraction, any tire model, any suspension model.

> ### ⚠ Do NOT use the engine's built-in vehicle support
> Box3D has a **wheel joint**; Rapier has `DynamicRayCastVehicleController`; Jolt has a wheeled-vehicle
> constraint. **All of them come with their own simplified tire models, and `src/tire.js` (Pacejka) is
> the entire point of this project.** Adopting an engine vehicle would discard the thing the migration
> exists to preserve. Suspension stays our ray + our spring curve; slip stays our Pacejka. This is the
> obvious wrong turn for a future session to take — it is called out here so it doesn't happen.

## Why the vehicle integration is tractable

The suspension is already effectively a raycast vehicle, and the tire model is already decoupled from
how contacts are found:

- `src/tire.js` is **pure Pacejka math with no dependencies** — unaffected. Keep as-is.
- Suspension spring/damper curves consume a compression distance and a compression velocity; a ray hit
  still supplies both.
- `queryContacts` already returns `{normal, depth, contactPoint}` per contact, and `stepPhysics`
  already resolves **per contact** in a loop. An engine ray hit supplies the same tuple plus the body
  it hit. **The consumer shape doesn't change.**

### The one substantive change: relative velocity at the contact

Today the ground is implicitly at rest. `src/physics.js:340-341`:

```js
params._lateralVelocity      = hubVel.dot(wheelRight)
params._longitudinalVelocity = hubVel.dot(wheelFwd)
```

`hubVel` (line 328) and `contactVel` (line 394) are **absolute** velocities of the vehicle's own
points. Against a dynamic body they must become **relative**:

```
groundVel = hitBody.linvel + hitBody.angvel × (contactPoint − hitBody.center)
   // zero for the static heightfield; non-zero for a rock rolling under the wheel
slip      = (hubVel − groundVel) · axis
compVel   = −(contactVel − groundVel) · normal      // physics.js:399
```

…and the tire/suspension force applied to the chassis gets its **equal-and-opposite impulse applied to
the hit body** at the contact point.

**That single mechanism delivers all three rockslide behaviours with no special cases:** driving onto a
rock *launches the car* (suspension compresses against a real surface), *pops the tire* (contact
impulse crosses the puncture threshold on the wear curve), and *kicks the rock out from under you*
(reaction impulse). A rock falling **onto** the truck hits the chassis collider and reports an impulse
the radiator condition track reads. Same pipeline both directions.

### What gets replaced, and the tuning history that dies with it

The BUG-27 lineage — accumulated-impulse projected Gauss-Seidel, restitution *bias* sampled once
pre-solve, Baumgarte with per-step clamp, `BODY_FRICTION_MU` slipperiness (BUG-27b) — becomes the
engine's job. **Record this honestly:** that was hard-won work, and the inline BUG-27/BUG-27b comments
explaining *why* each guard exists should be preserved in the landing commit message. The failure modes
they document (restitution amplifying across passes; Baumgarte injecting PE and launching the body) are
real and will reappear as *tuning* questions in the new engine's terms.

Also replaced: the 6DOF quaternion integrator and the world-frame diagonal inertia. **This was already
a latent bug for FEAT-36's original scope** — inertia is applied as three world-axis-aligned scalars
(`inertiaRoll`/`inertiaYaw`/`inertiaPitch`, `physics.js:589-591` and `625-629`) with ω in world frame
(Step 5 uses `premultiply`). Fine for a mostly-upright truck, **wrong for a freely tumbling body**: no
`I_world = R·I_body·Rᵀ`, no gyroscopic `ω × Iω`. Correct handling is one of the concrete things being
bought.

## The hard part: the terrain collider lifecycle

**This, not the vehicle, is the biggest cost and the biggest risk.** The heightfield is streamed,
worker-generated, and road-carved (`terrain.js` `WORKER_SOURCE`, `road-carve.js`).

- Per-tile heightfield colliders created/destroyed on the same events as the visual tiles.
- Carve changes must invalidate and rebuild the affected collider, or physics and mesh diverge —
  **`MESH == PHYSICS` is an existing project invariant** (`project_stream_crossing_causeway`).
- **Watch the hitch.** PERF-02/03/05/21 history says tile churn is exactly where frame hitches live.
  Collider construction cost must be budgeted and **measured with the PERF-08 harness (`?prof=1`)**,
  not assumed cheap.
- Headless gates run without a renderer; the physics world must build from the same worker-generated
  heights the gates already use.

## Gates and re-baselining

- **Every physics gate needs re-baselining.** `test/gates.mjs` has 33 gates; the physics ones and
  `test/replay.mjs` assert against current hand-rolled behaviour. **Scope this as work**, and review
  the new baselines rather than regenerating them blindly.
- **`test/assert-m4-*.mjs` are the migration's real acceptance test** — load transfer, wheel
  independence, wheel lift, damping, ramp slide. Run them **before and after**; treat divergence as
  the review surface, not as noise.
- Determinism discipline (SM-INV-12) is unaffected: worldgen stays `(worldSeed, coords)`; physics is
  run-layer.
- *Note:* Box3D ships **recording and replay** natively. Out of scope here, but worth knowing it may
  later simplify `test/replay.mjs` and the `missions.md` leaderboard anti-cheat (input-trace
  re-simulation). Do not build against it in this ticket.

## Phasing

0. **Determinism + gates fitness test** — go/no-go (above).
1. **Adapter interface + Box3D implementation**, terrain heightfield colliders wired to streaming and
   carve invalidation.
2. **Vehicle** — chassis body + colliders, suspension as raycasts, `tire.js` retained and fed
   **relative** contact velocity, reaction impulses applied to hit bodies.
3. **Re-baseline gates**, run `assert-m4-*` before/after, audit debug sliders for what is still
   tunable (`feedback_phase_housekeeping`).

**Recommended for phase 2:** keep both physics paths live behind a flag long enough to A/B the driving
feel. The owner's eyes are the arbiter on feel (`feedback_visual_regression_revert_first`), and that
only works with something to compare against. Costs a temporary seam; delete it once feel is signed off.

## Explicitly out of scope

Debris bodies and shapes (FEAT-36) · the chain constraint (log drag) · AI traffic (FEAT-35) · damage
coupling (SM-3) · using Box3D's native record/replay. All of them are *why* this is being done; none
belong in the migration.

## Open questions (scope in plan mode)

- **Which collider for the chassis** — box, convex hull, or the existing body-probe points as a
  compound? Current body contact is deliberately *slippery* (BUG-27b, `BODY_FRICTION_MU = 0.1`) so a
  bumper grazing the shoulder slides instead of catching. **That behaviour must be reproduced as a
  friction material, not lost.**
- **Does the wheel stay a raycast or become a real cylinder collider?** Raycast matches today's model
  and is the tractable path; a real wheel collider is more correct and much more work.
- **Does SIMD have to be off for determinism?** (`BOX3D_DISABLE_SIMD` exists.) Phase 0 answers it; the
  perf cost is the thing to record.
- **Who owns the binding layer if `box3d.js` goes stale?** Vendoring it is the cheap insurance. Decide
  before depending on it, not after.

## Acceptance

- **Phase 0 passed and recorded**: determinism holds run-to-run, node-vs-browser, and machine-vs-machine;
  WASM loads in the pure-node harness; the needed API surface exists; cold-load impact measured
  against PERF-27's story-mode boot budget.
- **No engine type leaks past the adapter** — swapping to Rapier touches the adapter only. Verifiable
  by grep: no engine import outside the adapter module.
- The truck drives, and it drives *the same* — `assert-m4-*` traces match pre-migration within an
  agreed tolerance; rollovers, drifting and weight transfer still read honestly (the project's core
  value).
- Tire slip is computed against **relative** contact velocity; a dynamic body under a wheel imparts
  motion and receives the reaction impulse.
- Terrain colliders stream **without a measurable frame hitch** (PERF-08 harness, not eyeballed), and
  `MESH == PHYSICS` holds through carve updates.
- `npm run test:all` green with physics gates re-baselined **and the re-baselining reviewed**.
- CLAUDE.md's physics-lib rule amended **in the landing commit**, with the rationale recorded.

## Resolution (2026-08-15)

Merged to main (merge of `feature/box3d`) with the owner's feel sign-off on the final
inertia-axis fix (x=pitch, z=roll) and the 2026-08-15 chassis retune. 52/52 gates + clean
build post-merge. Remaining threads live in their own tickets: INFRA-03 (Windows determinism
hash), QUAL-25 (open-bed hollow bin), FEAT-36 remainder (causesDamage, world-fixture debris,
ASSET-25/26 art).
