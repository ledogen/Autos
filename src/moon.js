/**
 * src/moon.js — night moon disc for the QUAL-02 day/night cycle.
 *
 * A single camera-locked billboard (2 tris) drawn at a fixed distance along the KEY-LIGHT direction,
 * so the moon you see and the light casting your shadows are the same object. SkySystem owns the
 * direction (SKY_PARAMS.lightEl/lightAz — see sky.js's SKY-SUN vs KEY-LIGHT note); this module only
 * places and shades it.
 *
 * WHY A LIVE MESH, NOT BAKED INTO THE SKY CUBEMAP: the baked sky is 512 px per cube face, so a
 * moon-sized disc would span ~30 texels and read as a mush. Drawn live it is pixel-crisp at any
 * angular size for one extra draw call. (The ground-fill disc in sky.js stays baked — it is a flat
 * colour, so resolution buys it nothing.)
 *
 * DEPTH / FOG: the mesh sits at MOON_DIST metres from the camera with depthWrite off but depthTest
 * ON, so real terrain in front of it occludes it for free (the terrain ring is ~320 m, well inside
 * MOON_DIST). `fog: false` is REQUIRED — at that distance FogExp2 would blend the disc to 100 % fog
 * colour and it would simply not exist.
 *
 * TONE MAPPING: ShaderMaterial does not auto-append the tone-mapping/colour-space chunks the way the
 * built-in materials do (same gotcha as dust.js), so the fragment shader includes them explicitly.
 * That means `brightness` is a PRE-tone-mapping (linear HDR) luminance — it has to exceed 1 to land
 * near white after ACES at the night exposure (~0.36).
 *
 * PHASE: the surface is generated as a FULL moon (procedural maria + craters over the whole disc)
 * and a separate terminator mask reveals only part of it. `phase` is 0 = new, 0.5 = half (the
 * shipped default), 1 = full — so wiring a lunar cycle later is just animating that one number; the
 * albedo never changes. The dark limb keeps a faint earthshine so the full disc stays readable.
 */
import * as THREE from 'three'

// Metres from the camera. Must be < camera.far (1000) and > the terrain ring (~320 m) so the world
// occludes the moon but the moon never clips the far plane.
const MOON_DIST = 800

export const MOON_PARAMS = {
  enabled: true,
  angularSize: 2.2,     // apparent DIAMETER in degrees (the real moon is 0.52° — too small to read in-game)
  phase: 0.5,           // 0 = new, 0.5 = half, 1 = full. Animate this for a lunar cycle.
  brightness: 3.0,      // PRE-tone-mapping luminance of the lit limb (see header). Pushed much past
                        // ~4 and ACES saturates the whole disc to flat white, taking the maria with it.
  earthshine: 0.035,    // brightness of the unlit limb, as a fraction of `brightness`
  terminatorSoft: 0.04, // terminator half-width in disc radii (0 = razor edge)
  halo: 0.35,           // strength of the soft glow ring around the disc (0 = off)
  tint: 0xdfe6f2,       // slightly cool white
  seed: 3.7,            // shifts the procedural maria/crater pattern
}

