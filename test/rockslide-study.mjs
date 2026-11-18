// test/rockslide-study.mjs — FEAT-26 slope study (rainy-day, not a gate): how fast slide rocks come down a slope.
//
// Planar slopes: a static box face at θ meeting a flat road box at its toe (x = 0, the slope rises toward −x).
// The deck starts SHOULDER m past the toe (a cut's toe sits ~3 m out from the deck edge on the seeds, see the
// ticket), the near lane centre 2.5 m further, the far deck edge 10 m on. A batch of 5–15 slide rocks
// (src/rockslide.js rockGeo: the scatter's medium-rock blob, granite) is dropped in a 3 m patch on the face, its
// centre H m above the toe, with v0 down the fall line. Per rock: the time it reaches the near lane, the spread
// along the road there, and where it ends up.
//
// Run: node test/rockslide-study.mjs [--quick]       (the full grid is ~216 cells × 3 batches)

import * as THREE from 'three'
import { createPhysicsEngine, GROUP_TERRAIN, GROUP_DEBRIS } from '../src/physics-engine.js'
import { rockGeo, SLIDE } from '../src/rockslide.js'
import { mulberry32 } from '../src/seed.js'

const DT = 1 / 60, SUB = 8, SIM_S = 14
export const SHOULDER = 3, LANE = SHOULDER + 2.5, FAR = SHOULDER + 10

/** Bbox-centred hull points + bounding radius of a rock geo. */
export function hullOf (geo) {
  const pts = Float32Array.from(geo.attributes.position.array)
  let r = 0; for (let i = 0; i < pts.length; i += 3) r = Math.max(r, Math.hypot(pts[i], pts[i + 1], pts[i + 2]))
  return { pts, r }
}

/**
 * Lay n rocks in a patch: returns centres in the patch frame (u along the fall line, w across, h off the face),
 * non-overlapping by bounding sphere, a second layer above when the patch is full.
 */
export function patchLayout (rocks, rng, patch = SLIDE.patchM) {
  const placed = []
  for (const k of rocks) {
    let p = null
    for (let tries = 0; tries < 40 && !p; tries++) {
      const c = { u: (rng() - 0.5) * patch, w: (rng() - 0.5) * patch, h: k.r + 0.03 }
      for (let lift = 0; lift < 3 && !p; lift++) {
        const q = { ...c, h: c.h + lift * 0.9 }
        if (placed.every(o => Math.hypot(o.u - q.u, o.w - q.w, o.h - q.h) > o.r + k.r + 0.02)) p = q
      }
    }
    placed.push({ ...(p ?? { u: 0, w: 0, h: 3 + placed.length }), r: k.r })
  }
  return placed
}

const randQuat = (rng) => {
  const u1 = rng(), u2 = rng() * 2 * Math.PI, u3 = rng() * 2 * Math.PI
  const a = Math.sqrt(1 - u1), b = Math.sqrt(u1)
  return { x: a * Math.sin(u2), y: a * Math.cos(u2), z: b * Math.sin(u3), w: b * Math.cos(u3) }
}

