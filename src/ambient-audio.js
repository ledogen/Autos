/**
 * src/ambient-audio.js — FEAT-120: the world's ambient voices. Both synthesized, built once as
 * always-running generators whose gains move (the tire-audio.js pattern), on the world bus
 * (engine-audio.js). The owner kept both takes on 2026-11-02; prototypes in tools/audio-proto/proto-b2.js.
 *
 *   crickets — field-cricket song: a 4.2–5 kHz carrier gated into chirps of 3–5 pulses (~30 pulses/s),
 *              each voice at its own 1.6–2.6 chirps/s, one close and the rest off in the dark. Night
 *              only (sky.js nightWeight), and ONLY with the truck under 5 mph: a slow ~10 s fade in,
 *              out above it (owner, 2026-11-02).
 *   grass    — off-road over green ground: blades (a broad ~3 kHz band) and stems dragging the bumper
 *              (~900 Hz), as discrete BRUSH HITS with a sharp attack and a tail over a quiet bed
 *              (owner, 2026-11-02: "needs attack and release" — the take's symmetric swells did not).
 */

import { getAudioContext, getWorldBus, whiteNoiseBuffer, loopNoise } from './engine-audio.js'

let ctx = null
let started = false
let enabled = true
let cricketVol = 0.5
let grassVol = 0.5

const CRICKET_MAX_MS = 5 * 0.44704   // 5 mph
const CRICKET_IN_S = 10             // s — the fade in, parked [DEFAULT] (owner, 2026-11-02: "~10 s")
const CRICKET_OUT_S = 1.5            // s — the fade out above 5 mph
const CRICKET_LEVEL = 0.06           // the take's level
const GRASS_FULL_MS = 12             // m/s — the brush is at full level from here
const GRASS_BED = 0.25               // the continuous bed under the hits, as a share of the hit level
const HITS_PER_MS = 0.6              // brush hits per second per m/s through full cover (10 m/s → 6/s)
const GRASS_LEVEL = 0.5              // the take's level

let crOut = null
let crFade = 0         // 0..1, linear in time; the gain is its square, so the swell is even in dB
const voices = []      // { g, rate, next }
let hiG = null, loG = null, hi = null

const clamp01 = x => Math.max(0, Math.min(1, x))

/** Debug-menu controls, read every frame by main.js. */
export function setAmbientAudio (on, crickets, grass) {
  enabled = !!on
  cricketVol = crickets
  grassVol = grass
}

/** Build the graph once (idempotent); call from a user gesture like the other ensure* calls. */
export function ensureAmbientAudio () {
  if (started) return
  ctx = getAudioContext()
  if (!ctx) return
  const bus = getWorldBus(), noise = whiteNoiseBuffer(ctx, 3)
  const gain = (g, to) => { const n = ctx.createGain(); n.gain.value = g; n.connect(to); return n }
  const filt = (type, f, q, to) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.connect(to); return n }

  crOut = gain(0, bus)
  for (let i = 0; i < 4; i++) {
    const near = i === 0 ? 1 : 0.25 + 0.4 * Math.random()
    const g = gain(0, filt('lowpass', near > 0.6 ? 12000 : 6000, 0.7, gain(near, crOut)))
    const o = ctx.createOscillator()
    o.frequency.value = 4200 + Math.random() * 800
    o.connect(g); o.start()
    voices.push({ g, rate: 1.6 + Math.random(), next: 0 })
  }

  const out = gain(GRASS_LEVEL, bus)
  hiG = gain(0, out); hi = filt('bandpass', 3000, 0.6, hiG)
  loG = gain(0, out)
  loopNoise(ctx, noise).connect(hi)
  loopNoise(ctx, noise).connect(filt('bandpass', 900, 1.2, loG))
  started = true
}

/**
 * Per frame. `speed` [m/s]; `night` 0..1 (sky.js nightWeight); `green` 0..1, the vegetation under the
 * truck off the road (0 on it); `dt` the frame's real seconds.
 */
export function updateAmbientAudio (speed, night, green, dt) {
  if (!started || ctx.state !== 'running') return
  const now = ctx.currentTime

  // Crickets: the gate fades in slowly and out quickly; chirps are scheduled a frame ahead. An
  // exponential approach in amplitude sounded near-full in ~4 s — the fade is linear and squared.
  const slow = enabled && speed < CRICKET_MAX_MS
  crFade = clamp01(crFade + (slow ? dt / CRICKET_IN_S : -dt / CRICKET_OUT_S))
  crOut.gain.setTargetAtTime(CRICKET_LEVEL * cricketVol * night * crFade * crFade, now, 0.05)
  if (night > 0) {
    for (const v of voices) {
      if (v.next < now) v.next = now + Math.random() * 0.6   // first frame, or the tab slept
      while (v.next < now + 0.05) {
        const pulses = 3 + Math.floor(Math.random() * 3)
        for (let p = 0; p < pulses; p++) {
          const a = v.next + p * 0.033
          v.g.gain.setValueAtTime(0, a)
          v.g.gain.linearRampToValueAtTime(1, a + 0.004)
          v.g.gain.setValueAtTime(1, a + 0.012)
          v.g.gain.linearRampToValueAtTime(0, a + 0.018)
        }
        v.next += (1 / v.rate) * (0.92 + 0.16 * Math.random())
      }
    }
  }

  // Grass: a bed at GRASS_BED of the level, and brush hits on top — sharp attack, a 0.12–0.3 s tail.
  const lvl = enabled ? grassVol * green * clamp01(speed / GRASS_FULL_MS) ** 0.8 : 0
  hi.frequency.setTargetAtTime(2400 + 1400 * clamp01(speed / GRASS_FULL_MS), now, 0.2)
  let hits = 0
  for (let p = HITS_PER_MS * speed * green * dt; p > 0; p -= 1) if (Math.random() < Math.min(1, p)) hits++
  if (!hits) {
    hiG.gain.setTargetAtTime(lvl * GRASS_BED * 0.6, now, 0.15)
    loG.gain.setTargetAtTime(lvl * GRASS_BED * 0.45, now, 0.15)
  }
  for (let i = 0; i < hits; i++) {
    const t = now + Math.random() * dt, peak = lvl * (0.5 + 0.5 * Math.random()), rel = 0.12 + 0.18 * Math.random()
    for (const [g, share] of [[hiG, 0.6], [loG, 0.45]]) {
      g.gain.setTargetAtTime(peak * share, t, 0.004)
      g.gain.setTargetAtTime(lvl * GRASS_BED * share, t + 0.015, rel)
    }
  }
}
