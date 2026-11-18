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
  v0: 2,                  // m/s down the fall line at release, with the matching rolling spin
  axisScale: [1.25, 0.7, 1.0],   // the scatter's medRock proportions
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
  lifeS: 120,             // a settled slide is reclaimed this long after release, once out of view…
  farM: 150,              // …and beyond this distance from the truck (never vanishes in view)
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
 * Arrival model [s]: release → the rocks' median front at lateral `latM` m past the face's toe (toward and across
 * the road). Fit to the study's real cut slopes (test/rockslide-study.mjs --real): a + b·√drop + latM / vRoad.
 */
export const ARRIVAL = { a: 0.6, b: 0.7, vRoad: 6 }
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
