# Handoff — broken one-sided trident junction (seed 6, node 253,−131)

**For:** Fable (next session)
**Date:** 2026-07-21
**Worktree:** `/Users/ledogen/CodeShit/CarGame-junction-fix`  · branch `feature/junction-fix` (off `main` @ 9945bb8)
**Dev server:** `http://localhost:3615` (Vite, `npm run dev -- --port 3615 --strictPort`, running in bg)
**node_modules:** symlinked from main checkout (`ln -s ../CarGame/node_modules`) so headless gates/scripts resolve `three`.
**Uncommitted:** `src/road.js`, `src/road-mesh.js` (main.js debug scaffolding already reverted). NOT yet committed — user has not signed off.

---

## The subject

A **one-sided "trident" hub** at seed 6, graph node **(253, −131)** (map2d shows it as a deg≥3 hub;
`_detectNodeJunctions` clusters it as a 3-leg AT_GRADE node). The three legs all fan into the
E/NE/SE half; the western ~219° sector is open (no road). The node sits on the shoulder of a slope
(terrain falls away on the open west/SW side), and it's ~3 m from **both** corners of its tile (3,−3).

User's original complaint: *"very broken intersection — pad doesn't render, surface between the legs
is discontinuous, driving in from below triggers failsafe, from above flips you."*

This node reproduces **exactly** headless (`node test/replay.mjs <capture>` matched game runKey/gradeY/
arcS/minRadius at the mark). Network is identical in-game and headless — no route-cache divergence.

---

## Root-cause chain (fully diagnosed)

1. **No pad rendered (primary).** `RoadMeshSystem._buildRoadTile` early-returned on any tile with
   zero ribbon slices — **before** the junction-pad loop. The node's own tile (3,−3) has no ribbon
   slices (ribbons are trimmed `roadJunctionCutback`=10 m back from the node, and the node is in the
   tile corner, so every trimmed stub lands in the neighbour tiles). → pad never added to scene.
   The pad GEOMETRY built fine all along (verified 107 verts via live CDP) — it just never got added.
