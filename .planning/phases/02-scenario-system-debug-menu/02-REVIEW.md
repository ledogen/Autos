---
phase: 02-scenario-system-debug-menu
reviewed: 2026-05-28T00:00:00Z
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
  critical: 4
  warning: 7
  info: 4
  total: 15
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-05-28
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Reviewed the full physics simulation stack including the tire, suspension, physics integrator, vehicle control, camera, logger, and debug panel modules. The code is generally well-structured with clear conventions followed from GLOSSARY.md. However, four critical bugs were found that cause incorrect simulation behavior: a wrong inertia axis assignment in the angular velocity integrator, a sign error in the lateral force application that turns the tire model inside-out, a braking-while-reversing logic bug in `getDriveTorque` that applies brake torque to front wheels when moving backward, and a missing URL revocation guard in the logger download path. Seven warnings cover edge cases, numerical stability issues, and event listener accumulation that degrade robustness.

---

## Critical Issues

### CR-01: Inertia axes swapped in angular velocity integration

**File:** `src/physics.js:193-195`

**Issue:** The angular velocity integrator applies torque components to the wrong inertia scalars. The code reads:

```javascript
vehicleState.angularVelocity.x += totalTorque.x / params.inertiaPitch * dt
vehicleState.angularVelocity.y += totalTorque.y / params.inertiaYaw   * dt
vehicleState.angularVelocity.z += totalTorque.z / params.inertiaRoll  * dt
```

In the Three.js Y-up right-hand coordinate system used by this project:
- `angularVelocity.x` is rotation about the X axis → **roll** → should use `inertiaRoll` (Ixx)
- `angularVelocity.y` is rotation about the Y axis → **yaw** → should use `inertiaYaw` (Izz)
- `angularVelocity.z` is rotation about the Z axis → **pitch** → should use `inertiaPitch` (Iyy)

The current code maps X→inertiaPitch (≈3300 kg·m²) and Z→inertiaRoll (≈800 kg·m²), swapping roll and pitch inertia. Because `inertiaRoll` (≈800) is ~4× smaller than `inertiaPitch` (≈3300), the car pitches under braking/acceleration using the light roll inertia, making pitch response absurdly fast and roll response absurdly slow. This is a physically incorrect simulation.

**Fix:**
```javascript
vehicleState.angularVelocity.x += totalTorque.x / params.inertiaRoll  * dt  // X = roll axis → Ixx
vehicleState.angularVelocity.y += totalTorque.y / params.inertiaYaw   * dt  // Y = yaw  axis → Izz
vehicleState.angularVelocity.z += totalTorque.z / params.inertiaPitch * dt  // Z = pitch axis → Iyy
```

---

### CR-02: Lateral force applied in the wrong direction (sign-inverted)

**File:** `src/tire.js:44-49` and `src/physics.js:148-153`

**Issue:** `computeLateralForce` returns a negative force when the contact patch drifts right (positive `_lateralVelocity`):

```javascript
// tire.js:44-45
const slipAngleCalc = Math.atan2(latVel, Math.abs(longVel) + 0.01)
const raw = -params.corneringStiffness * slipAngleCalc
```

`atan2(latVel, ...)` is positive when `latVel > 0` (patch moving right). Multiplying by `-corneringStiffness` gives a negative raw force. A negative `Flat` is then applied as:

```javascript
// physics.js:151
wheelForce.addScaledVector(wheelRight, Flat)
```

So a negative `Flat` pushes left when the patch moves right. This **is** the restoring direction — however, the GLOSSARY §Slip Angle says "Positive slip angle = contact patch velocity pointing to the wheel's left." `atan2(latVel, |longVel|)` is positive for rightward velocity, but the GLOSSARY defines positive slip angle for **leftward** lateral velocity. The sign convention in `computeLateralForce` inverts the GLOSSARY slip angle convention: the computed `slipAngleCalc` has the opposite sign to what the function parameter `slipAngle` is documented to expect. When Phase 3 passes a pre-computed slip angle (following the GLOSSARY sign) directly to this function, the `-corneringStiffness` multiplier will produce a force in the wrong direction.

