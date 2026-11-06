/**
 * src/rank-music.js — FEAT-131 P3: the rank timer's music bed (owner, 2026-11-03: "yes · bar · Spare").
 *
 * The game's only music. It starts with the rank bar — the moment the bar decides the job's clock
 * matters — and rides the bar's own signals (main.js _updateRankTimer), so the music, the glow and the
 * heartbeat kick never disagree:
 *   pad       a minor triad of detuned saws (root, minor third, fifth) through a lowpass that opens with
 *             the bar's intensity²: dark and still in the quiet middle of a band, bright at the line.
 *   arpeggio  the triad an octave up, a note at a time, four per heartbeat. main.js hands over the
 *             heartbeat's own oscillator phase and a note plays on every quarter turn of it, so the
 *             arpeggio cannot drift off the kick. Silent while the bar is calm (the phase only turns
 *             near a line).
 *   step      a line went past: the pad climbs a semitone — one band down, one step more tension.
 *   drop      the bonus is lost: the filter shuts and the pitch falls 5 semitones over 0.4 s under the
 *             glass break, then climbs back over about a second.
 *   thin      the C/D line ("too slow"): the bed fades out and the heartbeat plays alone.
 *   resolve   the job is over: the third lifts to major, the filter opens a touch and the bed fades
 *             into the result card's stinger (result-audio.js).
 * Synthesized on the one shared AudioContext, on the master bus dry (UI, like the result card — the cab
 * glass and a tunnel's echo never colour it). Not owner-heard yet. When FEAT-58's player music lands it
 * ducks under the bed: export the bed's level (out.gain) for it then — nothing reads it before.
 */

import { getAudioContext, getMasterBus } from './engine-audio.js'

const ROOT = 110                     // Hz — A2, the bed's key before any line has passed
const TRIAD = [0, 3, 7]              // semitones — minor: root, third, fifth
const DETUNE = 7                     // cents — each voice is two saws ± this, for width
const CUT_LO = 220, CUT_HI = 2400    // Hz — the lowpass at intensity 0 → 1 (on intensity²)
const PAD_LO = 0.05, PAD_HI = 0.09   // pad level at intensity 0 → 1, before `volume`
const ARP_LEVEL = 0.10               // arpeggio note peak at intensity 1, before `volume`
const FADE_S = 1.2                   // s — thin and resolve fade out over this

let enabled = true
let volume = 0.5
let bed = null   // { out, flt, voices: [{ oscs, major }], step, quarter, holdUntil } while it plays — null once faded

/** Debug-menu controls, read every frame by main.js. */
export function setRankMusic (on, vol) {
  enabled = !!on
  volume = vol
}

const live = () => { const c = getAudioContext(false); return c && c.state === 'running' ? c : null }
const cents = (v, step, d) => 100 * (step + (v.major ?? 0)) + d

/** The bar just showed: the bed comes in under it, dark. */
export function startRankMusic () {
  const ctx = live()
  if (!ctx || bed) return
  const out = ctx.createGain(); out.gain.value = 0; out.connect(getMasterBus())
  const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = CUT_LO; flt.Q.value = 0.7
  const mix = ctx.createGain(); mix.gain.value = 1 / (2 * TRIAD.length); mix.connect(flt); flt.connect(out)
  const voices = TRIAD.map(semis => ({ oscs: [-DETUNE, DETUNE].map(d => {
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = ROOT * 2 ** (semis / 12)
    o.detune.value = d
    o.connect(mix)
    o.start()
    return o
  }) }))
  bed = { out, flt, voices, step: 0, quarter: 0, holdUntil: 0 }
}

/** Per frame while the bar shows: `i` the bar's intensity 0..1, `phase` the heartbeat oscillator's phase (rad). */
export function updateRankMusic (i, phase) {
  const ctx = live()
  if (!ctx || !bed) return
  const t = ctx.currentTime
  if (t >= bed.holdUntil) bed.flt.frequency.setTargetAtTime(CUT_LO + (CUT_HI - CUT_LO) * i * i, t, 0.08)
  bed.out.gain.setTargetAtTime(enabled ? (PAD_LO + (PAD_HI - PAD_LO) * i) * volume : 0, t, 0.1)
  const q = Math.floor(phase / (Math.PI / 2))
  if (enabled && i > 0 && q > bed.quarter) {   // a quarter turn of the heartbeat: the next note up the triad
    const o = ctx.createOscillator(), e = ctx.createGain()
    o.type = 'triangle'
    o.frequency.value = ROOT * 2 * 2 ** ((TRIAD[q % TRIAD.length] + bed.step) / 12)
    e.gain.setValueAtTime(0.0001, t)
    e.gain.exponentialRampToValueAtTime(ARP_LEVEL * volume * (0.3 + 0.7 * i), t + 0.005)
    e.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
    o.connect(e); e.connect(bed.flt)
    o.start(t); o.stop(t + 0.2)
  }
  bed.quarter = q
}

function _retune (t, tau, extra = 0) {
  for (const v of bed.voices) v.oscs.forEach((o, k) => o.detune.setTargetAtTime(cents(v, bed.step, k ? DETUNE : -DETUNE) + extra, t, tau))
}

/** A line went past: a semitone up. */
export function rankMusicStep () {
  const ctx = live()
  if (!ctx || !bed) return
  bed.step++
  _retune(ctx.currentTime, 0.15)
}

/** The bonus is lost: filter shut, pitch falling, then back. */
export function rankMusicDrop () {
  const ctx = live()
  if (!ctx || !bed) return
  const t = ctx.currentTime
  bed.holdUntil = t + 0.5
  bed.flt.frequency.setTargetAtTime(150, t, 0.12)
  _retune(t, 0.13, -500)
  _retune(t + 0.5, 0.3)
}

function _fade (t, s) {
  bed.out.gain.cancelScheduledValues(t)
  bed.out.gain.setValueAtTime(bed.out.gain.value, t)
  bed.out.gain.linearRampToValueAtTime(0, t + s)
  for (const v of bed.voices) for (const o of v.oscs) o.stop(t + s + 0.05)
  bed = null
}

/** The C/D line: the bed thins to the heartbeat alone. */
export function rankMusicThin () {
  const ctx = live()
  if (ctx && bed) _fade(ctx.currentTime, FADE_S)
}

/** The job is over (finished or put down): the third lifts to major and the bed fades out. */
export function resolveRankMusic () {
  const ctx = live()
  if (!ctx || !bed) return
  const t = ctx.currentTime
  bed.voices[1].major = 1
  _retune(t, 0.08)
  bed.flt.frequency.setTargetAtTime(1200, t, 0.2)
  _fade(t, FADE_S * 1.5)
}
