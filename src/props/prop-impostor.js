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
 * ATLASES (BUG-96): two render targets, one square tile per billboardable variant, baked ONCE at
 * build — the UNLIT albedo (RGBA16F) and the faceted surface NORMALS (RGBA8, the bake camera's view
 * space = world axes, so x = the tile's right, y = up, z = toward the viewer). The billboard shader
 * rebuilds each fragment's world normal from the quad's own frame and lights it LIVE with the rig's
 * Lambert terms (sun + hemisphere, the same maths the 3D trees get), so a billboard is shaded for
 * the real sun from every azimuth and at every hour, and the tile itself never changes with the
 * view. This replaced a Lambert-lit bake relit by a view ratio plus a sun-side U MIRROR, which
 * flipped the tree's silhouette (11–80 % of a tile's texels) across whole hillsides in one frame
 * whenever the sun crossed the view axis (owner 2026-10-26). Square capture region of side
 * S = max(width, height) so the quad never stretches.
 *
 * RENDER: one InstancedMesh per billboardable variant (IMPOSTOR_CATS × variants = 8 extra draw
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

const TILE_PX = 256            // px per variant tile (3×3 atlas, 768² RGBA16F = 4.7 MB + mips + a 2.4 MB depth buffer; 128 showed
                               // visible stair-step cutout edges on mid-distance trees at 1200p)
const LIT_GAIN = 1             // sun-term scale (1 = the 3D trees' own Lambert) — live-tunable via the
                               // Props GUI 'billboard sun contrast' slider (data/flora.js lod.litGain)

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
    this._rt = null              // albedo atlas
    this._nrt = null             // normal atlas (BUG-96)
    this._cols = 0
    this._rows = 0
    this._litGain = LIT_GAIN
    // BUG-133: the truck's two head spots, as uniform objects SHARED by every billboard material (one write per frame).
    // uHeadMat holds the spots' own shadow.matrix objects — three refreshes those in place at the start of each render
    // (WebGLLights.setup, for a spot with a map), so the cookie projection is never a frame late.
    const heads = lights.heads || []
    this._heads = heads
    this._headU = {
      uHeadPos: { value: [new THREE.Vector3(), new THREE.Vector3()] },
      uHeadDir: { value: [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 1)] },
      uHeadCone: { value: [new THREE.Vector2(1, 1), new THREE.Vector2(1, 1)] },     // cos(angle), cos(angle·(1 − penumbra))
      uHeadRange: { value: [new THREE.Vector2(0, 2), new THREE.Vector2(0, 2)] },    // cutoff distance, decay
      uHeadC: { value: [new THREE.Vector3(), new THREE.Vector3()] },                // colour × intensity (0 when off)
      uHeadMat: { value: [0, 1].map((i) => heads[i]?.shadow.matrix ?? new THREE.Matrix4()) },
      uHeadMap: { value: null },
    }
  }

  /**
   * BUG-133: per frame — the head spots' world pose, cone, reach and output, as three's spot light uniforms carry them,
   * so a billboard inside the beam is lit like its 3D twin (before: sun + hemisphere only, 36 % darker in the high beam).
   */
  updateHeads () {
    const U = this._headU
    for (let i = 0; i < 2; i++) {
      const s = this._heads[i]
      if (!s) { U.uHeadC.value[i].set(0, 0, 0); continue }
      s.getWorldPosition(U.uHeadPos.value[i])
      s.target.getWorldPosition(_v3)
      U.uHeadDir.value[i].copy(U.uHeadPos.value[i]).sub(_v3).normalize()
      U.uHeadCone.value[i].set(Math.cos(s.angle), Math.cos(s.angle * (1 - s.penumbra)))
      U.uHeadRange.value[i].set(s.distance, s.decay)
      const k = s.visible ? s.intensity : 0
      U.uHeadC.value[i].set(s.color.r * k, s.color.g * k, s.color.b * k)
    }
    U.uHeadMap.value = this._heads[0]?.map ?? null
  }

  /** Live sun-contrast scale (uniforms only — no rebake needed). 1 = physical. */
  setLitGain (v) {
    this._litGain = Math.max(0, v)
    this._updateLightUniforms()
  }


  /**
   * The live rig's Lambert terms (BUG-96): the shader lights each texel by its baked normal as
   * three's Lambert does — sun colour × intensity × max(n·L, 0) plus the hemisphere mixed by n.y —
   * so a billboard and its 3D original agree at every hour. `litGain` scales the sun term only.
   */
  _updateLightUniforms () {
    const sd = this._lights.sunDir
    const sun = this._lights.sun, amb = this._lights.ambient
    const dir = (sd && sd.lengthSq() > 1e-6) ? _v3.copy(sd).normalize() : _v3.set(0, 1, 0)
    const sunC = _c1.copy(sun.color).multiplyScalar(sun.intensity * this._litGain)
    for (const e of this._entries.values()) {
      if (!e.material) continue
      const u = e.material.uniforms
      u.uSunDir.value.copy(dir)
      u.uSunC.value.set(sunC.r, sunC.g, sunC.b)
      u.uSkyC.value.set(amb.color.r * amb.intensity, amb.color.g * amb.intensity, amb.color.b * amb.intensity)
      u.uGndC.value.set(amb.groundColor.r * amb.intensity, amb.groundColor.g * amb.intensity, amb.groundColor.b * amb.intensity)
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
    this._nrt = new THREE.WebGLRenderTarget(this._cols * TILE_PX, this._rows * TILE_PX, {
      depthBuffer: true, stencilBuffer: false,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, type: THREE.UnsignedByteType, generateMipmaps: true,
    })
    this._nrt.texture.colorSpace = THREE.NoColorSpace
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
    this._bake()
    this._updateLightUniforms()
    if (typeof window !== 'undefined') window.__impAtlasStats = () => this.atlasStats()   // CDP debug handle
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

  /** Sky look changed: the atlases are light-free (BUG-96), so only the lighting uniforms move. */
  rebake () { if (this._rt) this._updateLightUniforms() }

  /** Render every variant tile into both atlases — the unlit albedo, then the faceted normals. Once, at build. */
  _bake () {
    const r = this._renderer
    const scene = new THREE.Scene()
    const albedo = new THREE.MeshBasicMaterial({ vertexColors: true })
    const normals = new THREE.MeshNormalMaterial({ flatShading: true })   // faceted, like the 3D trees (ART-STYLE)
    const holder = new THREE.Mesh(undefined, albedo)
    scene.add(holder)

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
      for (const [rt, mat] of [[this._rt, albedo], [this._nrt, normals]]) {
        holder.material = mat
        rt.viewport.set(px, py, TILE_PX, TILE_PX)  // raw px — rt state, not renderer.setViewport
        rt.scissor.set(px, py, TILE_PX, TILE_PX)
        rt.scissorTest = true
        r.setRenderTarget(rt)
        r.render(scene, cam)
      }
    }

    r.setClearColor(prevClear, prevClearA)
    r.setRenderTarget(prevTarget)
    albedo.dispose()
    normals.dispose()
  }

  _makeBillboardMaterial (uTile, y0n) {
    const material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uAtlas: { value: null },      // bound lazily below (merge() would clone the texture ref)
        uNrm: { value: null },        // BUG-96: the normal atlas, bound with it
        uTile: { value: uTile },
        uY0n: { value: y0n },         // capture-bottom offset ÷ S (see build()) — exact vertical anchor
        // The live rig's Lambert terms (_updateLightUniforms):
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunC: { value: new THREE.Vector3(0, 0, 0) },    // sun colour × intensity × litGain
        uSkyC: { value: new THREE.Vector3(1, 1, 1) },    // hemisphere sky colour × intensity
        uGndC: { value: new THREE.Vector3(0, 0, 0) },    // hemisphere ground colour × intensity
      }]),
      vertexShader: /* glsl */`
        attribute vec3 aPos;          // anchor: trunk base / prop origin (world)
        attribute float aSize;        // world side of the square quad (variant S × instance scale)
        attribute vec3 aTint;
        attribute vec3 aAxis;         // trunk axis (unit) — the 3D tree's parametric lean
        uniform vec4 uTile;           // u0, v0, uSpan, vSpan
        uniform float uY0n;
        varying vec2 vUv;
        varying vec3 vTint;
        varying vec3 vRight;          // the quad's frame in world space — the baked normal's x, y, z axes
        varying vec3 vUp;
        varying vec3 vBack;
        varying vec3 vWorld;          // BUG-133: the headlight term needs the fragment's world position
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
          vec3 r3 = cross(aAxis, toCam / max(length(toCam), 1e-4));
          float rl = length(r3);
          vec3 right = rl > 1e-4 ? r3 / rl : vec3(1.0, 0.0, 0.0);
          // BUG-96: no sun-side U mirror — the tile is the same from every azimuth (it is light-free);
          // the fragment shader shades it for the real sun from its baked normals in this frame.
          vRight = right;
          vUp = aAxis;
          vBack = cross(right, aAxis);
          vUv = vec2(uTile.x + uv.x * uTile.z, uTile.y + uv.y * uTile.w);
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
          vWorld = wp;
          vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uAtlas;
        uniform sampler2D uNrm;
        uniform vec3 uSunDir;
        uniform vec3 uSunC;
        uniform vec3 uSkyC;
        uniform vec3 uGndC;
        varying vec2 vUv;
        varying vec3 vTint;
        varying vec3 vRight;
        varying vec3 vUp;
        varying vec3 vBack;
        varying vec3 vWorld;
        uniform vec3 uHeadPos[2];
        uniform vec3 uHeadDir[2];
        uniform vec2 uHeadCone[2];
        uniform vec2 uHeadRange[2];
        uniform vec3 uHeadC[2];
        uniform mat4 uHeadMat[2];
        uniform sampler2D uHeadMap;
        #include <fog_pars_fragment>
        void main () {
          vec4 texel = texture2D(uAtlas, vUv);
          if (texel.a < 0.125) discard;                // kill fully-transparent texels (opaque pass)
          // Un-premultiply: the atlas clears to BLACK/alpha-0, so filtered/mip edge samples are
          // (fg·a, a) — dividing recovers the true foliage colour with no clear-colour fringe.
          vec3 rgb = texel.rgb / max(texel.a, 1e-3);
          // BUG-96: the baked normal (same un-premultiply), into world space through the quad's frame,
          // lit as three's Lambert lights the 3D trees: (sun·max(n·L, 0) + hemisphere(n.y)) / π.
          vec4 nt = texture2D(uNrm, vUv);
          vec3 nb = nt.rgb / max(nt.a, 1e-3) * 2.0 - 1.0;
          vec3 n = normalize(vRight * nb.x + vUp * nb.y + vBack * nb.z);
          vec3 irr = uSunC * max(dot(n, uSunDir), 0.0) + mix(uGndC, uSkyC, 0.5 * n.y + 0.5);
          // BUG-133: the truck's head spots, as three lights the 3D trees (lights_pars_begin + lights_fragment_begin):
          // smoothstep cone, the physical distance falloff with its cutoff window, the beam cookie through the spot's
          // own projection, Lambert against the rebuilt normal.
          for (int i = 0; i < 2; i++) {
            if (dot(uHeadC[i], uHeadC[i]) == 0.0) continue;   // lamps off: a uniform branch, the whole draw skips it
            vec3 lv = uHeadPos[i] - vWorld;
            float dist = length(lv);
            vec3 L = lv / max(dist, 1e-4);
            float cone = smoothstep(uHeadCone[i].x, uHeadCone[i].y, dot(L, uHeadDir[i]));
            if (cone <= 0.0) continue;
            float fall = 1.0 / max(pow(dist, uHeadRange[i].y), 0.01);
            if (uHeadRange[i].x > 0.0) { float r = dist / uHeadRange[i].x; float w = clamp(1.0 - r * r * r * r, 0.0, 1.0); fall *= w * w; }
            vec4 sc = uHeadMat[i] * vec4(vWorld, 1.0);
            vec3 c3 = sc.xyz / sc.w;
            vec3 cookie = all(lessThan(abs(c3 * 2.0 - 1.0), vec3(1.0))) ? texture2D(uHeadMap, c3.xy).rgb : vec3(1.0);
            irr += uHeadC[i] * cookie * (cone * fall * max(dot(n, L), 0.0));
          }
          // Screen-space alpha sharpening → alpha-to-coverage: re-narrow the filtered cutout edge
          // to ~1 px and let MSAA coverage dither it (renderer AA is on by default; without MSAA
          // this degrades to the plain cutout). Fixes the stair-stepped sprite edges.
          float aa = clamp((texel.a - 0.5) / max(fwidth(texel.a), 1e-4) + 0.5, 0.0, 1.0);
          gl_FragColor = vec4(rgb * vTint * irr * 0.31830989, aa);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      transparent: false,
      alphaToCoverage: true,         // smooth cutout edges via MSAA coverage (opaque pass, depth intact)
      fog: true,
      side: THREE.DoubleSide,        // quad must read from both sides while it swings to face the camera
    })
    Object.assign(material.uniforms, this._headU)   // BUG-133: shared, not merged (merge() would clone them per material)
    return material
  }

  /** Bind the atlas into a billboard material (call after build(); kept out of merge()'s clone). */
  bindAtlas (material) { material.uniforms.uAtlas.value = this._rt.texture; material.uniforms.uNrm.value = this._nrt.texture }

  dispose () {
    if (this._rt) this._rt.dispose()
    if (this._nrt) this._nrt.dispose()
    for (const e of this._entries.values()) if (e.material) e.material.dispose()
    this._entries.clear()
  }
}

const _v3 = new THREE.Vector3()

const _c1 = new THREE.Color()
