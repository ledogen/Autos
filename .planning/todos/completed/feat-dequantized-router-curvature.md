---
id: FEAT-20
type: feature
status: open
opened: 2026-06-30
severity: minor
source: user-observation
note: "Roads read TOO QUANTIZED: the router builds every curve from a 4-entry discrete curvature palette
(roadArcRadii [200,90,35,8]) on a 15°/8 m lattice, so curvature comes in discrete chunks and the router
tier-hops (short tight turn next to a big sweep) instead of varying radius smoothly. User wants more
VARIETY + SMOOTHNESS. Two quantizations: (1) the radius palette → variety; (2) heading/cell lattice +
instant κ jumps at primitive boundaries → smoothness (real roads use clothoid transition spirals).
Recommended fix = decouple corridor-finding (A*) from geometry (continuous-curvature spline refit),
clamped to min-radius. Cheap first experiment = densify the palette. MUST stay window-invariant +
min-radius-valid-by-construction; watch cold-route perf (interacts with BUG-26)."
---

# FEAT-20: De-quantize router curvature — natural, varied, smooth road geometry

## Problem

Roads have a recognisably "quantized" character — random short tight turns, medium turns, and big
sweeping turns intermixed — rather than naturally varying, smoothly-transitioning curves. The user finds
it unnatural and too quantized, and wants both more **variety** (radii) and more **smoothness**
(transitions).

## Root cause — TWO separate quantizations

`arcPrimitiveConnect` (`src/road-carve.js:592`) is a hybrid-A* router over arc motion-primitives:

1. **Discrete curvature palette.** `roadArcRadii: [200, 90, 35, 8]` (`data/ranger.js:418`) + straights
   are the ONLY curvatures available. Every curve is built from these four radii. A bend that "wants"
   130 m becomes a 200 m, a 90 m, or a 200-and-straight stutter; where grade/altitude/earthwork cost
   interferes the router drops a tier (200→90→35) for a primitive or two then climbs back. The κ²·L
   curvature penalty (`roadWTurn` 8000) biases toward the largest radius that fits, so mild ground is
   mostly 200s — but any cost nudge produces a **discrete tier jump**, not a smooth radius change. That
   tier-hopping IS the "short turn next to a big sweep" look. → drives the lack of **variety**.
2. **Heading + position lattice & instant κ jumps.** `hbins: 24` makes every turn primitive exactly
   **15°**, on an 8 m cell grid (`road-carve.js:596–597`). One 15° step is ~52 m at R=200 but ~9 m at
   R=35, so mixing tiers also makes segment LENGTHS jump. And curvature is **discontinuous at every
   primitive boundary** (κ jumps 1/200 → 1/90 → 0 instantly). Real roads feel smooth precisely because
   they use clothoid **transition spirals** where κ ramps linearly. → drives the lack of **smoothness**.

So: variety ← radius granularity; smoothness ← curvature *continuity* (transitions). The two need
different fixes; addressing only one won't feel natural.

## Options considered

- **Noise on the palette radii — band-aid, NOT recommended as the fix.** Jittering [200,90,35,8] just
  relocates the discrete values; still a tiny discrete set per route, still tier-hopping, buys variety
  but not smoothness. Traps: must be a pure deterministic fn of the anchor pair (per-frame/per-stream
  jitter would reintroduce the flyover/window-variance bug class — [[project_disappearing_road_flyover]],
  [[project_bug14_querynearest_window_variance]]); and free-floating radii can undercut the min-radius
  guarantee. Could ship as a quick variety knob but doesn't solve the core issue.
- **Densify the palette (cheap first experiment).** [200,90,35,8] → ~8 radii. Immediate variety, no
  architecture change, the existing κ²-cost already picks the right one. Tells us whether granularity
  alone is "enough" before investing. Cost: bigger A* branching → slower COLD routes (warm-route worker
  pre-warm absorbs steady-state, but it worsens the BUG-26 network-switch cold stall — measure it; see
  the perf-diagnostic follow-on the user is scoping).
- **PREFERRED — decouple corridor from geometry (continuous-curvature refit).** Keep A* (coarse, maybe
  slightly denser palette) to find the *corridor/topology* only; then REFIT a continuous-curvature spline
  through the waypoints — clothoid/Euler-spiral transitions or a curvature-limited spline — **clamped to
  `roadMinTurnRadius`**. Final geometry is no longer palette arcs, so the tier character disappears AND
  the transition-spiral smoothness comes for free. Mirrors real road alignment design (find the line,
  then add spirals). Architecture already caches centerlines per-connection, so a deterministic
  once-per-connection refit is naturally window-invariant.

