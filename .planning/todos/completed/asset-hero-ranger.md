---
id: ASSET-34
type: asset
status: done
severity: major
opened: 2026-08-25
updated: 2026-08-25
closed: 2026-08-25
relates: ASSET-18, ASSET-09, FEAT-49, FEAT-33
---

# ASSET-34: Hero vehicle — 2002 Ford Ranger (replaces `hilux.glb`)

**Hero model** — a fifth role, and the only one of it. This is the player's truck: it is on screen
every frame of every session, from three exterior chase cameras AND from inside the cab. Every
budget rule that is normally set by "how often does it repeat" is set here by "the player looks at
it for twenty hours".

Replaces the third-party `hilux.glb` (Toyota Hilux 97, CC-BY) that has stood in since the project
started. The game has always *been* a Ranger — `data/ranger.js`, `data/vehicles.js` and the project
name all say so — and the stand-in was the last thing contradicting it.

## Reference

`references/98 ranger reference/` — 22 photos pulled from the Bring a Trailer listing for a 2001
Ranger XLT regular cab (bringatrailer.com/listing/2001-ford-ranger-23), 2026-08-25. Same
generation as the 2002 the physics is modelled on. Covers: front 3/4, both profiles, dead-on
front, dead-on rear, rear 3/4, open bed from the tailgate, front-end detail, and a passenger-side
interior shot with the whole dash, console and both seats in frame.

## Request

Regular cab, styleside bed, **tailgate closed, bed open** (no cover, no cap). Red is the
reference car's colour but the paint material is recolourable, so it ships in the project's own
hue.

Three departures from `hilux.glb`, all owner-specified 2026-08-25:

1. **An open truck bed.** Not a filled slab — a real tub with ribbed floor, inner walls, wheel-house
   bulges and a tailgate. Cargo (ASSET-27..30) and the dragged-log main mission both need somewhere
   to sit, and the bed is the reason a pickup is the vehicle.
2. **Clear glass.** Alpha-blended windscreen, backlight and door glass.
3. **A simple modelled interior.** Not decoration — **the cockpit camera's reason to exist.** Dash,
   binnacle, centre stack, console, two seats, door cards, floor and a steering wheel.

## Acceptance

- [x] `assets/models/ranger.glb`, `src/ranger.blend`, `src/ranger.py` per ASSETS.md
- [x] `VEHICLE_MODELS.ranger` entry; `DEFAULT_VEHICLE_MODEL` points at it
- [x] Forward −Z, tyre-contact plane at model z = 0, wheels NOT modelled (procedural wheels own them)
- [x] Steering wheel is its own named node with its origin on the column axis, so FEAT-49-adjacent
      work can drive it later without re-exporting
- [x] Interior reads as occupied through the glass from the cockpit camera AND from outside
- [x] Materials named per the loader API: paint, tail lamp, reverse lens
- [x] Evaluated tri count reported per object

## Budget

| | |
|---|---|
| Tris | **4000** hard (hilux 1908, broken-car 2416 — this one is seen from inside) |
| Textures | **0** |
| Materials | ≤ 12, each justified |
| Real size | 4.61 L × 1.66 W × 1.60 H m, wheelbase 2.85, axles at car-local z −1.2825 / +1.5675 |

Length/wheelbase come from `data/ranger.js`, not from the real truck: the physics preset is a
regular cab with ~0.11 m shaved off each overhang, and the arches must land on the procedural
wheels, so the *model* yields to the preset.

## Rulings needed / taken

**Fresh ART-STYLE ruling, 2026-08-25 (owner).** Rule 7 (no transparency) and the "no interiors"
anti-pattern are both overridden for this file, on the same grounds as `broken-car.glb` and
`winnebago.glb` and one new one: an interior the player sits in is not decoration. Recorded in
ART-STYLE.md as the **hero-vehicle** exception. It does not extend to props or to the next vehicle.

## Not in scope

Wheels/tyres (procedural, `src/vehicle-model.js`), animating the wheel or the needles, damage
variants, a bed cover, 4WD ride height.


---

## Resolution — 2026-08-25

**Shipped.** `assets/models/ranger.glb` (117 kB) + `src/ranger.blend` + `src/ranger.py`.
`DEFAULT_VEHICLE_MODEL` now points at it; `hilux` stays in the registry as the second entry.

