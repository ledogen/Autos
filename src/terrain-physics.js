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
