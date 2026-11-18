// test/rockslide-physics.mjs — FEAT-26 gate: slides on REAL cut slopes reach the road when the director says they will.
//
// Seed GATE_SEED's real world (test/lib/world-rig.mjs: the terrain heightfield and road trimesh the game mirrors). On
// each of its first CANDS candidate cuts (src/rockslide.js candidateAt, the director's own test) a batch is released
// exactly as the director releases one (batchBodies: the patch, v0 down the fall line, the rolling spin) and stepped 12 s.
// A slide is ON TIME when at least one rock crosses the face-side lane centre inside the arrival model's window,
// T ± WINDOW_S (T = arrivalS, the fit in the ticket). Also: the same slide replays to the same rock positions (the
// engine is deterministic; a slide is not seeded world state, but a replayed log must still mean one thing), and no rock
// ends below the ground (no tunnelling through the heightfield).
//
// Run: node test/rockslide-physics.mjs

import * as THREE from 'three'
import { RANGER_PARAMS } from '../data/ranger.js'
import { RUNNING } from '../src/ignition.js'
import { makeVehicleState } from '../src/vehicle-state.js'
import { GROUP_DEBRIS } from '../src/physics-engine.js'
import { SLIDE, candidateAt, batchBodies, slideRockGeos, arrivalS } from '../src/rockslide.js'
import { mulberry32 } from '../src/seed.js'
import { buildWorld } from './lib/world-rig.mjs'

const GATE_SEED = 1828043085, CANDS = 8, WINDOW_S = 1.0, MIN_ON_TIME = 0.75, LANE = 2.5
let fail = 0
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fail = 1 }

const P = { ...RANGER_PARAMS, _tireFz: [0, 0, 0, 0], _suspForceAccum: [0, 0, 0, 0], _hubNormalXZ: [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0 })) }
const vs = makeVehicleState(P, RUNNING)
vs.position.set(0, 5000, 0)
const w = await buildWorld(GATE_SEED, P, vs, { radius: 1500 })
w.engine.setEnabled(w.chassis, false)
const heightAt = (x, z) => w.terr.analyticHeight(x, z)

const cands = []
for (const [, e] of w.road._network) {
  if (!e.points || e.points.length < 2 || !e.polyCum || Math.hypot(e.points[0].x, e.points[0].z) > 1200) continue
  for (let s = 0; s <= e.polyCum.at(-1) && cands.length < CANDS; s += SLIDE.stepM) {
    const c = candidateAt(w.road, heightAt, e, s, 1, 20) ?? candidateAt(w.road, heightAt, e, s, -1, 20)
    if (c && cands.every(o => Math.hypot(o.c.x - c.c.x, o.c.z - c.c.z) > 150)) cands.push(c)
  }
}
const protos = slideRockGeos().map(g => ({ pts: Float32Array.from(g.attributes.position.array), r: (g.computeBoundingSphere(), g.boundingSphere.radius) }))

/** One slide on candidate c: per rock its lane crossing time, and the final positions. */
function slide (c, seed) {
  const nx = -c.c.tz * c.side, nz = c.c.tx * c.side
  const live = batchBodies(heightAt, c.face, protos.map(p => p.r), mulberry32(seed)).map(b => {
    const h = w.engine.createBody({ type: 'dynamic', position: b.position, quaternion: b.quaternion, linearVelocity: b.velocity, angularVelocity: b.spin })
    w.engine.addHull(h, protos[b.variant].pts, { density: SLIDE.density, friction: SLIDE.friction, restitution: SLIDE.restitution, group: GROUP_DEBRIS })
    return { h, t: null }
  })
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), end = []
  for (let k = 1; k <= 12 * 60; k++) {
    w.engine.step(1 / 60, 8)
    for (const r of live) {
      if (r.t != null) continue
      w.engine.getTransform(r.h, p, q)
      if ((p.x - c.c.x) * nx + (p.z - c.c.z) * nz <= LANE) r.t = k / 60
    }
  }
  let under = 0
  for (const r of live) { w.engine.getTransform(r.h, p, q); end.push(p.x, p.y, p.z); if (p.y < heightAt(p.x, p.z) - 0.5) under++; w.engine.destroyBody(r.h) }
  return { times: live.map(r => r.t), end, under }
}

console.log(`seed ${GATE_SEED}: ${cands.length} candidate cuts; a slide is on time when a rock crosses the face-side lane inside T ± ${WINDOW_S} s`)
let onTime = 0, under = 0
for (const [i, c] of cands.entries()) {
  w.stream(c.face.rel.x, c.face.rel.z)
  const T = arrivalS(c.face, 5 + c.face.toeD - LANE)
  const r = slide(c, 100 + i)
  const inWin = r.times.filter(t => t != null && Math.abs(t - T) <= WINDOW_S).length
  if (inWin) onTime++
  under += r.under
  console.log(`  cut ${i}: drop ${c.face.dropM.toFixed(1)} m at ${c.face.deg.toFixed(0)}°, toe ${c.face.toeD} m out — T ${T.toFixed(2)} s; ${r.times.length} rocks, ${r.times.filter(t => t != null).length} reach the lane, ${inWin} inside the window (${r.times.filter(t => t != null).map(t => t.toFixed(1)).join(' ')})`)
  if (i === 0) {
    const again = slide(c, 100)
    ok(again.end.every((v, k) => v === r.end[k]), 'the same slide replays to the same rock positions')
  }
}
ok(cands.length >= 6, `${cands.length} candidate cuts found on the gate seed (≥ 6)`)
ok(onTime / cands.length >= MIN_ON_TIME, `${onTime}/${cands.length} slides on time (≥ ${100 * MIN_ON_TIME} %)`)
ok(under === 0, `no rock ends below the ground (${under})`)
w.dispose()
console.log(fail ? '\nFAIL — slides no longer reach the road on time' : '\nPASS — slides reach the road inside the predicted window')
process.exit(fail)