| | Ranger | budget |
|---|---|---|
| Body | 2300 tris | |
| Glass (6 panes) | 12 tris | |
| SteeringWheel | 128 tris | |
| **Total** | **2440** | 4000 |
| Materials | 9 | ≤12 |
| Images | **0** | 0 |
| Size | 4.610 × 1.904 (mirror to mirror) × 1.820 (incl. antenna) m | 4.61 L |

Audit clean: 0 overlapping coplanar face pairs, 600/600 inward rays hitting outward faces, nothing
below the ground plane, nothing past either bumper, arches on the physics axles, well pocket clearing
the tyre, steering wheel 0.497 m behind the windscreen, seat backs 0.175 m above the beltline.
The 8 non-manifold / 16 border edges are expected and explained in `audit()`: the firewall is an
interior partition welded into the skin, and the nose opening is a real hole.

### What the build taught (all of it is written into `ranger.py`, not just here)

- **Proportion came from measurement, not from taste.** The first pass guessed a 0.175 m hood fall
  from cowl to nose and the truck instantly read as a car; the real fall is 0.076. The longitudinal
  tiling is now the published regular-cab dimensions with *only* the overhangs scaled to fit the
  4.61 m preset — the cab and bed keep their real lengths.
- **A loft's end cap is a solid polygon**, so the grille and lamps built behind the nose were buried
  inside the sheet metal and invisible from every angle. A `frame()` helper (ring-to-ring loft in one
  plane) gives a panel with a hole.
- **Winding has to be a number.** All six glass panes exported inverted and no screenshot showed it;
  the ray test caught 83/600 bad hits. `pane()` now picks the winding from an outward direction.
- **The z-fight test has to test overlap, not proximity.** A first cut flagged 74 pairs, every one a
  butted seam. Vertex-sharing skip + a 2-D SAT overlap test left 7 real ones, all fixed.
- **The loader plants the model assuming the suspension is fully extended.** At rest it sags ~0.10 m,
  so the truck floated with daylight under it. `shiftDown` is now derived from the sag, not eyeballed.

### Two things this ticket added to the project, not just to the model

- **`ownWheels: false`** (`src/vehicle-model.js`, `data/vehicle-models.js`). The strip heuristic hides
  root children much smaller than the body; it cannot see a model that simply *has no wheels*, so it
  has to be declared. Documented in ASSETS.md.
- **The hero-vehicle ART-STYLE exception** (clear glass + a real interior), recorded in ART-STYLE.md
  as the third and last sanctioned override.

### Verified in the running game

Loaded at :8000, chase + freecam orbit: procedural wheels appear and sit centred in the arches,
ride height correct, runtime recolour drives `RangerPaint` (spawned blue), tail lamps and the third
brake light read, the bed and its floor ribs read, and the interior is visible through the glass.

### Left open deliberately

- **A cockpit camera does not exist yet** — `src/camera.js` has chase / hood / freecam, and the hood
  cam sits *outside* the cab at body-space (0, 0.75, −1.0). The interior is now there to justify one;
  filed as FEAT-75 because camera feel is the owner's call, not the model's.
- The reference board lives at `references/98 ranger reference/` and is **untracked**. Other assets
  keep theirs at `assets/models/src/ref-<name>/`. 10 MB of BaT photos is the owner's call to commit.

---

## Rework — 2026-08-25 (owner review pass)

Owner review of the shipped model gave seven items. All seven done; **2910 tris / 4000**, audit
still clean (0 overlapping coplanar pairs, 600/600 rays correct, all seven invariants green).

