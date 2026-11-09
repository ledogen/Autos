---
id: BUG-153
type: bug
status: open
severity: major
opened: 2026-11-08
source: Lane B, BUG-149's leg lip (seed 1074499174)
relates: BUG-149 (depends on this), BUG-12 (the ribbon's continuous frame), BUG-82 (ribbon-pad weld), FEAT-10 (deg-2 join weld), the corner-facet fix (_refineFrame)
---
lane: B

# BUG-153: the drawn ribbon tilts against physics on curves — the wheel rides up to ~0.1 m off the asphalt past junction mouths

MESH == PHYSICS breaks on the ribbon wherever a leg curves, and it is worst just past junction mouths, where legs
bend into the node on slopes. On the centreline the two agree exactly. Off it, physics − drawn grows linearly with the
lateral offset: the drawn ribbon is TILTED against the surface the wheel rides. The truck's body collides with the
drawn ribbon (the road-tile trimesh) while its wheels ride the analytic carve, so the two disagree by the same amount.

BUG-149's 0.263 m leg lip (seed 1074499174, `g:745990,432424,-1:0,1,1`, side 1, s 12) is this: the drawn lip there is
0.128 m (the designed 0.15), and physics stands 0.134 m above the drawn ribbon.

## Mechanism

- **Physics' frame:** `_resolveRoadSurface` → `_refineFrame` projects onto the run's exact analytic centerline
  (`e.centerline.nearest(...).tangent`, the corner-facet fix).
- **The ribbon's frame:** `road-mesh.js _ribbonSection` builds each cross-section on `runProfile(arcS).tx/tz`.
  `_buildRunProfile` sets `tx[i]` to the INCOMING chord (vertex i−1 → i), and `_interpolateRunProfile` interpolates
  it linearly. So on a curve the section frame trails the true tangent.
- **The height error:** every vertex of a section takes the height of the section's arc, but physics re-projects the
  vertex to a different arc. The error is ≈ grade × lat × tan(frame lag).
- **Measured** (`wip/bug-147/tangents.mjs`, the BUG-149 leg): polyline vertices every 4.0 m on a curve turning 9.5°
  per chord (radius ≈ 24 m). The frame lags physics' tangent by 9.5° from s 4 to s 11, by 3.6° at s 14, and by 0
  from s 16, where the leg straightens.
- **At the ribbon's own vertices** (`wip/bug-147/mouth-verts.mjs`, potholes off): physics − vertex is 0.000 on the
  centreline, +0.087 m at lat 3.73 beside the mouth, and +0.036 / −0.024 m at lat ±3.75 by s 14.6. On this 14–25 %
  leg, 0.2 × 3.73 × tan 8° ≈ 0.10 m.

## Census

Probe: `wip/bug-147/mouth-float.mjs`. Each leg's OWN ribbon (a hit triangle's centroid resolves to the leg) is raycast,
and compared with physics at wheel height, potholes off. The table gives each leg's worst |physics − drawn| at lat
−4.5 / 0 / +4.5, by distance past its mouth.

| seed | pads | legs | 0–5 m median | 0–5 m max | 5–10 m median | 5–10 m max | 10–15 m median | 10–15 m max |
|---|---|---|---|---|---|---|---|---|
| 1074499174 | 5 | 13 | 9.3 cm | 34 cm | 2.1 cm | 18 cm | 1.5 cm | 42 cm |
| 6 (test seed) | 7 | 21 | 9.4 cm | 17 cm | 2.7 cm | 15 cm | 1.7 cm | 12 cm |

Calibration: 40–60 m past the mouths on seed 1074499174, the same probe reads < 2 cm on 12 of 13 legs and 2–5 cm on
1. The probe is sound, and the gap lives on the curves next to junctions. Mid-road curves have the same mechanism,
scaled by their own curvature, grade and chord spacing; not yet censused.

## Acceptance

