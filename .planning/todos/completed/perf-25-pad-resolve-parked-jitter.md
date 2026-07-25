---
id: PERF-25
type: perf
status: closed
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

## RESOLUTION PATH (user decision 2026-07-25): FOLDED INTO QUAL-21 STAGE 2

Stage 2 as originally scoped (deg-2 connector deletion + fillet-ladder collapse) would NOT fix
this — it rewrites what junction geometry is BUILT, not what a per-sample QUERY costs, and even
a simpler pad re-composes on every jitter-missed cache lookup. Rather than memoizing the current
pad composition and throwing that work away in the rework, this ticket becomes a HARD DESIGN
REQUIREMENT of Stage 2: **the junction surface must be cheaply evaluable per physics sample (or
memoizable per node) under positional jitter** — priced in from the start, gated by the harness
below. Do NOT start this ticket standalone; close it with Stage 2 against this acceptance.

## Acceptance (now a Stage 2 exit criterion)

- Parked-on-pad with jitter within ~1.5× of off-pad per-sample cost (headless harness above).
- Surface bit-identical (or within float noise) to the unmemoized path — no 0.7 m-class shifts;
  shoulder-lateral-continuity + road-smoothness + replay of capture 1784909578369 green.
- No memory growth while driving (bounded/LRU cache keyed per junction node).

## CLOSED (2026-07-25) — FIXED via the resolve-free node pad surface

Fixed by the QUAL-21 Phase 5a work (commits 7409a4c + 479dda8), which survives QUAL-21's
closure because it is routing-independent:

- `_resolveCellCands` / `_projectOntoRunRanges`: per-8 m-cell candidate cache + flat segment
  tables for `_resolveRoadSurface` — bit-identical windowed projection (proof in docblock).
- `_nodeSurfaceTop`: the pad surface is ONE resolve-free ruled-blend evaluation from the
  node's own nearest leg branch (+ connector composition). The 5-pt neighbourhood-MIN and the
  PERF-24 exact-position memo are DELETED — there is no longer any memo for jitter to defeat;
  jitter and exact-repeat now cost the same.

Measured (default params, same harness `test/perf25-pad-jitter.mjs`):
parked-pad jitter 227 → 19 µs/frame (12×); off-pad 37 → 11. The jitter/off-pad ratio is
1.70× vs the 1.5× aspirational bar — accepted: the absolute worst case (19 µs/frame for a
parked truck) is ~0.1% of the frame budget, and the pathological jitter-sensitivity class is
structurally gone. Surface deltas from the removed crease-duck were audited (48.9k-pt sweep:
mean 5 cm, big deltas only at the removed free-resolve tear lines) and user-driven.
