/**
 * src/rockslide.js — FEAT-26: rock slides (DEC-400, owner 2026-11-17, alpha, no spirit ties).
 *
 * A batch of rocks released on a cut slope above the road, timed so they cross the truck's line as it
 * gets there. Three parts, all pure but the last:
 *   • ROCKS — the game's own rock blobs (prop-geometry makeBlob with the scatter's medium-rock shape,
 *     data/flora.js medRock), sized up to slide rocks. No model file: the world's rocks are these blobs.
 *   • CANDIDACY — walk a run's centreline, sample the ground across it, and keep a station whose side
 *     slope rises steeply from the road (SLIDE.minDeg over at least SLIDE.minDropM) with a clear sight
 *     line from the approach. Computed from road + height queries near the truck; nothing is saved.
 *   • DIRECTOR — a memoryless (Poisson) draw per metre driven arms a slide; the next candidate ahead is
 *     picked, and the rocks are released when the truck is `arrival time × speed` from the impact point.
 *
 * Built against handles: rock bodies go through DebrisSystem (debris.js owns every engine call), the road
 * and ground through the callbacks main.js hands in. No engine types here (CLAUDE.md § Import seams).
 *
 * SM-INV-12: this is a runtime EVENT, not placement — it reads the world, it never writes it. A slide is
 * never saved: a reload drops the rocks in flight and the armed draw (save.js carries neither).
 */

import * as THREE from 'three'
import { makeBlob, fillColor } from './props/prop-geometry.js'
import { FLORA_PARAMS } from '../data/flora.js'
import { mulberry32 } from './seed.js'

// ── Numbers (FEAT-26 study, test/rockslide-study.mjs; the table is in the ticket) ─────────────────────
export const SLIDE = {
  perKm: 1 / 20,          // mean slides per km driven (DEC-400: "once in ~20km")
  rocksMin: 5, rocksMax: 15,
  patchM: 3,              // the release patch, square on the slope (DEC-400)
  rockR: [0.15, 0.32],    // m, blob radius (medRock shape ×1.25 long, ×0.7 tall): ~25–300 kg of granite
  density: 2650,          // kg/m³ granite (the hull is solid, so this IS the material)
  friction: 0.7, restitution: 0.15,   // debris.js `rock`
  // v0 m/s down the fall line at release, with the matching rolling spin. The study (30 seeds, 180 real cuts): at 0 m/s
  // 82 % of slides put a rock into the face-side lane, at 6 m/s 98 % (and 81 % put three), and the arrival scatter
  // shrinks (p10–p90 3.8–5.8 s → 2.2–4.2 s). DEC-400's "optional slope aligned velocity": it adds consistency, so it is on.
  v0: 6,
  // Rounder than the scatter's medRock (1.25 × 0.7 × 1.0): a flat blob slides and stops in the ditch (33 % reach the
  // lane at 4 m/s against 46 % round). Same blob generator, same colour, same faceting.
  axisScale: [1.1, 0.9, 1.0],
  // Candidacy
  stepM: 5,               // station spacing along a run
  minDeg: 35,             // every 1 m step of the face at least this steep…
  minDropM: 4,            // …over at least this much height above the toe
  maxDropM: 12,           // release no higher than this above the toe
  toeMaxM: 8,             // the face's toe within this of the deck edge (the 2.5 m shoulder + the carve blend)
  toeMaxDy: 2.5,          // and within this of deck height (not a terrace)
  reachM: 30,             // how far across from the deck edge the face is searched
  endClearM: 40,          // never within this of a run end (junction pads, nodes)
  fallSkewMax: 0.5,       // along-road share of the fall line (tan ≈ 27°): the rocks come ACROSS
  // Sight (stopping sight distance: perception-reaction + braking)
  reactS: 1.5, brakeMs2: 6, eyeH: 1.3,
  // Timing (the study's arrival model: t = a + b·√(drop) + lateral/v_road)
  fadeS: 0.5,
  minSpeed: 5,            // m/s — slower than this, the director holds its pick
  // Cleanup, the owner's rule (2026-10-15, on the ticket; dead deer FEAT-111 the same): resting rocks stay where they
  // land and go once their ground chunk is unloaded AND keepH game hours have passed ("an hour or two"). Out of the
  // chunk ring sooner, they are frozen (no collider under them) and wake when it streams back. Never in view.
  keepH: 1.5,
  maxSlides: 4,           // past this the oldest slide whose ground is unloaded goes (a long free-roam drive)
}

