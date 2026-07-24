# Handoff — junction earthwork: deg2-fit + junction-fix state (2026-07-22)

> **LANDED 2026-07-23.** Both branches are committed and merged to main (deg2-fit merge 12b452f,
> junction-fix merge c8ba85a), each reconciled against FEAT-40 tunnels and re-proven at test:all
> 39/39. The "UNCOMMITTED / merge-ready" language below is the point-in-time state when this was
> written — retained as historical record. See `2026-07-23-junction-merge-plan.md` for the HOW and
> the final landing log.

Coordinator session ended mid-flight; this is the authoritative state (as of 2026-07-22).

## Branch 1: `feature/deg2-fit` (worktree `../CarGame-deg2-fit`, dev server :8010)

**COMPLETE — merge-ready pending user drive.** QUAL-16 deg-2 kink earthwork.

- Fillet arc built once in road.js (`_buildDeg2ArcGeom`, cached per `_networkRev`, tile bucket
  `_deg2ArcTiles`); mesh (`_buildDeg2Ribbon`) reads it; carve composes it as a **weighted overlay**
  (`_connectorCarve` in `_sampleCarveWorld` + terrain `_buildCarveTable` identically). The handoff's
  resolver-candidate design was tried and REJECTED (winner-take-all → 5–11 m tears/dithering).
- Connector has full run-style cross-section (core/shoulder/toe). Grade via `_connectorGradeAt` +
  `_runGradeAt` (analytic-refined, 0.25 m DS, end-feather `dom`) — NOT arc-projection (far-limb flip
  bug on tight kinks, fixed).
