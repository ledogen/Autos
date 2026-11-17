/**
 * src/pad-rumble.js — FEAT-247: controller vibration for the truck's events.
 *
 * The Gamepad API's `playEffect('dual-rumble', { strongMagnitude, weakMagnitude, duration })` drives two motors: a
 * heavy low-frequency one (the left grip: thumps, hits, a body shock) and a light high-frequency one (the right
 * grip: buzz, texture, a tyre slide). A new effect REPLACES the one playing — they do not mix — so every source
 * here adds into ONE mixer (`rumbleMix`) and the frame sends ONE effect.
 *
 * Sources read signals the sim already computes; nothing here adds physics. Two kinds:
 *   KICKS       events (`padHit(name, s)` from the code that already detects them): a level 0..1 that decays on real
 *               time, so a kick still dies out while the game is paused.
 *   CONTINUOUS  levels read off the vehicle state each fixed step (`stepPadRumble`): slip, road texture, a flat, a
 *               bent wheel. They go stale (silent) when the steps stop.
 *
 * MAPPING (a real truck sends a shock through the frame and a texture through the wheel): impacts, bump stops,
 * landings, a blowout, a missed shift, engine start/seize and a flat's thump go mostly to the STRONG motor; road
 * texture, tyre slip, a bent wheel's wobble and ABS go to the WEAK motor.
 *
 * RUMBLE_GAINS is the one table of per-source strength, [strong, weak] at a source level of 1; RUMBLE_PARAMS.vibration
 * is the player's master (settings page: off / low / normal / high). Pure apart from `performance.now()` in the driver.
 */

export const RUMBLE_PARAMS = { vibration: 1 }   // 0 off · 0.5 low · 1 normal · 1.5 high (settings.js `vibration`)

//                    strong weak   tau = a kick's decay time constant [s]
export const RUMBLE_GAINS = {
  impact:      [1.00, 0.60],   // a landed collision (applyImpact), level from its Δv
  bump:        [0.70, 0.30],   // a strut bottoming on its stop, level from the peak force
  land:        [0.90, 0.40],   // first wheel down after air, level from the touchdown speed
  blowout:     [1.00, 0.80],   // a tyre pops
  missShift:   [0.50, 0.20],   // a gear forced against the clutch (grind)
  engineStart: [0.35, 0.15],   // the engine catches
  engineSeize: [0.70, 0.10],   // the running engine seizes
  abs:         [0.40, 0.70],   // ABS dumped a cylinder (the pedal kick-back); also the left trigger where the pad has one
  slip:        [0.00, 0.35],   // tyre slip / wheelspin
  rough:       [0.00, 0.40],   // road texture (washboard, rumble strips, gravel), scaled by speed
  flat:        [0.45, 0.15],   // running on a flat tyre
  bent:        [0.25, 0.10],   // a bent (out-of-round) wheel
}
const KICK_TAU = { impact: 0.35, bump: 0.18, land: 0.30, blowout: 0.50, missShift: 0.20, engineStart: 0.25, engineSeize: 0.40, abs: 0.06 }

const clamp01 = (x) => x > 0 ? (x < 1 ? x : 1) : 0
const ramp = (x, lo, hi) => clamp01((x - lo) / (hi - lo))

/** The pure mix: `sig` = source name → level 0..1. Returns the two motor magnitudes, 0..1. Silent when every
 *  level is 0 or the master is 0; monotone in every level. */
export function rumbleMix (sig, gains = RUMBLE_GAINS, master = RUMBLE_PARAMS.vibration) {
  let strong = 0, weak = 0
  for (const k in sig) {
    const g = gains[k]
    if (!g) continue
    const s = clamp01(sig[k])
    strong += g[0] * s
    weak += g[1] * s
  }
  return { strong: clamp01(strong * master), weak: clamp01(weak * master) }
}

/** The continuous levels from the vehicle state. `flat` = the damage model's per-wheel flat flags. */
export function continuousSignals (vs, params, flat) {
  const v = vs.velocity, speed = v ? Math.hypot(v.x, v.z) : 0
  const grip = vs.slipVel, sv = vs.strutCompVel, ro = params?._wheelRunout
  let slip = 0, tex = 0, bent = 0, anyFlat = false
  for (let i = 0; i < 4; i++) {
    slip = Math.max(slip, grip?.[i] || 0)
    tex += Math.abs(sv?.[i] || 0) / 4
    bent = Math.max(bent, ro?.[i] || 0)
    if (flat?.[i]) anyFlat = true
  }
  const roll = ramp(speed, 1, 12)   // texture and wobble are felt rolling; at a standstill there is none
  return {
    slip: ramp(slip, 2, 10),
    rough: ramp(tex, 0.08, 0.6) * roll,
    flat: anyFlat ? roll : 0,
    bent: ramp(bent, 0.002, 0.04) * roll,
  }
}

const kicks = {}        // name → { s, t0 } (level at the time it was struck, performance.now() ms)
let cont = { slip: 0, rough: 0, flat: 0, bent: 0 }, contAt = 0
let sentAt = 0, quiet = true
const SEND_MS = 50, EFFECT_MS = 100, STALE_MS = 100

/** Strike a kick source with level `s` (0..1); a harder strike while one is still ringing wins. */
export function padHit (name, s = 1) {
  const now = performance.now(), k = kicks[name]
  const cur = k ? k.s * Math.exp(-(now - k.t0) / 1000 / KICK_TAU[name]) : 0
  if (s > cur) kicks[name] = { s: clamp01(s), t0: now }
}

/** The kick levels now (decayed on real time), for the mixer. */
export function kickLevels (now = performance.now()) {
  const out = {}
  for (const n in kicks) out[n] = kicks[n].s * Math.exp(-(now - kicks[n].t0) / 1000 / KICK_TAU[n])
  return out
}

/** One fixed physics step: refresh the continuous levels. */
export function stepPadRumble (vs, params, flat) {
  cont = continuousSignals(vs, params, flat)
  contAt = performance.now()
}

/** Once per render frame: mix everything and send ONE effect, at most every SEND_MS, only while a pad drives.
 *  An unsupported pad (no `vibrationActuator`) ignores it; a pad that went quiet is told to stop once. */
export function flushPadRumble (padActive) {
  const now = performance.now()
  if (now - sentAt < SEND_MS) return
  const sig = kickLevels(now)
  if (now - contAt < STALE_MS) Object.assign(sig, cont)
  const m = padActive ? rumbleMix(sig) : { strong: 0, weak: 0 }
  const silent = m.strong < 0.01 && m.weak < 0.01
  if (silent && quiet) return
  sentAt = now
  quiet = silent
  for (const gp of navigator.getGamepads?.() ?? []) {
    const a = gp?.vibrationActuator
    if (!a) continue
    if (silent) { a.reset?.()?.catch?.(() => {}); continue }
    const trig = a.effects?.includes('trigger-rumble')
    const p = { duration: EFFECT_MS, strongMagnitude: m.strong, weakMagnitude: m.weak }
    if (trig) p.leftTrigger = clamp01((sig.abs || 0) * 0.8 * RUMBLE_PARAMS.vibration)
    a.playEffect(trig ? 'trigger-rumble' : 'dual-rumble', p).catch(() => {})
  }
}
