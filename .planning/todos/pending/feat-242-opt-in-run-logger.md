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
Lane C builds it (DEC-358).

## Summary
A debug-menu switch. When on, the game records a run as events and downloads the log by itself, so the owner can just play and later point at an event.

## Description
The owner's list: where you go, what missions you do, how much wear the vehicle sees, the specific events that trigger wear and their damage, items bought, when you eat, when you sleep; 'as much information as possible'. Auto-download every day or after every mission. Up to about 1 GB a run is acceptable unless Chrome struggles or logging costs performance. DEC-358 records the exception to the no-diagnostics-in-src rule.

## Tracker
- [ ] A debug-menu option turns run logging on and off; off by default; off costs nothing
- [ ] Events logged with game time, position and the numbers behind them: missions, wear and damage with trigger and threshold, purchases, eating, sleeping, fuel, tows, deaths
- [ ] The route is sampled at a low fixed rate
- [ ] The log downloads by itself at a fixed point (each day or each mission) with no prompt
- [ ] Measured: frame cost with logging on
- [ ] A reader script in test/ or tools/ prints a run summary from a log
