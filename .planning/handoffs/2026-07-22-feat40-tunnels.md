# HANDOFF 2026-07-22 — FEAT-40 Tunnels (worktree `../CarGame-tunnels`, branch `feature/tunnels`)

## State: feature-complete, user-verified in play ("chefs kiss"), UNMERGED

Four commits on `feature/tunnels` (base 9945bb8 = main):
- `9c5a1d0` chore(test): deleted 8 stale non-gate scripts (rows relics, superseded probes,
  duplicate bake script; parity-gate comment now points at test/bake-route-bundle.mjs)
- `136c6b4` feat(40): initial tunnels (taut-string summit cut, half-tube, physics split)
- `9514514` feat(40): crown-cover bores, portal rings + terrain cutouts, masonry, map icons
- `7f0b635` fix(40): depth cull (default 25), reversed-slice pipes, nearest-24 cutouts

`npm run test:all` was 39/39 green at `9514514`; after `7f0b635` the tunnel gate re-ran green
(defaults changed) but the FULL suite has not re-run — **run `npm run test:all` before merge**.
Dev server for preview: `npm run dev -- --port 3374 --strictPort` in the worktree (running).

## What shipped (read `memory/project_feat40_tunnels.md` first — it has the invariants)

- **Pass** `applyTunnelPassInPlace(pts, opts, heightAt)` (road-carve.js), called from
  `_assembleGraphEdges` with `heightAt = road._coarseH` (world-fixed ⇒ window-invariant).
  Stage 1: lower-convex-hull ("taut string") summit cut of the graded profile (chord ≥ 40 m,
  |grade| ≤ tunnelMaxGrade, summit ≥ tunnelMinDepth). Stage 2: bore spans wherever REAL
  terrain covers the tube CROWN (profile + tunnelBoreRadius) by ≥ tunnelPortalDepth for
  tunnelMinLen..tunnelMaxLen, **culled unless dirt-above-deck peaks ≥ tunnelMinDepth** —
  the user's one-knob density lever ("only bore if the road wants to run ≥ N m under
  terrain; shallower crests are earthwork"). Spans → `netEntry.tunnelSpans` ({s0,s1},
  run-arc == polyCum domain), clipped clear of AT_GRADE crossings post-`_detectJunctions`
  (`_clipTunnelSpansAtCrossings` — crossings reconcile with no ΔY gate, a bore there would
  ramp a surface road 30 m down).
- **Physics** — "bore ownership": a bored run owns only probes BELOW its apex
  (floor + boreRadius). `_sampleCarveWorld(wx,wz,rawAmp,nrHint,queryY)` retries
  `_resolveRoadSurface(wx,wz,excludeKeys)` for above-apex/Y-less probes so parallel
  corridors in the 18 m resolver footprint win, else raw hill. `analyticHeight/Normal`
  take queryY; main.js queryContacts/queryVertexContacts pass wheel/vertex Y. Y-less
  callers (props/camera/map/mesh) always get the terrain skin.
- **Carve/mesh** — `_buildCarveTable` runs the same exclude loop with
  `tunnelSpanAt(runKey, arc, inset=4)`: the open cut runs 4 m INTO the mouth so the ragged
  carved→raw vertex boundary hides inside the tube.
- **Visuals** (road-mesh.js, per road tile like junction pads): half-tube lining
  (vertex-color darkness ramp, ends extrude 1.5 m proud), masonry portal collar ring
  (`buildPortalRing`; `makeMasonryTextures` in stone-texture.js — running-bond blocks;
  UVs use ONE shared radius — per-row θ·r sheared the courses). Terrain skin is
  fragment-DISCARDED in a capsule per mouth (uTunnelN/uTunnelPos/uTunnelAxis in the
  terrain material; `_syncTunnelUniforms(carPos)` keeps the 24 slots = nearest portals,
  re-picked after 100 m). **No flat headwall** — user rejected the billboard look.
- **Map2d**: amber arch icon at each bore midpoint + legend row; `_paramSig` watches
  `^road|^tunnel` so tunnel sliders rebuild the map.
- **Params** (data/ranger.js, `tunnel*` prefix — DELIBERATELY not `road*`: routeCacheSig
  regexes ^road and the pass never touches routed XZ, so the bundled route cache stays
  valid): tunnelsEnabled, tunnelMinDepth 25 (slider 5–45), tunnelMinLen 15,
  tunnelPortalDepth 1.5 (crown cover), tunnelMaxGrade 0.12, tunnelMaxLen 700,
  tunnelBoreRadius 6.5. lil-gui sliders in debug.js (fireRoadParam).
- **Gate** `test/road-tunnel.mjs` (registered): fires on seed 6, driveable bores, floor/hill
  divergence in-span only, two-center invariance. road-smoothness probes at
  `runProfile` Y + 1 (NOT raw points[].y — junction blends diverge up to ~10 m near ends);
  test/lib/terrain-headless.mjs mirrors the queryY path.

## Hard-won root causes (do NOT re-learn these)

1. The grade smoother ERASES short sharp spurs from the profile (deviation cap vs smoothed
   reference) — any profile-only tunnel trigger misses the best 15–50 m tunnel sites and
   lets mouths poke out of hillsides. Probe REAL terrain (user capture
   rangersim-capture-1784702209392: 28 m real cover, zero profile summit).
2. Road slices can be stored REVERSED (arcS0 > arcS1). Any arc-range intersection against
   slices must normalize (min/max) first — this was the "pipe sometimes doesn't build" bug.
3. `runProfile` ≠ `points[].y` near run ends (FEAT-10 junction blend) — span/feature math
   near ends must read runProfile.
4. Portal-adjacent terrain: binary carve→raw at the exact portal line spikes needle
   triangles; the 4 m mesh inset into the bore hides the boundary inside the tube.

## Open items / merge checklist

- [ ] `npm run test:all` at HEAD (7f0b635) — only the tunnel gate re-ran after the default flip.
- [ ] User drive-verify at depth-25 defaults (density + reversed-slice pipes everywhere).
- [ ] Merge `feature/tunnels` → main (wt.sh merge tunnels), close ticket
      `.planning/todos/pending/feat-40-tunnels.md` → completed with resolution note.
- Deferred/known-accepted: chase camera may clip the hill skin inside a bore (not reported
  as a problem); tube has no side-wall collision (shoulder blend acts as steep wall);
  crossings inside would-be bores revert to open cut (rare, by design); headless
  screenshot tool sometimes lands on the wrong tab if the user's Chrome is on the same
  CDP port — prefer the user's own eyes for visual verify.
- Sibling worktrees (untouched, own lanes): `CarGame-deg2-fit`, `CarGame-junction-fix`.
