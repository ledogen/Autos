---
id: BUG-11
type: bug
status: closed
opened: 2026-06-13
source: phase-09-insim-verify
closed: 2026-06-21
resolution: "Both halves fixed. Spawn-off-road: resolveSpawn re-streams + re-seats (main.js). Determinism: world-anchored run identity (Phase 2, same root as closed BUG-08) makes geometry a pure fn of (seed,params), not slider history — verified headless: param A->B->A == fresh A (geom+gradeY identical) with a real re-routing control."
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

## Status (2026-06-16): REOPENED — determinism now IN SCOPE, folded into the centerline rewrite

**User REVERSED the prior WONTFIX (2026-06-16):** switch to deterministic routing. Folded into the
09 centerline rewrite as **Step 0 (the foundation)** — see `09-CENTERLINE-CONDITIONER-DESIGN.md` /
`09-31-PLAN.md`. Fix = world-anchored row-run span + margin, consume interior → window-invariant;
headless two-center invariance probe is the foundation gate (makes the min-radius/camber gates test a
stable target). Tradeoff accepted: gives up the "sticky across param-tweaks" behavior below; same
(seed,params) becomes reproducible (stable spawns, shareable seeds). Same root as BUG-08 and BUG-14's
band-shift. (Spawn-off-road half remains fixed.)

## Status (2026-06-13, SUPERSEDED): spawn FIXED; determinism = WONTFIX-for-now (user liked the behavior)

**User decision (2026-06-13):** the cross-band re-shaping (12→15→12 ≠ reload) is acceptable —
they *like* that you can mess with road settings at any time and still have a road near where it
was. So the determinism half is documented as a known/potential behavior, NOT a priority fix. Keep
this note; revisit only if it becomes a real problem. The spawn-off-road fix stays.

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

## Resolution (2026-06-21)

Both acceptance halves met.

- **Spawn-on-road**: fixed earlier via `resolveSpawn` (main.js) — re-streams centered on the spawn point
  and re-seats on that network so placement matches the rendered ribbon. (Runtime placement; not
  headless-testable, documented fixed.)
- **History-independent geometry**: fixed by the Phase 2 world-anchored run identity (same root cause as
  closed BUG-08). Verified headless by driving the real RoadSystem through the in-game path
  (mutate param -> invalidateCache() -> update()) and comparing a param-change-and-return against a fresh
  build, with a re-routing control that actually changes the route:
    - `maxRoadGrade 0.15->0.05->0.15`: intermediate route differs (913 vs 1259 on-road pts);
      `A->B->A` == fresh `A` — geometry AND gradeY byte-identical.
    - `roadWTurn 120->5->120`: intermediate route differs (1077 pts); `A->B->A` == fresh `A` identical.
  (First attempt with roadMinTurnRadius was vacuous — the gentle synthetic terrain never curves tight
  enough for the fillet to bite, so the control didn't change the route; switching to a re-routing param
  made it a real test.)

Caveat: probe ran on the synthetic coarse-height (seed 6), but history-independence is a structural
property of the rebuild/cache path (`_generation`/`_networkRev` keying + world-anchored band),
independent of the height function. Standing stream-center invariance is already guarded by
invariance.mjs / restream-invariance.mjs (in npm test); the param-history probe was throwaway (easy to
recreate, per project preference not to retain one-off gates).
