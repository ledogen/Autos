# Handoff — ranger.glb proportion + detail pass (2026-09-22 → 2026-09-25)

**State: all work is COMMITTED TO THE WORKING TREE and exported.** `assets/models/ranger.glb`,
`assets/models/src/ranger.blend` and `assets/models/src/ranger.py` are in sync. Nothing is
half-finished. `data/vehicle-models.js` was touched once (see "Runtime spec" below).

## What this pass was

A long single-session run of owner-directed proportion fixes on the hero vehicle, all measured
against `references/98 ranger reference/` rather than eyeballed. The method that worked, and is
worth reusing: **load the reference photo in Blender, threshold the red bodywork, trace its
silhouette, and scale by the wheelbase** (838 px ÷ 2.835 m = 295.6 px/m on image 1). The photo is
square-on to the flank so the mapping is affine — no perspective correction needed. Every number
below came out of that, not out of judgement.

## Changes, in order

| # | Change | Key constants |
|---|---|---|
| A→B | Cab shifted forward 105 mm as a rigid unit | `Y_COWL` 0.584→0.689, `Y_CAB_REAR` −0.630→−0.525, `Y_BED_F` −0.710→−0.605, + 26 cab-fixed y values |
| B→C | Beltline lowered to the measured height | `Z_BELT` 1.183→1.070 |
| C→D | Hood fall, door skin, mirror, door-glass front edge | `Z_ROCKER` 0.442→0.395, `Z_UNDER` 0.415→0.368 |
| D→E | Hood/headlight break, single window, wider A-pillar | `NOSE_Z_TOP` derived, `PILLAR_A` 0.038→0.068, B-pillar deleted |
| E→F | Full window frame, door seam, backlight, nose wrinkle | `NOSE_DROP_LIN` added, `GH_BELT` solved |

## Proportions now, against the reference

All three cab spans partition the wheelbase and land within 17 mm:

| span | reference | model |
|---|---|---|
| front axle → cowl | 0.211 WB | 0.208 WB |
| cowl → cab rear | 0.420 WB | 0.426 WB |
| cab rear → rear axle | 0.369 WB | 0.366 WB |
| door skin (rocker→belt) | 0.675 m | 0.675 m |
| A-pillar, side view | 64–74 mm | 68 mm |
| body behind the side glass | 264 mm | 270 mm |

## Traps found this pass — read these before touching the front end or the greenhouse

1. **`NOSE_Z_TOP` was a hand-copied duplicate of `CLIP_ST[0][3]`.** Re-sloping the hood moved
   `CLIP_ST` and not the copy, so the nose rim leaned its face over a 75 mm range that no longer
   existed and tore the surface open at the headlamp. It is `CLIP_ST[0][3]` now. `Z_NOSE_APEX` had
   the same disease (typed 0.880 against a lamp band that had moved twice) and is now derived from
   `Z_LAMP0/1`. **Any new number that restates another is the next one of these.**

2. **The nose rim's drop used a `1−cos` ease, which starts flat.** The hood arrived at the last
   station falling at 0.242 and the rim flattened it to 0.103 for 91 mm before plunging — read as a
   bulge because it was one. Split into `NOSE_DROP_LIN` (carries the slope on) + `NOSE_DROP` (the
   round-off); the profile now only ever steepens: 0.242 → 0.235 → 0.327 → 0.643.

3. **`Z_ROCKER` has a hard ceiling**: `Z_UNDER + UND_EDGE` must stay under it or every section ring
   folds. Lowering the rocker means lowering the underbody pan by the same amount. The 9 mm margin
   and the 27 mm of pan clearing the rocker are both preserved.

4. **The A-pillar's rear edge, extrapolated to the beltline, lands 53 mm FORWARD of the cowl.** It
   rakes 51°. Any side glass drawn down to the belt gets its front corner sliced by the sill and
   stops being a quad. `GH_BELT` is now *solved* by `_solve_glass_bottom()` — the height where that
   edge crosses the cab's shoulder — so the pane stays a quad when the rake, the pillar width or the
   cowl step move. All three moved this month.

