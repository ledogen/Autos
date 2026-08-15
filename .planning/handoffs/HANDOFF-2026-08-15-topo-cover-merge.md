# HANDOFF — merging `feature/topo-cover` into main

**Date:** 2026-08-15
**Branch:** `feature/topo-cover` (worktree `/Users/ledogen/CodeShit/CarGame-map`, served on :3662)
**Base:** branched from `main` at `f5bb365`
**Tag used in commits:** `feat(16)` — extends FEAT-16 (2D map). No ticket file exists for this work.

**Also amends three pending tickets** — FEAT-32 (logged forest), FEAT-38 (dirt roads), FEAT-44
(culvert). Each gained a dated block at the top explaining what the biome layer / map changed for
it. Those edits ship on this branch, so they arrive with the code they describe.

---

## ⚠ Re-run the tests yourself. Do not trust the numbers in this document.

Every "47/47 green" in this handoff and in the commit messages was observed by the authoring agent,
but at least one such claim was reported **prematurely** during the session: a wait-loop polling the
log for `FAIL` matched the literal string `0 FAIL` inside a *passing* gate's summary line
(`... 3 pass, 0 FAIL (3 total) — exit 0`) and returned before the suite had finished. The claim was
retracted and the real result was green, but the failure mode is silent and easy to repeat.

**So: run `npm run test:all` yourself after merging and believe only your own output.** If you script
the wait, poll for the `^RUN-ALL:` line anchored at start-of-line — not for `FAIL`, which appears in
passing output.

The final pre-merge run on this branch was green at `4018296` (47/47, wall 327s) and again after the
glyph retune. Treat both as claims to verify, not as evidence.

## TL;DR for the merger

**It merges clean into `main` as of today — verified, not assumed.** `git merge-tree --write-tree main
feature/topo-cover` reports no conflicts, and there is **zero file overlap** with the 6 commits main
has gained since the branch point (all ASSET-09 / ASSET-29 modelling work).

```
git checkout main && git merge feature/topo-cover
```

The real risk is **not** this merge. It is `feature/paper-route` — see the landmine section below.
Read that before you merge anything.

---

## What this is

The 2D map printed one flat green because the world had no openings to print. This branch gives the
world biomes, and the map a ground layer that reads them.

Four commits, each self-contained:

| Commit | What |
|---|---|
| `c797525` | Ground layer: cover raster, hillshade, water, glyphs. New `src/map-cover.js` + gate. |
| `bcee5f7` | Biomes: `src/biome.js` + `data/biomes.js`. Meadows and bare rock become real in the world. |
| `9d153b9` | Cover renders at every zoom; pond shorelines follow terrain instead of being circles. |
| `5571764` | Solid green/white regions; hillshade azimuth corrected. |
| `e3b8c6a` | This handoff. |
| `4018296` | One drainage definition; marsh symbols 0.47% → ~16%; FEAT-32/38/44 amended. |
| *(final)* | Foliage glyphs cut back from 55% of the sheet to a real subset. |

```
 data/biomes.js            |  61 ++++      (new)
 src/biome.js              |  84 ++++      (new)
 src/map-cover.js          | 148 ++++      (new)
 test/map-cover.mjs        | 106 ++++      (new gate)
 src/map2d.js              | 675 ++++++++  (the bulk)
 src/props/prop-scatter.js |  14 +-        (worldgen — see below)
 data/flora.js             |   7 +-        (slopeRejectMax)
 src/main.js               |   5 +         (getWater injection)
 test/gates.mjs            |   2 +         (registers the new gate)
```

---

## ⚠️ This changes worldgen, not just the map

`src/props/prop-scatter.js` now clears tree clusters in MEADOW and ROCK biomes. **Trees have moved.**
Roughly 26% of ground is now treeless where previously essentially none was.

Consequences to be aware of:

- **Anything that scored a site by trees will score differently.** FEAT-45's camp *shade* score reads
  `scatterTreePositions()`, which goes through the same cleared cluster pass. Camp vibe scores near
  meadows will drop. This is correct behaviour, not a regression, but if someone reports "my camp
  spot got worse" this is why.
- **No route-cache re-bake is needed.** Verified: `routeCacheSig()` bakes `^road` and `^coarse` keys
  out of `RANGER_PARAMS`. `BIOME_PARAMS` and `FLORA_PARAMS` are separate exports that never enter it,
  and the router does not route around trees. Do **not** regenerate `data/route-cache-default.json.gz`.
- **All 47 gates pass** (`npm run test:all`, run at `5571764`), including props determinism and
  window-invariance and the road/terrain heavy set.

---

## 🚩 The landmine: `feature/paper-route`

`feature/paper-route` is unmerged, actively worked, and **predates the topo map entirely** (verified:
it does not contain `67b8ea2`, the topo-map merge). It carries its own `src/map2d.js` — the OLD
pre-topographic one — plus +438 lines of `src/main.js`.

So merging paper-route later will collide head-on with this branch's 675-line `map2d.js` change and
its `main.js` injection.

