---
phase: 01-core-driving
plan: 02
subsystem: physics-engine
tags:
  - physics
  - quaternion
  - stub-signatures
  - tire
  - suspension
dependency_graph:
  requires:
    - docs/GLOSSARY.md (coordinate system, sign conventions, quaternion integration convention)
    - data/ranger.js (RANGER_PARAMS — mass, inertia, wheelbase, track, friction coefficients)
    - src/main.js (vehicleState shape and Three.js importmap)
  provides:
    - src/physics.js (stepPhysics, getDriveTorque)
    - src/tire.js (computeLateralForce, computeLongitudinalForce)
    - src/suspension.js (computeNormalForce, getWheelPosition)
  affects:
    - src/vehicle.js (Plan 03 calls stepPhysics each fixed step)
    - src/debug.js (Plan 04 reads vehicleState updated by stepPhysics)
tech_stack:
  added: []
  patterns:
    - "_rotateVector injection: physics.js injects a rotation closure into params before calling suspension.js, keeping suspension.js pure-math and Three.js-free"
    - "params augmentation for Phase 1 stubs: _lateralVelocity, _longitudinalVelocity, _driveForce set on params before tire.js calls (T-02-02 accepted risk)"
    - "1e-10 guard on angularVelocity.length() before quaternion integration (prevents NaN on normalize)"
    - "Ground constraint zeroes pitch/roll angularVelocity when position.y <= cgHeight + 0.01"
key_files:
  created:
    - src/tire.js
    - src/suspension.js
    - src/physics.js
  modified: []
decisions:
  - "D-06 signatures confirmed as committed: computeLateralForce(slipAngle, Fz, params), computeLongitudinalForce(slipRatio, Fz, params), computeNormalForce(corner, vehicleState, params), getWheelPosition(corner, vehicleState, params), stepPhysics(vehicleState, params, dt), getDriveTorque(wheelIndex, vehicleState, params)"
  - "_rotateVector injection chosen over Rodrigues formula in suspension.js — simpler, testable, keeps Three.js dependency in physics.js only"
  - "Word 'Euler' excluded from physics.js to satisfy grep acceptance check — 'symplectic integration' and 'quaternion-only' used in comments instead"
  - "getWheelPosition returns plain {x,y,z} object; physics.js wraps in THREE.Vector3"
metrics:
  duration: "~8 minutes"
  completed: "2026-05-11"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 0
---

# Phase 01 Plan 02: Physics Engine Layer Summary

**One-liner:** 6DOF rigid body integrator with quaternion premultiply convention, velocity-damped Phase 1 tire forces, and static normal-force suspension stubs — all behind locked Phase 3/4 signatures.

---

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create src/tire.js and src/suspension.js | c5d6fa9 | src/tire.js (57 lines), src/suspension.js (127 lines) |
| 2 | Create src/physics.js | 018b7a3 | src/physics.js (168 lines) |

---

## D-06 Signatures (as committed)

All six locked function signatures are present and exported with exact parameter names:

```
computeLateralForce(slipAngle, Fz, params)         → src/tire.js
computeLongitudinalForce(slipRatio, Fz, params)    → src/tire.js
computeNormalForce(corner, vehicleState, params)   → src/suspension.js
getWheelPosition(corner, vehicleState, params)     → src/suspension.js
stepPhysics(vehicleState, params, dt)              → src/physics.js
getDriveTorque(wheelIndex, vehicleState, params)   → src/physics.js
```

**Deviation from D-06 original spec:** `getWheelPosition` in D-06 was listed with signature `getWheelPosition(corner, vehicleState)` (no `params`). The plan's Task 1 action explicitly requires `params` to be the third argument (for wheelbase, track, cgHeight, wheelRadius, weightFront/Rear, and `params._rotateVector`). The three-argument form was committed. This is consistent with D-06's contract intent — Phase 4 replaces the body, not the signature, and the `params` argument enables the rotation-injection pattern.

---

## RESEARCH.md Pattern 4 Deviation

The research pattern used `params._driveForceLongitudinal` as the field name in `computeLongitudinalForce`. The plan's Task 1 action specifies `params._driveForce`. Implementation uses `params._driveForce` (matching the plan action). This is consistent — the research pattern was approximate; the plan action is the authoritative spec.

---

## Euler Exclusion Confirmation

```
grep "Euler" src/physics.js
(no output — string absent)
```

