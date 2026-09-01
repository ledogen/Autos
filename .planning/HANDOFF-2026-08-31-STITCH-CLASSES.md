# HANDOFF 2026-08-31 / 09-01 — junction-stitch, classified and ruled

The `junction-stitch` red is 105 pair-stretches. This session took the 19 worst (over 4 m past the
allowance), drew each one, put them in front of the owner, and got a full set of rulings. **Nothing in
workstreams A–E is built yet.** One unrelated fix shipped on the way (the departure-camber sign bug).

| | |
|---|---|
| Code | worktree `/Users/ledogen/CodeShit/CarGame-corridor-router`, branch `feature/corridor-router`, dev **:3343** |
| Head | `9e561ca` — one commit past the BUG-56 build pass |
| Docs | this file, on **main** (`df9e835`). The docs-on-main / code-on-worktree split is owner-confirmed |
| Artifact | https://claude.ai/code/artifact/2199dded-3980-49c0-ac8b-97879204966e — all 19 sites, plan panel + in-game view + facts, the class definitions, the shared root cause, and the rulings |

Read the artifact first. It has the pictures, and every number below is on it.

---

## What shipped this session: the departure camber match had its sign wrong

`9e561ca`. Camber is a **run-frame** angle — `+camber` banks toward that run's own `+lateral` axis
`(t.z, -t.x)`. `_applyDepartureCamber` (BUG-56 B4) copied the winner's angle verbatim, but a leg that
cedes its START to the winner's END walks the shared stretch **backwards**, so its `+lateral` is the
winner's `-lateral`. The raw copy banked the leg the opposite way *in the world*: two pavements on one
piece of ground tilted 2× camber apart.

Owner reproducer seed 21 (218,255): ±2.5 m of ribbon-edge disagreement over 42 m of ceded strand.
**35 of the battery's 64 departure spans are antiparallel**; 31 exceeded 0.5 m.

Fix: `_nearestOnPolyXZ` now also returns the winning segment's unit tangent, and the match multiplies
the winner's camber by `sign(dot(tLeg, tWin))`. Battery world-space bank disagreement: worst
5.62 → **3.55 m**, median 1.52 → **0.58 m**, >1 m 38 → 20. The B4-disabled arm medians 2.50 m, so the
mechanism was right and only the sign was wrong.

**Why it survived B4's build pass:** `junction-stitch`'s *fork ROLL residual* line subtracted the two
run-frame angles **unsigned** and printed 0.0° on decks tilted 30° apart. Fixed in the same commit;
reversed pairs now print `(rev)`. **Lesson worth keeping: a diagnostic that shares the code-under-test's
frame assumption cannot falsify it.**

Gates: 29/34 affected green, and the five reds are the five already booked in
`HANDOFF-2026-08-27-BUG-56-build.md`. `restream-invariance` and `world-determinism` both green.

---

## The five classes

19 sites, of which **8 need fixing**, 2 work with minor disagreement, and **9 are not defects**.

| | class | sites | to fix | symptom |
|---|---|---|---|---|
| **A** | Parallel inlet, crossed legs | 01 03 05 | 3 | centrelines cross in plan with metres of air between the decks |
| **B** | Shared path, then divergence | 02 04 06 13 15 17 19 | 2 | share ground, then part with the decks metres apart while the pavements still overlap |
| **C** | Bare divergence — no shared run, no pad | 11 12 | 2 | the asphalt steps vertically at the split, with no merge record to hang a rule on |
| **D** | A corridor neither avoided nor merged | 07 | 1 | two roads down one corridor, no merge, nearest node 290 m away |
| **E** | Not a defect — the measured junction is far too big | 08 09 10 14 16 18 | 0 | the gate scores ground 20–66 m out from a node that merges and drives fine |

Sites 11 and 12 are **one piece of ground** — the gate dedupes per run *pair*, so a three-legged node
yields up to three rows. Fixing that is instrument work, listed below.

---

## THE RULINGS (owner, 2026-08-31 / 09-01) — these are the spec

**Read R8 first: it is the architecture and it governs R1 and R2.**

**R1 — "same height at the divergence" means the WHOLE DECK PLANE.** Height, camber and grade all agree.
The same bar as the roll half that shipped. Not centreline height alone.
*Narrowed by R8:* this binds **at the shared edge**, where height agrees by construction and camber is
capped at 15–30°. It is no longer "force two overlapping decks coplanar" — that state stops existing.

**R2 — "clear of one another" is one road width CENTRE TO CENTRE.** The pavement edges just touch. With
`roadHalfWidth` 5 that is **10 m centre to centre**. (Tighter than proposed — I recommended edge-to-edge,
i.e. 20 m. Owner chose 10 m.)
*Promoted by R8:* 10 m is **not a blend release point**. It is the geometric definition of when two roads
become two roads — below it one surface, at it a wye, above it two decks.

