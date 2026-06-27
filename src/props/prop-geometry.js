/**
 * src/props/prop-geometry.js — Procedural low-poly prop geometry for FEAT-06.
 *
 * Three parametric primitives, all PURE (no road/terrain/scene dependency) and DETERMINISTIC
 * (driven by an injected `rng: () => [0,1)` — pass a seeded mulberry32 for reproducibility):
 *
 *   makeBlob(opts, rng)       — amorphous low-poly blob: aspen canopy, rocks, bushes, boulders.
 *   makeKinkedTube(opts, rng) — swept tapered low-poly tube: aspen + pine trunks.
 *   makeConeStack(opts, rng)  — stacked kinked cone skirts: pine canopy.
 *
 * Plus helpers: fillColor() (bake a uniform vertex colour), mergeGeometries() (dependency-free
 * concat — avoids the browser 'three/addons' vs node 'three/examples' path split), and
 * assembleTree() (trunk + canopy → one geometry for single-draw instancing).
 *
 * AESTHETIC: low-poly + FLAT shading is the whole look (see FEAT-06 concept art). Geometry is
 * built NON-INDEXED and normals are baked per-face (computeVertexNormals on non-indexed geometry
 * = flat). Do not smooth or over-tessellate.
 *
 * INVARIANT: blob vertices are displaced by a function of DIRECTION (normalised position), so the
 * duplicated corner vertices that PolyhedronGeometry emits at shared edges receive identical
 * displacement and stay welded (no cracks).
 */

import * as THREE from 'three'

// ── seeded value noise (3D) ───────────────────────────────────────────────────────
// Hash-lattice value noise with smoothstep trilerp → coherent lumps (controllable via freq).
// Pure integer-arithmetic hash (Math.imul) — same family as seed.js, safe + deterministic.
function _hash3(ix, iy, iz, seed) {
  let h = seed | 0
  h = Math.imul(h ^ (ix | 0), 0x9e3779b9)
  h = Math.imul(h ^ (iy | 0), 0x85ebca6b)
  h = Math.imul(h ^ (iz | 0), 0xc2b2ae35)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296   // [0,1)
}
const _smooth = (t) => t * t * (3 - 2 * t)

function _valueNoise3(x, y, z, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z)
  const fx = _smooth(x - x0), fy = _smooth(y - y0), fz = _smooth(z - z0)
  const c000 = _hash3(x0,     y0,     z0,     seed), c100 = _hash3(x0 + 1, y0,     z0,     seed)
  const c010 = _hash3(x0,     y0 + 1, z0,     seed), c110 = _hash3(x0 + 1, y0 + 1, z0,     seed)
  const c001 = _hash3(x0,     y0,     z0 + 1, seed), c101 = _hash3(x0 + 1, y0,     z0 + 1, seed)
  const c011 = _hash3(x0,     y0 + 1, z0 + 1, seed), c111 = _hash3(x0 + 1, y0 + 1, z0 + 1, seed)
  const x00 = c000 + (c100 - c000) * fx, x10 = c010 + (c110 - c010) * fx
  const x01 = c001 + (c101 - c001) * fx, x11 = c011 + (c111 - c011) * fx
  const y0v = x00 + (x10 - x00) * fy,    y1v = x01 + (x11 - x01) * fy
  return y0v + (y1v - y0v) * fz          // [0,1)
}

const _range = (rng, lo, hi) => lo + (hi - lo) * rng()

// ── makeBlob ───────────────────────────────────────────────────────────────────────
/**
 * Low-poly amorphous blob. Base icosphere, vertices displaced radially by value noise, then
 * non-uniform axis-scaled. Flat-shaded. Centred at origin; bottom near y = -radius*axisY.
 *
 * @param {{radius:number, axisScale:[number,number,number], irregularity:number,
 *          noiseFreq:number, subdiv:number}} o
 * @param {() => number} rng
 */
