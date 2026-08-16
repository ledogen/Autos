---
id: FEAT-09
type: feature
status: completed
opened: 2026-06-23
closed: 2026-08-15
severity: minor
source: user-idea
relates_to: FEAT-48 (Box3D adapter seam — superseded this), FEAT-36 (dynamic debris — delivered Phase 3), FEAT-26 (rockslides — the consumer that pointed here)
note: "Request/idea only — NOT being built yet. Evaluated 2026-06-23: the proposed pipeline (find collision → normal per collision → tire-spring per collision → sum) is ALREADY the physics architecture (queryContacts → contact list → per-contact resolve in stepPhysics). The new work is adding debris as a contact source + making debris dynamic (movable rigid bodies with two-way coupling). Not a boondoggle — modular extension of an existing clean design."
---

# FEAT-09: Generic contact pipeline → drive over debris / dynamic objects naturally

## Resolution (2026-08-15) — closed as SUPERSEDED; the goal shipped, the plan did not

**The outcome this ticket wanted is on main. The route it proposed was reversed by the owner on
2026-07-29 and none of its three phases was ever built as written.**

That decision (FEAT-48): a third-party engine becomes the rigid-body core for *everything*, vehicle
included, behind the thin adapter seam `src/physics-engine.js` — backend **Box3D**, fallback Rapier.
Both FEAT-48 and **FEAT-36** (dynamic debris, `src/debris.js`) merged to main 2026-08-15.

Phase by phase:

- **Phase 1 (formalize the `Contact` contract)** — *obsolete*. The contract now lives at the adapter
  seam, and it is the engine's, not ours. Formalizing the hand-rolled `queryContacts` interface would
  have been work spent on a layer that was about to be replaced.
- **Phase 2 (static obstacle contacts, spatial hash)** — *delivered, differently*. Broad-phase and
  narrow-phase are the engine's. The hand-rolled spatial hash was never written, and **boxes and
  convex shapes came free** — the item this ticket priced as expensive.
- **Phase 3 (dynamic debris, "the meaty part")** — *delivered by FEAT-36*. Two-way coupling is the
  engine's default with no bridge and no kinematic proxy; sleeping, restitution, friction and rock↔
  rock all came with it. Gated by `test/debris-coupling.mjs`.

Its risk list aged well, and each risk was retired rather than argued away: **inertia** — the
hand-rolled world-frame diagonal tensor genuinely could not tumble a body, which was a deciding
input to FEAT-48; **stability** — vehicle feel is unchanged, gates green; **determinism** — held,
debris is run-layer and flag-gated off in headless.

Two loose ends, neither belonging here:

- **Multi-point tire footprint** (the "optional" section) was never built and is still a real idea
  for slow-speed rock-crawling fidelity. It is orthogonal to contacts and is not tracked by any open
  ticket — reopen it as its own if it's wanted. Note the vehicle model stays **ours** (Pacejka +
  struts); never adopt an engine wheel joint.
- **FEAT-08 composition** is moot — grade-separated overpasses were **descoped** and `GRADE_SEP` is
  gone.

## What already existed at the time (accurate when written, now historical)

The hand-rolled physics is already contact-list based:
- `queryContacts(cx,cy,cz,r)` (main.js) returns `Array<{normal, depth, contactPoint}>` — documented as
  "every contact at the queried sphere... supports walls, slopes, and **multiple simultaneous contacts**".
- `stepPhysics` (physics.js:~322) resolves `for (const { normal, depth, contactPoint } of contacts)` —
  suspension spring (normal force from `depth`) + Pacejka tire force **per contact**, summed.
- The wheel is a **sphere probed from its center** (sphere-vs-heightfield = one contact under center;
  sphere-vs-triangle for the ramp). The ±0.5 m "4 probes" are central differences for the surface
  NORMAL at one contact — NOT contact-patch corners.

So "find collision → normal per collision → tire-spring per collision → sum" is the current pipeline.
Only the set of **contact sources** is limited (terrain heightfield + retired ramp tris).

## The missing pieces (phased)

**Phase 1 — formalize the contact contract (low risk, mostly docs/types).**
Define `Contact { point, normal, depth, source, materialId? }` as the explicit interface every source
emits and the resolver consumes. Confirm `queryContacts` is the single broad+narrow entry and the
resolver is source-agnostic. (Largely true today — this just makes it a deliberate seam.)

**Phase 2 — static obstacle contacts (near-free given the loop).**
Broad-phase nearby static colliders (rocks/curbs as fixed convex/sphere shapes) per wheel, narrow-phase
sphere-vs-shape, append to the contact list. Truck drives over fixed debris immediately — no new force
model. Use a spatial hash so cost is bounded, not O(wheels × objects).

**Phase 3 — DYNAMIC debris (the real work).**
Each debris piece gets its own rigid-body state (pos/quat/vel/omega) + integrator, and **two-way
coupling**: the contact that pushes the wheel up applies an equal-opposite impulse to the debris so it
rolls/scatters. Needs: a broad-phase shared by wheels↔debris↔debris, restitution/friction at
debris contacts, and sleeping for resting debris. This is a mini rigid-body subsystem — the meaty part.

**Optional — multi-point tire footprint.**
For slow-speed rock-crawling fidelity over sharp/uneven ground, sample the tire footprint at several
points (not just center) and combine — better penetration/normal when one edge of the tire is on an
obstacle. Orthogonal to the above; the sphere model already rolls over bumps adequately for normal speed.

## Risks / open questions

- **Pacejka across multiple contacts.** Normal (suspension) force sums cleanly; tire FRICTION is per
  contact patch — a wheel straddling ground + a rock is an approximation in the summed model. Fine for
  "bump over debris," needs care for precise crawling traction (maybe resolve friction at the dominant/
  deepest contact, treat others as pure normal bumps).
- **Stability.** The physics feel (Pacejka + suspension) is hand-tuned; debris contacts must not
  destabilize it. Gate changes against the rainy-day physics asserts (`test/assert-m4-*.mjs`).
- **Determinism.** Debris must be deterministic if it interacts with the seeded world/replay tooling.
- Composes with **FEAT-08** (grade-separated overpasses) — a second surface level is just another
  contact source / multi-level broad-phase.

## Acceptance (when picked up)

- [ ] Phase 1: explicit `Contact` contract; resolver provably source-agnostic.
- [ ] Phase 2: a fixed rock/curb in the road is driveable-over with correct normal + suspension response;
      broad-phase bounded (spatial hash), gates green.
- [ ] Phase 3: a loose object on the road is pushed/rolls when driven over (two-way coupling), rests
      stably, and does not destabilize vehicle feel (asserts green).
