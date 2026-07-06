/**
 * src/engine-audio.js — FEAT-23: a deliberately simple WebAudio engine drone tied to engine RPM.
 *
 * Not a sample-based engine sim — just a small oscillator stack that sounds "engine-ish" without much
 * cost or code. Firing frequency for a 4-stroke V6 is 3 firings/rev (cylinders/2), so the fundamental is
 * f0 = rpm/60 · 3. We stack a sawtooth at f0, a slightly detuned twin (beating → mechanical roughness),
 * a half-octave sub (the lumpy off-beat of a V engine) and an upper harmonic, run them through a lowpass
 * that opens with revs + throttle, and keep the master gain modest so it never turns into a harsh buzz.
 *
 * The AudioContext can only start after a user gesture (browser autoplay policy), so ensureEngineAudio()
 * is called from main.js's keydown handler; updateEngineAudio(rpm, throttle) is called each render frame.
 */

let ctx = null
let master = null        // GainNode — overall volume
let lp = null            // BiquadFilterNode — lowpass, cutoff tracks revs
let oscs = []            // { osc, gain, mult, detune }
let started = false
let enabled = true
let volume = 0.5         // 0..1 user volume (scales the modest internal gains)

const RPM_MIN = 500      // idle-ish floor for frequency mapping
const F_MIN = 22         // Hz — don't let the fundamental sink into sub-audible mud

// Oscillator recipe: [frequency multiple of f0, relative gain, detune cents, waveform].
const RECIPE = [
  { mult: 1.0,  gain: 0.55, detune: 0,   type: 'sawtooth' },
  { mult: 1.0,  gain: 0.45, detune: 9,   type: 'sawtooth' }, // detuned twin → beating/roughness
  { mult: 0.5,  gain: 0.50, detune: 0,   type: 'sawtooth' }, // half-octave sub → V-engine lump
  { mult: 2.0,  gain: 0.18, detune: 0,   type: 'square'   }, // upper harmonic → bite at high revs
]

/** Create + start the audio graph (idempotent). Must be called from a user gesture. */
export function ensureEngineAudio () {
  if (started) { if (ctx && ctx.state === 'suspended') ctx.resume(); return }
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return
  ctx = new AC()

  lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 400
  lp.Q.value = 0.9

  master = ctx.createGain()
  master.gain.value = 0

  lp.connect(master)
  master.connect(ctx.destination)

  for (const r of RECIPE) {
    const osc = ctx.createOscillator()
    osc.type = r.type
    osc.frequency.value = 60
    osc.detune.value = r.detune
    const g = ctx.createGain()
    g.gain.value = r.gain
    osc.connect(g)
    g.connect(lp)
    osc.start()
    oscs.push({ osc, gain: g, mult: r.mult })
  }
  started = true
}

/**
 * Per-frame update: map engine RPM → fundamental, open the filter with revs/throttle, and set volume.
 * Ramps every param with setTargetAtTime (~50 ms) so nothing zippers.
 */
export function updateEngineAudio (rpm, throttle) {
  if (!started || !ctx) return
  const now = ctx.currentTime
  const tc = 0.05

  if (!enabled) { master.gain.setTargetAtTime(0, now, tc); return }

  const r = Math.max(RPM_MIN, rpm || RPM_MIN)
  const f0 = Math.max(F_MIN, (r / 60) * 3)      // V6 firing fundamental
  for (const o of oscs) o.osc.frequency.setTargetAtTime(f0 * o.mult, now, tc)

  // Filter opens with revs + throttle → brighter under load / at high RPM.
  const th = Math.min(1, Math.max(0, throttle || 0))
  const cutoff = 320 + r * 0.42 + th * 900
  lp.frequency.setTargetAtTime(Math.min(cutoff, 8000), now, tc)

  // Modest, load-aware master gain — idle hum lifts toward a fuller note on throttle. Kept low on purpose.
  const gain = volume * (0.05 + 0.085 * th + 0.00001 * r)
  master.gain.setTargetAtTime(gain, now, tc)
}

export function setEngineAudioEnabled (on) {
  enabled = !!on
  if (!on && started && ctx) master.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
}

export function setEngineAudioVolume (v) { volume = Math.min(1, Math.max(0, v)) }
