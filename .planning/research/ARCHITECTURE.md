# Architecture Patterns

**Domain:** Browser-based 6DOF car physics simulation
**Project:** RangerSim
**Researched:** 2026-05-10
**Confidence:** HIGH — prototype source fully read, patterns derived from working code plus established vehicle dynamics literature

---

## Recommended Architecture

### Module Map

```
index.html
  └── src/main.js              ← entry point: RAF loop, input, camera, scene, scenario runner
        ├── src/vehicle.js     ← vehicle assembly: 4 wheels, body, drivetrain, integrates all sub-modules
        │     ├── src/tire.js       ← Pacejka Magic Formula, slip angle, friction circle (pure function, no state)
        │     └── src/suspension.js ← spring-damper, wheel mass integration, ground contact (per-wheel state)
        └── src/physics.js     ← 6DOF rigid body: quaternion state, angular momentum, Newton-Euler integration
```

Data flows in one direction: **input → vehicle → physics state → render**.

No module calls back up the chain. `tire.js` and `suspension.js` have no knowledge of `vehicle.js`. `vehicle.js` has no knowledge of `main.js`.

---

## Physics Pipeline Update Order (Each Fixed Timestep)

This is the canonical order used in real-time vehicle simulators (BeamNG, rFactor, Bullet vehicle raycast). Order matters: each stage consumes output from the previous.

```
1. Input sampling           (keyboard state → steering delta, throttle fraction, brake boolean)
2. Steering geometry        (Ackermann: steering delta → per-wheel steer angle [rad])
3. Suspension forces        (per-wheel: spring + damper → suspension force [N]; wheel vertical integration)
4. Normal force resolution  (ground contact: wheel height vs terrain → normal force [N] per wheel)
5. Tire forces              (per-wheel: normal force + slip angle → Fx, Fy [N] via Pacejka; friction circle)
6. Body force/torque sum    (accumulate all Fx, Fz, Mz from 4 tires + drag into net body forces)
7. Rigid body integration   (Newton-Euler: net force + torque → velocity, angular velocity; quaternion update)
8. Wheel angular velocity   (drivetrain torque − tire longitudinal force × radius → wheel omega [rad/s])
9. State clamp / constraints (ground penetration correction; wheel lift-off zero-ing)
```

**Why this order:**
- Suspension forces must be computed before tire forces because normal force = f(spring compression) feeds directly into Pacejka D-factor (peak force scales linearly with normal load).
- Integration happens last — all forces for the current frame must be fully accumulated before advancing state.
- Wheel angular velocity integrates separately from body — it has its own inertia and is driven by drivetrain torque minus the reaction torque from longitudinal tire force.

---

## Component Boundaries

| Module | Responsibility | Inputs | Outputs | State |
|--------|---------------|--------|---------|-------|
| `tire.js` | Pacejka lateral + longitudinal force; friction circle coupling | slip angle [rad], normal force [N], tire params | `{ Fx, Fy }` [N] in wheel frame | **None** — pure functions only |
| `suspension.js` | Spring-damper force; wheel vertical integration; ground contact | body corner world position + velocity, wheel center height + velocity, terrain height | `{ suspForce [N], normalForce [N], wheelY, wheelVy }` | wheel height `wheelY[4]`, wheel vertical velocity `wheelVy[4]` |
| `physics.js` | 6DOF rigid body: quaternion orientation, linear + angular momentum integration | net force [N×3], net torque [N·m×3], mass, inertia tensor | updated `RigidBodyState` | position, velocity, quaternion, angular momentum |
| `vehicle.js` | Assembly: per-wheel suspension + tire, drivetrain, Ackermann geometry, force accumulation | `RigidBodyState`, terrain query function, input state | net force + torque for physics.js; debug data for HUD | wheel angular velocities [4], steering angle, drivetrain state |
| `main.js` | RAF loop, accumulator, input capture, scene graph update, camera, HUD, scenario runner | keyboard events, physics state after step | Three.js mesh transforms | accumulator, camera state, input keys map |

---

## 6DOF Rigid Body State

The complete minimal state for a quaternion-based 6DOF rigid body. Everything else is derived.

