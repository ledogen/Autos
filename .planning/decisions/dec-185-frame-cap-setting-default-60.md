---
id: DEC-185
status: standing
decided: 2026-11-14
area: perf
governs: PERF-48, src/main.js, src/settings.js, frame cap, frame rate, fps, requestAnimationFrame
supersedes:
---
# DEC-185: A frame-rate cap setting, 60 / 30 / display rate, default 60

**Ruling.** "yes, default 60" — to "a setting with 60 / 30 / display rate, default 60".

**Why.** `requestAnimationFrame` runs at the display's rate, so a 120 Hz screen renders 120 frames a second: about twice the render CPU and GPU for frames the fixed 60 Hz physics never fills.

**Replaces.** Nothing (uncapped rendering at the display rate).

**Source.** Owner, answering PERF-48 lever 5 on the tracker, 2026-11-14. Owner's words. Only rendering is capped; physics stays on the fixed-timestep accumulator.
