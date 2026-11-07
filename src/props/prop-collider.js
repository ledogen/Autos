/**
 * src/props/prop-collider.js — Pure analytic collision math for FEAT-06b prop collisions.
 *
 * Plain numbers, no THREE, no state — so it's trivially headless-testable and cheap on the hot
 * physics path. PropSystem.queryProps (prop-system.js) calls these for each nearby prop, and
 * main.js splices the returned contacts into queryContacts (propHits). The engine-side mirror of
 * the same hard props is terrain-physics.js PropPhysics.
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
 * Sphere (cx,cy,cz,r) vs a CLOSED triangle-soup mesh `tris` (flat Float32Array, 9 floats = one
 * triangle a,b,c, wound counter-clockwise seen from outside). Returns {nx,ny,nz,depth} — the normal
 * points out of the solid toward the sphere, depth > 0 — or null.
 * The centre may be INSIDE the solid (BUG-54: a 0.37 m wheel probe can sink its centre into a 0.3 m
 * rock, which never happened against 20 m boulders); the push is then out through the nearest surface.
 * BUG-139: which side the centre is on is a ray-parity count, not the nearest face's normal. Where the
 * nearest point is an edge or vertex several faces share it, and the one picked can face away from the
 * centre: 2.3 % of points just outside the game's rocks read INSIDE, at depth r + distance (up to 4 m).
 * And inside, the depth is r, not r + distance — continuous with r − distance at the surface, and under
 * physics.js's 2r tunnelling failsafe, which a prop contact must never reach (the wheel's hard core in
 * the engine, which mirrors the rock, carries a deeper overlap). Both teleported the truck up off rocks.
 */
export function sphereVsMesh(cx, cy, cz, r, tris) {
  let bestD2 = Infinity, bi = -1, bx = 0, by = 0, bz = 0
  for (let i = 0; i < tris.length; i += 9) {
    closestPtTriangle(cx, cy, cz,
      tris[i], tris[i + 1], tris[i + 2], tris[i + 3], tris[i + 4], tris[i + 5],
      tris[i + 6], tris[i + 7], tris[i + 8], _cpt)
    const dx = cx - _cpt[0], dy = cy - _cpt[1], dz = cz - _cpt[2]
    const d2 = dx * dx + dy * dy + dz * dz
    if (d2 < bestD2) { bestD2 = d2; bi = i; bx = dx; by = dy; bz = dz }
  }
  if (bi < 0) return null
  // Face normal (b − a) × (c − a) of the closest triangle: outward for CCW winding.
  const ux = tris[bi + 3] - tris[bi], uy = tris[bi + 4] - tris[bi + 1], uz = tris[bi + 5] - tris[bi + 2]
  const vx = tris[bi + 6] - tris[bi], vy = tris[bi + 7] - tris[bi + 1], vz = tris[bi + 8] - tris[bi + 2]
  const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx
  const d = Math.sqrt(bestD2)
  if (d >= r && bx * fx + by * fy + bz * fz >= 0) return null   // out of reach, and the face agrees: the common miss
  if (d < 1e-9) {   // on the surface: push along the face normal
    const f = Math.hypot(fx, fy, fz) || 1
    return { nx: fx / f, ny: fy / f, nz: fz / f, depth: r }
  }
  const inside = rayParity(cx, cy, cz, tris)
  if (!inside && d >= r) return null
  const s = inside ? -1 / d : 1 / d
  return { nx: bx * s, ny: by * s, nz: bz * s, depth: inside ? r : r - d }
}

// Is (px,py,pz) inside the closed mesh? Crossings of one ray (Möller–Trumbore), odd = inside. The direction is skewed
// off every axis so it does not run along an edge of these blobs.
const RAY_X = 0.267, RAY_Y = 0.873, RAY_Z = 0.408
function rayParity(px, py, pz, tris) {
  let n = 0
  for (let i = 0; i < tris.length; i += 9) {
    const ax = tris[i], ay = tris[i + 1], az = tris[i + 2]
    const e1x = tris[i + 3] - ax, e1y = tris[i + 4] - ay, e1z = tris[i + 5] - az
    const e2x = tris[i + 6] - ax, e2y = tris[i + 7] - ay, e2z = tris[i + 8] - az
    const hx = RAY_Y * e2z - RAY_Z * e2y, hy = RAY_Z * e2x - RAY_X * e2z, hz = RAY_X * e2y - RAY_Y * e2x
    const a = e1x * hx + e1y * hy + e1z * hz
    if (a > -1e-12 && a < 1e-12) continue
    const f = 1 / a, sx = px - ax, sy = py - ay, sz = pz - az
    const u = f * (sx * hx + sy * hy + sz * hz)
    if (u < 0 || u > 1) continue
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x
    const v = f * (RAY_X * qx + RAY_Y * qy + RAY_Z * qz)
    if (v < 0 || u + v > 1) continue
    if (f * (e2x * qx + e2y * qy + e2z * qz) > 1e-9) n++
  }
  return (n & 1) === 1
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
 * FEAT-15: sphere vs GENERAL capsule — swept sphere of radius capR along the arbitrary world
 * segment A(ax,ay,az)–B(bx,by,bz). Used for fallen logs (any heading/pitch) AND standing trunks
 * (their baked endpoints include the tree's lean — the old vertical-only capsule missed leaning
 * trunks and is gone). Closest point on the segment (clamped projection), then the same
 * sphere-vs-sphere test there — so a wheel contacts from the side, the top, or an end cap with a
 * correct outward normal.
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
