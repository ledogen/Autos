# Run library — router v2

Exported story-mode runs driven on **router-v2 roads**, kept in version control for the same reason
`runs/` is. This is the corpus BUG-41 Stage 2 re-anchors `PAR_REF` against.

## Why this is a separate directory from `runs/`

`PAR_REF` was fitted **2026-08-16** against human drives on **v1** roads. Router v2 took over the
whole network **2026-08-18** (`7cff01d`), with measurably different geometry — QUAL-28 measured
10.4% of length in >200 m straights against v1's 5.2%, and 17 switchbacks against 52. Par's dominant
dial is `mu`, i.e. **corner speed**, and v2 changed the corners.

So a v1 drive no longer describes the roads par prices. The two corpora must not be fitted together:

- `runs/` stays intact as the historical record of the anchor being replicated. **Do not add to it.**
- `runs-v2/` is what `calibrate-par.mjs` is pointed at from here on.

Every run also carries a **`road_router`** field, so the split survives files being moved, merged or
re-sorted later — the directory is the convenience, the flag is the source of truth. Exports from
2026-09-06 on are stamped at capture (`src/main.js`, from `road.js` `ROAD_ROUTER_VERSION`); older
files are backfilled at import and the import log says which.

## Adding runs

```bash
npm run runs:add -- --dir=runs-v2 <file|dir> ...      # --keep to leave the download in place
npm run runs:report -- --dir=runs-v2
node test/calibrate-par.mjs runs-v2
```

`~/Downloads` is sandbox-restricted for directory listing on this machine, so pass explicit file
paths rather than relying on the bare `npm run runs:add` default.

## Corpus state (2026-09-06)

**12 runs — 11 fittable, 1 paper round.** Paper rounds are collected but never fitted with
point-to-point jobs: a round's par is dominated by a full stop at every porch, and `mu` does not
price stops at all.

Seeds so far: 97, 69, 0.

| felt | n | mean ratio |
|---|---|---|
| very_fast | 3 | 0.787 |
| fast | 2 | 0.806 |
| **on par** | **4** | **0.879** |
| slow | 1 | 0.830 |
| very_slow | 2 | 0.926 |

`runs-report`'s verdict: **"the standard is well calibrated on 'felt on par' runs (mean 0.879,
target ~0.88)."** Under the 2026-08-16 re-anchor par is the C/D boundary, so a felt-par drive should
land near 0.88 (a comfortable pass), not 1.00 — and it does.

### The fit says leave it alone

`calibrate-par.mjs runs-v2` recommends mu 0.77 / accel 3.2 / brake 5.5, loss 0.1897 against 0.1957
for the shipped 0.80 / 3.0 / 7.0. **That is a 3% loss improvement and should not be taken as-is:**

- **The mu surface is nearly flat.** 0.740 → 0.1901, 0.780 → 0.1897, 0.820 → 0.1910. Everything from
  0.74 to 0.86 sits within ~1% of the optimum, so this data barely identifies mu at all. The shipped
  0.80 is inside that band.
- **The recommended `brake` 5.5 is a value the record already rejected.** PAR_REF pass (3) moved
  brake to 7.0 *because it is the measured truck value*, noting "the old brake 5.5 under-priced every
  corner entry". A fit that wants to walk it back is fitting noise, not physics.
- **11 fittable runs is still under the bar.** `calibrate-par.mjs`'s own health warning is that 20
  runs give "a hint, not a fit".

No residual correlation clears the action threshold (|r| > 0.6): mean curvature −0.50 and
tight+hairpin −0.50 are the largest, at n=12.

**So the evidence so far is that `PAR_REF` as shipped is already right on v2 roads** — the corners
changed but the constants did not need to. That is a finding, not a non-result. More drives would
firm it up; `on par` runs remain the highest-value label because they are the anchor.
