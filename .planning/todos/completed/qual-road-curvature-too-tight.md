---
id: QUAL-05
type: quality
status: closed
severity: minor
opened: 2026-06-24
closed: 2026-06-24
source: user-observation
resolution: "Changed the arc-router curvature penalty from LINEAR wCurv·|κ|·L (which integrates to wCurv·Δθ — radius-blind per turn, so tight never cost more → roads turned tight everywhere) to QUADRATIC wCurv·κ²·L (integrates to wCurv·Δθ/R → a tighter radius costs MORE for the same heading change). The unchanged grade/altitude terms then let tight radii emerge only where steep terrain makes them worth it. Re-mirrored the ROUTE SYNC region into the terrain WORKER_SOURCE (route-worker-sync gate green). Default roadWTurn 120→8000, picked by a headless radius-distribution sweep (ranger gentle=75/hard=8 primitives): tight (<20 m) arc-length 48%→8%, avg radius 24 m→53 m, 76% straight, min radius still the 8 m hard floor (tight never disappears). Debug slider retuned: 'Curve Penalty (wCurv·κ²)', range 0–50000. 10/10 gates green (min-radius/invariance unaffected — κ² changes selection cost only, not the primitive radii or determinism). Secondary levers from the ticket left for follow-up: the Dubins terminal is still pinned at hardR=8 (≈5% irreducible tight at every anchor — fix direction #2), and no intermediate radius primitive was added (#3)."
---

# QUAL-05: Roads turn too tight everywhere — weight smaller radii as more expensive (gentle by default, tight emerges on steep terrain)

## Symptom

Generated roads pick tight radii almost everywhere — eyeballed ~15–30 m — and rarely if ever sweep at
a large/gentle radius, even across flat or rolling ground where a gentle curve is the natural line. The
road reads as fussy/switchbacky instead of a road that flows and only tightens up when the terrain
forces it. Desired: **gentle, large-radius sweeps are the default; tight radii still appear, but their
prevalence EMERGES where the terrain gets steep** (a switchback up a pass should look earned, not be the
everywhere-default).

## Root cause (from the cost model)

Routing is `arcPrimitiveConnect` (`src/road-carve.js`). Two things conspire:

1. **The curvature penalty is LINEAR in curvature, which makes it radius-blind per turn.** Each search
   primitive adds `wCurv·|k|·stepLen` (`wCurv = roadWTurn = 120`; `k = 1/R`). Integrated over an arc
   that turns by Δθ (arc length `L = R·Δθ`), the curvature cost is `wCurv·|k|·L = wCurv·(1/R)·(R·Δθ) =
   wCurv·Δθ` — **independent of R**. So a tight turn and a gentle turn that achieve the same heading
   change cost the SAME in curvature terms; the tight one then wins on the other terms (less `wDist·L`
   distance, stays nearer the valley baseline). The penalty never actually discourages tightness.
   The primitive set offers only two arc radii anyway: `kappas = [0, ±1/gentleR(75), ±1/hardR(8)]` — no
   middle ground, so it's straight / gentle / hard with hard cheap-to-reach.

2. **The Dubins terminal is pinned at the hardest radius.** Every connection ends with
   `dubinsPrimitives(..., rho = hardR = 8)` into the canonical anchor heading, so there is a tight
   bit at EVERY anchor/"waypoint" by construction (matches the "tight to make the waypoints" feel).

## Fix direction

Make smaller radii genuinely more expensive, in a way the grade/altitude terms can still override:

1. **Quadratic curvature penalty (primary lever).** Change `wCurv·|k|·stepLen` → `wCurv·k²·stepLen`
   (bending-energy form). Integrated over a Δθ turn: `wCurv·k²·L = wCurv·Δθ/R` → **smaller R now costs
   more for the same heading change**. Gentle wins on mild ground; the existing `wGrade·grade²` +
   `wOver·max(0,grade−maxGrade)` + bounded `wAlt` terms already make a tight turn worth its cost when a
   gentle line would have to climb/cross steep ground — so tight-turn prevalence **emerges from terrain
   steepness for free**, which is exactly the requested behaviour. Retune `wCurv` after switching to k²
   (units change). Don't zero tight turns out — keep `hardR` as the floor so switchbacks remain possible.
2. **Gentler / variable Dubins-terminal radius.** Let the terminal use a radius ≥ hardR (up to gentleR)
   where the approach geometry allows, instead of always `hardR`, so anchors aren't forced tight.
3. **(Optional) Intermediate radius in the primitive set** (e.g. a ~30 m `medR`) for a smoother radius
   spectrum, at the cost of a larger branching factor (5 → 7 primitives ≈ more node expansions — watch
   streaming cost).
4. Expose the lever live: a debug slider (e.g. "Curve Penalty" / curvature exponent) under Road, wired
   through `_proto.params` + `_refreshParams`, so the feel can be dialled in-browser.

## ⚠️ ROUTE SYNC — must re-mirror into the Worker

`arcPrimitiveConnect` is now copied VERBATIM into the terrain Worker (`WORKER_SOURCE` in
`src/terrain.js`) under the `ROUTE SYNC` region (PERF-03 WS-A — off-thread route pre-warm). **Any change
to the cost model / primitive set MUST be re-mirrored into `WORKER_SOURCE` in the same commit**, or the
pre-warmed routes will diverge from the synchronous fallback. `test/route-worker-sync.mjs` enforces
byte-identity and will fail until re-mirrored. See CLAUDE.md "Terrain Worker".

## Acceptance

- On flat/rolling terrain, roads visibly sweep at large radii (not the ~15–30 m default today).
- Tight radii (down to the `hardR`/`roadMinTurnRadius` floor) still appear, **preferentially where the
  grade is steep** (switchbacks up passes), not everywhere.
- Min-radius validity holds: `arc-router`, `centerline-curvature`, `road-minradius` gates stay green
  (radius never drops below the geometric floor).
- Determinism/invariance gates stay green (`invariance`, `restream-invariance`), and
  `route-worker-sync` stays green (cost-model change mirrored into the Worker).
- Lever is live-tunable from the debug panel.

## Files

- `src/road-carve.js` — `arcPrimitiveConnect` cost accumulation (`wCurv·|k|·stepLen` → k²), `kappas`
  set, Dubins terminal `rho`. (Canonical ROUTE SYNC region.)
- `src/terrain.js` — re-mirror the `ROUTE SYNC` region in `WORKER_SOURCE` (same commit).
- `data/ranger.js` — `roadWTurn` retune (+ optional curvature-exponent / `medR` params); doc the units.
- `src/road.js` — `_proto.params` + `_refreshParams` wiring for any new param.
- `src/debug.js` — Road folder slider for the curvature lever.

## Relationships

- The cost model is the D-09 weight set (see road.js header + ranger.js `roadW*` docs). This is a
  retune/shape change to the curvature term, not a new cost axis.
- Depends on the PERF-03 WS-A ROUTE SYNC discipline (the Worker mirror + `route-worker-sync.mjs` gate).
