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

## A. Owner decisions (behaviour changes — not applied on purpose)

Physics
1. **Rock reaction force is not the mirror of the tire force.** `physics.js`, the
   `FnContact` expression in the `ground.body != null` block. The suspension side adds the
   progressive carcass term and the flat-tire rate; the reaction applied to the rock does not.
   At 0.10 m of squash the rock is pushed 37 % too softly; on a flat tire about 20× too hard.
2. **"Loaded wheel, no ground found" path.** When `_tireFz > 0` but the contact query returns
   nothing, the wheel-speed integrator runs with `lastFn = 0`: drive and brake torque still act,
   but the slip state is left at its previous value.
3. **Alignment damage never reaches the physics.** `damage.js` publishes `_toeOffsetDeg` /
   `_camberOffsetDeg`; nothing reads them. The damage HUD says alignment is affected. Either wire
   them into `alignment.js` (changes handling when damaged) or stop publishing.
4. **Damage impact timings were tuned for a 240 Hz step.** The step is 60 Hz. `impactGapS` 0.02 s
   survives exactly one quiet step; `impactPreSteps` 10 reaches back 167 ms, not 40 ms. Comments
   now state the true numbers; the values are untouched.
5. **Vehicle presets change mass but not the collision shape.** The Mass slider and presets now
   reach the engine body (review-8). The hull profile and wheel-core positions are still the ones
   the chassis was built with. `CHASSIS_PROFILE` is also measured off `hilux.glb`, while the
   default model is `ranger.glb`.
6. **Tire size comments disagree.** `wheelRadius` says 245/75R16 (radius would be 0.387 m);
   0.368 m is a 235/75R15; `rimRadius` 0.203 m is a 16 in rim. Which tire is the truck on?
7. **Suspension substep contact reuse (perf proposal).** About three quarters of the 1.9 ms
   physics step is ground queries: 24 envelope queries × 33 samples. Reusing one contact plane
   across the 4 substeps would roughly halve physics cost. It is not bit-identical.
8. **Menu-stage truck shares `RANGER_PARAMS` with the world truck**, so it inherits the world
   truck's damage multipliers (`_brakeScale*`, `_tireMuScale`, `_wheelRunout`). Fix is its own
   params copy; that changes how the stage truck drops.

Roads / terrain
9. **`roadQuality` blends each 500 m boundary twice.** The value snaps back at the boundary
   (s = 499.999 → 0.605, s = 500 → 0.081, s = 510 → 0.605). Affects pothole depth and marking tier
   in the first 10 m of every stretch.
10. **Tunnel apron camber** reads the unwindowed `_buildRunProfile` camber (visual only).
11. **`coarseHeightOverride` is ignored by `_v2Trunc`**, so synthetic-terrain gates still route
    over the real simplex field.
12. **`_initialFillDone` counts keep-margin chunks**, which lengthens the loading burst slightly.
13. **`debugSampleAt` uses `queryNearest`**, not the resolver physics uses, so a place capture can
    report a different surface from the one the wheels rode.
14. **PERF-26 "TEMP" timers** are still in `_buildRoadTile` (six buckets; ticket closed). Keep as a
    perf hook or delete?

Props / visuals
15. **Shadow tiles at the billboard-ring edge after a spawn or teleport.** A chunk in the
    billboard-only ring does not re-queue its neighbours' shadow tiles, so a ring-2 edge tile
    baked before that chunk arrived is missing its trees' shadows until you drive toward it.
    Measured: one tile short about 4,000 texels (≈250 m² of shadow), reproducible.
16. **Dust and smoke "behind the truck" kick points forward** (`dust.js`, `smoke.js`: body +Z with
    a negation; `dirt-spray.js` uses the same formula without it and is right).
17. **`rgtZ` reads the wrong matrix element** in `dust.js` and `dirt-spray.js`.
18. **Dust `_anySlip` branch is unreachable; tire-audio "sizzle" layer sits at zero gain; wind
    noise taps are phase-locked.**
19. **`map-cover.js` hand-mirrors `treeClusterPass`** for the map's forest raster (drift risk).
20. **Wheel mesh offsets are baked at build** while physics reads geometry live, so CG-height /
    weight sliders move the physics wheels but not the drawn ones.

Economy / docs
21. **`regionMult` spread is about 220×** where the comment says 100×.
22. **DESIGN.md carries stale numbers**; `handbook.html`, `references/backup*.html`,
    `scratch-deg2-pop.mjs`, `scratch-runline.mjs` look abandoned — delete?

