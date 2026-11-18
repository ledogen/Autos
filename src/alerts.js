// DEC-287: the HUD's alerts area (#machine-word) is general purpose. Several alerts can be open at once;
// it shows one at a time, ALERT_CYCLE_S each, round-robin in the order they opened. Pure: no DOM, no clock.
export const ALERT_CYCLE_S = 2
import { runLog } from './run-log.js'   // FEAT-242: the opt-in run log (pure too; a no-op when off)

export class AlertCycle {
  constructor () { this._list = []; this._i = 0; this._t = 0 }

  /** Open an alert (a no-op if `id` is already open, so a per-frame caller is safe). */
  open (id, text, bad = false) {
    if (this._list.some(a => a.id === id)) return
    this._list.push({ id, text, bad })
    runLog.on && runLog.event('alert', { id, text, bad })
  }

  /** Close an alert; it leaves the cycle at once (the next one shows from the top of its 2 s). */
  close (id) {
    const k = this._list.findIndex(a => a.id === id)
    if (k < 0) return
    this._list.splice(k, 1)
    if (k < this._i) this._i--
    else if (k === this._i) { this._t = 0; if (this._i >= this._list.length) this._i = 0 }
  }

  /** Advance `dt` s; the alert to show now ({ text, bad }) or null. */
  tick (dt) {
    if (!this._list.length) { this._i = 0; this._t = 0; return null }
    this._t += dt
    while (this._t >= ALERT_CYCLE_S) { this._t -= ALERT_CYCLE_S; this._i = (this._i + 1) % this._list.length }
    return this._list[this._i]
  }
}

// FEAT-216 (owner, 2026-11-16, DEC-327): what a machine-word slot does this poll. `l` is its level now, `prev` its level
// last poll, `step` / `prevStep` the condition in 10 % steps (stepOf), `crit` whether level `l` is a CRITICAL failure
// (a flat or failed tire, a failed wheel): those stay open as long as they are true; everything else shows for a while
// and re-reports at every further 10 % of condition lost. -> 'close' | 'show' (close + open anew) | 'none'.
export const stepOf = (c) => Math.ceil(c * 10 - 1e-9)
export function wordAction (prev, l, step, prevStep, crit) {
  if (l === 0) return 'close'
  if (l > prev) return 'show'
  if (l < prev) return crit ? 'show' : 'close'
  return !crit && step < prevStep ? 'show' : 'none'
}
/** Oil and air filter: "dirty" from 50 % (again at 40 %), "very dirty" from 30 % (and every 10 % below). */
export const wearLevel = (c) => c <= 0.3 ? 2 : c <= 0.5 ? 1 : 0
/** Engine word level: knocking from `knockFrom` (inclusive, DEC-330) down, seized at 0. Both are critical (persistent). */
export const engineLevel = (c, knockFrom) => c <= 0 ? 2 : c <= knockFrom ? 1 : 0

/** One poll of the machine-word slots (main.js _machineWords). `st` is { levels, steps } from the last poll (null on the
 *  first: it only takes the levels in); `expiry` maps alert id -> ms it closes. Every alert of the slots routes through here. */
export function pollWords (alerts, expiry, st, now, steps, isCrit, texts, nowMs, wordS, held = false) {
  // BUG-215: the shop fits and unfits parts for a look (service.js preview / cart replay), which swings the wheel conditions
  // under the poll (28 "bent" alerts in one visit). Held while it is open: the levels stay as they were, so on close only the
  // real change is read against them.
  if (held) return
  now.forEach((l, i) => {
    const prev = st.levels?.[i] ?? l, crit = isCrit(i, l), id = 'w' + i
    const act = wordAction(prev, l, steps[i], st.steps?.[i] ?? steps[i], crit)
    if (act !== 'none') { alerts.close(id); expiry.delete(id) }
    if (act === 'show') {
      alerts.open(id, texts[i][l], l === 2)
      if (!crit) expiry.set(id, nowMs + wordS * 1000)
    }
    if (crit) alerts.open(id, texts[i][l], l === 2)   // a no-op while open; raises it on a loaded run too
  })
  st.levels = now; st.steps = steps
}
