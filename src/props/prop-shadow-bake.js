/**
 * src/props/prop-shadow-bake.js — PERF-07 baked prop shadows (cast once, stored in a world atlas).
 *
 * Props are otherwise realtime shadow CASTERS: every scattered tree/rock/log re-renders into the
 * sun's directional shadow map every frame (~1.86 ms/frame on an M4 — test/perf-prop-shadows.mjs),
 * and because RangerSim is always in motion the PERF-16 on-demand skip never fires while driving.
 * The sun is static (no day/night yet), so a prop's shadow is a fixed world-space shape — it only
 * needs baking ONCE, when its terrain chunk streams in.
 *
 * Mechanism — a TOROIDAL SHADOW ATLAS (clipmap):
 *   • One WebGLRenderTarget holds an ATLAS_N × ATLAS_N grid of TILE_PX² tiles, one tile per live
 *     terrain chunk. Chunk (cx,cz) → tile (cx mod N, cz mod N) — a pure function of world position,
 *     so the terrain fragment shader can sample it from vWorldPos.xz with NO per-chunk uniform and
 *     NO per-chunk material clone (the terrain material stays a single shared instance). N exceeds
 *     the streamed ring diameter (≤9 at Ultra), so two simultaneously-live chunks never collide on
 *     a tile; a chunk that scrolls off is overwritten by the new chunk that lands on its slot.
 *   • Baking a tile: an orthographic top-down camera covering exactly that chunk's 64 m renders the
 *     prop instanced meshes through a PROJECTION shader that shears each vertex in XZ by its height
 *     above the prop's base times the sun's horizontal/vertical ratio — i.e. the prop's real
 *     silhouette, flattened and stretched along the sun azimuth onto the ground. Union alpha (no
 *     blend, no depth) so overlaps stay solid. Props outside the 64 m frustum whose sheared shadow
 *     enters it still rasterize (meshes are frustumCulled=false), so shadows cross chunk seams
 *     continuously — that's why a committed chunk marks its 8 neighbours dirty too.
 *   • The terrain shader multiplies ground albedo by (1 − atlas.a · strength), softened by a small
 *     in-tile blur. No per-frame prop shadow cost; only the moving truck keeps a realtime shadow.
 *
 * Isolation: props are additionally on BAKE_LAYER; the bake camera renders ONLY that layer, so
 * terrain/vehicle/water are invisible to the bake. scene.overrideMaterial swaps in the projection
 * material for the pass. Headless (node) has no renderer → the whole system is never constructed
 * (main.js guards on the WebGL renderer), exactly like the old blob decals.
 */

import * as THREE from 'three'

export const BAKE_LAYER = 2          // props enable this layer; the bake camera renders only it
export const ATLAS_N    = 12         // tiles per side (toroidal). Ring diameter ≤ 9 (Ultra) ⊂ 12.
export const TILE_PX    = 256        // px per chunk tile → 0.25 m/texel at CHUNK_SIZE 64 (atlas 3072²)
const CHUNK             = 64         // world metres per chunk side (matches terrain CHUNK_SIZE)
const MAX_BAKES_PER_CALL = 8         // tiles baked per update() — sliced to avoid a stream hitch

// Positive modulo (cx can be negative).
const pmod = (a, n) => ((a % n) + n) % n

