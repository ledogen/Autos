---
id: BUG-50
type: bug
status: closed
opened: 2026-08-15
closed: 2026-08-15
severity: minor
source: user-observation (Windows machine — collider wireframes visibly off the truck at speed)
relates_to: FEAT-48 (physics-debug.js collider wireframes), D-09 (1/60 physics step)
---

# BUG-50: Chassis collider wireframe sits up to one physics step off the vehicle model

## Observed

With collider wireframes enabled (`` ` ``), the chassis wireframe does not line up with the visual
body. Negligible at low speed; clearly separated at high speed.

## Cause

The two are posed from different clocks — a rendering bug, not a physics one.

- The truck's **meshes** are drawn at the subframe render pose:
  `lerp(prev step, this step, accumulator / PHYSICS_DT)` (`src/main.js` — the interpolated
  `_renderPos` / `_renderQuat` temporarily substituted into `vehicleState` around
  `syncMeshesToState`).
- The **wireframe** read the raw engine transform via `getTransform()`, i.e. *this* step exactly,
  and it ran *after* `vehicleState` was restored to the physics pose.

So the box led the model by `(1 - alpha) · dt`, up to a full 1/60 s of travel — ~0 m parked, ~0.5 m
at 30 m/s. (The truck is the one being held back by the interpolation, so the box is strictly ahead;
which of the two reads as "lagging" depends on the camera.) The offset scales with speed, which is
exactly the reported symptom.

## Fix

`PhysicsWireframes.update()` takes an optional `vehiclePose` and applies it to the body whose
`userData.kind === 'vehicle'` instead of calling `getTransform`. `src/main.js` passes the same
`_renderPos` / `_renderQuat` the meshes used. The substitution is **exact, not an approximation**:
`vehicleState.position/quaternion` is the chassis body transform verbatim (`physics.js`'s
end-of-step `getTransform`), so interpolating it is interpolating the body.

Debris deliberately keeps the raw transform: debris *meshes* are also posed straight from
`getTransform` (`debris.js update()`), so raw-vs-raw already agrees and interpolating only the
wireframe would have introduced the very mismatch this fixes.

## Known residual (not worth chasing)

The wheel rim-core spheres follow `spec.offset`, mutated at physics rate by `setSphereLocal`, so
those remain one step ahead *within* the interpolated group. At strut-travel speeds that is
sub-centimetre.