## Recommendation (cheapest-first)

1. **Experiment:** densify `roadArcRadii` to ~8 values; eyeball variety + measure cold-route cost on
   low-end hardware (Surface Pro 4) before committing.
2. **Real fix if needed:** corridor (A*) + continuous-curvature spline refit, min-radius-clamped.

## Hard constraints any approach MUST honor

- **Window-invariance** — pure fn of seed/anchors/params; no per-frame or stream-order-dependent noise
  (the disappearing-road / queryNearest bug class).
- **Min-radius valid-by-construction** (QUAL-03 / centerline-validity mandate,
  [[project_centerline_validity_mandate]]) — clamp the refit ≥ `roadMinTurnRadius` or ribbon tears
  return (BUG-12, [[project_road_overhaul_phaseA]]).
- **Cold-route performance** — denser palette / spiral search raises A* branching + refit cost. The
  PERF-03 worker pre-warm + per-connection route cache absorb steady-state, but cold teleports / network
  switches (BUG-26) get worse. Gate on a measured budget — tie to the perf-diagnostic work.

## Acceptance

- Road curvature varies smoothly and continuously (no visible discrete tier-hopping; smooth κ
  transitions, not instant jumps); reads as natural varied roads.
- Window-invariant (identical route regardless of approach/draw distance/stream order — invariance gates
  green); every centerline still ≥ `roadMinTurnRadius` (road-minradius gate green); `npm test` green.
- Measured cold-route cost on the low-end target stays within an agreed budget (no worse driving stream
  / network-switch stall than today, or an accepted, quantified regression).

## Related

- Router internals: `arcPrimitiveConnect` (`src/road-carve.js:592`), palette `data/ranger.js:418`;
  ROUTE SYNC mirror into the Worker (CLAUDE.md "Terrain Worker") — any router change must re-mirror +
  pass `route-worker-sync.mjs`.
- **FEAT-13** road-network graph (the routing umbrella) — [[project_feat13_v2_foundation]].
- **BUG-26** network-switch terrain stall — the cold-route cost this feature must not worsen.
- **BUG-16** heading-quantization zigzag (`bug-road-heading-dither-zigzag.md`) — the other symptom of the
  same heading-lattice quantization; a continuous refit may subsume it.
- Curvature/camber-cost history: [[project_road_camber_curvature]], [[project_arc_primitive_router]].

## Resolution (2026-07-01)

**Shipped** as the two-pass de-quantize refit inside `arcPrimitiveConnect` (`src/road-carve.js`,
mirrored into `src/road-worker.js` ROUTE SYNC), params `roadRefitShortcut`/`roadRefitWindow`
(data/ranger.js + debug sliders), wired through `_routeOptsBetween`.

- **Smoothness** — κ(s) box-filter (`roadRefitWindow`, default 30 m; shrinking symmetric half-window,
  no replicate padding) re-emitted as merged clothoid/arc descriptors: curvature now RAMPS
  (transition spirals) instead of jumping at primitive boundaries. Measured max |Δκ| per 2 m sample:
  0.125 (raw palette jumps) → 0.025. Averaging can only shrink |κ| ⇒ min-radius stays ≥ hardR by
  construction (exact `minRadius()` gate). The terminal Dubins runs at ADAPTIVE rho
  (max(goalBlend,40)…hardR), erasing the κ=1/hardR blip a fixed-hardR terminal left on
  near-straight roads.
- **Variety** — the corridor Dubins shortcut (see BUG-16 resolution) produces continuous
  chord-derived radii (0.8/0.4/0.2·chord clamped ≥ hardR), so curves are no longer drawn from the
  4-entry palette alone.
- **Palette densification (the "cheap experiment") evaluated and DEFERRED**: the shortcut + filter
  deliver variety + smoothness without the A*-branching cost, and without touching the roadArcRadii
  debug sliders, which bind palette entries BY INDEX (`params.roadArcRadii[0..3]`, debug.js) — a
  denser palette would break that coupling; revisit only if the look still reads quantized in-game.

Window-invariant + deterministic (pure fn of the primitive chain + opts + heightFn; both Worker
pre-warm and sync fallback refit identically). Gate `test/road-dequantize.mjs`; all 31 gates green.
Cold-route perf: refit ON measured ~4.6% FASTER end-to-end (fewer emitted primitives shrink
downstream assembly), router-only overhead ≈ 0–6% — within the ≤ +25% budget.
