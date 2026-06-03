---
slug: 260527-qad-terrain-normal-fn-angular-damping
status: complete
completed: 2026-05-27
commit: e1f754b
---

# Summary

Two physics corrections to enable correct body behavior on non-flat terrain, plus a test ramp.

**physics.js:**
- `stepPhysics` now accepts `terrain` as an optional 4th parameter (falls back to flat ground)
- Step 1 penetration loop uses `_terrain(cp.x, cp.z).height - cp.y` instead of `-cp.y`
- `angularVelocity.x/z = 0` replaced with `*= 0.85` damping — kills oscillation without preventing slope pitch/roll
- Step 3b queries terrain per wheel; applies `FnVec = normal * Fn` via `r × FnVec` cross product instead of explicit pitch/roll torque lines

**main.js:**
- terrain() returns a 10° ramp (RAMP_START_Z=-15, RAMP_LENGTH=8m) with correct surface normal `(0, cos(θ), sin(θ))` and flat plateau beyond
- Two PlaneGeometry meshes (ramp + plateau) added as visual guides
- `stepPhysics` call site passes `terrain` as 4th arg
