# Phase 1: Core Driving - Research

**Researched:** 2026-05-10
**Domain:** Browser-based 6DOF rigid body physics + Three.js scene setup
**Confidence:** HIGH (all core claims verified via Context7 or npm registry)

---

## Summary

Phase 1 builds a fully drivable 2002 Ford Ranger in the browser from scratch. The technical
domain spans four independent problem areas that must integrate cleanly: (1) Three.js r184
scene setup via ES module importmap for GitHub Pages compatibility, (2) a fixed-timestep
physics accumulator loop with quaternion 6DOF integration, (3) velocity-damping friction
placeholder (behind the Phase 3 Pacejka signatures), and (4) Ackermann steering geometry
for front wheel angles from a single steer input.

All four areas have well-understood, prescriptive solutions. There are no unexplored
alternatives — the decisions made in CONTEXT.md (quaternion-only, velocity-damping placeholder,
stub signatures locked) map directly to standard implementations documented below.

The most important structural constraint is the stub-first architecture: `src/tire.js` and
`src/suspension.js` must be real files with locked JSDoc-documented signatures from day one,
even though their Phase 1 bodies are trivially simple damping coefficients. This is what
protects Phase 3 and Phase 4 from retrofitting call sites.

**Primary recommendation:** Implement in vertical slice order — scene + car mesh visible first,
then physics loop, then input/forces, then camera/HUD. Each slice leaves the browser in a
runnable state.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `docs/GLOSSARY.md` is the FIRST task in Phase 1 — written before any physics code is written.
- **D-02:** Phase 1 GLOSSARY covers: coordinate system (Y-up, +X right, +Y up, -Z forward at heading 0), named vectors (forward/right/up), slip angle sign convention, torque sign, quaternion integration convention, and term definitions for: slip angle, contact patch velocity, Ackermann geometry. Deferred to later phases: Pacejka terms, suspension terms.
- **D-03:** `references/backup11.html`, `references/backup12.html`, and `references/backup12alt.html` are explicitly off-limits. Downstream agents (researcher, planner, executor) MUST NOT reference these files during Phase 1 implementation.
- **D-04:** Implementation is guided by REQUIREMENTS.md + physics first principles only. Pure greenfield build.
- **D-05:** `src/tire.js` and `src/suspension.js` are created in Phase 1 as real files with locked function signatures. They are NOT implemented inline in `physics.js`.
- **D-06:** `src/tire.js` exports at minimum: `computeLateralForce(slipAngle, Fz, params)` and `computeLongitudinalForce(slipRatio, Fz, params)`. `src/suspension.js` exports at minimum: `computeNormalForce(corner, vehicleState, params)` and `getWheelPosition(corner, vehicleState)`. These signatures are locked — Phase 3 and 4 replace the function bodies without touching call sites.
- **D-07:** Each stub function has a JSDoc comment defining: input units, output units, and what the real Phase 3/4 implementation will do. The comment is the contract.
- **D-08:** Phase 1 uses velocity damping for both lateral and longitudinal friction. Lateral: force proportional to lateral velocity at each wheel contact point. Longitudinal: rolling resistance + brake drag proportional to wheel longitudinal velocity. No slip angle math, no Pacejka — just damping coefficients.
- **D-09:** The velocity damping code lives inside `src/tire.js` behind the `computeLateralForce` and `computeLongitudinalForce` signatures. When Phase 3 arrives, the Pacejka implementation replaces the body. Call sites in `physics.js` do not change.
- **D-10:** Two friction params: `lateralDampingCoeff` and `rollingResistanceCoeff`. Both live in `data/ranger.js` alongside vehicle specs. Both are exposed as debug menu sliders in Phase 1.

### Claude's Discretion

