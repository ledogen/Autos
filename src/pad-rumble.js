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
 *   CONTINUOUS  levels read off the vehicle state each fixed step (`stepPadRumble`): slip, a jolt, loose-surface
 *               texture, a flat, a bent wheel. They go stale (silent) when the steps stop.
 *
 * BUG-206 (owner, Windows: "pretty much always a Rumble all the time when I'm driving down the road"): cruising on a
 * smooth road with no slip and no hit commands EXACTLY zero; rumble is an event. The old texture source read the mean
 * |strut velocity|, which on asphalt is the body riding the road's long undulations and the deck's facet kinks
 * (p50 0.10 m/s at 60 km/h over its 0.08 floor: 58 % of the drive buzzing). Two sources replace it, each on its real cause:
 *   jolt   the strut velocity's high band (first-order high-pass at JOLT_HP_HZ, above the ~1–2 Hz body modes) divided by
 *          the speed: that is the change of ground slope under the wheel, a geometric quantity, so its floor holds at any
 *          speed. Asphalt reads ≤ 0.014 (deck facets), off-road ground up to ~0.07, a kerb lip or a pothole edge far more.
 *   rough  loose ground under the truck (main.js _looseSurfaceFactorAt, the same surface the tyre audio's rolling gravel
 *          and the dust read), scaled by speed: gravel and dirt buzz, asphalt is silent.
 *
 * MAPPING (a real truck sends a shock through the frame and a texture through the wheel): impacts, bump stops,
 * landings, a blowout, a missed shift, engine start/seize and a flat's thump go mostly to the STRONG motor; surface
 * texture, tyre slip, a bent wheel's wobble and ABS go to the WEAK motor; a jolt goes to both.
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
  jolt:        [1.00, 1.00],   // a sharp change of ground slope under a wheel: a kerb lip, a pothole edge, a rock (BUG-206; 0.40 -> 1.00 with JOLT_SLOPE_FULL 0.3 -> 0.10, FEAT-247 owner 11-20: the kerb strike was lost under the shoulder's rumble)
  rough:       [0.00, 0.15],   // loose-surface texture (gravel, dirt), scaled by speed; asphalt is silent (BUG-206; 0.40 -> 0.15, FEAT-247 owner 11-20: a persistent rumble, but the kerb strike must stand over it)
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

/** The continuous levels from the vehicle state. `flat` = the damage model's per-wheel flat flags; `loose` = the
 *  surface under the truck, main.js _looseSurfaceFactorAt (params.dustPavedFactor on asphalt … 1 off-road); `strutHp`
 *  = the largest |high-passed strut velocity| this step, m/s (strutHighPass). */
export function continuousSignals (vs, params, flat, loose = 0, strutHp = 0, phase = null) {
  const v = vs.velocity, speed = v ? Math.hypot(v.x, v.z) : 0
  const grip = vs.slipVel, wc = params?._wheelCondition
  let slip = 0, bent = 0, flatLvl = 0
  for (let i = 0; i < 4; i++) {
    slip = Math.max(slip, grip?.[i] || 0)
    bent = Math.max(bent, bentLevel(wc?.[i] ?? 1, speed) * (phase ? 0.5 + 0.5 * Math.cos(phase[i]) : 1))
    if (flat?.[i]) flatLvl = Math.max(flatLvl, phase ? flatPulse(phase[i]) : 1)   // FEAT-247: one thump per turn of the flat wheel
  }
  const flatFade = ramp(speed, 5 * MPH, 15 * MPH)   // the flat's thump fades in over 5..15 mph (owner 11-20)
  return {
    slip: ramp(slip, 2, 10),
    jolt: ramp(strutHp / Math.max(speed, 2), JOLT_SLOPE_FLOOR, JOLT_SLOPE_FULL),
    rough: ramp(loose, params?.dustPavedFactor ?? 0.1, 1) * ramp(speed, 2, 20),
    flat: flatLvl * flatFade,
    bent,
  }
}

/** The flat tyre's "ka-thunk": one sharp thump per turn of the wheel (phase 0 = the flat spot's slap), 0 between. */
const flatPulse = (ph) => (0.5 + 0.5 * Math.cos(ph)) ** 3

