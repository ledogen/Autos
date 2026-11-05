// test/camp-gear.mjs — FEAT-66 camp gear slots gate (SM-3).
//
// Pins:
//   1. Catalog: every camp item names a slot that exists, and its `model` (if any) is a PROP_MODELS key.
//   2. Layout, on the REAL .glbs (parsed headless, the model-variant.mjs way): every slot's model, turned
//      to face the road, stays on the 6 m pad (guy lines may overhang by GUY_TOL_M), and the fire group
//      (fire, overFire) never overlaps the sleeping group (bed, shelter, shade) — those two nest by design.
//      FEAT-171: THE DRAPE — every ground × bedding × blanket stack (4 × 2 × 3), built by camp-gear.js
//      stackBed on the real models. Per 5 cm cell, a draped layer's LOWEST underside (its downward faces,
//      sampled at their centres and edge middles — a pillow on the bedroll's own fold is not its underside)
//      never sinks more than DIP_M into the raw tops under it, and never hovers more than HOVER_M over the
//      surface it was draped onto (drapeField) — interior cells only; HOVER_M is a sheet's chord between its
//      vertices, sagging below or bridging above the drape's bilinear surface. Where that surface tents over a step (the reach, the fall) is
//      reported, not failed: it is the drape's shape, and the screenshot sheet is where it gets judged.
//   3. Which models a packed list shows: the bed slot stacks ground → bedding → blanket whatever the
//      packing order; any other slot shows the first packed; an item without a model shows nothing.
//   4. The shade fill (owner, 2026-11-02): a treeless site gets the whole shade segment back, a fully
//      shaded one nothing, and every assist together stays under VIBE_ASSIST_CAP.
//   5. The inventory side: the tent adds +10% rest, a packed awning fills shade. FEAT-171: the starter Pack
//      is the bedroll alone; one item per bed layer (a second swaps); the equipped pack keeps its bedding;
//      the full kit is +35 % on the recovery rate.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { ITEMS } from '../data/items.js'
import { PROP_MODELS } from '../data/prop-models.js'
import { CAMP_SLOTS, slotModels, stackBed, supportField, fieldAt, drapeField } from '../src/camp-gear.js'
import { DaySystem } from '../src/day.js'
import { CAMP_PARAMS, VIBE_W, VIBE_ASSIST_CAP, vibeAssist } from '../src/camp.js'
import { InventorySystem } from '../src/inventory.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const GUY_TOL_M = 0.25   // the tarp's back guy lines reach ~0.2 m past the pad edge
const DIP_M = 0.015, HOVER_M = 0.02   // FEAT-171's drape: the deepest a layer may sink into the tops under it; the most it may hover over its drape

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
// The bed lies inside the tent (the tent's own box, not its guy lines).
const tentB = await bounds('tent'), beds = camp.filter(([, it]) => it.model && it.campSlot === 'bed')
const wide = []
for (const [id, it] of beds) {
  const b = await bounds(it.model)
  if (b.min.x < tentB.min.x || b.max.x > tentB.max.x || b.min.z < tentB.min.z || b.max.z > tentB.max.z) wide.push(`${id} ${(b.max.x - b.min.x).toFixed(2)} x ${(b.max.z - b.min.z).toFixed(2)}`)
}
check('every bed model fits inside the tent', wide.length === 0, wide.join(', '))

