---
id: FEAT-25
type: feature
status: open
reopened: 2026-07-08
note-reopen: "USER VERIFY 2026-07-08 FAILED: 'no cobble texture is present and no medium stones
are in riverbeds as far as i can tell. i want like 10x med stones in beds.' Two gaps: (1) the
bed-texture ribbon isn't visible in-game — find out why (not built? under the terrain? suppressed
by the water/bed span logic? too subtle?); (2) the rock boost only scattered smallRock (<0.1 m
decorative) — the user wants MEDIUM stones (visible cobbles, 'rock'-class scale) in the beds at
~10x the current stone density."
first-pass: "2026-07-07 f12998a by Opus subagent: (A) stone-texture.js toroidal cobble
  heightfield -> color+normal CanvasTextures; buildStreamBedMesh bed ribbon at p.y-depth+0.06,
  width w+1m, one repeat per 12m arc, sharing computeStreamSpans with the water. (B)
  streamChannelAt membership sampler; smallRock boost pass streamRockBoost=3 (measured 3.28x
  channel density). Gates green — but the user can't see any of it in-game."

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
