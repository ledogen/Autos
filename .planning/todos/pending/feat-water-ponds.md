---
id: FEAT-17
type: feature
status: open
opened: 2026-06-30
severity: minor
source: user-request
depends_on: FEAT-22 (deterministic water-placement foundation — basin index + submerged hook)
note: "Water feature, scoped not built. SCOPED 2026-07-01 (see 'SCOPING DECISIONS' section). Ponds spawn in valleys at the local low point and fill the
bottom of the valley volume up to a water plane. Some valleys are deeper than others — that's fine,
each pond just locally fills its own basin. Roads ROUTE AROUND ponds (treated as an obstacle/no-go
region), with a small exclusion SKIRT around the shoreline so roads never generate right on the
water's edge; that skirt is prime scatter space for trees/plants/rocks (FEAT-06). Sister ticket to
FEAT-18 streams."
---

# FEAT-17: Ponds — fill valley basins with water; roads route around them

## SCOPING DECISIONS (2026-07-01, user)

Locked before planning:

- **Detection = FEAT-22.** Pond sites come from the shared basin index (local minima with a closed
  basin in a bounded ring, over analytic height). Rarity is the closure-threshold dial, not a random
  roll. See FEAT-22 for the window-invariance approach.
- **Fill = Plan B (rim-heuristic), NOT true watershed.** Fill to a fixed depth below the local
  minimum's surrounding rim; skip true spill-saddle computation. Trivially window-invariant + cheap.
  (Accepts the small risk of a basin mismatch vs a true watershed — fine at pond scale.)
- **These are PONDS, not lakes — small.** **Footprint capped at ~100 m** for now
  (`pondMaxRadius` ≈ 50 m / diameter ≈ 100 m). Rare. Not sprawling water bodies.
- **Visuals = a SIMPLE shader.** Procedural (no-asset): a clipped flat plane with a simple water
  material (transparency + a light normal/tint, optional sky tie-in later). Do not over-build the
  first cut.
- **Submerged hook wired HERE** (ponds are the first place you drive into water): consume FEAT-22's
  `vehicleState.submerged` test against the pond plane. v1 sets the flag only (hydrolock later).
- Roads route around pond + skirt (unchanged); skirt is FEAT-06 scatter ground (unchanged).

## Context

The user wants standing-water features. A pond forms where a **valley has a local low point**: water
collects at the bottom and fills the basin up to a flat water plane. Valleys vary in depth and
elevation — each pond just **locally fills the bottom of its own valley**, so different ponds sit at
different absolute heights. Roads must **route around** a pond (it is an obstacle), and there is a
small **skirt** of land around the shoreline that is **excluded from road generation** so roads never
spawn right at the water's edge. The skirt becomes natural scatter ground for trees, plants, and rocks.

Sister ticket: **FEAT-18 streams** (flowing water + bridges). Ponds are the *still-water / basin-fill*
side; streams are the *channel-carve + bridge* side.

## Desired behaviour

- **Placement:** find local basins (valley low points) deterministically from the heightfield and seed.
  Not every valley needs a pond — some fraction qualify (controllable). The water surface is a flat
  plane at a chosen fill level for that basin.
- **Local fill:** the pond fills the basin volume up to its water plane (a horizontal surface). It does
  NOT need global hydrology — just locally flood the bottom of the valley. Different ponds → different
  absolute water levels, which is expected and fine.
- **Water plane / shoreline:** the shoreline is the contour where raw terrain meets the water level.
  Below the plane (inside the basin) reads as submerged; the visible water surface is the plane clipped
  to that contour.
- **Road avoidance:** the road network treats the pond footprint + a **skirt** buffer as a no-go region
  and routes around it. Roads must not cross or touch a pond (streams get bridges — ponds do not).
- **Skirt exclusion + scatter:** a tunable-width ring around the shoreline excludes road generation and
  is handed to the prop scatter (FEAT-06) as preferred ground for trees/plants/rocks, so the water's
  edge looks vegetated rather than bare.
