---
id: BUG-85
type: bug
status: fixed
severity: minor
opened: 2026-10-12
closed: 2026-10-15
relates: src/world-validate.js (the player bar), BUG-80 (same class, seed 3309753130 — closes with this), feat-region-gated-connectivity (FEAT-28)
---

# BUG-85 — seed 1222770136 is not routable (network splits in 2)

## Resolution (2026-10-15) — phase 1, today's disc

**A split no longer refuses a seed. Stranded pieces get no POIs, customers, mission endpoints or
roadside drops.** The ladder half (phase 2: seat the spawn on the largest R1 piece, re-admit pieces
at unlock) waits for FEAT-28.

- **The pieces are cut at the PLANNERS' wall, not the drawn one.** Measured at each seed's spawn
  before writing the filter: a cut at the drawn 2500 m wall disagreed with the planners' graph
  (`buildGraphAdj`, wall less `REGION_MARGIN` = 2400 m) both ways. Seed 30 showed 2 pieces where
  the planners saw 3: a 0.5 km piece hanging off the 100 m band. BUG-80's seed showed 2 where they
  saw 1. So `validateArea` cuts at `area.pieceInset` in from the wall (story passes
  `REGION_MARGIN`), and a run joins its two nodes only if it lies **wholly** inside. That is the
  strict cut, and it is also what mission guard 2 already enforces on routes.
- `src/world-validate.js`: new `regionPieces(runs, inPiece, inCore, anchor)` — shape-agnostic, two
  predicates, so the ladder plugs in its own. Main piece = the spawn's. The report gains
  `mainNodes` (node keys) and `stranded` ({km, nearest}). `playable` = a piece exists and nothing
  is condemned. `ok` (the dev bar) no longer wants one piece either (owner, 2026-10-15): the strict cut split `play-area` seed 11 on a 5.2 km corner piece ≥ 6.9 km out, which main's lenient rule had joined through a road leaving the square. Pieces are printed, not failed; whole-network connectivity stays `graph-topology`'s job. The "N separate pieces" refusal
  sentence is gone.
- `src/story.js`: keeps `report.mainNodes` and exposes it as `region().nodes`; logs stranded
  pieces with `console.info`.
- Consumers: `buildGraphAdj(g, inRegion, nodes)` drops any edge with a node off the main piece. That
  covers mission endpoints and routes, roadside drops and the paper tour. `PoiSystem.build` and
  `buildHouses` take the same set. Camps are areas, not graph destinations, and are untouched.
- **Gate `test/region-pieces.mjs`** (heavy, story): seeds 1222770136, 30, 31, 3309753130 + clean
  6, 7, each at its own spawn. Asserts playable; the planners' graph is one piece holding the
  spawn's road; every POI and customer is on the spawn's piece; main piece is the largest; a seed
  with no stranded piece gets byte-identical POIs and customers to no filter. **Negative control:**
  with the filter off it fails on all three split seeds — seed 30 puts a farm and 2 customers on
  stranded pieces, 1222770136 and 31 one customer each.
- Results, all seeds: 1222770136 stranded 0.9 km at 1687 m · 30 stranded 1.1 km at 1143 m + 0.5 km
  at 1839 m · 31 stranded 1.7 km at 1817 m · 3309753130 no stranded piece under the planners' cut
  (its spur sits in the margin band) · 6 and 7 clean.
- `npm test`: 14/14 affected gates green.

## HANDOFF (2026-10-15) — start here

Everything below this section is the investigation that got here. You do not need to re-derive it.

**Goal (owner, 2026-10-15):** a wall that cuts the road network must never refuse a seed. The
network inside a region is split into **pieces**. The largest piece is the region's network. A
**stranded piece** is any other piece: it stays in the world, drivable and visible, but it gets **no
POIs, no roadside destinations and no mission endpoints**. *Optional:* once the region it connects
through unlocks, it rejoins the network and becomes eligible.