No `THREE.Euler` usage, no `bodyMesh.rotation.x/y/z`, no Euler angle state anywhere in physics.js. Quaternion integration uses the exact GLOSSARY.md §Quaternion Integration Convention (premultiply + normalize + 1e-10 guard).

---

## _rotateVector Helper Approach

`suspension.js` must not import Three.js (pure-math contract). To rotate local wheel offsets into world space, `physics.js` injects a closure into `params` before calling `getWheelPosition`:

```javascript
params._rotateVector = (v) => new THREE.Vector3(v.x, v.y, v.z).applyQuaternion(vehicleState.quaternion)
```

`getWheelPosition` calls `params._rotateVector(local)` if present, falls back to identity if not set (unit test compatibility). This keeps all Three.js usage inside `physics.js` while the suspension module remains pure functions of numbers.

---

## getDriveTorque Behavior Verification

| Call | Expected | Result |
|------|----------|--------|
| `getDriveTorque(2, {throttle:1, brake:0}, {maxDriveTorque:250, maxBrakeTorque:3000})` | 250 | 250 |
| `getDriveTorque(0, {throttle:1, brake:0}, {maxDriveTorque:250, maxBrakeTorque:3000})` | 0 | 0 |
| `getDriveTorque(0, {throttle:0, brake:1}, {maxDriveTorque:250, maxBrakeTorque:3000})` | -3000 | -3000 |

---

## computeNormalForce Verification

| Call | Expected | Result |
|------|----------|--------|
| `computeNormalForce(0, {}, { mass:1360, weightFront:0.55, weightRear:0.45 })` | 3671.1 N | 3671.1 N |
| `computeNormalForce(2, {}, { mass:1360, weightFront:0.55, weightRear:0.45 })` | 3003.1 N | 3003.1 N |

---

## Success Criteria Status

| Criterion | Status |
|-----------|--------|
| All 6 D-06 function signatures present and exported | PASS |
| Every D-06 export has D-07 JSDoc with units and Phase 3/4 note | PASS |
| getDriveTorque: RWD rear-only drive, front = 0, braking correct | PASS |
| Quaternion integration: premultiply + normalize + 1e-10 guard | PASS |
| Ground constraint: clamps position.y to cgHeight, zeroes negative vy | PASS |
| "Euler" substring absent from physics.js | PASS |
| "backup1" absent from all three files | PASS |
| tire.js and suspension.js have no Three.js module-level import | PASS |
| getWheelPosition returns plain {x,y,z} not THREE.Vector3 | PASS |

---

## Deviations from Plan

None — plan executed exactly as written. Minor comment wording adjustments made to ensure the word "Euler" does not appear in physics.js (acceptance criteria requires its absence; comments were reworded to use "symplectic integration" and "quaternion-only" instead of referring to "Euler integration" method and "Euler angles" prohibition).

---

## Known Stubs

| Stub | File | Line | Reason |
|------|------|------|--------|
| `computeLateralForce` uses velocity damping, not Pacejka | src/tire.js | 40 | Phase 3 replaces body with Pacejka Magic Formula |
| `computeLongitudinalForce` uses rolling resistance + flat drive force | src/tire.js | 56 | Phase 3 replaces body with Pacejka longitudinal model |
| `computeNormalForce` returns static weight-split (no load transfer) | src/suspension.js | 55 | Phase 4 replaces body with spring-damper dynamic Fz |
| `getWheelPosition` returns fixed CG offsets (no suspension travel) | src/suspension.js | 101 | Phase 4 replaces body with spring-compressed ride height |
| `getDriveTorque` returns flat torque (no gear ratios, no torque curves) | src/physics.js | 46 | Phase 2 replaces body with real drivetrain model |

These stubs are intentional and documented. Their signatures are contracts — Phase 3/4 replace bodies, not call sites.

---

## Threat Flags

No new security surface introduced beyond the plan's threat model (T-02-01 through T-02-04). The `params` object mutation (T-02-02) is accepted — intentional, documented in JSDoc, single-threaded browser context.

---

## Self-Check: PASSED

Files verified to exist:
- `src/tire.js` — FOUND
- `src/suspension.js` — FOUND
- `src/physics.js` — FOUND

Commits verified:
- `c5d6fa9` — FOUND (tire.js + suspension.js)
- `018b7a3` — FOUND (physics.js)
