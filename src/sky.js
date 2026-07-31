/**
 * src/sky.js — QUAL-02 atmospheric skybox + time-of-day lighting.
 *
 * Wraps three/addons Sky (Preetham-style atmospheric scattering shader — procedural, NO textures,
 * iGPU-safe, fits the no-asset / GitHub-Pages constraint). The whole lighting rig (sky shader, the
 * directional key light, the hemisphere fill, fog colour, exposure) is driven from ONE "look" object.
 *
 * LOOKS ARE KEYFRAMES. A look is a full set of authored values (sun + light directions, atmosphere,
 * light colours/intensities, fog). SKY_PRESETS holds the four named scenes (night/morning/day/
 * evening); SKY_PARAMS is the live working copy the GUI edits. The day/night cycle is just "blend
 * between the two presets bracketing the current hour" (setTimeOfDay) — so authoring the four looks
 * and sweeping their params IS the cycle. Use addGui()'s "log look JSON" to dump a tuned look back
 * into SKY_PRESETS.
 *
 * SKY-SUN vs KEY-LIGHT are decoupled on purpose. The Sky shader only models the sun, so NIGHT needs
 * the sky-sun BELOW the horizon (dark sky) while the directional light comes from a separate "moon"
 * direction ABOVE it (dim, cool). Hence a look carries both (elevation/azimuth for the sky, lightEl/
 * lightAz for the key light + shadows). For day looks the two coincide. main.js reads sunDirection
 * (the KEY-LIGHT direction) for the shadow-follow.
 *
 * The Sky mesh follows the camera each frame (update()) so its finite box always surrounds the view;
 * the shader pins fragments to the far plane (gl_Position.z = w), so it reads as infinite regardless
 * of box size or camera.far (we keep far=1000 for road-decal depth precision — do not bump it).
 *
 * PERF-21 BAKED MODE (default): the Preetham shader is a full-screen per-frame fragment cost — every
 * sky pixel evaluates the whole scattering model even though the look only changes on preset/cycle
 * edits. Baked mode renders the Sky mesh ONCE per look change into an HDR (HalfFloat) cubemap and
 * sets it as scene.background: the per-frame cost drops to one cube-texture fetch per sky pixel.
 * Rendering to a target skips renderer tone mapping (three gates it on render-to-canvas), so the
 * cubemap stores linear HDR and the background pass applies the same ACES + exposure as the live
 * mesh — the two modes match except for cubemap resolution (the ~0.5° sun disc spans ~3 texels at
 * 512/face; bump bakeRes, or switch to live mode, if a crisp disc matters — tier-wireable).
 *
 * TONE MAPPING: the Sky shader output is HDR and includes <tonemapping_fragment>, so it needs renderer
 * tone mapping or it clips to white. We enable ACESFilmicToneMapping; this applies to the WHOLE scene,
 * so the per-look light intensities are authored brighter than the pre-tone-mapping FEAT-05 values.
 *
 * Fog DENSITY stays owned by the draw-distance presets (main.js PERF-03). A look only sets fog COLOUR
 * — preserving the FEAT-05 invariant that the horizon haze matches the sky (no hard band).
 */
import * as THREE from 'three'
import { Sky } from 'three/addons/objects/Sky.js'

// A "look" — every field is a keyframe-able parameter. Angles in degrees; colours as hex ints
// (lil-gui addColor binds ints directly). elevation/azimuth = SKY-sun (drives the shader); lightEl/
// lightAz = KEY-LIGHT direction (directional light + shadows; a "moon" at night, the sun by day).
const LOOK_FIELDS = [
  'elevation', 'azimuth', 'lightEl', 'lightAz',
  'turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG', 'exposure',
  'sunColor', 'sunIntensity', 'hemiSky', 'hemiGround', 'hemiIntensity', 'fogColor',
]

