/**
 * src/dirt-spray.js — AUTOS dirt spray off a slipping tyre (FEAT — visual polish)
 *
 * The loose-surface counterpart to src/smoke.js. Smoke is friction heat off the rubber and reads
 * strongest on tarmac; THIS system is the material the tyre digs out of dirt and throws — so it is
 * gated by the same looseSurfaceFactor the dust/tire-audio path uses and effectively vanishes on
 * the paved ribbon.
 *
 * TWO COUPLED LAYERS, ONE POOL, ONE DRAW CALL (same instanced-billboard architecture as dust.js /
 * smoke.js — see dust.js's header for the rendering rationale). A per-particle `kind` flag selects
 * the integrator, colour and fade:
 *
 *  1. STREAM (kind 0) — dense, small, dark clods ejected backwards from the contact patch along the
 *     tyre's rearward throw direction (world −forward, i.e. body +Z), with an upward arc, a cone of
 *     yaw/pitch jitter, and the wheel's lateral slip mixed in. Purely ballistic: gravity, no drag,
 *     short life, killed the moment they fall back below the ground height sampled at spawn.
 *
 *  2. FLOATERS (kind 1) — a live stream clod occasionally SHEDS a dust mote: it inherits a fraction
 *     of the clod's velocity, then runs high linear drag and near-neutral buoyancy so it visibly
 *     peels off the stream and hangs in the air, growing and fading like dust. Longer life, much
 *     lower alpha, lighter/dustier tint.
 *
 *  3. SPARKS (kind 2, FEAT-152) — a flat tire run down to its rim on ASPHALT (vehicleState.rimOnRoad,
 *     from damage.js) throws sparks from the two rim lips, inside and outside, where the steel meets
 *     the road. Same ballistic integrator as the clods; drawn as a streak stretched back along the
 *     spark's own velocity (the trail), orange-white, and self-lit (night does not dim them).
 *
 * All layers share the instanced attributes; aShape picks a crisp disc (clods), the soft radial
 * puff (floaters) or the streak (sparks, aShape 2 + aVel), so one material covers all three.
 *
 * Conventions: wheel index 0=FL 1=FR 2=RL 3=RR (GLOSSARY.md §Wheel Index).
 * Car forward = -Z, left = -X (GLOSSARY.md §Coordinate System).
 */

import * as THREE from 'three'
import { makeBillboardMesh, rotateByQuat } from './dust.js'

// ── Pool ─────────────────────────────────────────────────────────────────────
const POOL_SIZE   = 300     // clods + floaters together

// ── Emission gating ──────────────────────────────────────────────────────────
const SLIP_MIN    = 2.5     // m/s — combined contact-patch slip below which nothing is thrown
const SLIP_FULL   = 9.0     // m/s — slip at which emission saturates (visual window, deliberately
                            // wider than the 4→8 tire-audio window: spray should still be building
                            // when the screech is already pinned)
const MAX_RATE    = 90      // clods/sec from a single wheel at full intensity
const EMIT_BUDGET = 6       // per-wheel per-frame spawn cap (dt-spike guard, same as smoke.js)
const CONTACT_BAND = 0.28   // m — wheel-bottom within this of the ground counts as in-contact
const LOOSE_FLOOR = 0.25    // below this looseSurfaceFactor (i.e. on asphalt) the spray is off —
                            // dirt spray is dirt being dug out; tarmac has none to give

// ── Layer 1: stream clods ────────────────────────────────────────────────────
const EJECT_MIN   = 4.0     // m/s — throw speed at SLIP_MIN
const EJECT_MAX   = 12.0    // m/s — throw speed at SLIP_FULL and beyond
const EJECT_UP    = 0.12    // fraction of throw speed added as upward arc — kept low: the stream
                            // should hug the ground, not fountain (user-tuned)
const CONE_YAW    = 0.42    // rad — half-angle of the horizontal spread cone
const CONE_PITCH  = 0.10    // rad — vertical jitter on the arc
const LAT_MIX     = 0.35    // fraction of the wheel's lateral slip velocity added sideways
const GRAVITY     = 9.8     // m/s² — clods are ballistic, full gravity
const CLOD_LIFE_MIN = 0.40  // s
const CLOD_LIFE_MAX = 0.90  // s
const CLOD_SCALE_MIN = 0.025 // m — small grit, not chunks (user-tuned)
const CLOD_SCALE_MAX = 0.06  // m
const CLOD_OPACITY  = 0.95
const CLOD_TINT     = 0.70  // multiplier on the spray colour — clods are wet/dark earth