export function makeBlob(o, rng) {
  const seed = (rng() * 0xffffffff) | 0
  const geo = new THREE.IcosahedronGeometry(1, o.subdiv | 0)  // non-indexed unit icosphere
  const pos = geo.attributes.position
  const [sx, sy, sz] = o.axisScale
  const f = o.noiseFreq, amp = o.irregularity, r = o.radius
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    // dir = normalised position (welds duplicate corners — identical dir → identical disp)
    const len = v.length() || 1
    const nx = v.x / len, ny = v.y / len, nz = v.z / len
    const n = _valueNoise3(nx * f + 8.3, ny * f + 2.1, nz * f + 5.7, seed) * 2 - 1  // [-1,1]
    const rr = r * (1 + amp * n)
    pos.setXYZ(i, nx * rr * sx, ny * rr * sy, nz * rr * sz)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()   // non-indexed → flat per-face normals
  geo.computeBoundingSphere()
  return geo
}

// ── makeKinkedTube ──────────────────────────────────────────────────────────────────
/**
 * Swept tapered low-poly tube along a kinked vertical polyline. Base sits at y = 0. Returns a
 * non-indexed flat-shaded geometry. Used for both aspen and pine trunks.
 *
 * @param {{segCount:number, segLen:number, baseRadius:number, taperPow:number, topFrac:number,
 *          bend:number, sides:number}} o
 * @param {() => number} rng
 * @returns {{geo: THREE.BufferGeometry, topY: number, topRadius: number}}
 */
