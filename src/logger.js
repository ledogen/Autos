/**
 * src/logger.js — Frame logger and initial condition loader for RangerSim.
 *
 * Purpose: Enables bug reporting. User reproduces a physics issue, captures a log
 * with the \ key, and shares the downloaded JSON alongside a description.
 *
 * Exports:
 *   toggleRecording()                    — flips recording state; on stop, auto-downloads the log
 *   captureFrame(simTime, vehicleState, wheelDebug) — appends one row to the frame buffer
 *   openInitialCondition(vehicleState)   — opens a file picker and applies JSON state to vehicleState
 *
 * Log format (D-06 / D-07):
 *   Columnar JSON — { fields: string[], frames: number[][] }
 *   One "fields" header array with short names; "frames" is an array of scalar arrays (one row per tick).
 *   Fields (33 entries): t, px, py, pz, vx, vy, vz, qx, qy, qz, qw, wx, wy, wz,
 *     steer, thr, brk, fl_fn, fl_fy, fl_sa, fl_c, fr_fn, fr_fy, fr_sa, fr_c,
 *     rl_fn, rl_fy, rl_sa, rl_c, rr_fn, rr_fy, rr_sa, rr_c
 *
 * Threat model: T-02-01 — JSON.parse wrapped in try/catch; unknown IC keys ignored, no eval.
 */

// ── Module-private state ──────────────────────────────────────────────────────
let _recording = false
const _frames = []

// D-07: 33 fields — exact order is part of the public log contract; do not reorder.
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
    _downloadLog()
    _frames.length = 0
  } else {
    _frames.length = 0
    _recording = true
  }
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
  ])
}

/**
 * Open a file picker and apply the selected JSON as an initial condition.
 * Fields applied (if present): position, velocity, quaternion, angularVelocity.
 * Unknown keys are silently ignored. Malformed JSON is caught and logged without crashing.
 *
 * @param {object} vehicleState - Mutable vehicleState; fields are set in-place.
 */
export function openInitialCondition (vehicleState) {
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
      } catch (err) {
        console.error('[logger] Failed to parse IC file:', err)
      }
    }
    reader.readAsText(file)
  }
  input.click()
}
