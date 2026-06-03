---
phase: 04-suspension
reviewed: 2026-05-31T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - data/ranger.js
  - docs/GLOSSARY.md
  - scenarios/m4-02-asymmetric-bump.json
  - scenarios/m4-04-static-vs-braking.json
  - scenarios/m4-05-wheel-lift-ramp.json
  - scenarios/m4-06-bump-response.json
  - src/debug.js
  - src/logger.js
  - src/main.js
  - src/physics.js
  - src/suspension.js
  - src/vehicle.js
findings:
  critical: 2
  warning: 5
  info: 4
  total: 11
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-05-31
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

This phase added a full quarter-car suspension model (hub vertical ODE, tire spring, suspension spring, ARB coupling) integrated into the existing 6DOF physics pipeline. The architecture is sound and the mathematical derivations for Pacejka, relaxation length, and ARB are largely correct. However, a critical off-by-one in the static equilibrium computation places the car body 0.18 m too low at spawn, causing the suspension to apply roughly 2.6× the expected force on first step — producing a violent bounce rather than a pre-settled car. A second critical issue is a duplicate key in `RANGER_PARAMS` that silently discards the first `rollingResistanceCoeff` definition. Several warnings cover the handbrake zero-force-at-rest behavior, incomplete IC loading, a display unit mismatch in the HUD, and a zero-normal edge case in triangle contact resolution. Documentation inconsistencies between GLOSSARY and actual field semantics round out the findings.

---

## Critical Issues

### CR-01: `computeStaticEquilibrium` returns mount world Y instead of CG world Y — car spawns 0.18 m too low, suspension fires 2.6× too hard

**File:** `src/main.js:58-63`

**Issue:** `computeStaticEquilibrium` computes the suspension mount's world Y position and returns it directly as `bodyY` (used as `vehicleState.position.y`). In `suspension.js`, the mount world Y is derived as `vehicleState.position.y + rMount.y` where `rMount.y ≈ -(cgHeight - wheelRadius) = -0.182 m` (the hub offset below the CG in body space). This means the mount world Y is always 0.182 m below the CG.

The formula in `main.js`:
```javascript
bodyYCorner[i] = hubY[i] + L_S - suspComp  // this is mount world Y, not CG world Y
```
…is missing the correction term `+ (cgHeight - wheelRadius)`.

Numerical consequence at spawn (front corner):
- `hubY = 0.330 m`, `mountWorldY = 0.418 m`, `position.y = 0.418 m`
- Suspension.js computes `mountWorldY = 0.418 - 0.182 = 0.236 m`
- `suspComp = 0.20 - (0.236 - 0.330) = 0.293 m` (vs expected `0.111 m`)
- `suspForce = 33 000 × 0.293 = 9 669 N` (vs expected `3 669 N`, 2.6× too large)
- Net force on hub = `3 743 - 9 669 - 176 = -6 102 N` downward → hub plunges

The car body simultaneously receives ~9 669 N upward instead of ~3 669 N, causing a violent upward lurch at spawn. The stated goal of "spawns pre-settled with no visible drop" (RESEARCH §Pattern 4) is not achieved.

The GLOSSARY.md note "The CG height at spawn is approximately 0.42 m … this is correct physics" is incorrect; the correct equilibrium CG height is ~0.60 m.

**Fix:**
```javascript
// In computeStaticEquilibrium, change the bodyY derivation:
function computeStaticEquilibrium (p) {
  const g = 9.81
  const hubY        = [0, 0, 0, 0]
  const bodyYCorner = [0, 0, 0, 0]
  for (let i = 0; i < 4; i++) {
    const isFront    = i < 2
    const cornerMass = p.mass * (isFront ? p.weightFront : p.weightRear) / 2 + p.wheelMass
    const k_T = p.tireStiffness
    const k_S = isFront ? p.suspensionStiffnessFront : p.suspensionStiffnessRear
    const L_S = isFront ? p.suspensionRestLengthFront : p.suspensionRestLengthRear
    const tireComp = cornerMass * g / k_T
    const suspComp = (cornerMass - p.wheelMass) * g / k_S
    hubY[i]        = p.wheelRadius - tireComp
    // mountWorldY = hubY + L_S - suspComp
    // CG world Y  = mountWorldY + (cgHeight - wheelRadius)  ← missing in original
    bodyYCorner[i] = hubY[i] + L_S - suspComp + (p.cgHeight - p.wheelRadius)
  }
  const bodyY = (bodyYCorner[0] + bodyYCorner[1]) / 2
  return { bodyY, hubY }
}
```
Also update the GLOSSARY.md note: the spawn CG height is ~0.60 m, not ~0.42 m.