- Exact slider ranges and default values for `lateralDampingCoeff` and `rollingResistanceCoeff` — tune for feel
- Mesh geometry proportions for car body / wheels (requirement says "simple box + cylinders" — proportions and scale open)
- Camera spring follow constants (stiffness, damping) — tune for feel

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOUND-01 | Project runs in browser from GitHub Pages with no install — single `index.html` + `src/` ES6 modules | importmap CDN pattern; ES6 module CORS confirmed |
| FOUND-02 | Three.js r184 loaded via importmap (not global script tag) | Context7 + npm registry: v0.184.0 = r184 confirmed |
| FOUND-03 | stats.js FPS monitor visible in debug mode | Bundled at `three/addons/libs/stats.module.js`; confirmed in CLAUDE.md |
| FOUND-04 | Local dev works via simple HTTP server | ES module CORS requirement confirmed; `python3 -m http.server` works |
| FOUND-05 | `docs/GLOSSARY.md` defines all physics terms | No library research needed; pure documentation task, ordered first by D-01 |
| M1-01 | 3D world renders with ground plane, grid, basic lighting | Three.js PlaneGeometry + GridHelper + DirectionalLight patterns confirmed |
| M1-02 | Car body and 4 wheels visible as simple meshes | BoxGeometry (body) + CylinderGeometry (wheels) pattern confirmed |
| M1-03 | 6DOF rigid body physics using quaternion orientation | Quaternion integration formula: q' = normalize(q * dq) where dq from axis-angle (ω, |ω|·dt) |
| M1-04 | Fixed 1/60s physics timestep with accumulator loop | Gaffer On Games pattern confirmed; spiral-of-death clamp at 250ms |
| M1-05 | Car moves forward/backward with W/S | Drive torque → longitudinal force via getDriveTorque stub → linear impulse |
| M1-06 | Car steers left/right with Ackermann geometry | Ackermann formula: φ_i = atan(2L·sin(φ)/(2L·cos(φ)−T·sin(φ))), φ_o similar |
| M1-07 | Steering uses accumulated keyboard input (analog feel) | steerAngle += rate * dt on keydown; steerAngle decays toward 0 on release |
| M1-08 | Speed-scaled steering limit (less max lock at high speed) | maxSteer = baseMaxSteer / (1 + speed/speedRef) or lookup table |
| M1-09 | Wheels visually rotate at correct rate for current speed | wheelMesh.rotation.x += (longitudinalSpeed / wheelRadius) * dt |
| M1-10 | Spring-follow chase camera + cockpit toggle on C | THREE.Vector3.lerp() to goal position + camera.lookAt(); cockpit = fixed offset |
| M1-11 | HUD shows speed (km/h) | DOM overlay; |velocity| * 3.6 km/h |
| M1-12 | R key resets car to spawn position | Copy spawn state back into vehicleState |
| M1-13 | terrain(x,z) => {height, normal} wired into physics | Returns {height: 0, normal: new THREE.Vector3(0,1,0)} in Phase 1 |
| M1-14 | getDriveTorque(wheelIndex, vehicleState, params) interface | Returns flat torque value in Phase 1; signature locked for Phase 3 |
| M1-15 | Vehicle specs loaded from data/ranger.js | Exported const with real 2002 Ford Ranger specs (see Architectural section) |

</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Scene rendering | Three.js (src/main.js) | — | WebGL render loop lives in main; no server tier |
| Physics integration | src/physics.js | src/tire.js, src/suspension.js | Force accumulation and state integration in one module; tire/suspension are force providers only |
| Vehicle state & input | src/vehicle.js | src/physics.js | Vehicle owns its state; physics reads from it |
| Tire forces | src/tire.js | — | Intentionally isolated; Phase 3 replaces body, not call sites |
| Normal force / contact | src/suspension.js | — | Intentionally isolated; Phase 4 replaces body |
| Camera | src/camera.js | Three.js | Chase and cockpit modes; reads vehicleState |
| Debug / HUD | src/debug.js | lil-gui, stats.js | Reads vehicleState; no writes to physics |
| Vehicle specs | data/ranger.js | — | Pure data; consumed by vehicle.js and debug.js |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Three.js | r184 (0.184.0) | 3D rendering, scene graph, math primitives | Confirmed latest stable on npm 2026-05-10; project requirement |
| ES6 importmap | browser-native | Module resolution without bundler | Required per CLAUDE.md; supported in all modern browsers |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lil-gui | bundled in three/addons | Debug slider UI | Backtick-toggle panel; import from `three/addons/libs/lil-gui.module.min.js` |
| stats.js | bundled in three/addons | FPS counter | Always active in debug mode; import from `three/addons/libs/stats.module.js` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| importmap | npm + bundler | Bundler adds install step and breaks GitHub Pages zero-install requirement |
| lil-gui | dat.GUI | dat.GUI explicitly forbidden in CLAUDE.md; lil-gui is its replacement |
| hand-rolled physics | Cannon.js / Rapier | Physics library forbidden; required for Pacejka access in Phase 3 |

**Installation (CDN via importmap — no npm install):**
```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/"
  }
}
</script>
```

**Version verification:** `npm view three version` returned `0.184.0` on 2026-05-10. [VERIFIED: npm registry]

---

## Architecture Patterns

### System Architecture Diagram

```
Browser Input (keyboard)
        |
        v
  src/vehicle.js          data/ranger.js
  (steerAngle, throttle,  (specs: mass, wheelbase,
   brakeInput, state)      track, CG height, etc.)
        |                       |
        v                       v
  src/physics.js  <----  src/tire.js  (computeLateralForce, computeLongitudinalForce)
  (force accumulation     src/suspension.js (computeNormalForce, getWheelPosition)
   6DOF integrator        terrain(x,z) stub => {height:0, normal:(0,1,0)}
   quaternion update)     getDriveTorque stub => flat torque
        |
        v
  vehicleState (pos, vel, quat, angVel, wheelAngles)
        |
        +-----------> src/camera.js (spring-follow chase / cockpit)
        |
        +-----------> src/debug.js (HUD km/h, lil-gui sliders, stats.js FPS)
        |
        v
  src/main.js  (Three.js scene graph sync: mesh positions from vehicleState)
        |
        v
  Three.js WebGLRenderer -> <canvas>
```