Additionally, the `slipAngle` parameter passed by the caller at `physics.js:148` is `0` (a hardcoded zero), which means the parameter is completely ignored — only `params._lateralVelocity` matters. This makes the public API misleading and will cause a subtle regression when Phase 3 starts passing a real slip angle.

**Fix:**
1. Correct the slip angle sign to match GLOSSARY convention: `atan2(-latVel, ...)` so positive latVel → negative slip angle (patch moving right = leftward slip in wheel frame is negative).
2. Use a positive cornering stiffness multiplier: `raw = params.corneringStiffness * slipAngleCalc` so positive slip angle → positive (rightward) restoring force.
3. Or, document that the internal sign convention differs from GLOSSARY and rename the local variable to avoid confusion with the `slipAngle` parameter.

For Phase 3 compatibility, the cleanest fix is:
```javascript
// tire.js — Phase 1 implementation matches GLOSSARY sign convention
const slipAngleCalc = Math.atan2(-latVel, Math.abs(longVel) + 0.01)  // negative: right-drift = negative SA per GLOSSARY
const raw = params.corneringStiffness * slipAngleCalc                  // positive CS, positive SA → positive (right) force
```

---

### CR-03: `getDriveTorque` applies brake torque to front wheels when moving backward

**File:** `src/physics.js:38-51`

**Issue:** The function has this logic for the brake case:

```javascript
if (vehicleState.brake > 0) {
  if (longVel > DRIVE_DEAD_ZONE) return -vehicleState.brake * params.maxBrakeTorque
  return isRear ? -vehicleState.brake * params.maxReverseTorque : 0
}
```

When `longVel ≤ DRIVE_DEAD_ZONE` (i.e., the car is reversing or nearly stopped) and brake is pressed, rear wheels receive `-maxReverseTorque`. This is labeled as a "reverse" torque, but S-key while moving backward should act as **a brake/deceleration** (stopping reverse motion), not as additional reverse acceleration. The current code causes the S key to accelerate the car backward when already moving in reverse (`longVel < -DRIVE_DEAD_ZONE`).

Similarly, in the throttle branch:

```javascript
if (vehicleState.throttle > 0) {
  if (longVel < -DRIVE_DEAD_ZONE) return vehicleState.throttle * params.maxBrakeTorque
  return isRear ? vehicleState.throttle * params.maxDriveTorque : 0
}
```

When moving backward (negative `longVel`) with throttle pressed, the car applies `maxBrakeTorque` (3000 N·m) instead of `maxDriveTorque` (800 N·m) to **all four wheels** (the `isRear` check is bypassed). This applies a very large forward braking force from all four wheels, including the front wheels which are not drive wheels. For a RWD vehicle, front wheels should never receive drive torque in any direction.

**Fix:**
```javascript
export function getDriveTorque (wheelIndex, vehicleState, params) {
  const isRear  = wheelIndex === 2 || wheelIndex === 3
  if (!isRear) return 0  // front wheels never generate drive/brake torque in RWD

  const longVel = params._longitudinalVelocity || 0

  if (vehicleState.throttle > 0) {
    // W key always drives forward regardless of current velocity
    return vehicleState.throttle * params.maxDriveTorque
  }
  if (vehicleState.brake > 0) {
    // S key: brake forward motion or reverse
    if (longVel > DRIVE_DEAD_ZONE) return -vehicleState.brake * params.maxBrakeTorque
    return -vehicleState.brake * params.maxReverseTorque  // reverse (backward motion)
  }
  return 0
}
```

---

### CR-04: `_downloadLog` does not revoke the object URL on download failure

**File:** `src/logger.js:42-53`

**Issue:** `URL.createObjectURL(blob)` allocates a memory-pinned blob URL. The code appends an anchor, clicks it, removes the anchor, then calls `URL.revokeObjectURL(url)`. However, if `a.click()` throws (e.g., the browser blocks a programmatic download in certain security contexts or the DOM is in an unexpected state), `URL.revokeObjectURL(url)` is never called, leaking the blob URL for the lifetime of the document. In a long recording session the blob can be megabytes; if the user triggers download failures repeatedly (e.g., Firefox with a download permission prompt that is cancelled) the leaks accumulate.

