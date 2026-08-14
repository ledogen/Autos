/**
 * src/terrain-physics.js — streamed terrain colliders for the physics engine (FEAT-48 Phase 1).
 *
 * Mirrors TerrainSystem's chunk ring into the engine world as static heightfield
 * bodies, one per 64 m chunk. The heights fed here are the EXACT composed mesh Y
 * values (raw·amp + carve blend + stream bed — read straight off the geometry's
 * position attribute after TerrainSystem writes them), so MESH == PHYSICS holds
 * at every vertex by construction. Within a cell the engine interpolates its own
 * triangulation, which can differ from the render mesh's diagonal by a few cm on
 * saddle cells — the wheels never see it (suspension samples the analytic surface,
 * see physics.js), only chassis/debris contacts do.
 *
 * Lifecycle is driven by TerrainSystem via setPhysicsHook():
 *   syncChunk(key, cx, cz, posAttr, N, S)  — build (or rebuild after recarve /
 *                                            amplitude change); ~100 µs per chunk
 *                                            (measured, node, 65×65) — inside the
 *                                            per-frame build budget.
 *   disposeChunk(key)                      — chunk left the keep ring
 *   clear()                                — Path B full regen (seed change)
 *
 * Built entirely against the adapter seam (physics-engine.js) — no engine types.
 */

// Terrain surface friction for engine contacts (chassis scrape, debris resting).
// The BUG-27b "slippery body" behaviour is reproduced on the CHASSIS shape's
// friction (see physics.js), not here — debris needs honest ground grip.
const TERRAIN_FRICTION = 0.8

export class TerrainPhysics {
  constructor (engine) {
    this._eng = engine
    this._chunks = new Map()   // chunk key → engine body handle
  }

  /** TerrainSystem hook: (re)build the collider for a chunk from its mesh Y values. */
  syncChunk (key, cx, cz, posAttr, N, S) {
    const heights = new Float32Array(N * N)          // engine copies into WASM; this is transient
    for (let i = 0; i < N * N; i++) heights[i] = posAttr.getY(i)
    const old = this._chunks.get(key)
    if (old !== undefined) this._eng.destroyBody(old)
    const body = this._eng.createBody({
      type: 'static',
      position: { x: cx * S, y: 0, z: cz * S },      // heightfield local origin = chunk corner
      userData: { kind: 'terrain', key },
    })
    this._eng.addHeightfield(body, heights, N, N, S / (N - 1), { friction: TERRAIN_FRICTION })
    this._chunks.set(key, body)
  }

  /** TerrainSystem hook: chunk fell out of the keep ring. */
  disposeChunk (key) {
    const body = this._chunks.get(key)
    if (body !== undefined) { this._eng.destroyBody(body); this._chunks.delete(key) }
  }

  /** TerrainSystem hook: Path B full regen — drop every collider. */
  clear () {
    for (const body of this._chunks.values()) this._eng.destroyBody(body)
    this._chunks.clear()
  }

  get chunkCount () { return this._chunks.size }
}

// Asphalt grips better than the carved dirt shoulder (terrain μ 0.8) — debris resting on the
// road should stay put; the chassis pair-μ barely moves (geometric mean vs its 0.0125).
const ROAD_FRICTION = 0.9

/**
 * RoadPhysics — mirrors RoadMeshSystem's streamed ribbon tiles as static TRIMESH colliders.
 *
 * Why this exists (owner-reported, 2026-08-14): the terrain-mesh carve deliberately sits
 * roadClearanceMargin (0.15 m) BELOW the ribbon so terrain can never poke through the asphalt.
 * The heightfield colliders above mirror that carved mesh — so debris (and the chassis) fell
 * through the visual road surface onto the dirt beneath it and read as "clipping through the
 * road". The wheels never did: their analytic surface resolves the ribbon top on-road. This
 * class gives the engine the SAME asphalt: every geometry the road tile committed (ribbon
 * slices, junction pads, tunnel bores + portals — all world-space vertices) becomes a mesh
 * shape on one static body per tile. Bonus: the chassis now collides with tunnel bore linings,
 * which closed a known FEAT-48 gap.
 *
 * Driven by RoadMeshSystem.setPhysicsHook(): syncTile on commit, disposeTile on evict/stale,
 * clear on full rebuild. Adapter-only — no engine types.
 */
export class RoadPhysics {
  constructor (engine) {
    this._eng = engine
    this._tiles = new Map()    // road tile key → engine body handle
  }

  /** RoadMeshSystem hook: a tile committed — (re)build its collider from its geometries. */
  syncTile (key, geometries) {
    this.disposeTile(key)
    const body = this._eng.createBody({ type: 'static', userData: { kind: 'road', key } })
    let shapes = 0
    for (const geo of geometries) {
      const pos = geo.attributes?.position
      const idx = geo.index
      if (!pos || !idx || pos.isInterleavedBufferAttribute) continue
      const positions = pos.array instanceof Float32Array ? pos.array : new Float32Array(pos.array)
      const indices = idx.array instanceof Uint32Array ? idx.array : new Uint32Array(idx.array)
      if (this._eng.addMesh(body, positions, indices, { friction: ROAD_FRICTION })) shapes++
    }
    if (shapes > 0) this._tiles.set(key, body)
    else this._eng.destroyBody(body)
  }

  /** RoadMeshSystem hook: tile evicted or stale. */
  disposeTile (key) {
    const body = this._tiles.get(key)
    if (body !== undefined) { this._eng.destroyBody(body); this._tiles.delete(key) }
  }

  /** RoadMeshSystem hook: full rebuild / re-route — drop everything. */
  clear () {
    for (const body of this._tiles.values()) this._eng.destroyBody(body)
    this._tiles.clear()
  }

  get tileCount () { return this._tiles.size }
}
