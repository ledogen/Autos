---
phase: 03-tire-model
reviewed: 2026-05-30T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - data/ranger.js
  - docs/GLOSSARY.md
  - index.html
  - src/camera.js
  - src/debug.js
  - src/logger.js
  - src/main.js
  - src/physics.js
  - src/suspension.js
  - src/tire.js
  - src/vehicle.js
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-05-30
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Phase 3 delivers Pacejka lateral and longitudinal tire forces, a wheel omega integrator, friction circle coupling, Ackermann per-wheel steer angles, a Pacejka curve canvas overlay, and extended frame logger fields. The tire math in `src/tire.js` is correct — Magic Formula implementation is faithful to the reference, the C-coefficient hard clamp is consistently applied in both `tire.js` and `debug.js`, and the friction circle in `physics.js` correctly scales both Flat and Flong before the omega integrator reads the road reaction.

Two blockers were identified in `src/physics.js`: brake torque is double-applied to the omega integrator because `getDriveTorque` returns a negative brake torque on line 47 while `getBrakeTorque` independently returns the same positive brake torque on line 67 — both subtracted from omega every braking step. The second blocker is in `src/main.js` where a degenerate zero-length normal vector is accepted into the contact list during ramp-edge contact, silently zeroing push-out force while Fn is still computed and used as the friction budget basis.

Four warnings cover a wrong torque constant in the throttle-while-reversing branch, dead code from an unconsumed `getDriveTorque` call, a missing quaternion normalize after loading an initial condition file, and a slip-angle sign convention inversion vs. the GLOSSARY that corrupts the logged `sa` field.

---

## Critical Issues

### CR-01: Brake torque double-applied in omega integrator — `getDriveTorque` and `getBrakeTorque` both handle the forward-braking case

**File:** `src/physics.js:43-48, 64-68, 217-227`

**Issue:** When `vehicleState.brake > 0` and `longVel > DRIVE_DEAD_ZONE` (car moving forward), `getDriveTorque` returns `-brake * maxBrakeTorque` (line 47). The omega integrator then calls both `getDriveTorque` and `getBrakeTorque` independently (lines 217–218) and computes:

```
omega += (driveTorque - roadReaction - brakeTorque) / wheelInertia * dt
       = (-maxBrakeTorque) - road - (+maxBrakeTorque)
       = -2 * maxBrakeTorque - road
```

`maxBrakeTorque` is 3000 N·m. The effective deceleration applied to wheel omega is 6000 N·m (minus road reaction) instead of 3000 N·m. This causes instantaneous wheel lock on every S-key press and over-saturates the friction circle every braking step, corrupting both longitudinal and lateral force calculations.

The root cause: `getDriveTorque` was the sole torque source before `getBrakeTorque` was added. The brake path in `getDriveTorque` was never removed. Both paths now apply to the same physics quantity.

**Fix:** Remove the brake path from `getDriveTorque`. It should return only drive torque (positive or zero):

```javascript
// src/physics.js — getDriveTorque: handle drive only
export function getDriveTorque (wheelIndex, vehicleState, params) {
  const isRear = wheelIndex === 2 || wheelIndex === 3
  if (vehicleState.throttle > 0) {
    return isRear ? vehicleState.throttle * params.maxDriveTorque : 0
  }
  return 0
}
```

All braking — including counter-torque when throttling while reversing — should be moved to `getBrakeTorque` as the single authoritative source.

---

### CR-02: Zero-length normal vector accepted into contact list — push-out force silently zeroed for sphere-center-on-triangle contact

**File:** `src/main.js:319-328`

**Issue:** In `queryContacts`, when the sphere center is exactly on the closest point of a triangle (`dist < 1e-8`), `inv` is set to `0` and the emitted normal is `(0, 0, 0)`:

```javascript
const inv = dist < 1e-8 ? 0 : 1 / dist
hits.push({
  normal: new THREE.Vector3(dx * inv, dy * inv, dz * inv),  // zero vector when dist=0
  depth,
  contactPoint: cp
})
```