Additionally, `document.body` could theoretically be null when this runs (though extremely unlikely in normal use), making `document.body.appendChild(a)` throw before cleanup.

**Fix:**
```javascript
function _downloadLog () {
  const log = JSON.stringify({ fields: FIELDS, frames: _frames })
  const blob = new Blob([log], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = 'rangersim-log-' + Date.now() + '.json'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } finally {
    URL.revokeObjectURL(url)
  }
}
```

---

## Warnings

### WR-01: Angular velocity has no damping — simulation will accumulate indefinite spin

**File:** `src/physics.js:192-203`

**Issue:** There is no angular damping term anywhere in the physics integrator. The only forces that reduce angular velocity are tire lateral forces and rolling resistance from the tire model. When a wheel is airborne or at very low speed (below the 0.2 m/s dead zone in `computeLateralForce`), no restoring force is generated. A car that rolls over and becomes airborne will spin indefinitely. Similarly, yaw at very low speeds will not damp to zero. This is physically unrealistic and will make the vehicle feel "floaty" in the air.

**Fix:** Add a small linear angular damping term to bleed excess angular velocity each step:
```javascript
// After angular velocity integration in Step 5:
const ANGULAR_DAMPING = 0.98  // tune; 0.98 = 2% decay per step
vehicleState.angularVelocity.multiplyScalar(ANGULAR_DAMPING)
```

---

### WR-02: `queryContacts` uses `_flatNormal.clone()` but ramp normals are not cloned

**File:** `src/main.js:308-310`

**Issue:** For the ground half-space contact, the code correctly clones the flat normal:
```javascript
hits.push({ normal: _flatNormal.clone(), ... })
```

But for ramp triangle contacts, the normal is built freshly from `dx*inv, dy*inv, dz*inv` — that is correct. However, the ramp normal `_rampNormal` is defined as a module-level constant and is never mutated, so the clone is fine. The real issue is that when `dist < 1e-8` (sphere center exactly on the triangle surface), the code sets `inv = 0` and pushes a zero-length normal `(0, 0, 0)`. A zero normal will cause `addScaledVector(normal, Fn)` to apply zero force and `crossVectors(rContact, zeroNormal)` to produce zero torque, silently losing the contact response. This happens whenever the sphere center is exactly on the triangle.

**Fix:**
```javascript
// In queryContacts, ramp triangle loop:
if (dist < 1e-8) {
  // Use ramp face normal instead of degenerate sphere-to-surface direction
  // For Phase 1 ramp, use _rampNormal; Phase 6 should pass triangle normals explicitly.
  hits.push({ normal: _rampNormal.clone(), depth, contactPoint: cp })
  continue
}
```

---

### WR-03: `orbitPhi` clamping in camera drag uses incorrect radius for `asin` inversion

**File:** `src/camera.js:97`

**Issue:** When syncing orbit angles from the follow camera position, the code clamps the `asin` argument:
```javascript
orbitPhi = Math.asin(Math.max(-1, Math.min(1, delta.y / ORBIT_RADIUS)))
```

`ORBIT_RADIUS` is computed as `Math.hypot(0, 2.5, 6.0) ≈ 6.5`. But `delta` is `camera.position - vehicleState.position`, and after LERP, the camera is not exactly at `ORBIT_RADIUS` distance from the car. If the camera is close during the early lerp frames (lag during acceleration), `delta.y / ORBIT_RADIUS` is < 1 and `asin` works. But `delta.length()` may not equal `ORBIT_RADIUS` — the ratio could slightly exceed 1.0 in edge cases if the LERP overshoots, causing `asin(NaN)` and setting `orbitPhi = NaN`. The `Math.max(-1, Math.min(1, ...))` clamp prevents the NaN only if the ratio is computed from the correct denominator `delta.length()`.

