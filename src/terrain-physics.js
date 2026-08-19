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
  constructor (engine, getRoad = null) {
    this._eng = engine
    this._chunks = new Map()   // chunk key → engine body handle
    this._getRoad = getRoad    // () => RoadSystem | null — bore-slot cut below needs the spans
  }

  /**
   * Bore-span centerline segments overlapping a world-XZ box: flat [ax,ay,az,bx,by,bz,...] from
   * the registered runs' 4 m samples inside each tunnel span, or null when none. The y values ARE
   * the deck (the run profile inside a span is the bore floor).
   */
  _boreSegsIn (x0, z0, x1, z1) {
    const rs = this._getRoad?.()
    if (!rs?._network) return null
    let segs = null
    for (const [, e] of rs._network) {
      if (!e.tunnelSpans) continue
      const pts = e.points, cum = e.polyCum
      for (const sp of e.tunnelSpans) {
        for (let i = 1; i < pts.length; i++) {
          if (cum[i] < sp.s0 - 2) continue
          if (cum[i - 1] > sp.s1 + 2) break
          const a = pts[i - 1], b = pts[i]
          if (Math.max(a.x, b.x) < x0 || Math.min(a.x, b.x) > x1 ||
              Math.max(a.z, b.z) < z0 || Math.min(a.z, b.z) > z1) continue
          ;(segs ??= []).push(a.x, a.y, a.z, b.x, b.y, b.z)
        }
      }
    }
    return segs
  }

  /** TerrainSystem hook: (re)build the collider for a chunk from its mesh Y values. */
  syncChunk (key, cx, cz, posAttr, N, S) {
    const heights = new Float32Array(N * N)          // engine copies into WASM; this is transient
    for (let i = 0; i < N * N; i++) heights[i] = posAttr.getY(i)
    // ── FEAT-40 gap (owner-reported 2026-08-18, pre-dates router v2): cut the bore SLOT. ────────
    // The mesh keeps the mountain above a tunnel span, so mirroring mesh Y verbatim walls the
    // portal — tunnels were never chassis-passable. The WHEELS already pass: _sampleCarveWorld's
    // bore-ownership rule resolves the bore FLOOR inside spans, and queryTunnelWallContact gives
    // the tube walls. This depresses heightfield vertices inside each bore tube (lateral distance
    // ≤ tunnelBoreRadius from the span centerline) to just under the deck, aligning the engine
    // collider with the analytic surface the wheels drive — the deliberate, span-bounded exception
    // to "heights == mesh Y" (the mountain above is scenery there, not a driving surface).
    const rs = this._getRoad?.()
    if (rs?._network) {
      const R = rs._params?.tunnelBoreRadius ?? 8
      const wx0 = cx * S, wz0 = cz * S
      const segs = this._boreSegsIn(wx0 - R, wz0 - R, wx0 + S + R, wz0 + S + R)
      if (segs) {
        const half = S / 2
        const R2 = R * R
        for (let i = 0; i < N * N; i++) {
          // PlaneGeometry local XZ ∈ [−S/2, S/2]; mesh sits at the chunk CENTER (terrain.js)
          const x = posAttr.getX(i) + wx0 + half
          const z = posAttr.getZ(i) + wz0 + half
          let cut = Infinity
          for (let sgi = 0; sgi < segs.length; sgi += 6) {
            const ax = segs[sgi], az = segs[sgi + 2]
            const vx = segs[sgi + 3] - ax, vz = segs[sgi + 5] - az
            const vv = vx * vx + vz * vz || 1
            let t = ((x - ax) * vx + (z - az) * vz) / vv
            t = t < 0 ? 0 : t > 1 ? 1 : t
            const dx = x - (ax + t * vx), dz = z - (az + t * vz)
            if (dx * dx + dz * dz > R2) continue
            const deck = segs[sgi + 1] + t * (segs[sgi + 4] - segs[sgi + 1])
            if (deck < cut) cut = deck
          }
          if (cut !== Infinity && heights[i] > cut - 0.5) heights[i] = cut - 0.5
        }
      }
    }
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
      let indices = idx.array instanceof Uint32Array ? idx.array : new Uint32Array(idx.array)
      // Surface-tagged geometries (ribbon slices, pads) contribute their DRIVING SURFACE only:
      // triangles steeper than ~70° (|ny| < 0.35 of the normal) are dropped — those are the edge
      // skirts, 0.4 m wall strips along the asphalt that the chassis slab could catch at speed
      // (one-frame Δv 7 m/s + 8.6 rad/s yaw kick, capture 1786773473453). Debris can't tell:
      // anything rolling off the edge lands on the carved-dirt heightfield centimetres below.
      if (geo.userData?.colliderSurfaceOnly) indices = this._surfaceTris(positions, indices)
      if (indices.length >= 3 && this._eng.addMesh(body, positions, indices, { friction: ROAD_FRICTION })) shapes++
    }
    if (shapes > 0) this._tiles.set(key, body)
    else this._eng.destroyBody(body)
  }

  /** Keep triangles whose face normal is within ~70° of vertical (the drivable surface). */
  _surfaceTris (pos, idx) {
    const keep = []
    for (let i = 0; i + 2 < idx.length; i += 3) {
      const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2]
      const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2]
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
      if (len > 1e-12 && Math.abs(ny) / len >= 0.35) keep.push(idx[i], idx[i + 1], idx[i + 2])
    }
    return Uint32Array.from(keep)
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