// The four named scenes. Starting points to SWEEP — tune in-GUI, then "log look JSON" to paste back.
//
// fogColor IS A RADIANCE VALUE, like sunIntensity — NOT the colour you will see on screen. It is now
// tone-mapped (ACES × exposure) before it reaches the renderer, exactly like every surface it blends
// over; see SkySystem._applyFogColor for why that had to change. Consequence: these four numbers were
// re-authored when the pipeline was fixed. morning/day/evening are the exact radiances that reproduce
// their previously-shipped DISPLAYED fog (they were tuned to match the sky horizon — the FEAT-05
// "no hard band" invariant — so their on-screen result had to be preserved to the byte). `night` was
// NOT preserved: its old value was tuned in the broken pipeline, where fog alone ignored the night
// exposure drop, which is precisely the "fog is bright at night" bug. It is authored fresh.
export const SKY_PRESETS = {
  morning: {
    elevation: 11, azimuth: 95, lightEl: 11, lightAz: 95,
    turbidity: 6, rayleigh: 2.6, mieCoefficient: 0.006, mieDirectionalG: 0.86, exposure: 0.46,
    sunColor: 0xffd6a0, sunIntensity: 3.4, hemiSky: 0xbcc6d4, hemiGround: 0x4f463e,
    hemiIntensity: 1.05, fogColor: 0xffeebe,   // radiance; displays as the shipped 0xc9b79a
  },
  day: {
    elevation: 55, azimuth: 145, lightEl: 55, lightAz: 145,
    turbidity: 5, rayleigh: 2.0, mieCoefficient: 0.005, mieDirectionalG: 0.8, exposure: 0.5,
    sunColor: 0xfff5e8, sunIntensity: 4.8, hemiSky: 0xaccadc, hemiGround: 0x5b5048,
    hemiIntensity: 1.5, fogColor: 0xb5e8ff,    // radiance; displays as the shipped 0x9bb8d4
  },
  evening: {
    elevation: 7, azimuth: 255, lightEl: 7, lightAz: 255,
    turbidity: 8, rayleigh: 2.9, mieCoefficient: 0.007, mieDirectionalG: 0.9, exposure: 0.46,
    sunColor: 0xff8a4d, sunIntensity: 3.0, hemiSky: 0xb9a0a8, hemiGround: 0x4a3f3a,
    hemiIntensity: 0.9, fogColor: 0xffc9a8,    // radiance; displays as the shipped 0xcf9f86
  },
  night: {
    elevation: -8, azimuth: 300,          // sky-sun below horizon → dark sky
    lightEl: 42, lightAz: 210,            // "moon" up and to the side → cool key + real shadows
    turbidity: 3, rayleigh: 1.2, mieCoefficient: 0.003, mieDirectionalG: 0.8, exposure: 0.36,
    // Ambient moonlight: the hemisphere fill is what keeps unlit slopes from going to pure black now
    // that the fog no longer (wrongly) lifts the whole distance. Raised from 0.45/0x2a3a55 — with the
    // fog fix in, the old values left the night a silhouette rather than a moonlit landscape.
    sunColor: 0x7488b0, sunIntensity: 0.7, hemiSky: 0x35486b, hemiGround: 0x181c26,
    // Fog must land near the SKY it blends into or distant terrain reads as a lit haze against a
    // black sky — the FEAT-05 no-hard-band invariant, and the "distant objects glow" report.
    // The night sky renders essentially (0,0,0); as a RADIANCE this displays ~(2,5,17), a bare
    // hint of blue. Measured, not guessed: at 0x3a4a70 the ground saturated to a flat (14,26,53)
    // everywhere while the sky was (0,0,0) — a 3× step with no distance cue in it at all.
    hemiIntensity: 0.75, fogColor: 0x1d2740,   // radiance, RE-AUTHORED (see the note above)
  },
}

// Live working look — what the GUI edits and the system applies. Starts on a clone of `day`.
export const SKY_PARAMS = { ...SKY_PRESETS.day }

