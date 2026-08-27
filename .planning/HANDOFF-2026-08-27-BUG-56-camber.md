# HANDOFF 2026-08-27 rev 3 — the road close-out plan

**Rev 3 (same day, second owner pass) adds two rulings and re-cuts the build order; every
measurement is rev 2's and stands unchanged.** The rulings: **(1) the reroll validates the whole
nine-tile world ONCE at story-RUN start**, not at region entry — a mid-run region cannot demand a
reroll of a world the player has progressed in; a one-time "generating world" wait at new-game is
accepted, and the mitigation is making workstream C's re-route rung strong so condemnation is rare.
**(2) The profile ladder's ceiling IS the strict grade limit, expressed as `gMaxRoad + gradeTol`** —
deliberately lenient, because a grade failure is cheaper than a connectivity violation; `wGrade`
stays the routing dial that keeps AVERAGE grade pleasant. Build order: **C (never drape) is promoted
ahead of the fork polish** — grade is the owner's priority 1 and C does not depend on B1's
instrument.

**Rev 2 replaced rev 1.** Rev 1 said one thing was left (camber through a fork). The
owner drove the world again on 2026-08-27, re-scoped the work, and a fresh set of measurements says
camber is one of **five** independent mechanisms — and at the owner's own reproducer it is not even
the worst one. Rev 1's proposed camber fix survives as item 3 below. Everything else is new, re-ruled,
or corrected.

Read this, then `.planning/todos/pending/bug-56-junction-fork-disjunction.md`, then
`.planning/ROAD-CLOSEOUT-PLAN.md`. Memory: `[[project_bug56_departure_hold]]`,
`[[project_bug57_crossing_rung_state]]`, `[[project_road_closeout_plan]]`.

## Where things are

| | |
|---|---|
| Code | worktree `/Users/ledogen/CodeShit/CarGame-corridor-router`, branch `feature/corridor-router`, dev **:3343** |
| Docs / tickets | `/Users/ledogen/CodeShit/CarGame` (main) — the established split, confirmed correct by the owner 2026-08-27 |
| Head | `63b0e21` fork band arc allocation |
| Gate suite | `npm run test:all` → 47/51. Reds: `junction-stitch` (BUG-56, allowed red), `paper-tour`, `mission-network`, `pond-route-around` (three booked instrument re-baselines) |

## The owner's bar (2026-08-27), in priority order

**1. Grade — the road must be drivable.** Explicitly **not** by tightening the cap. Quote: *"mainly i
dont want to destroy connectivity by strictening grade compared to the very lenient fall back to
terrain we currently have."* `gMaxRoad` stays 0.24, the 38 % ceiling stays (rev 3: re-expressed as
`gMaxRoad + gradeTol` — see workstream C), `wGrade` stays the dial
that shapes what the router prefers. The thing that must die is the **terrain-follow drape** — the
unbounded fallback that produces 108 % grades. Ladder: solve ≤ 38 % → **re-route** → **deterministic
seed advance**, the world declared broken.

**2. Junctions.** Leg behaviour on the approach first, pad formation second.

**3. A play-area gate.** Story mode will eventually be **nine regions: a 3×3 grid of 4000 m square
tiles, 12 km × 12 km, 144 km²** (owner-specified 2026-08-27, replacing the earlier 7–8 discs sketch).
The owner wants a gate — run whenever terrain or router settings change — that proves a playable,
**fully connected** area is generatable at all, because settings exist under which *no* seed can start
a story run.

## The corrections rev 1 needs

- **"The XZ departure was already fine"** — half true. 10 m of lateral clearance in 17 m of arc is a
  **22 m turn radius**. That is above `roadMinTurnRadius` (15) so it is legal, but it is exactly what
  drives the camber to its cap. Not a routing defect; not "fine" either.
- **"The band's fold floor is not the cause"** — right about camber, WRONG about the road, and
  this is the correction that matters most. `camberKneeRadiusM` is 60 m, so 6 m and 15 m saturate the
  bank identically — which tells you nothing about whether the corner is drivable. Measured 2026-08-27:
  **the taper bands are the tightest geometry in the whole network.** Do not re-run the camber half of
  that experiment; DO fix the floor (item 3b).
