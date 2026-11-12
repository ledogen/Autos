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

## Acceptance

- [ ] Map open and still: main-thread map cost under 1 ms a frame (from `frame.postStream` up to 950 ms/s).
- [ ] Panning: no background rebuild per settled pan; GPU no longer pinned (owner powermetrics, PERF-37 harness).
- [ ] The sheet looks the same: before/after screenshots at three zooms on two random seeds.
- [ ] BUG-68 still holds: the adopt path is never frozen for the map.
- [ ] Gates + cdp-smoke green.
