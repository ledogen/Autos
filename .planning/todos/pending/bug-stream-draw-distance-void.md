---
id: BUG-32
type: bug
status: open
opened: 2026-07-07
severity: minor
source: user-observation
note: "Streams render way out into the void beyond terrain draw distance."
---

# BUG-32: Stream ribbons render far beyond the terrain draw distance

## Symptom

Water ribbons hang in empty space past the loaded terrain ring ("render way out in the void").

## Root cause

`WaterRenderer.sync` (main.js:1601) uses `WATER_SYNC_RADIUS = 640` m, and `buildStreamMesh`
builds the ENTIRE centerline ribbon (up to `streamMaxLength` 1400 m) whenever any point overlaps
the bbox. Terrain at Normal quality only shows ~160 m (ring 2 × 64 m tiles).

## Fix

- Derive the water sync bbox from the live terrain ring radius (tracks quality presets /
  `setRingRadius`).
- CLIP ribbon geometry to the sync bbox (clip whole strips at bbox crossings; keys become
  window-dependent — rebuild only when the stream-center chunk moves, mirroring chunk streaming).
- Cull pond discs the same way. Fog should hide the clip edge; verify no visible popping.

## Acceptance

No water geometry beyond the terrain ring + margin; no visible pop at the edge under fog;
`npm test` green.
