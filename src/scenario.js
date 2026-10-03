// src/scenario.js — FEAT-62: the scenario run, pure state.
//
// One authored scenario (data/scenarios.js) at a time: a 3-2-1 countdown that holds the truck (the
// Quick Job launch — mission.js COUNTDOWN), a running clock on the fixed physics step, a line of
// gates, and a finish line. main.js owns the world side — seating the truck, the light columns, the
// HUD and the finish card — and calls in here; this module owns the rules.
//
// THE RULES
//   • The clock starts at GO, not at the white start line. The truck is seated just behind it and
//     held through the count, so the line is where you are, not a trigger.
//   • Gates are crossed in ANY order, forwards only (a line crossed backwards does nothing), within
//     gateHalfWidth + GATE_SLACK_M of the centreline — so clipping the shoulder outside a column
//     still counts, but going round the gate through the trees does not.
//   • The finish always ends the run. A run that missed a gate gets a time but no board entry: a
//     soft lock (finish refuses until you drive back up the hill) would be worse than an honest
//     "missed a gate".
//
// Pure: no THREE, no DOM. Car position comes in through getCar(); results go to the injected
// Leaderboard. Driven only from main.js's fixed-step block, so a frame spike can neither stretch the
// clock nor step over a line (one segment test per line per step — the FEAT-31 lab gate pattern).

export const COUNTDOWN_S = 3      // s — the same start count a Quick Job uses
export const GATE_SLACK_M = 3     // m — crossing tolerance beyond each column

/** Body-forward unit vector for a heading (forward = (-sin h, 0, -cos h), the seat convention). */
function fwd (h) { return { x: -Math.sin(h), z: -Math.cos(h) } }

/** Pre-compute a crossing line from an authored pose. */
function line (pose, halfW) {
  const f = fwd(pose.heading)
  return { x: pose.x, z: pose.z, fx: f.x, fz: f.z, halfW }
}

/** Signed distance ahead of the line, and absolute distance along it from the centre. */
function measure (l, px, pz) {
  const dx = px - l.x, dz = pz - l.z
  return { along: dx * l.fx + dz * l.fz, lat: Math.abs(dx * -l.fz + dz * l.fx) }
}

/** True when the car went from behind the line to on/past it this step, inside the gate. */
export function crossedLine (l, ax, az, bx, bz) {
  const a = measure(l, ax, az), b = measure(l, bx, bz)
  if (!(a.along < 0 && b.along >= 0)) return false
  // Lateral offset AT the crossing point, not at either end — a fast diagonal crossing would
  // otherwise be judged by a sample up to a metre away from where it actually crossed.
  const t = a.along / (a.along - b.along)
  const lx = ax + (bx - ax) * t, lz = az + (bz - az) * t
  return measure(l, lx, lz).lat <= l.halfW
}

export class ScenarioSystem {
  /**
   * @param {object} deps
   * @param {() => {x:number, z:number}} deps.getCar — the truck's CG in world XZ
   * @param {import('./leaderboard.js').Leaderboard} deps.leaderboard
   * @param {() => void} [deps.onChange] — fired on every state change (not on clock ticks)
   */
  constructor ({ getCar, leaderboard, onChange = () => {} }) {
    this._getCar = getCar
    this.leaderboard = leaderboard
    this._onChange = onChange
    this.def = null
    this.state = 'idle'          // 'idle' | 'countdown' | 'running' | 'done'
    this.countdown = 0
    this.elapsed = 0
    this.passed = []             // per gate: crossed this run
    this.result = null
    this._gates = []
    this._finish = null
    this._last = null            // car XZ at the previous step
  }

  isActive () { return this.state !== 'idle' }
  /** The countdown holds the truck (main.js feeds this to setLaunchHold, like the Quick Job). */
  isHeld () { return this.state === 'countdown' }
  gatesPassed () { return this.passed.filter(Boolean).length }

  /** Arm a scenario. The caller has already seated the truck at def.spawn. */
  enter (def) {
    this.def = def
    const hw = def.gateHalfWidth + GATE_SLACK_M
    this._gates = def.gates.map(g => line(g, hw))
    this._finish = line(def.finish, hw)
    this.restart()
  }

  /** Back to the count with a clean sheet. The caller re-seats the truck. */
  restart () {
    if (!this.def) return
    this.state = 'countdown'
    this.countdown = COUNTDOWN_S
    this.elapsed = 0
    this.passed = this._gates.map(() => false)
    this.result = null
    this._last = null
    this._onChange()
  }

  exit () {
    this.def = null
    this.state = 'idle'
    this.result = null
    this._last = null
    this._onChange()
  }

  /** One fixed physics step. */
  update (dt) {
    if (this.state === 'countdown') {
      this.countdown -= dt
      if (this.countdown <= 0) { this.state = 'running'; this.elapsed = 0; this._onChange() }
      this._last = null
      return
    }
    if (this.state !== 'running') return
    this.elapsed += dt

    const c = this._getCar()
    const last = this._last
    this._last = { x: c.x, z: c.z }
    if (!last) return

    let changed = false
    for (let i = 0; i < this._gates.length; i++) {
      if (this.passed[i]) continue
      if (crossedLine(this._gates[i], last.x, last.z, c.x, c.z)) { this.passed[i] = true; changed = true }
    }
    if (crossedLine(this._finish, last.x, last.z, c.x, c.z)) {
      const missed = this.passed.filter(p => !p).length
      const board = missed === 0 ? this.leaderboard.submit(this.def.id, this.elapsed) : { rank: null, newBest: false }
      this.result = { elapsed: this.elapsed, missed, valid: missed === 0, ...board }
      this.state = 'done'
      changed = true
    }
    if (changed) this._onChange()
  }
}
