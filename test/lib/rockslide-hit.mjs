// test/lib/rockslide-hit.mjs — FEAT-26: the real truck driven through real slides (the director's own pick and release).
//
// One seed's real world (test/lib/world-rig.mjs), the real DebrisSystem and RockslideDirector (src/rockslide.js). For a
// candidate cut, the truck is seated on the approach (face-side lane or the far one) at a held speed, driven down its
// lane by pure pursuit and never braking (the worst case: a driver who does not react); the director is triggered and
// does the rest. Every step runs what main.js runs: debris.beforeStep → stepPhysics → readRimStrikes → damage.step →
// feedContact. Per drive: did it release, did a rock touch the truck (chassis contact from debris, or a rim strike),
// the impacts the damage model landed, the condition lost, punctures, a fatal.

import fs from 'node:fs'
import * as THREE from 'three'

globalThis.ProgressEvent ??= class extends Event { constructor (t, o = {}) { super(t); Object.assign(this, o) } }
THREE.DefaultLoadingManager.setURLModifier(u => u.startsWith('data:') ? u
  : 'data:application/octet-stream;base64,' + fs.readFileSync(new URL('../../' + u, import.meta.url)).toString('base64'))

const { RANGER_PARAMS } = await import('../../data/ranger.js')
const { DEFAULT_VEHICLE_MODEL } = await import('../../data/vehicle-models.js')
const { RUNNING } = await import('../../src/ignition.js')
const { makeVehicleState } = await import('../../src/vehicle-state.js')
const { computeStaticEquilibrium } = await import('../../src/suspension.js')
const { stepPhysics, readRimStrikes, classifyImpactRegion } = await import('../../src/physics.js')
const { GROUP_DEBRIS } = await import('../../src/physics-engine.js')
const { DebrisSystem } = await import('../../src/debris.js')
const { DamageModel, TRACK_IDS } = await import('../../src/damage.js')
const { RockslideDirector, candidateAt, runAt, SLIDE } = await import('../../src/rockslide.js')
const { mulberry32 } = await import('../../src/seed.js')
const { buildWorld } = await import('./world-rig.mjs')

const DT = 1 / 60, LANE = 2.5

/** Candidates on runs near the origin whose approach at `vMax` fits on the run (the director scans the same run). */
export function findCandidates (w, heightAt, vMax, { maxR = 1300, spacing = 150 } = {}) {
  const out = []
  for (const [key, e] of w.road._network) {
    if (!e.points || e.points.length < 2 || !e.polyCum) continue
    const L = e.polyCum.at(-1)
    for (let s = 0; s <= L; s += SLIDE.stepM) {
      for (const dir of [1, -1]) {
        const c = candidateAt(w.road, heightAt, e, s, dir, vMax)
        if (!c || Math.hypot(c.c.x, c.c.z) > maxR) continue
        const s0 = s - dir * (c.D + 150)
        if (s0 < 5 || s0 > L - 5) continue
        if (out.some(o => Math.hypot(o.c.x - c.c.x, o.c.z - c.c.z) < spacing)) continue
        out.push({ ...c, key, e })
      }
    }
  }
  return out
}

/**
 * Drive one slide. `cand` from findCandidates; `lane` 'face' or 'far'; v [m/s]. Returns the drive's record.
 */
