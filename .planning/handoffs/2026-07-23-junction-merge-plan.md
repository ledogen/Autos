# Merge plan — deg2-fit + junction-fix → main (2026-07-23)

Supersedes the merge section of `2026-07-22-junction-earthwork-state.md` (state addendums there are
still authoritative for WHAT changed; this file is HOW to land it). User has visually approved the
kink z-fight fix (:8010), the trident earthwork, and the round-2 interior fillets (:3615 4-way).

## Current state

- **main** = `d570ef7` — saturating camber superelevation + soft grade-clamp landed AFTER the
  worktrees branched: `camberFromCurvature()` (road.js ~114), `_computeCamberArrays` +
  `_buildRunProfile` reworked, `camberStrength` param REMOVED, `camberMaxAngleDeg`/`camberKneeRadiusM`
  added (data/ranger.js + debug sliders + `invalidateProfileCaches()`), gate expectations updated in
  `test/shoulder-lateral-continuity.mjs` + `test/windiness-metrics.mjs`. Verified: no camber param is
  in the route-cache signature (route-store.js) — no bundle regen needed.
- **feature/deg2-fit** (`../CarGame-deg2-fit`, :8010) — base `9945bb8`, ALL WORK UNCOMMITTED.
  QUAL-16 deg-2 arc earthwork + the z-fight fix (sampleRoadTopY connector composition + densified
  `_buildDeg2Ribbon`). Diff: road.js / road-mesh.js / terrain.js.
- **feature/junction-fix** (`../CarGame-junction-fix`, :3615) — base `9945bb8`, ALL WORK UNCOMMITTED.
  Trident pads + first-class pad carve + ruled grade + rim earthwork (PAD_* duck/hold) + round-2
  interior fillets (`_cornerEdgeFillet` true-edge walk, `THROAT_TRIG_MULT`, `_nodeCornerArc` deleted).
  Diff: road.js / road-mesh.js / terrain.js / test/shoulder-lateral-continuity.mjs (plaza exemption).

## Strategy: merge main INTO each branch first (recommended), then fast-forward-ish merges to main

Rationale: the camber rework changes the very surfaces both branches' proofs were measured against
(gate numbers 0.205/0.091 and all probe separations are PRE-camber). Folding main in per-branch means
each conflict is resolved once, in context, and the gates + probes are re-proven per branch BEFORE the
final merge — instead of discovering camber-shifted numbers while untangling a three-way merge.

### Per worktree, in order (deg2-fit first, then junction-fix)

1. **Clean scratch**: delete `test/_*.mjs` probes (deg2: `_zfight.mjs` may stay useful until step 3,
   then delete; junction-fix: `_junction-probe.mjs`, `_fourway.mjs`, `_corners.mjs` — note
   `_junction-probe.mjs` gained a `CX`/`CZ` env boot-center override worth keeping in mind for
   future off-origin probing). Do NOT commit the `node_modules` symlink.
2. **Commit the branch work** (suggested messages, from the state handoff):
   - deg2-fit: `feat(QUAL-16): deg-2 kink swept fillet arc + arc-following earthwork; ribbon rides the carve grade field`
   - junction-fix: `fix(road): trident pads + first-class pad carve + ruled junction grade + interior corner fillets`
3. **`git merge main`** in the worktree. Conflict map:
   - **deg2-fit ∕ road.js**: d570ef7 hunks (~3643 invalidateProfileCaches doc, ~3780–3915
     `_computeCamberArrays`, ~4195–4300 `_buildRunProfile`) brush the branch's `sampleRoadTopY`
     (~3812) + `_connectorCarve` region. Resolution intent: BOTH sides survive — the camber model is
     orthogonal to the connector overlay; keep `camberFromCurvature` calls exactly as main has them
     AND the branch's connector composition in `sampleRoadTopY`.
   - **junction-fix ∕ road.js**: same d570ef7 hunks vs the branch's heavy 2780–4300 edits (ring,
     `_junctionPadCarve`, `_mergeCarve`, `_sampleCarveWorld` overlay). Same intent: compose, drop
     nothing. `invalidateProfileCaches()` doc-comment conflict is trivial.
   - **junction-fix ∕ test/shoulder-lateral-continuity.mjs**: edited on BOTH sides — main retuned
     expectations for the new camber; branch added the junction-plaza exemption (PLAZA_R=36,
     PLAZA_TOL=0.70). Keep both; if the camber retune moved the harness structure, re-apply the
     exemption on top of main's version by hand.
   - data/ranger.js, src/debug.js, src/main.js, src/mission.js: main-only → clean.
