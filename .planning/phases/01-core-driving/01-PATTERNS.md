# Phase 1: Core Driving - Pattern Map

**Mapped:** 2026-05-10
**Files analyzed:** 10 new files
**Analogs found:** 0 / 10 (greenfield — no src/ directory exists)

---

## Critical Constraint: Off-Limits Reference

Decision D-03 (CONTEXT.md) explicitly prohibits downstream agents from referencing
`references/backup12.html`, `references/backup11.html`, or `references/backup12alt.html`
during Phase 1 implementation. The prototype used Euler angles for body rotation (gimbal
lock failure mode) and a monolithic coupled architecture. A clean break is required.

**All patterns in this document come from RESEARCH.md verified code examples and
first-principles specifications — NOT from the prototype files.**

---

## File Classification

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `docs/GLOSSARY.md` | documentation | — | none | no analog |
| `index.html` | config/entry | request-response | RESEARCH.md Pattern 1 | spec-only |
| `data/ranger.js` | data/config | — | RESEARCH.md Vehicle Specs | spec-only |
| `src/main.js` | entry/orchestrator | event-driven (rAF) | RESEARCH.md Patterns 2 + scene bootstrap | spec-only |
| `src/physics.js` | service | batch (fixed-step) | RESEARCH.md Patterns 3 + 7 | spec-only |
| `src/vehicle.js` | service/state | request-response | RESEARCH.md Pattern 5 | spec-only |
| `src/tire.js` | utility/stub | transform | RESEARCH.md Pattern 4 | spec-only |
| `src/suspension.js` | utility/stub | transform | RESEARCH.md Pattern 4 (contract model) | spec-only |
| `src/camera.js` | utility | event-driven (rAF) | RESEARCH.md Pattern 6 | spec-only |
| `src/debug.js` | utility/UI | event-driven | RESEARCH.md scene bootstrap (stats + lil-gui) | spec-only |

---

## Pattern Assignments

### `docs/GLOSSARY.md` (documentation)

**Analog:** none — pure documentation, no code pattern needed.

**Content contract (D-02):**
Must define all of the following before any code is written (D-01):
- Coordinate system: Y-up, +X right, +Y up, -Z forward at heading 0
- Named vectors: forward `(0,0,-1)`, right `(1,0,0)`, up `(0,1,0)` in body space
- Slip angle sign convention
- Torque sign convention
- Quaternion integration convention (world-frame angular velocity, left-multiply `dq * q`)
- Term definitions: slip angle, contact patch velocity, Ackermann geometry

Deferred to Phase 3/4: Pacejka terms, suspension terms.

**Ordering constraint:** This file is deliverable #1. No `src/*.js` file may be written until GLOSSARY.md exists.

---

### `index.html` (config/entry, request-response)

**Source pattern:** RESEARCH.md §Pattern 1: Three.js importmap CDN Setup (lines 195-213)

**HTML skeleton pattern:**
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>RangerSim</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #111; overflow: hidden; }
    canvas { display: block; }
    #hud {
      position: fixed; top: 20px; left: 20px;
      color: #00ff88; font-size: 14px;
      pointer-events: none;
    }
  </style>
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
  <div id="hud">
    <span>SPEED: <b id="speedVal">0.0</b> km/h</span>
  </div>
  <script type="module" src="src/main.js"></script>
</body>
</html>
```

**Critical ordering rule:** `<script type="importmap">` MUST appear in `<head>` before any
`<script type="module">`. Violation causes `TypeError: Failed to resolve module specifier "three"`.
(RESEARCH.md Pitfall 6)

**What NOT to do:**
- No `<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js">` global tag
- No `type="module"` before the importmap block
- No `THREE` global variable references anywhere in the project

---

### `data/ranger.js` (data/config)

**Source pattern:** RESEARCH.md §Vehicle Specs (lines 466-503)