export async function driveSlide (w, debris, cand, v, lane, seed, { maxS = 40 } = {}) {
  const P = w.P, vs = w.vs
  const eq = computeStaticEquilibrium(P)
  const heightAt = (x, z) => w.terr.analyticHeight(x, z)
  const e = cand.e, dir = cand.dir, L = e.polyCum.at(-1)
  const laneSign = (lane === 'face' ? 1 : -1) * cand.side
  const laneAt = (s) => { const q = runAt(e.points, e.polyCum, s); return { x: q.x - q.tz * laneSign * LANE, z: q.z + q.tx * laneSign * LANE, y: q.y, tx: q.tx * dir, tz: q.tz * dir } }
  let s = cand.s - dir * (cand.D + 150)
  const p0 = laneAt(s)
  w.stream(p0.x, p0.z)
  const top = w.road.sampleRoadTopY(p0.x, p0.z) ?? heightAt(p0.x, p0.z)
  vs.position.set(p0.x, top + eq.bodyY + 0.05, p0.z)
  vs.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-p0.tx, -p0.tz))
  vs.velocity.set(p0.tx * v, 0, p0.tz * v); vs.angularVelocity.set(0, 0, 0)
  vs.strutComp = [...eq.strutComp]; vs.strutCompVel = [0, 0, 0, 0]
  vs.wheelOmega = [0, 1, 2, 3].map(() => v / P.wheelRadius)
  vs.steerAngle = 0; vs.throttle = 0; vs.brake = 0
  const dmg = new DamageModel({ params: P }); dmg.setAll(1); dmg.publish(P)
  const dir0 = new RockslideDirector({ debris, road: () => w.road, heightAt, rng: mulberry32(seed) })
  await Promise.all(dir0._kinds.map(k => debris.load(k)))
  dir0.trigger()
  const rec = { v, lane, released: false, touched: false, rocks: 0, impacts: [], punct: 0, fatal: null, tRel: null, tTouch: null, minGap: Infinity }
  const fwd = new THREE.Vector3(), J = { x: 0, y: 0, z: 0 }, rp = new THREE.Vector3(), rq = new THREE.Quaternion(), qi = new THREE.Quaternion()
  let lastStream = 0, t = 0
  for (let k = 0; k < maxS * 60; k++, t += DT) {
    // Pure pursuit down the lane, speed held, never a brake for the rocks.
    const look = Math.max(8, 0.9 * v)
    let best = Infinity
    for (let ds = -10; ds <= 10; ds += 1) { const q = laneAt(s + ds); const d = Math.hypot(q.x - vs.position.x, q.z - vs.position.z); if (d < best) { best = d; var sNear = s + ds } }
    s = sNear
    if (s < 0 || s > L) break
    const tg = laneAt(s + dir * look)
    const loc = new THREE.Vector3(tg.x - vs.position.x, 0, tg.z - vs.position.z).applyQuaternion(qi.copy(vs.quaternion).invert())
    const alpha = Math.atan2(-loc.x, -loc.z)
    vs.steerAngle = Math.max(-P.maxSteerAngle, Math.min(P.maxSteerAngle, Math.atan(2 * P.wheelbase * Math.sin(alpha) / look)))
    const vf = vs.velocity.dot(fwd.set(0, 0, -1).applyQuaternion(vs.quaternion))
    vs.throttle = Math.max(0, Math.min(1, (v - vf) * 0.5)); vs.brake = Math.max(0, Math.min(1, (vf - v) * 0.5))
    if (Math.abs(s - lastStream) > 20) { w.stream(vs.position.x, vs.position.z); lastStream = s }

    dir0.update(DT, { x: vs.position.x, y: vs.position.y, z: vs.position.z, vx: vs.velocity.x, vz: vs.velocity.z })
    if (!rec.released && dir0.events) { rec.released = true; rec.tRel = t; rec.rocks = dir0.last.rocks; rec.dropM = dir0.last.dropM; rec.T = dir0.last.T }
    debris.beforeStep(w.chassis, DEFAULT_VEHICLE_MODEL.bed ?? null)
    stepPhysics(vs, P, DT, w.queryContacts, w.ctx)
    const hit = readRimStrikes(w.engine, w.chassis, vs.rimForce, DT, vs.rimHazard)
    dmg.step(vs, P, DT)
    const landed = dmg.feedContact(classifyImpactRegion(hit.point, hit.normal), hit.impulse, P.mass, DT, vs.velocity)
    if (landed) rec.impacts.push({ region: landed.region, dv: +(landed.v ?? 0).toFixed(2) })
    if (dmg.fatalImpact && !rec.fatal) rec.fatal = dmg.fatalImpact
    if (rec.released) {
      w.engine.contactImpulseOn(w.chassis, J, GROUP_DEBRIS)
      const rim = vs.rimHazard.some(f => f > 0)
      if ((Math.hypot(J.x, J.y, J.z) > 1 || rim) && !rec.touched) { rec.touched = true; rec.tTouch = t - rec.tRel }
      for (const sl of dir0.slides) for (const b of sl.bodies) {
        w.engine.getTransform(b, rp, rq)
        rec.minGap = Math.min(rec.minGap, rp.distanceTo(vs.position))
      }
      if (t - rec.tRel > 12) break
    }
    if (!Number.isFinite(vs.position.x)) { rec.nan = true; break }
  }
  rec.punct = dmg.flat.filter(Boolean).length
  rec.lost = +TRACK_IDS.reduce((a, id) => a + (1 - dmg.get(id)), 0).toFixed(3)
  rec.worst = TRACK_IDS.map(id => [id, 1 - dmg.get(id)]).sort((a, b) => b[1] - a[1]).slice(0, 3).filter(x => x[1] > 0.001).map(([id, l]) => `${id} −${(100 * l).toFixed(0)}%`)
  rec.minGap = +rec.minGap.toFixed(2)
  dir0.clear()
  return rec
}

/** The world + debris for a seed, the truck parked out of the way. */
export async function hitWorld (seed) {
  const P = { ...RANGER_PARAMS, _tireFz: [0, 0, 0, 0], _suspForceAccum: [0, 0, 0, 0], _hubNormalXZ: [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 })) }
  const vs = makeVehicleState(P, RUNNING)
  const w = await buildWorld(seed, P, vs, { radius: 1500 })
  w.vs = vs
  const debris = new DebrisSystem(w.engine, new THREE.Scene())
  return { w, debris, heightAt: (x, z) => w.terr.analyticHeight(x, z) }
}
