// test/lib/rockslide-real.mjs — FEAT-26 study on REAL cut slopes (test/rockslide-study.mjs --real <seeds…>).
//
// One seed: the real world (test/lib/world-rig.mjs: road, terrain heightfield + road trimesh colliders the game
// mirrors), the candidacy census over every run (src/rockslide.js candidateAt, both directions, at 20 m/s), then
// slides released on a sample of candidates (src/rockslide.js batchBodies — the director's own layout) for each v0.
// Per rock: when it crosses the face-side lane centre and where along the road, and where it comes to rest.

import * as THREE from 'three'
import { RANGER_PARAMS } from '../../data/ranger.js'
import { RUNNING } from '../../src/ignition.js'
import { makeVehicleState } from '../../src/vehicle-state.js'
import { GROUP_DEBRIS } from '../../src/physics-engine.js'
import { SLIDE, candidateAt, batchBodies, slideRockGeos, runAt } from '../../src/rockslide.js'
import { mulberry32 } from '../../src/seed.js'
import { buildWorld } from './world-rig.mjs'

const DT = 1 / 60, SIM_S = 12, HALF_W = 5, LANE = 2.5
const hullOf = (geo) => {
  const pts = Float32Array.from(geo.attributes.position.array)
  let r = 0; for (let i = 0; i < pts.length; i += 3) r = Math.max(r, Math.hypot(pts[i], pts[i + 1], pts[i + 2]))
  return { pts, r }
}

export async function realSeed (seed, { trials = 6, v0s = [0, 2, 4, 6], shapes = { scatter: SLIDE.axisScale, round: [1.1, 0.9, 1.0] } } = {}) {
  const t0 = performance.now()
  const P = { ...RANGER_PARAMS, _tireFz: [0, 0, 0, 0], _suspForceAccum: [0, 0, 0, 0], _hubNormalXZ: [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 })) }
  const vs = makeVehicleState(P, RUNNING)
  vs.position.set(0, 5000, 0)
  const w = await buildWorld(seed, P, vs, { radius: 1500 })
  w.engine.setEnabled(w.chassis, false)
  const heightAt = (x, z) => w.terr.analyticHeight(x, z)
  const buildS = (performance.now() - t0) / 1000

  // ── Census ─────────────────────────────────────────────────────────────────────────────────────────
  let km = 0, either = 0, perDir = 0
  const cands = [], deg = {}, drop = {}
  for (const [key, e] of w.road._network) {
    if (!e.points || e.points.length < 2 || !e.polyCum) continue
    const L = e.polyCum[e.polyCum.length - 1]
    if (Math.hypot(e.points[0].x, e.points[0].z) > 1400) continue   // inside the built region
    km += L / 1000
    for (let s = 0; s <= L; s += SLIDE.stepM) {
      let any = false
      for (const dir of [1, -1]) {
        const c = candidateAt(w.road, heightAt, e, s, dir, 20)
        if (!c) continue
        perDir += SLIDE.stepM; any = true
        cands.push({ key, e, ...c })
        const b = Math.floor(c.face.deg / 5) * 5; deg[b] = (deg[b] ?? 0) + 1
        const h = Math.floor(c.face.dropM / 2) * 2; drop[h] = (drop[h] ?? 0) + 1
      }
      if (any) either += SLIDE.stepM
    }
  }
  const censusS = (performance.now() - t0) / 1000 - buildS

  // ── Trials ─────────────────────────────────────────────────────────────────────────────────────────
  const rng = mulberry32(seed ^ 0x5eed)
  const pick = []
  for (let k = 0; k < 200 && pick.length < trials && cands.length; k++) {
    const c = cands[Math.floor(rng() * cands.length)]
    if (pick.every(o => Math.hypot(o.face.rel.x - c.face.rel.x, o.face.rel.z - c.face.rel.z) > 100)) pick.push(c)
  }
  const out = []
  const p = new THREE.Vector3(), q = new THREE.Quaternion()
  for (const c of pick) {
    w.stream(c.face.rel.x, c.face.rel.z)
    const nx = -c.c.tz * c.side, nz = c.c.tx * c.side   // toward the face
    for (const [shape, axis] of Object.entries(shapes)) {
      const protos = slideRockGeos(6, 0x51ade, axis).map(hullOf)
      for (const v0 of v0s) {
        const bodies = batchBodies(heightAt, c.face, protos.map(h => h.r), mulberry32(seed + v0 * 7 + shape.length), { v0 })
        const live = bodies.map(b => {
          const h = w.engine.createBody({ type: 'dynamic', position: b.position, quaternion: b.quaternion, linearVelocity: b.velocity, angularVelocity: b.spin,
            userData: { kind: 'debris', debrisType: 'slideRock', hazard: true } })
          w.engine.addHull(h, protos[b.variant].pts, { density: SLIDE.density, friction: SLIDE.friction, restitution: SLIDE.restitution, group: GROUP_DEBRIS })
          return { h, r: protos[b.variant].r, mass: w.engine.getMass(h), tLane: null, aLane: null, latEnd: null, aEnd: null, yMin: Infinity }
        })
        for (let k = 1; k <= SIM_S * 60; k++) {
          w.engine.step(DT, 8)
          for (const r of live) {
            w.engine.getTransform(r.h, p, q)
            const dx = p.x - c.c.x, dz = p.z - c.c.z
            const lat = dx * nx + dz * nz, along = (dx * c.c.tx + dz * c.c.tz) * c.dir
            if (r.tLane == null && lat <= LANE) { r.tLane = k * DT; r.aLane = along }
            r.latEnd = lat; r.aEnd = along; r.yMin = Math.min(r.yMin, p.y - c.c.y)
          }
        }
        for (const r of live) w.engine.destroyBody(r.h)
        out.push({ shape, v0, dropM: +c.face.dropM.toFixed(2), deg: +c.face.deg.toFixed(1), fallDeg: +c.face.fall.deg.toFixed(1), toeD: c.face.toeD, relD: +c.face.relD.toFixed(2),
          rocks: live.map(r => ({ r: +r.r.toFixed(2), m: Math.round(r.mass), t: r.tLane && +r.tLane.toFixed(3), a: r.aLane && +r.aLane.toFixed(2), lat: +r.latEnd.toFixed(2), ae: +r.aEnd.toFixed(2), fell: r.yMin < -20 })) })
      }
    }
  }
  w.dispose()
  return { seed, km: +km.toFixed(2), candEitherM: either, candPerDirM: perDir, deg, drop, buildS: +buildS.toFixed(1), censusS: +censusS.toFixed(1), trials: out }
}