**Fix:**
```javascript
const actualDist = Math.max(delta.length(), 1e-4)
orbitPhi = Math.asin(Math.max(-1, Math.min(1, delta.y / actualDist)))
```

---

### WR-04: Event listeners registered at module load are never removed

**File:** `src/camera.js:31-57`, `src/debug.js:50-54`, `src/vehicle.js:15-16`, `src/main.js:354-357`

**Issue:** Multiple modules attach `document.addEventListener(...)` at module load time (or within exported functions like `initDebug`). None of these are ever removed. In a single-page game context with no page navigation this is technically harmless. However:
1. The `initDebug` function in `debug.js` registers a backtick listener every time it is called. If `initDebug` were ever called more than once (e.g., during a reset or re-init flow), duplicate listeners would accumulate — each one toggling the panel, causing it to toggle and immediately re-toggle on a single keypress.
2. `camera.js` registers four listeners at module import time. If the module is imported multiple times (not possible with ES module caching, but the pattern is fragile).

**Fix:** For `initDebug`, guard against double registration or return a cleanup function:
```javascript
// debug.js — only register once
let _backtickBound = false
export function initDebug (params) {
  // ...
  if (!_backtickBound) {
    document.addEventListener('keydown', e => { /* backtick handler */ })
    _backtickBound = true
  }
  return gui
}
```

---

### WR-05: Wheel spin angle accumulates without bound — floating-point precision loss over time

**File:** `src/vehicle.js:134`

**Issue:**
```javascript
vehicleState.wheelAngles[i] += spinDelta
```

`wheelAngles[i]` is accumulated continuously and never wrapped. Three.js `rotation.x` accepts any angle (it calls `Math.sin`/`Math.cos` internally), but after a long drive the accumulated value becomes very large (e.g., at 60 km/h for 10 minutes: ~100 m/s / 0.368 m * 600 s ≈ 163,000 rad). Floating-point addition of small `spinDelta` values to a very large accumulator loses precision — eventually the wheel spin animation will stutter or freeze because `bigNumber + smallDelta === bigNumber` in floating point.

**Fix:** Wrap the angle modulo 2π each step to keep it bounded:
```javascript
vehicleState.wheelAngles[i] = (vehicleState.wheelAngles[i] + spinDelta) % (2 * Math.PI)
```

---

### WR-06: `computeNormalForce` uses `|| 0` fallback that masks `NaN` propagation

**File:** `src/suspension.js:46-48`

**Issue:**
```javascript
const compression    = params._compression          || 0
const compressionVel = params._compressionVelocity  || 0
```

The `|| 0` idiom treats both `undefined/null` (missing field) and `0` (legitimately zero) the same way — which is correct here. But it also masks `NaN`: if `params._compression` is `NaN` (e.g., if `queryContacts` returns `NaN` for depth due to a degenerate triangle), `NaN || 0` evaluates to `0`, silently hiding the NaN and returning a zero normal force instead of surfacing the bug. The NaN comes from the triangle distance calculation in `queryContacts` when `Math.sqrt` receives a negative number (impossible with sum-of-squares, but worth noting the chain).

More concretely: `params._compressionVelocity = -contactVel.dot(normal)` (physics.js:139). If `normal` is the zero vector from the `dist < 1e-8` degenerate case (WR-02), `dot` returns 0 and `compressionVelocity = 0`, so this degrades gracefully — but only by coincidence of the zero-normal bug.

**Fix:** Use nullish coalescing for clarity and to catch NaN at the boundary:
```javascript
const compression    = params._compression          ?? 0
const compressionVel = params._compressionVelocity  ?? 0
// Optionally: add a NaN guard
if (!isFinite(compression) || !isFinite(compressionVel)) return 0
```

---

### WR-07: `terrain()` ramp check does not guard against off-ramp X values in the height calculation

**File:** `src/main.js:230-237`

