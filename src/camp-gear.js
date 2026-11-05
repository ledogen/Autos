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
// THE BED SLOT STACKS (FEAT-171, owner 2026-11-05): ground (a pad or mattress), bedding (the bedroll or
// the bag), blanket (the blanket or the quilt), bottom to top — data/items.js `bed`. Every other slot shows
// one model, the first packed. An item with no `model` renders nothing — no placeholder art.
//
// THE BED DRAPES. The bedding is wider than any pad (0.86–0.88 m on 0.51–0.78 m), so a rigid layer seated
// on the one under it floats its edges in the air. Each layer above the ground is BENT onto the ones under
// it instead: their triangles are rasterised into a height field in the bed's frame (model space — every
// bed model shares it), the field is spread so it falls away from a support's edge at DRAPE.fall (rise per
// metre: the overhang hangs) after a flat DRAPE.reachM (covers the cells the raster misses and a sheet's
// chord between its vertices), and every vertex of the layer is lifted by the field under it. The models'
// faces share no vertices, so a per-vertex lift keeps every seam closed. A draped layer gets its own copy
// of the geometry (pooled geometry is never written — BUG-72), disposed on hide.
//
// Render-only, like campfire.js: main.js hands it a pad, the packed ids and a ground sampler. No
// physics bodies — the truck is held while camped.

import * as THREE from 'three'
import { getModel, spawnModel, instantiate } from './model-service.js'
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

const BED_ORDER = { ground: 0, bedding: 1, blanket: 2 }

/** The models a packed list puts in each slot, bottom layer first: { slot: [item, …] }. */
export function slotModels (packedIds) {
  const bySlot = {}
  for (const id of packedIds) {
    const it = ITEMS[id]
    if (it?.model) (bySlot[it.campSlot] ??= []).push(it)
  }
  for (const slot in bySlot) {
    bySlot[slot] = slot === 'bed' ? bySlot[slot].sort((a, b) => BED_ORDER[a.bed] - BED_ORDER[b.bed]) : bySlot[slot].slice(0, 1)
  }
  return bySlot
}

export const DRAPE = { cellM: 0.02, fall: 2.5, reachM: 0.03 }

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3()

/** Call fn(a, b, c) for every triangle of `root`'s meshes, in `root`'s space (root at the origin). */
function _eachTri (root, fn) {
  root.updateMatrixWorld(true)
  const inv = root.matrixWorld.clone().invert()
  root.traverse((o) => {
    if (!o.isMesh) return
    const p = o.geometry.attributes.position, ix = o.geometry.index, m = inv.clone().multiply(o.matrixWorld)
    const n = ix ? ix.count : p.count, at = (k) => (ix ? ix.getX(k) : k)
    for (let k = 0; k < n; k += 3) {
      fn(_a.fromBufferAttribute(p, at(k)).applyMatrix4(m), _b.fromBufferAttribute(p, at(k + 1)).applyMatrix4(m),
         _c.fromBufferAttribute(p, at(k + 2)).applyMatrix4(m))
    }
  })
}

/**
 * The top of `roots` as a height field: each cell (size `cell`, over x0..x1 × z0..z1) the highest point of
 * any triangle at the cell's centre, 0 (the ground) where there is none. { x0, z0, nx, nz, cell, h }.
 */
export function supportField (roots, { x0, x1, z0, z1 }, cell) {
  const nx = Math.ceil((x1 - x0) / cell) + 1, nz = Math.ceil((z1 - z0) / cell) + 1
  const h = new Float32Array(nx * nz)
  for (const r of roots) {
    _eachTri(r, (a, b, c) => {
      const d = (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)
      if (Math.abs(d) < 1e-12) return   // edge-on: its neighbours carry the top
      const i0 = Math.max(0, Math.ceil((Math.min(a.x, b.x, c.x) - x0) / cell)), i1 = Math.min(nx - 1, Math.floor((Math.max(a.x, b.x, c.x) - x0) / cell))
      const j0 = Math.max(0, Math.ceil((Math.min(a.z, b.z, c.z) - z0) / cell)), j1 = Math.min(nz - 1, Math.floor((Math.max(a.z, b.z, c.z) - z0) / cell))
      for (let i = i0; i <= i1; i++) {
        const x = x0 + i * cell
        for (let j = j0; j <= j1; j++) {
          const z = z0 + j * cell
          const u = ((b.x - x) * (c.z - z) - (c.x - x) * (b.z - z)) / d, v = ((c.x - x) * (a.z - z) - (a.x - x) * (c.z - z)) / d
          if (u < -1e-9 || v < -1e-9 || u + v > 1 + 1e-9) continue
          const y = u * a.y + v * b.y + (1 - u - v) * c.y
          if (y > h[i * nz + j]) h[i * nz + j] = y
        }
      }
    })
  }
  return { x0, z0, nx, nz, cell, h }
}

