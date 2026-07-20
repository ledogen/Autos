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
 * Boulders excluded (final user call 2026-07-18): a wide, mostly-horizontal mass reads badly as
 * a vertical quad from above; instead they render FULL 3D out to the billboard ring (see
 * prop-system BBONLY_3D_CATS) — ≤200 exist world-wide, so the tri cost is noise.
 */
export const IMPOSTOR_CATS = ['aspen', 'pine']

const TILE_PX = 256            // px per variant tile (atlas ~16 MB RGBA16F at 11 variants; 128 showed
                               // visible stair-step cutout edges on mid-distance trees at 1200p)
const LIT_GAIN = 1.7           // sun-term scale in the view-relit ratio (1 = physical; 1.7 user-tuned) —
                               // live-tunable via the Props GUI 'billboard sun contrast' slider
const FLATTEN = 0              // baked-gradient flatten strength at sun-on views (blend toward the
                               // tile mean, ramped from 0 at the bake view). User-tuned OFF — kept as
                               // a live GUI lever ('billboard sun-side flatten').

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
    this._flatten = FLATTEN
  }

  /** Live sun-contrast scale (uniforms only — no rebake needed). 1 = physical. */
  setLitGain (v) {
    this._litGain = Math.max(0, v)
    this._updateLightUniforms()
  }

  /** Live gradient-flatten strength at sun-on views (uniforms only). See FLATTEN. */
  setFlatten (v) {
    this._flatten = Math.max(0, Math.min(1, v))
    for (const e of this._entries.values()) {
      if (e.material) e.material.uniforms.uFlat.value = this._flatten
    }
  }

  /**
   * View-relighting uniforms, derived from the LIVE rig (not hand-tuned): the baked texel is
   * albedo × (hemi + sun·g(c0)) for the bake view; a view from alignment c sees albedo ×
   * (hemi + sun·g(c)). The shader multiplies by the per-channel ratio of the two, so billboards
   * brighten AND warm toward the sun side, darken AND cool on the shade side, and pass through
   * exactly 1.0 at the bake azimuth. g(c) = (sinθ + (π−θ)cosθ)/π is the average clamped-cosine
   * sun response over the camera-facing hemisphere of facet normals (convex-canopy Lambert
   * average): g(1)=1 (sun behind camera), g(0)=1/π, g(−1)=0 (looking into the sun).
   * The old flat ×(1+4·max(view·sun,0)) gain crushed shade-side views to ~1/3 brightness
   * (near-black billboard pines, user report 2026-07-19) — this ratio replaces it.
   */
  _updateLightUniforms () {
    const sd = this._lights.sunDir
    const sun = this._lights.sun, amb = this._lights.ambient
    const dir = (sd && sd.lengthSq() > 1e-6) ? _v3.copy(sd).normalize() : _v3.set(0, 1, 0)
    const sunT = _c1.copy(sun.color).multiplyScalar(sun.intensity * this._litGain)
    // Canopy facets see roughly half sky, half ground — average the hemisphere colours.
    const hemiT = _c2.copy(amb.color).add(amb.groundColor).multiplyScalar(0.5 * amb.intensity)
    const g0 = gWrap(Math.max(-1, Math.min(1, dir.z)))       // bake view dir is +Z
    for (const e of this._entries.values()) {
      if (!e.material) continue
      const u = e.material.uniforms
      u.uG0.value = g0
      u.uFlat.value = this._flatten
      u.uSunDir.value.copy(dir)
      u.uHemi.value.set(hemiT.r, hemiT.g, hemiT.b)
      u.uSunT.value.set(sunT.r, sunT.g, sunT.b)
      u.uInvDenom.value.set(
        1 / Math.max(hemiT.r + sunT.r * g0, 1e-3),
        1 / Math.max(hemiT.g + sunT.g * g0, 1e-3),
        1 / Math.max(hemiT.b + sunT.b * g0, 1e-3))
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
    // Mipmapped: distant billboards are heavily minified (a 20 m tree at 300 m is ~40 px against a
    // 256 px tile) — trilinear minification kills the cutout shimmer. Regenerated per tile render
    // at bake time only (boot / sky-look change), never per frame.
    this._rt = new THREE.WebGLRenderTarget(this._cols * TILE_PX, this._rows * TILE_PX, {
      depthBuffer: true, stencilBuffer: false,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, type: THREE.HalfFloatType, generateMipmaps: true,
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
    this._updateLightUniforms()   // view-relighting ratio (see _updateLightUniforms)
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
    // BLACK clear, alpha 0: linear filtering (and mip generation) across the cutout edge then
    // yields exactly premultiplied samples — (fg·w, w) — and the billboard shader recovers the
    // foliage colour with rgb/a. Any non-black clear bleeds its own colour into edge texels
    // (the previous neutral-green clear left a dark fringe on every sprite edge).
    r.setClearColor(0x000000, 0)

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
    this._computeTileMeans()
  }

  /**
   * Per-tile mean foliage colour (unpremultiplied, over a ≥ 0.5 texels) → uTileMean, the flatten
   * target. One whole-atlas readback per bake (boot / sky-look change), not per frame.
   */
  _computeTileMeans () {
    const rt = this._rt
    const w = rt.width, h = rt.height
    const buf = new Uint16Array(w * h * 4)
    this._renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf)
    const aHalf = 0x3800                                 // half-float 0.5 (positive-range bit compare)
    for (const e of this._entries.values()) {
      const x0 = (e.tilesIx % this._cols) * TILE_PX
      const y0 = Math.floor(e.tilesIx / this._cols) * TILE_PX
      // LUMINANCE-WEIGHTED mean: a plain mean skews dark on pines (deep shade texels + trunk
      // dominate the tile), so sun-on flattening turned billboard pines darker than their lit 3D
      // originals. Weighting by luminance biases the target toward the canopy's lit body — the
      // thing a sun-facing view actually shows — and barely moves near-uniform tiles (aspens).
      let sr = 0, sg = 0, sb = 0, wsum = 0
      for (let row = 0; row < TILE_PX; row++) for (let col = 0; col < TILE_PX; col++) {
        const i = ((y0 + row) * w + (x0 + col)) * 4
        if (buf[i + 3] < aHalf) continue
        const r0 = halfToFloat(buf[i]), g0 = halfToFloat(buf[i + 1]), b0 = halfToFloat(buf[i + 2])
        const wgt = 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0
        sr += r0 * wgt; sg += g0 * wgt; sb += b0 * wgt; wsum += wgt
      }
      if (wsum > 0 && e.material) e.material.uniforms.uTileMean.value.set(sr / wsum, sg / wsum, sb / wsum)
    }
  }

  _makeBillboardMaterial (uTile, y0n) {
    return new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uAtlas: { value: null },      // bound lazily below (merge() would clone the texture ref)
        uTile: { value: uTile },
        uY0n: { value: y0n },         // capture-bottom offset ÷ S (see build()) — exact vertical anchor
        // View-relighting rig terms (set in _updateLightUniforms, refreshed on rebake/slider):
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uHemi: { value: new THREE.Vector3(1, 1, 1) },    // hemi colour × intensity
        uSunT: { value: new THREE.Vector3(0, 0, 0) },    // sun colour × intensity × litGain
        uInvDenom: { value: new THREE.Vector3(1, 1, 1) },// 1/(hemi + sun·g(bake view))
        uG0: { value: 0 },                               // g at the bake view (flatten ramp zero)
        uFlat: { value: FLATTEN },                       // sun-on gradient flatten strength
        uTileMean: { value: new THREE.Vector3(0.1, 0.15, 0.08) }, // tile mean colour (set in rebake)
      }]),
      vertexShader: /* glsl */`
        attribute vec3 aPos;          // anchor: trunk base / prop origin (world)
        attribute float aSize;        // world side of the square quad (variant S × instance scale)
        attribute vec3 aTint;
        attribute vec3 aAxis;         // trunk axis (unit) — the 3D tree's parametric lean
        uniform vec4 uTile;           // u0, v0, uSpan, vSpan
        uniform float uY0n;
        uniform vec3 uSunDir;
        uniform vec3 uHemi;
        uniform vec3 uSunT;
        uniform vec3 uInvDenom;
        uniform float uG0;
        uniform float uFlat;
        varying vec2 vUv;
        varying vec3 vTint;
        varying vec3 vLit;            // per-channel view-relighting ratio (see _updateLightUniforms)
        varying float vFlat;          // sun-on gradient flatten amount (0 at the bake view)
        #include <fog_pars_vertex>
        void main () {
          vTint = aTint;
          // Cylindrical billboard around the tree's OWN trunk axis (aAxis), not world-up — the
          // 3D trees carry a parametric lean, and an upright billboard snaps visibly at the LOD
          // swap. Building the quad along the leaned axis also projects correctly: viewed along
          // the lean the tree reads near-straight, exactly like its 3D original.
          vec3 toCam = cameraPosition - aPos;
          float len = max(length(toCam.xz), 1e-4);
          vec2 fwd = toCam.xz / len;
          // Relight the baked texel for THIS view: ratio of the convex-canopy Lambert average
          // seen from here vs from the bake view. g(c) = (sinθ + (π−θ)c)/π, c = view·sun using
          // the HORIZONTAL view direction only — the quad is a cylindrical billboard and the bake
          // view is horizontal, so tilting the camera down must not inflate the ratio (a raised
          // sun already shrinks |sun.xz|, self-attenuating the azimuth swing).
          float c = clamp(dot(fwd, uSunDir.xz), -1.0, 1.0);
          float th = acos(c);
          float g = (sin(th) + (3.14159265 - th) * c) / 3.14159265;
          vLit = (uHemi + uSunT * g) * uInvDenom;
          // The baked facet pattern is the BAKE view's shading — the farther the view swings
          // toward the sun-lit face, the more wrong (too directional) that pattern is. Ramp a
          // blend toward the tile's mean colour with the same g that drives the brightness.
          vFlat = uFlat * clamp((g - uG0) / max(1.0 - uG0, 1e-3), 0.0, 1.0);
          vec3 r3 = cross(aAxis, toCam / max(length(toCam), 1e-4));
          float rl = length(r3);
          vec3 right = rl > 1e-4 ? r3 / rl : vec3(1.0, 0.0, 0.0);
          // Sun-side texture flip: the quad's local +X is ALWAYS the viewer's screen-right, so
          // the baked shading gradient would sit on the same screen side from EVERY azimuth
          // (the "fixed upper-right highlight" user report, 2026-07-19). The bake camera's right
          // is world +X, so the tile's highlight side is sign(sun.x); mirror U whenever the
          // sun's actual screen side disagrees with it, so the highlight tracks the true sun.
          // The flip snaps only when the sun crosses dead-ahead/behind, where the gradient is
          // horizontally symmetric anyway.
          float sunRight = right.x * uSunDir.x + right.z * uSunDir.z;
          float ux = mix(1.0 - uv.x, uv.x, step(0.0, sunRight * uSunDir.x));
          vUv = vec2(uTile.x + ux * uTile.z, uTile.y + uv.y * uTile.w);
          vec3 wp = aPos + right * (position.x * aSize)
                  + aAxis * ((position.y + 0.5 + uY0n) * aSize);
          // Slope de-burial: pull the quad toward the camera (horizontally) by ~20% of its size,
          // CAPPED at 2.5 m. A flat slice through the trunk axis gets depth-clipped by uphill
          // terrain on cross-slopes (a 3D canopy also enters the hill, but wraps visibly above
          // it) — trees read as sunk to the canopy. A couple of metres stands the plane clear of
          // the hillside; the old uncapped 0.2·size pulled a 31 m pine 6 m off its anchor, a
          // visible position pop at the LOD swap (headless A/B centroid shift, 2026-07-19).
          float pull = min(aSize * 0.2, 2.5);
          wp.x += fwd.x * pull;
          wp.z += fwd.y * pull;
          vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uAtlas;
        uniform vec3 uTileMean;
        varying vec2 vUv;
        varying vec3 vTint;
        varying vec3 vLit;
        varying float vFlat;
        #include <fog_pars_fragment>
        void main () {
          vec4 texel = texture2D(uAtlas, vUv);
          if (texel.a < 0.125) discard;                // kill fully-transparent texels (opaque pass)
          // Un-premultiply: the atlas clears to BLACK/alpha-0, so filtered/mip edge samples are
          // (fg·a, a) — dividing recovers the true foliage colour with no clear-colour fringe.
          vec3 rgb = texel.rgb / max(texel.a, 1e-3);
          rgb = mix(rgb, uTileMean, vFlat);            // sun-on views: soften the baked gradient
          // Screen-space alpha sharpening → alpha-to-coverage: re-narrow the filtered cutout edge
          // to ~1 px and let MSAA coverage dither it (renderer AA is on by default; without MSAA
          // this degrades to the plain cutout). Fixes the stair-stepped sprite edges.
          float aa = clamp((texel.a - 0.5) / max(fwidth(texel.a), 1e-4) + 0.5, 0.0, 1.0);
          gl_FragColor = vec4(rgb * vTint * vLit, aa);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      transparent: false,
      alphaToCoverage: true,         // smooth cutout edges via MSAA coverage (opaque pass, depth intact)
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
const _v3 = new THREE.Vector3()

function halfToFloat (n) {
  const s = (n & 0x8000) ? -1 : 1, e = (n >> 10) & 0x1f, f = n & 0x3ff
  if (e === 0) return s * f * 2 ** -24
  if (e === 31) return f ? NaN : s * Infinity
  return s * (1 + f / 1024) * 2 ** (e - 15)
}
const _c1 = new THREE.Color()
const _c2 = new THREE.Color()

/**
 * Average clamped-cosine sun response over the camera-facing hemisphere of facet normals for a
 * convex canopy, normalized to 1 when the sun is behind the camera: (sinθ + (π−θ)cosθ)/π.
 * The JS twin of the vertex-shader g(c) — keep them identical.
 */
function gWrap (c) {
  const th = Math.acos(c)
  return (Math.sin(th) + (Math.PI - th) * c) / Math.PI
}
