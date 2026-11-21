---
id: FEAT-315
type: feature
status: closed
severity: minor
opened: 2026-11-20
source: owner, 2026-11-20 — "When a tire fails we should just hide it and show the player driving directly on the wheel"
relates: FEAT-162, FEAT-186, FEAT-94, src/vehicle-model.js, src/damage.js
---
lane: unplaced

# FEAT-315: A failed tire is hidden: the truck drives on the bare rim

## Next steps
Done on land/visual-1120; owner looks at the screenshot sheet (wip/visual-1120/sheet.jpg).

## Summary
A tire flat and worn to 0 (damage.js rimOnRoad) hides its mesh and shows the rim. Visual only.

## Tracker
- [x] A failed tire (rimOnRoad) draws no tire; the flat-tire and bent-wheel looks are unchanged
- [x] Screenshot sheet looked at

## Files
src/vehicle-model.js

## Log
- 2026-11-20: tire mesh hidden while vehicleState.rimOnRoad (flat and tire condition 0); rim drawn at the hub, as before. Physics unchanged: a flat tire runs at 5 % spring rate and 0.70 grip, no radius drop, the hub rides its soft tire spring down onto the rim; only a collapsed wheel (wheel condition 0) already scaled the rim to 0.18 m.
