---
closed: 2026-07-01
id: FEAT-18
type: feature
status: closed
opened: 2026-06-30
severity: minor
source: user-request
depends_on: FEAT-22 (deterministic water-placement foundation — flow trace + saddle sources)
note: "Water feature, scoped not built. SCOPED 2026-07-01 (see 'SCOPING DECISIONS' section). Streams do their OWN terrain carve (cut a channel through the
heightfield) and roads ALWAYS build a bridge where they cross one (streams are bridged, never routed
around — contrast FEAT-17 ponds, which roads route around). Sister ticket to FEAT-17 ponds."
---

# FEAT-18: Streams — carve a channel through terrain; roads bridge every crossing

## SCOPING DECISIONS (2026-07-01, user)

Locked before planning:

- **Routing = FEAT-22 flow trace.** A stream is a **gradient-descent trace** (step along −∇height)
  from a seeded source — and the natural source is a **saddle** (FEAT-22 saddle detection): a saddle
  is the spill point of the uphill basin and the head of the downhill stream.
- **Streams terminate at ponds for FREE.** Gradient descent always ends at a local minimum, and
  minima ARE the FEAT-17 basins. So "streams end up at ponds" is a property of the trace, not extra
  logic — no confluence/hydrology system needed for v1.
- **Own channel carve** (unchanged): a NEW carve body cutting bed + banks, separate from the road
  carve — respect CARVE SYNC (canonical `src/road-carve.js` + `src/seed.js`, mirrored into
  `WORKER_SOURCE`). Water surface descends along the centerline (not a flat plane).
- **Roads BRIDGE every crossing** (unchanged): road holds its line, deck at road grade, channel
  continuous underneath (no road carve into the bed at the crossing). Shares FEAT-08's deck/support
  builder.
- Simple procedural water material, same spirit as FEAT-17's shader.

## Context

The user wants flowing-water features. A stream is a channel that **carves its own path through the
terrain** (cuts a bed/banks into the heightfield) and runs across the landscape. Unlike ponds
(FEAT-17, which roads route AROUND), **roads always BRIDGE a stream** wherever the network would cross
it — the road holds its line and spans the channel.

Sister ticket: **FEAT-17 ponds** (still-water basin fill). Streams are the *channel-carve + bridge*
side; ponds are the *basin-fill + route-around* side. They likely share the deterministic water
placement and the terrain-carve machinery.

## Desired behaviour

- **Stream path:** a deterministic channel routed across terrain, generally following downhill / valley
  lines (water flows downhill). Width and depth tunable. Density/where-they-spawn controllable.
