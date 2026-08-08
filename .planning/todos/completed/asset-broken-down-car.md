---
id: ASSET-18
type: asset
status: done
severity: minor
opened: 2026-08-03
updated: 2026-08-07
closed: 2026-08-05
blocked-by: FEAT-59
relates: FEAT-46, ASSET-20, FEAT-36, ASSET-21
---

# ASSET-18: Broken down car

**POI model** — a destination, not dressing. It anchors a zone (FEAT-46 lay-by pads / FEAT-21 POI
scatter) and gives lawn furniture (ASSET-01..08) something to belong to. A POI carries provenance:
whatever is scattered around it should read as *its* stuff.

## Request

An old sedan pulled onto the shoulder, hood up, one wheel off and the corner on a jack, a spare and a
tyre iron on the ground beside it. A POI that is a *situation* rather than a place — the strongest
implied-story object in the set, and the natural companion to a hitchhiker.

**Modelled as a 1990s Buick Century Estate wagon** (user direction, 2026-08-05): a genuinely
undesirable car, plain beige, no wood panelling. Reference photos supplied; `hilux.glb` was the art
-style calibration piece.

## Spec — as shipped

| Field | Value |
|---|---|
| Tri budget | **≤2500** (1500 → 1800 for the jack + tyre iron, → 2000 for the nose rounding + mirror pods, → 2500 for the front-end rework) — **shipped at 2086** |
| Texture | **none.** Flat material colours, no UVs — supersedes the original "one 1024 albedo" line |
| Real size | car **2.01 m W × 5.01 m L × 1.46 m H** — width is mirror-to-mirror; the bodywork itself is 1.81 m across the flares. Whole asset incl. spare + jack: 2.68 m wide |
| Origin | base-seated: three tyre contact patches at y=0; asserted in `build.py` (`ground contact z`) |
| Forward | −Z — **verified numerically** from the exported GLB: headlamps at z −2.49..−2.46, tail lamps at z +2.43..+2.48 |
| Collision | `{ shape: 'box', dims: [1.85, 1.46, 5.02] }` — car body only; deliberately **excludes** the spare, jack and tyre iron so the player can walk over them |
| Draw calls | **8** (one per material) |

## Objects and materials

Two objects. `BrokenCar` (2070 tris, opaque, includes all three road wheels, the brake drum, the
spare, the jack and the tyre iron) and `BrokenCarGlass` (16 tris, alpha-blended, double-sided).

| Material | Role | Recolourable? |
|---|---|---|
| `CarPaint` | body panels, pillars, roof, bumper bars | **yes** — the only one |
| `CarTrim` | rub strips, valance, roof rails, mirrors, dark lower band, **wheel-well interiors** | no |
| `CarChrome` | grille frame + bars, hubcaps, brake drum, jack, tyre iron | no |
| `CarTire` | tyres | no |
| `CarLamp` | headlamp lenses | no |
| `CarTail` | tail lamps | no |
| `CarInterior` | tub, benches, dash, steering wheel | no |
| `CarGlass` | all six panes | no |

## Two deliberate departures from ART-STYLE.md — signed off 2026-08-05

Both were requested directly and are recorded in `ART-STYLE.md` under "Sanctioned exceptions".

1. **Transparency.** Rule 7 says no alpha blending and no glass. `CarGlass` is `alphaMode: BLEND`
   at 0.72 opacity, `doubleSided: true`. No other shipped model uses alpha — before this asset,
   every material in `trailer-home-a.glb` and `hilux.glb` was `OPAQUE`, and the trailer's "windows"
   are a recessed pleated curtain rather than glass.
2. **A modelled interior.** The anti-pattern list says exterior only, cap every opening. This car has
   a low-detail tub to the beltline, a front and rear bench, a dash and a steering wheel.

Neither may be copied into a scatter-density prop: the alpha costs sort order on iGPU and the
interior costs tris, and both are only affordable because a POI is placed a handful of times.

