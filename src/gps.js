/**
 * src/gps.js — FEAT-39 GPS navigation assist: a minimal in-world route overlay.
 *
 * Two cues, nothing else:
 *   1. CHEVRONS — flat "V" glyphs painted just above the ribbon, pinned to a fixed lattice in
 *      world space so you drive INTO them rather than pushing them along ahead of you. They say
 *      "you are on the route", and each dissolves as you reach it.
 *   2. JUNCTION ARROW — a flat board standing UPRIGHT at the next intersection, aimed straight
 *      down the road you should take. Upright because a horizontal glyph is met almost exactly
 *      edge-on from a chase cam, which is the one orientation a driver cannot read. Shown only at
 *      REAL intersections — graph nodes of degree 3+ — never at a degree-2 node where the road is
 *      just bending through. That filter is what keeps the overlay non-invasive.
 * Plus a slow ring at the destination, so the last leg has a target (mission arrival is a bare
 * 28 m radius otherwise).
 *
 * This is a GUIDANCE aid, per FEAT-39: it never touches the input path, the physics, or the par
 * oracle. It reads the route the mission already computed (`mission.segments`, built in
 * mission.js `_roll()`) and nothing else — no RoadSystem query per frame, so it is also free of
 * road-streaming coupling.
 *
 * The route math (bakeRoute / advanceProgress / sampleRoute) is deliberately THREE-free and
 * exported, so test/gps-route.mjs can exercise it headlessly.
 */

import * as THREE from 'three'

// ── tuning ──────────────────────────────────────────────────────────────────────────────────
const BAKE_DS      = 6      // m between baked route vertices
const CHEV_COUNT   = 10     // chevrons alive at once (the pool that gets recycled forward)
const CHEV_SPACING = 15     // m between chevrons — also the world lattice they are pinned to
// Low and flat, like road paint. Height is a trap for these: lifted clear of the surface they
// float above crests instead of following them, and a horizontal glyph seen from a low chase cam
// is nearly edge-on, so the higher it sits the thinner it reads.
const CHEV_HOVER   = 0.35   // m above the routed road surface
const CHEV_FADE    = 3      // chevrons over which the far end ramps in
const CHEV_NEAR    = 20     // m: a chevron fades out over the last stretch as you drive into it
const ARROW_HOVER  = 1.2    // m: the board's bottom edge clears the road by this much
const ARROW_IN     = 140    // m: arrow starts fading in
const ARROW_FULL   = 110    // m: fully opaque
const ARROW_PAST   = 12     // m past the node before it is dropped
const RING_HOVER   = 1.4
const TAN_SPAN     = 20     // m of route averaged into the exit direction at a junction
const REACQUIRE_M  = 40     // lateral error that forces a full-route re-scan
const GPS_COLOR    = 0x66e0ff

// ── pure route math (THREE-free — gated by test/gps-route.mjs) ──────────────────────────────

/**
 * Flatten a mission route into a world polyline with elevation, plus its junctions.
 *
 * @param {Array<{centerline: {pointAt(s): {x,z}, length: number}, gradeAt: (s)=>number,
 *                s0: number, s1: number}>} segments  ordered in TRAVEL order; s1 < s0 means the
 *   edge is driven backwards (mission.js:424). Endpoints of the first/last edge are mid-edge.
 * @returns {{px: Float64Array, py: Float64Array, pz: Float64Array, cum: Float64Array,
 *            n: number, length: number, junctions: Array<{i:number,s:number,angle:number,turn:string}>}}
 *   `cum` is cumulative 3D arc from the route start. `junctions[].i` indexes the shared vertex.
 */