**R3 — a pad reaches 10 m at most, from the node OR the point of divergence.** 10 m radius, maximum, so a
20 m plaza. **The rule applies at a fork as well as a node** — the divergence point is a pad centre in its
own right. A deep Y takes a *smaller fillet*, never a bigger junction. (Tighter than proposed.)

**R4 — heading pins AND junction surfaces both read the BUILT degree.** Yes to both halves;
`_runEndpointJunctions` moves with `_v2NodeThrough`, no census first.
> **Standing principle, owner:** *"If we can distinguish between different classes of junctions we should
> use the appropriate method for each."*

**R5 — a narrow sibling-departure cost, and nothing wider.** A cost at the node, applied only on the
demoted rung: pay to depart within X° of a sibling. QUAL-26's full two-pass stays banked.
**It must be a COST, not a heading gate** — QUAL-19's Architecture A is disproven.

**R6 — a merge that would overwrite a pinned approach is a PREFERENCE, not a hard rule.** Decline where
it is safe to, count where it is not. Evidence for not going hard: BUG-56's B3 made a comparable seam rule
a hard acceptance criterion, declined 16 of 67 merges, handed the crossing rung a leg to delete, and
**split seed 7 into two components**.

**R7 — node relocation stays HELD.** Do R4 and R5, then re-measure. Opening it means revisiting the
standing "no elevation in site scoring" ruling.

Also settled: **site 19 is class B.**

**R8 — THE ARCHITECTURE RULING (owner, 2026-09-01). It governs R1 and R2, and it is the whole design.**

> Today, when two roads want to leave on the same heading, we **spawn two overlapping decks and force them
> coplanar**, because that is the only state the machinery can express. That is the wrong shape.

Three states, and the middle one is the wye:

| centre to centre | what exists |
|---|---|
| **under 10 m** | **ONE surface.** The two roads run collinearly, or one segment is deleted and the other is the source of truth. *Two overlapping decks is not a legal state.* |
| **at 10 m** | **The wye.** The two decks **share an edge**. Height agrees by construction — it is one edge. Camber may differ across it by at most **15–30°**. |
| **over 10 m** | **Two roads.** Each gets its own full deck, own camber, own grade. |

The crease at the shared edge — owner is fine with **any of these three**:
1. **Flat deck** across both.
2. **Sharp crease.** A slight peak perpendicular to travel is not a problem — you carry very little
   velocity across it.
3. **Continuous curve** — integrate the camber difference across the whole road width rather than creasing
   it. What a real road does.

> **The binding condition, owner:** *"we just have to make sure that they are done properly and **always
> spawn for the class that they help resolve**."*