## Revision pass, 2026-08-06 — traps worth not re-learning

All from a user review of the first shipped model. Each is commented inline in `build.py`.

- **The interior was buried under the body's own roof.** The body is a closed loft, so its top deck
  ran across the cabin at *beltline* height — a lid over the tub, the benches and the wheel, leaving
  only the top 150 mm of each seat back visible. `loft()` gained a `skip(segment, k)` predicate and
  the cabin opening is now cut out of section edges 4 and 5 from the cowl to the tail. The tub then
  has to track the beltline width and span the whole cut, or the leftover gap is a see-through slit
  into the body cavity.
- **Open surfaces cannot be auto-oriented.** `bmesh.ops.recalc_face_normals` only defines "outward"
  for a closed manifold. The tub was a single-thickness U-strip, so the recalc picked floor-normals
  pointing *down* and wall-normals pointing *out*; with backface culling that made the whole
  interior invisible from above. Fixed by giving the tub real wall thickness (and the wheel-arch
  backing plate real depth) so both are closed solids.
- **The arch lip was centred on the sill, not the axle.** That put the top of the arch *below* the
  top of the tyre, which is what actually read as "compressed suspension" — more than the ride
  height did. `ARCH_Z = WHEEL_R` now, and the body floor came up 60 mm as well.
- **Front-face parts must stay inside the nose cap.** The nose is 0.800 half-wide and tucks to 0.760
  by the hood line; the first headlamps ran to 0.812 and hung off the corners. `build()` now asserts
  nothing mounted forward of the cap exceeds 0.735.
- **Glass built rectangular ignores the A-pillar rake.** The front door pane's top-front corner drove
  straight through the A-pillar and out the front of the car. Side panes now take a separate front-
  edge top Y so the leading edge follows the pillar and the pane is a trapezoid.
- **A duplicate rocker strip** at z 0.245–0.300 was wholly buried inside the dark lower band that
  `BODY_BANDS` already paints, and ran across both wheel arches. Deleted outright.
- **The brake drum was invisible, twice over.** First the dark backing plate sat *outboard* of it and
  simply occluded it; then, moved behind, it was still hidden because an honest hub depth (~0.79) is
  inboard of the flank and there was no real arch cutout to see through. Both had to cheat outboard
  — until the wells became real, below, at which point the cheat was reverted.

## Revision pass, 2026-08-07 — real wheel wells

The arches up to this point were a **proud dark ring stuck on a flat flank**, so the tyre read as
glued to the side of the car and the whole track/drum geometry was bent around hiding that. The wells
are genuine openings now, done without a boolean by varying one section point per station:

- `ARCH_R` / `WELL_DEPTH`: inside an arch, section point **P2 climbs the arch circle and moves
  inboard**. The section then reads sill → inboard and up through the well → back out to the fender
  lip at P3 → up to the belt, which is a wheel-arch profile. `_interp_station()` samples the
  hand-tuned control profile, and `STATION_YS` inserts 7 stations per arch, uniform in *angle* so
  the facets sit evenly on the arc. Body loft 196 → 436 tris; total 1448 → 1608.
- **The recess has to be dark, not just deep.** Left body-coloured, the P2→P3 fender-lip face renders
  as a broad pale chamfer over the wheel and the depth stops reading as depth entirely. `band_mats`
  now accepts a callable so section edges 2/7 can be dark inside an arch and body colour everywhere
  else — a band that varies *along* the car, which the old dict couldn't express.
- **Two earlier cheats reverted, since the thing they compensated for is gone.** `TRACK` back from
  0.790 to 0.755, so the tyre sits *inside* the fender lip instead of proud of a flat flank; and the
  drum back to an honest depth (face 0.822) with the well surface behind it, which also let the
  wheel-arch backing plate be deleted outright.
- **First attempt at the wells was wrong and had to be redone** (see the 08-07b entry below): moving
  one section point took the fender with it.
