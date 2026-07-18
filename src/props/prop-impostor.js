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

/**
 * Categories worth billboarding: tall + numerous. Rocks/bushes are squat and cheap — excluded.
 * Boulders excluded too (user call 2026-07-17): ≤200 exist world-wide, so the tri savings are
 * noise, and a huge single-quad boulder reads terribly at any angle.
 */
export const IMPOSTOR_CATS = ['aspen', 'pine']

const TILE_PX = 256            // px per variant tile (atlas ~16 MB RGBA16F at 11 variants; 128 showed
                               // visible stair-step cutout edges on mid-distance trees at 1200p)
const LIT_GAIN = 4.0           // default sun-side brightening strength (× max(view·sunXZ, 0)) —
                               // live-tunable via the Props GUI 'billboard lit gain' slider

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
    this._litGain = LIT_GAIN
  }

  /** Live sun-side brightening strength (uniforms only — no rebake needed). */
  setLitGain (v) {
    this._litGain = Math.max(0, v)
    const sd = this._lights.sunDir
    const litNorm = 1 / (1 + this._litGain * Math.max(sd ? sd.z : 0, 0))   // bake view dir is +Z
    for (const e of this._entries.values()) {
      if (!e.material) continue
      e.material.uniforms.uLitK.value = this._litGain
      e.material.uniforms.uLitNorm.value = litNorm
    }
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
    if (typeof window !== 'undefined') {
      window.__impAtlasDump = () => this.dumpAtlas()      // CDP debug handles
      window.__impAtlasStats = () => this.atlasStats()
    }
    return this._entries
  }

  /**
   * Dev handle: per-tile content bounds (alpha > 0.5) as tile-UV fractions, plus the expected
   * content bottom (−y0n). If measured vMin ≉ expected, the bake placement is off; if the two
   * differ between devicePixelRatios, the bake has a DPR dependency.
   */
  atlasStats () {
    const rt = this._rt
    if (!rt) return null
    const w = rt.width, h = rt.height
    const buf = new Uint16Array(w * h * 4)
    this._renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf)
    const aHalf = 0x3800    // half-float 0.5 — alpha threshold compare works on raw bits (positive)
    const out = {}
    for (const [key, e] of this._entries) {
      const cx = e.tilesIx % this._cols, cy = Math.floor(e.tilesIx / this._cols)
      const x0 = cx * TILE_PX, y0 = cy * TILE_PX
      let rMin = Infinity, rMax = -1, cMin = Infinity, cMax = -1
      for (let r = 0; r < TILE_PX; r++) for (let c = 0; c < TILE_PX; c++) {
        const a = buf[((y0 + r) * w + (x0 + c)) * 4 + 3]
        if (a >= aHalf) {
          if (r < rMin) rMin = r; if (r > rMax) rMax = r
          if (c < cMin) cMin = c; if (c > cMax) cMax = c
        }
      }
      out[key] = rMax < 0 ? 'EMPTY' : {
        vMin: +(rMin / TILE_PX).toFixed(3), vMax: +((rMax + 1) / TILE_PX).toFixed(3),
        uMin: +(cMin / TILE_PX).toFixed(3), uMax: +((cMax + 1) / TILE_PX).toFixed(3),
        expectedVMin: +(-e.y0n).toFixed(3), size: +e.size.toFixed(2), height: +e.height.toFixed(2),
      }
    }
    return { dpr: (typeof window !== 'undefined') ? window.devicePixelRatio : 1, tiles: out }
  }

  /** (Re)render every variant tile with the CURRENT sky-look lighting. Cheap — call on look change. */
  rebake () {
    if (!this._rt) return
    // Sun-side brightness modulation (user report 2026-07-17): the atlas is ONE view, baked from
    // +Z — roughly the shade side under the day look. Viewed from the sun's side, real 3D canopies
    // are much brighter (sun ≫ hemi), so the shader scales texel brightness by the view-vs-sun
    // azimuth: uSunXZ is the RAW horizontal sun component (a high sun self-attenuates the effect),
    // uLitNorm renormalizes so the bake azimuth (0,1) stays exactly as captured.
    const sd = this._lights.sunDir
    const sunXZ = new THREE.Vector2(sd ? sd.x : 0, sd ? sd.z : 0)
    const litNorm = 1 / (1 + this._litGain * Math.max(sunXZ.y, 0))   // bake view dir is +Z = (0,1)
    for (const e of this._entries.values()) {
      if (!e.material) continue
      e.material.uniforms.uSunXZ.value.copy(sunXZ)
      e.material.uniforms.uLitK.value = this._litGain
      e.material.uniforms.uLitNorm.value = litNorm
    }
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
      // Frustum extents are CAMERA-space — the camera already sits at y = cy, so top/bottom are
      // ±S/2, NOT cy ± S/2. The world-space version double-counted cy: every tile captured the
      // band [h−S/2, h+S/2] — the tree's TOP half, bottom-pinned — so billboards planted the
      // canopy at ground level with no trunk ("buried trees", user report 2026-07-17; confirmed
      // numerically by __impAtlasStats content span [0, 0.5] on every tile).
      cam.left = -S / 2; cam.right = S / 2; cam.top = S / 2; cam.bottom = -S / 2
      cam.position.set(0, cy, 100)                     // side view down -Z, centred on the capture band
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
        uSunXZ: { value: new THREE.Vector2(0, 0) },   // horizontal sun component (set in rebake)
        uLitK: { value: LIT_GAIN },
        uLitNorm: { value: 1 },
      }]),
      vertexShader: /* glsl */`
        attribute vec3 aPos;          // anchor: trunk base / prop origin (world)
        attribute float aSize;        // world side of the square quad (variant S × instance scale)
        attribute vec3 aTint;
        attribute vec3 aAxis;         // trunk axis (unit) — the 3D tree's parametric lean
        uniform vec4 uTile;           // u0, v0, uSpan, vSpan
        uniform float uY0n;
        uniform vec2 uSunXZ;
        varying vec2 vUv;
        varying vec3 vTint;
        varying float vLit;           // view-vs-sun azimuth alignment (see rebake)
        #include <fog_pars_vertex>
        void main () {
          vUv = vec2(uTile.x + uv.x * uTile.z, uTile.y + uv.y * uTile.w);
          vTint = aTint;
          // Cylindrical billboard around the tree's OWN trunk axis (aAxis), not world-up — the
          // 3D trees carry a parametric lean, and an upright billboard snaps visibly at the LOD
          // swap. Building the quad along the leaned axis also projects correctly: viewed along
          // the lean the tree reads near-straight, exactly like its 3D original.
          vec3 toCam = cameraPosition - aPos;
          float len = max(length(toCam.xz), 1e-4);
          vec2 fwd = toCam.xz / len;
          vLit = dot(fwd, uSunXZ);
          vec3 r3 = cross(aAxis, toCam / max(length(toCam), 1e-4));
          float rl = length(r3);
          vec3 right = rl > 1e-4 ? r3 / rl : vec3(1.0, 0.0, 0.0);
          vec3 wp = aPos + right * (position.x * aSize)
                  + aAxis * ((position.y + 0.5 + uY0n) * aSize);
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
        uniform float uLitK;
        uniform float uLitNorm;
        varying vec2 vUv;
        varying vec3 vTint;
        varying float vLit;
        #include <fog_pars_fragment>
        void main () {
          vec4 texel = texture2D(uAtlas, vUv);
          if (texel.a < 0.5) discard;                  // cutout — stays in the opaque pass
          // Approximate the sun-lit face: brighten as the camera moves to the sun's side of the
          // tree (the bake shows the shade-ish side); renormalized so the bake azimuth matches 1:1.
          float lit = (1.0 + uLitK * max(vLit, 0.0)) * uLitNorm;
          gl_FragColor = vec4(texel.rgb * vTint * lit, 1.0);
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

  /**
   * Dev handle: dump the atlas to a PNG data-URL (half-float → 8-bit, no tone map). Wired onto
   * window in build() — same precedent as main.js's __ri/__propShadows CDP handles.
   */
  dumpAtlas () {
    const rt = this._rt
    if (!rt) return null
    const w = rt.width, h = rt.height
    const buf = new Uint16Array(w * h * 4)
    this._renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf)
    const halfToFloat = (n) => {
      const s = (n & 0x8000) ? -1 : 1, e = (n >> 10) & 0x1f, f = n & 0x3ff
      if (e === 0) return s * f * 2 ** -24
      if (e === 31) return f ? NaN : s * Infinity
      return s * (1 + f / 1024) * 2 ** (e - 15)
    }
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    const img = ctx.createImageData(w, h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const si = ((h - 1 - y) * w + x) * 4        // flip: GL row 0 is the bottom
      const di = (y * w + x) * 4
      for (let c = 0; c < 4; c++) img.data[di + c] = Math.min(255, Math.round(halfToFloat(buf[si + c]) * 255))
    }
    ctx.putImageData(img, 0, 0)
    return canvas.toDataURL('image/png')
  }

  dispose () {
    if (this._rt) this._rt.dispose()
    for (const e of this._entries.values()) if (e.material) e.material.dispose()
    this._entries.clear()
  }
}

const ZERO = new THREE.Vector3()
