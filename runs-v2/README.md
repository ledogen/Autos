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

## Corpus state (2026-09-07)

**18 runs — 15 fittable, 2 paper rounds, 1 excluded.** Paper rounds are collected but never fitted
with point-to-point jobs: a round's par is dominated by a full stop at every porch, and `mu` does not
price stops at all.

Seeds so far: 97, 69, 0, 1, 526302544, 1625430154 + 3 more from the 2026-09-07 batch.

### ⚠ `0015-very_fast-S-105s-2.8km.json` is EXCLUDED from calibration

It scores 0.668 — the best number in the library — because it **did not drive the route it was
priced on**. Its trace skips 471 m of a 2762 m route (17%, peaking 210 m off the centerline), driven
path 2274 m against a routed 2762 m. Every other capture here stays inside ~2 m mean / 12 m max.

It is kept because it is real recorded data and it is the fixture for FEAT-52 §5's
intentional-non-shortcut-skip detector (the skip is ~2.4× that ruling's ~200 m threshold), but it
must never anchor a threshold or a `PAR_REF` fit. **The best HONEST drive on record is ratio 0.740**
(`0003`), and that is the number `test/economy.mjs` pins day-20 S against.

`calibrate-par.mjs` does not know about this — it has no corridor check either. If you re-fit,
move the file aside first.

## What this corpus was used for

- **2026-09-06** — `PAR_REF` re-anchor on v2 roads (BUG-41 Stage 2). Measured; **nothing moved**.
  mu 0.80 / accel 3.0 / brake 7.0 ratified, not re-fitted.
- **2026-09-07** — **the band re-cut.** Under the v1-fitted thresholds this library graded
  S 1 · A 1 · B 5 · C 11 · D 0, and the single S was the excluded shortcut above. Re-cut to
  S 0.77 · A 0.81 · B 0.85 · C 1.00, which grades the 17 honest runs S 2 · A 5 · B 5 · C 5.
  Reasoning: `.planning/story-mode/design-amendments-2026-09-07-band-recut.md`.