- **The side rub strip is cut into panels.** As one 4.5 m box at constant X it ran through the fender
  flare and across both openings — a strip at z 0.590–0.650 intersects an arch out to
  |y − axle| = 0.308. Now three runs (front fender / doors / rear quarter), each stopping clear of
  its arch and taking its X from the local flank width.

## Revision pass, 2026-08-07b — the wells, done properly

The first attempt above was rejected on review, correctly. Displacing **one** section point up and
inboard moved the point that is *both* the top of the dark band **and the bottom of the flank**, so
the whole lower body came inboard with it: a rectangular depression around the wheel with the fender
eaten away — and at 110 mm it was not even half the depth of the 200 mm-wide tyre.

- **The arch is now its own pair of section edges.** Two extra points per side (12-point section):
  `C = (well_x, arch_z)` is the pocket's inner face, `D = (w_max, arch_z)` is the opening in the skin.
  C→D is the pocket ceiling and D is where the skin resumes, so **the flank stays at full width from
  the arch lip to the belt** — the fender is a thin member in line with the body lines again. Outside
  an arch, C and D coincide and the pair collapses back to the plain lower band.
- **Depth is set by the tyre, not by eye.** `WELL_DEPTH = 0.250` puts the pocket wall at 0.632
  against a tyre inner face of 0.655 (`TRACK − WHEEL_W/2`), so the wheel could genuinely rise into
  the pocket. `build()` asserts it — a shallower value now fails the build rather than shipping.
- **The flank never gives way any more.** The previous pass painted the flank edge dark inside the
  arches to make the recess read; that is precisely what erased the fender. With the pocket on its
  own edges, edges 0/1/2 (and mirrors) are dark and 3–8 are body colour *always*.
- **Rear cargo floor humps over the axle.** A 250 mm pocket reaching z 0.75 runs straight through a
  flat cabin floor at 0.520 — the tub would have filled the pocket it exists to make room for, and
  the rear well would have ended up visibly shallower than the front (which is ahead of the cabin and
  never had the problem). The tub floor now rises over the rear arch at full width, as a wagon's
  does, so the cabin stays sealed from above. Verified with 165 downward ray probes: no leaks.
- Body loft 436 → 524 tris, tub 92 → 156; total 1608 → **1712**.

## Revision pass, 2026-08-07c — flares, glass seating, mirrors

- **Arch flares** are back, and cost nothing: the arch-lip point D stands `ARCH_FLARE` proud of the
  flank while the shoulder stays flush, so the skin slopes gently back inboard as it rises out of
  the opening. Same point, moved. It tapers away with the arch, so the flank between the wheels is
  dead flat and the panel-cut rub strips never meet a flare.
- **The steering wheel poked through the windscreen.** The rim rakes *forward* as it rises, so the
  top of the wheel is what gets you: at y 0.640 the rim top reached 0.724 where the glass was only
  at 0.682. Moved back to 0.545. `build()` now measures the signed distance from every tagged
  steering-wheel vertex to the windscreen plane — and the plane comes from a single `_windscreen()`
  helper shared with `build_glass()`, so the check can't drift from the geometry it's checking.
- **Panes stopped short of the bottoms of their frames.** They sat *above* the beltline, leaving a
  slot you could see straight through. All six now tuck `GLASS_SEAT` = 30 mm below the belt; below
  the belt the skin is outboard of the pane, so the overlap is hidden and it costs nothing to be
  generous.
- **Wing mirrors** are a stalk plus a head with a bright face, replacing the single flat box that
  hugged the door — at this scale the gap between body and mirror is the whole read, and a box
  flush to the flank just looks like a badge. This is what takes the quoted width to 2.02 m;
  the bodywork alone is 1.81 m and the collision box is unchanged.