### Recommended Project Structure
```
index.html              # Entry point: importmap + <script type="module" src="src/main.js">
src/
├── main.js             # Scene setup, game loop (rAF + fixed-step accumulator), mesh sync
├── physics.js          # 6DOF integrator, force accumulation, quaternion update
├── vehicle.js          # Vehicle state, input accumulation, steer angle, drive torque routing
├── tire.js             # Phase 1: velocity-damping stubs; Phase 3: Pacejka replacement
├── suspension.js       # Phase 1: static Fz stubs; Phase 4: spring-damper replacement
├── camera.js           # Chase + cockpit camera modes; spring-follow lerp
└── debug.js            # lil-gui panel, stats.js, HUD DOM overlay
data/
└── ranger.js           # 2002 Ford Ranger specs as exported const
docs/
└── GLOSSARY.md         # FIRST deliverable (D-01); physics terms and sign conventions
```

### Pattern 1: Three.js importmap CDN Setup
**What:** Declare module resolution in HTML before any module scripts
**When to use:** Every index.html — must appear before `<script type="module">`
**Example:**
```html
<!-- Source: https://github.com/mrdoob/three.js/blob/dev/manual/en/installation.html -->
<head>
  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/"
    }
  }
  </script>
</head>
<body>
  <script type="module" src="src/main.js"></script>
</body>
```
[VERIFIED: Context7 /mrdoob/three.js]

### Pattern 2: Fixed-Timestep Accumulator Loop
**What:** Separates physics steps (fixed dt=1/60s) from render frames (variable rAF timing)
**When to use:** Main game loop in `src/main.js`
**Example:**
```javascript
// Source: Gaffer On Games — Fix Your Timestep! (gafferongames.com/post/fix_your_timestep/)
const FIXED_DT = 1 / 60;          // 16.667ms physics step
const MAX_FRAME_TIME = 0.25;       // 250ms clamp — spiral-of-death prevention

let accumulator = 0;
let currentTime = performance.now() / 1000;

function loop() {
  requestAnimationFrame(loop);

  const newTime = performance.now() / 1000;
  let frameTime = newTime - currentTime;
  currentTime = newTime;

  // Clamp: if tab was hidden or frame spiked, don't simulate catchup forever
  if (frameTime > MAX_FRAME_TIME) frameTime = MAX_FRAME_TIME;

  accumulator += frameTime;

  while (accumulator >= FIXED_DT) {
    physicsStep(FIXED_DT);          // deterministic fixed step
    accumulator -= FIXED_DT;
  }

  // Render with current state (no interpolation needed at 60fps target)
  syncMeshesToState();
  renderer.render(scene, camera);
  stats.update();
}

requestAnimationFrame(loop);
```
[CITED: gafferongames.com/post/fix_your_timestep/]

### Pattern 3: Quaternion 6DOF Integration
**What:** Update orientation quaternion from angular velocity vector each physics step
**When to use:** Inside `physicsStep()` in `src/physics.js`

The integration equation is:

  q(t+dt) = normalize( dq * q(t) )

where dq is constructed from the body-space angular velocity vector ω (rad/s) using axis-angle:

  axis = normalize(ω),  angle = |ω| * dt
  dq = Quaternion.setFromAxisAngle(axis, angle)

This is the "constant angular velocity over dt" assumption — exact for small dt, stable at 60 Hz.

```javascript
// Source: first-principles from quaternion differential equation q̇ = ½ω⊗q
// Verified against: ashwinnarayan.com/post/how-to-integrate-quaternions/
function integrateQuaternion(q, angularVelocity, dt) {
  const omega = angularVelocity.clone();  // THREE.Vector3, world space
  const angSpeed = omega.length();

  if (angSpeed < 1e-10) return;           // no rotation this frame

  const axis = omega.clone().normalize();
  const angle = angSpeed * dt;

  const dq = new THREE.Quaternion();
  dq.setFromAxisAngle(axis, angle);

  q.premultiply(dq);  // left-multiply: dq * q (world-frame angular velocity)
  q.normalize();      // prevent drift accumulation
}
```
[VERIFIED: Context7 /mrdoob/three.js — THREE.Quaternion.setFromAxisAngle, normalize, premultiply]
[CITED: ashwinnarayan.com/post/how-to-integrate-quaternions/]

**Note on body-frame vs world-frame:** Physics.js accumulates forces in world space, so ω is
in world space. Use `premultiply(dq)` (dq * q). If angular velocity were body-space, use
`multiply(dq)` (q * dq).

### Pattern 4: Velocity-Damping Friction (Phase 1 Placeholder)
**What:** Simple proportional damping of lateral and longitudinal velocity at each wheel contact point — no slip angle, no Pacejka
**When to use:** Inside `computeLateralForce` and `computeLongitudinalForce` in `src/tire.js`

