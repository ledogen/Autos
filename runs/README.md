# Run library

Exported story-mode runs, kept **in version control on purpose**. `logs/` is gitignored, so runs
dumped there vanish from history; these are a growing dataset and need to outlive the machine.

## What they're for

Calibrating `PAR_REF` in `src/par.js` (ticket FEAT-30). A score on its own can't explain "felt slow,
got S" — the route's *shape* can. Each export carries the geometry par actually priced alongside the
result and, critically, **the driver's subjective read** (`felt`: `slow` / `par` / `fast`). That
subjective label is the ground truth the reference constants are being fitted to; a run without one
is nearly useless for calibration.

## Adding runs

In game: finish a mission → the result card's **export run as: slow / on par / fast** row → the file
lands in your downloads. Then:

```
npm run runs:add                      # imports every rangersim-run-*.json from ~/Downloads
npm run runs:add -- path/to/file.json # or a specific file / directory
```

It renames to a canonical, sortable form and refuses to clobber an existing run.

## Reading the library

```
npm run runs:report
```

Groups by `felt` and reports where par disagrees with the driver, plus how the error correlates with
route features (descent fraction, corner density, distance). The headline number is the mean ratio
inside each `felt` group: **a well-calibrated par puts `felt: par` runs near ratio 1.00**, `fast`
below it and `slow` above.

## Schema

`format: "rangersim-run-export/1"` — written by `MissionSystem.exportRun()` in `src/mission.js`.

| field | meaning |
|---|---|
| `felt` | driver's subjective read: `slow` \| `par` \| `fast`. The calibration target. |
| `note` | free text (what went wrong, what the road was like) |
| `result` | `elapsed_s`, `par_s`, `ratio` (elapsed/par), `letter`, `margin_s` |
| `par_ref` | the `PAR_REF` constants in force for that run — so old runs stay interpretable after retuning |
| `route` | `distance_m`, `edges`, `start`/`end`, `par_avg_kmh` |
| `terrain` | `climb_m`, `descent_m`, `net_m`, grade percentiles, `pct_uphill`/`downhill`/`flat` |
| `corners` | `min_radius_m`, `mean_curvature_per_m`, `pct_by_radius` (5 bands) |
| `par_profile` | par's own speed target every ~25 m: `s_m`, `par_kmh`, `grade_pct`, `radius_m` |

`par_ref` is recorded per run deliberately: it makes the library **retune-proof**. A run taken under
`mu 0.49` is still comparable later, because its ratio can be recomputed against whatever constants
were actually in force.

## Pre-export anecdotes (2026-07-20, no JSON — these predate the export button)

Both were driven with the 180° spawn bug live, so each includes an unmodelled U-turn (~8–10 s) and
both times are correspondingly **inflated**. Kept for the record, not for fitting.

- **Run 1** — mostly straight, three 90° corners, uphill start. `1:27.2` vs par `1:31.5` (ratio
  0.953, B). Driver: *"considering I had to turn fully around at the start, par seems a little
  conservative."*
- **Run 2** — long descent to a corner at the low point, then climbing; got stuck at the corner and
  had to reverse. `1:51.5` vs par `2:49.1` (ratio 0.66, S). Driver: *"felt slow af but I got S rank
  by a mile."* This is the run that exposed par being grade-blind on descents.
