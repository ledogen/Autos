---
id: BUG-78
type: bug
status: fixed
severity: minor
opened: 2026-09-28
closed: 2026-09-28
source: owner report (2026-09-28) — "car sometimes leaves a bit of its shadow behind at high speed
  or on steep slopes. its only briefly present before getting cleared but its visible and ugly"
relates: PERF-16 (on-demand shadow pass), QUAL-18 (shadow edge fade), the terrain shadow cascade
  (`sunFar`, main.js), PERF-07 (baked prop shadows on the far light)
---

# BUG-78 — the truck leaves a stale copy of its shadow behind

## Symptom

At speed, or dropping down a slope, a dark truck-shaped smudge sits on the ground a few metres
behind the truck, then vanishes a moment later. Parked, the same smudge is visible as a soft,
slightly offset second shadow under the crisp one.

## Root cause

Two directional lights split the key intensity 40 / 60 (`sun` near map, `sunFar` far cascade,
`SHADOW_FAR_SPLIT`). In three a shadow only removes its own light's share, so the truck had to
cast into BOTH maps to throw a full-strength shadow. The far map is deliberately re-rendered only
every 64 m of travel or on a streaming event (that is the whole point of the cascade's private
`autoUpdate = false`), so its copy of the truck's shadow stayed pinned where the last far pass
drew it while the truck drove on. The near map re-renders every moving frame, so the crisp shadow
tracked the truck and the stale 0.25 m/texel blob was exposed behind it until the next far pass.
three has no per-light caster set — `WebGLShadowMap` tests `object.layers` against the VIEW
camera, not the light — so the truck could not simply be kept out of one map.

## Fix

Two parts, both in the renderer layer:

1. **Far pass with the vehicle hidden** (`src/main.js`, by the `sunFar` setup). The renderer's
   shadow pass is one call over every shadow-casting light, made from inside `render()`; it cannot
   be run from the frame loop (per-draw setup reads the render state that only exists there —
   tried, it throws). So that call is wrapped: the near light goes through untouched, honouring
   the PERF-16 gate; then, if the far-follow raised `_farShadowPending`, the far light is drawn on
   its own with every object in `FAR_SHADOW_HIDE` (the vehicle root) hidden and shown again before
   the world pass. Geometry matrices are fresh and the map still lands in the frame that asked.
2. **Near map gates the far light** (`installNearShadowCoupling`, `src/shadow-fade.js`). Patches
   `lights_fragment_begin` so directional light 0's shadow factor also multiplies light 1. The
   truck's shadow is now thrown by the near map alone at full strength; beyond the near box the
   near factor is 1 so the mountain-scale shadows keep their 60 % share exactly as tuned. Index 0
   = near is the same stable-sort assumption the terrain shader's `UNROLLED_LOOP_INDEX == 1` patch
   already leans on. The terrain inlines the chunk at compile time, so it inherits the patch.

## Verification

Headless CDP, seed 6, same straight stretch (62, 418) heading 0, sun at 08:30, W held 6 s on the
fixed main checkout and on an untouched worktree build (feature/feat-67 :3414, same shadow code):

- untouched, 22 m/s: crisp shadow beside the truck + smeared blob trailing behind on the road.
- fixed, 22 m/s: one crisp full-strength shadow, nothing trailing.
- parked pair: untouched shows the offset second shadow under the crisp one; fixed shows one
  shadow, with road / hillside / vegetation shading otherwise identical — the coupling adds no
  darkening anywhere the truck is not.
- Consoles clean on both (no shader compile errors).

No headless gate imports `main.js` or `shadow-fade.js`; the visual check above is the gate.

## Regression caught during review (2026-09-29, fixed same day)

Owner: "the entire shadow got left behind briefly and then caught up" on :8000. The first wrapper
did not check WHICH scene the shadow pass was serving. The prop-impostor re-bake renders its own
scene several times before the world render on every sky look change; on such a frame with a far
pass pending, the wrapper drew the cascade from the bake scene and consumed the renderer's global
on-demand gate, so the world render that followed skipped the near map for that frame. Frequent
under the story-mode day clock, invisible under a static headless sun. Fixed by the `sceneArg !==
scene` guard in the wrapper: a non-world render can neither draw the far map nor touch the gate.
Probe afterwards: near map redrawn on every moving frame, far passes only on streaming events,
impostor bake frames carry no shadow lights.

## Side effect (intended)

The "soft penumbra around the crisp near shadow" the cascade's setup comment described as an
accepted trade-off was this same far-map copy. It is gone; the truck's shadow is the near map only.
