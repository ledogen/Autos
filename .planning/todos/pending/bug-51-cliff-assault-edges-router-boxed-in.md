---
id: BUG-51
type: bug
status: open
severity: major
opened: 2026-08-17
source: measured while diagnosing seed 20's spawn-region road (user report: "a crazy road right at the start")
relates: BUG-47, FEAT-28, FEAT-40, QUAL-19, PERF-03
---

# BUG-51: an Urquhart edge across a cliff is built as a 118% road, because the router is boxed in and nothing can veto the edge

## The measurement

Seed 20, spawn region. Edge `g:0,-1,2:-1,0,2`, 1134 m, is the road the player spawns on
(`queryNearest` puts the truck at arcS ≈ 40). Its first 250 m:

```
  arc |  raw terrain  |  shipped DECK       deck − raw
    0 |  117 m    0%  |   137 m    0%          +20 m
   48 |  140 m  117%  |   162 m   72%          +22 m
  120 |  280 m  254%  |   213 m    9%          −67 m
  160 |  191 m -192%  |   194 m  -80%           +3 m
  300 |  153 m  -19%  |   155 m   -8%           +2 m
```

Raw terrain reaches **254% grade** — 165 m of relief in 120 m horizontal. The deck carries **118%**,
floats **+27 m** on fill and trenches **−67 m**. Past arc ≈ 300 the same run is ordinary road (≤16%)
for its remaining 900 m. So the pathology is one ridge crossing, not a bad edge end to end.

## Three things are NOT the cause (each measured, so they don't get re-investigated)

1. **The router is not underpricing.** `road-carve.js`'s along-path design profile (the causal EMA
   pair clamped to ±`deviationCap`) priced this edge at **2 496 k** against the built road's
   **2 243 k**. It saw a 169% grade and 91 m of earthwork and charged for them. It is not fooled.
2. **The cull is not failing.** `_cullNetwork` is topology only — degree cap (longest chord first),
   crossings, clearance. Cost was never an input. It is doing exactly what it was designed to do.
3. **Site placement cannot fix it.** Both anchors are LOW (h=117 and h=50) — this is not a node on a
   mountain top, it is two nodes in different drainages. Six escape-score ranking variants × 10 seeds
   never got the worst-grade max below 106% (baseline 119%), and worst-grade proved to be dominated
   by Poisson-lottery reshuffling, not by the score: changing only the score's sample pitch
   (80 m → 55 m) flipped seed 20 from 63% to 139%. See `_siteEscapeScore`'s header.

## What it actually is

**The search corridor is a fifth of the width it needs, and an Urquhart edge is an unbreakable
contract.**

`PROTO_MARGIN = 120` (src/road.js) inflates the anchor bbox into the A* lattice — here a
532 × 585 m box. Terrain relief across it, by lateral offset from the A→B chord:

```
   offset    peak to cross, above anchor A
   -100 m         146 m     <-- inside the search box
      0 m         153 m     <-- inside the search box
   +100 m         152 m     <-- inside the search box
   -400 m         106 m
   +500 m          87 m
   -900 m           4 m
```

Inside the corridor the ridge is 146–153 m tall at **every** offset. No non-cliff path exists in the
box. The router already detours ×2.51 (1134 m for a 452 m chord) thrashing for one. And because every
cost term is finite and per-metre (`roadWOver` is explicitly a SOFT cap), A* always returns *a* path
— "unaffordable" is not expressible, so the edge gets built however bad the ground.

FEAT-40 cannot rescue it either, and it is instructive that all three of its gates independently say
no: stage 1's only viable summit chord spans the whole 1018 m run and would bury 623 m, vetoed by
`tunnelMaxLen: 200` (all-or-nothing — there is no partial-cut path); stage 2 finds 67.5 m of crown
cover but every buried sample sits on a 27–80% pitch, so `boreMaxGrade: 0.18` closes each span at
12 m and 8 m against `tunnelMinLen: 26`. The crest is too steep to be *allowed* a tunnel, and it is
steep because it wasn't given one.

## Options, and the constraint that rules one out

- **Adaptive search corridor** — when the best route's cost/metre exceeds a threshold, re-search with
  `PROTO_MARGIN` widened 3–4× so the 87 m saddle at +500 m comes into range. Produces a real road.
  Cost: search area scales with margin², and this is the PERF-03/PERF-27 cold-load hot path, so the
  retry must be gated tightly enough to fire on a handful of edges per world.
- **Cost-aware edge veto** — drop an edge whose routed cost/metre exceeds a threshold, reusing the
  degree cull's Phase-2 detour BFS. Worth stating clearly: this **cannot island**, because that BFS
  already guarantees "every dropped edge keeps a detour that uses NO dropped edge ⇒ connectivity of
  the survivors is guaranteed outright". It is a different mechanism from the crossing/clearance culls
  that strand components in BUG-47.
