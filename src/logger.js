/**
 * src/logger.js — Frame logger and initial condition loader for RangerSim.
 *
 * Purpose: Enables bug reporting. User reproduces a physics issue, captures a log
 * with the \ key, and shares the downloaded JSON alongside a description.
 *
 * Exports:
 *   toggleRecording()                    — flips recording state; on stop, auto-downloads the log
 *   startTimedRecording(durationSec)     — start a fixed-duration recording; auto-stops and downloads on expiry
 *   captureFrame(simTime, vehicleState, wheelDebug) — appends one row to the frame buffer
 *   openInitialCondition(vehicleState)   — opens a file picker and applies JSON state to vehicleState.
 *                                          Optional IC fields: recordDuration (seconds — triggers auto-recording),
 *                                          inputs (reserved for future input-script support; currently warns)
 *
 * Log format (D-06 / D-07):
 *   Columnar JSON — { fields: string[], frames: number[][] }
 *   One "fields" header array with short names; "frames" is an array of scalar arrays (one row per tick).
 *   Fields (45 entries): t, px, py, pz, vx, vy, vz, qx, qy, qz, qw, wx, wy, wz,
 *     steer, thr, brk, fl_fn, fl_fy, fl_sa, fl_c, fr_fn, fr_fy, fr_sa, fr_c,
 *     rl_fn, rl_fy, rl_sa, rl_c, rr_fn, rr_fy, rr_sa, rr_c,
 *     fl_omega, fr_omega, rl_omega, rr_omega  (Phase 3 — wheel angular velocity rad/s)
 *     fl_fz, fr_fz, rl_fz, rr_fz             (Phase 4 — tire spring force N per corner, D-12)
 *     fl_sc, fr_sc, rl_sc, rr_sc             (Phase 4.1 — strut compression m per corner, D-12)
 *     rd_minr                                (BUG-12 — local centerline turn radius m)
 *     rd_gh, fl_gh, fr_gh, rl_gh, rr_gh      (2026-06-25 — ground height under CG + each wheel, harness fidelity)
 *
 * Threat model: T-02-01 — JSON.parse wrapped in try/catch; unknown IC keys ignored, no eval.
 *
 * Phase 4/5 (plan 09): on stop the recorder writes a kind:"event" CAPTURE (src/capture.js schema) —
 * the replayable bug-report artifact — instead of the raw columnar log, IF a capture-context provider
 * is registered (setCaptureContext). The columnar frames live inside event.frames, so nothing is lost;
 * the capture just adds the world (seed/params) + initial state + input timeline the headless physics
 * replay (test/replay.mjs) needs. With no provider it falls back to the legacy raw-log download.
 */

import { buildEventCapture } from './capture.js'

// ── Module-private state ──────────────────────────────────────────────────────
let _recording = false
const _frames = []
let _timedStopHandle = null  // setTimeout handle for auto-stop on scenario-driven recordings
let _captureCtx = null       // () => { worldSeed, seedString, params, streamCenterHistory, complaint }

/**
 * Register the provider that supplies world/reproduction context at recording-stop time, so the
 * downloaded file is a replayable kind:"event" capture rather than a bare telemetry log. main.js
 * registers this once with closures over worldSeed / RANGER_PARAMS / the stream-center ring.
 */
export function setCaptureContext (fn) { _captureCtx = fn }

// D-07: 41 fields — exact order is part of the public log contract; do not reorder.
// Phase 3 appends fl_omega/fr_omega/rl_omega/rr_omega at positions 33-36 (constraint #8).
const FIELDS = [
  't',
  'px', 'py', 'pz',
  'vx', 'vy', 'vz',
  'qx', 'qy', 'qz', 'qw',
  'wx', 'wy', 'wz',
  'steer', 'thr', 'brk',
  'fl_fn', 'fl_fy', 'fl_sa', 'fl_c',
  'fr_fn', 'fr_fy', 'fr_sa', 'fr_c',
  'rl_fn', 'rl_fy', 'rl_sa', 'rl_c',
  'rr_fn', 'rr_fy', 'rr_sa', 'rr_c',
  // Phase 3 additions (constraint #8 — appended at END, never reorder above entries)
  'fl_omega', 'fr_omega', 'rl_omega', 'rr_omega',
  // Phase 4 additions — per-wheel tire spring force Fz (D-12), 2026-05-31
  'fl_fz', 'fr_fz', 'rl_fz', 'rr_fz',
  // Phase 4.1 additions — per-wheel strut compression (D-12), 2026-06-01
  'fl_sc', 'fr_sc', 'rl_sc', 'rr_sc',
  // BUG-12 diagnostic (open): local XZ turn radius of the truck's run centerline (m). 9999 = ~straight.
  // If a ribbon FOLD is visible where rd_minr is still ≥ ~15 m → fold is junction/mesh, not the spline.
  'rd_minr',
  // Harness-fidelity columns (2026-06-25): the SURFACE the browser actually sampled, so test/replay.mjs
  // can diff it against the headless terrain model frame-by-frame instead of guessing. rd_gh = ground
  // height (analyticHeight, carve included) under the CG — this is the column the physics-replay terrain
  // self-check looks for. fl_gh..rr_gh = ground height under each WHEEL hub (airborne-safe: sampled from
  // getWheelPosition, not contact state), so a jamming/floating wheel on steep terrain is visible directly.
  'rd_gh', 'fl_gh', 'fr_gh', 'rl_gh', 'rr_gh',
  // FEAT-23 additions — drivetrain (appended at END): active gear (0=reverse) + engine RPM + the
  // coupled (locked/no-slip) RPM the shift schedule keys off + wheelspin (driven-vs-ground m/s excess).
  'gear', 'eng_rpm', 'coupled_rpm', 'wheelspin',
]

