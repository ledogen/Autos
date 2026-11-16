---
id: FEAT-236
type: feature
status: open
severity: minor
opened: 2026-11-16
source: owner, 2026-11-16, inbox — "Add simple drag to the whip antenna so that it is pushed backwards the faster you go"
relates: src/vehicle-model.js
---
lane: unplaced (small)

# FEAT-236: The whip antenna leans back with speed

## Next steps
Built on `land/visual-batch`; owner looks at the whip at highway speed and says if the lean (3.8 / 15 / 31 deg at 30 / 60 / 90 mph) wants changing (`ANTENNA_TUNE.dragK`).

## Summary
Add simple aerodynamic drag to the whip antenna so it is pushed backwards the faster you go.

## Tracker
- [x] Antenna leans back with airspeed (drag goes with speed squared), upright at rest
- [x] Existing sway still works (drag is one more force term in the same spring)
- [ ] Owner has looked

## Log
- 2026-11-16: filed from the owner's inbox note.
- 2026-11-16: built edac17ce. dragK 0.025 on the mount's own velocity (reverse and sideways bend the other way for free). Pictures wip/visual-batch/antenna-*.png (standalone page, not in-game driving).
