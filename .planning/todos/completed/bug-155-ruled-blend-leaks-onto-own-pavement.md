---
id: BUG-155
type: bug
status: closed
severity: major
opened: 2026-11-08
source: Lane B, BUG-153's census (test/ribbon-frame.mjs, reported apart)
relates: BUG-153, QUAL-10 (the inter-leg ruled blend, _carveDirtY), BUG-82 (ribbon-pad weld), _padRibbonMask / _legDeckTop
---
lane: B

# BUG-155: the QUAL-10 ruled blend leaks onto a leg's own pavement — physics 0.34 m under the drawn ribbon, and a 0.34 m step at the mouth chord

Near a node, physics' leg cross-section (`_carveDirtY` with wx,wz) blends every in-range leg's grade with barycentric
weights. The intent in its comment is that the driving ribbon "never moves": on its own asphalt a leg should keep weight
1. But the soft gap clamp (RULE_SOFT 1.2) never reaches 0 on the pavement: at gap −0.5 m (lat 4.5) the own leg keeps
0.4, so a sibling 3 m away keeps ~12 % of the weight. Physics bends toward the sibling's grade where the drawn ribbon
(the leg's own formula) does not.

- 1074499174, leg `g:745990,432424,-1:1,1,1` at node (746, 432): physics − drawn = −0.337 m at lat 4.5, 0.5 m past the
  mouth, fading to 0 by 4.5 m. At the ribbon's vertices (stations ≤ 3.75) the class is 25–88 per seed, worst 8.2 cm.
- **A physics step at the mouth chord:** inside the ring the pad's mouth mask snaps to the leg's UNBLENDED deck
  (`_legDeckTop`, no wx,wz), and just outside it the on-ribbon branch is blended. At the site above physics drops
  0.337 m within 0.5 m at the edge.

## Owner decision (2026-11-08 16:53Z, tracker owed `bug155-fix`)
"build it + shot sheet (recommended)". Build the proposal below, with a before/after shot sheet of the steeper gores.

## Before any edit
A proposal (orchestrator, 2026-11-08): how the inter-leg crease stays dead (the blend exists to kill the step at the
Voronoi boundary between two legs), and whether the owner's QUAL-10 ruling constrains the fix.

## Acceptance
- [ ] On a leg's own drawn pavement physics rides the drawn ribbon (< 2 cm; fold the blend class into
      `test/ribbon-frame.mjs`'s PASS), and there is no step at the mouth chord.
- [ ] The inter-leg crease stays dead (shoulder-lateral-continuity, junction-edge-lip, bank-steps).

## Proposal (Lane B, 2026-11-08, by reading — no code yet)

### Why the leak exists, and why its reason has expired
The blend weights are barycentric: leg i's weight = taper_i × ∏(j ≠ i) soft(gap_j), with gap = the distance past a
leg's pavement edge. A sibling's weight therefore carries the factor soft(gap_own). With a hard clamp, max(0, gap),
that factor is 0 on the own pavement and the leg is exact there. RULE_SOFT (junction-flow stage 3) replaced it with
the two-sided soft(g) = ½(g + √(g² + 1.2²)). That never reaches 0: it is 0.6 at the edge, 0.4 at lat 4.5 and 0.07
on the centreline. The reason, per its own note, was the **pad**: inside a ring the legs' pavements overlap, the hard
clamp squeezed the whole handover into a thin annulus, and the pad's surface (which then rode this field) showed a
1.33 m knee that read as tearing.

That reason no longer holds past the mouths:
- **The pad no longer rides the blend.** Since the owner's 2026-10-04 solved pad, a ≥ 3-leg ring is a thin-plate
  spline fitted to the legs' UNBLENDED decks outside it (`_buildPadSurface`), plus `_padRibbonMask`, which makes a
  leg's pavement past its cutback exactly its own deck. The blend only enters past the ring (`_legSurfaceTop`'s
  radial hand-off), in the leg cross-section (dirt, and physics' on-ribbon overlay), and on deg-2 connectors
  (`sampleRoadTopY`).
- **Past a leg's cutback its pavement overlaps no sibling's.** BUG-59 moves the cutback out to exactly that point. So
  past the cutbacks there is no thin annulus to protect: at most one leg has gap ≤ 0 at any point.

### The fix: one clamp per leg, keyed to that leg's own cutback
In `_carveDirtY`'s blend, leg i's clamp becomes

    soft_i(g) = (1 − a_i) · softR(g) + a_i · (soft0(g) + ε · softR(g))

- **softR** is today's two-sided clamp, kept wherever a_i < 1.
- **soft0** is one-sided and C1 (value and slope both continuous): 0 for g ≤ 0, g² / (4w) for 0 < g < 2w, and
  g − w beyond. w ≈ 0.6 m keeps the same edge softness RULE_SOFT was sized for, but outside the asphalt instead of
  across it.
- **a_i** is the pad mask's own ramp, the identical expression: smoothstep((|pr.arcS − leg.arc| − (cut_i −
  PAD_MOUTH_EASE)) / PAD_MOUTH_EASE), with cut_i = leg.cutback ?? junctionCutbackDist(). It is 0 inside the pad and 1
  from the cutback out.