// Day/night cycle: hour-of-day keyframes (0..24, wrapping). setTimeOfDay(h) blends the two presets
// bracketing h. dayLengthSec = real seconds for a full 24 h when `playing` (advanced in update()).
export const SKY_CYCLE = {
  playing: false,
  hour: 12,
  dayLengthSec: 120,
  // Sorted by hour; first/last must be the same look so the wrap (24→0) is seamless.
  //
  // The REPEATED `night` entries are load-bearing, not redundant. setTimeOfDay blends the two
  // keyframes bracketing the hour, so with the old four-point table (night 0 / morning 6 / day 12 /
  // evening 18 / night 24) every single hour was a blend and NO hour was actually the night look:
  // 23:00 was still 17 % evening, which is why the small hours carried a warm dusk haze — half of
  // the "fog is bright at night" report. A repeated preset makes that span flat, so dusk finishes
  // at 20:00 and dawn starts at 04:00 and the hours between are genuinely `night`.
  // Dusk is deliberately SHORT (2 h). fogColor lerps linearly but the sky's brightness falls off
  // a cliff as the sun crosses the horizon, so any long evening→night ramp spends its middle
  // with fog much brighter than the sky behind it. Keeping the window narrow bounds that.
  keyframes: [
    { hour: 0,  preset: 'night' },
    { hour: 4,  preset: 'night' },      // flat night 00:00–04:00
    { hour: 7,  preset: 'morning' },    // dawn 04:00–07:00
    { hour: 12, preset: 'day' },
    { hour: 18, preset: 'evening' },
    { hour: 20, preset: 'night' },      // dusk 18:00–20:00
    { hour: 24, preset: 'night' },      // flat night 20:00–24:00
  ],
}

const _scratchA = new THREE.Color()
const _scratchB = new THREE.Color()
const _scratchFog = new THREE.Color()
const _scratchLight = new THREE.Color()

/**
 * ACES filmic tone map, ported EXACTLY from three's tonemapping_pars_fragment (r184). Operates on a
 * linear working-space colour in place. Kept byte-faithful to the GLSL — if the two drift, the fog
 * stops matching the surfaces it blends into, which is precisely the bug this exists to fix.
 */
function acesToneMap (c, exposure) {
  const e = exposure / 0.6
  let r = c.r * e, g = c.g * e, b = c.b * e
  // sRGB → AP1 (RRT_SAT)
  let x = 0.59719 * r + 0.35458 * g + 0.04823 * b
  let y = 0.07600 * r + 0.90834 * g + 0.01566 * b
  let z = 0.02840 * r + 0.13383 * g + 0.83777 * b
  const fit = (v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081)
  x = fit(x); y = fit(y); z = fit(z)
  // AP1 → sRGB (ODT_SAT)
  r =  1.60475 * x - 0.53108 * y - 0.07367 * z
  g = -0.10208 * x + 1.10813 * y - 0.00605 * z
  b = -0.00327 * x - 0.07276 * y + 1.07602 * z
  const s = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
  return c.setRGB(s(r), s(g), s(b), THREE.LinearSRGBColorSpace)
}

/**
 * Unlit-particle irradiance model (dust / tire smoke / dirt spray). Those three systems draw with
 * plain textured ShaderMaterials — no lights, no normals — so their albedo is whatever the texture
 * says regardless of the hour. Tone mapping alone barely touches them (ACES at the night exposure
 * 0.36 vs day 0.5 is only ~25 % darker), which is why at night they read as glowing white blobs
 * hanging in a black world. SkySystem.particleLight() hands them a linear RGB multiplier derived
 * from the ACTIVE look's key + hemisphere lights, normalised so the `day` look is exactly 1.0 (so
 * the shipped daytime look is untouched).
 *
 * gamma < 1 compresses the range: raw irradiance at night is ~2 % of noon, which would make dust
 * effectively invisible rather than merely dim. floor keeps a sliver of visibility on the darkest
 * look — kicked-up dust is a gameplay read (traction), not only a decoration.
 */
export const PARTICLE_LIGHT = {
  keyWeight: 0.5, hemiWeight: 0.5,
  gamma: 0.8, floor: 0.02,       // COLOUR curve
  alphaGamma: 1.0, alphaFloor: 0.0,  // OPACITY curve — see particleAlpha
}