**Rulings, all 2026-10-15, in DESIGN.md "Run shape and saving", on the ladder radii bullet:**
- **Strict wall cut, 500 m inset.** Roads are cut where they cross the wall, so a road that leaves
  and comes back does NOT connect its two ends. A piece only counts if some of it reaches 500 m
  inside the wall. Anything shallower is a rim fragment and is ignored, as today.
- **No seed reroll.** Story seed S and free-roam seed S must stay the same world.
- **No heading search.** The ladder is fixed north–south, R1 at six o'clock (+z: the 2D map draws
  +z downward, `src/map2d.js` `_sy`).
- **[DEFAULT, owner may override]** The spawn is seated on the largest piece of R1. Under the ladder
  the regions are drawn from the world origin, so the spawn no longer has to draw the region.
- **Do not touch the router's delete rung** for this. Detour guards, hop caps and victim flips were
  all measured and rejected (sections below).

**Measured on the ratified ladder shapes, fixed north–south, today's terrain, seeds 1–21:** run
`node test/ladder-pieces.mjs 1 2 3` (rainy-day diagnostic, 30–50 s per seed: it routes the whole
5.5 km footprint around the origin once).
- **5 of 21 seeds have a stranded piece:** seeds 1, 7, 10 and 16 in R1, and seed 14 in R1∪R2.
- **R1's main piece is 9.9–18.8 km of road; the stranded share is up to 41 %** (seed 10:
  9.9 km + 6.9 km).
- **Every stranded piece rejoins at the next stage.** No piece survived to R1∪R2∪R3, so the
  optional reincorporation would recover all of them.
- **Caveat:** the radial terrain term is not built yet. R1 will be gentler and R3 steeper than this.

**Today's code is NOT the ladder.** Story mode is one 2500 m disc around the spawn: `REGION_RADIUS_M`
in `src/story.js`, with the spawn = the region centre. It is routed to 2800 m and then frozen. Nobody
has built the ladder yet. Its region-unlock primitive is FEAT-28. So, two phases:

1. **Now, on today's disc.** This fixes BUG-85 and BUG-80.
   - The main piece is the spawn's piece. On today's disc the stranded pieces measured 1.7–2.7 km
     against 56 km.
   - Splits stop refusing. A condemned edge still refuses: that player bar is unchanged and out of
     scope.
   - Build the piece logic shape-agnostic, taking an area predicate, so the ladder can plug in.
2. **With the ladder (FEAT-28).**
   - Seat the spawn on the largest R1 piece.
   - Compute pieces over R1, then R1∪R2, then all three.
   - Optionally re-admit rejoined pieces at unlock.

**Where it hooks:**
- `src/world-validate.js` `validateArea`: today it joins whole runs, which is the lenient rule, then
  counts components over the inset core. Add the strict cut, and return piece membership, not just
  a count. `test/ladder-pieces.mjs` `pieces()` is a working reference for the strict cut and inset.
- `src/story.js` `_checkSeed` (~line 221): refuses when `playable` is false. A split must no longer
  make it false, and the piece membership has to reach the consumers below.
- `src/poi.js`: POI siting gathers viable pads inside the region (`REGION_MARGIN` from
  `src/mission.js`). Filter the pads to the main piece.
- `src/mission.js` `buildGraphAdj(g, inRegion)` (~141; called ~739, ~972): the mission graph's region
  filter. Make it main-piece membership, so no endpoint or route lands on a stranded piece.
- **Roadside destinations:** find them with `grep -rn -i roadside src data` and
  `.planning/story-mode/pois.md`, and apply the same filter.
- **Determinism:** pieces must be a pure function of (seed, params) and window-invariant, since
  routing is frozen after the warm. Save nothing (SM-INV-12).