4. **Re-prove**: `npm run test:all` (full suite, not just affected). Expect shoulder/windiness
   numbers to differ from the pre-camber values recorded in the state handoff — the gates' own
   thresholds (as merged) are the bar now, not the old recorded worsts. Re-run the separation
   probes before deleting them (deg2 `_zfight.mjs`: all connectors ≥ ~+0.08 m; junction
   `_junction-probe.mjs` dense at (253,−131) and CX=925 CZ=-1387 node=939,-1410: 0 poke-through)
   — camber shifts both surfaces, the margins must survive it.
5. **User re-drive** (post-merge, new camber under the truck): :8010 kink (−2017,1305) +
   (4786,−775); :3615 trident (253,−131) + 4-way (924,−1387).

### Landing on main

6. Merge **deg2-fit → main** first. Should be conflict-free after step 3. `npm run test:all`.
7. Merge **junction-fix → main**. The REAL cross-branch conflict zone (both branches edit these):
   `_sampleCarveWorld`, `_carveDirtY`, `_carveCrossSection`, `sampleRoadTopY`, terrain
   `_buildCarveTable`. They COMPOSE — resolve by hand, keeping both overlays:
   - deg-2 connector overlay (`_connectorCarve` + sampleRoadTopY connector composition) fires only
     near deg-2 arc tiles;
   - junction pad overlay (`_junctionPadCarve` duck/hold + `_mergeCarve` cap + on-pad physics
     overlay) fires only near ≥2-leg node rings.
   Both compose the same way over the run cross-section: coverage = max blendW, run gradeY wins
   where a leg resolves. In `sampleRoadTopY`, apply the connector composition first, then the
   junction path (a deg-2 kink IS a 2-leg node when roadJunctionKinkDeg admits it — the connector
   overlay and the pad machinery already coexist on the branch bases, mirror that).
8. `npm run test:all` on main + a final drive. Then: move the QUAL-16 / junction tickets to
   `.planning/todos/completed/`, delete remaining `_*.mjs` probes, `wt.sh` cleanup of both worktrees
   (needs user confirmation), and prune the two state handoffs' "UNCOMMITTED" language.

## STATUS UPDATE 2026-07-23 (later): steps 1–4 DONE for both branches

- **deg2-fit**: `51d6119` (branch work) + `001a477` (merge of main). ZERO conflicts (auto-merge,
  both sides verified whole by hand). 38/38 gates green. Z-fight margins re-proven post-camber:
  dense per-cell mesh check +0.079…+0.136 m across all 12 connectors, zero inversions (the thin
  +0.039 m pointwise reading at (4786,−754) is a sub-cell peak the 1 m terrain mesh cannot express).
- **junction-fix**: `7d47636` (branch work) + `00596c9` (merge) + `3312d39` (post-merge camber
  adaptations). Only textual conflict was the shoulder gate (main's retuned EDGE_TOL + branch's
  plaza exemption, both kept). Three REAL camber×junction interactions surfaced and were root-fixed
  in 3312d39 without touching gate thresholds:
  1. `PAD_DUCK_CAP` split: mesh dirt 1.2 / physics 0.55 (`PAD_DUCK_CAP_PHYS`) — camber widened
     legitimate inter-leg creases past the old 0.55 cap; pad rim is now a documented sanctioned
     mesh↔physics difference region.
  2. `PAD_EDGE_FEATHER` (1.6 m): feathers the on-pad overlay's superelevated pinned lift back to
     merged dirt — exact C0 at ring exit (was a 1.26 m pinned-march step).
  3. `_projectLegNearNode` now returns EVERY local-minimum limb (a curving leg can hold two genuine
     minima in the 40 m window); `_carveDirtY` blends each as its own pseudo-leg; cross-slope purity
     ease remapped `max(0, 2·pur−1)`. Killed a >1 m gore flip at seed-6 (132,−744).
  Results: 38/38 gates green (shoulder seed-6 worst step 0.066 m — plaza exemption no longer even
  leaned on); trident +0.253 m / 4-way +0.243 m, 0 poke-through; ladder 18/18 weld1.0.
- Scratch probes deleted in both worktrees; both clean (node_modules symlink only); nothing pushed.