| Note | What changed |
|---|---|
| "the cab is a little too small, especially too short" | Cab 1.100 → **1.214 m**, taken out of the hood (which was 1.508). Beltline dropped 1.200 → 1.180 for more glass; roof is pinned at bodyHeight so glass is the only lever. Roof length 0.606 → 0.663 |
| "the A pillar line where the window glass meets the pillar should be much straighter and less wavy" | **Structural fix, not a nudge.** `pillar_frame()` derives the pillar prism, the windscreen's outboard edge and the door glass's front edge from ONE line each. They were three independent hand-typed lines a few mm out of parallel |
| "options for a smooth continuous blended shape" | Costed four (see below); took **selective chamfer + domed rim**, +470 tris. Subdivision was 4× and banned by ART-STYLE; chamfering every corner was +806 tris spent mostly on flanks the same review wanted *merged* |
| "rearview mirrors… early 2000s soft lobby shape" | Octagonal-lozenge head swept as three rings on a triangular **sail mount**, rooted on the door skin at 1.146 — the first placement had it above the beltline, i.e. floating in the glass |
| "front and rear fascia and bumpers are too flat… ends on a flat wall" | Nose: two-ring **domed rim** + **barrel-curved face** (`face_y()`), with grille bars, lamp lenses and valance all swept along that same curve. Both bumpers rebuilt with a **seven-point round section** (rolled top, convex face, tuck under) standing proud. Headlamps are six-point curved lofts, not boxes |
| "seats could use a little more rounding" | Cushion and back are chamfered eight-point lofts (vertical slices for the cushion, horizontal for the back), not hexa boxes |
| "wasting triangles on perfectly flat faces" | `simplify_stations()` — a Douglas-Peucker pass on the station list, run on the RINGS so the arches keep every sample. Reclaimed 160 tris with zero visual change; the cab went 5 stations → 3 |

### The options, costed (this is the answer to "what are our options")

| | Tris | Verdict |
|---|---|---|
| **A** chamfer every section corner | 896 → 1702 | Rejected: +806, most of it on the door and bedside flanks the same review wanted merged |
| **B** chamfer only nose/tail/fender-crown corners | 896 → 1209 | **Taken** |
| **C** domed rim rings at both ends | +128 | **Taken** — the single highest-value change in the model |
| **D** Catmull-Clark subdiv, 1 level | ×4 | Rejected: 3584 tris for the body alone, and ART-STYLE bans subdivision outright |

B+C is the affordable path *and* the targeted one. Recorded in ART-STYLE.md as a narrowing of the
"beveling every edge" anti-pattern: rounding is spent only where the eye lands.

### Still open (owner's call, explicitly deferred by them)

Ring-direction merging. `simplify_stations()` merges along the length; the *section* still carries
points that are collinear at every station on the crisp panels. Worth maybe 80–150 tris and it is
fiddly, because ring topology has to stay constant across stations for the loft to work.

---

## Second rework — 2026-08-26 (hood slope + rear depth)

Two notes: *"the hood should slope off a lot more towards the nose"* and *"focus on the rear end
especially how the bumper sticks out — the back is just far too planar. use the references."*
**2936 tris / 4000**, audit clean.

### The measurement mistake that caused both

The first pass guessed a 0.175 m hood fall and the truck read as a car. I "corrected" it to 0.048
off **IMG_0879** — and that number was wrong, because 0879 is shot from higher and closer and
foreshortens the nose. The result read squared off, exactly as the owner said.

**IMG_0873 is the one near-orthographic side shot in the set**, and it proves itself: its scale
comes out at **287.5 px/m from the roof height (1.60 m) and 287.5 px/m from the wheelbase
(2.835 m), independently**. Two agreeing scales is what makes it safe to read absolute heights off
a photograph. The rule now written into the generator: *pick the reference photo by whether its
scale checks agree with each other, not by which one a feature is easiest to find in.*

Re-measured off 0873, everything below is now a read value rather than a guess:

| | Was | Measured |
|---|---|---|
| Hood fall, cowl → nose | 0.048 | **0.198** (1.130 → 0.932) |
| Rear bumper protrusion | 0.033 | **0.111** |
| Rear bumper band | 0.430–0.612 | **0.383–0.539** |
| Headlamp / grille band | 0.772–1.006 | **0.713–0.870** |
| Front bumper band | 0.492–0.648 | **0.494–0.619** |
| Bed rail | 1.110 | **1.141** |
| Overhangs (front / rear) | 0.755 / 1.005 | **0.676 / 1.084** |

### The rear

The bumper was the whole problem: at 33 mm of protrusion it was a stripe on a wall. At the measured
**111 mm** it becomes the thing that gives the tail depth, and the 150 mm dark slot it opens up
under the tailgate (bumper top 0.539, tailgate bottom 0.690) is most of what stops the back reading
planar. Section went from seven points to nine — rolled top, convex face, tuck under, deep return.
The bed also gets a **rear rim ring** (`tail_rim_ring()`), the tail's version of the nose treatment,
so the bedsides turn into the tail instead of being cut off square by it.

`shiftRear` moved 0.2675 → **0.3465** with the new overhangs; `data/vehicle-models.js` updated to
match, and the in-game check confirms the wheels are still centred in the arches.

