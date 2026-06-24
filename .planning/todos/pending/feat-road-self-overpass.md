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

---

## Implementation Plan (2026-06-24) — visual-only deck first

**Decision (this session):** ship the **visual-only deck** first — deck mesh + vertical clearance +
deterministic over/under + carve that respects both levels. The **under-strand drive-through collision
is DEFERRED** (it needs multi-height-per-XZ, the deep part). Driving OVER the deck works; driving UNDER
it won't have the deck as overhead collision yet. Build on the FEAT-07 detection foundation (do FEAT-07
step 1 first — the shared crossing-record + classification).

### Foundation (shared with FEAT-07)
`_detectJunctions` (road.js:1627) already finds inter-run XZ crossings. FEAT-07 step 1 extends it to also
find **self-crossings** (a run crossing itself — the cloverleaf loopback) and to emit crossing records
`{ runA, arcA, runB, arcB, point, angle, dYrouted }`. **Classification gives FEAT-08 its crossings:** a
crossing is an OVERPASS (not an at-grade junction) when the two strands are **arc-length-separated** —
i.e. the same run at two far-apart arcS values (self-loop), or two runs whose routed grades already
differ by more than a threshold. Those are routed to this feature instead of the FEAT-07 merge.

### Steps (visual-only)
1. **Over/under pick (deterministic, window-invariant).** For each overpass crossing, the strand with
   the **lower (arcS, mz, runKey)** tuple goes UNDER (a fixed total order → pure fn of the crossing,
   no streaming/history dependence). The other is the UPPER strand.
2. **Raise the upper strand over the span.** Add a vertical clearance `Cv` (≈ deck thickness + truck
   height, e.g. 4.5–5 m) above the lower strand's grade at the crossing. The upper strand's `gradeY`
   ramps up to `lowerGradeY + Cv` over a ramp length `Lr` before the crossing, holds across the bridged
   span, and ramps back — implemented as a grade BUMP injected into `_buildRunProfile` for that run's
   arc window. Must preserve grade C1 at the ramp joins (blend into the existing smoothed grade, don't
   step) so the approach doesn't kink.
3. **Deck + abutment mesh (road-mesh.js).** Sweep the upper strand's ribbon at the raised grade across
   the span (this falls out of step 2 automatically since the ribbon reads `runProfile.gradeY`), and add
   **abutment** quads (vertical faces from deck underside down to terrain) at the two ramp ends. Optional
   deck thickness (an underside face) for read.
4. **Carve respects both levels (terrain.js).** The LOWER strand carves its trough normally. The UPPER
   strand, **across the bridged span, must NOT carve the terrain** (no trench through the ground it
   bridges) — set `blendW = 0` for the upper strand's vertices over the elevated span (detect: this
   run's routed grade is ≥ `Cv` above the local terrain because of the deck bump). The **abutment
   footprints** at the ramp ends carve normally (the ramps return to grade there). Net: terrain is
   untouched under the deck; the lower trough and the abutments are carved.
5. **Collision scope (visual-only).** The deck is drivable because the upper strand's own `queryNearest`/
   carve now return the raised grade (single height per XZ still holds — the upper strand IS the surface
   at its XZ along the deck). The UNDER-strand at the SAME XZ as the deck is the deferred part: today
   `queryNearest` returns ONE run per XZ (nearest), so under the deck the truck would feel the deck's
   strand, not the under strand. Acceptable for v1 (document it).

### The deferred deep follow-up (multi-level)
Full under-drive needs `queryNearest` + the carve table to return **multiple `(height, surfaceId)` per
XZ** at overpass spans (a list, not a scalar), and physics to pick the surface nearest the wheel's
current Y. That breaks the single-height-per-XZ assumption baked into `queryNearest`/`_buildCarveTable`/
`analyticHeight` — a substantial, separate change. Track as FEAT-08b.

### Determinism / gates
- Over/under pick + deck Y are pure fns of the crossing geometry + a fixed tuple order → window-invariant.
- `test/overpass-determinism.mjs`: build a known self-crossing, assert the over/under assignment and deck
  Y are identical across two stream centers; assert the carve does NOT trench the bridged span (sample
  terrain under the deck == raw terrain, blendW≈0) while the abutments DO carve. Register in `run-all.mjs`.
- `route-worker-sync` unaffected (post-network).

### Files
- `src/road.js` — crossing classification (arc-separated) on top of FEAT-07's extended `_detectJunctions`;
  over/under pick; deck grade bump in `_buildRunProfile`.
- `src/road-mesh.js` — deck + abutment mesh for upper-strand spans.
- `src/terrain.js` — suppress carve under the elevated span; carve abutment footprints.
- `data/ranger.js` — `roadOverpassClearance` (Cv), `roadOverpassRampLength` (Lr), deck thickness.
- `test/overpass-determinism.mjs` (+ register).

### Risks / hard parts
- The grade bump must not kink the approach (C1 at ramp joins) or desync ribbon vs carve grade.
- Detecting "this span is elevated → don't carve" robustly and window-invariantly.
- Plays with QUAL-05: gentler routing makes the surviving loopbacks wide/clean (the user likes them),
  so overpasses are rarer and prettier — but the detection must still catch them.
- The multi-level collision (FEAT-08b) is the real depth; visual-only deliberately sidesteps it.