/** Raw (un-normalised) linear irradiance estimate for a look. Shared by the live value + the norm. */
function rawIrradiance (look, out) {
  const key = _scratchA.setHex(look.sunColor).multiplyScalar(look.sunIntensity * PARTICLE_LIGHT.keyWeight)
  const hemi = _scratchB.setHex(look.hemiSky).multiplyScalar(look.hemiIntensity * PARTICLE_LIGHT.hemiWeight)
  return out.setRGB(key.r + hemi.r, key.g + hemi.g, key.b + hemi.b, THREE.LinearSRGBColorSpace)
}

// Pre-compensation for the baked ground-fill disc. The background pass tone-maps (ACES × exposure)
// what the bake stored linearly. Now that scene.fog carries an ALREADY tone-mapped colour (see
// _applyFogColor), the disc and the fog agree when the disc is baked with the raw authored colour —
// both end up as ACES(authored × exposure). The old eyeballed 2.2 lift existed only to paper over
// the untone-mapped fog it had to sit next to; that mismatch is fixed at the root, so it is gone.
const GROUND_FILL_LIFT = 1.0

/** Direction (origin→point) on the unit sphere from elevation/azimuth degrees, written into `out`. */
function dirFromAngles (elevationDeg, azimuthDeg, out) {
  const phi = THREE.MathUtils.degToRad(90 - elevationDeg)   // polar from +Y
  const theta = THREE.MathUtils.degToRad(azimuthDeg)
  return out.setFromSphericalCoords(1, phi, theta)
}

export class SkySystem {
  /**
   * @param {{ scene: THREE.Scene, renderer: THREE.WebGLRenderer, sun: THREE.DirectionalLight,
   *           ambient: THREE.HemisphereLight }} deps
   *   sun/ambient are the lights already in the scene; we drive them from the active look. scene.fog
   *   (FogExp2) is recoloured but its density is left to main.js. renderer gets ACES tone mapping.
   */
  constructor ({ scene, renderer, sun, sunFar, farSplit = 0, ambient }) {
    this.scene = scene
    this.renderer = renderer
    this.sun = sun
    // Optional terrain-shadow cascade (main.js `sunFar`). Shares the key light's colour; the look's
    // authored sunIntensity is SPLIT between the two so the pair sums to it — adding the cascade
    // must not change how bright the scene is, only what casts shadows at what scale.
    this.sunFar = sunFar ?? null
    this.farSplit = this.sunFar ? farSplit : 0
    this.ambient = ambient
    this.sunDirection = new THREE.Vector3()   // KEY-LIGHT dir; main.js reads it for the shadow-follow
    this._skySunDir = new THREE.Vector3()     // SKY-sun dir (shader); separate so night can differ
    this._controllers = []                    // GUI controllers to refreshDisplay() after programmatic edits
    this._lastTime = (typeof performance !== 'undefined') ? performance.now() : 0

    renderer.toneMapping = THREE.ACESFilmicToneMapping

    this.sky = new Sky()
    this.sky.scale.setScalar(900)             // fits inside camera.far=1000 (corner 779 m); follows camera
    this.sky.frustumCulled = false            // it's always at the camera; never cull it
    scene.background = null                    // live mode: the Sky mesh is the background

    // PERF-21 baked mode (see header). The Sky mesh lives in a private scene; a CubeCamera bakes it
    // into an HDR cubemap on look change, which becomes scene.background. Lazy-allocated in _bakeSky.
    this._mode = 'baked'                       // 'baked' | 'live'
    this._bakeRes = 512                        // px per cube face (VRAM: 6·res²·8 B — 512 → 12.6 MB)
    this._bakeScene = new THREE.Scene()
    this._cubeRT = null
    this._cubeCam = null
    if (this._mode === 'baked') this._bakeScene.add(this.sky)
    else scene.add(this.sky)

    this.apply()                               // push SKY_PARAMS (the `day` clone) into the scene
  }

