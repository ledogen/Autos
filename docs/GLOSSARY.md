# RangerSim Physics Glossary

This glossary defines the coordinate system, sign conventions, and physics terms used by every `src/*.js` file in RangerSim. It is the source of truth — when a code comment refers to `slip angle` or `forward vector` or `quaternion integration`, the definition lives here. New terms must be added to this file before they appear in code.

---

## Coordinate System

Three.js uses a **Y-up right-handed world space**. RangerSim adopts this system without modification:

| Axis | Direction | Meaning at heading 0 |
|------|-----------|----------------------|
| +X   | Right      | World right          |
| +Y   | Up         | World up             |
| -Z   | Forward    | Car forward at heading 0 |

**Heading 0 convention:** When the car has identity quaternion orientation (no rotation applied), it points down the **-Z axis**. "Forward" in body space is the vector `(0, 0, -1)` in local coordinates.

**No conversion layers exist anywhere in this codebase.** Physics math uses Three.js axes directly. There is no SAE, ISO, or automotive-standard axis conversion layer. Named vectors (see below) are the readability mechanism — not axis remapping.

---

## Named Vectors (Body Space)

Three named unit vectors are used everywhere physics is written. They are always derived from `vehicleState.quaternion` by rotating base-axis vectors into world space:

| Name      | Body-Space Basis | World-Space Derivation |
|-----------|-----------------|------------------------|
| `forward` | `(0, 0, -1)`    | `new THREE.Vector3(0, 0, -1).applyQuaternion(vehicleState.quaternion)` |
| `right`   | `(1, 0, 0)`     | `new THREE.Vector3(1, 0, 0).applyQuaternion(vehicleState.quaternion)`  |
| `up`      | `(0, 1, 0)`     | `new THREE.Vector3(0, 1, 0).applyQuaternion(vehicleState.quaternion)`  |

**Enforcement rule:** Any time a module computes "the direction the car is pointing" it **MUST** construct that vector from this quaternion rotation. It is **NEVER** acceptable to derive the forward vector from `Math.atan2(velocity.x, velocity.z)` or from a stored Euler `heading` scalar. Those approaches fail at 90° pitch/roll (gimbal lock).

---

## Sign Conventions

### Slip Angle

Slip angle is the angle between the wheel's **heading direction** (its `forward` vector after steer rotation) and the **velocity vector at the wheel contact patch**.

**Positive sign convention:** Counter-clockwise when viewed from above in the Y-up right-hand system. Equivalently: positive slip angle corresponds to the contact patch velocity pointing to the **wheel's left** (in the wheel's local frame).

**Phase note:** Phase 1 does not use slip angle math (D-08 — velocity damping only). The convention is documented here for Phase 3 Pacejka implementation.

### Torque

Positive torque about an axis follows the **right-hand rule** with the axis as the thumb:

- Point right thumb along +Y → fingers curl counter-clockwise viewed from above
- Yaw torque about +Y produces **counter-clockwise yaw** viewed from above
- This matches the Three.js/OpenGL right-hand convention

World-frame torques applied in `physics.js` accumulate into `angularVelocity` (also world-frame).

### Steering Angle (Scalar, NOT Euler)

`vehicleState.steerAngle` is a **scalar in radians**, not an Euler angle for body rotation.

- **Positive steerAngle** = steer left (counter-clockwise viewed from above, consistent with positive yaw about +Y)
- `steerAngle` is a separate per-frame input scalar consumed by Ackermann geometry to compute front wheel angles
- Body rotation remains a `THREE.Quaternion` at all times — `steerAngle` never modifies `vehicleState.quaternion` directly

**Do not confuse** the scalar steer angle with Euler body rotation. They are completely separate concepts.

---

## Quaternion Integration Convention

`vehicleState.quaternion` (a `THREE.Quaternion`) represents the car body's orientation in world space. It is integrated each physics step as follows:

**Step 1 — Angular velocity:** `angularVelocity` is stored in **WORLD frame** (rad/s) as a `THREE.Vector3`.

**Step 2 — Build delta quaternion:**
```javascript
const axis = angularVelocity.clone().normalize();
const angle = angularVelocity.length() * dt;
const dq = new THREE.Quaternion().setFromAxisAngle(axis, angle);
```

