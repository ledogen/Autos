// GATE: the testing lab's barrel cube stands on its own — full-height towers settle, sleep and hold.
//
// The cube (src/debris.js cubeLayout, BARREL_CUBE_LAYERS tall) is side² freestanding towers of
// upright drums with clear air between them, so ONE tower's behaviour is the whole cube's: a 3 × 3
// footprint at full height settles the same columns the game does at a fraction of the cost. Real
// drum-closed hull (read from the GLB like cargo-bed.mjs reads the rock), real DEBRIS_TYPES material.
//
// Must hold:
//   (1) LAYOUT — pure, columns never touch (pitch > the hull's width), layers start clear.
//   (2) SETTLE — every drum asleep within 3 s, top layer within 3 cm of its spawn column and 0.5° of
//       upright. A tower that falls over "under its own weight" or creeps fails here.
//   (3) HOLD — 30 s later nothing has woken and nothing has moved: a jittering tower never sleeps.
//
// Run: node test/barrel-cube.mjs

import fs from 'node:fs'
import * as THREE from 'three'
import { createPhysicsEngine, GROUP_DEBRIS } from '../src/physics-engine.js'
import { cubeLayout, DEBRIS_TYPES, BARREL_CUBE_LAYERS, STACK_HEIGHT } from '../src/debris.js'

let fail = 0
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) fail = 1 }

/** drum-closed's vertices, bbox-centred — the hull debris.js builds at runtime. */
function drumHull () {
  const buf = fs.readFileSync(new URL('../assets/models/drum-closed.glb', import.meta.url))
  const jl = buf.readUInt32LE(12)
  const js = JSON.parse(buf.subarray(20, 20 + jl).toString('utf8'))
  const binOff = 20 + jl + 8
  const pts = []
  for (const n of js.nodes) {
    if (n.mesh == null) continue
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...(n.translation || [0, 0, 0])),
      new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])),
      new THREE.Vector3(...(n.scale || [1, 1, 1])))
    for (const pr of js.meshes[n.mesh].primitives) {
      const a = js.accessors[pr.attributes.POSITION], bv = js.bufferViews[a.bufferView]
      const off = buf.byteOffset + binOff + (bv.byteOffset || 0) + (a.byteOffset || 0)
      const f = new Float32Array(buf.buffer.slice(off, off + a.count * 12))
      for (let i = 0; i < a.count; i++) pts.push(new THREE.Vector3(f[3 * i], f[3 * i + 1], f[3 * i + 2]).applyMatrix4(m))
    }
  }
  const box = new THREE.Box3().setFromPoints(pts)
  const c = box.getCenter(new THREE.Vector3())
  return { hull: pts.flatMap(v => [v.x - c.x, v.y - c.y, v.z - c.z]), size: box.getSize(new THREE.Vector3()) }
}

const FOOT = 3, TALL = BARREL_CUBE_LAYERS, N = FOOT * FOOT * TALL
const { hull, size } = drumHull()
const L = cubeLayout(N, FOOT)

console.log(`layout — ${FOOT}×${FOOT} footprint, ${TALL} high (BARREL_CUBE_LAYERS):`)
{
  ok(JSON.stringify(L) === JSON.stringify(cubeLayout(N, FOOT)), 'same arguments ⇒ identical layout')
  ok(L.length === N && L[N - 1].y > L[N - FOOT * FOOT].y - 1e-12, `emits ${N} drums in ${TALL} layers`)
  const pitch = L[1].x - L[0].x
  ok(pitch > Math.max(size.x, size.z), `columns never touch: pitch ${pitch.toFixed(3)} m > hull width ${Math.max(size.x, size.z).toFixed(3)} m`)
  const layerGap = L[FOOT * FOOT].y - L[0].y - size.y
  ok(layerGap > 0, `layers spawn clear of each other (gap ${(layerGap * 1000).toFixed(1)} mm)`)
}

const eng = await createPhysicsEngine()
const slab = eng.createBody({ type: 'static', position: { x: 0, y: -5, z: 0 } })
eng.addBox(slab, { x: 200, y: 5, z: 200 }, { friction: 0.8 })            // the lab slab
const T = DEBRIS_TYPES.barrel
const bodies = L.map(pos => {
  const b = eng.createBody({ type: 'dynamic', position: pos })
  eng.addHull(b, hull, { density: T.density, friction: T.friction, restitution: T.restitution, group: GROUP_DEBRIS })
  return b
})
const p = { x: 0, y: 0, z: 0 }, q = { x: 0, y: 0, z: 0, w: 1 }
const pose = () => bodies.map(b => { eng.getTransform(b, p, q); return { ...p, qw: q.w } })
const awake = () => bodies.filter(b => eng.isAwake(b)).length

console.log('\nsettle — the towers stand on their own:')
let sleptAt = null
for (let s = 1; s <= 180 && sleptAt == null; s++) { eng.step(1 / 60); if (awake() === 0) sleptAt = s / 60 }
const A = pose()
{
  const top = A.slice(-FOOT * FOOT), topL = L.slice(-FOOT * FOOT)
  const drift = Math.max(...top.map((r, i) => Math.hypot(r.x - topL[i].x, r.z - topL[i].z)))
  const tilt = Math.max(...A.map(r => 2 * Math.acos(Math.min(1, Math.abs(r.qw))) * 180 / Math.PI))
  const topY = Math.min(...top.map(r => r.y))
  ok(sleptAt != null, `every drum asleep within 3 s (at ${sleptAt?.toFixed(2)} s; awake now ${awake()})`)
  ok(drift < 0.03, `top layer stayed over its column (max drift ${(drift * 100).toFixed(1)} cm < 3)`)
  ok(tilt < 0.5, `every drum upright (max tilt ${tilt.toFixed(2)}° < 0.5)`)
  ok(topY > (TALL - 1) * STACK_HEIGHT, `the towers are still ${TALL} high (top centre ${topY.toFixed(2)} m)`)
}

console.log('\nhold — 30 s later, nothing woke and nothing moved:')
for (let s = 0; s < 1800; s++) eng.step(1 / 60)
{
  const B = pose()
  const moved = Math.max(...B.map((r, i) => Math.hypot(r.x - A[i].x, r.y - A[i].y, r.z - A[i].z)))
  ok(awake() === 0, `still all asleep (awake ${awake()})`)
  ok(moved < 1e-6, `no drum moved (max ${moved.toExponential(1)} m)`)
}
eng.dispose()

console.log('\n' + '═'.repeat(56))
if (fail) { console.log('BARREL-CUBE: FAIL'); process.exit(1) }
console.log('BARREL-CUBE: PASS — the cube stands, sleeps and holds ✓')