**Do not attempt a mechanical resolution.** In any `src/map2d.js` conflict:

- **`feature/topo-cover` wins on everything below the road layer** — the sheet, cover, hillshade,
  water, glyphs, collar, `_paintGround`, `_coverRaster`, `_drawPond`, `_drawGlyphs`.
- **`feature/paper-route` wins on its own overlays** — customer glyphs, the `$0` bell marker, start
  markers, and whatever it added to `_drawPois` / mission drawing.

The two are mostly disjoint in intent; they conflict because paper-route's file is an old ancestor,
not because they disagree. Budget real time for it and re-read both sides.

`src/main.js` is easier: this branch adds exactly one thing, a `getWater: () => waterSystem` entry in
the `new Map2D({...})` options block. If that line survives the merge, main.js is fine.

---

## Invariants you must not break

These are load-bearing. Each has a comment in-source saying so; this is the index.

1. **SCATTER SYNC.** `src/map-cover.js` replays `prop-scatter.js`'s tree pass — same mulberry32
   stream, same draw order, same reject chain. Any edit to prop-scatter's cluster loop (adding an
   `rng()` draw, reordering a reject) must be mirrored in `chunkCover()` **in the same commit**.
   `test/map-cover.mjs` is the gate; it feeds both the same samplers and demands the binned tree
   counts match **cell for cell**, no tolerance. Under identical samplers the replay is exact, so
   any tolerance would be hiding a desync.

2. **One biome definition.** `src/biome.js` has exactly two consumers — `prop-scatter.js` (where
   trees stand) and `map-cover.js` (where the map prints green). Neither may inline its own copy of
   the test. If they ever diverge the map starts lying about the forest, which is the whole failure
   this module exists to prevent.

3. **`flora.slopeRejectMax` == `BIOME_PARAMS.rockSlopeMin`** (both 0.38). Same rule at two
   granularities — per tree vs per cluster. Change one, change the other.

3b. **One drainage definition.** `src/biome.js` holds both readings of "flat ground sitting below
   what surrounds it": `biomeAt`'s MEADOW branch at a 320 m ring (a landform) and `isWetGround` at a
   48 m ring (a hollow you could walk across). Thresholds for both live in `data/biomes.js`. Do not
   re-inline a drainage test in `map2d.js` — one used to live there on its own lattice with its own
   constants, and being in a different file is exactly what hid the fact that it covered 0.47% of
   ground while claiming to mark marshland.

4. **World-keyed rasters.** The cover lattice and the glyph lattice are anchored to fixed world
   coordinates, never to the view (same D-16 window-invariance discipline as terrain and scatter). A
   clearing must have the same shape and edge at every zoom, and glyphs must not crawl when you pan.

---

## Gotchas that cost me time — don't rediscover them

- **`COVER_CHUNK_BUDGET` counts the 2× OVERSCANNED rect**, i.e. 4× the chunks actually on screen. At
  1400 it silently cut in at ordinary reading zooms and killed every foliage glyph. The symptom was
  a *pixel-identical screenshot after changing `DENSE_MIN`*. The replay is now gated on
  `_glyphsVisible()` — whether the glyphs can be seen at all — with the count kept only as a bound
  on the pathological case. If glyphs ever vanish again, look here first.

- **`HILLSHADE_AZ` is 5π/4, not the conventional-looking 3π/4.** The map draws +z **down** the screen
  (`_sy`), so 3π/4 puts the light at (−x, +z) — the lower-left — and the sheet reads as lit from the
  bottom edge with the relief perceptually inverted.

- **Meadow solidity is dominated by `meadowRingR`, not by the thresholds.** Measured on seed 6
  (open% / boundary-neighbours per open cell, lower = more solid): r=55 → 7.5%/1.277 · r=130 →
  12.5%/0.715 · r=250 → 21.1%/0.398 · r=320 → 25.2%/0.306. A short ring asks "is the ground under my
  feet flat", which every wrinkle answers differently, and meadows shatter into green ribbons.

- **A soft weighted-score meadow formulation was tried and lost** to the hard AND at equal coverage
  (r90/th0.6: 16.3% at edginess 0.839, vs hard-AND r180: 16.3% at 0.557). Don't re-attempt it.

- **`slopeRejectMax` was 0.75 and never fired**, ever, anywhere — this terrain tops out at slope
  0.593 (160k samples, seed 6: p50 0.094, p90 0.248). That is why the world had no bare ground.

---

## Owner-set values — do not "tune" these without asking

Ratified by the owner on 2026-08-15:

- **`PAPER_GREEN` = `#e9f1db`.** Sampled off their USGS reference as its *unshaded* value. The
  reference's `#eaf2dd`→`#d2d9c2` spread is hillshade already multiplied in, not separate tints.
- **Three hard bins, no ramp.** low=white, med=green, high=green + foliage glyphs. Density is carried
  by **glyphs, not a darker tint** — one green only.
- **White is biome-only.** There is deliberately no low-tree-count cut; adding one sprays white
  specks through the forest wherever cluster placement left a Poisson gap, which is a fact about an
  RNG and not about any ground the player can walk on.