5. **The mud flap's bottom edge is the model's lowest point, so it sets `shiftDown`.** Anything that
   changes what hangs lowest changes the runtime spec.

## Runtime spec

`data/vehicle-models.js` → `shiftDown` −0.007 → **−0.045**, because the mud flaps were shortened and
the model's lowest point went 0.108 → 0.146. `targetLength` (4.705) and `shiftRear` (+0.299) are
unchanged and no physics preset was touched. **Re-copy `shiftDown` from `report()`'s printout after
any change to what hangs lowest** — left alone the truck sits high by exactly the difference.

## Quality state

- **3978 / 4000 tris.** Tight. The bed is the biggest consumer (~1030), then the front end (~750)
  and the interior (~560). Anything new needs a saving found first.
- 0 overlapping coplanar face pairs, 0 inverted normals of 600 rays, 0 loose verts.
- Non-manifold 10 (the cowl ring — expected, documented in `audit()`).
- Border edges 138: the nose opening, the tail lamps' deliberately-skipped back plane, the glass
  panes, and now the window frames and door seams. All open by construction.
- `npm test` last run at the mud-flap change: **40/41 green**. The one red is `road-clearance.mjs`,
  a standing red on main by owner ruling, unrelated to the model.

## Open, not done

1. **Ride-height / sag is unresolved and the owner has not ruled.** The model is authored at full
   suspension droop and the loader drops the body 101 mm for static sag, so in-game the roof sits at
   1.499 m while the parked reference measures 1.594. If `bodyHeight 1.60` in `data/ranger.js` is
   meant as the *parked* roof height, the whole body is ~95 mm low in play and the authored numbers
   should be ~1.70 at droop. If it means the authored droop height, it is correct as-is. **This
   blocks any further absolute-height work** — all the spans above are ride-height independent and
   safe, but the cowl item below is not.
2. **The hood is still ~37 mm high at the cowl.** Shape is now right; absolute height is not. Fixing
   it moves the cowl, which is shared by the front clip and the cab and drags the windscreen base,
   the A-pillar foot, the plenum, the wipers and the dash with it. Entangled with (1).
3. **The bed rail is ~55 mm low** — 1.141 against the reference's 1.196. `Z_RAIL`'s comment still
   claims it "reads BELOW the door belt, as on the ref"; **that comment is wrong** — measured, the
   reference's rail sits 122 mm *above* the door belt. Lowering the belt has already flipped the
   model to the correct side (+71 mm), but the magnitude is short.
4. **The side glass is ~12% shorter than the reference** (402 mm against 457) as a deliberate
   consequence of solving `GH_BELT`. `GH_BELT` back to a typed 1.079 restores the height at the cost
   of the front corner's fifth point returning.

## Scratch

Variant sources for every step are in the session scratchpad as `ranger_{A..F}.py` — they will not
survive. If any of them matters, copy it out now.

---

# Pass 2 — detail fixes (2026-09-25, same day)

Six owner-directed fixes, all exported. **3978 / 4000 tris — unchanged.** Nothing was added;
every fix is a different number or a different material on geometry that was already there.
`targetLength` / `shiftRear` / `shiftDown` are all unchanged, so `data/vehicle-models.js` was
not touched.

