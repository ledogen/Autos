// BUG-169 / PERF-48: frames drawn per second by the frame cap, fed synthetic rAF timestamps.
import { createFrameCap } from '../src/frame-cap.js'
let bad = 0
const jitter = (i) => Math.sin(i * 12.9898) * 0.4   // +-0.4 ms vsync timestamp noise
for (const hz of [60, 90, 120, 144, 240]) {
  for (const cap of [0, 30, 60, 90, 120]) {
    const f = createFrameCap(), step = 1000 / hz
    let n = 0, maxGap = 0, lastDraw = 0
    for (let i = 1; i <= hz * 10; i++) {
      const t = i * step + jitter(i)
      if (f(t, cap)) { n++; if (lastDraw) maxGap = Math.max(maxGap, t - lastDraw); lastDraw = t }
    }
    const want = cap === 0 ? hz : Math.min(cap, hz), got = n / 10
    const ok = Math.abs(got - want) <= want * 0.02
    if (!ok) bad++
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${hz} Hz cap ${cap || 'display'}: ${got.toFixed(1)} fps (want ${want}), worst gap ${maxGap.toFixed(1)} ms`)
  }
}
process.exit(bad ? 1 : 0)