  /** 'baked' (default — one cubemap bake per look change) or 'live' (per-frame Preetham shader). */
  setMode (mode) {
    if (mode !== 'baked' && mode !== 'live') return
    if (mode === this._mode) return
    this._mode = mode
    if (mode === 'baked') {
      this.scene.remove(this.sky)
      this._bakeScene.add(this.sky)
      this.sky.position.set(0, 0, 0)
      this._bakeSky()
    } else {
      this._bakeScene.remove(this.sky)
      this.scene.add(this.sky)
      this.scene.background = null
    }
  }

  /** Cube-face resolution for baked mode (crisper sun disc ↔ more VRAM). Rebakes when baked. */
  setBakeRes (px) {
    px = Math.max(64, Math.round(px) || 0)
    if (px === this._bakeRes) return
    this._bakeRes = px
    if (this._cubeRT) { this._cubeRT.dispose(); this._cubeRT = null; this._cubeCam = null }
    if (this._mode === 'baked') this._bakeSky()
  }

  /** Render the Sky mesh into the background cubemap (linear HDR — see header re tone mapping). */
  _bakeSky () {
    if (!this._cubeRT) {
      this._cubeRT = new THREE.WebGLCubeRenderTarget(this._bakeRes, {
        type: THREE.HalfFloatType, generateMipmaps: false,
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      })
      this._cubeCam = new THREE.CubeCamera(0.1, 3000, this._cubeRT)
      this._bakeScene.add(this._cubeCam)
      // Below-horizon ground fill (user call 2026-07-17): the Preetham shader renders the lower
      // hemisphere as dark void, so from any height the world reads as a floating tile against
      // sky. A huge fog-coloured disc in the BAKE scene paints the below-horizon background as
      // misty ground — no scene geometry, no camera.far interaction, always behind real terrain.
      // Radius ≫ depth keeps the gap between disc edge and true horizon under ~0.1°.
      this._groundFill = new THREE.Mesh(
        new THREE.CircleGeometry(2900, 48).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      )
      this._groundFill.position.y = -5
      this._bakeScene.add(this._groundFill)
    }
    // Match the fully-fogged terrain the disc extends: fog colour, lifted for the ACES + exposure
    // the background pass applies (the scene fog itself is mixed POST-tone-mapping, so the baked
    // disc needs pre-compensation to land near the same displayed colour).
    this._groundFill.material.color.setHex(SKY_PARAMS.fogColor).multiplyScalar(GROUND_FILL_LIFT)
    this._cubeCam.update(this.renderer, this._bakeScene)
    this.scene.background = this._cubeRT.texture
  }

  /** Push the entire active look (SKY_PARAMS) into the sky shader, lights, fog and exposure. */
  apply () {
    const p = SKY_PARAMS
    const u = this.sky.material.uniforms
    u.turbidity.value = p.turbidity
    u.rayleigh.value = p.rayleigh
    u.mieCoefficient.value = p.mieCoefficient
    u.mieDirectionalG.value = p.mieDirectionalG

    dirFromAngles(p.elevation, p.azimuth, this._skySunDir)
    u.sunPosition.value.copy(this._skySunDir)

    dirFromAngles(p.lightEl, p.lightAz, this.sunDirection)   // key-light + shadow direction

    this.sun.color.setHex(p.sunColor)
    this.sun.intensity = p.sunIntensity * (1 - this.farSplit)
    if (this.sunFar) {
      this.sunFar.color.setHex(p.sunColor)
      this.sunFar.intensity = p.sunIntensity * this.farSplit
    }
    this.ambient.color.setHex(p.hemiSky)
    this.ambient.groundColor.setHex(p.hemiGround)
    this.ambient.intensity = p.hemiIntensity
    this._applyFogColor()
    this.renderer.toneMappingExposure = p.exposure
    if (this._mode === 'baked') this._bakeSky()   // PERF-21: look changed → refresh the cubemap
    if (this.onLookApplied) this.onLookApplied()  // PERF-21: consumers with look-baked assets (prop impostors)
  }