- `collectConnectorSamples` feeds the terrain perf-skip so outer flanks aren't dropped from the mesh.
- **All 23 affected gates green incl. shoulder-lateral-continuity seeds 6 (0.205) AND 7 (0.091, better
  than main's 0.210).** Window-invariance exact 0. Mesh byte-identical to pre-refactor.
- KINK_MAX stays 120° (user chose smooth-not-revert). No new params, no worker edits.
- Cleanup before commit: delete `test/_render-*.mjs` + scratch `test/_*.mjs` probes (keep
  `_meshid.mjs`, `_cwinv.mjs` per agent suggestion or delete all), do NOT commit the node_modules
  symlink. Synthesized captures in worktree `logs/`.
- Suggested commit: `feat(QUAL-16): deg-2 kink swept fillet arc + arc-following earthwork`.

## Branch 2: `feature/junction-fix` (worktree `../CarGame-junction-fix`, dev server :3615)

**One task IN FLIGHT at session end.** Trident junction seed 6 node (253,−131) + world-wide junction
grade surface. 5 completed rounds, all preserved in the working tree:

1. Pads build on slice-less tiles (`_buildRoadTile` early-return removed).
2. Pitchfork guard removed from ring weld.
3. Carve toe anchored at widened core.
4. Ring machinery MOVED to road.js (`node.ring` cached per `_networkRev`, single source of truth for
   mesh + carve). Pad footprint is a first-class carve region (`_junctionPadCarve`, `_signedRingDist`,
   `_mergeCarve`; terrain mirrors with pad-aware skip guards). Back-arc bulb closes wide open sectors;
   `_throatSweep` (THROAT_GAP=1.9, THROAT_SEP_MULT=2.0) paves narrow gores.
5. Per-triangle winding normalization in `_buildPadGeometry` (earClip mixed winding → 56 culled
   backfaces = the black slivers; fixed).
6. **Ruled-surface inter-leg grade blend** in `_carveDirtY`: exponential lateral-proximity weighting,
   plane blend RETIRED (PLANE_BLEND_MULT gone). Trident crease r=5: 4.5 m → 0.07 m. Shipped with a
   conservative radial fade 7→11 m to keep gates green.
7. **LANDED + verified (2026-07-23)**: user-approved final version — (a) junction-plaza exemption in
   `test/shoulder-lateral-continuity.mjs` (PLAZA_R=36 m, PLAZA_TOL=0.70 m; proven inert off-plaza:
   identical verdict on the pre-blend surface), (b) blend switched to barycentric linear-ramp
   weighting (w_i = taper·∏gap_j) + loose fade 22→34 m. Constants: RULE_EPS=0.2, RULE_TAPER=4,
   RULE_LEG_REACH=14, RULE_NODE_WINDOW=40, MAX_LEG_SLOPE=0.30. Trident steps ≤0.42 m out to r=24
   (was 4.5 m); 12-node sweep clean (two pre-existing blendW coverage jumps at degenerate steep
   3-ways noted, orthogonal); all 23 gates green; window-invariance exact. Screenshots
   `/tmp/trident-r6-*.png` coordinator-verified: continuous banked plaza; only the known tessellation
   sliver class remains at the throat mesh boundary. **Branch is merge-ready pending user drive.**
- No new road* params anywhere (route-cache-sig hazard — verified against src/route-store.js;
  constants hardcoded: PLANE_BLEND_MULT was removed, THROAT_* remain). No WORKER_SOURCE edits.
- Suggested commit: `fix(road): trident junction pads + first-class pad carve + ruled junction grade`.

## Merge plan (user must drive both first: :8010 spots below, :3615 trident)

- Drive checks: :8010 → 87° kink (−1999,1323 area, teleport −2017,1305) + (4786,−775); :3615 →
  trident (253,−131).
- Merge deg2-fit → main FIRST, then junction-fix. **Both edit `_sampleCarveWorld`, `_carveDirtY`,
  `_carveCrossSection`, terrain `_buildCarveTable` — conflicts are real and must be reconciled by
  hand** (they compose: deg-2 connector overlay is deg-2-only; ring/ruled-blend is ≥3-leg + ring).
  Run `npm run test:all` after each merge. wt.sh merge needs user confirmation per worktree skill.
- Residual known issues (ticket, don't scope-creep): SE-crotch asphalt-mesh tessellation seam class
  at all pads; deg-3 "yucky pad" capture (−1129,669) from the original QUAL-16 handoff.

## Addendum 2026-07-23 — post-drive fixes (both worktrees, still uncommitted)

User drive found three issues; all fixed and gate-verified. Both branches remain merge-ready
pending re-drive.

### deg2-fit (:8010) — kink z-fight FIXED
Root cause was NOT shallow earthwork: the connector RIBBON mesh sampled run-only
`sampleRoadTopY` while the carve/physics rode the dom-blended two-leg connector grade — at the
87° kink (legs differ ~1.35 m) dirt was carved up to 0.94 m ABOVE the drawn asphalt (truck
floated above the ribbon). Fix: `sampleRoadTopY` now composes the connector overlay exactly as
the carve does (blendW·dom weighting), and `_buildDeg2Ribbon` is densified (9 lateral cols, 4×
chord subdivision, mesh-side only). Worst separation −0.79 m → ≥ +0.08 m across all 12 deg-2
connectors; 23 affected gates green; shoulder seeds 6/7 unchanged (0.205/0.091). **The earlier
"mesh byte-identical to pre-refactor" claim no longer holds — the mesh change IS the fix.** No
terrain.js mirror needed (no carve logic changed); no road* params. Probe: `test/_zfight.mjs`.

### junction-fix (:3615) — rim earthwork + interior fillets DONE
1. **Rim slivers**: pointwise clearance was correct (0.15 m); the poke-through is 1 m terrain
   cells straddling ruled-blend creases (designY spread ~0.45 m inside one cell → linear interp
   rides 0.31 m over the pad). Fix in road.js: `_junctionPadCarve` ducks dirt under a 5-point
   0.5 m-radius min of the pad top + PAD_DIRT_EXTRA 0.15 + PAD_RIM_HOLD 1.6 m full-depth band;
   `_mergeCarve` takes the ducked dirt capped at PAD_DUCK_CAP 0.55 below the leg cross-section,
   feathered by pad blendW; `_sampleCarveWorld` gains a physics-only on-pad overlay (pin-
   consistent: leg gradeY+clearance where a run resolves) so the truck rides asphalt, not the
   deepened dirt. Trident interp separation −0.16 m/169 violations → +0.22 m/0; 18-node sweep
   seeds 6+7 all ≥ 0.17 m (deg-4 (−98,172) retains its pre-existing 3.4 m pad-top tear class).
2. **Interior fillets**: n≥3 normal corners now ALWAYS take the `_cornerJoin` interior tangent
   fillet; `_nodeCornerArc` deleted. Back-arc bulb + throat sweep untouched (trident unchanged,
   41 ring verts). Deg-2 kinks keep farther-of pick with a direction-correct `_nodeBackArc` —
   which also fixed two pre-existing seed-7 holes (13.4 m bite at (709,−256); 17.4 m legacy
   fall-off at (−247,−311), now weld1.0). Ladder sweep: seed 6 = 10/10 weld1.0 unchanged;
   seed 7 = 7 weld + 1 legacy (was 6+2, strictly better). One new accepted 0.26 m coverage gap
   at seed-7 (−242,861) (fillet chord vs curved ribbon edge). All 23 affected gates green;
   PLAZA exemption untouched. Probe kept: `test/_junction-probe.mjs` (delete before commit).

Re-drive spots: :8010 kink (−2017,1305) + (4786,−775); :3615 trident (253,−131) + 4-way
(924,−1387). Merge order and conflict notes below still apply (junction-fix now ALSO edits
`_sampleCarveWorld`/`_mergeCarve` more deeply — the conflict-by-hand warning is stronger).

### Round 2 (same day): interior fillets ACTUALLY landed (user drive showed round 1 changed nothing)
Round 1's "always _cornerJoin" was a no-op on real junctions for two reasons, found by tracing the
user's 4-way (939,−1410): (a) _cornerJoin intersects straight edge LINES from the mouths — on curved
legs the intersection lands wrong/misses and falls to the fat outward Hermite; (b) the throat sweep's
trigger (sep < 2×halfWidth, gap < 109°) swallowed ordinary 75–90° crossroad corners and swept them
OUT. Fixes in `_junctionRingWeld` (road.js): new `_cornerEdgeFillet` walks the TRUE curved ribbon
edges (runPointAt/runProfile) node→mouth, finds the outermost polyline crossing (the real crotch
apex), and hands off to the tangent fillet with LOCAL edge directions; throat sweep trigger tightened
to `THROAT_TRIG_MULT`=1.0×halfWidth (mouth sep — trident wedge 4.0 keeps its paved sweep, crossroad
corners 6.6–9.6 now fillet) while THROAT_SEP_MULT=2.0 still shapes the sweep. `_nodeCornerArc` gone.
Verified: all 4 crossroad corners tuck (minR 6.5–11.0 vs 13–17 bulge); ladder sweep seeds 6+7 now
18/18 weld1.0 (seed-7 legacy node recovered); coverage gaps ≤ pre-existing (worst +0.84 pre-existing,
round-1's new +0.26 improved to +0.05); pad-rim earthwork holds (trident +0.222 m, 4-way +0.260 m,
0 poke-through); `npm test` 23/23 green. NOTE for user review: the trident's 80° W-corner (sep 8.0)
now tucks instead of sweeping — its pad is visibly smaller than the "looks great" screenshot; wedge
+ bulb unchanged. Scratch probes to delete before commit: test/_junction-probe.mjs, _fourway.mjs,
_corners.mjs (junction-fix) + test/_zfight.mjs (deg2-fit). screenshot.mjs needs `--port=3615` for
this worktree (default :8000 serves MAIN — round-1 agent verified against stale code AND framed the
wrong node; ground-relative Y + `--pitch=-1.25 --height=95 --zoff=30` frames a junction well).

## Session-limit gotcha
Opus subagents died repeatedly on session limits; resume via SendMessage when transcript survives,
else respawn with full context (this file is that context). All real state lives in the worktrees.
