---
id: QUAL-22
type: qual
status: open
opened: 2026-07-24
severity: minor
source: user-approved shelf idea from the QUAL-21 zoom-out (router/topology review)
relates: [FEAT-13 (Urquhart graph), QUAL-21 (stroke routing), FEAT-28 (region gating)]
note: "Topology-level terrain character: make the GRAPH emerge from cost, not just the routes.
  Deliberately NOT a QUAL-21 rider — it re-shapes the whole network. Do after QUAL-21 lands."
---

# QUAL-22: Terrain-cost Urquhart pruning — topology from cost

## Idea

`urquhartEdges` (src/road-graph.js) prunes each Delaunay triangle's longest edge by **Euclidean
length** — the topology is terrain-blind even though routing is not. Prune the most-**EXPENSIVE**
edge instead: cost = a cheap line integral of the coarse height field along the chord (climb +
altitude terms sampled at a fixed step — pure fn of (seed, site positions, params), deterministic,
window-invariant).

Roads then *connect* where connecting is cheap: valley-to-valley links survive, mountain crossings
emerge only where no cheaper triangle edge exists — terrain character at the topology level, fully
emergent from the cost model (feedback: emergent-over-injected).

## Why it's sound

- **Connectivity survives**: Urquhart ⊇ MST holds per weight function — removing each triangle's
  max-weight edge under the SAME weight keeps the MST for that weight ⇒ still connected by
  construction, still cycles for route choice.
- **Window-invariance**: the weight is a pure chord integral of the world-fixed coarse field; the
  Delaunay is unchanged; only the pruning vote changes → same invariance argument as today
  (graph-topology gate D-16 must stay green).

## Blast radius (why it waits for QUAL-21)

Re-shapes the entire network: route-bundle regen (seed 6 bake), reachability re-baseline
(graph-topology / cull invariance gates), windiness/character metrics shift, full feel pass/drive.
Also interacts with FEAT-28 region gating (component shapes change).

## Acceptance

- Chord-cost weight in `urquhartEdges` (param-gated, e.g. `roadGraphCostPrune`, default off until
  drive-approved; flipping it re-keys routeCacheSig + bundle).
- All graph/cull/invariance gates green with the flag on; connectivity (orphans 0, one dominant
  component) preserved across ≥2 seeds.
- A/B drive: visibly fewer absurd mountain-crossing edges, no island regressions; user sign-off
  before default-on + bundle regen.