**Step 3 — Left-multiply (world-frame convention):**
```javascript
vehicleState.quaternion.premultiply(dq);  // equivalent to: dq * q
```

**Step 4 — Normalize to prevent drift:**
```javascript
vehicleState.quaternion.normalize();
```

**Step 5 — Guard against zero rotation:**
```javascript
if (angularVelocity.length() < 1e-10) return;  // skip update this frame
```

**Rationale:** Physics forces accumulate in world space, so `angularVelocity` is world-frame. Using `premultiply(dq)` (i.e., `dq * q`) applies a world-frame rotation increment. If angular velocity were stored in body space, `q.multiply(dq)` (i.e., `q * dq`) would be correct instead. This project uses world-frame `premultiply`.

**Always call `normalize()` immediately after every integration step.** Floating-point multiplication of unit quaternions accumulates tiny errors that compound over thousands of steps.

---

## Term Definitions

### Slip Angle

The angle between the wheel's **heading direction** and the **contact patch velocity vector**.

- **Unit:** radians
- **Sign:** Positive = velocity pointing left of heading (counter-clockwise viewed from above)
- **Phase 3** will use slip angle as the input to the Pacejka Magic Formula lateral force calculation

### Normal Force (`Fn`)

The contact force exerted by the ground on a wheel's contact patch, acting in the **+Y direction** (world up, Three.js convention). Opposes gravity and prevents ground penetration.

- **Unit:** N (Newtons)
- **Symbol:** `Fn` — named for the physical role (normal to the contact surface), NOT the SAE Z-axis label `Fz`. This project uses Three.js Y-up axes throughout; the ground reaction acts in +Y, never +Z.
- **Phase 1:** Computed per-wheel from impulse-based rigid ground contact. No spring stiffness constant — wheel-to-body geometry is rigid.
- **Phase 4:** Computed from spring-damper compression at each corner, enabling dynamic load transfer.

**Naming rule:** Always use `Fn` in code. Never use `Fz` for this quantity — that is SAE convention and contradicts the project coordinate system (GLOSSARY §Coordinate System).

### Contact Patch Velocity

The velocity vector at the location where the tire meets the ground. Computed as:

```
v_contact = vehicleState.velocity + vehicleState.angularVelocity × (wheelContactPoint − vehicleState.position)
```

Where `×` is the vector cross product. The contact patch velocity is then decomposed into:

- **Longitudinal component** (`Flong`): projection along the wheel's `forward` vector → used for drive/brake force and rolling resistance
- **Lateral component** (`Flat`): projection along the wheel's `right` vector → used for lateral (side) tire force

- **Unit:** m/s (both components)

### Ackermann Geometry

Steering geometry where the **inner wheel** (turning toward the turn center) rotates by a **sharper angle** than the outer wheel. This minimizes tire scrub during a low-speed turn by making both front tires track concentric arcs whose center lies on the extended rear-axle line.

The exact formula used in this project (sin/cos form — avoids cotangent singularity):

```
φ_inner = atan( 2·L·sin(φ) / (2·L·cos(φ) − T·sin(φ)) )
φ_outer = atan( 2·L·sin(φ) / (2·L·cos(φ) + T·sin(φ)) )
```

Where:
- `φ` = reference steer angle (the `vehicleState.steerAngle` scalar), positive = steer left
- `L` = wheelbase = 2.85 m (2002 Ford Ranger)
- `T` = track width = 1.46 m (2002 Ford Ranger)

For a left turn (positive φ): left wheel is inner → `φ_inner = φ_left`, right wheel is outer → `φ_outer = φ_right`.

- **Unit:** radians (both input φ and output wheel angles)

---

## Wheel Index Convention

Every module that indexes into a per-wheel array uses this mapping:

| Index | Label | Position           |
|-------|-------|--------------------|
| `0`   | FL (Front Left)  | Front Left  |
| `1`   | FR (Front Right) | Front Right |
| `2`   | RL (Rear Left)   | Rear Left   |
| `3`   | RR (Rear Right)  | Rear Right  |

This mapping applies to: `vehicleState.wheelAngles`, wheel mesh arrays in `main.js`, normal force arrays in `suspension.js`, and any per-wheel force arrays in `physics.js`.

