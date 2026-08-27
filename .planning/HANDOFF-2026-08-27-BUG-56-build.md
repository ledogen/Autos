# HANDOFF 2026-08-27 (evening) — BUG-56's build pass: what shipped, what is left

Successor to `HANDOFF-2026-08-27-BUG-56-camber.md` rev 3, which is now the PLAN and this is the
BUILD. Rev 3's measurements all still stand; where a number here contradicts one there, this one is
later and was taken on the built world.

**The whole of workstreams B, C and D is built and committed. Workstream A is MEASURED and
DELIBERATELY NOT BUILT — see "The A decision", which is the one thing left for the owner to rule.**

| | |
|---|---|
| Code | worktree `/Users/ledogen/CodeShit/CarGame-corridor-router`, branch `feature/corridor-router`, dev **:3343** |
| Head | `8c0cfd0` — nine commits on top of rev 3's `63b0e21` |
| Suite | 29/34 affected green. FIVE reds, every one booked and accounted for below |

## What shipped, in build order

| | what it does | headline number |
|---|---|---|
| **B1** `8baebf3` | the stitching gate reads ribbon EDGES, not just centrelines | 17 sites → 102; both of the owner's forks were invisible to the old rule |
| **B2** `90004c7` | a run ends at the node it shares | 253 nodes, **0 unpinned, worst spread 0.00 m** |
| **B0** `0b4a634` | the ring ladder gets a floor | **27 naked junctions → 0** |
| — `de0e03c` | delete the half-fillet weld rung (fired 0 times in 176 junctions) | |
| **C** `5a2cca0` | never drape: re-route the edge, or condemn it | **worst grade 106 % → 38 %**, condemned 0 |
| **B4** `7c88eb3` | departure camber — the ROLL half of the normal | fork roll residual **median 0.0°** |
| **B6** `b5be318` | departure grade — the PITCH half | mark A's fork spike **24.1 % → gone** |
| **B5** `e7676e2` | a band may not be tighter than the road it joins | median band radius **23.3 m → 33.4 m** |
| **B3** `6b1ebf5` | the "gore" is a wall at the seam, not an unpaved V | gore wall steps **470 → 373** |
| **D** `8c0cfd0` | the play-area gate + the routine story mode will reroll on | 5 seeds × 144 km², all one component |

### The three findings that changed the plan

1. **Mark C was three mechanisms, not one.** The shove was only the first. A mid-span merge was
   dropping its first and last own vertex (4 m at both ends), and fixing that exposed a third:
   mid-span bands still allocated arc by vertex INDEX — the defect `63b0e21` had already fixed in
   the sibling end-anchored path. That third one was shipping a 23 cm collision-only cliff.

2. **The gore is not an unpaved V.** At seed 6 (1959,885) both decks are dead flat across their own
   ribbon — 2 cm over 5 m — and the entire 5.38 m appears in ONE 0.25 m step where ownership flips.
   The centres are 10.7 m apart: the pavements are TOUCHING and 5.4 m apart in height. Paving the V
   was tried (widened carve footprint) and changed the step count by exactly zero.

3. **A merge is not a connection, but losing one can cost a connection.** Making B3's seam rule a
   hard acceptance criterion gives much the better surface (470 wall steps → 173, worst 5.38 m →
   2.28 m) and declines 16 of 67 merges — and a declined merge leaves the pair in conflict, which
   hands the crossing rung a leg to delete: **seed 7 split into two components.** Measured, not
   theorised. That is why the seam rule ships as a preference with a counted fallback.

## The A decision — the one thing left for the owner

**A0 says the hugs ARE avoidable, and cheaply.** All 59 departures in the battery, each re-routed
with the winner's corridor priced as occupied within `mergeProxM`:

| | |
|---|---|
| still connects at all | **59/59 (100 %)** |
| …and the profile is still feasible | 59/59 (100 %) |
| …and it now leaves the winner clear | **49/59 (83 %)** |
| length cost | median **1.00×**, 75th 1.01×, worst 1.30× |
| no route at all once the winner is occupied | **0** |

Rev 3's gate was "if most hugs are unavoidable, workstream A is not worth its risk". Most are
avoidable, at no length cost. So A1 is justified — and then A1 was built, measured, and **reverted**.

**A1 was built the cheap way and it does not work.** The cheap way is the one that keeps
`corridor-router.js`'s purity contract intact: price a PROXY of each sibling — its chord from the
shared node — because a chord is pure graph data, so no edge depends on any other edge's route, the
per-edge cache keeps its key, the Worker pre-warm keeps its parallelism, and window invariance stays
structural. Swept over the whole battery:

