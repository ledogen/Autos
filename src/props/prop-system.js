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
import { ShadowBlobSystem } from './prop-shadow-blobs.js'   // PERF-07: baked contact-shadow blobs
import { FLORA_PARAMS } from '../../data/flora.js'

// Per-category global instance capacity (split evenly across that category's variants). Sized for
// the ring-4 (Ultra, 81-chunk) worst case; pure typed-array memory (64 B/instance), cheap.
const CAPACITY = {
  aspen: 4000, pine: 4000, rock: 3000, boulder: 200, smallRock: 9000, bush: 4000,
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
// PERF-07: scratch for composing a contact-shadow blob's flat-plane instance matrix.
const _bm = new THREE.Matrix4()
const _bp = new THREE.Vector3()
const _bq = new THREE.Quaternion()
const _bs = new THREE.Vector3()
const _be = new THREE.Euler()

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

    // PERF-07: prop shadow mode. castRealtime=true (default — the bake was reverted after user
    // verify) keeps props in the sun's shadow pass; false swaps to baked contact-shadow blobs
    // (setShadowCasting flips both live via the GUI checkbox).
    const shadowsP = params.shadows || { castRealtime: true, blobOpacity: 0.32, blobScale: 1.15 }
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
        mesh.castShadow = castRealtime       // PERF-07: realtime by default; blobs stand in when off
        mesh.receiveShadow = true
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
        const key = cat + '#' + v
        // occ/top: occupancy bitmap + high-water mark for PERF-10 count compaction.
        this._meshes.set(key, { mesh, free, used: 0, cap: perVariant, occ: new Uint8Array(perVariant), top: 0 })
        this._collision.set(key, entry.collision || null)
        scene.add(mesh)
      })
    }

    this._chunks = new Map()       // "cx,cz" -> [{ key, slot }, ...]
    this._dirty = new Set()        // mesh keys needing instanceMatrix/instanceColor upload
    this._overflowWarned = false

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

    // ── PERF-07 baked contact-shadow blobs ────────────────────────────────────────────
    // One InstancedMesh of flat ground decals, one per non-smallRock prop. Capacity = Σ of the
    // prop capacity pools minus smallRock (which gets no blob) — the exact upper bound of blobs.
    const blobCap = Object.entries(CAPACITY).reduce((s, [k, v]) => s + (k === 'smallRock' ? 0 : v), 0)
    this._blobs = new ShadowBlobSystem(scene, shadowsP, blobCap)
    this._chunkBlobs = new Map()   // "cx,cz" -> [blobSlot, ...]  (parallel to _chunks; released together)
    this.setShadowCasting(castRealtime)   // initial mode from params.shadows (realtime default)

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
   * Live toggle between realtime prop shadow casting and the baked contact-shadow blobs.
   *   v=true  → props cast into the sun's 2048² shadow map, blobs hidden (free day/night shadows).
   *   v=false → props dropped from the shadow pass (the perf win), blobs shown for grounding.
   */
  setShadowCasting(v) {
    for (const rec of this._meshes.values()) rec.mesh.castShadow = v
    this._blobs.setVisible(!v)
  }

  /**
   * Compose one prop's flat contact-shadow blob matrix into `out`. Returns false for categories
   * that get no blob (smallRock — too small + too numerous to matter). The unit plane spans ±0.5,
   * so an instance scale of 2× the half-extent gives the footprint.
   * @param {object} pl   placement record (x,y,z,scale,rotY,cat)
   * @param {object|null} col  the prop's collision descriptor (radius/length), null for smallRock
   * @param {THREE.Matrix4} out
   */
  _composeBlobMatrix(pl, col, out) {
    const bs = this._blobs._params.blobScale
    let hx, hz, y, yaw = 0
    if (pl.cat === 'aspen' || pl.cat === 'pine') {
      hx = hz = 2.0 * pl.scale * bs                        // canopy-reach circle at the trunk base
      y = pl.y + 0.05                                      // pl.y is the (sunk) trunk base
    } else if (pl.cat === 'rock' || pl.cat === 'boulder') {
      hx = hz = (col ? col.radius : 1) * pl.scale * bs      // ≈ collision radius
      // PERF-14: pl.gy is the scatter-time ground sample — re-sampling heightAt here (an
      // analytic road-scan per placement) made the COMMIT phase itself a 10-30 ms hitch.
      y = (pl.gy ?? this._samplers.heightAt(pl.x, pl.z)) + 0.05   // buried: pl.y is the blob CENTRE, not ground
    } else if (pl.cat === 'log') {
      hx = (col.length / 2) * pl.scale + 0.4                // elongated along the trunk axis
      hz = col.radius * pl.scale * 2.5
      yaw = pl.rotY
      y = (pl.gy ?? this._samplers.heightAt(pl.x, pl.z)) + 0.05
    } else if (pl.cat === 'bush') {
      hx = hz = (col ? col.radius : 0.5) * pl.scale * bs    // small faint circle (soft prop)
      y = pl.y + 0.05
    } else {
      return false   // smallRock — no blob
    }
    _bp.set(pl.x, y, pl.z)
    _be.set(0, yaw, 0); _bq.setFromEuler(_be)
    _bs.set(hx * 2, 1, hz * 2)
    out.compose(_bp, _bq, _bs)
    return true
  }

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
    const owned = []
    const collidables = []
    const blobSlots = []   // PERF-07: contact-shadow blob slots owned by this chunk
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
      rec.occ[slot] = 1                                  // PERF-10: track occupancy for count compaction
      if (slot >= rec.top) rec.top = slot + 1
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
      rec.mesh.setMatrixAt(slot, _m)
      _col.setRGB(pl.tint[0], pl.tint[1], pl.tint[2])
      rec.mesh.setColorAt(slot, _col)
      owned.push({ key, slot })
      this._dirty.add(key)

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

      // PERF-07: baked contact-shadow blob for this prop (skip smallRock). Owned per chunk exactly
      // like the mesh slot, released together in releaseChunk.
      if (this._composeBlobMatrix(pl, col, _bm)) {
        const bslot = this._blobs.acquire(_bm)
        if (bslot >= 0) blobSlots.push(bslot)
      }
    }
    this._chunks.set(ck, owned)
    if (collidables.length) { this._collidables.set(ck, collidables); this._gridDirty = true }
    if (blobSlots.length) this._chunkBlobs.set(ck, blobSlots)
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
      rec.occ[slot] = 0                                  // PERF-10: shrink the draw prefix when the top frees
      while (rec.top > 0 && !rec.occ[rec.top - 1]) rec.top--
      this._dirty.add(key)
    }
    this._chunks.delete(ck)
    if (this._collidables.delete(ck)) this._gridDirty = true
    // PERF-07: return this chunk's contact-shadow blob slots to the pool.
    const bslots = this._chunkBlobs.get(ck)
    if (bslots) { for (const s of bslots) this._blobs.release(s); this._chunkBlobs.delete(ck) }
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
  update(worldX, worldZ, ringChunks, hardX = null, hardZ = null) {
    const cs = this._chunkSize
    const ccx = Math.floor(worldX / cs), ccz = Math.floor(worldZ / cs)
    const want = new Set()
    let enqueued = false
    for (let dz = -ringChunks; dz <= ringChunks; dz++)
      for (let dx = -ringChunks; dx <= ringChunks; dx++) {
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
      rec.mesh.instanceMatrix.needsUpdate = true
      if (rec.mesh.instanceColor) rec.mesh.instanceColor.needsUpdate = true
      rec.mesh.count = rec.top   // PERF-10: draw the occupied prefix only (read at draw time, no flag needed)
    }
    this._dirty.clear()
    this._blobs.flush()   // PERF-07: upload any pending blob matrix writes
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
    this._material.dispose()
    this._blobs.dispose()          // PERF-07
    this._chunkBlobs.clear()
    this._meshes.clear()
    this._chunks.clear()
    this._collidables.clear()
    this._grid.clear()
  }
}