**Housekeeping:**
- Branch `fix/bug85-delete-guard` and worktree `../CarGame-bug85` hold the rejected router
  prototypes. Never merge them. Delete them with `git worktree remove --force ../CarGame-bug85 &&
  git branch -D fix/bug85-delete-guard`, after telling the owner.
- Close BUG-80 together with this ticket: it is the same fix.

## What

Story-mode entry refused seed **1222770136** with the world-validate disclaimer. Unlike BUG-80 the
failure reason is known from the screen: a **component split**, not a condemned edge.

> Seed "1222770136": the road network breaks into 2 separate pieces — parts of the region cannot be
> driven to.
> 89 roads · 56 km in the region · 2 disconnected pieces · max road grade 24 %

Recorded by the owner from play, 2026-10-12.

## Root cause (measured headless 2026-10-12)

Reproduced: spawn (−80, −316); disc 2500 m; 91 runs · 56.4 km · **components 2** · condemned 0.
(The game showed 89 runs. The worker build differs slightly from the sync one; the verdict is the same.)

The orphan is a 2-run, 1.71 km spur that reaches **1687 m** from spawn. That is well inside the 2000 m
core, so this is not a rim island. Its tip is node `-3,1,1` at (−1307, 840):

- Raw Urquhart degree **3**: `-4,1,1`, `-3,2,2`, `-2,0,0` (1262 m from spawn, main component).
- Built degree **1**. Both lost edges were removed by the v2 delete rung (`_v2DeleteFor`), and **both
  by the crossing-victim branch** (`reconverged: false`):
  - `-2,0,0|-3,1,1` crosses its own sibling `-3,1,1|-4,1,1` twice, at (−1744, 514) and (−1582, 618).
  - `-3,1,1|-3,2,2` crosses `-3,2,0|-3,2,2` at (−1434, 1304).
- The only way out is `-4,1,1` → promoted T `-2518113,425441,-1` at 2549 m, which is **past the wall**.

