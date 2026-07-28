/**
 * src/dust.js — RangerSim wheel dust trails (FEAT — visual polish)
 *
 * Dirt-cheap, self-contained dust/dirt kick-up behind the wheels. Stylized soft
 * billboard puffs drawn from a fixed pool — no per-frame allocation, one shared
 * procedural texture (no image assets — matches the project's D-01 "procedural
 * vertex colour only" discipline in road-mesh.js / terrain.js).
 *
 * RENDERING (PERF-21): ONE InstancedMesh of camera-facing quads — a custom shader
 * billboards each instance in view space. The previous implementation used one
 * THREE.Sprite (+ its own SpriteMaterial) per puff: up to 180 separate transparent
 * draw calls, the largest draw-call block in the game after props. Now it is 1 draw
 * call and a ~6 KB dynamic attribute upload per frame. Per-instance state (position,
 * scale, spin, tint, opacity) rides in instanced attributes packed from the live
 * pool each frame; count = live puffs, so dead slots cost nothing. Within-cloud
 * blend order is unsorted (sprites were per-object sorted) — invisible at the
 * 0.22-peak-alpha haze this system draws.
 *
 * Design goals (per request):
 *  - Cheap: fixed pool (POOL_SIZE), recycled. No GC churn, one draw call,
 *    depthWrite:false so puffs never disturb the depth buffer.
 *  - Honest colour: puffs are tinted to the dirt we're driving on (params.dustColor,
 *    defaulting near the terrain warm-brown / roadDirtColor family). Catches a little
 *    light (slightly lifted toward white) so airborne dust reads brighter than ground.
 *  - Self-sourcing: update() derives wheel ground positions from vehicleState +
 *    params alone (no suspension.js / terrain.js import) so the main.js hook is a
 *    single call. Ground height comes from an injected sampler closure.
 *
 * Emission is driven by per-wheel contact-patch slip velocity (vehicleState.wheelDebug[i].sa,
 * m/s — wheelspin, lockup, drift) plus a speed term, so dust grows with how hard the
 * tyre is working against the dirt. Rear (driven) wheels kick harder. No dust when a
 * wheel is airborne or the truck is crawling.
 *
 * TWO KINDS, ONE POOL, ONE DRAW CALL: a per-particle `kind` flag selects the integrator and fade.
 * Puffs (kind 0) are the soft drifting haze described above. Grit (kind 1) is a slice of the same
 * emission budget spawned as small opaque ballistic grains — material a ROLLING tyre lifts and
 * drops, which is what keeps the no-slip trail from being pure haze. That slice scales with the
 * surface (GRIT_FRACTION_PAVED → _LOOSE): least on tarmac, more on dirt, and always well short of
 * the wheelspin case, which is dirt-spray.js's job. Grit is deliberately NOT a dirt-spray clod:
 * nothing is being flung here, so the throw is a small hop up, a small drift out the back and a
 * sideways scatter — and it barely fades on tarmac, where the haze all but vanishes.
 *
 * Conventions: wheel index 0=FL 1=FR 2=RL 3=RR (GLOSSARY.md §Wheel Index).
 * Car forward = -Z, left = -X (GLOSSARY.md §Coordinate System).
 */

import * as THREE from 'three'

// ── Pool / tuning constants ──────────────────────────────────────────────────
const POOL_SIZE      = 180     // max simultaneous puffs across all four wheels
const MAX_RATE       = 75      // puffs/sec emitted by a single wheel at full intensity
const LIFE_MIN       = 0.55    // s — puff lifetime (scaled up slightly by intensity)
const LIFE_MAX       = 1.25    // s
const SCALE_MIN      = 0.40    // m — initial billboard size
const SCALE_MAX      = 0.85    // m
const SCALE_GROW     = 2.3     // puff grows to (1 + SCALE_GROW) × its initial size over life
const RISE_MIN       = 0.45    // m/s — initial upward drift
const RISE_MAX       = 1.20    // m/s
const SPREAD         = 1.1     // m/s — random lateral scatter
const SETTLE         = 0.55    // m/s² — gentle downward settle (dust is light, not gravity)
const DRAG           = 4.0     // 1/s — horizontal velocity damping (high: kills the slip kick fast,
                               // vertical rise/settle is undamped so puffs still end up floating)