// ── Private helpers ───────────────────────────────────────────────────────────

function _downloadLog () {
  let payload, name
  if (_captureCtx) {
    // Phase 4/5: write a replayable kind:"event" capture (world + initial state + input timeline +
    // the columnar frames). main.js's provider supplies seed/params/stream-center context.
    const ctx = _captureCtx() || {}
    payload = buildEventCapture({
      worldSeed:           ctx.worldSeed,
      seedString:          ctx.seedString,
      params:              ctx.params,
      complaint:           ctx.complaint,
      streamCenterHistory: ctx.streamCenterHistory,
      fields:              FIELDS,
      frames:              _frames,
    })
    name = 'rangersim-capture-' + Date.now() + '.json'
  } else {
    payload = { fields: FIELDS, frames: _frames }   // legacy raw-log fallback
    name = 'rangersim-log-' + Date.now() + '.json'
  }
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } finally {
    URL.revokeObjectURL(url)
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Toggle frame recording on/off.
 * Transitioning true → false triggers an automatic JSON download and clears the frame buffer.
 * Transitioning false → true clears any leftover frames and starts a fresh session.
 */
export function toggleRecording () {
  if (_recording) {
    _recording = false
    if (_timedStopHandle !== null) { clearTimeout(_timedStopHandle); _timedStopHandle = null }
    _downloadLog()
    _frames.length = 0
  } else {
    _frames.length = 0
    _recording = true
  }
}

/**
 * Start a fixed-duration recording. On expiry, auto-stops and downloads — same path
 * as toggleRecording's stop branch. If a recording is already in progress, it is
 * cancelled and dropped (no download) so the new timed run starts clean.
 *
 * Used by scenario JSONs that carry a `recordDuration` field: openInitialCondition
 * calls this so a scenario load → drive → log download cycle is repeatable without
 * the user managing the \ key.
 *
 * @param {number} durationSec - Wall-clock seconds to record (real time, not sim time).
 */
export function startTimedRecording (durationSec) {
  if (!(durationSec > 0)) return
  if (_timedStopHandle !== null) { clearTimeout(_timedStopHandle); _timedStopHandle = null }
  _frames.length = 0
  _recording = true
  _timedStopHandle = setTimeout(() => {
    _timedStopHandle = null
    if (!_recording) return
    _recording = false
    _downloadLog()
    _frames.length = 0
  }, durationSec * 1000)
  console.log(`[logger] timed recording started, ${durationSec.toFixed(2)} s`)
}

/**
 * Is frame recording currently active? Lets the caller skip building optional
 * diagnostics (e.g. the road-resolution probe) when no log is being captured.
 */
export function isRecording () { return _recording }

/**
 * Capture one physics tick as a row in the frame buffer.
 * No-op when recording is off.
 *
 * @param {number} simTime - Accumulated simulation time in seconds.
 * @param {object} vehicleState - Full vehicle state object (position, velocity, quaternion, etc.).
 * @param {Array}  wheelDebug  - Array of 4 objects [{fn, fy, sa, c}, ...] (FL, FR, RL, RR).
 * @param {object} [roadDebug] - { minR, gh, wheelGh }. minR: BUG-12 turn-radius diagnostic (omitted →
 *   9999). gh: ground height under the CG (omitted → null). wheelGh: [fl,fr,rl,rr] ground height under
 *   each wheel hub (omitted → nulls). gh/wheelGh are the harness-fidelity surface samples.
 */
export function captureFrame (simTime, vehicleState, wheelDebug, roadDebug) {
  if (!_recording) return
  const rd = roadDebug || {}
  const wgh = rd.wheelGh || []

  const p = vehicleState.position
  const v = vehicleState.velocity
  const q = vehicleState.quaternion
  const w = vehicleState.angularVelocity

  const fl = wheelDebug[0]
  const fr = wheelDebug[1]
  const rl = wheelDebug[2]
  const rr = wheelDebug[3]

  _frames.push([
    simTime,
    p.x, p.y, p.z,
    v.x, v.y, v.z,
    q.x, q.y, q.z, q.w,
    w.x, w.y, w.z,
    vehicleState.steerAngle, vehicleState.throttle, vehicleState.brake,
    fl.fn ?? 0, fl.fy ?? 0, fl.sa ?? 0, fl.c ?? 0,
    fr.fn ?? 0, fr.fy ?? 0, fr.sa ?? 0, fr.c ?? 0,
    rl.fn ?? 0, rl.fy ?? 0, rl.sa ?? 0, rl.c ?? 0,
    rr.fn ?? 0, rr.fy ?? 0, rr.sa ?? 0, rr.c ?? 0,
    // Phase 3 additions — wheel angular velocity (constraint #8 — appended at END)
    fl.omega ?? 0, fr.omega ?? 0, rl.omega ?? 0, rr.omega ?? 0,
    // Phase 4 additions — per-wheel tire spring force Fz (D-12), 2026-05-31
    fl.fz ?? 0, fr.fz ?? 0, rl.fz ?? 0, rr.fz ?? 0,
    // Phase 4.1 additions — per-wheel strut compression (D-12), 2026-06-01
    fl.strutComp ?? 0, fr.strutComp ?? 0, rl.strutComp ?? 0, rr.strutComp ?? 0,
    // BUG-12 diagnostic (open): local centerline turn radius near truck
    rd.minR ?? 9999,
    // Harness-fidelity surface samples (2026-06-25): CG + per-wheel ground height. null when no terrain
    // (e.g. grid world) — the replay self-check treats a missing/null rd_gh as "older capture, skip".
    rd.gh ?? null,
    wgh[0] ?? null, wgh[1] ?? null, wgh[2] ?? null, wgh[3] ?? null,
    // FEAT-23 drivetrain (appended at END): active gear (0=reverse) + engine RPM + coupled RPM + wheelspin.
    vehicleState.drivetrain?.activeGear ?? 0, vehicleState.drivetrain?.engineRPM ?? 0, vehicleState.drivetrain?.coupledRPM ?? 0, vehicleState.drivetrain?.wheelspin ?? 0,
  ])
}

/**
 * Open a file picker and apply the selected JSON as an initial condition.
 * Fields applied (if present): position, velocity, quaternion, angularVelocity.
 * Suspension, slip, and wheel state are reset to avoid stale-state transients (WR-02).
 * Unknown keys are silently ignored. Malformed JSON is caught and logged without crashing.
 *
 * @param {object} vehicleState - Mutable vehicleState; fields are set in-place.
 * @param {object} [params]     - RANGER_PARAMS; used to recompute strutComp equilibrium after
 *                                loading using D-11 formula. If omitted, strutComp is zeroed.
 */
export function openInitialCondition (vehicleState, params) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = e => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const ic = JSON.parse(ev.target.result)
        if (ic.position) {
          vehicleState.position.set(ic.position.x, ic.position.y, ic.position.z)
        }
        if (ic.velocity) {
          vehicleState.velocity.set(ic.velocity.x, ic.velocity.y, ic.velocity.z)
        }
        if (ic.quaternion) {
          vehicleState.quaternion.set(ic.quaternion.x, ic.quaternion.y, ic.quaternion.z, ic.quaternion.w)
        }
        if (ic.angularVelocity) {
          vehicleState.angularVelocity.set(ic.angularVelocity.x, ic.angularVelocity.y, ic.angularVelocity.z)
        }
        // WR-02: reset suspension, slip, and wheel state to prevent stale-state force spikes.
        // After loading a new IC, stale strutComp values produce incorrect spring forces on
        // the first physics step, causing a transient bounce that corrupts scenario assertions.
        vehicleState.strutCompVel = [0, 0, 0, 0]
        vehicleState.wheelOmega   = [0, 0, 0, 0]
        vehicleState.slipLong     = [0, 0, 0, 0]
        vehicleState.slipLat      = [0, 0, 0, 0]
        // Recompute strutComp from static equilibrium using D-11 formula (sprung mass only).
        // strutComp[i] = m_sprung_corner * g / k_S_i  where m_sprung = mass * weight_i / 2
        // This is the hub-ODE equilibrium condition; wheel inertia is not included (D-11).
        if (params) {
          const g = 9.81
          const strutComp = [0, 0, 0, 0]
          for (let i = 0; i < 4; i++) {
            const isFront = i < 2
            const k_S     = isFront ? params.suspensionStiffnessFront : params.suspensionStiffnessRear
            const sprung  = params.mass * (isFront ? params.weightFront : params.weightRear) / 2
            strutComp[i]  = sprung * g / k_S  // D-11
          }
          vehicleState.strutComp = strutComp
        } else {
          vehicleState.strutComp = [0, 0, 0, 0]
        }
        // Future: ic.inputs would carry a time-keyed throttle/brake/steer script
        // so scenarios are fully autonomous. For now warn so a stale field doesn't
        // silently mean "input ignored".
        if (ic.inputs) {
          console.warn('[logger] scenario.inputs not yet supported — apply controls manually')
        }
        // Auto-start a timed recording if the scenario asks for one. This is what
        // makes scenarios repeatable: same IC → same fixed-duration log → same assert.
        if (typeof ic.recordDuration === 'number' && ic.recordDuration > 0) {
          startTimedRecording(ic.recordDuration)
        }
      } catch (err) {
        console.error('[logger] Failed to parse IC file:', err)
      }
    }
    reader.readAsText(file)
  }
  input.click()
}
