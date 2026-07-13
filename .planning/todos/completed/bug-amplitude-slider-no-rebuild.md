---
id: BUG-31
type: bug
status: done
opened: 2026-07-07
reopened: 2026-07-12
closed: 2026-07-12
severity: minor
source: user-observation during BUG-25 investigation; symptoms clarified with screenshot 2026-07-12
relates_to: debug.js terrainAmplitude slider, road.js _coarseHeight ("grade independent of amplitude" design), route-store.js routeCacheSig, QUAL-13 gotcha (new road param ⇒ regen route bundle)
---

## Resolution (2026-07-12) — world-scale macro, debug.js-only, ZERO router/sig/bundle changes

Full re-route chosen (honest amplitude), but implemented via a linearity insight instead of teaching the
router about `terrainAmplitude`:

**Linearity argument.** terrain height = `coarseHeight + fineHeight·regionalModulator` (terrain.js:192-231),
and `coarseHeight`/`fineHeight` are EXACTLY linear in `coarseAmplitude`/`fineAmplitude` (the ridge+pow
shaping acts on the raw noise BEFORE the amplitude multiply; the modulator depends on neither). So scaling
both layer amplitudes by k scales the final height by k — byte-identical geometry to the old
`terrainAmplitude` Y-scale — but through params the router ALREADY prices (`coarseAmplitude` feeds
`_coarseHeight`), the routing worker ALREADY ships (init), and `routeCacheSig` ALREADY keys (`^coarse`).
Result: taller mountains re-route (grade caps priced honestly) with no changes to road.js, road-carve.js,
road-worker.js, route-store.js, terrain.js, or the bundle.

**Change (src/debug.js only).** The "Terrain Amplitude" slider is rebound from `params.terrainAmplitude`
to a world-scale macro `k` (range 0..3, default 1). onChange multiplies the CURRENT `coarseAmplitude` and
`fineAmplitude` by `k / lastK` (incremental — tolerant of the user nudging the raw Coarse/Fine sliders in
between; refreshes their displays), leaves `params.terrainAmplitude` permanently 1.0, and fires
`callbacks.rebuildTerrainFull` (the same full-rebuild path — reinitWorker + new RoadSystem + route
re-import + chunk rebuild + truck re-seat — the coarse/fine shape sliders already use). The 2026-07-07
partial fix's `rebuildTerrain`/`onRoadSurfaceChange` calls are removed.

**Evidence (headless, seed 6).** k=1 → `coarseAmplitude=150` unchanged ⇒ routed network byte-identical to
today (`clsHash 96257aa51a02748a`; `routeCacheSig` unchanged ⇒ shipped bundle still HITS). k=2 →
`coarseAmplitude=300` ⇒ genuinely re-routed (clsCount 29→25, `clsHash ab9c2eec8e3ceabd`); max routed
design grade 0.98→0.92, p95 0.45→0.43 (residual steepness is geometrically bounded by the FIXED graph node
positions — nodes don't move with amplitude — so switchbacks only shave, not eliminate, the worst grades).
An independent prototype that instead taught the router `_routeH = coarse × amp` produced the IDENTICAL k=2
`clsHash`, confirming the equivalence. `npm test` green (standing GRAPH-REACHABILITY red unchanged).

# BUG-31: Terrain Amplitude slider doesn't re-route roads — amp-1 routes on amp-2 terrain create huge vertical carve walls

## History

- 2026-07-07 partial fix (committed): the slider originally only fired the Path A Y-rescale, so
  carve tables / design grades / ribbons stayed at the old amplitude entirely. debug.js now also
  fires `onRoadSurfaceChange()` → debouncedRoadSurfaceRebuild (carve re-bake + design-grade cache
  drop + ribbon re-sweep). Verified: chunks rescale, no NaN, gates green.
- 2026-07-12 REOPENED: user screenshot at amplitude 2.05 (seed 6) shows the remaining, bigger half.

## Remaining symptom

Roads keep their **amp-1 horizontal routes** when amplitude changes. The grade PROFILE follows the
amplified terrain (design grade smooths amp-applied `rawHeightWorld`), but the route geometry was
chosen by a router that deliberately prices **pre-amplitude** heights (road.js `_coarseHeight`
comment: "grade is independent of the terrainAmplitude visual slider" — by design, slider was
conceived as visual-only). On 2× terrain the same path crosses 2× grades → grade caps blown → the
earthwork deviationCap machinery cuts/fills to hold the line → colossal vertical walls flanking
every road (see screenshot: knife-edge cuts tens of metres tall).

## Why this is a design decision, not just a wiring fix

Making amplitude "honest" (higher mountains ⇒ roads re-route with switchbacks, respecting grade
caps) requires the router to see amp-applied heights, which overturns the documented
visual-only-slider intent and touches:

1. Router height inputs (road.js `_coarseHeight` call sites / worker `ROUTE SYNC` mirror — a
   mirrored-region change, byte-parity gate applies).
2. `routeCacheSig` (route-store.js) must include `terrainAmplitude` — currently excluded by the
   regex, so route caches would serve stale amp-1 routes.
3. The committed default-world bundle `data/route-cache-default.json.gz` must be regenerated
   (scratchpad gen-default-route-cache.mjs pattern) or cold-load perf regresses to full routing.
4. Slider must then fire the full re-route path (debouncedRoadRebuild / rebuild-full), not just the
   surface rebuild.

Alternative (cheap, honest-by-limitation): keep routes amp-independent, but cap/soften the carve
wall height at extreme amplitudes, or simply document the slider as "art-direction preview — roads
valid only near amp 1.0". Decide before implementing.

## Acceptance

- EITHER amplitude changes re-route (grade caps respected at the new amplitude; no super-scaled
  carve walls; route caches/bundle correctly invalidated; cold-load perf preserved),
- OR the visual-only design is affirmed and the pathological walls are bounded/documented.
- npm test green (standing GRAPH-REACHABILITY red excepted); route-worker-sync + route-bundle-parity
  gates green if mirrored regions / sig are touched.