---

### CR-02: Duplicate `rollingResistanceCoeff` key in `RANGER_PARAMS` — first definition silently dead

**File:** `data/ranger.js:54` and `data/ranger.js:82`

**Issue:** `RANGER_PARAMS` contains two declarations of `rollingResistanceCoeff`:
```javascript
rollingResistanceCoeff: 20,    // line 54 — N/(m/s), old velocity-model units
...
rollingResistanceCoeff: 0.015, // line 82 — [-] coefficient, new model
```
JavaScript object literals with duplicate keys silently discard the first value; only `0.015` is visible at runtime. The first entry with value `20` (and the comment claiming units `N/(m/s)`) is dead code that cannot be reached. This also means the lil-gui slider range `[0, 0.05]` in `debug.js:55` is appropriate for the surviving value, but any engineer reading `ranger.js` will see the `20` value and be confused about what the physics loop receives.

**Fix:**
Remove the first `rollingResistanceCoeff: 20` entry at line 54 entirely (including its comment block) and keep only the correct definition at line 82:
```javascript
// Remove lines 53-54 entirely:
// lateralDampingCoeff:    4000,  // N/(m/s) — damps lateral contact-patch velocity (unused, kept for slider compat)
// rollingResistanceCoeff: 20,    // N/(m/s) — rolling drag proportional to longitudinal velocity
```
The `lateralDampingCoeff` line immediately above it can remain (it has a legitimate "kept for slider compat" reason).

---

## Warnings

### WR-01: HUD slip display multiplies m/s value by `(180/Math.PI)` and labels it degrees

**File:** `src/main.js:508-512`

**Issue:** The `sa` field in `wheelDebug` stores slip-velocity magnitude in m/s (as noted in `physics.js` line 315: "sa field now stores SLIP VELOCITY magnitude (m/s) instead of slip angle (rad)"). The HUD code treats it as radians:
```javascript
const slipDeg = (vehicleState.wheelDebug?.[0]?.sa || 0) * (180 / Math.PI)
slipEl.textContent = slipDeg.toFixed(1) + '°'
slipEl.style.color = Math.abs(slipDeg) < 5 ? '#00ff88' : ...
```
At 1 m/s slip velocity, this displays `57.3°`. The color thresholds (5°, 10°) are also calibrated for radians-as-degrees, not for m/s. The readout is misleading during any slip event.

**Fix:**
```javascript
// Remove the radian→degree conversion; display raw m/s with correct label:
const slipMps = (vehicleState.wheelDebug?.[0]?.sa || 0)
const slipEl = document.getElementById('slipVal')
if (slipEl) {
  slipEl.textContent = slipMps.toFixed(2) + ' m/s'
  // Threshold calibration: ~0.5 m/s = light slip, ~1.5 m/s = heavy slip (tune to taste)
  slipEl.style.color = slipMps < 0.5 ? '#00ff88' : slipMps < 1.5 ? '#ffaa00' : '#ff2222'
}
```
Also update `docs/GLOSSARY.md` §{fl/fr/rl/rr}_sa to reflect that the field now stores slip-velocity magnitude in m/s, not slip angle in radians.

---

### WR-02: `openInitialCondition` does not reset hub state — spawning a scenario IC produces wrong suspension geometry

**File:** `src/logger.js:129-158`

**Issue:** `openInitialCondition` restores `position`, `velocity`, `quaternion`, and `angularVelocity` from the JSON file, but does not reset `hubY`, `hubVy`, `wheelOmega`, `slipLong`, or `slipLat`. After loading a scenario IC with a new `position.y`, the hub positions are stale from the previous simulation state. `suspComp = L_S - (mountWorldY - hubY[i])` will compute with an incorrect `hubY`, producing a large force spike on the first physics step and an incorrect transient response that invalidates the scenario's assertions.

The scenario files all use `position.y: 0.55` which is the `cgHeight` constant. Once CR-01 is fixed, the correct spawn height will be ~0.60 m; even after that fix, loaded ICs will still have stale hub state.

