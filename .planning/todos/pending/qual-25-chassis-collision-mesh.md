---
id: QUAL-25
type: quality
status: open
opened: 2026-08-14
severity: minor
source: owner watch item (2026-08-14, FEAT-48 shakedown drive)
relates_to: FEAT-48 (engine adapter — chassis hull lives in physics.js createVehicleChassis),
  FEAT-36 (debris — what the chassis mostly hits), data/vehicle-models.js (the visual bodies)
---

# QUAL-25: Chassis collider — replace the coarse hull with a mesh that approximates the body

## ⚑ STATUS 2026-08-15 — compound LANDED for the hilux model; ticket stays open for the open bed

`createVehicleChassis` (physics.js) is now a 4-hull compound measured off hilux.glb through its
exact VEHICLE_MODELS seating transform (CHASSIS_PROFILE constants, provenance in the comment):
lower slab (bumpers/fenders, undercarriage plane unchanged) + hood wedge + cab with raked
windshield to the REAL roof (y +1.04 — the old plane was 0.40) + bed deck at rail height. Probe-
verified in-game via body-frame raycasts: bed 0.29, roof 1.04, windshield 0.80, hood 0.42, nose
0.32, beltline outside cab width. A barrel dropped on the cab slides off the windshield.

**OWNER RULING (2026-08-15): THIS model has no open bed** — the bed top is closed geometry (reads
as a tonneau cover), so the deck is a SOLID at rail height. The eventual open-bed wish stands:

## Remaining (why this stays open)

- **Open bed as a hollow bin** (floor + three wall hulls + tailgate) so cargo can ride in the bed
  — blocked on a vehicle model that actually models an open bed; also what ASSET-27..30 visible
  cargo wants.
- **Per-model hull data** in data/vehicle-models.js once a second vehicle model exists
  (CHASSIS_PROFILE is single-model by construction).

## Watch item (owner)

The FEAT-48 chassis collider is ONE convex hull spanning the old body-probe extents — a box, in
effect (full width × bumper-to-bumper × undercarriage-to-roof). It replaced the even coarser
probe SPHERES, but it is still very coarse: no cab/bed step, no windshield rake, no open bed, no
bumper shelf. Visible consequences: debris and walls contact a phantom volume above the bed and
ahead of the real bumpers; a barrel "lands in the bed" by resting on the roof plane; rollovers
rest on the box, not the cab.

## Direction

A compound of a few convex pieces (engine hulls are convex-only) approximating the real body:
frame/bed slab + cab block with raked windshield + front/rear bumper bars. Options, cheapest
first:

1. **Hand-parameterised compound** in `createVehicleChassis` from RANGER_PARAMS dims (3–4 hulls).
   Data-free, works for every vehicle that shares the pickup proportions.
2. **Derive from the vehicle GLB** — convex decomposition is overkill; a curated set of hulls per
   vehicle model (data/vehicle-models.js entry carries hull point sets, like prop collision
   metadata). Per-vehicle honest, more authoring.

Keep: mass/inertia stay the TUNED SetMassData override regardless of collider shape; BUG-27b
slippery material (chassis μ 0.0125 vs terrain); adapter-seam rule (no engine types outside
physics-engine.js).

## Acceptance

- Chassis contact points follow the visible body: a barrel can arc into the OPEN BED and rest on
  the bed floor; nothing collides above the bed rails or ahead of the real bumpers.
- Rollover rests on cab/bed geometry plausibly (no floating on an invisible roof plane).
- Feel unchanged on the standard scenarios (test/vehicle-feel-trace.mjs vs the box3d baseline —
  slam scenario may legitimately shift; review it, don't blind-accept).
- assert-m4 drive-time checks still read honest; gates green.
