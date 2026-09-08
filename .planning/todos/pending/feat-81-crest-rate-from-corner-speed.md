---
id: FEAT-81
type: feature
status: pending
severity: high
---

# FEAT-81 — crest rate keyed to the corner speed the road already allows

**Owner, 2026-09-08:** "there are tiny wobbles and bumps in the road that can launch the car and
there are crests that fall away quickly enough for the car to become airborne … I want to ride the
edge of fast/difficult not difficult/technical." Ruling on the design speed: **"use the run solver
to determine the allowable speed for the corners in that area and set crest rate off that."**

This OVERRULES the standing note in `src/corridor-router.js profileSolve` and `src/road.js`
(`_smoothDesignGrade` header): "No vertical-curvature smoothing term: crest airtime is a FEATURE
(character spec)."

## The mechanism

- The profile solver is a dynamic program on (station ~10 m, deck y on a 0.25 m grid) with a grade
  cap (24 % surface) and a quadratic grade cost, but NO term on the CHANGE of grade. A crest may go
  +24 % → −24 % across one station: vertical radius ≈ 20 m, airborne above ~14 m/s.
- The car leaves the ground when v² > g·R_crest. Par's speed solve (`src/par.js`, PAR_REF mu 0.80,
  curvature-limited) already says how fast the road around the crest can be driven. The crest must
  hold that speed: R_crest ≥ v_par² / g (with margin).
- The bound cannot be a post-pass: a crest of radius R spanning grade change Δg moves the deck
  R·Δg²/8 (≈1.5 m at R 51 m, Δg 0.48), far past the ±0.25 m corner-rounding bound, and priced ==
  built is not relaxable. It has to be priced inside the solve.
- Separately: the ±0.25 m station-corner rounding (`roadV2.vSmoothM` 15 m) and the DP's 2.5 % grade
  quanta are the likely "tiny wobbles" — measure before touching.

## Built (branch `feature/driving-feel`, 2026-09-08)

- **C¹ shipped profile:** `_interpolateRunProfile` is a cubic Hermite on `_profileTangents` built
  from the FINAL (post-junction-blend) gradeY; passes through every sample. Worst 1 m second
  difference 180 → 72 mm; ≥25 mm events per km 9.6 → 5.
- **`roundCrests` (corridor-router.js):** re-priced post-pass on the solved profile — cyclic
  projection onto |Δ²y| ≤ ds²/R at the station design speed (`stationSpeeds`: par's curvature
  envelope + accel/brake passes seeded at the cap, capped at PAR_REF.vMax 28 m/s), WITH the strict
  grade cap and the bore/fill box constraints inside the same sweep. Two findings that decided its
  shape: (1) big-hill flanks run at the 24 % cap, so lowering an apex without projecting the cap
  broke a flank and the strict re-price refused everything; (2) `priceProfile` has NO half-quantum
  tolerance while the DP does, so a solve riding 0.25 on a 0.24 cap is refused by BOTH
  `dequantizeProfile` and this pass unless the pass legalises it — it now does, and such runs come
  out cheaper (seed 1517161527 run g:0,-2,1:0,-1,1: cost 6062 → 6054). Seed 6: 61/270 edges
  reshaped, 15 ms total. Knobs `roadV2.crestHold` 0.5 / `sagLoad` 1.0 (0 = off).
- **Ruler:** `node test/ride-probe.mjs <seeds> [--top=N] [--over=1.25]`.

| 55.4 km, 4 seeds, at par speed | before | after |
|---|---|---|
| airborne (lift ≥ 1 g) | 11 m (seeds 6/7/1517161527) | 6 m (seed 7 only, one T mouth) |
| lift p99.9 | 0.60 g | 0.55 g |
| lift p99.9 at 1.25× par | 0.94 g | 0.85 g |
| worst 1 m Δ²y | 180 mm | 72 mm |

Every remaining top-12 site is inside a junction blend reach (`_applyJunctionBlend`'s smoothstep
to the pad plane — up to 3.2 m of deck at a promoted T whose side road was pinned to terrain, not
the trunk deck). That is FEAT-82 / junction-stitch ground, not the solver's.

## Acceptance

- [x] a headless ride probe walks every road at par's local speed and reports vertical acceleration;
      nothing exceeds 1 g on a crest at that speed (the car stays planted) — outside junction blends.
- [x] the same probe reports the residual "wobble" spectrum on straights; the 4 m polyline corner is gone (C¹).
- [ ] earthwork totals and route choice change only where crests were illegal (no re-route storm).
- [ ] `priced == built` gates stay green; the network hash gate is re-baselined deliberately, not by accident.
