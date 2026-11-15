// GATE (BUG-172): a body posed on the ground spawns only once the ground under it is a collider.
//
// main.js swaps a barricade row (and an ornament, a ground item, a demolition target) from models to
// loose bodies when the truck comes near. Near is not enough: a resumed save, a reset or a slow machine
// reaches the row before its terrain chunk / road tile has streamed, the bodies fall, and the deck
// arriving later throws them out sideways (1.9–5.8 m off their pose, INFRA-15 at 4× throttle). The swap
// now also asks TerrainPhysics.hasChunkAt / RoadPhysics.hasTileAt — this gate pins those two queries
// against the colliders they describe, and that a row spawned once they say yes stands at rest.
//
// Run: node test/barricade-ground.mjs

import * as THREE from 'three'
import { createPhysicsEngine } from '../src/physics-engine.js'
import { TerrainPhysics, RoadPhysics } from '../src/terrain-physics.js'

let fail = 0
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail++ }
const S = 64, N = 65, DECK = 0.15   // the ribbon sits roadClearanceMargin above the carved dirt
const HALF = { x: 0.6, y: 0.75, z: 0.12 }   // a Type III barricade's box, ~10 kg
// Three poses across the deck at the middle of chunk (0,0), as poi.js sites a row.
const poses = [-2, 0, 2].map((dx) => ({ x: 32 + dx, y: DECK + HALF.y + 0.01, z: 32 }))

const plane = new THREE.PlaneGeometry(S, S, N - 1, N - 1)   // the chunk mesh, flat at y = 0
plane.rotateX(-Math.PI / 2)
const deck = new THREE.BufferGeometry()                      // one upward-facing quad of asphalt
deck.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
  20, DECK, 28, 20, DECK, 36, 44, DECK, 36, 44, DECK, 28]), 3))
deck.setIndex([0, 1, 2, 0, 2, 3])
deck.userData.colliderSurfaceOnly = true

const eng = await createPhysicsEngine()
const tp = new TerrainPhysics(eng), rp = new RoadPhysics(eng, S)
const ready = () => poses.every((p) => tp.hasChunkAt(p.x, p.z) && rp.hasTileAt(p.x, p.z))   // main.js's row guard
const spawn = () => poses.map((p) => {
  const b = eng.createBody({ type: 'dynamic', position: p })
  eng.addBox(b, HALF, { density: 10 / (8 * HALF.x * HALF.y * HALF.z), friction: 0.6 })
  return b
})
const at = (b) => { const p = new THREE.Vector3(); eng.getTransform(b, p, new THREE.Quaternion()); return p }
const run = (s) => { for (let i = 0; i < s * 60; i++) eng.step(1 / 60) }

// (1) nothing streamed: the guard says no — and a body spawned anyway falls (the bug)
check(!ready(), 'no chunk, no tile: the row is not ready')
{
  const [b] = spawn(); run(1)
  check(at(b).y < poses[0].y - 2, `control: a body spawned with no ground falls (y ${at(b).y.toFixed(1)} after 1 s)`)
  eng.destroyBody(b)
}

// (2) the heightfield alone is not the deck
tp.syncChunk('0,0', 0, 0, plane.attributes.position, N, S)
check(tp.hasChunkAt(32, 32) && !tp.hasChunkAt(-1, 32) && !tp.hasChunkAt(32, 64.5), 'hasChunkAt is true inside the built chunk only')
check(!ready(), 'chunk built, no road tile: still not ready')
rp.syncTile('1,0', [new THREE.BufferGeometry()])   // a tile with no deck shapes never counts
check(!rp.hasTileAt(70, 10), 'a road tile with no deck shapes is not ground')

// (3) the deck lands: ready, and the row spawned now stands at rest on its pose
rp.syncTile('0,0', [deck])
check(ready(), 'chunk and deck built: the row is ready')
const row = spawn(); run(3)
const off = Math.max(...row.map((b, i) => at(b).distanceTo(new THREE.Vector3(poses[i].x, DECK + HALF.y, poses[i].z))))
const v = new THREE.Vector3(), w = new THREE.Vector3()
const speed = Math.max(...row.map((b) => { eng.getVelocity(b, v, w); return v.length() + w.length() }))
check(off < 0.02 && speed < 0.01, `spawned on built ground the row rests on its pose: worst ${(off * 100).toFixed(1)} cm off, |v|+|ω| ${speed.toFixed(4)}`)

// (4) the collider streams out: not ready again
tp.disposeChunk('0,0')
check(!tp.hasChunkAt(32, 32) && !ready(), 'chunk disposed: the row is not ready again')
eng.dispose()

console.log(fail ? `\nFAIL (${fail})` : '\nPASS')
process.exit(fail ? 1 : 0)