/**
 * PropPhysics — mirrors PropSystem's per-chunk hard collidables as engine static bodies.
 *
 * Why (owner-reported "squishy trees", 2026-08-15): prop collision was ANALYTIC-only, consumed
 * by the wheel path — the old body solver probed it too, but the engine chassis only knew
 * terrain/road/debris, so driving the BODY into a tree pushed back through nothing but the
 * suspension's XZ spring residual. This mirror gives the chassis (and debris) rigid contacts:
 * tree trunks + fallen logs as capsules, rocks as spheres, boulders as their actual triangle
 * meshes — the same shapes the analytic wheel query resolves, one static body per prop chunk.
 * Wheels are untouched (their engine overlap filters to GROUP_DEBRIS), so nothing double-counts.
 *
 * Radii bake the live prop sliders (trunkRadiusScale / rockRadiusScale) at chunk-sync time —
 * PropSystem re-syncs on slider change via resyncAll() (see prop-debug wiring). Bushes are
 * soft-drag only and get no collider, matching the analytic query.
 */
export class PropPhysics {
  constructor (engine, params) {
    this._eng = engine
    this._params = params            // reads params.collision.* scales at sync time
    this._chunks = new Map()         // prop chunk key → engine body handle
    this._sources = new Map()        // prop chunk key → collidables list (for resyncAll)
  }

  syncChunk (ck, collidables) {
    this.disposeChunk(ck)
    const C = this._params.collision
    const body = this._eng.createBody({ type: 'static', userData: { kind: 'prop', key: ck } })
    const mat = { friction: 0.8, restitution: 0 }   // bark/granite; chassis pair-μ stays BUG-27b slippery
    let shapes = 0
    for (const c of collidables) {
      if (c.kind === 'capsule') {
        // Baked world endpoints — inherits the tree's tilt (same data the analytic query uses).
        const r = c.radius * c.scale * C.trunkRadiusScale
        this._eng.addCapsule(body, { x: c.ax, y: c.ay, z: c.az }, { x: c.bx, y: c.by, z: c.bz }, r, mat)
        shapes++
      } else if (c.kind === 'logCapsule') {
        const r = c.radius * c.scale * C.trunkRadiusScale
        this._eng.addCapsule(body, { x: c.ax, y: c.ay, z: c.az }, { x: c.bx, y: c.by, z: c.bz }, r, mat)
        shapes++
      } else if (c.kind === 'sphere') {
        this._eng.addSphere(body, c.radius * c.scale * C.rockRadiusScale, mat, { x: c.x, y: c.y, z: c.z })
        shapes++
      } else if (c.kind === 'mesh' && c.tris) {
        // Boulder: instance-local triangle soup → world (same yaw/scale/translate the analytic
        // sphereVsMeshInstance applies), sequential indices.
        const n = c.tris.length / 3
        const pos = new Float32Array(c.tris.length)
        const idx = new Uint32Array(n)
        const cy = Math.cos(c.rotY), sy = Math.sin(c.rotY)
        for (let i = 0; i < n; i++) {
          const lx = c.tris[i * 3] * c.scale, ly = c.tris[i * 3 + 1] * c.scale, lz = c.tris[i * 3 + 2] * c.scale
          pos[i * 3] = c.x + lx * cy + lz * sy
          pos[i * 3 + 1] = c.y + ly
          pos[i * 3 + 2] = c.z - lx * sy + lz * cy
          idx[i] = i
        }
        if (this._eng.addMesh(body, pos, idx, mat)) shapes++
      }
      // 'bush': soft drag only — no collider, matching queryProps.
    }
    if (shapes > 0) { this._chunks.set(ck, body); this._sources.set(ck, collidables) }
    else this._eng.destroyBody(body)
  }

  disposeChunk (ck) {
    const body = this._chunks.get(ck)
    if (body !== undefined) { this._eng.destroyBody(body); this._chunks.delete(ck); this._sources.delete(ck) }
  }

  /** Prop radius sliders changed — rebuild every standing chunk with the new scales. */
  resyncAll () {
    for (const [ck, list] of [...this._sources]) this.syncChunk(ck, list)
  }

  clear () {
    for (const body of this._chunks.values()) this._eng.destroyBody(body)
    this._chunks.clear()
    this._sources.clear()
  }

  get chunkCount () { return this._chunks.size }
}
