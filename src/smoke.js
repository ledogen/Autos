/**
 * src/smoke.js — RangerSim tire smoke (FEAT — visual polish)
 *
 * Grey burnout/wheelspin smoke, structurally identical to src/dust.js's instanced-billboard
 * puff pool (see that file's header for the rendering rationale — one InstancedMesh, one draw
 * call, no per-frame allocation). Kept as a SEPARATE system rather than folded into dust.js:
 * dust is dirt kicked up by a rolling/slipping tyre and fades on pavement (onRoadFactorAt);
 * smoke is friction heat off the rubber itself, happens on ANY surface (pavement included —
 * that is where burnouts read strongest), and needs its own emission model.
 *
 * Emission (the point of this system): quantity is gated by contact-patch slip velocity AND
 * normal force TOGETHER (product, not sum) — vehicleState.wheelDebug[i].sa (slip, m/s) times
 * wheelDebug[i].fn (Pacejka normal force, N) normalized against static per-wheel weight. A
 * wheel slipping hard but unloaded/airborne (fn≈0) does not smoke; a heavily loaded wheel
 * rolling without slip does not smoke either. Only a loaded, slipping tyre does.
 *
 * Conventions: wheel index 0=FL 1=FR 2=RL 3=RR (GLOSSARY.md §Wheel Index).
 * Car forward = -Z, left = -X (GLOSSARY.md §Coordinate System).
 */

import * as THREE from 'three'

// ── Pool / tuning constants ──────────────────────────────────────────────────
const POOL_SIZE      = 200     // max simultaneous puffs across all four wheels
const MAX_RATE        = 55     // puffs/sec emitted by a single wheel at full intensity
const LIFE_MIN        = 1.8    // s — smoke lingers longer than dust
const LIFE_MAX         = 3.6   // s
const SCALE_MIN       = 0.55   // m — initial billboard size
const SCALE_MAX        = 1.0
const SCALE_GROW      = 3.2    // smoke billows out more than dust over its life
const RISE_MIN         = 0.55  // m/s — initial upward drift
const RISE_MAX          = 1.35
const SPREAD           = 0.9   // m/s — random lateral scatter
const SETTLE           = 0.15  // m/s² — smoke is lighter than dust, rises longer before settling
const DRAG              = 3.5  // 1/s — horizontal velocity damping (kills the slip kick fast)
const PEAK_OPACITY     = 0.36  // alpha at a puff's strongest, before intensity scaling
const CONTACT_BAND     = 0.28  // m — wheel-bottom within this of the ground counts as in-contact
const SLIP_KICK         = 0.5  // fraction of contact-patch slip velocity kicked out backward
const SLIP_REF          = 20.0 // m/s — vLong at which the slip factor saturates to 1 (probe: hard
                               // grip-limited launches hit 2-4 m/s, burnouts 15-23 m/s — this only
                               // reaches full density in a near-max-slip burnout)
const RAMP_TIME          = 0.5 // s — per-wheel intensity ramps linearly to its target over this
                               // long, in both directions, so smoke builds up and dies down instead
                               // of popping instantly with the raw slip×load signal
const LOAD_REF_G        = 9.81 // m/s² — used to derive nominal static per-wheel load from mass

/** Build the soft round puff texture once on a small canvas (shared shape with dust, own instance
 *  so smoke's material/uniforms stay fully independent of dust's). */