**Assert-on-build inventory** (all in `build()` / `export()`, printed every run): forward −Z,
base-seated origin, nothing below the ground plane, nothing overhanging the front fascia, well
pocket clears the tyre's inner face, steering wheel clears the windscreen, and 64 inward rays
hitting 0 faces that point away.

## Revision pass, 2026-08-07d — nose rounding, mirror pods (budget → 2000)

- **The nose was two stations**, 2.440 → 2.300, so the corner between the flat front face and the
  fender was a single hard crease and the whole front read as a slab. Three stations now curve the
  plan view: the cap is narrower (0.788) and the body swells back to full width faster than a
  straight taper, which is what puts a radius on the corner.
- **Bumper, rub strip and valance are one wrapping loft** across X, front face receding
  quadratically towards each end. That curve is the strongest single cue that the front of a car is
  round. They must share one `yf(x)` — as separate boxes the valance poked out through the bumper at
  the corners, which looked worse than the slab did. Lamps and hood trim became wedges (`hexa`, same
  tri cost as a box) so they follow the radius instead of standing square across it.
- **Mirror heads are 8-sided pods**, three rings tapering front and back, on a 6-sided stalk. A
  mirror is the one part small enough that its silhouette is all you get, so a box reads as exactly
  what it is. The reflective face is the pod's own rear cap.

### The normals check was passing a broken model

The wrapped bumper shipped **entirely inside-out** and the 64-ray check reported clean.

- `bmesh.ops.recalc_face_normals` orients per connected island using an outside-visibility
  heuristic, and gets an island wrong when it is partly **buried inside another** — which describes
  the bumper, whose back face sits behind the nose cap. Orienting the loft correctly at build time
  didn't help either: the recalc runs afterwards and undid it.
- Fixed with `_orient_islands()`, which runs *after* the recalc and flips any island whose **signed
  volume** is negative. That is origin-independent and unambiguous for a closed shell — so every
  island must now be closed, which is why the brake drum and the mirror stalk gained blind caps.
- `check_normals()` default raised 64 → 400. At 64 the inverted bumper scored 0 hits on one run and
  1 on the next: small parts need enough rays to be *struck*, or the check certifies a broken model.

## Revision pass, 2026-08-07e — front end matched to the reference (budget → 2500)

User critique of the previous front: too rectangular, several flat fascia members trying to act as
a bumper, coarse rectangular grille, oversized rectangular lamps, and no bumper protrusion. Reworked
against the '93 Century wagon reference photo:

- **The bumper is a CHIN grown out of the body, not a primitive.** The first rework kept the bumper
  as its own loft — protruding, but with a flat vertical face, a horizontal top shelf and flat end
  caps, and the user called it correctly: "primitives glued on." Now the whole lower nose is one
  surface: the fascia plane leans *forward* as it descends to an apex at the rub strip (y 2.558
  centre), tucks back under into the valance, and its plan (the `CHIN` table in `build.py`) sweeps
  back around the corners until the ends die into the fenders as narrow near-flush end caps. The
  apex still leads the lamp/grille plane by 30–65 mm at every x where lamps exist. Overall length
  5.01 → 5.09 m, accepted — the chin is the feature.
- **Two black bumper guards**, ±0.29, spanning the bump and topping out over the strip. Each stands
  proud of the *local* curved apex (`chin_at(x)`); a first pass at 0.360–0.658 read as brush-guard
  posts.
