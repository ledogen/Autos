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
 * @returns {{geo: THREE.BufferGeometry, topX: number, topY: number, topZ: number, topRadius: number}}
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
  return { geo, topX: nodes[N].x, topY: nodes[N].y, topZ: nodes[N].z, topRadius: radii[N] }
}

// ── makeConeStack ────────────────────────────────────────────────────────────────────
/**
 * Stacked kinked cone-frustum skirts (pine canopy). Base of the lowest skirt at y = 0, growing up.
 *
 * Each skirt is a CLOSED SOLID frustum (CylinderGeometry with a small top radius), not an open
 * surface — so it reads opaque from every angle, including straight down (fixes the see-through
 * top: a single-sided open cone shows its culled backface from above). Flat-shaded.
 *
 * @param {{coneCount:number, baseRadius:number, coneHeight:number, overlap:number, bend:number,
 *          sides:number}} o
 * @param {() => number} rng
 */
export function makeConeStack(o, rng) {
  const C = Math.max(1, o.coneCount | 0)
  const sides = Math.max(3, o.sides | 0)
  const rise = o.coneHeight * (1 - o.overlap)
  const parts = []
  let y = 0
  for (let c = 0; c < C; c++) {
    const shrink = 1 - (c / C) * 0.72
    const rBot = o.baseRadius * shrink
    const rTop = rBot * 0.18
    // CLOSED frustum (caps on) → opaque solid with correct outward winding.
    const cyl = new THREE.CylinderGeometry(rTop, rBot, o.coneHeight, sides, 1, false)
    const cx = (rng() * 2 - 1) * o.bend * o.baseRadius   // kink: per-cone lateral offset
    const cz = (rng() * 2 - 1) * o.bend * o.baseRadius
    cyl.translate(cx, y + o.coneHeight / 2, cz)
    parts.push(cyl.toNonIndexed())   // non-indexed for flat shading + dependency-free merge
    y += rise
  }
  const geo = mergeGeometries(parts)   // ignores uv; carries position/normal
  geo.computeVertexNormals()           // flat per-face (non-indexed)
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
 * Bake `baseHex` everywhere with random per-FACE `fleckHex` patches (aspen bark: white + black
 * marks). Geometry must be non-indexed (one triple of verts per triangle). Deterministic given rng.
 */
export function fleckColor(geo, baseHex, fleckHex, chance, rng) {
  const base = new THREE.Color(baseHex), fleck = new THREE.Color(fleckHex)
  const n = geo.attributes.position.count
  const arr = new Float32Array(n * 3)
  for (let t = 0; t < n; t += 3) {
    const c = rng() < chance ? fleck : base
    for (let k = 0; k < 3; k++) { const i = (t + k) * 3; arr[i] = c.r; arr[i + 1] = c.g; arr[i + 2] = c.b }
  }
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
 * @param {number} offsetX  lateral X recentre of the canopy (e.g. onto the trunk's kinked tip)
 * @param {number} offsetZ  lateral Z recentre of the canopy
 * @param {?number} barkHex  pass null if the trunk geometry is already coloured (e.g. aspen flecks)
 */
export function assembleTree(trunk, canopy, barkHex, canopyHex, canopyDrop = 0, offsetX = 0, offsetZ = 0) {
  if (barkHex != null) fillColor(trunk.geo, barkHex)
  fillColor(canopy, canopyHex)
  translateGeo(canopy, offsetX, trunk.topY - canopyDrop, offsetZ)
  return mergeGeometries([trunk.geo, canopy])
}

// ── FEAT-85: roadside cover clumps — three Eastern Sierra natives ────────────────────
// All OPAQUE flat-shaded surfaces (ART-STYLE.md rule 7: no cutout foliage): grasses are fans of
// tapered blade strips with seed stalks, sagebrush is arching stems carrying crowns of small leaf
// cards. They render DoubleSide through the cover material (prop-palette.js), which also reads the
// `aSway` attribute baked here (0 at the root → ~1 at the tip, so the wind moves tips and never
// roots) and shrinks the clump toward its base past the fade distance.

class _TriBuilder {
  constructor() { this.pos = []; this.col = []; this.sway = [] }
  tri(a, b, c, ca, cb, cc, sa, sb, sc) {
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2])
    this.col.push(ca[0], ca[1], ca[2], cb[0], cb[1], cb[2], cc[0], cc[1], cc[2])
    this.sway.push(sa, sb, sc)
  }
  build() {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    geo.setAttribute('aSway', new THREE.Float32BufferAttribute(this.sway, 1))
    geo.computeVertexNormals()   // non-indexed → flat per-face normals
    geo.computeBoundingSphere()
    return geo
  }
}
const _hexLin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b] }
const _lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const _scale3 = (c, k) => [c[0] * k, c[1] * k, c[2] * k]