**Fix:**
```javascript
reader.onload = ev => {
  try {
    const ic = JSON.parse(ev.target.result)
    if (ic.position) {
      vehicleState.position.set(ic.position.x, ic.position.y, ic.position.z)
    }
    if (ic.velocity) {
      vehicleState.velocity.set(ic.velocity.x, ic.velocity.y, ic.velocity.z)
    }
    if (ic.quaternion) {
      vehicleState.quaternion.set(ic.quaternion.x, ic.quaternion.y, ic.quaternion.z, ic.quaternion.w)
    }
    if (ic.angularVelocity) {
      vehicleState.angularVelocity.set(ic.angularVelocity.x, ic.angularVelocity.y, ic.angularVelocity.z)
    }
    // Reset suspension, slip, and wheel state to avoid stale-state transients
    // Caller must pass params so hubY can be recomputed from equilibrium
    vehicleState.hubVy       = [0, 0, 0, 0]
    vehicleState.wheelOmega  = [0, 0, 0, 0]
    vehicleState.slipLong    = [0, 0, 0, 0]
    vehicleState.slipLat     = [0, 0, 0, 0]
    // hubY: ideally reset to equilibrium from params, or leave a note that it is stale
  } catch (err) {
    console.error('[logger] Failed to parse IC file:', err)
  }
}
```
Note that `openInitialCondition` does not currently receive `params`, so hub equilibrium recomputation would require adding a `params` parameter or exporting a reset helper from `main.js`.

---

### WR-03: All scenario IC files use `position.y: 0.55` (cgHeight constant) instead of actual equilibrium height

**File:** `scenarios/m4-02-asymmetric-bump.json:3`, `scenarios/m4-04-static-vs-braking.json:3`, `scenarios/m4-05-wheel-lift-ramp.json:3`, `scenarios/m4-06-bump-response.json:3`

**Issue:** All four Phase 4 scenario files set `"position": { "y": 0.55 }`. The value `0.55` is the raw `cgHeight` parameter. The correct spawn height from `computeStaticEquilibrium` is approximately `0.42 m` with the current code (wrong, see CR-01) or `~0.60 m` once CR-01 is fixed. Loading these scenarios will produce an incorrect initial condition regardless of whether CR-01 is fixed, causing a transient bounce before the scenario reaches steady state and potentially invalidating the assertion windows. The scenario for M4-04 in particular starts with a specified velocity (`"vz": -16.667`) and asserts load transfer during braking — a suspension transient at t=0 will corrupt the load transfer readings.

**Fix:** After fixing CR-01, update all scenario files to use the correct equilibrium `position.y` (approximately `0.60 m`). Consider computing this programmatically from `RANGER_PARAMS` and embedding it in the scenario description or deriving it at load time.

---

### WR-04: Handbrake applies zero torque when vehicle is stationary — cannot hold car on a slope

**File:** `src/physics.js:87-90`

**Issue:** The handbrake ramp-to-zero implementation prevents the handbrake from holding a stationary car:
```javascript
if (vehicleState.handbrake && isRear) {
  const scale = Math.min(Math.abs(longVel) / HB_RAMP, 1.0)
  return params.maxHandbrakeTorque * scale  // returns 0 when longVel = 0
}
```
A real vehicle handbrake is a static friction device that holds the car at rest. With this implementation, a car placed on a ramp and given `handbrake=true` at zero velocity will roll away because no brake torque is applied. The ramp scenario (`m4-05-wheel-lift-ramp.json`) sets `"vz": -13.889`, so this does not affect ramp tests directly, but it means the handbrake cannot be used as a parking brake in any scenario.

The comment "ramped so it applies zero force at rest" indicates this was intentional to avoid oscillation artifacts; if so, it should be documented as a known limitation rather than the expected behavior.

**Fix (if holding at rest is desired):**
```javascript
if (vehicleState.handbrake && isRear) {
  // Ramp only for very low speeds to avoid impulse artifact; above 0 m/s apply full torque
  const scale = longVel === 0 ? 1.0 : Math.min(Math.abs(longVel) / HB_RAMP, 1.0)
  return params.maxHandbrakeTorque * scale
}
```
Or remove the ramp entirely and use a small velocity dead-zone in the omega clamp instead.

---

### WR-05: `queryContacts` produces a zero-length normal vector when sphere center is exactly on a triangle surface

**File:** `src/main.js:385-390`

**Issue:** In the triangle contact loop, when the sphere center lies exactly on the triangle surface (`dist < 1e-8`), `inv` is set to `0` and the returned normal is `(0, 0, 0)`:
```javascript
const inv = dist < 1e-8 ? 0 : 1 / dist
hits.push({
  normal: new THREE.Vector3(dx * inv, dy * inv, dz * inv),  // (0,0,0) when dist < 1e-8
  depth,
  contactPoint: cp
})
```
A zero-length normal is then used in `physics.js` for:
- Body contacts: `totalForce.addScaledVector(normal, Fn)` → applies zero force despite `Fn > 0`
- Tire contacts: `contactVel.dot(normal)` → always 0, only spring term contributes to `Fn`