// ── Layer 2: draggy floaters ─────────────────────────────────────────────────
const SHED_RATE     = 2.2   // floaters/sec shed by each live clod
const SHED_BUDGET   = 10    // per-frame cap on shed spawns across the whole pool
const SHED_INHERIT  = 0.22  // fraction of the parent clod's velocity a floater keeps
const FLOAT_DRAG    = 3.0   // 1/s — linear drag; velocity *= exp(-k dt) (that is the peel-off)
const FLOAT_SINK    = 0.10  // m/s² — very slight negative buoyancy
const FLOAT_LIFE_MIN = 1.5  // s
const FLOAT_LIFE_MAX = 3.0  // s
const FLOAT_SCALE_MIN = 0.18 // m
const FLOAT_SCALE_MAX = 0.42 // m
const FLOAT_GROW    = 2.6   // grows to (1 + GROW) × initial over its life
const FLOAT_OPACITY = 0.26
const FLOAT_TINT    = 1.25  // lighter than the clods — airborne dust catches light
const FLOAT_WHITE   = 0.20  // extra lerp toward white

// ── Layer 3: rim sparks (FEAT-152, owner 2026-10-28) ────────────────────────────
// Faint and infrequent at 15 mph, full at 50 mph; two emitters per grinding wheel (the rim lips).
const SPARK_V_FLOOR  = 6.7     // m/s (15 mph) — nothing below
const SPARK_V_FULL   = 22.4    // m/s (50 mph) — rate and brightness saturate
const SPARK_RATE     = 45      // sparks/sec per lip at full
const SPARK_RATE_EXP = 2       // rate ∝ u^this — sparse near the floor, a shower at the top
const SPARK_LIP      = 0.35    // × wheelWidth either side of the centreline — the rim's two edges
const SPARK_BACK_MIN = 2.0     // m/s — thrown backward off the contact
const SPARK_BACK_MAX = 7.0
const SPARK_UP_MIN   = 0.6     // m/s
const SPARK_UP_MAX   = 2.6
const SPARK_OUT      = 1.2     // m/s — max sideways, away from the wheel on each lip
const SPARK_LIFE_MIN = 0.08    // s
const SPARK_LIFE_MAX = 0.25
const SPARK_SIZE_MIN = 0.015   // m — streak width
const SPARK_SIZE_MAX = 0.030
const SPARK_TRAIL    = 0.045   // s of travel the streak reaches back over
const SPARK_HOT  = [1.0, 0.62, 0.22]   // yellow-orange at birth...
const SPARK_COOL = [1.0, 0.25, 0.02]   // ...deep orange as it dies
const SPARK_GLOW = 2.8                 // colour gain above 1: an emitter, so it must survive ACES tone
                                       // mapping as hot orange-white instead of flattening to beige
const KIND_CLOD = 0
const KIND_FLOAT = 1
const KIND_SPARK = 2

