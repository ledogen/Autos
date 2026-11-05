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

## Measured (Spare, 2026-11-01) — `wip/feat-70/stencil.mjs`, `wip/feat-70/real.mjs`

The shipped stencil (4 rings × 8 directions + centre = 33 height samples) was compared with an
**exact tire**: a cylinder of radius r = 0.368 m and width w = 0.235 m, solved densely in the wheel's
own plane.

**Synthetic kerbs** (wheel rolled across, hub rest height every 2 mm of travel):

| surface | stencil, biggest hub jump | exact tire | stencil error vs exact |
|---|---|---|---|
| sharp 15 cm step | **73.6 mm** in one 2 mm step (a ring seam) | 3.2 mm | 73 mm |
| 15 cm over 5 cm | 6.0 mm | 3.1 mm | 52 mm |
| sharp 15 cm at 30° | 73.6 mm | 3.2 mm | 100 mm |
| sharp 30 cm step | 105.9 mm | 11.2 mm | 103 mm |

**It is a sphere, not a disc.** The rings sample all around the hub, so the stencil feels things
beside the tire. A 15 cm kerb running parallel, 15 cm from the tire's centre plane (outside its
11.8 cm half-width), lifts the hub **76 mm**; the real tire: 0 mm.

**Real roads** (headless network + carved analytic terrain; 120 lines across road edges, 48k wheel
positions every 2 cm, heading across the road):
- the surface slope across an edge: p50 1.6°, p99 15°, max 89° (cut faces);
- stencil vs exact tire: **p50 9.3 mm, p99 66 mm**, max 485 mm.

So the error is not a kerb-only effect: the sphere envelope reads lateral relief all the time.

**The contact NORMAL is also wrong at an edge.** The stencil returns the terrain normal at its winning
sample. On a flat-topped step that is straight up, so meeting a kerb gives the wheel no horizontal
push back. Physically the force at an edge acts along the line from the edge to the axle. That
horizontal component is what slows a wheel that hits a kerb, and what it climbs on.

## Proposal — the complete model, approximations flagged (owner's call)

**What the physics says.**
1. **Geometry:** the tire is a solid cylinder, radius r (the soft band stays as now) and width w,
   posed by the wheel's real orientation (steer, body roll and pitch, so camber comes free). The
   contact is that solid's deepest penetration of the ground.
2. **Direction:** the force acts along the line from the contact point to the axle. At a smooth
   tangency that IS the surface normal (the maximum of h(s) + √(r² − s²) sits where the surface is
   tangent to the circle). At an edge it is the radial line, so a kerb now resists horizontally.
3. **Depth:** the depth along that line feeds the existing tire spring and the SM-3 rim strike
   (`WHEEL_SOFT_BAND`) unchanged. Only how the contact is FOUND changes.

**Option A (recommended): solve it in our own code, against the analytic surface.**
- For 3 lines across the width (both tire edges and the centre), search the lower rim:
  12 coarse samples, then a golden-section refinement around the best (≈ 8 more).
- About 60 height samples a wheel, against 33 now (1.8×). The normal comes from the geometry, so the
  separate `analyticNormal` lookup goes.
- It plugs into `queryContacts`' wheel path. The wheel's heading and axle must reach the query; the
  suspension already passes the corner index.

**Option B (not recommended): extend QUAL-25's Box3D wheel cores to collide with terrain.**
- It hands the tire's ground contact to the rigid solver.
- Those cores are the RIM (r − soft band), not the tire.
- The tire spring, struts and Pacejka are this project's, so it would fight them.

**Approximations, flagged:**
- **One contact per surface, the deepest point.** A real carcass spreads its load over a patch and can
  bridge two edges at once. Ceiling: a narrow ridge under a wide tire loads one point.
- **Three lines across the width.** Exact for anything wider than half the tire. A feature narrower
  than ~6 cm between lines can be missed (rocks are props and have their own exact query, so this is
  terrain-only).
- **The refinement is exact to ~1 mm at a kink.** The hub trace is continuous; the remaining jumps are
  real geometry: the contact moving from one feature to another, which a real tire does too.
- **The tire's radial stiffness stays the shipped tire spring.** No carcass sidewall model.

**What it will move:**
- `fingerprint-physics` (the bumpy-ground drive no longer feels lateral relief);
- `collision-drop-lab` and the m4 behaviours in family;
- driving on rough terrain, slightly: the hub follows the ground under the tire, not ground beside it.

It must not move the surface itself: the road and terrain gates stay unchanged.

**Perf risk to check in the build:** refinement samples land in arbitrary 5 cm memo cells, so PERF-24's
near-stationary death-spiral needs re-measuring. The coarse grid can be snapped to the memo cells if
it bites.

**Owner answers needed:**
- A or B (A recommended);
- 3 lines across the width, or the tire edges only (2 lines, cheaper);
- confirm the radial normal at edges (a kerb will now slow a wheel that hits it).

## Owner ruling — 2026-11-03: A, 3 lines

Option A (our own tire-cylinder solve), **3 lines** across the width (both edges and the centre), the radial
normal at the edges confirmed (a kerb now slows a wheel that hits it). Lane B builds (moved from Spare 11-04); physics identity is
expected to change — `fingerprint-physics.mjs` diff explained in the ticket, PERF-24's memo-cell check re-run.
