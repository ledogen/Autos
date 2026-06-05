---
id: BUG-07
type: bug
severity: minor
status: resolved
opened: 2026-06-04
resolved: 2026-06-05
---

# BUG-07: Terrain amplitude set to zero does not visually update to flat

## Symptom

When `terrainAmplitude` is set to 0 via the debug slider, the collision geometry
correctly flattens (physics treats the ground as flat), but the rendered terrain
mesh retains its previous bumpy appearance. The visual and physics representations
are out of sync until something else forces a mesh rebuild.

## Root cause hypothesis

The terrain mesh is likely regenerated only when the terrain is first created or
when a full reset is triggered. Slider changes to `terrainAmplitude` update the
parameter used by the collision/height query path, but do not trigger a mesh
rebuild or vertex re-upload to the GPU.

Likely candidates:
- The debug slider `onChange` callback updates the param but does not call the
  terrain mesh generation function.
- The mesh generation function and the height query function may use the same
  amplitude param but the mesh is only built once (at init or reset), while
  the query reads the param live each frame.

## Repro

1. Load the sim with default terrain (amplitude > 0).
2. Open debug panel, set `terrainAmplitude` to 0.
3. Observe: ground appears hilly/bumpy visually, but the car drives as if on a
   flat surface (correct physics, wrong render).

## Expected behavior

Setting amplitude to 0 should produce a visually flat terrain that matches the
flat collision response.

## Fix sketch

- The slider `onChange` for `terrainAmplitude` (and likely `terrainFrequency`,
  `terrainOctaves` if they exist) should trigger a terrain mesh rebuild.
- If mesh rebuild is expensive, gate it behind a debounce or a "Rebuild Terrain"
  button — but a real-time slider update is preferable for a debug tool.
- Confirm that the same noise function / params are used for both the height
  query (physics) and the vertex positions (render) so amplitude=0 produces
  identical flat results on both paths.

## Notes

- Physics correctness is not affected — this is purely a render/debug UX issue.
- Low risk fix: mesh rebuild on slider change is a small, localized change.
