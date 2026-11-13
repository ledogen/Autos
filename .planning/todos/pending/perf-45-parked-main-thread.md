---
id: PERF-45
type: perf
status: open
opened: 2026-11-12
severity: minor
source: PERF-40 bench, 2026-11-12 — parked, nothing moving, the main thread still spends ~170 ms/s (17 % of a core).
  Owner, same day: "the park main thread issue".
relates: [PERF-40 (the bench's park phase), PERF-43 (a stationary tyre's ground query becomes a memo hit), PERF-44
  (the render CPU side), PERF-41 (GPU), story-mode traps note 5 in PERF-40 ("at rest physics costs 0–140 ms/s by spot")]
---

# PERF-45 — the parked main thread: 170 ms/s with nothing moving

## What the bench shows (PERF-40, park phase, 30 s at the drive's start pose, engine idling, map shut)

Main-thread ms per second by `__perfData` bucket, mean of valid sessions:

| bucket | main 07581275 | branch (PERF-38/39/42) |
|---|---|---|
| render | 86 | 81 |
| physics | 47 | 60 |
| postStream | 20 | 18 |
| preStream | 7 | 6 |
| ribbon.sync | 4 | 4 |
| water.warm | 3 | 2 |
| total | ~170 | ~174 |

- **Physics at rest, 43–91 ms/s** per session, with the truck at 0.00 m/s. The chassis is `canSleep: false`
  (`physics.js`: "the player's body — never let the engine idle it out"), so every step runs the full wheel ground
  query (40–300 µs a wheel depending on the spot) and Box3D's 8 solver substeps. The spot decides the cost: the same
  truck parked on a junction carve costs several times one parked on open ground.
- **Render, 81–86 ms/s**, about 1.4 ms of CPU a frame for only 123–165 draw calls. That ratio suggests the cost is
  per OBJECT (scene-graph traversal, world-matrix updates, frustum culling, uniform uploads), not per draw call.
- **postStream ~20 ms/s** with nothing streaming.

## The investigation

1. **Physics at rest.** Measure per step, parked, on three spot types (open road, junction pad, off-road): ground
   query µs × queries, Box3D step, the rest of `stepPhysics`. Then the levers, cheapest first:
   - PERF-43's patch memo: a hub that has not moved bit-for-bit gives the same patch and the same samples, so a parked
     tyre's ground query becomes a lookup. Exact by construction (pure function, same inputs);
   - if Box3D's step dominates: why the chassis must never sleep (the comment's reason), and whether an exact
     at-rest shortcut exists. **Never fake rest**: the owner's rule is faithful Newtonian physics; anything skipped
     must be provably what the full step would do.
2. **Render CPU.** A CPU profile of 10 parked seconds (PERF-37's `playlog3.mjs` approach, CDP `Profiler`), plus counts:
   scene objects, objects with `matrixAutoUpdate` on, visible after culling, shadow-pass objects. Candidate levers:
   static props / chunks with `matrixAutoUpdate = false` and `matrixWorldAutoUpdate` off (they never move); fewer
   objects (merge per chunk); skip shadow re-renders while nothing in the shadow's view moved (PERF-16 territory).
3. **postStream at idle.** What runs in it when nothing streams (profile; it may be the map's or a HUD's per-frame
   work).
4. Report a parked budget table (bucket → ms/s → cause → lever → estimated saving) before building anything.

## Acceptance

- [ ] The parked cost explained per bucket with a profile, on three random seeds and three spot types.
- [ ] Levers proposed with measured savings; exact physics only (no faked rest).
- [ ] The owner picks; each lever lands with PERF-40's park phase showing the saving.