**Full spec pattern:**
```javascript
// data/ranger.js
// 2002 Ford Ranger vehicle parameters.
// All geometry values sourced from .planning/PROJECT.md.
// Inertia tensor estimated from box model — expose as debug sliders for tuning.

export const RANGER_PARAMS = {
  // Geometry
  wheelbase:       2.85,     // m — center of front axle to center of rear axle
  trackFront:      1.46,     // m — center-to-center at front axle
  trackRear:       1.46,     // m — center-to-center at rear axle
  cgHeight:        0.55,     // m — center of gravity above ground (estimate, laden)
  wheelRadius:     0.368,    // m — 245/75R16 tire

  // Mass & Inertia
  mass:            1360,     // kg — curb weight (estimate)
  inertiaYaw:      2200,     // kg·m² (Izz — rotation about Y/up axis; turning)
  inertiaPitch:    1400,     // kg·m² (Iyy — rotation about Z/lateral axis; braking)
  inertiaRoll:     800,      // kg·m² (Ixx — rotation about X/longitudinal axis; cornering)

  // Drivetrain (Phase 1 placeholder)
  maxDriveTorque:  250,      // N·m — flat torque for Phase 1 throttle response
  maxBrakeTorque:  3000,     // N·m — flat brake deceleration placeholder

  // Phase 1 friction placeholders (exposed as lil-gui debug sliders per D-10)
  lateralDampingCoeff:    4000,   // N/(m/s) — tune for feel
  rollingResistanceCoeff: 200,    // N/(m/s) — tune for feel

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

**Import pattern for consumers:**
```javascript
import { RANGER_PARAMS } from '../data/ranger.js';
```

---

### `src/main.js` (entry/orchestrator, event-driven rAF)

**Source patterns:**
- RESEARCH.md §Pattern 2: Fixed-Timestep Accumulator Loop (lines 216-253)
- RESEARCH.md §Verified Three.js Scene Bootstrap (lines 552-603)
- RESEARCH.md §Car Body and Wheel Meshes (lines 606-623)

**Imports pattern:**
```javascript
import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import { createVehicle, updateVehicle } from './vehicle.js';
import { stepPhysics } from './physics.js';
import { updateCamera } from './camera.js';
import { initDebug, updateDebug } from './debug.js';
import { RANGER_PARAMS } from '../data/ranger.js';
```

**Scene bootstrap pattern** (RESEARCH.md lines 552-603):
```javascript
const canvas = document.querySelector('canvas');
const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const ambient = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(10, 20, 10);
sun.castShadow = true;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshPhongMaterial({ color: 0x222222, depthWrite: false })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

scene.add(new THREE.GridHelper(200, 100, 0x444444, 0x333333));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
```

**Fixed-timestep game loop pattern** (RESEARCH.md lines 222-251):
```javascript
const FIXED_DT = 1 / 60;
const MAX_FRAME_TIME = 0.25;   // spiral-of-death clamp

let accumulator = 0;
let currentTime = performance.now() / 1000;

function loop() {
  requestAnimationFrame(loop);

  const newTime = performance.now() / 1000;
  let frameTime = newTime - currentTime;
  currentTime = newTime;

  if (frameTime > MAX_FRAME_TIME) frameTime = MAX_FRAME_TIME;

  accumulator += frameTime;

  while (accumulator >= FIXED_DT) {
    updateVehicle(vehicleState, FIXED_DT);   // input accumulation
    stepPhysics(vehicleState, FIXED_DT);     // 6DOF integration
    accumulator -= FIXED_DT;
  }

  syncMeshesToState(vehicleState);           // Three.js mesh positions
  updateCamera(camera, vehicleState, FIXED_DT);
  updateDebug(vehicleState);
  renderer.render(scene, camera);
  stats.update();
}

requestAnimationFrame(loop);
```

**Mesh sync pattern** (RESEARCH.md lines 606-623):
```javascript
// Car body: BoxGeometry (1.8m wide, 0.8m tall, 4.6m long)
const bodyMesh = new THREE.Mesh(
  new THREE.BoxGeometry(1.8, 0.8, 4.6),
  new THREE.MeshStandardMaterial({ color: 0x336699 })
);
bodyMesh.castShadow = true;
scene.add(bodyMesh);

