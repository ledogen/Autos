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
import { scatterChunk, scatterChunkGen } from './prop-scatter.js'
import { sphereVsSphere, sphereVsCapsuleY, sphereVsCapsule, sphereVsMeshInstance, bushDrag } from './prop-collider.js'
import { BAKE_LAYER, shadowShearScale } from './prop-shadow-bake.js'   // PERF-07: baked prop-shadow atlas (main.js owns the system)
import { PropImpostors } from './prop-impostor.js'                     // PERF-21: distant-prop billboards
import { FLORA_PARAMS } from '../../data/flora.js'

// Per-category global instance capacity (split evenly across that category's variants). Sized for
// the ring-4 (Ultra, 81-chunk) worst case; pure typed-array memory (64 B/instance), cheap.
// PERF-21: categories that keep rendering FULL 3D even in the billboard-only outer ring (rare,
// landmark-scale, and shaped wrong for a vertical quad — boulders are wide horizontal masses).
const BBONLY_3D_CATS = new Set(['boulder'])

const CAPACITY = {
  // Trees sized for the PERF-21 billboard-only outer ring: Ultra streams trees out to the built-
  // terrain edge (ring+warm = 8 → 17² = 289 chunks × ~30 trees ≈ 8.7k, biome-split aspen/pine).
  // Other categories only live within the full propRing (≤ ring-4, 81 chunks) as before.
  aspen: 8000, pine: 8000, rock: 3000, boulder: 200, smallRock: 9000, bush: 4000,
  log: 300,   // FEAT-15: sparse ([0,2]/chunk) — 300 covers a ring-4 Ultra window with slack
}

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _qTilt = new THREE.Quaternion()
const _tiltAxis = new THREE.Vector3()
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
    this._variants = variants          // PERF-21: impostor bake needs the variant geometries

    // PERF-07: prop shadow mode. castRealtime=false (default) drops props from the sun's realtime
    // shadow pass and stands in the baked shadow atlas (prop-shadow-bake.js, owned by main.js);
    // true keeps the old per-frame realtime casting. Flipped live via the GUI checkbox.
    const shadowsP = params.shadows || { castRealtime: false }
    const castRealtime = !!shadowsP.castRealtime

    // meshes: key "cat#v" -> { mesh, free:[], used:0 };  collision: key -> descriptor | null
    this._meshes = new Map()
    this._collision = new Map()
    for (const cat of Object.keys(variants)) {
      const entries = variants[cat]
      const perVariant = Math.max(1, Math.floor((CAPACITY[cat] ?? 1000) / entries.length))
      entries.forEach((entry, v) => {
        const mesh = new THREE.InstancedMesh(entry.geo, material, perVariant)
        mesh.frustumCulled = false           // PERF-05: chunk streaming bounds these
        mesh.castShadow = castRealtime       // PERF-07: realtime shadow only when baking is off
        mesh.receiveShadow = true
        mesh.layers.enable(BAKE_LAYER)       // PERF-07: also visible to the shadow-bake camera
        // PERF-10: draw only the occupied slot prefix. mesh.count is maintained at `top` (the
        // high-water occupied index + 1) by _flush(); drawing full capacity pushed EVERY hidden
        // zero-scale slot through the vertex stage of the main AND shadow passes — measured 85 %
        // of all scene triangles (2.26M → 0.35M at Normal). Slots stay pre-hidden so anything
        // inside the prefix that is free still renders as degenerate.
        mesh.count = 0
        // start all slots hidden
        for (let i = 0; i < perVariant; i++) mesh.setMatrixAt(i, _HIDDEN)
        mesh.instanceMatrix.needsUpdate = true
        // free list (use high indices first so low slots fill contiguously)
        const free = []
        for (let i = perVariant - 1; i >= 0; i--) free.push(i)
        // PERF-07: per-instance shadow ground-fit factor for the bake shear (default 1 = flat
        // ground; written per slot in _commitChunk). Lives on the variant geometry like any
        // instanced attribute; the main Phong material simply ignores it. geoMaxY caches the
        // unscaled prop height for the canopy-centre h0.
        const kAttr = new THREE.InstancedBufferAttribute(new Float32Array(perVariant).fill(1), 1)
        kAttr.setUsage(THREE.DynamicDrawUsage)
        entry.geo.setAttribute('aShadowK', kAttr)
        if (!entry.geo.boundingBox) entry.geo.computeBoundingBox()
        const key = cat + '#' + v
        // occ/top: occupancy bitmap + high-water mark for PERF-10 count compaction.
        // dirtyLo/dirtyHi: slot span touched since the last _flush — PERF-21 partial uploads
        // (a one-chunk stream used to re-upload the species' whole capacity buffer, 256 KB).
        this._meshes.set(key, { mesh, free, used: 0, cap: perVariant, occ: new Uint8Array(perVariant), top: 0, geoMaxY: entry.geo.boundingBox.max.y, dirtyLo: Infinity, dirtyHi: -1 })
        this._collision.set(key, entry.collision || null)
        scene.add(mesh)
      })
    }

    // "cx,cz" -> { places: [placement records], owned: [{key, slot, imp}], mode: 'near'|'far' }.
    // `places` (matrix/tint/k per prop) is RETAINED for the chunk's lifetime — PERF-21 LOD swaps
    // re-place a chunk between the 3D and impostor pools without re-scattering, and the shadow
    // bake's tile source reads matrices from here (pool-independent).
    this._chunks = new Map()
    this._dirty = new Set()        // 3D mesh keys needing instanceMatrix/instanceColor upload
    this._overflowWarned = false

    // ── PERF-21 billboard impostor LOD ─────────────────────────────────────────────────
    // Inactive (everything renders 3D) until main.js wires the renderer via setImpostors().
    // Chunks with Chebyshev ring distance > _lodRing from the camera chunk render their
    // billboardable categories (IMPOSTOR_CATS) as instanced quads instead of 3D instances.
    this._impostors = null
    this._impMeshes = null         // key "cat#v" -> { mesh, aPos, aSize, aTint, size, free, occ, top, cap, dirtyLo, dirtyHi }
    this._impDirty = new Set()
    this._lodRing = (params.lod && params.lod.ring3d != null) ? params.lod.ring3d : 2
    this._fullRing = Infinity      // full-prop radius (set each update); beyond → billboard-only
    this._ccx = null               // camera chunk (set each update; null = everything 'near')
    this._ccz = null

    // PERF-14: time-sliced scatter. A whole chunk's scatter is 20–40 ms of sampler calls
    // (analyticHeight/roadClear per candidate) — running it synchronously on chunk entry was THE
    // measured streaming hitch (100–190 ms when a ring row enters). Chunks are queued nearest-
    // first and their scatter generators are stepped under a per-frame ms budget; placements
    // commit atomically per chunk when the generator finishes. Determinism untouched (same rng
    // stream + order — see scatterChunkGen). The 3×3 around the VEHICLE is force-completed
    // synchronously (collision correctness beats a rare hitch); everything else drips in.
    this._scatterQueue = []        // [{ ck, cx, cz, d2 }] nearest-first
    this._scatterSet = new Set()   // cks queued or active (dedup)
    this._activeScatter = null     // { ck, cx, cz, gen } — the generator being stepped
    this._scatterFillDone = false  // false → burst budget until the first queue drain (PERF-13 spirit)

    // ── PERF-07 baked prop shadows ──────────────────────────────────────────────────────
    // The shadow-bake system (world atlas) is owned by main.js (it needs the WebGL renderer, absent
    // headless). setShadowBake wires it; _commitChunk marks a chunk's tile (+ neighbours) dirty so
    // its silhouettes bake once. Caster meshes are already on BAKE_LAYER above; castShadow follows
    // the mode (realtime OR baked, never both).
    this._shadowBake = null
    this.setShadowCasting(castRealtime)   // initial mode from params.shadows

    // ── FEAT-06b collision index ──────────────────────────────────────────────────────
    // Per-chunk collidable lists are the source of truth; a uniform grid (rebuilt lazily when chunk
    // membership changes) gives O(1)-ish nearest-prop lookup for the truck contact query. Each
    // collidable stores RAW baked dims + instance scale; the collision-scale params are applied LIVE
    // at query time (so the debug sliders tune without a re-stream).
    this._collidables = new Map()  // "cx,cz" -> [{ kind, x, y, z, radius, height, scale }]
    this._grid = new Map()         // "gx,gz" -> [collidable, ...]
    this._gridCell = 8             // m
    this._gridDirty = true
  }

  // ── PERF-07 shadow bake ───────────────────────────────────────────────────────────────
  /**
   * Attach the main-thread shadow-bake system (main.js owns it). Marks every already-committed
   * chunk dirty so existing props bake in (props scattered before the wiring landed).
   */
  /**
   * Show/hide every prop mesh (3D instanced pools AND the PERF-21 billboard impostor pools).
   * Used by the FEAT-31 testing lab to tear the generated world down to a bare plane —
   * visibility only, nothing is disposed or re-scattered, so returning is instant.
   */
  setVisible(visible) {
    this._propsVisible = visible
    for (const e of this._meshes.values()) if (e.mesh) e.mesh.visible = visible
    if (this._impMeshes) for (const e of this._impMeshes.values()) if (e.mesh) e.mesh.visible = visible
  }

  setShadowBake(bake) {
    this._shadowBake = bake
    if (bake) {
      // PERF-21: hand the bake system a per-tile caster source so one tile bake shades only the
      // 3×3 chunks around it (~1k instances) instead of every live prop in the ring (~25k). This
      // was the stream-in hitch: 8 tiles/frame × the full population through the vertex stage.
      if (bake.setTileSource) {
        if (!this._bakeScene) this._buildBakeScene()
        bake.setTileSource((cx, cz) => this._fillBakeScene(cx, cz))
      }
      for (const ck of this._chunks.keys()) {
        const comma = ck.indexOf(',')
        bake.markWithNeighbors(parseInt(ck.slice(0, comma), 10), parseInt(ck.slice(comma + 1), 10))
      }
    }
  }

  /**
   * PERF-21: scratch scene for per-tile shadow bakes — one InstancedMesh per (cat#variant) that
   * SHARES the palette's vertex position buffer (uploaded once) but owns small instanceMatrix /
   * aShadowK buffers, refilled per bake from the live chunks' slots. Material is irrelevant (the
   * bake overrides it); layers must include BAKE_LAYER for the bake camera's mask.
   */
  _buildBakeScene() {
    this._bakeScene = new THREE.Scene()
    this._bakeMeshes = new Map()
    for (const [key, rec] of this._meshes) {
      const src = rec.mesh.geometry
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', src.getAttribute('position'))   // shared — no duplicate VRAM
      const kAttr = new THREE.InstancedBufferAttribute(new Float32Array(rec.cap).fill(1), 1)
      kAttr.setUsage(THREE.DynamicDrawUsage)
      geo.setAttribute('aShadowK', kAttr)
      const mesh = new THREE.InstancedMesh(geo, this._material, rec.cap)
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      mesh.frustumCulled = false
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.layers.set(BAKE_LAYER)
      mesh.count = 0
      this._bakeScene.add(mesh)
      this._bakeMeshes.set(key, { mesh, kAttr, n: 0 })
    }
  }

  /**
   * Refill the scratch scene with the instances of the 3×3 chunks around (cx,cz). Reads the
   * RETAINED placement records, not the render pools — a billboarded (far-LOD) tree keeps
   * casting its baked ground shadow.
   */
  _fillBakeScene(cx, cz) {
    for (const dst of this._bakeMeshes.values()) dst.n = 0
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const chunk = this._chunks.get((cx + dx) + ',' + (cz + dz))
      if (!chunk) continue
      for (const pr of chunk.places) {
        const dst = this._bakeMeshes.get(pr.key)
        if (!dst) continue
        dst.mesh.instanceMatrix.array.set(pr.mat, dst.n * 16)
        dst.kAttr.array[dst.n] = pr.k
        dst.n++
      }
    }
    for (const dst of this._bakeMeshes.values()) {
      dst.mesh.count = dst.n
      if (dst.n > 0) {
        dst.mesh.instanceMatrix.addUpdateRange(0, dst.n * 16)
        dst.mesh.instanceMatrix.needsUpdate = true
        dst.kAttr.addUpdateRange(0, dst.n)
        dst.kAttr.needsUpdate = true
      }
    }
    return this._bakeScene
  }

  /**
   * Live toggle between realtime prop shadow casting and the baked shadow atlas.
   *   v=true  → props cast into the sun's realtime shadow map (free day/night; the per-frame cost).
   *   v=false → props dropped from the shadow pass (the perf win); the baked atlas stands in.
   * The terrain-atlas strength + bake activity are toggled by the caller (main.js) alongside this.
   */
  setShadowCasting(v) {
    for (const rec of this._meshes.values()) rec.mesh.castShadow = v
  }

  // ── PERF-21 billboard impostors ───────────────────────────────────────────────────────
  /**
   * Activate distant-prop billboards (main.js owns the renderer — headless never calls this).
   * Bakes the per-variant impostor atlas with the CURRENT sky-look lighting and creates one
   * instanced-quad mesh per billboardable variant. Live chunks re-pool over the next frames
   * via _syncChunkLod.
   * @param {THREE.WebGLRenderer} renderer
   * @param {{sun: THREE.DirectionalLight, ambient: THREE.HemisphereLight}} lights
   */
  setImpostors(renderer, lights) {
    if (this._impostors || !renderer) return
    this._impostors = new PropImpostors(renderer, lights)
    const entries = this._impostors.build(this._variants)
    if (this._params.lod && this._params.lod.litGain != null) this._impostors.setLitGain(this._params.lod.litGain)
    if (this._params.lod && this._params.lod.flatten != null) this._impostors.setFlatten(this._params.lod.flatten)
    this._impMeshes = new Map()
    const base = new THREE.PlaneGeometry(1, 1)      // shared unit quad (position/uv/index reused)
    for (const [key, e] of entries) {
      const rec3d = this._meshes.get(key)
      if (!rec3d) continue
      const cap = rec3d.cap
      const geo = new THREE.InstancedBufferGeometry()
      geo.index = base.index
      geo.setAttribute('position', base.getAttribute('position'))
      geo.setAttribute('uv', base.getAttribute('uv'))
      const mk = (itemSize) => {
        const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * itemSize), itemSize)
        a.setUsage(THREE.DynamicDrawUsage)
        return a
      }
      const aPos = mk(3), aSize = mk(1), aTint = mk(3), aAxis = mk(3)
      geo.setAttribute('aPos', aPos)
      geo.setAttribute('aSize', aSize)
      geo.setAttribute('aTint', aTint)
      geo.setAttribute('aAxis', aAxis)   // per-instance trunk axis — billboards lean like their 3D tree
      geo.instanceCount = 0
      this._impostors.bindAtlas(e.material)
      const mesh = new THREE.Mesh(geo, e.material)
      mesh.frustumCulled = false                    // same PERF-05 reasoning as the 3D pools
      mesh.castShadow = false                       // ground shadow comes from the baked atlas
      mesh.receiveShadow = false
      this._scene.add(mesh)
      const free = []
      for (let i = cap - 1; i >= 0; i--) free.push(i)
      this._impMeshes.set(key, {
        mesh, aPos, aSize, aTint, aAxis, size: e.size,
        free, occ: new Uint8Array(cap), top: 0, cap, dirtyLo: Infinity, dirtyHi: -1,
      })
    }
  }

  /** Re-bake the impostor atlas (sky look changed). No-op when impostors are off. */
  rebakeImpostors() { if (this._impostors) this._impostors.rebake() }

  /** Live billboard sun-side brightening (GUI slider). No-op when impostors are off. */
  setImpostorLitGain(v) { if (this._impostors) this._impostors.setLitGain(v) }

  /** Live billboard sun-on gradient flatten (GUI slider). No-op when impostors are off. */
  setImpostorFlatten(v) { if (this._impostors) this._impostors.setFlatten(v) }

  /** 3D-prop ring radius in chunks (quality tier / GUI). Chunks beyond it billboard. */
  setLodRing(n) { this._lodRing = Math.max(0, Math.round(n)) }
  get lodRing() { return this._lodRing }

  // ── chunk lifecycle ─────────────────────────────────────────────────────────────────
  // Synchronous ensure — the hard-radius / gate path. If this chunk's scatter is mid-flight or
  // queued, it is completed HERE and now; otherwise scatter runs whole. Normal streaming goes
  // through the queued path in update() instead.
  ensureChunk(cx, cz) {
    const ck = cx + ',' + cz
    if (this._chunks.has(ck)) return
    let placements
    if (this._activeScatter && this._activeScatter.ck === ck) {
      const gen = this._activeScatter.gen
      let r; do { r = gen.next() } while (!r.done)
      placements = r.value
      this._activeScatter = null
      this._scatterSet.delete(ck)
    } else {
      this._dequeueScatter(ck)
      placements = scatterChunk(cx, cz, this._seed, this._samplers, this._params)
    }
    this._commitChunk(ck, placements)
  }

  _dequeueScatter(ck) {
    if (!this._scatterSet.has(ck)) return
    this._scatterSet.delete(ck)
    const i = this._scatterQueue.findIndex(j => j.ck === ck)
    if (i >= 0) this._scatterQueue.splice(i, 1)
  }

  _commitChunk(ck, placements) {
    const places = []
    const collidables = []
    for (const pl of placements) {
      const key = pl.cat + '#' + pl.variant
      const rec = this._meshes.get(key)
      if (!rec) continue
      _p.set(pl.x, pl.y, pl.z)
      _e.set(0, pl.rotY, 0)
      _q.setFromEuler(_e)
      if (pl.tilt) {   // per-instance lean (trees); pivots at the geometry origin = trunk base
        _tiltAxis.set(Math.cos(pl.tiltAz), 0, Math.sin(pl.tiltAz))
        _qTilt.setFromAxisAngle(_tiltAxis, pl.tilt)
        _q.multiply(_qTilt)
      }
      _s.setScalar(pl.scale)
      _m.compose(_p, _q, _s)
      // PERF-07: per-instance ground fit for the shadow bake — scale the flat-plane sun shear so
      // THIS prop's baked shadow lands on the real sloped terrain (shadowShearScale). h0 = canopy
      // centre (0.65 × geometry height × scale); flat ground → k = 1. sunShear is absent headless
      // (no sky) — the default 1 then matches the old flat projection. Computed ONCE here and
      // kept on the placement record — LOD re-places never re-march.
      let k = 1
      if (this._samplers.sunShear) {
        const shear = this._samplers.sunShear()
        const h0 = rec.geoMaxY * 0.65 * pl.scale
        // March only the props whose shadows are long enough for slope error to show (trees,
        // boulders); small rocks/bushes keep the flat default — ~17 height samples each would
        // dominate the commit for zero visible gain.
        if (h0 > 2 && shear.lengthSq() > 1e-6) {
          k = shadowShearScale(pl.x, pl.y, pl.z, h0, shear.x, shear.y, this._samplers.heightAt)
        }
      }
      places.push({
        key, mat: Float32Array.from(_m.elements), k,
        x: pl.x, y: pl.y, z: pl.z, scale: pl.scale, tint: pl.tint,
      })

      // FEAT-06b: record the collidable (capsule for trees, sphere for rocks, bush for soft-drag)
      const col = this._collision.get(key)
      if (col && col.kind === 'logCapsule') {
        // FEAT-15: bake WORLD capsule endpoints from the placement transform — the same
        // local→world mapping the instance matrix applies (pitch about local Z by pl.tilt,
        // then yaw pl.rotY), to the tube-axis ends (±length/2, radius, 0) in local space.
        const hl = (col.length / 2) * pl.scale
        const rAxis = col.radius * pl.scale
        const cp = Math.cos(pl.tilt || 0), sp = Math.sin(pl.tilt || 0)
        const cy = Math.cos(pl.rotY), sy = Math.sin(pl.rotY)
        const end = (d) => {
          const lx = d * cp - rAxis * sp          // pitch about Z: (d, rAxis) → …
          const ly = d * sp + rAxis * cp
          return { x: pl.x + lx * cy, y: pl.y + ly, z: pl.z - lx * sy }   // yaw about Y
        }
        const A = end(-hl), B = end(hl)
        collidables.push({
          kind: col.kind, x: pl.x, y: pl.y, z: pl.z,
          ax: A.x, ay: A.y, az: A.z, bx: B.x, by: B.y, bz: B.z,
          radius: col.radius, boundR: col.boundR, scale: pl.scale,
        })
      } else if (col) collidables.push({
        kind: col.kind, x: pl.x, y: pl.y, z: pl.z,
        radius: col.radius, height: col.height || 0, scale: pl.scale,
        rotY: pl.rotY, tris: col.tris,   // rotY/tris used by 'mesh' (boulder) contacts; undefined otherwise
      })
    }
    const comma = ck.indexOf(',')
    const cx = parseInt(ck.slice(0, comma), 10), cz = parseInt(ck.slice(comma + 1), 10)
    const chunk = { places, owned: [], mode: this._chunkMode(cx, cz) }
    this._chunks.set(ck, chunk)
    this._placeChunk(chunk, chunk.mode)
    if (collidables.length) { this._collidables.set(ck, collidables); this._gridDirty = true }

    // PERF-07: this chunk's props changed → (re)bake its shadow tile and its neighbours' (silhouettes
    // cross chunk seams). The bake system slices the work; a no-op when realtime casting / headless.
    // Billboard-only ring chunks take NO tiles (see _chunkMode) — they mark on promotion instead.
    if (this._shadowBake && chunk.mode !== 'bbonly') this._shadowBake.markWithNeighbors(cx, cz)
  }

  /**
   * PERF-21: a chunk's render mode by Chebyshev ring distance from the camera:
   *   'near'   (d ≤ lodRing)  — every category as full 3D instances.
   *   'far'    (d ≤ fullRing) — billboardable categories as impostors, the rest 3D.
   *   'bbonly' (d > fullRing) — TREES ONLY, as impostors; rocks/bushes/logs get no render slots
   *            at all (they'd be sub-pixel 3D noise), and the chunk takes no shadow-bake tiles
   *            (beyond the QUAL-18 fade reach anyway, and marking it would overflow the toroidal
   *            atlas at Ultra's billboard radius). This is the ring that carries trees out to the
   *            full drawn-terrain distance (user call 2026-07-17).
   */
  _chunkMode(cx, cz) {
    if (!this._impMeshes || this._ccx === null) return 'near'
    const d = Math.max(Math.abs(cx - this._ccx), Math.abs(cz - this._ccz))
    if (d <= this._lodRing) return 'near'
    return d <= this._fullRing ? 'far' : 'bbonly'
  }

  /** Allocate render-pool slots for a chunk's retained placements (see _chunkMode for modes). */
  _placeChunk(chunk, mode) {
    chunk.mode = mode
    for (const pr of chunk.places) {
      // Billboardable categories go to the impostor pool when far; anything else stays 3D —
      // except in the billboard-only outer ring, where non-billboardable categories are skipped
      // (sub-pixel 3D noise at that range) UNLESS they're landmark-scale (BBONLY_3D_CATS).
      if (mode === 'bbonly' && this._impMeshes && !this._impMeshes.has(pr.key)
          && !BBONLY_3D_CATS.has(pr.key.slice(0, pr.key.indexOf('#')))) continue
      if ((mode === 'far' || mode === 'bbonly') && this._impMeshes) {
        const irec = this._impMeshes.get(pr.key)
        if (irec && irec.free.length > 0) {
          const slot = irec.free.pop()
          irec.occ[slot] = 1
          if (slot >= irec.top) irec.top = slot + 1
          const i3 = slot * 3
          irec.aPos.array[i3] = pr.x; irec.aPos.array[i3 + 1] = pr.y; irec.aPos.array[i3 + 2] = pr.z
          irec.aSize.array[slot] = irec.size * pr.scale
          irec.aTint.array[i3] = pr.tint[0]; irec.aTint.array[i3 + 1] = pr.tint[1]; irec.aTint.array[i3 + 2] = pr.tint[2]
          // Trunk axis = the placement matrix's local +Y column, normalized — carries the
          // per-tree parametric lean into the billboard so the LOD swap doesn't snap upright.
          const m = pr.mat
          const al = Math.hypot(m[4], m[5], m[6]) || 1
          irec.aAxis.array[i3] = m[4] / al; irec.aAxis.array[i3 + 1] = m[5] / al; irec.aAxis.array[i3 + 2] = m[6] / al
          if (slot < irec.dirtyLo) irec.dirtyLo = slot
          if (slot > irec.dirtyHi) irec.dirtyHi = slot
          this._impDirty.add(pr.key)
          chunk.owned.push({ key: pr.key, slot, imp: true })
          continue
        }
        if (irec && !this._overflowWarned) {
          console.warn('[PropSystem] impostor pool full for', pr.key, '— falling back to 3D'); this._overflowWarned = true
        }
      }
      const rec = this._meshes.get(pr.key)
      if (!rec || rec.free.length === 0) {
        if (!this._overflowWarned) {
          console.warn('[PropSystem] instance pool full for', pr.key, '— raise CAPACITY'); this._overflowWarned = true
        }
        continue
      }
      const slot = rec.free.pop()
      rec.used++
      rec.occ[slot] = 1                                  // PERF-10: track occupancy for count compaction
      if (slot >= rec.top) rec.top = slot + 1
      rec.mesh.instanceMatrix.array.set(pr.mat, slot * 16)
      _col.setRGB(pr.tint[0], pr.tint[1], pr.tint[2])
      rec.mesh.setColorAt(slot, _col)
      rec.mesh.geometry.attributes.aShadowK.setX(slot, pr.k)
      this._dirty.add(pr.key)
      if (slot < rec.dirtyLo) rec.dirtyLo = slot
      if (slot > rec.dirtyHi) rec.dirtyHi = slot
      chunk.owned.push({ key: pr.key, slot, imp: false })
    }
  }

  /** Free a chunk's render-pool slots (both pools). Retains `places` — LOD swaps re-place. */
  _unplaceChunk(chunk) {
    for (const { key, slot, imp } of chunk.owned) {
      if (imp) {
        const irec = this._impMeshes.get(key)
        if (!irec) continue
        irec.aSize.array[slot] = 0                       // degenerate quad — no fragments
        irec.free.push(slot)
        irec.occ[slot] = 0
        while (irec.top > 0 && !irec.occ[irec.top - 1]) irec.top--
        this._impDirty.add(key)
        if (slot < irec.dirtyLo) irec.dirtyLo = slot
        if (slot > irec.dirtyHi) irec.dirtyHi = slot
        continue
      }
      const rec = this._meshes.get(key)
      if (!rec) continue
      rec.mesh.setMatrixAt(slot, _HIDDEN)
      rec.free.push(slot)
      rec.used--
      rec.occ[slot] = 0                                  // PERF-10: shrink the draw prefix when the top frees
      while (rec.top > 0 && !rec.occ[rec.top - 1]) rec.top--
      this._dirty.add(key)
      if (slot < rec.dirtyLo) rec.dirtyLo = slot
      if (slot > rec.dirtyHi) rec.dirtyHi = slot
    }
    chunk.owned.length = 0
  }

  /**
   * PERF-21: re-pool chunks whose camera ring distance crossed _lodRing. Chunk-granular — a 64 m
   * chunk's billboardable props swap together, ~1–2 chunk-rows per camera chunk crossing, budgeted
   * so a fast drive never spends more than `budget` re-places in one frame. The swap is a pure
   * slot move from retained records (no scatter, no samplers, no shadow re-bake).
   */
  _syncChunkLod(budget = 6) {
    if (!this._impMeshes || this._ccx === null) return
    for (const [ck, chunk] of this._chunks) {
      const comma = ck.indexOf(',')
      const cx = parseInt(ck.slice(0, comma), 10), cz = parseInt(ck.slice(comma + 1), 10)
      const want = this._chunkMode(cx, cz)
      if (want === chunk.mode) continue
      const promoted = chunk.mode === 'bbonly' && want !== 'bbonly'
      this._unplaceChunk(chunk)
      this._placeChunk(chunk, want)
      // Promotion out of the billboard-only ring: the chunk skipped its shadow bake at commit —
      // bake now that its ground shadows are within the visible/fade range. (Demotion needs no
      // mark: the trees haven't moved, the already-baked tile stays valid.)
      if (promoted && this._shadowBake) this._shadowBake.markWithNeighbors(cx, cz)
      if (--budget <= 0) break
    }
  }

  releaseChunk(cx, cz) {
    const ck = cx + ',' + cz
    const chunk = this._chunks.get(ck)
    if (!chunk) return
    this._unplaceChunk(chunk)
    const wasBBOnly = chunk.mode === 'bbonly'
    this._chunks.delete(ck)
    if (this._collidables.delete(ck)) this._gridDirty = true
    // PERF-07: this chunk's props are gone → re-bake still-live neighbours so their tiles drop the
    // departed silhouettes (a neighbour still in-ring re-bakes without them; its own tile is reused
    // by whichever chunk lands on the toroidal slot next). Billboard-only chunks never baked.
    if (this._shadowBake && !wasBBOnly) this._shadowBake.markWithNeighbors(cx, cz)
  }

  /**
   * Diff the active chunk set against the desired (centre ± ring) and ensure/release. Call once
   * per frame (cheap when nothing changed) or whenever the stream centre moves a chunk.
   * @param {number} worldX @param {number} worldZ @param {number} ringChunks
   */
  /**
   * Stream the prop ring around (worldX, worldZ). PERF-14: scatter is QUEUED and time-sliced —
   * missing chunks enqueue nearest-first and their generators are stepped under a per-frame ms
   * budget, so entering a chunk row never blocks the frame. Pass the VEHICLE position via
   * (hardX, hardZ) to force-complete the 3×3 chunks around it synchronously (prop collision must
   * exist under the truck; freecam passes nothing and just streams visually).
   */
  update(worldX, worldZ, ringChunks, hardX = null, hardZ = null, bbRingChunks = null) {
    const cs = this._chunkSize
    const ccx = Math.floor(worldX / cs), ccz = Math.floor(worldZ / cs)
    this._ccx = ccx; this._ccz = ccz               // PERF-21: LOD ring centre
    this._fullRing = ringChunks                    // beyond this (to bbRing) = billboard-only trees
    // The billboard-only outer ring streams ONLY when impostors are active — headless (gates) and
    // pre-wire boots keep the classic full-prop ring exactly as before.
    const outer = (this._impMeshes && bbRingChunks != null) ? Math.max(ringChunks, bbRingChunks) : ringChunks
    const want = new Set()
    let enqueued = false
    for (let dz = -outer; dz <= outer; dz++)
      for (let dx = -outer; dx <= outer; dx++) {
        const cx = ccx + dx, cz = ccz + dz
        const ck = cx + ',' + cz
        want.add(ck)
        if (!this._chunks.has(ck) && !this._scatterSet.has(ck)) {
          this._scatterQueue.push({ ck, cx, cz, d2: dx * dx + dz * dz })
          this._scatterSet.add(ck)
          enqueued = true
        }
      }
    if (enqueued) this._scatterQueue.sort((a, b) => a.d2 - b.d2)
    // Drop queued/active work that scrolled out of the ring.
    for (let i = this._scatterQueue.length - 1; i >= 0; i--) {
      if (!want.has(this._scatterQueue[i].ck)) {
        this._scatterSet.delete(this._scatterQueue[i].ck)
        this._scatterQueue.splice(i, 1)
      }
    }
    if (this._activeScatter && !want.has(this._activeScatter.ck)) {
      this._scatterSet.delete(this._activeScatter.ck)
      this._activeScatter = null
    }
    for (const ck of [...this._chunks.keys()]) {
      if (!want.has(ck)) { const [x, z] = ck.split(',').map(Number); this.releaseChunk(x, z) }
    }

    // Hard radius: the truck's 3×3 must be collision-complete THIS frame (rare synchronous
    // scatter — only when driving outruns the drip feed).
    if (hardX != null) {
      const hcx = Math.floor(hardX / cs), hcz = Math.floor(hardZ / cs)
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const cx = hcx + dx, cz = hcz + dz
        if (want.has(cx + ',' + cz)) this.ensureChunk(cx, cz)
      }
    }

    // Budgeted scatter: step the active generator (then the queue) until the deadline. Burst
    // until the first full drain (initial fill — PERF-13 spirit: pre-drivable hitches are free).
    const budgetMs = this._scatterFillDone ? 3 : 50
    const deadline = performance.now() + budgetMs
    while (performance.now() < deadline) {
      if (!this._activeScatter) {
        const next = this._scatterQueue.shift()
        if (!next) break
        this._activeScatter = { ...next, gen: scatterChunkGen(next.cx, next.cz, this._seed, this._samplers, this._params) }
      }
      const job = this._activeScatter
      let r = null
      while (performance.now() < deadline) { r = job.gen.next(); if (r.done) break }
      if (r && r.done) {
        this._activeScatter = null
        this._scatterSet.delete(job.ck)
        this._commitChunk(job.ck, r.value)
      }
    }
    if (!this._scatterFillDone && !this._activeScatter && this._scatterQueue.length === 0) this._scatterFillDone = true

    this._syncChunkLod()                            // PERF-21: pool swaps after streaming settles
    this._flush()
  }

  /** Drain all queued/in-flight scatter synchronously (gates + teleports). */
  drainScatter() {
    if (this._activeScatter) {
      const job = this._activeScatter
      let r; do { r = job.gen.next() } while (!r.done)
      this._activeScatter = null
      this._scatterSet.delete(job.ck)
      this._commitChunk(job.ck, r.value)
    }
    while (this._scatterQueue.length) {
      const { ck, cx, cz } = this._scatterQueue.shift()
      this._scatterSet.delete(ck)
      this._commitChunk(ck, scatterChunk(cx, cz, this._seed, this._samplers, this._params))
    }
    this._flush()
  }

  _flush() {
    for (const key of this._dirty) {
      const rec = this._meshes.get(key)
      if (!rec) continue
      // PERF-21: upload only the touched slot span. Without ranges, three re-uploads the WHOLE
      // capacity buffer per dirty mesh (aspen/pine: 4000×64 B = 256 KB) on every chunk stream.
      // The min/max span may cover untouched slots between two dirty chunks — still far smaller,
      // and their array contents are valid, so over-uploading is harmless. First-ever upload
      // (buffer creation) always sends the full array regardless of ranges. NEVER clear ranges
      // here: the renderer merges + clears them on upload, and two flushes can land between
      // renders (drainScatter + update in one frame) — clearing would drop the first span.
      if (rec.dirtyHi >= 0) {
        const lo = rec.dirtyLo, n = rec.dirtyHi - rec.dirtyLo + 1
        rec.mesh.instanceMatrix.addUpdateRange(lo * 16, n * 16)
        if (rec.mesh.instanceColor) rec.mesh.instanceColor.addUpdateRange(lo * 3, n * 3)
        rec.mesh.geometry.attributes.aShadowK.addUpdateRange(lo, n)
        rec.dirtyLo = Infinity; rec.dirtyHi = -1
      }
      rec.mesh.instanceMatrix.needsUpdate = true
      if (rec.mesh.instanceColor) rec.mesh.instanceColor.needsUpdate = true
      rec.mesh.geometry.attributes.aShadowK.needsUpdate = true   // PERF-07 ground-fit factors
      rec.mesh.count = rec.top   // PERF-10: draw the occupied prefix only (read at draw time, no flag needed)
    }
    this._dirty.clear()
    // PERF-21: impostor pools — same dirty-span partial upload, prefix-count draw.
    for (const key of this._impDirty) {
      const irec = this._impMeshes && this._impMeshes.get(key)
      if (!irec) continue
      if (irec.dirtyHi >= 0) {
        const lo = irec.dirtyLo, n = irec.dirtyHi - irec.dirtyLo + 1
        irec.aPos.addUpdateRange(lo * 3, n * 3)
        irec.aSize.addUpdateRange(lo, n)
        irec.aTint.addUpdateRange(lo * 3, n * 3)
        irec.aAxis.addUpdateRange(lo * 3, n * 3)
        irec.dirtyLo = Infinity; irec.dirtyHi = -1
      }
      irec.aPos.needsUpdate = true
      irec.aSize.needsUpdate = true
      irec.aTint.needsUpdate = true
      irec.aAxis.needsUpdate = true
      irec.mesh.geometry.instanceCount = irec.top
    }
    this._impDirty.clear()
  }

  // ── FEAT-06b collision queries ──────────────────────────────────────────────────────────
  _ensureGrid() {
    if (!this._gridDirty) return
    this._grid.clear()
    const cs = this._gridCell
    for (const list of this._collidables.values()) {
      for (const c of list) {
        // generous footprint (covers live scale-factor changes); logs use their half-length
        // bound (boundR) — the tube radius alone would miss grid cells the trunk crosses.
        const R = (c.boundR ?? c.radius) * c.scale * 2
        const gx0 = Math.floor((c.x - R) / cs), gx1 = Math.floor((c.x + R) / cs)
        const gz0 = Math.floor((c.z - R) / cs), gz1 = Math.floor((c.z + R) / cs)
        for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) {
          const k = gx + ',' + gz
          let arr = this._grid.get(k); if (!arr) { arr = []; this._grid.set(k, arr) }
          arr.push(c)
        }
      }
    }
    this._gridDirty = false
  }

  _cellsAround(x, z, r, fn) {
    const cs = this._gridCell
    const gx0 = Math.floor((x - r) / cs), gx1 = Math.floor((x + r) / cs)
    const gz0 = Math.floor((z - r) / cs), gz1 = Math.floor((z + r) / cs)
    const seen = this._scratchSeen || (this._scratchSeen = new Set())
    seen.clear()
    for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) {
      const arr = this._grid.get(gx + ',' + gz)
      if (!arr) continue
      for (const c of arr) { if (seen.has(c)) continue; seen.add(c); fn(c) }
    }
  }

  /**
   * Hard-contact query: sphere (cx,cy,cz,r) vs nearby trees (capsule) + rocks/boulders (sphere).
   * Returns [{ normal:THREE.Vector3, depth, contactPoint:THREE.Vector3 }] — the SAME shape main.js
   * queryContacts emits (normal out of solid, depth > 0, contactPoint on the solid surface), so the
   * splice is just `hits.push(...propSystem.queryProps(cx,cy,cz,r))`. The surface point is the query
   * centre walked back along -normal by (r - depth) (the sphere penetrates the solid by `depth`).
   */
  queryProps(cx, cy, cz, r) {
    this._ensureGrid()
    const C = this._params.collision
    const out = []
    this._cellsAround(cx, cz, r, (c) => {
      let hit = null
      if (c.kind === 'capsule') {
        const capR = c.radius * c.scale * C.trunkRadiusScale
        hit = sphereVsCapsuleY(cx, cy, cz, r, c.x, c.z, c.y, c.y + c.height * c.scale, capR)
      } else if (c.kind === 'logCapsule') {
        // FEAT-15: fallen log — general capsule between the baked world endpoints. Same live
        // trunkRadiusScale as standing trunks (bark + slop), so one slider tunes both.
        const capR = c.radius * c.scale * C.trunkRadiusScale
        hit = sphereVsCapsule(cx, cy, cz, r, c.ax, c.ay, c.az, c.bx, c.by, c.bz, capR)
      } else if (c.kind === 'sphere') {
        hit = sphereVsSphere(cx, cy, cz, r, c.x, c.y, c.z, c.radius * c.scale * C.rockRadiusScale)
      } else if (c.kind === 'mesh') {
        // BUG-22c: boulder — broad-phase reject against the bounding sphere, then exact triangle test.
        const cullR = r + c.radius * c.scale
        const dx = cx - c.x, dy = cy - c.y, dz = cz - c.z
        if (dx * dx + dy * dy + dz * dz < cullR * cullR) {
          hit = sphereVsMeshInstance(cx, cy, cz, r, c.tris, c.x, c.y, c.z, c.rotY, c.scale)
        }
      }
      if (hit) {
        const t = r - hit.depth   // distance from query centre to the solid surface along -normal
        out.push({
          normal: new THREE.Vector3(hit.nx, hit.ny, hit.nz),
          depth: hit.depth,
          contactPoint: new THREE.Vector3(cx - hit.nx * t, cy - hit.ny * t, cz - hit.nz * t),
        })
      }
    })
    return out
  }

  /**
   * Accumulate bush soft-drag for a point moving at (vx,vy,vz) into `out` {x,y,z} (returns it).
   * Never a hard contact — capped low (FLORA collision.bush). Call once/frame for the chassis.
   */
  bushDragForce(cx, cy, cz, vx, vy, vz, out = { x: 0, y: 0, z: 0 }) {
    this._ensureGrid()
    out.x = 0; out.y = 0; out.z = 0   // reset so callers can pass a reused scratch object
    const B = this._params.collision.bush
    this._cellsAround(cx, cz, 0, (c) => {
      if (c.kind !== 'bush') return
      const br = c.radius * c.scale
      const f = bushDrag(cx, cy, cz, vx, vy, vz, c.x, c.y, c.z, br, br, B.k, B.fMax)
      if (f) { out.x += f.x; out.y += f.y; out.z += f.z }
    })
    return out
  }

  /** Total collidable props currently indexed (diagnostics / tests). */
  collidableCount() {
    let n = 0
    for (const list of this._collidables.values()) n += list.length
    return n
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
    if (this._bakeMeshes) {
      for (const dst of this._bakeMeshes.values()) { dst.mesh.geometry.dispose(); dst.mesh.dispose() }
      this._bakeMeshes = null
      this._bakeScene = null
    }
    if (this._impMeshes) {
      for (const irec of this._impMeshes.values()) { this._scene.remove(irec.mesh); irec.mesh.geometry.dispose() }
      this._impMeshes = null
    }
    if (this._impostors) { this._impostors.dispose(); this._impostors = null }
    this._material.dispose()
    this._meshes.clear()
    this._chunks.clear()
    this._collidables.clear()
    this._grid.clear()
  }
}
