---
id: BUG-02
title: Orbit camera activates when dragging debug sliders
severity: minor
status: open
introduced: pre-phase-6
created: 2026-06-03
resolves_phase: ~
---

## Description

Dragging a lil-gui slider triggers the orbit/pan camera behavior in addition to adjusting the slider value. Releasing the slider may leave the camera in a rotated state.

## Root Cause (suspected)

The OrbitControls mousedown/mousemove listeners on the canvas are not suppressed when the pointer is captured by a lil-gui input. lil-gui sliders do not stop propagation on pointer events, so both the slider and OrbitControls receive the drag.

## Reproduction

1. Open the debug panel
2. Click-drag any slider (e.g., Terrain Amplitude)
3. Observe: camera orbits while adjusting the value

## Fix (deferred)

Suppress OrbitControls pointer events while a lil-gui element has pointer capture. Options:
- Disable `controls.enabled` on lil-gui `pointerdown`, re-enable on `pointerup`
- Check `event.target` closest `.lil-gui` in the controls handler and bail early

## Notes

Present before Phase 6. Not introduced by terrain work.