export class ShadowBakeSystem {
  /** @param {THREE.WebGLRenderer} renderer */
  constructor(renderer) {
    this._renderer = renderer
    const size = ATLAS_N * TILE_PX
    this._rt = new THREE.WebGLRenderTarget(size, size, {
      depthBuffer: false, stencilBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
      format: THREE.RGBAFormat, type: THREE.UnsignedByteType, generateMipmaps: false,
    })
    this._rt.texture.colorSpace = THREE.NoColorSpace   // alpha is data, not colour

    // Top-down ortho camera covering one chunk (±32 m), looking straight down (-Y) with up = +Z.
    // A true top-down MAP (world +X → tile U increasing, world +Z → tile V increasing, to match the
    // terrain sampler's atlasUV-from-world-xz) is an IMPROPER (mirrored) view — you cannot have
    // +X-right, +Z-up and -Y-forward as a proper rotation — so exactly ONE ortho axis must be
    // mirrored. Empirically (per-axis shear probe, straight-down freecam, seed 6): with up=+Z the
    // downward look-at already maps world +X → tile U correctly, but world +Z comes out FLIPPED. So
    // negate ONLY the top/bottom pair (left/right kept as the natural +X→+U). ortho(l,r,t,b) =
    // (C/2, -C/2, -C/2, C/2): left/right kept swapped for the +X→+U match; top/bottom swapped to
    // un-flip +Z→+V. Verified in-browser against the realtime shadow (A/B): a prop's baked shadow
    // anchors at its base and falls in the same direction/length as its realtime cast, and pure +X /
    // +Z test shears push the shadow to world +X / +Z respectively. DoubleSide covers the winding the
    // frustum flips introduce. (History: an earlier fix mistakenly flipped BOTH axes, which only
    // moved the mirror from Z to X — the shadows stayed misaligned, just on the other axis.)
    this._cam = new THREE.OrthographicCamera(CHUNK / 2, -CHUNK / 2, -CHUNK / 2, CHUNK / 2, 1, 4000)
    this._cam.up.set(0, 0, 1)
    this._cam.layers.set(BAKE_LAYER)

    // Projection material: shear each vertex onto the ground along the sun ray, output union alpha.
    this._mat = new THREE.ShaderMaterial({
      uniforms: { uShearXZ: { value: new THREE.Vector2(0, 0) } },
      vertexShader: /* glsl */`
        uniform vec2 uShearXZ;
        void main() {
          #ifdef USE_INSTANCING
            mat4 im = instanceMatrix;
          #else
            mat4 im = mat4(1.0);
          #endif
          vec4 wp   = modelMatrix * im * vec4( position, 1.0 );
          vec4 base = modelMatrix * im * vec4( 0.0, 0.0, 0.0, 1.0 );  // instance origin = trunk base ≈ ground
          float h   = max( wp.y - base.y, 0.0 );                      // height above the prop's base
          wp.xz    += h * uShearXZ;                                   // project along sun onto ground
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */`
        void main() { gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 ); }`,
      depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    })

    this._dirty    = []           // FIFO of "cx,cz" keys awaiting bake
    this._dirtySet = new Set()
    this._shear    = new THREE.Vector2(0, 0)
    this._haveSun  = false
    this._prevClear = new THREE.Color()     // scratch for save/restore of the renderer clear colour
    this._prevView  = new THREE.Vector4()   // scratch for save/restore of the renderer viewport
    this._prevScis  = new THREE.Vector4()   // scratch for save/restore of the renderer scissor

    // Clear the whole atlas to alpha 0 once (untouched tiles read "no shadow").
    const prevTarget = renderer.getRenderTarget()
    renderer.setRenderTarget(this._rt)
    renderer.setClearColor(0x000000, 0)
    renderer.clear(true, false, false)
    renderer.setRenderTarget(prevTarget)
  }

  get atlasTexture() { return this._rt.texture }

  /**
   * Set the sun (key-light) direction — horizontal projection ratio for the shear. `sunDir` points
   * from ground toward the sun (sky.js sunDirection); the shadow falls opposite, offset per metre of
   * height by -dir.xz / dir.y. The sun is static today; if a day/night cycle ever moves it, the
   * caller must re-mark live chunks (this system does not track them). Returns true if the shear
   * changed (so the caller can decide to re-bake).
   * @param {THREE.Vector3} sunDir
   */
  setSun(sunDir) {
    const y = Math.max(Math.abs(sunDir.y), 0.05)       // clamp near-horizon to bound shadow length
    // sky.js sunDirection points from ground toward the sun; the shadow falls opposite, so the
    // ground offset per metre of height is -dir.xz / |dir.y|. Full magnitude = |dir.xz|/dir.y =
    // cot(elevation) — matches the realtime shadow length/direction (verified via PERF-07 A/B).
    this._shear.set(-sunDir.x / y, -sunDir.z / y)
    const changed = !this._haveSun ||
      this._mat.uniforms.uShearXZ.value.distanceToSquared(this._shear) > 1e-8
    this._mat.uniforms.uShearXZ.value.copy(this._shear)
    this._haveSun = true
    return changed
  }

  /**
   * Queue a chunk (and its 8 neighbours, since shadows cross seams) for baking. The chunk's OWN tile
   * is prioritised (front of the queue) so its trees' shadows land first; neighbours (only relevant
   * for cross-seam silhouettes) trail behind — cuts the visible "shadow lags the tree" pop-in.
   */
  markWithNeighbors(cx, cz) {
    this._mark(cx, cz, true)                                  // own tile first
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++)
        if (dx || dz) this._mark(cx + dx, cz + dz, false)     // neighbours after
  }

  _mark(cx, cz, front) {
    const k = cx + ',' + cz
    if (this._dirtySet.has(k)) return
    this._dirtySet.add(k)
    if (front) this._dirty.unshift(k); else this._dirty.push(k)
  }

  hasWork() { return this._dirty.length > 0 }

  /**
   * Bake up to MAX_BAKES_PER_CALL queued tiles. `propScene` is the main scene (props live on it,
   * flagged BAKE_LAYER); everything else is invisible to the bake camera. Called each frame after
   * prop streaming so freshly-committed chunks bake within a frame or two.
   */
  update(propScene) {
    if (!this._dirty.length) return
    const r = this._renderer
    const prevTarget   = r.getRenderTarget()
    const prevOverride = propScene.overrideMaterial
    const prevBg       = propScene.background
    const prevClearA   = r.getClearAlpha()
    const prevScissorTest = r.getScissorTest()
    r.getClearColor(this._prevClear)
    r.getViewport(this._prevView)     // main-pass viewport — MUST be restored or the frame draws into a tile
    r.getScissor(this._prevScis)
    // Isolate the bake: only props (BAKE_LAYER) render via the bake camera, and the sky background
    // would otherwise fill every tile (it ignores camera layers), so null it for the pass.
    propScene.overrideMaterial = this._mat
    propScene.background = null
    r.setClearColor(0x000000, 0)

    const n = Math.min(MAX_BAKES_PER_CALL, this._dirty.length)
    for (let i = 0; i < n; i++) {
      const k = this._dirty.shift()
      this._dirtySet.delete(k)
      const comma = k.indexOf(',')
      const cx = parseInt(k.slice(0, comma), 10)
      const cz = parseInt(k.slice(comma + 1), 10)
      const tx = pmod(cx, ATLAS_N), tz = pmod(cz, ATLAS_N)
      const px = tx * TILE_PX, py = tz * TILE_PX

      const wx = cx * CHUNK + CHUNK / 2, wz = cz * CHUNK + CHUNK / 2
      this._cam.position.set(wx, 2000, wz)
      this._cam.lookAt(wx, 0, wz)
      this._cam.updateMatrixWorld(true)

      // Target the tile: setRenderTarget resets the viewport to full, so set it after. autoClear
      // (on) clears only the scissored tile to (0,0,0,0) before drawing this chunk's silhouettes.
      r.setRenderTarget(this._rt)
      r.setViewport(px, py, TILE_PX, TILE_PX)
      r.setScissor(px, py, TILE_PX, TILE_PX)
      r.setScissorTest(true)
      r.render(propScene, this._cam)
    }

    propScene.overrideMaterial = prevOverride
    propScene.background = prevBg
    r.setClearColor(this._prevClear, prevClearA)
    r.setRenderTarget(prevTarget)
    // Restore the main-pass viewport/scissor — setRenderTarget above reset them to the target size,
    // and leaving the tile viewport in place would draw the whole frame into a 128×128 corner.
    r.setViewport(this._prevView)
    r.setScissor(this._prevScis)
    r.setScissorTest(prevScissorTest)
  }

  /** Full reset (seed change): drop the queue; caller re-commits chunks which re-mark tiles. */
  clear() {
    this._dirty.length = 0
    this._dirtySet.clear()
    const r = this._renderer
    const prevTarget = r.getRenderTarget()
    r.setRenderTarget(this._rt)
    r.setScissorTest(false)
    r.setClearColor(0x000000, 0)
    r.clear(true, false, false)
    r.setRenderTarget(prevTarget)
  }

  dispose() { this._rt.dispose(); this._mat.dispose() }
}
