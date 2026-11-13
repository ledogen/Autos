---
id: PERF-43
type: perf
status: open
opened: 2026-11-12
severity: major
source: PERF-42's profiling, 2026-11-12. Owner, same day: "is there some way you could simplify all of those different
  pieces to one overarching rule that makes the code simpler and more performant?" → "Plan the per wheel surface patch".
relates: [PERF-42 (the spikes this finishes; its ticket holds every measurement below), PERF-39 (the hub resolve this
  generalises), FEAT-70 (the tread solve that takes the samples), PERF-25 (the cell cache), PERF-32 (the connector
  path's first fix), PERF-40 (the bench that proves it)]
---

# PERF-43 — one surface patch per wheel per step

## The rule

**Work out the road context once per wheel per step. Every height sample under that tyre is then pure local maths.**

The tread solve (`src/tire-contact.js`) takes about 65 height samples per wheel per step: 3 lines × (9 coarse + 10
refine) plus two normals of 4 heights each. Today every sample runs the whole carve stack, and each layer of that
stack re-derives, from the road graph, context that is the same for the whole tyre. PERF-39 and PERF-42 patched this
one layer at a time (the hub resolve, the solo reuse, the connector legs' foot). This ticket replaces those patches
with one structure.

## Why (measured, PERF-42)

- A typical game's wheel is a raycast, about 1 µs. Ours is 40–60 µs on open road and 110–300 µs at junctions,
  departure bands and kinks. It is asked once per wheel per step (`physics.js stepPhysics`, Step 1; `qcPlus` reuses it
  for the substeps and asks again only when that answer had no contact), so 240–480 queries a second.
- The bench's physics spike seconds are the places where that query is expensive: 241 µs median at spike positions vs
  42 µs calm before PERF-42's connector fix, 133–174 µs after it.
- What is still expensive (profiled): at a junction pad inside a departure band, 43 road resolves per query (band
  frames resolve per sample since PERF-42 made them exact), `_junctionPadCarve` 23 %, the junction inter-leg blend
  (`_carveDirtY` → `_projectLegMemo` / `_projectLegNearNode`) ~20 %, the connector 45 % at a kink.

## The layers a sample goes through (`terrain.js analyticHeight` → `road.js _sampleCarveWorld`)

Per sample today, in order:

| layer | context it derives per sample (should be per wheel) | per-sample maths that stays |
|---|---|---|
| raw terrain `height()` | none | the noise (cheap: `noise2D` ~2–5 % of a query) |
| stream carve `waterCarve.sampleAt` | the streams near the point | the bed blend |
| resolver `_resolveRoadSurface` | winner run, its frame, rivals, apex-sliver end | lateral + arc on the winner's primitive |
| bore ownership loop | `tunnelSpanAt`, the bore notch | apex test against `queryY` |
| `_carveCrossSectionBlended` | each rival's frame and fade weight `rv.m` | each cross-section at its own lateral |
| `_carveDirtY` QUAL-10 inter-leg blend | the sibling legs' feet near a ≥2-leg node | the ruled blend |
| `_connectorCarve` (deg-2 kink) | both legs' feet (`_runGradeAt`) | the legs' grade + fold, weighted by gap |
| `_poiPadCarve` | which POI pad is near | its bench blend |
| `_junctionPadCarve` / `_nodeSurfaceTop` | which node, its pad plane, mouths | the pad surface |
| ribbon / decal tests (`_ribbonEdgeDist`, `_ribbonDrawnAt`, `_leafEndDist`) | which ribbon end, edge | the edge distance |

## The design

1. **`road.surfacePatch(hx, hz, queryY, out)`**, called once per wheel per step at the hub (`world-contacts.js`, where
   `qh = w.hintAt` is today). It fills a plain object (no allocation in the hot path: one reusable patch per wheel
   corner) with every layer's context for the disc of radius `PATCH_R` (1 m: the tread lies within 0.39 m of the hub,
   a normal's ±0.5 m differences round the pressure centre):
   - the winner and every rival, with frames AND their fade inputs (lateral or radial distance, prominence), so
     `rv.m` is evaluated per sample from the sample's own distance instead of frozen at the hub;
   - any run, end, self-pass, node, connector, POI pad, bore span or band whose reach comes within `PATCH_R` of the
     disc — included even when its weight at the hub is 0, so nothing can fade in unseen;
   - each leg's foot for the connector and inter-leg blends, with the primitive bounds needed to re-project exactly
     (`_refineFoot`'s exact line/arc step from the hub's foot);
   - the band frame's chord window for `_bandRefine`, so a band sample costs one local quadratic solve, not a resolve;
   - `valid`: false where the proof below cannot be made (then the caller falls back to per-sample, as today).
2. **`analyticHeight(x, z, patch, queryY)`** takes the patch where it takes `nrHint` today. Every layer reads its
   context from the patch and does only its per-sample maths. Without a patch (mesh writers, props, camera, map) it
   builds the context per call exactly as now, so there is ONE code path for the maths and MESH == PHYSICS stays by
   construction.
3. **Delete what the patch replaces**: `_hintHolds`, `solo` / `_soloPassFree` / `HINT_REACH_M`, the band exception,
   `world-contacts.js`'s `qh` dance, `analyticNormal`'s hint plumbing. `carveHint`'s 5 cm memo stays only if a caller
   without a patch still needs it (measure).
4. **Rest is free** (ties to PERF-45): a patch built at a hub that has not moved (same x, z, queryY bits) is the same
   patch, and a stationary tyre's samples are the same samples. Memo the last patch per corner.

## The proof obligation (where PERF-42's bugs lived)

The patch is exact only if a fresh per-sample evaluation anywhere in the disc would see the same set of features. For
each layer, write down why nothing outside the patch can enter within `PATCH_R`:
- distances to runs, ends and nodes are 1-Lipschitz (they change at most as far as the point moves), so a reach test
  at `reach + PATCH_R` (÷ cos 29° for a vertex-clamped lateral, the `RESOLVE_ACC_SAFETY` note) is sufficient;
- a run's OWN extra passes are NOT provable from the hub: near a bend's centre of curvature the distance along the run
  is nearly constant, and a point 1 m off can see two passes where the hub saw one (seed 1768572700 (144, 745), 0.14 m
  off). Keep PERF-42's per-sample `_runPassMinima` check, or prove a margin to every arc centre and every curvature-jump
  normal in reach;
- band frames are not lines or arcs (`_bandRefine` per sample);
- inner half of a bend (1 + κv < 0.5) and off the winner's primitive: re-project per primitive or fall back.
Where a layer cannot be proven cheaply, mark the patch invalid for that disc. Correct first; fast second.

## Steps

1. Branch off main (after the PERF-37 branch lands). Read PERF-42's ticket and `wip/perf-42/*` (in
   `/Users/ledogen/CodeShit/CarGame-perf37/wip/perf-42/`, git-invisible; copy what is useful).
2. Extend `test/hint-reuse.mjs` into the patch's exactness gate: every layer, points within `PATCH_R`, junction pads,
   bands, bores, kinks, POI pads, causeways — `|patch − fresh| ≤ 2.5 mm` (the tread solve's budget; the existing 1–2 mm
   residual is the deck-edge lip on 12 m arcs) and the patch valid on ≥ 80 % of driven positions. Write it FIRST, red.
3. Build the patch layer by layer, the gate green after each: resolver + rivals (live `rv.m`) → bands → connector →
   inter-leg → junction pad → POI pad → bore. Commit each (`wip(PERF-43): …`).
4. Delete the replaced machinery (step 3 of the design).
5. Measure: `wip/perf-42/lat.mjs` and `spots.mjs` (query µs at the bench's spike and calm positions), then PERF-40
   main vs branch, three seeds, `--reps=2`.
6. Gates: `npm test` (affected) per step; `npm run test:all -- --browser` before landing; `fingerprint-world` vs main
   (expect `surface` float-noise only, like PERF-42 — report the largest |Δh|); `kerb-graze.mjs` unchanged.

## Acceptance

- [ ] One wheel's ground query ≤ 60 µs median at the PERF-40 bench's former spike positions (calm is ~40).
- [ ] PERF-40: moving seconds over 100 ms/s ≤ 5 % (closes PERF-42), physics p99 ≤ 130 ms/s, three seeds, reps 2.
- [ ] The patch's exactness gate green (≤ 2.5 mm everywhere within `PATCH_R`), all gates green, `fingerprint-world`
      differences float noise only.
- [ ] `_hintHolds`, `solo`, `_soloPassFree`, `HINT_REACH_M` and the hint plumbing deleted; net lines in `road.js` down.
- [ ] A parked truck's ground query costs ~0 (the memo), measured in PERF-45's parked phase.