export class DirtSpraySystem {
  /**
   * @param {THREE.Scene} scene
   * @param {object} params  RANGER_PARAMS — reads dirtSprayEnabled / dirtSprayAmount /
   *                         dirtSprayColor (falls back to dustColor) + vehicle geometry live
   */
  constructor (scene, params) {
    this._params = params
    const { mesh, aPos, aParam, aColor, aShape } = makeBillboardMesh(scene, POOL_SIZE, true, /* glsl */`
        attribute vec3 aPos;
        attribute vec3 aParam;   // scale, rotation, opacity
        attribute vec3 aColor;
        attribute float aShape;
        attribute vec3 aVel;     // sparks only: the streak reaches back along this (world m)
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
          vec4 mvPosition = viewMatrix * vec4(aPos, 1.0);               // mesh sits at the origin
          if (aShape > 1.5) {
            // Streak: the quad's x runs tail (-0.5) to head (+0.5), its y is the width, across
            // the view-space direction of travel.
            vec4 tail = viewMatrix * vec4(aPos - aVel, 1.0);
            vec2 d = mvPosition.xy - tail.xy;
            float len = length(d);
            vec2 dir = len > 1e-5 ? d / len : vec2(1.0, 0.0);
            mvPosition = mix(tail, mvPosition, position.x + 0.5);
            mvPosition.xy += vec2(-dir.y, dir.x) * position.y * aParam.x;
          } else {
            float c = cos(aParam.y), s = sin(aParam.y);
            mvPosition.xy += mat2(c, s, -s, c) * (position.xy * aParam.x);   // spin, scale, billboard
          }
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`, /* glsl */`
        uniform sampler2D uMap;
        uniform vec3 uLight;
        uniform float uLightA;
        varying vec2 vUv;
        varying vec3 vColor;
        varying float vOpacity;
        varying float vShape;
        #include <fog_pars_fragment>
        void main () {
          vec4 tex = texture2D(uMap, vUv);
          // Clods want a small solid grain, floaters the soft radial haze — one material, blended
          // by the per-instance shape flag rather than a second draw call.
          float d = length(vUv - 0.5) * 2.0;
          float disc = 1.0 - smoothstep(0.72, 1.0, d);
          // Spark streak: solid across its width, fading from the head back to the tail.
          float streak = (1.0 - smoothstep(0.5, 1.0, abs(vUv.y - 0.5) * 2.0)) * vUv.x;
          float spark = step(1.5, vShape);
          float a = spark > 0.5 ? streak : mix(tex.a, disc, vShape);
          if (a < 0.01) discard;
          // Day/night: dim the COLOUR and the ALPHA. Colour alone only greys the puff out, and a
          // grey puff on a black road is still obvious — what sells "unlit smoke at night" is the
          // thing becoming transparent. uLightA is luminance(uLight) shaped by its own curve.
          // Sparks are hot metal — their own light — so night leaves them alone.
          // The streak's head is white-hot, its trail the particle's orange (vColor carries the gain).
          vec3 col = mix(vColor, vec3(max(vColor.r, 1.0)), spark * smoothstep(0.75, 1.0, vUv.x) * 0.3);
          gl_FragColor = vec4(col * mix(uLight, vec3(1.0), spark), a * vOpacity * mix(uLightA, 1.0, spark));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`)
    this._mesh = mesh
    // The spark trail attribute, added beside the shared sheet's four (zero for clods/floaters).
    const aVel = new THREE.InstancedBufferAttribute(new Float32Array(POOL_SIZE * 3), 3)
    aVel.setUsage(THREE.DynamicDrawUsage)
    mesh.geometry.setAttribute('aVel', aVel)
    this._aPos = aPos; this._aParam = aParam; this._aColor = aColor; this._aShape = aShape; this._aVel = aVel
    this._attrs = [aPos, aParam, aColor, aShape, aVel]   // upload set, built once (no per-frame array)

    this._p = []
    for (let i = 0; i < POOL_SIZE; i++) {
      this._p.push({
        active: false,
        kind: KIND_CLOD,
        age: 0,
        life: 1,
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        gy: 0,               // ground height sampled at spawn — clods die when they fall below it
        scale0: 0.1,
        rot: 0,
        r: 1, g: 1, b: 1,
        peak: CLOD_OPACITY,
        shed: 0,             // fractional shed accumulator (clods only)
      })
    }
    this._cursor = 0
    this._emitAccum = [0, 0, 0, 0]
    this._sparkWait = [0, 0, 0, 0]    // per wheel, both lips: seconds until the next spark
    this._sprayColor = new THREE.Color()
    this._tmpColor = new THREE.Color()
  }

  /** Show/hide the spray sheet (testing-lab teardown parity with dust/smoke — visibility only). */
  setVisible (visible) { this._mesh.visible = visible }

  _alloc () {
    for (let n = 0; n < POOL_SIZE; n++) {
      const idx = (this._cursor + n) % POOL_SIZE
      if (!this._p[idx].active) { this._cursor = (idx + 1) % POOL_SIZE; return this._p[idx] }
    }
    const idx = this._cursor
    this._cursor = (idx + 1) % POOL_SIZE
    return this._p[idx]
  }

  /** Live spray colour (params read every frame, same as smoke.js). */
  _baseColor () {
    const p = this._params
    return this._sprayColor.set(p.dirtSprayColor ?? p.dustColor ?? 0xc9b79a)
  }