- **Own terrain carve:** the stream CUTS its channel into the terrain — a bed below the surrounding
  ground with banks — independent of the road carve. The water surface follows the channel downhill
  (it is NOT a single flat plane like a pond; it descends along the stream's length).
- **Roads bridge, always:** wherever a road would cross a stream, the road keeps its alignment and a
  BRIDGE spans the channel (deck at road grade, supports/abutments at the banks). Roads are never routed
  around a stream — crossing → bridge, every time.
- **Deterministic + window-invariant:** the stream path, channel carve, and bridge placements are a pure
  function of seed/coords/params (no stream-order or draw-distance dependence) — same discipline as the
  road surface and the ponds ticket.

## Open design questions (decide at planning)

- **Stream routing:** how the channel path is generated deterministically and window-invariantly. Likely a
  downhill trace / flow-accumulation over the heightfield from a seeded source, or a seeded spline biased
  to follow valley floors. Must be reproducible per-tile as terrain streams in chunks (Worker), without
  needing the whole map — a macro-cell-keyed stream index is the likely shape (mirrors the pond/basin
  question in FEAT-17).
- **Channel carve:** cut the bed + banks into the heightfield. This is a NEW carve body alongside the
  road carve — respect the CARVE SYNC rule: canonical carve in `src/road-carve.js`, height helpers in
  `src/seed.js`, both mirrored verbatim into `WORKER_SOURCE` in `src/terrain.js`. Watch interaction where
  a stream carve meets a road carve (at a crossing the road bridges OVER, so the channel carve should pass
  under the bridge — the road deck is NOT carved down to the bed there).
- **Bridge detection + geometry:** find road×stream crossings (the road network vs the stream paths) and
  emit a bridge span. Decide the data flow: detect crossings after the network is routed (like the
  junction/overpass detection, `_detectJunctions`), then build bridge geometry (deck at road grade +
  abutments/piers). Procedural, no-asset. Relates to FEAT-08 self-overpasses (grade-separated spans) —
  may share the deck/support builder.
- **Water surface down a slope:** unlike a pond's flat plane, the stream surface descends — render a
  ribbon-like water surface following the channel centerline at bed-plus-depth height. Possibly reuse the
  road ribbon machinery (centerline → strip) for the water surface.
- **Confluence / pond interaction:** do streams feed ponds (FEAT-17)? Out of scope for v1 unless cheap —
  note the decision. At minimum they shouldn't visibly conflict (a stream running into a pond basin).
- **Rendering:** procedural flowing water (no-asset) — scrolling normal/flow on a water material; sky/
  time-of-day tie-in (`src/sky.js`) optional.
- **Physics:** v1 scope for driving INTO a stream / off a bridge? At minimum don't fall through to void;
  full water physics not required for the first cut. Record the decision.

## Acceptance

- Streams carve visible channels (bed + banks) that descend across the terrain, deterministic and
  window-invariant (identical regardless of approach direction / draw distance).
- Every road×stream crossing is a BRIDGE: road holds its alignment, deck at road grade, channel continuous
  underneath (no road carve cutting into the streambed at the crossing).
- `npm test` stays green (carve gates, smoothness, road-band coverage, route-worker sync) with the new
  stream carve body added to all CARVE SYNC sites.
- Tunable: stream frequency, channel width/depth, bridge clearance — debug sliders, USER-OWNED set.

## Related

- **FEAT-17** ponds (`feat-water-ponds.md`) — the still-water sister; ponds are routed AROUND, streams are
  BRIDGED. Share deterministic water placement + terrain-carve machinery.
- **FEAT-08** road self-overpasses (`feat-road-self-overpass.md`) — grade-separated span builder; bridge
  decks/supports likely share this. Crossing detection mirrors `_detectJunctions`
  ([[project_crossing_classifier]]).
- **FEAT-11** tunnels (`feat-road-tunnels.md`) — the other terrain-vs-road structure; bridges are the
  span counterpart to tunnels' bore.
- Terrain carve + Worker/CARVE SYNC discipline: CLAUDE.md "Terrain Worker" +
  [[project_terrain_worker_constraints]]; carve internals [[project_carve_invisible_cliff]].

## RESOLUTION (2026-07-01) — CLOSED, shipped (minimal-v1 bridges per user decision)

Generation landed in 27908e7 (saddle→traceFlow streams, ~59 on seed 6). Carve + crossings
completed 2026-07-01 in 203f7e1:
- Channel carve applied MAIN-THREAD ONLY (terrain Worker returns raw heights — confirmed at
  planning, per COORDINATION), so streamCarveSample stays canonical in src/water.js (leaf,
  injected via terrain.setWaterCarve) with NO WORKER_SOURCE mirror. Multi-stream seams fixed by
  deepest-composed-section-wins (min of continuous surfaces — no Voronoi bed step).
- Bridges v1 (user-selected minimal scope): MESH composition suppresses the road carve inside a
  channel (continuous notch); PHYSICS (analyticHeight) uses the un-suppressed blend so the road
  core holds gradeY — the road RIBBON spans the notch as the deck, wheels ride it, in fill and
  cut. Gate test/stream-carve.mjs: 26/26 road-core crossings hold grade, channel resumes both
  sides, bank C0, bounded, deterministic. In-browser verified (channel at 396,−596; crossing at
  368,−410).

Deferred (FEAT-08 shared span builder, when it happens): real deck/abutment/pier geometry,
driving UNDER a bridge (physics deck fills the under-span), stream-water ribbon clipping at the
shoulder blend (small water patch can overlap the shoulder at a crossing edge). Also unticketed
polish: trees can still scatter inside stream channels (only pond water is excluded).