```javascript
// physics.js — RigidBodyState
const state = {
  // Position (world space, Three.js Y-up)
  position: new THREE.Vector3(0, 0, 0),  // meters

  // Linear momentum  p = m * v  (world space)
  // Store momentum, not velocity — cleaner integration, no mass division in loop
  linearMomentum: new THREE.Vector3(0, 0, 0),  // kg·m/s

  // Orientation quaternion (world space)
  // Initialized to identity: { x:0, y:0, z:0, w:1 }
  quaternion: new THREE.Quaternion(),

  // Angular momentum  L = I_world * omega  (world space)
  angularMomentum: new THREE.Vector3(0, 0, 0),  // kg·m²/s
};

// Derived each step (not stored):
//   velocity       = linearMomentum / mass
//   angularVelocity = I_world_inverse * angularMomentum
//   I_world        = R * I_body * R^T   (rotate body-space inertia tensor to world)
```

**Why linear momentum over velocity:** When mass changes (not needed here but architecture supports it) or when forces accumulate, momentum is the conserved quantity. Either works for fixed mass, but momentum is the physically principled choice.

**Why quaternion over Euler:** The prototype failed at 90° roll/pitch due to Euler gimbal lock. Quaternions have no singularity. Three.js Quaternion is available and efficient.

**Inertia tensor (body frame, diagonal for symmetric vehicle):**
```javascript
// vehicle.js — VehicleSpec
const inertia = {
  Ixx: 700,   // kg·m²  roll axis  (lateral — small: short width)
  Iyy: 2500,  // kg·m²  yaw axis   (vertical — large: long wheelbase)
  Izz: 2500,  // kg·m²  pitch axis  (longitudinal — large: long body)
};
// Off-diagonal terms (Ixy, Ixz, Iyz) = 0 for a symmetric vehicle.
// This is a valid simplification for a pickup truck.
```

---

## Quaternion Integration Pattern

Standard semi-implicit Euler for quaternion-based 6DOF. This is what Bullet, ODE, and custom game physics engines use.

```javascript
// physics.js — integrationStep(state, netForce, netTorque, dt)

// 1. Linear integration
state.linearMomentum.addScaledVector(netForce, dt);
const velocity = state.linearMomentum.clone().divideScalar(mass);
state.position.addScaledVector(velocity, dt);

// 2. Compute world-space inertia tensor inverse
//    I_world_inv = R * I_body_inv * R^T
const R = new THREE.Matrix3().setFromMatrix4(
  new THREE.Matrix4().makeRotationFromQuaternion(state.quaternion)
);
// For diagonal I_body: I_body_inv is just { 1/Ixx, 1/Iyy, 1/Izz }
// Apply: I_world_inv = R * diag(inv) * R^T  (matrix triple product)

// 3. Angular velocity from momentum
//    omega = I_world_inv * L
const omega = applyInvInertia(state.angularMomentum, state.quaternion, inertiaBodyInv);

// 4. Angular momentum integration
state.angularMomentum.addScaledVector(netTorque, dt);

// 5. Quaternion integration
//    q_dot = 0.5 * [0, omega] * q
const omegaQuat = new THREE.Quaternion(omega.x * 0.5, omega.y * 0.5, omega.z * 0.5, 0);
omegaQuat.multiply(state.quaternion);
state.quaternion.x += omegaQuat.x * dt;
state.quaternion.y += omegaQuat.y * dt;
state.quaternion.z += omegaQuat.z * dt;
state.quaternion.w += omegaQuat.w * dt;
state.quaternion.normalize();  // re-normalize every step to prevent drift
```

**Normalization is mandatory.** Floating point drift will cause the quaternion to leave the unit sphere within hundreds of steps without it.

---

## Tire Module Interface (tire.js)

`tire.js` exports pure functions only. No constructor, no class, no state.