// One blade: a quad from the root to mid-height then a tip triangle, bending outward on a
// quadratic. `swayK` scales the tip motion (rye is heavier than ricegrass).
function _blade(B, rng, o, base, tip, hMax, swayK = 1) {
  const az = rng() * Math.PI * 2
  const ox = Math.cos(az), oz = Math.sin(az)              // outward direction of this blade
  const lx = -oz, lz = ox                                 // across the blade (its face looks outward)
  const r0 = rng() * o.spread[0] * 0.5                    // root offset from the clump centre
  const h = _range(rng, o.height[0], o.height[1])
  const lean = _range(rng, 0.25, 1.0) * o.spread[1]       // tip reach outward, fraction of height
  const w0 = o.width * _range(rng, 0.8, 1.2), w1 = w0 * 0.55
  const bx = ox * r0, bz = oz * r0
  const spine = (t) => [bx + ox * lean * h * t * t, h * (t - 0.18 * t * t * lean), bz + oz * lean * h * t * t]
  const shade = _range(rng, 0.86, 1.14)
  const col = (t) => _scale3(_lerp3(base, tip, t), shade)
  const sway = (t) => Math.pow(t, 1.4) * (h / hMax) * swayK
  const P0 = spine(0), P1 = spine(0.55), P2 = spine(1)
  const A0 = [P0[0] + lx * w0, P0[1], P0[2] + lz * w0], A1 = [P0[0] - lx * w0, P0[1], P0[2] - lz * w0]
  const M0 = [P1[0] + lx * w1, P1[1], P1[2] + lz * w1], M1 = [P1[0] - lx * w1, P1[1], P1[2] - lz * w1]
  B.tri(A0, A1, M1, col(0), col(0), col(0.55), sway(0), sway(0), sway(0.55))
  B.tri(A0, M1, M0, col(0), col(0.55), col(0.55), sway(0), sway(0.55), sway(0.55))
  B.tri(M0, M1, P2, col(0.55), col(0.55), col(1), sway(0.55), sway(0.55), sway(1))
}

// One seed stalk: a thin near-vertical strip with a diamond head (an airy ricegrass panicle or a
// wild-rye spike, by `headW`/`headL`). Straw-coloured.
function _stalk(B, rng, h, headW, headL, colour, hMax, swayK = 1) {
  const az = rng() * Math.PI * 2
  const ox = Math.cos(az), oz = Math.sin(az)
  const lx = -oz, lz = ox
  const lean = _range(rng, 0.05, 0.25)
  const r0 = rng() * 0.08
  const bx = ox * r0, bz = oz * r0
  const top = [bx + ox * lean * h, h, bz + oz * lean * h]
  const w = 0.012
  const sway = (t) => Math.pow(t, 1.3) * (h / hMax) * swayK
  B.tri([bx + lx * w, 0, bz + lz * w], [bx - lx * w, 0, bz - lz * w], [top[0] - lx * w, top[1], top[2] - lz * w], colour, colour, colour, sway(0), sway(0), sway(0.85))
  B.tri([bx + lx * w, 0, bz + lz * w], [top[0] - lx * w, top[1], top[2] - lz * w], [top[0] + lx * w, top[1], top[2] + lz * w], colour, colour, colour, sway(0), sway(0.85), sway(0.85))
  // head: diamond continuing up the stalk direction
  const ux = ox * lean, uy = 1, uz = oz * lean
  const ul = Math.hypot(ux, uy, uz)
  const dx = ux / ul, dy = uy / ul, dz = uz / ul
  const mid = [top[0] + dx * headL * 0.5, top[1] + dy * headL * 0.5, top[2] + dz * headL * 0.5]
  const end = [top[0] + dx * headL, top[1] + dy * headL, top[2] + dz * headL]
  const hc = _scale3(colour, 1.08)
  B.tri(top, [mid[0] + lx * headW, mid[1], mid[2] + lz * headW], end, hc, hc, hc, sway(0.85), sway(1), sway(1))
  B.tri(top, end, [mid[0] - lx * headW, mid[1], mid[2] - lz * headW], hc, hc, hc, sway(0.85), sway(1), sway(1))
}

