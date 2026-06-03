---
slug: 260527-qad-terrain-normal-fn-angular-damping
title: "Fix ground constraint: terrain-normal Fn direction + angular damping + ramp"
status: in_progress
created: 2026-05-27
---

# Fix: Terrain-Normal Fn Direction + Angular Damping

## Objective

Two physics corrections to enable correct 3D body behavior on non-flat surfaces:

1. Apply Fn along terrain surface normal instead of world-up `(0,Fn,0)`.
   On a slope the restoring torques must balance at the slope angle, not at level.
2. Replace hard `angularVelocity.x/z = 0` with angular damping (`*= 0.85`).
   Kills contact oscillation while allowing pitch/roll to settle correctly on slopes.

Also add a 10° test ramp to terrain() + a matching visual mesh for evaluation.

## Tasks

### 1. src/physics.js — accept terrain as 4th parameter
- Change signature: `stepPhysics(vehicleState, params, dt, terrain)`
- Add fallback: `const _terrain = terrain || (() => ({ height: 0, normal: new THREE.Vector3(0, 1, 0) }))`

### 2. src/physics.js — Step 1: use terrain height for penetration
- Change penetration loop to use `_terrain(cp.x, cp.z).height - cp.y` instead of `-cp.y`
- Replace `angularVelocity.x = 0; angularVelocity.z = 0` with `*= 0.85`

### 3. src/physics.js — Step 3b: apply Fn along terrain normal
- Query `_terrain(contactPt.x, contactPt.z)` per wheel
- Use `surface.height + 0.005` for grounded check
- Apply `FnVec = normal * Fn` via `totalForce.add(FnVec)` + `totalTorque.add(r × FnVec)`
- Remove explicit pitch/roll torque lines (replaced by cross product)

### 4. src/main.js — pass terrain to stepPhysics
- Change call site: `stepPhysics(vehicleState, RANGER_PARAMS, FIXED_DT, terrain)`

### 5. src/main.js — add 10° ramp to terrain() + ramp mesh
- Add ramp constants (RAMP_ANGLE=10°, RAMP_START_Z=-15, RAMP_LENGTH=8m)
- terrain() returns ramp height/normal for z in [RAMP_START_Z - RAMP_LENGTH, RAMP_START_Z]
- terrain() returns flat plateau at max ramp height for z < RAMP_START_Z - RAMP_LENGTH
- Add inclined PlaneGeometry mesh aligned to the terrain function geometry