  /**
   * Spawn one stream clod at the contact patch.
   * @param {number} bx,bz  world-space unit vector pointing BACKWARD (opposite the car's heading)
   * @param {number} lx,lz  world-space unit vector pointing along the wheel's lateral axis
   */
  _spawnClod (x, groundY, z, intensity, vLat, bx, bz, lx, lz, opacityScale) {
    const part = this._alloc()

    const jitter = 0.8 + Math.random() * 0.35
    this._tmpColor.copy(this._baseColor()).multiplyScalar(CLOD_TINT * jitter)
    part.r = this._tmpColor.r; part.g = this._tmpColor.g; part.b = this._tmpColor.b

    part.active = true
    part.kind = KIND_CLOD
    part.age = 0
    part.life = CLOD_LIFE_MIN + (CLOD_LIFE_MAX - CLOD_LIFE_MIN) * Math.random()
    part.scale0 = CLOD_SCALE_MIN + (CLOD_SCALE_MAX - CLOD_SCALE_MIN) * Math.random()
    part.rot = Math.random() * Math.PI * 2
    part.peak = CLOD_OPACITY * (0.55 + 0.45 * intensity) * opacityScale
    part.shed = 0
    part.gy = groundY

    part.x = x + (Math.random() - 0.5) * 0.18
    part.y = groundY + 0.04 + Math.random() * 0.08
    part.z = z + (Math.random() - 0.5) * 0.18

    // Throw speed scales with slip inside the emission window, then holds.
    const speed = EJECT_MIN + (EJECT_MAX - EJECT_MIN) * intensity * (0.75 + Math.random() * 0.5)
    // Cone: rotate the backward vector by a random yaw, add a random pitch on the upward arc.
    const yaw = (Math.random() - 0.5) * 2 * CONE_YAW
    const cy = Math.cos(yaw), sy = Math.sin(yaw)
    const dx = bx * cy - bz * sy
    const dz = bx * sy + bz * cy
    const up = EJECT_UP + (Math.random() - 0.5) * 2 * CONE_PITCH

    // Lateral slip flavour: a sliding tyre also flings material out to the side it's sliding toward.
    const lateral = vLat * LAT_MIX
    part.vx = dx * speed + lx * lateral
    part.vy = speed * up
    part.vz = dz * speed + lz * lateral
  }

  /**
   * Spawn one spark at a rim lip. Thrown back off the contact, up, and outward from that lip.
   * @param {number} side  -1 / +1 — which lip, along the wheel's lateral axis (lx, lz)
   * @param {number} ago   s — how long before the end of this frame it was born (see the caller)
   */
  _spawnSpark (x, groundY, z, u, side, bx, bz, lx, lz, ago) {
    const part = this._alloc()
    part.active = true
    part.kind = KIND_SPARK
    part.age = 0
    part.life = SPARK_LIFE_MIN + (SPARK_LIFE_MAX - SPARK_LIFE_MIN) * Math.random()
    part.scale0 = SPARK_SIZE_MIN + (SPARK_SIZE_MAX - SPARK_SIZE_MIN) * Math.random()
    part.rot = 0
    part.peak = 0.35 + 0.65 * u   // faint near the floor
    part.shed = 0
    part.gy = groundY
    part.x = x; part.y = groundY + 0.02; part.z = z
    const back = SPARK_BACK_MIN + (SPARK_BACK_MAX - SPARK_BACK_MIN) * Math.random() * (0.5 + 0.5 * u)
    const out = side * SPARK_OUT * Math.random()
    part.vx = bx * back + lx * out
    part.vy = SPARK_UP_MIN + (SPARK_UP_MAX - SPARK_UP_MIN) * Math.random()
    part.vz = bz * back + lz * out
    // Already `ago` old: fly it that far now, so sparks born across a frame are spread along their
    // flight instead of all starting this frame at the same point.
    part.age = ago
    part.x += part.vx * ago
    part.y += part.vy * ago - 0.5 * GRAVITY * ago * ago
    part.z += part.vz * ago
    part.vy -= GRAVITY * ago
  }

