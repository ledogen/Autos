---
id: BUG-240
type: bug
status: open
severity: minor
opened: 2026-11-19
source: owner, 2026-11-19 (inbox) — "The autopilot doesn't work in manual mode"
relates: FEAT-293, DEC-428, DEC-084, src/autopilot.js, src/drivetrain.js, src/clutch-assist.js
---
lane: unplaced (scribe: free lane; Opus for the drivetrain side)

# BUG-240: The debug Driving AI does not work with the manual transmission

## Next steps
Owner tries the Driving AI on the manual (branch `land/gearbox-1120`, http://m4air:8127; debug panel → Transmission
M5OD-R1, clutch assistant off) with the `gearbox-1120-drive` card.

## Summary
The autopilot (debug panel, "Driving AI", FEAT-293 / DEC-428) does nothing useful when the truck has the manual transmission.

Owner's words:
> The autopilot doesn't work in manual mode

Why the scribe thinks so (not verified): `src/autopilot.js` is "state in, controls out" for throttle, brake and steer, built for the automatic; a manual needs gear selection and clutch from the controls too.

## Description
### Reproduced (headless, `node test/drive-ai-soak.mjs --box=m5odr1 --assist=off`)
With the clutch assistant ON (the default) the AI already drove the manual; with it OFF it never moved: `out.clutch` was
always 0 (pedal up), so the shift into 1st at rest was a clutch-in grind (refused) and the truck sat in N, throttle
pinned, until "stuck" ×3. On seed 220671609 that start is a 13 % hill.
### Fix (src/autopilot.js, pure, per instance)
- Its own clutch foot: a private `makeClutchAssist()` instance (the assistant's centrifugal law: bites from idle + 100 rpm,
  fully in by 1400 + 1200 × throttle rpm, dips before a stall, opens for a shift, back in at ≤ 5 /s). Its engagement goes
  out as the pedal (`out.clutch = 1 − e`), so it works with the player's assistant off or on (the sim takes the less
  engaged).
- Gear hand: one press at a time towards the wanted gear, 0.35 s apart, never R rolling forwards. Up when revs pass
  2500 + throttle × (0.78 · redline − 2500) rpm AND the next gear lands ≥ 2000 rpm; down under 1700 rpm, or one down with
  the throttle pinned under 2200 rpm. Revs matched during a shift (off for an upshift, a blip for a downshift).
- Hill start: the handbrake stays on until the clutch carries m·g·sinθ·r / (gear · final drive) at the disc.
- The stopped / crank / trouble returns press the clutch (no stall while parked by the AI).
- `out.trouble` is cleared at the top of `step()` (it was sticky: the bench re-seated every 2.5 s without its workaround,
  removed from `test/playtest-bench.mjs`; `src/auto-drive.js`'s reset-when-stuck would re-seat every step).
### Results (`test/drive-ai-manual.mjs`, 2 km each)
Seed 220671609: automatic 52.6 km/h, manual assist off 52.4 (−0.4 %), assist on 52.4. Seed 1385724447: automatic
44.2 km/h, manual assist off 45.0 (+1.7 %). Every drive: 0 interventions, 0 reseats, 0 stall steps, 0 missed shifts.

## Tracker
- [x] Reproduced on a manual (headless: assist off, never left N)
- [x] The AI drives a manual (shifts and clutch from its controls)
- [x] A headless check with a manual drivetrain (`drive-ai-manual`: 2 km, two seeds, assist off and on, vs the automatic)
- [ ] Owner has looked

## Open questions
- (Answered by building the first option, per the scribe's lean and DEC-084: the AI really drives the manual.)

## Links
FEAT-293.

## Files
`src/autopilot.js` · `src/drivetrain.js` · `src/clutch-assist.js` · `test/autopilot.mjs` (check the gate name)

## Log
- 2026-11-19: minted by the intake scribe from the owner's inbox note. No code touched.
