# HANDOFF 2026-08-31 — junction-stitch, classified and ruled

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

## THE RULINGS (owner, 2026-08-31) — these are the spec

**R1 — "same height at the divergence" means the WHOLE DECK PLANE.** Height, camber and grade all agree.
The same bar as the roll half that shipped. Not centreline height alone.

**R2 — "clear of one another" is one road width CENTRE TO CENTRE.** The pavement edges just touch. With
`roadHalfWidth` 5 the hold releases at **10 m centre to centre**. (Tighter than proposed — I recommended
edge-to-edge, i.e. 20 m. Owner chose 10 m.)

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

### ⚠ The one thing NOT ruled, and it changes built geometry

R1 says the deck is one thing. R2 sets the release at **10 m**. The departure camber match that shipped
at `9e561ca` releases at `mergeProxM`, **18 m** (`D0 = 2·halfWidth`, `D1 = mergeProxM`). If camber and
height are one deck they should release together — which means **moving the shipped camber ramp from 18 m
to 10 m**. That is an inference from R1 + R2, not a direct ruling. **Ask the owner before building it.**

---

## CONFIRMED BUILD ORDER

**R4 → class A's sanction narrowing → R1+R2 (the B/C deck rule) → R3 (pad + gate) → R5 → R6.**
Cheapest and most certain first; the two that change world geometry before the two that change what the
gate reports.

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

### 2. Class A — narrow the crossing sanction

`_v2CededExtents` (`src/road.js:3441`) sanctions the merge's whole **planned** footprint —
`[band.joinCum, S.L]`. At site 03 (seed 11, 324 −458) that is the loser's arc **0–323**, while the two
roads are only genuinely coincident over **0–218**. The crossing sits at arc 300, inside the sanction,
so it is waived as "the winner's own geometry" on ground where the loser is flying its own line **7.2 m
in the air**. Verified by walking the loser against its winner: distance 0.0 m and dy 0.00 m out to 240,
then 12 m / 0.35 m at 260, 16 m / 3.75 m at 280, 2.2 m / **7.19 m** at 300.

Narrow the sanction to the stretch where the loser's vertices really are the winner's. That puts these
crossings back in front of the rung built to catch them.

**Trap:** `_v2CededExtents` is memoized per `ck` and sits inside the two-layer acyclicity contract — read
the BUG-57 notes on `_v2BundleSolve(g, drop, c1, c2, wide)` before touching it. Never pass `wide` from a
discovery/dry path.

### 3. R1 + R2 — the B/C deck rule

The pitch half of the invariant whose roll half shipped. `_applyDepartureCamber` already spans exactly
this stretch and already ramps on lateral separation. Build the height rule as the **same span, same
ramp**, applied to `gradeY`, with the clear point at **10 m centre to centre** (R2) instead of
`mergeProxM`. Under R1 it carries camber and grade too, not just height.

Class C needs the same rule with **no merge record to attach to** — sites 11/12 have no ceded strand and
no band. Whatever enforces it must fire on a bare divergence.

Must be applied in **both** consumers — `_buildCamberProfile` (ribbon + carve) and `_buildRunProfile`
(physics) — or MESH == PHYSICS breaks. That is how B4 was done; copy the shape.

### 4. R3 — the pad and the gate

Two halves. **World:** the fillet ladder must fit a fillet inside a 10 m radius, at nodes *and* at
divergence points. **Instrument:** `junction-stitch`'s `PADR` (`test/junction-stitch.mjs:87`) is
`roadJunctionCutback + roadFilletRadius` = **15 m** today; it comes down to 10 m, and the exclusion must
also apply around a fork's divergence point, not only around a node. Beyond the pad the bar becomes the
class-B deck rule rather than the generic edge-gap ruler.

This is what clears class E (6 sites) and settles how much of 06 / 15 / 17 is real.

### 5. R5 — the sibling-departure cost

`routeEdgeV2` (`src/corridor-router.js:992`) ladder is
`[[pin,{}], [null,{}], [pin,{structureCap:false}], [null,{structureCap:false}]]`. **Rung 2 drops the pin
entirely.** Unpinned, a leg is free to depart on its sibling's bearing — which BUG-53's own comment names
as *"the measured generator of the node-sharing overlap/crossing class"*. Replace rung 2 with a
separation-costed rung. **31 of 440** battery edges currently take a demoted rung (`_v2DirFallbacks` /
`_v2DirFallbackKeys`; 7 of 52 in site 01's own window).

### 6. R6 — merge vs a pinned approach

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
