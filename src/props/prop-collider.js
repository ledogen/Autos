/**
 * src/props/prop-collider.js — Pure analytic collision math for FEAT-06b prop collisions.
 *
 * Plain numbers, no THREE, no state — so it's trivially headless-testable and cheap on the hot
 * physics path. The PropSystem spatial index (prop-system.js) calls these for each nearby prop;
 * main.js later threads the returned contacts into queryContacts (the ~10-line splice deferred
 * until the road/terrain contact work settles).
 *
 * Contact convention matches main.js queryContacts: normal points OUT of the solid toward the
 * query sphere; `depth` is penetration depth (> 0).
 */

/**
 * Sphere (cx,cy,cz,r) vs solid sphere (sx,sy,sz,sr).
 * @returns {{nx:number,ny:number,nz:number,depth:number}|null}
 */
export function sphereVsSphere(cx, cy, cz, r, sx, sy, sz, sr) {
  const dx = cx - sx, dy = cy - sy, dz = cz - sz
  const R = r + sr
  const d2 = dx * dx + dy * dy + dz * dz
  if (d2 >= R * R) return null
  const d = Math.sqrt(d2) || 1e-6
  return { nx: dx / d, ny: dy / d, nz: dz / d, depth: R - d }
}

/**
 * Sphere vs vertical capsule — segment at (capX, capZ) from baseY..topY, radius capR. Used for tree
 * trunks (canopy is non-colliding). Closest point on the segment to the sphere centre, then a
 * sphere-vs-sphere test there.
 * @returns {{nx:number,ny:number,nz:number,depth:number}|null}
 */
export function sphereVsCapsuleY(cx, cy, cz, r, capX, capZ, baseY, topY, capR) {
  const py = Math.max(baseY, Math.min(topY, cy))   // closest point on the vertical segment
  return sphereVsSphere(cx, cy, cz, r, capX, py, capZ, capR)
}

/**
 * Bush soft drag — NOT a contact. If the point (cx,cy,cz) is inside the bush sphere and moving,
 * return a resistive force opposing velocity: F = clamp(k · |v| · effRadius, 0, fMax), capped low.
 * @returns {{x:number,y:number,z:number}|null}
 */
export function bushDrag(cx, cy, cz, vx, vy, vz, bx, by, bz, br, effRadius, k, fMax) {
  const dx = cx - bx, dy = cy - by, dz = cz - bz
  if (dx * dx + dy * dy + dz * dz >= br * br) return null
  const sp = Math.sqrt(vx * vx + vy * vy + vz * vz)
  if (sp < 1e-4) return null
  let mag = k * sp * effRadius
  if (mag > fMax) mag = fMax
  return { x: -vx / sp * mag, y: -vy / sp * mag, z: -vz / sp * mag }
}
