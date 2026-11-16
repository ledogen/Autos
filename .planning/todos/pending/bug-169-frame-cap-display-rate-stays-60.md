---
id: BUG-169
type: bug
status: open
severity: major
opened: 2026-11-14
source: owner, 2026-11-14 inbox — "Switching the display rate from 60 to display rate on my 144 Hz G-Sync monitor on the Windows machine still only runs the game at 60 frames …"
relates: PERF-48, DEC-185, src/settings.js, src/main.js
---
lane: Perf

# BUG-169: Frame cap "display rate" still runs 60 fps on a 144 Hz monitor; add 90 and 120

## Next steps
Owner's Windows findings are in the Log (card bug169-try answered 11-16: F11 fullscreen misbehaves, maximized differs). Perf lane
reproduces on a 144-165 Hz display (Windows only; not reproducible on the Mac) and fixes, then adds the 90 and 120 options
(extends DEC-185: new record when built).

## Summary
On the owner's Windows machine, 144 Hz G-Sync, the frame-rate setting "display rate" still runs 60 fps by the debug readout. The owner also wants 90 and 120 fps options.

## Description
Inbox 1e97:
> Switching the display rate from 60 to display rate on my 144 Hz G-Sync monitor on the Windows machine still only runs the game at 60 frames per second. also add 90fps and 120fps as options

DEC-185 rules "60 / 30 / display rate, default 60". Adding 90 and 120 extends it. PERF-48 noted on 144 Hz a software cap averages with uneven gaps, so 90/120 on 144 Hz needs a pacing look. Related stutter: PERF-50.

## Tracker
- [ ] "Display rate" runs at the display rate (144 on a 144 Hz monitor), confirmed in the debug readout on Windows
- [ ] 90 and 120 fps options on the settings page
- [ ] A new decision record extending DEC-185 is written when the options land

## Files
`src/main.js` · `src/settings.js`

## Log
- 2026-11-14: minted from the owner's inbox by the scribe. Nothing built.
- 2026-11-16, owner (card bug169-try, Windows, 165 Hz monitor): in F11 fullscreen the cap misbehaves (60 holds 60; 90 gives about 80; 120 or display rate gives about 70; unfocused but visible it locks 165, then falls back about 5 s after refocus). In a maximized window it is fine and holds 165 while driving. In a window the cap is obeyed but the debug counter reads about 5 % above the setting. Open: the F11 fullscreen behaviour, and the 5 % counter offset. Needs the Windows machine.