  /**
   * THE FOG-BRIGHTNESS FIX. three r184 orders the fragment chunks tonemapping → colorspace → fog
   * (see meshphong.glsl.js), so `fogColor` is mixed into an ALREADY tone-mapped, already sRGB-encoded
   * pixel. Every surface in the scene therefore goes through ACES × toneMappingExposure and the fog
   * that blends over it does not. By day that is invisible (exposure 0.5, fog authored to match).
   * At night exposure drops to 0.36 and the entire world darkens ~3× while the fog colour lands
   * untouched — the ground washes out to a bright haze under a black sky.
   *
   * Fix at the root rather than by re-authoring the night fog darker (which would only move the
   * error to the dusk/dawn blends): tone-map the AUTHORED colour here, with three's own curve, and
   * hand the renderer the already-mapped result. `fogColor` in a look keeps meaning "scene radiance",
   * so it stays comparable to the light intensities beside it and stays correct at every hour.
   *
   * three re-encodes fog.color to the output colour space itself (WebGLMaterials → getRGB with the
   * unlit uniform colour space), so what we store must be the tone-mapped value in LINEAR working
   * space — hence setRGB(..., LinearSRGBColorSpace) inside acesToneMap.
   */
  _applyFogColor () {
    if (!this.scene.fog) return
    _scratchFog.setHex(SKY_PARAMS.fogColor)
    this.scene.fog.color.copy(acesToneMap(_scratchFog, SKY_PARAMS.exposure))
  }

  /**
   * Normalise against `day`'s luminance so both particle curves are pure day-relative dimmers (and
   * the look's colour CAST — cool at night, warm at dawn — survives). Computed once; it depends only
   * on the `day` preset. Kept separate because it borrows the same module scratch colours as
   * rawIrradiance, so callers must seed it BEFORE filling their own value.
   */
  _ensureParticleNorm () {
    if (this._particleNorm) return
    const d = rawIrradiance(SKY_PRESETS.day, _scratchLight)
    this._particleNorm = 1 / Math.max(1e-6, 0.2126 * d.r + 0.7152 * d.g + 0.0722 * d.b)
  }

  /**
   * Linear RGB multiplier for the unlit particle systems (see PARTICLE_LIGHT). 1.0 on the `day`
   * look by construction, so daytime dust is bit-identical to what shipped.
   */
  particleLight (out) {
    this._ensureParticleNorm()
    rawIrradiance(SKY_PARAMS, out)
    const { gamma, floor } = PARTICLE_LIGHT
    const f = (v) => Math.min(1, floor + (1 - floor) * Math.pow(Math.max(0, v * this._particleNorm), gamma))
    return out.setRGB(f(out.r), f(out.g), f(out.b), THREE.LinearSRGBColorSpace)
  }

  /**
   * OPACITY multiplier for the same three systems, on the same day-relative scale (1.0 on `day`).
   *
   * Dimming only the colour is not enough: it turns a white puff into a GREY puff, and a grey puff
   * against a near-black night road is still perfectly legible. Unlit smoke in the dark should be
   * close to absent, so the alpha has to fall too. Colour × alpha compounds, so the two curves are
   * deliberately gentler than the single aggressive one they replace.
   */
  particleAlpha () {
    this._ensureParticleNorm()      // MUST precede rawIrradiance — it uses the same scratch colours
    const c = rawIrradiance(SKY_PARAMS, _scratchLight)
    const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
    const { alphaGamma, alphaFloor } = PARTICLE_LIGHT
    return Math.min(1, alphaFloor + (1 - alphaFloor) *
      Math.pow(Math.max(0, lum * this._particleNorm), alphaGamma))
  }

  /**
   * Load a named preset into the live look and apply it. Also moves SKY_CYCLE.hour to that preset's
   * keyframe, so the hour slider (and anything else reading the clock) agrees with what is on screen
   * — otherwise clicking "night" left the cycle reading 12:00 and the very next scrub of the hour
   * slider snapped straight back to `day`.
   */
  applyPreset (name) {
    const preset = SKY_PRESETS[name]
    if (!preset) return
    Object.assign(SKY_PARAMS, preset)
    const kf = SKY_CYCLE.keyframes.find(k => k.preset === name)
    if (kf) SKY_CYCLE.hour = kf.hour % 24
    this.apply()
    this._refreshGui()
  }