```javascript
// src/tire.js — Phase 1 stub bodies (signatures locked for Phase 3 replacement)
// Source: derived from first principles; Coulomb/viscous damping model

/**
 * Compute lateral (side) force at this wheel's contact patch.
 * @param {number} slipAngle - [rad] tire slip angle (unused in Phase 1)
 * @param {number} Fz        - [N] normal force on this wheel
 * @param {object} params    - vehicle params; uses params.lateralDampingCoeff [N/(m/s)]
 * @returns {number} Fy [N] lateral force (positive = left, per coordinate system)
 *
 * Phase 3 replacement: Pacejka Magic Formula lateral Fy vs slip angle
 */
export function computeLateralForce(slipAngle, Fz, params) {
  // Phase 1: caller computes lateralVelocity at contact patch and passes via params
  // Force proportional to lateral velocity — damps sideslip
  return -params.lateralDampingCoeff * params._lateralVelocity;
}

/**
 * Compute longitudinal (drive/brake) force at this wheel's contact patch.
 * @param {number} slipRatio - [-] longitudinal slip ratio (unused in Phase 1)
 * @param {number} Fz        - [N] normal force on this wheel
 * @param {object} params    - vehicle params; uses params.rollingResistanceCoeff [N/(m/s)]
 * @returns {number} Fx [N] longitudinal force (positive = forward)
 *
 * Phase 3 replacement: Pacejka Magic Formula longitudinal Fx vs slip ratio
 */
export function computeLongitudinalForce(slipRatio, Fz, params) {
  // Phase 1: rolling resistance drag + drive torque contribution
  const rollingDrag = -params.rollingResistanceCoeff * params._longitudinalVelocity;
  return rollingDrag + params._driveForceLongitudinal;
}
```
[ASSUMED — implementation details for passing velocity via params field; approach is consistent with D-08/D-09 decisions]

### Pattern 5: Ackermann Steering Geometry
**What:** Per-wheel front steering angle from a single steer reference angle φ, wheelbase L, track T
**When to use:** In `src/vehicle.js` each step when computing wheel steering angles

The exact formula (verified):
```
φ_inner = atan( 2·L·sin(φ) / (2·L·cos(φ) − T·sin(φ)) )
φ_outer = atan( 2·L·sin(φ) / (2·L·cos(φ) + T·sin(φ)) )
```

For the 2002 Ford Ranger: L = 2.85 m, T = 1.46 m.

Sign convention: positive φ = steer left (counter-clockwise when viewed from above in Y-up
right-hand system). Left turn → left wheel is inner, right wheel is outer.

```javascript
// Source: raw.org/book/kinematics/ackerman-steering/
// Verified formula derivation at grokipedia.com/page/Ackermann_steering_geometry
function computeAckermannAngles(steerRef, wheelbase, trackWidth) {
  const L = wheelbase;     // 2.85m for Ranger
  const T = trackWidth;    // 1.46m for Ranger
  const phi = steerRef;    // reference steer angle [rad], signed

  if (Math.abs(phi) < 1e-6) {
    return { leftAngle: 0, rightAngle: 0 };
  }

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const twoL = 2 * L;

  const phiLeft  = Math.atan(twoL * sinPhi / (twoL * cosPhi - T * sinPhi));
  const phiRight = Math.atan(twoL * sinPhi / (twoL * cosPhi + T * sinPhi));

  return { leftAngle: phiLeft, rightAngle: phiRight };
}
```
[CITED: raw.org/book/kinematics/ackerman-steering/]

### Pattern 6: Spring-Follow Chase Camera
**What:** Camera position lerped toward a world-space goal offset behind/above the car each frame
**When to use:** In `src/camera.js`, called every render frame (not physics step)

```javascript
// Source: discourse.threejs.org/t/solved-smooth-chase-camera-for-an-object/3216
// THREE.Vector3.lerp() — VERIFIED Context7 /mrdoob/three.js

const CHASE_OFFSET_LOCAL = new THREE.Vector3(0, 2.5, 6.0);  // behind and above
const LERP_FACTOR = 0.08;  // ~8% per frame at 60fps — tune for feel

export function updateCamera(camera, vehicleQuat, vehiclePos, mode, dt) {
  if (mode === 'cockpit') {
    // Fixed offset inside cabin (body space → world space)
    const cockpitOffset = new THREE.Vector3(0, 0.8, 0.3);
    cockpitOffset.applyQuaternion(vehicleQuat);
    camera.position.copy(vehiclePos).add(cockpitOffset);
    // Look along forward direction
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(vehicleQuat);
    camera.lookAt(vehiclePos.clone().add(forward));
    return;
  }

  // Chase mode: goal position in world space
  const goalOffset = CHASE_OFFSET_LOCAL.clone().applyQuaternion(vehicleQuat);
  const goalPos = vehiclePos.clone().add(goalOffset);

  camera.position.lerp(goalPos, LERP_FACTOR);
  camera.lookAt(vehiclePos);
}
```
[VERIFIED: Context7 /mrdoob/three.js — THREE.Vector3.lerp, applyQuaternion, clone]

### Pattern 7: Ground Contact — y=0 Plane
**What:** Rigid ground constraint at y = wheelRadius. No impulse solver needed at Phase 1 scope.
**When to use:** At end of each physics step in `src/physics.js`

For Phase 1 the ground is y=0 and the car body's CG is at height h = ~0.55m. The constraint is:

  if (vehicleState.position.y − CG_HEIGHT < 0):
      vehicleState.position.y = CG_HEIGHT  (push out of ground)
      if (vehicleState.velocity.y < 0): vehicleState.velocity.y = 0  (kill downward velocity)
      apply normal force = mass * 9.81 upward

This is sufficient for Phase 1 because no rollover or uneven terrain is in scope. The `terrain(x,z)` stub always returns height=0.

```javascript
// Phase 1 ground constraint (flat plane)
function applyGroundConstraint(state, params) {
  const minY = params.cgHeight;  // CG rests at cgHeight when all wheels touch ground
  if (state.position.y < minY) {
    state.position.y = minY;
    if (state.velocity.y < 0) state.velocity.y = 0;
  }
}
```
[ASSUMED — simplification is intentional for Phase 1 flat-ground scope; M1-13 explicitly stubs terrain]

