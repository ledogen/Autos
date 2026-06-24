/**
 * src/dust.js — RangerSim wheel dust trails (FEAT — visual polish)
 *
 * Dirt-cheap, self-contained dust/dirt kick-up behind the wheels. Stylized soft
 * sprite puffs (camera-facing billboards) drawn from a fixed pool — no per-frame
 * allocation, one shared procedural texture (no image assets — matches the project's
 * D-01 "procedural vertex colour only" discipline in road-mesh.js / terrain.js).
 *
 * Design goals (per request):
 *  - Cheap: fixed Sprite pool (POOL_SIZE), recycled. No GC churn, ~one tiny draw
 *    call per live sprite, depthWrite:false so they never disturb the depth buffer.
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
const DRAG           = 1.7     // 1/s — horizontal velocity damping
const PEAK_OPACITY   = 0.22    // alpha at a puff's strongest, before intensity/road scaling
                               // (kept low + dense — many faint puffs read as a soft haze, not pops)
const CONTACT_BAND   = 0.28    // m — wheel-bottom within this of the ground counts as in-contact
const SPEED_FLOOR    = 1.6     // m/s — below this a rolling wheel makes no dust
const TRAIL_BACK     = 0.45    // fraction of car velocity the puff inherits backward (lags the truck)

/**
 * Build the soft round puff texture once on a small canvas (procedural — no asset file).
 * White radial gradient, fully transparent at the rim, so SpriteMaterial.color tints it
 * to the dirt colour and per-sprite opacity fades it out.
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

    // Parallel particle state. Each slot owns one Sprite (with its own material so
    // opacity/colour/rotation are independent) plus integrator scratch.
    this._p = []
    for (let i = 0; i < POOL_SIZE; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this._tex,
        transparent: true,
        depthWrite: false,   // transparent puffs must not write depth (no haloing)
        depthTest: true,     // but terrain/road still occlude them
        opacity: 0,
        fog: true,           // fade into scene.fog like everything else
      })
      const sprite = new THREE.Sprite(mat)
      sprite.visible = false
      sprite.frustumCulled = false  // cheap pool; skip per-sprite cull math
      scene.add(sprite)
      this._p.push({
        sprite,
        active: false,
        age: 0,
        life: 1,
        vx: 0, vy: 0, vz: 0,
        scale0: 0.5,
        peak: PEAK_OPACITY,
      })
    }
    this._cursor = 0                 // round-robin allocation pointer
    this._emitAccum = [0, 0, 0, 0]   // per-wheel fractional puff accumulator
    this._dustColor = new THREE.Color()
    this._tmpColor = new THREE.Color()
  }

  /** Grab the next pool slot (oldest is overwritten when the pool is saturated). */
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

  _spawn (x, y, z, intensity, carVx, carVz, opacityScale) {
    const part = this._alloc()
    const p = this._params

    // Colour: dirt we're driving on, lifted toward white so airborne dust catches light.
    // Per-puff brightness jitter keeps a stylized cloud from reading as a flat decal.
    this._dustColor.set(p.dustColor ?? 0xc9b79a)
    const jitter = 0.85 + Math.random() * 0.3
    this._tmpColor.copy(this._dustColor).lerp(WHITE, 0.18).multiplyScalar(jitter)
    part.sprite.material.color.copy(this._tmpColor)
    part.sprite.material.rotation = Math.random() * Math.PI * 2

    part.active = true
    part.age = 0
    part.life = LIFE_MIN + (LIFE_MAX - LIFE_MIN) * (0.4 + 0.6 * intensity) * (0.8 + Math.random() * 0.4)
    part.scale0 = SCALE_MIN + (SCALE_MAX - SCALE_MIN) * Math.random()
    // Opacity scales with how hard the tyre works AND the road factor (faint on tarmac) — density
    // is left untouched so on-road dust stays a full-coverage thin haze rather than sparse pops.
    part.peak = PEAK_OPACITY * Math.min(1, 0.35 + intensity) * (opacityScale ?? 1)

    // Spawn just above the contact patch with a little random offset so puffs don't stack.
    part.sprite.position.set(
      x + (Math.random() - 0.5) * 0.3,
      y + 0.08 + Math.random() * 0.12,
      z + (Math.random() - 0.5) * 0.3
    )

    // Velocity: upward billow + lateral scatter + a backward drag of the car's own motion
    // so the trail lags behind the truck instead of riding with it.
    part.vx = (Math.random() - 0.5) * SPREAD - carVx * TRAIL_BACK
    part.vy = RISE_MIN + (RISE_MAX - RISE_MIN) * Math.random()
    part.vz = (Math.random() - 0.5) * SPREAD - carVz * TRAIL_BACK

    part.sprite.scale.setScalar(part.scale0)
    part.sprite.material.opacity = part.peak
    part.sprite.visible = true
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
      const t = part.age / part.life
      if (t >= 1) {
        part.active = false
        part.sprite.visible = false
        continue
      }
      // Settle + horizontal drag.
      part.vy -= SETTLE * dt
      const dragF = Math.max(0, 1 - DRAG * dt)
      part.vx *= dragF
      part.vz *= dragF
      const s = part.sprite
      s.position.x += part.vx * dt
      s.position.y += part.vy * dt
      s.position.z += part.vz * dt
      // Grow + fade. Opacity rises briefly then fades to zero (ease-out on t).
      s.scale.setScalar(part.scale0 * (1 + SCALE_GROW * t))
      const fade = (1 - t) * (1 - t)
      const rampIn = Math.min(1, t * 6)  // quick fade-in over first ~1/6 of life
      s.material.opacity = part.peak * fade * rampIn
    }

    // ── Emit from wheels in ground contact ────────────────────────────────────
    if (!enabled) return

    const speed = Math.hypot(vehicleState.velocity.x, vehicleState.velocity.z)
    if (speed < SPEED_FLOOR && !_anySlip(vehicleState)) return

    const px = vehicleState.position.x
    const py = vehicleState.position.y
    const pz = vehicleState.position.z
    const carVx = vehicleState.velocity.x
    const carVz = vehicleState.velocity.z

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

      // Intensity from slip + speed; driven (rear) wheels weighted up.
      const slipV = (vehicleState.wheelDebug?.[i]?.sa) || 0
      const driven = isFront ? 1.0 : 1.45
      let intensity = (slipV * 0.55 + Math.max(0, speed - SPEED_FLOOR) * 0.045) * driven * amount
      if (intensity <= 0.02) { this._emitAccum[i] = 0; continue }
      if (intensity > 1) intensity = 1

      // Reduce dust on the paved ribbon by fading the PUFFS, not thinning them — density stays full
      // (a thin haze), only opacity drops. Cheap: the sampler reuses the memoized road carveHint.
      const opacityScale = onRoadFactorAt ? onRoadFactorAt(wx, wz) : 1

      // Accumulate fractional puffs; spawn whole ones at the contact patch.
      this._emitAccum[i] += intensity * MAX_RATE * dt
      let budget = 6  // per-wheel per-frame cap (guards against dt spikes)
      while (this._emitAccum[i] >= 1 && budget-- > 0) {
        this._emitAccum[i] -= 1
        this._spawn(wx, groundY, wz, intensity, carVx, carVz, opacityScale)
      }
      if (this._emitAccum[i] > 2) this._emitAccum[i] = 2  // don't bank a backlog
    }
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