- **The owner's read on the departure hold was right, but only half.** It does manufacture the 24 %
  climb-out at the reproducer (measured below). It is not removable: removing it costs
  road-smoothness GREEN and doubles the junction-stitch site count. It is **incomplete**, not wrong.
- **A drape is evidence of load-bearing connectivity, not evidence of a spare edge.** (Owner,
  2026-08-27.) The drape only fires because nothing solved on that corridor, so condemning the edge
  is an improvement only if the re-route succeeds. An earlier claim in this session that replacing a
  drape "strictly improves connectivity" was wrong.

---

## Measurements — 2026-08-27, do not re-derive

Grade sampled every 4 m over a ±10 m baseline. Windows are `junction-stitch`'s eight.

### The grade census — 361 edges, 280.7 km

| | share of road |
|---|---|
| over 20 % | **7.79 %** |
| over 24 % (`gMaxRoad`) | 3.62 % |
| over 30 % | 0.28 % |
| worst single spot | **108 %** |

Where the offences live: **open road 71.4 %** of them (6.67 % of open-road length) · within 60 m of a
node 21.6 % · inside a merge band 5.9 % · band ∩ node 1.1 %. So grade is overwhelmingly a solver
question, not a junction question.

### The solver's rungs — this is the whole grade story

`src/road.js:4681-4704` tries the profile solve four times: 24 % → finer elevation step → 27 % →
38 %. Across the battery: **cap 1049 · fine 0 · relief-27 % 6 · ceiling-38 % 17 · no solve at all 4.**

Those last 4 hit `src/road.js:4705`, which sets `pts[i].y` to **raw terrain height** with 60 m blends
onto the node heights, and applies no grade bound whatsoever. `g:8,1,0:9,1,0` (seed 6) climbs 62 m in
85 m of arc: that is the 108 %. There is no 38 % violation anywhere — there are four places where
nothing was designed and nobody checked the result.

### Lowering `gMaxRoad` is not the lever (owner ruled it out; recorded so nobody retries)

| cap | road length | > 20 % | > 24 % | relief / ceiling rungs | worst |
|---|---|---|---|---|---|
| 0.24 | 280.7 km | 7.79 % | 3.62 % | 6 / 17 | 108 % |
| 0.20 | 281.5 km | 5.11 % | 0.66 % | 16 / 30 | 108 % |
| 0.18 | 280.1 km | 5.23 % | 0.72 % | 5 / 50 | 108 % |

Lowering the cap never touches the worst offenders, because they come from the *absence* of a solve.
0.18 is measurably worse than 0.20. The truck holds 22 % in 2nd gear without hunting
(`test/drivetrain-climb.mjs`), so 24 % is not the driveability problem.

### The departure hold A/B

Method: neutralise `_v2DepartureHold` by patching `RoadSystem.prototype` inside a scratch script.
**No `src/` edit, no `git checkout` — see TRAP 1.**

| | hold ON | hold OFF |
|---|---|---|
| owner's mark-A leg, worst grade | **24.0 %** @ arc 142 (at the fork) | **19.8 %** @ arc 650 — the fork spike is gone |
| `junction-stitch` sites | **17** | 37 |
| `road-smoothness` | **GREEN 3/3** | RED (lone-pine, 16 cm) |
| merges / deletions | 56 / 12 | 56 / 12 |
| battery > 20 % / > 24 % | 7.79 % / 3.62 % | 7.66 % / 3.48 % |

The hold buys a stitched deck and pays for it in climbing room. It needs a grade test, not deletion.

### Mark A — seed 6 (−1589, 1338), leg `g:-3,1,1:-4,2,0`

Cedes 0–96 m to `g:-3,1,1:-3,3,2`; off-curve 0–142.

| arc | what | grade | turn radius | camber |
|---|---|---|---|---|
| 0–95 | ceded, riding the winner | −17 % | 260 m | −13.1° |
| 100 | the fork | −13.8 % | **22 m** | −1.1° |
| 115 | | +12.9 % | 109 m | **+17.0°** |
| 140 | | **+24.1 %** | 40 m | **−16.5°** |
| 160 | back on its own line | +20.6 % | straight | 0° |