function makePuffTexture () {
  const S = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = S
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
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

export class TireSmokeSystem {
  /**
   * @param {THREE.Scene} scene
   * @param {object} params  RANGER_PARAMS — reads smokeEnabled / smokeColor / smokeAmount + vehicle geometry live
   */
  constructor (scene, params) {
    this._params = params
    this._tex = makePuffTexture()

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
    geo.setAttribute('aPos', this._aPos)
    geo.setAttribute('aParam', this._aParam)
    geo.setAttribute('aColor', this._aColor)
    geo.instanceCount = 0

    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: this._tex } }]),
      vertexShader: /* glsl */`
        attribute vec3 aPos;
        attribute vec3 aParam;   // scale, rotation, opacity
        attribute vec3 aColor;
        varying vec2 vUv;
        varying vec3 vColor;
        varying float vOpacity;
        #include <fog_pars_vertex>
        void main () {
          vUv = uv;
          vColor = aColor;
          vOpacity = aParam.z;
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
        #include <fog_pars_fragment>
        void main () {
          vec4 tex = texture2D(uMap, vUv);
          gl_FragColor = vec4(vColor * tex.rgb, tex.a * vOpacity);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      fog: true,
    })
    this._mesh = new THREE.Mesh(geo, mat)
    this._mesh.frustumCulled = false
    this._mesh.renderOrder = 2
    scene.add(this._mesh)

    this._p = []
    for (let i = 0; i < POOL_SIZE; i++) {
      this._p.push({
        active: false,
        age: 0,
        life: 1,
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        scale0: 0.5,
        rot: 0,
        r: 1, g: 1, b: 1,
        peak: PEAK_OPACITY,
      })
    }
    this._cursor = 0
    this._emitAccum = [0, 0, 0, 0]
    this._smoothIntensity = [0, 0, 0, 0]   // per-wheel ramped intensity (RAMP_TIME below)
    this._smokeColor = new THREE.Color()
    this._tmpColor = new THREE.Color()
  }

  /** Show/hide the smoke sheet (testing-lab teardown parity with dust — visibility only). */
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

  _spawn (x, y, z, intensity, slipV, fwdX, fwdZ) {
    const part = this._alloc()
    const p = this._params

    this._smokeColor.set(p.smokeColor ?? 0xcfcfcf)
    const jitter = 0.85 + Math.random() * 0.3
    this._tmpColor.copy(this._smokeColor).multiplyScalar(jitter)
    part.r = this._tmpColor.r; part.g = this._tmpColor.g; part.b = this._tmpColor.b
    part.rot = Math.random() * Math.PI * 2

    part.active = true
    part.age = 0
    part.life = LIFE_MIN + (LIFE_MAX - LIFE_MIN) * (0.4 + 0.6 * intensity) * (0.8 + Math.random() * 0.4)
    part.scale0 = SCALE_MIN + (SCALE_MAX - SCALE_MIN) * Math.random()
    part.peak = PEAK_OPACITY * Math.min(1, 0.35 + intensity)

    part.x = x + (Math.random() - 0.5) * 0.3
    part.y = y + 0.08 + Math.random() * 0.12
    part.z = z + (Math.random() - 0.5) * 0.3

    // Same slip-kick-behind-the-nose + high-drag model as dust.js: shoots out behind the
    // truck's heading at half the slip speed, drag bleeds it off fast, RISE/SETTLE (undamped)
    // carry the puff up and drifting afterward.
    const kick = slipV * SLIP_KICK
    part.vx = (Math.random() - 0.5) * SPREAD - fwdX * kick
    part.vy = RISE_MIN + (RISE_MAX - RISE_MIN) * Math.random()
    part.vz = (Math.random() - 0.5) * SPREAD - fwdZ * kick
  }

  _pack () {
    const pos = this._aPos.array, par = this._aParam.array, col = this._aColor.array
    let n = 0
    for (let i = 0; i < POOL_SIZE; i++) {
      const part = this._p[i]
      if (!part.active) continue
      const t = part.age / part.life
      const fade = (1 - t) * (1 - t)
      const rampIn = Math.min(1, t * 6)
      const j3 = n * 3
      pos[j3] = part.x; pos[j3 + 1] = part.y; pos[j3 + 2] = part.z
      par[j3] = part.scale0 * (1 + SCALE_GROW * t)
      par[j3 + 1] = part.rot
      par[j3 + 2] = part.peak * fade * rampIn
      col[j3] = part.r; col[j3 + 1] = part.g; col[j3 + 2] = part.b
      n++
    }
    this._mesh.geometry.instanceCount = n
    if (n > 0) {
      for (const a of [this._aPos, this._aParam, this._aColor]) {
        a.addUpdateRange(0, n * 3)
        a.needsUpdate = true
      }
    }
  }

  /**
   * Advance + emit. Call once per render frame, after syncMeshesToState (same convention as
   * DustSystem.update — see dust.js).
   *
   * @param {number} dt          render frame time [s]
   * @param {object} vehicleState
   * @param {object} params      RANGER_PARAMS
   * @param {(x:number,z:number)=>number} groundYAt  ground surface height sampler
   */
  update (dt, vehicleState, params, groundYAt) {
    if (dt <= 0) return
    if (dt > 0.1) dt = 0.1
    const enabled = params.smokeEnabled !== false
    const amount = params.smokeAmount ?? 1.0

    for (let i = 0; i < POOL_SIZE; i++) {
      const part = this._p[i]
      if (!part.active) continue
      part.age += dt
      if (part.age >= part.life) { part.active = false; continue }
      part.vy -= SETTLE * dt
      const dragF = Math.max(0, 1 - DRAG * dt)
      part.vx *= dragF
      part.vz *= dragF
      part.x += part.vx * dt
      part.y += part.vy * dt
      part.z += part.vz * dt
    }

    if (!enabled) { this._smoothIntensity.fill(0); this._pack(); return }

    const px = vehicleState.position.x
    const py = vehicleState.position.y
    const pz = vehicleState.position.z

    const q = vehicleState.quaternion
    const fwdX = 2 * (q.x * q.z + q.y * q.w)
    const fwdZ = 1 - 2 * (q.x * q.x + q.y * q.y)

    const L = params.wheelbase
    const wF = params.weightFront, wR = params.weightRear
    const tF = params.trackFront / 2, tR = params.trackRear / 2
    const hubY = params.wheelRadius - params.cgHeight

    // Nominal static per-wheel load — the normal-force half of the slip×load emission model.
    const fzRef = (params.mass * LOAD_REF_G) / 4

    for (let i = 0; i < 4; i++) {
      const isFront = i < 2
      const isLeft = i === 0 || i === 2
      const lx = isLeft ? -(isFront ? tF : tR) : (isFront ? tF : tR)
      const lz = isFront ? -(L * wR) : (L * wF)

      const r = _rotate(lx, hubY, lz, vehicleState.quaternion)
      const wx = px + r.x, wy = py + r.y, wz = pz + r.z

      const groundY = groundYAt ? groundYAt(wx, wz) : 0
      const wheelBottom = wy - params.wheelRadius
      const inContact = (wheelBottom - groundY) <= CONTACT_BAND

      // Raw (unramped) target intensity — 0 while airborne, so the ramp below still eases the
      // smoke OUT rather than cutting it the instant the wheel leaves the ground.
      let targetIntensity = 0
      let slipV = 0
      if (inContact) {
        // NOTE: wheelDebug[i].sa is a friction-circle-clamped value hard-capped at ≈0.06
        // (BUG-20 break-away clamp, see physics.js) — it never reflects real wheelspin magnitude.
        // vLong (= omega·r − longVel, unclamped, m/s) is the actual contact-patch slip speed;
        // confirmed via headless probe: ~2-4 m/s under hard grip-limited launch, 15-23 m/s in a
        // genuine low-traction burnout, while sa sits pinned at 0.06 throughout both.
        slipV = Math.abs(vehicleState.wheelDebug?.[i]?.vLong || 0)
        const fn = (vehicleState.wheelDebug?.[i]?.fn) || 0

        // Simultaneity is the point: smoke needs BOTH a slipping tyre AND a loaded one — a
        // product of the two normalized factors, not a sum. Either at zero kills the smoke.
        const slipFactor = Math.min(1, slipV / SLIP_REF)
        const loadFactor = Math.min(1.5, fn / fzRef)
        targetIntensity = Math.min(1, slipFactor * loadFactor * amount)
      }

      // Ramp toward the target linearly over RAMP_TIME — smoke builds up and dies down instead
      // of popping instantly whenever the raw slip×load signal crosses the threshold.
      const maxStep = dt / RAMP_TIME
      const cur = this._smoothIntensity[i]
      this._smoothIntensity[i] = cur + Math.max(-maxStep, Math.min(maxStep, targetIntensity - cur))
      const intensity = this._smoothIntensity[i]
      if (intensity <= 0.02) { this._emitAccum[i] = 0; continue }

      this._emitAccum[i] += intensity * MAX_RATE * dt
      let budget = 6
      while (this._emitAccum[i] >= 1 && budget-- > 0) {
        this._emitAccum[i] -= 1
        this._spawn(wx, groundY, wz, intensity, slipV, fwdX, fwdZ)
      }
      if (this._emitAccum[i] > 2) this._emitAccum[i] = 2
    }

    this._pack()
  }
}

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
