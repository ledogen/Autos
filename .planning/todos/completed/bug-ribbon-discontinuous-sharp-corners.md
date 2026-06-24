---
id: BUG-12
type: bug
status: closed
opened: 2026-06-14
closed: 2026-06-24
source: phase-09-insim-verify
resolution: "Solved by the arc-based road rewrite (Road Overhaul Phases A–C). arcPrimitiveConnect emits curvature-bounded primitive centerlines (dense XZ radius ≥ hardR by construction) consumed directly by the ribbon and carve — eliminating the overshooting centripetal Catmull-Rom re-fit + _removeLoops/_removeSelfCrossings stack that produced sub-halfWidth radii and the ribbon fold/tear at sharp corners. road-minradius + centerline-curvature + invariance gates green."
---

# BUG-12: Road ribbon mesh tears (gap/overlap) at sharp corners

## Request

Some corners are still tight enough that the **ribbon mesh is discontinuous** — it gaps/overlaps at the
apex (terrain shows through the split). The cyan centerline is continuous through these corners; only the
swept gray ribbon tears. (User images 2026-06-14.)

**User priority (explicit):** "I wouldn't mind the sharpness — we just need to make the road CONTINUOUS."
So the goal is a C0-continuous ribbon **regardless of corner sharpness**, NOT necessarily rounder corners.
This re-scopes the old "residual hairpin overlap" note: don't chase a bigger min-radius; fix the mesh.

## Hypotheses (to investigate)

- The ribbon is swept per tile-slice (`sweepRibbon` per `_tiles` segment). Adjacent slices share a
  boundary control point (C0 centerline), but the swept **edges** (±halfWidth along the per-section
  perpendicular) may not meet when the tangent turns sharply across the seam → a wedge gap/overlap at the
  apex. Continuity of the centerline ≠ continuity of the swept edges.
- At a sharp apex the per-section perpendicular rotates fast; inner-edge vertices can cross (fold) or the
  outer edge can gap even though `filletMinRadius` keeps the centerline radius ≥ minRadius (the relaxation
  may not fully converge for the very tightest corners, or the slice boundary lands mid-apex).
- Possible interaction with junction footprints / leg-trim at crossings.

## Fix directions

- Make the ribbon edges share exact vertices at slice seams (weld), or sweep the ribbon along the
  CONTINUOUS run instead of per-slice so the apex is one mesh.
- Or clamp/round the swept inner edge so it can't fold, accepting a sharp-but-sealed corner.
- A headless gate: sweep a sharp-cornered polyline and assert the ribbon edge polylines are C0 (no gap
  > ε, no inverted/overlapping quads) across slice seams.

## Acceptance

- No visible gap or self-overlap in the ribbon at any corner; sharp corners are allowed as long as the
  surface is continuous and sealed.