Three defects stacked in 45 m: a 22 m radius, a **34° camber swing** (the owner's "30 deg deck
angle"), and a grade reversal from −17 % to +24 %.

The grade half has a cause nobody had looked at. The leg cedes 96 m to a through road that is
**diving 17 %**, so it reaches the fork 10 m below where its own route wanted to be, and must then
claw back 22 m of climb. The cession is decided on plan-view proximity alone — nothing checks whether
the two roads are going to the same place vertically.

### Mark B — seed 6 (−2507, 4209), leg `g:-4,6,0:-4,7,1`

Cedes 0–76 m to `g:-5,6,1:-4,6,0`. Grade is fine here (peak 15.3 %). Min radius **20.8 m** at arc 80.
Camber: −4.8° (75) → **−18.9°** (85) → −13.5° (100) → +9.0° (115) → **+15.9°** (120) → +1.3° (135).
A 35° swing in 35 m. **Mark B is camber and radius only** — same fork mechanism, no grade component.

### Taper-band turn radius vs the rest of the road — 70 bands across the battery

| | 1st pct | 5th pct | median | 75th pct |
|---|---|---|---|---|
| open road | 24.8 m | 70.3 m | 308 m | — |
| **taper band (min R inside the band)** | — | **14.9 m** | **23.3 m** | 31.1 m |

The MEDIAN taper band is tighter than the FIRST PERCENTILE of open road. 38 of 70 are under 25 m,
and **4 are under `roadMinTurnRadius` (15 m)** — tightest 12.8 m, `s11 g:2,-3,2:1,-2,0` at
(1469, −1148). The band ladder's floor is `RFLOOR = 6`, less than half the road's own minimum, and
the ladder takes the **first** band that clears it rather than the gentlest available
(`src/road.js:2911`, `:2976`).

This is the owner's original plan-view complaint stated numerically: *"a road coming in perpendicular
and then last second turning to be parallel"* IS a 13–23 m radius turn in a network that otherwise
never goes below 25 m.

### Mark C — seed 6 (−870, 2468): the road that just ends. Confirmed, and rare.

Node `-2,3,1`. Two legs start at (−870, 2486) y 62.8 and (−874, 2486) y 63.0. The third,
`g:-3,3,2:-2,3,1`, **ends at (−870, 2470) y 64.6 — 17.3 m sideways and 1.60 m up from the node**,
outside the pad's ~15 m reach (`roadJunctionCutback` 10 + `roadFilletRadius` 5). The road stops in a
field, exactly as the owner described.

Cause: it carries `offCurveSpans` 879.8–1047.3 owned by `g:-2,3,1:-3,4,2` and **no** `cededSpans` —
i.e. a SHOVE deflection, not a merge. The shove builds its displacement field over
`[r0 − padI, r1 + padI]` under a smoothstep envelope but never forces the field to zero at `i = 0` or
`i = nS-1`. When the contact region reaches a run end the endpoint takes the full deficit; 17.3 m is
under the 30 m `DCAP`, so it passes every existing check.

**Census: 260 nodes across all 8 windows, exactly ONE is broken, and it is the owner's.** This is a
narrow bug with a one-line-shaped fix, not a class.

---

### THE MISSING-PAD CLASS — new 2026-08-27, and it is the biggest count in this document

Owner report: *"the bug class where no junction pad generates, for example seed 6 (−3862, 884)."*
Confirmed and censused across all 9 windows:

| | |
|---|---|
| junction clusters total | **274** |
| no pad because degree-2 (a connector arc instead — **by design**, QUAL-16) | 83 |
| **≥3-leg junctions whose RING BUILD FAILED — a real intersection with NO junction surface** | **31** |

**31 of 191 real junctions — 16 % — have no pad at all.** The owner's site is one:
node `(−3866, 885)`, **4 legs**, `ring = NULL`.

Mechanism (`_buildJunctionRing`, `src/road.js:6760-6770`) — a three-rung ladder that can end in
nothing:

```js
let ring = this._junctionRingWeld(node, 1.0)
if (ring && this._ringSelfIntersects(ring)) ring = null
if (!ring) { ring = this._junctionRingWeld(node, 0.5)
             if (ring && this._ringSelfIntersects(ring)) ring = null }
if (!ring) ring = this._junctionRingLegacy(node)
return (ring && ring.length >= 3) ? ring : null      // ← 31 nodes land here
```

The exact weld self-intersects at BOTH scales and the legacy circle-pad fallback also fails or
returns fewer than 3 points. `ring = null` then makes **every** consumer skip the node — pad carve,
`padReachNodes`, and the mesh's ring branch. The legs are still cut back, so what ships is a naked
gap where the intersection should be.

**Note the interaction with mark C.** Clusters form by endpoint proximity, `EPS2 = (halfWidth·0.75)²`
≈ 3.75 m (`src/road.js:6604`). Mark C's shoved endpoint is **17.3 m** off — far outside that — so it
never joins the cluster, the node drops from 3 legs to 2, `node.deg2` sets `ring = null`, and the
junction silently becomes a connector arc. **B2 (the shove pin) may therefore fix a pad as well as an
endpoint.** Check that before treating them as separate.

## The plan — owner ruling 2026-08-27: **make the Y work, do not replace it**

The owner considered promoting forks to real nodes (a T at the fork) and ruled against it:
*"lets just make the y mechanism work nice like the junction pad code. do what is necessary to the
router as well as the junction pass."* So the taper band stays, and it gets first-class treatment.

### The invariant, owner-stated 2026-08-27: **the joining road's NORMAL matches the through road's**

The owner corrected the gore framing: *"the v gore is mostly a fill not a smooth driveable surface.
i think the most important thing is the road normal direction matches the mid edge."*

That is the right statement and it simplifies the pass. A deck's normal is set by two things —
**transverse camber** and **longitudinal grade**. So "normal matches" is not a new item; it is the
single invariant that B4 and B6 are the two halves of, and it is the acceptance bar for both:

> Through the departure, the joining leg's deck plane is the through road's deck plane.
> Camber gives it the roll; grade gives it the pitch. Both, or the car is thrown.

The **gore is fill, not a driving surface.** It has to be continuous — no stepped wall, no wedge of
raw terrain piercing the asphalt — but nobody drives across it, so it does not need the pad's paving
quality. It is demoted from headline to hygiene (B3).

### The reframe that makes B3 cheap: the pad already solves the Y — at a node

`src/road.js:101-118` carries `THROAT_GAP` / `THROAT_SEP_MULT` / `THROAT_TRIG_MULT`, built for a
defect its own comment calls *"the gore (the V between the two diverging ribbons) as raw terrain even
though it's carved flush — a tan wedge piercing the asphalt"*. **That is BUG-56's original
screenshot**, at a node instead of a fork. So B3 is a port of working, measured machinery.

Six things a deg-3 node gets and a fork does not:

| the node pad has | the fork's equivalent | item |
|---|---|---|
| **camber → 0** over `roadJunctionBlendLength` at `flatCamber` nodes | nothing — `_computeCamberArrays` has no span hook | **B4** — normal, roll half |
| **decks reconciled** (`_graphJunctionGradeY`) + **grade clamped** to `roadJunctionPadMaxGrade` + `slopeAway` | `_v2DepartureHold` reconciles height and ignores grade | **B6** — normal, pitch half |
| **turn radius disciplined** by `roadFilletRadius` / min radius | `RFLOOR = 6`, under half the road's own minimum | **B5** |
| **an acceptance guard** (`mergePadArrivalMax`) | nothing at the departure end | **B6** |
| **gore paved + carved as ONE footprint** (`THROAT_SEP_MULT`, `_throatSweep`) | two ribbons overlap, carve composes two bodies — the stepped wall | **B3** (hygiene) |
| **a ring at all** | — and 31 real junctions do not get one either | **B0** |

## Workstream B — the junction pass

### B0. The missing-pad class — 31 real junctions with no junction surface

Biggest count in the plan and the owner's newest report. `_buildJunctionRing` must never return
`null` for a ≥3-leg cluster. Diagnose in this order:

1. **Why does the exact weld self-intersect** at both 1.0 and 0.5 fillet scale? Likely candidates:
   two mouths whose chords already overlap (legs arriving within a ribbon width of each other — the
   same slow-diverging Y this whole ticket is about), or a leg whose cut-back point lands past
   another leg's mouth.
2. **Why does `_junctionRingLegacy` also fail?** It is the circle-pad fallback and is supposed to be
   unconditional. If it can return `<3` points there is no floor under the ladder at all.
3. **Add a real floor.** A ≥3-leg junction always gets *some* ring, even if it is a plain
   `LEGACY_PAD_FLARE` disc sized to the widest mouth. A crude pad beats a naked gap.

Check the mark-C interaction first (see the measurement section): the shove's 17.3 m endpoint
displacement drops a node below the 3.75 m cluster radius, so **B2 may fix some of these 31 for
free.** Re-census after B2 before diagnosing the remainder.

New gate `test/pad-census.mjs`: **zero** ring-build failures on ≥3-leg clusters across the battery.
Baseline: 274 clusters, 83 deg-2 (fine), **31 failures**.

### B1. Close the gate hole FIRST — it is the instrument for everything else

`test/junction-stitch.mjs` compares **centrelines only**. That is exactly why it printed mark A as
fixed while the owner was looking at a 30° deck. Extend it to the ribbon **edges**: at each sample
take `y ± halfWidth · sin(camber)` on both runs and apply the same
`gap ≤ 0.15 m + separation / roadFillSlope` rule to the edge pair. Without this, B3–B6 cannot be
shown to work.

### B2. The shove must not unpin a node

Multiply the deflection field by an end window that is 0 at each run endpoint and ramps over
`min(RAMPL, distance-to-end)`. The existing fold-floor and re-crossing checks then judge the tapered
field; a shove that can no longer clear falls to the next `RAMPL` rung and finally declines — that
path already exists, so nothing downstream is new.

New gate `test/node-pin.mjs`: every pair of legs at a shared node starts within a few metres of each
other. Baseline to beat: 260 nodes, 1 violation.

### B4. Departure camber — the ROLL half of the normal match

Owner ruling: **match, then ease off.** Add `_applyDepartureCamber(runKey, arcPos, camberRad)`
mirroring `_applyJunctionBlend`: across the departure, blend from the **winner's camber at the fork**
to the **leg's own camber once laterally clear**. Ramp on lateral separation, not arc — the invariant
is *"while you are on top of the through road, your bank is its bank"*, the exact partner of the
height rule the hold already enforces.

Record the departure extent on the registered run at assembly time (`endData` already knows it).
Apply in **both** consumers — `_buildCamberProfile` (ribbon/carve) and `_buildRunProfile` (physics) —
so MESH == PHYSICS holds.

Do NOT ramp to zero at the fork: the winner is banked 13.1° there, and flattening the leg re-creates
the mismatch at the spot being fixed.

### B5. Band geometry — the pad's fillet discipline, ported

- **Raise `RFLOOR` from 6 to `roadMinTurnRadius` (15).** A band may not be tighter than the road's own
  contract. It currently produces 4 outright violations, tightest 12.8 m.
- **Prefer the gentlest band that clears, not the first.** The ladder breaks at `bands.length >= 3`
  (`src/road.js:2911`) and takes what it has. Sorting by `minR` costs nothing structurally.

**MEASURE the cost, do not assert it.** A gentler band is a LONGER band; a longer band runs alongside
the through road further; more shared earthworks is what merges exist to avoid. Expect some bands to
decline into `unheld` or no merge — connectivity outranks stitching (TRAP 5). Report
merges / deletions / `junction-stitch` / `road-smoothness`, the same four numbers the hold A/B used.

### B6. Departure grade — the PITCH half of the normal match

`_v2BuildTaper`'s ladder is `for (const hold of [true, false])` (`src/road.js:4585`) — held preferred,
unheld a counted fallback. Three changes, all mirroring what the pad already does at a node:

- **A grade acceptance test on the held attempt** (the departure-end partner of
  `mergePadArrivalMax`): solve the freed profile; if its grade in the departure region exceeds the
  cap, decline this rung and let the ladder continue.
- **A partial-hold rung.** Today the hold runs to the corridor exit or not at all. Holding fewer
  vertices keeps most of the lip benefit and returns climbing room.
- **Carry `slopeAway` through the departure**, as `_runEndpointJunctions` does at a node, so the
  through road keeps its inclination across the fork instead of collapsing toward a level strand.

Expected: mark A's leg lands near the 19.8 % measured with the hold fully off, while road-smoothness
stays GREEN, because only the bands that actually blow grade give up their hold.

### B3. The fork gore — hygiene, not a driving surface

Pave and carve the V between the two diverging ribbons as **one footprint**, from the fork out to
where their inner edges separate by `THROAT_SEP_MULT × halfWidth` (a full road width — past that they
are genuinely distinct roads and the median between them is legitimate terrain).

Reuse the node machinery rather than writing a second one: `_throatSweep` already walks out along both
ribbon inner edges and caps across, and the node path already composes the result as a single carve
body. The fork needs the same sweep anchored at the fork point instead of the node centre, with the
same `THROAT_TRIG_MULT` trigger so ordinary wide forks keep their ordinary shoulders.

Owner, 2026-08-27: **the gore is mostly FILL.** Nobody drives across it. The bar is continuity — no
stepped wall, no wedge of raw terrain piercing the asphalt — not paving quality. Do not spend the
pad's full surface budget here; spend it on B4/B6's normal match, which is what the tyres touch.

---

## Workstream A — the router: fewer conflicts to begin with

A taper band is a **downstream patch for a routing decision**. Two edges leave one node and stay
inside `mergeProxM` (18 m) for 76–96 m; at that separation their cut/fill stencils write into the same
terrain vertices, which is the tear class merges exist to kill. Fewer hugs means fewer bands.

### A0. MEASURE THE CEILING BEFORE BUILDING ANYTHING

For each of the 70 bands in the battery, ask whether the hug is avoidable at all: re-run the loser's
corridor search with the winner's corridor priced as occupied within `mergeProxM`, and record whether
the result still connects, whether it now leaves the node clear, and what it costs in length.

**If most hugs are unavoidable — both roads must reach the same valley through the same pass — then
workstream A is not worth its risk and B does all the work.** Do not build A1 before this number
exists.

### A1. Sibling clearance as a COST, not a heading pin

Route a node's incident edges in canonical key order; each edge prices cells lying within
`mergeProxM` of an already-routed sibling's corridor. The fan-out at the node is then emergent, which
is the project's standing rule (`[[feedback_emergent_over_injected]]`).

**Not a heading pin.** QUAL-19's heading-gate Architecture A is DISPROVEN, and the 2026-08-25
exit-heading ruling was measured wrong. Do not re-attempt either.

### A2. The cost that makes A1 expensive — read this before starting

`src/corridor-router.js:12-14` states the router's purity contract verbatim:

> everything here is a pure function of (terrain closures, anchor pair, endpoint heights, knobs).
> **No sibling coupling, no window state**, no module-scope mutable caches.
> **Window invariance is structural, not defended.**

A1 breaks that sentence deliberately. Window invariance stops being free and becomes something that
must be proven. It stays *achievable* — the incident-edge set at a node is a pure function of the
graph, so the contract can become "…and the canonical incident set at each endpoint" — but three
things then need re-checking: the **route cache key** (a route is no longer identifiable by its
anchor pair alone), `warmRoutes` / the ROUTE SYNC worker mirror, and the
`restream-invariance` / `world-determinism` / `road-worker-parity` gates.

That is why A0 comes first.

---

## Workstream C — never drape (the grade item)

Add rung 5 at `src/road.js:4705`, replacing the terrain-follow:

1. **Re-route.** Re-run the corridor search for this edge with grade priced hard, then solve on the
   new corridor. **Must be a pure function of (endpoints, seed, params)** — same determinism
   constraint as A2, and the same gates catch a mistake.
2. **If the re-route fails**, the edge is marked condemned — not silently deleted. A drape is evidence
   the edge was load-bearing.
3. **The reroll is a story-RUN-START decision (owner ruling 2026-08-27, superseding rev 2's
   region-entry siting).** The world is one seed across nine tiles: if a mid-run region turned out
   broken, the player would be standing in a world that cannot be rerolled. So validate ONCE at
   new-game, over all nine tiles, before day 1 — the same checks workstream D gates on — and
   **advance the seed deterministically** on any condemned edge or any split. A one-time "generating
   world" wait is accepted (rev 2's cost estimate: minutes, not seconds); the mitigation is not a
   faster check but a stronger rung 1 — the re-route runs at new-game, not under a streaming window,
   so it may spend real search budget, and every re-route that succeeds is a reroll that never
   happens. A pre-validated seed list is later shipping polish, not this ticket. Free roam is
   unchanged: no bounded region, so a condemned edge keeps its drape — counted and surfaced rather
   than silent.

**The ceiling rung IS the strict limit (owner ruling 2026-08-27).** Re-express the hard-coded 38 %
as **`gMaxRoad + gradeTol`** (`gradeTol` 0.14 keeps today's 38 % numerically) so the ceiling tracks
the cap instead of being a second free-floating number. The tolerance is deliberately lenient: a
road solved at the ceiling is legal by fiat — drivability at 38 % is an accepted cost of
connectivity, and no drivetrain measurement gates it. `wGrade` keeps its job as the routing
preference that holds AVERAGE grade down; the ceiling is only the backstop that decides
condemnation. `gMaxRoad` (0.24) itself is **untouched**.

New gate `test/road-grade.mjs`: zero draped runs across the battery, plus a printed grade histogram
and ceiling-rung count so the 30–38 % population stays visible.

---

## Workstream D — the play-area gate (may trail the merge)

`test/play-area.mjs`, **5 fixed seeds** (fixed so a regression is attributable and numbers compare
across commits).

**Shape, owner-specified 2026-08-27: a 3×3 grid of square tiles, 4000 m on a side.** Nine regions,
12 km × 12 km, **144 km²** total. One tile per story region, roughly equal area each.

Assert per seed:

- **Fully connected** — the road graph across all nine tiles is ONE component. This is the headline
  assertion; a split is an unshippable world.
- **Zero condemned edges** (nothing that failed workstream C's ladder). With C in place this IS
  the grade gate: zero condemned means every edge solved at or under `gMaxRoad + gradeTol`.
- **Zero node-pin violations** (B2).
- Report the grade histogram and the ceiling-rung count — visible, not gating (the ceiling is legal
  by fiat; the histogram keeps the 24–38 % population honest).

D and workstream C's run-start validation are the SAME checks on two triggers: the gate runs 5 fixed
seeds on settings changes; the game runs the player's seed once at new-game. Build them as one
shared routine so they cannot drift apart.

Cost: `src/story.js` measures routing at ~20 s cold for a 2.2 km radius and it scales with area, so
144 km² extrapolates to roughly **3–5 min per seed**. Heavy — `test:all` / desktop only, **never**
`npm test`.

Purpose in the owner's words: catch terrain/router settings under which NO seed can start a story run.
That is why it runs on settings changes, not on every commit.

---

## Build order

**B1** (extend the gate to ribbon edges — the instrument; nothing in B after it can be proven
without it)
→ **B2** (shove endpoint pin — isolated, small, and may fix pads for free)
→ **B0 re-census, then B0** (31 missing pads — biggest count, and B2 may have shrunk it)
→ **C** (never drape — grade is the owner's priority 1; independent of B1's instrument, proven by
  its own `road-grade.mjs`)
→ **B4** (camber = roll half of the normal match — the owner's visible complaint)
→ **B6** (grade = pitch half; together B4+B6 are the normal invariant)
→ **B5** (band radius)
→ **B3** (gore continuity — hygiene)
→ **A0** (measure the router ceiling) → **A1** only if A0 justifies it
→ **D** (play-area gate + the shared run-start validator).

Rev 2 ran C eighth; rev 3 promotes it to fourth. Rationale: B0 and C are the two "the thing does not
exist at all" defects (no pad, no designed profile) and both outrank polish on surfaces that at
least exist; nothing in C waits on B1.

---

## After the workstreams: the merge

Settle the three booked instrument re-baselines (`paper-tour`, `mission-network`,
`pond-route-around`) per ROAD-CLOSEOUT-PLAN's road-to-50/50, run the BUG-47/48/52 + BUG-25 re-triage
against the v2 world, re-bake the default-seed route cache, close FEAT-68.

BUG-51 is RULED but not built, and item 1 now subsumes it: same ladder, same condemn-and-validate
discipline. Its two remaining coordinates are **seed 7 (−1756, 1596) at 87 %** and
**seed 6 (5736, 885) at 115 %** — the second is `g:8,1,0:9,1,0`, i.e. the drape, i.e. item 1.

---

## TRAPS — every one cost real time

1. **NEVER `git checkout` `src/road.js` in the worktree the owner is viewing.** A/B swaps under a
   live dev server made the owner reload mid-swap and report a working fix as broken, and Vite's
   transform cache went stale across the swaps. **To A/B a method, patch `RoadSystem.prototype` in a
   throwaway script instead** — that is how the departure-hold table above was produced, with zero
   file edits. For changes too structural to patch, use `git worktree add --detach /tmp/… <sha>` and
   symlink `node_modules`.
2. **A long-lived Vite server can serve stale modules.** Kill it, `rm -rf node_modules/.vite`,
   restart, verify with `curl -s localhost:3343/src/road.js | grep <marker>`.
3. **String seeds must go through `parseWorldSeed`.** A raw `'lone-pine'` builds a garbage world.
   This has burned two sessions.
4. **The departure hold is CONTIGUOUS from the fork and its projection WALKS a rolling ±60 m window.**
   Both rules were earned by measurement — a hairpinning winner re-arms a "last vertex inside" rule
   and holds a 60 m band; a global nearest-point search teleports to the winner's far end. See
   `82562d8`.
5. **The hold is a PREFERENCE with a counted `unheld` fallback.** Remove that and the battery loses
   7 merges and gains 5 deletions. Connectivity outranks stitching (BUG-57's ruling).
6. **Mid-span forks are deliberately NOT held.** Measured trade: +1 stitch site, −road-smoothness
   (a 24 cm collision-only step at a junction pad). Do not "finish the job" without re-measuring.
7. **`_v2Infeasible` counts drapes but bounds nothing.** That counter is the hook item 1 hangs on.

## Instruments

| | |
|---|---|
| `node test/junction-stitch.mjs [--verbose] [--window=<substr>]` | deck gap vs lateral separation; `≤ 0.15 m + sep / roadFillSlope`. Extend to ribbon edges (item 5) |
| `node test/capture-classify.mjs 6 -1589 1338` | what is at a mark, which merge it carries, which guard skipped it |
| `node test/road-smoothness.mjs` | the collision surface — GREEN on all 3 seeds, keep it that way |
| `node test/graph-topology.mjs` | 8/8, keep it that way |
| `node test/crossing-rung-parity.mjs` | deletions, components, REAL crossings |
| `node test/drivetrain-climb.mjs` | what the truck can actually climb (22 % in 2nd, no hunting) |

Scratch probes for this session's tables (per-run arc/grade/radius/camber dump, grade census, node-pin
census, hold A/B, `gMaxRoad` A/B) were written, used and deleted. The measurements are recorded above,
which is where they belong. The patterns to re-create them: `RoadSystem._network` entries give
`points` / `polyCum` / `cededSpans` / `offCurveSpans`; `road.runProfile(arcS, runKey).camberRad` gives
the banking; patch `RoadSystem.prototype.<method>` before `road.update()` to A/B a mechanism.

## Owner context

Engineer, not a programmer — fluent on physics, geometry, maths, git and ops; needs one inline gloss
for JS / browser / CS-notation terms. **Density is the failure mode, not difficulty**: one idea per
sentence, expand the acronym once, prefer a plain sentence to a compressed one. The owner reads the
numbers and will catch a claim that outruns them — two of rev 1's conclusions and one of this
session's did not survive that.
