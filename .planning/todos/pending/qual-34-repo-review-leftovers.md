---
id: QUAL-34
type: quality
status: pending
severity: minor
opened: 2026-10-02
relates: the whole-repo review on branch `feature/repo-review` (commits review-1 … review-9)
---

# QUAL-34 — whole-repo review: what was found and NOT applied

## What

The first whole-repo code review ran on `feature/repo-review` (nine commits, −2,046 lines net).
Fifteen read-only reviewers produced about 250 findings. Roughly 150 were applied and verified.
This ticket holds the rest, so they are not lost: section A needs an owner ruling because the fix
changes how the game plays or looks; section B is plain cleanup nobody got to.

Every item quotes the place to look. Line numbers drift — search for the quoted name.

## A. Owner decisions — RULED 2026-10-02

All 22 were ruled on and applied in the follow-up commit, except where noted.

Physics
1. Rock reaction force — APPLIED: one `tireContactForce` law for both sides.
2. "Loaded wheel, no ground" — a wheel that lifts off INSIDE a step (the four substeps load it, the
   post-substep hub finds nothing). Now treated as airborne for the wear signals.
3. Alignment damage never reaches physics — TICKETED as BUG-79 (out of scope for this pass).
4. Damage impact timings — no retune needed: the step was 60 Hz for the whole of SM-3 (git history
   has no 240 Hz step), so the values were tuned at 60 Hz and only the comments were wrong.
5. Vehicle changer — labelled "(WIP)".
6. Tire — STOCK RANGER: P235/75R15 on a 15 in rim (`rimRadius` 0.1905 m, sidewall 178 mm).
7. Substep contact reuse — APPLIED for terrain and static props (one analytic ground query per
   wheel per step, 22 → 4 per step); debris bodies are still tested on every substep.
8. Damage persistence — APPLIED: damage holds across a STORY run only; every free-roam seat
   (cold load, R, teleport, reseed) and the menu stage start from a fresh truck.

Roads / terrain
9. Road-quality double blend — FIXED (one-sided blend).
10. Tunnel apron camber — FIXED (reads camberProfile like the ribbon and the carve).
11. Synthetic-terrain gates — FIXED (the corridor search routes on the override field).
12. Fill burst counting keep-margin chunks — FIXED (visible ring only).
13. Place capture resolver — FIXED (the physics resolver, queryNearest as the off-road fallback).
14. PERF-26 timers — KEPT as documented ?hitch sub-buckets; "TEMP" labels removed.

Props / visuals
15. Shadow tiles at the billboard-ring edge — FIXED (a bbonly commit re-queues drawn neighbours).
16. Dust/smoke kick — FIXED (body +Z is rearward; kick is now along it).
17. `rgtZ` matrix element — FIXED in dust.js and dirt-spray.js.
18. Inert effects — sizzle layer DELETED; dust `_anySlip` now reads `slipVel` (a burnout at rest
    raises dust, as the comment always said); wind taps start at random offsets.
19. map-cover — now CALLS `treeClusterPass` (no mirror).
20. Wheel mesh offsets — now derived from live params every frame.

Economy / docs
21. `regionMult` comment — the "~100×" is the $9 → $1000 end-target spread and is right; the stale
    `k` comment (10/360) was the error — fixed.
22. `references/` and the two scratch scripts DELETED; `handbook.html` kept (edited 2026-09-06).

## B. Cleanup not yet done (behaviour-preserving) — WORKED 2026-10-04

Worked on branch `worktree-agent-abef5a14448e1a0f3` (commits `quality(34)` / `fix(34)` /
`docs(34)` / `infra(34)`). DONE items are struck through; what is left open says why. Every
duplication merge was proved numerically identical before callers switched (numbers in the commits).
The shadow-bake marking in `prop-system._commitChunk`, `prop-shadow-bake.js` and `alignment.js` were
out of bounds for this pass (other work in flight).

Story / gameplay
- ~~Comment fixes~~ DONE (`economy.js` 10/180 was already right; rank "never live" ×3 → FEAT-87
  live strip; `dayTier`; `runState` JSDoc moved; `story.js` deps; `mission.js` FEAT-21 line).
- ~~Dead: `OfferBoard.get()`, `EconomySystem.money()`, the `freight` branch, `mission.js`
  re-export of `formatTime`, `CampSystem.momsHouse()`, `LabSystem.results()` / `_runs`, the
  `campGradeAreaM` slider, `paper-route` `payTier ?? dayTier` fallback.~~ DONE (the freight card
  check in `test/offer-board.mjs` went with its branch; `campGradeAreaM` param removed too).
- ~~Duplication: `mulberry32` ×3, `hash32` in `poi.js`, Dijkstra twice.~~ DONE — both PRNG/hash
  now in `seed.js`; `mission.graphDijkstra(adj, start, maxD)` serves both planners.
- ~~Bugs (small): `gps.js` `_idx` reset; `camp.evaluate()` `_P()` per poll; lab rumble slope.~~
  DONE.

