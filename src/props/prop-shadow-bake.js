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

/**
 * Build the top-down bake camera for one chunk tile. Exported as a pure factory so the headless
 * alignment gate (test/prop-shadow-alignment.mjs) can assert, in node, that a world point projects
 * to EXACTLY the tile UV the terrain shader samples for that point — this is the axis-mirror trap
 * that shipped twice (see below), now pinned numerically instead of by eyeball.
 *
 * Derivation (don't trust intuition here — compute it): camera at chunk centre looking straight
 * down with up=+Z gives the view basis X_cam = world −X, Y_cam = world +Z. The terrain sampler maps
 * world +X → tile U and world +Z → tile V, so NDC must satisfy ndc_x = +dx·2/C and ndc_y = +dz·2/C.
 *   ndc_x = 2·x_view/(r−l) with x_view = −dx  ⇒  r−l must be negative  ⇒  left=+C/2, right=−C/2.
 *   ndc_y = 2·y_view/(t−b) with y_view = +dz  ⇒  t−b must be positive  ⇒  top=+C/2, bottom=−C/2.
 * i.e. ONLY the left/right pair is mirrored. (History: the first ship mirrored neither and read
 * X-flipped; the "fix" 9615b6e/5555890 mirrored BOTH pairs, which moved the mirror onto Z — shadows
 * detached from their props by up to a chunk. Both slipped because alignment was judged from
 * screenshots; the gate makes it arithmetic.)
 * @param {number} chunk — chunk side in metres
 */
export function makeBakeCamera(chunk = CHUNK) {
  const cam = new THREE.OrthographicCamera(chunk / 2, -chunk / 2, chunk / 2, -chunk / 2, 1, 4000)
  cam.up.set(0, 0, 1)
  return cam
}

/**
 * Sun direction → ground shear (metres of XZ shadow offset per metre of caster height). `sunDir`
 * points from ground toward the sun (sky.js sunDirection); the shadow falls opposite, so the offset
 * is -dir.xz/|dir.y| — magnitude cot(elevation), matching the realtime shadow map's geometry. The
 * near-horizon clamp bounds shadow length. One formula, three consumers (setSun, the per-instance
 * ground-fit in prop-system, the alignment gate) — keep them on this function.
 * @param {THREE.Vector3} sunDir @param {THREE.Vector2} out
 */
export function shearFromSun(sunDir, out) {
  const y = Math.max(Math.abs(sunDir.y), 0.05)
  return out.set(-sunDir.x / y, -sunDir.z / y)
}

/**
 * Per-instance ground fit for the bake's shear projection. The projection shader flattens a prop
 * onto the HORIZONTAL plane through its base — but the realtime shadow map intersects the sun ray
 * with the actual TERRAIN, and on a grade those differ by up to |shear|·slope per metre of height
 * (with a low sun on a steep hillside the true landing point is 2–3× the flat offset — shadows
 * visibly detach downhill / bunch uphill; found live at seed 6 (334,-108)).
 *
 * This returns the scalar k such that offsetting by h·shear·k lands the point h0 above (bx,by,bz)
 * exactly on the terrain: walking the sun ray down from that point, after descending Δ metres its
 * ground track is at base.xz + Δ·shear and its height is by + h0 − Δ; find the terrain crossing by
 * expansion + bisection and return k = Δhit/h0 (flat ground → Δhit = h0 → k = 1). Applied per INSTANCE
 * at the canopy centre h0, so each prop's shadow lands where the realtime one does; the residual
 * within one silhouette is second-order. Pure — gate-tested against analytic slopes.
 * @param {number} bx @param {number} by @param {number} bz — prop base (on the ground)
 * @param {number} h0 — representative caster height above the base (canopy centre), > 0
 * @param {number} sx @param {number} sz — shear vector (shearFromSun)
 * @param {(x:number,z:number)=>number} heightAt — terrain height sampler
 */
