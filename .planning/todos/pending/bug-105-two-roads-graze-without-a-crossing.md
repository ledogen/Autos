---
id: BUG-105
type: bug
status: open
severity: major
opened: 2026-11-03
source: owner capture /Users/ledogen/Downloads/autos-capture-1793661257788.json (seed 163384989, free roam, mark
  (−12734, 14911)) — "legs intersecting". Owner, 2026-11-03: "document this as another thing we need to fix, also on main"
relates: BUG-104 (two legs of ONE node overlap — a different pair shape), FEAT-77 (the clearance rule), test/lib/close-pairs.mjs,
  BUG-64 (earthwork between close roads)
---

# BUG-105 — two roads that share no node graze each other with no crossing

## What the capture shows (orchestrator probe, 2026-11-03)

The replay reproduces it exactly (`node test/replay.mjs <capture>`: run, arc and grade match the game). Two runs pass
within 120 m of the mark:

| run | length | end degrees | bores |
|---|---|---|---|
| `g:-20,23,1:-20,23,2` | 966 m | 2 / 3 | — |
| `g:-21,23,1:-12669676,14798347,-1` | 857 m | 2 / 3 (a promoted T) | 68–174 m |

They share NO node. Their centrelines come within **5.7 m** in plan, at **0.7 m** of height difference, at
(−12730, 14910), and stay within 12 m of each other for about 28 m. The pavements are ~7 m wide, so they overlap, and
no at-grade crossing is registered there. In game it reads as two roads running into each other.

This is not BUG-104's shape (two legs of one node lying on top of each other). It is two unrelated runs that either
should have crossed at a registered crossing or should have kept clear.

## Acceptance

- [ ] A census over enough seeds says how common it is (close pairs with no shared node and no registered crossing).
- [ ] At this mark, the two runs either cross at a registered crossing or keep the FEAT-77 clearance.
- [ ] The capture replays clean.
- [ ] The fix keeps every world window-invariant (the invariance and restream gates stay green).

## Second capture of the class — /Users/ledogen/Downloads/autos-capture-1793661187695.json (2026-11-03)

Sent as a tunnel collision; the BUG-67 re-assessment (proto/node-reseat, `wip/reseat/sibling.mjs`) found it is not one.
Two legs of site node `-13,10,0` (seed 163384989, mark (−8224, 6860)) come out of their tunnels and CROSS each other
76 m from the node with their decks 6.3 m apart vertically, and no structure or registered crossing there. The tubes
themselves stay 29 m apart. A second shape for this ticket: a grade-separated crossing with nothing to separate it.

## Measured (Spare, 2026-11-05) — census + the mechanism; the fix is a routing call