// Wheel: CylinderGeometry — MUST rotateZ to align spin axis to X (lateral)
const wheelGeom = new THREE.CylinderGeometry(0.368, 0.368, 0.25, 16);
wheelGeom.rotateZ(Math.PI / 2);  // cylinder height becomes lateral axis; spins on X
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });

// syncMeshesToState: copy vehicleState into mesh transforms each render frame
function syncMeshesToState(state) {
  bodyMesh.position.copy(state.position);
  bodyMesh.quaternion.copy(state.quaternion);  // NOT .rotation — never set Euler on physics body

  // Visual wheel spin: spin angle accumulated from longitudinal speed
  // wheelMesh.rotation.x += (state.longitudinalSpeed / RANGER_PARAMS.wheelRadius) * FIXED_DT;
}
```

**Key rule:** Use `mesh.quaternion.copy(state.quaternion)` — never `mesh.rotation.y = heading`.

---

### `src/physics.js` (service, batch fixed-step)

**Source patterns:**
- RESEARCH.md §Pattern 3: Quaternion 6DOF Integration (lines 255-289)
- RESEARCH.md §Pattern 7: Ground Contact — y=0 Plane (lines 407-430)

**Imports pattern:**
```javascript
import * as THREE from 'three';
import { computeLateralForce, computeLongitudinalForce } from './tire.js';
import { computeNormalForce, getWheelPosition } from './suspension.js';
```

**Quaternion integration pattern** (RESEARCH.md lines 272-288):
```javascript
function integrateQuaternion(q, angularVelocity, dt) {
  const omega = angularVelocity.clone();  // THREE.Vector3, world space
  const angSpeed = omega.length();

  if (angSpeed < 1e-10) return;           // no rotation this frame

  const axis = omega.clone().normalize();
  const angle = angSpeed * dt;

  const dq = new THREE.Quaternion();
  dq.setFromAxisAngle(axis, angle);

  q.premultiply(dq);  // left-multiply: dq * q (world-frame angular velocity)
  q.normalize();      // prevent drift accumulation — REQUIRED every step
}
```

**Ground constraint pattern** (RESEARCH.md lines 421-430):
```javascript
function applyGroundConstraint(state, params) {
  const minY = params.cgHeight;
  if (state.position.y < minY) {
    state.position.y = minY;
    if (state.velocity.y < 0) state.velocity.y = 0;
  }
}
```

**Force accumulation pattern (6DOF integrator structure):**
```javascript
export function stepPhysics(state, params, dt) {
  // 1. Compute normal forces per wheel (suspension stub)
  // 2. Compute contact patch velocities per wheel (velocity decomposition)
  // 3. Compute lateral + longitudinal forces per wheel (tire stubs)
  // 4. Accumulate world-frame forces and torques
  // 5. Integrate linear velocity: state.velocity.addScaledVector(totalForce, dt / params.mass)
  // 6. Integrate position: state.position.addScaledVector(state.velocity, dt)
  // 7. Integrate angular velocity: state.angularVelocity.addScaledVector(totalTorque, dt / I)
  // 8. Integrate quaternion: integrateQuaternion(state.quaternion, state.angularVelocity, dt)
  // 9. Apply ground constraint
}
```

**State object shape (vehicleState):**
```javascript
// Created in vehicle.js; passed to physics.js each step
{
  position:        new THREE.Vector3(0, 0.55, 0),  // world position of CG
  velocity:        new THREE.Vector3(),              // world-frame linear velocity (m/s)
  quaternion:      new THREE.Quaternion(),           // body orientation (no Euler)
  angularVelocity: new THREE.Vector3(),              // world-frame angular velocity (rad/s)
  steerAngle:      0,                                // scalar [rad], separate from body quat
  throttle:        0,                                // 0..1
  brake:           0,                                // 0..1
  wheelAngles:     [0, 0, 0, 0],                     // visual spin accumulator per wheel [rad]
}
```

---

### `src/vehicle.js` (service/state, request-response)

**Source patterns:**
- RESEARCH.md §Pattern 5: Ackermann Steering Geometry (lines 337-373)
- RESEARCH.md §M1-07: Analog steer accumulation (lines 78-79)
- RESEARCH.md §M1-08: Speed-scaled steering limit (lines 80)
- RESEARCH.md §M1-14: getDriveTorque stub (lines 86)

**Imports pattern:**
```javascript
import * as THREE from 'three';
import { RANGER_PARAMS } from '../data/ranger.js';
```

**Input accumulation pattern (analog steer feel, M1-07):**
```javascript
// steerAngle accumulates at steerRate on hold, decays at steerDecayRate on release
export function updateVehicle(state, params, dt) {
  const leftHeld  = keys['a'] || keys['arrowleft'];
  const rightHeld = keys['d'] || keys['arrowright'];

  const steerDir = (leftHeld ? 1 : 0) - (rightHeld ? 1 : 0);
  const speed = state.velocity.length();

  // Speed-scaled max steer (M1-08)
  const maxSteer = params.maxSteerAngle / (1 + speed / params.speedSteerRef);

  if (steerDir !== 0) {
    state.steerAngle += steerDir * params.steerRate * dt;
  } else {
    // Decay toward zero at steerDecayRate
    const decay = params.steerDecayRate * dt;
    if (Math.abs(state.steerAngle) <= decay) {
      state.steerAngle = 0;
    } else {
      state.steerAngle -= Math.sign(state.steerAngle) * decay;
    }
  }
  state.steerAngle = Math.max(-maxSteer, Math.min(maxSteer, state.steerAngle));

  state.throttle = (keys['w'] || keys['arrowup']) ? 1 : 0;
  state.brake    = (keys['s'] || keys['arrowdown']) ? 1 : 0;
}
```

**Ackermann pattern** (RESEARCH.md lines 353-372):
```javascript
// Source: raw.org/book/kinematics/ackerman-steering/
export function computeAckermannAngles(steerRef, wheelbase, trackWidth) {
  const L = wheelbase;
  const T = trackWidth;
  const phi = steerRef;

  if (Math.abs(phi) < 1e-6) return { leftAngle: 0, rightAngle: 0 };

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const twoL = 2 * L;

  const phiLeft  = Math.atan(twoL * sinPhi / (twoL * cosPhi - T * sinPhi));
  const phiRight = Math.atan(twoL * sinPhi / (twoL * cosPhi + T * sinPhi));

  return { leftAngle: phiLeft, rightAngle: phiRight };
}
```

**getDriveTorque stub pattern (M1-14, signature locked):**
```javascript
/**
 * Return drive torque delivered to a single wheel.
 * Phase 1: flat torque value from throttle input.
 * Phase 2+: drivetrain model replaces this body; call sites unchanged.
 * @param {number} wheelIndex - 0=FL, 1=FR, 2=RL, 3=RR
 * @param {object} vehicleState - current vehicle state
 * @param {object} params - RANGER_PARAMS
 * @returns {number} torque [N·m], positive = forward
 */
