# QUAL-21 Stage 1 — strokes classify & absorb intersection types (EXECUTION PLAN)

Handoff 2026-07-24. Planning is DONE (design: `.planning/research/STROKE-ROUTING-DESIGN.md`,
esp. **§0 REVISED MECHANISM** + §7 locked decisions; Stage 0 results in the QUAL-21 ticket).
This file is the self-contained implementation plan — execute top to bottom.
(The related-but-separate topology idea is its own ticket: QUAL-22 terrain-cost Urquhart pruning.
It is NOT part of this plan.)

## Context — what Stage 1 does and why

Today every Urquhart edge routes independently and ~3,200 lines of junction machinery reconcile
the mismatched arrivals afterward. Stage 1 makes intersections **classified and absorbed at
route time** via maximal pairing:

| node degree | classification | result |
|---|---|---|
| 2 | ABSORBED — road continues through | no kink → deg-2 connector no-ops (Stage 2 deletes it) |
| 3 | through-road + T-branch | fillet ladder's only case: stem meets a smooth road |
| 4 | two crossing through-roads | the only other case: through×through crossing |

Key mechanism fact (found in zoom-out, verified in code): edges ALREADY route with prescribed
terminal headings — `startHeading`/`goalHeading` in `_routeOptsBetween` (src/road.js:2252-2253),
honored analytically by the Dubins terminal — and both are just the edge's own chord bearing.
The deg-2 kink is a DATA disagreement, not architecture. **Stage 1 = make the paired edges at a
node prescribe the SAME canonical heading.** No stroke-unit routing, no chained searches, no
out-of-window routing, no maxLen splits, no stroke-level grade pass, no ROUTE SYNC / worker
edits. Per-edge routing, caches, worker prewarm, and window-invariance are untouched.

Locked decisions (design doc §7): maximal pairing, no thresholds/vetoes/escape hatches; pair
score = bearing deviation + grade penalty (grade picks WHICH pair, never whether); κ²-only for
bend sharpness (no min-radius param); node heights keep riding the existing junction blend.

## Implementation

### 1. Pairing core — src/road-graph.js
- New pure export `throughPairsAt(node, legs, opts)` (~30 lines): `node = {x,z,h}`,
  `legs = [{key,x,z,h}]` (neighbour sites, h in metres = coarseH × terrainAmplitude).
  Greedy best-score-first over all leg pairs while ≥2 legs remain unpaired;
  `score = bearingDeviationDeg + (opts.gradePenaltyDegPerSlope ?? 100) · |slopeIn − slopeOut|`
  (slopes per leg chord). Deterministic lexicographic tie-breaks on leg keys (copy the Stage 0
  `cand.sort` pattern in `formStrokes`). Returns pairs as `[ [keyA,keyB], ... ]`.
- Refactor `formStrokes` to delegate its per-node pairing to `throughPairsAt` (thresholded opts
  become experiment-only knobs; defaults = maximal). Chain/loop/split machinery stays for the
  spike, which is its only consumer now.

### 2. Heading override — src/road.js
- `_throughHeadingAt(nodeId, otherId)` (new, memoized per `_networkRev` like `_edgeDeps`):
  build the node's alive-neighbour legs from an EDGE-CENTRED `_buildUrquhart` neighbourhood
  (persist=false — same window-invariance trick as `_edgeDeps`, road.js:2337; do NOT use the
  streaming band graph or the heading becomes window-dependent). Heights via
  `_coarseH(x,z) × (params.terrainAmplitude ?? 1)`. Run `throughPairsAt`; if the leg toward
  `otherId` is paired with neighbour P → return `atan2(other.z − P.z, other.x − P.x)` (bearing
  P→other, the through chord, oriented as LEAVE-toward-other). Unpaired (branch) → null.
- In `_routeOptsBetween` (road.js:2252-2253), when `params.roadStrokeRouting`:
  `startHeading = _throughHeadingAt(c1, c2) ?? today's chord bearing` and
  `goalHeading = (_throughHeadingAt(c2, c1) ?? chord) + π` — preserving the existing
  arrival-direction `+π` convention exactly (see the comment block there).
- The heading rides the route spec, and `_edgeRouteSpec` is the single source for BOTH the
  worker prewarm and the sync fallback — so worker/sync parity is free. Verify nothing else
  derives terminal headings independently (grep `_edgeTerminalHeading` call sites; the ribbon
  weld target mentioned in its header comment must follow the same override or welds shift —
  if a call site exists outside the route spec, thread the same `?? chord` override through it).

### 3. Param + housekeeping
- `roadStrokeRouting: false` in data/ranger.js (documented comment block, QUAL-21 tag).
- Debug-menu toggle in the road folder (src/debug.js) wired like other re-route params
  (onRoadParamChange → invalidate). [feedback: end-of-phase slider audit]
- routeCacheSig: confirm adding the key with value `false` does not change the sig of the baked
  default bundle (check how the sig serializes road* params — if it enumerates keys, regen
  `data/route-cache-default.json.gz` in the same commit; if it reads values with defaults, OFF
  is a no-op).

### 4. What is NOT touched
Carve, mesh, pads, junction blend, deg-2 connector code (roadJunctionKinkDeg 9 admission,
road.js:4055 — it no-ops naturally when the kink < 9°), crossing detector, BUG-25 cull,
ROUTE SYNC region, road-worker.js. Deletion happens in Stage 2 after the drive sign-off.

## Verification

1. **Flag OFF**: `npm test` byte-stable (no route changes — the override must be strictly gated).
2. **Flag ON, headless**: run the road gates with `{...RANGER_PARAMS, roadStrokeRouting:true}`
   (scratch runner per gate if no param hook): `graph-topology` (D-16 two-center invariance),
   `centerline-curvature`, `road-minradius`, `road-smoothness`, `shoulder-lateral-continuity`,
   `carve-mesh-smoothness`, `road-tunnel`, `windiness-metrics`, `road-character`.
3. **Kink census** (extend test/stroke-spike.mjs): with flag ON, measure per-deg-2-node heading
   kink between the two registered runs — expect ≈100% under the 9° connector admission (i.e.
   connector no-ops network-wide). Also report worst through-pair bend at deg-3/4 (the
   maximal-pairing risk metric) + self-clear repairs vs the 18/158 Stage 0 baseline (scStats).
4. **A/B drive** (user): toggle in debug menu; judge through-road feel, tight radii, junction
   look. USER SIGN-OFF HERE gates Stage 2 (delete deg-2 connector, collapse fillet ladder to
   the two canonical shapes).

## Commit boundaries
(1) pairing core + spike update, gates green flag-off · (2) heading override + param + toggle,
gates green both ways + kink census numbers in the commit message.