| # | Complaint | What it actually was | Fix |
|---|---|---|---|
| 1 | side window outline not uniform — top way too thin, sides a little thin | every edge inset the same 20 mm **in its own axis**: the A-pillar rakes 51°, so 20 mm of y drew a 12 mm band; the top's outer edge was `GLASS_TOP_Z`, 16 mm ABOVE the rail underside, so 16 of its 20 mm were buried | `TRIM_VIS` (28 mm) / `TRIM_VIS_B` (38 mm) are the **visible** widths; raked edges take `TRIM_VIS·hypot(rake,1)`, the top is measured down from `Z_DLO_TOP`. `GH_BELT` re-solved with the wider front band |
| 2 | door seam is a short line by the window, not a seam | the strip was **recessed 4 mm** — parallel to the skin and behind it, i.e. buried. The only visible stretch was above the belt, where `cab_flank_x()` over-reports the greenhouse and it poked through | `SEAM_PROUD` +2 mm; `seam_skin_x()` switches to `gh_x()` above the belt; `seam_y()` rakes with the C-pillar above the belt (IMG_0882) instead of crossing it |
| 3 | hood reads thin and placed on top of the headlights | the rim rolled 70 mm, which put the hood line **8 mm** above the lamp — there was no hood there to read — and the fall was 0.235 / 0.371 / 0.878, i.e. flatter than the hood arriving before plunging | rim roll 70 → 44 mm, split 40/4, approach softened (`CLIP_ST[1]` ztop 1.076 → 1.072). Bands now 0.218 / 0.234 / 0.292 against an approach of 0.211 |
| 4 | marker discontinuous with the headlight at its top edge | `NOSE_LAMP_ROUND` was a hand-typed ramp starting 192 mm back along a 520 mm path — the radius-spread-over-a-third-of-a-run taper again, breaking within one station of the clear/amber divider | `NOSE_LAMP_ROUND_R = 0.040` through `edge_fillet()` on **arc length**: tangent where it starts, so the top edge is level from the grille right round the corner |
| 5 | little gaps at all four corners of the rear glass | two separate faults, and the windscreen had the same pair: (a) each pillar stub's outward face was DARK, and it stands 6 mm proud of the screen panel, so it drew a 32 × 18 mm hole at each top corner; (b) the lower backlight panel stopped at 0.670 while the side panels start 30 mm above the glass line, leaving the cab rear genuinely OPEN at the bottom corners — a ray fired from behind came out on the dash | `SKIN_BAND = (3, 1)` paints the A-pillar's front face and the C-pillar's rear; the lower panel runs out to `gh_x() - 0.014`, the same edge the side panels use |
| 6 | fenders wider than the doors where they meet | both shells read 0.816 at the cowl and always did — there was no step THERE. The flank was still narrowing as it crossed the shut line and went flat 34 mm later: 10 mm of taper packed into the first 34 mm of door | fender spends its tuck BEFORE the joint (`CLIP_ST` 0.820 → 0.816) and hands over at 0.807 against the door's constant 0.806 |

## The one that was structural, not cosmetic

Fixes 3 and 4 uncovered a **hard geometric floor that had been violated since the rim was built**:

> `nose_rim_ring()` rolls the WHOLE last section down by the rim's drop — creases included.

`SQUARE_Z` is tuned so the fender's squaring crease clears the lamp band (z 0.780..0.982) **on the
last full section**, at z 0.9977. That check was never carried forward through the roll. At 70 mm of
drop the crease arrived on the outermost rim ring at **z 0.935 — square in the middle of the band**,
the flank then lost 65 mm of width in the 34 mm above it, the lens followed the skin up into that,
and its top band **folded over itself**: one 0.7 cm² quad with its normal pointing backward, which
flat shading draws as a black wedge in the amber. The false "tear" again — never a hole, always a
crossed ring.

The clearance is therefore

    (hood line at the nose face) − Z_LAMP1  ≥  crown + (shoulder − squaring point) + margin
                                           =  22 + 24 + 6  =  52 mm

**and it was eight.** Half is paid by the rim rolling less (70 → 44 mm, which the owner asked for
anyway), half by the lamp (`Z_LAMP1` 0.966 → 0.946, so 180 → 160 mm). It is **asserted in `report()`
now** — "lamp band clears the rim's rolled crease", currently 0.9584 vs 0.946.

There is also a **ceiling** on that same drop and it is the hood's own approach slope: a rim flatter
than the panel feeding it is a flat spot between two steeper runs, which is the bulge pass 1 already
chased. Both bounds are written into `NOSE_DROP`'s comment. Anything that moves `Z_LAMP1`, the crown,
`SQUARE_Z` or the drop has to re-check both.

## Second-order: the lens face's middle knot