**The defect.** The crossing-victim branch has **no detour check at all** ("victim = the LONGER
member, full stop"). The re-converge branch and the degree pass both require a bounded-hop detour.
Each verdict is per edge, so two deletions at one node each count on the other's edge as part of
the node's remaining connectivity. With both deletions excluded together, neither edge has a detour
within `roadGraphDegreeDetourHops` = 4. The shortest one is **6 hops**, and it runs out past the wall.

The world is still one component globally, so the whole-network build looks fine. The island only
appears once the region wall clips that 6-hop loop.

BUG-80 is a **different** mechanism: its orphan tip `-3,-1,2` is a leaf in the RAW Urquhart graph,
with no deletion involved. That one is the wall clipping a whole-world graph.

**Prevalence.** I swept seeds 1–40, each region centred on its own spawn. **2 of 40 split (seeds 30 and
31)**. In both, the orphan contains a node that lost an edge to the delete rung. Their nearest points
are 1143 m and 1817 m from spawn, inside the core. Counting the two player seeds, that is
**3 deletion splits** (seeds 30, 31, 1222770136) and **1 clip split** (BUG-80).

## Tried: the joint detour guard (owner picked the cheap variant 2026-10-12) — NOT SHIPPABLE AS IS

Give crossing-victim deletions the guard the degree pass already has, using its order-free Phase-2
shape:

- **Phase 1:** every delete-rung verdict is a candidate (this is what the code computes today).
- **Phase 2:** a candidate is actually deleted only if its endpoints reconnect within `hopCap` hops
  in (wide graph − degree drops − **all** candidates). A candidate that fails stays **alive**: the
  road ships, crossing included. A failed check never picks a different victim.

This runs as a post-pass in `_v2SettleDeletions`, before the freeze. It rewrites `_v2Deleted` and
the memo, so the registration path (`_v2DeleteFor` at the assembly loop) reads the guarded verdicts.

**Cost and invariance.** The guard needs candidate verdicts for edges near both endpoints. Today the
settle pass only covers the 1-ring of in-band nodes. Fully window-invariant Phase-2 semantics need
verdicts out to `hopCap` hops, which means more routing. The PERF note in `_v2SettleDeletions`
records that settling the whole band cost 7.7 s of a 9.3 s build. The cheap variant excludes only
candidates incident to the two endpoints. That catches this seed, since both deletions sit on
`-3,1,1`, but it needs a 2-ring settle to stay invariant for margin edges. The settle-set mirror at
`road.js` ~2047 ("Wave 1") must move with it.

**What it costs in road quality.** An edge the guard keeps ships with the crossing that condemned it.
Here, `-2,0,0|-3,1,1` double-crosses its own sibling near `-3,1,1`.

### Result (branch `fix/bug85-delete-guard`, worktree `../CarGame-bug85`, uncommitted)

Implemented as described: a `_v2SettleEdges` helper shared by the settle pass and Wave 1, a ring-2
settle, and the guard post-pass. Measured:

| guard cap | seeds 30 / 31 / 1222770136 | crossings shipped (seeds 3, 4, 5, 7, 8, 9) | deletions, seeds 1–40 |
|---|---|---|---|
| none (main) | split / split / split | 0 / 2 / 0 / 0 / 0 / 0 | 181 |
| 4 hops | ok / ok / ok, **40 of 40 seeds connected** | 5 / 5 / 2 / 1 / 1 / 4 | 78 |
| 5 hops | ok / ok / ok | 5 / 5 / 2 / 0 / 0 / 0 | — |
| 12 hops | **split / split / split** | unchanged | — |

- **The cap is the whole lever. The joint exclusion is not.** On main, most crossing-victim
  deletions already have no detour shorter than 5–10 hops (`kind:hops-plain/hops-excluded` on seeds
  3, 4, 5, 7, 8, 9: X:10/10 X:8/8 · X:6/6 ×4 R:4/4 · X:4–5 · …). A tight cap reinstates about half
  of all deletions, and each one ships its crossing.
- **Cap 12 (true joint islands only) fixes nothing.** Seed 30 does have two deletions with no
  12-hop detour once ALL deletions are excluded. The window-invariant guard can only exclude the
  deletions at the two endpoints, and then it finds a detour through other deleted edges further out.
- **Gates at cap 4:** 83/89. The known reds are road-tunnel, road-clearance and junction-stitch.
  **3 NEW reds, all crossing fallout** (each passes on main):
  - road-pad-fill: a sliver with aspect ratio 1321 at seed 7 (−507, −357); p95 8.6 > 6.
  - graph-topology: GRAPH-SURFACE-SMOOTH and GRAPH-CORRIDOR-CLEARANCE.
  - mission-network: the elevation series disagree inside runs by up to 37 m. A check that requires
    a deletion in its window finds none, so it fails as vacuous.
- **Build time:** +20 % summed over the 40 seeds (853 → 1027 s, under 4-way load), from routing the
  ring-2 verdicts.

**So the crossing invariant (BUG-57) and the connectivity guarantee pull against each other here.**
A guard only connects by shipping crossings, and the build doesn't make crossings clean today.
The owner's call on direction:

1. **Victim flip:** when the longer member of a crossing pair has no detour, delete the shorter one
   instead. Zero crossings ship unless neither member has a detour. Here the shorter member of
   `-2,0,0|-3,1,1`'s pair is `-3,1,1|-4,1,1`, the spur toward the wall, so deleting it reconnects
   `-3,1,1` to spawn. It still needs the ring-2 settle, and it gives up the "the shorter member
   survives by construction" order-freedom argument, so the invariance has to be re-argued.
2. **Accept crossings:** ship the cap-5 guard and fix the three crossing reds, making crossings
   first-class again.
3. **Leave refused:** 3 deletion splits plus 1 clip split, out of 42 seeds tried (~7 %). The
   entry screen already handles it.

## Tried: victim flip (owner go-ahead 2026-10-12) — NOT SHIPPABLE

**What the splits share.** I dumped the orphans' degrees on main. Seed 30's orphan is a single road
whose BOTH other edges were deleted (two nodes, raw degree 2 → built 1). In seed 1222770136, `-3,1,1`
goes from degree 3 to 1. Seed 31 is different: `-2,-2,0` goes from 3 to 2, and the orphan is a
cluster near the wall, so it is clip-like with a deletion as the trigger.

**Dead ends created by deletion are common, not a split signature.** 66 of 186 deletions over
seeds 1–40 create one: 25 could flip to the partner without creating one, 31 are stuck (both choices
create one), and 10 are re-converge deletions. Only 2 regions split.

**The prototype rule:** when a crossing deletion would create a dead end and deleting the partner
would not, delete the partner instead. Two variants: *flip-only* leaves stuck cases as today;
*flip+ship* also ships stuck cases as crossings. Prototyped headless (`FLIP=keep|ship` env switch in
the worktree), with no invariance plumbing yet. Partner endpoints can lie beyond the ring-2 settle.

| seeds 1–40 | connected | splits | crossings shipped (at-grade + near-parallel) | seeds with any |
|---|---|---|---|---|
| main | 38 | 30, 31 | 5 + 1 | 3 |
| flip-only | 38 | 30, 31 | 6 + 1 | 4 |
| flip+ship | 39 | 31 | 26 + 5 | 12 |

flip-only fixes seed 1222770136, but over 1–40 it changes nothing. **Gates (flip-only): 86/89.** The
known reds are road-tunnel and road-clearance; junction-stitch is green. The new red is
**play-area: seed 11's 144 km² area SPLITS (components 2)**, and it is whole on main. Deleting the
partner just moves the island somewhere else.

## Conclusion (2026-10-12)

**No local change to the delete rung lowers the split rate without shipping crossings or moving the
island elsewhere.** The guard (cap 4) connects every seed but ships about 100 crossings over 40 seeds
and adds 3 geometry reds. Cap 12 fixes nothing. flip-only breaks seed 11. flip+ship ships 5× main's
crossings. The underlying shape is a sparse graph (max degree 3, many degree-2 chains) whose
deletions leave long loops. In the world those loops are fine; a fixed wall cuts them. That is the
same mechanism as BUG-80's clip, one step removed.

**Recommended fix: region placement chosen deterministically by the seed.** Try a fixed, ordered list
of candidate placements and take the first whose region validates (`validateArea`). This is still a
pure function of the seed (SM-INV-12), so the refusal screen remains only as a last-resort fallback.
It belongs in the region-ladder layout work (DESIGN.md ratification 2026-10-12), where the ladder's
compass heading is the natural free parameter. The circle around spawn that today's check
validates is being retired, so building the search on it now would be thrown away.

The branch `fix/bug85-delete-guard` (worktree `../CarGame-bug85`) holds both prototypes,
uncommitted. Nothing in it should ship; delete it once the ladder-layout ticket cites this one.

## Design sketch: seed-chosen region placement (2026-10-14) — SUPERSEDED 2026-10-15 by the HANDOFF

- **Terms (owner, 2026-10-15):** the regions are the **ladder**: R1 sector, R2 band, R3 centre
  disc, stacked north–south, climbing from R1 at six o'clock to the centre. They are sections of
  rings but do not envelop one another, so do not call them rings. Only the terrain-intensity and
  road-character field is radial.
- **Knob:** rotate the whole ladder (R1 sector + R2 band) about the world origin by θ. The radial
  terms (terrain intensity, road character) depend on radius only, so the world is the same
  for every θ. Only the region boundaries move. R3, the centre disc, does not move, but the side
  it opens onto does.
- **Search:** θ_0 = six o'clock (or seeded), then a fixed candidate order. For each candidate:
  route the union, run the nested checks R1 → R1∪R2 → R1∪R2∪R3 (one component each, zero
  condemned, clipped at the walls), and take the first that passes. If all K fail, show
  today's refusal screen.
- **Measured costs 2026-10-14** (seed 1222770136, headless, one thread): region build 2800 m disc
  8.7 s; `validateArea` 1–3 ms; raw Urquhart + degree drops over the whole 11 km layout footprint
  15–31 ms (this pre-screen catches clip-class splits like BUG-80 before any routing).
- **Retry estimate, not measured:** a disjoint rotation re-routes R1+R2, about 13 of the union's
  ~20 km², so roughly 65 % of an entry warm.
- **Keeping the ladder north–south** allows only θ = 0° and 180° (R1 at six or at twelve o'clock).
  Those two are disjoint, so the refusal rate is about p², which is 1–4 % for p = 10–20 %. Small
  tilts (±25°) half-overlap R1, so their failures are correlated and each buys less.
- **RATIFIED 2026-10-15 (DESIGN.md "Run shape and saving"): strict wall cut, 500 m inset, heading walk.** No seed reroll. A reroll makes story seed S a
  different world from free-roam seed S, and avoiding that would mean mapping the story region in
  free roam too. A world that is north–south except for ~4 % of seeds would read as a glitch. So:
  **every seed gets its own seeded heading**, with fallbacks at +180°, +90° and −90°, then the refusal
  screen. Because every heading is arbitrary, a fallback is indistinguishable from a first pick.
  Refusal ≈ p⁴ ≈ 0.16 % at p = 20 % if the tries are independent (R1 tries are disjoint; R2 bands
  partly overlap near the centre, so they are somewhat correlated). Free roam is untouched.
- **Measured 2026-10-15: does any seed fail at every heading?** Seeds 1–21 on today's terrain (the
  radial term is not built yet). Each seed's whole ladder footprint (5.5 km disc around the origin)
  was routed once, 30–54 s headless, then R1, R1∪R2 and R1∪R2∪R3 were checked at 36 headings, 10°
  apart. Script: `ladder.mjs` in the session scratchpad. "Lenient" = today's validator (a run that
  leaves the area and comes back still connects). "Strict" = runs cut at the wall.

  | rule | one heading fails | worst seed | b, b+180, b±90 all fail |
  |---|---|---|---|
  | lenient, 500 m inset (today) | 9.5 % (72/756) | 9/36 (seed 1) | 0/756 |
  | strict, 500 m inset | 25 % | 17/36 (seed 3) | 0.5 % (4/756, seed 21) |
  | lenient, 250 m inset | 25 % | 15/36 | 1.6 % |
  | strict, 250 m inset | 69 % | 33/36 | 21 % |

  No seed failed at every heading under any rule. Most failures are R1 alone splitting in 2. The
  centre disc never failed every heading, and no condemned road was seen. Failures cluster in
  runs of 2–4 neighbouring headings, and opposite headings fail together 2.1 % of the time against
  0.9 % if independent (worse seeds are worse everywhere). The one failure no heading can escape is
  a break or a condemned road inside the centre disc, which every heading shares. That stays the
  thing to watch once the radial term makes the centre steeper.
- **Owner calls:** whether the ladder may leave north–south, or only flip to twelve o'clock; the rim-island inset for a 1.8 km-deep sector;
  whether all regions route at entry (frozen routing implies yes).

## Acceptance

- Seeds 1222770136 (this ticket) and 3309753130 (BUG-80) enter story mode with no refusal screen.
- No POI, roadside destination or mission endpoint sits on a stranded piece, for those two seeds
  and seeds 1–21. Pin it in a headless gate registered in `test/gates.mjs`.
- A split no longer makes `playable` false. A condemned edge still does.
- Pieces are the same from any stream window, and nothing about them is saved (SM-INV-12).
- `npm test` (affected gates) is green apart from the known reds (road-tunnel, road-clearance).
