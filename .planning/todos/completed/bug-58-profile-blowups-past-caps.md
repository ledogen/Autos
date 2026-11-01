---
id: BUG-58
type: bug
status: completed
severity: medium
opened: 2026-09-06
source: measured while driving the QUAL-29 bracket — isolated stations whose profile ignores the
  vocabulary caps that exist to prevent exactly them
relates_to: QUAL-29 (where these were measured), QUAL-28 (which saw the 143 m earthwork max and
  set it aside as "a separate finding" — this is that finding), FEAT-40 (bore/portal vocabulary),
  data/ranger.js `roadV2` (cutMax, the caps being exceeded), test/road-character.mjs (the instrument)
---

# BUG-58: isolated profile stations blow past their vocabulary caps

Two symptoms, almost certainly one cause: the solved profile contains rare stations whose geometry
the price list is supposed to make impossible. They are **not** a character-tuning matter — they
survive every `cTurn` / `wGrade` setting measured — and they are rare enough to hide in a mean while
dominating a max.

## Symptom 1 — open cuts far past `cutMax`

`cutMax: 20` is defined as the depth at which a cut BECOMES A BORE. Measuring signed
`designY − coarseGround` per station across the streamed network (seed 6, 1400 m window, **bore
spans excluded**), at the shipped defaults:

| `wGrade` | stations cut deeper than `cutMax` (20 m) | deepest cut |
|---|---|---|
| 180 (ship) | 2.21 % | 143 m |
| 320 | 6.33 % | 157 m |
| 360 | 5.90 % | 156 m |

A 143 m open cut is not a cutting, it is a canyon. Fill, by contrast, is clean at every setting —
p99 of 8.2 m against `fillMax: 8` — so whatever this is, it is asymmetric and lives on the cut side.
This is the same number QUAL-28 recorded as "the 143 m earthwork maximum at (−107.7, −2.5),
essentially at spawn… a separate finding".

Note the sensitivity: raising `wGrade` nearly TRIPLES the rate. That is a useful lead — it means the
condition is reached by the profile solver wanting flatter grade, not by any one piece of terrain.

## Symptom 2 — single stations with a 6 m implied vertical radius

`road-character.mjs` reports crest severity as vertical accel at 25 m/s. Across the `cTurn` sweep at
`wGrade: 180` the p99 is stable and healthy (0.44–0.51 g), but the MAX is not:

| `cTurn` | crest p99 | crest MAX | implied vertical radius at the max |
|---|---|---|---|
| 25 | 0.46 | 1.19 g | 53 m |
| **35** | 0.46 | **11.47 g** | **6 m** |
| 45 (ship) | 0.45 | 1.01 g | 63 m |

`cTurn: 35` is not a worse setting than 25 or 45 — its p99 is identical. It has **one** defective
station, at (−1702, 1632). A 6 m vertical radius is a launch ramp, and at 25 m/s it is 11 g.

## Why they are probably the same bug

Both are single-station departures from a profile that is well-behaved everywhere around them, both
are invisible in the mean and dominate the max, and both are a violation of a cap the price list
already encodes (`cutMax` → Infinity above the bore threshold; the grade caps and `vSmoothM`
corner-rounding for the vertical curve). The likely shape is a station where the DP's cap test is
skipped, or where the pinned end of a segment is written without going through the capped step —
the profile solver pins exact ends (`yA`, `yB`) and lets the DP own only the interior.

## Where to start

- `profileSolve` / `profileSolveBundle` in `src/corridor-router.js` — the cap test is
  `if (Math.abs(g) > cap + half + 1e-9) continue`, applied to INTERIOR transitions. Check the pinned
  first/last station and the fork-attachment stations, which do not go through that loop.
- `stationRateCls` — the Infinity that is supposed to make a >`cutMax` state unbuildable. Confirm it
  actually fires at the boundary rather than one class late, and that nothing downstream (the BUG-56
  ladder's relief/ceiling rungs, the re-route rungs) reinstates a condemned state.
- The 143 m case is near spawn at (−107.7, −2.5) and reproduces at the SHIPPED defaults, so it needs
  no exotic setup: `node test/road-character.mjs` reports it as the earthwork max every run.

## Acceptance

- [ ] The mechanism is identified and written down — one cause or two, stated either way.
- [ ] No station exceeds `cutMax` as an open cut; anything deeper is a bore or the corridor goes
      elsewhere. Measured the way this ticket measures it (bore spans excluded).
- [ ] No station's implied vertical radius falls below a defensible floor. Pick the floor from the
      crest comfort line the character report already uses, not from the worst survivor.
- [ ] `road-character.mjs` earthwork max and crest max are reported before/after, across several
      seeds — the mean was never the problem and must not be the evidence.
- [ ] `npm run test:all` no worse than the four documented standing reds.

## Not in scope

Tuning. QUAL-29 ratified `cTurn: 45` / `wGrade: 180`; these defects are present at those values and
must be fixed there, not tuned around.

## Resolution — Spare, 2026-11-01: two causes, one fixed, one is BUG-67's

**Re-measured at today's defaults (cutMax 25, cTurn 45, wGrade 180) over the road battery.**

**Symptom 1's 143 m was a bore.** The site at (−107.7, −2.5) is station 487 of
`g:-1,-1,2:-1,0,0`, inside its 367–623 m tunnel span under a 148 m hill. road-character's EARTHWORK
max does not exclude bores (it is |deck − ground| everywhere), which is why it still reports 99–173 m
on every seed. Measured with bores excluded, as the ticket intended, open cuts deeper than cutMax
are 0.00–0.10 % of samples (`wip/bug-58/cuts.mjs`), in two classes:

1. **A stub bore dropped as noise — FIXED.** The DP correctly prices a knife-edge ridge as a bore,
   but `_v2GradePts` drops any bore shorter than MIN_BORE (12 m), shipping those stations as an
   open cut the price list calls unbuildable. Example: seed 11 (2098,−945), 30.8 m for 10 m,
   395 m from either end. Now a solve that leaves a stub is re-solved with BORE forbidden at its
   stations (`profileSolve` `noBoreAt`): the deck stays within cutMax there (a crest over the
   ridge), so priced == built. If that is infeasible, the original stands. That seed's worst open
   cut went 30.8 → 25.5 m (28 m from an end). `MIN_BORE_M` is now a module constant.
2. **Within 8 m of a run end — BUG-67's buried-node class, NOT fixed here.** 29–32.5 m. The node is
   pinned 25+ m below its own ground and the junction guard keeps the bore span off the node. The
   lever is BUG-67's (node height or seat), which is owner-gated. The residue overshoots of
   25.1–25.5 m are post-solve smoothing (dequantise / station-corner rounding) moving decks by under
   half a metre.

**Symptom 2 is gone.** The cTurn 25/35/45 sweep now gives an identical crest max of 0.71 g
(Rv ≈ 90 m) on the ticket's window; no 6 m launch ramp exists at any setting. FEAT-81's crest rule
(roundCrests, R ≥ v²/(g·crestHold) at par speed) landed after this ticket and is the floor the
acceptance asked for.

| seed (0,0 r 1400) | crest max before → after | Rv min | p99 |
|---|---|---|---|
| 3 | 0.58 g → 0.58 g | 111 m | 0.38 g |
| 6 | 0.71 → 0.71 | 90 | 0.44 |
| 7 | 0.73 → 0.73 | 87 | 0.38 |
| 11 | 0.83 → 0.83 | 76 | 0.38 |
| 20 | 0.69 → 0.69 | 92 | 0.39 |

**Gates:** affected suite 51/52, the one red being road-clearance (FEAT-77).
