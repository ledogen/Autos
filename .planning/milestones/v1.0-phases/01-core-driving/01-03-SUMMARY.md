---
phase: 01-core-driving
plan: 03
subsystem: vehicle-input
tags:
  - vehicle
  - input
  - ackermann
  - drivetrain
  - hud
dependency_graph:
  requires:
    - src/main.js (vehicleState shape, game loop, syncMeshesToState, terrain stub)
    - src/physics.js (stepPhysics, getDriveTorque)
    - data/ranger.js (RANGER_PARAMS.wheelbase, trackFront, maxSteerAngle, steerRate, steerDecayRate, speedSteerRef, wheelRadius, cgHeight)
    - docs/GLOSSARY.md (sign conventions, coordinate system)
  provides:
    - src/vehicle.js (updateVehicle, SPAWN_STATE)
    - src/main.js (wired game loop: updateVehicle + stepPhysics inside fixed-step, wheel spin sync, HUD speed, reset handler)
  affects:
    - src/camera.js (Plan 04 reads vehicleState updated by updateVehicle + stepPhysics)
    - src/debug.js (Plan 04 reads vehicleState for lil-gui sliders and HUD)
tech_stack:
  added: []
  patterns:
    - "Ackermann per-wheel steer angles from scalar reference angle (RESEARCH Pattern 5 — sin/cos form, avoids cotangent singularity)"
    - "Quaternion-extracted forward vector in pure-math module (no Three.js import in vehicle.js)"
    - "Speed-scaled steering limit: maxSteer / (1 + speed/speedSteerRef)"
    - "Steer accumulation with decay: rate*dt on keydown, decay toward zero on keyup"
    - "Wheel spin: rotation.x = wheelAngles[i] after geometry.rotateZ(PI/2) (RESEARCH Pitfall 5)"
    - "Front-wheel steer mesh: quaternion.premultiply(steerQ) where steerQ is setFromAxisAngle(bodyUp, steer)"
key_files:
  created:
    - src/vehicle.js
  modified:
    - src/main.js
decisions:
  - "All 4 wheels spin at same rate in Phase 1 (RESEARCH Open Questions #1 — drivetrain split is Phase 2+)"
  - "SPAWN_STATE uses plain scalars; main.js copies into THREE objects on reset (T-03-03: quatW=1 identity)"
  - "Forward vector extracted from quaternion components inline in vehicle.js (no THREE import needed)"
  - "steerQ applied via premultiply not multiply — body quaternion is left-accumulated"
  - "terrain() stub call retained in game loop (M1-13 verification)"
metrics:
  duration: "~6 minutes"
  completed: "2026-05-11"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 1
---

# Phase 01 Plan 03: Vehicle Input and Drivable Slice Summary

**One-liner:** Keyboard-to-physics pipeline wired: updateVehicle (Ackermann steer, speed-scaled limit, analog decay, wheel spin accumulation) called each fixed step before stepPhysics, with R-key reset, wheel mesh spin sync via rotation.x, front steer quaternion, and live km/h HUD.

---

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create src/vehicle.js — input state, Ackermann steer, wheel spin, reset | 8361329 | src/vehicle.js (143 lines) |
| 2 | Update src/main.js — wire updateVehicle + stepPhysics, wheel spin sync, HUD speed, reset handler | b318672 | src/main.js (+40/-6 lines) |

---

## Key Parameters Confirmed

| Parameter | Value | Source |
|-----------|-------|--------|
| Ackermann wheelbase L | 2.85 m | RANGER_PARAMS.wheelbase |
| Ackermann track T | 1.46 m | RANGER_PARAMS.trackFront |
| maxSteerAngle | 0.52 rad (~30°) | RANGER_PARAMS (no tuning — plan defaults used) |
| steerRate | 1.2 rad/s | RANGER_PARAMS (no tuning) |
| steerDecayRate | 2.0 rad/s | RANGER_PARAMS (no tuning) |
| speedSteerRef | 15 m/s (~54 km/h) | RANGER_PARAMS — max steer halved at this speed |
| wheelRadius | 0.368 m | RANGER_PARAMS — spin delta = (longSpeed / wheelRadius) * dt |
| HUD element | `#speedVal` | index.html (confirmed from Plan 01) |

No tuning was applied to steerRate, steerDecayRate, or speedSteerRef — defaults from data/ranger.js are used as-is.

---

## Loop Order Confirmation

Inside `while (accumulator >= FIXED_DT)` in `src/main.js`:

1. `terrain(vehicleState.position.x, vehicleState.position.z)` — retained for M1-13
2. `updateVehicle(vehicleState, RANGER_PARAMS, FIXED_DT)` — input, steer, wheel spin
3. Reset block (if `updateVehicle` returns true) — restores all vehicleState fields to spawn
4. `stepPhysics(vehicleState, RANGER_PARAMS, FIXED_DT)` — 6DOF integration
5. `accumulator -= FIXED_DT`

