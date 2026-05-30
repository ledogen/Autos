---
phase: 03-tire-model
reviewed: 2026-05-30T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - data/ranger.js
  - src/tire.js
  - src/vehicle.js
  - src/physics.js
  - src/main.js
  - src/debug.js
  - src/logger.js
  - docs/GLOSSARY.md
  - index.html
findings:
  critical: 3
  warning: 5
  info: 3
  total: 11
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-05-30
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Phase 3 adds Pacejka Magic Formula tire forces (lateral and longitudinal), a slip ratio omega integrator, handbrake, friction circle coupling, and debug UI (live curve plot, HUD indicators, logger omega fields). The Pacejka formula itself and the friction circle scaling are mathematically correct. The module structure, import wiring, and logger field contract are sound.

Three blockers were found: a closure bug that makes `updatePacejkaCurve` crash when the debug panel is hidden at startup; a logic inversion in `getDriveTorque` that applies `maxBrakeTorque` (3000 N·m) instead of `maxReverseTorque` (800 N·m) when the player presses throttle while moving backward; and an omega integrator that only ticks when the wheel is in contact, leaving `wheelOmega` stale when airborne, causing incorrect slip ratio on the first re-contact frame. Five warnings cover less severe correctness hazards including broken front-wheel visual spin, slip-angle sign mismatch, and zero-normal-force ramp edge contacts. Three info items cover a debug console.log, redundant dead-code in getDriveTorque, and a magic number.

---

## Critical Issues

### CR-01: `updatePacejkaCurve` closes over `plotCanvas`/`plotCtx` that are local to `initDebug` — crashes if `initDebug` was never called

**File:** `src/debug.js:107`

**Issue:** `plotCanvas` and `plotCtx` are declared with `const` inside `initDebug()` (lines 69–74). `updatePacejkaCurve` is a separate exported function at module scope (line 105) that references those identifiers. In JavaScript, `const` bindings inside a function body are not visible outside that function — they are not module-level variables. `updatePacejkaCurve` therefore captures `undefined` for both names at parse time. The call `if (plotCanvas.style.display === 'none')` on line 107 will throw `ReferenceError: plotCanvas is not defined` at runtime whenever `updatePacejkaCurve` is called.

The current code appears to work only if the JavaScript engine being tested happens to keep `plotCanvas` alive through a closure — but `updatePacejkaCurve` is defined at module scope, not inside `initDebug`, so there is no enclosing closure. The reference is actually a free variable that is never assigned at module scope, making it `undefined` or throwing `ReferenceError` depending on strict mode.

**Fix:** Promote `plotCanvas` and `plotCtx` to module-level `let` variables, assigned inside `initDebug`:

```js
// module-level — visible to updatePacejkaCurve
let plotCanvas = null
let plotCtx    = null

export function initDebug (params) {
  // ...
  plotCanvas = document.createElement('canvas')
  plotCanvas.width = 300
  plotCanvas.height = 200
  plotCanvas.style.cssText = 'position:fixed;top:20px;right:320px;background:#111;border:1px solid #444;display:none'
  document.body.appendChild(plotCanvas)
  plotCtx = plotCanvas.getContext('2d')
  // ...
}

export function updatePacejkaCurve (vehicleState, params) {
  if (!plotCanvas || plotCanvas.style.display === 'none') return
  // ...
}
```

---

### CR-02: `getDriveTorque` applies `maxBrakeTorque` (3000 N·m) instead of `maxReverseTorque` (800 N·m) when throttle is held while moving backward

**File:** `src/physics.js:43`

**Issue:** Line 43 reads:
```js
if (longVel < -DRIVE_DEAD_ZONE) return isRear ? vehicleState.throttle * params.maxBrakeTorque : 0
```
The intent (per the comment in `ranger.js` line 37: "Bug 4 fix: reverse uses maxReverseTorque") is that pressing throttle while rolling backward should produce reverse braking at `maxReverseTorque` (800 N·m). Instead the code returns `maxBrakeTorque` (3000 N·m) — 3.75× the intended value. This causes an extremely violent deceleration jerk when switching from backward roll to throttle. The fix comment at `ranger.js:37` explicitly says the wrong torque should not be used here, and `maxReverseTorque` is defined precisely for this purpose.

**Fix:**
```js
// line 43 — use maxReverseTorque, not maxBrakeTorque
if (longVel < -DRIVE_DEAD_ZONE) return isRear ? vehicleState.throttle * params.maxReverseTorque : 0
```

---

### CR-03: Omega integrator only runs inside the contact loop — `wheelOmega` is never updated while a wheel is airborne; stale omega causes wrong slip ratio on first re-contact frame

**File:** `src/physics.js:188-202`

**Issue:** The entire omega integration block (lines 188–216) is nested inside `for (const { normal, depth, contactPoint } of contacts)`. When a wheel is airborne, `contacts` is empty so the loop body never executes, meaning `wheelOmega[i]` retains its last grounded value indefinitely. When the wheel lands again, `slipRatio` on line 144 is computed using the stale `wheelOmega[i]` from before the wheel went airborne. If the car was braking before a jump, `wheelOmega` could be near zero; at landing, `slipRatio` will briefly report a large negative value (locked-braking slip) producing an incorrect spike of longitudinal force on the very first contact frame.