- [ ] The drawn ribbon matches physics across its width on curves: the census above under ~2 cm in every band, at the
      pads and mid-road, on random seeds and seed 6.
- [ ] The ribbon-pad weld (BUG-82) and the deg-2 join seal (FEAT-10) still hold.
- [ ] BUG-149's leg lip measures the designed ~0.15 m in physics, as it already does drawn.
- [ ] A gate pins it: ribbon vertices vs physics at the same x,z.

## Root cause and fix (Lane B, 2026-11-08, `land/bug-153`)

**The frame.** `road.js runFrameAt(arcS, runKey)` is runProfile's sample with tx/tz replaced by the tangent physics
projects onto: the run's analytic centerline at the true arc (`_refineFrame`'s eligibility; the chord tangent stands in a
T departure band, as in physics). FEAT-10's degree-2 weld is re-applied on top: the same directions, the same smoothstep
over roadJoinWeldLength. Every reader that draws or rebuilds the ribbon's edge takes it, so the BUG-82 weld still holds:
`_ribbonSection` (the sweep and the pad mouths' weld sections), the deg-2 lead-ins, `_junctionMouths` / `_ringHasMouth`
(the ring's mouth chords), the crotch walk, the deg-2 connector mouths, and `_legDeckTop` (the leg deck under a pad).
`runProfile.tx` stays the chord tangent for everything else: curvature, the tunnel tube and portals, the lip frames.

**Measured** (`test/ribbon-frame.mjs`'s census: every drawn section's pavement vertices vs physics at the same x,z,
potholes off, R 640):

| seed | main: verts ≥ 2 cm (frame class) | main worst | fix: verts ≥ 2 cm | fix worst |
|---|---|---|---|---|
| 273004588 | 232 | 19.7 cm | 0 | 1.0 cm |
| 2654449719 | 303 | 6.2 cm | 0 | 0.5 cm |
| 1074499174 | 461 | 6.9 cm | 0 | < 2 cm |
| 6 (test seed) | 188 | 5.7 cm | 0 | 0.8 cm |

BUG-149's leg (1074499174, `g:745990,432424,-1:0,1,1`, side 1): drawn == physics to 1 mm at s 11 / 12 / 13 (main
+0.128 / +0.134 / +0.100). The physics lip at s 12 is now 0.128 m (main 0.262 m), the designed edge.

**Two other mechanisms remain, both physics-side and the same on main** (the gate reports them apart):
- **A promoted T's departure band** (`offCurveSpans`, the last ~30 m before the T): physics deliberately frames on the
  raw polyline chords there (the points left the centerline), so its frame jumps up to 15° at every vertex. A smooth
  ribbon cannot follow a faceted surface: 58 / 37 / 20 / 0 vertices ≥ 2 cm, up to 0.38 m on a 10°-banked curve
  (2654449719, (126.8, −182.1)).
- **The QUAL-10 ruled blend leaks onto a leg's own pavement.** Near a node, physics blends every in-range leg's grade;
  the soft gap clamp (RULE_SOFT 1.2) leaves a sibling up to ~12 % of the weight at the pavement edge, so physics bends
  toward the sibling's grade where the ribbon does not. At the vertices: 25–88 per seed, up to 8.2 cm. Between them it
  is worse at the edge: −0.34 m at lat 4.5, 0.5 m past a mouth (1074499174 `g:745990,432424,-1:1,1,1`). And physics
  steps by that same 0.34 m across the mouth chord, because the pad side snaps to the leg's unblended deck.

**World fingerprint (main 5bf20c0c vs the fix).** network, poi: identical. The other components differ, and each one
is accounted for:
- **profiles:** a hash artifact. `_buildRunProfile` now also returns the weld data. The md5 of every profile minus that
  field equals main's (seed 7 origin, seed 6 fork).
- **junctions / surface / carve / water / props:** the ring's mouth chords turn with the ribbon frame, so the pad surface
  moves: MESH == PHYSICS by construction. Lattice proof (`analyticHeight`, 4 m grid, the four play windows): 28 / 87 /
  51 / 2 points moved, every one within 21.3 m of a junction node, worst 7.5 cm (seed 7). Nothing moved on open road.
- **props** (seed 6 fork window): 46 of 3,225 props changed y / gy / tilt only, worst 1.55 cm. None was added, removed
  or moved in plan. The placer is scatterChunk's ground sampler (`heightAt` = analyticHeight) reading that pad surface.

**Gate** `test/ribbon-frame.mjs` (R 448): the fix PASSES, worst 0.98 / 0.98 / 1.83 / 0.98 cm. Main FAILS with 691
vertices ≥ 2 cm, worst 6.9 cm. The two remaining mechanisms are BUG-154 and BUG-155 (orchestrator 2026-11-08: land the
frame as it is). The gate reports them apart until they are fixed, then folds them into its PASS.

**Affected gates (71):** interrupted at 5/71 green by the owner's hold (2026-11-08). Re-run before landing. Then the
shot sheet: 3 sloped curved mouths (candidates from main's frame-class census: 273004588 node (509.3, 412.5) leg
`g:509295,412497,-1:1,0,1`, 17.8 cm on main; 2654449719 node (−50.6, 330.2) leg `g:-2,0,0:-1,0,0`, 6.2 cm; 1074499174
node (190.3, −356.7) leg `g:0,-1,1:-34662,200187,-1`, 5.0 cm), chase-cam height, the same frames on main and the fix.

## The two reds — decided: land 153 + 155 together (Lane B, 2026-11-09)

`land/bug-153`'s affected gates: 68/70, two reds. Both measured on main (5bf20c0c, road code = main's), on `land/bug-153`
and on `land/bug-155` (which carries 153). Logs and probes: `wip/bug-153/reds/` in the land-155 tree.

