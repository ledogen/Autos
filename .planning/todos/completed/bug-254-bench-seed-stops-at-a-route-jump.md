---
id: BUG-254
type: bug
status: closed
severity: minor
opened: 2026-11-21
source: orchestrator, 2026-11-21 — bench seed 759313244 INVALID in both reps on main 9b04c5f5: 0.79 km, still after 80 s, 0 recoveries
relates: PERF-40, FEAT-293, src/autopilot.js, test/playtest-bench.mjs
---
lane: a

# BUG-254: the bench's driver stood still for good 8 m short of a route jump, with nothing reported

## Next steps
Orchestrator: land with land/perf-54-map-gpu.

## Summary
Not the truck: engine running, 1st gear, no shift in flight. The driver's own speed plan stopped it on purpose. The
bench's route (deadEnd 'jump') ran into a dead end of its network snapshot at (−534, −2171) and jumped to another edge.
FEAT-293's speed plan (src/autopilot.js, 11-18, after the 11-13 record) treats a jump as a terminal and stops 8 m short
of it. Neither report could then fire: 'route jump' needs the car within 6 m of the point before the jump, and the
dead-end check measured from the path's LAST point, which past a jump is the far end of the edge jumped to. The stuck
detector is right not to fire: it needs the throttle over 0.45, and a driver stopping on purpose is not pushing.

## Description
Evidence: wip/bench-1121/A-759313244-1.json samples from t = 90 s to 300 s: v 0–0.2 m/s, at (−534, −2170), route idx
364 frozen, the plan's vT 0–0.7 m/s (the "stop 8 m short" ramp), throttle ≤ 0.27, rpm 750–1160, ignition running.
Fix (src/autopilot.js): the end-of-road check reads the last station's arc (ss[n − 1]), and a jump there reports
'route jump'. Then resume() takes a jump inside its 25 m look-ahead: before that, the re-seat put the truck back at
the dead end and it reported a second time (seen once in the proof run).

## Tracker
- [x] Why it stops, why no report: above
- [x] Gate case: `node src/autopilot.js` case 4 (run by the drive-ai gate): a street with a jump, bench mode, must report
      'route jump' and re-seat on the edge jumped to. Each half fails without its fix.
- [x] Seed 759313244 drives ≥ 2.5 km: 3.11 km, 411 new chunks, valid (wip/perf-54/b254.log)

## Files
`src/autopilot.js`

## Log
- 2026-11-21: fc0d9e54 (report the jump), c94e4b70 (resume takes the jump). Bench, that seed, 1 rep: 3.11 km, 3
  recoveries (route jump twice at the dead end, before c94e4b70; one stuck). Not re-benched after c94e4b70.
