/**
 * Vehicle input and control module. Owns keyboard state, steer accumulation,
 * Ackermann geometry, wheel spin accumulation, and spawn-reset.
 * Does NOT perform physics integration — that is physics.js.
 * Does NOT import Three.js. Pure math + DOM event listeners.
 *
 * Conventions: see docs/GLOSSARY.md
 * Sign convention: positive steerAngle = steer left (counter-clockwise viewed from above, Y-up right-hand system).
 */

// ── Keyboard input state (module-private) ────────────────────────────────────
const keys = { w: false, s: false, a: false, d: false, r: false, ' ': false }

// Register listeners at module load (module scripts run after parse — no DOMContentLoaded needed).
document.addEventListener('keydown', e => { const k = e.key === ' ' ? ' ' : e.key.toLowerCase(); if (k in keys) keys[k] = true })
document.addEventListener('keyup',   e => { const k = e.key === ' ' ? ' ' : e.key.toLowerCase(); if (k in keys) keys[k] = false })

// ── SPAWN_STATE ───────────────────────────────────────────────────────────────
// Plain scalar values — main.js copies these into THREE.Vector3 / THREE.Quaternion
// fields of vehicleState on R-key reset.
// positionY is left at 0 here; main.js uses RANGER_PARAMS.cgHeight instead.
// T-03-03: quatW = 1 explicitly (identity quaternion); no NaN on reset.
export const SPAWN_STATE = {
  positionX: 0, positionY: 0, positionZ: 0,
  velocityX: 0, velocityY: 0, velocityZ: 0,
  quatX: 0, quatY: 0, quatZ: 0, quatW: 1,        // identity quaternion
  angVelX: 0, angVelY: 0, angVelZ: 0,
  steerAngle: 0, throttle: 0, brake: 0,
  wheelAngles: [0, 0, 0, 0],
  wheelSteerAngles: [0, 0, 0, 0],
  // ── Phase 4 hub state (D-02) ────────────────────────────────────────────
  // hubY[i]:  world Y of wheel hub center [m], indexed 0=FL,1=FR,2=RL,3=RR.
  // hubVy[i]: vertical velocity of hub [m/s].
  // These 0-placeholders are overwritten by main.js at init/reset using
  // computeStaticEquilibrium(RANGER_PARAMS) so the car spawns pre-settled.
  hubY:  [0, 0, 0, 0],   // m   — hub center world Y (D-02)
  hubVy: [0, 0, 0, 0],   // m/s — hub vertical velocity (D-02)
  handbrake: false
}

/**
 * Update vehicle input state for one fixed physics step.
 * Called once per step inside the game loop fixed accumulator, BEFORE stepPhysics.
 *
 * @param {object} vehicleState - Mutable vehicleState shape from main.js; mutated in-place.
 *   Must have: velocity ({x,y,z}), quaternion ({x,y,z,w}), steerAngle (number),
 *              throttle (number), brake (number), wheelAngles (number[4]),
 *              wheelSteerAngles (number[4]).
 * @param {object} params - RANGER_PARAMS (may have debug-slider overrides).
 *   Uses: maxSteerAngle, steerRate, steerDecayRate, speedSteerRef, wheelbase,
 *         trackFront, wheelRadius.
 * @param {number} dt - Fixed timestep in seconds (1/60).
 * @returns {boolean} true if R-key reset was requested this step (main.js handles the copy).
 */
