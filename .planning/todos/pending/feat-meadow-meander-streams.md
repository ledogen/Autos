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

## Acceptance

- Headless before/after: sinuosity (arc/chord) of traces over low-slope terrain increases
  substantially; width varies with slope; stream count drops ~40–50%.
- Window-invariant (pure fn of source saddle); `npm test` green; carve/physics consistent
  (per-point width respected by `streamCarveSample` + terrain `_buildStreamTable` pad).
- USER-OWNED sliders (Water folder in debug GUI): keep fraction, min drop, meander strength,
  width scales, stream width/depth — wired to the Path-B full rebuild.
