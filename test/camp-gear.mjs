// test/camp-gear.mjs — FEAT-66 camp gear slots gate (SM-3).
//
// Pins:
//   1. Catalog: every camp item names a slot that exists, and its `model` (if any) is a PROP_MODELS key.
//   2. Layout, on the REAL .glbs (parsed headless, the model-variant.mjs way): every slot's model, turned
//      to face the road, stays on the 6 m pad (guy lines may overhang by GUY_TOL_M), and the fire group
//      (fire, overFire) never overlaps the sleeping group (bed, shelter, shade) — those two nest by design.
//   3. Which models a packed list shows: the bed slot stacks bed → sleeping bag → blanket whatever the
//      packing order; any other slot shows the first packed; an item without a model shows nothing.
//   4. The shade fill (owner, 2026-11-02): a treeless site gets the whole shade segment back, a fully
//      shaded one nothing, and every assist together stays under VIBE_ASSIST_CAP.
//   5. The inventory side: the tent adds +10% rest, a packed awning fills shade.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { ITEMS } from '../data/items.js'
import { PROP_MODELS } from '../data/prop-models.js'
import { CAMP_SLOTS, slotModels } from '../src/camp-gear.js'
import { CAMP_PARAMS, VIBE_W, VIBE_ASSIST_CAP, vibeAssist } from '../src/camp.js'
import { InventorySystem } from '../src/inventory.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const GUY_TOL_M = 0.25   // the tarp's back guy lines reach ~0.2 m past the pad edge

