/**
 * src/ambient-audio.js — FEAT-120: the world's ambient voices. Both synthesized, built once as
 * always-running generators whose gains move (the tire-audio.js pattern), on the world bus
 * (engine-audio.js). The owner kept both takes on 2026-11-02; prototypes in tools/audio-proto/proto-b2.js.
 *
 *   crickets — field-cricket song: a 4.2–5 kHz carrier gated into chirps of 3–5 pulses (~30 pulses/s),
 *              each voice at its own 1.6–2.6 chirps/s, one close and the rest off in the dark. Night
 *              only (sky.js nightWeight), and ONLY with the truck under 5 mph: a slow ~10 s fade in,
 *              out above it (owner, 2026-11-02).
 *   grass    — off-road over green ground: stems dragging the bumper (~900 Hz), as discrete BRUSH HITS
 *              with a sharp attack and a tail over a quiet bed (owner, 2026-11-02: "needs attack and
 *              release" — the take's symmetric swells did not). The blades' broad ~3 kHz white-noise band
 *              is gone: it was the "high freq hiss thats super loud offroad" (owner, 2026-11-07), ~4× the
 *              stems' level where the ear is most sensitive. A recorded gravel/brush take is owed.
 *   wet      — wet ground (FEAT-120, stands in for wading): spatter, lowpassed ~1.5 kHz noise bursts at
 *              2.5 a second per m/s of wheel speed fusing into a spray hiss, plus playSquelch(k) on a
 *              load spike. Driven by updateAmbientAudio's `wet` (0..1); nothing in the game reports a
 *              wet surface yet, so it is NOT wired (default 0 = silent). Not owner-heard yet.
 */

import { getAudioContext, getWorldBus, whiteNoiseBuffer, loopNoise, audioClockLive } from './engine-audio.js'

let ctx = null
let started = false
let enabled = true
let cricketVol = 0.5
let grassVol = 0.5
let wetVol = 0.5

const CRICKET_MAX_MS = 5 * 0.44704   // 5 mph
const CRICKET_IN_S = 10             // s — the fade in, parked [DEFAULT] (owner, 2026-11-02: "~10 s")
const CRICKET_OUT_S = 1.5            // s — the fade out above 5 mph
const CRICKET_LEVEL = 0.03           // the take's level — halved, −6 dB (owner, 2026-11-06: "Cut the sound volume of the crickets in half")
const GRASS_FULL_MS = 12             // m/s — the brush is at full level from here
const GRASS_BED = 0.25               // the continuous bed under the hits, as a share of the hit level
const HITS_PER_MS = 0.6              // brush hits per second per m/s through full cover (10 m/s → 6/s)
const GRASS_LEVEL = 0.5              // the take's level

let crOut = null
let crFade = 0         // 0..1, linear in time; the gain is its square, so the swell is even in dB
const voices = []      // { g, rate, next }
let loG = null
let wetOut = null, wetHissG = null, wetHissLp = null
const SPATTER_PER_MS = 2.5   // spatter bursts per second per m/s

const clamp01 = x => Math.max(0, Math.min(1, x))

/** Debug-menu controls, read every frame by main.js. */
export function setAmbientAudio (on, crickets, grass, wet = 0.5) {
  enabled = !!on
  cricketVol = crickets
  grassVol = grass
  wetVol = wet
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
  loG = gain(0, out)
  loopNoise(ctx, noise).connect(filt('bandpass', 900, 1.2, loG))

  wetOut = gain(0.35, bus)
  wetHissG = gain(0, wetOut)
  wetHissLp = filt('lowpass', 1500, 0.7, wetHissG)
  loopNoise(ctx, noise).connect(wetHissLp)
  noiseBuf = noise
  started = true
}

let noiseBuf = null
function wetBurst (t, dur, f0, g, f1 = null) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf
  const f = ctx.createBiquadFilter(); f.type = f1 ? 'bandpass' : 'lowpass'; f.frequency.value = f0; f.Q.value = f1 ? 3 : 0.7
  if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur)
  const e = ctx.createGain()
  e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(g, t + 0.004)
  e.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  s.connect(f); f.connect(e); e.connect(wetOut); s.start(t, Math.random() * 2.5); s.stop(t + dur + 0.01)
}

/** A wheel load spike pressing into mud: a noise band sliding 450 → 140 Hz over 0.16 s. `k` 0..1. */
export function playSquelch (k = 0.7) {
  if (!started || !audioClockLive()) return
  wetBurst(ctx.currentTime, 0.16, 450, (0.4 + 0.6 * k) * wetVol, 140)
}

/**
 * Per frame. `speed` [m/s]; `night` 0..1 (sky.js nightWeight); `green` 0..1, the vegetation under the
 * truck off the road (0 on it); `dt` the frame's real seconds.
 */
export function updateAmbientAudio (speed, night, green, dt, wet = 0) {
  if (!started || !audioClockLive()) return
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
  let hits = 0
  for (let p = HITS_PER_MS * speed * green * dt; p > 0; p -= 1) if (Math.random() < Math.min(1, p)) hits++
  if (!hits) loG.gain.setTargetAtTime(lvl * GRASS_BED * 0.45, now, 0.15)
  for (let i = 0; i < hits; i++) {
    const t = now + Math.random() * dt, peak = lvl * (0.5 + 0.5 * Math.random()), rel = 0.12 + 0.18 * Math.random()
    loG.gain.setTargetAtTime(peak * 0.45, t, 0.004)
    loG.gain.setTargetAtTime(lvl * GRASS_BED * 0.45, t + 0.015, rel)
  }

  // Wet ground: a spray hiss that grows as speed^1.5 and brightens, with spatter bursts over it.
  const w = enabled ? wetVol * wet : 0, ws = clamp01(speed / 15)
  wetHissG.gain.setTargetAtTime(w * 0.5 * ws ** 1.5, now, 0.15)
  wetHissLp.frequency.setTargetAtTime(900 + 1200 * ws, now, 0.15)
  for (let p = SPATTER_PER_MS * speed * w * dt; p > 0; p -= 1)
    if (Math.random() < Math.min(1, p)) wetBurst(now + Math.random() * dt, 0.015 + Math.random() * 0.03, 1500, 0.1 + 0.35 * Math.random())
}