export function makeKinkedTube(o, rng) {
  const N = Math.max(2, o.segCount | 0)
  const sides = Math.max(3, o.sides | 0)
  // Centreline nodes (random-walk tilt = the kink). Trunks are ~vertical so use a non-vertical
  // reference axis for the frame to avoid degeneracy.
  const nodes = [new THREE.Vector3(0, 0, 0)]
  let dir = new THREE.Vector3(0, 1, 0)
  for (let i = 0; i < N; i++) {
    const jx = (rng() * 2 - 1) * o.bend
    const jz = (rng() * 2 - 1) * o.bend
    dir = new THREE.Vector3(jx, 1, jz).normalize()
    nodes.push(nodes[i].clone().addScaledVector(dir, o.segLen))
  }
  // Per-node radius (taper toward topFrac at the tip).
  const radii = []
  for (let i = 0; i <= N; i++) {
    const t = Math.pow(i / N, o.taperPow)
    radii.push(o.baseRadius * (1 - (1 - o.topFrac) * t))
  }
  // Build rings, then side quads + bottom fan cap. Non-indexed (flat shading).
  const verts = []
  const ref = new THREE.Vector3(1, 0, 0)
  const tan = new THREE.Vector3(), nrm = new THREE.Vector3(), bin = new THREE.Vector3()
  const ring = (idx) => {
    // segment direction at this node
    const a = nodes[Math.max(0, idx - 1)], b = nodes[Math.min(N, idx + 1)]
    tan.subVectors(b, a).normalize()
    nrm.copy(ref).addScaledVector(tan, -ref.dot(tan)).normalize()
    bin.crossVectors(tan, nrm).normalize()
    const out = []
    for (let k = 0; k < sides; k++) {
      const ang = (k / sides) * Math.PI * 2
      out.push(new THREE.Vector3()
        .copy(nodes[idx])
        .addScaledVector(nrm, Math.cos(ang) * radii[idx])
        .addScaledVector(bin, Math.sin(ang) * radii[idx]))
    }
    return out
  }
  let lower = ring(0)
  const push = (p) => verts.push(p.x, p.y, p.z)
  // bottom fan cap
  for (let k = 0; k < sides; k++) {
    push(nodes[0]); push(lower[(k + 1) % sides]); push(lower[k])
  }
  for (let i = 1; i <= N; i++) {
    const upper = ring(i)
    for (let k = 0; k < sides; k++) {
      const k1 = (k + 1) % sides
      push(lower[k]); push(lower[k1]); push(upper[k])      // tri 1
      push(lower[k1]); push(upper[k1]); push(upper[k])     // tri 2
    }
    lower = upper
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return { geo, topY: nodes[N].y, topRadius: radii[N] }
}

// ── makeConeStack ────────────────────────────────────────────────────────────────────
/**
 * Stacked kinked cone-frustum skirts (pine canopy). Base of the lowest skirt at y = 0, growing up.
 * Each skirt = frustum side + bottom rim disk (so the underside reads as a flat skirt edge).
 *
 * @param {{coneCount:number, baseRadius:number, coneHeight:number, overlap:number, bend:number,
 *          sides:number}} o
 * @param {() => number} rng
 */
export function makeConeStack(o, rng) {
  const C = Math.max(1, o.coneCount | 0)
  const sides = Math.max(3, o.sides | 0)
  const verts = []
  const push = (x, y, z) => verts.push(x, y, z)
  const rise = o.coneHeight * (1 - o.overlap)
  let y = 0
  for (let c = 0; c < C; c++) {
    const shrink = 1 - (c / C) * 0.72
    const rBot = o.baseRadius * shrink
    const rTop = rBot * 0.18
    const cx = (rng() * 2 - 1) * o.bend * o.baseRadius   // kink: per-cone lateral offset
    const cz = (rng() * 2 - 1) * o.bend * o.baseRadius
    const yb = y, yt = y + o.coneHeight
    for (let k = 0; k < sides; k++) {
      const a0 = (k / sides) * Math.PI * 2, a1 = ((k + 1) / sides) * Math.PI * 2
      const bx0 = cx + Math.cos(a0) * rBot, bz0 = cz + Math.sin(a0) * rBot
      const bx1 = cx + Math.cos(a1) * rBot, bz1 = cz + Math.sin(a1) * rBot
      const tx0 = cx + Math.cos(a0) * rTop, tz0 = cz + Math.sin(a0) * rTop
      const tx1 = cx + Math.cos(a1) * rTop, tz1 = cz + Math.sin(a1) * rTop
      // side (two tris)
      push(bx0, yb, bz0); push(bx1, yb, bz1); push(tx0, yt, tz0)
      push(bx1, yb, bz1); push(tx1, yt, tz1); push(tx0, yt, tz0)
      // bottom rim disk (skirt underside)
      push(cx, yb, cz); push(bx0, yb, bz0); push(bx1, yb, bz1)
    }
    y += rise
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}

// ── colour + merge helpers ────────────────────────────────────────────────────────────
/** Bake a uniform RGB vertex colour onto a geometry (adds a `color` attribute). */
export function fillColor(geo, hex) {
  const c = new THREE.Color(hex)
  const n = geo.attributes.position.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return geo
}

/**
 * Dependency-free merge of NON-INDEXED geometries sharing position/normal/color. Avoids the
 * BufferGeometryUtils import-path split between browser ('three/addons') and node
 * ('three/examples'). All inputs must be non-indexed with the same attributes.
 */
export function mergeGeometries(geos) {
  let total = 0
  for (const g of geos) total += g.attributes.position.count
  const pos = new Float32Array(total * 3)
  const nrm = new Float32Array(total * 3)
  const col = new Float32Array(total * 3)
  let off = 0
  for (const g of geos) {
    const p = g.attributes.position.array
    const nn = g.attributes.normal ? g.attributes.normal.array : null
    const cc = g.attributes.color ? g.attributes.color.array : null
    pos.set(p, off * 3)
    if (nn) nrm.set(nn, off * 3)
    if (cc) col.set(cc, off * 3); else col.fill(1, off * 3, off * 3 + p.length)
    off += g.attributes.position.count
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
  out.setAttribute('color', new THREE.BufferAttribute(col, 3))
  out.computeBoundingSphere()
  return out
}

/** Translate every vertex of a geometry by (dx,dy,dz) in place. */
export function translateGeo(geo, dx, dy, dz) {
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + dx, p.getY(i) + dy, p.getZ(i) + dz)
  p.needsUpdate = true
  return geo
}

/**
 * Assemble a trunk + canopy into ONE coloured, flat-shaded geometry (single draw per instance).
 * @param {{geo:THREE.BufferGeometry, topY:number}} trunk  (from makeKinkedTube)
 * @param {THREE.BufferGeometry} canopy
 * @param {number} barkHex
 * @param {number} canopyHex
 * @param {number} canopyDrop  how far the canopy base sits BELOW the trunk top (overlap), metres
 */
export function assembleTree(trunk, canopy, barkHex, canopyHex, canopyDrop = 0) {
  fillColor(trunk.geo, barkHex)
  fillColor(canopy, canopyHex)
  translateGeo(canopy, 0, trunk.topY - canopyDrop, 0)
  return mergeGeometries([trunk.geo, canopy])
}

export const _internal = { valueNoise3: _valueNoise3, range: _range }
