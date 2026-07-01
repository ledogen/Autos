---
id: FEAT-21
type: feature
status: open
opened: 2026-06-30
severity: minor
source: split from FEAT-13 (graph network shipped 2026-06-30, e5ff1ef)
relates_to: FEAT-13 (road network graph — now the shipped default), FEAT-06 (prop scatter palette)
---

# FEAT-21: Points of interest scattered along road edges

## Context

FEAT-13's graph road network (blue-noise anchors + Urquhart graph) shipped as the default
(`roadNetworkMode: 'graph'`, commit e5ff1ef, 2026-06-30). The network reads as a sparse
forest-service graph — real T/X junctions, dead-end spurs, varied directions. One deferred
piece from that ticket was random POIs along edges (a scenic pullout, trailhead, ranger
station, viewpoint — something to give the network destinations, not just topology).

Dead-end spur thinning (the other FEAT-13 deferred item) is intentionally NOT part of this
ticket — kept separate, still deferred, no active plan.

## Request

Scatter POIs along road edges: deterministic/seeded placement (window-invariant, same
constraints as the rest of road-graph generation), sparse density, plausible siting (e.g.
near a dead-end spur terminus, a wide shoulder, or a scenic overlook by elevation/grade).

## Open questions (scope in plan mode when picked up)

- What is a POI concretely — a prop marker, a small pull-off pad + parking area, a
  driveable-to point, or just a visual/map marker with no gameplay hook yet?
- Placement rule: along edges generally, or biased to dead-ends / low-grade flat spots?
- Does this need new geometry (pad carve) or can it reuse existing junction-footprint /
  shoulder-widen machinery?
- Does the 2D map (`map2d`) need to render POIs too?

## Acceptance

- POIs appear along the graph road network at a believable sparse density.
- Window-invariant and deterministic (same seed/params → same POIs from any stream center).
- No regression on existing road-network gates.