## B. Cleanup not yet done (behaviour-preserving)

Story / gameplay
- Comment fixes: `economy.js` "k is now the MAX rate (10/360)" (code is 10/180); four places
  still say rank is "result-card only, never live" (FEAT-87 shows it live); `dayTier` JSDoc says
  "day 9+ holds" (table is 30 days); `day.js` `runState` JSDoc sits on `STAGE_COLOR`; `story.js`
  deps JSDoc omits `validateRegion` / `onSeedRejected`; `mission.js` header "when FEAT-21 lands".
- Dead: `OfferBoard.get()`, `EconomySystem.money()`, the `freight` branch, `mission.js`
  re-export of `formatTime`, `CampSystem.momsHouse()`, `LabSystem.results()` / `_runs`, the
  `campGradeAreaM` slider (moves nothing), `paper-route` `payTier ?? dayTier` fallback.
- Duplication: `mulberry32` exists three times (`seed.js`, `poi.js`, `damage.js` — verified
  numerically identical); `hash32` (FNV-1a) lives in `poi.js` and is imported by camp code — move
  to `seed.js`. Dijkstra is written twice (`paper-route._dijkstraFrom`, `mission.legCandidates`).
- Bugs (small): `gps.js` partial re-bake resets `_idx = 0`, which snaps to the outbound pass on
  an out-and-back route; `camp.evaluate()` copies params (`_P()`) on every 10 Hz poll even on a
  cache hit; lab `groundHeight` computes a rumble slope it discards.

Map / camera / stage / vehicle model
- `map2d`: `_coverMemo` is cleared only in `show()`, not on a seed change with the map open;
  the canvas resizes on width change only; `hide()` leaves `_hoverX/_hoverY` (stale card on
  reopen); a road-param change just before closing is lost (`_sig` adopted before the deferred
  rebuild); `_sx/_sy` allocate and read the DOM per vertex.
- Cluster odometer stops counting while the map is open (early return before the integration).
- Per-frame allocations: `syncMeshesToState` (~13 per wheel), camera chase/hood/freecam.
- Dead: `bodyMesh` return value, the runout slider callback (a per-frame refresh already does it).
- Doc blocks on the wrong function: `setCameraFocus`, two in `map2d`, `_surfaceSlices` header,
  `vehicle-model` export list, `map-icons` palette note.

Particles / audio / debug
- The four particle systems repeat the same billboard setup; a shared module is possible but
  must keep each system's shader lines and mesh creation order.
- Audio: six setters schedule AudioParam events every frame (cache last value);
  `playTireBlowout` ignores the enabled flag; helper duplication.
- `sky.setBakeRes` leaks the old target; `GROUND_FILL_LIFT`; `perf.js` header; console dumps
  that should be gated on `?prof` / `?hitch`; dead `wyeCreaseMaxDeg` slider; several FX params
  with no slider.

Props
- `FLORA_PARAMS` keys nobody reads: `tintJitter` (two), `medRock.collidable`,
  `smallRock.collidable`.
- `update()` builds a chunk-key string per ring cell per frame and `_syncChunkLod` parses keys
  back to numbers; store `cx, cz` on the chunk record.
- Header/doc drift in `prop-collider.js`, `prop-palette.js`, `prop-geometry.js`, `flora.js`
  (collision comment lists retired shapes; a stale `vegetationAt` pointer), `map-cover.js`
  (0.75 vs 0.38; "five" vs six draws).

Tests / tooling / docs
- `test/lib/physics-replay.mjs` and `test/steep-rest.mjs` call `stepPhysics` without
  `makeEngineCtx` — they throw as written.
- `run-all.mjs`: directory-prefix `extraDeps` are not honoured; `gates.mjs` is missing
  `extraDeps` for paper-route, debug-sliders and `box3d.wasm`, and several descriptions are stale.
- `eqOf` in tests duplicates `computeStaticEquilibrium`.
- `GLOSSARY.md`, `LAYOUT.md` (missing rows: `damage.js`, `damage-hud.js`, `world-validate.js`;
  counts), the `CLAUDE.md` import-seam table, `index.html` comments.
- Dashboard should listen on 127.0.0.1 only.

Road code (docs only)
- `road.js`: stale comments at the assembly tail, `_junctionCarve` doc (retired crossing
  source), cache docs that say `_generation` where the key is `_networkRev`, pad-surface docs
  that predate PERF-25, `_buildDebugLine2` labelled PROTOTYPE, `_v2ConflictPairs` throat
  predicate spelling.

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
