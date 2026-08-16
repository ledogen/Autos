---
id: FEAT-21
type: feature
status: completed
opened: 2026-06-30
closed: 2026-08-15
severity: minor
source: split from FEAT-13 (graph network shipped 2026-06-30, e5ff1ef)
relates_to: FEAT-46 (story-mode POI pads — superseded this), FEAT-13 (road network graph — now the shipped default), FEAT-06 (prop scatter palette)
---

# FEAT-21: Points of interest scattered along road edges

## Resolution (2026-08-15) — closed as SUPERSEDED by FEAT-46

Closing per FEAT-46's own instruction ("on landing FEAT-46, close FEAT-21 as superseded, or retain
it only for the *variety* pass"). **The variety pass has since landed too**, so nothing is left to
retain.

The POI system is `src/poi.js` (`PoiSystem`, `POI_PARAMS`, `POI_ROSTER`). Every acceptance line here
is met, and by a better design than this ticket sketched:

- **Placement** — POIs sit at arbitrary `(edge, arcS)` points with their own carved lay-by pads, not
  at graph nodes. That ruling (DESIGN.md, 2026-07-20) is strictly better than this ticket's "biased
  to dead-ends" guess: nodes are a ~640 m routing artifact, and a place is no likelier at a T.
- **Determinism / window-invariance** — held, and hardened beyond what was asked: POIs must not
  influence routing determinism at all (owner, 2026-07-28).
- **"What is a POI concretely?"** — answered by the roster, not left open: 9 typed places
  (momsHouse, larrysHouse, gasStation ×2, serviceShop ×2, burgerJoint, generalStore, tackleShop,
  missionGiver ×5 → `POI_COUNT` 14 per region), each with a model slot, a `jobs` flag, a siting rule
  (`nearSpawn` / `coverage` / `any`), and tags. They are driveable-to mission sources, not markers.
- **Map rendering** — yes, `src/map2d.js` renders them.
- **Framing correction** — this ticket predates the free-roam / story-mode split; its free-roam
  framing was an artifact, not intent (owner, 2026-07-28). POIs are story mode only; free roam
  builds no pads.

**Not closed by this, and deliberately still separate:** FEAT-13's *other* deferred item, dead-end
spur thinning. It was never part of this ticket and remains deferred with no active plan.

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