/**
 * The slide rocks: `n` variants of the scatter's medium-rock blob at slide size. Flat-shaded, vertex-coloured
 * (the scatter's medRock colour), deterministic (a fixed seed: the rocks are not world placement).
 * @returns {THREE.BufferGeometry[]}
 */
export function slideRockGeos (n = 6, seed = 0x51ade, axisScale = SLIDE.axisScale) {
  const rng = mulberry32(seed)
  return Array.from({ length: n }, (_, i) => rockGeo(SLIDE.rockR[0] + (SLIDE.rockR[1] - SLIDE.rockR[0]) * (n > 1 ? i / (n - 1) : 0.5), rng, axisScale))
}

/** One slide rock of blob radius `radius` [m]: the medRock blob shape at subdiv 1 (80 faces), centred on its bbox. */
export function rockGeo (radius, rng, axisScale = FLORA_PARAMS.medRock.blob.axisScale) {
  const B = FLORA_PARAMS.medRock.blob
  const geo = makeBlob({ radius, axisScale, irregularity: B.irregularity, noiseFreq: B.noiseFreq, subdiv: 1 }, rng)
  geo.computeBoundingBox()
  const c = geo.boundingBox.getCenter(new THREE.Vector3())
  geo.translate(-c.x, -c.y, -c.z)
  return fillColor(geo, FLORA_PARAMS.medRock.color)
}

// ── Candidacy (pure: a height callback and a run's polyline) ──────────────────────────────────────────

/** Point + unit XZ tangent on a run polyline (`pts` with .x/.y/.z, `cum` its arc) at arc s, into `out`. */
export function runAt (pts, cum, s, out = {}) {
  const n = cum.length
  let lo = 0, hi = n - 1
  if (s <= cum[0]) hi = 1
  else if (s >= cum[n - 1]) lo = n - 2
  else while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m }
  const a = pts[lo], b = pts[hi], span = cum[hi] - cum[lo]
  const t = span > 1e-9 ? Math.max(0, Math.min(1, (s - cum[lo]) / span)) : 0
  const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1
  out.x = a.x + (b.x - a.x) * t; out.y = a.y + (b.y - a.y) * t; out.z = a.z + (b.z - a.z) * t
  out.tx = tx / l; out.tz = tz / l
  return out
}

/**
 * The slide face on one side of a road station, or null. Walks the ground outward from the deck edge in 1 m steps:
 * the face starts (its TOE) within toeMaxM of the deck edge and toeMaxDy of deck height, and every step from there
 * up rises at ≥ minDeg; at least minDropM of it. The release patch sits on the face (its centre a patch half-length
 * below the top, never above maxDropM), and the fall line there must point across the road, not along it.
 * @param {(x:number, z:number) => number} heightAt - the ground the rocks will roll on (terrain + road carve).
 * @param {{x,y,z,tx,tz}} c - centreline station (runAt). `side` +1 = left of the tangent, −1 = right.
 * @returns {null | { side, toeD, dropM, deg, relD, rel: {x,y,z}, fall: {x,z,deg} }}
 */