  /** Shed a draggy floater off a live clod (inherits a slice of its velocity). */
  _spawnFloater (src) {
    const part = this._alloc()
    if (part === src) return   // pool saturated and we grabbed the parent — skip this shed

    const jitter = 0.85 + Math.random() * 0.3
    this._tmpColor.copy(this._baseColor())
      .multiplyScalar(FLOAT_TINT * jitter)
      .lerp(WHITE, FLOAT_WHITE)
    part.r = this._tmpColor.r; part.g = this._tmpColor.g; part.b = this._tmpColor.b

    part.active = true
    part.kind = KIND_FLOAT
    part.age = 0
    part.life = FLOAT_LIFE_MIN + (FLOAT_LIFE_MAX - FLOAT_LIFE_MIN) * Math.random()
    part.scale0 = FLOAT_SCALE_MIN + (FLOAT_SCALE_MAX - FLOAT_SCALE_MIN) * Math.random()
    part.rot = Math.random() * Math.PI * 2
    part.peak = FLOAT_OPACITY * (src.peak / CLOD_OPACITY)
    part.shed = 0
    part.gy = src.gy

    part.x = src.x; part.y = src.y; part.z = src.z
    part.vx = src.vx * SHED_INHERIT + (Math.random() - 0.5) * 0.5
    part.vy = src.vy * SHED_INHERIT * 0.5 + 0.15 + Math.random() * 0.25
    part.vz = src.vz * SHED_INHERIT + (Math.random() - 0.5) * 0.5
  }

  _pack () {
    const pos = this._aPos.array, par = this._aParam.array, col = this._aColor.array
    const shp = this._aShape.array, vel = this._aVel.array
    let n = 0
    for (let i = 0; i < POOL_SIZE; i++) {
      const part = this._p[i]
      if (!part.active) continue
      const t = part.age / part.life
      const j3 = n * 3
      pos[j3] = part.x; pos[j3 + 1] = part.y; pos[j3 + 2] = part.z
      vel[j3] = vel[j3 + 1] = vel[j3 + 2] = 0
      if (part.kind === KIND_SPARK) {
        // Yellow-orange to deep orange over its life (sqrt: it cools fast, then lingers orange),
        // full for the first 40% then a fast square-law fade, trail = recent travel.
        const tc = Math.sqrt(t)
        par[j3] = part.scale0
        const f = Math.min(1, (1 - t) / 0.6)
        par[j3 + 2] = part.peak * f * f
        shp[n] = 2
        vel[j3] = part.vx * SPARK_TRAIL; vel[j3 + 1] = part.vy * SPARK_TRAIL; vel[j3 + 2] = part.vz * SPARK_TRAIL
        part.r = SPARK_GLOW * (SPARK_HOT[0] + (SPARK_COOL[0] - SPARK_HOT[0]) * tc)
        part.g = SPARK_GLOW * (SPARK_HOT[1] + (SPARK_COOL[1] - SPARK_HOT[1]) * tc)
        part.b = SPARK_GLOW * (SPARK_HOT[2] + (SPARK_COOL[2] - SPARK_HOT[2]) * tc)
      } else if (part.kind === KIND_CLOD) {
        // Clods hold their size and stay solid, then blink out over the last quarter of life.
        par[j3] = part.scale0
        par[j3 + 2] = part.peak * Math.min(1, (1 - t) * 4)
        shp[n] = 1
      } else {
        // Floaters grow and fade in/out like dust.
        const fade = (1 - t) * (1 - t)
        const rampIn = Math.min(1, t * 5)
        par[j3] = part.scale0 * (1 + FLOAT_GROW * t)
        par[j3 + 2] = part.peak * fade * rampIn
        shp[n] = 0
      }
      par[j3 + 1] = part.rot
      col[j3] = part.r; col[j3 + 1] = part.g; col[j3 + 2] = part.b
      n++
    }
    this._mesh.geometry.instanceCount = n
    // Hidden (testing lab) → no upload: three clears updateRanges only when it uploads, and it never
    // uploads an invisible mesh, so the ranges would pile up until the lab exits. The first visible
    // frame re-packs every live particle from scratch anyway.
    if (n > 0 && this._mesh.visible) {
      for (const a of this._attrs) {
        a.addUpdateRange(0, n * a.itemSize)
        a.needsUpdate = true
      }
    }
  }

