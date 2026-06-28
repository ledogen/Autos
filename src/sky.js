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
export const SKY_PRESETS = {
  morning: {
    elevation: 11, azimuth: 95, lightEl: 11, lightAz: 95,
    turbidity: 6, rayleigh: 2.6, mieCoefficient: 0.006, mieDirectionalG: 0.86, exposure: 0.46,
    sunColor: 0xffd6a0, sunIntensity: 3.4, hemiSky: 0xbcc6d4, hemiGround: 0x4f463e,
    hemiIntensity: 1.05, fogColor: 0xc9b79a,
  },
  day: {
    elevation: 55, azimuth: 145, lightEl: 55, lightAz: 145,
    turbidity: 5, rayleigh: 2.0, mieCoefficient: 0.005, mieDirectionalG: 0.8, exposure: 0.5,
    sunColor: 0xfff5e8, sunIntensity: 4.8, hemiSky: 0xaccadc, hemiGround: 0x5b5048,
    hemiIntensity: 1.5, fogColor: 0x9bb8d4,
  },
  evening: {
    elevation: 7, azimuth: 255, lightEl: 7, lightAz: 255,
    turbidity: 8, rayleigh: 2.9, mieCoefficient: 0.007, mieDirectionalG: 0.9, exposure: 0.46,
    sunColor: 0xff8a4d, sunIntensity: 3.0, hemiSky: 0xb9a0a8, hemiGround: 0x4a3f3a,
    hemiIntensity: 0.9, fogColor: 0xcf9f86,
  },
  night: {
    elevation: -8, azimuth: 300,          // sky-sun below horizon → dark sky
    lightEl: 42, lightAz: 210,            // "moon" up and to the side → cool key + real shadows
    turbidity: 3, rayleigh: 1.2, mieCoefficient: 0.003, mieDirectionalG: 0.8, exposure: 0.36,
    sunColor: 0x7488b0, sunIntensity: 0.7, hemiSky: 0x2a3a55, hemiGround: 0x14171f,
    hemiIntensity: 0.45, fogColor: 0x1d2740,
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
  // sorted by hour; first/last must be the same look so the wrap (24→0) is seamless.
  keyframes: [
    { hour: 0,  preset: 'night' },
    { hour: 6,  preset: 'morning' },
    { hour: 12, preset: 'day' },
    { hour: 18, preset: 'evening' },
    { hour: 24, preset: 'night' },
  ],
}

const _scratchA = new THREE.Color()
const _scratchB = new THREE.Color()

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
  constructor ({ scene, renderer, sun, ambient }) {
    this.scene = scene
    this.renderer = renderer
    this.sun = sun
    this.ambient = ambient
    this.sunDirection = new THREE.Vector3()   // KEY-LIGHT dir; main.js reads it for the shadow-follow
    this._skySunDir = new THREE.Vector3()     // SKY-sun dir (shader); separate so night can differ
    this._controllers = []                    // GUI controllers to refreshDisplay() after programmatic edits
    this._lastTime = (typeof performance !== 'undefined') ? performance.now() : 0

    renderer.toneMapping = THREE.ACESFilmicToneMapping

    this.sky = new Sky()
    this.sky.scale.setScalar(900)             // fits inside camera.far=1000 (corner 779 m); follows camera
    this.sky.frustumCulled = false            // it's always at the camera; never cull it
    scene.add(this.sky)
    scene.background = null                    // the Sky mesh is the background now (was a flat Color)

    this.apply()                               // push SKY_PARAMS (the `day` clone) into the scene
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
    this.sun.intensity = p.sunIntensity
    this.ambient.color.setHex(p.hemiSky)
    this.ambient.groundColor.setHex(p.hemiGround)
    this.ambient.intensity = p.hemiIntensity
    if (this.scene.fog) this.scene.fog.color.setHex(p.fogColor)
    this.renderer.toneMappingExposure = p.exposure
  }

  /** Load a named preset into the live look and apply it. */
  applyPreset (name) {
    const preset = SKY_PRESETS[name]
    if (!preset) return
    Object.assign(SKY_PARAMS, preset)
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
    this.sky.position.copy(cameraPosition)
    const now = (typeof performance !== 'undefined') ? performance.now() : this._lastTime
    const dtSec = Math.min(0.1, (now - this._lastTime) / 1000)   // clamp tab-switch hitches
    this._lastTime = now
    if (SKY_CYCLE.playing && SKY_CYCLE.dayLengthSec > 0) {
      this.setTimeOfDay(SKY_CYCLE.hour + dtSec * (24 / SKY_CYCLE.dayLengthSec))
    }
  }

  _refreshGui () { for (const c of this._controllers) c.updateDisplay() }

  /** Self-contained lil-gui folder (mirrors prop-debug.js — attaches to the existing panel). */
  addGui (gui) {
    const f = gui.addFolder('Sky / Lighting (QUAL-02)')
    f.close()
    const reapply = () => this.apply()

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
