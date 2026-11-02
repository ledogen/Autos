// hilift.js — FEAT-138 the hi-lift jack: right a rolled truck where it lies, live in the physics.
//
// Owner rulings (2026-10-22 / 10-24 / 10-31, ticket FEAT-138): usable on any roll the death check did
// not end, in the direction the player picks from the inventory menu. A roll torque of
// 10.5 N·m per kg of truck mass for up to 3 s, cut the instant the truck passes the balance point
// (past it gravity finishes the roll); then a 5 s real-time cooldown. No dice: a slope, a rock or a
// heavier truck beats it through the physics alone.
//
// Pure: reads the pose, writes a world torque into `vehicleState.jackTorque`, which stepPhysics adds
// to the chassis torque it hands the engine (the adapter seam). Nothing here touches the engine.
//
// ROLL φ, about the truck's forward axis, in degrees: 0 upright, +90 lying on its RIGHT side (top
// toward the truck's right), ±180 on its roof. φ = atan2(−(up in body frame).x, (up in body frame).y).
// The roll splits into four BASINS by the two balance angles (physics.js rollBalance): wheels
// (|φ| < wheelsDeg), the right / left side, and the roof (|φ| > roofDeg). A heave is cut the moment φ
// leaves the basin it started in.

export const HILIFT = {
  torquePerKg: 10.5,   // N·m per kg of truck mass (owner-approved 2026-10-24)
  maxS: 3,             // s — the longest heave; most end at the balance point in about 1 s
  cooldownS: 5,        // s of REAL time after a heave ends
}

/** Roll about the forward axis [deg], from the body quaternion {x,y,z,w}. */
export function rollDeg (q) {
  const upX = 2 * (q.x * q.y + q.w * q.z)            // world-up component of the body's right axis
  const upY = 1 - 2 * (q.x * q.x + q.z * q.z)        // … of the body's up axis
  return Math.atan2(-upX, upY) * 180 / Math.PI
}

/** 0 on its wheels, +1 / −1 on its right / left side, 2 on its roof. */
export function basin (phi, bal) {
  const a = Math.abs(phi)
  return a < bal.wheelsDeg ? 0 : a > bal.roofDeg ? 2 : Math.sign(phi)
}

export class HiLift {
  /** @param {{wheelsDeg: number, roofDeg: number}} balance - physics.js rollBalance(params) */
  constructor (balance) {
    this.balance = balance
    this.dir = 0          // +1 heaving right, −1 left, 0 idle
    this.t = 0            // s into the current heave
    this.from = 0         // the basin the heave started in
    this.readyAt = -Infinity   // real-time s when the cooldown ends
  }

  get active () { return this.dir !== 0 }

  /** Why the jack can't be used right now, or null. `now` is real time in s. */
  refusal (vehicleState, now, runOver) {
    if (runOver) return 'the run is over'
    if (this.active) return 'heaving'
    if (now < this.readyAt) return 'catching your breath'
    if (basin(rollDeg(vehicleState.quaternion), this.balance) === 0) return 'the truck is on its wheels'
    return null
  }

  /** Start a heave: dir +1 rolls the top toward the truck's right, −1 toward its left. */
  start (dir, vehicleState, now, runOver) {
    if (this.refusal(vehicleState, now, runOver)) return false
    this.dir = dir
    this.t = 0
    this.from = basin(rollDeg(vehicleState.quaternion), this.balance)
    return true
  }

  /** Per fixed step, before stepPhysics: set (or clear) vehicleState.jackTorque. */
  step (vehicleState, massKg, dt, now) {
    if (!this.active) return
    const q = vehicleState.quaternion
    if (this.t >= HILIFT.maxS || basin(rollDeg(q), this.balance) !== this.from) {
      this.dir = 0
      this.readyAt = now + HILIFT.cooldownS
      vehicleState.jackTorque = null
      return
    }
    this.t += dt
    // Forward axis f = q·(0,0,−1); +τ about f rolls the top toward the truck's right.
    const k = this.dir * HILIFT.torquePerKg * massKg
    vehicleState.jackTorque = {
      x: -2 * (q.x * q.z + q.w * q.y) * k,
      y: -2 * (q.y * q.z - q.w * q.x) * k,
      z: -(1 - 2 * (q.x * q.x + q.y * q.y)) * k,
    }
  }
}
