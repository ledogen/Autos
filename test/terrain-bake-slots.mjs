// test/terrain-bake-slots.mjs — BUG-202: every chunk drawn from the terrain bake shows ITS OWN pixels.
// The bake atlas is toroidal (a slot is shared by every chunk BAKE_N apart); the High/Ultra chunk rings are wider
// than that. A fake renderer records which chunk was last rendered into each atlas slot; after the bake settles,
// every chunk on the baked or blend material must find its own pixels in its slot. Run over the Ultra ring
// (ring 4 + warm 4 + keep 1 → 19 chunks across), then with the stream centre walked 7 chunks out and back (a chunk
// returning to the window must not trust a slot that was overwritten while it was out).
import * as THREE from 'three'
import { TerrainBake } from '../src/terrain-bake.js'
import { CHUNK_SIZE } from '../src/terrain-height.js'

const written = new Map()                 // atlas pixel origin "px,py" → chunk key last rendered there
let target = null
const renderer = {
  domElement: { addEventListener () {} },
  initRenderTarget () {},
  getRenderTarget: () => target,
  setRenderTarget (rt) { target = rt },
  render (scene) { if (target) written.set(`${target.viewport.x},${target.viewport.y}`, scene.children[0].geometry.userData.key) },
}
const bake = new TerrainBake(renderer)
const live = new THREE.MeshStandardMaterial()
const truck = new THREE.Vector3()
const R = 9                               // Ultra: ring + warm + keep margin
const tp = bake._tp, N = bake._alb.width / tp
const pmod = (a, n) => ((a % n) + n) % n

function ringAt (ccx, ccz) {
  const m = new Map()
  for (let cx = ccx - R; cx <= ccx + R; cx++) for (let cz = ccz - R; cz <= ccz + R; cz++) {
    const key = `${cx},${cz}`, g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3)); g.userData.key = key
    const mesh = new THREE.Mesh(g, live); mesh.position.set(cx * CHUNK_SIZE + CHUNK_SIZE / 2, 0, cz * CHUNK_SIZE + CHUNK_SIZE / 2)
    m.set(key, { cx, cz, mesh })
  }
  return m
}
const chunks = new Map()                  // chunk records persist across centre moves, like terrain.js's map
function settle (ccx, ccz) {
  truck.set(ccx * CHUNK_SIZE + 1, 0, ccz * CHUNK_SIZE + 1)
  for (const [k, c] of ringAt(ccx, ccz)) if (!chunks.has(k)) chunks.set(k, c)
  for (const k of [...chunks.keys()]) { const c = chunks.get(k); if (Math.max(Math.abs(c.cx - ccx), Math.abs(c.cz - ccz)) > R) chunks.delete(k) }
  for (let f = 0; f < 200; f++) bake.update(live, chunks, truck, ccx, ccz)
  let baked = 0, wrong = []
  for (const [k, c] of chunks) {
    if (c.mesh.material === live) continue
    baked++
    const slot = `${pmod(-c.cx - 1, N) * tp},${pmod(c.cz, N) * tp}`
    if (written.get(slot) !== k) wrong.push(`${k} shows ${written.get(slot)}`)
  }
  return { baked, wrong }
}

let fail = 0
for (const [label, cx, cz] of [['ultra ring @0,0', 0, 0], ['centre +7', 7, 0], ['back to 0,0', 0, 0], ['centre −3,+5', -3, 5]]) {
  const { baked, wrong } = settle(cx, cz)
  const ok = baked >= 100 && wrong.length === 0
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: ${chunks.size} chunks, ${baked} drawn from the bake, ${wrong.length} showing another chunk's pixels${wrong.length ? ' e.g. ' + wrong.slice(0, 3).join('; ') : ''}`)
}
console.log(fail ? `FAIL terrain-bake-slots (${fail})` : 'PASS terrain-bake-slots')
process.exit(fail ? 1 : 0)