- **ε ≈ 1e-3** keeps the weights from all going to zero where two pavements still overlap past both cutbacks (a
  merge shape). There the blend stays smooth, and the deck hold already puts both decks at the same height. The
  leak it leaves elsewhere is ~0.1 % of the grade difference: 3 mm on the 2.8 m site.

Past the cutback, on a leg's own pavement, soft_own = 0, so every sibling weight is 0. The purity is then 1, so the
crown/camber ease does nothing either. `_carveDirtY` becomes exactly the leg's own cross-section, which is what the
ribbon draws. That closes all three symptoms at once:
1. **Physics on the asphalt** (the on-ribbon overlay is `cs.gradeY` + clearance) = the drawn ribbon.
2. **The dirt at the pavement edge** = own deck − clearance. Today the drawn lip there is 0.15 m + the leak (~0.5 m
   at the 1074499174 site). It becomes the designed 0.15 m, drawn and driven.
3. **The 0.34 m step across the mouth chord disappears.** Inside the chord, the pad mask has been the own deck since
   the cutback; outside it, the overlay is now the same own deck. Both switch in the same 1.5 m band, 2.5 m inside the
   mouth.

### Why the inter-leg crease stays dead
- The blend stays a **pure function of position**. Every weight comes from each leg's own foot (gap_i, a_i, taper_i),
  never from which run the query resolved to. So nothing switches at a Voronoi boundary (the line equidistant from
  two legs).
- **soft0 is C1**, so there is no knee at the asphalt edge. In the gore (both gaps > 0) the weights reduce to the
  linear ruled ramp between the two pavement edges: the "constant-slope banked ramp" the blend was written for, and
  the shape `_padRibbonMask` already draws between two legs' bands (BUG-144).
- **a_i is smooth and per-leg**, so the change of clamp carries no step either.
- **Inside the ring nothing changes:** a_i = 0 there, and the pad does not read the blend anyway.

### The cost, stated plainly
The share of the grade handover that leaked onto the asphalt moves into the gore. The gore dirt between two legs past
their mouths gets steeper by that share: 2.8 m across ~3.5 m (80 %) at the 1074499174 site, against ~60 % today.
That gore is dirt, and the drawn mesh already shows roughly that ramp. But this is a look change near every node, so it
gets a before/after shot sheet.

### Does the owner's QUAL-10 ruling constrain it?
No. The QUAL-10 ticket is the owner's request that roads flow together at intersections. Its binding invariant is
"mesh coplanar with collision", which this fix restores. The rulings that touch this surface all point the same way:
- **2026-09-07, junction deck hold:** two legs that share ground ride the pad plane. That lives in the run profile's
  grade and is untouched; it is also what keeps the merge-shape fallback (ε) safe.