- **Light from the upper-left.**

## Dials, if the owner asks for adjustment

| Want | Change |
|---|---|
| Less white overall | `meadowSlopeMax` (0.020) down |
| More/less solid regions | `meadowRingR` (320 m) — the dominant lever |
| More/less bare rock | `rockSlopeMin` (0.38) — **and `flora.slopeRejectMax` with it** |
| More/fewer foliage glyphs | `DENSE_MIN` (1.4) — **read with `COVER_COUNT_BLUR` (4)**; at that blur 1.0 ⇒ 87% of forest, 1.4 ⇒ 42%, 1.8 ⇒ 2% |
| More/fewer marsh symbols | `wetSlopeMax` (0.035) / `wetReliefMin` (1.0) ⇒ ~16% of ground |
| Heavier/lighter relief | `HILLSHADE_MIN` (0.88) |

---

## Verify after merging

```
npm run test:all          # expect 47/47 green
npm run dev               # open the map with M
```

Eyeball, in this order — these are the four things most likely to have been broken by a bad conflict
resolution:

1. Ground is **green and white in large solid regions**, not interspersed patches.
2. **Zoom out fully** — it stays two-tone. (If it goes flat green, `_coverRaster`'s biome path got
   gated behind the budget again.)
3. **Foliage glyphs appear** at reading zoom. (If not: `COVER_CHUNK_BUDGET` / `_glyphsVisible`.)
4. **Marsh symbols are plentiful** and sit in the low open basins, not sprinkled over ridges.
5. Ponds are **irregular**, not circles; ridges read as standing **up** with light from the top-left.

---

## Loose ends (not blockers)

- **Open ground sits at ~26%**, up from 15.5% before the solidity pass. The owner asked for large
  solid regions and accepted the trade; flagged here in case it reads as too much white once driven.
- **The world has not been driven since the biome change.** Gates cover determinism and invariance,
  not feel. Worth a lap — there is meaningfully more treeless ground than before.
- **No ticket file.** This work was directed conversationally. If it needs tracking, it extends
  FEAT-16; the biome layer arguably deserves its own FEAT ticket since it is now worldgen.
- **ROCK is invisible on the map** — `BIOME.ROCK` and `BIOME.MEADOW` both collapse to white (the map
  read is literally `=== BIOME.FOREST ? 0 : 1`), so the ~1.2% of ground that is bare rock is
  indistinguishable from meadow. Raised with the owner 2026-08-15 and **explicitly accepted as-is**;
  do not "fix" it unprompted.
- **Contour elevation labels** (the inline `8800` numbers on index contours) were offered and
  deliberately deferred by the owner. Probably the cheapest remaining visible win, and independent
  of everything else here.

- **🔴 OPEN QUESTION — the MED/HIGH bin does not describe anything real.** This is the one piece of
  unfinished design on the branch, and it needs an owner ruling rather than more tuning.

  The owner ratified three bins: low=white, med=green, high=green+foliage glyphs. Low vs the rest is
  solid — it is the biome layer. But **med vs high is smoothed noise.** `clustersPerChunk` is a flat
  4 and `treesPerCluster` a uniform `[4,11]`, so per-cell tree count is Poisson sampling variance
  with no low-frequency field behind it: this world has no dense stands and no thin stands, only
  uniform forest sampled unevenly. Measured coherence of the HIGH region (boundary neighbours per
  cell; ~1.3 is indistinguishable from static) shows no tuning escapes it — the region only looks
  solid when it covers nearly everything:

  | blur \ `DENSE_MIN` | 1.0 | 1.4 | 1.8 |
  |---|---|---|---|
  | r=1 | 73% / 0.618 | 47% / 1.069 | 25% / 1.533 |
  | r=4 | 87% / 0.143 | 42% / 0.689 | 2% / 1.859 |

  This is the same shape of problem as white ground was before biomes existed, and it has the same
  two honest fixes:
  1. **Collapse to two bins** — open (white) and forest (green + glyphs). Truthful, and cheap; but
     it reverses a ratified decision, so it is the owner's call, not the merger's.
  2. **Give the scatter a real low-frequency density field** that BOTH the world and the map read —
     the same move biomes made for white. Then dense and thin stands genuinely exist and the third
     bin means something. Worldgen change.

  Current values (`DENSE_MIN` 1.4, `COVER_COUNT_BLUR` 4) are the **best available compromise pending
  that ruling**, chosen so the glyphs read as a subset rather than as "every green cell has a tree
  on it" (they covered 55% of the entire sheet before). Do not treat them as a solution, and do not
  spend time re-tuning them — the ceiling is set by the world, not by the thresholds.
- **The worktree has an untracked `node_modules` symlink** I created to run the dev server
  (`.gitignore`'s `node_modules/` pattern does not match a symlink). Don't `git add -A` in that
  worktree. Safe to delete once the worktree is retired.

## Reference

Full rationale is in the four commit messages — they carry the measurements. Prior session memory:
`project_map_cover_scatter_uniform.md`.