```javascript
// tire.js

// COORDINATE CONVENTION:
//   All inputs and outputs are in WHEEL FRAME.
//   +X = right of wheel direction, +Z = wheel rolling direction (forward)
//   Slip angle alpha is positive when velocity points right of wheel heading.

/**
 * Pacejka Magic Formula lateral force.
 * @param {number} alpha    Slip angle [rad] — positive = velocity right of wheel heading
 * @param {number} Fz       Normal (vertical) force on tire [N] — must be >= 0
 * @param {TireParams} p    { B, C, E, peakMu }
 * @returns {number}        Lateral force [N] — positive = pushes LEFT (toward wheel heading)
 */
export function lateralForce(alpha, Fz, p) {
  const D = p.peakMu * Fz;
  const x = p.B * alpha;
  return -D * Math.sin(p.C * Math.atan(x - p.E * (x - Math.atan(x))));
}

/**
 * Pacejka longitudinal force (simplified — slip ratio κ).
 * Same formula structure, different params.
 * @param {number} kappa    Longitudinal slip ratio [-1..1] — positive = driven
 * @param {number} Fz       Normal force [N]
 * @param {TireParams} p    { B, C, E, peakMu }
 * @returns {number}        Longitudinal force [N]
 */
export function longitudinalForce(kappa, Fz, p) {
  const D = p.peakMu * Fz;
  const x = p.B * kappa;
  return D * Math.sin(p.C * Math.atan(x - p.E * (x - Math.atan(x))));
}

/**
 * Friction circle coupling: given lateral and longitudinal demand,
 * scale both to stay within the total friction budget.
 * @param {number} Fy_raw   Raw lateral force [N]
 * @param {number} Fx_raw   Raw longitudinal force [N]
 * @param {number} Fz       Normal force [N]
 * @param {number} peakMu   Peak friction coefficient
 * @returns {{ Fx, Fy }}    Combined forces [N]
 */
export function frictionCircle(Fy_raw, Fx_raw, Fz, peakMu) { ... }

/**
 * Compute slip angle from contact-patch velocity in world frame.
 * @param {THREE.Vector3} contactVelocity  Velocity of contact patch (world frame)
 * @param {THREE.Vector3} wheelForward     Wheel heading unit vector (world frame)
 * @returns {number}  Slip angle [rad]
 */
export function slipAngle(contactVelocity, wheelForward) {
  // Project velocity into wheel frame
  // alpha = atan2(lateral_component, |longitudinal_component|)
}
```

**TireParams type:**
```javascript
// Each wheel gets its own TireParams — front vs rear can differ.
// Stored in vehicle data file.
const TireParams = {
  B: 10.0,       // Stiffness factor — controls initial slope
  C: 1.5,        // Shape factor — < 2.0 prevents zero-crossing
  E: 0.5,        // Curvature factor — controls post-peak falloff
  peakMu: 0.9,   // Peak friction coefficient
};
```

---

## Suspension Module Interface (suspension.js)

`suspension.js` manages per-wheel vertical state. It does NOT know about the body's horizontal dynamics.

```javascript
// suspension.js

// State (one entry per wheel, FL=0, FR=1, RL=2, RR=3):
const WheelVerticalState = {
  y: 0,   // wheel center height in world [m]
  vy: 0,  // wheel center vertical velocity [m/s]
};

/**
 * Compute spring-damper forces and integrate wheel vertical state.
 *
 * @param {WheelVerticalState} ws       Current wheel state (mutated in place)
 * @param {number} cornerY              Body corner height in world [m]
 * @param {number} cornerVy             Body corner vertical velocity [m/s]
 * @param {number} terrainHeight        Ground height at wheel contact [m] (= 0 for flat)
 * @param {SuspensionParams} p          { springK, damperC, restLength, wheelRadius, wheelMass }
 * @param {number} dt                   Timestep [s]
 * @returns {{ suspForce, normalForce }}
 *   suspForce:   Spring+damper force [N], positive = pushes body up / wheel down
 *   normalForce: Ground reaction [N], 0 if wheel is airborne
 */
export function suspensionStep(ws, cornerY, cornerVy, terrainHeight, p, dt) { ... }

/**
 * Compute body corner world position and velocity from rigid body state.
 * Corner offset is given in body-local coordinates; state provides quaternion.
 *
 * @param {RigidBodyState} bodyState
 * @param {THREE.Vector3}  localOffset  Corner position in body frame [m]
 * @returns {{ worldPos: THREE.Vector3, worldVel: THREE.Vector3 }}
 */
export function cornerWorldState(bodyState, localOffset, bodyAngularVelocity) { ... }
```

---

## Vehicle Module Interface (vehicle.js)

`vehicle.js` is the assembly layer. It holds per-wheel state (suspension, wheel angular velocity), orchestrates the per-frame computation, and hands net force/torque to `physics.js`.