---

## Frame Logger Fields

Log fields written by `src/logger.js` `captureFrame()` and recorded in the downloaded `.json` file. Field order matches the `FIELDS` constant in `src/logger.js` exactly (D-07). Each row in the `frames` array has 33 scalar values in this order.

### t
Accumulated simulation time at the moment of capture — seconds elapsed since the recording session started (not wall-clock time). Source: `simTime` counter in `src/main.js`, incremented by `FIXED_DT` each physics step.

### px, py, pz
Vehicle centre-of-gravity position in world space — metres. Axes follow the project coordinate system (Y-up): `px` = world right, `py` = world up, `pz` = world forward (negative Z is forward at heading 0). Source: `vehicleState.position`.

### vx, vy, vz
Vehicle linear velocity in world space — m/s. Source: `vehicleState.velocity`.

### qx, qy, qz, qw
Vehicle body orientation as a unit quaternion in world space. Matches the Three.js `Quaternion` component order. Source: `vehicleState.quaternion`.

### wx, wy, wz
Vehicle angular velocity in world space — rad/s. Positive values follow the right-hand rule about each axis. Source: `vehicleState.angularVelocity`.

### steer
Front wheel steer angle scalar — radians. Positive = steer left (counter-clockwise viewed from above). This is the `vehicleState.steerAngle` scalar, not a body Euler angle. See §Sign Conventions → Steering Angle.

### thr
Throttle input — dimensionless, range 0..1. Source: `vehicleState.throttle`.

### brk
Brake input — dimensionless, range 0..1. Source: `vehicleState.brake`.

### {fl/fr/rl/rr}_fn
Normal (ground reaction) force at the named wheel contact patch — Newtons. Acts in the +Y direction (world up). Zero when the wheel is airborne. Prefix key: `fl` = front-left (index 0), `fr` = front-right (1), `rl` = rear-left (2), `rr` = rear-right (3). Source: `vehicleState.wheelDebug[i].fn` written by `src/physics.js`.

### {fl/fr/rl/rr}_fy
Lateral tire force at the named wheel contact patch — Newtons. Positive = force in the wheel's +right direction. Computed by `computeLateralForce()` in `src/physics.js`. Zero when airborne. Source: `vehicleState.wheelDebug[i].fy`.

### {fl/fr/rl/rr}_sa
Slip angle at the named wheel — radians. Computed as `atan2(lateralVelocity, |longitudinalVelocity|)`. Positive sign convention per §Sign Conventions → Slip Angle. Zero when airborne. Source: `vehicleState.wheelDebug[i].sa`.

### {fl/fr/rl/rr}_c
Contact compression depth at the named wheel — metres. The penetration depth of the wheel contact point into the ground plane at the moment of contact; zero when airborne. Source: `vehicleState.wheelDebug[i].c` (`params._compression` inside `src/physics.js`).

---

## Deferred to Phase 3 / Phase 4

The following terms are intentionally not defined in Phase 1. They will be defined in the phase that owns their implementation:

| Term | Deferred To | Brief Note |
|------|-------------|------------|
| Pacejka B coefficient (stiffness factor) | Phase 3 | Shapes the initial slope of the tire force curve |
| Pacejka C coefficient (shape factor) | Phase 3 | Controls peak shape (lateral vs longitudinal) |
| Pacejka D coefficient (peak factor) | Phase 3 | Scales peak lateral/longitudinal force magnitude |
| Pacejka E coefficient (curvature factor) | Phase 3 | Controls post-peak curvature behavior |
| Friction circle | Phase 3 | Combined lateral + longitudinal force envelope |
| Longitudinal slip ratio | Phase 3 | (ω·r − v_x) / max(ω·r, v_x); requires real wheel angular velocity |
| Wheel angular velocity (ω_wheel) | Phase 3 | Wheel spin rate in rad/s; separate from body angular velocity |
| Spring stiffness (k) | Phase 4 | Corner spring rate in N/m |
| Damping coefficient (c) | Phase 4 | Corner damper rate in N/(m/s) |
| Normal force load transfer | Phase 4 | Dynamic Fz shifts between corners under acceleration/braking/cornering |
| Ride height | Phase 4 | Static suspension compression at rest |