Additionally, when airborne the drivetrain is still mechanically engaged: rear wheels on a real RWD car spin up under throttle even with no road contact. Without in-air omega integration rear wheels accumulate no spin during airborne throttle application, so there is no wheelspin on landing.

**Fix:** Move the omega integration out of the contacts loop so it runs for every wheel every step, regardless of contact:

```js
// After the contacts loop for wheel i, outside the contacts for-of:
const driveTorque = getDriveTorque(i, vehicleState, params)
const brakeTorque = getBrakeTorque(i, vehicleState, params)
const Flong_for_omega = (contacts.length > 0) ? lastContactFlong : 0  // 0 when airborne
const roadReactionTorque = Flong_for_omega * params.wheelRadius
if (vehicleSpd + wheelSurfaceSpd < OMEGA_EPSILON) {
  vehicleState.wheelOmega[i] = params._longitudinalVelocity / params.wheelRadius
} else {
  vehicleState.wheelOmega[i] += (driveTorque - roadReactionTorque - brakeTorque) / wheelInertia * dt
}
```
(Where `lastContactFlong` is saved from the last contact iteration, or zero if no contact occurred this step.)

---

## Warnings

### WR-01: Front wheel `wheelAngles` visual spin computed from body velocity in `vehicle.js`, not from `wheelOmega` — spins wrong under wheelspin or hard braking

**File:** `src/vehicle.js:133-136`

**Issue:** `spinDelta` on line 133 is derived from projecting `vehicleState.velocity` onto the body forward vector and dividing by `wheelRadius`. This gives the kinematic roll rate of a free-rolling wheel with no slip. It is entirely divorced from `wheelOmega[i]` which is the physically integrated spin rate accounting for drive torque, brake torque, and road reaction. Under wheelspin the wheel mesh will not visually spin faster than the car's travel speed; under locked braking the wheels will not visually stop. The visual disconnect will be obvious to any player watching the tires.

**Fix:** In `syncMeshesToState` (main.js), use `wheelOmega[i]` to accumulate `wheelAngles[i]` each physics step, replacing the vehicle.js body-velocity spinDelta:

```js
// In the fixed-step loop in main.js, after stepPhysics:
for (let i = 0; i < 4; i++) {
  vehicleState.wheelAngles[i] += vehicleState.wheelOmega[i] * FIXED_DT
}
```
And remove the `spinDelta` accumulation in `vehicle.js` lines 132–137.

---

### WR-02: Slip angle sign convention mismatch between `computeLateralForce` return and the force application direction

**File:** `src/physics.js:175,205`