  /**
   * Blend the two cycle keyframes bracketing `hour` (0..24, wraps) into the live look and apply.
   * This is the day/night cycle's single entry point.
   */
  setTimeOfDay (hour) {
    SKY_CYCLE.hour = ((hour % 24) + 24) % 24
    const kf = SKY_CYCLE.keyframes
    let i = 0
    while (i < kf.length - 1 && SKY_CYCLE.hour >= kf[i + 1].hour) i++
    const a = SKY_PRESETS[kf[i].preset]
    const b = SKY_PRESETS[kf[i + 1].preset]
    const span = kf[i + 1].hour - kf[i].hour
    const t = span > 0 ? (SKY_CYCLE.hour - kf[i].hour) / span : 0
    this._blendLooks(a, b, t)
    this.apply()
    this._refreshGui()
  }

  /** Interpolate two looks into SKY_PARAMS: angles/scalars linearly, colours in RGB. */
  _blendLooks (a, b, t) {
    for (const k of LOOK_FIELDS) {
      if (k === 'sunColor' || k === 'hemiSky' || k === 'hemiGround' || k === 'fogColor') {
        SKY_PARAMS[k] = _scratchA.setHex(a[k]).lerp(_scratchB.setHex(b[k]), t).getHex()
      } else {
        SKY_PARAMS[k] = THREE.MathUtils.lerp(a[k], b[k], t)
      }
    }
  }

  /**
   * Per-frame: keep the sky box on the camera; advance the cycle if playing. Uses its own wall-clock
   * delta (decoupled from the physics timestep) so a paused sim doesn't freeze the sky.
   */
  update (cameraPosition) {
    if (this._mode === 'live') this.sky.position.copy(cameraPosition)   // baked: background is view-independent
    const now = (typeof performance !== 'undefined') ? performance.now() : this._lastTime
    const dtSec = Math.min(0.1, (now - this._lastTime) / 1000)   // clamp tab-switch hitches
    this._lastTime = now
    if (SKY_CYCLE.playing && SKY_CYCLE.dayLengthSec > 0) {
      this.setTimeOfDay(SKY_CYCLE.hour + dtSec * (24 / SKY_CYCLE.dayLengthSec))
    }
  }

  /**
   * Day/night factor in [0,1] for consumers that need to react to darkness (e.g. vehicle headlights).
   * 0 = full daylight, 1 = night. Ramps as the SKY-sun drops through the horizon (elev 4° → -6°),
   * so it tracks the cycle's dusk/dawn blend. Static day (no cycle) returns 0.
   */
  nightFactor () {
    return THREE.MathUtils.clamp((4 - SKY_PARAMS.elevation) / 10, 0, 1)
  }

  _refreshGui () { for (const c of this._controllers) c.updateDisplay() }

