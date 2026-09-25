---
id: BUG-72
type: bug
status: fixed
severity: major
opened: 2026-09-25
closed: 2026-09-25
source: owner report (2026-09-25) — after fast free-cam over ungenerated terrain some chunks stream in
  pitch BLACK (props on them lit normally); they flicker back to the right colour on a screenshot, a
  macOS desktop switch, or sometimes a truck respawn. Long-standing; capture autos-capture-1790371907357
  (seed 1091917645, ~ -241 / 2166) — location not significant.
relates: PERF-05 (chunk geometry pool), PERF-33 (found on feature/stutter)
---

# BUG-72: black terrain chunks — every colour write leaked a GPU buffer

## Cause

`TerrainSystem._writeChunkVertexColors` built a fresh `Float32Array` and called
`geom.setAttribute('color', new THREE.BufferAttribute(...))` on every chunk build AND every re-carve.
Chunk geometries are POOLED (PERF-05) and never disposed, and three.js frees an attribute's GPU buffer
only on `geometry.dispose()` — so each replaced colour attribute stranded its ~50 KB WebGL buffer.

Measured (WebGL `createBuffer`/`deleteBuffer`/`bufferData` counted over CDP, 120 m/s free-cam, 60 s,
live chunk count flat at 56): **+749 live buffers, 15 → 54 MB** of array-buffer memory, never freed.
At Ultra and over a long session that is hundreds of MB. Under that pressure buffer uploads fail; a
chunk whose colour buffer never uploaded samples zeros → black. Compositor events (screenshot, desktop
switch) reshuffle GPU memory, which is why they briefly "fixed" it.

## Fix

Write into the geometry's existing colour attribute (create it only on a pool miss) and flag
`needsUpdate`. Same run after the fix: **flat at 622 buffers / 16 MB for the whole minute**.
Normals already reused their attribute (`_computeGridNormals`); nothing else in the streaming path
leaked in that probe.

## Verification

Buffer probe above (before/after). Affected gates green. The black chunks themselves were not
reproduced headless (VRAM exhaustion depends on the machine) — owner to confirm in a long Ultra
free-cam session.