**Remaining: step 5 (user re-drive) then steps 6–8.** Step-7 caveats now concrete: junction-fix's
`_mergeCarve` takes a `duckCap` param and `_projectLegNearNode` returns an ARRAY — the cross-branch
resolution must respect both signatures when composing with deg2-fit's `_sampleCarveWorld`/
`sampleRoadTopY` edits.

## AMENDED LANDING ORDER: tunnels joins the train (user request, 2026-07-23)

`feature/tunnels` (worktree `../CarGame-tunnels`, dev server :3374, FEAT-40) is COMMITTED and
already consistent with main: main d570ef7 was merged INTO it (53c02a3), stage-2 bores grade-gated
post-camber (6e947e1), full test:all **39/39 green** (38 + its new `road-tunnel` gate) at `3413204`.
Its own state handoff: `.planning/handoffs/2026-07-23-feat40-merge.md` (in that worktree) + memory
`project_feat40_tunnels`. Nothing to re-reconcile there — so it lands FIRST, as a zero-conflict
merge that locks in its verified state, and the junction train reconciles against it per-branch
(each reconcile happens in a worktree with gates BEFORE main moves again):

1. **Land tunnels → main** (after user's tunnel drive sign-off if not already given). Should be
   conflict-free (branch == main + tunnels). `npm run test:all` on main (39 gates now).
2. **Merge updated main into deg2-fit**, re-prove (test:all + re-verify no z-fight visually or
   with a quick probe), THEN land deg2-fit → main. New conflict surface vs tunnels, all in the
   same functions deg2 edits: `_sampleCarveWorld` now takes `queryY` and does an exclude-Set
   resolver retry (bore ownership); `_resolveRoadSurface(wx, wz, excludeKeys)` signature;
   `_carveCrossSection` toe cap gained `DEEP_BANK_TOE_EXTRA=18` (synced across THREE sites:
   `_carveCrossSection`, `_resolveRoadSurface` interior footprint, terrain `_buildCarveTable`
   maxExt — keep the sync). The deg-2 connector overlay composes AFTER the bore-ownership
   resolve, same as it composes over the run cross-section today.
3. **Merge updated main into junction-fix**, re-prove (test:all + BOTH earthwork probes + ladder
   sweep), THEN land junction-fix → main. Everything from the old step-7 map PLUS tunnels:
   - `test/shoulder-lateral-continuity.mjs` is now edited by THREE lineages: main's camber
     EDGE_TOL + tunnels' BANK_TOL tier (rival/bore zones) + junction-fix's plaza exemption.
     All three coexist — merge by hand, widen nothing.
   - `test/road-smoothness.mjs`: tunnels changed probe Y to `runProfile`+1; keep that.
   - `_sampleCarveWorld`: three overlays now compose — bore ownership (queryY/exclude retry),
     deg-2 connector, junction pad (duck/hold + on-pad physics overlay, `PAD_DUCK_CAP_PHYS`).
     Order of composition: resolve (with bore exclusion) → run/connector cross-section →
     `_mergeCarve(…, duckCap)` pad merge — mirror in terrain `_buildCarveTable`.
   - Semantic watch: bore spans are clipped clear of AT_GRADE crossings
     (`_clipTunnelSpansAtCrossings`) but deg-2 kink nodes and junction pads near a portal are
     untested territory — after landing, sweep the ladder probe and drive one portal
     (tunnel gate region (148,−732)/(1006,−973)).
4. Final `npm run test:all` on main + drives; then close tickets, delete straggler probes,
   `wt.sh` cleanup of all three worktrees (user confirmation), prune handoff "UNCOMMITTED"
   language.

Net effect: the one heavy hand-reconcile (junction-fix) stays where it always was — last, with
everything else already landed and every signature documented above.

## Known residuals (ticket, don't scope-creep during the merge)

- SE-crotch asphalt-mesh tessellation seam class at all pads; deg-4 (−98,172) pre-existing 3.4 m
  pad-top tear (blendW coverage jump class).
- deg-3 "yucky pad" capture (−1129,669) from the original QUAL-16 handoff.
- Trident W-corner (80°, sep 8.0) now tucks instead of sweeping — user has seen the screenshot;
  if the fuller pad is preferred there, raise `THROAT_TRIG_MULT` (1.0 → ~1.7) — one constant.
- screenshot.mjs gotcha: default port :8000 serves MAIN — always pass `--port=<worktree port>`.
