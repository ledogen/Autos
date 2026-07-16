---
id: QUAL-19
type: quality
status: open
opened: 2026-07-15
severity: major
source: user-observation (seed 7 torn junction, freecam place-capture) + headless investigation
relates_to: QUAL-14 (corridor clearance + merge exemption — the system being refined), QUAL-11/13/16 (junction pads), FEAT-13 (graph road network), descope-overpasses branch (this surfaced while chasing seed-7 junction ugliness)
note: "Design chosen (Architecture A — directional/heading-gated exemption). Two alternatives (B two-tier
crossing rule, C reactive repair) recorded below for the record. NOT the corridor-merge-gap idea, which
was implemented and DISPROVEN (see impetus) — do not retry that lever."
---

# QUAL-19: Junction-approach legs cross each other — make the corridor-clearance exemption directional (heading-gated), not a fat positional ball

## Request

Near a graph junction, two road legs meeting at the shared node come too close in XZ and **cross**
(their ~10 m-wide ribbons overlap; with the natural grade difference of a mountain road, one visibly
runs *under* the other). Roads should **never cross except at the junction point itself**, while still
being allowed to *come together* to form the junction. Refine the min-separation exemption so it only
opens along a leg's legitimate converging approach, not everywhere within a fat radius of the node.

## Impetus (how we got here)

Chasing seed-7 road ugliness on the `descope-overpasses` branch, we worked down a chain of hypotheses,
each disproven with headless measurement before landing here:

1. **Not height reconciliation.** Junctions meet at a consistent grade (JUNCTION-AT-ROAD-GRADE gate
   green; rendered under-pass at the tear reconciles to ~1 m at the node). Legs *arriving* at different
   heights is natural, normal mountain-road behavior — not the bug.
2. **Not the junction pad size.** `roadJunctionCutback` only sizes the pad; it doesn't move where the
   leg is routed. The leg itself curves under the adjacent one.
3. **Not parallel hugging away from nodes.** Corridor clearance already prevents that everywhere except
   near junctions (verified: zero non-junction proximity violations on seed 7).
4. **The corridor-merge-gap lever was implemented and DISPROVEN.** Split the preventive-disc shared-node
   exemption from the cull's `roadCorridorExempt` into a tunable `roadCorridorMergeGap`, swept 80/50/40/
   30 → no effect: the overlap sits ~11 m from the node, *inside* the ~26 m disc-radius floor (a gap
   below that covers the shared anchor and walls the goal → escape-hatch thrash). Discs structurally
   cannot reach the near-node convergence. **Reverted.**

**Ground truth (freecam place-capture `Logs/rangersim-capture-1784180601364.json`, seed 7):** node
`-1,-3,0` at world (-354, -1894). Legs `g:-2,-4,0:-1,-3,0` and `g:0,-4,1:-1,-3,0` (both ending at the
node) come within **9.8 m in XZ** (ribbons touching, road width 10 m) at **11 m from the node**, with a
**12.4 m** design-grade height gap there — one ribbon over the other → the torn/crossing look.

**Why the current rule fails here (and only here):** the anti-crossing mechanism *is* the XZ proximity
rule (two distinct legs must stay ≥ D_self ≈ 18 m apart in XZ; keep centerlines that far apart and
ribbons can't overlap → can't cross; Y is deliberately ignored — confirmed XZ-only in `_cullClearancePass`,
`_corridorDiscsFor`, and the GRAPH-CORRIDOR-CLEARANCE gate). That rule is waived inside a **fat positional
ball** — `roadCorridorExempt` = 80 m radius around a shared node — so the barrier opens the instant a leg
is within 80 m of the node, in **every direction**. The tear at 11 m is deep inside that ball. The rule
succeeds for roads near *other* roads (no ball there); it fails *only* adjacent to junctions.

## Root cause

The junction merge exemption is the **wrong shape**. Convergence into a node has a signature — the leg is
*heading at the node*; a crossing leg is heading *across*. A radius-only exemption can't tell those apart,
so it opens the barrier for the crossing geometry too.

## Chosen design — Architecture A: directional (heading-gated) exemption

Replace the fat positional ball with a thin **per-leg radial corridor**. A point on a leg is exempt from a
sibling's clearance barrier only if **both**:

1. it is within the junction radius of the shared node, **and**
2. the leg's local heading there points at that node within an angle θ (start ~35°).

