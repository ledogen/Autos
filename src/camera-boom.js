/**
 * FEAT-246 — the chase camera's boom: pivot (the truck) → desired camera position. Pure maths, no Three.js, no engine.
 * Returns the fraction t∈[0,1] of the boom that is free, i.e. the camera sits at pivot + (desired − pivot)·t.
 *
 * Terrain: the boom is sampled at BOOM_STEPS points and the first one below groundAt(x,z)+clearance is bisected
 * back to the edge. Walls: `wallDist` is the caller's one ray cast (distance along the boom to the first solid, or
 * null); the camera stops `margin` short of it. Never returns more than 1 (never further than desired).
 */
export const BOOM_CLEARANCE = 0.45   // m above the ground: clears the near plane and the heightfield's facets
export const BOOM_WALL_MARGIN = 0.35 // m short of a wall
const BOOM_STEPS = 8

export function boomFreeFraction (pivot, desired, groundAt, wallDist = null, clearance = BOOM_CLEARANCE, margin = BOOM_WALL_MARGIN) {
  const dx = desired.x - pivot.x, dy = desired.y - pivot.y, dz = desired.z - pivot.z
  const len = Math.hypot(dx, dy, dz)
  if (len < 1e-6) return 1
  let t = 1
  if (wallDist !== null) t = Math.max(0, Math.min(1, (wallDist - margin) / len))
  const blocked = u => pivot.y + dy * u < groundAt(pivot.x + dx * u, pivot.z + dz * u) + clearance
  let lo = 0
  for (let i = 1; i <= BOOM_STEPS; i++) {
    const u = t * i / BOOM_STEPS
    if (!blocked(u)) { lo = u; continue }
    let hi = u
    for (let k = 0; k < 5; k++) { const m = (lo + hi) / 2; if (blocked(m)) hi = m; else lo = m }
    return lo
  }
  return t
}
