---
id: DEC-224
status: standing
decided: 2026-11-14
area: perf
governs: BUG-169, PERF-48, src/main.js, src/settings.js, src/frame-cap.js, frame cap, frame rate, fps
supersedes:
---
# DEC-224: The frame-rate cap gains 90 and 120 fps (extends DEC-185)

**Ruling.** "also add 90fps and 120fps as options" — the frame-rate setting is 60 / 30 / 90 / 120 / display rate, default stays 60 (DEC-185).

**Why.** Owner's 144 Hz G-Sync monitor: 60 is too low and the full display rate is more than is wanted. A cap that is no divisor of the display rate (120 on 144 Hz) averages the cap with uneven frame gaps; that is accepted.

**Replaces.** Nothing; DEC-185 stands and this adds options to it.

**Source.** Owner, inbox 1e97, 2026-11-14 (BUG-169). Owner's words. Saves keep working: the stored value is the fps number, so existing 60 / 30 / 0 saves load unchanged.
