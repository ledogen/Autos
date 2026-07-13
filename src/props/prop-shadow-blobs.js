/**
 * src/props/prop-shadow-blobs.js — PERF-07 baked contact-shadow blobs for FEAT-06 props.
 *
 * Props are otherwise expensive realtime shadow CASTERS: every scattered tree/rock/log re-renders
 * into the sun's 2048² directional shadow map every frame (measured ~1.86 ms/frame on an M4 —
 * test/perf-prop-shadows.mjs). PERF-07 drops props from that pass by default and stands in a cheap
 * fake: one soft radial decal ("blob") laid flat on the ground under each prop's base. ONE shared
 * 64×64 radial-gradient texture + ONE MeshBasicMaterial + ONE InstancedMesh of a flat unit plane —
 * so the whole ground-shadow field costs a single extra draw call, independent of prop count.
 *
 * Slot machinery mirrors prop-system.js exactly: a free-list of instance slots, the _HIDDEN scale-0
 * matrix for released slots, frustumCulled = false (PERF-05: chunk streaming already bounds it).
 *
 * Headless (node) guard: the radial-gradient texture needs a <canvas> (document). Under node we skip
 * the texture and use a plain flat material — blobs are never rendered headless, the gate just
 * exercises the slot accounting. Texture is generated at RUNTIME (D-01: no shipped asset files).
 */

import * as THREE from 'three'

const _HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0)

// One shared radial-gradient alpha texture: opaque black core → transparent rim (kills the hard
// disc edge). Returns null under node (no document) so the caller falls back to a flat colour.
function makeBlobTexture() {
  if (typeof document === 'undefined') return null
  const S = 64
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const ctx = cv.getContext('2d')
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0.0, 'rgba(0,0,0,1)')      // opaque core
  g.addColorStop(0.45, 'rgba(0,0,0,0.72)')  // soft shoulder …
  g.addColorStop(0.75, 'rgba(0,0,0,0.28)')  // … smooth falloff
  g.addColorStop(1.0, 'rgba(0,0,0,0)')      // transparent rim
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

export class ShadowBlobSystem {
  /**
   * @param {THREE.Object3D} scene
   * @param {{blobOpacity:number, blobScale:number}} params  FLORA_PARAMS.shadows
   * @param {number} capacity  max simultaneous blobs (Σ non-smallRock prop instance capacity)
   */
  constructor(scene, params, capacity) {
    this._scene = scene
    this._params = params

    // Unit plane laid flat on XZ (normal +Y): default PlaneGeometry is XY/+Z, rotate -90° about X.
    // Local +X → world X, local +Y → world -Z, so an instance scale (sx, 1, sz) sets the footprint
    // and a yaw about Y (rotY) aligns an elongated blob (logs) with the trunk axis.
    const geo = new THREE.PlaneGeometry(1, 1)
    geo.rotateX(-Math.PI / 2)
    this._geo = geo

    const tex = makeBlobTexture()
    this._texture = tex
    this._material = new THREE.MeshBasicMaterial({
      map: tex || null,
      color: 0x000000,
      transparent: true,
      opacity: params.blobOpacity,
      depthWrite: false,           // never occlude — alpha-blend over the opaque ground
      polygonOffset: true,         // push toward the camera so it never z-fights the terrain
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })

    const mesh = new THREE.InstancedMesh(this._geo, this._material, capacity)
    mesh.frustumCulled = false     // PERF-05: chunk streaming bounds these
    mesh.castShadow = false        // a shadow decal never casts …
    mesh.receiveShadow = false     // … and never receives
    mesh.count = 0                 // PERF-10: draw the occupied prefix only (maintained in flush)
    for (let i = 0; i < capacity; i++) mesh.setMatrixAt(i, _HIDDEN)   // all slots start hidden
    mesh.instanceMatrix.needsUpdate = true
    this._mesh = mesh
    scene.add(mesh)

    // free list — high indices first so low slots fill contiguously (matches prop-system)
    this._free = []
    for (let i = capacity - 1; i >= 0; i--) this._free.push(i)
    this._used = 0
    this._cap = capacity
    this._occ = new Uint8Array(capacity)   // PERF-10: occupancy + high-water, matches prop-system
    this._top = 0
    this._dirty = false
    this._overflowWarned = false
  }

  /**
   * Claim a slot for one blob. `m` is the fully-composed flat-plane instance matrix (position, yaw,
   * footprint scale). Returns the slot index, or -1 if the pool is full.
   */
  acquire(m) {
    if (this._free.length === 0) {
      if (!this._overflowWarned) {
        console.warn('[ShadowBlobSystem] blob pool full — raise capacity'); this._overflowWarned = true
      }
      return -1
    }
    const slot = this._free.pop()
    this._mesh.setMatrixAt(slot, m)
    this._used++
    this._occ[slot] = 1
    if (slot >= this._top) this._top = slot + 1
    this._dirty = true
    return slot
  }

  release(slot) {
    this._mesh.setMatrixAt(slot, _HIDDEN)
    this._free.push(slot)
    this._used--
    this._occ[slot] = 0
    while (this._top > 0 && !this._occ[this._top - 1]) this._top--
    this._dirty = true
  }

  /** Upload pending matrix writes (call once per stream diff, like prop-system._flush). */
  flush() {
    if (!this._dirty) return
    this._mesh.instanceMatrix.needsUpdate = true
    this._mesh.count = this._top   // PERF-10: occupied prefix only
    this._dirty = false
  }

  /** Show/hide the whole blob field (bake ON ⇔ visible; realtime casting ON ⇔ hidden). */
  setVisible(v) { this._mesh.visible = v }

  /** Live blob count (diagnostics / tests). */
  liveCount() { return this._used }

  dispose() {
    this._scene.remove(this._mesh)
    this._geo.dispose()
    this._material.dispose()
    if (this._texture) this._texture.dispose()
    this._mesh.dispose()
  }
}