export function faceAt (heightAt, c, side, halfW = 5, P = SLIDE) {
  const nx = -c.tz * side, nz = c.tx * side
  const h = (d) => heightAt(c.x + nx * d, c.z + nz * d) - c.y
  const tanMin = Math.tan(P.minDeg * Math.PI / 180)
  let toe = -1, hPrev = h(halfW)
  for (let d = halfW; d < halfW + P.toeMaxM + 1; d++) {
    const hn = h(d + 1)
    if (hn - hPrev >= tanMin) { toe = d; break }
    hPrev = hn
  }
  if (toe < 0) return null
  const hToe = h(toe)
  if (hToe > P.toeMaxDy) return null
  let top = toe, hTop = hToe
  for (let d = toe + 1; d <= halfW + P.reachM; d++) {
    const hn = h(d)
    if (hn - hTop < tanMin || hn - hToe > P.maxDropM + P.patchM) break
    top = d; hTop = hn
  }
  const dropM = hTop - hToe
  if (dropM < P.minDropM) return null
  // Patch centre: half a patch (along the face) below the top, capped at maxDropM above the toe.
  const relH = Math.min(dropM - P.patchM / 2 * Math.sin(Math.atan2(dropM, top - toe)), P.maxDropM)
  let relD = toe
  for (let d = toe; d <= top; d += 0.25) { relD = d; if (h(d) - hToe >= relH) break }
  const rx = c.x + nx * relD, rz = c.z + nz * relD
  const ry = heightAt(rx, rz)
  // Fall line at the patch: the ground gradient, across (toward the road) vs along.
  const gA = (heightAt(rx + c.tx, rz + c.tz) - heightAt(rx - c.tx, rz - c.tz)) / 2
  const gN = (heightAt(rx + nx, rz + nz) - heightAt(rx - nx, rz - nz)) / 2
  if (!(gN > 0) || Math.abs(gA) > P.fallSkewMax * gN) return null
  const gl = Math.hypot(gA, gN)
  return { side, toeD: toe - halfW, dropM: ry - c.y - hToe, deg: Math.atan2(relH, relD - toe) * 180 / Math.PI, relD,
    rel: { x: rx, y: ry, z: rz }, fall: { x: -(gA * c.tx + gN * nx) / gl, z: -(gA * c.tz + gN * nz) / gl, deg: Math.atan(gl) * 180 / Math.PI } }
}

/** Stopping sight distance at v [m/s]: perception-reaction plus braking (SLIDE.reactS, SLIDE.brakeMs2). */
export const sightNeedM = (v, P = SLIDE) => v * P.reactS + v * v / (2 * P.brakeMs2)

/** Does the ground stay below the straight line a→b (excluding `skipEnd` m at b, the target's own ground)? */
export function lineClear (heightAt, a, b, stepM = 2, skipEnd = 2.5) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.hypot(dx, dz)
  for (let s = stepM; s < L - skipEnd; s += stepM) {
    const t = s / L
    if (heightAt(a.x + dx * t, a.z + dz * t) > a.y + dy * t) return false
  }
  return true
}

// ── The batch ───────────────────────────────────────────────────────────────────────────────────────

const _randQuat = (rng) => {
  const u1 = rng(), u2 = rng() * 2 * Math.PI, u3 = rng() * 2 * Math.PI
  const a = Math.sqrt(1 - u1), b = Math.sqrt(u1)
  return { x: a * Math.sin(u2), y: a * Math.cos(u2), z: b * Math.sin(u3), w: b * Math.cos(u3) }
}

/**
 * The bodies of one slide: n rocks (variant indices into `radii`) laid in a patchM square on the face, centred on
 * `face.rel` and aligned to its fall line, each resting just clear of the ground (a second layer above when the
 * patch is full), released at v0 down the fall line with the rolling spin that matches it.
 * @param {(x,z)=>number} heightAt
 * @param {object} face - faceAt()
 * @param {number[]} radii - bounding radius per variant [m]
 * @returns {Array<{ variant, position, quaternion, velocity, spin }>}
 */
export function batchBodies (heightAt, face, radii, rng, { n = null, v0 = SLIDE.v0, patch = SLIDE.patchM } = {}) {
  n ??= SLIDE.rocksMin + Math.floor(rng() * (SLIDE.rocksMax - SLIDE.rocksMin + 1))
  const fx = face.fall.x, fz = face.fall.z, wx = -fz, wz = fx
  const tf = Math.tan(face.fall.deg * Math.PI / 180), cf = Math.cos(face.fall.deg * Math.PI / 180)
  const placed = [], out = []
  for (let i = 0; i < n; i++) {
    const variant = Math.floor(rng() * radii.length), r = radii[variant]
    let p = null
    for (let tries = 0; tries < 40 && !p; tries++) {
      const u = (rng() - 0.5) * patch, w = (rng() - 0.5) * patch
      const x = face.rel.x + fx * u + wx * w, z = face.rel.z + fz * u + wz * w
      const g = heightAt(x, z)
      for (let lift = 0; lift < 3 && !p; lift++) {
        const q = { x, y: g + (r + 0.03) / cf + lift * 0.9, z, r }
        if (placed.every(o => Math.hypot(o.x - q.x, o.y - q.y, o.z - q.z) > o.r + r + 0.02)) p = q
      }
    }
    if (!p) continue
    placed.push(p)
    const vy = -tf * v0 * cf, vh = v0 * cf   // v0 along the face, down the fall line
    out.push({ variant, position: { x: p.x, y: p.y, z: p.z }, quaternion: _randQuat(rng),
      velocity: { x: fx * vh, y: vy, z: fz * vh }, spin: { x: fz * v0 / r, y: 0, z: -fx * v0 / r } })
  }
  return out
}

