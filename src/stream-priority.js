/**
 * src/stream-priority.js — PERF-33: the ONE ordering rule every streaming queue uses, and the motion
 * estimate it reads. Zero imports (terrain, road-mesh and props all consume it; none may drift).
 *
 * Owner ruling (2026-09-24): the ground around the player always comes first; past that, work AHEAD
 * of travel beats work the same distance behind; distant/behind comes last. So:
 *
 *   score = dist − NEAR_FIRST                      if dist ≤ NEAR_RADIUS   (always ahead of the rest)
 *   score = dist · (1 − AHEAD_WEIGHT · w · cos θ)  otherwise
 *
 * where dist is in chunk units from the stream centre, θ is the angle between the chunk offset and the
 * direction of travel, and w ∈ [0, 1] ramps with speed (0 parked — pure nearest-first, the old rule).
 * AHEAD_WEIGHT 0.25 means: at equal distance ahead beats behind (1.5 vs 2.5 at dist 2), and an ahead
 * chunk at 3 (2.25) still loses to a side chunk at 2 (2.0) — a lean, not a forward cone.
 * Lower score = sooner.
 */

const NEAR_RADIUS = 1.5     // chunks — the 3×3 around the centre (diagonal √2 ≈ 1.41)
const NEAR_FIRST = 1000     // any near chunk outranks every far one
const AHEAD_WEIGHT = 0.25
const BIAS_SPEED_LO = 2     // m/s — below this travel direction is noise, no bias
const BIAS_SPEED_HI = 8     // m/s — full bias from here up (~18 mph)

/**
 * @param {number} dx chunk-unit offset from the stream centre (x)
 * @param {number} dz chunk-unit offset from the stream centre (z)
 * @param {StreamMotion|null} motion
 */
export function streamScore(dx, dz, motion) {
  const dist = Math.hypot(dx, dz)
  if (dist <= NEAR_RADIUS) return dist - NEAR_FIRST
  const w = motion ? motion.biasWeight : 0
  if (w <= 0) return dist
  const cos = (dx * motion.dirX + dz * motion.dirZ) / dist
  return dist * (1 - AHEAD_WEIGHT * w * cos)
}

/**
 * Smoothed velocity of the stream centre (truck or free-cam), plus teleport detection. Derived from the
 * centre's own motion rather than the vehicle so free-cam gets the same treatment as driving.
 */
export class StreamMotion {
  constructor() {
    this.x = NaN; this.z = NaN
    this.vx = 0; this.vz = 0           // m/s, exponentially smoothed
    this.speed = 0
    this.dirX = 0; this.dirZ = 0       // unit travel direction (0,0 when parked)
    this.biasWeight = 0
  }

  /**
   * Feed this frame's centre. Returns true on a JUMP (teleport, spawn, free-cam placement): a move
   * no vehicle makes in one frame. A jump resets the velocity — it is not travel.
   * @param {number} jumpM metres in one frame that count as a jump
   */
  update(x, z, dt, jumpM) {
    if (Number.isNaN(this.x)) { this.x = x; this.z = z; return false }   // first sample: nothing to jump from
    const dx = x - this.x, dz = z - this.z
    this.x = x; this.z = z
    if (dx * dx + dz * dz > jumpM * jumpM) {
      this.vx = this.vz = this.speed = this.biasWeight = 0
      this.dirX = this.dirZ = 0
      return true
    }
    if (dt <= 0) return false
    const a = Math.min(1, dt / 0.5)    // ~0.5 s smoothing: steady through physics-step jitter
    this.vx += (dx / dt - this.vx) * a
    this.vz += (dz / dt - this.vz) * a
    this.speed = Math.hypot(this.vx, this.vz)
    if (this.speed > 1e-3) { this.dirX = this.vx / this.speed; this.dirZ = this.vz / this.speed }
    this.biasWeight = Math.max(0, Math.min(1, (this.speed - BIAS_SPEED_LO) / (BIAS_SPEED_HI - BIAS_SPEED_LO)))
    return false
  }
}