This contact enters the hits array with `depth = r` (full wheel radius) and a zero-length normal. In `physics.js`, `computeNormalForce` computes `Fn = tireStiffness * r = 36,800 N`, but `totalForce.addScaledVector(zero_normal, Fn)` contributes zero force. The wheel is not pushed clear of the surface despite a large computed Fn. Meanwhile, `lastScaledFlong` is still updated (wheel considered grounded) and the friction circle budget is based on a Fn value that produced no actual contact force. This can trigger when a wheel sphere center transits a ramp edge (e.g., the `RAMP_START_Z` boundary) during normal driving.

**Fix:** Skip degenerate zero-distance contacts instead of emitting a zero-normal entry:

```javascript
// src/main.js — queryContacts triangle loop
const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
const depth = r - dist
if (depth <= 0) continue
if (dist < 1e-8) continue  // degenerate contact — no valid push direction; skip
hits.push({
  normal: new THREE.Vector3(dx / dist, dy / dist, dz / dist),
  depth,
  contactPoint: cp
})
```

---

## Warnings

### WR-01: `getDriveTorque` uses `maxBrakeTorque` (3000 N·m) instead of `maxDriveTorque` (800 N·m) when throttle held while reversing — 3.75x torque discontinuity at -0.5 m/s threshold

**File:** `src/physics.js:43`

**Issue:** Line 43:
```javascript
if (longVel < -DRIVE_DEAD_ZONE) return isRear ? vehicleState.throttle * params.maxBrakeTorque : 0
```
When the car rolls backward past `-DRIVE_DEAD_ZONE` (-0.5 m/s) and the driver presses W, rear wheels receive `maxBrakeTorque` (3000 N·m) instead of `maxDriveTorque` (800 N·m). This is a 3.75x torque jump at the dead zone threshold. The intent is "throttle-forward while rolling backward = counter-torque to stop the reverse motion." The counter-torque magnitude should be `maxDriveTorque` (same as forward drive), not `maxBrakeTorque`. The bug comment in `data/ranger.js` line 37 describes the fix for the `brake` path (line 48); the `throttle` path was never corrected. This is distinct from CR-01 (wrong constant, not double counting).

**Fix:**
```javascript
// line 43 — use maxDriveTorque, not maxBrakeTorque
if (longVel < -DRIVE_DEAD_ZONE) return isRear ? vehicleState.throttle * params.maxDriveTorque : 0
```

---

### WR-02: Dead code — `driveForce` computed and `params._driveForce` set but never read anywhere

**File:** `src/physics.js:146-147`

**Issue:**
```javascript
const driveForce = getDriveTorque(i, vehicleState, params) / params.wheelRadius
params._driveForce = driveForce
```

`driveForce` is never referenced after line 147. `params._driveForce` is never read by any module. `getDriveTorque` is already called a second time at line 217 (inside the omega integrator) where its return value is actually used. This means `getDriveTorque` runs twice per wheel per step — the first call at line 146 and its result are entirely wasted.

**Fix:** Delete lines 146–147.

---

### WR-03: `openInitialCondition` applies quaternion without normalizing — a non-unit quaternion from an external file corrupts all body-axis derivations

**File:** `src/logger.js:141-143`

**Issue:**
```javascript
if (ic.quaternion) {
  vehicleState.quaternion.set(ic.quaternion.x, ic.quaternion.y, ic.quaternion.z, ic.quaternion.w)
}
```
`THREE.Quaternion.set()` does not normalize. A manually edited IC file — or one produced by any tool other than this sim — may contain a non-unit quaternion. If loaded, every `applyQuaternion` call that derives `forward`, `right`, and `up` body-space axes will produce scaled (non-unit) vectors. All tire forces, torque moment arms, and suspension offsets become proportionally wrong for the lifetime of the session until the car is reset.

**Fix:**
```javascript
if (ic.quaternion) {
  vehicleState.quaternion.set(ic.quaternion.x, ic.quaternion.y, ic.quaternion.z, ic.quaternion.w)
  vehicleState.quaternion.normalize()
}
```