export function bakeRoute (segments) {
  if (!segments || segments.length < 1) return null
  const xs = [], ys = [], zs = [], joinIdx = []

  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si]
    const span = seg.s1 - seg.s0
    const n = Math.max(1, Math.ceil(Math.abs(span) / BAKE_DS))
    // j starts at 1 for every segment after the first: the join vertex was already pushed as the
    // previous segment's endpoint, and duplicating it would put a zero-length span in `cum`.
    for (let j = (si === 0 ? 0 : 1); j <= n; j++) {
      const s = seg.s0 + span * (j / n)
      const p = seg.centerline.pointAt(s)
      xs.push(p.x); ys.push(seg.gradeAt(s)); zs.push(p.z)
    }
    if (si < segments.length - 1) joinIdx.push(xs.length - 1)
  }

  const n = xs.length
  const px = Float64Array.from(xs), py = Float64Array.from(ys), pz = Float64Array.from(zs)
  const cum = new Float64Array(n)
  for (let i = 1; i < n; i++) {
    cum[i] = cum[i - 1] + Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1], pz[i] - pz[i - 1])
  }
  const route = { px, py, pz, cum, n, length: cum[n - 1], junctions: [] }

  // Only REAL intersections get an arrow. `endDeg` is the degree of the graph node the edge ends
  // at (tagged in mission.js `_roll()`); degree 2 is the road bending through, and no angle
  // threshold can distinguish that from a junction — this network kinks hard at degree-2 nodes.
  // A missing tag is treated as a junction so a plumbing break is visible rather than silent.
  for (let k = 0; k < joinIdx.length; k++) {
    const i = joinIdx[k]
    const deg = segments[k].endDeg ?? 3
    if (deg < 3) continue
    const out = _dirFwd(route, i, TAN_SPAN)
    if (!out) continue
    route.junctions.push({ i, s: cum[i], deg, ox: out.x, oz: out.z })
  }
  return route
}

/**
 * Where along the baked route is (x, z)?
 *
 * Windowed around `lastIdx` so it costs ~50 distance tests a frame and stays monotonic through
 * a route that doubles back on itself. Falls back to a full scan when the lateral error blows
 * past REACQUIRE_M, so a wrong turn (or a teleport) re-acquires cleanly.
 *
 * @returns {{idx: number, s: number, lat: number}} s = arc along the route, lat = lateral error.
 */
export function advanceProgress (route, x, z, lastIdx = 0) {
  let best = _scanNearest(route, x, z, Math.max(0, lastIdx - 8), Math.min(route.n - 1, lastIdx + 40))
  if (best.lat > REACQUIRE_M) {
    const full = _scanNearest(route, x, z, 0, route.n - 1)
    if (full.lat < best.lat) best = full
  }
  return best
}

function _scanNearest (route, x, z, i0, i1) {
  const { px, pz, cum } = route
  let bi = i0, bd = Infinity
  for (let i = i0; i <= i1; i++) {
    const d = (px[i] - x) ** 2 + (pz[i] - z) ** 2
    if (d < bd) { bd = d; bi = i }
  }
  // Refine against the two adjacent spans so `s` is continuous rather than quantised to BAKE_DS.
  let bs = cum[bi], blat = Math.sqrt(bd)
  for (const j of [bi - 1, bi]) {
    if (j < 0 || j + 1 >= route.n) continue
    const ax = px[j], az = pz[j], bx = px[j + 1], bz = pz[j + 1]
    const ex = bx - ax, ez = bz - az
    const L2 = ex * ex + ez * ez
    if (L2 < 1e-9) continue
    const t = Math.min(1, Math.max(0, ((x - ax) * ex + (z - az) * ez) / L2))
    const lat = Math.hypot(ax + ex * t - x, az + ez * t - z)
    if (lat < blat) { blat = lat; bs = cum[j] + (cum[j + 1] - cum[j]) * t; bi = j }
  }
  return { idx: bi, s: bs, lat: blat }
}

/** Unit XZ direction leaving vertex `i`, averaged forward over `span` metres. */
function _dirFwd (route, i, span) {
  let j = i
  while (j < route.n - 1 && route.cum[j] - route.cum[i] < span) j++
  return _unit(route.px[j] - route.px[i], route.pz[j] - route.pz[i])
}

