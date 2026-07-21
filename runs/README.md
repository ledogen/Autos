# Run library

Exported story-mode runs, kept **in version control on purpose**. `logs/` is gitignored, so runs
dumped there vanish from history; these are a growing dataset and need to outlive the machine.

## What they're for

Calibrating `PAR_REF` in `src/par.js` (ticket FEAT-30), and — longer term — as a dataset to fit a
frozen model or tune weights against. So the files are deliberately **data-rich rather than
summarised**: the analysis happens later, offline, and a summary computed today would only constrain
the questions that could be asked tomorrow.

Each run carries the full road topology par priced, the driven trace, and **the driver's subjective
read** (`felt`, five levels). That label is the ground truth the constants are fitted to; a run
without one is nearly useless for calibration.

In game the prompt is stated explicitly, because an unstated scale drifts between sessions:

> **How fast do you feel like you drove the course?**
> par time is supposed to be challenging but not impossible.
>
> `very slow` · `slow` · `on par` · `fast` · `very fast`

## Adding runs

In game: finish a mission → answer the prompt on the result card → the file lands in your
downloads. Then:

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

`format: "rangersim-run-export/2"` — written by `MissionSystem.exportRun()` in `src/mission.js`.
A typical 2.5 km run is ~80 KB.

| field | meaning |
|---|---|
| `felt` | `very_slow` \| `slow` \| `par` \| `fast` \| `very_fast`. The calibration target. |
| `note` | free text (what went wrong, what the road was like) |
| `result` | `elapsed_s`, `par_s`, `ratio` (elapsed/par), `letter`, `margin_s` |
| `par_ref` | the `PAR_REF` constants in force for that run |
| `route` | `distance_m`, `edges`, `start` (incl. spawn `heading_rad`), `end`, `climb_m`, `descent_m`, `par_avg_kmh` |
| `topology` | **the road itself** — see below |
| `trace` | **the drive** — see below |

### `topology` — the road, every 2 m, in travel order

Columnar (`columns` + numeric `rows`): same information as an array of objects at a fraction of the
bytes, and it loads straight into a dataframe.

| column | meaning |
|---|---|
| `s_m` | cumulative **3D** distance along the route |
| `x`, `z` | world position |
| `elev_m` | routed design elevation |
| `heading_rad` | `atan2` of the travel-direction tangent |
| `curv_1pm` | **signed** curvature, 1/m (+ve = left, router convention) — left/right is real information |
| `grade` | d`elev`/d`s`, signed (+ve = climbing) |
| `quality` | 0..1 road-surface tier (500 m stretches, `road-quality.js`); drives pothole severity |
| `par_ms` | what par thought you should be doing at this point |

**Camber is deliberately absent.** It is a deterministic slew-limited function of `curv_1pm`
(`rawCamber = camberStrength · kappa`, clamped — `road.js`), so a camber column would be a second
copy of the curvature column. Reconstruct it from `curv_1pm` if a model needs it.

### `trace` — the drive, 10 Hz

`t_s`, `x`, `y`, `z`, `speed_ms`, `heading_rad`, `throttle`, `brake`, `steer_rad`.

This is what makes the dataset worth more than (features → one scalar): it says **where** time went,
not just how much. Aligning `trace` against `topology` by position gives per-corner speed deltas
versus par.

`par_ref` is recorded per run deliberately: it makes the library **retune-proof**. A run taken under
`mu 0.49` is still comparable later, because its ratio can be recomputed against whatever constants
were actually in force.

## Lab baselines (`lab-baselines.json`)

Human skill spread on the FEAT-31 testing-lab tracks — vehicle-capability measurements, independent
of `PAR_REF`, used to bound the `k` factor. Two drivers at opposite ends of the range (expert and
novice) plus the headless harness for reference. See the `observations` array in the file; the short
version is that the drag strip is nearly skill-blind while the skidpads span up to 3.3x, and the
novice's large-radius laps are almost certainly not limit laps.

## Pre-export anecdotes (2026-07-20, no JSON — these predate the export button)

Both were driven with the 180° spawn bug live, so each includes an unmodelled U-turn (~8–10 s) and
both times are correspondingly **inflated**. Kept for the record, not for fitting.

- **Run 1** — mostly straight, three 90° corners, uphill start. `1:27.2` vs par `1:31.5` (ratio
  0.953, B). Driver: *"considering I had to turn fully around at the start, par seems a little
  conservative."*
- **Run 2** — long descent to a corner at the low point, then climbing; got stuck at the corner and
  had to reverse. `1:51.5` vs par `2:49.1` (ratio 0.66, S). Driver: *"felt slow af but I got S rank
  by a mile."* This is the run that exposed par being grade-blind on descents.