Everywhere a leg runs transverse-to / away-from the node (the crossing geometry) it is **not** exempt, so
the sibling barrier stays up and the router cannot cross it. Geometrically each incident leg becomes a
**spoke**: two spokes approaching a hub from different bearings coincide only *at the hub center*, never
before it — convergence still forms the junction, crossing is impossible by construction.

**Where it lives:** `road.js` `_corridorDiscsFor` — the disc-skip test near a shared anchor gains a heading
gate (skip a sibling disc only where that stretch is on its final radial approach to the shared node).
Preventive: the router routes it correctly on the first pass; no post-hoc repair. Keep the cull's
`roadCorridorExempt` (80 m) unchanged so converging intersection edges are still never *dropped* (per the
user: keep the intersection, just stop the crossing).

**Design decisions to settle during planning:**
- **Inner unconditional radius** (~road-width) around the node to handle the singularity where "bearing to
  node" is undefined as distance → 0 (the endpoints must be allowed to touch at N).
- **Which leg's heading gates the skip** — the sibling's (whose disc is being skipped) vs the routing
  edge's. Prototype both; the sibling-heading gate keeps the barrier up along a sibling's transverse
  portion, which is what stops the cross.
- **θ** as a new tunable ("Junction Approach Cone (°)" slider) — start ~35°, verify across seeds.
- Window-invariance + cache/worker parity: the gate must be a pure fn of the solo centerlines + node
  positions (same discipline as the existing exemption), so pre-warm and sync fallback stay byte-identical.

## Alternatives considered (recorded; not chosen)

- **B — two-tier rule (proximity soft/exemptable, crossing hard/never-exempt).** Keep the proximity
  exemption; add a *separate* rule the router never waives except within ~road-width of the node: a leg's
  centerline may not cross a sibling's centerline (segment-intersection rejection in the A* expansion).
  Most intent-exact ("roads never cross except at a junction"); allows arbitrarily tight convergence. Con:
  crossing-avoidance in a greedy A* is trickier than proximity discs; the node-gap boundary (permit touch,
  forbid a cross 5 m out) is fiddly; a second mechanism to maintain. **Fallback if A's cone proves finicky.**
- **C — reactive crossing-repair (post-route).** Detect shared-node leg pairs that cross before the node,
  re-route the lower-priority one via the existing self-clearance repair loop. Cheapest, reuses a proven
  harness. Con: reactive (full re-search per crossing → perf on bad junctions), fewest-violations fallback,
  patches rather than routes-right. **Stopgap only.**

## Acceptance

- [ ] No pair of legs sharing a node comes within road-width in XZ **outside** the radial approach cone
      (i.e. no crossing before the node) — headless metric over seeds 6/7/testig; the seed-7 node `-1,-3,0`
      (-354,-1894) tear pair specifically resolves (the 9.8 m-XZ-at-11 m-out overlap goes away).
- [ ] Junctions still FORM — incident legs still meet at the shared node; connectivity unchanged; the
      corridor cull still does not drop intersection edges (roadCorridorExempt path untouched).
- [ ] No regression in GRAPH-CORRIDOR-CLEARANCE / GRAPH-SELF-CLEARANCE / graph-cull-radius-invariance;
      no rise in escape-hatch fallbacks (the walling failure mode) — measure fallback count before/after.
- [ ] Window-invariant + cache/worker parity preserved (route-bundle-parity green; regenerate
      `data/route-cache-default.json.gz` if routing shifts — new `^road` param changes the sig).
- [ ] θ exposed as a live slider with a tooltip; default verified across seeds.

## Relationships

- **QUAL-14** (`project_qual14_route_clearance` memory) — the corridor clearance + 80 m merge exemption
  this refines. The exemption's anti-walling purpose (a sibling corridor near an edge's own goal walls it →
  escape-hatch thrash) is exactly why the cone must keep an inner unconditional radius.
- **descope-overpasses branch** (commit aaab73d) — overpasses were descoped in the same effort; that makes
  "no crossings, ever" the firm invariant this ticket enforces at junctions (there is no grade-separated
  escape valve any more).
- Memory: `project_descope_overpass_bug25_watch` (session record of the disproven levers), `project_capture_bridge_intent` (the place-capture tooling that pinned the node).