const VERT = /* glsl */`
  varying vec2 vUv;
  void main () {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAG = /* glsl */`
  uniform float uPhase, uBrightness, uEarthshine, uTermSoft, uHalo, uSeed, uOpacity;
  uniform vec3  uTint;
  varying vec2 vUv;

  // Cheap value noise — enough for maria blotches and crater speckle at this angular size.
  float hash (vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise (vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
               mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
  }
  float fbm (vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
    return s;
  }

  void main () {
    vec2 p = (vUv - 0.5) * 2.0;          // unit disc coords
    float r = length(p);

    // ── Soft glow, OUTSIDE the disc only. Sells "bright object seen through atmosphere" and hides
    //    the quad's edge. The (1.0 - disc) mask is load-bearing: without it the glow is a constant
    //    added across the whole face and swamps the terminator, leaving a flat white sticker.
    float disc = 1.0 - smoothstep(0.985, 1.0, r);
    float glow = uHalo * exp(-max(0.0, r - 1.0) * 26.0) * (1.0 - disc);
    if (disc < 0.001 && glow < 0.001) discard;

    // ── FULL-moon albedo (generated over the whole disc, independent of phase — see header).
    vec2 q = p * 2.6 + uSeed;
    float maria   = smoothstep(0.42, 0.72, fbm(q));                 // dark basalt seas
    float craters = smoothstep(0.62, 0.95, fbm(q * 5.5 + 11.0));    // bright ejecta speckle
    float albedo  = mix(0.88, 0.42, maria) + 0.14 * craters;
    // Limb darkening — a lit sphere, not a flat sticker.
    albedo *= mix(1.0, 0.72, smoothstep(0.35, 1.0, r));

    // ── Terminator. k = cos(phase·π): +1 at new (nothing lit), 0 at half (x > 0 lit), -1 at full.
    //    The boundary is the ellipse x = k·sqrt(1 - y²) — the projection of the sphere's day/night
    //    great circle, so intermediate phases are crescents, not straight-line wipes.
    float k = cos(uPhase * 3.14159265);
    float edge = k * sqrt(max(0.0, 1.0 - p.y * p.y));
    float lit = smoothstep(-uTermSoft, uTermSoft, p.x - edge);
    float level = mix(uEarthshine, 1.0, lit);

    vec3 col = uTint * uBrightness * (albedo * level * disc + glow);
    gl_FragColor = vec4(col, uOpacity * max(disc, glow));

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export class MoonSystem {
  /** @param {THREE.Scene} scene */
  constructor (scene) {
    this.scene = scene
    const p = MOON_PARAMS
    this._mat = new THREE.ShaderMaterial({
      uniforms: {
        uPhase:      { value: p.phase },
        uBrightness: { value: p.brightness },
        uEarthshine: { value: p.earthshine },
        uTermSoft:   { value: p.terminatorSoft },
        uHalo:       { value: p.halo },
        uSeed:       { value: p.seed },
        uOpacity:    { value: 0 },              // driven from nightFactor each frame
        uTint:       { value: new THREE.Color(p.tint) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,     // never occlude the world
      depthTest: true,       // ...but let the world occlude IT (see header)
      fog: false,            // REQUIRED at MOON_DIST — see header
      blending: THREE.NormalBlending,
    })
    // The glow extends past the disc, so the quad is oversized and the shader masks it.
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this._mat)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = -1      // right after the sky background, before the world
    this.mesh.visible = false
    scene.add(this.mesh)
  }

  /** Push MOON_PARAMS into the uniforms (GUI onChange / after a programmatic edit). */
  apply () {
    const u = this._mat.uniforms, p = MOON_PARAMS
    u.uPhase.value = p.phase
    u.uBrightness.value = p.brightness
    u.uEarthshine.value = p.earthshine
    u.uTermSoft.value = p.terminatorSoft
    u.uHalo.value = p.halo
    u.uSeed.value = p.seed
    u.uTint.value.setHex(p.tint)
  }

  /**
   * Per-frame placement. Called from the render loop after the camera has been updated.
   * @param {THREE.Camera} camera
   * @param {THREE.Vector3} keyDir — SkySystem.sunDirection (unit, scene origin → key light)
   * @param {number} nightFactor  — SkySystem.nightFactor() (0 day, 1 night); fades the moon in
   */
  update (camera, keyDir, nightFactor) {
    const vis = MOON_PARAMS.enabled && nightFactor > 0.01 && keyDir.y > -0.05
    this.mesh.visible = vis
    if (!vis) return
    this.mesh.position.copy(camera.position).addScaledVector(keyDir, MOON_DIST)
    this.mesh.quaternion.copy(camera.quaternion)   // billboard
    // Quad spans the glow as well as the disc, hence the ×2.6 pad; the shader masks the rest.
    const halfAngle = THREE.MathUtils.degToRad(MOON_PARAMS.angularSize) * 0.5
    this.mesh.scale.setScalar(2 * MOON_DIST * Math.tan(halfAngle) * 2.6)
    this._mat.uniforms.uOpacity.value = Math.min(1, nightFactor)
  }

  /** lil-gui folder (attaches to the Sky folder — same convention as sky.js/prop-debug.js). */
  addGui (gui) {
    const f = gui.addFolder('Moon')
    f.close()
    const re = () => this.apply()
    f.add(MOON_PARAMS, 'enabled').name('enabled')
    f.add(MOON_PARAMS, 'phase', 0, 1, 0.01).name('phase (0 new .5 half 1 full)').onChange(re)
    f.add(MOON_PARAMS, 'angularSize', 0.3, 8, 0.1).name('angular size (deg)')
    f.add(MOON_PARAMS, 'brightness', 0, 12, 0.1).name('brightness (pre-ACES)').onChange(re)
    f.add(MOON_PARAMS, 'earthshine', 0, 0.3, 0.005).name('earthshine').onChange(re)
    f.add(MOON_PARAMS, 'terminatorSoft', 0, 0.4, 0.005).name('terminator soft').onChange(re)
    f.add(MOON_PARAMS, 'halo', 0, 2, 0.01).name('halo').onChange(re)
    f.add(MOON_PARAMS, 'seed', 0, 20, 0.1).name('surface seed').onChange(re)
    f.addColor(MOON_PARAMS, 'tint').name('tint').onChange(re)
    return f
  }
}
