---
id: QUAL-20
type: quality
status: closed
resolution: solved-by-different-mechanism
opened: 2026-07-17
closed: 2026-07-27
severity: minor
source: user feedback on PERF-21 billboards (feature/gpu-graphics)
relates: [FEAT-06c (billboard impostors — shipped), PERF-21]
note: "Billboard trees viewed from the sun's side stay too dark: the atlas is baked from ONE
azimuth (+Z), which under the day look is roughly the shade side. The uSunXZ/uLitK brightness
modulation ('billboard lit gain' slider, default 4.0) approximates the lit face by scaling the
shade-side texels, but a scaled dark image never quite reads as sun-lit — the user reports a lit
RIM (baked silhouette highlight) on an otherwise dark canopy. Deferred by user 2026-07-17."
---

# QUAL-20: Bake billboard impostors from the sun's azimuth (true lit face)

## CLOSED 2026-07-27 — owner sign-off ("looks good")

Fixed by **none of the three proposals** — the impostor fidelity pass (`feature/impostors`, merged
97bc4fb; fix commit 9173ebd) solved the same complaint from the other end. The bake camera still
sits at a fixed +Z (`prop-impostor.js`), but the flat `×(1 + 4·max(view·sun, 0))` gain that could
only ever brighten a dark image was replaced with a **derived per-channel relight ratio**: the baked
texel is `albedo × (hemi + sun·g(c₀))`, the shader divides that out and multiplies in the ratio for
the current view alignment, where `g(c) = (sinθ + (π−θ)cosθ)/π` is the average clamped-cosine sun
response over a convex canopy. Billboards now brighten AND warm toward the sun, darken AND cool on
the shade side, and pass through at the bake azimuth — driven by the live rig, not hand-tuned.
`LIT_GAIN` (1.7, GUI 'billboard sun contrast') remains as a taste lever, not the mechanism.

Also landed with it: premultiplied atlas edges (killed the dark halo) and a capped de-burial pull.
No sun-azimuth rebake and no two-view atlas were needed — the tile count and shader cost are
unchanged. Verified by eye at the A/B ring; closed on owner sign-off rather than a numeric bar.

## Problem

`prop-impostor.js` bakes each tree variant from a fixed +Z side view lit by the live sky look.
With the day sun at azimuth 145°, that view is mostly in shade — so the atlas stores the tree's
dark side. Viewing a billboard from the sun's side shows dark canopy with only a baked rim
highlight; the `uLitK` scalar brightening (slider) lifts it but cannot re-create the lit-face
shading structure.

## Proposal (pick at implementation)

1. **Bake from the sun's azimuth** (cheapest): rotate the bake camera to view the tree from the
   sun's horizontal direction — the atlas then stores the LIT face — and invert the modulation to
   DARKEN toward the anti-sun view (`1 − k·max(−view·sunXZ, 0)`). Same tile count, same shader
   complexity. Darkening a lit image reads better than brightening a dark one (shading structure
   survives).
2. **Two-view atlas** (lit + shade tile per variant, blend by view·sun): 2× tiles, one extra
   texture sample or a UV select — closest match at all azimuths.
3. Keep as-is with the slider (status quo; acceptable at fog distance).

## Acceptance

- Orbiting a billboarded tree between full-sun and anti-sun azimuths shows brightness AND shading
  consistent with a neighbouring 3D tree (A/B via the '3D prop ring' slider at 0 vs 5).
- Rebake-on-look-change still works (dusk/dawn/night looks), `__impAtlasStats` spans stay
  ~[0.01, 0.99], gates green.
