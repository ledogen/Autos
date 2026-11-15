/**
 * FEAT-221 PROTOTYPE (test branch proto/feat-221-exposure, off unless ?ae=<mode>): live exposure compensation.
 *
 * The eye in sky.js adapts to the time of day only: it knows how much light falls on open ground, not what the
 * camera is looking at. This adds a camera on top: it meters the frame it just drew and sets an exposure scale k
 * (land into ACES and sky + fog into their grade alike, sky.setLiveExposure) so that what it sees reads toward
 * what open ground reads at this hour (sky.openGrey). In the open k stays ~1; in a tunnel, a mountain's shadow or
 * under trees it opens up; in a headlight patch or a lit bay at night it stops down and the dark around goes black.
 *
 * METERING. The drawn frame is copied (one full-resolution texture copy), shrunk to METER_W × METER_H cells (4 × 4
 * point taps each, the log of their luminance averaged: a geometric mean, the usual photographic key) and read back
 * asynchronously (a fence + pixel buffer, three's readRenderTargetPixelsAsync): no pipeline stall, the value lands
 * 1–3 frames late, which a ~1 s adaptation never notices. The cells are then weighted on the CPU by the mode:
 *   avg     whole frame, every cell alike
 *   centre  centre-weighted (a Gaussian, σ = 0.22 of the width)
 *   low     ground-weighted: nothing from the top third, ramping to full by mid-frame (mostly keeps the sky out)
 *
 * ADAPTATION, in stops (log2 k): target = strength × (log2 openGrey + cal − log2 metered), clamped to [−lo, +hi];
 * k eases toward it with time constant `dark` when opening up (into shade) and `bright` when stopping down (out
 * into the light: the overexposed moment). Every knob is a URL parameter, defaults below.
 */
import * as THREE from 'three'

const METER_W = 64, METER_H = 36, EVERY = 2   // meter cells; meter every EVERY-th frame
// Each mode's log2 offset between the metered key and openGrey on an open noon road (measured on the prototype,
// seeds 3583777560 / 1172941705, chase view): what k = 1 means for that mode.
const CAL = { avg: 0, centre: 0, low: 0 }

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
  constructor (renderer, sky, params) {
    const num = (k, d) => { const v = parseFloat(params.get(k)); return Number.isFinite(v) ? v : d }
    this.mode = CAL[params.get('ae')] !== undefined ? params.get('ae') : 'centre'
    this.strength = num('aeS', 0.75); this.lo = num('aeLo', 2); this.hi = num('aeHi', 1.5)
    this.dark = num('aeDark', 2.0); this.bright = num('aeBright', 0.6)
    this.renderer = renderer; this.sky = sky
    this.ev = 0                       // current log2 k
    this.metered = 0                  // last metered key, log2 of displayed luminance (read by the shoot script)
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
    // Cell weights per mode (row 0 of the read-back is the BOTTOM of the frame).
    this._w = new Float32Array(METER_W * METER_H)
    for (let y = 0; y < METER_H; y++) for (let x = 0; x < METER_W; x++) {
      const u = (x + 0.5) / METER_W - 0.5, v = (y + 0.5) / METER_H, i = y * METER_W + x
      const dy = (v - 0.5) * METER_H / METER_W
      this._w[i] = this.mode === 'avg' ? 1
        : this.mode === 'centre' ? Math.exp(-(u * u + dy * dy) / (2 * 0.22 * 0.22))
          : Math.min(1, Math.max(0, (2 / 3 - v) / (1 / 6)))
    }
  }

  /** Before the world render: ease k toward the target and put it on the renderer and the sky. */
  update (dt) {
    const tau = this._target > this.ev ? this.dark : this.bright
    this.ev += (this._target - this.ev) * (1 - Math.exp(-dt / Math.max(tau, 1e-3)))
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
    const evAt = this.ev, ref = Math.log2(Math.max(this.sky.openGrey, 1e-6)) + CAL[this.mode]
    this._busy = true
    r.readRenderTargetPixelsAsync(this._rt, 0, 0, METER_W, METER_H, this._buf).then(() => {
      let s = 0, ws = 0
      for (let i = 0; i < this._w.length; i++) { s += this._w[i] * (this._buf[i * 4] / 255 * 16 - 16); ws += this._w[i] }
      // ponytail: undoes k as if the response were linear (it is through the sky's grade, not quite through ACES's
      // toe/shoulder), so the effective strength drifts a little off `strength`; invert ACES if that ever matters.
      this.metered = s / ws
      this._target = Math.min(this.hi, Math.max(-this.lo, this.strength * (ref - (this.metered - evAt))))
    }).finally(() => { this._busy = false })
  }
}