/** One batch on a planar slope. Returns per-rock { tLane, zLane, tToe, xEnd, mass }. */
export async function planarBatch ({ deg, H, radius, v0, n, seed, axis, roll = false, mu = SLIDE.friction }) {
  const rng = mulberry32(seed)
  const eng = await createPhysicsEngine()
  const th = deg * Math.PI / 180, nrm = { x: Math.sin(th), y: Math.cos(th) }
  const L = H / Math.sin(th) + 6
  // Face: a 1 m thick box whose top face is the slope, from 1 m below the toe to L up it.
  const half = { x: L / 2 + 0.5, y: 0.5, z: 20 }
  const mid = (L - 1) / 2   // slope distance of the box centre from the toe
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -th)
  const face = eng.createBody({ type: 'static',
    position: { x: -mid * Math.cos(th) - nrm.x * 0.5, y: mid * Math.sin(th) - nrm.y * 0.5, z: 0 }, quaternion: { x: q.x, y: q.y, z: q.z, w: q.w } })
  eng.addBox(face, half, { friction: 0.8, group: GROUP_TERRAIN })
  const road = eng.createBody({ type: 'static', position: { x: 30 - 0.5, y: -0.5, z: 0 } })
  eng.addBox(road, { x: 30, y: 0.5, z: 30 }, { friction: 0.8, group: GROUP_TERRAIN })

  const kinds = Array.from({ length: n }, () => {
    const r = radius === 'mix' ? SLIDE.rockR[0] + rng() * (SLIDE.rockR[1] - SLIDE.rockR[0]) : radius
    const h = hullOf(rockGeo(r, rng, axis)); return { ...h }
  })
  const lay = patchLayout(kinds, rng)
  const sPatch = H / Math.sin(th)   // patch centre, slope distance from the toe
  const down = { x: Math.cos(th), y: -Math.sin(th) }
  const bodies = kinds.map((k, i) => {
    const o = lay[i], s = sPatch - o.u
    const b = eng.createBody({ type: 'dynamic',
      position: { x: -s * Math.cos(th) + nrm.x * o.h, y: s * Math.sin(th) + nrm.y * o.h, z: o.w },
      quaternion: randQuat(rng), linearVelocity: { x: down.x * v0, y: down.y * v0, z: 0 }, angularVelocity: { x: 0, y: 0, z: roll ? -v0 / k.r : 0 } })
    eng.addHull(b, k.pts, { density: SLIDE.density, friction: mu, restitution: SLIDE.restitution, group: GROUP_DEBRIS })
    return { b, z0: o.w, tLane: null, zLane: null, tToe: null, mass: eng.getMass(b) }
  })
  const p = new THREE.Vector3(), qq = new THREE.Quaternion()
  for (let k = 1; k <= SIM_S * 60; k++) {
    eng.step(DT, SUB)
    const t = k * DT
    for (const r of bodies) {
      eng.getTransform(r.b, p, qq)
      if (r.tToe == null && p.x >= 0) r.tToe = t
      if (r.tLane == null && p.x >= LANE) { r.tLane = t; r.zLane = p.z - r.z0 }
      r.xEnd = p.x
    }
  }
  eng.dispose()
  return bodies.map(({ tLane, zLane, tToe, xEnd, mass }) => ({ tLane, zLane, tToe, xEnd, mass }))
}

export const pct = (a, q) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))] }

export function summarise (rocks) {
  const n = rocks.length, hit = rocks.filter(r => r.tLane != null)
  const t = hit.map(r => r.tLane), z = hit.map(r => Math.abs(r.zLane))
  return { n, lane: hit.length / n, short: rocks.filter(r => r.xEnd < SHOULDER).length / n, over: rocks.filter(r => r.xEnd > FAR).length / n,
    t50: pct(t, 0.5), t10: pct(t, 0.1), t90: pct(t, 0.9), z90: pct(z, 0.9) }
}

if (import.meta.url === `file://${process.argv[1]}` && process.argv.includes('--real')) {
  const { realSeed } = await import('./lib/rockslide-real.mjs')
  const seeds = process.argv.filter(a => /^\d+$/.test(a)).map(Number)
  for (const seed of seeds) console.log(JSON.stringify(await realSeed(seed)))
} else if (import.meta.url === `file://${process.argv[1]}`) {
  const quick = process.argv.includes('--quick')
  const DEGS = quick ? [30, 45] : [25, 30, 35, 40, 45, 50]
  const HS = quick ? [4, 8] : [3, 5, 8, 12]
  const RS = quick ? [0.32] : [0.2, 0.32, 0.45]
  const VS = quick ? [0, 2] : [0, 2, 4]
  const BATCHES = 3
  console.log(`planar slopes: deck edge ${SHOULDER} m past the toe, near lane ${LANE} m, far edge ${FAR} m; ${BATCHES} batches of 5–15 rocks per cell`)
  console.log('  deg   H  r[m]  v0 |  lane%  short%  over% | t_lane p10/p50/p90 [s] | spread p90 [m]')
  const rows = []
  for (const deg of DEGS) for (const H of HS) for (const radius of RS) for (const v0 of VS) {
    const rocks = []
    for (let b = 0; b < BATCHES; b++) {
      const seed = (deg * 1000 + H * 100 + Math.round(radius * 100) * 10 + v0) * 7 + b
      const n = SLIDE.rocksMin + (seed % (SLIDE.rocksMax - SLIDE.rocksMin + 1))
      rocks.push(...await planarBatch({ deg, H, radius, v0, n, seed }))
    }
    const s = summarise(rocks)
    rows.push({ deg, H, radius, v0, ...s })
    console.log(`  ${String(deg).padStart(3)} ${String(H).padStart(3)} ${radius.toFixed(2).padStart(5)} ${String(v0).padStart(3)} | ${(100 * s.lane).toFixed(0).padStart(5)} ${(100 * s.short).toFixed(0).padStart(6)} ${(100 * s.over).toFixed(0).padStart(5)} | ${[s.t10, s.t50, s.t90].map(v => isNaN(v) ? '  -  ' : v.toFixed(2)).join(' / ')} | ${isNaN(s.z90) ? '-' : s.z90.toFixed(1)}`)
  }
  if (process.argv.includes('--json')) console.log(JSON.stringify(rows))
}