**Census** (`wip/bug-105/census.mjs`: road-clearance's FEAT-77 rule — closePairs + `_v2ClearReq` — on 16 worlds built
as the game builds them, with the pond no-go: the mark's window and 15 seeds at the origin, 623 km of road):
- pairs that share NO node and sit inside the rule: **1 — the mark itself**, nowhere else (5.7 m apart where the rule
  wants 23.0 m, 0.7 m of height, 52 m long — the capture's numbers, from a cold build);
- plan crossings that are neither at a shared node nor at a registered crossing, bores included (close-pairs skips
  ±80 m round every bore, so this was counted separately): **0**.

**The mechanism at the mark.** The grazing run `g:-21,23,1:-12669676,14798347,-1` ends at a PROMOTED T, and that T node
(−12670, 14798) is only **32 m** from the existing junction `-20,23,2` (−12645, 14819), which the other run ends at; a
32 m stub joins the two. The two roads are converging on what is really one junction split over two nodes, and graze
~150 m out from both — past the shared-node throat (≤ 120 m), and with no node in common, neither the planner's legs-
of-one-junction separation nor the gate's exemption sees them as related. Ways out (routing — the owner's call):
(a) a T promotion within some radius of an existing junction lands ON that junction instead, so both are legs of one
node and the leg separation applies; (b) the clearance planner treats nodes a stub apart as one junction.

**The second capture's shape** (legs of site node `-13,10,0`, seed 163384989, crossing 76 m out with decks 6.3 m apart)
does **not** reproduce in a cold build, on main or on this branch: the three legs come closest only at the node itself
(`wip/bug-105/mark2.mjs`). Like BUG-106, it may be a network adopted from an earlier window — the capture's
`streamCenterHistory` would tell; the captures are in ~/Downloads, which this session cannot read (asked to copy them
into wip/bug-106/).

## The mechanism, corrected (Spare, 2026-11-05 evening) — and a fix that moves the road

The note above was wrong on one point, and it changes which fix works. **In the plan graph the two roads ARE legs
of one node.** The side road's graph edge is `-21,23,1 → -20,23,2`; the T promotion moves its start to P only at
assembly. So the planner did see them as related, and options (a) "land the T on the junction" and (b) "count nodes
a stub apart as one" would only change which node the gate thinks they share. The graze 179 m out would stay
exactly where it is. Neither was built.

What actually happens at `-20,23,2` (`wip/bug-105/why.mjs`, `why2.mjs`):
- The two legs part at the node, swing **64 m** apart, and come back to **5.8 m** at ~179 m for ~50 m.
- The merge planner misses the pair. Its walk from the NW leg bridges the swing (the NW leg's samples stay inside
  the 60 m flare limit of the side road's line), so that walk calls it one 176 m node-anchored strand. Its walk
  from the side road does not (64.5 m > 60). One answer is < MINREG, so the pair skips the node-anchored path, and
  the mid-span search then starts past 176 + 60 m — beyond the graze. No plan. (Even with a plan, the side road
  already cedes to the trunk at that node, and a run may merge once per node.)
- FEAT-77's clearance pass then **defers** the pair, because it comes inside mergeProxM (18 m) "and the T machinery
  owns that". Nobody owns it.

**The fix (prototype `proto/bug-105` 33b041f1, worktree `CarGame-bug105`):** the clearance pass defers a close pair
to the T machinery only if the node's plan actually gives that pair a role. It asks the plan computed on the
PASS-1 lines (the lines the clearance pass itself reads), so it never reads a pass-2 route and no cycle forms
(`_v2NodeMerges` gains a quiet `pass1` mode; `pinHeld` reads base dirs, which are the same pins). A pair no plan
takes is an ordinary clearance violation, and the longer road takes the berth.

- At the mark: the NW leg keeps **52 m** (was 5.7 m), 966 → 921 m. The same window's one node-sharing violation
  (a road riding 150 m beside another at (−13879, 16279)) is fixed too: 913 → 665 m.
- A first, broader cut (4e5b7563: any short touch out on the span counts) flipped 121 pairs in 13 windows, most of
  them pairs the planner does merge. Rejected.
- **What else it moves** — 20 random seeds, 1 400 m round each origin, 767 km (`wip/bug-105/seeds.txt`,
  `narrow/moved-*.jsonl`): 7 sites. Three gain a road the crossing rule used to delete (connectivity up). One
  re-places two crowded Ts cleanly. One swaps a T for a different junction. Two shift a bend by ≤ 24 m (one of those
  gains a kink). The clearance census over the same seeds is unchanged (1 no-shared-node pair, 8 node-sharing
  pairs, on main and with the fix).
- **Not fixed — the other shape:** seed 158847947 (2020, 625), roads `1,0,0→3,0,2` and the trunk of T
  `2321413,700472`. They are 15.3 m apart and 8.5 m apart in height, side by side for 168 m. They share no node
  even in the graph, so it's the disjoint planner's hole (BUG-55 shape E: its winner must be "plain", and this
  trunk carries a T). A pass-1 forecast of that planner needs `_v2MergeFor`'s promotability probe, so it is a
  separate pass.
- Sheets: `CarGame-bug105/wip/bug-105/shots/sheet-{1-mark,2-elsewhere,3-open}.png` (map overlay + top/oblique
  frames, main :3885 vs fix :3886).

### Gates and the owner call (2026-11-05, late)

`npm run test:all` on proto/bug-105 33b041f1: **121/122. `vertical-curvature` is RED** on its seed-11 window. The
re-routes reshuffle which roads survive at (−1895, 184). Main tunnels through that ridge; the fix sends a road over
the saddle to a junction on the crest: a 0.183 /m crest (line 0.07; lift-off at 7.3 m/s) and a 0.552 /m junction
sag (line 0.11). So the fix cannot land as it stands. Sheets (sent to the owner): `sheet-1-mark` (fixed, 2 sites),
`sheet-2-elsewhere-a/b` (7 sites on 20 random seeds), `sheet-3-open` (the seed-11 crest, and the untouched disjoint
shape on 158847947).

**Spare's recommendation: park.** The defect is rare: this capture plus one disjoint sibling in ~1 400 km of
cold-built road. The fix moves ~8 sites for each one it repairs, and one of them gets worse. A fix with less
ripple has to mend the planner itself (its two walks disagree about where a node interval ends), which is a router
pass. Keep proto/bug-105 and this record. Owner's call: (a) park as recorded, or (b) one more pass to make the
fix land green (the seed-11 crest, then the s3192 kink).

## The plan — BUG-104 + BUG-105 as ONE problem (owner, 2026-11-06)

The owner's rulings, relayed by the orchestrator overnight:
- bug105-call: "i dont care about roads moving if it makes generation better. i do care about grazing without an
  intersection." So the ticket is NOT parked.
- bug104-go: "can this be combined with bug-105? im looking for a hollistic solution for 'roads intersect but dont
  form a junction'".

So BUG-104 (two legs of one node lying on top of each other), BUG-105 (two roads grazing with no node in common), the
disjoint seed-158847947 sibling and the second capture's structureless crossing are all one defect. Two roads touch
somewhere that is not a junction. This section is the plan. Build only after PERF-31's timings land, so the
measurements sit on the faster base and don't contend with the other lanes' timing runs.

### The rule — no new rule, the existing one enforced everywhere

**Two roads touch** when, anywhere outside a junction's own ground, they are inside FEAT-77's clearance rule
(`_v2ClearReq`). That rule requires 12 m of daylight between pavement edges, and neither road's cut or fill bank may
reach the other. It already scales with the height between the decks. BUG-105's mark (5.7 m apart), BUG-104's
overlaps (< 10 m), and 158847947 (15.3 m apart with 8.5 m of height, where the banks meet) all fall inside it.

There is one addition, which the BUG-105 census already measures: **any crossing in plan view is a touch, at any deck
height**. Without a structure, a crossing with 6.3 m between the decks is just one road's bank cut into the other.

**A junction's own ground** is the existing close-pairs exclusions, unchanged:
- the geometric throat of a shared node;
- ±(blend + 10) m of a registered at-grade crossing;
- a T's departure blend;
- hairpin arms;
- tunnel bores ±80 m.

The owner's near-miss tolerance for legs of one node stays (ruling (a), 2026-11-01: under 1 m short over under 20 m).
Two separate roads get no tolerance.

The `road-clearance` gate already enforces exactly this rule, gating at zero. It is green because it only walks its
own 9-window battery. Random seeds are where the residue lives: 1 no-shared-node pair plus 8 node-sharing pairs in
20 seeds, and 5 overlaps in 100. So the bug is not a missing rule. It is the places where nobody enforces the rule.

**Every touching pair resolves exactly one way, in this order.**
1. **JOIN.** The two roads become one junction: the T machinery merges them (FEAT-76; standing ruling "a T always
   beats no T").
2. **SEPARATE.** The loser re-routes, with the winner's line priced as occupied. That is FEAT-77's second pass, and
   the road moves, which the owner has now accepted.
3. **FORCED JOIN.** If a pair still touches after both, it is joined anyway as the best available T, because the
   departure tests rank T candidates and never veto them.

No road is deleted to clear a touch. Deleting one would cut connectivity against the standing "connectivity goes up"
ruling. If the build ever needs a deletion, that goes to the owner as a call.

### Where it lives — two owners, and the plan layer stays acyclic

The road build has two layers. The **plan layer** decides pins, routes, merges and the clearance re-routes, all from
the graph and the pure routes. The **assembly layer** turns those decisions into registered runs. The world is the
same in every window because nothing in assembly feeds back into a plan decision.
`.planning/research/T-PROMOTION-FIXPOINT.md` has the full argument. Both fixes respect that boundary.

**Stage 1, plan layer: close the ownership hole.** The clearance pass skips any pair that comes inside `mergeProxM`
(18 m), because "the T machinery owns that". It does this whether or not the T machinery actually takes the pair.
That is BUG-105's mark, and it is also 158847947, which sits at 15.3 m, under 18 m. The T machinery then refuses the
pair (the disjoint planner wants a "plain" winner, and this trunk carries a T), so nobody owns it.

The fix: the clearance pass defers only when the T machinery's own plan, computed on the same pass-1 lines, gives the
pair a role.
- **Node-sharing pairs:** use the node's merge plan. This is prototype `33b041f1` (+38/−4 in `road.js`), ported
  onto this branch.
- **Disjoint pairs:** use a pass-1 forecast of the disjoint planner. This is new work. Its one dependency is
  `_v2MergeFor`'s promotability probe, which is a pure function of pass-1 lines, so no cycle forms.

**Stage 2, assembly layer: the backstop on the line that ships.** Some touches only exist after promotion, so the
plan layer cannot see them:
- a T's departure, or a sliced half of a promoted run, landing beside another road (BUG-104 seeds 41, 87, 10);
- a pass-2 line routed against a winner that itself moved.

After `_v2PromoteTs`, the build walks the registered network with the gate's own walk. `test/lib/close-pairs.mjs`
moves into `src/` as a pure function, so the gate and the build judge the same pairs at the same stations. Each
residual touch is joined at the touch with a mid-span T. That is FEAT-76's `_v2PromoteMidSpan`, which already
promotes disjoint pairs from a winner plus a fork arc. A join only adds a node on a run that is already built. It
never changes pins or routes, so it cannot reach back into the plan layer. The walk's reach is 60 m, far inside the
window's margin band, so the windows agree.

**Stage 0 decides Stage 2's details.** Before any code, a census on the SHIPPED geometry classifies every touch by the
mechanism that made it, the way BUG-104 traced its seed 10:
- the planner deferred it (Stage 1's class);
- a T departure or a sliced half made it;
- a re-route against a moved line made it;
- the planner never saw it.

If Stage 1 alone clears nearly everything, Stage 2 stays a small backstop. If promotions make most of the touches,
Stage 2 is the main fix, and its T-at-the-touch design gets written up here before it is built.

### How it's proven

1. **The census.** 100 random seeds, drawn once from a fixed generator and recorded here (not hand-picked), each a
   1400 m window at the origin. Plus every known site: both captures, BUG-104's five, 158847947 and the 20 seeds in
   `wip/bug-105/seeds.txt`.
   - Required: **zero touches** outside junction ground (beyond the owner's near-miss tolerance), and **zero
     unregistered plan crossings**.
   - Reported: how many pairs JOIN, SEPARATE and FORCED JOIN each resolved.
2. **A standing gate**, so it can't regress. `road-clearance` adds a random-seed leg: 12 seeds from the same list,
   heavy, gating at zero. Its pins are counted from the run, with the reason written beside each one.
3. **World footprint**, over the 100 seeds: run keys that changed, km of road that moved, and junctions gained.
   Roads moving is accepted, but the owner sees how much moved.
4. **Every gate green, with re-justified pins.** That includes `vertical-curvature` (the prototype's red), the
   invariance and restream gates, `promoted-node-id`, `world-determinism` and both worker-parity gates.
   - A pin moves only with a written reason: the new number, and which re-route or join moved it.
   - Never a blind bump.
   - If a SEPARATE re-route breaks a curvature or grade bar that the original line met, that re-route is the defect.
     That pair ranks the join first instead (the seed-11 crest: the side road joins the trunk rather than going over
     the saddle). The gate's numbers are not relaxed.
5. **Both captures replay clean** (`node test/replay.mjs`).
6. **Before/after sheets for the owner:** every touch site from the census, a map overlay plus top and oblique
   frames, main vs branch. The same format as `wip/bug-105/shots/sheet-*.png`.

### What it costs

- **Build time.**
  - Stage 1's forecast reuses plan memos that already exist, plus one promotability probe per disjoint candidate.
  - Stage 2's walk uses the same within-skip PERF-31 added, so it is roughly tens of ms per window, plus one route
    per joined touch.
  - Budget: ≤ 5 % of the network thread. Story entry at `--cpu=4` measured before and after; it must stay < 30 s.
- **Compute to prove it:** about 100 window builds per census pass, roughly 25 min on 4 cores. Expect 3–5 passes.
- **World movement:** unknown until Stage 0. The prototype moved 7 sites in 20 seeds for Stage 1's node-sharing half.

### Order of work

1. PERF-31 timings, then landing.
2. Stage 0 census plus the mechanism classifier: numbers recorded here.
3. Stage 1: port `33b041f1`, then add the disjoint forecast. Census, and fix the seed-11 crest by ranking.
4. Stage 2: the shipped-line backstop. Design note here first, then build. Census to zero.
5. Gates with re-justified pins, the random-seed gate leg, sheets, then the owner.

Work on `feature/spare` (`/Users/ledogen/CodeShit/CarGame-spare`, :3885) after PERF-31 lands. Probes go in
`wip/bug-105/`. The prototype `proto/bug-105` (`CarGame-bug105`) is the reference, and it is retired once Stage 1 is
ported.

### Stage 0 — measured (2026-11-06)

`wip/bug-105/touch-census.mjs` runs on the SHIPPED network. It uses road-clearance's exact accounting, the owner's
near-miss tolerance, and plan crossings at any height. Worlds are built the way the game builds them (pond no-go),
and each touch is classified against the build's own plan graph, captured where assembly hands it to the T
promotion.

The sample: 127 distinct 1400 m windows, about 4 850 km of road. That is 100 random seeds (`wip/bug-105/rand100.txt`,
mulberry32 from `0xB105B104`), the 20 seeds in `seeds.txt`, and the known sites (capture 2 does not reproduce cold,
as recorded above).

**Result: 57 touches plus 1 unregistered crossing, in 44 windows.** The crossing is at seed 3502246374 (1628, 137),
with the decks 5.1 m apart and no bore.

**No touch is made by promotion geometry.** Every touch's two points lie on the plan's own final lines. So Stage 2's
backstop has nothing of its own to catch. Every touch is a plan-layer ownership question.

**By mechanism and severity.** The severity bands are by centreline separation:
- "overlap" is under 10 m, where the pavements lie on each other;
- "daylight" is under 22 m, which leaves less than the owner's 12 m of daylight between pavement edges;
- "banks only" means the pavements are clear, but one road's cut or fill reaches the other because of the height
  between them.

| class | overlap < 10 m | daylight < 12 m | banks only |
|---|---|---|---|
| **A: the clearance pass deferred the pair, and NO T was planned for it** | **9 (1 044 m)** | **14 (1 016 m)** | 3 (28 m) |
| B: legs of a planned T, 32–120 m from the T | 0 | 1 (32 m) | 19 (288 m) |
| B2: a mid-span T planned for the pair, the touch ~500 m away | 1 (76 m) | 1 (44 m) | 0 |
| C: inside the rule, not deferred (the clearance pass's own residue) | 0 | 2 (144 m) | 7 (168 m) |

**Class A is the bug the owner described.** It holds every pavement overlap but one, and most of the grazes:
BUG-105's mark, BUG-104's seeds 10, 51 and 52, 158847947, and the worst, seed 2078771719 (−165, −430), at 0.5 m apart
for 92 m. Splitting it by the plan GRAPH (a T promotion re-keys ends, so the shipped network's node sharing is not
the graph's):
- **23 are legs of one graph node** (1 796 m). This is the prototype `33b041f1`'s case.
- **4 are graph-disjoint** (292 m): 158847947, and three touches at seed 1276865166 (−212…−267, 215…254), all against
  edge `0,0,0|-1,1,2`. This is the disjoint forecast's case.

**Class B is not a graze.** These are two legs of a T whose pavements already have ≥ 12 m of daylight. Their banks
meet 32–120 m from the T because the legs sit 7–24 m apart in height. That is BUG-64's earthwork territory, and it is
the shape the owner's near-miss ruling (a) covers ("reads neither these nor BUG-64's walls as a problem in play").
The tolerance is just narrower than these: they miss by 1.2–7 m, over 4–44 m.

**Plan adjustment, from the numbers:**
1. **Two tiers.**
   - **GRAZE gates at zero:** centres under 2·HW + clearEdgeM (22 m), outside junction ground, plus every plan
     crossing. Over the census: **29 + 1**.
   - **BANKS is reported and ranked, not chased:** banks-only contact. Over the census: **29, all short**.
   - This narrows the plan's "zero inside FEAT-77's rule", and it is a call for the orchestrator and the owner. The
     recommendation is to adopt it, because chasing banks-only means moving T legs for earthwork the owner has said
     he does not read as a problem.
2. **Stage 1 is the fix.** Port `33b041f1` for the 23 legs-of-one-node pairs. Add the disjoint forecast for the 4.
3. **Stage 2 shrinks.** It no longer needs a shipped-line backstop. Its job becomes the four graze-tier pairs outside
   class A: B2's two, where the T owns one interval and the deferral wrongly covers the whole pair, and C's two.
   Each gets a look after Stage 1's census.

**Tier split ADOPTED (orchestrator call, 2026-11-06; the owner is told in the morning as information).** It rests on
two owner rulings:
- "i do care about grazing without an intersection" (11-06);
- BUG-64 (a), which waves off earthwork banks meeting between roads (10-31).

So:
- **GRAZE gates at zero:** centres under 22 m (under 12 m of daylight) outside junction ground, plus every plan
  crossing.
- **BANKS is reported, ranked, and not chased.**

The proof's "zero touches" means the GRAZE tier from here on.

### Stage 1 — built and measured (2026-11-06, `feature/spare` `010d5fa3` → `d2150de1`)

**The rule as built.** FEAT-77's clearance pass hands a close pair (pass-1 lines inside `mergeProxM`) to the T
machinery only when **`_v2MergeFor`'s own answer, asked on the PASS-1 lines, pairs the two roads**. A `pass1` mode
is threaded through `_v2MergeFor`, `_v2PromotableFor`, `_v2PromotableProbe` and `_v2NodeMerges`, so the question
reads no pass-2 line and no cycle forms. It is quiet: the skip tallies stay the real plan's. For a pair with no
shared node, the forecast is the disjoint planner's precondition: neither road holds a node-merge role.

A pair the pass now takes over is judged the way the gate judges it:
- past the **geometric** throat (`_v2ThroatLen`), and the router exempts that same throat;
- never on a stretch the forecast T cedes to its trunk;
- not at all if the pass-1 lines properly **cross** past 30 m. That pair stays with the crossing rungs (BUG-57),
  which own crossings.

**Each refinement was measured over the 127-window census** (`wip/bug-105/census*`; footprint = changed windows vs
main):

| step | GRAZE | changed windows (of them, no touch on main) |
|---|---|---|
| main (census 0) | 29 + 1 crossing, 2 356 m | — |
| prototype port + disjoint role forecast | 14 | 68 (41) |
| + geometric throat | 13 | 60 (36) |
| + pass-1 crossings stay with the crossing rungs | 15 | 25 (9) |
| + ownership = `_v2MergeFor`'s pass-1 answer (no buildable T, or outranked by the run's other end, owns nothing) | **10, 536 m** | 40 (17) |

Why the plan-only forecast was not enough:
- Three pairs had a node plan whose T could not be built (`promote-infeasible`).
- BUG-104's own seed-10 site had a plan that `_v2MergeFor` dropped, because the side road's larger merge at its other
  end won.

Now clean:
- BUG-105's mark;
- BUG-104's seeds 10 and 52;
- 158847947;
- the worst graze, seed 2078771719, 0.5 m apart for 92 m.

**Residue (10), for Stage 2.**
- **Separation fails** (seed 51, 5.4 m for 80 m; 2314412071; 1695296864). The loser re-routes, but FEAT-77's berth is
  a price, not a wall: `wClear` = 12 per metre inside, while the detour out of the valley costs more grade. Only a
  JOIN resolves these. This is the plan's forced-join rung.
- **B2** (87: 3.3 m for 76 m; 200398059). A mid-span T was planned for the pair, but on another interval about
  500 m away. The deferral still covers the whole pair.
- **Deferred with no owner** (2166453044, 1227226248). Not on main's list: collateral of Stage 1's moves. To be traced.
- **The unregistered crossing** at 3502246374 (1628, 137), decks 5.1 m apart. The crossing rung owns it but never
  resolves it. On main too.
- **Borderline** (2757792661, 1276689627: legs of Ts at 20–21.4 m, i.e. 10–11.4 m of daylight against the 12 m bar).
