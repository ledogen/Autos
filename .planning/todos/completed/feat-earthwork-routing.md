---
id: FEAT-12
type: feature
status: completed
opened: 2026-06-27
landed: 2026-06-27
severity: major
source: user-insight (2026-06-27 — let the router fill/cut instead of spiralling to follow contours)
split_from: FEAT-10 (the SPIRAL half of feat-robust-route-merge — see history note below)
resolution: "Landed 3be629c (enabled), all 16 gates green. Spiral on seed 6 cut from loops>270°=43 to 18, inter-run crossings 52→9, detour ratio 1.72→~1.2. Earthwork OFF when roadEarthworkWindow=0."
---

# FEAT-12: Earthwork-aware routing — router fills/cuts instead of spiralling to follow contours

> **Bookkeeping note (2026-06-27):** this work was originally developed and committed under the
> **FEAT-10 label** (`29ce993`, `2462b62`, `3be629c`, `ed10e25`, `74b8fc4`). It is NOT the FEAT-10
> route-merge feature — it solves a *different* half of the same seed-6 ugliness. FEAT-10 named two root
> causes: (1) parallel-duplicate ribbons and (2) the concentric spiral. This ticket (earthwork) resolves
> **the spiral (#2)**. The **route-merge / parallel-duplicate dedup (#1) remains FEAT-10 and is still
> open.** Split out and renumbered FEAT-12 to end the dual-meaning of "FEAT-10". Earthwork does NOT
> supersede the route-merge.

## Problem (the spiral, root-caused 2026-06-27)

`arcPrimitiveConnect` costed grade against **raw** terrain (`grade = |nH−csh|/L`) — i.e. it assumed the
road must sit ON the dirt and follow every contour. With `maxRoadGrade=0.15`, the router could only keep
grade legal by **switchbacking around peaks** → concentric "rose" loops. Evidence it was the cost model,
not a search bug: optimal A\* (heurWeight 1.0) produced the same detour; 33/43 looping runs on seed 6 had
anchors within max-grade straight-line distance, so they were *gratuitous* loops the cost model forced.

## Insight / approach (user, 2026-06-27)

We already have fill/cut carve, so let the router **DEVIATE from terrain** — fill valleys, cut ridges —
with a **weighted** cost: penalize deviating too far/too long, plus the existing turn + grade-violation
penalties. This is how real roads are built (earthwork), and it naturally selects gentle, straight
alignments instead of spirals.

## What landed

- **Routing cost** (`29ce993`, `road-carve.js` ROUTE-SYNC region + `WORKER_SOURCE` mirror, byte-identical
  via `route-worker-sync` gate): when `roadEarthworkWindow>0 && roadWDeviation>0`, grade/alt cost uses an
  O(1) summed-area-table **low-pass of terrain** (box blur radius ≈ `roadEarthworkWindow`) instead of raw
  height, plus a per-metre `wDev·|lowpass−raw|` deviation penalty. Levers: `wCurv` (turns), `wOver`
  (grade), `wDev` (earthwork).
- **Deviation cap** (`2462b62`): `designH = clamp(loH, raw ± roadDeviationCap)` — bounds fill/cut depth
  independent of loop count.
- **Profile follows the design line** (`3be629c`, the ENABLE commit): `_streamNetwork` builds the run
  profile as the design line (wide-smooth raw, clamped to ±cap of a SMOOTH terrain ref — clamp vs SMOOTH
  not raw, else the cap reintroduces raw bumps as collision steps → road-smoothness RED). Without this the
  straighter route still dives into valleys (straighter-but-steeper = worse).
- **Fill-support gate relaxed** (`3be629c`, Phase A): the drivable surface (≤halfWidth) must be smooth +
  have no UPWARD step (run-flip cliff) + be supported to core; a steep DOWNWARD fill bank is now allowed
  (BUG-15 protection kept via extent check). Tall sidehill fills are inherently steep; the old gate
  conflated steep with fall-through.
- **Embankment toe cap** (`74b8fc4`): cap the fill toe to kill fan-shaped terrain shards at tight turns.
- **Debug sliders** (`ed10e25`): earthwork window / wDev / cap exposed in `debug.js`.

## Live params (data/ranger.js)

`roadEarthworkWindow: 120` · `roadWDeviation: 3` · `roadDeviationCap: 8`.
**Set `roadEarthworkWindow=0` to fully revert** to terrain-following routing.

## Result (headless, seed 6)

`test/road-selfcross.mjs`: loops>270° **43→18**, loops>540° **20→2**, inter-run crossings **52→9**,
detour ratio **1.72→~1.2**. **No perf cost** (straighter routes expand fewer A\* nodes). All 16 gates green.

## Known residual / follow-ups (not blocking)

- **Tall fills on steep terrain:** a centerline fill can reach ~14 m embankment on steep ground (an 8 m
  fill → ~24 m downhill toe). Currently a visual call; QUAL-06 step-bounded embankment is the structured
  fix. Watch in-browser.
- **maxRoadGrade re-tune:** now that earthwork (not spiralling) absorbs terrain, `maxRoadGrade` can likely
  be revisited.
- **In-browser tune pass:** user to drive and tune `wDev` / `cap` / `window`.

## Relationships

- **FEAT-10** (route merge): the *other* half of the seed-6 problem (parallel duplicates → graph junction
  nodes). Earthwork makes routes straighter but does NOT dedup converging corridors — **FEAT-10 still
  open.**
- **QUAL-06** (carve staircase / vertical walls): the tall-fill embankment residual is QUAL-06 territory.
- **BUG-15** (shoulder camber cliff): the relaxed fill-support gate preserves BUG-15 protection via the
  extent check.

## Files

- `src/road-carve.js` (ROUTE-SYNC region) + `src/terrain.js` (`WORKER_SOURCE` mirror) — earthwork cost.
- `src/road.js` — `_streamNetwork` design-line profile; relaxed fill-support; embankment toe cap.
- `data/ranger.js` — `roadEarthworkWindow`, `roadWDeviation`, `roadDeviationCap`.
- `src/debug.js` — earthwork sliders.
- `test/road-selfcross.mjs` — spiral/self-overlap metric.
