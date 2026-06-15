# Phase 9 — In-Sim Verification Log (combined D0–D5 refactor)

**Started:** 2026-06-13
**Status:** In progress — refactor executed (09-18..09-24), human in-sim pass surfaced regressions; fixes landing iteratively.
**Scope:** Records the in-sim verification of the lifecycle+camber refactor and the fix commits made directly on `main` during the human-verify checkpoint of plan 09-24, so GSD state reflects reality.

## Fixes applied (commits on main)

| Commit | Issue found in-sim | Fix |
|--------|--------------------|-----|
| `fc5834e` | `p.clone is not a function` crash at spawn (`_streamNetwork`) | D0 fillet pushed plain `{x,y,z}`; construct fillet points as `THREE.Vector3`. |
| `7ebe72a` | Roads flicker in/out + FPS 6; sharp corners | D1 generation bumped on every positional re-stream (window-invariant geometry) → continuous ribbon rebuild + terrain re-carve. Bump now only in `invalidateCache` (real route/param change). + restored a smoother `roadMinTurnRadius`. |
| `c65384b` | Ribbon folds/overlaps at hairpins (D0 not actually rounding) | Per-vertex fillet BAILED on the dense CatmullRom (tangent couldn't fit between samples). Replaced with pure iterative **curvature-clamp** `filletMinRadius` in `road-carve.js`; added a REAL headless gate (`hairpin-fillet-enforced`, 2.97 m → 11.76 m). `roadMinTurnRadius` default → 12 m ("a little wider than the road"). |
| `b376127` | Min-radius/maxGrade slider: cuts & foundations don't follow the new road | `debouncedRoadRebuild` rebuilt the carve BEFORE re-streaming the road (carve read stale/empty network); re-stream was also gated on `_debugVisible`. Re-stream first, unconditionally, then rebuild ribbon + carve. |
| `82b2636` | Truck spawns off the side of the road (BUG-11, spawn half) | `resolveSpawn` streamed/queried from baseTile but seated the truck up to 200 m away (different anchor band); re-stream centered on the spawn point and re-seat. (Determinism half = window-variance, WONTFIX — user likes it.) |
| `3df47cd` | Camber sharp/discontinuous at every tile seam (BUG-10) | `arcSOffset` defaulted to 0 → camber/quality were tile-local, sawtoothing at each 64 m seam. Slices now carry run-global `arcS0/arcS1` + `camberSign`; ribbon, physics, carve all read run-global arc. Seam-gate still owed. |
| `a99ab5c` | Road over-banked → rollovers/excessive grip/erratic contact normal | `camberStrength` was 200 but `camberStrength·kappa` is RADIANS → 6° clamp hit on every curve <~1900 m radius. Hidden while physics camber was ~0; exposed by 3df47cd. Set to 4 → proportional 1–6° banking (D-04). |

Headless gate: `node test/spline-continuity.mjs` — all 8 gate fixtures exit 0.
Worker CARVE SYNC: `src/terrain-worker.js` byte-identical throughout.

## Open issues (in-sim, not yet fixed)

1. **Camber transitions sharp/discontinuous** — top concern. `camberProfile` is built per network run with `camberRad[0]=0`, so banking resets to 0 at each run boundary; the ribbon reads `camberProfile(arcS, runKey)` per-vertex via `queryNearest`, so banking jumps wherever the nearest run/`runKey` changes (between switchback arms, row-band seams). Needs a continuous-across-runs camber + a headless camber-continuity gate. → **BUG-10**.
2. **Road rebuild non-determinism + spawn placement** — (a) on first reload the truck spawns just off the side of the road; (b) min-radius slider 12→15→12 yields a *different* road than reload at 12 (history-dependent → window-variance suspected in the fillet/run endpoints). The carve-follow part is addressed by `b376127`; the determinism + spawn parts remain. → **BUG-11**.
3. **Residual hairpin overlap** — most hairpins now round cleanly, but some apexes (where router arms are closer than ~2·minRadius) still tear/overlap. Likely needs per-apex adaptive radius (cap at half the local arm separation) or router switchback-spacing coupling. Lower priority than 1–2.

## Notes confirmed working / intended
- Radius rounding is a major improvement (user-confirmed).
- Two road textures = intended new-vs-old road quality tiers (user-confirmed, not a bug).