---

### WR-04: `slipAngle` sign is inverted relative to GLOSSARY.md §Slip Angle — logged `sa` field has the wrong sign; force chain only works by double-negation

**File:** `src/physics.js:176-178, 205`

**Issue:** GLOSSARY.md §Slip Angle defines positive slip angle as "contact patch velocity pointing to the wheel's **left**." `latVel` is computed as `hubVel.dot(wheelRight)` — positive when the contact patch slides **right**. Therefore `slipAngle = atan2(latVel, longVelAbs + 0.01)` is positive when sliding right, opposite the GLOSSARY convention.

The physics outcome is accidentally correct because the force is applied as `addScaledVector(wheelRight, -Flat)` (line 197), so the double negation (inverted sign in → inverted force sign → negated at application) yields the correct restoring direction.

However, `vehicleState.wheelDebug[i].sa` (line 205) and the logged `{fl/fr/rl/rr}_sa` fields carry this inverted sign. Anyone using the log data to diagnose handling sees the wrong sign: positive `sa` in the log means "sliding right" not "sliding left" as documented.

**Fix:** Either flip `latVel` sign at the slip-angle computation to match GLOSSARY:
```javascript
// line 178 — negate to match GLOSSARY convention (positive = sliding left)
const slipAngle = Math.atan2(-latVel, longVelAbs + 0.01)
```
and remove the negation on line 197 (change to `addScaledVector(wheelRight, Flat)`), OR add a prominent comment on line 178 noting the intentional sign inversion and update GLOSSARY.md to document the code's actual convention.

---

## Info

### IN-01: `console.log` left in production entry point

**File:** `src/main.js:28`

**Issue:** `console.log('THREE.REVISION', THREE.REVISION)` fires on every page load. The comment describes it as a "manual verification hook" — once confirmed, it should be removed.

**Fix:** Delete line 28.

---

### IN-02: `pacejkaE` and `pacejkaEx` default values (0.97) are unreachable from the debug slider grid (step 0.05 from -1.0)

**File:** `src/debug.js:59, 66` / `data/ranger.js:68, 74`

**Issue:** The E sliders use `step = 0.05` from `min = -1.0`. Grid values are `-1.00, -0.95, …, 0.95, 1.00`. The RANGER_PARAMS default of `0.97` falls between `0.95` and `1.00` and cannot be restored via the slider after any adjustment. The closest reachable values are `0.95` and `1.00`.

**Fix:** Use `step = 0.01` to match the C-coefficient slider resolution:
```javascript
lateralFolder.add(params, 'pacejkaE', -1.0, 1.0, 0.01).name('E - Curvature')
longitudinalFolder.add(params, 'pacejkaEx', -1.0, 1.0, 0.01).name('Ex - Curvature')
```

---

### IN-03: `wheelAngles` visual spin in `vehicle.js` is driven from body velocity, not `wheelOmega` — wheels never visually spin up or lock

**File:** `src/vehicle.js:127-136`

**Issue:** `spinDelta` at line 133 is computed from the body's longitudinal velocity (`longSpeed / wheelRadius`). This is the free-rolling rate with zero slip. `wheelOmega[i]` — which Phase 3 now correctly integrates with drive torque, brake torque, and road reaction — is never used to drive the visual mesh. During wheelspin the mesh rolls at road speed instead of faster; during ABS-style lockup the mesh keeps spinning. The visual is divorced from the physics.

**Fix:** In the fixed-timestep loop in `main.js`, accumulate `wheelAngles[i]` from `wheelOmega[i]` after each `stepPhysics` call:
```javascript
for (let i = 0; i < 4; i++) {
  vehicleState.wheelAngles[i] += vehicleState.wheelOmega[i] * FIXED_DT
}
```
Remove the `spinDelta` accumulation in `vehicle.js` lines 127–137.

---

_Reviewed: 2026-05-30_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