```javascript
// vehicle.js

// VehicleSpec — loaded from a JSON data file (e.g., ranger.json)
const VehicleSpec = {
  mass: 1360,          // kg (total, including wheels)
  inertia: { Ixx, Iyy, Izz },  // kg·m²
  wheelbase: 2.85,     // m
  cgToFront: 1.57,     // m (55% front bias → 0.55 * 2.85)
  cgToRear:  1.28,     // m
  cgHeight:  0.55,     // m
  trackFront: 0.73,    // m (half-track)
  trackRear:  0.73,    // m
  wheelRadius: 0.368,  // m
  wheelMass: 30,       // kg per wheel
  wheelInertia: 1.2,   // kg·m² per wheel (for angular velocity integration)
  drivetrain: 'RWD',
  suspension: {
    springK: 21000,    // N/m
    damperC: 1000,     // N·s/m
    restLength: 0.3,   // m
  },
  tire: {
    front: { B: 10, C: 1.5, E: 0.5, peakMu: 0.9 },
    rear:  { B: 10, C: 1.5, E: 0.5, peakMu: 0.9 },
  },
  drag: 1.8,           // N/(m/s)²
  maxSteer: 0.6,       // rad (~34°)
  driveForce: 2984,    // N (peak, from HP * conversion factor)
  brakeForce: 8000,    // N total (split 4 ways)
};

// VehicleState — mutable, lives in vehicle.js
const VehicleState = {
  steeringAngle: 0,         // current steering angle [rad]
  wheelOmega: [0,0,0,0],    // angular velocity [rad/s] per wheel (FL,FR,RL,RR)
  suspension: [             // WheelVerticalState per wheel
    { y, vy }, { y, vy }, { y, vy }, { y, vy }
  ],
};

/**
 * Run one physics sub-step for the vehicle.
 * Called by main.js inside the fixed-timestep accumulator loop.
 *
 * @param {VehicleState}    vs          Vehicle mutable state (mutated in place)
 * @param {RigidBodyState}  bodyState   Current body state (read-only here)
 * @param {InputState}      input       { throttle, brake, steerLeft, steerRight }
 * @param {TerrainQuery}    terrain     Function: (x, z) => { height, normal: THREE.Vector3 }
 * @param {VehicleSpec}     spec        Static vehicle parameters
 * @param {number}          dt          Timestep [s]
 * @returns {{ netForce: THREE.Vector3, netTorque: THREE.Vector3, debugData: object }}
 */
export function vehicleStep(vs, bodyState, input, terrain, spec, dt) { ... }
```

---

## Fixed Timestep Accumulator (main.js)

Standard game-loop accumulator pattern. Ensures physics determinism regardless of frame rate.

```javascript
// main.js

const DT = 1 / 60;        // fixed physics timestep [s]
const MAX_ACCUMULATE = 0.1; // cap: skip steps if tab was backgrounded

let accumulator = 0;
let lastTime = performance.now();

function animate(nowMs) {
  requestAnimationFrame(animate);

  const now = nowMs / 1000;    // convert to seconds
  const elapsed = now - lastTime;
  lastTime = now;

  // Cap elapsed to prevent death spiral when tab was hidden
  accumulator += Math.min(elapsed, MAX_ACCUMULATE);

  // Physics sub-steps
  while (accumulator >= DT) {
    const { netForce, netTorque } = vehicleStep(
      vehicleState, bodyState, inputState, queryTerrain, spec, DT
    );
    integrateBody(bodyState, netForce, netTorque, spec, DT);
    accumulator -= DT;
  }

  // Render at display frame rate (not locked to physics rate)
  updateSceneGraph(bodyState, vehicleState);
  renderer.render(scene, camera);
}

requestAnimationFrame(animate);
```

**Key properties of this pattern:**
- Physics always advances by exactly DT — deterministic for scenario replays
- Render interpolation (alpha = accumulator / DT) is optional but improves visual smoothness at >60fps displays; defer until needed
- MAX_ACCUMULATE prevents spiral-of-death: if a frame takes 500ms, physics only steps 6 times not 30

---

## Scenario / Log System Interface

The scenario system needs to be able to drive the simulation headlessly (no render) and emit state snapshots.