**Issue:** `computeLateralForce` returns a value whose sign follows `slipAngle` (per `tire.js:45`). `slipAngle` on line 174 is computed as `atan2(latVel, longVelAbs + 0.01)`, where `latVel = hubVel.dot(wheelRight)`. A positive `latVel` (hub velocity pointing toward wheel's right) means the wheel is sliding to the right, so the lateral grip force should point to the left (negative `wheelRight` direction — resisting the slip). However, line 205 applies the force as:

```js
wheelForce.addScaledVector(wheelRight, Flat)
```

A positive `Flat` adds force in the `+wheelRight` direction — the same direction as the slip — which pushes the car further into the slide rather than opposing it. This is the classic sign inversion bug in tire force application. The lateral force should oppose the lateral velocity.

**Fix:** Negate `Flat` when applying it, OR negate `slipAngle` before passing to `computeLateralForce`:

```js
// Option A — negate at application site (line 205)
wheelForce.addScaledVector(wheelRight, -Flat)

// Option B — negate slipAngle input (line 174)
const slipAngle = -Math.atan2(latVel, longVelAbs + 0.01)
```
Option A is preferred — it preserves the documented tire.js sign convention while correcting the application direction.

---

### WR-03: `getBrakeTorque` double-counts brake torque when both `handbrake` and `brake > 0` are active simultaneously on rear wheels

**File:** `src/physics.js:64-69`

**Issue:** `getBrakeTorque` returns `maxHandbrakeTorque` on lines 66 when the handbrake is active. It returns `brake * maxBrakeTorque` on line 67 when `brake > 0`. These are two separate return paths with no combining logic. If both `handbrake` is true AND `brake > 0` on a rear wheel, the handbrake return fires first (line 66) and brake torque is silently discarded. This means holding brake and handbrake together on rear wheels produces only handbrake torque (2000 N·m default), not the expected combined or max-of-two value. Separately, `getDriveTorque` line 47 also returns `-brake * maxBrakeTorque` for all wheels when brake is held while moving forward — this applies simultaneously with `getBrakeTorque`'s rear-handbrake path via the omega integrator subtraction on line 201. The omega integrator adds `driveTorque - roadReactionTorque - brakeTorque` where `driveTorque` is negative (braking) AND `brakeTorque` is also positive — so brake force is double-counted on rear wheels when both brake and handbrake are engaged.

**Fix:** Combine the torques explicitly:

```js
function getBrakeTorque (wheelIndex, vehicleState, params) {
  const isRear = wheelIndex === 2 || wheelIndex === 3
  let torque = vehicleState.brake > 0 ? vehicleState.brake * params.maxBrakeTorque : 0
  if (vehicleState.handbrake && isRear) torque = Math.max(torque, params.maxHandbrakeTorque)
  return torque
}
```

---

### WR-04: Ramp triangle contact returns a zero-length normal when sphere center coincides exactly with closest point on triangle

**File:** `src/main.js:323-325`

**Issue:** When `dist < 1e-8` (line 323), `inv` is set to `0` and the normal vector `(dx * 0, dy * 0, dz * 0) = (0, 0, 0)` is pushed into `hits`. This zero-length normal is passed to `computeNormalForce` and multiplied into force vectors in `stepPhysics`. Force application via `totalForce.addScaledVector(normal, Fn)` with a zero normal applies zero force — the penetration goes uncorrected. The contact point is in `hits` but produces no resolution, and the `Fn <= 0` guard on line 166 only skips zero-or-negative normal force, not zero-normal contacts. This is a degenerate contact that silently fails to resolve.

**Fix:** Skip the contact when `dist < 1e-8` instead of emitting a zero normal:

```js
if (depth <= 0) continue
if (dist < 1e-8) continue  // degenerate: sphere center on triangle surface, skip
const inv = 1 / dist
hits.push({
  normal: new THREE.Vector3(dx * inv, dy * inv, dz * inv),
  depth,
  contactPoint: cp
})
```

---

### WR-05: `_flatNormal` is a module-level singleton reused across all `queryContacts` calls without cloning — mutation in `stepPhysics` corrupts subsequent contacts in the same step

**File:** `src/main.js:310-314`

**Issue:** `_flatNormal` is defined once at line 210 as `new THREE.Vector3(0, 1, 0)`. Each ground contact hit on line 311 pushes `_flatNormal.clone()` — that part is fine. But the ramp contacts on line 317 push `new THREE.Vector3(...)` each time. The real hazard is `_rampNormal` at line 209 (`new THREE.Vector3(0, Math.cos(RAMP_ANGLE), Math.sin(RAMP_ANGLE))`): in `terrain()` line 236 the raw `_rampNormal` reference is returned (not cloned). Any caller that mutates the returned normal (e.g., `normal.clone().multiplyScalar(Fn)` is safe, but `normal.multiplyScalar(...)` would mutate it in place) will corrupt all future calls. Currently `stepPhysics` always calls `.clone()` before mutating, so this is latent rather than actively broken — but `terrain()` is referenced at line 240 (`window.terrain = terrain`) making it a public API that external callers could misuse. The `queryContacts` ground path does clone correctly.

**Fix:** Return cloned vectors from `terrain()`:

```js
return { height: distIntoRamp * Math.tan(RAMP_ANGLE), normal: _rampNormal.clone() }
// ...
return { height: 0, normal: _flatNormal.clone() }
```

---

## Info

### IN-01: `console.log` left in production entry point

**File:** `src/main.js:28`

**Issue:** `console.log('THREE.REVISION', THREE.REVISION)` fires every page load. The comment says it is a "manual verification hook" — once confirmed, this should be removed from production code.

**Fix:** Delete line 28 or guard with a `DEBUG` flag.

---

### IN-02: Dead path in `getDriveTorque` — front wheels always return 0, making the throttle/brake branch for front wheels (`isRear = false`) unreachable dead code

**File:** `src/physics.js:38-51`

**Issue:** `getDriveTorque` only returns nonzero torque when `isRear === true`. The front wheel paths (`return 0` at lines 44 and 48 for `!isRear`) are evaluated every call for front wheels but are functionally equivalent to not entering the function at all. This is not a bug, but the function's structure implies it could drive front wheels in a future FWD/AWD mode — a future developer may accidentally enable it by changing a condition. The intent (RWD only) should be explicit.

**Fix:** Add a guard at the top of the function:

```js
if (wheelIndex !== 2 && wheelIndex !== 3) return 0  // RWD — front wheels receive no drive torque
```

---

### IN-03: `wheelAngles` in `SPAWN_STATE` (vehicle.js) is not reset on R-key in main.js `resetRequested` block — visual wheel rotation persists across resets

**File:** `src/vehicle.js:29` / `src/main.js:390`

**Issue:** `SPAWN_STATE` exports `wheelAngles: [0, 0, 0, 0]` but that array is never used during reset in `main.js`. Line 390 does assign `vehicleState.wheelAngles = [0, 0, 0, 0]` — so the value is correct. However `SPAWN_STATE.wheelAngles` is defined but never read during reset, making it dead data in the export. Not a bug, but misleading — the reset loop ignores `SPAWN_STATE.wheelAngles` and hardcodes `[0,0,0,0]` directly.

**Fix:** Either read `SPAWN_STATE.wheelAngles` during reset for consistency, or remove the field from `SPAWN_STATE` and add a comment that visual angles are always reset to zero.

---

_Reviewed: 2026-05-30_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
