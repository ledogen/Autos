---
id: FEAT-70
type: feature
status: open
opened: 2026-08-22
severity: minor
source: >
  Owner, 2026-08-22, while tuning SM-3. Rolling slowly onto a road edge the tire climbed in visible
  discrete steps. The immediate cause was fixed (see below), but the underlying approximation is
  the real subject: "the original intent here would be to have a disc shaped collider on the wheel
  and have it look out at potential collisions and respond with a normal force to anything that
  penetrates that disc."
relates_to: >
  src/main.js queryContacts (the footprint stencil), PERF-24 (the carveHint memo the stencil leans
  on), src/suspension.js effectiveWheelRadius + WHEEL_SOFT_BAND, QUAL-25 (the wheel hard cores,
  which ARE a disc but only collide with debris), SM-3 rim damage (consumes the depth this produces)
---

# FEAT-70: Solve the wheel's disc contact instead of sampling for it

## What it is now

The wheel's contact with terrain and roads is found by **sampling**. `queryContacts` sweeps a
stencil of offsets around the hub and takes the envelope maximum of `h(sample) + sqrt(r² − d²)` —
the wheel-centre rest height each sample implies. The winning sample sets depth, contact point and
normal.

That is a discrete approximation of a continuous shape, and it shows. It was two rings of four
offsets; the owner could see the wheel climb a road edge in two steps, one per ring. It is now four
rings of eight (2026-08-22, commit `e703d22`), which makes the steps small enough to stop reading
as a teleport — but they are still steps, and a genuinely sharp edge will still show them.

Two related things were fixed on the way and are NOT what this ticket is about:

- the stencil shared ONE road-run resolve taken at the wheel centre, so with the centre still off
  the road every sample resolved against bare terrain and the envelope could not see the road edge
  at all until the centre crossed it. Each sample resolves its own run now.
- the ring count, above.

## What it should be

Solve the contact for the wheel as the **disc it is** — plane through the hub, normal along the
spin axis, radius `effectiveWheelRadius` — against the surface, and return the true deepest
penetration with its exact point and normal. No sampling radii, so no seams, and the result is
correct for an edge met at any angle rather than at the angles the stencil happens to probe.

The engine already has the right idea one layer in: QUAL-25's wheel hard cores are real disc
colliders (12-gon prisms, `wheelRadius − WHEEL_SOFT_BAND`) solved by Box3D. They collide with
DEBRIS ONLY, deliberately, so driving feel is untouched by construction. Whether the answer here is
to extend that to terrain, or to solve the disc analytically against the heightfield the way the
carve resolver already works, is the design question this ticket opens.

## Why it matters beyond feel

The depth this produces is what SM-3's rim damage reads: once contact depth exceeds
`WHEEL_SOFT_BAND` the rim is taking load directly. Depth that arrives in steps makes a rim strike a
step function too, so the damage model inherits whatever fidelity this has.

## Acceptance

- Rolling onto a road edge or a kerb at low speed raises the wheel **continuously** — no visible
  step at any approach angle, and none in a frame-by-frame trace of hub Y.
- Contact depth, point and normal are continuous in wheel position (no discontinuity as an edge
  passes a former sampling radius).
- Driving fps on switchbacks is no worse than the stencil's. PERF-24's death-spiral case (a
  near-stationary wheel dispatching many catch-up steps on a switchback) stays bounded — that is
  what the `carveHint` memo exists for and any replacement needs the same property.
- `npm run test:all` green, with the road/terrain gates unchanged: this must not move the surface
  the truck rests on, only how faithfully it is found.
- `test/collision-drop-lab.mjs` drop numbers stay in family; a change there means the contact depth
  moved, which is a result worth understanding rather than absorbing.
