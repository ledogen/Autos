---
id: PERF-38
type: perf
status: open
opened: 2026-11-12
severity: major
source: PERF-37 sessions 1–2 (owner play, 2026-11-11) — with the map open, the main thread spent up to 950 ms/s in
  `frame.postStream`, the GPU sat pinned at 890 MHz / 100 % busy (5 W) while panning, and the profile put
  `_stepBackground` / `_drawTopo` / `_paintGround` / `coarseHeight` at ≈24 % of main-thread busy time.
  Owner, 2026-11-12: "Can we just cache the entire map as a vector image… build it during world generation and then
  freeze it and generate only the overlay icons and gps stuff thats actually live?" — plan approved the same day.
relates: [PERF-37 (parent), PERF-39 (the tire half), BUG-68 (never freeze the adopt path for the map)]
branch: perf/perf-37-tire-map — worktree /Users/ledogen/CodeShit/CarGame-perf37
---

# PERF-38 — draw the map's world layers once, not on every pan

## Why

`src/map2d.js` rebuilds its background bitmap after every settled pan or zoom, and whenever the network grows. It does
this in 16 bands at 6 ms a frame (`BG_SLICE_MS`). Each rebuild re-samples the height field for the contours and
hillshade, re-rasterises ground cover, and re-strokes water and roads. That rebuild is the cost. None of what it draws
changes while the map is open, except the road network as it streams in.

`_drawCampZones` is drawn every frame and is not cached: about 3 ms a frame with the map open.

## Plan (approved 2026-11-12)

The world layers become world-space objects built once and only re-drawn through a transform each frame:

1. **Contours**: one `Path2D` per contour level (a `Path2D` is a canvas path object that can be stroked again and again
   without rebuilding it), in world metres, built once per contour interval.
2. **Ground colour** (cover + hillshade): one image at a few metres per pixel for the whole area.
3. **Roads, water, crossings, nodes**: `Path2D`s, rebuilt only when the network changes.
4. **Only live overlays per frame**: car, mission route, GPS line, POIs, customers, cursor, collar, cards.
5. **When it is built**: behind the story loading screen; in free roam, per area as the player moves.
6. **Memory only, never saved** (cold-generation rule: no world-gen data in saves).

## Built (branch, 2026-11-12)

The world layers are now **world-anchored tiles**, memoised in an LRU (least-recently-used: the oldest-touched tile is
evicted first) of `TILE_MEMO_MAX` 384. A pan or zoom only re-composites the tiles it already has. It builds only the
tiles it has never seen, under the 6 ms slice.

- **Ground** (`_groundTile`): 256 × 256 texels plus a 1-texel apron. Four levels of detail (4 / 8 / 16 / 32 m texels),
  picked so a texel spans at least 2 device pixels.
- **Contours** (`_contourTile`): world-space `Path2D` per 64-cell tile and contour interval (`TOPO_TIERS`).
- **Glyphs** (`_glyphTile`): marsh tufts and conifer marks as world points, 512 m tiles.
- **Roads, camp zones**: world-space `Path2D` memos, rebuilt only when the network changes (`_buildRoad`).
- **The 3D world is not rendered while the map is open** (`main.js`): the map canvas is opaque and covers it.
- Built lazily, area by area, not behind the loading screen. The first view of an area costs what one rebuild did
  before; everything after is cheap. Prebuilding is left until a play session shows the first open still hitches.

Not done: the whole-map zoom (r = 1800 m) could not be captured headless at dpr 2. The CDP socket dies there on main
too, so it is a harness limit, not this change.

Headless A/B (scratchpad harness, 1400 × 900 at dpr 2), a settled pan, ms and frames until the sheet is final:

| seed, zoom | main | branch |
|---|---|---|
| 2654449719 mid | 243 / 15 | 16 / 1 |
| 2654449719 close | 163 / 10 | 39 / 2 |
| 1172941705 mid | ~263 / 16 | 15 / 1 |
| 1172941705 close | 341 / 12 | 19 / 1 |

One synchronous rebuild: 68–137 ms on main, 5–9 ms on the branch. Screenshots of both seeds at mid and close zoom
match main. A hillshade tile seam (a one-sided height difference at the tile's lattice border) was found and fixed.

## Acceptance

- [ ] Map open and still: main-thread map cost under 1 ms a frame (from `frame.postStream` up to 950 ms/s).
- [ ] Panning: no background rebuild per settled pan; GPU no longer pinned (owner powermetrics, PERF-37 harness).
- [ ] The sheet looks the same: before/after screenshots at three zooms on two random seeds.
- [ ] BUG-68 still holds: the adopt path is never frozen for the map.
- [ ] Gates + cdp-smoke green.