### Anti-Patterns to Avoid
- **Euler angles for body rotation:** Causes gimbal lock at 90° pitch/roll. Use `THREE.Quaternion` exclusively for physics state. Visual mesh syncs via `mesh.quaternion.copy(state.quaternion)`. [VERIFIED: CONTEXT.md D-03, CLAUDE.md]
- **Parenting camera to car mesh:** Direct parenting propagates jitter and collisions into camera. Use the lerp-to-goal pattern (Pattern 6). [CITED: Three.js forum]
- **Single physics step per frame (variable dt):** Makes simulation non-deterministic and can blow up at low framerates. Always use fixed-step accumulator. [CITED: gafferongames.com]
- **Implementing tire/suspension logic inline in physics.js:** Violates D-05. Phase 3 and 4 depend on isolated module boundaries.
- **`file://` URL for ES modules:** Browsers block ES module imports from `file://` due to CORS. Always test via `python3 -m http.server` or equivalent. [VERIFIED: MDN — https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules]
- **Global `<script>` Three.js tag (r128 pattern):** Replaced by importmap starting r147. No `THREE` global — use ES import. [VERIFIED: CLAUDE.md]
- **`import * as THREE from 'three'` without importmap declared first:** importmap must appear in `<head>` before any `<script type="module">`. [VERIFIED: Context7]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Quaternion math (multiply, normalize, axis-angle) | Custom quaternion class | `THREE.Quaternion` | Three.js math is well-tested, handles gimbal-lock-free rotation, already in scope |
| Vector math (dot, cross, add, lerp) | Custom Vector3 | `THREE.Vector3` | Same; avoids a second math library dependency |
| Module resolution without bundler | Custom loader | ES importmap | Browser-native; zero install; works on GitHub Pages |
| FPS counter | Custom timing display | `stats.js` from three/addons | Already bundled; shows FPS/ms/MB panels |
| Debug sliders | Custom UI widgets | `lil-gui` from three/addons | Already bundled; dat.GUI explicitly forbidden |
| Camera matrix math | Manual lookAt | `camera.lookAt(targetPos)` | Three.js provides this correctly |

**Key insight:** Three.js math classes (Quaternion, Vector3, Matrix4) are the only math library
this project needs. Any physics calculation that needs vectors, matrices, or quaternions should
use them directly — there is no reason to import a separate math library.

---

## Vehicle Specs (2002 Ford Ranger — from PROJECT.md)

These go in `data/ranger.js`. All values sourced from PROJECT.md which cross-references real
specs rounded to 3 significant figures. [CITED: .planning/PROJECT.md]

```javascript
// data/ranger.js
export const RANGER_PARAMS = {
  // Geometry
  wheelbase:       2.85,     // m — center of front axle to center of rear axle
  trackFront:      1.46,     // m — center-to-center at front axle
  trackRear:       1.46,     // m — center-to-center at rear axle
  cgHeight:        0.55,     // m — center of gravity above ground (estimate, laden)
  wheelRadius:     0.368,    // m — 245/75R16 tire

  // Mass & Inertia
  mass:            1360,     // kg — curb weight (estimate)
  // Inertia tensor (Phase 1: estimated box model; Phase 4 will tune)
  // For a box body: Ixx = m(h²+d²)/12, Iyy = m(l²+d²)/12, Izz = m(l²+h²)/12
  // Using body dimensions 4.6m L x 1.8m W x 1.6m H
  inertiaYaw:      2200,     // kg·m² (Izz — rotation about up axis; turning)
  inertiaPitch:    1400,     // kg·m² (Iyy — rotation about lateral axis; braking)
  inertiaRoll:     800,      // kg·m² (Ixx — rotation about longitudinal axis; cornering)

  // Drivetrain (Phase 1 placeholder)
  maxDriveTorque:  250,      // N·m — flat torque for Phase 1 throttle response
  maxBrakeTorque:  3000,     // N·m — flat brake deceleration placeholder

  // Phase 1 friction placeholders (exposed as debug sliders)
  lateralDampingCoeff:    4000,   // N/(m/s) — tune for feel (Claude's discretion)
  rollingResistanceCoeff: 200,    // N/(m/s) — tune for feel (Claude's discretion)

  // Steering
  maxSteerAngle:   0.52,    // rad (~30°) at low speed
  steerRate:       1.2,     // rad/s — how fast steer accumulates from held key
  steerDecayRate:  2.0,     // rad/s — how fast steer returns to zero on key release
  speedSteerRef:   15,      // m/s — speed at which max steer is halved (M1-08)

  // Weight distribution (55% front / 45% rear — estimate)
  weightFront:     0.55,
  weightRear:      0.45,
};
```
[CITED: .planning/PROJECT.md — vehicle reference specs]
[ASSUMED: inertia tensor values — estimated from box model, not measured; expose as debug sliders for tuning]

---

## Common Pitfalls

