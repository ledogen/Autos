---
id: FEAT-242
type: feature
status: open
severity: major
opened: 2026-11-16
source: owner, 2026-11-16 — "I started reading the feat 69 Deep dive and I think you could one-shot a Pretty smart logger that would pull a lot more data out of our runs I think we can add a debug menu option For run logging if enabled It'll start recording data about a run including Where you go, what missions you do, how much wear the vehicle sees, specific events that trigger wear And the associated damage What items you purchase when you eat, when you sleep Basically pull as much information out of the game as possible Then it can auto download the JSON log Every day or after every mission I'll leave it up to you how frequently That way I can enable logging and just play and not have my session interrupted by Forms or having to press a key or manage a file Everything that's relevant will automatically be saved so then I can say Hey at the end of this log I hit a rock And I don't think it should have popped my tire Let's adjust the threshold and you can see exactly what event triggered the damage I think you can be as information dense as possible And if necessary I can ask you to pull it back later since we've never had an issue with log file sizes. Something like 1 GB per run is probably permissible Unless... Chrome struggles downloading the file or Logging adds significant performance overhead or something like that"
relates: FEAT-69, DEC-358
---
lane: unplaced

# FEAT-242: An opt-in run logger that auto-downloads a JSON log

## Next steps
Built on `land/feat-242-runlog` (lane C); orchestrator lands it. Owner: turn it on and play; ask for a pull-back if a part is too dense.

## Summary
A debug-menu switch. When on, the game records a run as events and downloads the log by itself, so the owner can just play and later point at an event.

## Description
The owner's list: where you go, what missions you do, how much wear the vehicle sees, the specific events that trigger wear and their damage, items bought, when you eat, when you sleep; 'as much information as possible'. Auto-download every day or after every mission. Up to about 1 GB a run is acceptable unless Chrome struggles or logging costs performance. DEC-358 records the exception to the no-diagnostics-in-src rule.

### As built
- `src/run-log.js`: `runLog.on`, `event(type, data)`, `tick(dt)` (1 s route sample from the fixed step), `flush()`. Every call site is
  `runLog.on && …`. Stamp on every line: game day + hour, real ms, playtime, truck pos [x,y,z], speed, heading.
- Debug panel → *Run logging (FEAT-242)*: the checkbox (remembered in localStorage key `autos-runlog/1`, the choice only),
  *Download log now*, an events counter. Turning it on mid-run writes a `header` line (seed, settings, parts, every condition,
  flats, inventory, wallet, fuel, energy, build).
- Parts: JSON Lines, `autos-run-<seed>-<startISO>-partNN.jsonl`, downloaded at each new game day, run end, `pagehide`,
  switching off, and the button; the buffer is emptied after each. Chrome asks once to allow multiple downloads.
- Events: `runStart` · `route` (mode, on-road, fuel, energy, hunger, wallet, gear, rpm, temp, pedals, continuous wear by
  track and cause, every track's condition each 60 s) · `mission` (each state change: offer, spec, job scalars + terms,
  result with pay/deeds/letter) · `impact` · `bumpStop` · `rimStrike` · `puncture` (hazard) · `missShift` (each with the
  measured force/speed, its thresholds, condition before → after, popped tires, and the corner's load, strut speed,
  tire condition and velocity AT THE PEAK) · `reseat` · `reset` · `tow` · `roadside` · `tire` (spare, plug, tire service)
  · `fit` · `repair` · `purchase` (the service cart's lines) · `fuel` (pump, can pour) · `item` (grant/use/consume/drop/
  take/remove) · `eat` · `drink` · `crash` · `timeSkip` · `sleep` (+ `sleepSite`: where, vibe segments, gear assist) ·
  `camp` (make/break) · `alert` · `runEnd` · `part`.
- `node tools/run-log-summary.mjs <parts…>`: days, km, jobs by type (time, pay, deeds, ranks), money per day, wear by
  cause, damage events + top 10 + every puncture against its threshold, purchases, fuel, tows, sleeps.

## Tracker
- [x] A debug-menu option turns run logging on and off; off by default; off costs nothing
- [x] Events logged with game time, position and the numbers behind them: missions, wear and damage with trigger and threshold, purchases, eating, sleeping, fuel, tows, deaths
- [x] The route is sampled at a low fixed rate
- [x] The log downloads by itself at a fixed point (each day or each mission) with no prompt
- [x] Measured: frame cost with logging on
- [x] A reader script in test/ or tools/ prints a run summary from a log

## Files
src/run-log.js (new) · tools/run-log-summary.mjs (new) · test/run-log.mjs (new gate) · hooks in src/damage.js, mission.js, day.js,
inventory.js, alerts.js, camp.js, service.js, fuel-stop.js, recovery.js, debug.js; one-line calls in src/main.js · test/cdp-smoke.mjs `runlog` step.

## Log
- 2026-11-16, lane C, land/feat-242-runlog: built. Gates: affected 69/69 green (serial); smoke boot,story,runlog,service,newRun PASS; build OK.
  Cost: node microbench damage.step + tick off 1.02 µs/step, on 2.30 µs → ~0.08 ms per second at 60 Hz. Browser A/B (PERF-40 bench,
  120 s): every session INVALID (0 km in BOTH arms, the autopilot never drove), so no drive number; parked phase main thread A 565/569 vs
  B (logging on) 564/571 Minstr/s, no difference. Size: route line ~440 B → ~26 KB per game hour + events; a 10-day run ~5–10 MB.
  Not hooked: economy.js (its gate pins "imports nothing"; the wallet rides every route sample instead); mom's menu (in flux on another lane).
