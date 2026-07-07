---
id: FEAT-25
type: feature
status: open
opened: 2026-07-07
severity: minor
source: user-request
note: "Spice up streams: riverbed stones. Ideally a heightmap-generated texture for performance,
plus a higher density of stone PROPS in stream channels for variety. No asset files (D-01)."
---

# FEAT-25: Riverbed stones — procedural cobble texture + channel rock scatter

## Scope

- **(A) Bed texture:** a bed-following ribbon mesh (bed Y + ε, under the water surface, following
  the per-point channel width from FEAT-24) textured with an in-browser-generated cobble texture:
  canvas/DataTexture heightmap → derived normal map + color (rounded stones, warm gray/tan per
  the user's Sierra reference). Tiled along arc length. Opaque or alpha-test — never alpha-blend
  (PERF-05). One shared texture + material for all streams.
- **(B) Channel rock props:** boost small-rock scatter density inside stream channel footprints.
  Extend the water sampler handed to the prop scatter (like `pondSkirtAt`) with an `inStream`
  membership query; scatterer places extra decorative rocks (collision `none`) in/along channels,
  deterministic per chunk.

## Acceptance

- Streams read as stony-bedded creeks near the camera; no measurable frame cost at Normal
  (shared texture, one draw per stream ribbon or merged).
- No asset files; window-invariant scatter; `npm test` green.
- Depends on FEAT-24 (final channel geometry) and BUG-33 (bed ribbon must respect road decks).
