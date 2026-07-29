---
id: PERF-28
type: perf
status: cancelled
opened: 2026-07-28
closed: 2026-07-28
severity: minor
source: external prompt audit (Babylon-style perf tenets compared against src/)
relates: [PERF-22 (terrain chunk geometry LOD — the ticket that actually targets our render cost),
          PERF-16 (shadowMap.autoUpdate=false — a genuine "stop redundant per-frame work" win)]
resolution: "CANCELLED un-implemented, same day it was opened. Failed its own kill criterion by
inspection (~0.05 ms est. vs a 0.3 ms bar) once the mechanism was stated correctly. Do not
re-open — see 'Why this is not a win' below. Owner has ruled out ever reaching the object count
where the lever would pay."
---

# PERF-28 (CANCELLED): Freeze world matrices on static streamed meshes

Proposed setting `matrixAutoUpdate = false` + a one-time `updateMatrixWorld()` on write-once
streamed meshes (terrain chunks, road runs, water, prop instancers), as the Three.js analogue of
Babylon's `mesh.freezeWorldMatrix()` / `scene.freezeActiveMeshes()`. `grep -rn matrixAutoUpdate
src/` returns zero hits — we have never set it anywhere.

## Why this is not a win (the reason it was cancelled)

The original framing was wrong in a way that mattered. It claimed Three "walks the scene graph and
recomputes world matrices every frame," implying freezing skips the walk. **It does not.**
`WebGLRenderer`'s `projectObject` traverses every object each frame regardless, for frustum culling
and draw-list building. Freezing skips only the `compose()` — writing position/quaternion/scale
into 16 floats, plus one `multiplyMatrices` against the parent.

That is ~100–200 ns per object. At Ultra's 289 resident terrain chunks (PERF-22's measured count)
the total is **~0.05 ms/frame — under 0.5% of a 16.7 ms budget, and only at the top tier.** The
ticket's own kill criterion was 0.3 ms. It fails by inspection; no profiling run was needed.

Against that near-zero win, the cost is a permanent silent-failure invariant: any future code that
moves a frozen mesh renders it at the wrong position, with no error and no gate to catch it.

## Why Babylon ships this and we don't need it

`freezeActiveMeshes` targets scenes with thousands-to-tens-of-thousands of static objects, where
per-object constant factors do add up. We are two orders of magnitude below that, and the owner has
explicitly ruled out ever growing into that regime — so this is not a "revisit at 10k objects"
threshold, it is out of scope by design.

**Our actual render-side cost is triangle count, not matrix churn.** PERF-22 targets the same
meshes and goes after the thing that is genuinely expensive (Ultra pushes ~2.4M resident terrain
tris). Spend the effort there.

## General lesson

This ticket came from reading another project's perf constraints (a visually complex,
gameplay-simple snow demo) and asking "do we do this too?" — a fine question, but their bottleneck
is the render loop and ours is worldgen CPU (PERF-26/27) and triangle load (PERF-22). Borrowed
tenets need their *mechanism* checked against our engine and our object counts before they become
tickets.
