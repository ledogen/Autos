/**
 * src/sky.js — QUAL-02 atmospheric skybox + sun-driven lighting model.
 *
 * Wraps three/addons Sky (Preetham-style atmospheric scattering shader — procedural, NO textures,
 * iGPU-safe, fits the no-asset / GitHub-Pages constraint) and ties the whole lighting rig to ONE
 * sun position: the directional "sun" light, the hemisphere fill, and the fog tint are all derived
 * from sun elevation/azimuth via setSun(). This is the STATIC foundation a day/night cycle plugs
 * into later (drive setSun() per-frame with an animated elevation) — it does NOT animate on its own.
 *
 * The Sky mesh follows the camera each frame (update()) so its finite box always surrounds the view;
 * the shader pins fragments to the far plane (gl_Position.z = w), so it reads as an infinite sky
 * regardless of box size or camera.far (we keep far=1000 for road-decal depth precision — do not bump
 * it).
 *
 * TONE MAPPING: the Sky shader's atmospheric output is HDR and includes <tonemapping_fragment>, so it
 * needs renderer tone mapping or it clips to white. We enable ACESFilmicToneMapping (the value the
 * three.js sky example assumes) — this applies to the WHOLE scene, so the light intensities below are
 * re-tuned (brighter than the pre-tone-mapping FEAT-05 values) to keep the terrain/road/car looking
 * right under the filmic curve. Exposure is tunable (SKY_PARAMS.exposure).
 *
 * Fog DENSITY stays owned by the draw-distance presets (main.js PERF-03, applyDrawDistance). This
 * module only sets fog COLOR — preserving the FEAT-05 invariant that the horizon haze matches the
 * sky so distant terrain fades into it with no hard band.
 */
import * as THREE from 'three'
import { Sky } from 'three/addons/objects/Sky.js'

// Visual params (self-contained, like data/flora.js — not physics, so not in RANGER_PARAMS).
// elevation/azimuth in degrees; the rest are the Sky shader's atmosphere knobs (tuned clean alpine).
export const SKY_PARAMS = {
  elevation: 28,          // sun height above horizon (low → long alpine shadows; FEAT-05 sun was ~24°)
  azimuth: 53,            // compass-ish bearing (matches FEAT-05's (80,45,60) offset direction)
  turbidity: 5,           // haze/aerosol; low = clean high-altitude air
  rayleigh: 2.0,          // sky blue saturation; ~2 reads alpine without going cartoon-navy
  mieCoefficient: 0.005,  // sun-halo strength
  mieDirectionalG: 0.8,   // sun-halo tightness
  exposure: 0.5,          // renderer.toneMappingExposure (ACES) — tames the HDR sky out of white
}

const SUN_DIST = 200      // m — directional-light standoff from view centre (inside shadow.camera.far=500)

// Lighting keyframes vs sun elevation: two anchors (horizon-warm / high-white) lerped by a normalized
// elevation. Deliberately a simple art-directed blend, not a physical luminance model.
const NOON_SUN    = new THREE.Color(0xfff5e8)   // near-white, faintly warm
const HORIZON_SUN = new THREE.Color(0xffb877)   // low-sun orange
const DAY_FOG     = new THREE.Color(0x9bb8d4)   // FEAT-05 alpine haze (daytime horizon)
const HORIZON_FOG = new THREE.Color(0xc9a98f)   // warm low-sun haze
const NOON_SKYAMB = new THREE.Color(0xaccadc)   // hemisphere sky term, high sun (FEAT-05 value)
const DUSK_SKYAMB = new THREE.Color(0x9a93a8)   // hemisphere sky term, low sun (cooler/desaturated)

export class SkySystem {
  /**
   * @param {{ scene: THREE.Scene, renderer: THREE.WebGLRenderer, sun: THREE.DirectionalLight,
   *           ambient: THREE.HemisphereLight }} deps
   *   sun/ambient are the lights already in the scene; we drive them from the sun position so the
   *   rig stays consistent. scene.fog (FogExp2) is recoloured but its density is left to main.js.
   *   renderer gets ACES tone mapping enabled (needed for the HDR sky).
   */
  constructor ({ scene, renderer, sun, ambient }) {
    this.scene = scene
    this.renderer = renderer
    this.sun = sun
    this.ambient = ambient
    this.sunDirection = new THREE.Vector3()   // unit vector origin→sun; main.js reads it for shadow-follow

    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = SKY_PARAMS.exposure

    this.sky = new Sky()
    this.sky.scale.setScalar(900)             // fits inside camera.far=1000 (corner 779 m); follows camera
    this.sky.frustumCulled = false            // it's always at the camera; never cull it
    scene.add(this.sky)
    scene.background = null                    // the Sky mesh is the background now (was a flat Color)

    this._applyAtmosphere()
    this.setSun(SKY_PARAMS.elevation, SKY_PARAMS.azimuth)
  }

