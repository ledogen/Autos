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
lane: Perf (p)

# PERF-45: the parked main thread, 170 ms/s with nothing moving

## Next steps
§1 (lever 3) is void as specified: the parked truck never repeats its hub inputs bit-for-bit, so an exact memo never
hits (Log, 2026-11-13). Owner: pick one of the three options under Open questions. §2 (lever 4) is measured and smaller
than the cost map said: the matrix walk is ~20 ms/s, and skipping it outright saves at most 1–14 ms/s (§2 finding).
Orchestrator: build the narrow version (POI groups + barricades) or leave it (Open questions).

## Summary
Parked, with nothing moving, the main thread still spends ~170 ms/s: render ~85, physics ~50, postStream ~20. Lever 1
(HUD style recalcs) cut postStream. §1 (physics at rest) turned out not to be memoisable exactly. §2 (render CPU): the
matrix walk is ~20 ms/s of the render's ~60–95, and at most 1–14 ms/s of it can be won.

## Description
### What the bench shows (PERF-40, park phase, 30 s at the drive's start pose, engine idling, map shut)

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

### The investigation

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

### §1 finding: rest is not a fixed point (2026-11-13)
Probe: `wip/perf-45/park-probe3.mjs <seed> <edges>` (git-invisible). It builds the real world headless
(`test/lib/world-rig.mjs`: road, carves, colliders, the game's own `makeQueryContacts`), seats the truck mid-edge on a
road, handbrake on, and steps 1200 times. Over the last 600 steps it counts the steps on which each input changed.
Three bench seeds, three spots each, road slopes 2–17°:

| what changed step to step | spots |
|---|---|
| chassis quaternion (float32, from Box3D) | 9/9, every step |
| strut compressions (JS doubles) | 9/9, every step |
| the tire query's inputs (hub x, y, z + axle) | 9/9, every step |
| chassis position | 4/9 every step; 5/9 held by float32 rounding |

- Each hub moves 1e-8 to 1.4e-4 m per step. The body's velocity reads 0.4–6.7 mm/s at rest (6.7 mm/s on the 17°
  spot, ~20 cm over a 30 s park).
- **Why:** the tire's carcass spring leaks. The relaxation update divides the stored slip by `1 + dt·vCon/L`, and
  `vCon` is floored at `SLIP_EPSILON` = 0.05 m/s (physics.js). At rest that bleeds the deflection at 0.05/0.3 =
  0.17 /s. To keep holding the truck on a slope, the tire must slide at about 0.17 × the stored slip, so the truck
  creeps. A real tire's bleed scales with the real rolling speed and is 0 at rest.
- **Tried (not kept):** the floor set to 1e-4 and to 1e-7 (seed 1768572700, three spots). The creep stops (position
  steady, velocity 10× lower), but the body then rocks: spin up to 2e-3 rad/s, hubs moving up to 0.44 mm a step.
  So even with the leak gone, rest is still not bit-still.
- **So an exact memo keyed on the query's inputs would hit on 0 % of parked steps**, and it was not built. The cost
  map's "same hub bits in" assumed a fixed point the simulation never reaches.

### §2 finding: the matrix walk is ~20 ms/s, not 67 (2026-11-13)
Probe: `wip/perf-45/matrix-probe.mjs` (git-invisible; `wip/perf-45/census2.mjs` for the per-kind split). Story mode on
the three bench seeds, parked at the start, camera still, unprofiled, fake audio. It wraps `renderer.render()` and the
scene's `updateMatrixWorld()` (the walk three.js runs at the top of every render) with timers, counts nodes, and
alternates the walk on / off (`scene.matrixWorldAutoUpdate`) in six 3 s windows each, so clock drift cancels.

| seed | nodes walked (under a hidden parent) | `updateMatrix` calls / render | walk ms/s | render ms/s walk on → off |
|---|---|---|---|---|
| 1768572700 | 1400 (708) | 1417 | 24.7 | 96.6 → 82.5 |
| 17535907 | 1500 (716) | 1517 | 17.0 | 61.8 → 54.7 |
| 759313244 | 1618 (654) | 1635 | 23.7 | 92.5 → 91.5 |