---

## Ackermann Formula

The exact sin/cos form from RESEARCH §Pattern 5 (cited: raw.org/book/kinematics/ackerman-steering/):

```
phiLeft  = atan(2L·sin(φ) / (2L·cos(φ) − T·sin(φ)))   ← inner wheel (steering left)
phiRight = atan(2L·sin(φ) / (2L·cos(φ) + T·sin(φ)))   ← outer wheel (steering left)
```

Both stored as `vehicleState.wheelSteerAngles = [phiLeft, phiRight, 0, 0]`.
Rear wheels 2 and 3 are always 0.

---

## Wheel Spin Sync

`syncMeshesToState` now includes per-wheel spin and steer for each frame:

- **All wheels:** `wheelMeshes[i].rotation.x = vehicleState.wheelAngles[i]`
  (X-axis is the rolling axis after `geometry.rotateZ(PI/2)` in Plan 01 — RESEARCH Pitfall 5)
- **Front wheels (i < 2):** steer quaternion applied:
  `wheelMeshes[i].quaternion.copy(state.quaternion).premultiply(steerQ)`
  where `steerQ = new THREE.Quaternion().setFromAxisAngle(bodyUp, steer)`
- **Rear wheels:** `wheelMeshes[i].quaternion.copy(state.quaternion)` — no steer

---

## M1-13 Terrain Call Retained

The `terrain()` stub is called inside the fixed-step loop on every physics step. The call site exists for Phase 6 to replace the function body without modifying `main.js`.

---

## Success Criteria Status

| Criterion | Status |
|-----------|--------|
| src/vehicle.js exports updateVehicle and SPAWN_STATE | PASS |
| updateVehicle returns true on R-key press, false otherwise | PASS |
| Ackermann formula: Math.atan and trackFront present | PASS |
| Speed-scaled steer limit: speedSteerRef present | PASS |
| Steer decay logic: steerDecayRate present | PASS |
| wheelSteerAngles set in updateVehicle (rear = 0) | PASS |
| wheelAngles incremented by spin delta each call | PASS |
| vehicle.js does NOT import Three.js | PASS |
| vehicle.js does NOT contain "backup1" | PASS |
| SPAWN_STATE.quatW = 1 (identity quaternion) | PASS |
| main.js imports stepPhysics from './physics.js' | PASS |
| main.js imports updateVehicle, SPAWN_STATE from './vehicle.js' | PASS |
| Game loop calls updateVehicle then stepPhysics inside accumulator | PASS |
| terrain() call retained in loop | PASS |
| Reset restores position, velocity, quaternion, angularVelocity, steerAngle, wheelAngles | PASS |
| syncMeshesToState: rotation.x = wheelAngles[i] for each wheel | PASS |
| syncMeshesToState: front wheel steer quaternion applied | PASS |
| HUD: #speedVal updated with toFixed(1) km/h each frame | PASS |
| No Euler assignment to bodyMesh | PASS |
| main.js does NOT contain "backup1" | PASS |

---

## Deviations from Plan

None — plan executed exactly as written.

The one minor implementation detail: the plan's `syncMeshesToState` snippet showed:
```
wheelMeshes[i].quaternion.copy(vehicleState.quaternion).premultiply(steerQ)
```
with `steerQ` built using `new THREE.Vector3(0,1,0).applyQuaternion(vehicleState.quaternion)` for the axis. This was implemented exactly as written — body-space up vector rotated into world space as the steer axis. This ensures front wheel steer rotation is always around the body-up axis (correct when car is level; adequate for Phase 1 flat-ground scope).

---

## Known Stubs

| Stub | File | Line | Reason |
|------|------|------|--------|
| All 4 wheels spin at same rate | src/vehicle.js | ~112 | Phase 2+ drivetrain differentiates per-wheel omega |
| Static camera (position 0,4,10) | src/main.js | ~57 | Plan 04 adds spring-follow chase camera and cockpit toggle |
| Debug menu (lil-gui sliders) absent | — | — | Plan 04 creates src/debug.js with lil-gui sliders |

---

## Threat Flags

No new security surface introduced beyond the plan's threat model (T-03-01 through T-03-04). T-03-01 (steerAngle unbounded growth) is mitigated by the `Math.max/Math.min` clamp applied every step in `updateVehicle`. T-03-03 (NaN on reset) is mitigated by `SPAWN_STATE.quatW = 1`.

---

## Self-Check: PASSED

Files verified to exist:
- `src/vehicle.js` — FOUND
- `src/main.js` — FOUND (modified)

Commits verified:
- `8361329` — FOUND (vehicle.js)
- `b318672` — FOUND (main.js updates)
