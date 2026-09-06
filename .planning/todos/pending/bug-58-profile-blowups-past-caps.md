---
id: BUG-58
type: bug
status: pending
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
