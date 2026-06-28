---
id: QUAL-06
type: quality
status: open
opened: 2026-06-26
severity: minor
source: user-observation
note: "Visual polish at the road↔terrain transition — NOT a physics/correctness bug. The carve
geometry is continuous enough to drive on; this is purely how the shoulder-to-terrain step LOOKS.
Mostly fixed by QUAL-07 (2026-06-27) but a residual staircase remains on LARGE FILLS — kept minor."
relates_to: QUAL-07
---

# QUAL-06: Smooth out staircasing on terrain carves / shoulder-meet walls

> **MOSTLY FIXED by QUAL-07 (2026-06-27, commit 0cf01ac), residual on large fills.** QUAL-07 made the
> mesh resolve via physics' continuous `_resolveRoadSurface` + the smoothstep shoulder falloff in the
> shared `_carveCrossSection`, which removed the discrete-arc grade steps (carve-mesh-smoothness gate:
> spike edges 0.9% → 0.02%, worst 2nd-diff 45 → 16-21 m). A visible staircase still shows on LARGE
> FILLS (tall embankments on steep ground), so this stays OPEN as a minor polish item. Likely needs a
> max-bank-slope clamp / wider ramp on tall fills (the deferred half of QUAL-07's bank-smoothing). See
> `qual-unify-carve-surface.md`.

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
