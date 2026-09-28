---
id: BUG-76
type: bug
status: fixed
severity: critical
opened: 2026-09-26
closed: 2026-09-27
source: owner report (2026-09-26) — "the tires fall through the world, but the chassis collides with
  it still". Capture autos-capture-1790494688182 (seed "w" = 177618, mark 245.2 / 603.6), taken on
  feature/roadside-cover; reproduced identically on main.
relates: BUG-63 (promotion existence varies with the window), 2026-09-06 adopt reconciliation
  (0939d7b, coverage stamp), FEAT-77 (clearance re-route), QUAL-33 (root cause, open)
---

# BUG-76 — a positional adopt re-shapes road under chunks that are already carved

## What happened

The wheels and the chassis stood on two different surfaces.

- **Wheels** read the live `analyticHeight` (road-carved), which was correct.
- **Chassis** hit chunk (3,9)'s Box3D heightfield and road trimesh, which were **0.3–0.68 m too
  high**. The tyres sank into the drawn mesh and the body rested on the stale collider. All four
  wheels read 0 compression, and the truck sat at y 179.51 instead of 179.33.

## Root cause

Free roam re-streams the network around the car. The road under the mark depended on where the
window was:

| t on the owner's route | car → mark | road owning the mark | grade Y |
|---|---|---|---|
| 0 s | 620 m | promoted T piece `g:635643,448649,-1:0,1,2` | 178.97 |
| 7.9 s | 537 m | plain edge `g:1,0,2:0,1,2` | 179.57 |
| 28.3 s | 232 m | same plain edge; **chunk (3,9) carved now** | 179.57 |
| 29.9 s | 214 m | promoted T again; **chunk never re-carved** | 178.97 |

From the 250 m-west window, the plan layer declines the T with `promote-replan: the trunk rerouted
out from under the plan`. The FEAT-77 clearance re-route sees different neighbours there.

A `'move'` adopt never bumps `roadGeneration`, and the chunk stayed inside coverage. Neither staleness
stamp (generation for re-routes, coverage for arrivals) could see a road that **moved** on a
positional adopt. So the mesh, heightfield and road trimesh kept the old road for as long as the
chunk lived.

## Fix

- **`RoadSystem.adoptNetwork` diffs the swap.**
  - It snapshots the old runs; entries are never mutated, only the Map is cleared.
  - A run is dirty when it is added, removed, or its geometry changed (points incl. Y, clArc,
    arcOrigin, tunnel / off-curve spans).
  - Dirty runs get `{x,z,reach}` discs along both the OLD and the NEW polyline, plus wider discs at
    their endpoints: carve reach + `roadJunctionBlendLength` + 10 m. That covers profile coupling
    at the node.
  - Changed pads add their own disc.
  - The result is exposed as `lastAdoptDirty()`.
- **`RoadSystem.carveReach()`** is now the ONE carve-extent definition. Terrain's early-reject and
  the diff both read it.
- **`main.js` `onAdopted`, on 'move'**, calls:
  - `terrainSystem.recarveInPlace(dirty, { burst: false })`. The new `burst` option drains the
    re-carve at the driving budget; the existing loop re-syncs the heightfield collider.
  - `roadMeshSystem.invalidateRegions(dirty)`, a new method. It rebuilds the ribbon tile and its
    road trimesh.
- **`test/replay.mjs`** now wires water (`setWaterNoGo`). Without it, it priced a different network
  and reported a false MISMATCH on this capture; it now reproduces exactly.
- **Prerequisite:** the BUG-72 fix (9568001) was cherry-picked first. Re-carving while driving
  would otherwise feed the pooled-geometry VRAM leak.

## Is the DRIVEN surface deterministic?

Yes, at driving range. The owner asked whether approaching a road from a different leg could change
it.
- `test/road-flip-distance.mjs` drives warm headless builds at R 320 (seeds "w" and 6).
- The closest flip to the window centre is 114–140 m, on the owner route. Nothing flipped within
  100 m, and R 576 had no flips at all out to 300 m.
- Story mode is immune: its region is routed once and frozen.
- The window-dependence itself is QUAL-33.

## Verification

- `test/adopt-reconcile.mjs` (new gate):
  - Streams the owner route plus E→W and N→S passes through the mark, and adopts every network change.
  - Re-carves only what the dirty discs or the coverage stamp name.
  - Asserts every built chunk matches a fresh carve after every adopt: 30 adopts, 0 stale.
  - Mutation-tested: with the reconciliation disabled it reports 18 stale chunks, worst 0.406 m.
- `test/road-flip-distance.mjs` (new gate): closest flip > 100 m on all 5 paths.
- `test/bug76-browser-probe.mjs` (rainy-day, needs a dev server), same route, before → after:

  | | before | after |
  |---|---|---|
  | truck y | 179.505 | 179.33 |
  | wheel compression | 0 | 26–39 mm |
  | collider points > 0.15 m above the wheel ground | 1753 | 0 |

## Known cost

About 5 chunk re-carves per positional adopt on the gate routes. Most are precautionary: frontier
runs being added or dropped graze the ring. They drain at one per frame.
