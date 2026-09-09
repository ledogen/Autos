"""
ASSET-34 — 2002 Ford Ranger, the HERO vehicle.  Parametric generator.

Built for: Blender 5.x  |  Target: assets/models/ranger.glb
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md
Reference: references/98 ranger reference/ — 22 photos from the BaT listing for a
2001 XLT regular cab (bringatrailer.com/listing/2001-ford-ranger-23), 2026-08-25.

BUILD REPORT — filled in by build(); see the printout.

WHAT MAKES THIS ONE DIFFERENT.  Every other model in this project is scenery: seen
for a few seconds, from outside, through fog.  This one is on screen every frame
of every session and the player sits INSIDE it.  So the usual "silhouette only"
calculus is only half the job — the cockpit camera reads the dash at 0.5 m.

DESIGN RULINGS (2026-08-25, owner):
  - Regular cab, styleside bed, TAILGATE CLOSED, BED OPEN.  No cover, no cap.
  - Windows are CLEAR alpha-blended glass.
  - A simple modelled interior, because the cockpit camera needs a reason to exist.
  - The steering wheel is its own node with its origin on the column axis, so it
    can be animated later without a re-export.
  These override ART-STYLE rule 7 and the "no interiors" anti-pattern, as a fresh
  HERO-VEHICLE exception (recorded in ART-STYLE.md).  Not a precedent for props.

THE MODEL YIELDS TO THE PHYSICS PRESET, not to the real truck.  data/ranger.js says
wheelbase 2.85 and bodyLength 4.61 — a real regular-cab Ranger is 2.835 / 4.81, so
the preset is the real truck with ~0.11 m shaved off each overhang.  The procedural
wheels are placed from the preset, so the ARCHES must land on the preset's axles or
the tyres sit in the wrong holes.  Overhangs were scaled to suit; nothing else moved.

NO WHEELS ARE MODELLED.  src/vehicle-model.js owns them (they spin, steer and show
suspension travel).  Its strip heuristic hides root children "much smaller than the
body", which cannot see a model that simply has none — hence VEHICLE_MODELS.ranger
carries `ownWheels: false`.  The corollary: anything small that must SURVIVE (the
steering wheel, the glass) has to be a CHILD of the body object, never a root sibling.

AXIS TRAP.  The glTF exporter's "+Y up" maps blender (x,y,z) -> gltf (x, z, -y).
So blender +Y becomes gltf -Z.  ASSETS.md wants the nose on -Z, therefore
*** the nose is modelled at +Y in Blender. ***
Left-hand drive follows: left = up x forward = Z x Y = -X, so the driver sits at -X.

PLACEMENT MATHS (why AX_F/AX_R are not symmetric).  The loader centres the model's
BOUNDING BOX on the CG, and the physics puts the axles at car-local z = -(L*wR) and
+(L*wF) — i.e. the CG sits 0.1425 m FORWARD of the wheelbase midpoint at 55/45.
So the axles land at blender y = +1.2825 (front) and -1.5675 (rear), and build()
prints the exact shiftRear/shiftDown that undo the loader's re-centring.  Copy those
two numbers into data/vehicle-models.js; do not eyeball them.

STYLE TRAPS this file exists to not re-learn:
  - baseColorFactor is LINEAR and renders ~1.5x lighter than the tuple reads.
  - Everything is flat-shaded on purpose.  No bevels, no smoothing, no subdivision.
  - Detail is geometry: the bed-floor ribs, the grille bars and the seat pleats are
    all folds, and flat shading turns each one into a free light/dark band.
"""

import bpy
import bmesh
import math

# ---------------------------------------------------------------------------
# PARAMETERS — everything tunable lives here.
# ---------------------------------------------------------------------------

NAME = "ranger"
TRI_BUDGET = 4000
OUT_GLB = "/Users/ledogen/CodeShit/CarGame/assets/models/ranger.glb"
OUT_BLEND = "/Users/ledogen/CodeShit/CarGame/assets/models/src/ranger.blend"

# --- Hard numbers from data/ranger.js.  Do not drift from these. ---
WHEELBASE = 2.85
BODY_LEN = 4.705
WEIGHT_F, WEIGHT_R = 0.55, 0.45
MASS = 1360.0                    # kg, data/ranger.js
K_SUSP = 33000.0                 # N/m per corner, front and rear are the same there
CG_HEIGHT = 0.55                 # m — where the loader thinks the ground is
# STATIC SAG — the number that decides whether the truck floats.  src/vehicle-model.js
# plants the model's bounding-box MINIMUM at car-local y = -cgHeight, i.e. it assumes
# the CG sits exactly cgHeight above the road.  That is only true with the suspension
# fully extended.  At rest each corner compresses (m_corner * g / k), so the CG really
# rides that much higher and a model planted at -cgHeight hovers by the same amount.
# Measured in-game before this was worked out: the body floated ~0.09 m and you could
# see daylight under it.  shiftDown below carries the correction.
SAG_F = (MASS * WEIGHT_F / 2) * 9.81 / K_SUSP      # 0.111 m
SAG_R = (MASS * WEIGHT_R / 2) * 9.81 / K_SUSP      # 0.091 m
SAG = (SAG_F + SAG_R) * 0.5                        # 0.101 m
AX_F = WHEELBASE * WEIGHT_R      # +1.2825  front axle, blender y
AX_R = -WHEELBASE * WEIGHT_F     # -1.5675  rear axle
FRONT_OH, REAR_OH = 0.771, 1.084  # see the tiling note below
Y_NOSE = AX_F + FRONT_OH         # +1.9585  extreme front (bumper face)
Y_TAIL = AX_R - REAR_OH          # -2.6515  extreme rear (bumper face)

# THE LONGITUDINAL TILING.  4.665 = 0.064 front bumper + 1.366 hood + 1.214 cab
# + 0.080 cab/bed gap + 1.831 bed + 0.111 rear bumper.  The cab and bed keep their
# real lengths, because shrinking those is what a viewer actually notices.
#
# THE FRONT OVERHANG IS REAL AGAIN (owner, 2026-09-06: "the ranger from the reference
# photos has a nose and front bumper that sticks out well past its front tires.  ours
# ends pretty much right in front").  Both overhangs used to be scaled by 1.76/1.903
# to make the total fit the preset's old bodyLength of 4.61; the front is now back at
# its measured 0.731, and BODY_LEN went with it rather than the other way round.
# Measured off IMG_0873: the reference nose clears the front tyre by 0.370 m and the
# ARCH by 0.290; at 0.676 of overhang ours cleared them by 0.308 and 0.206.
#
# THE REAR IS STILL SHORT — 1.084 against a measured 1.172 — and it is NOT an overhang
# problem, which is why it was left alone.  The bed is already at its real 1.8305 (a
# 6 ft box), so moving the tailgate the 88 mm further back that the reference wants
# either stretches the bed or drives its front through the 80 mm cab/bed gap.  The
# only places that 88 mm can come from are the cab, that gap, or the hood — i.e. a
# re-tile of the middle of the truck, not a change to the ends.  Do not "fix" it by
# deepening the step bumper: its 111 mm of protrusion is measured and load-bearing.
#
# ANYTHING THAT MOVES WITH Y_NOSE.  Y_FACE_C is the sheet metal's own apex and has to
# travel with the bumper face or the chrome blade floats — the blade is pinned to
# Y_NOSE at the centreline (BUMP_PIN), so the 38 mm between them is the standoff, not
# a coincidence.  The nose rim then deepens on its own: it spans CLIP_ST[0] (pinned to
# the arch tangent) to nose_y(), so the extra length lands in the bullet where it
# belongs and every fitting that rides nose_y() — grille, lamps, valance — follows.
#
# HOW THE HEIGHTS AND OVERHANGS WERE GOT.  Off IMG_0873, the one near-ORTHOGRAPHIC
# side shot in the reference set: its scale comes out at 287.5 px/m from the roof
# height (1.60 m) AND at 287.5 px/m from the wheelbase (2.835 m), independently.
# Two agreeing scales is what makes it safe to read absolute heights off a photo.
#
# THE HOOD-SLOPE TRAP, hit twice.  The first pass guessed a 0.175 m fall from cowl
# to nose and the truck read as a car.  The correction over-shot to 0.048 — measured
# off IMG_0879, which is shot from higher and closer and foreshortens the nose — and
# the truck then read SQUARED OFF (owner, 2026-08-26: "the hood should slope off a
# lot more towards the nose").  On the orthographic shot the fall is 0.198 m: hood
# 1.130 at the cowl, 0.932 at the nose.  Pick the photo by whether its scale checks
# agree with each other, not by which one a feature is easiest to find in.

# --- Heights (z = 0 is the tyre contact plane) ---
Z_GROUND = 0.0
Z_UNDER = 0.415                  # underbody pan.  Owner, 2026-09-05: "i want it raised
                                 # /gone.  there's an ugly black box practically dragging
                                 # on the ground.  a flat pan is fine but should be roughly
                                 # in line with the bumpers."  At 0.285 the pan's SIDE WALL
                                 # (x = W_UNDER, running the whole length) showed as a black
                                 # bar 157 mm deep under the rocker from every side angle.
                                 # At 0.415 it is level with the rear bumper's underside
                                 # (0.416) and only 27 mm of it clears the rocker, so the
                                 # bar is gone without the pan having to be modelled at all.
                                 # HARD CEILING: Z_UNDER + UND_EDGE must stay under Z_ROCKER
                                 # (0.442) or the pan corner overtakes the flank bottom in
                                 # every section ring and the loft folds.
                                 # The truck's lowest point is NOT this — it is the mud
                                 # flaps at 0.108, so shiftDown is unaffected by moving it.
Z_ROCKER = 0.442                 # rocker step: flank bottom out of the arch zones
Z_HIP = 0.86                     # widest point of the flank
Z_BELT = 1.183                   # door beltline = base of the side glass.  Dropped 20 mm
                                 # from the first pass: with the roof pinned at bodyHeight the
                                 # only way to make the cab read bigger is more glass.
Z_ROOF = 1.600                   # roof deck (bodyHeight 1.60)
Z_ROOF_CROWN = 0.020             # centre of the roof sits this much proud of the rails
Z_RAIL = 1.141                   # bed rail top — reads BELOW the door belt, as on the ref
Z_BEDFLOOR = 0.700               # bed floor pan (rib crests sit RIB_H above)
Z_HEADLINER = 1.526              # underside of the roof slab

# --- Wheel arches.  Tyre is 0.736 dia x 0.25 wide on a 1.46 track. ---
R_TYRE = 0.368                   # data/ranger.js wheelRadius.  Named because three
                                 # things size themselves off it and it was a magic
                                 # number in a comment before.
SUSP_TRAVEL = 0.25               # data/ranger.js suspensionTravel{Front,Rear}
ARCH_R = 0.470                   # opening radius (R_TYRE + 0.10 clearance)
ARCH_Z = 0.390                   # arch circle centre height (below the axle: the
                                 # opening is a segment, not a full semicircle)
ARCH_SAMP = 7                    # y samples across each arch — the faceting is the look
TRACK_HALF = 0.73                # 1.46 / 2
TYRE_OUT = TRACK_HALF + 0.125    # 0.855 — outer face of the tyre

# --- Plan-view half widths ---
W_FLANK = 0.845                  # widest body point (fender blisters, bed sides)
W_BELT = 0.775                   # shoulder at the beltline
W_UNDER = 0.560                  # underbody pan AND wheel-well pocket inner wall.
                                 # Must clear the tyre's inner face at 0.605 or the
                                 # wheel cannot rise into the well and it is a dent.
W_BED_OUT = 0.822                # bed side at the RAIL — tucks in above the
                                 # fender blister, so the rail is a 12 cm cap
                                 # instead of the 16 cm slab the first pass gave
W_BED_IN = 0.700                 # bed inner wall
W_WHEELHOUSE = 0.545             # bed inner wall over the rear arch
Z_WHEELHOUSE = 0.935             # wheelhouse box top, 0.965 until 2026-09-07
WHEELHOUSE_HALF_L = 0.40         # ...and how far it runs each side of the axle.  This is
                                 # the dimension that makes it look big: it was
                                 # ARCH_R + 0.055, a 1.05 m box in a 1.83 m bed — 57% of
                                 # the floor's length, where the reference is nearer 43%.
                                 # Owner, 2026-09-07: "inner bed arches should be
                                 # smaller".  The other two barely move (see below), so
                                 # length is the only one with room in it.
# THE OTHER TWO DIMENSIONS ARE ALMOST FULLY CONSTRAINED, which is worth knowing before
# reaching for them:
#   - W_WHEELHOUSE must stay INBOARD OF THE PAN.  The bed floor runs from the centreline
#     out to it at Z_BEDFLOOR, and the underbody pan's side wall climbs at W_UNDER from
#     the pan up to the arch.  Push the wheelhouse past W_UNDER and those two segments
#     CROSS: the section self-intersects and lofts into a black wedge along the floor.
#     Tried at 0.585 on 2026-09-07 and that is exactly what it did.
#   - Z_WHEELHOUSE is the roof of the box the tyre travels inside, so it has to clear the
#     tyre at FULL BUMP, not at rest.  The rear sags SAG_R out of a SUSP_TRAVEL strut and
#     can still take up the remainder, putting the tyre's crown at 0.917.
assert W_WHEELHOUSE < W_UNDER, \
    "wheelhouse inner wall must stay inboard of the pan, or the section self-intersects"
assert Z_WHEELHOUSE >= ARCH_Z + R_TYRE + (SUSP_TRAVEL - SAG_R) + 0.010, \
    "wheelhouse roof must clear the tyre at full bump"
WH_EDGE = 0.030                  # chamfer on the wheelhouse's top inner corner (owner,
                                 # 2026-09-07).  It SWITCHES OFF with the wheelhouse
                                 # itself — see bed_ring(), where wh collapses to
                                 # W_BED_IN outside the arch zone and a chamfer left at
                                 # full size would push the point OUTBOARD of the tub's
                                 # own wall and fold the section.

# --- Cab / greenhouse (all y MEASURED, see above) ---
Y_COWL = 0.584                   # base of the windscreen.  The cab was 1.100 long and read
                                 # as too short (owner, 2026-08-25); it is now 1.214, taken
                                 # out of the hood, which was generously long at 1.508.
Y_CAB_REAR = -0.630              # cab rear panel
Y_HDR_F = 0.085                  # windscreen header
Y_HDR_R = -0.578                 # rear header
W_ROOF = 0.676                   # roof half width (tumblehome from W_BELT)
PILLAR_A = 0.038                 # A-pillar section (across the glass)
PILLAR_C = 0.072                 # C-pillar section

# --- Bed ---
Y_BED_F = -0.710                 # bed front wall (8 cm gap behind the cab)
Y_BED_R = -2.4405                # bed loft tail; the 30 mm tailgate slab takes the
                                 # outer face to -2.510, so the bed is 1.800 m —
                                 # a real 6-foot bed, un-scaled
N_RIBS = 8                       # bed-floor rib crests across the full width
RIB_H = 0.028

# --- Front clip ---
Z_LAMP0, Z_LAMP1 = 0.772, 0.990  # headlamp / grille opening.  Re-measured off the
                                 # DEAD-ON reference (547 px/m there): the first pass
                                 # took these off the profile shot and left a 28 cm
                                 # blank painted band between the grille and the
                                 # bumper, where the real truck has about 10 cm.
Z_BUMP0, Z_BUMP1 = 0.490, 0.697  # THE BUMPER IS THE WHOLE OF THE FRONT'S LOWER END since
                                 # the grey air dam was deleted (2026-09-06).  Z_BUMP1 is
                                 # its top edge AND the line clip_ring cuts the fender to;
                                 # Z_BUMP0 is its lower edge on the centreline, dropping a
                                 # further BUMP_FLARE at the tips.  Chrome blade.  Raised 74 mm on 2026-09-05 ("bumper
                                 # still a little too low to fit in the gap naturally left
                                 # for it"), then lowered 25 of those on 2026-09-06 ("move
                                 # the front bumper forward and down a bit").  THE TWO ARE
                                 # NOT IN CONFLICT: the first was about the blade hanging
                                 # below the front end with 124 mm of bare paint above it,
                                 # this one is about the reference showing more daylight
                                 # between the lamp and the chrome than 50 mm.
                                 # Z_LAMP0 - Z_BUMP1 IS that gap, now 75 mm — move either
                                 # one and the other has to follow.
                                 # MADE TALLER DOWNWARD ONLY on 2026-09-06 ("make the
                                 # front bumper taller overall"), 156 -> 207 mm.  The TOP
                                 # deliberately did not move: it is the lamp gap above,
                                 # which had just been opened to 75 mm, and growing the
                                 # blade upward would have closed it again.
BUMP_FLARE_X = 0.520             # where the bumper's lower edge starts sweeping down...
BUMP_FLARE = 0.035               # ...and how far it has dropped by the tips, so the ends
                                 # run into the wheel arch instead of stopping above it.
VAL_KNEE_X = 0.824               # CLIP_PLAN's first breakpoint — the fender's own
                                 # half-width at the arch tangent.  The fascia clamps
                                 # its plan here; see the note at vxs.

# --- Rear ---
Z_TAIL0, Z_TAIL1 = 0.680, 1.045  # tail lamp band.  0.722..0.998 until 2026-09-07
                                 # (owner: "taillights need to be bigger") — 365 mm now
                                 # against 276, which is 56% of the bedside's rear height
                                 # rather than 42%.  Bottom sits just above the step
                                 # bumper's top face, top ~100 mm under the rail, both
                                 # off the reference.
# THE BUMPER'S LOWER EDGE IS THE BEDSIDE'S LOWER EDGE.  Owner, 2026-09-05: "raise
# the rear bumper so its lower edge meets the lower edge of the bedside where it
# terminates".  The bedside's sill kicks up behind the rear arch (bed_bottom) and the
# rim's rise lifts it a little further, landing at 0.490 on the last section — so
# that is where the bumper's bottom goes, and the whole 156 mm section moves up with
# it rather than the bumper being stretched.  build_rear_end() asserts the match
# against the ring itself, because both ends of it are derived numbers.
Z_RBUMP0, Z_RBUMP1 = 0.490, 0.646
Y_TAILGATE = -2.5405             # outer face of the tailgate.  The step bumper stands
                                 # 0.111 m PROUD of this, back to Y_TAIL — measured, and
                                 # the single thing that stops the rear reading planar.

# --- Interior ---
Z_FLOOR = 0.520                  # cab floor pan.  Higher than this and the seated
                                 # driver has no head room: cushion 0.80, headliner
                                 # 1.522 leaves 0.72, which is already snug.
Z_TUNNEL = 0.700
W_TUNNEL = 0.195
SEAT_X = 0.355                   # seat centres; driver at -SEAT_X (LHD)
Z_CUSHION = 0.855
Z_SEATBACK = 1.375               # MUST clear Z_BELT or the cabin reads as empty
SW_AT = (-0.355, 0.186, 1.048)   # steering-wheel hub
SW_TILT = math.radians(66.0)     # Euler-X of the wheel node.  66 deg puts the
                                 # column axis 24 deg off horizontal, i.e. the wheel
                                 # 24 deg off vertical — matched to the ref interior.
SW_R = 0.183                     # rim centreline radius
SW_TUBE = 0.024
SW_SEG = 10

# ---------------------------------------------------------------------------
# MATERIALS — the name is the runtime API (ASSETS.md, substring match).
# LINEAR values.  metalness 0 everywhere; roughness carries the difference.
# ---------------------------------------------------------------------------
MATS = {
    #  name              base colour (linear)         rough  alpha
    "RangerPaint":    ((0.372, 0.045, 0.032, 1.0), 0.55, 1.0),  # RECOLOURABLE (ref red)
    "RangerTrim":     ((0.048, 0.048, 0.050, 1.0), 0.85, 1.0),  # bumpers, valance, mirrors, flaps
    "RangerChrome":   ((0.455, 0.455, 0.442, 1.0), 0.26, 1.0),  # bumper blade, grille bars
    "RangerLens":     ((0.700, 0.690, 0.640, 1.0), 0.22, 1.0),  # headlamps AND reverse — see spec
    "RangerAmber":    ((0.640, 0.215, 0.010, 1.0), 0.28, 1.0),  # corner turn signals
    "RangerTail":     ((0.480, 0.026, 0.020, 1.0), 0.32, 1.0),  # tail/brake lamps
    # Read through glass against a bright flank, only the VALUE gap survives — so the
    # cabin is far darker than a real grey interior.  Doubles as the wheel-well and
    # underbody colour: same role, a shadowed cavity, and it saves a draw call.
    "RangerInterior": ((0.030, 0.029, 0.028, 1.0), 0.95, 1.0),
    # 0.062, not the 0.088 the first pass used: seen through glass under a bright
    # sky the higher value went pale and the cabin read as full of white boxes.
    # It still clears the 0.030 tub by enough to separate.
    "RangerSeat":     ((0.062, 0.062, 0.066, 1.0), 0.95, 1.0),  # cloth, reads against the tub
    # ROUGHNESS TRAP (learned on broken-car): at 0.10 the panes mirror the sky and
    # blow out to near-white, which reads as painted panels.  0.20 keeps a sheen and
    # still lets the interior through.  Alpha 0.55: lighter than broken-car's filthy
    # 0.72 because this cabin is meant to be LOOKED INTO, from both sides.
    "RangerGlass":    ((0.055, 0.062, 0.068, 1.0), 0.22, 0.45),
}