export function getDriveTorque(wheelIndex, vehicleState, params) {
  // Phase 1: RWD — rear wheels only; split equally
  if (wheelIndex < 2) return 0;  // no torque to front wheels
  return vehicleState.throttle * params.maxDriveTorque / 2;
}
```

**R key reset pattern (M1-12):**
```javascript
export function resetVehicle(state, spawnState) {
  state.position.copy(spawnState.position);
  state.velocity.set(0, 0, 0);
  state.quaternion.identity();
  state.angularVelocity.set(0, 0, 0);
  state.steerAngle = 0;
  state.throttle = 0;
  state.brake = 0;
  state.wheelAngles.fill(0);
}
```

---

### `src/tire.js` (utility/stub, transform)

**Source pattern:** RESEARCH.md §Pattern 4: Velocity-Damping Friction (lines 296-334)

**This is a stub module. The function SIGNATURES are locked (D-06). The BODIES are Phase 1
velocity-damping placeholders. Phase 3 replaces the bodies without touching call sites.**

**Full stub pattern** (RESEARCH.md lines 313-332):
```javascript
/**
 * Compute lateral (side) force at this wheel's contact patch.
 * @param {number} slipAngle  - [rad] tire slip angle (unused in Phase 1)
 * @param {number} Fz         - [N] normal force on this wheel
 * @param {object} params     - vehicle params; uses params.lateralDampingCoeff [N/(m/s)]
 *                              Phase 1 caller also sets params._lateralVelocity [m/s]
 * @returns {number} Fy [N] lateral force (positive = left, per coordinate system)
 *
 * Phase 3 replacement: Pacejka Magic Formula lateral Fy vs slip angle.
 * Body changes; this signature does not change.
 */
