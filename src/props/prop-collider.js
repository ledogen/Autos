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
 * Closest point on triangle (a,b,c) to point p — Ericson "Real-Time Collision Detection" §5.1.5.
 * Writes the result into `out` [x,y,z] and returns it. Pure, allocation-free.
 */
function closestPtTriangle(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz, out) {
  const abx = bx - ax, aby = by - ay, abz = bz - az
  const acx = cx - ax, acy = cy - ay, acz = cz - az
  const apx = px - ax, apy = py - ay, apz = pz - az
  const d1 = abx * apx + aby * apy + abz * apz
  const d2 = acx * apx + acy * apy + acz * apz
  if (d1 <= 0 && d2 <= 0) { out[0] = ax; out[1] = ay; out[2] = az; return out }        // vertex A
  const bpx = px - bx, bpy = py - by, bpz = pz - bz
  const d3 = abx * bpx + aby * bpy + abz * bpz
  const d4 = acx * bpx + acy * bpy + acz * bpz
  if (d3 >= 0 && d4 <= d3) { out[0] = bx; out[1] = by; out[2] = bz; return out }        // vertex B
  const vc = d1 * d4 - d3 * d2
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {                                                  // edge AB
    const v = d1 / (d1 - d3)
    out[0] = ax + v * abx; out[1] = ay + v * aby; out[2] = az + v * abz; return out
  }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz
  const d5 = abx * cpx + aby * cpy + abz * cpz
  const d6 = acx * cpx + acy * cpy + acz * cpz
  if (d6 >= 0 && d5 <= d6) { out[0] = cx; out[1] = cy; out[2] = cz; return out }        // vertex C
  const vb = d5 * d2 - d1 * d6
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {                                                  // edge AC
    const w = d2 / (d2 - d6)
    out[0] = ax + w * acx; out[1] = ay + w * acy; out[2] = az + w * acz; return out
  }
  const va = d3 * d6 - d5 * d4
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {                                    // edge BC
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6))
    out[0] = bx + w * (cx - bx); out[1] = by + w * (cy - by); out[2] = bz + w * (cz - bz); return out
  }
  const denom = 1 / (va + vb + vc)                                                      // interior
  const v = vb * denom, w = vc * denom
  out[0] = ax + abx * v + acx * w; out[1] = ay + aby * v + acy * w; out[2] = az + abz * v + acz * w
  return out
}

const _cpt = [0, 0, 0]

/**
 * Sphere (cx,cy,cz,r) vs a triangle-soup mesh `tris` (flat Float32Array, 9 floats = one triangle,
 * a,b,c). Returns the DEEPEST contact {nx,ny,nz,depth} (normal from surface toward the sphere centre,
 * depth > 0) or null. Assumes the sphere centre is OUTSIDE the solid (true for a vehicle contact probe
 * grazing a boulder) — closest-point-to-centre gives the correct outward push; deep interior
 * penetration (truck inside a boulder) is not a real case here.
 */
export function sphereVsMesh(cx, cy, cz, r, tris) {
  let best = null
  const r2 = r * r
  for (let i = 0; i < tris.length; i += 9) {
    closestPtTriangle(cx, cy, cz,
      tris[i], tris[i + 1], tris[i + 2], tris[i + 3], tris[i + 4], tris[i + 5],
      tris[i + 6], tris[i + 7], tris[i + 8], _cpt)
    const dx = cx - _cpt[0], dy = cy - _cpt[1], dz = cz - _cpt[2]
    const d2 = dx * dx + dy * dy + dz * dz
    if (d2 < r2) {
      const d = Math.sqrt(d2) || 1e-6
      const depth = r - d
      if (!best || depth > best.depth) best = { nx: dx / d, ny: dy / d, nz: dz / d, depth }
    }
  }
  return best
}

/**
 * Sphere vs an INSTANCED mesh: the solid is `tris` placed at (ox,oy,oz), rotated `rotY` about Y, and
 * uniformly scaled by `scale` (matches the boulder InstancedMesh transform — no tilt). Transforms the
 * query into the mesh's local frame (rotation + uniform scale preserve the sphere), tests, and maps the
 * contact back to world. Returns {nx,ny,nz,depth} (world) or null.
 */
export function sphereVsMeshInstance(cx, cy, cz, r, tris, ox, oy, oz, rotY, scale) {
  const c = Math.cos(rotY), s = Math.sin(rotY)
  const dx = cx - ox, dz = cz - oz
  // world → local: apply Ry(-rotY) then un-scale
  const lx = (c * dx - s * dz) / scale
  const lz = (s * dx + c * dz) / scale
  const ly = (cy - oy) / scale
  const hit = sphereVsMesh(lx, ly, lz, r / scale, tris)
  if (!hit) return null
  // local normal → world: apply Ry(rotY) (uniform scale leaves direction unchanged); depth × scale
  return {
    nx: c * hit.nx + s * hit.nz,
    ny: hit.ny,
    nz: -s * hit.nx + c * hit.nz,
    depth: hit.depth * scale,
  }
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
 * FEAT-15: sphere vs GENERAL capsule — swept sphere of radius capR along the arbitrary world
 * segment A(ax,ay,az)–B(bx,by,bz). Fallen logs lie at any heading/pitch, which the vertical-only
 * capsule above can't represent. Closest point on the segment (clamped projection), then the
 * same sphere-vs-sphere test there — so wheels contact a log from the side, the top, or an end
 * cap with a correct outward normal.
 * @returns {{nx:number,ny:number,nz:number,depth:number}|null}
 */
export function sphereVsCapsule(cx, cy, cz, r, ax, ay, az, bx, by, bz, capR) {
  const abx = bx - ax, aby = by - ay, abz = bz - az
  const len2 = abx * abx + aby * aby + abz * abz
  let t = len2 > 1e-9 ? ((cx - ax) * abx + (cy - ay) * aby + (cz - az) * abz) / len2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return sphereVsSphere(cx, cy, cz, r, ax + abx * t, ay + aby * t, az + abz * t, capR)
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
