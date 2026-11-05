// GATE (run-all): node test/bore-collider.mjs
// BUG-81 item 4 (owner, 2026-11-01: "bare minimum it should be a wall from both sides"): a tunnel is
// reachable from outside in two ways, and both are pinned here on a synthetic chunk — a 20 m hill
// plateau with a bore under it (deck 0, R 8, crown 8, so 12 m of cover).
//   (1) THE TRENCH. The heightfield's bore slot runs the whole bore (a heightfield cannot overhang),
//       so without a lid a truck on the hill fell 20 m into it onto the tube. The lid is the drawn hill
//       as an upward mesh: a box dropped on the hill over the bore must STAY ON THE HILL.
//   (2) THE LID IS INVISIBLE FROM BELOW. A box driven through the bore must pass untouched.
//   (3) THE SHELL. Box3D mesh triangles collide from their front face only; the lining faces into the
//       bore, so from outside it let a body sink in and threw it inward. RoadPhysics now adds the back
//       faces of every non-surface geometry: a box driven at a shell's BACK face must stop at it.
import * as THREE from 'three'
import { createPhysicsEngine } from '../src/physics-engine.js'
import { TerrainPhysics, RoadPhysics } from '../src/terrain-physics.js'

let fail = 0
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail++ }
const S = 64, N = 65, HILL = 20
// The terrain chunk mesh: PlaneGeometry rotated flat and centred on the chunk, as terrain.js builds it.
const plane = new THREE.PlaneGeometry(S, S, N - 1, N - 1)
plane.rotateX(-Math.PI / 2)
const posAttr = plane.attributes.position
for (let i = 0; i < posAttr.count; i++) posAttr.setY(i, HILL)
// One run straight along +x through the chunk at z = 32, bored for its whole length.
// No carve: the floor the wheels read is the flat deck (the real RoadSystem's camber is road-tunnel's).
const road = { _params: { tunnelBoreRadius: 8 }, _sampleCarveWorld: () => null, _network: new Map([['bore', {
  points: [{ x: -20, y: 0, z: 32 }, { x: 84, y: 0, z: 32 }], polyCum: [0, 104], tunnelSpans: [{ s0: 0, s1: 104 }],
}]]) }

async function world () {
  const eng = await createPhysicsEngine()
  new TerrainPhysics(eng, () => road).syncChunk('0,0', 0, 0, posAttr, N, S)
  return eng
}
const box = (eng, p, v) => {
  const b = eng.createBody({ type: 'dynamic', position: p, canSleep: false })
  eng.addBox(b, { x: 1, y: 0.75, z: 2 })
  if (v) eng.setVelocity(b, v, { x: 0, y: 0, z: 0 })
  return b
}
const at = (eng, b) => { const p = new THREE.Vector3(), q = new THREE.Quaternion(); eng.getTransform(b, p, q); return p }
const run = (eng, s) => { for (let i = 0; i < s * 60; i++) eng.step(1 / 60) }

{ // (1) on the hill over the bore
  const eng = await world()
  const b = box(eng, { x: 32, y: HILL + 3, z: 32 })
  run(eng, 3)
  const y = at(eng, b).y
  check(Math.abs(y - (HILL + 0.75)) < 0.1, `a box dropped on the hill over the bore rests on it: y ${y.toFixed(2)} (hill ${HILL} + 0.75)`)
  eng.dispose()
}
{ // (2) through the bore, under the lid — gravity off so only a contact could move it off its line
  const eng = await createPhysicsEngine({ gravity: { x: 0, y: 0, z: 0 } })
  new TerrainPhysics(eng, () => road).syncChunk('0,0', 0, 0, posAttr, N, S)
  const b = box(eng, { x: 4, y: 2, z: 32 }, { x: 15, y: 0, z: 0 })
  run(eng, 3)
  const p = at(eng, b)
  check(p.x > 40 && Math.abs(p.y - 2) < 0.01 && Math.abs(p.z - 32) < 0.01, `a box driven through the bore passes under the lid untouched: x ${p.x.toFixed(1)} y ${p.y.toFixed(3)} z ${p.z.toFixed(3)}`)
  eng.dispose()
}
{ // (3) a shell's back face: a 10 m quad at x = 0 facing −x (its front), the box coming from +x
  const eng = await createPhysicsEngine({ gravity: { x: 0, y: 0, z: 0 } })
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, -5, -5, 0, 5, -5, 0, 5, 5, 0, -5, 5]), 3))
  g.setIndex([0, 1, 2, 0, 2, 3])
  const n = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, 10, 10))
  new RoadPhysics(eng).syncTile('t', [g])
  const from = n.x < 0 ? 4 : -4                    // start on the quad's BACK side
  const b = box(eng, { x: from, y: 0, z: 0 }, { x: -Math.sign(from) * 8, y: 0, z: 0 })
  run(eng, 2)
  const x = at(eng, b).x
  check(Math.sign(x) === Math.sign(from) && Math.abs(x) < Math.abs(from), `a box driven at a shell's back face stops at it: x ${from} → ${x.toFixed(2)} (front faces ${n.x < 0 ? '−x' : '+x'})`)
  eng.dispose()
}
{ // (4) BUG-81 third report: the shoulder by the wall. A heightfield cell is two flat triangles, so cutting only the
  // vertices within R left the cells that straddle R ramping up to the hill INSIDE the tube — a jagged hidden wall
  // in from the lining. The run sits half a cell off the grid (z = 32.5) so the last cut vertex is 0.5 m short of R:
  // a box whose side reaches 7.8 m out, driven along the bore, must pass untouched.
  const off = { ...road, _network: new Map([['bore', { ...road._network.get('bore'),
    points: [{ x: -20, y: 0, z: 32.5 }, { x: 84, y: 0, z: 32.5 }] }]]) }
  const eng = await createPhysicsEngine({ gravity: { x: 0, y: 0, z: 0 } })
  new TerrainPhysics(eng, () => off).syncChunk('0,0', 0, 0, posAttr, N, S)
  const b = box(eng, { x: 4, y: 2, z: 32.5 + 5.8 }, { x: 15, y: 0, z: 0 })   // half-width 2 across the run: its side at 7.8
  run(eng, 3)
  const p = at(eng, b)
  check(p.x > 40 && Math.abs(p.y - 2) < 0.01 && Math.abs(p.z - 38.3) < 0.01, `a box along the bore's shoulder, its side 7.8 m out, passes untouched: x ${p.x.toFixed(1)} y ${p.y.toFixed(3)} z ${p.z.toFixed(3)}`)
  eng.dispose()
}
process.exit(fail ? 1 : 0)