export function computeLateralForce(slipAngle, Fz, params) {
  return -params.lateralDampingCoeff * params._lateralVelocity;
}

/**
 * Compute longitudinal (drive/brake) force at this wheel's contact patch.
 * @param {number} slipRatio  - [-] longitudinal slip ratio (unused in Phase 1)
 * @param {number} Fz         - [N] normal force on this wheel
 * @param {object} params     - vehicle params; uses params.rollingResistanceCoeff [N/(m/s)]
 *                              Phase 1 caller also sets params._longitudinalVelocity [m/s]
 *                              and params._driveForceLongitudinal [N]
 * @returns {number} Fx [N] longitudinal force (positive = forward)
 *
 * Phase 3 replacement: Pacejka Magic Formula longitudinal Fx vs slip ratio.
 * Body changes; this signature does not change.
 */
export function computeLongitudinalForce(slipRatio, Fz, params) {
  const rollingDrag = -params.rollingResistanceCoeff * params._longitudinalVelocity;
  return rollingDrag + params._driveForceLongitudinal;
}
```

**JSDoc contract requirement (D-07):** Every stub function must document input units,
output units, and what the Phase 3/4 implementation will do. The comment IS the contract.

---

### `src/suspension.js` (utility/stub, transform)

**Source pattern:** RESEARCH.md §Pattern 7 (ground constraint) + D-06 signature lock

**This is a stub module. Signatures locked for Phase 4 spring-damper replacement.**

**Full stub pattern:**
```javascript
/**
 * Compute normal force (ground reaction) at a single wheel contact patch.
 * Phase 1: static weight distribution; no spring-damper dynamics.
 * @param {number} corner       - wheel index: 0=FL, 1=FR, 2=RL, 3=RR
 * @param {object} vehicleState - current vehicle state (position, velocity, quaternion)
 * @param {object} params       - RANGER_PARAMS (mass, cgHeight, weightFront, weightRear, etc.)
 * @returns {number} Fz [N] normal force, positive = upward (zero if wheel off ground)
 *
 * Phase 4 replacement: spring-damper per corner; load transfer; terrain surface normal.
 * Body changes; this signature does not change.
 */
export function computeNormalForce(corner, vehicleState, params) {
  const totalWeight = params.mass * 9.81;
  const isFront = corner < 2;
  const axleWeight = isFront
    ? totalWeight * params.weightFront
    : totalWeight * params.weightRear;
  return axleWeight / 2;  // split equally across two wheels on axle
}

/**
 * Get world-space position of a wheel's contact patch.
 * Phase 1: static offset from body position; no suspension travel.
 * @param {number} corner       - wheel index: 0=FL, 1=FR, 2=RL, 3=RR
 * @param {object} vehicleState - current vehicle state
 * @param {object} params       - RANGER_PARAMS
 * @returns {THREE.Vector3} world position of wheel contact patch center
 *
 * Phase 4 replacement: raycasts along suspension travel; terrain height lookup.
 * Body changes; this signature does not change.
 */