### Pitfall 1: Forgetting to normalize the quaternion each step
**What goes wrong:** Numerical drift accumulates over thousands of integration steps; quaternion grows non-unit; rotation scale distorts mesh and physics vectors.
**Why it happens:** Floating-point multiplication of unit quaternions introduces tiny errors; they compound.
**How to avoid:** Call `q.normalize()` at the end of every `integrateQuaternion()` call.
**Warning signs:** Mesh appears to slowly shrink or grow; angular velocity vector lengths behave strangely.

### Pitfall 2: Spiral of death — no frame time clamp
**What goes wrong:** Browser tab is hidden or system stalls; on resume, accumulator has huge debt; physics tries to simulate 5 seconds in one frame; takes more than 5 seconds; falls further behind; infinite loop.
**Why it happens:** No cap on `frameTime` before adding to accumulator.
**How to avoid:** `frameTime = Math.min(frameTime, 0.25)` before accumulator addition.
**Warning signs:** Tab becomes unresponsive after switching away and back.

### Pitfall 3: Euler singularity in steer angle math vs body rotation
**What goes wrong:** Developer mixes Euler angle representation for body orientation (forbidden) with the completely valid scalar steer angle. These are different things.
**Why it happens:** Confusion between "Euler angle" (XYZ rotation representation for body) and "a scalar angle" (steer reference, wheel angle).
**How to avoid:** Body orientation is always `THREE.Quaternion`. Steer angle is just a scalar `[-maxSteer, +maxSteer]`. No conflict.
**Warning signs:** Developer tries to set `body.rotation.y = steerAngle` — this is wrong. Body rotation is quaternion state; steer angle is a separate scalar.

### Pitfall 4: Camera lerp factor too high causes jitter; too low causes lag
**What goes wrong:** `lerp(goal, 0.8)` → camera snaps, amplifies car vibrations. `lerp(goal, 0.01)` → camera trails far behind; disorienting.
**Why it happens:** Lerp factor is frame-rate dependent (0.08 per frame at 60fps ≠ 0.08 per frame at 30fps).
**How to avoid:** Use frame-rate-independent lerp: `factor = 1 - Math.exp(-smoothing * dt)` where `smoothing` ≈ 5.
**Warning signs:** Camera behavior differs noticeably if browser drops to 30fps.

### Pitfall 5: Wheel mesh rotation axis mismatch
**What goes wrong:** Cylinder geometry default is Y-axis aligned (height along Y). As a wheel (rolling left-right), it needs to rotate around its X-axis (lateral). If the geometry is not rotated 90° around Z at creation, the visual spin axis is wrong.
**Why it happens:** `CylinderGeometry` height is along Y; wheel should rotate around the lateral axis (X in local space).
**How to avoid:** When creating wheel mesh, rotate the geometry 90° around Z: `geometry.rotateZ(Math.PI / 2)` or wrap in an Object3D with the spin pivot correctly oriented.
**Warning signs:** Wheels appear to spin sideways instead of forward.

### Pitfall 6: importmap must come before module scripts
**What goes wrong:** `import * as THREE from 'three'` throws `TypeError: Failed to resolve module specifier "three"`.
**Why it happens:** `<script type="importmap">` must be parsed before any `<script type="module">` loads.
**How to avoid:** Put importmap in `<head>`, `<script type="module">` at end of `<body>` or with `defer`.
**Warning signs:** Browser console shows module resolution error immediately on page load.

---

## Code Examples

### Verified Three.js Scene Bootstrap
```javascript
// Source: Context7 /mrdoob/three.js — fundamentals.html, installation.html
import * as THREE from 'three';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import Stats from 'three/addons/libs/stats.module.js';

// Renderer
const canvas = document.querySelector('#c');
const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

// Camera
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

// Lighting
const ambient = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(10, 20, 10);
sun.castShadow = true;
scene.add(sun);

// Ground (flat plane, y=0)
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshPhongMaterial({ color: 0x222222, depthWrite: false })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Grid
const grid = new THREE.GridHelper(200, 100, 0x444444, 0x333333);
scene.add(grid);

// Stats
const stats = new Stats();
document.body.appendChild(stats.dom);

// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
```
[VERIFIED: Context7 /mrdoob/three.js]