let fails = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '[ ok ]' : '[FAIL]'} ${label}${ok ? '' : '  ' + detail}`)
  if (!ok) fails++
}

// ── 1. Catalog ─────────────────────────────────────────────────────────────────────────────────
const camp = Object.entries(ITEMS).filter(([, it]) => it.kind === 'camp')
const noSlot = camp.filter(([, it]) => !CAMP_SLOTS[it.campSlot]).map(([id]) => id)
check('every camp item names a slot on the pad', noSlot.length === 0, noSlot.join(', '))
const noModel = camp.filter(([, it]) => it.model && !PROP_MODELS[it.model]).map(([id]) => id)
check('every camp item model is a PROP_MODELS key', noModel.length === 0, noModel.join(', '))

// ── 2. Layout on the real models ─────────────────────────────────────────────────────────────────
async function scene (key) {
  const buf = readFileSync(join(ROOT, PROP_MODELS[key].url))
  const gltf = await new Promise((res, rej) =>
    new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), '', res, rej))
  gltf.scene.updateMatrixWorld(true)
  return gltf.scene
}
const bounds = async (key) => new THREE.Box3().setFromObject(await scene(key))
/** The highest vertex of `key` inside an x/z box. */
async function topIn (key, x0, x1, z0, z1) {
  let top = -Infinity
  const v = new THREE.Vector3()
  ;(await scene(key)).traverse(o => {
    if (!o.isMesh) return
    const p = o.geometry.attributes.position
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld)
      if (v.x > x0 && v.x < x1 && v.z > z0 && v.z < z1) top = Math.max(top, v.y)
    }
  })
  return top
}
// Pad-frame footprint: the model's −Z faces −v (camp-gear.js padYaw), so local z runs along v; local x
// runs along u with a sign that follows the road side, so take it symmetric.
const placed = [['fire', 'campfire'], ...camp.filter(([, it]) => it.model).map(([, it]) => [it.campSlot, it.model])]
const prints = []
for (const [slot, key] of placed) {
  const b = await bounds(key), s = CAMP_SLOTS[slot], hx = Math.max(-b.min.x, b.max.x)
  prints.push({ slot, key, u0: s.u - hx, u1: s.u + hx, v0: s.v + b.min.z, v1: s.v + b.max.z })
}
const H = CAMP_PARAMS.campPadHalfM + GUY_TOL_M
const off = prints.filter(p => p.u0 < -H || p.u1 > H || p.v0 < -H || p.v1 > H)
check(`every slot model stays on the pad (±${CAMP_PARAMS.campPadHalfM} m, guy lines ${GUY_TOL_M} m)`, off.length === 0,
  off.map(p => `${p.key}@${p.slot} u ${p.u0.toFixed(2)}..${p.u1.toFixed(2)} v ${p.v0.toFixed(2)}..${p.v1.toFixed(2)}`).join('; '))
const FIRE = new Set(['fire', 'overFire'])
const hits = []
for (const a of prints.filter(p => FIRE.has(p.slot))) {
  for (const b of prints.filter(p => !FIRE.has(p.slot))) {
    if (a.u0 < b.u1 && b.u0 < a.u1 && a.v0 < b.v1 && b.v0 < a.v1) hits.push(`${a.key}×${b.key}`)
  }
}
check('the fire and its kit clear the bed, the tent and the shade', hits.length === 0, hits.join(', '))
// The bed lies inside the tent (the tent's own box, not its guy lines). And the blanket, which lies on
// whatever is under it at the foot, seats within 1 cm of that layer's real top there: a layer's seatY (or
// its box top) is its highest vertex under the blanket's footprint (its middle 0.6 m across).
const tentB = await bounds('tent'), blB = await bounds('blanket'), beds = camp.filter(([, it]) => it.model && it.campSlot === 'bed')
const wide = [], seats = []
for (const [id, it] of beds) {
  const b = await bounds(it.model)
  if (b.min.x < tentB.min.x || b.max.x > tentB.max.x || b.min.z < tentB.min.z || b.max.z > tentB.max.z) wide.push(`${id} ${(b.max.x - b.min.x).toFixed(2)} x ${(b.max.z - b.min.z).toFixed(2)}`)
  if (it.layer === 2) continue
  const seat = PROP_MODELS[it.model].seatY ?? b.max.y, top = await topIn(it.model, -0.3, 0.3, blB.min.z, blB.max.z)
  if (Math.abs(seat - top) > 0.01) seats.push(`${id} seats ${seat.toFixed(3)}, top there ${top.toFixed(3)}`)
}
check('every bed model fits inside the tent', wide.length === 0, wide.join(', '))
check('the blanket seats within 1 cm of every bed\'s real top at the foot', seats.length === 0, seats.join('; '))

// ── 3. What a packed list shows ──────────────────────────────────────────────────────────────────
const bed = slotModels(['blanket', 'tent', 'sleepingBag', 'bedroll']).bed?.map(it => it.name)
check('the bed slot stacks bed, then sleeping bag, then blanket', bed?.join() === 'Bedroll,Sleeping bag,Blanket', String(bed))
const shade = slotModels(['shadeTarp', 'awning']).shade?.map(it => it.name)
check('a single-model slot shows the first packed', shade?.join() === 'Shade tarp', String(shade))
const tentModel = ITEMS.tent.model
delete ITEMS.tent.model
check('an item without a model shows nothing', !slotModels(['tent']).shelter)
ITEMS.tent.model = tentModel

// ── 4. The shade fill ───────────────────────────────────────────────────────────────────────────
const S = new Set(['shade'])
check('a treeless site gets the whole shade segment back', Math.abs(vibeAssist({ shadeScore: 0 }, S).shade - VIBE_W.shade) < 1e-12)
check('a fully shaded site gets nothing', vibeAssist({ shadeScore: VIBE_W.shade }, S).shade === 0)
check('a part-shaded site gets its deficit', Math.abs(vibeAssist({ shadeScore: 0.05 }, S).shade - 0.15) < 1e-12)
check('nothing packed, nothing given', Object.keys(vibeAssist({ shadeScore: 0 }, new Set())).length === 0)
const all = Object.values(vibeAssist({}, new Set(Object.keys(VIBE_W)))).reduce((a, b) => a + b, 0)
check(`every assist together stays under the cap (${VIBE_ASSIST_CAP})`, Math.abs(all - VIBE_ASSIST_CAP) < 1e-12, String(all))

// ── 5. The inventory side ───────────────────────────────────────────────────────────────────────
const inv = new InventorySystem({ slotCap: () => 8 })
inv.start()
inv.grant('tent'); inv.packItem(inv.list().findIndex(r => r.id === 'tent'))
check('a packed tent adds +10% rest', Math.abs(inv.restBonus() - 0.10) < 1e-12 && inv.packed().includes('tent'), String(inv.restBonus()))
check('nothing packed fills shade', !inv.fills().has('shade'))
inv.unpackItem(inv.equippedIndex(), inv.packed().indexOf('tent'))
inv.grant('awning'); inv.packItem(inv.list().findIndex(r => r.id === 'awning'))
check('a packed awning fills shade', inv.fills().has('shade'))

console.log(fails === 0 ? '\ncamp-gear gate: ALL OK' : `\ncamp-gear gate: ${fails} FAILURE(S)`)
process.exit(fails === 0 ? 0 : 1)
