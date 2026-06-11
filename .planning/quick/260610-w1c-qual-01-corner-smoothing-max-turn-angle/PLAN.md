---
quick_id: 260610-w1c
slug: qual-01-corner-smoothing-max-turn-angle
type: quick
created: 2026-06-11
files_modified:
  - src/road.js
  - data/ranger.js
  - src/debug.js
resolves: QUAL-01 (completes corner smoothing — the deferred third part)
---

# Quick Task: QUAL-01 corner smoothing — max-turn-angle chamfer + live slider

## Context

QUAL-01 viz + loop/self-crossing removal shipped earlier (quick 260610-v0y). The corner-smoothing was
deliberately deferred so the user could re-look at the smooth-spline viz first. User has now decided the
corners still need limiting → revive the smoothing.

## What this does

Restore the `_limitTurnAngle` chamfer pass that was drafted then stripped (commit `2ae75d2` added it,
`4a53a1f` stripped it), plus its tunable param and debug slider:

1. **src/road.js** — re-applied verbatim via `git revert --no-commit 4a53a1f` (restores `_limitTurnAngle`,
   `maxTurnDeg` in `_proto.params` + `_refreshParams`, and the `_streamNetwork` call after
   `_removeSelfCrossings`). road.js returns byte-identical to the `2ae75d2` state the executor already
   verified (D-06 PASS, no self-crossings, deterministic).
2. **data/ranger.js** — `roadMaxTurnDeg: 70` (deg). Max interior deflection before a vertex is chamfered.
3. **src/debug.js** — "Max Turn Angle (°)" slider (30–120, step 5) in the Roads folder → `fireRoadParam`
   (debounced deterministic re-stream, same wiring as the D-09 sliders).

`_limitTurnAngle`: for each INTERIOR vertex whose deflection > `maxTurnDeg`, chamfer it (pull back 40% of
the shorter adjacent edge), up to 3 passes; endpoints never moved (C0 continuity). Pure/deterministic.

## Verification

- `node --check` on all three files.
- road.js is byte-identical to the `2ae75d2`-verified version (revert of the strip), so D-06 seam gate +
  determinism + no-self-crossings already hold; param/slider only expose the existing `?? 70` default.
- Manual (user, browser/Pages): reload, Show Road Splines — sharp corners are rounded; the "Max Turn
  Angle" slider visibly tightens/relaxes corners after the debounce. Dial to taste; lower = smoother.

## On completion

QUAL-01 fully resolved (viz + loop removal + corner smoothing) — move
`.planning/todos/pending/qual-road-spline-shape.md` to completed; update STATE Quick Tasks table.
`roadMaxTurnDeg 70` is a starting default — user tunes via the slider; lock a new default later if desired.