/**
 * Arrival model [s]: release → a rock crossing lateral `latM` m past the face's toe (toward and across the road).
 * Least squares over the study's real cuts (test/rockslide-study.mjs --real, round rocks at v0 6 m/s, every rock that
 * reached the lane): a + b·√drop + latM / vRoad. Valid over the candidates' range (drop 4–12 m, lat 6–11 m).
 */
export const ARRIVAL = { a: -0.48, b: 0.69, vRoad: 5.1 }   // 977 rocks; |residual| p50 0.41 s, p90 1.0 s
export const arrivalS = (face, latM, A = ARRIVAL) => A.a + A.b * Math.sqrt(face.dropM) + Math.max(0, latM) / A.vRoad

/**
 * Is arc `s` of run `e` (approached in direction `dir`, +1 = increasing arc, at speed v) a slide candidate?
 * Returns the face + the impact point on the lane `laneOff` m from the centreline toward the face, or null.
 * `road` gives the pads (poiPadBlocked / junctionPadBlocked), `e` the run (points, polyCum, tunnelSpans).
 */
export function candidateAt (road, heightAt, e, s, dir, v, { halfW = 5, laneOff = 2.5, P = SLIDE } = {}) {
  const pts = e.points, cum = e.polyCum, L = cum[cum.length - 1]
  if (s < P.endClearM || s > L - P.endClearM) return null
  const c = runAt(pts, cum, s)
  for (const side of [1, -1]) {
    const face = faceAt(heightAt, c, side, halfW, P)
    if (!face) continue
    const nx = -c.tz * side, nz = c.tx * side
    const lat = halfW + face.toeD - laneOff   // toe → the lane centre on the face side [m]
    const T = arrivalS(face, lat)
    const D = Math.max(sightNeedM(v, P), v * T) + 10
    const s0 = s - dir * D
    if (s0 < 0 || s0 > L) continue   // the approach must lie on this run (sight is checked along it)
    if (e.tunnelSpans?.some(sp => sp.s1 > Math.min(s, s0) - 20 && sp.s0 < Math.max(s, s0) + 20)) return null
    const imp = { x: c.x + nx * laneOff, y: c.y + 0.5, z: c.z + nz * laneOff }
    if (road?.poiPadBlocked?.(imp.x, imp.z, 10) || road?.junctionPadBlocked?.(imp.x, imp.z, 10)) return null
    const tgt = { x: face.rel.x, y: face.rel.y + 0.4, z: face.rel.z }
    let clear = true
    for (let k = 10; k <= D && clear; k += 10) {
      const q = runAt(pts, cum, s - dir * k)
      const eye = { x: q.x - q.tz * side * laneOff, y: q.y + P.eyeH, z: q.z + q.tx * side * laneOff }
      clear = lineClear(heightAt, eye, imp) && lineClear(heightAt, eye, tgt)
    }
    if (!clear) continue
    return { s, dir, side, face, imp, T, D, c }
  }
  return null
}

// ── The director ────────────────────────────────────────────────────────────────────────────────────

const SCAN_AHEAD_M = 400      // how far ahead of the truck an armed director looks for a candidate
const SCAN_PER_FRAME = 4      // stations evaluated per frame while scanning (a station is ~50–300 height samples)

/** Distance to the next arming, memoryless: Exp(mean 1/perKm km) in metres. */
export const nextArmM = (rng, perKm = SLIDE.perKm) => -Math.log(1 - rng()) * 1000 / perKm

/**
 * Release now? The truck (`aheadM` from the impact point along the road, at `v`) reaches it as the rocks do.
 * @returns {boolean}
 */
export const releaseDue = (aheadM, v, T) => aheadM > 0 && aheadM <= v * T

/**
 * Owns the slides of one world. main.js (a world owner) builds it with the systems it reads:
 *   debris — the DebrisSystem the rocks are spawned through (pinned: outside the throw cap; this removes them);
 *   road() — the live RoadSystem; heightAt(x, z) — the ground the rocks roll on; hasGround(x, z) — is the
 *   terrain collider there (TerrainPhysics.hasChunkAt), so a batch never spawns over a missing chunk.
 * update() runs once per frame with the truck's pose; nothing here touches the engine or the save.
 */