/**
 * Small bunchgrass (Indian ricegrass): fine wiry blades fanning from the root plus a few airy
 * seed stalks with small open heads. ~3 tris a blade + 4 a stalk.
 * @param {{blades:[number,number], height:[number,number], spread:[number,number], width:number,
 *          stalks:[number,number], color:number, tipColor:number, stalkColor:number}} o
 */
export function makeGrassClump(o, rng) {
  const B = new _TriBuilder()
  const nb = Math.round(_range(rng, o.blades[0], o.blades[1]))
  const hMax = o.height[1] * 1.25
  const base = _hexLin(o.color), tip = _hexLin(o.tipColor), stalk = _hexLin(o.stalkColor)
  for (let i = 0; i < nb; i++) _blade(B, rng, o, base, tip, hMax, 1)
  const ns = o.stalks ? Math.round(_range(rng, o.stalks[0], o.stalks[1])) : 0
  for (let i = 0; i < ns; i++) _stalk(B, rng, o.height[1] * _range(rng, 0.95, 1.15), 0.035, 0.08, stalk, hMax, 1)
  return B.build()
}

/**
 * Great Basin wild rye: a big bunchgrass — broad, long, arching blue-green blades and tall
 * straight seed spikes standing above the clump. Heavier sway than ricegrass (0.8×).
 * @param {{blades:[number,number], height:[number,number], spread:[number,number], width:number,
 *          spikes:[number,number], color:number, tipColor:number, spikeColor:number}} o
 */
export function makeRyeClump(o, rng) {
  const B = new _TriBuilder()
  const nb = Math.round(_range(rng, o.blades[0], o.blades[1]))
  const hMax = o.height[1] * 1.3
  const base = _hexLin(o.color), tip = _hexLin(o.tipColor), spike = _hexLin(o.spikeColor)
  for (let i = 0; i < nb; i++) _blade(B, rng, o, base, tip, hMax, 0.8)
  const ns = o.spikes ? Math.round(_range(rng, o.spikes[0], o.spikes[1])) : 0
  for (let i = 0; i < ns; i++) _stalk(B, rng, o.height[1] * _range(rng, 0.95, 1.1), 0.025, 0.18, spike, hMax, 0.8)
  return B.build()
}

/**
 * Big sagebrush: gnarled stems arching out from a common base, each carrying two crowns of
 * three small grey-green leaf cards (tilted up from horizontal at random yaw). 14 tris a stem.
 * Woody — sways at 0.35×.
 * @param {{stems:[number,number], height:[number,number], spread:[number,number], leaf:number,
 *          stemColor:number, leafColor:number}} o
 */