// FEAT-171: the drape, every stack (see the header).
const byBed = (b) => beds.filter(([, it]) => it.bed === b).map(([id]) => id)
const stacks = []
for (const g of [null, ...byBed('ground')]) for (const d of byBed('bedding')) for (const t of [null, ...byBed('blanket')]) stacks.push([g, d, t].filter(Boolean))
let worstDip = 0, worstHover = 0, worstTent = 0, msMax = 0
const drapeBad = []
const nA = new THREE.Vector3(), nB = new THREE.Vector3(), nC = new THREE.Vector3(), nrm = new THREE.Vector3(), eAC = new THREE.Vector3()
for (const ids of stacks) {
  const roots = await Promise.all(ids.map(id => scene(ITEMS[id].model)))
  const t0 = performance.now()
  stackBed(roots)
  msMax = Math.max(msMax, performance.now() - t0)
  for (let k = 1; k < roots.length; k++) {
    const box = new THREE.Box3().setFromObject(roots[k]), C = 0.05   // coarser than any sheet's ~3 cm samples: every cell has base
    const raw = supportField(roots.slice(0, k), { x0: box.min.x, x1: box.max.x, z0: box.min.z, z1: box.max.z }, 0.005)
    const drape = drapeField(roots.slice(0, k), box)
    const nx = Math.ceil((box.max.x - box.min.x) / C) + 1, nz = Math.ceil((box.max.z - box.min.z) / C) + 1
    const low = new Float32Array(nx * nz).fill(Infinity), lx = new Float32Array(nx * nz), lz = new Float32Array(nx * nz)
    roots[k].updateMatrixWorld(true)
    roots[k].traverse(o => {
      if (!o.isMesh) return
      const p = o.geometry.attributes.position
      for (let i = 0; i < p.count; i += 3) {
        nA.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); nB.fromBufferAttribute(p, i + 1).applyMatrix4(o.matrixWorld); nC.fromBufferAttribute(p, i + 2).applyMatrix4(o.matrixWorld)
        nrm.subVectors(nB, nA).cross(eAC.subVectors(nC, nA))
        if (!(nrm.y < -0.5 * nrm.length())) continue   // downward faces only
        for (const [u, v, w] of [[1 / 3, 1 / 3, 1 / 3], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5]]) {
          const x = u * nA.x + v * nB.x + w * nC.x, y = u * nA.y + v * nB.y + w * nC.y, z = u * nA.z + v * nB.z + w * nC.z
          const c = Math.floor((x - box.min.x) / C) * nz + Math.floor((z - box.min.z) / C)
          if (y < low[c]) { low[c] = y; lx[c] = x; lz[c] = z }
        }
      }
    })
    let dip = 0, hover = 0, tent = 0
    for (let c = 0; c < low.length; c++) {
      // Interior cells only: one on the layer's rim may hold only a part above its base (the bag's collar).
      if (low[c] === Infinity || [c - 1, c + 1, c - nz, c + nz].some(q => !(low[q] < Infinity))) continue
      const h = fieldAt(raw, lx[c], lz[c]), d = fieldAt(drape, lx[c], lz[c])
      if (h < 0.005) continue   // off every support: hanging, or on the ground
      dip = Math.min(dip, low[c] - h); hover = Math.max(hover, low[c] - d); tent = Math.max(tent, d - h)
    }
    worstDip = Math.min(worstDip, dip); worstHover = Math.max(worstHover, hover); worstTent = Math.max(worstTent, tent)
    if (dip < -DIP_M || hover > HOVER_M) drapeBad.push(`${ids.slice(0, k + 1).join('+')}: sinks ${(dip * 100).toFixed(1)} cm, hovers ${(hover * 100).toFixed(1)} cm`)
  }
}
console.log(`       drape: ${stacks.length} stacks · worst sink ${(worstDip * 100).toFixed(1)} cm · worst hover ${(worstHover * 100).toFixed(1)} cm · tallest tent over a step ${(worstTent * 100).toFixed(1)} cm · stackBed ≤ ${msMax.toFixed(0)} ms`)
check(`every stack drapes: no layer sinks more than ${DIP_M * 100} cm into the ones under it, or hovers more than ${HOVER_M * 100} cm over its drape`, drapeBad.length === 0, drapeBad.slice(0, 6).join('; '))

// ── 3. What a packed list shows ──────────────────────────────────────────────────────────────────
const bed = slotModels(['quilt', 'tent', 'sleepingBag', 'sleepingPad']).bed?.map(it => it.name)
check('the bed slot stacks ground, then bedding, then blanket', bed?.join() === 'Sleeping pad,Sleeping bag,Quilt', String(bed))
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

// FEAT-171: the bed's three layers.
const b = new InventorySystem({ slotCap: () => 8 }), at = (id) => b.list().findIndex(r => r.id === id)
let starter = true
for (let i = 0; i < 20; i++) { b.start(); starter &&= b.packed().join() === 'bedroll' }
check('the starter Pack is the bedroll alone (20 runs)', starter)
b.grant('sleepingBag'); b.packItem(at('sleepingBag'))
check('the sleeping bag takes the bedroll\'s place; the bedroll goes back to the truck', b.packed().join() === 'sleepingBag' && at('bedroll') >= 0)
check('the equipped pack never gives up its bedding', !b.unpackItem(b.equippedIndex(), b.packed().indexOf('sleepingBag')))
b.grant('sleepingPad'); b.packItem(at('sleepingPad'))
b.grant('deluxeSleepingPad'); b.packItem(at('deluxeSleepingPad'))
check('one item per layer: a second pad swaps the first out', b.packed().join() === 'sleepingBag,deluxeSleepingPad' && at('sleepingPad') >= 0)
b.grant('quilt')
check('the starter Pack runs two layers at most', !b.packItem(at('quilt')))
ITEMS.pack.packSlots = 3
check('a bigger pack takes the third', b.packItem(at('quilt')) && b.packed().length === 3)
const day = new DaySystem({ setTimeOfDay: () => {} })
check('the full kit is +35 % on the recovery rate (deluxe pad, bag, quilt)', Math.abs(b.restBonus() - 0.35) < 1e-12
  && Math.abs(day.recoveryRate(0.5, b.restBonus()) - day.recoveryRate(0.5) * 1.35) < 1e-12, String(b.restBonus()))
ITEMS.pack.packSlots = 2

console.log(fails === 0 ? '\ncamp-gear gate: ALL OK' : `\ncamp-gear gate: ${fails} FAILURE(S)`)
process.exit(fails === 0 ? 0 : 1)
