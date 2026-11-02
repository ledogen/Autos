// src/camp-gear.js — FEAT-66: the camp gear slots. What is in the equipped pack is what stands on the
// pad (items.md §2b's visible-kit rule as §2c re-reads it: *what you packed is what renders*).
//
// THE PAD FRAME. camp.js hands out pad { x, z, tx, tz, nx, nz }: t along the road, n away from it.
// A slot is a point in that frame (u along t, v along n), and every model faces the road — its front
// (−Z) along −n — so the tent's door, the awning's open side and the cooking kit's open frame all
// face the fire and the truck.
//
// SLOTS THAT SHARE A POINT NEST. The cooking kit straddles the fire (ASSET-25's acceptance line), and
// the tent and the shade stand over the bed — shade over where you sleep. Nesting is what fits the
// gear on the 6 m pad: measured with their guy lines, the tent is 2.4 × 3.2 m and the tarp 3.7 × 3.5 m,
// and side by side with a fire they do not fit. test/camp-gear.mjs checks the layout on the real .glbs.
//
// THE BED SLOT STACKS: the bed, the sleeping bag on it, the blanket on top of either (owner,
// 2026-11-02), each seated on the measured top of the layer under it. Every other slot shows one
// model, the first packed. An item with no `model` renders nothing — no placeholder art.
//
// Render-only, like campfire.js: main.js hands it a pad, the packed ids and a ground sampler. No
// physics bodies — the truck is held while camped.

import * as THREE from 'three'
import { getModel, spawnModel } from './model-service.js'
import { ITEMS } from '../data/items.js'

/** Pad-frame slot points, metres: u along the road, v away from it. The pad is ±campPadHalfM (3). */
export const CAMP_SLOTS = {
  fire:     { u: 0, v: -1.3 },   // campfire.js lights it here: road side, in front of the bed
  overFire: { u: 0, v: -1.3 },
  bed:      { u: 0, v: 1.3 },
  shelter:  { u: 0, v: 1.3 },
  shade:    { u: 0, v: 1.1 },    // a little forward of the bed, so the tarp's low edge clears the tent's ridge
}

/** World x/z of a slot on a pad. */
export function slotXZ (pad, slot) {
  const s = CAMP_SLOTS[slot]
  return { x: pad.x + s.u * pad.tx + s.v * pad.nx, z: pad.z + s.u * pad.tz + s.v * pad.nz }
}

/** The yaw that turns a model's front (−Z) toward the road (−n). */
export const padYaw = (pad) => Math.atan2(pad.nx, pad.nz)

/** The models a packed list puts in each slot, bottom layer first: { slot: [item, …] }. */
export function slotModels (packedIds) {
  const bySlot = {}
  for (const id of packedIds) {
    const it = ITEMS[id]
    if (it?.model) (bySlot[it.campSlot] ??= []).push(it)
  }
  for (const slot in bySlot) {
    bySlot[slot] = slot === 'bed' ? bySlot[slot].sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0)) : bySlot[slot].slice(0, 1)
  }
  return bySlot
}

export class CampGear {
  constructor (parent) {
    this.root = new THREE.Group()
    this.root.name = 'camp-gear'
    parent.add(this.root)
    this._last = null
  }

  /** Dress a pad with the packed gear. `groundAt(x, z)` returns the ground's height there. */
  show (pad, packedIds, groundAt) {
    this.hide()
    this._last = { pad, groundAt }
    const yaw = padYaw(pad)
    for (const [slot, items] of Object.entries(slotModels(packedIds))) {
      const { x, z } = slotXZ(pad, slot)
      const y = groundAt(x, z)
      items.forEach((it, k) => {
        const m = spawnModel(it.model, { receiveShadow: true })
        m.position.set(x, y, z)
        m.rotation.y = yaw
        this.root.add(m)
        // A bed layer sits on the tops of the layers under it (base-seated models: top = height).
        if (k) {
          Promise.all(items.slice(0, k).map(b => getModel(b.model))).then((recs) => {
            m.position.y = y + recs.reduce((h, r) => h + new THREE.Box3().setFromObject(r.template).max.y, 0)
          })
        }
      })
    }
  }

  /** Packing changed: re-dress the camp that is up, if there is one. */
  refresh (packedIds) {
    if (this._last) this.show(this._last.pad, packedIds, this._last.groundAt)
  }

  hide () {
    this._last = null
    this.root.clear()   // clones share the template's geometry and materials: nothing to dispose
  }
}
