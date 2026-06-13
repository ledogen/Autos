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

## Progress (2026-06-13)

- **Spawn-off-road: FIXED** (`resolveSpawn`, main.js). Root: spawn streamed + queried from the
  baseTile center, then seated the truck up to 200 m away — across a 256 m anchor band — so the
  first-frame re-stream around the truck shifted the canonical run's X-extent (`mx0..mx1` follow the
  stream center) and the road moved out from under the truck. Fix: after finding the spawn point,
  re-stream centered on it (`ensureTile(spawnTile)`) and re-seat on THAT network so placement matches
  the rendered road.
- **Determinism (12→15→12 ≠ reload): still open — this is the cross-band window-variance, same root as
  BUG-08.** `mx0/mx1 = floor(center.x / PROTO_ANCHOR_SPACING) ± CANONICAL_HALF_WIDTH` (road.js ~1301)
  follow the stream center, so the canonical run (and its CatmullRom + fillet end-effects) re-shape
  each time the center crosses a 256 m band. Within a band it IS invariant. **Proper fix:** build each
  row-run with a world-anchored MARGIN beyond the rendered span and only consume the interior, so the
  rendered region's geometry (incl. the curvature-clamp fillet, which is local — bracketed by straights)
  is invariant across stream centers. Pre-req: a headless window-invariance probe (stream the same world
  region from two centers, assert identical geometry). Treat BUG-08 and this as one fix.

## Acceptance

- Reload-at-12 and slider 12→15→12 produce the SAME road geometry at the same world position.
- Truck spawns ON the road ribbon. ✅ (spawn fix)
- Headless window-invariance assertion for the filleted run.