- **NOT more culling in general.** The user's standing constraint (2026-08-17) is that connectivity
  must go UP, not down — seeds already island (BUG-47, seed 11). `roadGraphMaxDegree: 3` is already
  aggressive. Any fix that sheds road without a connectivity guarantee is the wrong direction.

## Acceptance

1. Seed 20's spawn edge `g:0,-1,2:-1,0,2` is either a road no steeper than `roadGraphMaxGrade` + slack,
   or it does not exist and its endpoints stay connected through a detour.
2. No connectivity regression: fully-connected spawn regions and largest-component share, over the
   10-seed set in `test/site-rank-sweep.mjs`, must not fall below the values recorded when
   the escape-score ranking landed (8/10 and 0.981).
3. Cold-load cost measured, not assumed — a widened re-search must be shown to fire rarely.

## Do not

- **Do not retune the tunnel knobs to paper over it.** Lowering `boreMaxGrade` or allowing partial
  summit cuts would bore the crest and leave the 118% approach ramps either side.
- **Do not chase worst-case grade with site-placement knobs.** Measured dead end; the metric is
  lottery noise at that scale (see above).

## Resolution path (2026-08-18) — fixed on an UNMERGED branch; superseded by FEAT-68

A working fix (enforce → portfolio → mark) landed on `feature/seed20-road` and is **deliberately not
merging to main** (owner decision 2026-08-18): the branch's learnings instead seed **FEAT-68**, the
router-v2 teardown, whose spec absorbs this ticket's grade ceiling as a core requirement (priced ==
built by construction). Keep this ticket open until FEAT-68 ships or the branch is merged after all.
The branch is the reference implementation; its measurements below are the ground truth for FEAT-68. The measured design (see `test/grade-cap-survey.mjs`, 10 seeds ×
267 edges × 4 router caps — trust it, don't re-derive):

- **Q1: the terrain is never walled.** 801 capped searches, one unroutable edge (28% cap only).
  The widened-margin retry and the drop pass died here — nothing to widen for, nothing to drop.
- **Q2: a router-side cap does NOT steer the built grade.** 40%-capped searches BUILT 13 sustained
  violations vs 8 uncapped (the cap Goodharts its own causal-EMA proxy; cap→built is chaotic —
  tightening 40%→34% measured doubling a built grade 51%→92%). So the shipped mechanism is
  **post-build enforcement** (`_maxSustainedGrade`: sustained-24 m secant, junction-blend ends
  excluded) with a **first-compliant-wins portfolio** (`_buildableEdge`: normal route → on violation
  re-route at hardMaxGrade {cap, 0.85·cap, cap+no-corridor-discs} → none compliant ⇒ best attempt
  ships marked `e.gradeExceeded`). Params `roadMaxBuiltGrade: 0.40` / `roadGradeWindow: 24`.
- **The deg-2 merge is guarded**: a merge may never worsen the chain's sustained grade (a marked 44%
  member measured merging into a 58% chain — the fresh earthwork window smears walls wider); the
  mark on a merged run derives from the merged profile.
- **Router plumb** (`hardMaxGrade` + `requireGoal` → `[]`, coarse-pass excluded) is opt-in and
  byte-identical when off — bundle parity proved it before any behaviour change.

Acceptance: (1) seed 20's spawn edge — the 118% road is gone; the spawn chain ships marked at 58%
sustained (its every attempt, disc-free included, measured ≥58% in canonical routing direction —
the honest terminal rung; connectivity outranks the cap per the 2026-08-18 priority ruling).
(2) connectivity unchanged at 0.981 / 8-of-10 fully connected. (3) perf measured in-branch.
Residual: marked edges exist (~1 per ~3 spawn regions) — the game-side response to
`gradeExceeded` (warning sign / one-way / winch point) and the region-interface case are
FEAT-28's (see "The unsatisfiable region" there). Planner mispricing split out as BUG-52.

---

## RE-MEASURED ON THE v2 WORLD (2026-08-26) — STILL LIVE, and the cap is not the guard it looks like

Owner asked directly: "I thought the v2 router made absurd grade illegal." It does not. It makes an
absurd grade *unsolvable*, and then ships one anyway.

Measured across **467 runs in 9 windows** (seeds 0/3/6/7/11/20/67/90, incl. the seed-6 gate window),
grade taken on a **10 m baseline** — the same station spacing `profileSolve` caps on — and with the
junction-blend reach (`roadJunctionBlendLength` + 10 m) excluded at each end, so this is the road the
ROUTER built and not grade the blend added:

| | count |
|---|---|
| runs above the 24 % `gMaxRoad` design cap | 196 / 467 |
| runs above the **40 % contract ceiling**, in their INTERIOR | **6 / 467** |
| runs flagged `_v2Infeasible` (mark-and-ship) | 4 |
| worst | **115 %** — seed 6 `g:8,1,0:9,1,0` @(5738,884), which climbs 23 m in 24 m of arc |

Two facts worth keeping:

