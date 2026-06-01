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
 *   Fields (41 entries): t, px, py, pz, vx, vy, vz, qx, qy, qz, qw, wx, wy, wz,
 *     steer, thr, brk, fl_fn, fl_fy, fl_sa, fl_c, fr_fn, fr_fy, fr_sa, fr_c,
 *     rl_fn, rl_fy, rl_sa, rl_c, rr_fn, rr_fy, rr_sa, rr_c,
 *     fl_omega, fr_omega, rl_omega, rr_omega  (Phase 3 — wheel angular velocity rad/s)
 *     fl_fz, fr_fz, rl_fz, rr_fz             (Phase 4 — tire spring force N per corner, D-12)
 *
 * Threat model: T-02-01 — JSON.parse wrapped in try/catch; unknown IC keys ignored, no eval.
 */

// ── Module-private state ──────────────────────────────────────────────────────
let _recording = false
const _frames = []
let _timedStopHandle = null  // setTimeout handle for auto-stop on scenario-driven recordings

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
]

// ── Private helpers ───────────────────────────────────────────────────────────

function _downloadLog () {
  const log = JSON.stringify({ fields: FIELDS, frames: _frames })
  const blob = new Blob([log], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = 'rangersim-log-' + Date.now() + '.json'
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
 * Capture one physics tick as a row in the frame buffer.
 * No-op when recording is off.
 *
 * @param {number} simTime - Accumulated simulation time in seconds.
 * @param {object} vehicleState - Full vehicle state object (position, velocity, quaternion, etc.).
 * @param {Array}  wheelDebug  - Array of 4 objects [{fn, fy, sa, c}, ...] (FL, FR, RL, RR).
 */
export function captureFrame (simTime, vehicleState, wheelDebug) {
  if (!_recording) return

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
  ])
}

/**
 * Open a file picker and apply the selected JSON as an initial condition.
 * Fields applied (if present): position, velocity, quaternion, angularVelocity.
 * Suspension, slip, and wheel state are reset to avoid stale-state transients (WR-02).
 * Unknown keys are silently ignored. Malformed JSON is caught and logged without crashing.
 *
 * @param {object} vehicleState - Mutable vehicleState; fields are set in-place.
 * @param {object} [params]     - RANGER_PARAMS; used to recompute hubY equilibrium after
 *                                loading. If omitted, hubY is zeroed (better than stale).
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
        // After loading a new position.y, stale hubY values produce an incorrect suspComp on
        // the first physics step, causing a transient bounce that corrupts scenario assertions.
        vehicleState.hubVy      = [0, 0, 0, 0]
        vehicleState.wheelOmega = [0, 0, 0, 0]
        vehicleState.slipLong   = [0, 0, 0, 0]
        vehicleState.slipLat    = [0, 0, 0, 0]
        // Recompute hubY from static equilibrium if params provided; zero otherwise.
        // Equilibrium derivation mirrors computeStaticEquilibrium in main.js (series-spring model).
        if (params) {
          // Tire-static formula: hub center sits wheelRadius above ground, minus the static
          // tire compression that holds corner weight. Matches main.js computeStaticEquilibrium.
          // The previous mount-derived form (hubY = mountWorldY - L_S + suspComp) jammed the
          // rear tire ~60 mm into the ground whenever IC.position.y didn't equal the per-axle
          // eq body Y (front 0.600 m, rear 0.627 m — they differ by L_S front/rear split, so
          // no single body Y satisfies both axles simultaneously).
          const g = 9.81
          const hubY = [0, 0, 0, 0]
          for (let i = 0; i < 4; i++) {
            const isFront    = i < 2
            const cornerMass = params.mass * (isFront ? params.weightFront : params.weightRear) / 2 + params.wheelMass
            const tireComp   = cornerMass * g / params.tireStiffness
            hubY[i] = params.wheelRadius - tireComp
          }
          vehicleState.hubY = hubY
        } else {
          vehicleState.hubY = [0, 0, 0, 0]
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