- Every node has automatic matrices, so every node's local matrix is rebuilt and its world matrix multiplied every
  frame (~0.29 µs a node at this clock). The 67 ms/s in the cost map is the whole `render()` call, not the walk.
- Skipping the walk entirely (the most any static-flag lever can buy) cuts render ms/s by 1–14 (mean 7): the clock
  trap takes the rest back (less work, slower clock).
- Where the nodes are (seed 1768572700): POI groups 703, of which ~640 are hidden past the ring (BUG-164 hides them;
  the draw skips a hidden subtree, the matrix walk does not); the FEAT-154 road-barricade models 457 (`main.js
  _barricadeGroup`); the truck 65; terrain chunks 52; road meshes 46; ~80 others.
- A build has two must-dos: the scene root itself goes static (its own per-frame recompose marks the whole tree
  dirty, so without it only the local rebuilds are saved), and each static kind is flagged where it is created, with
  an explicit `updateMatrix()` on every later move. POI groups + barricades are ~78 % of the nodes: ~15 ms/s of timed
  walk, ~5 ms/s realised. Not built.

## Tracker

- [ ] The parked cost explained per bucket with a profile, on three random seeds and three spot types.
- [ ] Levers proposed with measured savings; exact physics only (no faked rest).
- [x] §1: an exact ground-query memo at rest measured: 0 % hits on 9/9 spots, void (2026-11-13).
- [x] §2: the matrix walk measured: ~20 ms/s, at most 1–14 ms/s to win (2026-11-13). Not built.
- [ ] The owner picks; each lever lands with PERF-40's park phase showing the saving.

## Open questions
- §1, physics at rest (~33 ms/s of ground query, plus Box3D's 8 substeps). Three options:
  1. **Leave it** (recommended for now). ~33 ms/s is 3 % of a core, and the GPU is where this Mac's heat is.
  2. **Reuse the last step's contacts, plane-shifted**, while the hub has moved less than a bound (for example 1 mm).
     This is the rule `qcPlus` already applies across a step's substeps (owner, 2026-10-02), extended across steps.
     Error ≈ ½·κ·d² on smooth ground (d = 0.14 mm/step: ~1e-8 m), up to ~d across a kerb lip's crease. It saves
     ~30 ms/s parked. It is not bit-exact, so it is an approximation and your call.
  3. **Fix the carcass leak** (the bleed ∝ the real rolling speed, no 0.05 m/s floor), so a parked truck holds without
     creeping. This is a physics-honesty fix, not a perf lever: on its own it saves nothing (the body rocks instead).
     It would need a damping term and a feel check.

- §2, the matrix walk (~20 ms/s timed, 1–14 realised at most). Two options:
  1. **Leave it** (recommended). ~5 ms/s realised is 0.5 % of a core, below what the bench resolves in watts, and every
     static flag is a mesh that freezes if a later mover forgets its `updateMatrix()`.
  2. **The narrow build**: the scene root, the POI groups (`_rebuildPoiMarkers`) and the barricade models
     (`_placeBarricades` / `_standRow`) go static; the movers are the FEAT-149 ornament swap, FEAT-102's motorist and
     any POI ring or marker that animates. Worth it only for frame-time headroom on a slower machine (PERF-46's laptop).

## Files
`src/physics.js` (SLIP_EPSILON, the relaxation update) · `src/world-contacts.js` · `test/lib/world-rig.mjs`

## Log
- 2026-11-13 (Perf lane): §1 measured, void as an exact memo (Description, § §1 finding). Nothing built; no src change.
- 2026-11-13 (Perf lane): §2 measured (§2 finding): the walk is ~20 ms/s, not 67; stopped before building, per the
  task's rule (a gain much smaller than claimed is reported, not built). No src change.