  /** Self-contained lil-gui folder (mirrors prop-debug.js — attaches to the existing panel). */
  addGui (gui) {
    const f = gui.addFolder('Sky / Lighting (QUAL-02)')
    f.close()
    const reapply = () => this.apply()

    // PERF-21: baked-vs-live sky + cubemap res (see header). Live = per-frame Preetham shader.
    const perf = { baked: this._mode === 'baked', res: this._bakeRes }
    f.add(perf, 'baked').name('baked sky (perf)').onChange(v => this.setMode(v ? 'baked' : 'live'))
    f.add(perf, 'res', [256, 512, 1024]).name('sky bake res').onChange(r => this.setBakeRes(r))

    // Scene preset buttons — load a named look to view / start tuning it.
    const presets = f.addFolder('Scene presets'); presets.close()
    const jump = {
      morning: () => this.applyPreset('morning'), day: () => this.applyPreset('day'),
      evening: () => this.applyPreset('evening'), night: () => this.applyPreset('night'),
    }
    presets.add(jump, 'morning'); presets.add(jump, 'day')
    presets.add(jump, 'evening'); presets.add(jump, 'night')

    // Day/night cycle — scrub the hour or play it.
    const cyc = f.addFolder('Cycle'); cyc.close()
    cyc.add(SKY_CYCLE, 'playing').name('play')
    this._controllers.push(cyc.add(SKY_CYCLE, 'hour', 0, 24, 0.01).name('hour').onChange(h => this.setTimeOfDay(h)))
    cyc.add(SKY_CYCLE, 'dayLengthSec', 5, 600, 1).name('day length (s)')

    // Live look sliders — edit the working look and re-apply. Sweep here, then export below.
    const c = (ctrl) => { this._controllers.push(ctrl); return ctrl }
    const sun = f.addFolder('Sun / sky'); sun.close()
    c(sun.add(SKY_PARAMS, 'elevation', -20, 90, 0.5).name('sky sun elev').onChange(reapply))
    c(sun.add(SKY_PARAMS, 'azimuth', 0, 360, 1).name('sky sun azim').onChange(reapply))
    c(sun.add(SKY_PARAMS, 'lightEl', -20, 90, 0.5).name('key-light elev').onChange(reapply))
    c(sun.add(SKY_PARAMS, 'lightAz', 0, 360, 1).name('key-light azim').onChange(reapply))
    c(sun.add(SKY_PARAMS, 'turbidity', 0, 20, 0.1).name('turbidity').onChange(reapply))
    c(sun.add(SKY_PARAMS, 'rayleigh', 0, 4, 0.01).name('rayleigh').onChange(reapply))
    c(sun.add(SKY_PARAMS, 'mieCoefficient', 0, 0.1, 0.001).name('mie coeff').onChange(reapply))
    c(sun.add(SKY_PARAMS, 'mieDirectionalG', 0, 1, 0.01).name('mie g').onChange(reapply))
    c(sun.add(SKY_PARAMS, 'exposure', 0.1, 1.5, 0.01).name('exposure').onChange(reapply))

    const lights = f.addFolder('Lights / fog'); lights.close()
    c(lights.addColor(SKY_PARAMS, 'sunColor').name('key colour').onChange(reapply))
    c(lights.add(SKY_PARAMS, 'sunIntensity', 0, 8, 0.05).name('key intensity').onChange(reapply))
    c(lights.addColor(SKY_PARAMS, 'hemiSky').name('hemi sky').onChange(reapply))
    c(lights.addColor(SKY_PARAMS, 'hemiGround').name('hemi ground').onChange(reapply))
    c(lights.add(SKY_PARAMS, 'hemiIntensity', 0, 3, 0.01).name('hemi intensity').onChange(reapply))
    c(lights.addColor(SKY_PARAMS, 'fogColor').name('fog colour').onChange(reapply))

    // Export the tuned working look as a paste-ready preset literal (hex colours).
    f.add({ log: () => console.log(this.lookToSource()) }, 'log').name('log look JSON')
    return f
  }

  /** Format the live look as a source literal to paste into SKY_PRESETS (colours as 0xRRGGBB). */
  lookToSource () {
    const hx = (n) => '0x' + n.toString(16).padStart(6, '0')
    const p = SKY_PARAMS
    const r = (n) => Math.round(n * 1000) / 1000
    return `{
  elevation: ${r(p.elevation)}, azimuth: ${r(p.azimuth)}, lightEl: ${r(p.lightEl)}, lightAz: ${r(p.lightAz)},
  turbidity: ${r(p.turbidity)}, rayleigh: ${r(p.rayleigh)}, mieCoefficient: ${r(p.mieCoefficient)}, mieDirectionalG: ${r(p.mieDirectionalG)}, exposure: ${r(p.exposure)},
  sunColor: ${hx(p.sunColor)}, sunIntensity: ${r(p.sunIntensity)}, hemiSky: ${hx(p.hemiSky)}, hemiGround: ${hx(p.hemiGround)},
  hemiIntensity: ${r(p.hemiIntensity)}, fogColor: ${hx(p.fogColor)},
}`
  }
}
