---
id: QUAL-15
type: quality
status: pending
severity: minor
---

# QUAL-15: Mountain-crossing edges take near-worst passes (no pass-seeking; graph is terrain-blind)

User report 2026-07-06 ("definitely still some blind spots as far as routing") with place capture
`Logs/rangersim-capture-1783322161474.json`: seed `pinto` (187972457), edge `[0,-1,1]→[0,0,1]`,
a road switchbacks up over a ~280 m summit with no node up there.

## Measured facts (scratchpad probe-pinto.mjs pattern)

- Anchors: a=(537,−122) h=171.5, b=(19,129) h=136.4, chord 576 m. Straight chord's terrain max:
  251.5 m — the nodes straddle a massif, so SOME crossing is mandatory (Urquhart graph is 2-D
  proximity only; terrain never enters edge selection).
- Bowed-path lateral scan: a ~218 m pass exists ≈400 m to one side (offsets −150…−400 all ≤229 m);
  the shipped route crosses at 280.1 m — essentially the WORST line, 60 m above the best pass.
- Ablation: identical 992 m route with corridor discs off, self-clearance off, ALL discs off —
  **this is the bare pre-QUAL-14 cost model, not the clearance machinery.**

## Root causes

1. Graph edges are terrain-blind: Urquhart over blue-noise sites connects nodes across a massif
   as readily as across a valley. Connectivity then MANDATES a crossing route.
2. No pass-seeking in the router: the altitude term prices height against the CHORD baseline
   (valley reward capped at valleyDepthCap), so a lower pass 400 m off-axis earns no credit that
   outweighs wDist + the wHeur=1.5 inflated heuristic's beeline greed. Lateral exploration is
   exactly what weighted A* suppresses.

## Candidate directions (emergent-lens: fix the cost model / graph, don't inject geometry)

- Graph level: keep Urquhart ⊇ MST connectivity, but for NON-MST edges compute a cheap barrier
  estimate (max coarse height along chord − max anchor height); drop or de-prioritize edges whose
  barrier exceeds a threshold when the MST already connects the pair within k hops. Kills
  "gratuitous" summit roads while keeping mandatory passes.
- Router level: pass-aware baseline — e.g. baseline uses the minimum-barrier corridor rather than
  the straight chord, or lower wHeur for edges whose chord barrier is large (explore laterally
  exactly where it pays).
- Tuning level first: probe wHeur 1.2 / higher roadGraphWAlt on the pinto edge before any code.

## Acceptance

- Pinto edge crosses ≤ ~230 m (near the measured best pass) or is dropped by the graph-level rule
  with connectivity preserved (REACHABILITY not worse).
- road-character (straights/rhythm/switchbacks) and graph-topology gates hold on seeds 6/7/pinto.
