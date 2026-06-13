---
id: BUG-11
type: bug
status: open
opened: 2026-06-13
source: phase-09-insim-verify
---

# BUG-11: Road rebuild non-determinism + spawn-off-road

## Request

Two related road-lifecycle issues seen in-sim after the Phase 9 refactor:

1. **Spawn off the road.** On first reload (default seed) the truck spawns just off the SIDE of the
   road, not on it.
2. **History-dependent road position.** Moving the min-radius slider 12 → 15 → 12 leaves the road in a
   DIFFERENT position than after a fresh reload at 12 — i.e. the geometry depends on history, not purely
   on (seed, params). Violates D-16 window-invariance.

(The related "carve/foundations don't follow the slider" symptom was fixed in `b376127` by re-streaming
the road before rebuilding the carve.)

## Hypotheses (to verify)

- **Window-variance from the curvature-clamp fillet.** `filletMinRadius` (road-carve.js) relaxes the
  canonical run with PINNED endpoints. If a run's endpoints (`mx0/mx1` span, or mz row range) depend on
  the streaming window rather than a stable world-aligned grid, a different window → different pinned
  endpoints → different relaxed centerline → road shifts. Verify `_canonRunCache` key `mz:mx0:mx1` is
  world-aligned-stable and that the fillet output for a given key is identical regardless of window.
- **Spawn placement.** `resolveSpawn` may compute the spawn point from a centerline that the fillet then
  moved, or apply a lateral offset. Check resolveSpawn samples the SAME (post-fillet) network the ribbon
  renders, and seats the truck on the centerline.

## Fix directions

- Make the fillet/run geometry provably window-invariant (headless: stream the same world region from two
  different centers, assert identical filleted runs). If not invariant, fillet on a stable world-anchored
  span, not the windowed run.
- Reconcile spawn placement with the rendered centerline.

## Acceptance

- Reload-at-12 and slider 12→15→12 produce the SAME road geometry at the same world position.
- Truck spawns ON the road ribbon.
- Headless window-invariance assertion for the filleted run.
