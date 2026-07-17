/**
 * src/props/prop-impostor.js — PERF-21 billboard impostors for distant props.
 *
 * Beyond a (quality-tier-scaled) chunk ring, tall/heavy props stop rendering as 3D instances
 * (~146–206 tris each for trees) and render instead as ONE camera-facing quad each (2 tris),
 * sampling a tiny per-variant atlas baked at boot. Chunk-granular: prop-system re-commits a
 * chunk between its 3D pools and these impostor pools when the camera's chunk ring distance
 * crosses `ring3d` (see prop-system._syncChunkLod). At the takeover distances used (≥ 1 chunk,
 * 64 m+) a tree is a few dozen pixels tall, mostly fog-washed — the swap is well hidden.
 *
 * ATLAS: one small RGBA16F render target (HalfFloat so the Lambert-lit HDR bake survives to be
 * ACES-tone-mapped on screen exactly like live 3D props — render-to-target skips tone mapping).
 * Each billboardable variant gets one square tile: the variant geometry rendered ONCE through a
 * scratch Lambert scene lit by the CURRENT sky look (sun + hemisphere clones read from the live
 * light rig). Square capture region of side S = max(width, height) so the quad never stretches.
 * Re-bake on sky look changes (rebake()) — a handful of tiny renders, imperceptible.
 *
 * RENDER: one InstancedMesh per billboardable variant (IMPOSTOR_CATS × variants ≈ 11 extra draw
 * calls, capacity-shared with the 3D pools' slot bookkeeping in prop-system). Cylindrical
 * billboard in the vertex shader (rotates about world +Y around the trunk-base anchor — trees
 * must not tip back when the camera looks down). alphaTest cutout, no blending, depth-tested and
 * depth-written like solid geometry, so draw order and the transparent pass are untouched.
 *
 * Baked ground shadows are NOT affected: the shadow-bake tile source reads per-chunk placement
 * records (matrices), not the render pools, so a billboarded tree keeps its baked shadow.
 *
 * Headless-safe: nothing here is constructed without a WebGLRenderer (prop-system only activates
 * impostors when main.js wires the renderer in; gates never see this module).
 */

import * as THREE from 'three'

/** Categories worth billboarding: tall + heavy. Rocks/bushes are squat and cheap — excluded. */
export const IMPOSTOR_CATS = ['aspen', 'pine', 'boulder']

const TILE_PX = 256            // px per variant tile (atlas ~16 MB RGBA16F at 11 variants; 128 showed
                               // visible stair-step cutout edges on mid-distance trees at 1200p)