Map / camera / stage / vehicle model
- ~~`map2d`: `_coverMemo`, height resize, `hide()` hover, `_sig` before the deferred rebuild,
  `_sx/_sy` per-vertex allocation + DOM read.~~ DONE (sheet rect cached at `_resize`).
- ~~Cluster odometer stops counting while the map is open.~~ DONE.
- ~~Per-frame allocations: `syncMeshesToState`, camera chase/hood/freecam.~~ DONE (camera proved
  bit-identical over 3,900 frames in every mode).
- ~~Dead: `bodyMesh` return value, the runout slider callback.~~ DONE.
- ~~Doc blocks on the wrong function: `setCameraFocus`, map2d, `_surfaceSlices`, `vehicle-model`
  export list, `map-icons` palette note.~~ DONE — map2d had one misplaced block found
  (`setRadiusTarget`'s, sitting on `setRadiusCap`); a second was not found.

Particles / audio / debug
- The four particle systems repeat the same billboard setup — OPEN, skipped: not a pure mechanical
  extraction (each system's shader lines + mesh creation order differ), visual risk for no
  behaviour gain; wants an in-browser A/B.
- ~~Audio: per-frame setters, `playTireBlowout` enabled flag, helper duplication.~~ DONE
  (`whiteNoiseBuffer` / `loopNoise` in `engine-audio.js`).
- ~~`sky.setBakeRes` leak; `GROUND_FILL_LIFT`; console dumps gated on `?prof` / `?hitch`; dead
  `wyeCreaseMaxDeg` slider.~~ DONE (the leak was the old CubeCamera left in the bake scene).
- `perf.js` header — OPEN: re-read against the code, found no drift to fix; reviewer's note
  unrecoverable. Strike if nobody remembers what it was.
- Several FX params with no slider — RULED 2026-10-04 (owner): no debug sliders. These become
  USER-FACING controls later, under pause menu → settings → audio (volumes etc.); out of scope now.
- ~~`FLORA_PARAMS` keys nobody reads.~~ DONE.
- `update()` chunk-key strings / `_syncChunkLod` parsing — OPEN, skipped: storing `cx, cz` on the
  chunk record means editing `_commitChunk`, whose shadow-bake block was owned by another agent this
  pass. Small, do it next time `prop-system.js` is free.
- ~~Header/doc drift in `prop-collider.js`, `prop-palette.js`, `prop-geometry.js`, `flora.js`,
  `map-cover.js`.~~ DONE (the retired vertical `sphereVsCapsuleY` deleted; map-cover 0.75 → 0.38;
  the "five vs six draws" wording no longer exists in map-cover since it calls `treeClusterPass`).

Tests / tooling / docs
- ~~`test/lib/physics-replay.mjs` and `test/steep-rest.mjs` without `makeEngineCtx`.~~ DONE
  (`makeEngineCtx` gained optional `cx, cz` to centre the heightfield on a capture).
- ~~`run-all.mjs` directory-prefix `extraDeps`; `gates.mjs` extraDeps for paper-route,
  debug-sliders, `box3d.wasm`.~~ DONE. Stale descriptions: only the offer-board freight clause was
  verifiably stale and is fixed; the rest need a gate-by-gate read — OPEN.
- ~~`eqOf` in tests duplicates `computeStaticEquilibrium`.~~ DONE (five tests).
- ~~`GLOSSARY.md`, `LAYOUT.md`, `index.html` comments.~~ DONE.
  The `CLAUDE.md` import-seam table — DONE 2026-10-04 (owner: update to match the code; commit
  c7243bb).
- ~~Dashboard should listen on 127.0.0.1 only.~~ DONE (if you reach `npm run dash` from another
  machine, that now needs an SSH tunnel).

Road code (docs only)
- ~~`road.js`: assembly tail, `_junctionCarve` doc, `_generation` vs `_networkRev` cache docs,
  pad-surface docs pre-PERF-25, `_buildDebugLine2` PROTOTYPE, `_v2ConflictPairs` throat.~~ DONE.

## Acceptance

- Each item in A has an owner ruling (apply / leave / own ticket).
- Items in B are either applied with the same proof the review used, or struck.

## How the review proved "plays the same"

Reuse these; they caught real mistakes during the review.
- **World fingerprint**: hash the network, profiles, junctions, physics surface, carve tables,
  every road tile's render geometry, stream ribbons, water, POIs and prop placement for six
  windows, on pristine `main` and on the branch, and require the hashes to be equal.
- **Physics fingerprint**: full-precision state hash over 900 steps on bumpy ground (round and
  out-of-round tires) plus the `vehicle-feel-trace` maneuvers.
- **Browser smoke** over the Chrome debugging protocol: boot, drive, freecam, map, lab, story
  entry, camp make/break, with any console error failing the run.
- **Shadow-atlas hash** after a forced full re-bake (pixel-identical check for prop shadows).

These scripts were session-local. If the review continues, promote the fingerprint to
`test/` as a rainy-day script first.