export function shadowShearScale(bx, by, bz, h0, sx, sz, heightAt) {
  const f = (d) => (by + h0 - d) - heightAt(bx + d * sx, bz + d * sz)
  // Expand past the crossing (downhill shadows reach beyond the flat solution Δ=h0), then bisect.
  const MAX_DROP = h0 + 48                       // bound runaway marches off cliff edges
  let lo = 0, hi = h0
  let fh = f(hi)
  let guard = 0
  while (fh > 0 && hi < MAX_DROP && guard++ < 24) { lo = hi; hi = Math.min(hi + Math.max(1, 0.5 * h0), MAX_DROP); fh = f(hi) }
  if (fh > 0) return hi / h0                     // never landed (cliff) — clamp at the bound
  for (let i = 0; i < 10; i++) {                 // ≤ ~0.06 m — well under the atlas 0.25 m/texel
    const mid = (lo + hi) / 2
    if (f(mid) > 0) lo = mid; else hi = mid
  }
  return ((lo + hi) / 2) / h0
}

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
    // The frustum mirrors ONLY the left/right pair — see makeBakeCamera() for the derivation and
    // the gate that pins it. DoubleSide on the projection material covers the winding flip the
    // mirrored frustum introduces.
    this._cam = makeBakeCamera(CHUNK)
    this._cam.layers.set(BAKE_LAYER)

    // Projection material: shear each vertex onto the ground along the sun ray, output union alpha.
    this._mat = new THREE.ShaderMaterial({
      uniforms: { uShearXZ: { value: new THREE.Vector2(0, 0) } },
      vertexShader: /* glsl */`
        uniform vec2 uShearXZ;
        // Per-instance ground fit (shadowShearScale, written by prop-system at commit): scales the
        // flat-plane shear so this prop's shadow lands on the real sloped terrain like the realtime
        // map's would. Prop pool geometries always carry the attribute (default 1 = flat ground).
        attribute float aShadowK;
        void main() {
          #ifdef USE_INSTANCING
            mat4 im = instanceMatrix;
          #else
            mat4 im = mat4(1.0);
          #endif
          vec4 wp   = modelMatrix * im * vec4( position, 1.0 );
          vec4 base = modelMatrix * im * vec4( 0.0, 0.0, 0.0, 1.0 );  // instance origin = trunk base ≈ ground
          float h   = max( wp.y - base.y, 0.0 );                      // height above the prop's base
          wp.xz    += h * uShearXZ * aShadowK;                        // project along sun onto terrain
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
    shearFromSun(sunDir, this._shear)                  // -dir.xz/|dir.y| — see shearFromSun
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
    r.getClearColor(this._prevClear)
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

      // Target the tile via the RENDER TARGET's own viewport/scissor — these are RAW pixels.
      // renderer.setViewport/setScissor must NOT be used here: they multiply by the canvas
      // pixelRatio, so on a HiDPI display (DPR 2) every tile was written at 2× its offset/size —
      // shadows landed in other chunks' tiles (or off-atlas) on Retina while DPR-1 headless runs
      // looked perfect. setRenderTarget applies rt.viewport/rt.scissor each call, so set them
      // before it; autoClear then clears only the scissored tile before drawing the silhouettes.
      this._rt.viewport.set(px, py, TILE_PX, TILE_PX)
      this._rt.scissor.set(px, py, TILE_PX, TILE_PX)
      this._rt.scissorTest = true
      r.setRenderTarget(this._rt)
      r.render(propScene, this._cam)
    }

    propScene.overrideMaterial = prevOverride
    propScene.background = prevBg
    r.setClearColor(this._prevClear, prevClearA)
    // Restores the canvas viewport/scissor automatically (they were never touched — only rt state).
    r.setRenderTarget(prevTarget)
  }

  /** Full reset (seed change): drop the queue; caller re-commits chunks which re-mark tiles. */
  clear() {
    this._dirty.length = 0
    this._dirtySet.clear()
    const r = this._renderer
    const prevTarget = r.getRenderTarget()
    const size = ATLAS_N * TILE_PX
    this._rt.viewport.set(0, 0, size, size)   // full-atlas clear (rt state, raw pixels — see update)
    this._rt.scissor.set(0, 0, size, size)
    this._rt.scissorTest = false
    r.setRenderTarget(this._rt)
    r.setClearColor(0x000000, 0)
    r.clear(true, false, false)
    r.setRenderTarget(prevTarget)
  }

  dispose() { this._rt.dispose(); this._mat.dispose() }
}
