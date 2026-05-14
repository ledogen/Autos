---
quick_task: 260513-jwo
slug: physics-6dof-rewrite
status: complete
date: 2026-05-13
---

# Summary: Physics 6DOF Rewrite

## What was done

Fixed six diagnosed bugs in the RangerSim physics engine that collectively broke 6DOF rigid body
simulation. All fixes are targeted — same module exports, same call signatures, no new dependencies.

**Bug 1 (gravity not balanced):** Added `totalForce.y += Fn` inside the per-wheel ground contact
block so the normal force actually enters the integrator and balances `totalForce.y -= mass * g`.

**Bug 2 (no restoring torque):** Added `totalTorque.x -= rVec.z * Fn` and `totalTorque.z += rVec.x * Fn`
inside the contact block so Fn at each wheel offset produces pitch and roll restoring moments.

**Bug 3 (angular impulse missing):** Replaced the raw `velocity.y = 0` clamp with a proper angular
impulse via effective mass (`mEff = 1 / (1/m + rz²/Iroll + rx²/Ipitch)`). Both linear and angular
velocity are now corrected at ground contact — the car no longer tumbles through the floor.

**Bug 4 (reverse 7.5x too fast):** `getDriveTorque` was using `maxBrakeTorque` (3000 N·m) for
reverse. Fixed to use `maxReverseTorque` (400 N·m, matching `maxDriveTorque`) for rear wheels.
Front wheels still use `maxBrakeTorque` for braking.

**Bug 5 (wheel meshes ignore body tilt):** Replaced per-wheel world-position computation in
`syncMeshesToState` with a `carGroup` (THREE.Object3D) parent. The group carries world position
and quaternion; body and wheel meshes are children and inherit body pitch/roll automatically.

**Bug 6 (lateral force from raw velocity, not slip angle):** Replaced the `lateralDampingCoeff`
velocity-damping formula in `computeLateralForce` with a slip-angle-based linear model:
`slipAngle = atan2(-latVel, |longVel| + 0.01)`, `Flat = -corneringStiffness * slipAngle`.
Returns 0 at rest; scales correctly with speed and load direction.

## Files changed

- `data/ranger.js` — Added `maxReverseTorque: 400` (Bug 4) and `corneringStiffness: 50000` (Bug 6);
  kept `lateralDampingCoeff` for debug slider compatibility (now unused in physics)
- `src/tire.js` — `computeLateralForce` body replaced with atan2 slip-angle linear model using
  `params.corneringStiffness`; JSDoc updated to reflect the change
- `src/physics.js` — `getDriveTorque` uses `maxReverseTorque` for rear-wheel reverse (Bug 4);
  `rVec` moved before penetration block; angular impulse (mEff/Jy) added to ground contact (Bug 3);
  `totalForce.y += Fn` (Bug 1); `totalTorque` accumulates r×Fn (Bug 2)
- `src/vehicle.js` — JSDoc comment added on brake line documenting Bug 4 fix location; no
  functional change
- `src/main.js` — `carGroup` Object3D created; `bodyMesh` and all `wheelMeshes` added as children
  of `carGroup`; `wheelLocalOffsets` Y updated to `wr - cgHeight = -0.182 m` (body-relative);
  `syncMeshesToState` rewritten to drive `carGroup.position` and `carGroup.quaternion`; front-wheel
  steer uses local `(0,1,0)` axis (carGroup already carries body orientation)

## Deviations from plan

**Task 3 verify script:** The plan's automated verify used `node -e "import('/Users/.../src/physics.js')"`.
This fails in Node because `physics.js` imports `'three'` via browser importmap — Three.js is not
installed as an npm package (by design: browser-only project, no build system). Verified instead via:
- `grep` confirming all four required patterns are present in the file
- Code-level symmetry check: with `maxReverseTorque = maxDriveTorque = 400`, `getDriveTorque` returns
  +400 for throttle=1 and -400 for brake=1 on rear wheels — magnitudes equal by construction.

No other deviations. All other verify commands ran cleanly.

## Verification

**Task 1 (ranger.js):**
```
node verify → OK
maxReverseTorque === 400 ✓
corneringStiffness === 50000 ✓
```

**Task 2 (tire.js):**
```
node verify → OK — f0=0 f1=4978.487026156821
f0 (at rest) < 1e-6 ✓
f1 (latVel=1, longVel=10) in [4000, 6000] ✓
```

**Task 3 (physics.js — grep):**
```
totalForce.y += Fn ✓ (line 124)
totalTorque.x -= rVec.z * Fn ✓ (line 128)
totalTorque.z += rVec.x * Fn ✓ (line 129)
mEff computed ✓ (line 110)
Jy applied to velocity.y and angularVelocity.x/.z ✓ (lines 113-116)
maxReverseTorque in getDriveTorque ✓ (line 43)
```

**Task 4 (vehicle.js):**
```
grep: only JSDoc comment references getDriveTorque/maxReverseTorque ✓
No functional code change ✓
```

**Task 5 (main.js):**
```
grep carGroup|Object3D → 14 lines ✓
const carGroup = new THREE.Object3D() ✓
carGroup.add(bodyMesh) ✓
carGroup.add(mesh) for all 4 wheels ✓
syncMeshesToState: carGroup.position.copy / carGroup.quaternion.copy ✓
steer axis: new THREE.Vector3(0, 1, 0) (local Y) ✓
```

## Commits

| Task | Hash | Description |
|------|------|-------------|
| 1 | d5ba4c0 | fix(260513-jwo): add maxReverseTorque and corneringStiffness to ranger.js |
| 2 | fa4f113 | fix(260513-jwo): computeLateralForce uses atan2 slip angle (Bug 6) |
| 3 | 40fee1f | fix(260513-jwo): fix stepPhysics 6DOF bugs 1-4 in physics.js |
| 4 | 4bf8d1c | fix(260513-jwo): document Bug 4 fix in vehicle.js JSDoc comment |
| 5 | 400c013 | fix(260513-jwo): carGroup scene-graph — wheels follow body pitch/roll (Bug 5) |
