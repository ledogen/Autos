---
spike: 001
name: valley-route-wraps-mountain
type: standard
validates: "Given the real lone-pine coarse terrain and a wide routing window spanning the big mountain, when routing a global least-cost trunk (altitude+grade-dominated cost, soft grade penalty), then the route wraps around the peak via low ground instead of climbing it"
verdict: VALIDATED
related: []
tags: [routing, terrain, astar]
---

# Spike 001: Valley-following route wraps the mountain

## What This Validates

Given the real, locked Phase-7 `coarseHeight` terrain (amplitude 150 m, freq 0.0005, 4 octaves,
ridgeSharpness 1.6) for seed `lone-pine`, when a single **global** least-cost A* trunk is routed
over a wide window with cost dominated by **altitude (stay low) + grade (stay gentle)** and a
**soft** (finite) grade penalty instead of a hard block — then the route should **wrap around** the
big mountain through low ground rather than trying to climb straight over it (the failure mode of
the per-tile west→east router from the failed Phase-8 build).

## Research

The Phase-8 implementation used **per-tile A\*** with a **hard grade block** (`grade > maxGrade →
Infinity`). On this terrain (~15–40% ridge flanks) that produced "no path" on nearly every 64 m
tile, falling back to straight over-grade lines that climb mountains. See
`.planning/phases/08-road-routing/VERIFICATION.md`.

| Approach | Cost model | Pros | Cons |
|----------|-----------|------|------|
| Per-tile hard-block A* (old) | `Infinity` above maxGrade, per 64 m tile | hard grade guarantee | no switchback room → no path → climbs via fallback |
| Global soft-penalty A* (this spike) | altitude + grade² + finite over-cap penalty, wide window | always finds a path; altitude term wraps high ground; switchback room | grade only *strongly preferred*, not guaranteed |
| Drainage / flow following | trace gradient downhill to valley floors | very natural valleys | harder to make deterministic + infinite cleanly |

**Chosen:** global soft-penalty least-cost A* with a dominant **altitude** term — the altitude cost
is what makes the path prefer to go *around* high ground (every cell of height adds cost), and the
soft over-cap penalty keeps it gentle without ever returning "no path." The spike exposes all
weights as live sliders so the altitude-vs-directness-vs-gentleness balance can be felt and tuned.

## How to Run

ES modules need HTTP (not `file://`). From the repo root:

```
python3 test/nocache-server.py 8138
```

Then open: **http://127.0.0.1:8138/.planning/spikes/001-valley-route-wraps-mountain/**

(The page imports the real `src/seed.js` and the `simplex-noise` CDN module via the same importmap
as the app, so it routes over the *actual* terrain.)

## What to Expect

- A top-down heatmap of the real terrain around the lone-pine spawn region (origin). Dark teal =
  valleys, white = peaks; gold dot marks the highest point in view.
- A red routed trunk between a green START and red END (auto-placed at the lowest points on the
  left/right edges; click to reposition). A dashed white straight line shows what would cut across.
- Sliders for the cost weights + maxGrade, and a "Toggle HARD block" button to reproduce the old
  per-tile behavior (expect "NO PATH").
- Stats: route length vs straight-line, detour ratio, total climb, **max grade**, segments over cap,
  **min distance to the peak**, and a **WRAPS THE PEAK? YES/NO** readout (YES if the route stays
  >60 m from the summit).

**Success looks like:** with a healthy `wAlt`, the red line bows *around* the gold peak through the
dark valleys (WRAPS = YES), max grade near/under the cap, while the dashed straight line cuts right
over it. Toggling HARD block on the same endpoints should fail ("NO PATH") — demonstrating why the
soft global approach is needed.

## Investigation Trail

- **Iteration 1 (standalone canvas):** built a top-down 2D heatmap harness (`index.html`) with the
  real `coarseHeight`, global soft-penalty A*, and cost sliders. It rendered black in the user's
  browser with zero console errors (environment-specific canvas issue, never root-caused).
- **Iteration 2 (PIVOT → in-sim):** the user pointed out the sim already has freecam + lil-gui +
  spline debug viz, so a standalone harness reinvents infrastructure in 2D. Scrapped the canvas;
  built the prototype directly into `RoadSystem` as a non-destructive path (`updateProto`,
  `_protoAnchor`, `_protoConnect`) gated behind Roads → "Valley Trunk (proto)", streamed around the
  same view center as terrain. **Result: clear success** — cyan roads prefer valleys and wrap around
  mountains, and keep generating as you freecam. User-validated.
- **Iteration 3 (route quality):** user feedback — too many short zigzags, parallel duplicate roads,
  micro-jogs, self-intersections. Added: **turn-penalty A*** (state = cell+heading, `wTurn` per-45°)
  for true switchbacks / long straights; **bounded anchor gradient-descent** (≤0.45·spacing) to stop
  adjacent rows collapsing into the same valley; **segment dedupe**; **collinear-simplify** before
  splining; **debounced** slider re-route. Awaiting final tuning of `wTurn`.

## Results

**VALIDATED.** The valley-following architecture is the right model:
- Endless roads = deterministic chain of valley-snapped macro-anchors (256 m) connected by a
  soft-cost A* (altitude + grade dominated), streamed like terrain chunks. No global route, no
  length cap — directly answers "why limit the spline length?": you don't.
- Roads follow valleys and **wrap around** the big mountain instead of climbing it (the failure of
  the per-tile hard-block router).
- Seam continuity is free: each connection is one continuous polyline; consecutive connections share
  exact anchor endpoints (C0), so spike 002's per-tile slicing becomes trivial.

**User-tuned weights (now defaults):** wAlt 0.85, wGrade 400, wOver 8000, maxGrade 0.15, wTurn 200.

**Note:** `index.html` (the standalone canvas harness) is superseded by the in-sim prototype and kept
only as a record of the journey; the live experiment is in `src/road.js` (`updateProto` + helpers).

**Folds in spike 003** (lazy/deterministic/infinite): the streaming-anchor model already demonstrated
infinite deterministic generation, so 003 is effectively validated alongside 001.

### Route-quality iterations (all in-sim)
- Turn-penalty A* (`wTurn`, state = cell+heading) → true switchbacks / long straights. User pick **120**.
- Bounded anchor gradient-descent (≤0.45·spacing) + same-direction inter-road overlap suppression
  (spatial hash, run-based splitting) → no parallel/duplicate roads.
- Per-row continuous polyline + **proximity** loop removal (return within ~11 m after >38 m travel)
  → genuine single-road loops/folds removed; switchbacks preserved (legs > loop distance apart).

### Deferred tuning (user: "tune later, after generation actually works")
- Pathing reads a little **coarse** (10 m routing grid / spline sampling) — can refine cell size or
  post-smooth.
- A few **unnatural loop-backs** remain (proximity-remover thresholds / detour cost shaping).
Neither blocks the real build; they're polish once the road system is functional (queryable + sliced).
