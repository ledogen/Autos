---
id: FEAT-40
type: feature
status: in-progress
severity: major
---

# FEAT-40 — Tunnels: taut-string summit cut + concrete half-tube bore

## Motivation

Run `runs/0004-very_slow-C-89s-1.6km.json` (seed 6): the road to the dump climbs 117→180 m
then plunges at −15…−27 % grades to the destination at ~132 m. The profile is
terrain-following by construction (`_gradeEdgeInPlace` clamps the design line to ±2 m of
smoothed terrain) — roads can never bore. The summit plateau should run ~30 m lower, level
with the incoming segments, through the hill.

## Design (shipped on branch feature/tunnels)

- **Profile pass** `applyTunnelPassInPlace` (road-carve.js): lower convex hull ("taut
  string") of each edge's graded profile; hull chords the profile rises ≥ `tunnelMinDepth`
  above over ≥ `tunnelMinLen` cut the summit to the chord. Cover ≥ `tunnelPortalDepth`
  becomes bore spans (`netEntry.tunnelSpans`); shallower ends are open cuttings. Chord
  continues the approach grades by construction; node Ys never altered. Called from
  `_assembleGraphEdges`; spans clipped clear of AT_GRADE crossings after junction detection.
- **Carve/mesh:** `_buildCarveTable` writes blendW=0 in-span → terrain skin keeps the hill.
- **Physics:** `analyticHeight(wx,wz,hint,queryY)` — below-apex probes (wheels/body verts,
  which pass their Y) ride the bore floor; Y-less callers (props/camera/map) get the hill.
- **Visuals** (road-mesh.js): concrete half-tube lining (vertex-color darkness ramp,
  headlights light it) + stone portal headwalls (cobble texture), streamed with road tiles.
- **Params** `tunnel*` in data/ranger.js — deliberately NOT `road*` (routeCacheSig must not
  see them; the pass never touches routed XZ, so the bundled route cache stays valid).

## Acceptance

- [x] Gate `test/road-tunnel.mjs` (registered): pass fires on seed 6 region, bore grades
      driveable, C0 profile, floor/hill physics divergence in-span only, two-center span
      invariance. Green (re-run at depth-25 defaults).
- [x] `npm run test:all` 39/39 green at 9514514. Re-run at HEAD before merge (defaults
      changed in 7f0b635; only the tunnel gate re-ran).
- [x] Live verify (user): driven 2026-07-22, "chefs kiss" — crown-cover rework produced the
      wanted 15–50 m spur tunnels; depth-25 cull keeps only deep bores; masonry rings +
      terrain cutouts in place of the rejected flat headwall.
- [ ] Merge `feature/tunnels` → main, move this ticket to completed.

See `.planning/handoffs/2026-07-22-feat40-tunnels.md` for the full state + root causes.
