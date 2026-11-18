/**
 * src/moon.js — the moon disc.
 *
 * A single camera-locked billboard (2 tris) drawn at a fixed distance along the moon's direction.
 * SkySystem owns it: it computes where the moon is for its phase (it rises and sets, and is up by day
 * at the right phases), how bright it reads through the air and the eye, and its colour low down; this
 * module only places and shades it. When the moon is the night's key light, the disc you see and the
 * light casting your shadows are the same object.
 *
 * WHY A MESH, NOT PART OF THE SKY SHADER: the sky's light is a 64 × 32 look-up texture, which would
 * smear a disc; drawn as its own quad it is pixel-crisp at any angular size for one extra draw call.
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
 * and a separate terminator mask reveals only part of it. `phase` is 0 = new, 0.5 = half, 1 = full
 * (SkySystem.setMoonCycle sets it); the albedo never changes. The billboard is turned about the view
 * axis so the lit limb faces the sun. The unlit limb is drawn additively at zero, so it is genuinely absent
 * from the sky rather than a dark disc — `earthshine` can lift it if an ashen look is wanted.
 */
import * as THREE from 'three'

// Metres from the camera. Must be < camera.far (1000) and > the terrain ring (~320 m) so the world
// occludes the moon but the moon never clips the far plane.
const MOON_DIST = 800
const _right = new THREE.Vector3(), _up = new THREE.Vector3(), _toSun = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1)
const _roll = new THREE.Quaternion()
// The billboard quad is this many times the disc DIAMETER, leaving room for the halo to fall off
// outside the limb. The shader rescales by it (see FRAG) so `angularSize` always means the DISC.
const QUAD_PAD = 1.9

