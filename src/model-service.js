// src/model-service.js — hand-modelled asset import service (FEAT-59).
//
// The gap this closes: only vehicles could load GLBs (src/vehicle-model.js); everything else in
// the world is procedural. This service turns a registry key (data/prop-models.js) into a
// ready-to-place Object3D for any consumer — mission items now (the thrown newspaper roll),
// static POI dressing later, dynamic physics props eventually (the record carries the authored
// collision metadata verbatim so nothing re-plumbs).
//
// Contract:
//   getModel(key)   → Promise<record>. One fetch per key ever — concurrent callers share the
//                     in-flight promise, later callers get a cache hit. NEVER rejects: a missing
//                     key or failed fetch logs and resolves to a pink-cube fallback record with
//                     failed: true, so downstream code has one code path.
//   spawnModel(key, { variant }) → THREE.Group, returned SYNCHRONOUSLY so callers can position/parent it
//                     immediately without stalling the frame loop; the model meshes backfill into
//                     the group when the load resolves (pink 0.5 m cube if it never does).
//                     The group is empty for the first few frames of a cold spawn — by design.
//
// Loader is the bare GLTFLoader — no Draco/KTX2 decoder attached (ASSETS.md: assets are exported
// plain). Model-local convention: base-seated (lowest point at y=0), forward = -Z.

import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { PROP_MODELS } from '../data/prop-models.js'

const _records = new Map()   // key → Promise<record>; the promise IS the dedup + cache

/**
 * Build the curated recolour pool declared by spec.palette (data/prop-models.js).
 *
 * *** THE TRAP THIS EXISTS TO AVOID ***  Object3D.clone() copies the scene graph but SHARES
 * geometry and materials by reference, which is exactly why spawning is cheap. So calling
 * `.color.set()` on a spawned model's material recolours EVERY instance of that model in the
 * world, including ones already standing in the scene. Per-spawn recolour has to swap the
 * material OBJECT, never mutate the shared one.
 *
 * Cloning a material per spawn would work and is wrong: with a curated pool there are only ever a
 * handful of distinct colours, so we build each ONCE here, at load, and every spawn of variant n
 * points at the same shared material. A hundred gnomes cost three coat materials, not a hundred.
 * (Draw calls are unaffected either way — these models are cloned, not instanced, so each spawn
 * already submits one draw per material.)
 *
 * Variant 0 reuses the authored material untouched; test/model-palette.mjs asserts the palette's
 * first entry still matches the .glb, so "authored" and "variant 0" cannot drift apart.
 *
 * @returns {{byName: Map<string, THREE.Material[]>, count: number} | null}
 */
function _buildPalette (template, spec) {
  const decl = spec?.palette
  if (!decl) return null
  const keys = Object.keys(decl)
  const byName = new Map()
  let count = 0
  template.traverse((o) => {
    if (!o.isMesh) return
    for (const mat of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (!mat || byName.has(mat.name)) continue
      const key = keys.find(k => mat.name.includes(k))   // substring, as ASSETS.md specifies
      if (!key) continue
      const colours = decl[key]
      count = Math.max(count, colours.length)
      byName.set(mat.name, colours.map(([r, g, b], i) => {
        if (i === 0) return mat
        const v = mat.clone()
        v.name = `${mat.name}#${i}`
        // LINEAR, matching glTF baseColorFactor and the palette declaration. Passing sRGB here is
        // the classic way to get a washed-out variant next to a correct default.
        v.color.setRGB(r, g, b, THREE.LinearSRGBColorSpace)
        return v
      }))
    }
  })
  if (!byName.size) {
    console.warn(`[model-service] '${spec.url}' declares a palette for [${keys}] but no material ` +
                 'name matched — a material was probably renamed on re-export.')
    return null
  }
  return { byName, count }
}

/** Point a freshly cloned model's meshes at the chosen variant's shared materials. */
function _applyVariant (root, palette, variant) {
  const pick = (mat) => {
    const list = palette.byName.get(mat?.name)
    if (!list) return mat
    return list[((variant % list.length) + list.length) % list.length]   // negatives too
  }
  root.traverse((o) => {
    if (!o.isMesh) return
    o.material = Array.isArray(o.material) ? o.material.map(pick) : pick(o.material)
  })
}

// Failure fallback (ratified 2026-08-03): a 0.5 m pink cube — loud in-world, never a silent
// no-op, never null. Base-seated like a real asset so placement code behaves identically.
function _fallbackTemplate () {
  const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5)
  geo.translate(0, 0.25, 0)
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff00ff }))
  mesh.name = 'model-fallback'
  const group = new THREE.Group()
  group.add(mesh)
  return group
}

/**
 * Resolve a registry key to a cached model record.
 * @param {string} key — a key of PROP_MODELS
 * @returns {Promise<{key, spec, template: THREE.Group, collision, failed: boolean}>}
 *   template is the SHARED master — clone it (spawnModel does); never add it to a scene directly.
 */
export function getModel (key) {
  let promise = _records.get(key)
  if (promise) return promise

  const spec = PROP_MODELS[key]
  promise = new Promise((resolve) => {
    if (!spec) {
      console.warn(`[model-service] unknown model key '${key}'; pink-cube fallback`)
      resolve({ key, spec: null, template: _fallbackTemplate(), collision: null, failed: true })
      return
    }
    new GLTFLoader().load(spec.url, (gltf) => {
      resolve({
        key, spec, template: gltf.scene, collision: spec.collision ?? null, failed: false,
        palette: _buildPalette(gltf.scene, spec),
      })
    }, undefined, (err) => {
      console.warn(`[model-service] '${key}' GLB load failed; pink-cube fallback:`, err)
      resolve({ key, spec, template: _fallbackTemplate(), collision: spec.collision ?? null, failed: true })
    })
  })
  _records.set(key, promise)
  return promise
}

/**
 * Spawn an instance of a registered model.
 * Returns a Group synchronously (empty until the shared load resolves, then backfilled — clones
 * share geometry/materials with the template, so per-spawn cost is scene-graph nodes only).
 * @param {string} key — a key of PROP_MODELS
 * @param {{castShadow?: boolean, receiveShadow?: boolean, variant?: number}} [opts]
 *   shadow flags are per-spawn (default cast, don't receive: right for small items; a static POI
 *   prop may want both). `variant` selects from the model's curated palette if it declares one —
 *   ANY integer, taken modulo the palette length, so callers pass a raw hash and never track the
 *   count. THE CALLER OWNS DETERMINISM: derive it from the seed the way poi.js derives modelKey
 *   (hash32(`...:${seed}:${id}`)), never Math.random(). Default 0 = the authored colour.
 * @returns {THREE.Group} — origin at the model's base (y=0), forward = -Z.
 *   userData.collision / userData.failed are set when the load resolves.
 */
export function spawnModel (key, opts = {}) {
  const { castShadow = true, receiveShadow = false, variant = 0 } = opts
  const root = new THREE.Group()
  root.name = `model:${key}`
  getModel(key).then((rec) => {
    const inst = rec.template.clone(true)
    if (rec.palette && variant) _applyVariant(inst, rec.palette, variant)
    inst.traverse((o) => {
      if (o.isMesh) { o.castShadow = castShadow; o.receiveShadow = receiveShadow }
    })
    root.add(inst)
    root.userData.collision = rec.collision
    root.userData.failed = rec.failed
  })
  return root
}
