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

## Acceptance

- [ ] a headless ride probe walks every road at par's local speed and reports vertical acceleration;
      nothing exceeds 1 g on a crest at that speed (the car stays planted).
- [ ] the same probe reports the residual "wobble" spectrum on straights; the periodic station tick is gone.
- [ ] earthwork totals and route choice change only where crests were illegal (no re-route storm).
- [ ] `priced == built` gates stay green; the network hash gate is re-baselined deliberately, not by accident.