function _unit (x, z) {
  const m = Math.hypot(x, z)
  return m < 1e-6 ? null : { x: x / m, z: z / m }
}

/**
 * Interpolated world point + travel direction at arc `s` along the route.
 * `hint` is a starting vertex index (the caller marches forward, so this is O(1) amortised).
 */
export function sampleRoute (route, s, hint = 0) {
  const { px, py, pz, cum, n } = route
  const sc = Math.min(Math.max(s, 0), cum[n - 1])
  let i = Math.min(Math.max(hint, 0), n - 2)
  while (i > 0 && cum[i] > sc) i--
  while (i < n - 2 && cum[i + 1] < sc) i++
  const span = cum[i + 1] - cum[i]
  const t = span > 1e-6 ? (sc - cum[i]) / span : 0
  const dir = _unit(px[i + 1] - px[i], pz[i + 1] - pz[i]) || { x: 0, z: 1 }
  return {
    x: px[i] + (px[i + 1] - px[i]) * t,
    y: py[i] + (py[i + 1] - py[i]) * t,
    z: pz[i] + (pz[i + 1] - pz[i]) * t,
    dx: dir.x, dz: dir.z, idx: i,
  }
}

// ── geometry ────────────────────────────────────────────────────────────────────────────────

/**
 * A flat "V" chevron lying in XZ, apex pointing local +Z (the travel direction). Hand-built
 * rather than extruded: it is four triangles and needs no shape triangulation at load.
 */
