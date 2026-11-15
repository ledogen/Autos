// src/frame-cap.js — PERF-48 / DEC-185 / BUG-169: the render frame cap's decision, pure so a node gate can
// feed it synthetic rAF timestamps. rAF (requestAnimationFrame, the browser's once-per-display-refresh
// callback) fires at the display's rate. `cap` is frames per second, 0 = no cap (every refresh draws).
// A frame that is not yet due is skipped; `due` advances by whole intervals so a display rate that is no
// multiple of the cap (144 Hz vs 60) still averages the cap, and a stall over one interval resyncs instead
// of bursting. A frame is drawn when it is nearer its due time than the next refresh would be (half the
// last refresh gap early), which absorbs vsync timestamp jitter.
export function createFrameCap () {
  let due = 0, last = 0
  /** @returns {boolean} true = draw this rAF callback. */
  return function frameDue (t, cap) {
    if (!(cap > 0) || t === undefined) return true
    const interval = 1000 / cap, refresh = Math.min(t - last, interval)
    last = t
    if (t < due - refresh * 0.5) return false
    due = t - due > interval ? t + interval : due + interval
    return true
  }
}