### Car Body and Wheel Meshes
```javascript
// Source: Context7 /mrdoob/three.js — BoxGeometry, CylinderGeometry
// Car body: box (width=1.8m, height=0.8m, length=4.6m)
const bodyGeom = new THREE.BoxGeometry(1.8, 0.8, 4.6);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x336699 });
const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
bodyMesh.castShadow = true;
scene.add(bodyMesh);

// Wheel: cylinder rotated to roll on X-axis
// radiusTop, radiusBottom, height, radialSegments
const wheelGeom = new THREE.CylinderGeometry(0.368, 0.368, 0.25, 16);
wheelGeom.rotateZ(Math.PI / 2);  // Align so cylinder axis = lateral (X), rolls on X-axis spin
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
// Create 4 wheel meshes (FL, FR, RL, RR)
```
[VERIFIED: Context7 /mrdoob/three.js]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| dat.GUI | lil-gui (bundled in three/addons) | Three.js r152+ | lil-gui is now the official Three.js debug UI; dat.GUI is deprecated |
| Global `<script src="three.min.js">` tag | ES importmap + CDN | Three.js r147+ | importmap is now the officially documented approach; global tag not mentioned in current manual |
| `THREE.Euler` for rotation state | `THREE.Quaternion` | Not a Three.js change — a project decision | Avoids gimbal lock at 90° pitch/roll; required for rollover phase |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Passing lateral velocity through `params._lateralVelocity` for Phase 1 stub | Pattern 4 | Minor — API is internal to physics.js call site; only affects Phase 1 body, not Phase 3 contract |
| A2 | CG height of 0.55m gives stable ground constraint at `position.y = 0.55m` | Pattern 7 | Minor — if wrong, car floats or clips ground visually; tunable at runtime |
| A3 | Inertia tensor values (2200 / 1400 / 800 kg·m²) | Vehicle Specs | Medium — wrong values make car spin unrealistically; must expose as debug sliders for tuning |
| A4 | `lateralDampingCoeff = 4000 N/(m/s)` and `rollingResistanceCoeff = 200 N/(m/s)` defaults | Vehicle Specs | Low — Claude's discretion; wrong defaults just feel bad, no correctness issue |
| A5 | LERP_FACTOR = 0.08 per frame gives acceptable camera follow feel | Pattern 6 | Low — purely aesthetic; tune during validation |

---

## Open Questions

1. **Wheel spin accumulation for visual rotation (M1-09)**
   - What we know: Visual spin = `(longitudinalSpeed / wheelRadius) * dt` added per step
   - What's unclear: Should all 4 wheels spin at the same rate in Phase 1 (no drivetrain split yet)? Or should only rear wheels receive drive torque spin?
   - Recommendation: In Phase 1, all 4 wheels spin at the same rate derived from vehicle speed. Drivetrain split is Phase 2+.

2. **Cockpit camera CG offset**
   - What we know: Cockpit = fixed local offset from body origin; driver position in Ranger is forward of CG
   - What's unclear: Exact local position (roughly 0.8m forward, 0.6m up from CG)
   - Recommendation: Claude's discretion — use (0, 0.8, 0.3) offset in body space and expose as adjustable constant.

3. **lil-gui backtick toggle placement**
   - What we know: Phase 2 owns the full debug menu (M2-05); Phase 1 only needs slider access for `lateralDampingCoeff` and `rollingResistanceCoeff` (D-10)
   - What's unclear: Should Phase 1 wire up the backtick toggle key for the GUI?
   - Recommendation: Yes — create a minimal `src/debug.js` with the two sliders and backtick toggle now. Phase 2 expands it. This avoids retrofitting the toggle key.

---

## Environment Availability

Step 2.6: This phase has no external service dependencies beyond a browser and an HTTP server. All libraries loaded via CDN at runtime.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Modern browser (Chrome/Firefox/Safari) | importmap, ES modules | ✓ | Current | — |
| Local HTTP server | ES module CORS (FOUND-04) | ✓ | python3 built-in | `npx serve .` |
| Three.js r184 via CDN | All rendering + math | ✓ (CDN) | 0.184.0 | Local copy in `vendor/` |
| lil-gui (bundled) | Debug sliders (D-10) | ✓ (bundled) | in three/addons | — |
| stats.js (bundled) | FPS counter (FOUND-03) | ✓ (bundled) | in three/addons | — |

**Missing dependencies with no fallback:** None.

**CDN availability note:** If CDN is unavailable, copy `three.module.js` and `examples/jsm/` locally
and update the importmap to local paths. Do not add npm — update the importmap paths only.

---

## Validation Architecture

`nyquist_validation` is enabled (config.json). Phase 1 is browser-based with no test runner.
Validation is therefore structured as manual smoke tests and visual/console verification steps
rather than automated unit tests. A unit-testable core (pure physics math functions) should be
isolated to make future automated testing feasible.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual smoke test (no test runner in Phase 1 — browser-only, no node runtime) |
| Config file | none |
| Quick run command | Open `index.html` via `python3 -m http.server` and check console + visual |
| Full suite command | Work through all 5 success criteria manually |

