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
