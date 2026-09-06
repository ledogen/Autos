---
id: QUAL-28
type: quality
status: done
opened: 2026-09-05
severity: minor
closed: 2026-09-05
source: QUAL-27 router-v1 residue audit — the code cull landed; this is the half that needs an
  owner decision (owner, 2026-09-05: "I'll want input on how we map the new router to weights…
  the old one after par reanchor was pretty much perfect and we should seek to replicate it")
relates_to: QUAL-27 (the v1 cull that found these), FEAT-68 (router v2 — v1's weights died with it),
  FEAT-29/FEAT-30 (par oracle + calibration harness — the reanchor being cited),
  test/lib/road-headless.mjs (the fixture carrying the phantom weights),
  data/ranger.js `roadV2` (the v2 price list these must map onto),
  QUAL-29 (the follow-up that drives the bracket and ships the retune),
  FEAT-76 (sequenced behind this ticket)
---

# QUAL-28: v1 weight fixtures still in the gates — and the par-reanchor character we want back

Two halves. The first is mechanical cleanup blocked only on the second, which is an owner call.

## Half 1 — the gates are asserting against parameters that no longer exist

`test/lib/road-headless.mjs` builds `TEST_PARAMS` with the whole v1 arc-lattice weight family:

```
maxRoadGrade, roadWDist, roadWAlt, roadWGrade, roadWOver, roadWTurn,
roadArcHardRadius, roadArcGentleRadius, roadArcHeurWeight
```

None of these is defined in `data/ranger.js` any more — FEAT-68 deleted the router that priced with
them. Nothing reads them. Worse, several gates read parameters through a `?? default` that now
*always* takes the fallback, so the number they assert against is a hard-coded constant wearing a
deleted parameter's name:

| Reader | Reads | Actual value |
|---|---|---|
| `test/road-minradius.mjs:94` | `roadArcHardRadius ?? 8` | always 8 |
| `test/centerline-curvature.mjs:49` | `roadArcHardRadius ?? 8` | always 8 |
| `test/replay.mjs:110` | `roadArcHardRadius ?? 8` | always 8 |
| `test/graph-topology.mjs:143` | `roadSelfClearMargin ?? 3` | always 3 |
| `test/graph-topology.mjs:144` | `roadSelfClearGap ?? 80` | always 80 |
| `test/graph-topology.mjs:171` | `roadCorridorExempt ?? …roadGraphGoalBlend ?? 60…` | always the fallback |

Rainy-day scripts are in the same state — they still RUN (verified 2026-09-05), they just measure
against phantoms: `test/route-character.mjs` divides its headline discriminator by
`roadGraphMaxGrade` (gone → always 0.20), and `test/road-character.mjs:20` / `test/dump-network.mjs:8`
document `roadWGrade=` / `roadArcHeurWeight=` overrides that do nothing.

**The work:** delete the phantom fixture keys, and for each reader above decide between (a) inline
the number as an honest fixed bar with a comment saying so, or (b) re-derive it from the v2 knob that
now governs the same thing. That decision is Half 2.

## Half 2 — OWNER INPUT NEEDED: how the v2 prices map onto what v1 was tuned to

This is the reason Half 1 is not just a delete.

**The owner's position, 2026-09-05:** *the v1 router after the par reanchor was pretty much perfect,
and we should seek to replicate it.* That is the target. v2 is not being asked to be different — it
is being asked to land in the same place, reached by a different mechanism.

The two vocabularies are not the same shape, which is why this needs a ruling rather than a
translation table:

- **v1 priced abstractly.** ~15 interacting weights (`roadWDist`, `roadWAlt`, `roadWGrade`,
  `roadWOver`, `roadWTurn`, …) over a heading-binned arc lattice. They had no units. What they did
  was learned by driving.
- **v2 prices physically.** ~5 knobs in `RANGER_PARAMS.roadV2`, each with a real unit: money per
  metre (`cRoadM`), per metre per metre of depth (`cCutM`, `cFillM`), per radian of direction change
  (`cTurn`), quadratic grade discomfort (`wGrade`, minimised at g* = 1/√wGrade). Elevation is bought
  with money, never faked with length.

So there is no key-for-key mapping. What there is:

1. **`roadWTurn` → `cTurn`** is already an acknowledged lineage (the comment on `cTurn` says so).
   v1 ran `roadWTurn: 120` in the fixture; v2 ships `cTurn: 45`. Different units, and the owner
   already retuned `cTurn` by eye (55 → 45, 2026-08-21).
2. **`roadWGrade: 400` → `wGrade: 180`.** v2's is the one with a defensible physical reading
   (g* ≈ 7.5%, forest-road grade).
3. **`roadWAlt` / `roadWDist` / `roadWOver` have no v2 counterpart at all** — the corridor stage is
   heading-free and the profile stage is exact, so valley-seeking and overshoot-penalty are emergent
   rather than priced. Nothing to map.

**RULED (owner, 2026-09-05).** Three answers, in the order they were asked:

1. **"Replicate the par-reanchor character" = numbers narrow it, driving settles it.** The character
   report is a coarse filter, not the acceptance bar. Bracket `roadV2.cTurn` / `roadV2.wGrade` down to
   two or three candidates that land near the v1-at-reanchor column, then the owner drives only those
   and picks. The report describes whatever is picked; it does not decide it.
2. **The min-radius floor stays a fixed 8 m**, as a named constant, NOT tracking `roadMinTurnRadius`.
   Owner's reason, and the comment now in the code: the road deck is ~10 m wide, so the ribbon
   self-intersects well before any centerline radius near the floor is reached — self-intersection is
   the real failure mode and 8 m is all this bar has to cover.
3. **The self-clearance assertion is DELETED**, not re-based. Both its parameters
   (`roadSelfClearMargin`, `roadSelfClearGap`) died with the v1 culls, so it was enforcing a contract
   no code in `src/` still has; the crossing invariant (BUG-57) owns that ground now.

## The v1-at-reanchor baseline (captured 2026-09-05, before the branch aged out)

Last commit where **v1 actually built the network** is `926e993` (2026-08-18) — v2 took over at
`7cff01d` the next commit, and the par reanchor was 2026-08-01, so that tree is v1-after-reanchor.
`node test/road-character.mjs --json` there vs. on v2, same seed 6, same landmark window:

| | v1-at-reanchor | v2 ship (cTurn 45 / wGrade 180) |
|---|---|---|
| straight % >200 m *(primary, target 0)* | 5.2 | 10.4 |
| hairpin (<30 m) | 6.7 | 2.4 |
| tight (30–80 m) | 17.5 | 12.2 |
| sweeper (150–400 m) | 16.3 | 26.4 |
| switchbacks | 52 | 17 |
| grade max / p95 | 0.392 / 0.203 | 0.313 / 0.218 |
| earthwork mean / max | 4.75 / 37.4 m | 5.25 / 143.4 m |
| crest g @ 25 m/s | 0.99 | 1.01 |

One consistent story: **v2 is smoother and straighter than the v1 that was liked.** It trades
hairpins and tight corners for sweepers, runs a third of the switchbacks, and is twice as straight
against the metric whose stated target is zero. Total km and crest severity are near-identical, so
the *shape* moved, not the *amount*. `cTurn` is the lever — lower makes direction change cheaper.

The 143 m earthwork maximum at (−107.7, −2.5), essentially at spawn, is a separate finding and is
not a character-tuning matter.

## The bracket — three candidates to drive (Half 2, step 1 of the ruled process)

12-point sweep over `roadV2.cTurn` x `roadV2.wGrade`, seed 6, same window, scored as mean |delta| /
v1 value across straight%, the four turn-radius bands, switchbacks and grade p95. 0 = identical to
v1-at-reanchor.

| setting | straight% | hairpin | tight | sweeper | switchbacks | gradeP95 | **score** | earthMean | crest g |
|---|---|---|---|---|---|---|---|---|---|
| **v1-at-reanchor** | 5.2 | 6.7 | 17.5 | 16.3 | 52 | 20.3 | — | 4.75 | 0.99 |
| cTurn=5 wGrade=320 | 8.9 | 4.7 | 16.2 | 22.4 | 34 | 19.9 | **0.290** | 7.32 | 1.06 |
| cTurn=20 wGrade=320 | 7.7 | 3.9 | 14.5 | 24.6 | 37 | 19.8 | **0.290** | 6.96 | 1.47 |
| cTurn=30 wGrade=320 | 8.5 | 3.4 | 14.7 | 25.5 | 31 | 18.6 | 0.350 | 6.51 | 1.19 |
| cTurn=5 wGrade=750 | 10.3 | 4.8 | 16.9 | 20.8 | 38 | 16.0 | 0.316 | 8.05 | 1.21 |
| cTurn=12 wGrade=180 | 6.8 | 3.8 | 13.5 | 25.1 | 26 | 23.4 | 0.332 | 5.37 | 3.06 |
| **v2 ship (45/180)** | 10.4 | 2.4 | 12.2 | 26.4 | 17 | 21.8 | 0.491 | 5.25 | 1.01 |

**`wGrade` is the lever, not `cTurn`** — which is mechanically right and worth stating plainly:
switchbacks come from grade demand, not turn price. Raising `wGrade` lowers g* = 1/sqrt(wGrade), the
grade the price list wants; the router then has to buy length to gain the same height, and buying
length inside a corridor means switchbacks. `cTurn` only shapes what those turns look like once they
exist.

**The optimum is wGrade ~= 320 and the score does NOT improve past it** (500 -> 0.329, 750 -> 0.316).
Beyond 320 the router over-flattens: grade p95 falls to 16-17% against v1's 20.3%, and the earthwork
bill keeps climbing.

**The three to drive**, chosen to be different from each other rather than clustered:

1. **`cTurn=5  wGrade=320`** — best hairpin share (4.7) and a crest profile matching v1 (1.06 vs 0.99).
2. **`cTurn=20 wGrade=320`** — most switchbacks (37) and grade p95 dead on v1 (19.8 vs 20.3), but the
   worst crest of the three (1.47 g at 25 m/s — above the 0.25 g comfort line by a lot).
3. **`cTurn=30 wGrade=320`** — the restrained one: cheapest earthwork of the family (6.51), crest 1.19,
   at the cost of the least hairpin content (3.4).

Both knobs are live debug sliders (Roads > v2 price list: "Turn Cost (per rad)", "Grade Discomfort").
QUAL-28 raised the Grade Discomfort slider ceiling 300 -> 600, since every candidate sits above the
old top.

### The finding the owner should see before choosing

**No setting reaches v1's character, and the earthwork column says why.** v1 ran 6.7% hairpin and 52
switchbacks on 4.75 m mean earthwork. The closest v2 gets is 4.7% / 37 at **7.0-7.3 m** mean earthwork
— a ~50% higher bill for less of the shape.

That is not a tuning failure, it is the two cost models being different in kind. v1 priced the *plan*
abstractly (`roadWAlt` sought valleys, `roadWTurn` shaped corners) and could wander cheaply. v2 prices
*physically* — elevation is bought with money, never faked with length — so the only way it can be
made to wander is to make climbing expensive, and the router pays for that in cut and fill. Replicating
v1's shape through `wGrade` alone therefore buys the shape and the earthmoving together.

If the drive test says the character is right but the ground looks over-worked, the lever to reach for
is the earthwork prices (`cCutM` / `cCut2` / `cFillM`) at a fixed wGrade=320 — not more wGrade. That is
a second sweep, and is the follow-up ticket's business, not this one's.

## Follow-up

**QUAL-29** carries the second half of the ruled process: drive the three candidates, ship the pick as
`roadV2` defaults, and — if the character lands but the ground reads over-worked — sweep the earthwork
prices at a fixed `wGrade: 320`. QUAL-28 deliberately ships **no knob change**; the owner's ruling was
that driving settles it, and nothing here has been driven.

Note for whoever sequences FEAT-76: its block says "do not open step 2 until QUAL-28 has landed on
main", but the baseline it is actually waiting on is the **retune** (QUAL-29), not this cleanup. Flagged
in QUAL-29's acceptance rather than edited into FEAT-76, since the owner wrote that block.

## Acceptance

- [x] Owner has ruled on what "replicate the par-reanchor character" means operationally.
- [x] Every phantom key is gone from `test/lib/road-headless.mjs`.
- [x] Every `?? default` on a deleted parameter is either an honest named constant or re-derived
      from a live v2 knob — no reader names a parameter that does not exist.
- [x] `route-character.mjs` / `road-character.mjs` / `dump-network.mjs` report against v2 knobs.
- [x] `npm run test:all` — 63/67, and the four reds (`junction-stitch`, `mission-network`,
      `paper-tour`, `pond-route-around`) are **pre-existing on main**: each verified RED on a pristine
      main checkout, and none of them imports `road-headless.mjs` or `param-overrides.mjs`, so no
      import path from these changes reaches them. Every gate these changes CAN reach is green,
      including `centerline-curvature`, `road-minradius` and `graph-topology`.

## Resolution

Half 1 done, Half 2 ruled and bracketed; **no knob change shipped** — that is QUAL-29, by ruling.

- `test/lib/road-headless.mjs` — the nine phantom keys deleted; `HARD_RADIUS_FLOOR_M = 8` exported
  with the owner's reasoning inline.
- `road-minradius.mjs`, `centerline-curvature.mjs`, `replay.mjs` — all three now import that constant
  instead of naming a dead parameter.
- `graph-topology.mjs` — (g) SELF-CLEARANCE retired with a note saying why and what owns it now;
  (j)'s exemption stated honestly as a fixed 80 m instead of an expression that always evaluated to 80.
- `road-character.mjs` — grade reported against `roadV2.gMaxRoad` (the cap) AND g* = 1/sqrt(wGrade)
  (the comfort grade); `route-character.mjs`'s headline discriminator divides by `gMaxRoad`.
- `test/lib/param-overrides.mjs` (new) — `k=v` overrides can reach the NESTED `roadV2` price list,
  bare (`cTurn=60`) or dotted (`roadV2.cTurn=60`). Without this the v2 knobs were unreachable from
  the command line, so the workbench tools' override flag was itself a phantom.
- `src/debug.js` — Grade Discomfort slider ceiling 300 -> 600, so the candidates are drivable.

Verified the deletion is safe: nothing in `src/` reads any removed key (the single grep hit is a
comment in `corridor-router.js` citing `roadWTurn` as design lineage).