// FEAT-287 / DEC-420: a bent wheel is felt only when it is really bad. Condition >= 60 %: never. 25..60 %: only in a
// 10..25 mph band, a half-cosine up to the 17 mph peak and a half-cosine down (zero at both ends), amplitude 0.3 at 60 %
// rising linearly to 1 at 25 %. Below 25 %: also above the band, a high-speed level of 0.1 at 25 % rising to 0.7 at 0 %
// (weaker than the band peak), faded in over 17..25 mph. The numbers marked * are proposals, not DEC-420's.
const MPH = 0.44704
const BENT_FLOOR = 0.6, BENT_BAD = 0.25
const BENT_V0 = 10 * MPH, BENT_VP = 17 * MPH, BENT_V1 = 25 * MPH
const BENT_AMP_AT_FLOOR = 0.3   // *
const BENT_HI_AT_BAD = 0.1, BENT_HI_AT_ZERO = 0.7   // *
/** One wheel's bent-wheel level 0..1 (before the pulse) from its condition 0..1 and the vehicle speed [m/s]. */
export function bentLevel (cond, speed) {
  if (!(cond < BENT_FLOOR)) return 0
  const t = clamp01((BENT_FLOOR - cond) / (BENT_FLOOR - BENT_BAD))
  const bump = speed <= BENT_V0 || speed >= BENT_V1 ? 0
    : speed < BENT_VP ? 0.5 - 0.5 * Math.cos(Math.PI * (speed - BENT_V0) / (BENT_VP - BENT_V0))
    : 0.5 + 0.5 * Math.cos(Math.PI * (speed - BENT_VP) / (BENT_V1 - BENT_VP))
  let level = (BENT_AMP_AT_FLOOR + (1 - BENT_AMP_AT_FLOOR) * t) * bump
  if (cond < BENT_BAD) {
    const hi = BENT_HI_AT_BAD + (BENT_HI_AT_ZERO - BENT_HI_AT_BAD) * (1 - Math.max(cond, 0) / BENT_BAD)
    level = Math.max(level, hi * ramp(speed, BENT_VP, BENT_V1))
  }
  return level
}

/** Advance each wheel's pulse phase [rad] by its own spin (|wheelOmega|, else speed / wheel radius) for `dt`; the angle
 *  is integrated so the pulse never pops when the speed changes. The pulse is 0.5 + 0.5 cos(phase): one per turn. */
export function bentPhaseStep (phase, vs, params, dt) {
  const v = vs.velocity, speed = v ? Math.hypot(v.x, v.z) : 0
  for (let i = 0; i < 4; i++) {
    const om = vs.wheelOmega?.[i]
    phase[i] = (phase[i] + (Number.isFinite(om) ? Math.abs(om) : speed / (params?.wheelRadius || 0.37)) * dt) % (2 * Math.PI)
  }
}

// BUG-206: the jolt's band and floor. Measured on the world rig (wip/bugs-pcl/rumble-trace.mjs, 2 random seeds, 30 and
// 90 km/h): high-passed strut velocity ÷ speed on asphalt p99 0.011, max 0.014 (deck facets); off-road max 0.068.
const JOLT_HP_HZ = 6             // Hz — above the body's heave/pitch modes, below the wheel hop
const JOLT_SLOPE_FLOOR = 0.03    // ground-slope change: silent below (2× the asphalt maximum) …
const JOLT_SLOPE_FULL = 0.1      // … full at a kerb lip's (a measured kerb crossing reads 0.06..0.14, the sim's kerb is a blended edge)

/** First-order high-pass of each corner's strut velocity at JOLT_HP_HZ; returns the largest |output|. `st` holds the
 *  filter's memory ({ x: [4], y: [4] }), so a gate can run its own. */
export function strutHighPass (sv, dt, st) {
  const a = 1 / (1 + 2 * Math.PI * JOLT_HP_HZ * dt)
  let m = 0
  for (let i = 0; i < 4; i++) {
    const x = sv?.[i] || 0
    st.y[i] = a * (st.y[i] + x - st.x[i]); st.x[i] = x
    m = Math.max(m, Math.abs(st.y[i]))
  }
  return m
}

const kicks = {}        // name → { s, t0 } (level at the time it was struck, performance.now() ms)
let cont = {}, contAt = 0
const bentPhase = [0, 0, 0, 0]
const hp = { x: [0, 0, 0, 0], y: [0, 0, 0, 0] }
let sentAt = 0, quiet = true, joltPeak = 0
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

/** One fixed physics step: refresh the continuous levels. `loose` as continuousSignals. */
export function stepPadRumble (vs, params, flat, loose, dt) {
  bentPhaseStep(bentPhase, vs, params, dt)
  cont = continuousSignals(vs, params, flat, loose, strutHighPass(vs.strutCompVel, dt, hp), bentPhase)
  joltPeak = Math.max(joltPeak, cont.jolt)   // a strike is ONE physics step (17 ms) and the pad is sent every 50 ms: hold the peak until the next send
  contAt = performance.now()
}

/** Once per render frame: mix everything and send ONE effect, at most every SEND_MS, only while a pad drives.
 *  An unsupported pad (no `vibrationActuator`) ignores it; a pad that went quiet is told to stop once. */
export function flushPadRumble (padActive) {
  const now = performance.now()
  if (now - sentAt < SEND_MS) return
  const sig = kickLevels(now)
  if (now - contAt < STALE_MS) { Object.assign(sig, cont); sig.jolt = joltPeak }
  joltPeak = 0
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
