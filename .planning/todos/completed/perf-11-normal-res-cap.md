---
id: PERF-11
type: perf
status: done
severity: major
created: 2026-07-13
closed: 2026-07-13
---

# Normal preset renders at native Retina — cap at 1200 lines (the thermal lever)

## Problem

Normal/High/Ultra ran `pixelRatio = devicePixelRatio` (2× on the M4 Air's 2560×1664 panel) —
~4× the fragments of 1× for the whole scene, every frame. PERF-05 established the residual
frame cost is render/GPU-bound; the user reports thermal-throttling load on every preset except
Low (which caps at 720p). Fragment cost is invisible to the headless harness (dpr = 1), so this
ships on the pre-approved user decision (2026-07-13: "Normal may render below native") rather
than an A/B number — judge by eye + palm on the chassis.

## Fix (src/main.js)

`QUALITY_PRESETS.Normal.resHeight: null → 1200` (≈1.5× ratio on the Air; aspect-correct via the
existing `applyRenderResolution()` fractional-pixelRatio clamp). High/Ultra stay native as the
GPU-to-burn tiers. Plus the enabling change: **applyQuality('Normal') now runs once at boot** —
the old "Normal == construction defaults" convention is gone, the preset table is authoritative
(also required by PERF-12's shadow scaling).

## Verify

- User: play at Normal on the Air; the panel should be visibly sharp at game distance while GPU
  power drops materially (optionally `sudo powermetrics --samplers gpu_power` before/after).
- If it reads soft, resHeight is one number — try 1300–1440.