- **Deterministic + window-invariant:** pond set, basin levels, and shorelines are a pure function of
  seed/coords/params — same discipline as the road surface (no stream-order or draw-distance dependence;
  a pond looks identical regardless of where you approach it from).

## Open design questions (decide at planning)

- **Basin detection:** how to find valley low points from the heightfield deterministically and
  window-invariantly. Options: sample the seed/height helpers (`src/seed.js`) on a coarse grid and find
  local minima with a surrounding rim above the fill level; or a watershed-style flood from minima up to
  a spill height. Must be reproducible per-tile without seeing the whole map at once (terrain streams in
  chunks via the Worker). A coarse deterministic basin index keyed by macro-cell is likely the shape.
- **Fill level per basin:** pick the water plane height (e.g. fixed depth below the rim / spill point, or
  a fraction of basin depth). Avoid ponds that overflow their basin. Min basin size to avoid puddles.
- **Terrain interaction:** does a pond CARVE the terrain (deepen/smooth the basin floor) or just render a
  water plane over existing terrain? Probably render-only for the surface, but the bed may want a gentle
  bowl so the shoreline isn't ragged. If it carves at all, respect the CARVE SYNC rule (canonical carve
  in `src/road-carve.js` / heights in `src/seed.js`, mirrored into `WORKER_SOURCE` in `src/terrain.js`).
- **Road no-go integration:** where the router learns the obstacle. The graph builder (`src/road-graph.js`)
  + the router (`arcPrimitiveConnect` in the ROUTE SYNC region of `src/road-carve.js`, mirrored into the
  Worker) need to reject/penalize edges entering the pond+skirt footprint. Decide: drop anchors inside
  the footprint, or add a routing cost/hard-exclusion zone. Mind that routing runs both on the main
  thread (fallback) and in the Worker pre-warm — keep them in sync.
- **Skirt width:** a tunable shoreline buffer (`pondSkirtWidth`) that excludes road gen and seeds scatter.
- **Rendering:** procedural water (no-asset constraint) — a clipped plane with a water shader/material,
  reflection/transparency to taste. Time-of-day tie-in with the sky system (`src/sky.js`) is a nice-to-have.
- **Physics:** out of scope for v1? (Driving into a pond = ??? — at minimum don't fall through to void.)
  Note the decision; full buoyancy/drag is not required for the first cut.

## Acceptance

- Some valleys contain a flat pond filling the basin bottom; different ponds sit at different heights,
  each correctly contained by its valley rim (no overflow, no floating water).
- Roads route cleanly AROUND every pond, with no road geometry inside the pond or its skirt buffer.
- A vegetated skirt rings each pond (trees/plants/rocks via FEAT-06 scatter), no road at the water's edge.
- Deterministic + window-invariant: a given pond renders identically regardless of approach direction or
  draw distance; `npm test` stays green (carve gates, smoothness, road-band coverage, route-worker sync).
- Tunable: pond frequency, min basin size, fill level, `pondSkirtWidth` — debug sliders, USER-OWNED set.

## Related

- **FEAT-18** streams (`feat-water-streams.md`) — the flowing-water sister; streams carve a channel and roads
  BRIDGE them (ponds are routed AROUND, not bridged). Share the deterministic water-placement + carve work.
- **FEAT-06** props scatter (`feat-prop-lod-impostors.md`, [[project_feat06_props_scope]]) — the skirt is
  scatter ground for trees/plants/rocks.
- **FEAT-13** road network graph (`feat-road-network-graph.md`, [[project_feat13_v2_foundation]]) — the
  router/graph that must learn the pond no-go region.
- Terrain carve + Worker sync discipline: CLAUDE.md "Terrain Worker" + [[project_terrain_worker_constraints]];
  carve internals [[project_carve_invisible_cliff]].
