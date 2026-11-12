---
id: PERF-39
type: perf
status: open
opened: 2026-11-12
severity: major
source: PERF-37 session 2 profile (owner play, 2026-11-11) — the tire tread solve's ground samples through the road carve
  stack were ≈23 % of main-thread busy time; owner, 2026-11-12 — "I just have an issue with how often it pops the tire on
  current main. I feel like the legacy code was mostly fine"
relates: [PERF-37 (the parent investigation), FEAT-70 (the three-line tread solve this tunes; its 11-03 radial-normal
  ruling), BUG-158 (rim-strike yield), PERF-38 (the map half of PERF-37)]
branch: perf/perf-37-tire-map — worktree /Users/ledogen/CodeShit/CarGame-perf37
---

# PERF-39 — the tire's ground query costs too much, and grazing a kerb pops tires

Two halves. The first is cost and is built. The second is the pop rate and waits on an owner decision.

## A — query cost (built on the branch)

Each wheel query ran the full road resolve (`_resolveRoadSurface`) once per height sample: 57 samples a tire. The
`carveHint` 5 cm memo only saves that for a parked wheel. Fixes:

1. **One road resolve per tire, at its hub** (`world-contacts.js` `hintAt`). Every sample re-projects onto that
   resolve's run.
2. **Exact re-projection on bends** (`road.js` `_curvedOffset`). The old straight-tangent re-projection put samples
   0.37 m ahead 6 mm off sideways on a 12 m bend. It also put their arc position short by the factor 1 + κ·v, which
   is up to 54 mm of tread depth on a graded shoulder. Each centreline piece is a line or a circular arc, so the polar
   form is exact on its own piece.
3. **Where reuse is not exact, resolve fresh** (`road.js` `_hintHolds`):
   - past the end of the winner's centreline piece (8 mm at an arc→line joint);
   - in the inner half of a bend (near a hairpin's centre the foot jumps round the arc);
   - off the winner's deck, beyond the memo's own 5 cm. There, nearby roads' banks blend in with fade weights frozen at
     the resolve point: 0.2 m of tread depth error 0.37 m away on a seed-7 switchback bank.
4. **A run END's arc stays clamped at the end** when re-projected, as a fresh resolve has it.
5. **Root fix, `Centerline.nearest`**: its final refine was a straight tangent step, exact only on a line. On a 12 m
   bend it left the foot 6.5 cm short (p50) and up to 0.27 m short at 6.5 m out. The carve's arc position was off by
   p90 4.5 cm and up to 9 cm at the deck edge, jumping whenever the 1 m grid winner changed. The step is now the exact
   arc step: foot error 0.000 cm on seeds 7 and 1172941705. This moves the carved surface (mesh AND physics, together)
   by millimetres off-centre on tight bends.
6. **Sampling stays 9 + 10** (`TIRE_CONTACT`, 57 samples). 9 + 6 was tried and dropped: `tire-contact`'s 2 mm
   convergence limit fails at 6 refine steps (5.5–8.3 mm), and 9 is the floor. The cost win is all from items 1–5.
7. **`vertical-curvature` ceiling 201 → 202 at junctions** (documented in the gate). Item 5 moves the carved surface
   by under 2 mm; one sample on seed 11 (2039.1, 710.6) went 0.0297 → 0.0305 /m and the 15 m merge now counts it
   twice. The sharpest kink is unchanged at 0.092 /m.

Bench (`node test/perf-tire-query.mjs <seed>`, `DECK=1` for wheels on the deck, `WIDE=1` out to ±16 m), µs per wheel
query, moving truck, wheels on the deck:

| seed | shipped | hub-shared | depth vs shipped |
|---|---|---|---|
| 3583777560 | 78.6 | 46.4 | ≤ 0.2 mm |
| 7 | 79.2 | 46.9 | ≤ 0.2 mm |
| 20 | 90.6 | 51.7 | ≤ 0.2 mm |

That is about −42 %. Off the deck most samples resolve fresh, so there is little gain there.

## B — grazing-kerb pops (owner decision needed)

`node test/kerb-graze.mjs` (rainy-day, not a gate) — the real `stepPhysics` against a 15 cm kerb at a grazing angle,
72 runs. Damage thresholds are the shipped `DamageModel` ones.

| Model | pops at 45 / 25 / 10 % tire | rim strikes | flips | samples |
|---|---|---|---|---|
| legacy 4-ring stencil | 4 / 4 / 4 | 7 | 0 | 33 |
| shipped (radial normal at the edge), 9+10 | 12 / 14 / 23 | 23 | 1 | 57 |
| surface normal at the edge ("vertN") | 3 / 4 / 8 | 12 | 0 | 57 |
| radial-spring reference (5 lines × 61 spokes) | 0 / 0 / 0 | 0 | 0 | ~11 900 |

The pops come from the **radial edge normal**, not from the sampling. At a grazing angle the kerb corner sits ahead of
the hub on the edge line. It is deep, and its force is tilted backwards. That brakes one wheel hard and kicks a yaw: a 3°
climb at 45 mph gave a 125 kN rim load and 28° of yaw, where the legacy stencil, vertN and the reference gave none.

The FEAT-70 ruling of 2026-11-03 chose the radial normal ("a kerb now slows a wheel"). Changing it is the owner's call.
The options go to the owner with the PERF-39 report.

## Acceptance

- [ ] A: affected gates + `test:all` green; cdp-smoke PASS; `node test/collision-drop-lab.mjs` unchanged.
- [ ] A: the owner's play session (PERF-37 harness) shows the tire path's share of main-thread busy roughly halved.
- [ ] B: owner picks the edge-force model; `kerb-graze.mjs` pop counts at or below legacy at 45 % tire.