2. **Pad boundary collapsed to a sliver.** Even reaching the builder, the exact-weld pad was rejected
   by an over-eager **pitchfork guard** (`Σleg-dirs/n > 0.55`; this node's mouth-dir metric = 0.67),
   forcing the legacy circle-pad fallback, which for a one-sided cluster degenerates to an ~81 m²
   crescent sliver. Guard-off, the weld is a clean, non-self-intersecting **233 m²** ring.
3. **Near-vertical embankment wall (the flip / failsafe).** In `_carveCrossSection`, `_junctionCarve`
   widens the flat core (`carveHalfWidth` → ~12 m near the node) but the fill/cut **toe** was anchored
   at bare `halfWidth+shoulderWidth` (7.5 m). So `toeExt` (~9 m) fell *inside* the widened core:
   `latDist > toeExt → return null` fired while `latDist < carveHalfWidth` still said "core, blendW=1"
   — annihilating the shoulder ramp. The flat plaza butted straight onto raw terrain: measured a
   **1.82 m drop over 0.5 m (up to 81°)**. (This latent bug also produced a small ~0.5 m wall on
   ordinary flat roads.)
4. **Inter-leg creases** — `_resolveRoadSurface` hard-switches to the nearest leg; where the Voronoi
   boundary between two legs falls, their grades diverge from the node → steps growing with radius
   (measured up to **2.4 m at r=12 m**). Present in both mesh and physics. **Not yet fixed.**

---

## Fixes applied (all verified, uncommitted)

### FIX 1 — `src/road-mesh.js` `_buildRoadTile` (~line 823): build pads on slice-less tiles
Removed the early `return` when `segs` is empty; the ribbon loop now iterates `(segs || [])` (no-op
when empty) and execution falls through to the junction-pad loop + the final `_tileMeshMap.set`.
This is **the fix that makes the pad appear.** Comment inline explains why an empty-slice tile can
still own a junction node.

### FIX 2 — `src/road-mesh.js` `_junctionRingWeld` (~line 1112): remove the pitchfork guard
Deleted the `if (n>=3 && Σleg-dirs/n > 0.55) return null` block. `buildJunctionFootprint` already runs
`_ringSelfIntersects()` as the real correctness gate (nulls a bad ring → falls to fs=0.5 → legacy), so
removing the heuristic can only ADD clean pads. Verified across 12 stream centers: only this node
tripped it; guard-off yields a clean 233 m² weld with no self-intersection.

### FIX 3 — `src/road.js` `_carveCrossSection` (~line 3514): anchor toe at the widened core
`fillToe`/`cutToe` now start at `carveHalfWidth + shoulderWidth` (the true, junction-widened core
edge) instead of `halfWidth + shoulderWidth`. The smoothstep ramp band therefore always exists beyond
the core; bank slope now actually matches `roadFillSlope`/`roadCutSlope`. Shared mesh+physics fn, so
agreement preserved. The `toeExt` cap (`carveHalfWidth + maxEmbankmentToe`) is unchanged → no vertex
coverage or footprint-bound shift.

### Verification
- `node test/run-all.mjs --changed=src/road.js` → **22/22 gates green** (incl. every terrain-carve gate:
  carve-mesh-smoothness, shoulder-lateral-continuity, road-fill-support, road-band-coverage,
  road-smoothness; and JUNCTION-AT-ROAD-GRADE).
- road-mesh.js/main.js affected set → **3/3 green** (prop-shadow-alignment, par-oracle, gps-route).
- Headless renders (`test/screenshot.mjs`) confirm a solid, flat, filled pad from overhead + ground.
- Physics W-E line through the pad (node-rel dx −16..+8 at z=nz−1) is now **smooth, blendW=1.0, ~152 m,
  no steps** — the wall (defect 3) is gone.

---

## REMAINING ISSUES (what's left for you)

User's latest report + screenshot (`image #9`, POS 243/−132): *"pad renders but there's still a wall,"*
truck nose-down (FL Fz 0, FR Fz 0) in what looks like a crater at the pad's western edge, and a
**terraced/stepped cut-bank "wall"** on the left (west/north).

Key diagnostic result: **the PHYSICS surface around the truck is already smooth and flat** (see the
W-E probe above — no pit, no step, blendW=1.0). So:

- **A. The terraced cut-bank "wall" (left of frame).** This is the `roadCutSlope`=1.0 (45°) cut bank
  rendered on the coarse terrain grid → visible stair-steps. FIX 3 guaranteed the ramp *exists* but
  did NOT reduce its steepness. This is the "wall" the user means. Options to evaluate: gentler
  default `roadCutSlope` near junctions, or smoothing the cut bank on the coarse grid. Confirm whether
  it's genuinely un-drivable or just ugly.
- **B. The pad-edge crater / nose-dive.** Physics is smooth there, so suspect: (i) stale truck pose —
  ask user to press **R** (reset) and re-check; or (ii) a **mesh-only** dip — the pad mesh samples
  `sampleRoadTopY` per vertex; if the OPEN-side pad boundary (straight/Hermite corner join across the
  219° gap) bulges out over un-carved terrain, the pad vertices there ride the plane fallback / a lower
  leg and the pad triangulates a bowl while physics stays flat → truck *looks* craterd but sits on flat
  ground, or a gap between pad edge and terrain lets a wheel drop. Verify by sampling the built pad
  geometry Y vs physics H across the west edge (see tools below).
- **C. Inter-leg creases (defect 4, still open).** Up to 2.4 m steps where `_resolveRoadSurface`
  switches legs. Drafted-but-not-applied fix: near the node (where `_junctionCarve` frac>0) blend the
  resolved `gradeY` toward the node's fitted **pad plane** (`node.plane`, via `_padPlaneY`). Concept
  test showed it removes the step ONLY within the carve radius (`roadJunctionCarveRadius`=7 m); the
  step reaches 2.4 m out at r=12, so the blend radius likely needs to track the leg divergence, not the
  fixed carve radius. Threading (wx,wz) into `_carveDirtY` is required (it currently only has
  signedLat/arcSEff/runKey); both callers (`_sampleCarveWorld`, mesh `_buildCarveTable` line ~1327)
  have world coords available.

**Design note (important):** the deepest driver is that a one-sided trident on a slope *wants* a tall
retaining fill / cut on its open side. Consider whether the honest fix is upstream — e.g. don't flat-pad
one-sided clusters, or let the pad plane follow terrain more (currently capped at
`roadJunctionPadMaxGrade`=0.07). Check `.planning/story-mode/DESIGN.md` invariants before any
gameplay-affecting change. Respect the user's feedback memories: prefer the SIMPLEST design that hits
the visual/driving goal; fix root not symptom; worldgen character must EMERGE from the cost model.

---

## Diagnostic tools / recipes (all worked this session)

- **Headless render (your eyes):** `node test/screenshot.mjs 256 -128 --port=3615 --height=38 --zoff=6
  --pitch=-1.45 --wait=7000 --out=/tmp/x.png` — launches its own Chrome on CDP 9222, fresh page load,
  reads current disk (picks up edits without a build). Node ~(253,−131); good angles used: overhead
  `--pitch=-1.45`, ground `--height=6 --zoff=20 --pitch=-0.5`.
- **Replay the capture:** `node test/replay.mjs /Users/ledogen/Downloads/rangersim-capture-1784696173802.json`
  (there are several newer captures in ~/Downloads too). Confirms headless==game at a mark.
- **Live CDP introspection:** temporarily add `window.__rs = () => roadSystem; window.__rms =
  () => roadMeshSystem` right after the RoadMeshSystem ctor in main.js (line ~1857), then drive a small
  CDP script (see `test/lib/cdp.mjs`): `launchChrome(9222)` → navigate `:3615` → wait `window.__rsReady`
  → `window.__view(x,y,z,yaw,pitch)` to stream a spot → eval into `__rs()/__rms()`. This is how "pad
  builds (107v) but 0 pad meshes in scene, tile (3,−3) has empty meshes[]" was found. **Remove the
  globals before commit.**
- **Headless physics/mesh probes:** build `new RoadSystem(6, RANGER_PARAMS)` + `road.update(new
  THREE.Vector3(cx,0,cz))`. Physics surface at (x,z): `raw=road._coarseH(x,z);
  nr=road._resolveRoadSurface(x,z); c=road._sampleCarveWorld(x,z,raw,nr); Y = (c&&c.blendW>1e-6) ? raw
  + c.blendW*(c.gradeY-raw) : raw`. Pad ring: `new RoadMeshSystem(null, road, null, RANGER_PARAMS, 6)`
  then `_junctionRingWeld(node,P,1.0)` / `_ringSelfIntersects` / `buildJunctionFootprint(node,P)`.
  `road.analyticHeight` is NOT a RoadSystem method — use `_coarseH` for raw, or `TerrainSystem` for the
  full field.

## Key params (data/ranger.js)
`roadJunctionCutback`=10, `roadJunctionCarveRadius`=7, `roadFilletRadius`=5, `roadJunctionFootprints`=true,
`roadHalfWidth`=5, `roadShoulderWidth`=2.5, `roadCarveExtraWidth`=3, `roadMaxEmbankmentToe`=10,
`roadFillSlope`=3.0, `roadCutSlope`=1.0, `roadJunctionPadMaxGrade`=0.07, `roadJunctionKinkDeg`=9.

## When done
Commit FIX 1/2/3 as e.g. `fix(road): render + flatten one-sided trident junction pads`. Merge via
`bash /Users/ledogen/.claude/skills/worktree/scripts/wt.sh merge junction-fix` (user must confirm).
There's an existing pending ticket `.planning/todos/pending/feat-save-persistence.md` — unrelated.
