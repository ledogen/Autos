/**
 * src/props/prop-system.js — Instanced prop renderer + chunk lifecycle for FEAT-06.
 *
 * Owns the baked palette (prop-palette.js) and renders scattered props (prop-scatter.js) via one
 * GLOBAL InstancedMesh per (category × variant) — so total draw calls = Σ variants (~20),
 * INDEPENDENT of how many chunks are active. Each mesh keeps a free-list of instance slots; a
 * chunk allocates slots when streamed in and returns them when streamed out.
 *
 * Decoupled from road/terrain: the caller injects `samplers` (heightAt / normalAt / roadBlocked),
 * so this module imports nothing from road.js/terrain.js (they're under active bugfix work).
 *
 * INTEGRATION (do at merge time — NOT wired yet):
 *   import { PropSystem } from './props/prop-system.js'
 *   const props = new PropSystem({
 *     scene, worldSeed,
 *     samplers: {
 *       heightAt:    (x,z) => terrainSystem.analyticHeight(x, z),
 *       normalAt:    (x,z) => terrainSystem.analyticNormal(x, z),
 *       roadBlocked: (x,z) => !!roadSystem.queryNearest(x, z, FLORA_PARAMS.scatter.roadExclusion),
 *     },
 *   })
 *   // once per frame (or on chunk-stream change), with the car/view centre + ring in CHUNKS:
 *   props.update(carX, carZ, ringChunks)
 *
 * PERF-05 gotcha: instanced meshes set frustumCulled = false (chunk streaming already bounds
 * them) so we never hit the "stale boundingSphere holes the draw" trap after matrix writes.
 */

import * as THREE from 'three'
import { buildPalette } from './prop-palette.js'
import { scatterChunk } from './prop-scatter.js'
import { FLORA_PARAMS } from '../../data/flora.js'

// Per-category global instance capacity (split evenly across that category's variants). Sized for
// the ring-4 (Ultra, 81-chunk) worst case; pure typed-array memory (64 B/instance), cheap.
const CAPACITY = {
  aspen: 4000, pine: 4000, rock: 3000, boulder: 200, smallRock: 9000, bush: 4000,
}

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const _col = new THREE.Color()
const _HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0)

export class PropSystem {
  /**
   * @param {{scene:THREE.Object3D, worldSeed:number, samplers:object, params?:object}} opts
   */
  constructor({ scene, worldSeed, samplers, params = FLORA_PARAMS }) {
    this._scene = scene
    this._seed = worldSeed >>> 0
    this._samplers = samplers
    this._params = params
    this._chunkSize = params.chunkSize

    const { variants, material } = buildPalette(this._seed, params)
    this._material = material

    // meshes: key "cat#v" -> { mesh, free:[], used:0 }
    this._meshes = new Map()
    for (const cat of Object.keys(variants)) {
      const geos = variants[cat]
      const perVariant = Math.max(1, Math.floor((CAPACITY[cat] ?? 1000) / geos.length))
      geos.forEach((geo, v) => {
        const mesh = new THREE.InstancedMesh(geo, material, perVariant)
        mesh.frustumCulled = false           // PERF-05: chunk streaming bounds these
        mesh.castShadow = true
        mesh.receiveShadow = true
        mesh.count = perVariant
        // start all slots hidden
        for (let i = 0; i < perVariant; i++) mesh.setMatrixAt(i, _HIDDEN)
        mesh.instanceMatrix.needsUpdate = true
        // free list (use high indices first so low slots fill contiguously)
        const free = []
        for (let i = perVariant - 1; i >= 0; i--) free.push(i)
        this._meshes.set(cat + '#' + v, { mesh, free, used: 0, cap: perVariant })
        scene.add(mesh)
      })
    }

    this._chunks = new Map()   // "cx,cz" -> [{ key, slot }, ...]
    this._dirty = new Set()    // mesh keys needing instanceMatrix/instanceColor upload
    this._overflowWarned = false
  }

  // ── chunk lifecycle ─────────────────────────────────────────────────────────────────
  ensureChunk(cx, cz) {
    const ck = cx + ',' + cz
    if (this._chunks.has(ck)) return
    const placements = scatterChunk(cx, cz, this._seed, this._samplers, this._params)
    const owned = []
    for (const pl of placements) {
      const key = pl.cat + '#' + pl.variant
      const rec = this._meshes.get(key)
      if (!rec || rec.free.length === 0) {
        if (!this._overflowWarned) {
          console.warn('[PropSystem] instance pool full for', key, '— raise CAPACITY'); this._overflowWarned = true
        }
        continue
      }
      const slot = rec.free.pop()
      rec.used++
      _p.set(pl.x, pl.y, pl.z)
      _e.set(0, pl.rotY, 0)
      _q.setFromEuler(_e)
      _s.setScalar(pl.scale)
      _m.compose(_p, _q, _s)
      rec.mesh.setMatrixAt(slot, _m)
      _col.setRGB(pl.tint[0], pl.tint[1], pl.tint[2])
      rec.mesh.setColorAt(slot, _col)
      owned.push({ key, slot })
      this._dirty.add(key)
    }
    this._chunks.set(ck, owned)
  }

  releaseChunk(cx, cz) {
    const ck = cx + ',' + cz
    const owned = this._chunks.get(ck)
    if (!owned) return
    for (const { key, slot } of owned) {
      const rec = this._meshes.get(key)
      if (!rec) continue
      rec.mesh.setMatrixAt(slot, _HIDDEN)
      rec.free.push(slot)
      rec.used--
      this._dirty.add(key)
    }
    this._chunks.delete(ck)
  }

  /**
   * Diff the active chunk set against the desired (centre ± ring) and ensure/release. Call once
   * per frame (cheap when nothing changed) or whenever the stream centre moves a chunk.
   * @param {number} worldX @param {number} worldZ @param {number} ringChunks
   */
  update(worldX, worldZ, ringChunks) {
    const cs = this._chunkSize
    const ccx = Math.floor(worldX / cs), ccz = Math.floor(worldZ / cs)
    const want = new Set()
    for (let dz = -ringChunks; dz <= ringChunks; dz++)
      for (let dx = -ringChunks; dx <= ringChunks; dx++) {
        const cx = ccx + dx, cz = ccz + dz
        want.add(cx + ',' + cz)
        this.ensureChunk(cx, cz)
      }
    for (const ck of [...this._chunks.keys()]) {
      if (!want.has(ck)) { const [x, z] = ck.split(',').map(Number); this.releaseChunk(x, z) }
    }
    this._flush()
  }

  _flush() {
    for (const key of this._dirty) {
      const rec = this._meshes.get(key)
      if (!rec) continue
      rec.mesh.instanceMatrix.needsUpdate = true
      if (rec.mesh.instanceColor) rec.mesh.instanceColor.needsUpdate = true
    }
    this._dirty.clear()
  }

  /** Total live instances (diagnostics / tests). */
  liveCount() {
    let n = 0
    for (const rec of this._meshes.values()) n += rec.used
    return n
  }

  dispose() {
    for (const rec of this._meshes.values()) {
      this._scene.remove(rec.mesh)
      rec.mesh.geometry.dispose()
      rec.mesh.dispose()
    }
    this._material.dispose()
    this._meshes.clear()
    this._chunks.clear()
  }
}