```javascript
// main.js — scenario runner mode

// Scenario file format (input):
{
  "dt": 0.01667,             // must match DT or be an integer multiple
  "duration": 10.0,          // seconds
  "initialState": {          // initial body + vehicle state override
    "position": [0, 0.9, 0],
    "velocity": [0, 0, 0],
    "heading": 0
  },
  "inputs": [                // time-ordered input events
    { "t": 0.0,  "throttle": 1.0, "steer": 0.0 },
    { "t": 2.0,  "throttle": 0.0, "steer": 0.3 },
    { "t": 5.0,  "brake": true }
  ]
}

// Log file format (output) — one entry per physics step:
{
  "dt": 0.01667,
  "frames": [
    {
      "t": 0.0,
      "pos": [x, y, z],
      "vel": [vx, vy, vz],
      "quat": [x, y, z, w],
      "angVel": [wx, wy, wz],
      "wheelOmega": [fl, fr, rl, rr],
      "suspForce": [fl, fr, rl, rr],
      "normalForce": [fl, fr, rl, rr],
      "slipAngle": [fl, fr, rl, rr],
      "steer": delta
    }
    // ...one per step
  ]
}
```

The step function is the same function used in the live loop — no special path. The scenario runner calls `vehicleStep()` and `integrateBody()` directly, bypassing RAF, and buffers log entries.

---

## Pacejka Magic Formula — Implementation Notes

The Magic Formula (lateral):

```
Fy = -D * sin(C * atan(B*alpha - E*(B*alpha - atan(B*alpha))))
```

**Inputs to the formula:**
- `alpha` — slip angle [rad], computed from contact-patch velocity in wheel frame
- `Fz` — normal force [N], from suspension this step (NOT from static weight)
- `D = peakMu * Fz` — peak force, scales linearly with normal load (correct tire behavior)

**Critical: normal force must be recomputed every step.** The prototype's prior bug was using a fixed `N_PER_WHEEL = W_TOTAL / 4` — this ignores load transfer during braking/cornering and produces unrealistic behavior at the limit. Dynamic Fz from the spring-damper is the fix.

**Longitudinal slip ratio:**
```
kappa = (wheelRadius * wheelOmega - vLongitudinal) / max(|vLongitudinal|, epsilon)
```
Where `epsilon` (e.g. 0.1 m/s) prevents division by zero at rest.

**The friction circle constraint** must be applied in tire.js after computing both Fx and Fy:
```
FxFy_magnitude = sqrt(Fx^2 + Fy^2)
limit = peakMu * Fz
if (FxFy_magnitude > limit) {
  scale = limit / FxFy_magnitude
  Fx *= scale
  Fy *= scale
}
```
This is the vector-normalized version (more correct than the sequential approach in the prototype).

---

## Surface Normal Support (Future Terrain)

Architecture must support terrain from day one. The `suspension.js` interface accepts a `terrainHeight` scalar and a `terrainNormal` vector per wheel contact point.

For now, terrain is flat: `height = 0`, `normal = (0, 1, 0)`.

When terrain is added:
1. `main.js` passes a `queryTerrain(x, z) => { height, normal }` function to `vehicleStep`.
2. `vehicle.js` queries terrain at each of the 4 wheel contact positions before calling `suspensionStep`.
3. `suspension.js` uses `terrainNormal` to decompose spring force along the normal (not just Y-axis).
4. `tire.js` gets slip angle computed in the plane of the terrain normal — not the world XZ plane.

No terrain-specific code enters tire.js or suspension.js in flat-ground mode. The function signatures already carry the normal — it just points up.

---

## Build Order (What Depends on What)

```
tire.js        — no imports (pure math)
suspension.js  — imports nothing from project (uses THREE.Vector3 only)
physics.js     — imports nothing from project (uses THREE.Quaternion, THREE.Vector3)
vehicle.js     — imports tire.js, suspension.js, physics.js (for types/helpers)
main.js        — imports vehicle.js, physics.js; pulls in Three.js
```