The lens face is two chords between three heights, so a chord across a section knee runs inside the
metal — 15.5 mm at the worst station against 9 mm of `NOSE_LAMP_PROUD`, i.e. red fender through the
amber. `_lens_mid_knots()` now **solves** for where each section's middle point goes: on the worst
knee, not at a fixed 0.5. Costs nothing — same seven points, same bands.

**`KNEE_SLEW = 0.20` is the load-bearing half of that.** The dominant knee SWITCHES as the lamp turns
the corner (rolled squaring crease, then rolled hip two stations later), so the raw answer jumps
0.885 → 0.301 across 55 mm of path and the band between those rings is twisted enough to render
black. Slew-limited, the worst residual chord is 5.2 mm — well inside the 9 mm the lens stands proud.

## Verification

- `report()`: all 12 invariants green, including the new one.
- `audit()`: 0 overlapping coplanar face pairs, 0 inverted normals of 600 rays, 0 loose verts,
  non-manifold 10 (the cowl ring, expected), border edges 138 (unchanged).
- Explicit ray sweeps from dead ahead and dead astern over both screen apertures: no dark face and
  no hole anywhere in the surround.
- Zero backward-facing lens/amber polygons (was 1 per side).
- `node test/run-all.mjs --changed=<the three model files>` → **no gates cover a `.glb` change**; the
  in-Blender audit is the gate for this asset.

## Still open (unchanged from pass 1)

Ride height / sag is still unruled, the hood is still ~37 mm high at the cowl, and the bed rail is
still ~55 mm low. The side glass is now ~10 mm shorter again (the uniform surround costs that), so
it sits ~398 mm against the reference's 457.

---

# Pass 3 — the door shut line and the cab's back face (2026-09-26)

Five owner-directed fixes, all exported. **4030 / 4200 tris** — the budget was raised from 4000 by
the owner to pay for this pass; 52 of the 222 new triangles are spent, the rest is headroom.
`targetLength` / `shiftRear` / `shiftDown` are unchanged again, so `data/vehicle-models.js` is
still untouched since pass 1.

| # | Complaint | What it actually was | Fix |
|---|---|---|---|
| 1a | cab reads too thin behind the door | `Y_DOOR_SEAM` -0.430 left 95 mm of quarter — 8% of the cab's length | -0.335, so 190 mm. The line still clears the C-pillar's front edge at every height |
| 1b | only the rear edge of the door gap is there | the loop was never drawn — the seam was three strips up the back of the door and nothing else | `door_shut_runs()` returns the whole loop: sill, rear, forward under the cant rail, down the front. `shut_line()` draws each run |
| 2 | bed front wall does not meet the bedsides | the pressed panel was a typed ±0.560 against a `W_BED_IN` of 0.700 — 140 mm short each side, with the floor running past it into the corners | `W_BED_IN - 0.002` |
| 3 | fender still wider than the door, but only above the belt | the cowl's two stations top out at the cowl deck (z 1.17), everything behind them at `Z_BELT`; their `w_shoulder` was 0.776 against `gh_x(1.172) = 0.7559`, so the cowl flank read 0.782 at z 1.09 where the greenhouse read 0.767 — a 15 mm bulge, 20 mm long, directly under the mirror | shoulder solved from `gh_x()` at each station's own belt height; residual 2 mm. `CLIP_ST`'s three forward stations eased with it so the hood does not pinch |
| 4 | the rear-edge chamfer gets cut off at the rear window's sill | `CAB_END_EDGE` bevels the cab SHELL's rear corner, and the shell stops at the beltline | the C-pillar's section carries the same 22 mm bevel from its foot to its head, and `roof_ring()` takes it across the top — one unbroken bevel right round the rear opening |
| 5 | the rear window frame is inset relative to the back wall | the panels sat 6 mm forward of the pillar's rear face and stopped 14 mm short of the flank, so the pillar stood proud all the way round the backlight | panels flush on the pillar's own rear plane and run out to its INNER edge — a butt joint, not an overlap, which is what the 6 mm was avoiding |

## Two things worth keeping