- **Framed horizontal-slat grille** ('80 Century reference, second user pass): full chrome frame
  (rails + vertical end members) with three wide horizontal bars over a dark recess, all layers
  sharing a 28 mm bottom-to-top rake via `raked()`. Replaced a 5-bar vertical waterfall (itself a
  replacement for 3 fat bars) — the long horizontals run the same way as the car's own creases,
  which suits the low-poly look. Same tri cost: 5 slabs either way.
- **Mirror heads are rounded rectangles** (same pass): still an 8-point section, laid out as a
  chamfered rect (124 × 86 mm) instead of a circle — the circular pod read as a knob.
- **Slim lamps** (~96 mm lens, was 146) plus a **corner signal** whose front face angles back twice
  as hard as the main lens. It cannot physically wrap the corner — the nose cap is ~0.79 half-wide
  at lamp height, so anything swept behind y 2.440 inboard of that is buried in the body (the first
  attempt vanished entirely). The angle change carries the read.
- Fascia overhang guard filter moved z 0.62 → 0.67 (bumper shelf and guard tops are legitimately
  proud); still asserts ≤0.745 for the lamp/grille stack (now 0.738 at the corner-signal edge).

## Scope changes from the original ticket

- **Hood closed, not open, and not a separate posable part.** The user's first brief asked for an
  open hood as a separate primitive, then reversed it: the jack / missing wheel / spare carries the
  breakdown read on its own, and a separate hood object is a posing rig this asset does not need.
- **The body does NOT tilt on the jack.** Rotating it about the contact diagonal (the only correct
  axis when one corner lifts) sinks the front-left wheel 0.10 m below y=0, and a static prop has no
  suspension to absorb it. The empty arch, the bare drum and the jack under the rocker carry the
  read without the tilt. `REAR_WHEEL_OFF = False` in `build.py` restores the fourth wheel.

## Acceptance

- [x] `assets/models/broken-car.glb` exists, export-clean under `ASSETS.md` settings — GLB, no Draco,
      no KTX2, **0 images, 0 textures, no glTF extensions**, 97 KB.
- [x] Sources committed: `assets/models/src/broken-car.blend` + `broken-car.py`.
- [x] Tri count within budget (2086 / 2500); material names stable and distinctive.
- [x] Forward −Z and base-seated origin, both asserted numerically rather than eyeballed.
- [x] No inverted windings — 64 inward rays, 64 hits, 0 facing away (`check_normals()` in `build.py`).
- [x] The broken-down state reads at a glance **from the right-hand side**. See the open item below.
- [ ] Loads and places in-world through the FEAT-59 model import service. **Still blocked** — same
      state `trailer-home-a` (ASSET-21) shipped in; the file is correct, nothing loads it yet.

## Open item — the story is one-sided

The missing wheel, drum, jack, spare and tyre iron are all on the **right (+X)** flank. Approached
from the left the car reads as merely parked, which is the failure mode the original ticket called
out. This was not resolved because the fix is a placement decision, not a modelling one:

- If FEAT-46 can orient a POI so its right flank faces the road, nothing needs to change.
- If it cannot, move `SPARE_AT` / `IRON_AT` (both single tuples at the top of `build.py`) out past
  the nose or tail so they clear the body silhouette from either side.

Flagged for whoever wires FEAT-59/FEAT-46 placement. Cheap either way.

## Notes

- Own work → no `CREDITS.md` entry needed.
- **Static prop, not a vehicle** — same caveat as ASSET-09. Do not route it through
  `src/vehicle-model.js`. That loader strips child nodes much smaller than the body to make room for
  the procedural wheels; here the wheels are baked into `BrokenCar` deliberately, and one is
  deliberately absent, so the strip heuristic would do the wrong thing.
- `BrokenCarGlass` is a separate object so the renderer can control its draw order independently of
  the opaque body. Three.js draws transparent meshes after opaque ones with depth-write off — worth
  a look when FEAT-59 first renders this against foliage.
- **Ships as scenery with no interaction.** A stranded-motorist mission, a tow job, or a parts-
  scavenging hook are all gameplay tickets citing this asset; `.planning/story-mode/DESIGN.md`
  governs whether any of them exist. This ticket does not assume one does.
- Pairs with ASSET-20 (hitchhiker) — a hitchhiker within sight of a dead car is a whole short story
  and costs nothing extra.
- Distinct from FEAT-36's dynamic props: this is immovable set dressing, not a rock that tumbles.