export function makeSageClump(o, rng) {
  const B = new _TriBuilder()
  const ns = Math.round(_range(rng, o.stems[0], o.stems[1]))
  const hMax = o.height[1]
  const stemC = _hexLin(o.stemColor), leafC = _hexLin(o.leafColor)
  for (let i = 0; i < ns; i++) {
    const az = i * (Math.PI * 2 / ns) + rng() * (Math.PI / ns)   // spread the stems around the clump
    const ox = Math.cos(az), oz = Math.sin(az)
    const lx = -oz, lz = ox
    const h = _range(rng, o.height[0], o.height[1])
    const reach = _range(rng, 0.35, 1.0) * o.spread[1]
    const r0 = rng() * o.spread[0] * 0.3
    const bx = ox * r0, bz = oz * r0
    const kink = (rng() - 0.5) * 0.3                              // gnarl: a sideways jog mid-stem
    const spine = (t) => [bx + ox * reach * h * t * t * 0.9 + lx * kink * h * Math.sin(t * Math.PI), h * t * (1 - 0.15 * t), bz + oz * reach * h * t * t * 0.9 + lz * kink * h * Math.sin(t * Math.PI)]
    const sway = (t) => Math.pow(t, 1.3) * 0.35 * (h / hMax)
    const P0 = spine(0), P1 = spine(1)
    const w0 = 0.04, w1 = 0.014
    const S0 = [P0[0] + lx * w0, P0[1], P0[2] + lz * w0], S1 = [P0[0] - lx * w0, P0[1], P0[2] - lz * w0]
    const T0 = [P1[0] + lx * w1, P1[1], P1[2] + lz * w1], T1 = [P1[0] - lx * w1, P1[1], P1[2] - lz * w1]
    B.tri(S0, S1, T1, stemC, stemC, stemC, sway(0), sway(0), sway(1))
    B.tri(S0, T1, T0, stemC, stemC, stemC, sway(0), sway(1), sway(1))
    for (const t of [0.62, 1.0]) {
      const c = spine(t)
      const sw = sway(t)
      for (let k = 0; k < 3; k++) {
        const yaw = rng() * Math.PI * 2
        const pitch = _range(rng, 0.3, 1.1)                       // rad up from horizontal
        const L = o.leaf * _range(rng, 0.75, 1.25)
        const ux = Math.cos(yaw) * Math.cos(pitch), uy = Math.sin(pitch), uz = Math.sin(yaw) * Math.cos(pitch)
        const vx = -Math.sin(yaw), vz = Math.cos(yaw)
        const cx = c[0] + ux * L * 0.5, cy = c[1] + uy * L * 0.5, cz = c[2] + uz * L * 0.5
        const hw = L * 0.42
        const tipP = [c[0] + ux * L, c[1] + uy * L, c[2] + uz * L]
        const sL = [cx + vx * hw, cy, cz + vz * hw], sR = [cx - vx * hw, cy, cz - vz * hw]
        const lc = _scale3(leafC, _range(rng, 0.84, 1.16))
        B.tri(c, sL, tipP, lc, lc, lc, sw, sw, sw)
        B.tri(c, tipP, sR, lc, lc, lc, sw, sw, sw)
      }
    }
  }
  return B.build()
}

/**
 * FEAT-85 far-ring LOD: the cheap stand-ins the 'far' prop ring draws in place of the clumps
 * above (prop-system _placeChunk swaps the pool by key). Same silhouette and baked colours, a
 * fraction of the triangles — a tuft of `blades` tall triangles fanning from the root (3 tris for
 * ricegrass, 4 for rye) and a squat tent of leaf cards for sage (4 tris). At 60 m+ a clump is a
 * few pixels of colour and sway, which is all these carry. Opaque geometry like everything else.
 */
function _loTuft(o, rng, blades, colour, tipColour, hScale, swayK) {
  const B = new _TriBuilder()
  const base = _hexLin(colour), tip = _hexLin(tipColour)
  const h = _range(rng, o.height[0], o.height[1]) * hScale
  const w = o.spread[0] * 0.45
  for (let i = 0; i < blades; i++) {
    const az = i * (Math.PI * 2 / blades) + rng() * 0.6
    const ox = Math.cos(az), oz = Math.sin(az), lx = -oz, lz = ox
    const lean = _range(rng, 0.2, 0.6) * o.spread[1]
    const shade = _range(rng, 0.88, 1.12)
    const c0 = _scale3(base, shade), c1 = _scale3(tip, shade)
    B.tri([lx * w, 0, lz * w], [-lx * w, 0, -lz * w], [ox * lean * h, h, oz * lean * h], c0, c0, c1, 0, 0, swayK)
  }
  return B.build()
}
export function makeGrassLo(o, rng) { return _loTuft(o, rng, 3, o.color, o.tipColor, 1.0, 1.0) }
export function makeRyeLo(o, rng)   { return _loTuft(o, rng, 4, o.color, o.tipColor, 1.0, 0.8) }
export function makeSageLo(o, rng) {
  const B = new _TriBuilder()
  const leaf = _hexLin(o.leafColor)
  const h = _range(rng, o.height[0], o.height[1]) * 0.8
  const r = _range(rng, o.spread[0], o.spread[1]) * 0.9
  const apex = [0, h, 0]
  const n = 4
  for (let i = 0; i < n; i++) {
    const a0 = i * (Math.PI * 2 / n) + rng() * 0.4, a1 = a0 + Math.PI * 2 / n
    const c = _scale3(leaf, _range(rng, 0.84, 1.1))
    B.tri([Math.cos(a0) * r, 0.05, Math.sin(a0) * r], [Math.cos(a1) * r, 0.05, Math.sin(a1) * r], apex, c, c, c, 0, 0, 0.35)
  }
  return B.build()
}