The contact is detected and a force is computed, but zero is applied to the body. The object penetrates the surface without being pushed out. This can happen when a wheel or bumper sphere center aligns perfectly with a ramp edge — unlikely in practice but possible during ramp entry near the toe edge.

**Fix:** Fall back to the ramp surface normal when the closest-point distance is near zero:
```javascript
const inv = dist < 1e-8 ? 0 : 1 / dist
if (inv === 0) continue  // degenerate contact — skip rather than applying zero force
// OR: use a pre-computed face normal as fallback
```

---

## Info

### IN-01: Orphaned JSDoc comment for `getBodyContactPoints` displaced above `stepSuspensionSubsteps`

**File:** `src/suspension.js:138-147`

**Issue:** The JSDoc block describing `getBodyContactPoints` (lines 138–147) is placed immediately before the `stepSuspensionSubsteps` JSDoc block (lines 148–183) and far above the actual function definition at line 314. The `getBodyContactPoints` function at line 314 has no JSDoc directly preceding it, making documentation tools and readers associate the floating JSDoc with the wrong function.

**Fix:** Move the `getBodyContactPoints` JSDoc to immediately precede its function definition at line 314, removing it from lines 138–147.

---

### IN-02: `docs/GLOSSARY.md` §{fl/fr/rl/rr}_sa documents slip angle (radians) but actual field is slip velocity magnitude (m/s)

**File:** `docs/GLOSSARY.md:281-283`

**Issue:** The GLOSSARY states:
> `{fl/fr/rl/rr}_sa`: Slip angle at the named wheel — radians. Computed as `atan2(lateralVelocity, |longitudinalVelocity|)`.

The actual value written by `physics.js` (line 319) is:
```javascript
vehicleState.wheelDebug[i].sa = Math.hypot(sLongCur, sLatNew)
```
This is the magnitude of the relaxation-filtered slip displacement vector in meters, not a slip angle in radians. The `atan2` formula in the GLOSSARY is completely different from the actual computation. Any tool or test consuming log files will misinterpret the `sa` field.

**Fix:** Update GLOSSARY §{fl/fr/rl/rr}_sa to reflect the actual semantics: "Relaxation-filtered slip displacement magnitude at the named wheel — metres (m). Combined magnitude: `sqrt(sLong² + sLat²)`. Zero when airborne."

---

### IN-03: `console.log('THREE.REVISION', ...)` debug artifact in production entry point

**File:** `src/main.js:27`

**Issue:**
```javascript
console.log('THREE.REVISION', THREE.REVISION)
```
This fires on every page load. The comment "Manual verification hook — console.log confirms importmap loaded r184" documents it as intentional, but it pollutes the console for end users. It should be removed or gated behind a debug flag.

**Fix:** Remove the line, or gate it:
```javascript
if (import.meta.env?.DEV) console.log('THREE.REVISION', THREE.REVISION)
```
(Note: since there is no build system, a simpler approach is to remove it entirely and check the version via the browser devtools when needed.)

---

### IN-04: Penetration failsafe in `stepPhysics` does not update `hubY` after correcting `position.y`

**File:** `src/physics.js:112-123`

**Issue:** The tunnelling failsafe increases `vehicleState.position.y` by `maxEmbed` but does not update `vehicleState.hubY[i]`:
```javascript
if (maxEmbed > 0.3) {
  vehicleState.position.y += maxEmbed
  vehicleState.velocity.y  = 0
  // hubY[i] not updated
}
```
After correction, the mount world Y increases by `maxEmbed` but `hubY[i]` stays put. On the next substep, `suspComp = L_S - (mountWorldY - hubY)` sees a larger `mountWorldY - hubY` gap → suddenly reduced suspension compression → potentially negative `suspComp` → spring force drops to zero (D-15 no-tension clamp) → body falls back. This creates a one-step force spike followed by a no-force step. The failsafe is intended for catastrophic tunnelling (>0.3 m), so it is rarely reached, but when triggered it introduces an inconsistent hub state.

**Fix:** When applying the tunnelling correction, also shift `hubY` by the same amount:
```javascript
if (maxEmbed > 0.3) {
  vehicleState.position.y += maxEmbed
  vehicleState.velocity.y  = 0
  for (let j = 0; j < 4; j++) {
    vehicleState.hubY[j] += maxEmbed  // keep hub↔body geometry consistent
  }
}
```

---

_Reviewed: 2026-05-31_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
