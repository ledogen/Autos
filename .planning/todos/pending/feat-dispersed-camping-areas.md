---
id: FEAT-45
type: feature
status: open
opened: 2026-07-28
severity: minor
relates_to: FEAT-16 (2D map), FEAT-21 (road POI scatter), story mode (DESIGN.md — sleep/doze clock)
---

# FEAT-45: Dispersed camping areas

## Request

Designate **dispersed camping areas** — the general zones where the player is allowed to camp
(as on real forest-service land, where dispersed camping is permitted in broad areas rather
than at discrete numbered sites). Shown on the 2D map (`M`) as a **yellow overlay** covering
the permitted area.

## Open questions (scope in plan mode when picked up)

- What defines an area's extent — a radius around road edges/spurs, a terrain-derived polygon
  (low grade, off-water, off-road-carve), or a seeded blue-noise blob set?
- Is the overlay purely informational, or does it gate a camp/sleep action (story mode's
  sleep/doze clock — check `.planning/story-mode/DESIGN.md` invariants before wiring gameplay)?
- Rendering: filled translucent yellow polygons on `map2d`, or a coarse raster/tile mask?
- Any world-space cue when the player is inside one (sign, HUD hint), or map-only for now?
- Relationship to FEAT-21 POIs — same placement machinery, or independent?

## Acceptance

- Camping areas are deterministic and window-invariant (same seed/params → same areas from any
  stream center), consistent with the rest of worldgen.
- The 2D map renders them as a legible yellow overlay that reads as "area", not "point".
- No regression on existing road/terrain/map gates.
