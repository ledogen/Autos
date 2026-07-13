---
id: BUG-31
type: bug
status: open
opened: 2026-07-07
reopened: 2026-07-12
severity: minor
source: user-observation during BUG-25 investigation; symptoms clarified with screenshot 2026-07-12
relates_to: debug.js terrainAmplitude slider, road.js _coarseHeight ("grade independent of amplitude" design), route-store.js routeCacheSig, QUAL-13 gotcha (new road param ⇒ regen route bundle)
---

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