function _chevronGeometry () {
  const W = 1.5, D = 1.6, T = 0.6
  //      p0 apex-outer            p3 apex-inner
  const p = [
    [0, D / 2], [W, -D / 2], [W, -D / 2 - T], [0, D / 2 - T], [-W, -D / 2], [-W, -D / 2 - T],
  ]
  const tri = [[0, 1, 2], [0, 2, 3], [0, 3, 5], [0, 5, 4]]   // wound so the normal is +Y
  const pos = []
  for (const [a, b, c] of tri) {
    for (const k of [a, b, c]) pos.push(p[k][0], 0, p[k][1])
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

/**
 * The junction arrow: a plain flat arrow standing UPRIGHT on its edge, like a sign board, tip
 * pointing along local +X.
 *
 * It stands vertically because a horizontal glyph is the one thing a driver cannot see — from a
 * chase cam you meet it almost exactly edge-on, which is what killed the earlier flat curved
 * version. Standing up, it presents its face; and because the whole board is aimed straight down
 * the road you are meant to take, the direction it indicates IS its orientation. No left/right
 * variants, no turn-angle sweep — the road does the talking.
 *
 * Built in XY (x = along the arrow, y = up) with its bottom edge on y = 0, so the mesh position
 * is where it stands.
 */
function _arrowGeometry () {
  const L = 7.5, hl = 3.2, shaft = 1.5, hw = 3.2   // total length, head length, shaft/head heights
  const s = new THREE.Shape()
  s.moveTo(0, -shaft / 2)
  s.lineTo(L - hl, -shaft / 2)
  s.lineTo(L - hl, -hw / 2)
  s.lineTo(L, 0)
  s.lineTo(L - hl, hw / 2)
  s.lineTo(L - hl, shaft / 2)
  s.lineTo(0, shaft / 2)
  s.closePath()
  const g = new THREE.ShapeGeometry(s)
  // Centre it on the node along its length, and lift so the board sits ON the mesh origin.
  g.translate(-L / 2, hw / 2, 0)
  return g
}

// ── the system ──────────────────────────────────────────────────────────────────────────────

export class GpsSystem {
  /**
   * @param {THREE.Scene} scene
   * @param {{ getRoute: () => object|null, getCar: () => {x:number,z:number} }} opts
   *   getRoute returns the live mission object (with `.segments`) while navigation should be
   *   shown, else null. Identity change ⇒ rebake.
   */
  constructor (scene, { getRoute, getCar }) {
    this._scene = scene
    this._getRoute = getRoute
    this._getCar = getCar
    this._route = null
    this._src = null          // the mission object the current bake came from (identity compare)
    this._idx = 0
    this._t = 0

    this.group = new THREE.Group()
    this.group.name = 'gps'
    this.group.renderOrder = 3
    scene.add(this.group)

    // Additive so the distance fade is honest (a brightness ramp on an opaque glyph just reads as
    // a different colour) and so the overlay never hides the road under it.
    const mat = () => new THREE.MeshBasicMaterial({
      color: GPS_COLOR, transparent: true, depthWrite: false, toneMapped: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    })

    this._chevGeo = _chevronGeometry()
    this._chevMat = mat()
    this._chev = new THREE.InstancedMesh(this._chevGeo, this._chevMat, CHEV_COUNT)
    this._chev.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this._chev.frustumCulled = false
    this._chev.renderOrder = 3
    this._chev.visible = false
    for (let i = 0; i < CHEV_COUNT; i++) this._chev.setColorAt(i, new THREE.Color(1, 1, 1))
    this.group.add(this._chev)

    this._arrowGeo = _arrowGeometry()
    this._arrowMat = mat()
    this._arrow = new THREE.Mesh(this._arrowGeo, this._arrowMat)
    this._arrow.frustumCulled = false
    this._arrow.renderOrder = 3
    this._arrow.visible = false
    this.group.add(this._arrow)

    this._ringGeo = new THREE.TorusGeometry(6, 0.35, 8, 40)
    this._ringGeo.rotateX(Math.PI / 2)
    this._ringMat = mat()
    this._ring = new THREE.Mesh(this._ringGeo, this._ringMat)
    this._ring.frustumCulled = false
    this._ring.renderOrder = 3
    this._ring.visible = false
    this.group.add(this._ring)

    this._dummy = new THREE.Object3D()
    this._col = new THREE.Color()
    this.enabled = true
  }

  /** FEAT-41 seam: the story-mode assists page flips this (also exposed as window.__setGpsEnabled). */
  setEnabled (v) {
    this.enabled = !!v
    if (!this.enabled) this._hideAll()
  }

  /** Drop the baked route (seed change / world teardown). Re-bakes on the next update. */
  clearRoute () { this._route = null; this._src = null; this._hideAll() }

  _hideAll () { this._chev.visible = false; this._arrow.visible = false; this._ring.visible = false }

  update (dt) {
    if (!this.enabled) return
    const mission = this._getRoute?.()
    if (!mission || !mission.segments?.length) {
      if (this._route) this.clearRoute()
      return
    }
    if (mission !== this._src) {
      this._src = mission
      this._route = bakeRoute(mission.segments)
      this._idx = 0
    }
    const route = this._route
    if (!route || route.n < 2) { this._hideAll(); return }

    this._t += dt
    const car = this._getCar()
    const prog = advanceProgress(route, car.x, car.z, this._idx)
    this._idx = prog.idx

    this._placeChevrons(route, prog.s)
    this._placeArrow(route, prog.s)
    this._placeRing(route, prog.s)
  }

  /**
   * Chevrons are pinned to a FIXED lattice in world space — arc `k * CHEV_SPACING` along the
   * route — not to an offset ahead of the truck. So they hold still and you drive into them,
   * rather than gliding along in front of you like a tow rope. The ten instances are just a pool
   * recycled forward: as `s` crosses a lattice step every instance shifts one slot, and the
   * lattice positions themselves never move.
   */
  _placeChevrons (route, s) {
    const k0 = Math.floor(s / CHEV_SPACING)
    let hint = this._idx
    let any = false
    for (let i = 0; i < CHEV_COUNT; i++) {
      const sc = (k0 + i) * CHEV_SPACING
      // Fade in at the far end, and fade OUT over the last CHEV_NEAR metres — the one you are
      // about to reach dissolves instead of vanishing under the bumper.
      const far  = Math.min(1, (CHEV_COUNT - 1 - i) / CHEV_FADE)
      const near = Math.min(1, Math.max(0, (sc - s) / CHEV_NEAR))
      const k = Math.min(far, near)
      const d = this._dummy
      if (sc > route.length || k <= 0.01) {
        d.scale.setScalar(0)          // past the destination, or already driven through
        d.position.set(0, -1e4, 0)
        d.updateMatrix()
        this._chev.setMatrixAt(i, d.matrix)
        continue
      }
      const p = sampleRoute(route, sc, hint)
      hint = p.idx
      d.position.set(p.x, p.y + CHEV_HOVER, p.z)
      d.rotation.set(0, Math.atan2(p.dx, p.dz), 0)   // rotY maps local +Z onto (sin, cos)
      d.scale.setScalar(1)
      d.updateMatrix()
      this._chev.setMatrixAt(i, d.matrix)
      this._chev.setColorAt(i, this._col.setScalar(k))
      any = true
    }
    this._chev.instanceMatrix.needsUpdate = true
    if (this._chev.instanceColor) this._chev.instanceColor.needsUpdate = true
    this._chev.visible = any
  }

  _placeArrow (route, s) {
    // The next real intersection ahead. bakeRoute has already dropped degree-2 nodes, so every
    // entry here is somewhere the driver genuinely has a choice.
    let j = null
    for (const jn of route.junctions) {
      if (jn.s - s < -ARROW_PAST) continue
      if (jn.s - s > ARROW_IN) break
      j = jn; break
    }
    if (!j) { this._arrow.visible = false; return }

    const dist = j.s - s
    const fade = dist > ARROW_FULL
      ? 1 - (dist - ARROW_FULL) / (ARROW_IN - ARROW_FULL)
      : Math.min(1, (dist + ARROW_PAST) / ARROW_PAST)      // fades back out just past the node
    this._arrow.position.set(
      route.px[j.i],
      route.py[j.i] + ARROW_HOVER + Math.sin(this._t * 1.6) * 0.12,
      route.pz[j.i])
    // Board stands upright, aimed straight down the EXIT road: rotY maps local +X onto
    // (cos, -sin), so yaw = atan2(-oz, ox) puts the tip on the outgoing direction.
    this._arrow.rotation.set(0, Math.atan2(-j.oz, j.ox), 0)
    this._arrowMat.opacity = Math.max(0, Math.min(1, fade))
    this._arrow.visible = this._arrowMat.opacity > 0.02
  }

  _placeRing (route, s) {
    const remain = route.length - s
    if (remain > 260) { this._ring.visible = false; return }
    const n = route.n - 1
    this._ring.position.set(route.px[n], route.py[n] + RING_HOVER, route.pz[n])
    this._ring.rotation.y = this._t * 0.5
    this._ringMat.opacity = Math.min(1, (260 - remain) / 60)
    this._ring.visible = true
  }

  dispose () {
    this.group.removeFromParent()
    this._chevGeo.dispose(); this._chevMat.dispose()
    this._arrowGeo.dispose(); this._arrowMat.dispose()
    this._ringGeo.dispose(); this._ringMat.dispose()
    this._chev.dispose()
    this._route = null; this._src = null
  }
}

/**
 * Self-contained lil-gui folder (same pattern as addPropGui) so debug.js stays untouched.
 * Default ON: until the FEAT-41 assists page exists, playtesters and par calibration want it up.
 */
export function addGpsGui (gui, gps) {
  const f = gui.addFolder('GPS (FEAT-39)')
  f.close()
  const state = { enabled: true }
  f.add(state, 'enabled').name('Navigation arrows').onChange(v => gps.setEnabled(v))
  return f
}