### Two z-fights the audit caught that no screenshot would have

- The grille bars overlapped each other: the opening got 77 mm shorter when the front end was
  re-measured, and 18 mm half-height bars on a 31 mm pitch collide. Half-height is now derived from
  the pitch (`min(0.018, pitch * 0.38)`) so it cannot happen again on a re-tune.
- The painted tailgate landed exactly on the plane the new bed rim ring had just moved the dark rear
  cap onto. Pushed 3 mm proud.

---

## Front-end revert + nose radius — 2026-08-26

Owner: *"revert the front end changes. rear is fine. for the front: the hood is quite flat near the
windshield and rounds off heavily near the end"*, with a close-up crop of the reference nose.
**3016 tris / 4000**, audit clean.

**The previous pass had the total fall right and the DISTRIBUTION wrong.** 0.198 m spread evenly
along 1.3 m of hood is a wedge; a real hood is a **plateau with a nose radius**. The crop makes it
unmistakable — the surface is dead flat from the windscreen forward and then turns hard over the
headlamps.

- Front-end bands reverted (lamp/grille 0.713–0.870 → **0.772–0.990**, front bumper → 0.492–0.648,
  valance → 0.285). Rear untouched: `Z_RBUMP`, `Y_TAILGATE`, the nine-point step bumper, the tail
  rim ring and the 111 mm protrusion all stand.
- `CLIP_ST` is now **flat**: 1.172 at the cowl to 1.160 at the last station. All the fall lives in
  the rim.
- `NOSE_RIM` went from two rings to **four**, spanning 0.136 m and dropping the hood line 0.126 m,
  with **top and bottom driven independently** — a symmetric squeeze lifts the valance line as much
  as it drops the hood, which pinches the whole face. Each point's z is remapped between the
  section's own bottom and top, so the flank's character line stays continuous where the rim starts.

### Three bugs the change surfaced, all caught numerically

1. **The rim was carrying the wheel arch forward into the nose.** The rim is generated by shrinking
   `CLIP_ST[0]`'s section; with that station inside the arch span, the arch cut-out propagated to the
   face and opened a notch. `CLIP_ST[0]` is now pinned to `AX_F + ARCH_R` exactly, and that is a
   build invariant.
2. **The nose frame was still indexing `NOSE_RIM[1]`** — correct when the rim had two rings, the
   second of four afterwards. Non-manifold count jumped 8 → 20 and gave it away.
3. **One inverted triangle where `arch_z()`'s clamp releases.** Between the tangent (clamped flat to
   the rocker) and the first cosine sample 30° round, the flank bottom jumps 0.18 m in 63 mm, and
   the quad spanning that is twisted enough that its triangulation produced a backward-facing tri.
   `arch_samples()` now also samples exactly where the clamp lets go — which removes the jump rather
   than hiding it, and smooths both arch ends as a side effect.

Also tightened `check_normals()`: a face lying within ~3° of edge-on to a ray is a **grazing hit**,
not evidence of inversion. Verified at 2400 rays that the three it was reporting were the flat
bottoms of the rear corner panel, the licence plate and a mud flap, all correctly wound.

---

## Hood/nose seam — 2026-08-26

Owner: *"fix the seam between the front and the hood"*, with a screenshot showing a dark crack across
the hood where the nose rim starts.

**It was a fold, not a shading artifact.** `NOSE_RIM`'s first number was an ABSOLUTE setback from the
face (`dy`), and `face_y()` is a barrel curve — at the flank the face sits 34 mm further back than on
the centreline. A `dy` that clears the last full station at x = 0 lands *behind* it at x = 0.83.
Measured: **ten of the first ring's twelve points were behind the station they were supposed to
lead**, so the loft folded over itself and the fold read as a crack.

Fixed structurally rather than by tuning: the first number is now a **fraction of the span from the
last full station to the face, evaluated at each point's own x**. No value in (0, 1] can fold,
whatever the crown does. New invariant asserts every rim ring leads the one behind it at every point
(tightest gap now +0.0247 m).

Second bug the same screenshot exposed: `frame()` picked its winding from one sample quad and applied
it to the whole annulus. Fine for a flat frame; the nose frame rides the barrel curve, so one band
of it faced backwards. It now orients **per face** — cheap, and neighbouring quads cannot disagree
because `facing` is shared.

