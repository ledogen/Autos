---
id: PERF-25
type: perf
status: open
opened: 2026-07-25
severity: major
source: user report (parked-on-junction lag, capture 1784909578369) + headless measurement
relates: [PERF-24 (pad-resolve memo), QUAL-10/11/16 (junction pads), QUAL-21 (stage 2 junction rework)]
---

# PERF-25: junction pad resolve lags while PARKED — exact-position memo defeated by suspension jitter

## Symptom

Heavy frame lag when the truck is parked ON a junction pad (user: n=4, capture
1784909578369 at seed 6 (-99.9, 172.4); previously believed n=2-only). Driving off the pad
clears it. QUAL-21's deg-2 connector no-op removed the pads at through-nodes, which is why n=2
"got better" — the cost is per-pad, not per-degree.

## Measured (headless, 2026-07-25, flags on, 4 wheels × 2000 frames)

- parked on pad, EXACT repeated positions (memo hits): 115 µs/frame
- parked on pad, 3 mm positional jitter (suspension noise): 227 µs/frame
- off-pad control, same jitter: 37 µs/frame

PERF-24's `_resolveRoadSurfaceMemo` is EXACT-position keyed, so a parked-but-jittering truck
misses every frame and re-runs `_junctionPadCarve`'s 5-pt neighbourhood-MIN (the PERF-24 hot
spot) per wheel per sample. ~6× off-pad cost per sample; in-game multipliers (physics substeps ×
multicontact samples per wheel) scale that into visible lag.

## Constraint (PERF-24 lesson — do NOT re-learn)

Quantizing the RESOLVE position (carveHint quantize) shifts the surface ~0.7 m — rejected then,
still rejected. The fix must memoize the EXPENSIVE INTERMEDIATE, not snap the query: e.g. cache
the pad-carve neighbourhood/plane data per (node, coarse cell) so the per-sample work is a cheap
evaluation, or make the 5-pt MIN field itself memoizable with correct interpolation.

## Will Stage 2 fix it? NO (assessed 2026-07-25)

Stage 2 (deg-2 connector deletion + fillet-ladder collapse) does not remove deg-3/4 pads or
change `_junctionPadCarve`'s per-sample cost. Independent work item.

## Acceptance

- Parked-on-pad with jitter within ~1.5× of off-pad per-sample cost (headless harness above).
- Surface bit-identical (or within float noise) to the unmemoized path — no 0.7 m-class shifts;
  shoulder-lateral-continuity + road-smoothness + replay of capture 1784909578369 green.
- No memory growth while driving (bounded/LRU cache keyed per junction node).