**`seam_skin_x(y, z)` takes y now, and must.** The cab shell carries the skin up to *its own* belt —
1.172 at the cowl, `Z_BELT` everywhere behind the step — so the handover height is not a constant.
Neither function may be extrapolated past it: `cab_flank_x()` keeps narrowing above its belt and
answers **9 mm wide** at the C-pillar, which floats the shut line off the metal.

**`shut_line()` takes its width PERPENDICULAR to the run.** A sill line is horizontal, so a strip
built ±`SEAM_HALF` in y would have no width at all and draw nothing. This is why the loop is a
helper rather than four copies of the original three-quad block.

The door loop is deliberately *not* closed by `door_shut_runs()` alone. Between the top run's
forward end and the front run's top the boundary is the **window surround**, which is already a dark
band on the same skin and already runs along the belt, up the A-pillar and back along the rail —
a second line over it would only cost faces. The two ends are placed to meet it: the top run laps
6 mm under the surround's outer rear edge, and the front run stops at `Z_BELT`, which *is* the
surround's outer bottom edge.

`pillar_frame()` now takes a `chamfer` and the C-pillar's section is five-sided where the A's is
four, so `SKIN_BAND` is a tuple of tuples: band 3 on the A-pillar, bands 1 (chamfer) and 2 (rear
face) on the C. `ROOF_BEVEL` gives each point of the roof section its own outward normal, because
`bevel_ring()` only moves x and the roof's rear edge is horizontal across the top — up there the
chamfer is a drop in z, and by the cant rail it is a move inboard.

## Verification

- `report()`: all 12 invariants green.
- `audit()`: **0 overlapping coplanar face pairs** (so every new butt joint is a joint, not an
  overlap), 0 inverted normals of 600 rays, 0 loose verts. Non-manifold 10 → 12 (the pillar's
  chamfer edge), border edges 138 → 170 (the eight new shut-line strips, open by construction).
- Ray sweeps from dead ahead and dead astern over both screen surrounds: still solid paint, no
  dark face and no hole.
- Flank width across the cowl at z 1.09: 0.784 / 0.777 / 0.772 / 0.769 / 0.770 / 0.767 — 3 mm of
  spread where it was 15.
- Still no node gate covers a `.glb` change; the in-Blender audit is the gate for this asset.

---

# Pass 4 — the bed's front wall, and the shut line made geometry (2026-09-27 → 28)

**4142 / 4200 tris.** Runtime spec unchanged for the fourth pass running.

## The bed's front wall was not a wall

`bed_ring()` is a closed section around the **solid** — pan, flanks, rails, floor slab — so the
loft's front cap fills the metal, not the mouth. Nothing else closed the mouth either. What stood
there was the pressed panel alone, 28 mm back off the section and spanning only z 0.755..1.066, so
the front of the bed was **open** for 55 mm above the floor and 75 mm below the rail: a ray fired
forward down the bed came out on the cab's rear skin. Owner's read of it, 2026-09-27: "the front
wall of the bed could move forward a little bit, it's not flush with the front edge of the bedside."

There is a wall now — floor to rail, wall to wall, its outer face **on** `Y_BED_F`. `BED_WALL_T` is
14 mm and thin on purpose: the face the chase camera reads is the INNER one, so every millimetre of
thickness is a millimetre that face sits behind the bedsides' own front edge. Flush is safe here
because the cap covers the section's solid only, so a face across the mouth is coplanar with
nothing — it butts the cap's inner edge along the floor, both walls and the rail. Two things it
needed: the bottom drops 8 mm **under** the floor (level, its underside is coplanar with the tub's
floor and z-fights — the audit caught it), and the pressing's front face is buried 4 mm inside the
wall for the same reason.

## A FLAT STRIP PARALLEL TO THE SKIN IS PAINT

This is the pass's whole lesson and it is worth stating as a rule. A strip lying parallel to the
skin carries **the skin's own normal**, so flat shading gives it **the skin's own light**, and the
only thing left to tell them apart is colour — which is the definition of paint. Owner, 2026-09-27:
"it reads as a painted line because it is, and not as a panel gap." Widening it, darkening it and
moving it all leave the normal alone and all still read as a stripe.