**Build sequence for greenfield:**
1. `tire.js` — implement Pacejka functions, validate with unit assertions (console.assert)
2. `suspension.js` — implement spring-damper, validate drop test (wheel settles to rest)
3. `physics.js` — implement quaternion integrator, validate conservation with no forces
4. `vehicle.js` — assemble: wire suspension → normal force → tire → force accumulation
5. `main.js` — RAF loop, scene graph, input, camera

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Euler Angles for Orientation
**What:** Using `theta`, `pitch`, `roll` scalars for body orientation.
**Why bad:** Gimbal lock at 90° — the documented prototype failure mode.
**Instead:** Store orientation as `THREE.Quaternion`. Derive named directional vectors (`forward`, `right`, `up`) from the quaternion when needed.

```javascript
// From quaternion — compute forward/right/up unit vectors
const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(state.quaternion);
const right   = new THREE.Vector3(1, 0,  0).applyQuaternion(state.quaternion);
const up      = new THREE.Vector3(0, 1,  0).applyQuaternion(state.quaternion);
```

### Anti-Pattern 2: Fixed Normal Force
**What:** Using `mass * gravity / 4` per wheel as a constant tire load.
**Why bad:** Eliminates load transfer — car doesn't pitch under braking or roll in corners. Tire limit behavior becomes unrealistic.
**Instead:** Compute `Fz` from suspension spring force each step.

### Anti-Pattern 3: Wheels as Scene-Level Objects
**What:** Attaching wheel meshes to `scene` rather than to the body group, then computing their world transforms independently.
**Why bad:** Visual drift from physics positions; position computation duplicated between physics and render.
**Instead:** Wheels are child groups of the body. Their local position in the body frame is their suspension travel offset (Y-axis only, in body space). Rotation is applied per-wheel.

### Anti-Pattern 4: Global Physics Variables
**What:** `let vx = 0`, `let omega = 0` etc. scattered at module scope.
**Why bad:** LLM sessions cannot find state; resets on reload; impossible to serialize for scenario system.
**Instead:** All mutable state lives in explicit state objects (`RigidBodyState`, `VehicleState`). Pass them as function arguments or access through a single named export.

### Anti-Pattern 5: Tick-Rate-Dependent Constants
**What:** `omega *= 0.99` style damping that bakes in the assumption of 60Hz.
**Why bad:** If timestep changes for testing or slow-motion scenarios, behavior changes.
**Instead:** Express as time-continuous: `omega *= Math.exp(-dampingCoeff * dt)`.

### Anti-Pattern 6: Axis Literals in Physics Math
**What:** `force.x`, `force.z` with implicit assumptions about what those axes mean.
**Why bad:** Coordinate system bugs are silent across LLM sessions.
**Instead:** Use named vectors: `force.dot(forward)`, `force.dot(right)`. Document the coordinate frame explicitly in the file header.

---

## Coordinate System Convention (to repeat in every module header)

```
// COORDINATE SYSTEM: Three.js Y-up world space
//   +Y = world up
//   +X = world right
//   -Z = car forward at heading 0 (Three.js default camera faces -Z)
//
// Vehicle body-local axes (derived from orientation quaternion):
//   forward = (0, 0, -1) rotated by body quaternion
//   right   = (1, 0,  0) rotated by body quaternion
//   up      = (0, 1,  0) rotated by body quaternion
//
// Wheel frame:
//   wheelForward = body forward rotated by steer angle around body up
//   wheelRight   = body right rotated by steer angle around body up
//
// Torques: positive = right-hand rule around the respective axis
//   positive Mz (yaw torque) = nose turns LEFT (from above)
//   positive Mx (roll torque) = right side dips
//   positive My (pitch torque) = nose rises
//
// Sign conventions are documented in docs/GLOSSARY.md
```

---

## Sources

- Prototype source: `/references/backup12.html` — direct code analysis (HIGH confidence)
- Project spec: `.planning/PROJECT.md` (HIGH confidence)
- Vehicle physics: Pacejka Magic Formula structure verified from prototype implementation and FSAE developer knowledge
- Quaternion integration: Standard semi-implicit Euler, q_dot = 0.5 * omega_quat * q — canonical formulation used in Bullet, ODE, and custom game engines (HIGH confidence from established literature)
- Accumulator pattern: Directly from prototype `animate()` function + "Fix Your Timestep" (Gaffer on Games, Glenn Fiedler) — the authoritative reference for this pattern
- Load transfer / dynamic Fz: Derived from analysis of prototype's known limitation (static N_PER_WHEEL) — correcting this is the core physics improvement (HIGH confidence)