  /**
   * Push the day/night irradiance multiplier (SkySystem.particleLight) into the shader. Called once
   * per render frame from main.js — these billboards are unlit, so this is their only light source.
   * @param {THREE.Color} c — linear RGB multiplier; 1,1,1 is the authored daylight look.
   * @param {number} alpha — opacity multiplier for the same reason (see the shader note).
   */
  setLight (c, alpha) {
    const u = this._mesh.material.uniforms
    u.uLight.value.copy(c)
    u.uLightA.value = alpha
  }

  /**
   * Advance + emit. Call once per render frame, right after TireSmokeSystem.update.
   *
   * @param {number} dt          render frame time [s]
   * @param {object} vehicleState
   * @param {object} params      RANGER_PARAMS
   * @param {(x:number,z:number)=>number} groundYAt        ground surface height sampler
   * @param {((x:number,z:number)=>number)} [looseFactorAt] 0..1 loose-surface factor (main.js's
   *        looseSurfaceFactor: ~0.1 on asphalt, 1 off-road). Defaults to 1 (all loose).
   */
  update (dt, vehicleState, params, groundYAt, looseFactorAt) {
    if (dt <= 0) return
    if (dt > 0.1) dt = 0.1
    const enabled = params.dirtSprayEnabled !== false
    const amount = params.dirtSprayAmount ?? 1.0

    // ── Integrate ─────────────────────────────────────────────────────────────
    let shedBudget = enabled ? SHED_BUDGET : 0
    const floatDragF = Math.exp(-FLOAT_DRAG * dt)
    for (let i = 0; i < POOL_SIZE; i++) {
      const part = this._p[i]
      if (!part.active) continue
      part.age += dt
      if (part.age >= part.life) { part.active = false; continue }
      if (part.kind !== KIND_FLOAT) {
        part.vy -= GRAVITY * dt
        part.x += part.vx * dt
        part.y += part.vy * dt
        part.z += part.vz * dt
        // Ballistic clods (and sparks) die on impact rather than sinking through the terrain.
        if (part.vy < 0 && part.y <= part.gy) { part.active = false; continue }
        if (part.kind === KIND_SPARK) continue
        // Shed a floater now and then — this is what makes the dust peel OFF the stream.
        part.shed += SHED_RATE * dt
        if (part.shed >= 1 && shedBudget > 0) {
          part.shed -= 1
          shedBudget--
          this._spawnFloater(part)
        } else if (part.shed > 1) part.shed = 1
      } else {
        part.vy -= FLOAT_SINK * dt
        part.vx *= floatDragF
        part.vy *= floatDragF
        part.vz *= floatDragF
        part.x += part.vx * dt
        part.y += part.vy * dt
        part.z += part.vz * dt
      }
    }

    if (!enabled) { this._emitAccum[0] = this._emitAccum[1] = this._emitAccum[2] = this._emitAccum[3] = 0; this._pack(); return }

    // Sparks: speed gate once for the truck (a rim grinds at road speed, not slip speed).
    const roadV = Math.hypot(vehicleState.velocity.x, vehicleState.velocity.z)
    let sparkU = (roadV - SPARK_V_FLOOR) / (SPARK_V_FULL - SPARK_V_FLOOR)
    if (sparkU > 1) sparkU = 1
    const rims = sparkU > 0 ? vehicleState.rimOnRoad : null
    const vel = vehicleState.velocity

    const px = vehicleState.position.x
    const py = vehicleState.position.y
    const pz = vehicleState.position.z

    // World-space body axes. Rotating body +Z by q gives (2(xz+wy), ·, 1−2(x²+y²)) — and body +Z
    // IS rearward (forward = −Z), so that rotated axis is the throw direction directly, no negation.
    // `right` = body +X, used to aim the lateral-slip flavour.
    const q = vehicleState.quaternion
    const bx = 2 * (q.x * q.z + q.y * q.w)
    const bz = 1 - 2 * (q.x * q.x + q.y * q.y)
    const rgtX = 1 - 2 * (q.y * q.y + q.z * q.z)
    const rgtZ = 2 * (q.x * q.z - q.y * q.w)   // first column of the rotation matrix: (1−2(y²+z²), ·, 2(xz−wy))

    const L = params.wheelbase
    const wF = params.weightFront, wR = params.weightRear
    const tF = params.trackFront / 2, tR = params.trackRear / 2
    const hubY = params.wheelRadius - params.cgHeight

    for (let i = 0; i < 4; i++) {
      const isFront = i < 2
      const isLeft = i === 0 || i === 2
      const lxOff = isLeft ? -(isFront ? tF : tR) : (isFront ? tF : tR)
      const lzOff = isFront ? -(L * wR) : (L * wF)

      const r = rotateByQuat(lxOff, hubY, lzOff, vehicleState.quaternion)
      const wx = px + r.x, wy = py + r.y, wz = pz + r.z

      const groundY = groundYAt ? groundYAt(wx, wz) : 0
      const wheelBottom = wy - params.wheelRadius
      if (wheelBottom - groundY > CONTACT_BAND) { this._emitAccum[i] = 0; this._sparkWait[i] = 0; continue }

      // Loose surface only: on asphalt there is nothing to throw. Cheap (memoized carveHint).
      const loose = looseFactorAt ? looseFactorAt(wx, wz) : 1
      if (loose < LOOSE_FLOOR) {
        this._emitAccum[i] = 0
        // ...except a rim on the road, which throws sparks off both lips (asphalt only).
        const rate = 2 * SPARK_RATE * Math.pow(sparkU, SPARK_RATE_EXP) * amount
        if (!rims?.[i] || rate <= 0) { this._sparkWait[i] = 0; continue }
        // Poisson, not a metronome: each gap is drawn from the exponential distribution (mean
        // 1/rate), so sparks clump and gap at random instead of coming off evenly spaced.
        const lip = SPARK_LIP * (params.wheelWidth || 0.25)
        this._sparkWait[i] -= dt
        let budget = EMIT_BUDGET
        while (this._sparkWait[i] <= 0 && budget-- > 0) {
          // SUB-FRAME BIRTH. The overdue wait IS how long ago, inside this frame, the spark was due.
          // Spawn it where the wheel was then (back along the truck's own velocity), already that
          // old. Without this every spark of a frame starts at the wheel's end-of-frame position,
          // and the stream strobes into rows one frame's travel apart (0.28 m at 37 mph).
          const ago = Math.min(dt, -this._sparkWait[i])
          this._sparkWait[i] -= Math.log(1 - Math.random()) / rate
          const side = Math.random() < 0.5 ? -1 : 1
          const fa = (Math.random() - 0.5) * 0.2   // m, fore-aft along the contact patch
          this._spawnSpark(wx + rgtX * lip * side + bx * fa - vel.x * ago, groundY,
            wz + rgtZ * lip * side + bz * fa - vel.z * ago, sparkU, side, bx, bz, rgtX, rgtZ, ago)
        }
        if (this._sparkWait[i] < 0) this._sparkWait[i] = 0   // don't bank a backlog
        continue
      }
      this._sparkWait[i] = 0

      // Combined contact-patch slip. NOTE: wheelDebug[i].sa is friction-circle-clamped at ≈0.06
      // (BUG-20 break-away clamp) and never reflects real slip magnitude — vLong/vLat are the
      // unclamped m/s signals. Same gotcha smoke.js documents.
      const wd = vehicleState.wheelDebug?.[i]
      const vLong = wd?.vLong || 0
      const vLat = wd?.vLat || 0
      const slip = Math.hypot(vLong, vLat)
      if (slip <= SLIP_MIN) { this._emitAccum[i] = 0; continue }

      let intensity = (slip - SLIP_MIN) / (SLIP_FULL - SLIP_MIN)
      if (intensity > 1) intensity = 1
      const rate = intensity * loose * amount
      if (rate <= 0.02) { this._emitAccum[i] = 0; continue }

      this._emitAccum[i] += rate * MAX_RATE * dt
      let budget = EMIT_BUDGET
      while (this._emitAccum[i] >= 1 && budget-- > 0) {
        this._emitAccum[i] -= 1
        this._spawnClod(wx, groundY, wz, intensity, vLat, bx, bz, rgtX, rgtZ, loose)
      }
      if (this._emitAccum[i] > 2) this._emitAccum[i] = 2   // don't bank a backlog
    }

    this._pack()
  }
}

const WHITE = new THREE.Color(0xffffff)