export function getWheelPosition(corner, vehicleState, params) {
  // Local offsets (FL, FR, RL, RR)
  const longOffsets = [
    params.wheelbase * params.weightRear,   // FL: forward of CG
    params.wheelbase * params.weightRear,   // FR
    -params.wheelbase * params.weightFront, // RL: aft of CG
    -params.wheelbase * params.weightFront, // RR
  ];
  const latOffsets = [-params.trackFront / 2, params.trackFront / 2,
                      -params.trackRear  / 2, params.trackRear  / 2];

  const localOffset = new THREE.Vector3(latOffsets[corner], -params.cgHeight, longOffsets[corner]);
  localOffset.applyQuaternion(vehicleState.quaternion);
  return vehicleState.position.clone().add(localOffset);
}
```

---

### `src/camera.js` (utility, event-driven rAF)

**Source pattern:** RESEARCH.md §Pattern 6: Spring-Follow Chase Camera (lines 376-406)

**Imports pattern:**
```javascript
import * as THREE from 'three';
```

**Full camera pattern** (RESEARCH.md lines 386-404):
```javascript
const CHASE_OFFSET_LOCAL = new THREE.Vector3(0, 2.5, 6.0);  // behind (+Z) and above (+Y)
const LERP_FACTOR = 0.08;  // tune for feel; use exp smoothing for frame-rate independence

/**
 * Update camera position each render frame (NOT each physics step).
 * @param {THREE.PerspectiveCamera} camera
 * @param {object} vehicleState  - { position: THREE.Vector3, quaternion: THREE.Quaternion }
 * @param {string} mode          - 'chase' | 'cockpit'
 * @param {number} dt            - render frame delta (seconds)
 */
export function updateCamera(camera, vehicleState, mode, dt) {
  const { position: vehiclePos, quaternion: vehicleQuat } = vehicleState;

  if (mode === 'cockpit') {
    const cockpitOffset = new THREE.Vector3(0, 0.8, 0.3);  // body-local driver position
    cockpitOffset.applyQuaternion(vehicleQuat);
    camera.position.copy(vehiclePos).add(cockpitOffset);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(vehicleQuat);
    camera.lookAt(vehiclePos.clone().add(forward.multiplyScalar(10)));
    return;
  }

  // Chase mode
  const goalOffset = CHASE_OFFSET_LOCAL.clone().applyQuaternion(vehicleQuat);
  const goalPos = vehiclePos.clone().add(goalOffset);
  camera.position.lerp(goalPos, LERP_FACTOR);
  camera.lookAt(vehiclePos);
}
```

**Frame-rate independent lerp (RESEARCH.md Pitfall 4):**
```javascript
// Replace constant LERP_FACTOR with:
const factor = 1 - Math.exp(-5 * dt);  // smoothing=5; tune for feel
camera.position.lerp(goalPos, factor);
```

---

### `src/debug.js` (utility/UI, event-driven)

**Source pattern:** RESEARCH.md §Verified Three.js Scene Bootstrap — stats.js and lil-gui
sections (lines 554-556, 594-595)

**Imports pattern:**
```javascript
import * as THREE from 'three';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import Stats from 'three/addons/libs/stats.module.js';
```

**Stats.js init pattern:**
```javascript
const stats = new Stats();
document.body.appendChild(stats.dom);
// Called once per render frame: stats.update();
```

**lil-gui panel pattern (D-10 — two sliders, backtick toggle):**
```javascript
export function initDebug(params) {
  const gui = new GUI();
  gui.hide();  // hidden by default; backtick toggles

  // Phase 1 sliders: lateralDampingCoeff and rollingResistanceCoeff (D-10)
  const friction = gui.addFolder('Friction (Phase 1)');
  friction.add(params, 'lateralDampingCoeff', 500, 10000, 100)
    .name('Lateral Damping (N/m/s)');
  friction.add(params, 'rollingResistanceCoeff', 10, 1000, 10)
    .name('Rolling Resistance (N/m/s)');
  friction.open();

  // Backtick toggle
  window.addEventListener('keydown', e => {
    if (e.key === '`') gui.show(gui._hidden);
  });

  return { gui };
}