**Issue:** The `terrain()` function checks `Math.abs(x) > RAMP_WIDTH / 2` and returns flat if outside the ramp laterally. However the ramp height calculation inside the guard:
```javascript
const distIntoRamp = RAMP_START_Z - z
if (distIntoRamp > 0 && distIntoRamp <= RAMP_LENGTH) {
  return { height: distIntoRamp * Math.tan(RAMP_ANGLE), normal: _rampNormal }
}
```
...returns `_rampNormal` (not cloned). Since `_rampNormal` is a `THREE.Vector3` constant used as the terrain normal, any downstream code that mutates the returned normal will corrupt future terrain queries. The ground contact in `queryContacts` does `_flatNormal.clone()` but the ramp branch of `terrain()` does not clone `_rampNormal`. Note: `terrain()` itself is currently only called to read the surface (not used for force calculations in the new contact system), but it is exported via `window.terrain` and could be consumed externally.

**Fix:**
```javascript
return { height: distIntoRamp * Math.tan(RAMP_ANGLE), normal: _rampNormal.clone() }
```

---

## Info

### IN-01: `console.log` left in production entry point

**File:** `src/main.js:28`

**Issue:**
```javascript
console.log('THREE.REVISION', THREE.REVISION)
```
This is a debug/verification artifact. Acceptable during development but should be removed before a production release.

**Fix:** Remove or guard with a `DEBUG` flag.

---

### IN-02: `getDriveTorque` uses `params._longitudinalVelocity` but the comment says it was removed (Phase 2 D-09)

**File:** `src/physics.js:40`

**Issue:** The JSDoc comment for `getDriveTorque` says `params` is "augmented with `params._longitudinalVelocity`" — this private field is set in `stepPhysics` at line 120 for the current wheel. But `getDriveTorque` is called at line 122 (just after `_longitudinalVelocity` is set) which makes this work correctly. However, if `getDriveTorque` is ever called outside of `stepPhysics` (e.g., in tests), `_longitudinalVelocity` will be undefined and the `|| 0` fallback will silently give wrong behavior. The function API is unclear about this pre-condition.

**Fix:** Pass `longVel` as an explicit parameter rather than reading it from `params`:
```javascript
export function getDriveTorque (wheelIndex, vehicleState, params, longVel = 0) { ... }
```

---

### IN-03: Magic number `0.2` dead zone in `computeLateralForce` not documented or extracted

**File:** `src/tire.js:43`

**Issue:**
```javascript
if (Math.sqrt(latVel * latVel + longVel * longVel) < 0.2) return 0
```

The 0.2 m/s dead zone threshold is undocumented and not exposed as a named constant or tunable parameter. It interacts with `DRIVE_DEAD_ZONE = 0.5` in physics.js in a non-obvious way (tire forces cut out at 0.2 m/s but drive torque cuts in only above 0.5 m/s). The gap between 0.2 and 0.5 m/s means there is a velocity range where drive force pushes the car but the tire dead zone suppresses lateral correction — potentially producing a narrow range of instability near rest.

**Fix:** Extract to a named constant and expose it in `ranger.js` or at least document the interaction:
```javascript
const TIRE_VELOCITY_DEAD_ZONE = 0.2  // m/s — below this, slip angle is meaningless (numerical noise)
```

---

### IN-04: `openInitialCondition` does not validate quaternion normalization after loading

**File:** `src/logger.js:132-134`

**Issue:** When loading an initial condition JSON file, the quaternion is copied verbatim:
```javascript
vehicleState.quaternion.set(ic.quaternion.x, ic.quaternion.y, ic.quaternion.z, ic.quaternion.w)
```

If the loaded JSON contains a non-unit quaternion (e.g., from a corrupted log or manually edited file), the physics integrator will use it directly. `vehicleState.quaternion.premultiply(dq).normalize()` in physics.js only normalizes after integration — the first frame runs with the un-normalized quaternion, which can produce incorrect force directions.

**Fix:** Normalize after setting:
```javascript
vehicleState.quaternion.set(ic.quaternion.x, ic.quaternion.y, ic.quaternion.z, ic.quaternion.w)
vehicleState.quaternion.normalize()
```

---

_Reviewed: 2026-05-28_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