**Residual, stated rather than hidden:** at 8000 rays (13× the audit's density) one hit still lands
on the buried underside of a bumper tread pad at a 0.14 dot — an interior face of a decorative inset,
reachable only at a grazing angle. The audit at its own 600-ray setting is clean. Not chased.

---

## Nose blend, second pass — 2026-08-27

Owner: *"split the difference and pull the hood slope off back a little. increase the radius on the
vertical edges of the front end blend you just improved."* **3064 tris / 4000**, audit clean.

**The schedule is now generated, not typed.** `NOSE_RIM` was four hand-picked 4-tuples that only
approximated a corner. One quarter-turn now drives all four numbers: the ring advances as
`sin θ` and the tuck, drop and rise all ease in as `1 − cos θ`. That makes the blend a real
quarter-**ellipse** — tangent to the flat hood and to the straight flank where it starts,
perpendicular where it meets the face. Three knobs replace twelve numbers:

| | |
|---|---|
| `NOSE_RIM_N = 5` | ring count — on a corner, this is what buys smoothness (was 4) |
| `NOSE_TUCK = 0.105` | plan-view corner: the face is this fraction narrower than the flank. **This is the "radius on the vertical edges"** (was 0.070 effective) |
| `NOSE_DROP = 0.076` | hood-line fall across the rim (was 0.126) |
| `NOSE_RISE = 0.026` | valance-line tuck — deliberately a third of the drop, because a symmetric squeeze pinches the face |

**Split the difference:** total hood fall is unchanged at ~0.14 m, but it is now *shared* instead of
living entirely in the rim — dead flat from the cowl to y 1.05, then 0.064 m of gentle descent in
the sheet metal to the last station, then 0.076 m in the rim. The previous version put all of it in
the last 0.14 m, which is what made the transition read as abrupt.

---

## The nose rebuilt as a BULLET — 2026-08-27

Owner: *"the front end of the vehicle you modeled is fundamentally much flatter than the front end
of an early 2000s Ranger… redevelop the front end generation code to account for the bullet shaped
nose. it's ok to drop the work done on the hood swoop. front fenders will also need to tie into this
change."* **3128 tris / 4000**, audit clean.

**The critique was structural, not a tuning miss.** `face_y()` took only `x`. So no matter how many
rim rings or how big the corner radius, the face was a **vertical plane bowed 34 mm in plan** with
rounded edges stuck on it. What makes this nose read is that it projects along *two* axes at once,
and one of them was simply not in the model.

`nose_y(x, z)` replaces it. Three things, all read off the reference:

| | Was | Now |
|---|---|---|
| **Plan prow** — centreline leading the corners | 0.030 m | **0.096 m** |
| **Elevation lean** — apex at the LAMP BAND, hood edge and valance falling back from it | **absent** | 0.045 m up / 0.075 m down |
| Flank relief — fraction of the lean surviving at the fender | n/a | 0.40 |

The centreline section is now an actual bullet: 1.875 at the hood edge → **1.920 at the apex** →
1.845 at the rocker. Before, every one of those was 1.895.

**Flank relief is load-bearing, not a nicety.** The lean is a centreline feature; left at full
strength out at the fender it drags the flank's lower points behind the last full station and folds
the loft. `NOSE_FLANK_LEAN` scales it out with `px²`, and the fold invariant confirms it (tightest
gap +0.0045 m — thin, and the number to watch if the prow ever gets deeper).

**Everything on the nose rides the same surface.** `_sweep()` now evaluates `nose_y(x, z)` at each
profile point's own `z`, so a headlamp sweeps back at its top and bottom exactly as the sheet metal
around it does. The grille backing had to stop being a `box()` for the same reason: on a bullet a
flat slab at fixed `y` is *behind* the face at the centre and *ahead* of it at the corners, and it
punched through both fenders as dark notches. The bumper's plan wrap is now derived from the prow
rather than hand-typed, and the valance was narrowed to 0.748 because the prow plus tuck pulls the
face in to about that — at 0.800 it stood proud of the metal it is supposed to sit under.

**Fenders tie in** as asked: the crown is carried past the axle (stations at 1.450 and 1.620) and
tucks over the last 0.30 m to hand off to the prow. Left prismatic to the arch tangent, the bullet
would have looked grafted onto a slab.

The hood swoop was dropped per the ruling — the plateau is flat and `NOSE_DROP` fell to 0.070,
since the bullet's own lean now supplies the fall the swoop was faking.
