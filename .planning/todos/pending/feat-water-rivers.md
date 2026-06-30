---
id: FEAT-18
type: feature
status: open
opened: 2026-06-30
severity: minor
source: user-request
note: "Water feature, scoped not built. Rivers do their OWN terrain carve (cut a channel through the
heightfield) and roads ALWAYS build a bridge where they cross one (rivers are bridged, never routed
around — contrast FEAT-17 lakes, which roads route around). Sister ticket to FEAT-17 lakes."
---

# FEAT-18: Rivers — carve a channel through terrain; roads bridge every crossing

## Context

The user wants flowing-water features. A river is a channel that **carves its own path through the
terrain** (cuts a bed/banks into the heightfield) and runs across the landscape. Unlike lakes
(FEAT-17, which roads route AROUND), **roads always BRIDGE a river** wherever the network would cross
it — the road holds its line and spans the channel.

Sister ticket: **FEAT-17 lakes** (still-water basin fill). Rivers are the *channel-carve + bridge*
side; lakes are the *basin-fill + route-around* side. They likely share the deterministic water
placement and the terrain-carve machinery.

## Desired behaviour

- **River path:** a deterministic channel routed across terrain, generally following downhill / valley
  lines (water flows downhill). Width and depth tunable. Density/where-they-spawn controllable.
- **Own terrain carve:** the river CUTS its channel into the terrain — a bed below the surrounding
  ground with banks — independent of the road carve. The water surface follows the channel downhill
  (it is NOT a single flat plane like a lake; it descends along the river's length).
- **Roads bridge, always:** wherever a road would cross a river, the road keeps its alignment and a
  BRIDGE spans the channel (deck at road grade, supports/abutments at the banks). Roads are never routed
  around a river — crossing → bridge, every time.
- **Deterministic + window-invariant:** the river path, channel carve, and bridge placements are a pure
  function of seed/coords/params (no stream-order or draw-distance dependence) — same discipline as the
  road surface and the lakes ticket.

## Open design questions (decide at planning)

- **River routing:** how the channel path is generated deterministically and window-invariantly. Likely a
  downhill trace / flow-accumulation over the heightfield from a seeded source, or a seeded spline biased
  to follow valley floors. Must be reproducible per-tile as terrain streams in chunks (Worker), without
  needing the whole map — a macro-cell-keyed river index is the likely shape (mirrors the lake/basin
  question in FEAT-17).
- **Channel carve:** cut the bed + banks into the heightfield. This is a NEW carve body alongside the
  road carve — respect the CARVE SYNC rule: canonical carve in `src/road-carve.js`, height helpers in
  `src/seed.js`, both mirrored verbatim into `WORKER_SOURCE` in `src/terrain.js`. Watch interaction where
  a river carve meets a road carve (at a crossing the road bridges OVER, so the channel carve should pass
  under the bridge — the road deck is NOT carved down to the bed there).
- **Bridge detection + geometry:** find road×river crossings (the road network vs the river paths) and
  emit a bridge span. Decide the data flow: detect crossings after the network is routed (like the
  junction/overpass detection, `_detectJunctions`), then build bridge geometry (deck at road grade +
  abutments/piers). Procedural, no-asset. Relates to FEAT-08 self-overpasses (grade-separated spans) —
  may share the deck/support builder.
- **Water surface down a slope:** unlike a lake's flat plane, the river surface descends — render a
  ribbon-like water surface following the channel centerline at bed-plus-depth height. Possibly reuse the
  road ribbon machinery (centerline → strip) for the water surface.
- **Confluence / lake interaction:** do rivers feed lakes (FEAT-17)? Out of scope for v1 unless cheap —
  note the decision. At minimum they shouldn't visibly conflict (a river running into a lake basin).
- **Rendering:** procedural flowing water (no-asset) — scrolling normal/flow on a water material; sky/
  time-of-day tie-in (`src/sky.js`) optional.
- **Physics:** v1 scope for driving INTO a river / off a bridge? At minimum don't fall through to void;
  full water physics not required for the first cut. Record the decision.

## Acceptance

- Rivers carve visible channels (bed + banks) that descend across the terrain, deterministic and
  window-invariant (identical regardless of approach direction / draw distance).
- Every road×river crossing is a BRIDGE: road holds its alignment, deck at road grade, channel continuous
  underneath (no road carve cutting into the riverbed at the crossing).
- `npm test` stays green (carve gates, smoothness, road-band coverage, route-worker sync) with the new
  river carve body added to all CARVE SYNC sites.
- Tunable: river frequency, channel width/depth, bridge clearance — debug sliders, USER-OWNED set.

## Related

- **FEAT-17** lakes (`feat-water-lakes.md`) — the still-water sister; lakes are routed AROUND, rivers are
  BRIDGED. Share deterministic water placement + terrain-carve machinery.
- **FEAT-08** road self-overpasses (`feat-road-self-overpass.md`) — grade-separated span builder; bridge
  decks/supports likely share this. Crossing detection mirrors `_detectJunctions`
  ([[project_crossing_classifier]]).
- **FEAT-11** tunnels (`feat-road-tunnels.md`) — the other terrain-vs-road structure; bridges are the
  span counterpart to tunnels' bore.
- Terrain carve + Worker/CARVE SYNC discipline: CLAUDE.md "Terrain Worker" +
  [[project_terrain_worker_constraints]]; carve internals [[project_carve_invisible_cliff]].
