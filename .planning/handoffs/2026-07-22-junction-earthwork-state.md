# Handoff — junction earthwork: deg2-fit + junction-fix state (2026-07-22)

Coordinator session ended mid-flight; this is the authoritative state. Both branches UNCOMMITTED.

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

## Session-limit gotcha
Opus subagents died repeatedly on session limits; resume via SendMessage when transcript survives,
else respawn with full context (this file is that context). All real state lives in the worktrees.