export function updateDebug(vehicleState) {
  // Update HUD DOM elements
  const speed = vehicleState.velocity.length() * 3.6;  // m/s → km/h
  document.getElementById('speedVal').textContent = speed.toFixed(1);
}
```

**Note on lil-gui import:** Must import from `three/addons/libs/lil-gui.module.min.js` —
NOT from `dat.GUI` (explicitly forbidden in CLAUDE.md).

---

## Shared Patterns

### Quaternion — No Euler Angles Anywhere
**Apply to:** `src/physics.js`, `src/vehicle.js`, `src/camera.js`, `src/main.js`
**Rule:** Body orientation is always a `THREE.Quaternion`. Never use `mesh.rotation.y`,
`Math.atan2` for heading, or `THREE.Euler` for physics state.

```javascript
// CORRECT: copy quaternion state to mesh
mesh.quaternion.copy(vehicleState.quaternion);

// WRONG (forbidden):
mesh.rotation.y = state.heading;       // Euler angle — gimbal lock risk
mesh.rotation.order = 'YXZ';          // never set this on physics-driven meshes
```

### ES6 Module Exports
**Apply to:** all `src/*.js` and `data/*.js` files

```javascript
// Named exports (preferred — allows tree-shaking in future, clear at import site)
export function stepPhysics(state, params, dt) { ... }
export const RANGER_PARAMS = { ... };

// Import pattern at consumer
import { stepPhysics } from './physics.js';
import { RANGER_PARAMS } from '../data/ranger.js';
```

No default exports. No CommonJS (`require`/`module.exports`). No global variables.

### THREE.Vector3 / THREE.Quaternion for All Physics Math
**Apply to:** `src/physics.js`, `src/vehicle.js`, `src/camera.js`, `src/suspension.js`

```javascript
// Use Three.js math — no hand-rolled vector class
const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(state.quaternion);
const lateralVel = state.velocity.clone().projectOnVector(right);
const totalForce = new THREE.Vector3();
totalForce.addScaledVector(lateralForce, 1.0);
```

### terrain Stub (M1-13)
**Apply to:** `src/physics.js` (ground constraint)

```javascript
// Phase 1: flat ground. Phase 2+ replaces this with heightmap sampling.
// Signature locked.
export function terrain(x, z) {
  return { height: 0, normal: new THREE.Vector3(0, 1, 0) };
}
```

### Wheel Index Convention
**Apply to:** `src/tire.js`, `src/suspension.js`, `src/vehicle.js`, `src/physics.js`

```
0 = FL (Front Left)
1 = FR (Front Right)
2 = RL (Rear Left)
3 = RR (Rear Right)
```

This mapping must be consistent across all modules. Document it in GLOSSARY.md and
repeat it as a comment in each module that indexes wheels.

---

## No Analog Found

All files are new — no existing `src/` directory. All patterns sourced from RESEARCH.md.

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `docs/GLOSSARY.md` | documentation | — | Pure doc; no code pattern needed |
| `index.html` | entry | — | Only one HTML file in project; no analog |
| `data/ranger.js` | data | — | No existing data modules |
| `src/main.js` | entry | rAF | No existing modules |
| `src/physics.js` | service | batch | No existing modules |
| `src/vehicle.js` | service | request-response | No existing modules |
| `src/tire.js` | utility/stub | transform | No existing modules |
| `src/suspension.js` | utility/stub | transform | No existing modules |
| `src/camera.js` | utility | rAF | No existing modules |
| `src/debug.js` | utility | event-driven | No existing modules |

---

## Metadata

**Analog search scope:** `/Users/ledogen/CodeShit/CarGame/` (excluding `references/` per D-03)
**Files scanned:** 0 source analogs (greenfield — `src/` does not exist)
**Pattern source:** `01-RESEARCH.md` verified code examples + first-principles specs
**Pattern extraction date:** 2026-05-10
