---
id: QUAL-06
type: quality
status: open
opened: 2026-06-26
severity: minor
source: user-observation
note: "Visual polish at the road↔terrain transition — NOT a physics/correctness bug. The carve
geometry is continuous enough to drive on; this is purely how the shoulder-to-terrain step LOOKS."
subsumed_by: QUAL-07
---

# QUAL-06: Smooth out staircasing on terrain carves / shoulder-meet walls

> **SUBSUMED by QUAL-07 (2026-06-27).** The bank-smoothing fix (widen ramp / max-slope clamp / smoothstep
> falloff) is folded into QUAL-07's single unified carve cross-section function, so the smoothing applies
> to the visual mesh AND the collision surface in one place. Close QUAL-06 when QUAL-07 lands. No
> independent fix here. See `qual-unify-carve-surface.md`.

## Request

Where the terrain is **carved down to meet the road** (and where the **shoulder is raised up to
meet the road edge**), the transition shows tall **vertical walls** with visible **pixelated
staircasing**. The steps are sometimes large and read as an eyesore. Smooth the transition so the
shoulder-to-terrain (and carve-to-terrain) wall blends instead of stepping.

## Symptom

- A near-vertical face appears between the road/shoulder surface and the surrounding terrain.
- The face is faceted into discrete horizontal steps (staircase) because the terrain mesh samples
  on a coarse grid while the carve drops/raises the surface sharply over a short lateral distance.
- Worse where the height delta between road and natural terrain is large (cut/fill banks, raised
  shoulder on a side-slope).

## Suspected cause (to confirm at planning)

- The carve/shoulder height is applied per terrain vertex, but the **lateral blend width** from
  road edge → natural terrain is too narrow relative to the **terrain grid spacing**, so the slope
  crosses only one or two cells → a near-vertical, heavily quantized wall.
- Candidate sites: `_buildCarveTable` / shoulder-raise + carve-depth handling in `src/terrain.js`,
  and the shoulder cross-section profile feeding it (`src/road.js` / `src/road-carve.js`).
- Related but distinct from BUG-15 (that was a *physics* lateral-cross-section discontinuity at the
  ribbon edge — see [[project_bug15_shoulder_camber_cliff]]); this is the *visual* terrain-mesh
  step on the outer bank. A fix here should not regress the BUG-15 lateral-continuity gate.

## Acceptance

- The carve/shoulder-to-terrain transition reads as a **smooth bank**, not a staircase, at normal
  draw distance — no obvious horizontal stepping on the wall face.
- Holds for large height deltas (cut/fill banks, raised shoulder on a side-slope).
- No new terrain holes or z-fighting at the road edge; ribbon still seats on the carve.
- Window-invariant: the bank looks the same regardless of draw distance / stream window
  (don't reintroduce a window-variance regression).
- `npm test` stays green (esp. the shoulder-lateral-continuity + road-smoothness gates).

## Notes

- Likely levers: widen the lateral blend ramp (more terrain cells across the slope), clamp the
  max per-cell vertical delta, or smooth the carve falloff with a smoothstep instead of a hard
  shoulder wall. Decide at planning.
- Pure visual polish — minor severity. May get touched anyway by FEAT-07/FEAT-10 junction/merge
  rework, but it's a standalone eyesore worth its own ticket.
