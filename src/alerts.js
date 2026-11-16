// DEC-287: the HUD's alerts area (#machine-word) is general purpose. Several alerts can be open at once;
// it shows one at a time, ALERT_CYCLE_S each, round-robin in the order they opened. Pure: no DOM, no clock.
export const ALERT_CYCLE_S = 2

export class AlertCycle {
  constructor () { this._list = []; this._i = 0; this._t = 0 }

  /** Open an alert (a no-op if `id` is already open, so a per-frame caller is safe). */
  open (id, text, bad = false) {
    if (!this._list.some(a => a.id === id)) this._list.push({ id, text, bad })
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