Whichever is built must fire in **every** case of its class. No preference-with-a-gap. (This is the same
failure shape as BUG-56's 31 junctions with no pad at all.)

**Measured against the world as built:**
- **64 of 64** ceded strands in the battery release at **exactly 0.00 m** separation — min, median and max
  all zero. The loser leaves the winner's geometry *while still precisely on top of it*. Under R8 a ceded
  strand ends when separation reaches **10 m**, not 0. **That one number is most of the bug.**
- **256 run-pairs · 12.8 km** of road, outside every 10 m pad (R3), currently carry independent decks
  within one road width of another run. Worst deck disagreement inside that band: **9.55 m**, seed 6
  (3069,1007). That is the gateable quantity.
  (Script: `scratchpad/r8census.mjs` — promote it to `test/`.)

### What R8 settles about the camber ramp — the question that was flagged

**The ramp is DELETED, not retuned.** `_applyDepartureCamber` blends from `D0 = 2·halfWidth` (10 m) to
`D1 = mergeProxM` (18 m). Under R8 both ends are wrong: below 10 m there should be one deck, so there is
nothing to blend; above 10 m the roads are already a road width apart and each should be free.
**`mergeProxM` measures SHARED EARTHWORKS — a different question from whether the decks overlap**, which
is exactly the distinction the owner drew. R8 replaces a blend with a boundary condition at the wye.

*Reading, not a ruling:* the camber cap binds **at** the wye and relaxes as the gore opens past it, since
the owner called a slight perpendicular peak acceptable and the gore hygiene. Confirm if the cap was meant
to hold further out.

### How R8 changes each class

- **A** — subsumed in part. At site 03 the loser comes back within **2.2 m** of the winner at arc 300 with
  7.2 m of air. R8 forbids that outright, so the sanction narrowing has less to catch once R8 lands.
- **B** — the whole class is "the ceded strand released at 0 m". Nothing to blend; extend the strand.
- **C** — sites 11/12 sit within one road width with independent decks and **no ceded strand at all**, so
  the rule cannot hang off a merge record. R8 must spawn here as reliably as anywhere else — this is the
  case that tests the binding condition.
- **D, E** — unchanged.

---

## CONFIRMED BUILD ORDER

**R4 → R8 stage 1 → R8 stage 2 → class A's sanction narrowing → R3 (pad + gate) → R5 → R6.**

R8 moved up and split in two: its first stage is a one-number change with a measured target, and it
shrinks every other class before they are touched. **R1 and R2 are no longer a step of their own** — they
are the acceptance bar on R8 stage 2. The old "hold two decks coplanar" work is **deleted rather than
built**, which is why `_applyDepartureCamber`'s ramp comes out.

### 1. R4 — pins and surfaces from the built degree

`src/road.js:2484` `_v2NodeThrough` reads `g.adj.get(nk)` and requires exactly 2 neighbours. At seed 6
node `4,1,1` the graph lists three (`3,1,0 | 5,0,1 | 5,1,0`) but **only two edges are built** — the
crossing rung deleted `g:5,0,1:4,1,1`, recorded in `_v2Deleted`, and the pair it crossed was its own
sibling `3,1,0|4,1,1`. So the node that *became* a through node never gets the tangential through pin,
falls to two independent chord pins, and its two legs (chords **173° apart**) end up departing 14° apart.
A road that should pass straight through comes in and doubles back.

`_runEndpointJunctions` (`src/road.js:9000`) reads the same `_graphDegreeOf` to choose `flatCamber` and
the pad plane, so a node with two built legs can be getting the three-way flat-plaza treatment. R4 moves
both.

**Trap:** it changes routes → **re-keys the route cache, needs a re-bake**. `restream-invariance` and
`world-determinism` are the gates that catch a mistake. The surface half will move `road-smoothness` and
`pad-census`; expect it, and diff rather than assume.

### 2. R8 stage 1 — a ceded strand releases at 10 m, not 0 m

The cheapest real change on the board and the one with the clearest target. Today every ceded span ends
where the loser's own geometry resumes, and **all 64 in the battery end at 0.00 m of separation**. Extend
each strand until the loser's centreline is **one road width (2·`roadHalfWidth` = 10 m)** from the
winner's. Everything upstream of that point is one surface and needs no deck reconciliation at all.

`cededSpans` already carries `{s0, s1, owner, ownerS0, ownerS1}` and the slicer already suppresses the
ceded interval (`src/road.js:5282`), so the ribbon and the carve follow for free. What changes is where
`s1` lands, decided in the merge planner (`_v2RegisterMerged` / `_v2RegisterMidSpan`).

**Watch:** a longer ceded strand means a shorter own-geometry tail, and a tail shorter than the band
vocabulary's minimum may make a merge unsolvable → declined → R6's counted fallback. Measure the merge
and deletion counts either side; a drop in merges is what split seed 7 last time.

### 3. R8 stage 2 — the wye: shared edge, capped camber

Where the strand now releases, the two decks must **share an edge**: total paved width grows from one
road width to two, the shared edge is one polyline (so height agreement is structural, not enforced), and
the camber difference across it is capped at 15–30°. Past the wye the edges part and each road takes its
own full deck.

Pick one crease treatment from R8's three and build it properly. **It must spawn for every case in the
class** — including class C, which has no merge record to hang it on. Class C is the acceptance test for
that condition, not an afterthought.

This is where R1 (deck-plane agreement) and R2 (10 m) are the acceptance bar. Apply in **both** consumers
— `_buildCamberProfile` (ribbon + carve) and `_buildRunProfile` (physics) — or MESH == PHYSICS breaks.
That is how B4 was done; copy the shape. And **delete `_applyDepartureCamber`'s D0→D1 ramp** as part of
this step rather than leaving it to fight the new rule.

### 4. Class A — narrow the crossing sanction

`_v2CededExtents` (`src/road.js:3441`) sanctions the merge's whole **planned** footprint —
`[band.joinCum, S.L]`. At site 03 (seed 11, 324 −458) that is the loser's arc **0–323**, while the two
roads are only genuinely coincident over **0–218**. The crossing sits at arc 300, inside the sanction, so
it is waived as "the winner's own geometry" on ground where the loser is flying its own line **7.2 m in
the air**. Verified by walking the loser against its winner: 0.0 m / 0.00 m out to arc 240, then 12 m /
0.35 m at 260, 16 m / 3.75 m at 280, 2.2 m / **7.19 m** at 300.

Narrow the sanction to the stretch where the loser's vertices really are the winner's. **Re-measure after
R8** — extending the ceded strand moves the coincident interval, so this may be much smaller than it looks
now.

**Trap:** `_v2CededExtents` is memoized per `ck` and sits inside the two-layer acyclicity contract — read
the BUG-57 notes on `_v2BundleSolve(g, drop, c1, c2, wide)` first. Never pass `wide` from a discovery/dry
path.

### 5. R3 — the pad and the gate

Two halves. **World:** the fillet ladder must fit a fillet inside a 10 m radius, at nodes *and* at
divergence points. **Instrument:** `junction-stitch`'s `PADR` (`test/junction-stitch.mjs:87`) is
`roadJunctionCutback + roadFilletRadius` = **15 m** today; it comes down to 10 m, and the exclusion must
also apply around a fork's divergence point, not only around a node. Beyond the pad the bar becomes the
class-B deck rule rather than the generic edge-gap ruler.

This is what clears class E (6 sites) and settles how much of 06 / 15 / 17 is real.

### 6. R5 — the sibling-departure cost

`routeEdgeV2` (`src/corridor-router.js:992`) ladder is
`[[pin,{}], [null,{}], [pin,{structureCap:false}], [null,{structureCap:false}]]`. **Rung 2 drops the pin
entirely.** Unpinned, a leg is free to depart on its sibling's bearing — which BUG-53's own comment names
as *"the measured generator of the node-sharing overlap/crossing class"*. Replace rung 2 with a
separation-costed rung. **31 of 440** battery edges currently take a demoted rung (`_v2DirFallbacks` /
`_v2DirFallbackKeys`; 7 of 52 in site 01's own window).

### 7. R6 — merge vs a pinned approach

Preference with a counted fallback. At seed 21 node `1,0,2` all three legs routed with
**`usedPin: true`** — the router did its job — and the merge then replaced one leg's pinned approach with
its sibling's geometry, choosing the pairing 86° apart over the through axis 160° apart.

---

## Instrument repairs — no ruling needed, ride along

1. **`junction-stitch` must dedupe by position, not by run pair.** A three-legged node yields up to three
   rows for one piece of ground (sites 11 and 12).
2. **Node degree on any diagnostic must come from the built network**, not `g.adj` — this is what made
   site 14's panel disagree with its screenshot, and the owner caught it.
3. **Tunnel exclusion is too narrow.** The gate excludes the bore span ±5 m but not the approach cut.
   Site 01's worst sample sits 77 m outside the portal where the two roads are 11 m apart on purpose.
   8 of the 105 sites involve a tunnel; 1 of the 16 worst.

---

## TRAPS — every one of these cost real time

1. **NEVER `git checkout src/road.js` in the worktree the owner is viewing** (:3343). To A/B a mechanism,
   patch `RoadSystem.prototype.<method>` in a throwaway script — that is how the B4-on/off/fixed table was
   produced with zero file edits.
2. **String seeds MUST go through `parseWorldSeed`.** A raw `'lone-pine'` builds a garbage world.
3. **`_v2DirFallbacks` under-reports.** It only increments on the synchronous `_edgeCenterline` path and
   only when `res.feasible`. To know whether an edge kept its pin, call `routeEdgeV2` directly and read
   `usedPin` — that is how site 01 was confirmed.
4. **A straight-ray terrain probe is a poor predictor of routability.** Across 189 nodes the wide-cone
   group showed *fewer* clear rays (median 2) than the narrow-cone group (median 4). Roads climb obliquely
   and switchback. Use it as a reading of one site, never as a metric.
5. **A mean-grade test averages straight through a wall.** The first pass of the cone census used mean
   grade over 150 m and called a cliff affordable. Use the worst 40 m stretch.
6. **Screenshot recipe that works:** `node test/screenshot.mjs <x> <z> --port=3343 --seed=<s>
   --height=58 --pitch=-0.95 --zoff=42 --wait=30000`. `--wait` 30000, not the default. Steep oblique —
   roads sit in deep cuts and a shallow camera photographs the terrain backface. To hide the HUD for a
   clean frame, inject a style that `display:none`s every non-canvas child of `<body>`. For a batch, drive
   one browser via `test/lib/cdp.mjs` and move `window.__view(x,y,z,yaw,pitch)` between shots.

---

## Scripts left in the scratchpad

`/private/tmp/claude-501/-Users-ledogen-CodeShit-CarGame/fad88c39-70c1-48e6-b22a-7cac31e5b6ac/scratchpad/`
— `sitemaps.mjs` (builds the 19 topology panels + `sites.json`), `build_page.py` (renders the artifact),
`censusCone.mjs` (leg-cone census), `pin01.mjs` / `pin02.mjs` / `pin04.mjs` (pin and deletion probes),
`census2.mjs`/`census3.mjs` (departure-camber A/B), `shoot.mjs` (batch in-game shots). Scratch only — copy
anything worth keeping into `test/` as a gate.

## Where the numbers live

`.planning/HANDOFF-2026-08-27-BUG-56-camber.md` (the plan), `-BUG-56-build.md` (what shipped and the five
booked reds), `.planning/ROAD-CLOSEOUT-PLAN.md` (the crossing invariant and the work order),
`.planning/todos/pending/qual-26-sibling-clearance-routing.md` (the banked two-pass).