1. **The over-ceiling runs are all INTERIOR**, so this is not the junction blend steepening a mouth.
   It is the router building a road up a wall.
2. **Marked ≠ over-ceiling.** Only 4 runs are marked infeasible, but 6 exceed the ceiling — so the
   count of marks does not bound the damage, and a gate that watches `_v2Infeasible` alone would
   report clean while a 115 % road ships.

Mechanism, restated for v2: `_v2GradePts` walks a 4-rung ladder (cap → yStep 0.25 → cap + 0.03 →
0.38), and when every rung fails it takes the **mark-and-ship fallback** — terrain-follow Y with the
ends blended onto the node heights. That fallback is deliberate and well-argued in the code (a marked
road beats a road that does not exist), but it means the ceiling is a *design intent*, not an
enforced invariant: nothing vetoes the EDGE. The ticket's original framing — "the router is boxed in
and nothing can veto the edge" — is exactly right and unchanged by v2.

**Why this matters for driveability** (owner, 2026-08-26: "every intersection navigable and
continuous and driveable in any direction"): a 115 % road is not driveable in either direction, and
it is upstream of BUG-56 — two of `junction-stitch`'s 18 residual sites are this bug, not a stitching
defect. Fixing the fork geometry cannot help a leg the truck cannot climb.

The open design question is unchanged and is the owner's: when no legal road exists across an
Urquhart edge, does the edge get **deleted** (BUG-57's crossing invariant already has the vocabulary
— condemn the edge, validate connectivity, fall back to a different seed if the world is genuinely
unconnectable), or does it get **re-routed** at a wider corridor, or does it ship marked as today?

Instrument used: `test/scratch-grades.mjs` (rainy-day, not kept). A permanent gate would be four
lines in the existing road battery — worth adding when this is picked up.

---

## OWNER RULING (2026-08-27) — DEFAULT: condemn the edge

> "default decision unless I rule otherwise is condemn it, validate connectivity, reroll the seed if
> the world is genuinely unconnectable"

That is BUG-57's crossing-invariant pattern applied to grade, and the vocabulary already exists:
condemn → connectivity is VALIDATED as a gate, never guarded per-deletion → a seed that genuinely
cannot be connected is a seed-gen problem, not something to force. Implementation notes for whoever
picks this up:

- **Where the veto goes.** `_v2GradePts` ends its 4-rung ladder in the mark-and-ship fallback. The
  condemn decision must NOT live there — that method is called from discovery, dry-runs and assembly
  alike, and a delete verdict inside it would create exactly the recursion BUG-57's two-layer bundle
  exists to prevent. Model it on `_v2DeleteFor`: a pure per-edge predicate ("is there any legal
  profile for this edge?"), memoized per rev, read by the assembly layer only.
- **Marks do not bound the damage.** 6 runs exceed the ceiling but only 4 are `_v2Infeasible`, so a
  predicate keyed on "the solve failed" misses two. Key it on the SHIPPED grade instead, measured on
  a 10 m baseline with the junction-blend reach excluded — the measurement below.
- **Connectivity gate already exists**: `test/road-connectivity.mjs` (CONNECTED is rim-honest) plus
  the component counts in `test/crossing-rung-parity.mjs`. Reuse, do not re-derive.
- **Seed reroll is a named structural watch** in `.planning/ROAD-CLOSEOUT-PLAN.md` and stays a
  design-only item until a real seed actually trips the connectivity gate.

## THE LIST — seed and coordinates, for the owner to look at (measured 2026-08-27)

Free-roam, `Shift+C` free-cam, `T` to teleport. Grade on a 10 m baseline, junction-blend reach
excluded at both ends, so every one of these is the router's own road.

| Seed | Go to X, Z | Worst | How much of it | Run |
|---|---|---|---|---|
| **7** | **−1756, 1596** | **87 %** | **192 m of a 572 m run · 155 m of climb** | `g:-4,2,2:-3,2,2` |
| **6** | **5736, 885** | **115 %** | **96 m of an 801 m run · 107 m of climb** | `g:8,1,0:9,1,0` |

Those two are the whole defect. Seed 7's is the one to look at first — it is a third of the run.
Seed 6's is the steepest and it is the run that eats two of `junction-stitch`'s residual sites.

**Four MORE were on this list before 2026-08-27 and are gone**, killed by the band arc-allocation fix
committed under BUG-56 (seed 0 `1,-2,2:2,-2,2` 53 %, seed 6 `3,1,0:4,1,1` 74 %, seed 11
`2,-3,2:1,-2,0` 45 %, seed 67 `1,-2,1:1,-1,0` 41 %). Every one of them was INSIDE A MERGE BAND, and
none was a road the router built up a wall — the profile was solved legally at or under the 38 %
ceiling and then shipped steeper than that because the band's arc ran longer than its ground. Do not
go looking for them again. The battery count is **2 of 467 runs**, down from 6.