What makes a real gap read is **light–dark–light**: the two panel edges catch the light at a
different angle from the flank, and the recess between them falls into shadow. `SEAM_SECTION` is
therefore four facets, and **not one of them is parallel to the skin** — a body-colour bevel up out
of the skin, a dark V down to a floor 0.5 mm out and back, and a body-colour bevel down again.
`shut_line()` sweeps it perpendicular to each run and measures every point's height from
`seam_skin_x()` at its own (y, z), so it follows the panel rather than chording across it.

**It cannot be a groove.** The cab's flank is a continuous loft with no hole in it, so anything
placed INBOARD of that surface is simply hidden by it; every millimetre of the section has to live
outside the skin. Cutting the door out for real would mean re-stationing three lofts — the shell
below the belt, the greenhouse above it, and the quarter — and was ruled against on cost.

## The top run is on the roof

Owner, 2026-09-28: "a fully framed door should not have the seam coincident with the top edge of the
glass. The actual Ranger has the door seam on the roof." It sat at `Z_DLO_TOP`, which is the top of
the daylight opening — so the door had no frame above the glass at all and the line read as the edge
of the window rather than the edge of a door. It is 36 mm higher now, and the 36 mm of paint between
it and the surround's visible top IS the door frame's upper rail. The loop gained a run down the
A-pillar's rear edge to bring it back to the surround.

**It stops just short of the roof's own edge chamfer, and that is not arbitrary.** Ridden up onto
it, the section's outer bevel came out within a couple of degrees of that chamfer's plane and 2 mm
off it — parallel faces, which is a z-fight, and the audit caught it on the first build.
`z_top = Z_ROOF - ROOF_EDGE - SEAM_SECTION[-1][0] - 0.005` keeps the whole section on the flank
below `ze`, and moves with `ROOF_EDGE` if that ever changes.

`seam_skin_x()` now describes three surfaces, not two: the cab shell up to its own belt, the
greenhouse above that, and the roof's edge chamfer above `Z_ROOF - ROOF_EDGE`.

## Verification

- `report()`: all 12 invariants green. `audit()`: **0 overlapping coplanar face pairs**, 0 inverted
  normals of 600 rays, 0 loose verts. Border edges 170 → 250 (the section is four ribbons per run
  instead of one).
- The section was checked at close range from outboard: body-colour lip catching the light, black
  floor, shadowed return. Light–dark–light, as designed.

---

# Pass 5 — the door seam is DELETED (2026-09-29)

Owner's ruling, after seeing pass 4's four-facet section: **"i dont like it just get rid of the door
seam entirely."** Gone — not disabled, not parked behind a flag. `Y_DOOR_SEAM`, `SEAM_SECTION`,
`SEAM_MATS`, `seam_y()`, `seam_skin_x()`, `shut_line()`, `door_shut_runs()` and the call in
`build_greenhouse()` are all deleted. Nothing else referenced any of them, so nothing else moved.

**Do not re-add it.** Three shapes were tried and ruled against in four days: a recessed strip
(invisible — buried under the skin), a flat proud strip (reads as paint, which it is), and a
four-facet lit-lip section with the top run carried onto the roof (built, verified, rejected on
looks). The cab reads as one panel by the owner's choice.

The only thing worth keeping from the attempt is the *diagnosis*, because it generalises to any
future surface detail on this model:

> A flat quad lying parallel to the skin carries the skin's own normal, so flat shading gives it the
> skin's own light, and the only thing left to tell them apart is colour — which is the definition of
> paint. And a groove cannot be cut: the cab's flank is a continuous loft with no hole in it, so
> anything placed inboard of that surface is simply hidden by it.

**4014 / 4200 tris**, 186 spare — the budget the owner raised to 4200 for pass 3 stays where it is.
`report()` all green, `audit()` clean: 0 overlapping coplanar face pairs, 0 inverted normals of 600
rays, 0 loose verts. Border edges 250 → 122, below where they were before the loop was ever added,
because the old three-strip seam went with it. Runtime spec unchanged.