export class PropImpostors {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {{sun: THREE.DirectionalLight, ambient: THREE.HemisphereLight, sunDir: THREE.Vector3}}
   *        lights — the LIVE scene lights (colour/intensity read at each rebake) plus the sky
   *        system's canonical key-light DIRECTION (sun.position is the shadow-follow's business —
   *        at boot it still holds a placeholder, so it must not be used for the bake direction).
   */
  constructor (renderer, lights) {
    this._renderer = renderer
    this._lights = lights
    this._entries = new Map()    // key "cat#v" -> { geo, size:S, height, uTile:Vector4, material, tilesIx }
    this._rt = null
    this._cols = 0
    this._rows = 0
  }

  /**
   * Register the billboardable variants (from the palette) and bake the atlas.
   * @param {Record<string, Array<{geo:THREE.BufferGeometry}>>} variants — palette variants
   * @returns {Map<string, {material:THREE.ShaderMaterial, size:number, height:number}>}
   */
  build (variants) {
    let ix = 0
    for (const cat of IMPOSTOR_CATS) {
      const entries = variants[cat]
      if (!entries) continue
      entries.forEach((entry, v) => {
        const geo = entry.geo
        if (!geo.boundingBox) geo.computeBoundingBox()
        const bb = geo.boundingBox
        const halfW = Math.max(Math.abs(bb.min.x), bb.max.x, Math.abs(bb.min.z), bb.max.z)
        const height = bb.max.y
        const S = Math.max(2 * halfW, height) * 1.02          // square capture side (+2% guard band)
        this._entries.set(cat + '#' + v, {
          geo, size: S, height, tilesIx: ix++,
          uTile: new THREE.Vector4(), material: null,
        })
      })
    }
    // Atlas layout: near-square grid of square tiles.
    const n = this._entries.size
    this._cols = Math.ceil(Math.sqrt(n))
    this._rows = Math.ceil(n / this._cols)
    this._rt = new THREE.WebGLRenderTarget(this._cols * TILE_PX, this._rows * TILE_PX, {
      depthBuffer: true, stencilBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, type: THREE.HalfFloatType, generateMipmaps: false,
    })
    this._rt.texture.colorSpace = THREE.NoColorSpace
    for (const e of this._entries.values()) {
      const cx = e.tilesIx % this._cols, cy = Math.floor(e.tilesIx / this._cols)
      e.uTile.set(cx / this._cols, cy / this._rows, 1 / this._cols, 1 / this._rows)
      // Vertical anchor correction: the square capture region's bottom sits at (h−S)/2 in prop-local
      // Y — BELOW the base for wide-format props (squat aspens, and boulders whose blob geometry is
      // origin-centred so h/2 ≪ their visual middle). Without this the texture bottom was pinned to
      // the anchor, floating wide props by up to half the width/height difference.
      e.y0n = (e.height - e.size) / (2 * e.size)          // capture-bottom offset ÷ S (≤ 0)
      e.material = this._makeBillboardMaterial(e.uTile, e.y0n)
    }
    this.rebake()
    return this._entries
  }

  /** (Re)render every variant tile with the CURRENT sky-look lighting. Cheap — call on look change. */
  rebake () {
    if (!this._rt) return
    const r = this._renderer
    const scene = new THREE.Scene()
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true })
    const holder = new THREE.Mesh(undefined, mat)
    scene.add(holder)
    // Clone the live rig's current state — impostors must be lit like their 3D originals.
    const sun = this._lights.sun
    const dir = new THREE.DirectionalLight(sun.color, sun.intensity)
    const d = this._lights.sunDir
    if (d && d.lengthSq() > 1e-6) dir.position.copy(d).multiplyScalar(50)
    else dir.position.copy(sun.position).sub(sun.target ? sun.target.position : ZERO).normalize().multiplyScalar(50)
    const amb = this._lights.ambient
    const hemi = new THREE.HemisphereLight(amb.color, amb.groundColor, amb.intensity)
    scene.add(dir, hemi)

    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400)
    const prevTarget = r.getRenderTarget()
    const prevClear = new THREE.Color()
    const prevClearA = r.getClearAlpha()
    r.getClearColor(prevClear)
    // Neutral dark-foliage clear (alpha 0) so linear-filter fringes don't ring black.
    r.setClearColor(0x2a3524, 0)

    for (const e of this._entries.values()) {
      holder.geometry = e.geo
      const S = e.size, cy = e.height / 2
      cam.left = -S / 2; cam.right = S / 2; cam.top = cy + S / 2; cam.bottom = cy - S / 2
      cam.position.set(0, cy, 100)                     // side view down -Z
      cam.lookAt(0, cy, 0)
      cam.updateProjectionMatrix()
      cam.updateMatrixWorld(true)
      const px = (e.tilesIx % this._cols) * TILE_PX
      const py = Math.floor(e.tilesIx / this._cols) * TILE_PX
      this._rt.viewport.set(px, py, TILE_PX, TILE_PX)  // raw px — rt state, not renderer.setViewport
      this._rt.scissor.set(px, py, TILE_PX, TILE_PX)
      this._rt.scissorTest = true
      r.setRenderTarget(this._rt)
      r.render(scene, cam)
    }

    r.setClearColor(prevClear, prevClearA)
    r.setRenderTarget(prevTarget)
    mat.dispose()
  }

  _makeBillboardMaterial (uTile, y0n) {
    return new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uAtlas: { value: null },      // bound lazily below (merge() would clone the texture ref)
        uTile: { value: uTile },
        uY0n: { value: y0n },         // capture-bottom offset ÷ S (see build()) — exact vertical anchor
      }]),
      vertexShader: /* glsl */`
        attribute vec3 aPos;          // anchor: trunk base / prop origin (world)
        attribute float aSize;        // world side of the square quad (variant S × instance scale)
        attribute vec3 aTint;
        uniform vec4 uTile;           // u0, v0, uSpan, vSpan
        uniform float uY0n;
        varying vec2 vUv;
        varying vec3 vTint;
        #include <fog_pars_vertex>
        void main () {
          vUv = vec2(uTile.x + uv.x * uTile.z, uTile.y + uv.y * uTile.w);
          vTint = aTint;
          // Cylindrical billboard: face the camera in XZ only, stay world-upright.
          vec3 toCam = cameraPosition - aPos;
          float len = max(length(toCam.xz), 1e-4);
          vec2 fwd = toCam.xz / len;
          vec3 right = vec3(fwd.y, 0.0, -fwd.x);       // cross(+Y, fwd)
          vec3 wp = aPos + right * (position.x * aSize)
                  + vec3(0.0, (position.y + 0.5 + uY0n) * aSize, 0.0);
          // Slope de-burial: pull the quad toward the camera (horizontally) by ~20% of its size.
          // A flat slice through the trunk axis gets depth-clipped by uphill terrain on cross-slopes
          // (a 3D canopy also enters the hill, but wraps visibly above it) — trees read as sunk to
          // the canopy. Shifting the plane a couple of metres camera-ward stands it clear of the
          // hillside; at billboard distances (≥ ~96 m) the parallax shift is invisible.
          wp.x += fwd.x * (aSize * 0.2);
          wp.z += fwd.y * (aSize * 0.2);
          vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uAtlas;
        varying vec2 vUv;
        varying vec3 vTint;
        #include <fog_pars_fragment>
        void main () {
          vec4 texel = texture2D(uAtlas, vUv);
          if (texel.a < 0.5) discard;                  // cutout — stays in the opaque pass
          gl_FragColor = vec4(texel.rgb * vTint, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      transparent: false,
      fog: true,
      side: THREE.DoubleSide,        // quad must read from both sides while it swings to face the camera
    })
  }

  /** Bind the atlas into a billboard material (call after build(); kept out of merge()'s clone). */
  bindAtlas (material) { material.uniforms.uAtlas.value = this._rt.texture }

  dispose () {
    if (this._rt) this._rt.dispose()
    for (const e of this._entries.values()) if (e.material) e.material.dispose()
    this._entries.clear()
  }
}

const ZERO = new THREE.Vector3()
