# Merge handoff — feature/perf-worldgen → main

Written 2026-07-18. Worktree `/Users/ledogen/CodeShit/CarGame-perf-worldgen`,
branch `feature/perf-worldgen`, 5 commits ahead of local main (d9130c7 base →
now also cleanly ahead of main@7366b70; main gained only docs/ticket commits since —
**no source overlap, expect a conflict-free merge**).

## What this branch is

The worldgen cold-load effort (roads first). Two user-approved WORLD-CHARACTER changes plus
tooling. After merge, every seed generates a DIFFERENT road network than pre-merge main —
that is intentional and drive-approved, not drift.

Commits (oldest first):
1. `5d73659` — corridor-heuristic router + solo-reuse **behind flags** (then off), feel-diff
   harness (`test/dump-network.mjs` + `test/feel-diff.mjs`), `__apcStats` instrumentation,
   byte-identical disc micro-opt, seam + proposals docs.
2. `b776a31` — worker-mirror backtick escape fix (browser-only boot break).
3. `135769f` — **feel preset ON by default**: `roadCorridorTwoPass` (heuristic, hScale 1.0) +
   `roadSoloReuse` + `roadGraphWTurn` 800→1750. Cold routing ×2.5–3.2 across seeds.
   Includes the solo-reuse window-invariance fix (always resolve own solo).
4. `6a6b91e` — junction-thinning sliders (degree cap + detour strictness), defaults off.
5. `59ae088` — **thinning ON by default** (cap 3 / strictness 4; seed-6 landmark 4-ways 6→3),
   degree pass rewritten to the window-invariant v3 (order-free two-phase over the pristine
   wide graph, runs before the ring-scoped culls).

`data/route-cache-default.json.gz` was re-baked twice and MUST ride with the merge — it
matches the new params/router byte-for-byte (BUNDLE-SIG + BUNDLE-PARITY gates enforce).

## Verification state

- `npm test` (affected: 24/34 gates, all 12 road gates incl. graph-cull-radius-invariance,
  restream-invariance, route-worker-sync, route-bundle-parity, arc-router): **all green** at
  HEAD. Full `npm run test:all` has NOT been run on this branch — run it pre- or post-merge
  per INFRA-01 (expect green; the 10 unselected gates are props/sky/etc. untouched here).
- User drive-verified on the worktree dev server (:3859): feel preset 2026-07-17, junction
  thinning 2026-07-18.
- Timing was measured on a WARM machine — treat all speedups as ratios, not absolutes; the
  gate-suite CPU drop (7897s → ~900s) is the most contamination-proof evidence.

## Merge mechanics

```
bash ~/.claude/skills/worktree/scripts/wt.sh merge perf-worldgen   # or:
git -C /Users/ledogen/CodeShit/CarGame merge --no-ff feature/perf-worldgen
```
Main's working tree currently carries unrelated uncommitted edits (flora/ranger/main/prop-*
per earlier `git status` — another session's WIP). Stash or commit them first; ranger.js is
touched by BOTH (this branch: road params; main WIP: brake torque etc.) so a dirty-tree merge
would collide even though the committed histories don't.

## Post-merge checklist

1. `npm run test:all` on main (33+ gates).
2. Boot the game on main (seed 6 must import the bundled cache: check no cold-route stall;
   the boot console should not show routing during the loading screen for seed 6).
3. The map (M) should show visibly fewer 4-ways; sliders `Max Junction Degree` /
   `Degree Cull Strictness` / `Corridor 2-Pass` / `Corridor HScale` / `Solo Reuse` live in
   the road folder for re-tuning. Any retune of routing params ⇒ re-bake the bundle
   (`node test/_gen-default-route-cache.mjs`, ~9 s) in the same commit.
4. Delete worktree after merge (`wt.sh clean perf-worldgen`). The dev server on :3859 dies
   with it.

## Coordination / conflicts with other efforts

- **PERF-21 gpu-graphics worktree (unmerged)**: disjoint files by design (see
  `.planning/perf-worldgen/HANDOFF-SEAM.md` — this branch owns road*/worldgen; that one owns
  props/sky/shadow/dust). `src/main.js` was NOT touched by this branch → no collision.
  Merge order does not matter.
- **Story mode**: par values (FEAT-29 oracle) and any recorded routes/checkpoints that
  predate this merge are STALE — the road network changed globally. Re-mint pars after merge.
- **Map/route captures**: old place-captures (test/replay.mjs inputs) taken on pre-merge
  roads may resolve onto different geometry; prefer fresh captures.

## Known follow-ups (not blockers)

- IndexedDB per-seed cache and story-seed pre-bakes (P0/P5) are **DESCOPED 2026-07-18**
  (user: too much storage; every story run is a random seed — a persistent per-seed cache
  never re-hits). The `indexedDB.deleteDatabase('rangersim-routes')` cleanup line in main.js
  stays. Random-seed runs mean FIRST-generation cost is the whole cost: remaining levers are
  P3 (wHeur 2.0, needs re-measure against the corridor router) and P4 (skip the fine search
  when the coarse flood proves the goal unreachable — small, free, no feel risk).
- `test/_prof-stats.mjs`, `test/_count-junctions.mjs`, `test/_gen-default-route-cache.mjs`
  are `_`-prefixed workbench scripts (not gates); `dump-network.mjs`/`feel-diff.mjs` are the
  durable feel-comparison tools.
- The `__apcStats` hook (road-carve.js + worker mirror) is zero-cost when unset and feeds
  `_prof-stats`; kept deliberately.

## Feel contract going forward

Any routing/param/router-code change should be feel-diffed before it ships:
`node test/dump-network.mjs out=/tmp/a.json` (baseline) → change → dump b → 
`node test/feel-diff.mjs a b`. Topology identical + max lateral <1 m ≈ byte-equivalent;
topology changes ⇒ user drive test + map look. Memory:
`project_perf_worldgen_routing.md` holds the dead-end list (β-skeletons no-op here;
micro-opts no-op; wHeur 2.5 / hbins 16 feel-fail) and the v3 cull invariance recipe.