RECOLOURABLE = ("RangerPaint",)


# ---------------------------------------------------------------------------
# Geometry accumulator + primitives  (house pattern, cf. broken-car.py)
# ---------------------------------------------------------------------------
class Part:
    def __init__(self, name):
        self.name = name
        self.v = []
        self.f = []
        self.m = []

    def add(self, verts, faces, mat):
        o = len(self.v)
        self.v.extend(verts)
        for fc in faces:
            self.f.append([i + o for i in fc])
            self.m.append(mat)


# THE BOTTOM LOOP IS WOUND BACKWARDS ON PURPOSE.  Traversed 0-1-2-3 the bottom face
# runs counter-clockwise seen from ABOVE, so its normal points UP — into the box —
# while every other face here points out.  orient_islands() cannot rescue that: it
# flips a whole shell or none of it, so a single odd face out survives whatever it
# decides.  Every box in the model carried an inverted underside because of this, and
# check_normals() only caught it when a ray happened to strike one steeply enough to
# clear its grazing filter, which is why the count moved with unrelated edits.
BOX_F = [[3, 2, 1, 0], [4, 5, 6, 7], [0, 1, 5, 4],
         [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]


def box(part, x0, x1, y0, y1, z0, z1, mat):
    part.add([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
              (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], BOX_F, mat)


def hexa(part, pts, mat):
    """Free-form box from 8 points: 0-3 bottom loop, 4-7 top loop (same order)."""
    part.add(pts, BOX_F, mat)


def quad(part, a, b, c, d, mat):
    part.add([a, b, c, d], [[0, 1, 2, 3]], mat)


def oriented_quad(part, a, b, c, d, mat, facing):
    """One quad, wound so its normal points along `facing`.

    For OPEN ribbons.  orient_islands() flips closed shells and deliberately leaves
    an open island as authored, so a ribbon's winding is the author's problem — same
    reason frame() orients per-face rather than trusting a normal recalc.
    """
    import mathutils
    va, vb, vc = (mathutils.Vector(v) for v in (a, b, c))
    cr = (vb - va).cross(vc - va)
    pts = [a, b, c, d]
    if cr.length > 1e-9 and cr.normalized().dot(mathutils.Vector(facing)) < 0:
        pts.reverse()
    part.add(pts, [[0, 1, 2, 3]], mat)


def frame(part, outer, inner, mat, facing=(0.0, 1.0, 0.0)):
    """Flat annulus between two same-plane rings: a panel WITH A HOLE IN IT.

    This exists because a loft's end cap is one solid polygon, so the grille and
    lamps built behind the nose cap were simply buried inside the sheet metal —
    invisible from every angle.  A real opening needs the cap to be a frame, and a
    ring-to-ring loft in one plane is the cheapest way to get one.
    `facing` is the outward direction the frame must point; the winding is chosen
    to match it rather than left to a normal recalc (the shell is open, so
    orient_islands deliberately will not touch it).
    """
    import mathutils
    n = len(outer)
    verts = list(outer) + list(inner)
    want = mathutils.Vector(facing)
    out = []
    for k in range(n):
        fc = [k, (k + 1) % n, n + (k + 1) % n, n + k]
        # PER-FACE, not once for the whole frame.  The nose frame is not planar — its
        # outer ring rides the barrel curve — so a single sample quad does not speak
        # for the rest, and one band of it came out facing backwards.  Each quad is
        # cheap to orient on its own and cannot disagree with its neighbours about
        # which way "out" is, because `facing` is the same for all of them.
        a, b, c = (mathutils.Vector(verts[i]) for i in fc[:3])
        cr = (b - a).cross(c - a)
        if cr.length <= 1e-9:                      # collapsed corner; keep as-is
            a, b, c = (mathutils.Vector(verts[i]) for i in (fc[0], fc[2], fc[3]))
            cr = (b - a).cross(c - a)
        if cr.length > 1e-9 and cr.normalized().dot(want) < 0:
            fc = list(reversed(fc))
        out.append(fc)
    part.add(verts, out, mat)


def pane(part, a, b, c, d, mat, facing):
    """A glass quad, wound so its FRONT face points `facing`.

    Double-sided is not a licence to ignore winding: Three.js still lights the
    front face, so a pane wound inward renders dark from the driver's seat and
    mirror-bright from outside.  All six panes came out inverted when this was a
    plain quad() call, and no screenshot showed it.
    """
    import mathutils
    va, vb, vc = (mathutils.Vector(v) for v in (a, b, c))
    n = (vb - va).cross(vc - va)
    if n.dot(mathutils.Vector(facing)) < 0:
        a, b, c, d = d, c, b, a
    part.add([a, b, c, d], [[0, 1, 2, 3]], mat)


def mirror_x(part, mat_filter=None):
    """Not used — every builder mirrors explicitly.  Kept out on purpose: a blanket
    mirror also duplicates the centreline faces and welds them into non-manifold."""
    raise NotImplementedError


def loft(part, rings, mat, cap_first=True, cap_last=True, band_mats=None, skip=None,
         cap_first_mat=None, cap_last_mat=None):
    """Closed-section tube between equal-length rings.

    band_mats maps a section-edge index k (the face spanning ring point k -> k+1) to
    its own material, or is a callable (segment, k) -> material-or-None, so one loft
    can carry a dark underbody band without a second object.
    skip(segment, k) -> True drops that face (used to cut the cabin out of the deck).

    SELF-ORIENTING by signed volume — see the long note in broken-car.py.  Leaning on
    recalc_face_normals is not safe for shells that are partly buried inside others.
    """
    n = len(rings[0])
    verts = [p for r in rings for p in r]
    faces, mats, emit = [], [], []
    for s in range(len(rings) - 1):
        a, b = s * n, (s + 1) * n
        for k in range(n):
            k2 = (k + 1) % n
            faces.append([a + k, a + k2, b + k2, b + k])
            emit.append(not (skip and skip(s, k)))
            if callable(band_mats):
                mats.append(band_mats(s, k) or mat)
            else:
                mats.append((band_mats or {}).get(k, mat))
    faces.append(list(range(n - 1, -1, -1)))
    mats.append(cap_first_mat or mat)
    emit.append(cap_first)
    o = (len(rings) - 1) * n
    faces.append([o + k for k in range(n)])
    mats.append(cap_last_mat or mat)
    emit.append(cap_last)

    # ORIENT FROM THE VIRTUAL CLOSED VOLUME.  Signed volume is only meaningful for a
    # CLOSED shell, but a loft with a skipped face or an omitted cap is open — and
    # those are exactly the shells (the cab tub, the cabin deck) whose winding matters
    # most.  So the volume is always computed over EVERY face including the ones about
    # to be dropped, and only then are they dropped.  This is what lets bake() stop
    # calling recalc_face_normals, whose per-island "outside" heuristic gets buried
    # shells wrong (it flipped broken-car's whole front bumper).
    vol = 0.0
    for fc in faces:
        for i in range(1, len(fc) - 1):
            a, b, c = verts[fc[0]], verts[fc[i]], verts[fc[i + 1]]
            vol += (a[0] * (b[1] * c[2] - b[2] * c[1])
                    - a[1] * (b[0] * c[2] - b[2] * c[0])
                    + a[2] * (b[0] * c[1] - b[1] * c[0]))
    if vol < 0.0:
        faces = [list(reversed(fc)) for fc in faces]
    faces = [f for f, e in zip(faces, emit) if e]
    mats = [m for m, e in zip(mats, emit) if e]

    o = len(part.v)
    part.v.extend(verts)
    for fc, fm in zip(faces, mats):
        part.f.append([i + o for i in fc])
        part.m.append(fm)


def tube(part, p0, p1, r, seg, mat, cap=True):
    """Axis-aligned-ish prism between two points (antenna, exhaust, shifter)."""
    import mathutils
    a, b = mathutils.Vector(p0), mathutils.Vector(p1)
    d = (b - a).normalized()
    up = mathutils.Vector((0, 0, 1))
    if abs(d.dot(up)) > 0.95:
        up = mathutils.Vector((0, 1, 0))
    u = d.cross(up).normalized()
    w = d.cross(u).normalized()
    rings = []
    for c in (a, b):
        rings.append([tuple(c + u * (r * math.cos(2 * math.pi * i / seg))
                             + w * (r * math.sin(2 * math.pi * i / seg)))
                      for i in range(seg)])
    loft(part, rings, mat, cap_first=cap, cap_last=cap)


# ---------------------------------------------------------------------------
# SECTION MATHS — the arch, and the two station tables.
# ---------------------------------------------------------------------------
def arch_z(y, axle):
    """Top of the wheel-arch opening at this station.

    Clamped to the rocker line: the opening is a circular SEGMENT, and past the
    point where the circle drops below the rocker the flank bottom is just the
    rocker again.  Keeping it a max() (rather than letting the circle run to its
    tangent points) is what makes the flank bottom continuous — an un-clamped
    version puts a 5 cm notch below the rocker at each end of the arch.

    AND CLAMPED AT THE TOP, which is the other half of the same problem.  The
    circle's crown lands at ARCH_Z + ARCH_R = 0.860 — EXACTLY Z_HIP, by coincidence
    of two numbers that were chosen for unrelated reasons.  With the sill point and
    the hip both at (W_FLANK, ...), a crown that reached Z_HIP made the section cross
    itself and loft into a dark V-shaped notch at the top of each rear arch.
    Ceiling = the hip less a little slack, so the ring stays strictly ordered.  The
    slack used to have to clear the bottom chamfer as well; with that gone the clamp
    costs 6 mm off the crown of the opening instead of 26, and nothing anywhere else.
    """
    d = abs(y - axle)
    if d >= ARCH_R:
        return Z_ROCKER
    top = Z_HIP - 0.006
    return max(Z_ROCKER, min(top, ARCH_Z + math.sqrt(ARCH_R * ARCH_R - d * d)))


def arch_samples(axle):
    """Cosine-spaced y samples across an arch: dense where the circle turns.

    Plus the two stations where arch_z()'s CLAMP RELEASES.  Between the tangent
    (clamped flat to the rocker) and the first cosine sample 30 degrees round, the
    flank bottom jumps ~0.18 m in 63 mm of length, and the quad spanning that is
    twisted enough that its triangulation produced a backward-facing triangle — one
    inverted face, caught by the ray test and invisible in every screenshot.
    Sampling exactly where the clamp lets go removes the jump instead of hiding it.
    """
    ys = [axle + ARCH_R * math.cos(math.pi * i / (ARCH_SAMP - 1))
          for i in range(ARCH_SAMP)]
    sin_rel = (Z_ROCKER - ARCH_Z) / ARCH_R
    if 0.0 < sin_rel < 1.0:
        dy = ARCH_R * math.sqrt(1.0 - sin_rel * sin_rel)
        ys += [axle + dy, axle - dy]
    return ys


def simplify_stations(ys, ring_fn, tol=0.0015):
    """Drop any station whose ring is already within `tol` of the straight line
    between its neighbours — i.e. a station that adds a loop of PLANAR quads.

    This is a Douglas-Peucker pass on the station list, and it is where the tri
    budget for the nose and tail comes from.  The bed side, the door flank and most
    of the hood are dead flat along y, so every station in those runs was costing a
    full ring of quads (20, 16 and 12 respectively) to describe nothing.  Owner,
    2026-08-25: "we're wasting a lot of triangles on perfectly flat faces."

    Runs on the RINGS, not on the station table, so it is automatically right for
    whatever the section functions do — including the arch, which is genuinely
    curved and therefore keeps all of its samples.
    """
    if len(ys) < 3:
        return list(ys)
    keep = [True] * len(ys)
    changed = True
    while changed:
        changed = False
        idx = [i for i, k in enumerate(keep) if k]
        for a, b, c in zip(idx, idx[1:], idx[2:]):
            t = (ys[b] - ys[a]) / (ys[c] - ys[a])
            ra, rb, rc = ring_fn(ys[a]), ring_fn(ys[b]), ring_fn(ys[c])
            err = 0.0
            for pa, pb, pc in zip(ra, rb, rc):
                for k in (0, 2):        # x and z; y is the parameter
                    err = max(err, abs(pb[k] - (pa[k] + (pc[k] - pa[k]) * t)))
            if err <= tol:
                keep[b] = False
                changed = True
                break
    return [y for y, k in zip(ys, keep) if k]


def _interp(table, y):
    """Linear interpolation down a station table sorted DESCENDING in y."""
    if y >= table[0][0]:
        return table[0][1:]
    if y <= table[-1][0]:
        return table[-1][1:]
    for i in range(len(table) - 1):
        y0, y1 = table[i][0], table[i + 1][0]
        if y1 <= y <= y0:
            t = (y0 - y) / (y0 - y1)
            return tuple(table[i][k] + (table[i + 1][k] - table[i][k]) * t
                         for k in range(1, len(table[i])))
    return table[-1][1:]


# Front clip: (y, w_flank, w_shoulder, z_hood_centre, hood_crown).
# The hood falls CONTINUOUSLY from the cowl to the nose — a hood that plateaus and
# then kinks reads as two glued boxes (learned on broken-car, 2026-08-10).
CLIP_ST = [
    # PLATEAU, then a roll.  Owner, 2026-08-26: "the hood is quite flat near the
    # windshield and rounds off heavily near the end" — a hood is a plateau with a
    # nose radius, not a ramp.  Then 2026-08-27: "split the difference and pull the
    # hood slope off back a little", because putting ALL of the fall in the rim made
    # the transition too abrupt.  So the total is unchanged at ~0.14 m but it is now
    # shared: dead flat from the cowl to y 1.05, 0.064 m of gentle descent from there
    # to the last station, and the remaining 0.076 m in the rim's quarter-ellipse.
    (1.7525, 0.824, 0.738, 1.108, 0.022, 1.00),  # last FULL station.  MUST equal AX_F+ARCH_R
                                           # exactly (asserted in report()): 2.5 mm off it
                                           # and the arch sample lands beside this station
                                           # instead of on it, leaving a sliver face that
                                           # came out inverted.
    # The FENDER ties into the nose (owner, 2026-08-27): it carries its crown past
    # the axle, then tucks in over the last 0.30 m to hand off to the prow.  Left
    # prismatic to the arch tangent, the bullet would look grafted onto a slab.
    (1.620, 0.838, 0.754, 1.126, 0.022, 1.00),
    (1.450, 0.845, 0.768, 1.142, 0.020, 0.95),   # fender crown carried past the axle
    (1.2825, 0.845, 0.774, 1.156, 0.018, 0.85),  # front axle
    (1.050, 0.842, 0.778, 1.166, 0.012, 0.60),
    (0.820, 0.832, 0.779, 1.171, 0.007, 0.30),
    (0.584, 0.816, 0.778, 1.172, 0.003, 0.00),   # cowl — see SQUARE below
]

# THE FENDER IS SQUARE ABOVE THE ARCH (owner, 2026-09-05): "add another fender
# horizontal subdivision between the top of the wheel arch and the hood line.  this
# should help squareify the front end which will allow us to make the indicator more
# rectangular".  Both halves of that are right, and the second is the point of it.
#
# Between the hip and the shoulder the section used to be ONE straight segment, so the
# flank started tucking in the moment it cleared the arch and was already 60% of the
# way to the hood line's width by the top of the lamp band.  That is what forced the
# aperture's outer edge to slant, which is what kept squeezing the amber into a wedge.
# One more point, held out near full width, keeps the flank vertical up past the lamp
# and puts the whole tuck in the last stretch — a boxy fender, and room for a
# rectangular lens.
#
# IT TAPERS TO NOTHING AT THE COWL, which is why it is a per-station term rather than
# a constant.  cab_ring has no such point — it does not need one, its flank is already
# near-vertical from the hip to the beltline — so a bulge carried all the way back
# would step 18 mm against the door skin at the shut line.  At square = 0 the new
# point lands exactly on the hip-to-shoulder chord: collinear, no shape change, and
# the two shells still meet flush.
SQUARE_Z = 0.15    # how far DOWN from the shoulder toward the hip the point sits
SQUARE_W = 0.18    # ...and how little of the tuck it has spent by then

# Cab: (y, w_flank, w_shoulder, z_belt).  Meets CLIP_ST's numbers at the cowl so the
# fender-to-door transition has no step.
CAB_ST = [
    (0.584, 0.816, 0.778, 1.172),          # cowl — matches CLIP_ST so the shells weld
    (0.300, 0.810, 0.775, Z_BELT),
    (-0.630, 0.806, 0.775, Z_BELT),        # cab rear panel
]
W_DOORCARD = 0.700                         # inner face of the door trim


# EVERY SECTION MIRRORS WITH r[1:-1], NEVER A LITERAL SLICE.  The two centreline
# points are r[0] and r[-1] and must not be duplicated in the mirrored half.  These
# used to be hand-written indices, and dropping ONE point from bed_ring() (the sill
# chamfer, 2026-09-05) turned r[1:13] into a slice that copied the last centreline
# point as well: the ring gained a point instead of losing one, every band index
# after it shifted by two, and BED_BANDS painted the whole left flank with the
# underbody's dark band.  The owner saw it as "left bedside turned black".
def bevel_ring(ring, idx, inset):
    """Copy of `ring` with the points in `idx` — the section's OUTER arc — pulled inboard
    by `inset`.

    Used as a loft's END ring it turns a square cap into a chamfer for one extra ring:
    the band between it and the full section behind it IS the bevel.  That is the cheapest
    honest way to round a panel's end edge, and flat shading gives the result a highlight
    line for free.  `idx` is folded onto the right half, so one index covers both sides.
    """
    n = len(ring)
    half = (n + 2) // 2
    out = []
    for i, (x, y, z) in enumerate(ring):
        k = i if i < half else n - i
        out.append((x - math.copysign(inset, x) if k in idx else x, y, z))
    return out


def clip_ring(y):
    """16-point closed section for the front clip (hood + fenders + nose)."""
    wo, wb, ztop, crown, sq = _interp(CLIP_ST, y)
    zb = arch_z(y, AX_F)
    # THE FLANK IS CUT TO THE BUMPER'S TOP LINE AHEAD OF THE ARCH (owner, 2026-09-06:
    # "trim the fender and front fascia to the bumper line").  Below Z_BUMP1 and forward
    # of the opening there is no sheet metal on the real truck — the bumper is the whole
    # of it — and leaving the fender there meant a strip of body colour beside whatever
    # was in front of it, which is the fault this file has chased under four different
    # names.  Cut, not covered: nothing can re-expose it later.
    #
    # It is a max() against the arch, so the two meet where the arch curve crosses
    # Z_BUMP1 (d = 0.356, y 1.6385) and the cut line runs on flat from there forward.
    # That continuity is why it is a max and not a branch on y — the owner drew exactly
    # this: along the bumper's top, then turning down round the front of the arch.
    # FORWARD OF THE AXLE ONLY.  Behind it this is the rocker line and the door's sill,
    # and cab_ring shares arch_z() for the same opening.
    if y > AX_F:
        zb = max(zb, Z_BUMP1)
    z_sh = ztop - crown                                # shoulder, at the hood line
    z_sq = z_sh - SQUARE_Z * (z_sh - Z_HIP)            # the squaring point's height
    t = (z_sq - Z_HIP) / max(1e-6, z_sh - Z_HIP)       # ...where it falls on the chord
    x_ch = wo + (wb - wo) * t                          # the chord it replaces
    x_sq = x_ch + (wo - SQUARE_W * (wo - wb) - x_ch) * sq
    r = [(0.0, Z_UNDER),
         (W_UNDER - UND_EDGE, Z_UNDER), (W_UNDER, Z_UNDER + UND_EDGE),   # pan corner
         (W_UNDER, zb), (wo, zb),
         (wo, Z_HIP), (x_sq, z_sq), (wb, z_sh), (0.0, ztop)]
    return ([(x, y, z) for x, z in r]
            + [(-x, y, z) for x, z in reversed(r[1:-1])])


def cab_ring(y):
    """16-point closed section for the cab: a U, because the top of this shell IS
    the cabin floor.  Filling the deck instead would put a solid plate at window-sill
    height behind the glass, which is exactly what the interior exists to avoid."""
    wo, wb, zbelt = _interp(CAB_ST, y)
    zb = arch_z(y, AX_F)                   # the front arch stops short of the cowl
    r = [(0.0, Z_UNDER),
         (W_UNDER - UND_EDGE, Z_UNDER), (W_UNDER, Z_UNDER + UND_EDGE),   # pan corner
         (W_UNDER, zb), (wo, zb),
         (wo, Z_HIP), (wb, zbelt), (W_DOORCARD, zbelt),
         (W_DOORCARD, Z_FLOOR), (0.0, Z_FLOOR)]
    return ([(x, y, z) for x, z in r]
            + [(-x, y, z) for x, z in reversed(r[1:-1])])


BED_END_EDGE = 0.022               # chamfer on the bed's LEADING vertical edge, and
CAB_END_EDGE = 0.022               # on the cab's TRAILING one.  They face each other
                                   # across an 80 mm gap, so the pair must not eat it:
                                   # 22 + 22 leaves 36 mm of daylight between them.
BED_EDGE = 0.038                   # chamfer on the bed's TOP edge only.  20 mm until
                                   # 2026-09-07 (owner: "bedside exterior top edge should
                                   # get a bigger chamfer to make the bedsides look
                                   # skinnier") — and it does, because the chamfer is a
                                   # flat-shaded highlight band running the length of the
                                   # bed and everything it takes comes off the RAIL CAP,
                                   # which is the surface reading as thickness.  The
                                   # bottom
                                   # one was removed 2026-09-05 (owner); BED_EDGE is
                                   # still what keeps arch_z()'s crown clamp honest,
                                   # so it did not become a free constant.
UND_EDGE = 0.018                   # chamfer on the UNDERBODY pan's outer corner.
                                   # Was 0.055 to soften the deep pan; the owner's
                                   # answer to that (2026-09-05) was "i didnt want it
                                   # rounded, i want it raised" — so the fix is
                                   # Z_UNDER, and the chamfer drops to a token 18 mm.
                                   # It is not deleted: the ring POINT has to survive
                                   # or CLIP_BANDS / CAB_BANDS / BED_BANDS and the nose
                                   # frame's inner list all shift by one per half.


def bed_bottom(y):
    """Flank bottom: the wheel arch, and behind it a KICK UP to meet the bumper.

    Owner, 2026-09-04: "the bedside tapers up to meet the bumper".  Behind the rear
    arch the rocker line rises to the step bumper's top face, so the bed's lower
    edge and the bumper meet instead of the bumper hanging off a straight sill.
    """
    zb = arch_z(y, AX_R)
    y0, y1 = AX_R - ARCH_R - 0.08, Y_BED_R
    if y < y0:
        t = min(1.0, (y0 - y) / (y0 - y1))
        # 0.040, not the full rise to the bumper: at 0.087 the swoop was too
        # aggressive (owner, 2026-09-04) and the sill looked hacked away.
        zb = max(zb, Z_ROCKER + 0.040 * t * t)
    return zb


def bed_ring(y):
    """24-point closed section for the bed: outer skin up, over the rail, down the
    inner wall (stepping in over the wheelhouse), across the floor and back.

    The TOP outer corner is CHAMFERED (owner, 2026-09-04: "the whole bed is rounded
    on top and bottom edges").  One extra point rather than a full fillet: at this
    scale a 20 mm bevel already reads as a radius, and flat shading turns it into a
    highlight line down the length of the bed for free.

    The BOTTOM corner is NOT, since 2026-09-05: "the bottom edge of the bedsides and
    wheel arches dont need a chamfer but have one - remove".  It was never earning
    its keep — it is in shadow under the flank and never catches a highlight — and it
    cost a point on every station of the longest loft in the model.  clip_ring has
    never had one, so the front and rear sills now match.
    """
    zb = bed_bottom(y)
    d = abs(y - AX_R)
    # BOX, NOT A CURVE — and build_bed() carries a station either side of the switch so
    # it stays one.  Without them the ring collapses over whatever gap happens to be
    # there and the box's end wall lofts as a long diagonal; at WHEELHOUSE_HALF_L 0.40
    # the nearest stations were 172 mm apart and one of those faces came out inverted.
    wh = W_WHEELHOUSE if d < WHEELHOUSE_HALF_L else W_BED_IN
    whe = WH_EDGE if wh < W_BED_IN - 1e-6 else 0.0         # ...and its chamfer with it
    r = [(0.0, Z_UNDER),
         (W_UNDER - UND_EDGE, Z_UNDER), (W_UNDER, Z_UNDER + UND_EDGE),   # pan corner
         (W_UNDER, zb),
         (W_FLANK, zb),                            # sill, a hard corner — see BED_EDGE
         (W_FLANK, Z_HIP),
         (W_BED_OUT, Z_RAIL - BED_EDGE), (W_BED_OUT - BED_EDGE, Z_RAIL), # top edge
         (W_BED_IN, Z_RAIL),
         (W_BED_IN, Z_WHEELHOUSE), (wh + whe, Z_WHEELHOUSE),
         (wh, Z_WHEELHOUSE - whe), (wh, Z_BEDFLOOR),
         (0.0, Z_BEDFLOOR)]
    return ([(x, y, z) for x, z in r]
            + [(-x, y, z) for x, z in reversed(r[1:-1])])


# Landmark indices into bed_ring()'s output.  Named because build_rear_end() takes
# the rear panels' OUTLINE from them point-for-point; a literal 7 buried in that
# function would silently mean something else the next time a chamfer is added.
BED_I_PAN_EDGE = 3      # (W_UNDER, zb)              where the pan meets the sill
BED_I_SILL = 4          # (W_FLANK, zb)              sill / flank bottom, one point
BED_I_HIP = 5           # (W_FLANK, Z_HIP)
BED_I_RAIL_OUT = 6      # (W_BED_OUT, Z_RAIL - BED_EDGE)
BED_I_RAIL_TOP = 7      # (W_BED_OUT - BED_EDGE, Z_RAIL)
BED_I_RAIL_IN = 8       # (W_BED_IN, Z_RAIL)
# BED_I_SILL..BED_I_RAIL_IN is the OUTER ARC — the bedside's own outline, and the
# rear face takes its outer edge from it point-for-point.  It lost a point when the
# bottom chamfer went, which is why every index below 5 shifted.
BED_I_ARC = (BED_I_SILL, BED_I_HIP, BED_I_RAIL_OUT, BED_I_RAIL_TOP, BED_I_RAIL_IN)


# Section-edge -> material.  Index k is the face spanning ring point k -> k+1.
DARK = "RangerInterior"
# All three shifted by one point per half when the pan gained its chamfer.
CLIP_BANDS = {k: DARK for k in (0, 1, 2, 3, 12, 13, 14, 15)}
CAB_BANDS = {k: DARK for k in (0, 1, 2, 3, 7, 8, 9, 10, 14, 15, 16, 17)}
BED_BANDS = {k: DARK for k in (0, 1, 2, 3, 22, 23, 24, 25)}


# ---------------------------------------------------------------------------
# SHELLS
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# THE NOSE IS A BULLET — rewritten 2026-08-27.
#
# Owner: "the front end of the vehicle you modeled is fundamentally much flatter
# than the front end of an early 2000s Ranger… redevelop the front end generation
# code to account for the bullet shaped nose."  Correct, and it was structural:
# face_y() took only x, so the face was a VERTICAL PLANE bowed 34 mm in plan with
# rounded edges stuck on.  No amount of extra rim rings fixes that, because what
# makes this nose read is that it projects along TWO axes at once.
#
# What a bullet actually is here, all three read off the reference:
#   1. PLAN PROW.  The centreline leads the corners by 115 mm, not 34.  This is
#      what makes the grille jut and the headlamps sweep back into the fenders.
#   2. ELEVATION LEAN.  The frontmost point is NOT the hood edge — it is the middle
#      of the LAMP BAND.  The hood edge falls 45 mm back from it and the valance
#      75 mm.  This was completely absent, and it is most of why the old nose read
#      as a wall.
#   3. FLANK RELIEF.  The lean is a centreline feature; out at the fender the face
#      has already been swept back by the prow, so only 40% of it survives there.
#      Without this the flank's lower points fall behind the last full station and
#      the loft folds (caught by the fold invariant in report()).
#
# Everything mounted on the nose — grille bars, lamp lenses, the frame, the valance
# — rides nose_y(x, z) through _sweep(), so the whole assembly is the same surface
# and cannot delaminate from it.
# ---------------------------------------------------------------------------
Y_FACE_C = 1.975                 # the APEX: frontmost sheet metal, on the centreline.
                                 # Tracks Y_NOSE — see the tiling note.
Z_NOSE_APEX = 0.880              # ...and at this height — the middle of the lamp band
NOSE_PROW = 0.115                # plan: how far the apex leads |x| = NOSE_PROW_W
NOSE_PROW_W = 0.820
NOSE_LEAN_UP = 0.045             # how far the face falls back from apex to hood line
NOSE_LEAN_DN = 0.075             # ...and from apex down to the rocker
NOSE_FLANK_LEAN = 0.40           # fraction of the lean surviving at the flank
NOSE_Z_TOP = 1.108               # hood line at the last full station
NOSE_Z_BOT = Z_ROCKER

# THE ARCH CONSTRAINT.  The rim is generated by shrinking CLIP_ST[0]'s section, so
# if that station still has the wheel arch cut into it the arch gets carried forward
# through the whole rim and opens a notch in the nose.  CLIP_ST[0] is therefore
# pinned to the front arch's forward tangent, AX_F + ARCH_R = 1.7525 (asserted).
#
# THE FOLD TRAP.  Rim rings are placed as a FRACTION of the span from the last full
# station to the nose surface, evaluated at each point's own x AND z — monotone by
# construction.  An earlier version used an absolute setback and ten of the first
# ring's twelve points ended up behind the station they were meant to lead; the loft
# folded and read as a dark crack across the hood.
#
# THE SCHEDULE IS GENERATED, not typed.  One quarter-turn drives all four numbers:
# the ring advances as sin(theta), and the tuck, drop and rise ease in as
# (1 - cos theta).  That makes the blend a real quarter-ELLIPSE — tangent to the
# hood and to the flank where it starts, perpendicular where it meets the face.
NOSE_RIM_N = 3        # five until 2026-09-05.  The owner's call: the front radius
                      # "can lose a couple faces and still read well".  It can —
                      # the blend is a quarter-ellipse either way, and at three
                      # stations the facets are still under 30 degrees apart.
NOSE_TUCK = 0.090      # plan-view corner radius on the vertical edges.  Smaller than
                       # before, because NOSE_PROW now does most of the plan work.
NOSE_DROP = 0.070      # how far the hood line falls across the rim
NOSE_RISE = 0.024      # how far the valance line tucks up; deliberately far less —
                       # a symmetric squeeze pinches the face

NOSE_RIM = []
for _i in range(1, NOSE_RIM_N + 1):
    _th = 0.5 * math.pi * _i / NOSE_RIM_N
    _ease = 1.0 - math.cos(_th)
    NOSE_RIM.append((math.sin(_th), 1.0 - NOSE_TUCK * _ease,
                     NOSE_DROP * _ease, NOSE_RISE * _ease))


def nose_y(x, z):
    """The bullet surface: how far forward the nose reaches at (x, z).

    Quadratic in both axes — a parabola is flattest at its apex, which is what a
    stamped panel does and what keeps the grille bars from looking bent.  The lean
    is scaled down toward the flank (NOSE_FLANK_LEAN) because it is a centreline
    feature; left at full strength out there it drags the fender's lower points
    behind the last full station and folds the loft.
    """
    px = min(1.0, abs(x) / NOSE_PROW_W)
    if z >= Z_NOSE_APEX:
        t = (z - Z_NOSE_APEX) / max(1e-6, NOSE_Z_TOP - Z_NOSE_APEX)
        lean = NOSE_LEAN_UP * min(1.0, t) ** 2
    else:
        t = (Z_NOSE_APEX - z) / max(1e-6, Z_NOSE_APEX - NOSE_Z_BOT)
        lean = NOSE_LEAN_DN * min(1.0, t) ** 2
    lean *= 1.0 - (1.0 - NOSE_FLANK_LEAN) * px * px
    return Y_FACE_C - NOSE_PROW * px * px - lean


def nose_rim_ring(spec):
    """One rim ring: the last full section, tucked in plan, rolled down over the top
    and tucked up a little underneath, then advanced onto the bullet surface.

    The advance is evaluated at the point's FINAL x and z, not its original ones —
    that is what lets a ring lean forward at the lamp band and back at the hood
    edge, i.e. what makes the swept form a bullet rather than a cone.
    """
    frac, scale, drop, rise = spec
    y_last = CLIP_ST[0][0]
    base = clip_ring(y_last)
    zs = [q[2] for q in base]
    z0, z1 = min(zs), max(zs)
    out = []
    for x, _y, z in base:
        nx = x * scale
        t = (z - z0) / (z1 - z0)                 # 0 at the rocker, 1 at the hood line
        nz = z + rise * (1.0 - t) - drop * t
        out.append((nx, y_last + frac * (nose_y(nx, nz) - y_last), nz))
    return out


# THE FRONT CORNER IN PLAN.  nose_y() only describes the bullet — it is the surface
# the rim rings land on, and it stops meaning anything outboard of them.  But the
# bumper and the air dam both have to keep hugging the sheet metal PAST that point,
# where the fender has already turned and is running back toward the arch.  So:
# CLIP_ST's half-widths, inverted, truncated at the widest station (past it the table
# narrows again toward the cowl and inverting it would jump the answer 1.2 m back).
CLIP_PLAN = []
for _w, _y in [(s[1], s[0]) for s in CLIP_ST]:
    if CLIP_PLAN and _w <= CLIP_PLAN[-1][0]:
        break
    CLIP_PLAN.append((_w, _y))


def corner_y(x, z):
    """Plan position of the front sheet metal at (x, z), valid outboard of the rim.

    Inside the rim it IS nose_y().  Past it, the first station whose flank is wide
    enough to reach this x.  Anything that must die into the front corner rather
    than float in front of it rides this — see the blade and the air dam.
    """
    rim_x = abs(nose_rim_ring(NOSE_RIM[-1])[5][0])
    ax = min(abs(x), CLIP_PLAN[-1][0])
    if ax <= rim_x:
        return nose_y(ax, z)
    tbl = [(rim_x, nose_y(rim_x, z))] + CLIP_PLAN
    for (xa, ya), (xb, yb) in zip(tbl, tbl[1:]):
        if xa <= ax <= xb:
            return ya + (yb - ya) * (ax - xa) / max(1e-6, xb - xa)
    return tbl[-1][1]


def ring_flank(ring, z, idx=(4, 5, 6, 7)):
    """(x, y) on a ring's OUTER FLANK at height z, walking the arc `idx`.

    Only the arc is the body's side; the rest of any section is the pan, the face and
    the mirror half.  Defaults to the front clip's (arch soffit, hip, square, shoulder); the
    bed passes BED_I_ARC.  Published because both corner lamps WRAP onto the flank
    and have to read its real plan position at their own height rather than guess it
    from a constant.
    """
    seg = [ring[i] for i in idx]
    if z <= seg[0][2]:
        return (seg[0][0], seg[0][1])
    for (xa, ya, za), (xb, yb, zb) in zip(seg, seg[1:]):
        if za <= z <= zb:
            t = (z - za) / max(1e-6, zb - za)
            return (xa + (xb - xa) * t, ya + (yb - ya) * t)
    return (seg[-1][0], seg[-1][1])


def build_front_clip(p):
    ys = sorted({round(s[0], 5) for s in CLIP_ST}
                | {round(v, 5) for v in arch_samples(AX_F)}, reverse=True)
    ys = [y for y in ys if CLIP_ST[-1][0] <= y <= CLIP_ST[0][0]]
    ys = simplify_stations(ys, clip_ring)
    rings = [clip_ring(y) for y in ys]     # ys DESCENDING: nose first, cowl last
    # Rim rings go IN FRONT, outermost first, so the loft still runs nose -> cowl.
    rings = [nose_rim_ring(r) for r in reversed(NOSE_RIM)] + rings
    # cap_last (at the cowl) is the FIREWALL — seen from the cabin, never from the
    # engine bay, so it is interior-dark, not paint.
    # cap_first (the nose) is omitted: build_front_end() replaces it with a FRAME so
    # the grille and lamps have something to sit in.
    loft(p, rings, "RangerPaint", cap_first=False, cap_last=True,
         band_mats=CLIP_BANDS, cap_last_mat=DARK)


def build_cab(p):
    ys = simplify_stations([Y_COWL, 0.300, -0.080, -0.400, Y_CAB_REAR], cab_ring)
    rings = [cab_ring(y) for y in ys]
    # A CHAMFERED TRAILING EDGE (owner, 2026-09-07: "the leading edge of the bed should
    # have a chamfer as should the trailing edge of the cab").  These two face each other
    # across an 80 mm gap and are the only vertical panel ends on the truck that are read
    # at close range from a three-quarter view; square, they look stamped off.
    #
    # The inserted ring is a FULL section one bevel back, so the last ring can be the
    # inset one at Y_CAB_REAR itself — the bed's end does not move, only its corner.
    # It has to go in AFTER simplify_stations(): the two sections are identical apart
    # from the inset, so the simplifier would drop the inserted one and stretch the
    # bevel over the whole 230 mm to the next real station.
    rings.insert(len(rings) - 1, cab_ring(Y_CAB_REAR + CAB_END_EDGE))
    rings[-1] = bevel_ring(rings[-1], (4, 5, 6), CAB_END_EDGE)
    # cap_first at the cowl would z-fight the firewall the front clip already put
    # there, so it is omitted; loft() still orients from the virtual closed volume.
    loft(p, rings, "RangerPaint", cap_first=False, cap_last=True,
         band_mats=CAB_BANDS)

    # THE CAB'S REAR SKIN, below the beltline.
    #
    # cab_ring is a U — its top IS the cabin floor, see the docstring — so the shell's
    # rear cap has the cabin void punched straight through it, and from behind the truck
    # you looked at the interior's dark rear wall with no panel in front of it.  Owner,
    # 2026-09-07: "back of cab went black, likely an inversion".  It was not: the ray
    # test passes and the committed build does the same thing.  There was simply never a
    # panel here, and it went unnoticed because the bed's front wall hid it from every
    # angle except a high one looking down into the gap.
    #
    # build_greenhouse() closes the band ABOVE the beltline, either side of the
    # backlight.  This closes the band below it, from the cabin floor up to meet that.
    # It is deliberately a few mm BIGGER than the void it fills, on both axes.  Sized to
    # W_DOORCARD and Z_FLOOR exactly, its side and bottom faces land on the U's own door
    # card and floor — coplanar, and the audit caught all three.  Oversizing buries them
    # in the shell instead; undersizing would have left a hairline of dark interior
    # showing round the panel's edge, which is the fault this is here to fix.
    box(p, -W_DOORCARD - 0.006, W_DOORCARD + 0.006, Y_CAB_REAR - 0.004,
        Y_CAB_REAR + 0.024, Z_FLOOR - 0.008, Z_BELT, "RangerPaint")


# THE TAIL GETS THE NOSE'S TREATMENT (owner, 2026-09-04).  Same architecture as
# nose_y()/nose_rim_ring(), with the signs flipped and much smaller numbers: a
# tailgate really is close to flat, it is the CORNERS and the TOP EDGE that turn.
#   - TAIL_PROW rounds the rear corners in plan;
#   - TAIL_LEAN_UP is "the tailgate also rounds away at the top" — the face falls
#     forward as it approaches the rail;
#   - the rim needs room to do it, which is why Y_BED_R now sits 100 mm ahead of
#     the tailgate plane instead of 30.  At 30 mm the prow plus the lean exceeded
#     the span and the rings folded forward.
TAIL_RIM_N = 4
TAIL_TUCK = 0.032                  # plan-view corner radius on the rear verticals
TAIL_DROP = 0.026                  # rail line rolls down across the rim
TAIL_RISE = 0.012
TAIL_PROW = 0.026                  # plan: centreline leads the rear corners
Z_TAIL_APEX = 0.900                # rearmost height, mid-tailgate
TAIL_LEAN_UP = 0.050               # how far the face rolls forward by the rail
TAIL_LEAN_DN = 0.016

# THE BEDSIDE CLOSES ITSELF (2026-09-05).  Owner: "the bedside end caps are jarring
# because theyre still subtly visibly caps.  can we merge them into the bedsides?"
#
# They were caps because they were a SEPARATE SOLID laid over the bed's rear opening,
# and no amount of matching its outline to the skin hides that: it needs a shut line
# to avoid z-fighting the bed's last loft band, and that line traces the whole panel.
#
# So the rear face is not a panel any more.  The rim's LAST ring now carries the
# outer arc all the way in to the tailgate shut line, which makes the rear face the
# bed loft's OWN last band — same mesh, same vertices, welded, no outline to see.
# That is also why TAIL_RIM_N went 3 -> 4: with the arc travelling 133 mm instead of
# 27, three stations turned the corner in visible facets.
TAIL_SHUT_X = W_BED_IN + 0.012     # where the bedside's rear face dies inboard: far
                                   # enough outboard of the tub wall to leave a real
                                   # shut face rather than a zero-width sliver.
TAIL_SHUT = 0.006                  # ...and the gap between it and the tailgate.

TAIL_RIM = []
for _i in range(1, TAIL_RIM_N + 1):
    _th = 0.5 * math.pi * _i / TAIL_RIM_N
    _e = 1.0 - math.cos(_th)
    TAIL_RIM.append((math.sin(_th), 1.0 - TAIL_TUCK * _e,
                     TAIL_DROP * _e, TAIL_RISE * _e, _e))


def tail_lean(z):
    """How far forward the tail face rolls at height z.  Split out from tail_y() so
    the painted rear panels can use the SAME curve — chasing it with a hand-typed
    station table left an open wedge at each top corner."""
    if z >= Z_TAIL_APEX:
        t = (z - Z_TAIL_APEX) / max(1e-6, Z_RAIL - Z_TAIL_APEX)
        return TAIL_LEAN_UP * min(1.0, t) ** 2
    t = (Z_TAIL_APEX - z) / max(1e-6, Z_TAIL_APEX - Z_ROCKER)
    return TAIL_LEAN_DN * min(1.0, t) ** 2


def tail_y(x, z):
    """The tail surface: how far REARWARD the bed reaches at (x, z).  More positive
    y = further forward, so prow and lean both ADD here where the nose subtracts."""
    px = min(1.0, abs(x) / W_BED_OUT)
    return Y_TAILGATE + TAIL_PROW * px * px + tail_lean(z)


def tail_rim_ring(spec, base):
    """One tail rim ring.  Only the outer skin is TUCKED IN PLAN; the tub's inner
    wall and floor keep their x, because pinching those would visibly narrow the bed.

    EVERY POINT LANDS ON tail_y() THOUGH, inner wall included (2026-09-05).  The
    inner points used to be pinned to the flat Y_TAILGATE plane while the outer skin
    rode the tail surface, which spread the 26 mm of TAIL_PROW across the rear as a
    WARP: the loft's rear cap, the painted panels laid over it and the tail lamps
    sitting on those were then each on a slightly different surface, and the lamps
    came out proud at one end and sunk at the other.  Owner, 2026-09-05: the rear
    faces "are their own unique and totally flat surface".  One surface fixes the
    whole family at once — and the tuck, which is what actually rounds the corner,
    is untouched.
    """
    frac, scale, drop, rise, close = spec
    y_last = Y_BED_R
    zs = [q[2] for q in base]
    z0, z1 = min(zs), max(zs)
    n = len(base)
    half = (n + 2) // 2         # a section is r + mirror(r[1:-1]), so this is len(r)
    out = []
    for i, (x, _y, z) in enumerate(base):
        k = i if i < half else n - i        # fold the mirror back onto the right half
        # Tuck the outer skin AND the underbody pan; the tub's inner wall and floor
        # keep their x.  Leaving the pan untucked left the underside ending in a hard
        # rectangular corner.
        if abs(x) > W_BED_IN + 0.001 or z < Z_BEDFLOOR - 0.010:
            nx = x * scale
            t = (z - z0) / (z1 - z0)
            nz = z + rise * (1.0 - t) - drop * t
        else:
            nx, nz = x, z
        # ...and the OUTER ARC alone closes onto the shut line as `close` eases to 1.
        # Keyed to the landmark indices, not to a width test: the pan is narrower than
        # the tub wall and would otherwise have to be excluded by a second rule.
        if BED_I_SILL <= k <= BED_I_RAIL_TOP:
            nx += (math.copysign(TAIL_SHUT_X, nx) - nx) * close
        out.append((nx, y_last + frac * (tail_y(nx, nz) - y_last), nz))
    return out


# ---------------------------------------------------------------------------
# THE TAIL LAMPS WRAP THE CORNER — rewritten 2026-09-05.
#
# Owner: "the taillight looks like a flat light bolted on a flat surface while the
# actual ranger has corner lights that wrap around and follow the body lines."
# Correct, and it was structural, exactly like the nose was: the unit was four
# AXIS-ALIGNED BOXES let into the rear panel, so it lived on one plane, stopped
# dead at the bed's corner, and showed nothing at all from the side.  No amount of
# extra boxes fixes that — a lamp that turns a corner is a SWEEP, not a stack.
#
# It is now one loft swept along a plan path, and the path is taken from the RIM
# STATIONS THEMSELVES: the same (frac, scale) pairs build_bed() lofts the corner
# with.  So the lens rides the skin whatever TAIL_TUCK / TAIL_PROW do next, the
# way the rear panels already take their outline from the rim ring point-for-point.
#
# ONE loft, not three stacked ones: loft()'s band_mats splits a single 8-point
# section into bezel / red / clear / red, which is ~90 tris a side instead of ~270.
TAIL_LAMP_PROUD = 0.012     # lens face stands this far off the skin along its normal.
                            # Measured off tail_y() and nothing else: since 2026-09-05
                            # the rear face IS on tail_y() (build_rear_end's ribs), so
                            # there is no second datum to track.  It only has to be
                            # enough to clear that face — flush, the two z-fight.
TAIL_LAMP_DEEP = 0.028      # ...and this far into it.  The two solids simply overlap;
                            # that is fine, it is coplanar faces that are not.  It has
                            # to stay UNDER the rear panel's 54 mm thickness, or the
                            # section's top and bottom bezel returns — which are nearly
                            # horizontal, so they present a big face for their depth —
                            # come out the back of the panel as black wedges.
# Section heights as fractions of the lamp's own span: bottom bezel return, then
# red / clear / red per the reference unit, then the top bezel return.
# FOUR STATIONS, NOT SIX.  There were dark DIVIDER bands between the red and clear
# sections; at this scale they are one pixel of a different dark, and they cost two
# faces on every one of the sweep's five bands — 48 tris across both lamps for an
# edge that flat shading already draws for free where the material changes.
TAIL_LAMP_U = (0.036, 0.318, 0.660, 0.964)
# Face k spans section point k -> k+1.  1 and 3 fall through to the loft's own
# "RangerTail"; 5 is the buried inner face.
TAIL_LAMP_MATS = {0: DARK, 2: "RangerLens", 4: DARK, 5: DARK}
# How much of the lamp's height is eaten, per path station, as it turns onto the
# flank — and ALL OF IT COMES OFF THE TOP.  Owner, 2026-09-07: "bottom edge needs to be
# horizontal.  top can have a slight taper".  It used to be split evenly between the two
# edges, which made the lens a lozenge; the floor is dead flat now and only the ceiling
# rakes.  Quartered again on the same day ("much less taper on top of taillight like 25%
# of current size"): all it has to do now is stop the lens ending on a hard square corner
# where it dies on the flank.  ONE ENTRY PER RING: the rim rings rearmost-first, then the
# last full section.
TAIL_LAMP_SHRINK = (0.0, 0.005, 0.015, 0.035, 0.070)
# ROUND ON THE FORWARD END'S CORNERS — the pair where the lens dies on the flank.  Owner,
# 2026-09-07: "round the front corners of the taillight.  the corners adjacent to the
# tailgate can stay sharp".  So this is zero at station 0, which IS the tailgate end, and
# grows only over the last few.  Unlike the shrink it comes off BOTH edges, because a
# corner radius is not a taper: confined to the forward stations it rounds an end, and the
# bottom stays dead level everywhere the lens is actually seen face-on.  Metres, not a
# fraction of the span, so it reads as a radius and does not scale if the band grows.
TAIL_LAMP_ROUND = (0.0, 0.0, 0.004, 0.014, 0.034)


def tail_skin_path(sx, z):
    """Plan path (x, y) of the bed's outer skin at height z: from the tailgate shut
    line, out across the rear face, round the corner and forward down the flank.

    THE STATIONS ARE THE BED'S OWN RINGS, read at the lamp's height — the rearmost
    rim ring first, then each one forward, then the last full section at Y_BED_R.
    Since the rear face became the bed's own last band, that list simply IS where the
    skin is; it used to reconstruct the same curve from TAIL_RIM's scale factors,
    which stopped being the whole story the moment the arc gained its close term.
    """
    base = bed_ring(Y_BED_R)
    pts = []
    for spec in reversed(TAIL_RIM):
        x, y = ring_flank(tail_rim_ring(spec, base), z, BED_I_ARC)
        pts.append((sx * abs(x), y))
    x, y = ring_flank(base, z, BED_I_ARC)
    pts.append((sx * abs(x), y))
    # Step the inboard end clear of the shut line, so the lens sits on the rear face
    # rather than straddling the gap it is supposed to stop short of.
    pts[0] = (pts[0][0] + sx * 0.014, pts[0][1])
    return pts


def tail_lamp(p, sx):
    """One wrapped tail lamp, swept along tail_skin_path()."""
    zm = 0.5 * (Z_TAIL0 + Z_TAIL1)
    path = tail_skin_path(sx, zm)
    span = Z_TAIL1 - Z_TAIL0
    rings = []
    for i, (x, y) in enumerate(path):
        # Outward normal = the plan tangent turned a quarter turn.  Taken from the
        # NEIGHBOURS rather than per-segment so consecutive sections share it and the
        # sweep cannot kink at a station.  The sx factor flips the turn with the side.
        a, b = path[max(0, i - 1)], path[min(len(path) - 1, i + 1)]
        tx, ty = b[0] - a[0], b[1] - a[1]
        L = math.hypot(tx, ty) or 1.0
        nx, ny = sx * ty / L, -sx * tx / L
        # FLOOR IS A CONSTANT and the ceiling takes the whole taper (TAIL_LAMP_SHRINK);
        # both then give up TAIL_LAMP_ROUND at the forward end, which is the corner radius.
        rnd = TAIL_LAMP_ROUND[i]
        z0 = Z_TAIL0 + rnd
        z1 = Z_TAIL1 - span * TAIL_LAMP_SHRINK[i] - rnd
        h = z1 - z0

        def at(off, u):
            # THE PATH IS SOLVED AT ONE HEIGHT (zm) but the tail surface ROLLS FORWARD
            # as it climbs — up to 8 mm over the lamp's own span.  Extruded straight,
            # the lens ends up that far behind the panel at its top, and the bezel
            # return (near-horizontal, so a big face for its depth) shows through the
            # back as a black wedge.  Carrying the lean delta puts every section point
            # on the skin at its OWN height instead.
            z = z0 + h * u
            return (x + nx * off, y + ny * off + tail_lean(z) - tail_lean(zm), z)
        rings.append([at(-TAIL_LAMP_DEEP, 0.0)]
                     + [at(TAIL_LAMP_PROUD, u) for u in TAIL_LAMP_U]
                     + [at(-TAIL_LAMP_DEEP, 1.0)])
    # Both caps are seen — the inboard one is the shut line beside the tailgate, the
    # outboard one is where the lens dies on the flank — so both are bezel-dark.
    loft(p, rings, "RangerTail", band_mats=TAIL_LAMP_MATS,
         cap_first_mat=DARK, cap_last_mat=DARK)


def build_bed(p):
    ys = sorted({Y_BED_F, -0.980, Y_BED_R, -2.200, -2.330}
                | {round(v, 5) for v in arch_samples(AX_R)}
                | {AX_R + sx * (WHEELHOUSE_HALF_L + e)
                   for sx in (1, -1) for e in (0.005, -0.005)}, reverse=True)
    ys = [y for y in ys if Y_BED_R <= y <= Y_BED_F]
    ys = simplify_stations(ys, bed_ring)
    rings = [bed_ring(y) for y in ys]
    # ...and the bed's LEADING edge, the same way — see build_cab().  The arc stops at
    # BED_I_RAIL_TOP: BED_I_RAIL_IN is the tub's own wall, not outer skin, and pulling it
    # in would narrow the bed's mouth rather than round its corner.
    rings.insert(1, bed_ring(Y_BED_F - BED_END_EDGE))
    rings[0] = bevel_ring(rings[0], (BED_I_SILL, BED_I_HIP,
                                     BED_I_RAIL_OUT, BED_I_RAIL_TOP), BED_END_EDGE)
    base_last = rings[-1]
    # Rear rim: three rings that turn the bedsides INTO the tail and roll the rail
    # line forward as it meets the tailgate.
    for spec in TAIL_RIM:
        rings.append(tail_rim_ring(spec, base_last))
    # THE REAR CAP IS PAINT, NOT DARK, AND THAT IS THE WHOLE FIX (2026-09-05).
    #
    # It is ONE n-gon over a 24-point ring whose y spans 66 mm: TAIL_LEAN_UP rolls
    # the rail 50 mm forward while the tub floor stays put, so the rear opening is a
    # steeply leaning loop, not a plane.  A non-planar n-gon gets TRIANGULATED, and
    # those triangles chord straight across the lean — MEASURED at up to 28 mm
    # rearward of the tail surface over the rail corner.  Dark, that chord sat in
    # front of the painted rear panels as a grey wedge above each tail lamp: the
    # owner's "dark grey body showing through where it clips" (2026-09-05).
    #
    # No offset fixes it.  Standing the panels 28 mm proud DOES hide it (swept and
    # measured), but 28 mm is a visible lip round the whole bed — trading the owner's
    # other complaint, the awkward step, for this one.  Painting the cap removes the
    # fault instead of hiding it: a body-colour chord behind body-colour panels is
    # invisible whatever it does, and the cap is only ever SEEN through the slot under
    # the tailgate, which now gets its darkness from an explicit plate that cannot
    # wobble.  See build_rear_end().
    loft(p, rings, "RangerPaint", cap_first=True, cap_last=True,
         band_mats=BED_BANDS, cap_last_mat=DARK)


# ---------------------------------------------------------------------------
# BED DETAIL — the ribs are the whole point.  Flat shading turns each fold into a
# light/dark band for free, which is why an open bed can be read at a glance with
# no texture and no AO.  (ART-STYLE rule 2.)
# ---------------------------------------------------------------------------
def build_bed_detail(p):
    # Floor corrugation.  Only |x| <= W_WHEELHOUSE is ribbed, so the sheet can run
    # the full length of the bed without ever intersecting a wheelhouse; the strips
    # outboard of it stay flat, exactly as on the reference truck.
    xw = W_WHEELHOUSE - 0.012
    # Runs to just short of the tailgate's INNER face, not to the bed loft's last
    # station — the rim carries the tub another 100 mm back past that.
    y0, y1 = Y_TAILGATE + 0.056, Y_BED_F - 0.020
    n = N_RIBS * 2
    top = []
    for i in range(n + 1):
        x = -xw + 2 * xw * i / n
        top.append((x, Z_BEDFLOOR + (RIB_H if i % 2 else 0.004)))
    prof = top + [(xw, Z_BEDFLOOR - 0.010), (-xw, Z_BEDFLOOR - 0.010)]
    loft(p, [[(x, y, z) for x, z in prof] for y in (y1, y0)], "RangerPaint")

    # Pressed panel on the inner face of the bed FRONT wall and the tailgate.  Both
    # are stared at from the chase camera whenever the bed is empty.
    for (yf, yb) in ((Y_BED_F - 0.028, Y_BED_F - 0.062),
                     (Y_TAILGATE + 0.094, Y_TAILGATE + 0.060)):
        box(p, -0.560, 0.560, yb, yf, Z_BEDFLOOR + 0.055, Z_RAIL - 0.075, "RangerPaint")

    # Tailgate outer: the handle, and nothing else.  There USED to be a body-colour
    # crease box above it, standing 16 mm proud across the middle of the gate; the
    # owner's verdict (2026-09-05) was "there is a red rectangular body on the
    # tailgate above the handle.  this can be removed".  The reference gate is a
    # plain stamping with the handle and the Ford oval on it — the crease was a
    # feature the real truck does not have.
    # Keyed to the GATE'S OWN FACE at its own height, not to the Y_TAILGATE plane —
    # the gate rides tail_y(), so a constant offset leaves trim floating behind the
    # panel it is supposed to be pressed into.
    for x0, x1, z0, z1, proud, mat in ((-0.115, 0.115, 0.880, 0.935, 0.020, "RangerTrim"),):
        yg = tail_y(0.0, 0.5 * (z0 + z1)) - 0.003
        box(p, x0, x1, yg - proud, yg, z0, z1, mat)

    # Stake pockets — two per rail.  Tiny, but they are the only thing that says
    # "this rail is a folded steel channel" rather than a solid bar.
    for sx in (1, -1):
        for yy in (-1.020, -2.130):
            box(p, sx * 0.726, sx * 0.800, yy - 0.052, yy + 0.052,
                Z_RAIL - 0.030, Z_RAIL + 0.002, DARK)


# ---------------------------------------------------------------------------
# FRONT END
# ---------------------------------------------------------------------------
def _sweep(part, xs, prof, mat, cap=True, surf=None):
    """Sweep a y-z profile along x, laying each station on the nose's barrel curve.

    `prof(x)` returns the section at that x as (dy, z) pairs measured BACK from the
    face; this adds nose_y(x, z) so every swept part — bar, bezel, lens, valance —
    projects by the same amount as the panel it sits in, in BOTH axes.  Evaluating
    at the profile point's own z is what makes a headlamp sweep back at its top and
    bottom the way the sheet metal around it does; using only x would leave every
    fitting on a vertical plane inside a bullet-shaped hole.

    `surf` overrides WHICH surface that is.  Parts living inside the nose rim take
    the default; parts that wrap past it — the air dam's corner return — pass
    corner_y, or their outboard stations hang in front of a fender that turned back
    300 mm ago.
    """
    surf = surf or nose_y
    rings = [[(x, surf(x, z) - dy, z) for dy, z in prof(x)] for x in xs]
    loft(part, rings, mat, cap_first=cap, cap_last=cap)


def build_front_end(p):
    # The opening is bounded by the nose outline, which tapers toward the top —
    # push it wider than this and the frame inverts.
    OPEN_X, OPEN_Z0, OPEN_Z1 = 0.724, Z_LAMP0, Z_LAMP1

    # THE APERTURE'S TOP-OUTER CORNER HAS TO TUCK IN — this is the "small tear near
    # the headlights" (owner, 2026-09-05), and it was never a hole: the mesh has no
    # boundary edge there.  frame() pairs rim-ring point k with inner point k, and
    # rim point 6 (the fender shoulder) sits at x 0.672, which is 40 mm INBOARD of
    # OPEN_X.  With the aperture's top corner left at (OPEN_X, OPEN_Z1) that one quad
    # ran outside-in: a twisted, near-edge-on sliver of paint that flat shading
    # renders almost black, and it reads as a crack up the fender.
    #
    # Pulling the corner in to OPEN_X_TOP un-twists it.  HOW MUCH SLANT IS THE
    # MINIMUM, and the answer has now been wrong in both directions.  The first cut
    # dropped the outer edge to the aperture's mid-height; the second left it at
    # 0.700 / 0.930, which is a 60 mm fall over the outer 40 mm of the hole.  Both
    # got the same verdict from the owner — "the front indicator lights are awkwardly
    # crushed ... they appear as trapezoids when they should be simple rectangular.
    # maybe the outside top corner can round to meet the hood/fascia line but overall
    # should be a rectangle" (2026-09-05).
    #
    # What constrains it is the FENDER'S OWN WIDTH.  Between the rim's hip (x 0.750
    # at z 0.824) and its shoulder (x 0.672 at z 1.019) the body narrows as it climbs,
    # so the aperture's outer edge can only be as tall as the point where the sheet
    # metal is still that wide.  That is a TRADE, not a fixed slant: every millimetre
    # off OPEN_X buys ~2.5 mm of height at that edge.  Spending 16 mm of width buys
    # enough height to run the outer edge to 0.972 — 18 mm short of the aperture's
    # own top — so what is left is a rectangle with a 38 x 18 mm nick off its top
    # outer corner, i.e. exactly the "round to meet the hood line" the owner allowed.
    # The lens is now 202 mm tall everywhere except that last 38 mm.
    #
    # The width the aperture gives up is NOT lost: the lamp keeps going past it, on
    # corner_lamp() below, which is what turns the corner onto the fender flank.
    # Both limits are asserted below rather than left as a comment to drift.
    LAMP_LEAN_IN = 0.022             # how far the cluster's INBOARD end leans outboard
                                     # between its base and its top.  Shared with the
                                     # grille surround, which has to lean by the same
                                     # amount or the bezel between them is a wedge.
    OPEN_X_TOP = 0.664               # where the aperture's FLAT TOP breaks inboard to
                                     # clear the rim's shoulder (pt 7 — the fender gained
                                     # a squaring point at 6, between hip and shoulder)
    # THE APERTURE IS A PLAIN RECTANGLE AGAIN (2026-09-05).  It moved outboard with the
    # fender: squaring the flank above the arch holds it at 0.736 all the way to the top
    # of the lamp band, where it used to have narrowed to 0.683.  Aperture 0.684 -> 0.724,
    # so the cluster is 80 mm wider across the nose and the amber gets 60 mm of FRONT
    # face instead of 38.
    #
    # AND THE SLANT IS GONE.  There used to be an OPEN_Z_CNR that dropped the outer edge
    # below OPEN_Z1, because the fender narrowed THROUGH the lamp band and the hole could
    # not be as tall out there as it was inboard.  That is what kept turning the amber
    # into a wedge — the nick landed on exactly the span the amber occupies, so a 15 mm
    # fall over 60 mm raked the whole lens.  With the flank held out past the top of the
    # band there is nothing left for it to earn: the outer edge is vertical at OPEN_X for
    # the full 202 mm and the top is flat at OPEN_Z1 across the whole width.
    #
    # The corner still has to break inboard SOMEWHERE — frame() pairs inner point 7 with
    # the rim's shoulder at x 0.672, and an inner point outboard of its own rim partner
    # is the twisted quad that reads as a crack up the fender.  It now breaks
    # HORIZONTALLY, at OPEN_Z1, so the break is a segment of the top edge rather than a
    # rake down the outer one.  Owner, 2026-09-05: "see if you can get the indicators
    # truly square".

    _rim = nose_rim_ring(NOSE_RIM[-1])

    def _body_half_width(z):
        """The rim's own flank width at height z.  Walks the WHOLE arc, not the
        hip-to-shoulder chord: since the fender gained its squaring point that chord
        runs well inside the metal, and reading the limit off it would give away
        exactly the width this exercise was meant to buy."""
        return ring_flank(_rim, z)[0]

    assert OPEN_X_TOP < abs(_rim[7][0]), \
        "aperture top corner must sit INBOARD of the rim's fender shoulder"
    assert OPEN_X < _body_half_width(OPEN_Z1), \
        "aperture outer edge reaches above the height the fender is still that wide"

    # The nose cap, as a frame around the lamp/grille opening.  Point order matches
    # the rim ring; the duplicated corners collapse into triangles, which is what
    # turns a 12-point body outline into a rectangular hole.
    # ONE ENTRY PER RIM-RING POINT — frame() pairs them off by index, so this list
    # has to track clip_ring()'s topology exactly.  It grew by one per half when the
    # underbody pan gained its chamfer, and again when the fender gained its squaring
    # point.  The repeated corners collapse to triangles, which is what turns a
    # 16-point body outline into a rectangular hole.
    # MIRROR WITH inner[1:-1], never a literal slice — the two centreline entries are
    # the first and last, and a hard-coded end index silently duplicates one the next
    # time the section changes length.  (That exact bug painted the bed's left flank
    # black on 2026-09-05; same shape of mistake, different list.)
    inner = [(0.0, OPEN_Z0),
             (OPEN_X, OPEN_Z0), (OPEN_X, OPEN_Z0),        # pan chamfer
             (OPEN_X, OPEN_Z0), (OPEN_X, OPEN_Z0),        # pan side, arch soffit
             (OPEN_X, OPEN_Z1), (OPEN_X, OPEN_Z1),        # flank, squaring point
             (OPEN_X_TOP, OPEN_Z1), (0.0, OPEN_Z1)]       # tucked corner — see above
    inner = inner + [(-x, z) for x, z in reversed(inner[1:-1])]
    assert len(inner) == len(nose_rim_ring(NOSE_RIM[-1])), \
        "nose frame inner ring must match clip_ring()'s point count"
    # NOSE_RIM[-1], not [1]: the frame has to sit on the OUTERMOST rim ring, and that
    # index moved when the rim went from two rings to four.
    frame(p, nose_rim_ring(NOSE_RIM[-1]),
          [(x, nose_y(x, z), z) for x, z in inner], "RangerPaint")

    # Dark backing behind the opening — the thing the grille bars and bezels read
    # against, and the reason you cannot see through into the engine bay.  It has to
    # be SWEPT, not a box: on a bullet nose a flat slab at a fixed y is ahead of the
    # sheet metal at the corners even while it is behind it at the centre, and it
    # punched through the fenders as two dark notches.  Constant setback behind
    # nose_y() instead, so it is parallel to the face everywhere.
    _sweep(p, [-0.775, -0.500, -0.250, 0.0, 0.250, 0.500, 0.775],
           lambda x: [(0.150, OPEN_Z0 - 0.030), (0.150, OPEN_Z1 + 0.006),
                      (0.112, OPEN_Z1 + 0.006), (0.112, OPEN_Z0 - 0.030)], DARK)

    # Grille: a body-colour surround with four chrome bars, every one of them swept
    # along the barrel curve so the grille reads ROUNDED, not flat (owner: "the
    # grille is rounded, not flat").
    gx, gz0, gz1 = 0.392, OPEN_Z0 + 0.016, OPEN_Z1 - 0.016
    gxs = [-gx + 0.006, -0.200, 0.0, 0.200, gx - 0.006]
    # HALF-HEIGHT MUST BE UNDER HALF THE PITCH.  The opening got 77 mm shorter when
    # the front end was re-measured, and 18 mm half-height bars on a 31 mm pitch then
    # overlapped each other — eight coplanar face pairs, invisible in a screenshot.
    n_bars = 4
    pitch = (gz1 - gz0) / n_bars
    half = min(0.018, pitch * 0.38)
    for i in range(n_bars):
        z = gz0 + pitch * (i + 0.5)
        _sweep(p, gxs, lambda x, z=z, h=half: [(0.058, z - h), (0.058, z + h),
                                               (0.020, z + h * 0.84), (0.020, z - h * 0.84)],
               "RangerChrome")
    # GRILLE SURROUND UPRIGHTS, and their OUTER edge leans with the lamp.
    #
    # Owner, 2026-09-06: "wherever there's a dark background behind the headlight, make
    # sure it matches the headlights profile".  The dark is the backing panel, seen
    # through the gap between the lamp and whatever bounds the aperture beside it — and
    # the moment the cluster's inboard end gained its lean, that gap stopped being a
    # constant-width bezel and opened into a triangle toward the hood.  Leaning this
    # edge by the SAME LAMP_LEAN_IN closes it back to a parallel shut line.
    #
    # Only the outer edge moves.  The inner one stays at gx because the grille bars die
    # into it, and widening the surround there would open a second gap behind them.
    # It cannot be a _sweep(): that lays sections along x, and this needs x to be a
    # function of z.  The reference has the same shape — its grille is visibly wider at
    # the top than at the bottom.
    for sx in (1, -1):
        prof = ((0.060, OPEN_Z0), (0.060, OPEN_Z1), (0.004, OPEN_Z1), (0.004, OPEN_Z0))
        rings = []
        for out in (0.0, 1.0):
            ring = []
            for dy, z in prof:
                t = (z - OPEN_Z0) / (OPEN_Z1 - OPEN_Z0)
                x = gx + out * (0.022 + LAMP_LEAN_IN * t)
                ring.append((sx * x, nose_y(x, z) - dy, z))
            rings.append(ring)
        loft(p, rings, "RangerPaint")

    # ONE CLUSTER, ONE LOFT (2026-09-05).
    #
    # This has now been wrong three ways in a row, and every time the fault was the
    # same: the lamp was built as SEPARATE BODIES that had to be made to agree.
    # First a swept lens in the aperture plus a lofted wrap round the corner — "its
    # also clear they're a different body than the front indicator light surface".
    # Merging those two left the headlamp still on its own sweep, its own profile and
    # its own depth, so the clear-to-amber join was a STEP rather than a divider, and
    # the amber sat proud on the corner instead of in it.  On the reference the whole
    # cluster is ONE moulded assembly: one outline, one lens plane, and the amber is
    # simply where that surface stops being clear.
    #
    # So it is one loft now — grille surround, across the front face, round the corner
    # onto the fender — and the clear/amber divider is a BAND MATERIAL change part way
    # along it.  Flat shading draws that edge for free, exactly as it does on the tail
    # lamps.  There is no join left to misalign: one z schedule gives one top edge and
    # one bottom edge across the whole unit, and one face schedule gives one plane.
    #
    # The path stations still come from the RIM RINGS past the aperture, because the
    # fender has turned there and a swept surface y = f(x) cannot describe it — see
    # the note on ring_flank().  Every knee of the blend is a station: the rim is
    # convex in plan, so a chord across two of its rings lies INSIDE the metal and the
    # skin pokes out through the lens.
    NOSE_LAMP_BACK = 0.026           # how far the section sits BEHIND its own face.
                                     # Relative, not absolute: the face itself travels
                                     # 34 mm from recessed to proud along the path, and
                                     # a fixed back plane collapsed the section at the
                                     # inboard end where the two met.
    FACE_X = (0.422, 0.500, 0.575, OPEN_X_TOP, OPEN_X)
    N_FACE = len(FACE_X)             # stations on the nose face, before the corner
    N_CLEAR = 3                      # ...and how many BANDS of it are the headlamp.
                                     # THE DIVIDER LANDS ON OPEN_X_TOP, so the amber
                                     # gets 38 mm of front face and everything else is
                                     # round the corner.  Measured off the reference
                                     # front shot, the amber is only ~15% of the
                                     # cluster's projected width — it reads big in a
                                     # three-quarter view because that is where the
                                     # wrap faces the camera, and putting the divider
                                     # where the three-quarter view suggests made the
                                     # front view 38% orange.
    # Face offset along the outward normal, per station.  NEGATIVE is recessed into
    # the aperture, positive is proud on sheet metal.  ONE ramp for the whole cluster
    # is the point of this rework: the headlamp is deep in a hole at the grille and
    # the lamp is flush with the fender at the corner, and everything between is
    # interpolated rather than being two schedules meeting at a seam.
    # IT REACHES +0.009 ON THE FENDER, and that is a clearance, not a styling choice.
    # The clip section has a KNEE at Z_HIP where the flank stops going straight up and
    # starts tucking toward the shoulder — that is the body's widest point.  The lens
    # samples its own height at five fixed fractions, so between two of them it chords
    # STRAIGHT ACROSS that knee, measured 3.7 mm inside the metal at the worst station.
    # At 4 mm the fender came out through the lens as a red splinter.  9 mm clears it
    # with margin and still reads flush; a real lens stands off its wing about that.
    NOSE_LAMP_FACE = (-0.030, -0.028, -0.024, -0.012, 0.002,
                      0.009, 0.009, 0.009, 0.009, 0.009)
    # Convex apex added to the face at mid height.  The owner's note from 2026-09-04
    # stands — "the headlights are smooth curved objects, not rectangles" — so the
    # clear end keeps a real bulge; it fades out round the corner, where the lens is
    # following the fender's curvature instead of its own.
    NOSE_LAMP_BULGE = (0.022, 0.022, 0.020, 0.012, 0.006,
                       0.004, 0.002, 0.0, 0.0, 0.0)
    # How much of the lamp's height is eaten per station as it dies onto the flank,
    # and 66% of that comes off the BOTTOM: on the reference the top edge runs level
    # with the hood line right round the corner while the lower edge lifts away.  ZERO
    # across every front-face station — that whole stretch is the single rectangle
    # with one top edge that the reference cluster is.
    # THERE IS NO TAPER.  The lamp is a constant 202 mm from the grille to the point it
    # dies on the flank, and it ends on a flat bezelled cap rather than running out to
    # a point.
    #
    # It took three passes to get here because the taper was retreating rather than
    # going: first it started at the aperture edge, then at the first rim ring, and each
    # time it was pushed further outboard the remaining wedge simply moved to wherever
    # the next view looked from.  The last one only showed in a SIDE view, because by
    # then the only tapered stations left were the ones on the flank — which is
    # precisely what a side view is made of.  Owner, 2026-09-06: "still clearly tapering
    # down from a side view".  A lens that is square from every angle has no taper
    # anywhere; there was no number to tune, only a feature to delete.
    #
    # AND WATCH THE MEASUREMENT, NOT THE SCREEN, when judging this one.  In a
    # three-quarter view the lamp's outboard end is nearer the camera and its top edge
    # sits above the eye, so a true rectangle still PROJECTS raked and reads as a wedge.
    # Check the height at each station instead — it is 202 mm at all ten.
    # THE ASSEMBLY IS A TRAPEZOID IN ELEVATION — its base is longer than its top, at
    # BOTH ends (owner, 2026-09-06: "pull the upper inside corner on the front out a
    # little bit", "push the side upper corner forwards a tiny bit.  so the 'base' edges
    # are longer than the top edges on the headlight assy").  The reference has it at
    # both: the grille surround is wider at the top, so the cluster's inboard edge leans
    # out as it rises; and on the fender the amber's trailing edge rakes forward.
    #
    # It is a displacement ALONG THE PATH TANGENT, scaled by height — positive is toward
    # the outboard end of the path.  So the inboard station takes a POSITIVE lean (its
    # top pulls outboard, shortening the top edge) and the flank station a NEGATIVE one
    # (its top pulls forward).  Only the two END stations lean; everything between keeps
    # its plan position, so what slants is the pair of end faces and nothing else.
    NOSE_LAMP_LEAN = (LAMP_LEAN_IN, 0.0, 0.0, 0.0, 0.0,
                      0.0, 0.0, 0.0, 0.0, -0.014)
    # ROUND ON THE TOP OUTER CORNER (owner, 2026-09-06).  This is the one place the lens
    # is allowed to lose height, and it is a corner radius, not the taper that was
    # deleted: it comes off the TOP EDGE ONLY, starts outboard of the aperture, and the
    # base stays dead flat the whole way — so it cannot read as a wedge from any angle.
    # It grows to the end, which rounds the corner in the front view where the lens turns
    # AND at the trailing edge on the fender, the two places the reference shows a
    # radius.  If this ever starts reading as a taper again, it has crept inboard of
    # station 5; that is the line it must not cross.
    NOSE_LAMP_ROUND = (0.0, 0.0, 0.0, 0.0, 0.0,
                       0.004, 0.010, 0.016, 0.024, 0.034)
    LAMP_REVEAL = 0.008              # the shadow gap between the frame's edge and the
                                     # lens.  NOT a free number: the nose aperture
                                     # already has exactly this gap (the lamp's section
                                     # runs z0w = OPEN_Z0 + 0.008 to OPEN_Z1 - 0.008
                                     # inside a hole cut at OPEN_Z0..OPEN_Z1), and the
                                     # fender reveal has to be the same width or the
                                     # cutout visibly changes section at the corner.
    NOSE_LAMP_TAIL = 0.035           # how far back along the STRAIGHT fender the lamp
                                     # runs past the rim blend.  60 mm off IMG_0879
                                     # originally — the reference amber shows ~135 mm from
                                     # the side and the rim is only 84 mm deep — pulled to
                                     # 35 on 2026-09-07 ("pull the rear edges of the
                                     # ambers forward a little"), leaving ~112 mm.  This
                                     # is the ONLY station it moves: everything ahead of
                                     # it is pinned to a rim ring, so shortening the lamp
                                     # never disturbs the corner it wraps.

    def head_lamp(sx):
        z0w = OPEN_Z0 + 0.008

        def station(i, z):
            """Plan position of the skin at path station i, AT ITS OWN HEIGHT z.

            Solving per height rather than once at mid height is what keeps the lens
            ON the skin: the nose rolls back as it climbs, and a section extruded
            straight from a mid-height path ends up ~10 mm behind the panel at its
            top — the fault tail_lamp() carries its lean delta to avoid.
            """
            if i < N_FACE:
                return (sx * FACE_X[i], nose_y(FACE_X[i], z))
            j = i - N_FACE
            if j < len(NOSE_RIM):
                x, y = ring_flank(nose_rim_ring(NOSE_RIM[-1 - j]), z)
            else:
                # ...then the base station where the blend ends, and one more on the
                # STRAIGHT fender behind it.  Without that last one the lamp has
                # nowhere to die and stops dead on the corner as a wedge — the rim is
                # only 84 mm deep and the reference lamp shows 135 from the side.
                yb = CLIP_ST[0][0] - NOSE_LAMP_TAIL * (j - len(NOSE_RIM))
                x, y = ring_flank(clip_ring(yb), z)
            return (sx * abs(x), y)

        n = N_FACE + len(NOSE_RIM) + 2      # face, every rim ring, base, flank
        for sched in (NOSE_LAMP_FACE, NOSE_LAMP_BULGE, NOSE_LAMP_LEAN,
                      NOSE_LAMP_ROUND):
            assert len(sched) == n, "one entry per path station"
        zm = 0.5 * (z0w + OPEN_Z1 - 0.008)
        path = [station(i, zm) for i in range(n)]
        rings = []
        edges = []                       # reveal geometry per station — see below
        for i in range(n):
            # Outward normal = the plan tangent turned a quarter turn, taken from the
            # NEIGHBOURS so consecutive sections share it and the sweep cannot kink.
            # It points +y (forward) along the nose face and swings to +x (outboard)
            # as the path turns back down the flank.  sx flips the turn with the side.
            a, b = path[max(0, i - 1)], path[min(n - 1, i + 1)]
            tx, ty = b[0] - a[0], b[1] - a[1]
            L = math.hypot(tx, ty) or 1.0
            nx, ny = -sx * ty / L, sx * tx / L
            ux, uy = tx / L, ty / L                      # unit tangent, for the lean
            # ONE floor for every station, clear lens and amber alike — that is the
            # whole of "square", and the floor never varies.  The ceiling only comes
            # down for the corner radius, and only outboard of the aperture.
            z0, z1 = z0w, OPEN_Z1 - 0.008 - NOSE_LAMP_ROUND[i]
            h, off, bul = z1 - z0, NOSE_LAMP_FACE[i], NOSE_LAMP_BULGE[i]
            lean = NOSE_LAMP_LEAN[i]

            def at(o, u, i=i, nx=nx, ny=ny, ux=ux, uy=uy, z0=z0, h=h, lean=lean):
                z = z0 + h * u
                bx, by = station(i, z)
                d = lean * u                             # zero at the base, full at the top
                return (bx + nx * o + ux * d, by + ny * o + uy * d, z)
            ring = [at(off - NOSE_LAMP_BACK, 0.0), at(off, 0.06),
                    at(off + bul, 0.5), at(off, 0.94),
                    at(off - NOSE_LAMP_BACK, 1.0)]
            rings.append(ring)
            # Offset 0 IS the skin, and u is allowed outside [0, 1] on purpose: it
            # extrapolates the section's own z ramp AND its lean together, so the
            # reveal keeps a constant width against a leaning end face instead of
            # opening up at the top corner.
            ub, ut = -LAMP_REVEAL / h, 1.0 + LAMP_REVEAL / h
            edges.append((ring[1], ring[3], at(0.0, ub), at(0.0, ut), (ux, uy)))
        # The divider is a band material, not a body boundary — see the note above.
        def lens_mat(seg, _k):
            return "RangerLens" if seg < N_CLEAR else "RangerAmber"
        # Both caps are bezel-dark: the inboard one butts the grille surround, the
        # outboard one is where the lens dies on the fender.
        loft(p, rings, "RangerLens", band_mats=lens_mat,
             cap_first_mat=DARK, cap_last_mat=DARK)

        # THE CUTOUT CONTINUES ONTO THE FENDER (owner, 2026-09-07: "continue that
        # cutout around on the fender so it frames the entire light cluster").
        #
        # On the nose the cluster sits in a real opening: frame() cuts the hole, and
        # the 8 mm of nothing between the frame's inner edge and the lens is what
        # reads as a cutout.  Outboard of station N_FACE-1 the frame stops — the nose
        # cap has run out of nose — and the lamp simply carries on across the fender
        # standing 9 mm proud of it, which is a lamp GLUED ON, not one let in.
        #
        # This is that 8 mm continued.  A ribbon from the lens's own silhouette edge
        # back down to the skin, dark, so the eye reads a shadow gap all the way round
        # and the paint outboard of it becomes the frame.  It is a WALL, not a flat
        # strip lying on the fender: a strip would be coplanar with the skin and
        # z-fight it under engine lighting.
        #
        # It starts at N_FACE-1, where the aperture's outer edge is, and the seam is
        # exact rather than close — at that station the ribbon's outer edge solves to
        # (OPEN_X, nose_y, OPEN_Z0) and (OPEN_X, nose_y, OPEN_Z1), which are the
        # frame's own inner corners.  So the two hand off with no step, and the
        # ribbon's depth grows from ~2 mm there to the full 9 mm on the flank exactly
        # as NOSE_LAMP_FACE ramps the lens out of its hole.
        #
        # The top edge follows NOSE_LAMP_ROUND down, so the frame rounds the cluster's
        # top outer corner WITH the lens instead of cutting across it.
        for i in range(N_FACE - 1, n - 1):
            lb0, lt0, sb0, st0, _ = edges[i]
            lb1, lt1, sb1, st1, _ = edges[i + 1]
            oriented_quad(p, sb0, sb1, lb1, lb0, DARK, (0.0, 0.0, -1.0))
            oriented_quad(p, st0, st1, lt1, lt0, DARK, (0.0, 0.0, 1.0))
        lb, lt, sb, st, (ux, uy) = edges[n - 1]
        oriented_quad(p, sb, st, lt, lb, DARK, (ux, uy, 0.0))

    for sx in (1, -1):
        head_lamp(sx)

    # THE FRONT BUMPER IS ONE PART AND IT IS THE FRONT'S LOWEST THING (2026-09-06).
    #
    # There used to be a slim chrome blade with a separate grey air dam under it, and
    # the two never agreed: whichever one moved, the other left a strip of painted
    # fender showing between them or between itself and the arch.  Owner's ruling, when
    # asked what should fill that corner: "nothing.  i was going to ask you to delete
    # the grey air dam alltogether.  bumper is the [lowest] part... ok the bumper is top
    # chrome and bottom grey plastic but our bumper is fully chrome and im cool w that".
    # So the dam is gone and the blade now runs all the way down to where the dam's
    # bottom edge was — one part, one material, nothing to disagree with.
    #
    # It keeps its OWN height though — see bump_z0().  Taking over the dam's job is not
    # the same as taking over its dimensions.
    #
    # THE PLAN CURVE IS THE BODY'S OWN, offset forward by a constant, and PINNED at the
    # centreline: the crown has to land exactly on Y_NOSE, because Y_NOSE is the truck's
    # front extent and report() asserts the overall length against the physics preset.
    # corner_y() answers where the metal actually is, inside the rim and past it.  The
    # owner's "red wedges" have come back four times, every one of them something in
    # front of the fender placed by a hand-typed curve instead of the body's own.
    #
    # IT REACHES THE ARCH.  The last station is 8 mm OUTBOARD of the fender with its
    # plan CLAMPED to corner_y()'s knee at VAL_KNEE_X — CLIP_PLAN's first breakpoint,
    # where the curve bends at the arch tangent.  Two faults, one station: a chord from
    # 0.790 straight to 0.828 cut across that bend and landed on the same y as the sheet
    # metal to the millimetre, so the fender won; and putting the station exactly ON the
    # knee fixed the y but broke the x, because the fender's own half-width there IS
    # 0.824 and the end cap then sits edge-on against the metal it is meant to hide.
    ZBM = 0.5 * (Z_BUMP0 + Z_BUMP1)
    xs = [-0.832, -0.806, -0.770, -0.700, -0.560, -0.300, 0.0,
          0.300, 0.560, 0.700, 0.770, 0.806, 0.832]

    def bump_plan(x, z):
        return corner_y(math.copysign(min(abs(x), VAL_KNEE_X), x), z)

    BUMP_PIN = Y_NOSE - bump_plan(0.0, ZBM)    # the blade's standoff
    dys = [Y_NOSE - (bump_plan(x, ZBM) + BUMP_PIN) for x in xs]

    def bump_z0(x):
        """The bumper's lower edge: flat across the middle, sweeping DOWN toward the arch
        over the outer stations — quadratic, so it leaves the flat run tangentially
        instead of kinking at BUMP_FLARE_X.

        THIS IS NOT THE DELETED AIR DAM'S BOTTOM.  When the dam was merged in, this was
        briefly set to the dam's lower edge, 190 mm further down, and the bumper grew from
        207 to 397 mm tall — owner: "the bumper grew to be super tall".  Merging
        the dam meant taking over its JOB (being the front's lowest part in the places it
        covered), not its dimensions.
        """
        t = min(1.0, max(0.0, (abs(x) - BUMP_FLARE_X) / (0.820 - BUMP_FLARE_X)))
        return Z_BUMP0 - BUMP_FLARE * t * t

    # WHERE THE ARCH IS AT THE BUMPER'S TOP LINE.  The opening is a circle of ARCH_R
    # about (AX_F, ARCH_Z), so this is simply that circle solved at z = Z_BUMP1.  Solved
    # rather than typed: the bumper's top has moved three times and the arch's radius
    # once, and a hand-copied 1.6385 would have gone stale at the first of them.
    Y_ARCH_TOP = AX_F + math.sqrt(max(0.0, ARCH_R ** 2 - (Z_BUMP1 - ARCH_Z) ** 2))

    def bump_back(x, yf):
        """y of the section's TOP-REAR corner: the flat 104 mm return across the middle,
        reaching the ARCH ITSELF at the tips.

        Owner, 2026-09-06: "pull the top corners of the bumper back to meet the wheel
        arch ... the bumper should complete the arch as in the reference".  The rear cap
        used to stop square at yf - 0.104, which at the outermost station is y 1.7315 —
        93 mm short of the opening — so a dark wedge of arch showed between the bumper
        and the fender's cut edge.  Pulling only the TOP back makes the rear face slant,
        and that slant IS the arch's leading edge: it runs from y 1.7315 at the bumper's
        lower corner to Y_ARCH_TOP at its upper one, which is within a few mm of the
        circle the whole way.

        It cannot foul the tyre.  The opening is ARCH_R (0.470) where the tyre is only
        0.368, so anything that tracks the arch clears the rubber by ~150 mm at this
        height — that margin is the arch's whole reason for being bigger than the wheel.
        """
        t = min(1.0, max(0.0, (abs(x) - BUMP_FLARE_X) / (0.820 - BUMP_FLARE_X)))
        back = yf - 0.104
        return back + (Y_ARCH_TOP - back) * t * t

    def bprof(x, dy):
        yf = Y_NOSE - dy                       # this station's own front plane
        z0 = bump_z0(x)
        zm = 0.5 * (z0 + Z_BUMP1)              # the crown rides the station's own middle
        # The 0.006 / 0.026 / 0.024 offsets are ROLL RADII, not fractions of the height —
        # they stay put as the section grows, or the rolled edges scale with it and the
        # bumper stops reading as folded steel of one gauge.
        return [(x, yf - 0.104, z0), (x, yf - 0.040, z0 - 0.006),
                (x, yf - 0.008, z0 + 0.026), (x, yf, zm),
                (x, yf - 0.010, Z_BUMP1 - 0.024), (x, yf - 0.044, Z_BUMP1),
                (x, bump_back(x, yf), Z_BUMP1)]
    loft(p, [bprof(x, dy) for x, dy in zip(xs, dys)], "RangerChrome")

    # DARK BAND UNDER THE BUMPER, on the centre section only.
    #
    # The bumper is the front's lowest part everywhere the FENDER used to be, because
    # clip_ring cuts the flank to Z_BUMP1 forward of the arch.  It is not the lowest
    # thing on the CENTRELINE though: the underbody pan reaches down to Z_UNDER for
    # |x| <= W_UNDER, and the nose frame's paint runs down over it.  With the air dam
    # deleted that paint is what shows under the chrome, in body colour — on the
    # reference that band is shadow and black plastic.
    #
    # It stops at W_UNDER because that is where the pan stops; outboard of it there is
    # nothing to cover, the fender having already been cut away.
    _sweep(p, [-0.560, -0.300, 0.0, 0.300, 0.560],
           lambda x: [(-0.010, 0.432), (-0.010, Z_BUMP0 + 0.006),
                      (0.014, Z_BUMP0 + 0.006), (0.014, 0.432)], DARK)

    # Licence-plate bracket, dead centre on the BUMPER'S OWN FACE (as on the ref car).
    # It used to hang off the air dam; with the dam merged into the bumper its datum is
    # the bumper, and the bumper's face is the loft's crown — Y_NOSE on the centreline.
    # Read from there, never typed as an offset from Y_FACE_C: the sheet metal's apex is
    # 0.88 m up and a constant taken there sits ~70 mm ahead of the panel down at plate
    # height, which is how the bracket came to be floating in the first place.
    # IT MUST NOT OWN Y_NOSE.  The bumper's crown does — report() asserts the overall
    # length against the physics preset and Y_NOSE is the truck's front extent — so the
    # bracket stops 2 mm short of it, which still leaves it a couple of millimetres proud
    # of the bumper's own face down at plate height (the section has rolled back ~4 mm
    # from the crown by then).  This is the opposite of the REAR plate, where the plate
    # deliberately owns Y_TAIL because a flat panel reads better there than a curve.
    # It sits JUST BELOW THE CROWN, never across it.  The bumper's face is convex, so
    # the crown is its frontmost line and anything flat spanning it is proud at one end
    # and buried at the other — it came out as a notch rather than a plate.  Between the
    # lower edge and the crown the face has rolled back 4..8 mm, which a flat bracket
    # clears evenly.  (It used to hang off the air dam, which was flat and made this
    # easy; with the dam gone there is no flat panel down here to mount it on.)
    zb0, zb1 = Z_BUMP0 + 0.015, Z_BUMP0 + 0.085
    box(p, -0.150, 0.150, Y_NOSE - 0.020, Y_NOSE - 0.002, zb0, zb1, DARK)


# ---------------------------------------------------------------------------
# REAR END
# ---------------------------------------------------------------------------
def build_rear_end(p):
    """The tail.  Owner, 2026-08-26: "the back is just far too planar right now."

    Three things were wrong and all three are measurable off IMG_0873:
      1. the step bumper stood only 33 mm proud of the tailgate; the real one stands
         **111 mm** proud, which is the whole reason a pickup's tail has depth;
      2. it sat too high, closing the gap under the tailgate — on the real truck
         there is a 150 mm dark slot between the tailgate bottom (0.696) and the
         bumper top (0.539), and that slot is most of what reads as "not a slab";
      3. the bed's rear corners met the tailgate at a hard 90 degrees.  They now get
         the same trick the nose got: one shrunk rim ring, so the bedsides turn into
         the tail instead of being cut off by it.
    """
    # Painted panels sit AHEAD of the tailgate plane and INTERPENETRATE the bed
    # loft's rear cap — two solids overlapping is fine, two faces sharing a plane
    # z-fights.
    # 3 mm PROUD of the bed loft's rear cap, which the tail rim ring moved onto
    # exactly this plane — flush, the dark cap and the painted panel z-fight.
    # THE REFACTOR (owner, 2026-09-04: "fix the dark triangle, refactor").
    #
    # The rear wall panels used to be rectangles whose width and height were derived
    # from the rim's CONSTANTS.  That is one step better than typing them, but still
    # a reconstruction: the rim's actual outline is a tucked, chamfered, leaning
    # polygon, and a rectangle approximating it left a dark triangle at each top
    # corner.  Every offset I added chased the error around rather than removing it.
    #
    # They now take their outline from the RIM RING ITSELF, point-for-point.  The
    # panel's outer edge IS the ring's outer-skin arc — same x, same y, same z — so
    # it cannot disagree with the bed it closes off, whatever the rim does next.
    ring = tail_rim_ring(TAIL_RIM[-1], bed_ring(Y_BED_R))
    n = len(ring)
    Z_P0 = 0.690
    Z_P1 = ring[BED_I_RAIL_IN][2]        # the rail, as the rim actually left it
    def ring_pt(i, sx):
        """Ring point i on side sx.  The ring's right half is 0..n//2; a left-hand
        point is its mirror, so read the right one and negate x — that keeps both
        panels driven by the SAME arc rather than two independently indexed ones."""
        x, y, z = ring[i]
        return (sx * abs(x), y, z)

    # THE REAR FACE IS NOT BUILT HERE ANY MORE (2026-09-05).  It used to be a solid
    # laid over the bed's rear opening — first a prism, then a rib loft — and the
    # owner's verdict on the second one was that it still read as what it was: "the
    # bedside end caps are jarring because theyre still subtly visibly caps.  can we
    # merge them into the bedsides?"  They are merged: TAIL_RIM's last ring carries
    # the outer arc in to the shut line, so the rear face is the bed loft's own last
    # band.  What is left down here is only what genuinely is not bedside — the
    # tailgate, the shadow slot behind it, and the lamps let into the corner.
    TG_X = TAIL_SHUT_X - TAIL_SHUT                 # the tailgate's own edge
    TAIL_SET = 0.004            # how far the gate stands off tail_y().  Small, because
                                # the bedside beside it now IS tail_y() and a step at
                                # the shut line is exactly what this whole rework was
                                # about — but not zero: the bed loft's rear cap is
                                # painted and sits on that surface too, and flush the
                                # two z-fight.
    # THE GATE IS SUBDIVIDED ON THE BEDSIDE'S OWN HEIGHTS.  Two panels sharing a shut
    # line have to share their subdivision or the leaned surface facets differently
    # either side of the gap and the line kinks; the gate used to carry hand-typed z
    # stations for exactly that reason.
    TG_Z = [Z_P0] + [ring[i][2] for i in BED_I_ARC if ring[i][2] > Z_P0 + 0.030]
    assert abs(Z_RBUMP0 - ring[BED_I_SILL][2]) < 0.004, \
        "step bumper's lower edge must land on the bedside's sill where it terminates"

    # THE SHADOW SLOT IS THE BED'S OWN REAR CAP, and it is dark again (2026-09-05).
    #
    # There is a gap between the tailgate's bottom edge and the step bumper's top
    # face, and on the reference truck it reads black — it is most of what stops the
    # tail looking like a slab.  That used to be the cap's job, then the cap had to
    # be PAINTED because its triangulation chorded in front of the separate rear
    # panel and showed as a grey wedge above the lamps, and the slot had to be faked
    # with two hand-placed plates instead.
    #
    # With the rear face merged into the bedside there is no panel left for the cap
    # to spoil: its outline now stops AT the shut line, so it cannot appear outboard
    # of it at all, and everything inboard is behind the tailgate.  Measured on a
    # 2000-ray grid, the only places it is visible are the shut line itself and the
    # slot under the gate — which is exactly where a dark interior belongs.  Both
    # plates deleted; the cap is the backstop it was always meant to be.

    # TAILGATE.  It spans the aperture between the bedsides, ON THE TAIL SURFACE like
    # everything else back here, and on the SAME z stations they are — see TG_Z.
    #
    # It used to be anchored to the RAIL and pushed BACK by the lean everywhere below
    # it, which bulged it 48 mm behind the tailgate plane at mid height and quietly
    # ate nearly half of the step bumper's 111 mm of protrusion — the one number this
    # whole tail was rebuilt around.
    #
    # THREE STATIONS ACROSS, not two, so the face carries TAIL_PROW.  A gate that is
    # flat across while the bedsides either side of it round forward is precisely the
    # "not following the body lines" the owner called out.
    tg_x = TG_X
    TG_T = 0.050                                  # panel thickness, on the surface
    tg = []
    for z in TG_Z:
        def gy(x, z=z):
            return tail_y(x, z) - TAIL_SET
        tg.append([(-tg_x, gy(tg_x), z), (0.0, gy(0.0), z), (tg_x, gy(tg_x), z),
                   (tg_x, gy(tg_x) + TG_T, z), (0.0, gy(0.0) + TG_T, z),
                   (-tg_x, gy(tg_x) + TG_T, z)])
    loft(p, tg, "RangerPaint")

    # Tail lamps — see the note above tail_skin_path().  They wrap the bed's rear
    # corner and die on the flank, so there is no separate bezel box: the dark
    # returns at the top and bottom of the swept section ARE the bezel.
    for sx in (1, -1):
        tail_lamp(p, sx)

    # STEP BUMPER.  Nine-point section — rolled top, convex face, tuck under, and a
    # deep return back to its mounting plane at the tailgate.  111 mm of protrusion
    # is the point; anything less and the tail is a wall with a stripe on it.
    bxs = [-0.818, -0.756, -0.430, 0.0, 0.430, 0.756, 0.818]
    bdy = [0.070, 0.030, 0.004, 0.0, 0.004, 0.030, 0.070]
    # The bumper crown stops 14 mm SHORT of Y_TAIL so the licence plate can be the
    # rearmost thing and still sit proud of the convex face.  Y_TAIL is the hard
    # length limit; something has to own it, and a flat plate reads better there
    # than a curved surface that the plate then has to be buried in.
    YB = Y_TAIL + 0.014
    D = Y_TAILGATE - YB                           # 0.097 — the section's own depth
    ZRM = 0.5 * (Z_RBUMP0 + Z_RBUMP1)

    def rprof(x, dy):
        yb = YB + dy                              # this station's own rear plane
        return [(x, yb + D, Z_RBUMP0), (x, yb + 0.052, Z_RBUMP0 - 0.012),
                (x, yb + 0.014, Z_RBUMP0 + 0.024), (x, yb, ZRM - 0.020),
                (x, yb + 0.002, ZRM + 0.024), (x, yb + 0.020, Z_RBUMP1 - 0.020),
                (x, yb + 0.056, Z_RBUMP1), (x, yb + D, Z_RBUMP1)]
    loft(p, [rprof(x, dy) for x, dy in zip(bxs, bdy)], "RangerTrim")
    for sx in (1, -1):                            # tread pads let into the top face
        box(p, sx * 0.098, sx * 0.336, Y_TAIL + 0.040, Y_TAIL + 0.104,
            Z_RBUMP1 - 0.008, Z_RBUMP1 + 0.014, DARK)
    # Licence plate, PROUD of the bumper crown (which sits at Y_TAIL on the
    # centreline) — buried inside the convex face it showed only as a white diamond.
    box(p, -0.150, 0.150, Y_TAIL, Y_TAIL + 0.018, Z_RBUMP0 + 0.034,
        Z_RBUMP0 + 0.148, "RangerLens")

    # Exhaust tip, right rear, exiting BELOW the bumper so it is actually visible.
    tube(p, (0.470, -2.020, 0.330), (0.470, -2.470, 0.312), 0.038, 6, "RangerTrim")
    # Mud flaps, nearly as wide as the tyre.
    for sx in (1, -1):
        # Top at 0.436, not 0.442: the bedside sill is exactly 0.442 there and the
        # two faces were coplanar.
        box(p, sx * 0.590, sx * 0.816, -2.132, -2.100, 0.108, 0.436, "RangerTrim")


# ---------------------------------------------------------------------------
# EXTERIOR TRIM
# ---------------------------------------------------------------------------
# The root must sit ON THE DOOR SKIN, i.e. AT OR BELOW the beltline — above it
# there is no body, only glass, and the first placement left the head hanging in
# mid-air beside the A-pillar with a visible gap.
MIRROR_AT = (0.776, 0.398, 1.146)   # sail-mount root on the door skin


def build_mirror(p, sx):
    """The early-2000s soft-lozenge mirror head, not a rectangular prism.

    Owner, 2026-08-25: "they should have that early 2000s soft lobby shape".  Two
    things make that read at low poly, and the first pass had neither:
      - the head is a LOZENGE in plan and in elevation — its outboard face is
        smaller than its inboard one and every corner is cut, so the silhouette has
        eight sides rather than four;
      - it hangs off a triangular SAIL mount, not a round stalk, which is what
        actually reads as "1990s truck mirror" from twenty metres.
    """
    X0, Y0, Z0 = sx * MIRROR_AT[0], MIRROR_AT[1], MIRROR_AT[2]
    # Sail mount: a wedge that is WIDE where it meets the door and narrows as it
    # rises outboard — the triangular silhouette is what reads as a 1990s truck
    # mirror from twenty metres, far more than the head shape does.
    hexa(p, [(X0, Y0 + 0.070, Z0 - 0.026), (X0, Y0 - 0.070, Z0 - 0.026),
             (X0, Y0 - 0.070, Z0 + 0.086), (X0, Y0 + 0.070, Z0 + 0.086),
             (X0 + sx * 0.052, Y0 + 0.028, Z0 + 0.052),
             (X0 + sx * 0.052, Y0 - 0.034, Z0 + 0.052),
             (X0 + sx * 0.052, Y0 - 0.034, Z0 + 0.108),
             (X0 + sx * 0.052, Y0 + 0.028, Z0 + 0.108)], "RangerTrim")
    # Head: swept along X as three rings, each an octagonal lozenge in the y-z
    # plane, widest in the middle.  The corner cuts are what soften it.
    def lozenge(hy, hz, cy, cz, cut):
        return [(cy + hy, cz - hz + cut), (cy + hy - cut, cz - hz),
                (cy - hy + cut, cz - hz), (cy - hy, cz - hz + cut),
                (cy - hy, cz + hz - cut), (cy - hy + cut, cz + hz),
                (cy + hy - cut, cz + hz), (cy + hy, cz + hz - cut)]
    cy, cz = Y0 - 0.006, Z0 + 0.082
    rings = []
    for dx, s in ((0.046, 0.84), (0.112, 1.00), (0.168, 0.88)):
        hy, hz = 0.080 * s, 0.058 * s
        rings.append([(X0 + sx * dx, y, z) for y, z in lozenge(hy, hz, cy, cz, 0.024 * s)])
    loft(p, rings, "RangerTrim")


def build_trim(p):
    for sx in (1, -1):
        build_mirror(p, sx)
        # Door handle, and the shut line that says there IS a door.
        box(p, sx * 0.796, sx * 0.822, -0.170, -0.038, 1.062, 1.100, "RangerTrim")
        box(p, sx * 0.800, sx * 0.812, -0.626, 0.556, 0.860, 0.874, DARK)

    # Cowl: the black plenum strip at the base of the windscreen, plus two wipers.
    # Without it the glass runs straight into the hood and the nose reads unfinished.
    box(p, -0.672, 0.672, Y_COWL - 0.006, Y_COWL + 0.062, 1.158, 1.186, DARK)
    for x in (-0.402, 0.128):
        strut(p, (x, Y_COWL + 0.030, 1.188), (x + 0.300, Y_COWL + 0.018, 1.196),
              0.020, 0.014, "RangerTrim")

    # Antenna mast on the right front fender — 8 tris, and unmistakable in profile.
    tube(p, (0.782, 1.020, 1.118), (0.812, 1.002, 1.928), 0.011, 4, "RangerTrim")


# ---------------------------------------------------------------------------
# INTERIOR — the cockpit camera's reason to exist.
# Read through glass against a bright flank, only the VALUE gap survives, so the
# whole tub is near-black and the seats are the one thing lifted off it.
# ---------------------------------------------------------------------------
def build_interior(p):
    # Transmission tunnel down the centre of the floor.
    # Everything standing ON the cab floor starts 8 mm above it.  Sharing the plane
    # exactly puts a coincident face pair under each fitting.
    hexa(p, [(-W_TUNNEL, -0.520, Z_FLOOR + 0.008), (W_TUNNEL, -0.520, Z_FLOOR + 0.008),
             (W_TUNNEL, Y_COWL, Z_FLOOR + 0.008), (-W_TUNNEL, Y_COWL, Z_FLOOR + 0.008),
             (-W_TUNNEL + 0.045, -0.520, Z_TUNNEL), (W_TUNNEL - 0.045, -0.520, Z_TUNNEL),
             (W_TUNNEL - 0.045, Y_COWL, Z_TUNNEL + 0.060),
             (-W_TUNNEL + 0.045, Y_COWL, Z_TUNNEL + 0.060)], DARK)

    # Rear cab wall, set 15 mm inboard of the painted panel so the two never z-fight.
    # It stops 12 mm SHORT of the beltline: build_cab()'s rear skin tops out exactly at
    # Z_BELT, and two boxes sharing a top face is the one way an inset can still z-fight.
    # The strip it gives up shows the painted panel behind, which is what a real cab has
    # above the rear trim anyway.
    box(p, -0.692, 0.692, Y_CAB_REAR + 0.015, Y_CAB_REAR + 0.045, Z_FLOOR + 0.008,
        Z_BELT - 0.012, DARK)

    # --- Dash --------------------------------------------------------------
    Y_DASH = 0.322                          # rear edge of the pad
    hexa(p, [(-0.692, Y_DASH, 1.062), (0.692, Y_DASH, 1.062),
             (0.692, Y_COWL, 1.108), (-0.692, Y_COWL, 1.108),
             (-0.692, Y_DASH, 1.118), (0.692, Y_DASH, 1.118),
             (0.692, Y_COWL, 1.172), (-0.692, Y_COWL, 1.172)], DARK)
    # x 0.692, NOT 0.700: the door-card wall is at exactly 0.700 and two coplanar
    # overlapping faces there strobe under engine lighting.
    box(p, -0.692, 0.692, Y_DASH, Y_DASH + 0.030, 0.815, 1.070, DARK)   # dash face
    # Instrument binnacle: a hood over the cluster, driver's side.  The hood has to
    # stand PROUD of the pad or, from the driver's eye point, the whole dash is one
    # featureless slab — which is what the first cockpit render showed.
    hexa(p, [(-0.566, Y_DASH - 0.086, 0.965), (-0.144, Y_DASH - 0.086, 0.965),
             (-0.144, Y_DASH + 0.030, 0.965), (-0.566, Y_DASH + 0.030, 0.965),
             (-0.552, Y_DASH - 0.066, 1.152), (-0.158, Y_DASH - 0.066, 1.152),
             (-0.158, Y_DASH + 0.030, 1.160), (-0.552, Y_DASH + 0.030, 1.160)], DARK)
    # Cluster face, recessed under the hood — two dials and the trip strip.
    box(p, -0.540, -0.170, Y_DASH - 0.044, Y_DASH - 0.030, 0.995, 1.128, "RangerTrim")
    # Centre stack, proud of the dash face, with the radio and heater slots pressed in.
    box(p, -0.135, 0.135, Y_DASH - 0.028, Y_DASH + 0.020, 0.836, 1.078, DARK)
    for z in (0.900, 0.976, 1.036):
        box(p, -0.112, 0.112, Y_DASH - 0.042, Y_DASH - 0.024, z, z + 0.038, "RangerTrim")
    # Glovebox lid on the passenger side, and four vents.
    box(p, 0.190, 0.606, Y_DASH - 0.022, Y_DASH + 0.006, 0.848, 0.986, DARK)
    for x0, x1 in ((-0.680, -0.576), (-0.098, -0.012), (0.012, 0.098), (0.576, 0.680)):
        box(p, x0, x1, Y_DASH - 0.032, Y_DASH - 0.012, 1.086, 1.126, "RangerTrim")
    # Steering column shroud (the wheel itself is a separate, animatable object).
    strut(p, (-0.355, 0.250, 1.019), (-0.355, 0.452, 0.933), 0.086, 0.078, DARK)

    # --- Console + shifter --------------------------------------------------
    hexa(p, [(-0.168, -0.062, Z_TUNNEL - 0.040), (0.168, -0.062, Z_TUNNEL - 0.040),
             (0.168, 0.242, Z_TUNNEL - 0.040), (-0.168, 0.242, Z_TUNNEL - 0.040),
             (-0.150, -0.062, 0.868), (0.150, -0.062, 0.868),
             (0.150, 0.242, 0.842), (-0.150, 0.242, 0.842)], DARK)
    strut(p, (-0.016, 0.104, 0.842), (-0.016, 0.028, 0.986), 0.030, 0.030, DARK)
    box(p, -0.046, 0.014, -0.004, 0.056, 0.982, 1.028, "RangerTrim")     # shift knob

    # --- Seats.  The backs MUST break the beltline or the cabin reads as empty
    # through the glass no matter how good the geometry is (ART-STYLE, the beltline
    # sightline rule learned on winnebago).
    #
    # Both halves are swept as lofts with a CHAMFERED section rather than built as
    # boxes (owner, 2026-08-25: "seats could use a little more rounding").  Eight
    # points instead of four costs 32 tris a seat and buys the bolster roll that
    # says "upholstery" instead of "crate" — worth it on the one asset the player
    # sits next to for hours.
    def seat_section(cx, hw, hh, cy, cz, cut):
        """Vertical slice (x-z at fixed y) — for sweeping the cushion front-to-back."""
        return [(cx - hw + cut, cy, cz - hh), (cx + hw - cut, cy, cz - hh),
                (cx + hw, cy, cz - hh + cut), (cx + hw, cy, cz + hh - cut),
                (cx + hw - cut, cy, cz + hh), (cx - hw + cut, cy, cz + hh),
                (cx - hw, cy, cz + hh - cut), (cx - hw, cy, cz - hh + cut)]

    def seat_section_h(cx, hw, ht, cy, cz, cut):
        """Horizontal slice (x-y at fixed z) — for sweeping the back bottom-to-top."""
        return [(cx - hw + cut, cy - ht, cz), (cx + hw - cut, cy - ht, cz),
                (cx + hw, cy - ht + cut, cz), (cx + hw, cy + ht - cut, cz),
                (cx + hw - cut, cy + ht, cz), (cx - hw + cut, cy + ht, cz),
                (cx - hw, cy + ht - cut, cz), (cx - hw, cy - ht + cut, cz)]

    for sx in (-1, 1):
        cx = sx * SEAT_X
        # Cushion: swept front-to-back, tapering and dropping at the front lip.
        zc = 0.5 * (0.660 + Z_CUSHION)
        hz = 0.5 * (Z_CUSHION - 0.660)
        loft(p, [seat_section(cx, 0.230, hz, -0.420, zc, 0.030),
                 seat_section(cx, 0.232, hz, -0.180, zc, 0.034),
                 seat_section(cx, 0.222, hz * 0.86, 0.020, zc - 0.022, 0.030)],
             "RangerSeat")
        # Back: swept BOTTOM-TO-TOP, so its slices are horizontal (x-y at fixed z),
        # not vertical like the cushion's.  Leans back and narrows into the headrest.
        back = [(-0.424, Z_CUSHION - 0.030, 0.228, 0.056),
                (-0.462, 1.110, 0.226, 0.054),
                (-0.502, Z_SEATBACK - 0.130, 0.214, 0.050),
                (-0.528, Z_SEATBACK - 0.036, 0.176, 0.046),
                (-0.540, Z_SEATBACK, 0.140, 0.038)]
        loft(p, [seat_section_h(cx, hw, ht, cy, cz, 0.026)
                 for cy, cz, hw, ht in back], "RangerSeat")

    # --- Door cards: an armrest and a pull, both proud of the tub wall ---------
    for sx in (1, -1):
        box(p, sx * 0.636, sx * 0.700, -0.196, 0.164, 0.930, 0.984, DARK)
        box(p, sx * 0.660, sx * 0.700, -0.062, 0.108, 1.056, 1.096, "RangerTrim")

    # --- Overhead: mirror and two visors.  Cheap, and they sell the cockpit. ----
    box(p, -0.062, 0.062, -0.086, 0.006, 1.446, 1.500, DARK)
    strut(p, (-0.062, 0.062, 1.470), (-0.062, -0.060, 1.470), 0.026, 0.026, DARK)
    for sx in (1, -1):
        hexa(p, [(sx * 0.130, 0.028, 1.494), (sx * 0.560, 0.028, 1.494),
                 (sx * 0.560, -0.062, 1.494), (sx * 0.130, -0.062, 1.494),
                 (sx * 0.130, 0.052, 1.510), (sx * 0.560, 0.052, 1.510),
                 (sx * 0.560, -0.040, 1.510), (sx * 0.130, -0.040, 1.510)], DARK)


# ---------------------------------------------------------------------------
# STEERING WHEEL — its own object, built in a LOCAL frame whose origin is the hub
# and whose +Z is the column axis, so `wheel.rotation.z = -steer` is all the game
# ever needs.  Its node transform (location + Euler X) carries the placement, and
# transforms are deliberately NOT applied to it on export — applying them would
# move the origin to the world centre and the wheel would orbit the truck.
# ---------------------------------------------------------------------------
def build_steering_wheel():
    p = Part("SteeringWheel")
    seg = SW_SEG
    rings = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        cx, cy = SW_R * math.cos(a), SW_R * math.sin(a)
        ux, uy = math.cos(a), math.sin(a)          # outward, in the wheel plane
        t = SW_TUBE * 0.5
        rings.append([(cx + ux * t, cy + uy * t, t), (cx - ux * t, cy - uy * t, t),
                      (cx - ux * t, cy - uy * t, -t), (cx + ux * t, cy + uy * t, -t)])
    rings.append(rings[0])
    loft(p, rings, DARK, cap_first=False, cap_last=False)

    # Hub + three spokes, the '90s Ford airbag layout: two at 9 and 3, one at 6.
    box(p, -0.062, 0.062, -0.058, 0.058, -0.030, 0.024, DARK)
    for a in (0.0, math.pi, -math.pi / 2):
        strut(p, (0.050 * math.cos(a), 0.050 * math.sin(a), -0.004),
              (SW_R * math.cos(a), SW_R * math.sin(a), -0.004),
              0.038, 0.020, DARK)

    ob = bake(p)
    ob.location = SW_AT
    ob.rotation_euler = (SW_TILT, 0.0, 0.0)
    return ob



# ---------------------------------------------------------------------------
# BLENDER PLUMBING
# ---------------------------------------------------------------------------
def get_material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    col, rough, alpha = MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = col
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = 0.0
    m.diffuse_color = col          # so SOLID viewport shading reads true too
    m.roughness = rough
    # glTF exports doubleSided = not use_backface_culling.  Opaque parts are closed
    # solids, so cull them and let Three.js use its default FrontSide.
    m.use_backface_culling = True
    if alpha < 1.0:
        b.inputs["Alpha"].default_value = alpha
        try:
            m.blend_method = "BLEND"
        except TypeError:
            m.surface_render_method = "BLENDED"
        m.use_backface_culling = False
    return m


def orient_islands(bm):
    """Orient every connected shell outward by SIGNED VOLUME.

    Deliberately WITHOUT a recalc_face_normals pass first: that operator decides
    "outward" per island using an outside-visibility heuristic and gets an island
    wrong when it is partly BURIED inside another — which describes the bed tub
    inside the flank, the firewall inside the cowl and every interior fitting.
    Signed volume has no such ambiguity for a closed shell.

    OPEN islands are left exactly as authored, because their volume is
    origin-dependent and flipping on it is a coin toss.  Every open shell in this
    file (the cab tub, the glass panes, the roof rails) is wound by loft()'s
    virtual-cap volume or by hand, so there is nothing here to fix.
    """
    bm.faces.ensure_lookup_table()
    todo = {f.index for f in bm.faces}
    flipped = skipped = 0
    while todo:
        start = bm.faces[next(iter(todo))]
        island, stack, seen = [], [start], {start.index}
        while stack:
            f = stack.pop()
            island.append(f)
            for e in f.edges:
                for nf in e.link_faces:
                    if nf.index not in seen:
                        seen.add(nf.index)
                        stack.append(nf)
        todo -= seen
        edges = set()
        for f in island:
            for e in f.edges:
                edges.add(e)
        if any(len(e.link_faces) != 2 for e in edges):
            skipped += 1
            continue
        vol = 0.0
        for f in island:
            vs = [v.co for v in f.verts]
            for i in range(1, len(vs) - 1):
                vol += vs[0].dot(vs[i].cross(vs[i + 1]))
        if vol < 0.0:
            bmesh.ops.reverse_faces(bm, faces=island)
            flipped += 1
    return flipped, skipped


def bake(part, weld=True, double_sided=False):
    used = []
    for m in part.m:
        if m not in used:
            used.append(m)
    idx = {n: i for i, n in enumerate(used)}

    me = bpy.data.meshes.new(part.name)
    me.from_pydata(part.v, [], part.f)
    me.update()
    for n in used:
        me.materials.append(get_material(n))
    for i, poly in enumerate(me.polygons):
        poly.material_index = idx[part.m[i]]
        poly.use_smooth = False

    ob = bpy.data.objects.new(part.name, me)
    bpy.context.collection.objects.link(ob)

    if weld:
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        # Degenerate faces are real: every ring carries points that collapse where a
        # feature switches off (the wheelhouse step outside the arch zone), and a
        # zero-area tri still costs a triangle in the export.
        bmesh.ops.dissolve_degenerate(bm, dist=1e-5, edges=bm.edges)
        flipped, skipped = orient_islands(bm)
        if flipped or skipped:
            print(f"  ({flipped} island(s) re-oriented, {skipped} open island(s) left as authored)")
        bm.to_mesh(me)
        bm.free()
        for poly in me.polygons:
            poly.use_smooth = False
    if double_sided:
        for m in me.materials:
            m.use_backface_culling = False
    return ob


def evaluated_tris(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    m = ev.to_mesh()
    m.calc_loop_triangles()
    n = len(m.loop_triangles)
    ev.to_mesh_clear()
    return n


# ---------------------------------------------------------------------------
# GREENHOUSE — pillars, roof slab, and the openings the glass fills.
# The A/C pillars and the roof are CLOSED boxes; orient_islands sorts their winding.
# ---------------------------------------------------------------------------
def strut(part, p0, p1, w, t, mat):
    """Rectangular prism from p0 to p1.  w is measured across X-ish, t along the
    prism's other cross axis.  Used for pillars, the antenna mast and the shifter."""
    import mathutils
    a, b = mathutils.Vector(p0), mathutils.Vector(p1)
    d = (b - a).normalized()
    ref = mathutils.Vector((1, 0, 0))
    if abs(d.dot(ref)) > 0.9:
        ref = mathutils.Vector((0, 1, 0))
    u = ref.cross(d).normalized()      # across the prism
    v = d.cross(u).normalized()
    rings = []
    for c in (a, b):
        rings.append([tuple(c + u * (w * 0.5) + v * (t * 0.5)),
                      tuple(c - u * (w * 0.5) + v * (t * 0.5)),
                      tuple(c - u * (w * 0.5) - v * (t * 0.5)),
                      tuple(c + u * (w * 0.5) - v * (t * 0.5))])
    loft(part, rings, mat)


# Greenhouse key points (right side; x is mirrored for the left).
GH_BELT = 1.192                    # glass sits a hair proud of the sheet-metal belt
# PILLAR TRAP.  The first pass built these at 0.058 x 0.052 and they read as roll-
# cage bars stuck to the outside of the cab.  A window frame is THIN and FLUSH: the
# section is now 0.038 across, and the feet sit inboard of the beltline (0.775) by
# just enough that half the prism's thickness lands back on the body surface.
A_FOOT = (0.744, 0.556, 1.168)     # A-pillar foot, ON the cowl deck.  Sunk below it
                                   # and the prism pokes out through the hood.
A_HEAD = (0.680, 0.089, 1.540)     # A-pillar head, at the roof front corner
C_FOOT = (0.744, -0.622, 1.176)
C_HEAD = (0.680, -0.574, 1.540)
B_FOOT = (0.758, -0.386, 1.184)    # rear quarter division — a real line on the ref car
B_HEAD = (0.690, -0.370, 1.528)


def pillar_frame(foot, head, width, thick, sx):
    """Return (prism_rings, glass_edge_front, glass_edge_rear) for one window pillar.

    THE WAVY-LINE FIX (owner, 2026-08-25: "the A pillar line where the window glass
    meets the pillar should be much straighter and less wavy").  The first pass drew
    the pillar, the windscreen's outboard edge and the door glass's front edge as
    three INDEPENDENT hand-typed lines.  Three lines that are nearly-but-not-quite
    parallel read as a wobble, and no amount of nudging the numbers fixes it because
    the error is structural.  Here all three come off ONE line: the pillar prism is
    centred on it, and each glass edge is that same line displaced by half the frame
    width along the pillar's own cross-axis.  They are parallel by construction.
    """
    import mathutils
    a = mathutils.Vector((sx * foot[0], foot[1], foot[2]))
    b = mathutils.Vector((sx * head[0], head[1], head[2]))
    d = (b - a).normalized()
    u = mathutils.Vector((1, 0, 0)).cross(d).normalized()   # across the frame, in y-z
    v = d.cross(u).normalized()                             # outboard-ish normal
    if v.x * sx < 0:
        v, u = -v, -u
    # Pick the sign of u that heads TOWARD the nose, so "front" means the windscreen
    # side on both flanks of the truck rather than mirroring with sx.
    if u.y < 0:
        u = -u
    rings = [[tuple(c + u * (width * 0.5) + v * (thick * 0.5)),
              tuple(c - u * (width * 0.5) + v * (thick * 0.5)),
              tuple(c - u * (width * 0.5) - v * (thick * 0.5)),
              tuple(c + u * (width * 0.5) - v * (thick * 0.5))] for c in (a, b)]
    inset = v * (thick * 0.5 + GLASS_INSET)
    front = [tuple(c + u * (width * 0.5) - inset) for c in (a, b)]
    rear = [tuple(c - u * (width * 0.5) - inset) for c in (a, b)]
    return rings, front, rear
WS_BASE_Y, WS_BASE_Z = 0.580, 1.160    # windscreen bottom edge
WS_TOP_Y, WS_TOP_Z = 0.089, 1.552      # windscreen top edge (tucked under the header)
WS_HALF_B, WS_HALF_T = 0.704, 0.646    # half width at the bottom / top edge
BL_BASE_Y, BL_BASE_Z = -0.622, 1.180   # backlight
BL_TOP_Y, BL_TOP_Z = -0.575, 1.548
BL_HALF_B, BL_HALF_T = 0.644, 0.630
GLASS_INSET = 0.010                    # glass sits this far inboard of the pillar's outer face


def build_greenhouse(p):
    # Roof slab.  Rings in XZ, two stations: the underside IS the headliner, so this
    # one box does the exterior roof and the interior ceiling with no extra geometry.
    def roof_ring(y):
        r = [(0.0, Z_HEADLINER), (W_ROOF, Z_HEADLINER), (W_ROOF, Z_ROOF),
             (0.0, Z_ROOF + Z_ROOF_CROWN)]
        return ([(x, y, z) for x, z in r]
                + [(-x, y, z) for x, z in reversed(r[1:3])])
    loft(p, [roof_ring(Y_HDR_F), roof_ring(Y_HDR_R)], "RangerPaint",
         band_mats={0: DARK, 5: DARK})     # headliner underside

    for sx in (1, -1):
        for foot, head, w, t in ((A_FOOT, A_HEAD, PILLAR_A, 0.040),
                                 (C_FOOT, C_HEAD, PILLAR_C, 0.044),
                                 (B_FOOT, B_HEAD, 0.034, 0.038)):
            rings, _f, _r = pillar_frame(foot, head, w, t, sx)
            loft(p, rings, "RangerPaint")

    # DRIP RAIL.  Runs the whole length of the door opening, from the A-pillar head
    # to the C-pillar head — not just across the roof slab.  Without it there is an
    # open slot between the top of the door glass and the roof that you can see the
    # far side of the world through.
    for sx in (1, -1):
        box(p, sx * 0.646, sx * 0.706, C_HEAD[1] - 0.012, A_HEAD[1] + 0.012,
            Z_HEADLINER - 0.036, Z_HEADLINER + 0.006, "RangerPaint")

    # Cab rear panel above the beltline, either side of the backlight, plus the
    # header strip over it — the backlight is a hole in a panel, not a floating pane.
    for sx in (1, -1):
        hexa(p, [(sx * BL_HALF_B, BL_BASE_Y, BL_BASE_Z - 0.03),
                 (sx * 0.744, BL_BASE_Y, BL_BASE_Z - 0.03),
                 (sx * 0.744, BL_BASE_Y + 0.05, BL_BASE_Z - 0.03),
                 (sx * BL_HALF_B, BL_BASE_Y + 0.05, BL_BASE_Z - 0.03),
                 (sx * BL_HALF_T, BL_TOP_Y, BL_TOP_Z),
                 (sx * 0.676, BL_TOP_Y, BL_TOP_Z),
                 (sx * 0.676, BL_TOP_Y + 0.05, BL_TOP_Z),
                 (sx * BL_HALF_T, BL_TOP_Y + 0.05, BL_TOP_Z)], "RangerPaint")

    # Third brake light, high on the cab rear — dead centre, unmistakable at night.
    box(p, -0.105, 0.105, -0.616, -0.580, 1.498, 1.546, "RangerTail")


def _edge_at_z(e0, e1, z):
    """Point at height z on a pillar edge line, extrapolated past the ends if need be
    — the glass top sits below the pillar head and the sill above its foot."""
    t = (z - e0[2]) / (e1[2] - e0[2])
    return tuple(e0[k] + (e1[k] - e0[k]) * t for k in range(3))


GLASS_TOP_Z = 1.518                # side glass tucks under the drip rail here


def build_glass(g):
    """Every pane is a single quad, double-sided, and drawn from OUTSIDE in.

    Winding matters even for a double-sided pane: Three.js still lights the front
    face, so a pane wound inward reads dark from the driver's seat.

    All six panes take their side edges from pillar_frame(), never from hand-typed
    coordinates — see the note there.  That is what makes the A-pillar/glass line
    read straight instead of wandering a few millimetres along its length.
    """
    A = {sx: pillar_frame(A_FOOT, A_HEAD, PILLAR_A, 0.040, sx) for sx in (1, -1)}
    B = {sx: pillar_frame(B_FOOT, B_HEAD, 0.034, 0.038, sx) for sx in (1, -1)}
    C = {sx: pillar_frame(C_FOOT, C_HEAD, PILLAR_C, 0.044, sx) for sx in (1, -1)}

    # Windscreen: spans between the two A-pillars' nose-side edges.
    wl, wr = A[-1][1], A[1][1]
    pane(g, _edge_at_z(*wl, WS_BASE_Z), _edge_at_z(*wr, WS_BASE_Z),
         _edge_at_z(*wr, WS_TOP_Z), _edge_at_z(*wl, WS_TOP_Z),
         "RangerGlass", (0.0, 0.65, 0.76))
    # Backlight: between the two C-pillars' tail-side edges.
    bl, br = C[-1][2], C[1][2]
    pane(g, _edge_at_z(*br, BL_BASE_Z), _edge_at_z(*bl, BL_BASE_Z),
         _edge_at_z(*bl, BL_TOP_Z), _edge_at_z(*br, BL_TOP_Z),
         "RangerGlass", (0.0, -0.99, 0.13))
    # Door glass (A rear -> B front) and the rear quarter (B rear -> C front).
    for sx in (1, -1):
        for f, r in ((A[sx][2], B[sx][1]), (B[sx][2], C[sx][1])):
            pane(g, _edge_at_z(*f, GH_BELT), _edge_at_z(*r, GH_BELT),
                 _edge_at_z(*r, GLASS_TOP_Z), _edge_at_z(*f, GLASS_TOP_Z),
                 "RangerGlass", (sx * 0.97, 0.0, 0.24))


# ---------------------------------------------------------------------------
# REFERENCE WHEELS — viewport only, NEVER exported.
# The game owns the wheels (src/vehicle-model.js), so the model has none.  But a
# pickup judged while sitting on its belly reads wrong at every proportion: the
# overhangs look enormous, the arches look like caves and the belt looks low.
# These four stand-ins are built at the physics preset's own numbers, and export()
# deletes them before it writes anything.
# ---------------------------------------------------------------------------
REF_WHEEL_NAME = "REF_ONLY_wheels"


def build_ref_wheels():
    p = Part(REF_WHEEL_NAME)
    r, w, seg = 0.368, 0.250, 14
    for ay in (AX_F, AX_R):
        for sx in (1, -1):
            cx = sx * TRACK_HALF
            rings = []
            for xo in (-w * 0.5, w * 0.5):
                rings.append([(cx + xo,
                               ay + r * math.cos(2 * math.pi * i / seg),
                               r + r * math.sin(2 * math.pi * i / seg))
                              for i in range(seg)])
            loft(p, rings, DARK)
    return bake(p)


# ---------------------------------------------------------------------------
# BUILD / EXPORT
# ---------------------------------------------------------------------------
BUILDERS_BODY = ["build_front_clip", "build_cab", "build_bed", "build_bed_detail",
                 "build_greenhouse", "build_front_end", "build_rear_end",
                 "build_trim", "build_interior"]


def build():
    bpy.ops.wm.read_homefile(use_empty=True)
    for d in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for x in list(d):
            d.remove(x)

    body = Part("Ranger")
    for fn in BUILDERS_BODY:
        globals()[fn](body)

    glass = Part("RangerGlassPanes")
    build_glass(glass)

    ob_body = bake(body)
    ob_glass = bake(glass, weld=False, double_sided=True)
    # The loader hides root children "much smaller than the body".  Glass and the
    # steering wheel are both far smaller — so they are PARENTED to the body and
    # never left as root siblings.  (Keep transforms: parent_set would need an
    # operator; a direct parent assignment with an identity matrix is equivalent
    # here because nothing has been moved.)
    ob_glass.parent = ob_body
    ob_wheel = build_steering_wheel()
    ob_wheel.parent = ob_body

    objs = [ob_body, ob_glass, ob_wheel]
    build_ref_wheels()
    # matrix_world is lazy: without this the steering wheel still reports its
    # identity transform and drags the bounding box below the ground plane.
    bpy.context.view_layer.update()

    report(objs)
    return objs


def report(objs):
    # matrix_world, not v.co: the steering wheel keeps a node transform (its origin
    # is the column axis) so its local coords sit around zero and would otherwise
    # drag the reported bounding box to the world centre.
    verts = []
    for ob in objs:
        M = ob.matrix_world
        verts += [tuple(M @ v.co) for v in ob.data.vertices]
    ext = [(min(c[i] for c in verts), max(c[i] for c in verts)) for i in range(3)]
    total = 0
    print("=" * 68)
    for ob in objs:
        t = evaluated_tris(ob)
        total += t
        print(f"  {ob.name:<22s} {t:5d} tris")
    print(f"  {'TOTAL':<22s} {total:5d} tris   (budget {TRI_BUDGET})")
    print(f"  materials {len(bpy.data.materials)}   images {len(bpy.data.images)}")
    print(f"  W x L x H = {ext[0][1]-ext[0][0]:.3f} x "
          f"{ext[1][1]-ext[1][0]:.3f} x {ext[2][1]-ext[2][0]:.3f} m")
    print(f"  y span {ext[1][0]:+.4f} .. {ext[1][1]:+.4f}   "
          f"(want {Y_TAIL:+.4f} .. {Y_NOSE:+.4f})")
    print(f"  lowest z = {ext[2][0]:.4f}")
    # The two numbers data/vehicle-models.js needs.  The loader centres the model's
    # bounding box on the CG and plants box.min on the ground; these undo both, so
    # that the model's OWN origin (which is where the axles were placed) lands on
    # the CG.  Copy them across; never eyeball them.
    # gltf_z = -blender_y, so the box centre lands at gltf z = -cy and the loader
    # adds -center.z*s = +cy.  shiftRear must therefore be -cy to cancel it.
    cy = (ext[1][0] + ext[1][1]) * 0.5
    # shiftDown = (model's own lowest point) minus (the static sag the loader ignores).
    # Both terms matter: without the first the truck sinks by the mud-flap clearance,
    # without the second it hovers by the suspension sag.
    # (+SAG, not -SAG: a bigger shiftDown moves the model DOWN relative to the CG,
    # and sag means the road is further below the CG than the loader assumes.)
    shift_down = -ext[2][0] + SAG
    print(f"  --> targetLength {ext[1][1]-ext[1][0]:.4f}   "
          f"shiftRear {-cy:+.4f}   shiftDown {shift_down:+.4f}"
          f"   (min z {ext[2][0]:.3f} - sag {SAG:.3f})")

    # ---- Invariants.  Asserted every build, because each one has already been
    # broken once in this file and none of them shows up in a screenshot. ----
    ok = True

    def chk(name, cond, detail=""):
        nonlocal ok
        ok = ok and cond
        print(f"  [{'ok ' if cond else 'FAIL'}] {name}{('  ' + detail) if detail else ''}")

    chk("nothing below the ground plane", ext[2][0] >= -0.0005, f"min z {ext[2][0]:+.4f}")
    chk("nothing past the bumpers",
        ext[1][0] >= Y_TAIL - 0.0005 and ext[1][1] <= Y_NOSE + 0.0005,
        f"y {ext[1][0]:+.4f}..{ext[1][1]:+.4f}")
    chk("length matches the physics preset",
        abs((ext[1][1] - ext[1][0]) - BODY_LEN) < 0.005,
        f"{ext[1][1]-ext[1][0]:.4f} vs {BODY_LEN}")
    # The whole point of the wheel wells: the pocket wall has to clear the tyre's
    # INNER face, or the wheel could never rise into it and it is a dent, not a well.
    chk("well pocket clears the tyre inner face", W_UNDER < TRACK_HALF - 0.125,
        f"pocket {W_UNDER:.3f} vs tyre {TRACK_HALF - 0.125:.3f}")
    # The arch must land on the axle the PHYSICS uses, not on a symmetric guess.
    chk("arches on the physics axles",
        abs(AX_F - WHEELBASE * WEIGHT_R) < 1e-9 and abs(AX_R + WHEELBASE * WEIGHT_F) < 1e-9)
    # The nose rim is generated by shrinking CLIP_ST[0]'s section.  If that station
    # still has the wheel arch cut into it, the arch is carried forward through the
    # whole rim and opens a notch in the nose; if it merely sits NEAR the arch's
    # forward tangent, the tangent's own sample lands beside it and leaves a sliver.
    chk("nose rim starts on the front arch's tangent",
        abs(CLIP_ST[0][0] - (AX_F + ARCH_R)) < 1e-9,
        f"{CLIP_ST[0][0]:.4f} vs {AX_F + ARCH_R:.4f}")
    # Every rim ring must lead the one behind it at EVERY point, not just on the
    # centreline.  A single folded point turns the loft inside-out locally and reads
    # as a dark crack across the panel.
    worst_fold, prev_ys = 1.0, [CLIP_ST[0][0]] * len(clip_ring(CLIP_ST[0][0]))
    for spec in NOSE_RIM:
        ring = nose_rim_ring(spec)
        worst_fold = min(worst_fold, min(q[1] - pv for q, pv in zip(ring, prev_ys)))
        prev_ys = [q[1] for q in ring]
    chk("nose rim rings never fold backwards", worst_fold > 0.0,
        f"tightest gap {worst_fold:+.4f} m")
    # Steering wheel vs windscreen: signed distance to the glass plane, cabin side
    # negative.  Tested on the WHEEL'S OWN vertices — a geometric filter like
    # "y > 0.3 and z > 1.0" also catches the cowl, which is legitimately ahead of
    # the glass and reads as a 0.4 m fail.
    import mathutils
    a = mathutils.Vector((0.0, WS_BASE_Y, WS_BASE_Z))
    b = mathutils.Vector((WS_HALF_B, WS_BASE_Y, WS_BASE_Z))
    c = mathutils.Vector((0.0, WS_TOP_Y, WS_TOP_Z))
    nrm = (b - a).cross(c - a).normalized()
    if nrm.dot(mathutils.Vector((0.0, -1.0, 0.0))) < 0:
        nrm = -nrm                       # point into the cabin
    sw = next((o for o in objs if o.name == "SteeringWheel"), None)
    if sw:
        M = sw.matrix_world
        worst = max((M @ v.co - a).dot(nrm) for v in sw.data.vertices)
        chk("steering wheel behind the windscreen", worst > 0, f"{worst:+.3f} m")
    # Beltline sightline (ART-STYLE): a seat back that stops below the belt makes
    # the cabin read as empty through the glass no matter how good the geometry is.
    chk("seat backs break the beltline", Z_SEATBACK > Z_BELT + 0.05,
        f"{Z_SEATBACK:.3f} vs belt {Z_BELT:.3f}")
    print("=" * 68)
    if not ok:
        raise AssertionError("build invariants failed — see the [FAIL] lines above")
    return ext


# ---------------------------------------------------------------------------
# AUDIT — the numeric half of the pass.  A screenshot cannot see any of these.
# ---------------------------------------------------------------------------
def check_normals(objs, samples=600):
    """Prove the winding; never eyeball it.

    A model seen from the far side looks mirrored when it is fine and fine when it
    is mirrored, so screenshots cannot settle this.  Fire rays inward from a sphere
    around the truck and assert every first hit points BACK at its ray.  Getting the
    comparison the wrong way round reports every good face as inverted and every
    inverted one as good, which is exactly why this has to be a number.
    """
    import mathutils
    from mathutils.bvhtree import BVHTree
    dg = bpy.context.evaluated_depsgraph_get()
    verts, faces = [], []
    for ob in objs:
        if ob.name == REF_WHEEL_NAME:
            continue
        me = ob.evaluated_get(dg).to_mesh()
        me.calc_loop_triangles()
        o = len(verts)
        M = ob.matrix_world
        verts += [M @ v.co for v in me.vertices]
        faces += [[i + o for i in t.vertices] for t in me.loop_triangles]
        ob.evaluated_get(dg).to_mesh_clear()
    bvh = BVHTree.FromPolygons(verts, faces)
    centre = mathutils.Vector((0.0, -0.30, 0.85))
    tested = bad = 0
    for i in range(samples):
        # Deterministic Fibonacci sphere — Math.random() has no place in a build that
        # has to reproduce the same report twice.
        z = 1.0 - 2.0 * (i + 0.5) / samples
        r = math.sqrt(max(0.0, 1.0 - z * z))
        th = math.pi * (1.0 + 5.0 ** 0.5) * i
        d = mathutils.Vector((r * math.cos(th), r * math.sin(th), z))
        origin = centre + d * 6.0
        hit = bvh.ray_cast(origin, -d)
        if hit[0] is None:
            continue
        # A face lying nearly EDGE-ON to the ray is not evidence of inversion — it is
        # a grazing hit, and at this ray density a handful always land on the flat
        # underside of some box at ~89 degrees.  Skip those rather than counting them
        # either way.  (Checked at 2400 rays: the three this used to report were the
        # bottoms of the rear corner panel, the licence plate and a mud flap, all
        # correctly wound.)
        c = hit[1].dot(-d)
        if abs(c) < 0.05:
            continue
        tested += 1
        if c > 0.0:
            bad += 1
    return tested, bad


def _tri_overlap_2d(va, vb, n):
    """Separating-axis test for two coplanar triangles, projected into their plane."""
    import mathutils
    u = (va[1] - va[0]).normalized()
    w = n.cross(u)
    A = [(p.dot(u), p.dot(w)) for p in va]
    B = [(p.dot(u), p.dot(w)) for p in vb]
    for poly in (A, B):
        for i in range(3):
            ex = poly[(i + 1) % 3][0] - poly[i][0]
            ey = poly[(i + 1) % 3][1] - poly[i][1]
            ax, ay = -ey, ex
            la = [ax * px + ay * py for px, py in A]
            lb = [ax * px + ay * py for px, py in B]
            if min(la) >= max(lb) - 1e-9 or min(lb) >= max(la) - 1e-9:
                return False
    return True


def audit(objs, budget=TRI_BUDGET):
    """Clipping, z-fighting, manifold-ness, loose verts, tri budget."""
    import bmesh as _bm
    print("-" * 68)
    total = 0
    for ob in objs:
        if ob.name == REF_WHEEL_NAME:
            continue
        me = ob.data
        total += evaluated_tris(ob)
        bm = _bm.new()
        bm.from_mesh(me)
        loose = sum(1 for v in bm.verts if not v.link_faces)
        nonman = sum(1 for e in bm.edges if len(e.link_faces) not in (1, 2))
        border = sum(1 for e in bm.edges if len(e.link_faces) == 1)
        bm.free()
        # EXPECTED, not faults: the 8 non-manifold edges are the cowl ring, where the
        # firewall (an interior partition) is welded into the outer skin and three
        # surfaces meet on one edge.  The 16 border edges are the nose opening's rim
        # — a real hole with the dark recess box behind it — and the glass panes are
        # single quads, so all 24 of their edges are borders by construction.
        print(f"  {ob.name:<22s} loose {loose}  non-manifold {nonman}  "
              f"border edges {border}")
    print(f"  tris {total} / {budget}  "
          f"{'OK' if total <= budget else 'OVER BUDGET'}")

    # Z-FIGHTING.  Two faces that are parallel, coincident within a millimetre AND
    # OVERLAPPING will strobe under engine lighting even though they look perfect in
    # a viewport.  All three conditions matter: a first cut that only asked for
    # "coplanar and within 3 cm" reported 74 hits, every one of them a butted seam —
    # two panels meeting edge-on in the same plane, which is not a defect and is
    # unavoidable in a model welded together out of boxes.  Overlap is approximated
    # by comparing the in-plane centre distance against the triangles' circumradii.
    # Compare pairwise inside a coarse grid so this stays cheap on a 2500-tri mesh.
    dg = bpy.context.evaluated_depsgraph_get()
    tris = []
    for ob in objs:
        if ob.name == REF_WHEEL_NAME:
            continue
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        M = ob.matrix_world
        for t in me.loop_triangles:
            c = M @ t.center
            n = (M.to_3x3() @ t.normal).normalized()
            vs = [M @ me.vertices[i].co for i in t.vertices]
            mat = me.materials[t.material_index].name if me.materials else "?"
            tris.append((c, n, vs, mat))
        ev.to_mesh_clear()
    cell = 0.05
    grid = {}
    for i, (c, _n, _v, _m) in enumerate(tris):
        grid.setdefault((int(c.x / cell), int(c.y / cell), int(c.z / cell)), []).append(i)
    pairs = 0
    worst = []
    seen = set()
    for key, idxs in grid.items():
        for a in idxs:
            for b in idxs:
                if b <= a or (a, b) in seen:
                    continue
                seen.add((a, b))
                ca, na, va, nma = tris[a]
                cb, nb, vb, nmb = tris[b]
                if abs(na.dot(nb)) < 0.999:
                    continue
                d = cb - ca
                if d.length < 1e-9 or abs(d.dot(na)) > 0.001:
                    continue
                # Two triangles of the SAME n-gon are always coplanar and adjacent,
                # so a distance heuristic reports every triangulated cap as a fault
                # (it reported 109, all of them this).  Skip anything sharing a
                # vertex, then run a real 2-D overlap test in the shared plane.
                if any((p - q).length < 1e-4 for p in va for q in vb):
                    continue
                if not _tri_overlap_2d(va, vb, na):
                    continue
                pairs += 1
                if len(worst) < 8:
                    worst.append((tuple(round(v, 3) for v in ca), nma, nmb))
    print(f"  overlapping coplanar face pairs: {pairs}  "
          f"{'OK' if pairs == 0 else 'Z-FIGHT RISK'}")
    for w in worst:
        print(f"      at {w[0]}  {w[1]} / {w[2]}")

    tested, bad = check_normals(objs)
    print(f"  normals: {tested} rays hit, {bad} pointing away  "
          f"{'OK' if bad == 0 else 'INVERTED FACES'}")
    print("-" * 68)
    return bad, pairs


def _ui_override():
    """read_homefile() invalidates any window/area grabbed earlier, and the MCP
    bridge's context has no active_object — both operators below need a real one.
    Fetch it AFTER the rebuild, never before."""
    win = bpy.context.window_manager.windows[0]
    scr = win.screen
    area = next(a for a in scr.areas if a.type == "VIEW_3D")
    region = next(r for r in area.regions if r.type == "WINDOW")
    return dict(window=win, screen=scr, area=area, region=region,
                scene=bpy.context.scene, view_layer=bpy.context.view_layer)


def export():
    objs = build()
    audit(objs)

    # The reference wheels are a viewport aid.  They must not reach the .glb — and
    # they must not reach the .blend either, or the next session exports them.
    if REF_WHEEL_NAME in bpy.data.objects:
        bpy.data.objects.remove(bpy.data.objects[REF_WHEEL_NAME], do_unlink=True)

    ov = _ui_override()
    with bpy.context.temp_override(**ov):
        for ob in bpy.data.objects:
            ob.select_set(False)
        # TRANSFORMS: apply them to the body and the glass, NEVER to the steering
        # wheel.  Its origin IS the column axis and applying location would move that
        # origin to the world centre, so animating it would orbit the whole truck.
        for ob in objs[:2]:
            ob.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

        bpy.ops.export_scene.gltf(
            filepath=OUT_GLB,
            export_format="GLB",
            export_draco_mesh_compression_enable=False,   # no decoder in the loader
            export_yup=True,                              # blender +Y -> gltf -Z
            export_apply=True,
            export_materials="EXPORT",
            export_texcoords=False,                       # zero images, zero UVs
            export_normals=True,
            export_cameras=False,
            export_lights=False,
            use_selection=False,
        )
    print(f"  wrote {OUT_GLB}")
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    print(f"  wrote {OUT_BLEND}")
    return objs


if __name__ == "__main__":
    build()