export const MOON_PARAMS = {
  enabled: true,
  angularSize: 5.5,     // apparent DIAMETER in degrees. The real moon is 0.52°, which is far too
                        // small to read in-game; this is the size the look was signed off at.
  phase: 0.42,          // 0 = new, 0.5 = geometric half, 1 = full — owned by SkySystem.setMoonCycle. This
                        // default is free roam's moon (a waxing crescent past its first week).
  brightness: 3.0,      // PRE-tone-mapping luminance of the lit limb (see header). Pushed much past
                        // ~4 and ACES saturates the whole disc to flat white, taking the maria with it.
  earthshine: 0.0,      // unlit-limb brightness as a fraction of `brightness`. 0 by DEFAULT: any
                        // visible dark limb reads as a mask over a full disc, not as a phase.
                        // Dial up only if you want a deliberate 'ashen light' look.
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
  #define QUAD_PAD ${QUAD_PAD.toFixed(3)}
  uniform float uPhase, uBrightness, uEarthshine, uTermSoft, uHalo, uSeed, uOpacity;
  uniform vec3  uTint, uAir;
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
    // p spans [-1,1] across the QUAD, but the quad is QUAD_PAD× the disc so the halo has somewhere
    // to live — so rescale into DISC units, where r == 1 is the moon's limb and the quad corner is
    // at r == QUAD_PAD·√2. (Getting this wrong renders the disc at the full quad size, i.e.
    // QUAD_PAD× the requested angular size, and leaves the halo entirely outside the geometry.)
    vec2 p = (vUv - 0.5) * 2.0 * QUAD_PAD;
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
    // A NEW moon is dark (BUG-94): at k → 1 the terminator lies ON the limb, and its soft edge left
    // the disc's anti-aliased rim half-lit — a hairline circle once the halo stopped drowning it.
    // Faded out over the last few hundredths of phase (k 0.98 → 1 ≈ phase 0.064 → 0).
    float newFade = 1.0 - smoothstep(0.98, 1.0, k);
    float lit = smoothstep(-uTermSoft, uTermSoft, p.x - edge) * newFade;
    float level = mix(uEarthshine, 1.0, lit);

    // BUG-94: the glow follows the TERMINATOR, not the disc. Built from r alone it ringed the whole
    // circle, dark limb included — a full disc outlined in light with the phase inside it. Sample the
    // same terminator test at 0.8 of the way out along this direction (at the limb itself the full
    // moon's sunward edge sits ON the line and would glow at half), widened so the glow tapers round
    // the cusps; the dark limb keeps only the earthshine level.
    vec2 pl = (p / max(r, 1e-4)) * 0.8;
    float limbLit = smoothstep(-(uTermSoft + 0.15), uTermSoft + 0.15, pl.x - k * sqrt(max(0.0, 1.0 - pl.y * pl.y)));
    glow *= mix(uEarthshine, 1.0, limbLit * newFade);

    // ADDITIVE output (see the material): the moon is a light source against the sky, so the
    // unlit limb must contribute NOTHING. With normal blending it instead painted the disc's dark
    // half as opaque black — a visible mask sitting over a full circle rather than a phase.
    vec3 col = uTint * uAir * uBrightness * (albedo * level * disc + glow);
    gl_FragColor = vec4(col, uOpacity);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    // BUG-228: ADDITIVE, so dither only where the moon adds light. The ±1-level grain on a zero contribution would
    // re-grain the already-dithered sky inside the quad: a faint grainy square round the moon.
    if (max(gl_FragColor.r, max(gl_FragColor.g, gl_FragColor.b)) > 0.0) {
      #include <dithering_fragment>
    }
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
        uOpacity:    { value: 0 },              // SkySystem: the disc's brightness against the sky
        uTint:       { value: new THREE.Color(p.tint) },
        uAir:        { value: new THREE.Color(1, 1, 1) },   // the air's colour on the moonlight (SkySystem)
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,     // never occlude the world
      depthTest: true,       // ...but let the world occlude IT (see header)
      fog: false,            // REQUIRED at MOON_DIST — see header
      // Additive, so the unlit limb and the halo tail add zero instead of compositing black over
      // the sky. AdditiveBlending is (SRC_ALPHA, ONE), so uOpacity scales what it adds.
      blending: THREE.AdditiveBlending,
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
   * Per-frame placement. Called from SkySystem.update after the camera has been posed.
   * @param {THREE.Camera} camera
   * @param {THREE.Vector3} moonDir — unit, toward the moon
   * @param {THREE.Vector3} sunDir  — unit, toward the sun (the lit limb turns to face it)
   * @param {number} opacity        — how bright the disc reads against the sky (0 below the horizon)
   * @param {THREE.Color} air       — the air's colour on the moonlight (orange near the horizon)
   */
  update (camera, moonDir, sunDir, opacity, air) {
    const vis = MOON_PARAMS.enabled && opacity > 0.003
    this.mesh.visible = vis
    if (!vis) return
    this.mesh.position.copy(camera.position).addScaledVector(moonDir, MOON_DIST)
    this.mesh.quaternion.copy(camera.quaternion)   // billboard
    // Turn the quad about the view axis so its +x (the lit side, see FRAG) points at the sun as seen
    // round the moon: the sun's direction less its component along the moon's.
    _right.set(1, 0, 0).applyQuaternion(camera.quaternion)
    _up.set(0, 1, 0).applyQuaternion(camera.quaternion)
    _toSun.copy(sunDir).addScaledVector(moonDir, -sunDir.dot(moonDir))
    this.mesh.quaternion.multiply(_roll.setFromAxisAngle(_z, Math.atan2(_toSun.dot(_up), _toSun.dot(_right))))
    // Quad spans the halo as well as the disc, hence QUAD_PAD; the shader rescales to match, so
    // `angularSize` is the DISC's apparent diameter, not the quad's.
    const halfAngle = THREE.MathUtils.degToRad(MOON_PARAMS.angularSize) * 0.5
    this.mesh.scale.setScalar(2 * MOON_DIST * Math.tan(halfAngle) * QUAD_PAD)
    this._mat.uniforms.uOpacity.value = Math.min(1, opacity)
    this._mat.uniforms.uAir.value.copy(air)
  }

  /** lil-gui folder (attaches to the Sky folder — same convention as sky.js/prop-debug.js). */
  addGui (gui) {
    const f = gui.addFolder('Moon')
    f.close()
    const re = () => this.apply()
    f.add(MOON_PARAMS, 'enabled').name('enabled')
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
