---
id: BUG-244
type: bug
status: closed
severity: major
opened: 2026-11-19
source: owner, 2026-11-19 (inbox) — "The automatic transmission hunts and seeks really bad and to me it feels like the gearing is a little bit long. That could be realistic though. It has enough torque in first gear."
relates: DEC-205, DEC-255, FEAT-258, src/drivetrain.js, data/transmissions.js
---
lane: lane B (drivetrain; Opus)

# BUG-244: The automatic hunts and seeks between gears; the gearing feels a little long

## Next steps
Closed: the owner drove it ("the auto gearbox works a dream"); lands with land/gearbox-1120, with a 0.35 s shift time added (autoShiftTime).

## Summary
Owner's words:
> The automatic transmission hunts and seeks really bad and to me it feels like the gearing is a little bit long. That could be realistic though. It has enough torque in first gear.

Two separate things in one note: (1) the automatic hunts, i.e. it shifts up and down repeatedly instead of settling; (2) the gearing feels a little long (tall ratios). He adds that (2) "could be realistic though" and that first gear has enough torque. Hunting is the bug; gearing is a feel call and, on his own hedge, not yet a request for a change.

## Description
### Reproduced (headless, `node test/shift-hunt.mjs --map`)
The full truck on a constant grade, 8 grades (0–15 %) × 4 start speeds (20–110 km/h) × 9 inputs (a pad held at
15–100 %, a keyboard feathering W at 30/50/70 % duty through the real ramps), both automatics. A hunt = a shift undone
within 4 s. Main: 4R44E 73/288 cells, 1605 reversals; 5R55E 68/288, 1689; median 0.63 s. Pad cells alone: 10/192 and
3/192, 1-2-1 every 3.1–4.5 s at 12–15 % and 35–50 % (e.g. 15 % at half pedal: 1→2 at 36 km/h, 2→1 at 30 km/h, 7.3 s cycle).
### Causes
1. The upshift's look-ahead carried today's acceleration into the next gear scaled by the ratio step: it never paid the
   road load, so on a grade 2nd "accelerated" on paper and was taken, then fell back.
2. The schedule read the driven axle: a W tap at 20 km/h in 1st spun the rears 2.9 m/s (under the 7.5 m/s spin lock), read
   as 2169 rpm against a real 1540: 1→2, 2→1 on the re-grip, every press.
3. A held floor (≥ 0.4 s) kicked down on every W press and shifted back on every release (the 0.63 s reversals).
### Fix (src/drivetrain.js, data/ranger.js)
- Newton projection: T_load = T_now − m_eff·r²·α (both smoothed 0.25 s); α_g = (T_g − T_load)/(m_eff·r²) with T_g at gear
  g's coupled rpm / converter stall at the AVERAGED pedal (FEAT-124). m_eff·r² = (m + kit)·r² + 4·I_wheel.
- The schedule reads road speed: min(driven axle, ground reference = max(front wheels, CG speed)).
- `shiftLookahead` 1 → 4 s, and an upshift dwell of the same 4 s after any downshift and while the floor is held, waived
  at the rev-out (driven axle at the WOT upshift point). Not physics: a TCM's shift-busyness calibration.
- No downshift into a gear Newton puts on the limiter within the 4 s.
### Results
Gate green on the branch (0/288, both boxes). Shift points on the flat unchanged at 25 % (1→2 29 km/h, 2→3 50) and floored
(60 / 109 / 164); at 50 % 1→2 34 → 37 km/h. Times from rest, main → branch, 4R44E: 0–100 floored 9.67 → 9.65 s, 0–60 at
half 12.27 → 11.82, 400 m up 10 % floored 19.90 → 19.88, half 45.33 → 38.55, 15 % floored 21.95 → 21.92, half 49.43 →
43.63. 5R55E: 9.17 → 9.17, 11.18 → 10.77, 19.43 → 19.43, 36.40 → 34.73, 21.17 → 21.17, 50.47 → 45.42.
Residual: at a fixed part pedal where no gear holds a steady speed (12–15 % at half: 1st gains, 2nd loses ~0.1 m/s²)
the box still swaps 1-2, but every ~20 s with each gear held ≥ 4 s, not every 7 s.

## Tracker
- [x] Reproduced: headless sweep, `test/shift-hunt.mjs` (grade × input × speed), the map above
- [x] Cause named: road load missing from the upshift look-ahead; wheelspin read as road speed; kickdown on every W press
- [x] Hunting fixed, with a headless gate on a steady-throttle cruise and a climb (`shift-hunt`, red on main, green here)
- [x] Gearing: the owner decides whether to change ratios (not built from n = 1) — no change asked on the drive
- [x] Owner has looked

## Open questions
- Gearing: "a little bit long ... could be realistic though". No change is asked. The scribe does not touch ratios; the owner says if he wants shorter gearing (DEC-205 covers the axle ratio as final drive, an alpha part).
- No conflict found; DEC-255 is about the automatic's reverse pedal only.

## Links
FEAT-258, FEAT-159.

## Files
`src/drivetrain.js` · `data/transmissions.js` · `test/drivetrain-*.mjs`

## Log
- 2026-11-19: minted by the intake scribe from the owner's inbox note. No code touched.
- 2026-11-20: built on land/gearbox-1120 (lane agent). shift-hunt red on main / green, drive-ai-manual green, cdp-smoke green on retry (save-step flake once), pad-e2e ALL OK; affected gates (133, --serial) 48 run, 0 red at hand-off, log /private/tmp/claude-501/-Users-ledogen-CodeShit-CarGame/bd00ae91-7bd8-4224-8f6d-35255cd45e4a/scratchpad/runall2.log. Fingerprint differs from step 93 (1.55 s, main's spin-read 1-2); identical before.
- 2026-11-20: owner on the card: "the auto gearbox works a dream … Add a brief shift timer to the auto box. the shifts are too instantaneous". Added autoShiftTime 0.35 s (drive cut, the manual's shift-in-flight path shared); shift-schedule §5 pins it. Closed.