- **2026-10-04, the solved pad and "the through road untouched":** a road's own pavement is its own deck. The pad
  mask already applies that to every leg past its cutback; this fix extends it to the dirt and to the on-ribbon
  overlay.
- **"All legs equal at a plain node":** every leg is treated the same way.

One thing for the owner, not a constraint: the steeper gores are visible.

### Measure (when the hold lifts)
- `wip/bug-153/sec-census.mjs`: the blend class → 0 on the four seeds. Then fold it into `ribbon-frame.mjs`'s PASS.
- `wip/bug-153/leg-detail.mjs` at the 1074499174 site: < 2 cm across the width, and no step at the mouth chord.
- Gates: junction-edge-lip (the lip improves), shoulder-lateral-continuity, bank-steps, road-smoothness,
  carve-mesh-smoothness, junction-ride, road-pad-fill, and the rest of the affected set.
- Fingerprint: surface / carve should move only near nodes (lattice proof, as in BUG-153); props in height only.
- A before/after shot sheet of steep gores.

## Implemented (Lane B, 2026-11-08, `land/bug-155` e89dd79e, off `land/bug-153`)

As proposed. `road.js`: `_ruleClamp(g, a)` mixes today's two-sided clamp with the one-sided C1 clamp (RULE_EDGE_W 0.6,
RULE_FLOOR 1e-3). `_carveDirtY` feeds it each leg's pad-mask ramp a_i (the same smoothstep, the same cut). Nothing else
changed.

**Measured, desk probes only** (the low-power hold: no gates yet). The site is 1074499174, leg `g:745990,432424,-1:1,1,1`,
node (746, 432):

| measure | before | after |
|---|---|---|
| physics − own deck, 0–15 m past the mouth (`own-deck.mjs`) | −51.8 cm | 0.31 cm |
| step across the mouth chord at lat 4.5 | −37.6 cm in 10 cm | −0.09 cm |
| edge lip (`gore.mjs`) | 11.7–26.6 cm | 11.8–18.5 cm |
| worst step near the gore | 19.0 cm | 19.0 cm (a cut face that was there before; not this bug) |

Drawn vs physics census (`sec-census.mjs`, R 256, both fixes on, against `land/bug-153`):
- 1074499174: junction zone 17 vertices ≥ 2 cm, worst 6.1 cm → 0, worst 0.7 cm. Every vertex on the seed is now
  under 2 cm (worst 1.8 cm, open road).
- 2654449719: junction-zone p99 23.4 → 2.2 cm.

**Still owed when the hold lifts:** the affected gates; `ribbon-frame.mjs` with the blend class folded into its PASS;
the fingerprint lattice proof; and the before/after shot sheet of steep gores.

## Landing proof (Lane B, 2026-11-09)

Lands with BUG-153 + 154 from `land/bug-155`; the full record is in BUG-153's ticket. Blend class gated at 2 cm in
`test/ribbon-frame.mjs` (0.0 cm measured). At 1074499174's mouth (746, 432) on the merged tree: physics − own deck
−51.8 cm → −0.05 cm, the step across the mouth chord at lat 4.5 −37.6 → 0.15 cm. The steeper gores did not happen
(85 → 82 % at the steepest). Photos: `wip/bug-153/shots/sheets/sheet-155.jpg` and `sheet-gores.jpg`.

## Resolution (2026-11-09)

Landed on main as **eabc032c** (merge of land/bug-155 @ 6caadf81, BUG-153 + 154 + 155 together; affected 83/83 + the 58 gates shared with BUG-140 green; cdp-smoke 26/26 on b34a51e1). Before/after photo sheets: https://claude.ai/artifact/HLqtsmsrjVJJVqrEpkMpr8 (copies in main wip/bug-153-155-shots/).
