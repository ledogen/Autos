/**
 * src/stream-budget.js — PERF-33: ONE per-frame time budget for all main-thread streaming work.
 * Zero imports.
 *
 * Owner ruling (2026-09-24): smooth driving beats everything; streaming gets what the frame can spare,
 * spent in the order terrain → road surface → props → shadow bake / water pre-warm. The frame loop
 * calls the systems in that order and each one asks deadline(ownCap): the earlier of its own ceiling
 * and the shared end of the budget. Whatever terrain spends, the road and props no longer have.
 *
 * The budget ADAPTS to the machine: it is what is left of a 60 fps frame after the non-streaming work
 * (physics, render submission, HUD — smoothed over the last frames) and a safety margin. On a loaded
 * machine the rest of the frame gets heavier and streaming automatically gets less, instead of every
 * subsystem spending its fixed allowance on top of an already-late frame.
 *
 * FILL mode lifts it to FILL_MS: the initial fill, the refill after a teleport, and the PERF-33
 * freeze-guard hold — the moments the player is at the edge of generation, where a hitch is allowed.
 */

const FRAME_MS = 1000 / 60
const MARGIN_MS = 2.5    // headroom for GPU submission jitter / GC the CPU clock does not see
const MIN_MS = 1.5       // streaming always progresses, even on a frame that is already late
const MAX_MS = 6         // never more than this in play, however idle the rest of the frame is
const FILL_MS = 30       // behind a fill / hold: ~2 frames of work per frame

export class StreamBudget {
  constructor() {
    this._end = 0
    this._otherMs = FRAME_MS / 2   // smoothed non-streaming CPU per frame
    this.ms = MIN_MS               // this frame's budget (read by the HUD/harness only)
    this.fill = false
  }

  /** Open this frame's budget. Call right before the first streaming system runs. */
  begin(fill) {
    this.fill = fill
    this.ms = fill ? FILL_MS : Math.max(MIN_MS, Math.min(MAX_MS, FRAME_MS - MARGIN_MS - this._otherMs))
    this._end = performance.now() + this.ms
  }

  /** Absolute performance.now() deadline for a system whose own ceiling is `capMs`. */
  deadline(capMs = Infinity) { return Math.min(this._end, performance.now() + capMs) }

  /** ms left in the shared budget (≤ 0 once spent). */
  remaining() { return this._end - performance.now() }

  /** Feed last frame's CPU OUTSIDE the streaming block (ms). ~10-frame smoothing. */
  noteOther(ms) {
    if (ms >= 0 && ms < 250) this._otherMs += (ms - this._otherMs) * 0.1
  }
}
