/**
 * FEAT-221: live exposure compensation (DEC-262). On by default; `?ae=0` turns it off (the A/B switch).
 *
 * The eye in sky.js adapts to the time of day only: it knows how much light falls on open ground, not what the
 * camera is looking at. This adds a camera on top: it meters the frame it just drew and sets an exposure scale k
 * (land into ACES and sky + fog into their grade alike, sky.setLiveExposure) so that what it sees reads toward
 * what open ground reads at this hour (sky.openGrey). In the open k stays ~1; in a tunnel or a mountain's shadow it
 * opens up; in a headlight patch or a lit bay at night it stops down and the dark around goes black.
 *
 * METERING. The drawn frame is copied (one full-resolution texture copy), shrunk to METER_W × METER_H cells (4 × 4
 * point taps each, the log of their luminance averaged: a geometric mean, the usual photographic key) and read back
 * asynchronously (a fence + pixel buffer, three's readRenderTargetPixelsAsync): no pipeline stall, the value lands
 * 1–3 frames late, which a second-scale adaptation never notices. The cells are centre-weighted (a Gaussian, σ = 0.22
 * of the width). Cost ≤ 0.16 ms GPU per pass, every EVERY-th frame (FEAT-221 log).
 *
 * ADAPTATION, in stops (log2 k): d = log2 openGrey + CAL − (log2 metered − log2 k), the metered key as it would be at
 * k = 1 against open ground's. Within ±BAND of it nothing moves; past it, target = STRENGTH × the excess, clamped to
 * [−LO, +HI], +HI fading to 0 with the night (after dark the camera only stops down: the night's darkness is the
 * eye's, DEC-199). k eases toward the target with time constant OPEN_TAU when opening up (into a tunnel) and
 * CLOSE_TAU when stopping down (out into the light: the overexposed moment).
 */
import * as THREE from 'three'

const METER_W = 64, METER_H = 36, EVERY = 2   // meter cells; meter every EVERY-th frame
// log2 offset between the centre-weighted key and openGrey in an open daylight view: the mean of 8 views (noon,
// 15:30, 20:00, tunnel approach and exit; seeds 3583777560 and 1172941705, chase and road-level cameras), spread
// ±0.4 stop. What k = 1 means.
const CAL = -1.35
// Owner, 2026-11-15 (card feat221-look, DEC-262): deadband 0.3 stop; opening up 3× slower than the prototype's 2 s;
// stopping down kept (~1 s to settle out of a tunnel).
const BAND = 0.3, STRENGTH = 0.75, LO = 2, HI = 2.5, OPEN_TAU = 6.0, CLOSE_TAU = 0.6

const DOWN_FRAG = /* glsl */`
uniform sampler2D src;
uniform vec2 srcSize;
varying vec2 vUv;
float lin (float c) { return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4); }
void main () {
  vec2 cell = srcSize / vec2(${METER_W}.0, ${METER_H}.0);
  vec2 o = (floor(vUv * vec2(${METER_W}.0, ${METER_H}.0)) * cell);
  float s = 0.0;
  for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) {
    vec3 c = texture2D(src, (o + (vec2(i, j) + 0.5) * cell / 4.0) / srcSize).rgb;
    float Y = dot(vec3(lin(c.r), lin(c.g), lin(c.b)), vec3(0.2126, 0.7152, 0.0722));
    s += log2(max(Y, 1.0 / 65536.0));
  }
  gl_FragColor = vec4(vec3((s / 16.0 + 16.0) / 16.0), 1.0);   // log2 Y over [−16, 0] in 8 bits: 1/16 stop a step
}`

export class LiveExposure {
  constructor (renderer, sky) {
    this.renderer = renderer; this.sky = sky
    this.ev = 0                       // current log2 k
    this._target = 0
    this._frame = 0; this._busy = false
    this._tex = null
    this._rt = new THREE.WebGLRenderTarget(METER_W, METER_H, { depthBuffer: false })
    this._buf = new Uint8Array(METER_W * METER_H * 4)
    this._mat = new THREE.ShaderMaterial({
      uniforms: { src: { value: null }, srcSize: { value: new THREE.Vector2() } },
      vertexShader: 'varying vec2 vUv; void main () { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: DOWN_FRAG, depthTest: false, depthWrite: false, toneMapped: false,
    })
    this._quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._mat)
    this._quad.frustumCulled = false
    this._scene = new THREE.Scene(); this._scene.add(this._quad)
    this._cam = new THREE.Camera()
    this._size = new THREE.Vector2()
    this._w = new Float32Array(METER_W * METER_H)   // centre weights (row 0 of the read-back is the BOTTOM)
    this._wSum = 0
    for (let y = 0; y < METER_H; y++) for (let x = 0; x < METER_W; x++) {
      const u = (x + 0.5) / METER_W - 0.5, dy = ((y + 0.5) / METER_H - 0.5) * METER_H / METER_W
      this._wSum += this._w[y * METER_W + x] = Math.exp(-(u * u + dy * dy) / (2 * 0.22 * 0.22))
    }
  }

  /** Before the world render: ease k toward the target and put it on the renderer and the sky. */
  update (dt) {
    const tau = this._target > this.ev ? OPEN_TAU : CLOSE_TAU
    this.ev += (this._target - this.ev) * (1 - Math.exp(-dt / tau))
    this.sky.setLiveExposure(Math.pow(2, this.ev))
  }

  /** Right after the world render (the canvas still holds the frame): copy, shrink, read back without a stall. */
  meter () {
    if (this._busy || ++this._frame % EVERY) return
    const r = this.renderer
    r.getDrawingBufferSize(this._size)
    if (!this._tex || this._tex.image.width !== this._size.x || this._tex.image.height !== this._size.y) {
      this._tex?.dispose()
      this._tex = new THREE.FramebufferTexture(this._size.x, this._size.y)
      this._mat.uniforms.src.value = this._tex
      this._mat.uniforms.srcSize.value.copy(this._size)
    }
    r.copyFramebufferToTexture(this._tex)
    const prevRT = r.getRenderTarget()
    r.setRenderTarget(this._rt); r.render(this._scene, this._cam); r.setRenderTarget(prevRT)
    const evAt = this.ev, ref = Math.log2(Math.max(this.sky.openGrey, 1e-6)) + CAL
    this._busy = true
    r.readRenderTargetPixelsAsync(this._rt, 0, 0, METER_W, METER_H, this._buf).then(() => {
      let s = 0
      for (let i = 0; i < this._w.length; i++) s += this._w[i] * (this._buf[i * 4] / 255 * 16 - 16)
      // ponytail: undoes k as if the response were linear (it is through the sky's grade, not quite through ACES's
      // toe/shoulder), so the effective strength drifts a little off STRENGTH; invert ACES if that ever matters.
      const d = ref - (s / this._wSum - evAt), e = Math.sign(d) * Math.max(0, Math.abs(d) - BAND)
      this._target = Math.min(HI * (1 - this.sky.nightFactor()), Math.max(-LO, STRENGTH * e))
    }).catch(() => {}).finally(() => { this._busy = false })   // BUG-182: a lost context fails the read; skip it
  }
}