const PEAK_OPACITY   = 0.38    // alpha at a puff's strongest, before intensity/road scaling
const CONTACT_BAND   = 0.28    // m — wheel-bottom within this of the ground counts as in-contact
const SPEED_FLOOR    = 1.6     // m/s — below this a rolling wheel makes no dust
const SLIP_KICK       = 0.5    // fraction of contact-patch slip velocity the puff is kicked out backward

// ── Grit: opaque specks lifted by a ROLLING tyre ─────────────────────────────
// A slice of the emission budget spawns solid little grains instead of haze, so the no-slip
// on-road trail has something crisp in it. These are NOT dirt-spray clods (dirt-spray.js) —
// nothing is being flung by a spinning tyre here, the tread is just picking loose surface
// material up and dropping it, so the throw is a fraction of a clod's and mostly straight up.
// Share of dust spawns that come out as grit instead of a puff, lerped by surface: tarmac has only
// the loose scatter lying on it, dirt is loose material all the way down, so a rolling tyre lifts
// far more of it. The loose end stays well under dirt-spray.js's 90 clods/s/wheel — grit is a tyre
// picking material up, wheelspin is a tyre digging it out, and they must not read as the same event.
const GRIT_FRACTION_PAVED = 0.15
const GRIT_FRACTION_LOOSE = 0.35
const GRIT_SCALE_MIN = 0.020   // m — grains, smaller than dirt-spray clods
const GRIT_SCALE_MAX = 0.045   // m
const GRIT_LIFE_MIN  = 0.35    // s — short: they arc up and land
const GRIT_LIFE_MAX  = 0.80    // s
const GRIT_RISE_MIN  = 0.55    // m/s — the whole lift a rolling tyre gives
const GRIT_RISE_MAX  = 1.40    // m/s
const GRIT_BACK_MIN  = 0.40    // m/s — trailing off the back of the contact patch
const GRIT_BACK_MAX  = 1.30    // m/s
const GRIT_LAT       = 0.85    // m/s — random sideways kick along the wheel's lateral axis, signed
                               // per grain: without it the whole stream reads as one flat plane
const GRIT_JITTER    = 0.20    // m/s — small isotropic noise on top so the lateral spread isn't
                               // a clean two-sided fan
const GRIT_SPAWN_R   = 0.22    // m — grains spawn anywhere in this disc around the contact patch
                               // (uniform by area), not at the wheel centreline — a point source
                               // reads as a fountain, and a real contact patch is a footprint
const GRIT_GRAVITY   = 9.8     // m/s² — ballistic, no drag
const GRIT_OPACITY   = 0.92    // near-solid: the point of these is that they read as material
const GRIT_TINT      = 0.72    // multiplier on dustColor — grains are darker than airborne haze
const GRIT_PAVED_KEEP = 0.6    // grit only fades this far on tarmac (haze fades to dustPavedFactor):
                               // loose grit sits on asphalt too, it just isn't a dust cloud

const KIND_PUFF = 0
const KIND_GRIT = 1

/**
 * Build the soft round puff texture once on a small canvas (procedural — no asset file).
 * White radial gradient, fully transparent at the rim, so the per-instance tint colours it
 * to the dirt and per-instance opacity fades it out.
 */
