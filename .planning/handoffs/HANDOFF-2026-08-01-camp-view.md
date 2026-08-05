# HANDOFF — campsite view score (the fourth vibe segment)

**Branch:** `feature/camp-view` · **worktree:** `../CarGame-camp-view` · **commit:** `9a15d1e`
**Base:** `main` @ `8db13a3` · **State:** complete, gates green, **unmerged, un-driven**
**Date:** 2026-08-01

## What this is

A fourth judgement on campsites — the view — alongside flatness, shade and water. Sanctioned
already by DESIGN.md's three-layer camping model (§"Site quality … flatness, shade, water
proximity, view", RATIFIED 2026-08-01), so no invariant was bent to add it.

`VIBE_W` re-cut to the owner's split, replacing the old 50/30/20:

```js
export const VIBE_W = { flat: 0.4, view: 0.15, shade: 0.2, water: 0.25 }
```

## The one idea to keep

**A good view is one where the majority of your FIELD OF VISION is looking at terrain that is
extremely far away.** (Owner's definition, 2026-08-01.) That is an *angular* claim, not an
*azimuthal* one, and everything in `skylineView` follows from the distinction.

The first implementation scored azimuthal openness — how many compass directions were
unobstructed. It was rejected on the drive as "pretty forgiving of shit views", and a flat plain is
the proof of why: every direction is open and sees for kilometres, while what you would actually be
looking at is grass 40 m from your boots, with the whole distance crushed into a hairline at the
horizon. **If a future session finds itself counting open directions, it has reverted the design.**
`test/camp-view.mjs` §2 is the assertion that fires when that happens.

Mechanically: each visible sample is credited with the slice of vertical angle it fills, weighted by
how far away it is; the score is that angular average.

Four supporting rulings, each of which has a comment where it lives:

- **Band clipped to ±20° of level.** Below is the ground at your feet. Without the clip a summit
  scores *badly*, because its own mountainside fills half the frame.
- **Sky is excluded from the average, not penalised.** Near ground is what ruins a view; absence
  isn't. Consequence — a known, documented limitation: a shelf above a *literal* void (sheer drop,
  no far side at all) scores ~0, because the only terrain in frame is what you're standing on.
  Fractal noise always gives a far side, so it does not arise; the note is in the gate if a
  hand-authored cliff ever does.
- **Azimuths combine as a plain mean.** A majority claim is a majority claim. The earlier
  best-third weighting is precisely what let one good direction out of twelve carry a site.
- **Probe height 5 m, not an eye height.** Owner's reasoning, recorded at the param: nobody sits
  welded to the pad, and a few steps to the edge of the clearing is part of camping there. 5 m buys
  roughly that, in the one variable a single-point scan can spend it in.

## Calibration — read this before touching `campViewShapeLo/Hi`

The response curve was set wrong once and the failure is instructive. **Flat ground and big views
are anticorrelated — flat ground is valley floor.** Calibrate the curve against a uniform sample of
the map and the top of the range sits near the whole map's 99th percentile, which on ground you can
actually pitch a tent on is unreachable: every site scored ~0.02 and the segment did nothing.

The score's job is to rank *campsites against each other*, so the campable population is the right
denominator. Measured over ground passing `campGateUnevenM` (~7% of the map), seeds 1/6/42:

| population | raw far-fraction | shaped score |
|---|---|---|
| whole map | p50 0.125 · p90 0.25 · best-in-400 ~0.67 | — |
| **campable only** | **p50 0.08 · p90 0.165 · best ~0.26–0.41** | **p50 0.06–0.13 · p90 0.63–0.90 · ~20% over 0.5 · 4–9% maxing** |

**Re-measure over campable ground before moving either knob.** The sweep scripts are throwaway and
were not committed — rebuild them from the recipe in the `campViewShapeLo/Hi` comment
(`makeTerrainHeadless` + `skylineView`, filter by 5×5 pad spread ≤ `campGateUnevenM`; recover the
raw fraction by running with the shape window at 0..1 and inverting the smoothstep).

## Cost

Two scans per re-grade — both siting-ray ends, lerped per candidate, exactly the `_streamScan`
precedent — at **44–55 µs each on real terrain noise**. The re-grade already spends ~44 µs in
`queryNearest` alone plus ~275 `analyticHeight` calls (each dearer than `rawHeightWorld`: road
resolve + water carve on the same noise). Paid only when the truck leaves the `CAMP_RESAMPLE_M`
ball. `AMENITY_MAX` carries `VIBE_W.view`, so the flattest-first early exit stays sound.

## The open gap — FEAT-56

**The scan sees 2 km. The game draws ~160 m.** Terrain mesh ends at the chunk ring (`RING_RADIUS` 2
× 64 m; ~288 m on Ultra), `FogExp2` at 0.006 is 96% opaque by 300 m, and the camera far plane clips
at 1000 m — so `campViewFarM` (1200 m) is *past the far plane*. A 1.0-view campsite and a 0.0-view
campsite currently look alike out the windshield; both end in haze at ~200 m.

The owner ruled (2026-08-01) to **keep the 2 km scan and close the gap from the renderer side**,
rather than shrink the scan to the fog — shrinking reduces "an epic view" to "you can see 200 m",
which is not the thing worth scoring. `FEAT-56` (`.planning/todos/pending/`) carries the
measurements and the acceptance criteria, including the constraint that a far shell is scenery only
and must never become a physics surface.

Until FEAT-56 lands, **the near half of the score is verifiable by eye and the far half is not.**

## Files

| file | change |
|---|---|
| `src/camp.js` | `skylineView()`, `_viewAt()`, `campView*` params, `VIBE_W`, view threaded through `_gradeFlat`/`_gradeAmenity`/`evaluate` (incl. candidate `t` for the ray lerp) |
| `src/main.js` | fourth bar segment, `VIBE_W` import, `CAMP_VIEW_BIG/OK`, the view word on the confirm face |
| `index.html` | `.vseg-view` / `.lg-view` / `.cp-view` violet `#b98ae0`, both bar instances + both legends |
| `test/camp-view.mjs` | new gate |
| `test/gates.mjs` | registered fast/story |
| `.planning/todos/pending/feat-distant-terrain-draw-distance.md` | FEAT-56 |

## Picking this up

```bash
cd ../CarGame-camp-view
ln -s ../CarGame/node_modules node_modules   # worktree has none; two gates import three
npm test                                     # 5 affected gates
npm run dev -- --port 3614 --strictPort
```

Then drive it: story mode, into a camp zone, `look for a campsite`. **Not yet done — nobody has
seen this in the game.** The half to judge is whether the bottom end is too harsh now; the median
campsite earns ~0.1 of the segment by design, and `campViewShapeLo` is the knob if that reads mean.

Not touched: `DESIGN.md` still says "*possibly* view" at §"good ground" (line ~883). Now that it is
implemented and weighted, that line is the owner's to update — design docs are user-owned.