export function updateVehicle (vehicleState, params, dt) {
  // ── 1. Throttle / Brake (M1-05) ────────────────────────────────────────────
  vehicleState.throttle = keys.w ? 1 : 0
  // S key: sets brake=1; getDriveTorque uses maxReverseTorque for rear wheels (Bug 4 fix in physics.js)
  vehicleState.brake    = keys.s ? 1 : 0
  vehicleState.handbrake = keys[' '] || false

  // ── 2. Speed-scaled steer limit (M1-08) ────────────────────────────────────
  // Compute current horizontal speed in m/s (ignore vertical for steering math).
  const speed = Math.sqrt(vehicleState.velocity.x ** 2 + vehicleState.velocity.z ** 2)

  // M1-08: at speed=speedSteerRef (15 m/s ≈ 54 km/h) max steer is halved.
  // Denominator grows linearly with speed.
  const dynamicMaxSteer = params.maxSteerAngle / (1 + speed / params.speedSteerRef)

  // ── 3. Steer accumulation (M1-07) ──────────────────────────────────────────
  if (keys.a) vehicleState.steerAngle += params.steerRate * dt
  if (keys.d) vehicleState.steerAngle -= params.steerRate * dt

  if (!keys.a && !keys.d) {
    // Decay toward zero at steerDecayRate (rad/s)
    const decay = params.steerDecayRate * dt
    if (Math.abs(vehicleState.steerAngle) <= decay) {
      vehicleState.steerAngle = 0
    } else {
      vehicleState.steerAngle -= Math.sign(vehicleState.steerAngle) * decay
    }
  }

  // T-03-01: clamp to dynamic max — prevents unbounded accumulation even if
  // steerRate is increased via debug slider.
  vehicleState.steerAngle = Math.max(-dynamicMaxSteer, Math.min(dynamicMaxSteer, vehicleState.steerAngle))

  // ── 4. Ackermann per-wheel steer angles (M1-06) ────────────────────────────
  // RESEARCH §Pattern 5 formula (cited: raw.org/book/kinematics/ackerman-steering/).
  // L = wheelbase (2.85m), T = trackFront (1.46m), phi = reference steer angle.
  // Sign convention: positive phi = steer left →
  //   left wheel is inner (sharper angle), right wheel is outer.
  const phi = vehicleState.steerAngle
  let wheelSteerAngles

  if (Math.abs(phi) < 1e-6) {
    wheelSteerAngles = [0, 0, 0, 0]
  } else {
    const sinPhi = Math.sin(phi)
    const cosPhi = Math.cos(phi)
    const twoL   = 2 * params.wheelbase

    // phiLeft  = inner wheel when steering left (sharper turn)
    // phiRight = outer wheel when steering left (gentler turn)
    const phiLeft  = Math.atan(twoL * sinPhi / (twoL * cosPhi - params.trackFront * sinPhi))
    const phiRight = Math.atan(twoL * sinPhi / (twoL * cosPhi + params.trackFront * sinPhi))

    // Wheel index: 0=FL (left), 1=FR (right); rear wheels 2,3 always 0.
    wheelSteerAngles = [phiLeft, phiRight, 0, 0]
  }

  // Store on vehicleState: read by physics.js stepPhysics for lateral force decomposition.
  vehicleState.wheelSteerAngles = wheelSteerAngles

  // ── 5. Wheel visual spin accumulation (M1-09) ──────────────────────────────
  // vehicle.js has no Three.js — compute forward direction from quaternion components directly.
  // Forward vector = (0,0,-1) rotated by quaternion (world-space -Z body axis).
  // Using standard quaternion rotation formula for a unit basis vector:
  //   fwd = q * (0,0,-1) * q^-1
  // Expanded form (from quaternion product derivation):
  const qx = vehicleState.quaternion.x
  const qy = vehicleState.quaternion.y
  const qz = vehicleState.quaternion.z
  const qw = vehicleState.quaternion.w

  // Rotating (0,0,-1) by q: standard formula for q * v * q^-1 with v = (0,0,-1)
  const fwdX = 2 * (qx * qz + qy * qw)
  const fwdY = 2 * (qy * qz - qx * qw)
  const fwdZ = 1 - 2 * (qx * qx + qy * qy)
  // Result is already the world-space forward direction (-Z body axis).
  // No sign negation needed: q*(0,0,-1)*q^-1 directly gives the forward vector.

  // Project velocity onto forward direction to get longitudinal speed.
  const longSpeed = vehicleState.velocity.x * fwdX +
                    vehicleState.velocity.y * fwdY +
                    vehicleState.velocity.z * fwdZ

  // Spin delta: angular velocity = linear velocity / wheel radius.
  // Phase 1: all wheels spin at same rate. Phase 2+ drivetrain will differentiate per-wheel omega.
  const spinDelta = (longSpeed / params.wheelRadius) * dt

  for (let i = 0; i < 4; i++) {
    vehicleState.wheelAngles[i] += spinDelta
  }

  // ── 6. Reset check (M1-12) ─────────────────────────────────────────────────
  if (keys.r) {
    keys.r = false
    return true
  }

  return false
}
