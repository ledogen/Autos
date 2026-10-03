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
