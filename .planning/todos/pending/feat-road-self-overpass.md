---
id: FEAT-08
type: feature
status: open
opened: 2026-06-23
severity: minor
source: user-observation
phase_origin: road-overhaul
note: "Request only — NOT being addressed yet. Surfaced after the routing overhaul + roadArcGentleRadius=75 m: the remaining loopbacks read as natural cloverleaf/on-ramp curves and are desirable. The missing piece is the vertical/bridge logic so a road that crosses ITSELF (or another run) passes over/under cleanly instead of self-intersecting flat on the terrain."
---

# FEAT-08: Road self-overpasses — a road that passes under itself (cloverleaf / on-ramp bridges)

## Context

With the routing overhaul (bounded valley-seek + `roadArcGentleRadius` 75 m) the road still produces
occasional loopbacks, but they now sweep wide and **look good** — they read as natural cloverleaf /
freeway on-ramp curves. The user *prefers* keeping them.

The problem is purely vertical: where a run loops back over itself (or crosses another run) the two road
strands currently sit at the **same graded height on the same terrain**, so they intersect flat — a
self-overlap, not an overpass. There is no bridge/tunnel concept, so:
- the carve cuts one trough through the crossing (the two strands fight over one surface height),
- collision is a single height field at the crossing (no over/under),
- the ribbon shows two flat ribbons crossing instead of one bridging the other.

## Goal

When a road centerline passes within its own (or another run's) footprint at a point where the two
strands are **separated in arc-length** (i.e. a true over/under crossing, not a planned at-grade
junction — that's FEAT-07), build a **grade-separated overpass**:

- one strand ramps to a **bridge deck** above the other (or the lower strand dips, terrain permitting),
- the **terrain carve** respects both levels — the lower strand keeps its trough; the upper strand gets
  a deck/abutments, NOT a cut through the ground it bridges,
- **collision** supports both surfaces at that XZ (the truck can drive the lower strand under the deck
  and the upper strand over it) — i.e. the crossing is no longer a single 2D height field.

## Acceptance (when this is picked up)

- [ ] Detect self/other-run crossings that are arc-length-separated (vs at-grade junctions → FEAT-07).
- [ ] Choose a deterministic, window-invariant over/under assignment + a vertical clearance for the deck.
- [ ] Bridge deck mesh + abutments on the upper strand; lower strand passes under unobstructed.
- [ ] Terrain carve does not trench the bridged span; abutment footprints carve correctly.
- [ ] Physics: both the deck surface and the under-strand surface are drivable at the crossing XZ
      (queryNearest / carve can no longer assume one height per XZ there).
- [ ] Window-invariant + deterministic (D-16): the overpass is a pure fn of the crossing geometry.

## Notes / dependencies

- Distinct from **FEAT-07** (at-grade intersections: one merged mesh from converging splines). FEAT-08
  is the *grade-separated* case — the two strands must NOT merge; one bridges the other.
- The single-height-per-XZ assumption is currently baked into `queryNearest` / the carve table; this is
  the hard part (multi-level surface query). Could start ribbon/visual-only (deck + clearance, no
  under-collision) and add under-strand collision as a second step.
- Determinism: the over/under pick and deck height must be a pure function of the crossing (e.g. lower
  arc-length / lower mz strand goes under) so it stays window-invariant like the rest of the network.
