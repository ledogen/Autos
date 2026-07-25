---
id: QUAL-21
type: qual
status: closed
opened: 2026-07-23
severity: major
source: user-request (router perf + junction-complexity exploration, feature/router-perf worktree)
relates: [QUAL-16 (deg-2 connector), FEAT-13 (Urquhart graph), PERF-03/perf-worldgen (corridor heuristic), QUAL-14 (self-clear), PERF-24 (pad-resolve runtime cost)]
note: "Exploration ticket scoping TWO router improvements found while investigating why a cold map load
  is ~25s (M4 Air) / 60s+ (slow machines) and why junction/smoothing machinery is so heavy. Full
  analysis with measured profile: .planning/research/ROUTER-PERF-EXPLORATION.md and
  .planning/research/STROKE-ROUTING-DESIGN.md. NOT started — captured, exploration worktree torn down."
---

# QUAL-21: Router re-architecture — stroke routing + residual cold-load floor

## Stage 1 IMPLEMENTED (2026-07-25, feature/qual-21 — commits 97704b0 + 73dbf41) — awaiting A/B drive

Shipped behind `roadStrokeRouting` (default OFF, debug toggle in the road folder; flag-off routes
proven byte-identical via bundle-data compare; full suite 29/29 green). **Scope was cut back from
the locked all-degree maximal pairing to DEG-2 NODES ONLY, on measured evidence:**

1. **Rotated arrivals tear junction pads even when pairing is clean.** With all-degree pairing the
   shoulder-lateral-continuity gate went red on BOTH seeds — 1.67 m lateral step at a
   cleanly-paired deg-4 pad (seed 6 (1116,-171)): the pads' ruled blends + fillet ladder assume
   chord arrivals. Deg-3/4 absorption must land WITH the Stage 2 junction rework, not as a
   headings-only override. `throughPairsAt` (road-graph.js) is degree-general and ready for it.
2. **The crossing/clearance culls run POST-routing on routed geometry** — no pure spec-time
   pairing can see them (circularity). On the census band the crossing pass dropped 10 edges
   (degree pass 2, clearance 2); each drop at a paired leg leaves a mispaired node with a worse
   kink than today (65–108° measured) + a heading aimed at the culled ghost. Deg-2-only pairing
   is structurally CULL-SAFE (a cull can only turn the node into a dead-end stub, never a
   mispaired junction). The degree-cap pass IS pure topology and is faithfully simulated
   (road.js `_degreeCulledNbrsAt`, DEGREE SIM SYNC with `_cullDegreePass`).