| `wSibling` | runs | km | merges | departures |
|---|---|---|---|---|
| 0 | 254 | 196 | 35 | 35 |
| 1 | 255 | 197 | 35 | 35 |
| 2 | 255 | 197 | 34 | 34 |
| 4 | 256 | 198 | 35 | 35 |
| 8 | 256 | 198 | 34 | 34 |

No effect at any weight. The chord is simply not where the sibling's road is: the hug happens where
both roads follow the same VALLEY, and a straight chord from the node leaves that valley immediately.
A0 worked because it priced the sibling's REAL corridor. It was reverted rather than shipped as an
inert knob.

**The version that would work, and what it costs.** Two-pass routing: route every edge with no
sibling term (pass 1, exactly today's behaviour), then re-route every edge pricing its siblings'
PASS-1 corridors (pass 2). This is still deterministic and still window-invariant without a proof
obligation — pass 1 is a pure function of the edge alone, so pass 2 is a pure function of the graph,
and there are no cycles and no ordering. Both passes parallelise fully on the Worker.

It costs roughly **2× routing**, everywhere, plus a route-cache re-bake. That is a load-time and
perf decision (PERF-27's cold→driving is 14.7 s baked / 42.8 s unbaked), which is why it is not
being taken unilaterally. **The question for the owner is simply: is up to 83 % fewer taper bands
worth doubling route time?** If yes, the design above is the whole design.

## The five reds, all booked

| gate | why |
|---|---|
| `junction-stitch` | BUG-56's own allowed red. 105 sites, roll residual median 0.1° — the residue is now the PITCH half at sites where two roads cannot part legally |
| `graph-topology` (corridor-clearance) | **new, B5.** 50 sample pairs at 1.3 m, seed 6 `g:4,1,1:5,1,0 × g:3,1,0:4,1,1`. NOT a band that got worse: that pair cannot be tapered at all (best band radius **2.3 m**), and what changed is that the edge did not previously EXIST — it was deleted, and the deletion was hiding the hug. Both single-variable arms of B5 show the identical red, so any perturbation of the band ladder spares it. The check was green because a connection had been cut |
| `paper-tour`, `mission-network`, `pond-route-around` | rev 3's three booked instrument re-baselines, unchanged |
| `paper-reroute` | **appeared at B4, gone again by B5.** Cause measured: the road network is byte-identical either side of B4, but B4 changes the DECK, POI siting reads the deck, and exactly one marginal house site flipped. Watch it rather than chase it |

## What is NOT built, and why — read before assuming it was missed

- **C's run-start reroll.** Story mode today builds ONE 2500 m region (`REGION_RADIUS_M`), not nine
  4000 m tiles. Wiring a nine-tile validator into a game that builds a single disc would be
  validating something the game does not make. Adopting the nine-tile play area is a story-mode
  change and the owner's call. `src/world-validate.js` is written, green on five seeds, and the
  seed-advance is a handful of lines once the area exists.
- **B6's `slopeAway` through the departure.** Its purpose was to stop the leg collapsing toward level
  at the fork; the measured departure no longer collapses (it leaves at 8.6 % and ramps
  monotonically). Adding a solver pin that is not needed can only cost merges.
- **A1.** See above.

## Instruments added

| | |
|---|---|
| `test/node-pin.mjs` | B2 — every run ends at the node it shares |
| `test/pad-census.mjs` | B0 — every ≥3-leg junction gets a pad, and which rung built it |
| `test/road-grade.mjs` | C — nothing ships above the ceiling; grade histogram + ladder rungs |
| `test/play-area.mjs` | D — five fixed seeds × 144 km². **`manual`**: never affected-selected |
| `test/lib/road-battery.mjs` | the nine windows, shared, so the close-out gates count the same world |
| `src/world-validate.js` | D's checks, so the gate and story's reroll cannot drift |

`run-all.mjs` gained a `manual` gate class — never AFFECTED-selected however much of its closure
changed, still run by `--all` and `--only`, and reported as held back so it stays visible.

## Still to do before the merge

Unchanged from rev 3: settle the booked instrument re-baselines, run the BUG-47/48/52 + BUG-25
re-triage against the v2 world, re-bake the default-seed route cache, close FEAT-68. Plus: rule the
A decision, and rule whether story mode adopts the nine-tile play area.