export class RockslideDirector {
  constructor ({ debris, road, heightAt, hasGround = () => true, clockH = () => 0, freeze = () => {}, rng = Math.random, params = SLIDE }) {
    this._debris = debris; this._road = road; this._heightAt = heightAt; this._hasGround = hasGround
    this._clockH = clockH; this._freeze = freeze
    this._rng = rng; this.P = params
    this._odo = 0; this._armAt = nextArmM(rng, params.perKm)
    this.armed = false; this.pick = null; this._scan = null
    this.slides = []          // [{ bodies, mat, age, x, z }]
    this._geos = slideRockGeos()
    this._radii = this._geos.map(g => { g.computeBoundingSphere(); return g.boundingSphere.radius })
    this._kinds = this._geos.map((g, i) => {
      const kind = `slideRock${i}`
      const template = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }))
      debris.load(kind, { template, density: params.density, friction: params.friction, restitution: params.restitution, hazard: true })
      return kind
    })
    this.events = 0
  }

  /** Debug / smoke: arm now (the rate is skipped). A parked truck gets its slide at the nearest candidate at once. */
  trigger () { this.armed = true; this._forced = true; this.pick = null; this._scan = null }

  /**
   * Debug / smoke / the owner's sheet: candidates on every run within r of (x, z), at most `max`, ≥ 100 m apart, for
   * an approach at v. A full scan (~a second per km of road): never on the frame path.
   */
  candidatesNear (x, z, r = 600, max = 20, v = 20) {
    const road = this._road(), out = []
    for (const [key, e] of road?._network ?? []) {
      if (!e.points || e.points.length < 2 || !e.polyCum) continue
      const L = e.polyCum[e.polyCum.length - 1]
      for (let s = 0; s <= L && out.length < max; s += this.P.stepM) {
        const q = runAt(e.points, e.polyCum, s)
        if (Math.hypot(q.x - x, q.z - z) > r || out.some(o => Math.hypot(o.c.x - q.x, o.c.z - q.z) < 100)) continue
        const c = candidateAt(road, this._heightAt, e, s, 1, v) ?? candidateAt(road, this._heightAt, e, s, -1, v)
        if (c) out.push({ ...c, key })
      }
    }
    return out
  }

  /** Where the truck is on its run: { e, key, s, dir, lat(n) } or null off the network. */
  _onRoad (t) {
    const road = this._road(), nr = road?.queryNearest(t.x, t.z, 12)
    const e = nr?.runKey && road._network.get(nr.runKey)
    if (!e?.points || !e.polyCum) return null
    // Project onto the run near the resolver's arc (its arcS is the run's own arc).
    let best = Infinity, s = 0
    const pts = e.points, cum = e.polyCum
    for (let i = 1; i < pts.length; i++) {
      if (cum[i] < nr.arcS - 30 || cum[i - 1] > nr.arcS + 30) continue
      const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1
      const u = Math.max(0, Math.min(1, ((t.x - a.x) * dx + (t.z - a.z) * dz) / l2))
      const d = Math.hypot(a.x + dx * u - t.x, a.z + dz * u - t.z)
      if (d < best) { best = d; s = cum[i - 1] + u * (cum[i] - cum[i - 1]) }
    }
    if (!(best < 12)) return null
    const c = runAt(pts, cum, s)
    const along = t.vx * c.tx + t.vz * c.tz
    return { e, key: nr.runKey, s, c, dir: along >= 0 ? 1 : -1, v: Math.abs(along) }
  }

  /**
   * One frame. `truck` = { x, y, z, vx, vz } (world, m and m/s); `enabled` false (menu, tutorial, lab) holds the
   * odometer and the pick but keeps cleaning up.
   */
  update (dt, truck, enabled = true) {
    for (const sl of this.slides) {
      sl.age += dt
      if (sl.mat.opacity < 1) sl.mat.opacity = Math.min(1, sl.age / this.P.fadeS)
    }
    this._cleanup()
    if (!enabled) return
    this._odo += Math.hypot(truck.vx, truck.vz) * dt
    if (!this.armed && this._odo >= this._armAt) { this.armed = true; this._scan = null }
    if (!this.armed) return
    const on = this._onRoad(truck)
    if (!on) return
    const parked = on.v < 1
    if (this.pick) {
      const p = this.pick
      if (p.key !== on.key || p.dir !== on.dir && !parked) { this.pick = null; return }   // turned off or round: silently drop it
      const ahead = (p.s - on.s) * p.dir
      if (ahead < -5) { this.pick = null; return }                        // drove past it without a release (held too slow)
      const lat = this._latToTruck(p, truck)
      const T = arrivalS(p.face, lat)
      if ((on.v >= this.P.minSpeed && releaseDue(ahead, on.v, T)) || (this._forced && parked && Math.abs(ahead) <= 80)) this._release(p)
      return
    }
    // Scan ahead a few stations per frame for the first candidate the truck is still far enough from.
    if (!this._scan || this._scan.key !== on.key || this._scan.dir !== on.dir) this._scan = { key: on.key, dir: on.dir, k: 0 }
    const L = on.e.polyCum[on.e.polyCum.length - 1]
    for (let i = 0; i < SCAN_PER_FRAME; i++) {
      const lead = parked ? (this._scan.k % 2 ? 1 : -1) * Math.ceil(this._scan.k / 2) * this.P.stepM : this._scan.k * this.P.stepM
      this._scan.k++
      if (Math.abs(lead) > (parked ? 80 : SCAN_AHEAD_M)) { this._scan = null; return }   // nothing in reach: try again from here
      const s = on.s + on.dir * lead
      if (s < 0 || s > L) continue
      const c = candidateAt(this._road(), this._heightAt, on.e, s, on.dir, Math.max(on.v, this.P.minSpeed))
      if (!c) continue
      const ahead = (s - on.s) * on.dir
      if (!parked && ahead < on.v * c.T + 5) continue     // too close already: the rocks could not get there in time
      this.pick = { ...c, key: on.key }
      return
    }
  }

  /** Lateral distance [m] from the face's toe to the truck, toward the road (the arrival model's `latM`). */
  _latToTruck (p, t) {
    const nx = -p.c.tz * p.side, nz = p.c.tx * p.side
    return 5 + p.face.toeD - ((t.x - p.c.x) * nx + (t.z - p.c.z) * nz)
  }

  _release (p) {
    this.pick = null; this.armed = false; this._forced = false
    this._armAt = this._odo + nextArmM(this._rng, this.P.perKm)
    if (!this._hasGround(p.face.rel.x, p.face.rel.z)) return
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, alphaHash: true, opacity: 0 })
    const bodies = []
    for (const b of batchBodies(this._heightAt, p.face, this._radii, this._rng)) {
      const h = this._debris.spawn(this._kinds[b.variant], b.position, b.velocity, { spin: b.spin, quaternion: b.quaternion, pinned: true, material: mat })
      if (h) bodies.push(h)
    }
    if (!bodies.length) { mat.dispose(); return }
    this.slides.push({ bodies, mat, age: 0, x: p.face.rel.x, z: p.face.rel.z, h0: this._clockH(), frozen: false })
    this.events++
    this.last = { at: { x: p.face.rel.x, z: p.face.rel.z }, imp: p.imp, rocks: bodies.length, dropM: p.face.dropM, T: p.T }
  }

  /** The owner's rule (SLIDE.keepH): ground unloaded AND keepH hours on → gone; unloaded sooner → frozen until it returns. */
  _cleanup () {
    for (let i = this.slides.length - 1; i >= 0; i--) {
      const sl = this.slides[i], ground = this._hasGround(sl.x, sl.z)
      if (!ground && this._clockH() - sl.h0 >= this.P.keepH) { this._drop(i); continue }
      if (ground === sl.frozen) { sl.frozen = !ground; this._freeze(sl.bodies, sl.frozen) }
    }
    for (let i = 0; this.slides.length > this.P.maxSlides && i < this.slides.length;) {
      if (this.slides[i].frozen) this._drop(i); else i++
    }
  }

  _drop (i) {
    const sl = this.slides.splice(i, 1)[0]
    this._debris.remove(sl.bodies)
    sl.mat.dispose()
  }

  /** Every slide gone, the pick and the arming dropped (world rebuild, run end). The odometer keeps its draw. */
  clear () { while (this.slides.length) this._drop(0); this.pick = null; this.armed = false; this._forced = false }
}
