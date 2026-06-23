---
id: FEAT-09
type: feature
status: open
opened: 2026-06-23
severity: minor
source: user-idea
note: "Request/idea only — NOT being built yet. Evaluated 2026-06-23: the proposed pipeline (find collision → normal per collision → tire-spring per collision → sum) is ALREADY the physics architecture (queryContacts → contact list → per-contact resolve in stepPhysics). The new work is adding debris as a contact source + making debris dynamic (movable rigid bodies with two-way coupling). Not a boondoggle — modular extension of an existing clean design."
---

# FEAT-09: Generic contact pipeline → drive over debris / dynamic objects naturally

## What already exists (the design is right)

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