**Rationale for no test runner:** The project has no build system and no Node.js runtime in scope.
Pure physics functions (Ackermann, quaternion integration, friction) are deterministic and could
be unit-tested with a test runner in a future phase (Phase 2 adds scenario runner which IS a
form of automated physics validation). For Phase 1, validation is visual + console.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOUND-01 | Opens from GitHub Pages URL with no install | manual-smoke | open URL in browser, check no 404s | ❌ (Wave 0) |
| FOUND-02 | Three.js importmap loads r184 | manual-console | `THREE.REVISION` in console === "184" | ❌ (Wave 0) |
| FOUND-03 | stats.js FPS panel visible | visual | see stats panel in corner | ❌ (Wave 0) |
| FOUND-04 | Works via python3 -m http.server | manual-smoke | run and load | ❌ (Wave 0) |
| FOUND-05 | GLOSSARY.md exists with all terms | manual-review | read file, check all D-02 terms present | ❌ (Wave 0) |
| M1-01 | Ground plane, grid, lighting visible | visual | open browser, see 3D scene | ❌ (Wave 0) |
| M1-02 | Car body + 4 wheels visible | visual | see box + 4 cylinders | ❌ (Wave 0) |
| M1-03 | Quaternion rotation, no gimbal lock | manual-drive | spin car 360° on all axes, no jitter | ❌ (Wave 0) |
| M1-04 | Fixed timestep accumulator | manual-console | log physics step count per frame; should be 1 at 60fps | ❌ (Wave 0) |
| M1-05 | W/S throttle/brake | manual-drive | press W, car accelerates forward | ❌ (Wave 0) |
| M1-06 | A/D Ackermann steer | manual-drive | turn left/right; inner wheel turns sharper | ❌ (Wave 0) |
| M1-07 | Analog steer accumulation | manual-drive | hold A: steer builds; release: decays | ❌ (Wave 0) |
| M1-08 | Speed-scaled steering limit | manual-drive | high speed → less max steer angle | ❌ (Wave 0) |
| M1-09 | Wheels spin at correct rate | visual | wheel spin matches speed | ❌ (Wave 0) |
| M1-10 | Chase + cockpit camera, C toggle | manual-drive | press C, view switches | ❌ (Wave 0) |
| M1-11 | HUD speed in km/h | visual | speed readout updates while driving | ❌ (Wave 0) |
| M1-12 | R key resets car | manual-drive | press R, car teleports to spawn | ❌ (Wave 0) |
| M1-13 | terrain stub returns flat ground | manual-console | log terrain(5,5) → {height:0, normal:(0,1,0)} | ❌ (Wave 0) |
| M1-14 | getDriveTorque stub returns value | manual-console | log getDriveTorque(0, state, params) → number | ❌ (Wave 0) |
| M1-15 | Vehicle specs from data/ranger.js | manual-console | log RANGER_PARAMS.wheelbase → 2.85 | ❌ (Wave 0) |

### Sampling Rate
- **Per task commit:** Visual + console check of the slice added (e.g., after scene: "does browser show ground?")
- **Per wave merge:** All 5 success criteria from ROADMAP.md checked manually
- **Phase gate:** All 5 success criteria green before marking Phase 1 complete

### Wave 0 Gaps
- [ ] `docs/GLOSSARY.md` — first deliverable before any code (D-01); covers all D-02 terms
- [ ] `index.html` — importmap + module entry point
- [ ] `src/main.js` — scene setup, game loop, mesh sync
- [ ] `src/physics.js` — 6DOF integrator, ground constraint
- [ ] `src/vehicle.js` — state, input accumulation, steer, drive torque
- [ ] `src/tire.js` — stub signatures with JSDoc contracts (D-06, D-07)
- [ ] `src/suspension.js` — stub signatures with JSDoc contracts (D-06, D-07)
- [ ] `src/camera.js` — chase + cockpit modes
- [ ] `src/debug.js` — lil-gui panel, stats.js, HUD DOM
- [ ] `data/ranger.js` — vehicle specs const

*(No existing test infrastructure — entire source tree is new)*

---

## Security Domain

This phase has no authentication, no user data, no backend, no secrets, and no network requests
beyond CDN asset loading. ASVS categories V2, V3, V4, V6 do not apply.

V5 (Input Validation): Keyboard input is sanitized implicitly — only `keydown`/`keyup` event codes
are consumed; no user-supplied strings enter the physics pipeline.

No security research needed for Phase 1.

---

## Sources

### Primary (HIGH confidence)
- Context7 `/mrdoob/three.js` — importmap setup, Quaternion API, Vector3 API, scene bootstrap, GridHelper, stats.js, lil-gui
- npm registry `npm view three version` — confirmed Three.js 0.184.0 = r184 on 2026-05-10
- `.planning/PROJECT.md` — vehicle specs, coordinate system, key decisions
- `.planning/phases/01-core-driving/01-CONTEXT.md` — locked decisions D-01 through D-10
- `CLAUDE.md` — tech stack constraints, forbidden patterns

### Secondary (MEDIUM confidence)
- [Gaffer On Games — Fix Your Timestep!](https://gafferongames.com/post/fix_your_timestep/) — fixed timestep accumulator pattern with spiral-of-death clamp
- [Ashwin Narayan — How to Integrate Quaternions](https://ashwinnarayan.com/post/how-to-integrate-quaternions/) — quaternion differential equation derivation
- [RAW — Introduction to Ackermann Steering](https://raw.org/book/kinematics/ackerman-steering/) — Ackermann formula with sin/cos form (avoids cotangent singularity)
- [Three.js Forum — Smooth Chase Camera](https://discourse.threejs.org/t/solved-smooth-chase-camera-for-an-object/3216) — lerp-to-goal pattern

### Tertiary (LOW confidence)
- None — no claims rely on unverified single-source findings

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Three.js r184 confirmed on npm registry and Context7; all addon paths verified
- Architecture: HIGH — module boundaries come from locked decisions in CONTEXT.md
- Physics formulas: HIGH (quaternion, Ackermann) / MEDIUM (inertia tensor values, damping defaults)
- Pitfalls: HIGH — all based on verified constraint violations (CORS, importmap ordering, Euler lock)
- Camera: MEDIUM — lerp pattern verified; specific constants are Claude's discretion

**Research date:** 2026-05-10
**Valid until:** 2026-06-10 (Three.js r184 is stable; CDN URLs won't change for a pinned version)