3. **Census caveat**: the in-band census OVERSAMPLES cull-created deg-2 nodes (culls act only on
   registered edges): 10/14 measured nodes were cull-created (keep today's kinks + connector);
   at every covered node the prescribed kink is exactly 0.00°, with two ~9–11° first-chord
   readings that are pure hardR-Dubins endpoint curvature (G1, no tangent kink). The world at
   large is mostly raw deg-2 (44 raw vs ~10 cull-created per band).
4. **Flag-ON gate matrix 8/9 green**; one KNOWN MARGINAL: shoulder-lateral-continuity seed 6,
   0.543 m vs the 0.50 m rival-bank tier at (-917,-507) — a crossing-cull outcome FLIP (node
   deg 2→3, different edge survives) overlapping two corridors. BUG-25-class domino
   (headings → routes → crossings → cull decisions), deliberately not papered over.

**DRIVE VERDICT (user, 2026-07-25):** both toggles ON drive fine — Stage 1 A/B PASSED; n=3/4
junctions read the same as before (intended). Deg-2 elbow-pad fix (2da62fb) "fine, not great" —
ACCEPTED for now, polish later (Stage 2's post-cull pairing turns most of those elbows into
continuous through-roads anyway, so don't invest in pad aesthetics before then). Cull-created
deg-2 coverage + the seed-6 bank marginal are absorbed by the locked Stage 2 architecture
(topology settles before fine routing). Defaults remain OFF pending the default-on decision
(needs: bundle regen + resolving the two flag-ON gate marginals as default-config issues).

## STAGE 2 ARCHITECTURE (user-approved 2026-07-25) — settle topology coarse, fine-route ONCE

HARD CONSTRAINT: **routing cost must not increase; no full-network re-route, ever.** Routing is
the dominant cost in the codebase; the pipeline below reuses first-pass cycles everywhere.

1. **Coarse routing** (exists — the roadCorridorTwoPass coarse-lattice pass, ROUTE SYNC region).
   Modify: gentle-curves-only palette. The coarse palette is already `radii: [200, 35]`
   (road-carve.js ~line 908) — make the floor a first-class tuning point and TEST raising it
   (drop the 35 m entry / try [200, 50]): with the limited data a coarse router sees, it must
   not promise grade optimization (switchback-dense plans) the fine pass gets steered into.
2. **Cull on coarse** (new, cheap — SAVES routing): degree pass is pure topology (no geometry);
   crossing detection runs on the COARSE polylines (crossings are ~100 m excursions — coarse
   captures them). Doomed edges die BEFORE fine routing pays for them (today we fine-route
   10–14 edges/band just to delete them).
3. **Pair on the settled post-coarse-cull topology, then fine-route ONCE** with final paired
   headings + the existing corridor reuse. No second fine pass. Deletes the Stage-1 spec-time
   override AND the _nodeThroughPairs/_degreeCulledNbrsAt cull-prediction machinery (they exist
   only because pairing ran before culls). Whole chain is worker-runnable (coarse flood already
   lives in ROUTE SYNC) → prewarm delivers final routes directly.
4. **Junction repairs are LOCAL SPLICES, never searches**: where the fine-level cull backstop
   still fires (coarse/fine crossing disagreement) and orphans a pairing, cut the surviving
   route at the mouth (~cutback + goalBlend, last ~60 m) and re-emit an analytic Dubins terminal
   at the corrected heading — the goal-blend machinery already does exactly this. Anything still
   unpaired keeps the deg-2 elbow-pad fallback (2da62fb).

ENTRY CHECKPOINT before committing: measure the coarse-vs-fine crossing-agreement rate (route
one band both ways, count crossing-set disagreements) — it bounds how often stage 4 fires.
WATCH: moving the crossing decision to coarse inherits today's BUG-25 ring-scoped asymmetry.

**Stage 2 HARD REQUIREMENT (user decision 2026-07-25): PERF-25 folds in** — the reworked
junction surface must be cheaply evaluable per physics sample (or memoizable per node) under
positional jitter; parked-on-pad within ~1.5× of off-pad per-sample cost. Full context,
measurement, and acceptance harness: `perf-25-pad-resolve-parked-jitter.md` (do not work it
standalone; close it with Stage 2).

## Stage 2 Phase 0 RESULTS (2026-07-24) — ENTRY CHECKPOINT: cull-on-coarse FAILS its bar

Script: `test/stage2-crossing-agreement.mjs` (rainy-day; `--agreement-only` skips the slow
sections). Seeds 6 + 3, r1600, center (4500,600), both toggles ON. Measured per the plan
(`2026-07-25-qual21-stage2-plan.md` Phase 0), including the decoupled-weights tuning license
(palette sweep, goalHeading kept vs stripped, shared-node exemption radius sweep E∈{0,60,100,140}).

**Cold-build baseline (Phase 3 ceiling, 3×):** 11.8 / 12.3 / 12.3 s · routes 162 · searches 168 ·
repairs 6 · unclean 0. Baseline character: 50.5 km, 56 runs, straights>200 m 8.3%, bands
sweep/gentle/medium/hairpin 49.4/13.2/26.3/11.1%. Coarse forward route costs 3–4 ms/edge
(palette [200,35]) — affordability was never the problem.

**Crossing agreement — the bet does not survive measurement:**
- **Every fine crossing (7/7 across both seeds) is between edges SHARING a graph node, 0–39 m
  from that shared node** — sub-lattice micro-geometry (whether two legs converging into one
  node cross once just outside the pad), not the ~100 m corridor excursions the architecture
  assumed. Mid-span corridor-level disagreement is near zero (0–4 pairs) — the coarse pass
  agrees with fine WHERE IT CAN SEE; crossings live below its 24 m cell.
- Raw coarse detection: 13–38 crossings vs 6/1 fine — false positives are ~all near-node
  (seed 6 [200,35]: 26/26 near-node). Simulated crossing-pass outcomes: 8–25 WRONGLY
  early-culled edges per band to predict the 1–2 real drops. goalHeading-kept coarse routing
  (killing terminal wander) changes nothing material.
- The shared-node exemption (clearance-pass style, applied to coarse detection) trades catch
  DIRECTLY against false positives — same population, no operating point: best case (seed 6,
  [200,50]+gh, E=100) 83% catch with still 8 wrong drops vs 2 right; **seed 3's single fine
  crossing (0 m, shared) is caught by NO variant at NO radius (0% everywhere)**.
- Clearance pass on coarse is dead BY CONSTRUCTION: its proximity threshold D≈18 m is below
  the 24 m coarse lattice cell — coarse polylines cannot resolve it.
- The prize was small anyway: post-degree-pass, crossing+clearance drop only ~6 registered
  band edges (62→56, seed 6; crossing component 2, seed 3: 1) — the "10–14 fine-routed just
  to delete" figure is dominated by the DEGREE pass, which is pure topology and needs no
  coarse geometry at all.

**Heuristic-flood palette (second coarse consumer, full fine builds seed 6):** [200,50] and
[200] both CHANGE topology (kept 53, added 2–6, removed 3) with ~2–3 pt character shifts
(straights 8.3→9.8/10.2%). No quality win to buy — **the flood palette stays [200,35]**; with
cull-on-coarse dead there is no remaining consumer for a `roadCorridorRadii` param (not added).

**VERDICT / RECOMMENDATION (needs user sign-off — this deviates from the locked Phase 1):**
skip "cull on coarse". Keep the architecture's intent with the passes in their natural homes:
- The topology that pairing needs settled IS already settled spec-time: degree pass + QUAL-22
  cost-prune are pure topology (window-invariant, no routed geometry). Run pairing on THAT
  adjacency (still deletes _nodeThroughPairs/_degreeCulledNbrsAt — Phase 2 unchanged), then
  fine-route once with final headings (Phase 3 unchanged).
- Crossing/clearance culls stay POST-routing as the backstop they already are; the ~6
  drops/band orphan ~10 pairings/band (matches the Stage 1 census: 10/14 in-band deg-2s were
  cull-created) — **Phase 4's analytic Dubins splices absorb exactly these** (zero searches).
- Net vs the locked plan: no early-cull routing savings (was ~2 crossing-doomed edges/band —
  noise next to 162 routes), no wrongly-culled roads, no BUG-25 asymmetry inherited into a
  NEW pass, and Phases 2/3/4/5 (+PERF-25 exit criterion) proceed unchanged.

## Stage 2 Phase 5a IMPLEMENTED (2026-07-24, commits 7409a4c + 479dda8) — PERF-25 GREEN

**Two commits, PERF-25 exit bar met: jitter-on-pad 12 vs off-pad 8 µs/frame = 1.45× (baseline
142 µs / 11.6×; bar ≤ 1.5×).**

1. **`7409a4c` bit-exact resolver acceleration** (surface untouched, proven on 16k-pt sweeps ×
   2 seeds × both flags): `_resolveCellCands` per-8 m-cell candidate cache + flat segment tables,
   `_projectOntoRunRanges` windowed projection (bit-identity proof in its docblock),
   `_legProjWin` per-(node,leg) ruled-blend windows, alloc-free `Centerline._poseInto`.
   This alone: 142→50 µs (6.1×). **Measured dead end: no bit-exact approach can reach 1.5× —
   pad EXACT (100% memo hits) was already 33 vs 8 µs; the 6-evaluations-per-query structure
   (centre + 5-pt neighbourhood-MIN, each resolve + ruled blend) is the floor.**
2. **`479dda8` resolve-free node pad surface** (the handoff's per-node cached surface):
   `_nodeSurfaceTop(node,wx,wz)` = ONE `_carveDirtY` ruled-blend evaluation based on the node's
   own nearest leg branch (cached windows; feet shared with the leg cross-section via a per-leg
   exact-key single-slot memo) + the deg-2 connector composition. The 5-pt neighbourhood-MIN,
   `PAD_TOP_MIN_R`, and the PERF-24 exact-position resolve memo are DELETED — the min's crease
   duck armored against free-resolve tears (samples resolving onto unrelated runs), and the
   leg-pinned base kills that class at the source. Drawn plaza (`buildJunctionFootprint` ring
   path) rides the same function; deg-2 swept ribbon keeps `sampleRoadTopY` (its physics twin
   is the connector composition).
   - Surface deltas (48.9k-pt sweep over every junction neighbourhood): mean 5 cm (the removed
     slope-duck), >0.5 m at 88 pts confined to 3 deg-2 elbows + 1 deg-3 rim — all the removed
     duck/tear class (worst OLD value dove 4.1 m onto the wrong leg's grade at 683,-417).
     A/B screenshots at the worst nodes visually identical (worktree `abshots/`).
   - Gates: 23/23 affected green flag-off; flag-on the same 3 PRE-EXISTING known marginals
     (seed-6 shoulder marginal IMPROVES 0.543→0.510; route-bundle-parity stale-by-design;
     graph-topology 8/10). Replay 1784909578369 mark values unchanged (its 3.9 mm game-vs-
     replay gradeY gap pre-exists the phase — capture env artifact). Jitter delta 0.07 mm.

**Rotated-arrival tear RE-MEASURED on the new surface (experiment, reverted):** all-degree
pairing (`nbrs.size >= 2` at `_nodeThroughPairs`) still fails shoulder-lateral-continuity —
1.94 m at the SAME deg-4 pad (1116,-171) (was 1.67 m pre-rework) + 1.75 m at seed-7 (256,173).
The tear is STRUCTURAL in the pad machinery (ring weld / rim overlays / camber at rotated
mouths), not the removed free-resolve class ⇒ Phase 5a-2's canonical-shapes + rotated-arrival
weld design remains required before the deg-3/4 flip.

## Phase 5 COMPLETE except drive + default-on (2026-07-25, commits d9c5035 + 6a3c525)

**5a-2 + 5b-2 flip (`d9c5035`): deg-3/4 through-pairing behind a 30° admission.** Maximal
pairing tears pads two ways (both measured on the 5a surface): forced high-deviation pairs
make the router absorb the rotation as hardR terminal S-curls → (a) bimodal projection zones
past the junction blend's radial fade (1.9 m step), (b) re-routes into near-self-approaches
beyond the rival cross-fade band (3.6–10.9 m cliffs, seed-7, dev 30–35°). With
`PAIR_MAX_DEV_DEG = 30` (throughPairsAt's existing maxDevDeg): shoulder gate GREEN both seeds
(seed 6 worst 0.510→0.066 m!), graph-topology green (was 8/10), coverage 3/5 deg-3 + 2/2
deg-4 paired, census kinks unchanged, cold census build 13.8→12.9 s. The canonical shapes
EMERGE from the admission (through + T-branch / through × through). road-fill-support's
STEP_TOL now models the saturating-camber edge-drop term (its deepest-fill sample landed on a
−15° cambered curve after the re-routes; support/up-step checks were green throughout).

**5b-1 (`6a3c525`): DECIDED — chord admission stays; connector deletion off the table.** A
true-analytic-tangent admission was implemented and measured to fail BOTH ways (drops
S-joint/corridor-weld benches covering real camber seams — 0.875 m knife-edge; newly admits
benches that flatten banked sweepers). The first-chord kink accidentally measures heading +
near-node curvature/camber activity = the better "does a bench help" detector. Deletion moot:
6/12 census deg-2 nodes are cull-created with real kinks up to 89.5°. Decision inline at the
admission in _detectNodeJunctions.

**Full matrix:** flag-off `test:all` 40/40 green (routes byte-untouched — pairing is
flag-gated); flag-on 39/40, sole failure route-bundle-parity (stale-by-design until the
default-on bundle regen). A/B screenshots: worktree `abshots/` (pairoff_/pairon_ pairs).

REMAINING: user drive sign-off (toggles ON) → default-on as its OWN step (regen
`data/route-cache-default.json.gz`, re-baseline the flag-on gates, flip
`roadStrokeRouting: true` default) → merge to main.

## Stage 2 Phases 2+4 IMPLEMENTED (2026-07-24, commits 1da347f + c7fbe38) — user approved skip-Phase-1

**Phase 2 (flag-independent, byte-stable):** one canonical `_degreeDropSet` (extracted verbatim
from `_cullDegreePass` phases 1+2) applies the degree-cap at `_assembleGraphEdges` — BEFORE
routing. Doomed edges never route/register; the three warm paths skip them; `_cullNetwork` keeps
only the geometry passes (ring excludes degree drops; detour adjacency stays pristine-static);
`_nodeThroughPairs` pairs over the same settled decisions. `_degreeCulledNbrsAt` (the DEGREE SIM
SYNC hand-mirror) DELETED. Measured: routes 162→153, searches 168→159, cold build 11.8→11.2 s
(~5%), character byte-identical, route-bundle-parity green.

**Phase 4 (flag-gated `roadStrokeRouting`):** `_spliceOrphanedPairs` — post-cull, at nodes whose
surviving degree is 2, each survivor's terminal (goalBlend of whole primitives) is re-emitted as
an analytic Dubins run into the node at the corrected through heading (chord between far
endpoints — the `_throughHeadingAt` formula, survivors as partners). Zero searches. Descending-
rho ladder [80,50,30,hardR] + a 2×-cut retry tier: a through-road bends at the node as gently as
the freed span allows (hardR-only splices read ~23° on the connector's chord proxy; the ladder
lands ≤13°). Ribbon weld reads per-entry `spliceLeaveA/B` overrides. `dubinsPrimitives`
re-exported OUTSIDE the ROUTE SYNC region (worker mirror + sync gate untouched). Route caches
(`_proto.cls`) never touched — the splice decorates only registered entries; deterministic per
re-stream, inherits the cull's ring-scoped asymmetry (BUG-25 WATCH class, same as the elbow pad).

**Census after (seed 6, r1600):** cull-created deg-2 measured kink p50 37.7°→5.2°, max
75.2°→13.2°; 11/14 under the 9° connector admission (was 2/14). The 3 residuals are the
PRE-EXISTING chord-proxy overshoot (true tangent kink ≈0 — router hardR terminals read ~11-13°
on first-chord; the same class Stage 1 documented at raw paired nodes). Fixing THAT class =
Phase 5 (junction rework / admission on true tangents), not more splicing. Cold build flag-on
13.6→13.8 s (splice rebuild cost ~0.2 s). All 27 affected gates green (serial), both flag
states.

**Diagnostic note:** stroke-spike §(2) band-graph stroke-chain invariance now reports frontier
split mismatches under the maximal-default `formStrokes` rules (B-only stroke + 3 TERMINAL
flips). DIAGNOSTIC-ONLY: the shipped pairing is per-node/node-centred (window-invariant — both
invariance gates green); formStrokes chains are not a product artifact. Ignore unless Stage 2
later routes whole strokes.

**Phase 4 A/B: USER PASSED (2026-07-24)** — 6-node screenshot pairs (toggles off/on), verdict
"they all look totally fine"; visible topology diffs attributed to cost-prune degree changes,
not junction character. PERF-25 harness landed (ac2904e): parked-pad jitter 142 vs off-pad 13
µs/frame = **10.8× (exit bar ≤1.5×)** — the Phase 5 baseline.

**Remaining = Phase 5**, staged in
`.planning/handoffs/2026-07-24-qual21-stage2-phase5-plan.md` (survey pointers, design
direction, exit criteria, commit boundaries): per-node cached pad surface (PERF-25), two
canonical shapes with rotated arrivals, admission-on-true-tangents → connector deletion,
deg-3/4 flip; then full `test:all` both flag states, user drive, default-on as its own step.

## Stage 0 RESULTS (2026-07-23, commit bf25e79) — read-only spike DONE

`formStrokes` (pure, src/road-graph.js) + `test/stroke-spike.mjs` (rainy-day script). User-approved
rules: deg-2 ALWAYS continues; deg-≥3 through-pair = bearing + grade continuity + ambiguity veto;
bounded out-of-window routing OK. Measured (seed 6, r1600, defaults dev≤40°/gradeJump 0.08):

- **Window-invariance HOLDS** (the make-or-break): whole strokes 9/9 identical across two centers,
  per-node pass-through pairings 11/11. Formation is safe to build Stage 1 on.
- **deg-2 folding works**: 35/44 (80%) deg-2 nodes fold — the connector-deletion claim is real. The
  9 unfolded are stroke split/frontier endpoints → **Stage 1 must prescribe a canonical shared
  terminal HEADING at split nodes or the kink (and connector) survives exactly there.** Folded bend
  angles p50 42° / max 111° — one continuous κ²-priced curve absorbs them.
- **The graph is junction-dominated** (122/175 nodes deg-≥3; only 44 deg-2), so whole-map fold is
  modest: ×1.30 (defaults) → ×1.50 (dev≤85°, gradeJump 0.15); junctions gaining a through-road
  18% → 38% over the same sweep. gradeJump is the dominant lever (mountain legs dive); the
  ambiguity margin barely binds (symmetric Ys already fail the bearing test).
- **Self-clear baseline** (scStats hook, ROUTE SYNC region + worker mirror): 140 routes,
  158 searches, **18 repair re-searches (11%)**, 0 unclean-accepted. Task B's target number.

Honest read: quality/deletion case (deg-2 connector + per-sample pad resolve) fully intact;
junction-simplification applies to a quarter-to-third of junctions (threshold-dependent, user's
aesthetic call at Stage 1 A/B); search-count perf bonus modest (244→187 at defaults). Awaiting
Stage 1 sign-off + threshold choice (dev/gradeJump are aesthetics, drivable via A/B).

## PLAN PIVOT (2026-07-24, user decision) — MAXIMAL PAIRING replaces thresholds

The 18–38% junction-coverage ceiling was a consequence of thresholded through-pair admission. User
direction: **every node pairs maximally** — deg-2 pass-through, deg-3 through + T-branch, deg-4 two
crossing through-roads. No thresholds/vetoes/escape hatches. Junction machinery then only ever
handles TWO canonical shapes; through-coverage is 100% by construction. Locked sub-decisions
(full rationale in STROKE-ROUTING-DESIGN.md §7): pair score = bearing deviation + grade penalty
(grade picks WHICH pair, never whether); κ²-only for bend sharpness (no stroke min-radius param);
deg-4 node height = AVERAGE of the two strokes' designs (deg-3: through-stroke owns). Residuals
that survive: pad pavement/blend at branches, mid-span crossing detector, BUG-25 cull.
Stage 1 pre-step: re-run the spike with maximal pairing to record bend-angle distributions
(deg-3, worst-of-two at deg-4) + fold + invariance before touching routing.

Two related tasks under one ticket. Both live in the router/graph subsystem and share the same
investigation. Detailed design + measured evidence: **`.planning/research/STROKE-ROUTING-DESIGN.md`**
and **`.planning/research/ROUTER-PERF-EXPLORATION.md`** (measured cold-load profile, the character
contract that must survive, and why the search-speed lever is already spent).

## Context (measured, don't re-derive)

- Cold road build ≈ 5–7 s headless (bench-worldgen.mjs), **~75%+ of it inside `arcPrimitiveConnect`**
  (per-connection A*). Terrain carve/mesh is a distant second (~0.19 s ring).
- **The coarse cost-to-go heuristic is ALREADY SHIPPED** (`roadCorridorMode:'heuristic'`, ×2.5–3.2,
  user-approved 2026-07-17). `hScale` is tuned; cheapening the coarse pass is a proven regression; the
  tube variant was reverted for character damage. **There is no cheap search-speed win left.**
- Junction/smoothing machinery is **~3,200 lines / ~40 functions vs ~600 lines of routing search
  (5:1)**, and roughly half is an artifact of routing each Urquhart edge INDEPENDENTLY (standalone
  grade, no shared-node tangent/height compatibility) then reconciling afterward.

## Task A — Stroke routing (quality-first re-architecture)  ·  PRIMARY

Route **strokes** (maximal through-chains) as one continuous curvature-bounded curve instead of atomic
edges, then split back into per-edge runs `g:<idA>:<idB>` so downstream carve/mesh/gates are unchanged —
but the two edges at a pass-through node now share an exact tangent + one grade (no kink, no connector).

- **Deletes (HIGH confidence): the deg-2 connector subsystem** (~490 lines: `_buildDeg2ArcGeom`,
  `_connectorCarve`, `_buildDeg2Ribbon`, `_deg2ArcTiles`, deg-2 carve-compose branch, `roadJunctionKinkDeg`
  admission).
- **Simplifies (MEDIUM): degree ≥3 junctions** — the straightest two legs become a continuous
  through-stroke; only branches T in, so the fillet ladder + pad-plane height fit shrink.
- **NOT claimed**: the mid-span crossing detector (~350 lines) and BUG-25 cull (~260 lines) likely
  survive — strokes are still a shared-node windowed structure. (First-pass memo overstated this.)
- **Perf bonus (secondary, honest)**: fewer/longer searches; deletes per-sample `_junctionPadCarve` /
  deg-2 resolve from the runtime carve path (cf. PERF-24); and MAY cut the self-clear repair count
  (Task B's floor) because a continuous stroke self-overlaps far less than independent crossing edges.

### The make-or-break constraint
**Window-invariance** (`test/graph-topology.mjs` D-16). Stroke topology must be a pure function of the
graph (site positions + Urquhart edges, NOT routed geometry or window); strokes routed from canonical
terminal anchors via the pure `_coarseH` sampler; bounded extent with a graph-canonical split so we
never route the whole map. If stroke formation isn't cleanly window-invariant, Task A is in trouble —
which is why it starts with a read-only spike (below).

### Staged rollout (sign-off between stages)
0. **Read-only stroke spike** (no routing change): form strokes from the current graph; report #strokes,
   length distribution, #deg-2 pass-throughs folded, #junctions simplified, a **two-window invariance
   check**, and a self-clear-repair baseline. Proves the win is real + invariant BEFORE touching routing.
1. Stroke-continuous routing behind `roadStrokeRouting` flag (default off); split back to per-edge runs
   with matched tangents + one grade; all gates green with flag ON; A/B drive.
2. Delete the deg-2 connector once Stage 1 is drive-approved; simplify the degree-≥3 path.
3. Measure whether the crossing detector / BUG-25 became removable (only then touch them).

## Task B — Residual router cold-load floor (perf)  ·  SECONDARY

Now that the corridor heuristic is shipped, the documented remaining ~42 ms/edge floor is the
**self-clearance scan + repair re-search** (`.planning/perf/FINDINGS.md:188-198`): the worst mountain
edges re-run the whole search up to 16× (`SELF_CLEAR_MAX_REPAIR`). Un-shipped lever noted there: an
**incremental ancestor-proximity index** for `_selfClearScan` so repairs don't re-scan from scratch.

- Small, contained, orthogonal to Task A — but Task A may **moot or shrink** it (continuous strokes →
  fewer self-clear conflicts → fewer repairs). **Sequence after Task A Stage 0** so we know whether it's
  still worth doing.
- Do NOT cheapen the coarse corridor pass (proven regression).

## Acceptance

- **Task A**: deg-2 connector subsystem removed; junction path simpler; full `test:all` green
  (esp. `graph-topology` window-invariance, `centerline-curvature`, `road-smoothness`,
  `shoulder-lateral-continuity`, `carve-mesh-smoothness`, `road-tunnel`); road character unchanged in a
  user drive (windiness/valley-hug/switchbacks preserved — it's a user-eyeball target, not fully gated).
- **Task B**: cold-load self-clear repair count measurably down with no route/character change (gates
  byte-stable), OR closed as mooted by Task A.
- The character contract in `ROUTER-PERF-EXPLORATION.md §2` holds throughout (honest-grade EMA pricing,
  wAlt/grade²/soft-cap/κ²/wDev, grade-yields-before-radius, exact curvature-bounded centerline, Urquhart
  cycles, determinism/window-invariance, intentional switchbacks, camber↔curvature, mesh==collision).

## Do-not-repeat (from the history vet)
Coarse cost-to-go heuristic (shipped), hard tube corridor (reverted, character damage), cheapening the
coarse pass (net regression), wHeur inflation (dead — field replaced it), dendritic/forest topology,
perturbed-grid anchors, hard grade block, 2-D-blur grade pricing, re-interpolated centerline.

## CLOSED (2026-07-25) — IMPLEMENTED, A/B-REJECTED ON DRIVE FEEL, DELETED

The full Stage 1 + Stage 2 pipeline was implemented, gated green (final matrix: flag-off
test:all 40/40; flag-on 39/40 with only the stale-by-design bundle gate), and A/B-driven.
**User verdict: flag-on roads are worse — "the coarse router clearly prefers big long curves
which make it wiggle constantly, very unsure of itself … crunchy."** The mechanism matches the
Phase-5 diagnostics: prescribed through-headings force the router to absorb rotations as
terminal maneuvering (hardR S-curls), and taming that curvature would be router work spent
fixing a problem the feature itself introduces — while toggles-off intersections already read
fine (the flag-independent junction work below is what fixed them).

**All stroke-routing machinery DELETED** per the no-dead-code convention (this ticket + git
history hold the story): `roadStrokeRouting` param/toggle/tooltip, `_nodeThroughPairs` +
`_throughHeadingAt` + `PAIR_MAX_DEV_DEG`, `_edgeLeaveHeading` (callers back on
`_edgeTerminalHeading`), `_spliceOrphanedPairs` + `_spliceRunTerminal` + `spliceLeaveA/B`,
`throughPairsAt` + `formStrokes` (road-graph.js), the road-carve `dubinsPrimitives` re-export,
`test/stroke-spike.mjs`, `test/stage2-crossing-agreement.mjs`. Route bundle regenerated
(routes byte-identical; only the param-set signature changed). Full suite 40/40 green.

**KEPT (flag-independent wins, merged to main):**
- PERF-25 fix: bit-exact resolver acceleration (`_resolveCellCands`/`_projectOntoRunRanges`/
  `_legProjWin`/`Centerline._poseInto`) + the resolve-free `_nodeSurfaceTop` pad surface
  (5-pt neighbourhood-MIN + PERF-24 memo deleted). Parked-pad 227→19 µs/frame.
- Stage 2 Phase 2: spec-time `_degreeDropSet` (doomed edges never route; the Stage-1 degree
  simulation deleted).
- Deg-2 elbow admission fix (2da62fb, no upper kink cap) + the QUAL-16 connector, which stays
  load-bearing (real cull-created elbows) — the 5b-1 finding that the first-chord admission is
  the right seam detector is recorded inline at `_detectNodeJunctions`.
- road-fill-support STEP_TOL models the saturating-camber edge-drop term.

Key negative findings for future road work (do NOT re-learn): maximal all-degree pairing
DISPROVEN twice (pad tears + self-approach cliffs); a 30° deviation admission makes gates
green but the drive feel stays wiggly — the objection is to prescribed headings as such;
true-tangent connector admission DISPROVEN both ways (drops seam benches / adds
bank-flattening benches); cull-on-coarse DISPROVEN (Phase 0).
