/**
 * src/phone-audio.js — FEAT-288 P7: the phone. Synthesized (no samples, no licence), on the one shared
 * AudioContext, on the master bus dry like result-audio.js (UI, not the world: the cab never colours it).
 * Owner, 2026-11-18: "a ringer can play over the ringer ring card and then a click or flipping a flip
 * phone shut can play over the ending". main.js _renderDialogue plays them from the frame cards
 * DialogueSystem._frame marks (`call: 'ring'` / `call: 'click'`), so every phone call in the game gets them.
 *
 *   RING — playRing(): an early-2000s handset. Two rings of two 0.4 s bursts (0.2 s apart), then 1.8 s of
 *          quiet; the cycle is scheduled ahead on the audio clock (6 cycles, ~18 s, then it stops itself) so
 *          the dashboard's ▶ can never leave one running. Each burst is a square wave warbling between
 *          1.3 and 1.6 kHz at 16 Hz through a 3.2 kHz lowpass. It starts 0.15 s late, so a card pressed
 *          through at once makes no sound. One ringer at a time: a new playRing() stops the old one.
 *   SNAP — playPhoneShut(): a flip phone closing. A highpassed noise tick (the hinge) and 35 ms later a
 *          second, duller one (the latch), over a 200 → 90 Hz knock. About 90 ms in all.
 *
 * Silent unless the context is already running (first user gesture, engine-audio.js); never throws.
 */

import { getAudioContext, getMasterBus, whiteNoiseBuffer } from './engine-audio.js'

let enabled = true
let volume = 0.6
let noise = null
let ringer = null   // { gain, osc } of the ringer sounding now

/** Debug-menu controls, read every frame by main.js alongside result-audio's. */
export function setPhoneAudio (on, vol) {
  enabled = !!on
  volume = vol
}

const live = () => { const c = getAudioContext(false); return enabled && c && c.state === 'running' ? c : null }

/** Stop the ringer at once (the card advanced, the sequence was dropped, the run ended). */
export function stopRing () {
  if (!ringer) return
  const { gain, osc } = ringer, t = gain.context.currentTime
  ringer = null
  gain.gain.cancelScheduledValues(t)
  gain.gain.setTargetAtTime(0, t, 0.01)
  try { osc.stop(t + 0.08) } catch { /* already ended */ }
}

export function playRing () {
  stopRing()
  const ctx = live(); if (!ctx) return
  const t0 = ctx.currentTime + 0.15
  const osc = ctx.createOscillator(); osc.type = 'square'
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200
  const gain = ctx.createGain(); gain.gain.value = 0
  osc.connect(lp); lp.connect(gain); gain.connect(getMasterBus())
  const LEVEL = 0.1 * volume, CYCLES = 6, CYCLE_S = 3
  for (let c = 0; c < CYCLES; c++) {
    for (const b of [0, 0.6]) {                       // two bursts, 0.4 s on + 0.2 s off
      const t = t0 + c * CYCLE_S + b
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(LEVEL, t + 0.01)
      gain.gain.setValueAtTime(LEVEL, t + 0.39)
      gain.gain.linearRampToValueAtTime(0, t + 0.4)
      for (let k = 0; k < 6; k++) osc.frequency.setValueAtTime(k % 2 ? 1600 : 1300, t + k * 0.0625)
    }
  }
  osc.start(t0); osc.stop(t0 + CYCLES * CYCLE_S)
  ringer = { gain, osc }
}

export function playPhoneShut () {
  const ctx = live(); if (!ctx) return
  const t = ctx.currentTime
  const out = ctx.createGain(); out.gain.value = 0.5 * volume; out.connect(getMasterBus())
  const tick = (at, f, g, dur) => {
    const s = ctx.createBufferSource(); s.buffer = (noise ??= whiteNoiseBuffer(ctx, 1))
    const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = f
    const e = ctx.createGain()
    e.gain.setValueAtTime(g, at); e.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    s.connect(h); h.connect(e); e.connect(out)
    s.start(at, Math.random() * 0.8); s.stop(at + dur + 0.01)
  }
  tick(t, 2800, 0.8, 0.012)          // the hinge
  tick(t + 0.035, 1500, 0.6, 0.02)   // the latch, duller
  const o = ctx.createOscillator(); o.type = 'sine'
  o.frequency.setValueAtTime(200, t + 0.035); o.frequency.exponentialRampToValueAtTime(90, t + 0.085)
  const e = ctx.createGain()
  e.gain.setValueAtTime(0.0001, t + 0.035); e.gain.exponentialRampToValueAtTime(0.5, t + 0.04)
  e.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
  o.connect(e); e.connect(out); o.start(t + 0.035); o.stop(t + 0.1)
}