function makePuffTexture () {
  const S = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = S
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  // Soft, slightly grainy falloff — opaque core, long transparent tail (stylized puff).
  g.addColorStop(0.0, 'rgba(255,255,255,1.0)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.65)')
  g.addColorStop(0.7, 'rgba(255,255,255,0.18)')
  g.addColorStop(1.0, 'rgba(255,255,255,0.0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export class DustSystem {
  /**
   * @param {THREE.Scene} scene
   * @param {object} params  RANGER_PARAMS — reads dustEnabled / dustColor / dustAmount + vehicle geometry live
   */
  constructor (scene, params) {
    this._params = params
    this._tex = makePuffTexture()

    // ── Single instanced billboard mesh (PERF-21 — see header) ────────────────
    // Base quad in [-0.5, 0.5]²; instanced attributes carry per-puff pose/tint/alpha.
    const base = new THREE.PlaneGeometry(1, 1)
    const geo = new THREE.InstancedBufferGeometry()
    geo.index = base.index
    geo.setAttribute('position', base.getAttribute('position'))
    geo.setAttribute('uv', base.getAttribute('uv'))
    const mk = (itemSize) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(POOL_SIZE * itemSize), itemSize)
      a.setUsage(THREE.DynamicDrawUsage)
      return a
    }
    this._aPos   = mk(3)   // world position
    this._aParam = mk(3)   // x: scale (m), y: rotation (rad), z: opacity
    this._aColor = mk(3)   // tint
    this._aShape = mk(1)   // 0 = soft puff, 1 = crisp disc (grit)
    geo.setAttribute('aPos', this._aPos)
    geo.setAttribute('aParam', this._aParam)
    geo.setAttribute('aColor', this._aColor)
    geo.setAttribute('aShape', this._aShape)
    geo.instanceCount = 0

    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: this._tex } }]),
      vertexShader: /* glsl */`
        attribute vec3 aPos;
        attribute vec3 aParam;   // scale, rotation, opacity
        attribute vec3 aColor;
        attribute float aShape;
        varying vec2 vUv;
        varying vec3 vColor;
        varying float vOpacity;
        varying float vShape;
        #include <fog_pars_vertex>
        void main () {
          vUv = uv;
          vColor = aColor;
          vOpacity = aParam.z;
          vShape = aShape;
          float c = cos(aParam.y), s = sin(aParam.y);
          vec2 corner = mat2(c, s, -s, c) * (position.xy * aParam.x);   // spin, then scale
          vec4 mvPosition = viewMatrix * vec4(aPos, 1.0);               // mesh sits at the origin
          mvPosition.xy += corner;                                      // view-space billboard
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap;
        varying vec2 vUv;
        varying vec3 vColor;
        varying float vOpacity;
        varying float vShape;
        #include <fog_pars_fragment>
        void main () {
          vec4 tex = texture2D(uMap, vUv);
          // Grit wants a solid grain, haze the soft radial falloff — one material, blended by the
          // per-instance shape flag (same trick as dirt-spray.js) rather than a second draw call.
          float d = length(vUv - 0.5) * 2.0;
          float disc = 1.0 - smoothstep(0.72, 1.0, d);
          float a = mix(tex.a, disc, vShape);
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor * mix(tex.rgb, vec3(1.0), vShape), a * vOpacity);
          // ShaderMaterial does NOT auto-append these (built-ins do): keep dust inside the same
          // ACES + colour pipeline as the SpriteMaterial it replaced, fog last like the built-ins.
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      transparent: true,
      depthWrite: false,   // transparent puffs must not write depth (no haloing)
      depthTest: true,     // but terrain/road still occlude them
      fog: true,           // fade into scene.fog like everything else
    })
    this._mesh = new THREE.Mesh(geo, mat)
    this._mesh.frustumCulled = false   // positions ride with the truck; cull math not worth it
    this._mesh.renderOrder = 2         // after terrain (0) and water/road decals (1)
    scene.add(this._mesh)

    // Parallel particle state (pure JS — no per-puff THREE objects).
    this._p = []
    for (let i = 0; i < POOL_SIZE; i++) {
      this._p.push({
        active: false,
        kind: KIND_PUFF,
        age: 0,
        life: 1,
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        gy: 0,             // ground height at spawn — grit dies when it falls back to it
        scale0: 0.5,
        rot: 0,
        r: 1, g: 1, b: 1,
        peak: PEAK_OPACITY,
      })
    }
    this._cursor = 0                 // round-robin allocation pointer
    this._emitAccum = [0, 0, 0, 0]   // per-wheel fractional puff accumulator
    this._dustColor = new THREE.Color()
    this._tmpColor = new THREE.Color()
  }

  /** Grab the next pool slot (oldest is overwritten when the pool is saturated). */
  /** Show/hide the dust sheet (FEAT-31 testing-lab teardown — visibility only). */
  setVisible (visible) { this._mesh.visible = visible }

  _alloc () {
    for (let n = 0; n < POOL_SIZE; n++) {
      const idx = (this._cursor + n) % POOL_SIZE
      if (!this._p[idx].active) { this._cursor = (idx + 1) % POOL_SIZE; return this._p[idx] }
    }
    // Saturated — steal the round-robin slot so heavy emission still cycles.
    const idx = this._cursor
    this._cursor = (idx + 1) % POOL_SIZE
    return this._p[idx]
  }

  /**
   * Spawn one opaque grain lifted (not flung) by the rolling tyre. Ballistic and short-lived:
   * a small hop up and a small drift out the back, then it lands and is gone.
   * @param {number} rgtX,rgtZ  world-space unit vector along the wheel's lateral (body +X) axis
   */
  _spawnGrit (x, groundY, z, intensity, fwdX, fwdZ, rgtX, rgtZ, opacityScale) {
    const part = this._alloc()
    const p = this._params

    this._dustColor.set(p.dustColor ?? 0xc9b79a)
    const jitter = 0.8 + Math.random() * 0.35
    this._tmpColor.copy(this._dustColor).multiplyScalar(GRIT_TINT * jitter)
    part.r = this._tmpColor.r; part.g = this._tmpColor.g; part.b = this._tmpColor.b

    part.active = true
    part.kind = KIND_GRIT
    part.age = 0
    part.life = GRIT_LIFE_MIN + (GRIT_LIFE_MAX - GRIT_LIFE_MIN) * Math.random()
    part.scale0 = GRIT_SCALE_MIN + (GRIT_SCALE_MAX - GRIT_SCALE_MIN) * Math.random()
    part.rot = Math.random() * Math.PI * 2
    // Barely fades on tarmac (unlike the haze) — grit lying on the road is still grit.
    part.peak = GRIT_OPACITY * Math.min(1, 0.5 + intensity)
              * (GRIT_PAVED_KEEP + (1 - GRIT_PAVED_KEEP) * (opacityScale ?? 1))
    part.gy = groundY

    // Spawn anywhere in a disc around the contact patch. sqrt() on the radius makes it uniform by
    // AREA — without it grains bunch at the centre and the point-source look survives the change.
    const sr = GRIT_SPAWN_R * Math.sqrt(Math.random())
    const sa = Math.random() * Math.PI * 2
    part.x = x + Math.cos(sa) * sr
    part.y = groundY + 0.03 + Math.random() * 0.05
    part.z = z + Math.sin(sa) * sr

    // Velocity: back + up + a signed sideways kick along the wheel's own lateral axis (so the
    // spread stays lateral through a turn, not stuck to world X/Z), plus a little isotropic noise.
    const back = GRIT_BACK_MIN + (GRIT_BACK_MAX - GRIT_BACK_MIN) * Math.random()
    const lat = (Math.random() - 0.5) * 2 * GRIT_LAT
    part.vx = -fwdX * back + rgtX * lat + (Math.random() - 0.5) * GRIT_JITTER
    part.vy = GRIT_RISE_MIN + (GRIT_RISE_MAX - GRIT_RISE_MIN) * Math.random()
    part.vz = -fwdZ * back + rgtZ * lat + (Math.random() - 0.5) * GRIT_JITTER
  }

  _spawn (x, y, z, intensity, slipV, fwdX, fwdZ, opacityScale) {
    const part = this._alloc()
    const p = this._params

    part.kind = KIND_PUFF

    // Colour: dirt we're driving on, lifted toward white so airborne dust catches light.
    // Per-puff brightness jitter keeps a stylized cloud from reading as a flat decal.
    this._dustColor.set(p.dustColor ?? 0xc9b79a)
    const jitter = 0.85 + Math.random() * 0.3
    this._tmpColor.copy(this._dustColor).lerp(WHITE, 0.18).multiplyScalar(jitter)
    part.r = this._tmpColor.r; part.g = this._tmpColor.g; part.b = this._tmpColor.b
    part.rot = Math.random() * Math.PI * 2

    part.active = true
    part.age = 0
    part.life = LIFE_MIN + (LIFE_MAX - LIFE_MIN) * (0.4 + 0.6 * intensity) * (0.8 + Math.random() * 0.4)
    part.scale0 = SCALE_MIN + (SCALE_MAX - SCALE_MIN) * Math.random()
    // Opacity scales with how hard the tyre works AND the road factor (faint on tarmac) — density
    // is left untouched so on-road dust stays a full-coverage thin haze rather than sparse pops.
    part.peak = PEAK_OPACITY * Math.min(1, 0.35 + intensity) * (opacityScale ?? 1)

    // Spawn just above the contact patch with a little random offset so puffs don't stack.
    part.x = x + (Math.random() - 0.5) * 0.3
    part.y = y + 0.08 + Math.random() * 0.12
    part.z = z + (Math.random() - 0.5) * 0.3

    // Velocity: upward billow + lateral scatter + a kick out behind the truck (opposite its
    // forward heading) at half the contact-patch slip speed — a wheelspinning-at-standstill
    // truck now throws dust backward even though ground speed is ~0. High DRAG (above) bleeds
    // the kick off quickly; RISE/SETTLE below are undamped so the puff still ends up floating
    // up same as before.
    const kick = slipV * SLIP_KICK
    part.vx = (Math.random() - 0.5) * SPREAD - fwdX * kick
    part.vy = RISE_MIN + (RISE_MAX - RISE_MIN) * Math.random()
    part.vz = (Math.random() - 0.5) * SPREAD - fwdZ * kick
  }

  /** Pack live puffs into the instanced attributes and upload only the used prefix. */
  _pack () {
    const pos = this._aPos.array, par = this._aParam.array, col = this._aColor.array
    const shp = this._aShape.array
    let n = 0
    for (let i = 0; i < POOL_SIZE; i++) {
      const part = this._p[i]
      if (!part.active) continue
      const t = part.age / part.life
      const j3 = n * 3
      pos[j3] = part.x; pos[j3 + 1] = part.y; pos[j3 + 2] = part.z
      if (part.kind === KIND_GRIT) {
        // Grit holds its size and stays solid, then blinks out over the last quarter of life.
        par[j3] = part.scale0
        par[j3 + 2] = part.peak * Math.min(1, (1 - t) * 4)
        shp[n] = 1
      } else {
        const fade = (1 - t) * (1 - t)
        const rampIn = Math.min(1, t * 6)  // quick fade-in over first ~1/6 of life
        par[j3] = part.scale0 * (1 + SCALE_GROW * t)
        par[j3 + 2] = part.peak * fade * rampIn
        shp[n] = 0
      }
      par[j3 + 1] = part.rot
      col[j3] = part.r; col[j3 + 1] = part.g; col[j3 + 2] = part.b
      n++
    }
    this._mesh.geometry.instanceCount = n
    if (n > 0) {
      for (const a of [this._aPos, this._aParam, this._aColor]) {
        a.addUpdateRange(0, n * 3)
        a.needsUpdate = true
      }
      this._aShape.addUpdateRange(0, n)
      this._aShape.needsUpdate = true
    }
  }

  /**
   * Advance + emit. Call once per render frame, after syncMeshesToState so vehicleState
   * holds the interpolated render pose (puffs spawn at the rendered wheel position).
   *
   * @param {number} dt          render frame time [s]
   * @param {object} vehicleState
   * @param {object} params      RANGER_PARAMS
   * @param {(x:number,z:number)=>number} groundYAt  ground surface height sampler
   * @param {((x:number,z:number)=>number)} [onRoadFactorAt]  optional 0..1 dust multiplier by
   *        position — < 1 on the paved ribbon so on-road dust is reduced (defaults to 1 = full).
   */
  update (dt, vehicleState, params, groundYAt, onRoadFactorAt) {
    if (dt <= 0) return
    if (dt > 0.1) dt = 0.1  // clamp after a tab-stall so puffs don't teleport
    const enabled = params.dustEnabled !== false
    const amount = params.dustAmount ?? 1.0

    // ── Integrate live puffs ──────────────────────────────────────────────────
    for (let i = 0; i < POOL_SIZE; i++) {
      const part = this._p[i]
      if (!part.active) continue
      part.age += dt
      if (part.age >= part.life) { part.active = false; continue }
      if (part.kind === KIND_GRIT) {
        // Ballistic grain: full gravity, no drag, dies on landing rather than sinking through.
        part.vy -= GRIT_GRAVITY * dt
        part.x += part.vx * dt
        part.y += part.vy * dt
        part.z += part.vz * dt
        if (part.vy < 0 && part.y <= part.gy) part.active = false
        continue
      }
      // Settle + horizontal drag.
      part.vy -= SETTLE * dt
      const dragF = Math.max(0, 1 - DRAG * dt)
      part.vx *= dragF
      part.vz *= dragF
      part.x += part.vx * dt
      part.y += part.vy * dt
      part.z += part.vz * dt
    }

    // ── Emit from wheels in ground contact ────────────────────────────────────
    if (!enabled) { this._pack(); return }

    const speed = Math.hypot(vehicleState.velocity.x, vehicleState.velocity.z)
    if (speed < SPEED_FLOOR && !_anySlip(vehicleState)) { this._pack(); return }

    const px = vehicleState.position.x
    const py = vehicleState.position.y
    const pz = vehicleState.position.z

    // Vehicle forward heading (world-space -Z body axis) — same q*(0,0,-1)*q^-1 formula as
    // vehicle.js's wheel-spin accumulation. Used to kick dust out behind the truck's nose
    // rather than behind its (possibly sideways, mid-slide) velocity vector.
    const q = vehicleState.quaternion
    const fwdX = 2 * (q.x * q.z + q.y * q.w)
    const fwdZ = 1 - 2 * (q.x * q.x + q.y * q.y)
    // Body +X (right) rotated into world — the lateral axis grit scatters along.
    const rgtX = 1 - 2 * (q.y * q.y + q.z * q.z)
    const rgtZ = 2 * (q.x * q.y + q.z * q.w)

    // Wheel local offsets (body space) — same geometry as main.js wheelLocalOffsets,
    // recomputed here so dust.js stays import-light. Y uses the level-stance hub height;
    // the body quaternion rotates it for pitch/roll, which is plenty for a stylized spawn.
    const L = params.wheelbase
    const wF = params.weightFront, wR = params.weightRear
    const tF = params.trackFront / 2, tR = params.trackRear / 2
    const hubY = params.wheelRadius - params.cgHeight

    for (let i = 0; i < 4; i++) {
      const isFront = i < 2
      const isLeft = i === 0 || i === 2
      const lx = isLeft ? -(isFront ? tF : tR) : (isFront ? tF : tR)
      const lz = isFront ? -(L * wR) : (L * wF)

      // Rotate (lx, hubY, lz) by body quaternion into world.
      const r = _rotate(lx, hubY, lz, vehicleState.quaternion)
      const wx = px + r.x, wy = py + r.y, wz = pz + r.z

      const groundY = groundYAt ? groundYAt(wx, wz) : 0
      // In contact if the tyre bottom is within CONTACT_BAND of the ground.
      const wheelBottom = wy - params.wheelRadius
      if (wheelBottom - groundY > CONTACT_BAND) { this._emitAccum[i] = 0; continue }

      // Intensity from slip + speed; driven (rear) wheels weighted up. (sa is a friction-circle-
      // clamped value hard-capped at ≈0.06 — see smoke.js's note on the same field — so this
      // term barely moves; intensity here is mostly the speed term. Left as-is: this is the
      // already-tuned/accepted dust look, unrelated to the backward slip-kick below.)
      const slipVIntensity = (vehicleState.wheelDebug?.[i]?.sa) || 0
      const driven = isFront ? 1.0 : 1.45
      let intensity = (slipVIntensity * 0.55 + Math.max(0, speed - SPEED_FLOOR) * 0.045) * driven * amount
      // Real (unclamped) contact-patch slip speed — drives the backward kick below, which needs
      // the actual wheelspin magnitude, not the friction-circle-limited value above.
      const slipVKick = Math.abs((vehicleState.wheelDebug?.[i]?.vLong) || 0)
      if (intensity <= 0.02) { this._emitAccum[i] = 0; continue }
      if (intensity > 1) intensity = 1

      // Reduce dust on the paved ribbon by fading the PUFFS, not thinning them — density stays full
      // (a thin haze), only opacity drops. Cheap: the sampler reuses the memoized road carveHint.
      const opacityScale = onRoadFactorAt ? onRoadFactorAt(wx, wz) : 1

      // Normalize that factor to a 0 (paved) → 1 (off-road) surface blend. It arrives as
      // looseSurfaceFactor, which bottoms out at dustPavedFactor rather than 0, so the raw value
      // would leave the paved end slightly hot — rescale against the same floor main.js uses.
      const pavedFloor = params.dustPavedFactor ?? 0.1
      let loose01 = (opacityScale - pavedFloor) / (1 - pavedFloor)
      if (loose01 < 0) loose01 = 0
      else if (loose01 > 1) loose01 = 1
      const gritFraction = GRIT_FRACTION_PAVED + (GRIT_FRACTION_LOOSE - GRIT_FRACTION_PAVED) * loose01

      // Accumulate fractional puffs; spawn whole ones at the contact patch.
      this._emitAccum[i] += intensity * MAX_RATE * dt
      let budget = 6  // per-wheel per-frame cap (guards against dt spikes)
      while (this._emitAccum[i] >= 1 && budget-- > 0) {
        this._emitAccum[i] -= 1
        // A surface-dependent slice of the SAME budget comes out as opaque grains instead of haze —
        // the rate (and so the pool/upload cost) is unchanged, part of it just reads as material.
        if (Math.random() < gritFraction) this._spawnGrit(wx, groundY, wz, intensity, fwdX, fwdZ, rgtX, rgtZ, opacityScale)
        else this._spawn(wx, groundY, wz, intensity, slipVKick, fwdX, fwdZ, opacityScale)
      }
      if (this._emitAccum[i] > 2) this._emitAccum[i] = 2  // don't bank a backlog
    }

    this._pack()
  }
}

const WHITE = new THREE.Color(0xffffff)

// Rotate a body-local vector by a quaternion without allocating a THREE.Vector3 each call.
const _qv = { x: 0, y: 0, z: 0 }
function _rotate (x, y, z, q) {
  const ix = q.w * x + q.y * z - q.z * y
  const iy = q.w * y + q.z * x - q.x * z
  const iz = q.w * z + q.x * y - q.y * x
  const iw = -q.x * x - q.y * y - q.z * z
  _qv.x = ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y
  _qv.y = iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z
  _qv.z = iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x
  return _qv
}

// Any wheel slipping enough to kick dust even at a standstill (e.g. brake-stand wheelspin).
function _anySlip (vehicleState) {
  const wd = vehicleState.wheelDebug
  if (!wd) return false
  for (let i = 0; i < 4; i++) if ((wd[i]?.sa || 0) > 1.0) return true
  return false
}
