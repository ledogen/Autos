---
id: QUAL-11
type: quality
status: open
opened: 2026-07-01
rewritten: 2026-07-06
severity: minor
source: user-request
note: "REWRITTEN 2026-07-06 post-QUAL-13 (sloped pads). Goal in the user's words: pads that blend
nicely from one road into the others like a real intersection. Replace the circular pad with an
edge-tangent filleted boundary + non-planar fill."
---

# QUAL-11: Intersection pad v2 — edge-tangent filleted boundary, riding the sloped pad plane

## Goal

Pads that **blend nicely from one road into the others like a real intersection**: the pad's
boundary is each leg's two ribbon edges continued inward, with adjacent legs' facing edges joined
by a **tangent arc** (a true fillet — concave between legs), and the enclosed surface filled on
the graded 3D pad. Not the current convex circle-ish blob with straight flared mouths.

## Current state (what this replaces, as of f15c8af)

`buildJunctionFootprint` (road-mesh.js) builds the pad per `_detectNodeJunctions` node:
- **Mouths are straight extrapolations** `node + dir·T` (T = cutback + halfWidth/2), FLARED
  (`roadJunctionFlare` 1.6×, adaptively capped) to *hide* the seam where a curved approach's real
  ribbon end sits 2.6–5.3 m to the side. Corners between mouths = node-centred circular arcs
  (STRAIGHT_GAP 2.7 rad back-side rule) → the pad reads as a circle.
- Near-parallel legs are dir-merged (dot > 0.94); one-sided "pitchfork" clusters skipped
  (Σleg-dir balance > 0.55); earClip + forced up-winding (robust: 0 inverted / 64 pads).
- Per-vertex Y rides `sampleRoadTopY` (mesh == collision), falling back to the QUAL-13 pad
  PLANE (`node.plane`) beyond the road footprint. Ribbons are cut back in `_buildRoadTile`;
  `_junctionCarve` digs the plaza; approaches ease onto the sloped pad plane
  (`_junctionPadPlane` / `_applyJunctionBlend` adaptive reach — see QUAL-13 resolution).
- Visible residual (QUAL-13 screenshots, e.g. junction (-884,-487) seed 6): pale apron wedge
  with a center seam/notch where curved ribbon ends meet the straight mouths.

## Design

1. **Boundary from the real ribbon end cross-sections (exact weld).** Re-add the QUAL-10 infra
   removed as dead code: `road.runPointAt(runKey, arc)` (world XZ at a run-global arc) and
   `endArc` on node legs (which endpoint the node owns). Per leg, sample the trimmed end's frame —
   centre `runPointAt(endArc ± cutback)`, tangent from `runProfile` tx/tz — and take the two edge
   points at ±halfWidth along the frame normal. These COINCIDE with the swept ribbon's end
   cross-section → no seam, no flare needed to hide it.
2. **Tangent-arc fillets between adjacent legs.** Join leg i's facing edge line to leg i+1's
   facing edge line with an arc tangent to both (true fillet). Facing-edge pairing uses the
   existing CCW leg sort + faceSide logic. Cases:
   - near-parallel non-collinear facing edges → cubic Hermite matching both endpoints+tangents
     (a single tangent arc is ill-defined);
   - wide back-side gap (through road, > ~155°) → straight connection (no phantom bulge);
   - fillet radius from `roadFilletRadius`, shrunk to fit short mouth edges.
3. **Simplicity is the crux — design it in, with a fallback ladder.** The QUAL-10 exact-weld
   attempt self-intersected 19/24 boundaries. Guarantee a simple boundary constructively where
   possible (fillet radius shrink-to-fit, mouth ordering from the CCW sort), then VERIFY with an
   explicit XZ self-intersection test on the assembled polyline; on failure shrink fillets and
   retry once; on second failure fall back to the QUAL-10 circle pad for that node (never spike,
   never hole). Keep the pitchfork guard as-is.
4. **Non-planar fill, topology in XZ.** Triangulate the closed boundary in XZ (earClip after the
   simplicity check stays fine); add interior Steiner points (clipped grid ~2–3 m) so the lifted
   surface follows the sloped pad plane + crown smoothly; set every vertex Y via
   `sampleRoadTopY` (physics surface → mesh == collision by construction); force up-winding.
5. **Housekeeping.** `roadJunctionFlare` likely becomes dead (exact weld replaces flare) — remove
   the param+slider if so. Once-per-build cached (`_networkRev` guard, house pattern).

## Hard-won constraints (violate these and it regresses)

- Exact weld ⇒ the boundary is only as smooth as the ribbon cutback frames — cut back FIRST, then
  weld to the cut ends (`junctionCutbackDist()` is the shared source of truth with `_buildRoadTile`).
- Everything must be a pure fn of the streamed network + params (window-invariant, D-16).
- `sampleRoadTopY` reads the QUAL-13-blended profiles — do NOT invent a second pad surface; the
  boundary/fill is GEOMETRY only, the height field already exists.
- Verify visually every iteration: `node test/screenshot.mjs <x> <z>` (numeric checks catch
  spikes, only the eye catches seams). Junctions to sweep: (-884,-487), (122,-738), (-98,172),
  (41,619) seed 6 — plus a curved-approach one.
- npm test stays green; new `road*` params ⇒ regen `data/route-cache-default.json.gz`
  (BUNDLE-SIG matches `^road` by prefix; bake script pattern: scratchpad gen-default-route-cache.mjs).

## Acceptance

- Boundary hugs the roads (concave between legs), welds to the ribbon edges — no seam gap/notch
  at straight OR curved approaches; matches the user's sketch-2 intent.
- Holds at T / Y / 4-way / near-parallel / acute junctions: no spikes, no holes, no
  self-intersections (fallback ladder makes failure graceful, not spiky).
- Window-invariant, mesh == collision, once-per-build cached, npm test green.
- Screenshot sweep of ≥5 junctions incl. a curved approach, eyeballed clean.

## Related

- QUAL-10 first pass (completed): `buildJunctionFootprint` / `_detectNodeJunctions` /
  `_junctionCarve` entry points; sliders Ribbon Cutback / Mouth Flare / Terrain Carve Radius.
- QUAL-13 (completed, f15c8af): sloped pad planes + adaptive approach blends — this ticket's fill
  rides that surface.
- QUAL-16 (`qual-deg2-node-kink.md`): degree-2 node kinks — same fillet machinery applied at
  n=2; sequence AFTER this ticket and reuse its boundary/fill code path.