**junction-edge-lip** — NEW with 153's frame, and 155 takes it out:

| | worst leg lip (max 0.25) | worst pad tear (max 0.08) | tightest pad margin | BUG-146 tear (excepted) |
|---|---|---|---|---|
| main | 0.237 m — PASS | 0.075 m | 6.3 cm | 0.143 m |
| 153 | **0.276 m** (917338424 `g:-1,-1,2:0,-1,0` side −1 s 14) — FAIL | **0.081 m** (917338424 (−212.04, −543.86)) — FAIL | 6.3 cm | 0.119 m |
| 155 | 0.196 m — PASS | 0.036 m | 13.1 cm | 0.119 m |

153 turns the ring's mouth chords with the ribbon frame; at that seed-917338424 node the leg's edge then reads the
ruled blend's leak (BUG-155's mechanism) harder. 155 is better than main on every number.

**vertical-curvature** (a ceiling gate; main counts junction 202 — the 203 ceiling was 1 stale):
- 153: junction 205. One-to-one kink match vs main: 4 new, 1 gone. Two are genuinely new mild crests (0.034 /m seed 11
  (−927.3, −1313.0), ~5 m from BUG-63's T; 0.031 /m seed 7 (−1505.3, 1177.7)). Two are the gate's 15 m de-dup
  splitting a feature main already counts (seed 7 (−1428.6, 549.9) track 0; seed 11 (1925.3, −1250.8)). Sharpest unchanged.
- 155: junction **201** (−1 vs main), open **19** (+1). The open one is no new kink: BUG-90 dip 1 world's sag at
  (903.5, 1584.6), 51.5 m along `g:858041,1593089,-1:2,2,1`, inside that promoted T's 58 m departure band. BUG-154's
  band frame moves physics ≤ 1.1 cm there: 0.0299 → 0.0303 /m, across the 0.03 flag.
- Ceilings on `land/bug-155`: open 18 → 19, junction 203 → 201, dated in the gate's ledger. PASS.

**Decision:** 153 cannot land alone (junction-edge-lip fails; a fix would be 155's clamp). Land `land/bug-155` as one
landing for BUG-153 + 154 + 155. Its affected gates run next; still owed before the request: `ribbon-frame.mjs` with the
band + blend classes folded into PASS, the fingerprint lattice proof vs main, and the shot sheet / photos.

## Landing proof — BUG-153 + 154 + 155 (Lane B, 2026-11-09)

`land/bug-155` merged main twice (577988bd: BUG-146 + BUG-152; db482dfe: BUG-147). Both merges clean. One comment
changed in the merge's wake: BUG-146 moved the pad mask's ramp onto the ribbon's station, so BUG-155's clamp comment
now says its ramp reads the polyline foot's station (≤ lat·tan(kink/2) apart), instead of "the SAME ramp".

**`test/ribbon-frame.mjs` folds the band and blend classes into its PASS** (5243e31f). Own deck < 2 cm (worst 1.83 cm),
ruled blend < 2 cm (worst 0.0 cm), departure band < **2.5 cm** (worst 2.3 cm, 2654449719), overlapping ribbons still
reported only (worst 1.2 cm). The band bar is the owner's call: 2.3 cm is option A's predicted residual (the ribbon's
centre rides the slice spline, physics' the chords). Note: the gate reads the drawn VERTICES. Rasterising the whole drawn
surface every 25 cm (`wip/bug-153/drawn-raster.mjs`) at that bend gives, inside 3.75 m of the centreline: main 1061 of
3111 spots ≥ 2 cm, worst 35.7 cm → branch 107, worst 4.3 cm (5.1 cm out to 4.5 m). Option B (physics on the ribbon's
own spline) is what takes out the last few cm.

**World fingerprint, main 961311ec vs 5243e31f, and again main ff39a05e (BUG-147 in) vs cd984636 — the same accounting
both times** (`test/fingerprint-world.mjs`, six windows): network and poi PASS
everywhere; profiles, junctions, surface, carve, tiles differ in every window; water in three; props in one. Accounted:
- **profiles:** the added `weld` field only. md5 of every profile minus `weld` is identical on both trees in five
  windows (seed 6 origin r 1400, seed 6 ponds, seed 6 fork, seed 7, seed 3).
- **surface / carve / tiles / junctions / water:** lattice proof (`analyticHeight`, 4 m grid, the four play windows;
  `wip/bug-153/lattice-class.mjs`). Every moved point is within RULE_NODE_WINDOW (40 m) of a node or resolves into a
  departure band's widened span; NONE moved anywhere else. Seed 6 ponds 121 points (all junction, worst 0.270 m) ·
  seed 6 fork 250 junction (worst 0.226 m) + 58 band (worst 0.164 m) · seed 7 111 junction (worst 0.251 m) · seed 3 2
  (worst 7 mm). The two worst movers (0.27 m seed 6 (−97, 185), 0.25 m seed 7 (244, 188)) are gore dirt 8.6–8.9 m off a
  leg's centreline, ~13 m from the node: BUG-155's handover moving off the asphalt into the gore, as designed.
- **props** (seed 6 fork): the same props with the same fields; 114 changed y / gy (worst 0.183 m), 2 tilt (< 0.001).
  None added, removed or moved in plan.

**Gores (BUG-155's stated cost).** Steepest 3.5 m drop beside each padded leg, 0–15 m past its mouth (`gores.mjs`): it
did NOT get steeper. Seed 1074499174 within 900 m: 85 → 82 %, 39 → 37 %, 26 → 27 % at (746, 432); 17 → 15 % at
(190, −357). Seed 2654449719 within 448 m: worst 27 → 20 %.

**Photos** (headless Chrome, both trees, same seed / camera / frame, potholes off in both via the module served):
`wip/bug-153/shots/sheets/sheet-{154,155,gores,153}.jpg` (+ `.html`). Tool: `wip/bug-153/shots/physics-shots.mjs`.
