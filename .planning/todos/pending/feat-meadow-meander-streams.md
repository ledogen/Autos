---
id: FEAT-24
type: feature
status: open
opened: 2026-07-07
severity: minor
source: user-request
note: "Kennedy Meadows / eastern Sierra reference (user photo 2026-07-07): streams in low, flat
terrain should get REALLY windy (meanders) and vary in width — wide lazy channels in meadows,
narrow straight chutes on steep ground. Also reduce overall stream spawn rate. Character must
EMERGE from the terrain field (per feedback_emergent_over_injected), not injected sinusoids."
---

# FEAT-24: Meadow meander streams — windiness + width from local slope, reduced spawn rate

## Context

Stream traces (FEAT-18, `src/water.js traceFlow`) descend the 16 m-smoothed gradient
(`gradEps`), so flat meadows produce short, straight, boring traces that often stop early
('flat'). Real meadow streams meander hard (see user reference). Width is a constant
(`streamWidth: 3` half-width) regardless of terrain.

## Design (decided 2026-07-07)

- **Meander (emergent):** blend the FINE-scale terrain gradient (small eps senses the 0.5 m @
  20 m ripple layer) into the descent direction when the coarse slope is low
  (`meanderSlopeRef`). The trace threads between grass hummocks — sinuosity comes from the
  actual height field, deterministic + window-invariant.
- **Micro-bump tolerance:** accept steps that climb ≤ `climbTolerance` (~0.45 m) so the trace
  flows OVER ripple hummocks instead of terminating in every 0.5 m pocket; terminate when no
  new low is reached for `stallSteps` consecutive steps (micro-basin = settled). Bed profile
  then made monotone non-increasing (running min) so water never flows uphill — the channel
  incises through hummocks (streamDepth 2.5 m >> ripple 0.5 m).
- **Width from slope:** per-point half-width `w = streamWidth × lerp(widthFlatScale,
  widthSteepScale, slope/widthSlopeRef)`, EMA-smoothed along the trace. Flows into carve
  (`streamCarveSample`), render ribbon, and pads (`stream.maxWidth`).
- **Spawn rate:** deterministic per-saddle thinning `streamKeepFraction` (seedFor hash — stable,
  window-invariant), plus `saddleMinDrop` 18→22, `streamMinLength` 120→160. Keep-fraction is the
  dial that does NOT bias against low-drop meadow streams.

## USER VERIFY 2026-07-08 — NOT ACCEPTED, windiness too weak

First implementation (61bf8c9: down-valley drift + Van der Pol deviation oscillator) shipped and
user-verified in-game: "windiness does seem broken — we need to allow streams to meander like a
lot more on nearly flat ground. only very rarely does windiness actually prevail over the
valley-seeking gradient descent behavior."

Diagnosis to drive the rework: the meander term is BLENDED against the descent direction and the
descent term wins almost everywhere (the 64 m valley-scale fallback still produces a confident
downhill direction on "nearly flat" ground, so the meander deviation stays a small perturbation).
On near-flat ground the meander must DOMINATE — descent should only pick which broad direction
the stream drifts, while the oscillator owns the local heading. Rework the blend so meander
weight → ~1 on low coarse slope (and stays significant at moderate slopes), not a small additive
nudge. Remember: water params feed routeCacheSig → regenerate data/route-cache-default.json.gz
with any default change.

## REWORK SHIPPED 2026-07-08 — awaiting user in-game verify

MEASURED root cause (scratchpad sinuosity.mjs, seeds 6/testig/42): stream windows run on
12–45 % VALLEY-scale slope — in this alpine terrain the "flat" meadow floors the user sees are
12–30 % at the 64 m scale. With meanderSlopeRef 0.10, the meadow factor was ~0 nearly everywhere
the streams flow (and the gm16 < 0.15 pre-gate rarely even opened over ~0.1–0.16 ripple noise) —
the oscillator was implemented but effectively never engaged. Mechanism unchanged (limit cycle
stays); the REGIME was retuned so it actually occurs:

- traceFlow meadow pre-gate gm16 0.15 → 0.45 (valley-scale check now runs on all non-steep ground)
- meanderSlopeRef 0.10 → 0.32 (full meadow mode below ~16 % valley slope, taper to 0 at 32 %)
- meanderStrength 1.2 → 1.5; meanderWavelength 60 → 90 m (lobes were barely wider than the ~15 m
  flat-ground channel — telephone-cord read; longer λ = lazy loops at the same sinuosity)
- NEW output-deviation cap |a| ≤ 1.2 rad (~69°): at 1.5 × 1.35 the swing passed 90° and traces
  looped into knots on the flattest floors; capped, every step still descends the smooth field
- debug.js Meadow-slope-threshold slider max 0.2 → 0.5

Measured after (200 m-window sinuosity p50): 12–20 % band 1.08 → 1.35–1.6 across seeds;
6–12 % band ~1.6–2.3 healthy meanders (was a 6.6 scribble outlier); >30 % chutes unchanged
(1.0–1.1). SVG renders (scratchpad stream-svg.mjs): sustained S-meanders along valley runs, no
knots. Route bundle REGENERATED (28.4 s, 42+55 entries — routing reads ponds only, so the
later fixes below did not need another regen).

Second-round fixes (same day — real meanders exposed two latent interactions):
- streamCarveSample SELF-SEAM: "nearest centerline segment wins" stepped the bed 4.5 m at
  meander necks (two lobes, metres apart in bed height). Now min-composes across every
  in-range SEGMENT (the multi-stream seam rule extended within one stream) — where two passes
  of the same trace overlap, the deeper cut wins; merged sections verified in-game as natural
  entrenched-meander gorge (screenshot at seed 6 ~(258,−1014)).
- Meadow-factor low-end taper (× clamp01(vgm/0.02)): windiness needs THROUGH-FLOW — the old
  factor peaked exactly on pond-basin approach flats, orbit-guard-trimming traces short of the
  floor. Visible meanders unaffected (stream windows sit above 6 % valley slope).
- Gate updates with derivations recorded inline: stream-carve CHANNEL-CUT depth cap +6 → +18
  (≈ λ·slope self-overlap allowance) + BANK-C0 excludes road-influenced walk samples
  (bridge-deck side walls are honest verticals) + bound scales with the deepest legal cut;
  water-invariance FLOW-SETTLES pond-coupling now tested on a rarity-neutral clone (kept-set
  coverage was luck-based — the raw windy trace still reaches its pond, it was merely culled
  by streamMinLength).

## Acceptance

- Headless before/after: sinuosity (arc/chord) of traces over low-slope terrain increases
  substantially; width varies with slope; stream count drops ~40–50%.
- Window-invariant (pure fn of source saddle); `npm test` green; carve/physics consistent
  (per-point width respected by `streamCarveSample` + terrain `_buildStreamTable` pad).
- USER-OWNED sliders (Water folder in debug GUI): keep fraction, min drop, meander strength,
  width scales, stream width/depth — wired to the Path-B full rebuild.
