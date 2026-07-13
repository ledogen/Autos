---
id: PERF-12
type: perf
status: done
severity: minor
created: 2026-07-13
closed: 2026-07-13
---

# Shadow map size + ortho extent were fixed 2048²/±220 across all tiers — scale per preset

## Problem

The sun's shadow map (2048², ortho ±220 m, texel-snap follow) was constructed once and never
scaled by the Quality tier. Normal's visible world is a ±160 m ring-2 window: the fixed frustum
wasted texels and pulled far casters into the shadow pass. (Headless A/B showed the map-size
lever alone is small — ~1 pp busy — so this is a texel-density + memory tidy, not the thermal
fix; PERF-10/11 are those.)

## Fix (src/main.js)

- `QUALITY_PRESETS` gains `shadowMap` / `shadowExtent`: Low 1024/±160 (moot — shadows off),
  Normal 1536/±160, High/Ultra 2048/±220.
- `applyQuality` applies both (disposes `sun.shadow.map` on size change so Three reallocates;
  `updateProjectionMatrix()` on extent change) and recomputes `SHADOW_TEXEL` (now `let`) so the
  BUG-29 texel-snap follow stays exact — texel size at Normal is 320/1536 ≈ 0.208 m ≈ the old
  440/2048 ≈ 0.215 m, so shadow edge quality is unchanged.
- Applied at boot via the new applyQuality('Normal') bootstrap call (see PERF-11).

## Verified

Screenshot at the (-38,183) junction forest: tree/prop shadows identical in character to
pre-fix. Full suite green (known-red GRAPH-REACHABILITY excepted).
