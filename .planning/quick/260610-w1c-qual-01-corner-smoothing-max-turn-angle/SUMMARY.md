---
quick_id: 260610-w1c
slug: qual-01-corner-smoothing-max-turn-angle
status: complete
date: 2026-06-11
files_modified:
  - src/road.js
  - data/ranger.js
  - src/debug.js
resolves: QUAL-01
---

# SUMMARY: QUAL-01 corner smoothing — max-turn-angle chamfer + live slider

Completes QUAL-01 (the deferred third part). Revived the `_limitTurnAngle` chamfer pass with a tunable
param and debug slider.

## Changes

- **src/road.js** (commit `eb4a388`, via `git revert --no-commit 4a53a1f`): restored `_limitTurnAngle`
  (chamfer interior vertices whose deflection > `maxTurnDeg`, ≤3 passes, endpoints preserved for C0),
  `maxTurnDeg` in `_proto.params` + `_refreshParams`, and the call in `_streamNetwork` after
  `_removeSelfCrossings`. road.js is byte-identical to the `2ae75d2` state the executor verified
  (D-06 seam gate PASS, zero self-crossings, two-build determinism).
- **data/ranger.js**: `roadMaxTurnDeg: 70` (deg) — max interior deflection before chamfer.
- **src/debug.js**: "Max Turn Angle (°)" slider (30–120, step 5) in the Roads folder → `fireRoadParam`
  (debounced deterministic re-stream, same wiring as the D-09 cost sliders).

## Verification

- `node --check` OK on all three files.
- road.js diff vs `2ae75d2` = 0 lines → inherits that commit's verified D-06 PASS / determinism /
  no-self-crossings; the param + slider only expose the existing `?? 70` default live.
- Visual confirmation (sharp corners rounded; slider tightens/relaxes) is a user/browser check on Pages.

## Notes

- `roadMaxTurnDeg = 70` is a starting default — tune live via the slider; lock a new default in
  `data/ranger.js` later if a better value is found.
- QUAL-01 is now fully resolved (viz + loop/self-crossing removal + corner smoothing across quick tasks
  260610-v0y and 260610-w1c).