/** Spread a field so it falls at `fall` from each support's edge after a flat `reach` (see THE BED DRAPES). */
export function spreadField (f, fall, reach) {
  const { nx, nz, cell, h } = f, out = Float32Array.from(h)
  let top = 0
  for (const v of h) top = Math.max(top, v)
  const R = Math.ceil((reach + top / fall) / cell), offs = []
  for (let di = -R; di <= R; di++) for (let dj = -R; dj <= R; dj++) {
    const d = Math.hypot(di, dj) * cell
    if (d <= R * cell) offs.push([di, dj, fall * Math.max(0, d - reach)])
  }
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const v = h[i * nz + j]
    if (!(v > 0)) continue
    for (const [di, dj, drop] of offs) {
      const ii = i + di, jj = j + dj
      if (ii < 0 || jj < 0 || ii >= nx || jj >= nz || v - drop <= out[ii * nz + jj]) continue
      out[ii * nz + jj] = v - drop
    }
  }
  return { ...f, h: out }
}

/** The field at (x, z), bilinear; 0 off the grid. */
export function fieldAt (f, x, z) {
  const fx = (x - f.x0) / f.cell, fz = (z - f.z0) / f.cell, i = Math.floor(fx), j = Math.floor(fz)
  if (i < 0 || j < 0 || i >= f.nx - 1 || j >= f.nz - 1) return 0
  const tx = fx - i, tz = fz - j, h = f.h, n = f.nz
  return (h[i * n + j] * (1 - tx) + h[(i + 1) * n + j] * tx) * (1 - tz) + (h[i * n + j + 1] * (1 - tx) + h[(i + 1) * n + j + 1] * tx) * tz
}

/** The surface a layer covering box `box` (x/z, bed frame) drapes onto over `supports`: their tops, spread. */
export function drapeField (supports, box) {
  let top = 0
  for (const r of supports) top = Math.max(top, new THREE.Box3().setFromObject(r).max.y)
  const pad = DRAPE.reachM + top / DRAPE.fall + DRAPE.cellM
  return spreadField(supportField(supports, { x0: box.min.x - pad, x1: box.max.x + pad, z0: box.min.z - pad, z1: box.max.z + pad },
    DRAPE.cellM), DRAPE.fall, DRAPE.reachM)
}

/**
 * Stack the bed: `roots` are instantiated layer models, bottom first, each at the origin in the bed's frame.
 * Every one after the first is draped over all the ones under it — its meshes get their own (non-indexed,
 * so the facets stay flat) geometry, lifted vertex by vertex. Returns the geometries it made.
 */
export function stackBed (roots) {
  const made = []
  for (let k = 1; k < roots.length; k++) {
    const f = drapeField(roots.slice(0, k), new THREE.Box3().setFromObject(roots[k]))
    roots[k].updateMatrixWorld(true)
    const inv = roots[k].matrixWorld.clone().invert(), v = new THREE.Vector3()
    roots[k].traverse((o) => {
      if (!o.isMesh) return
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(), p = g.attributes.position
      const toRoot = inv.clone().multiply(o.matrixWorld), toMesh = toRoot.clone().invert()
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(toRoot)
        v.y += fieldAt(f, v.x, v.z)
        v.applyMatrix4(toMesh)
        p.setXYZ(i, v.x, v.y, v.z)
      }
      g.computeVertexNormals()
      g.computeBoundingBox(); g.computeBoundingSphere()
      o.geometry = g
      made.push(g)
    })
  }
  return made
}

export class CampGear {
  constructor (parent) {
    this.root = new THREE.Group()
    this.root.name = 'camp-gear'
    parent.add(this.root)
    this._last = null
    this._made = []   // the draped bed's own geometries (stackBed), disposed on hide
    this._gen = 0     // bumped by hide(): a bed still loading for an old dressing drops itself
  }

  /** Dress a pad with the packed gear. `groundAt(x, z)` returns the ground's height there. */
  show (pad, packedIds, groundAt) {
    this.hide()
    this._last = { pad, groundAt }
    const yaw = padYaw(pad)
    for (const [slot, items] of Object.entries(slotModels(packedIds))) {
      const { x, z } = slotXZ(pad, slot)
      const y = groundAt(x, z)
      // One group per model, added now in order (the dressing reads in packing order); the bed's fill in
      // together once every layer has loaded, stacked (stackBed).
      const groups = items.map((it) => {
        const m = slot === 'bed' ? new THREE.Group() : spawnModel(it.model, { receiveShadow: true })
        m.name = `model:${it.model}`
        m.position.set(x, y, z)
        m.rotation.y = yaw
        this.root.add(m)
        return m
      })
      if (slot !== 'bed') continue
      const gen = this._gen
      Promise.all(items.map(it => getModel(it.model))).then((recs) => {
        if (gen !== this._gen) return
        const layers = recs.map((rec) => {
          const inst = instantiate(rec)
          inst.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
          return inst
        })
        this._made.push(...stackBed(layers))
        layers.forEach((inst, k) => groups[k].add(inst))
      })
    }
  }

  /** Packing changed: re-dress the camp that is up, if there is one. */
  refresh (packedIds) {
    if (this._last) this.show(this._last.pad, packedIds, this._last.groundAt)
  }

  hide () {
    this._last = null
    this._gen++
    this.root.clear()   // clones share the template's geometry and materials — all but the draped bed's own
    for (const g of this._made) g.dispose()
    this._made = []
  }
}