  /** Push the atmosphere knobs into the Sky shader uniforms. */
  _applyAtmosphere () {
    const u = this.sky.material.uniforms
    u.turbidity.value = SKY_PARAMS.turbidity
    u.rayleigh.value = SKY_PARAMS.rayleigh
    u.mieCoefficient.value = SKY_PARAMS.mieCoefficient
    u.mieDirectionalG.value = SKY_PARAMS.mieDirectionalG
  }

  /**
   * Single source of truth for "where is the sun" → updates sky shader, the directional light's
   * colour/intensity, the hemisphere fill, and the fog colour. A day/night cycle just calls this
   * with a time-varying elevation.
   * @param {number} elevationDeg  height above horizon
   * @param {number} azimuthDeg    bearing
   */
  setSun (elevationDeg, azimuthDeg) {
    SKY_PARAMS.elevation = elevationDeg
    SKY_PARAMS.azimuth = azimuthDeg

    const phi = THREE.MathUtils.degToRad(90 - elevationDeg)   // polar from +Y
    const theta = THREE.MathUtils.degToRad(azimuthDeg)
    this.sunDirection.setFromSphericalCoords(1, phi, theta)   // unit dir origin→sun
    this.sky.material.uniforms.sunPosition.value.copy(this.sunDirection)

    // Elevation blend 0 (horizon) → 1 (~50° up). copy()-then-lerp() mutates the LIGHT's colour
    // object toward the second anchor; the const anchors are never mutated.
    const t = THREE.MathUtils.clamp(elevationDeg / 50, 0, 1)
    // Intensities are tuned for ACES tone mapping at exposure 0.5 (brighter than the FEAT-05 raw
    // values, which were authored against NoToneMapping).
    this.sun.color.copy(HORIZON_SUN).lerp(NOON_SUN, t)
    this.sun.intensity = THREE.MathUtils.lerp(3.0, 4.8, t)
    this.ambient.color.copy(DUSK_SKYAMB).lerp(NOON_SKYAMB, t)
    this.ambient.intensity = THREE.MathUtils.lerp(0.9, 1.5, t)
    if (this.scene.fog) this.scene.fog.color.copy(HORIZON_FOG).lerp(DAY_FOG, t)
  }

  /** Re-read SKY_PARAMS after a GUI atmosphere edit (sun pos handled by setSun). */
  refreshAtmosphere () { this._applyAtmosphere() }

  /** Per-frame: keep the finite sky box centred on the camera so it always surrounds the view. */
  update (cameraPosition) { this.sky.position.copy(cameraPosition) }

  /** Self-contained lil-gui folder (mirrors prop-debug.js — attaches to the existing panel). */
  addGui (gui) {
    const f = gui.addFolder('Sky / Lighting (QUAL-02)')
    f.close()
    const sun = () => this.setSun(SKY_PARAMS.elevation, SKY_PARAMS.azimuth)
    const atmo = () => this.refreshAtmosphere()
    f.add(SKY_PARAMS, 'elevation', 0, 90, 0.5).name('sun elevation').onChange(sun)
    f.add(SKY_PARAMS, 'azimuth', 0, 360, 1).name('sun azimuth').onChange(sun)
    f.add(SKY_PARAMS, 'turbidity', 0, 20, 0.1).name('turbidity').onChange(atmo)
    f.add(SKY_PARAMS, 'rayleigh', 0, 4, 0.01).name('rayleigh').onChange(atmo)
    f.add(SKY_PARAMS, 'mieCoefficient', 0, 0.1, 0.001).name('mie coeff').onChange(atmo)
    f.add(SKY_PARAMS, 'mieDirectionalG', 0, 1, 0.01).name('mie g').onChange(atmo)
    f.add(SKY_PARAMS, 'exposure', 0.1, 1.5, 0.01).name('exposure').onChange(() => { this.renderer.toneMappingExposure = SKY_PARAMS.exposure })
    return f
  }
}
