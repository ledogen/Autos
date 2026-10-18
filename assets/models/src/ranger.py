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
TRI_BUDGET = 4200      # 4000 until 2026-09-26, raised by the owner to pay for the
                       # full door shut line and the cab's rear chamfer
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
Z_UNDER = 0.368                  # underbody pan.  Owner, 2026-09-05: "i want it raised
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
Z_ROCKER = 0.395                 # rocker step: flank bottom out of the arch zones
Z_HIP = 0.86                     # widest point of the flank
Z_BELT = 1.070                   # door beltline = base of the side glass.  Dropped 20 mm
                                 # from the first pass: with the roof pinned at bodyHeight the
                                 # only way to make the cab read bigger is more glass.
Z_ROOF = 1.600                   # roof deck (bodyHeight 1.60)
Z_ROOF_CROWN = 0.020             # centre of the roof sits this much proud of the rails
Z_RAIL = 1.141                   # bed rail top — reads BELOW the door belt, as on the ref
Z_BEDFLOOR = 0.700               # bed floor pan (rib crests sit RIB_H above)
Z_HEADLINER = 1.556              # underside of the roof slab.  THE ROOF'S THICKNESS IS
                                 # THIS NUMBER (owner, 2026-09-22: "the roof is too
                                 # thick") — Z_ROOF is the physics preset's bodyHeight
                                 # and cannot move, so the slab can only be thinned from
                                 # below.  74 mm until then; 44 now.  Raise it and the
                                 # overhead trim follows, because build_interior hangs
                                 # the mirror and the visors off it rather than off
                                 # typed heights.

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
Y_COWL = 0.689                   # base of the windscreen.  The cab was 1.100 long and read
                                 # as too short (owner, 2026-08-25); it is now 1.214, taken
                                 # out of the hood, which was generously long at 1.508.
Y_CAB_REAR = -0.525              # cab rear panel
W_ROOF = 0.676                   # roof half width.  The TOP END of gh_x(), the one
                                 # tumblehome the whole greenhouse is built on — see
                                 # the note above it.  The headers' y is no longer
                                 # typed: it comes off the A / C pillar edges.
PILLAR_A, PILLAR_T_A = 0.068, 0.050   # section across the glass, and thickness inboard.
PILLAR_C, PILLAR_T_C = 0.072, 0.048   # The thickness is what the SCREENS seat against, so
                                      # it sets how wide they end up — see SCREEN_REVEAL.
                                      # A went 38 -> 68 mm on 2026-09-25: MEASURED off the
                                      # reference, where the painted band between the
                                      # windscreen and the door glass is 64-74 mm at every
                                      # height.  At 38 it read as half a pillar.

# --- Bed ---
Y_BED_F = -0.605                 # bed front wall (8 cm gap behind the cab)
Y_BED_R = -2.4405                # bed loft tail; the 30 mm tailgate slab takes the
                                 # outer face to -2.510, so the bed is 1.800 m —
                                 # a real 6-foot bed, un-scaled
N_RIBS = 8                       # bed-floor rib crests across the full width
RIB_H = 0.028

# --- Front clip ---
Z_LAMP0, Z_LAMP1 = 0.786, 0.946  # headlamp / grille opening.  Shrunk 218 -> 180 mm on
                                 # 2026-09-25 (owner: "shrink the headlights slightly"),
                                 # because the hood's new fall leaves less metal above
                                 # them and a cramped lamp is what broke the junction.
                                 #
                                 # ...AND 180 -> 160 THE SAME DAY, FOR A REASON THAT IS A
                                 # HARD GEOMETRIC FLOOR RATHER THAN TASTE.  The rim rolls
                                 # the WHOLE last section down by NOSE_DROP as it sweeps
                                 # onto the nose face, creases included — so the fender's
                                 # squaring crease, which SQUARE_Z carefully keeps clear
                                 # of the lamp band at z 0.9977, arrives on the outermost
                                 # rim ring at 0.935.  The flank then loses 65 mm of width
                                 # in the 34 mm above it, the lens followed the skin up
                                 # into that, and its top band folded over itself: one
                                 # 0.7 cm2 quad with its normal pointing BACKWARD, which
                                 # flat shading draws as a black wedge in the amber.  The
                                 # false "tear" again — never a hole, always a crossed
                                 # ring.
                                 # The clearance is therefore
                                 #     (hood line at the nose face) - Z_LAMP1
                                 #       >= crown + (shoulder - squaring point) + margin
                                 #        = 22 + 24 + 6 = 52 mm,
                                 # and it was EIGHT.  Half is paid by the rim rolling less
                                 # (70 -> 44 mm, which the owner asked for anyway) and half
                                 # by the lamp: 54 mm now, measured, asserted in report().
                                 # Re-measured off the
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
Z_RBUMP0, Z_RBUMP1 = 0.443, 0.599
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
SW_AT = (-0.355, 0.291, 1.048)   # steering-wheel hub
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
    """Axis-aligned-ish prism between two points (exhaust, shifter)."""
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
    (1.7525, 0.824, 0.738, 1.044, 0.022, 1.00),  # last FULL station.  MUST equal AX_F+ARCH_R
                                           # exactly (asserted in report()): 2.5 mm off it
                                           # and the arch sample lands beside this station
                                           # instead of on it, leaving a sliver face that
                                           # came out inverted.
    # The FENDER ties into the nose (owner, 2026-08-27): it carries its crown past
    # the axle, then tucks in over the last 0.30 m to hand off to the prow.  Left
    # prismatic to the arch tangent, the bullet would look grafted onto a slab.
    (1.620, 0.838, 0.754, 1.072, 0.022, 1.00),   # ...and the last leg is SOFTENED to
                                           # 0.211: the rim can only carry 44 mm of fall
                                           # now (see Z_LAMP1), which over its 190 mm of
                                           # sweep is a slope of 0.23, and a rim flatter
                                           # than the hood arriving at it is the flat spot
                                           # this file has already been round once.
    (1.450, 0.845, 0.768, 1.110, 0.020, 0.95),   # fender crown carried past the axle
    (1.2825, 0.845, 0.772, 1.134, 0.018, 0.85),  # front axle
    (1.050, 0.838, 0.772, 1.154, 0.012, 0.60),
    (0.820, 0.816, 0.766, 1.166, 0.007, 0.30),   # ...and THE TUCK IS SPENT BY HERE
    (0.689, 0.807, 0.7559, 1.172, 0.003, 0.00),  # cowl — see SQUARE below, and the
                                           # SHOULDER note under CAB_ST: 0.776 here put
                                           # the cowl 20 mm outboard of the greenhouse
                                           # standing on it.  The three stations ahead
                                           # were eased with it so the hood does not
                                           # pinch in over its last 130 mm.
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
#
# MATCHING AT THE JOINT IS NOT ENOUGH — THE SLOPE HAS TO MATCH TOO (owner,
# 2026-09-25: "the fenders are a little bit wider than the doors where they meet.
# This is a little bit awkward so either pop the doors out or push the fenders in a
# little bit so it's a smooth body line").  Both shells read 0.816 at the cowl and
# always did, so there was no step THERE; what the eye saw was the flank still
# narrowing as it crossed the shut line and then going flat 34 mm later — 10 mm of
# taper packed into the first 34 mm of door, which reads exactly like a proud
# fender.  The fender now spends its tuck BEFORE the joint (0.832 -> 0.816 at
# y 0.820) and hands over at 0.807, 1 mm above the door's own constant 0.806.
#
# AND THE SHOULDER (`w_shoulder`) HAS TO LAND ON gh_x(), NOT NEAR IT.  The first two
# stations top out at the COWL DECK, z 1.17, where the third and everything behind it
# tops out at Z_BELT and hands over to the greenhouse.  At 0.776 the cowl's flank read
# 0.782 at z 1.09 against the greenhouse's 0.767 — a 15 mm bulge 20 mm long, sitting
# directly under the mirror, which is exactly where the owner found it (2026-09-26: "the
# fender is still wider than the doors, but only above the belt line ... there's a little
# bump there").  gh_x(1.172) is 0.7559 and gh_x(1.170) is 0.7563: the two surfaces now
# describe the same place at the height where they meet, and the residual is 2 mm.
CAB_ST = [
    (0.689, 0.807, 0.7559, 1.172),         # cowl — matches CLIP_ST so the shells weld
    (0.672, 0.8067, 0.7563, 1.170),        # the cowl deck, under the A-pillar foot
    (0.655, 0.8062, 0.7753, Z_BELT),       # ...and the belt, a short step behind it.  The
                                           # step is DELIBERATELY steep: everything below
                                           # where it lands is DLO, and the higher it
                                           # finishes the taller the window trim has to be
                                           # to cover the corner it cuts.
    (-0.525, 0.806, 0.775, Z_BELT),        # cab rear panel
]
W_DOORCARD = 0.700                         # inner face of the door trim


# EVERY SECTION MIRRORS WITH r[1:-1], NEVER A LITERAL SLICE.  The two centreline
# points are r[0] and r[-1] and must not be duplicated in the mirrored half.  These
# used to be hand-written indices, and dropping ONE point from bed_ring() (the sill
# chamfer, 2026-09-05) turned r[1:13] into a slice that copied the last centreline
# point as well: the ring gained a point instead of losing one, every band index
# after it shifted by two, and BED_BANDS painted the whole left flank with the
# underbody's dark band.  The owner saw it as "left bedside turned black".
def cab_flank_x(y, z):
    """Half width of the CAB's outer flank at (y, z) — the surface a door seam has to lie
    on below the beltline, where gh_x() does not reach.  One typed width there put the
    seam 15 mm proud of the door at mid height."""
    wo, wb, zbelt = _interp(CAB_ST, y)
    if z <= Z_HIP:
        return wo
    return wo + (wb - wo) * (z - Z_HIP) / (zbelt - Z_HIP)


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


BED_WALL_T = 0.014                 # thickness of the bed's front wall.  Sheet-metal
                                   # thin ON PURPOSE: its INNER face is what the chase
                                   # camera reads as the front of the bed, so every mm
                                   # of thickness is a mm that face sits behind the
                                   # bedsides' own front edge.
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
Z_NOSE_APEX = 0.5 * (Z_LAMP0 + Z_LAMP1)   # ...and at this height — the MIDDLE OF THE
                                 # LAMP BAND, derived rather than typed: it was 0.880
                                 # against a band that has since moved twice.
NOSE_PROW = 0.115                # plan: how far the apex leads |x| = NOSE_PROW_W
NOSE_PROW_W = 0.820
NOSE_LEAN_UP = 0.045             # how far the face falls back from apex to hood line
NOSE_LEAN_DN = 0.075             # ...and from apex down to the rocker
NOSE_FLANK_LEAN = 0.40           # fraction of the lean surviving at the flank
NOSE_Z_TOP = CLIP_ST[0][3]       # hood line at the last full station.  DERIVED, NEVER
                                 # TYPED.  It was a hand-copied 1.108, and when the hood
                                 # was re-sloped on 2026-09-22 CLIP_ST moved and this did
                                 # not: the rim then leaned its face over a 75 mm range
                                 # that no longer existed and tore the surface open where
                                 # it meets the headlamp.  Owner: "the hood broke where it
                                 # meets the headlight."  One number, one source.
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
NOSE_DROP = 0.004      # how far the hood line falls across the rim — THE ROUND-OFF HALF
NOSE_DROP_LIN = 0.040  # ...and the (much larger) half that simply CARRIES THE HOOD'S
                       # SLOPE ON.  44 mm in total; the split is what decides whether the
                       # fall is spread or saved up for the last band.
                       # The rim used to spend all 70 mm on a 1-cos ease, which starts
                       # flat: the hood arrived at the last station falling at 0.242 and
                       # the rim took it to 0.103 for 91 mm before plunging.  Read as a
                       # bulge (owner, 2026-09-25: "pitches down, then up briefly, then
                       # back down.  It reads as an awkward wrinkle") because it IS one —
                       # a flat spot between two steeper runs.  Split linear/ease, the
                       # slope goes 0.242 -> 0.33 -> 0.57 and only ever steepens.
                       #
                       # 35/35 STILL SAVED TOO MUCH FOR LAST (owner, 2026-09-25: "the
                       # hood reads as very thin and placed on top of the headlights.
                       # needs to be a little bit more tangent").  Monotone is not the
                       # same as tangent: at 35/35 the three bands fell at 0.235, 0.371,
                       # 0.878 — the first is flatter than the hood arriving at 0.242, so
                       # the roll starts by doing NOTHING and then drops almost vertically
                       # onto the lamp, which is exactly the thin lip that was read as a
                       # separate part.
                       #
                       # AND THE TOTAL CAME DOWN 70 -> 44 in the same pass, which is the
                       # part that actually fixes the complaint: 70 mm of roll put the
                       # hood line 8 mm above the lamp, so there was no hood there to
                       # read.  The floor on that total is Z_LAMP1's note, and the
                       # CEILING is the hood's own approach slope — a rim flatter than
                       # the panel feeding it is a flat spot between two steeper runs,
                       # which is the bulge this comment already describes.  At 40/4 the
                       # bands fall at 0.218, 0.234, 0.292 against an approach softened
                       # to 0.211: monotone, and the steepest band is now 1.3x the first
                       # instead of 3.7x.
NOSE_RISE = 0.024      # how far the valance line tucks up; deliberately far less —
                       # a symmetric squeeze pinches the face

NOSE_RIM = []
for _i in range(1, NOSE_RIM_N + 1):
    _th = 0.5 * math.pi * _i / NOSE_RIM_N
    _ease = 1.0 - math.cos(_th)
    NOSE_RIM.append((math.sin(_th), 1.0 - NOSE_TUCK * _ease,
                     NOSE_DROP_LIN * math.sin(_th) + NOSE_DROP * _ease,
                     NOSE_RISE * _ease))


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
    ys = simplify_stations([Y_COWL, 0.672, 0.655, 0.300, -0.100, Y_CAB_REAR], cab_ring)
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
TAIL_LAMP_PROUD = 0.005     # lens face stands this far off the skin along its normal.
                            # Measured off tail_y() and nothing else: since 2026-09-05
                            # the rear face IS on tail_y() (build_rear_end's ribs), so
                            # there is no second datum to track.  It only has to be
                            # enough to clear that face — flush, the two z-fight.
                            # 12 mm until 2026-09-08 (owner: "push the taillights into
                            # the bedsides a little bit they stick slightly too proud").
                            # 5 mm is the floor, not a preference: below ~3 mm the
                            # bezel returns of the two lamps and the panel behind them
                            # start to interpenetrate at the corner stations, where the
                            # skin's own curvature over one section is that order.
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
TAIL_LAMP_MATS = {0: DARK, 2: "RangerLens", 4: DARK}
# Face k spans section point k -> k+1.  1 and 3 fall through to the loft's own
# "RangerTail".  5 IS NOT DRAWN AT ALL: it is the section's back plane, 28 mm inside a
# 54 mm rear panel, so it has never been visible — it was cheap to leave in at four
# bands and is not at nine (2026-09-08), which is 32 tris for nothing.  loft() orients
# from the virtual CLOSED volume, so dropping a face does not disturb the winding.
TAIL_LAMP_BURIED = 5
# THE CLEAR SECTION RUNS THE WHOLE LENGTH, wrap included (owner, 2026-09-22: "the white
# portion of the tail lights should also wrap around").  It was briefly stopped at the
# corner on the reference lamp's authority; the owner's call overrules that, and it is
# the better read anyway — one band running unbroken round the corner is what tells you
# the lens is one piece rather than two lamps meeting at the edge.  Do not "fix" this
# back to a per-segment material.
# THE LENS IS A RECTANGLE WITH TWO CORNER FILLETS, and nothing else.  Owner,
# 2026-09-08: "the rear light is still not squared off in the corners.  It's a tapered
# trapezoidal shape.  Make it square.  Larger fillet on the top exterior.  Smaller
# fillet on the bottom exterior.  And the two inner edges kept sharp."
#
# WHY IT KEPT COMING BACK AS A TRAPEZOID.  There was a per-station table of how much
# height each edge gives up, and the stations were the bed's four rim rings.  The whole
# lamp only travels 150 mm of arc from the shut line to the flank, and the LAST of those
# rings sits 31 mm from the end — so any radius bigger than 31 mm had to be spread back
# over the previous two stations, which is the outer THIRD of the lens.  Spread that far
# a radius is a taper: both edges start closing in from 40% along and the face-on view is
# a trapezoid.  Shrinking the numbers did not help either, because the SHAPE was wrong —
# a hand-typed ramp leaves its flat edge at an angle, so it kinks where it starts instead
# of easing away.
#
# So the radius is no longer a table.  It is solved from ARC LENGTH along the path, as a
# real circle: at distance s back from the outboard end a fillet of radius R takes
# R - sqrt(R^2 - (R - s)^2) off the edge, which is R at the very end and reaches zero
# TANGENTIALLY at s = R.  Nothing inboard of s = R moves at all, so the lens is exactly
# rectangular over the 80% of its length that faces the camera, and the inner corners are
# sharp for free — s is measured from one end only.
#
# TAIL_LAMP_F is what makes that describable: stations bunched into the last 45 mm of
# the run, wherever that run now ends, so the fillet has somewhere to be drawn.
#
# THE LAMP RUNS ONTO THE FLANK (owner, 2026-09-22: "make the hero car taillights wrap
# around further forward so its equally on the side and the back").  It used to stop
# dead at t = 0, which is the LAST BED SECTION — i.e. exactly where the corner finishes
# turning — so 118 mm of its 151 mm of arc was on the rear face and the "wrap" was the
# 33 mm of corner itself.  It now carries on forward down the bedside, and the two
# halves are measured, not eyeballed, on the plan path itself: 133 mm of arc across the
# back against 117 mm of corner-and-flank.
#
# TWO STATION TABLES, because the path is two different curves.  TAIL_LAMP_T walks the
# rim parameter from the tailgate shut line (t = 1) to the corner (t = 0); TAIL_LAMP_F
# then walks metres forward of Y_BED_R along a bedside that is dead straight in plan.
# The rim needs only five stations now — it used to carry nine because the outboard
# fillet had to be drawn inside its last 31 mm, and the fillet no longer lives there.
TAIL_LAMP_T = (1.0, 0.75, 0.50, 0.27, 0.0)
TAIL_LAMP_FWD = 0.100              # how far forward of Y_BED_R the lens runs
TAIL_LAMP_F = (0.27, 0.53, 0.73, 0.87, 0.95, 1.0)   # ...sampled here, bunched at the
                                   # far end so the 45 mm top fillet has stations to
                                   # be drawn with
TAIL_LAMP_SHUT = 0.014             # inboard end stepped clear of the tailgate shut line
# Fillet radii, in metres of arc.  45 mm against 9 mm is the reference's own split — its
# outer top corner is visibly swept where the lens follows the bedside's shoulder round,
# while the bottom is barely broken off square.  The top went 30 -> 45 on 2026-09-08
# ("bigger top outside corner radius on tail lights"), which it can now afford: a circle
# leaves the flat edge TANGENTIALLY, so the first 10 mm of the fillet takes under half a
# millimetre and the lens still reads dead square over the inboard 70% of its run.  That
# is the difference from the old table, where 45 mm would have had to be a straight ramp
# starting 45 mm in — which is what kept reading as a taper.
TAIL_FILLET_TOP = 0.045
TAIL_FILLET_BOT = 0.009


def edge_fillet(s, r):
    """How much a straight edge gives up `s` of arc back from its end, for a corner of
    radius `r`.  A quarter circle: r at s = 0, zero slope at s = r, flat beyond."""
    if r <= 0.0 or s >= r:
        return 0.0
    return r - math.sqrt(max(0.0, r * r - (r - s) ** 2))


# THE LENS FACE'S MIDDLE KNOT SITS ON THE SECTION'S KNEE, NOT AT u = 0.5.
#
# A lens face is two chords between three heights, and a chord across a knee runs
# INSIDE the metal — the knee class again, and this was the biggest sighting of it yet.
# SQUARE_Z keeps the fender's squaring crease clear of the lamp band (z 0.780..0.982)
# on the LAST FULL SECTION, and that check was never carried forward: nose_rim_ring()
# rolls the whole section down by `drop` as it sweeps onto the nose face, which drags
# that crease to z 0.935 — square in the middle of the band.  At the outermost rim ring
# the face chorded 15.5 mm inside against 9 mm of NOSE_LAMP_PROUD, so the fender came
# out through the amber as a red splinter (owner, 2026-09-25: the marker light "needs to
# be a little bit more tangent ... use screenshots and iterate").
#
# Relief is measured, never guessed — and here it is not relief at all: put the knot ON
# the worst knee and the chord stops crossing it.  It costs nothing, same seven points
# and the same bands, and the bulge apex moves a few percent along a face that is 22 mm
# proud at its most.
KNEE_SLEW = 0.20        # ...BUT THE KNOT MAY NOT SLIDE FASTER THAN THIS BETWEEN
                        # NEIGHBOURING STATIONS, and that limit is the whole reason this
                        # is a solver rather than one max().  The dominant knee SWITCHES
                        # as the lamp turns the corner — the rolled squaring crease at
                        # the first rim ring, the rolled hip two stations later — so the
                        # raw answer jumps 0.885 -> 0.301 across 55 mm of path.  The band
                        # between those two rings is then so twisted that flat shading
                        # renders it almost black, which is this file's oldest false
                        # "tear": never a hole, always a ring that crossed itself.  At
                        # 0.20 the worst residual chord is 5.2 mm, well inside the 9 mm
                        # the lens stands proud, and no band goes dark.


def _lens_mid_knots(station, nrm, round_z, n, z_lo, z_hi, bezel_u):
    """Where each lens section's middle face point goes, as a fraction of lamp height."""
    u = []
    for i in range(n):
        nx, ny = nrm[i][0], nrm[i][1]
        z0, h = z_lo, (z_hi - round_z[i]) - z_lo
        a, b = bezel_u, 1.0 - bezel_u

        def dev(t, i=i, nx=nx, ny=ny, z0=z0, h=h, a=a, b=b):
            pa, pb = station(i, z0 + h * a), station(i, z0 + h * b)
            f = (t - a) / (b - a)
            cx, cy = pa[0] + (pb[0] - pa[0]) * f, pa[1] + (pb[1] - pa[1]) * f
            qx, qy = station(i, z0 + h * t)
            return (qx - cx) * nx + (qy - cy) * ny

        u.append(max((a + (b - a) * k / 64.0 for k in range(65)), key=dev))
    for _ in range(n):
        for i in range(1, n):
            u[i] = min(max(u[i], u[i - 1] - KNEE_SLEW), u[i - 1] + KNEE_SLEW)
        for i in range(n - 2, -1, -1):
            u[i] = min(max(u[i], u[i + 1] - KNEE_SLEW), u[i + 1] + KNEE_SLEW)
    return u


def tail_rim_spec(t):
    """The rim's own (frac, scale, drop, rise, close) spec at arc parameter t.

    TAIL_RIM is this evaluated at t = i/TAIL_RIM_N; factoring it out lets the LAMP
    sample the same curve at its own stations without being tied to the bed's ring
    count.  t = 1 is the tailgate shut line, t = 0 is the last full bed section, and
    the spec at t = 0 is the identity — frac 0 pins y to Y_BED_R and scale 1 leaves
    x alone — so tail_rim_ring(tail_rim_spec(0), base) IS base.  That is what lets
    the lamp treat the whole corner as one continuous parameter.
    """
    th = 0.5 * math.pi * t
    e = 1.0 - math.cos(th)
    return (math.sin(th), 1.0 - TAIL_TUCK * e, TAIL_DROP * e, TAIL_RISE * e, e)


def tail_stations():
    """The lamp's path stations, as ("rim", t) across the tail and round the corner,
    then ("flank", dy) forward along the bedside."""
    return ([("rim", t) for t in TAIL_LAMP_T]
            + [("flank", TAIL_LAMP_FWD * f) for f in TAIL_LAMP_F])


def tail_skin_at(sx, station, z):
    """(x, y) of the bed's outer skin at one station, AT HEIGHT z.

    THE STATIONS ARE THE BED'S OWN RINGS, read at whatever height is asked for.  The
    height mattered less when the lamp stopped at the corner — the rear face barely
    changes width with z — but the FLANK tucks in 17 mm between the lamp's floor and
    its ceiling as it climbs toward the rail, so a lens extruded straight up from one
    height would stand that far proud of the bedside at its top.  Reading the ring at
    each height instead puts every section point on the skin, and it also makes the
    old tail_lean() correction unnecessary: the ring already carries it.
    """
    kind, v = station
    if kind == "rim":
        base = bed_ring(Y_BED_R)
        ring = base if v <= 0.0 else tail_rim_ring(tail_rim_spec(v), base)
    else:
        ring = bed_ring(Y_BED_R + v)
    x, y = ring_flank(ring, z, BED_I_ARC)
    return (sx * abs(x), y)


def tail_lamp(p, sx):
    """One wrapped tail lamp, swept along the bed's own skin."""
    zm = 0.5 * (Z_TAIL0 + Z_TAIL1)
    stations = tail_stations()
    # Step the inboard end clear of the shut line, so the lens sits on the rear face
    # rather than straddling the gap it is supposed to stop short of.  Carried at
    # every height, not just at zm, or the lens would lean across the shut line.
    step = [(sx * TAIL_LAMP_SHUT, 0.0)] + [(0.0, 0.0)] * (len(stations) - 1)
    plan = [(x + dx, y + dy) for (x, y), (dx, dy)
            in zip((tail_skin_at(sx, st, zm) for st in stations), step)]
    # Arc length remaining to the OUTBOARD end, per station — the fillets' only input.
    # Measured on the plan path itself rather than assumed from the station tables, so
    # adding or moving a station can never change the corner's radius, only how well
    # it is resolved.
    seg = [math.dist(plan[i], plan[i + 1]) for i in range(len(plan) - 1)]
    left = [sum(seg[i:]) for i in range(len(plan))]
    rings = []
    for i, st in enumerate(stations):
        # Outward normal = the plan tangent turned a quarter turn.  Taken from the
        # NEIGHBOURS rather than per-segment so consecutive sections share it and the
        # sweep cannot kink at a station.  The sx factor flips the turn with the side.
        a, b = plan[max(0, i - 1)], plan[min(len(plan) - 1, i + 1)]
        tx, ty = b[0] - a[0], b[1] - a[1]
        L = math.hypot(tx, ty) or 1.0
        nx, ny = sx * ty / L, -sx * tx / L
        # FLOOR AND CEILING ARE BOTH CONSTANTS — the lens is a rectangle.  All either
        # edge ever gives up is its own fillet at the outboard end, and both are zero
        # over everything but the last few centimetres.
        z0 = Z_TAIL0 + edge_fillet(left[i], TAIL_FILLET_BOT)
        z1 = Z_TAIL1 - edge_fillet(left[i], TAIL_FILLET_TOP)
        h = z1 - z0
        dx, dy = step[i]

        def at(off, u, st=st, dx=dx, dy=dy, z0=z0, h=h, nx=nx, ny=ny):
            z = z0 + h * u
            x, y = tail_skin_at(sx, st, z)
            return (x + dx + nx * off, y + dy + ny * off, z)
        rings.append([at(-TAIL_LAMP_DEEP, 0.0)]
                     + [at(TAIL_LAMP_PROUD, u) for u in TAIL_LAMP_U]
                     + [at(-TAIL_LAMP_DEEP, 1.0)])
    # Both caps are seen — the inboard one is the shut line beside the tailgate, the
    # outboard one is where the lens dies on the flank — so both are bezel-dark.
    loft(p, rings, "RangerTail", band_mats=TAIL_LAMP_MATS,
         skip=lambda _s, k: k == TAIL_LAMP_BURIED,
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
    y0, y1 = Y_TAILGATE + 0.056, Y_BED_F - BED_WALL_T + 0.004
    n = N_RIBS * 2
    top = []
    for i in range(n + 1):
        x = -xw + 2 * xw * i / n
        top.append((x, Z_BEDFLOOR + (RIB_H if i % 2 else 0.004)))
    prof = top + [(xw, Z_BEDFLOOR - 0.010), (-xw, Z_BEDFLOOR - 0.010)]
    loft(p, [[(x, y, z) for x, z in prof] for y in (y1, y0)], "RangerPaint")

    # THE BED'S FRONT WALL, and it is a WALL — it closes the whole opening, floor to
    # rail and wall to wall, with its face ON Y_BED_F.
    #
    # bed_ring() is a closed section around the SOLID — pan, flanks, rails, floor slab —
    # so the loft's front cap fills the metal and not the mouth.  Nothing else ever did
    # either: what stood there was the pressed panel, 28 mm back off the section and
    # only spanning z 0.755..1.066, so the front of the bed was OPEN for 55 mm above the
    # floor and 75 mm below the rail (a ray fired forward down the bed came out on the
    # cab's rear skin) and the wall that was there read as set back from the bedsides
    # (owner, 2026-09-27: "the front wall of the bed could move forward a little bit,
    # it's not flush with the front edge of the bedside").
    #
    # Flush is safe here: the cap covers the section's SOLID only, so a face at Y_BED_F
    # across the mouth is coplanar with nothing — it butts the cap's inner edge along
    # the floor, both inner walls and the rail.
    box(p, -W_BED_IN, W_BED_IN, Y_BED_F - BED_WALL_T, Y_BED_F,
        Z_BEDFLOOR - 0.008, Z_RAIL, "RangerPaint")   # 8 mm UNDER the floor, or its
                                                     # underside is coplanar with the
                                                     # tub's floor and z-fights

    # Pressed panel on the inner face of that wall and of the tailgate.  Both are
    # stared at from the chase camera whenever the bed is empty.
    # W_BED_IN, NOT A TYPED 0.560.  At 0.560 the panel stopped 140 mm short of the tub
    # wall on each side, so the bed's front wall read as a narrow plate with the floor
    # running past it into the corners (owner, 2026-09-26: "the front wall of the truck
    # bed isn't wide enough to meet the bedsides").  2 mm inside the wall, not on it:
    # flush, the panel's own side faces would be coplanar with the tub's and z-fight.
    for (yf, yb) in ((Y_BED_F - BED_WALL_T + 0.004, Y_BED_F - BED_WALL_T - 0.014),
                     (Y_TAILGATE + 0.094, Y_TAILGATE + 0.060)):
        xw = W_BED_IN - 0.002
        box(p, -xw, xw, yb, yf, Z_BEDFLOOR + 0.055, Z_RAIL - 0.075, "RangerPaint")

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
    # THE OPENING IS THE GRILLE, AND ONLY THE GRILLE (owner, 2026-09-08).
    #
    # It used to run out to x 0.724 — a single wide aperture holding the grille AND
    # both lamps, which is how a 1980s sealed-beam front end is built: round glass
    # units sitting down inside a pocket in the fascia.  The lamps stopped being that
    # two rewrites ago; they are now a wraparound cluster with an indicator that turns
    # onto the fender, and they carry their own bezel.  The pocket outlived them.
    #
    # Owner: "that recess still exists on the front fascia ... immediately outside of
    # the uprights that are outside of the radiator.  That pocket is distracting and
    # the bezel that we added to the headlights doesn't fully fill in or cover or hide
    # the pocket ... they're kind of fighting for attention and it's unclear what we're
    # going for.  If we want to have a bezel that's fine it should just be on a light on
    # a flat surface kind of how the tail lights are."
    #
    # Correct, and it is the same call that was made at the back: a lamp either sits IN
    # a hole or ON a panel, and the tail lamps have sat on a panel since 2026-09-05.  So
    # the hole shrinks to the grille surround's own outer edge and everything outboard of
    # it is sheet metal.  The lamp is proud of that metal by NOSE_LAMP_PROUD, its bezel is
    # the section's own return, and there is no longer a second outline for it to fight.
    #
    # The opening's SIDE follows the surround's lean exactly — 0.414 at the bottom,
    # 0.436 at the top — because the surround IS its wall; a vertical hole beside a
    # leaning upright leaves a wedge of daylight down one side.
    OPEN_Z0, OPEN_Z1 = Z_LAMP0, Z_LAMP1
    GRILLE_HALF = 0.392              # the bars' own half-width, and the surround's inner
    SURROUND_W = 0.022               # ...and how much wider the surround is at its base
    # THE OPENING'S SIDES ARE VERTICAL (owner, 2026-09-09: "the inner vertical edges of
    # the headlights are angled outwards.  make them straight").  There used to be a
    # LAMP_LEAN_IN of 22 mm carried by three things at once — the lamp's inboard end, the
    # surround's outer edge and this hole's side — because on 2026-09-06 the ruling was
    # the opposite way ("pull the upper inside corner on the front out a little bit").
    # It is one lean or none: the three edges bound the same 8 mm shut line, so leaning
    # any two of them and not the third opens a wedge.  All three are straight now.
    OPEN_X = GRILLE_HALF + SURROUND_W

    # The nose cap, as a frame around the grille opening.  Point order matches the rim
    # ring; the duplicated corners collapse into triangles, which is what turns a
    # 16-point body outline into a four-sided hole.
    # ONE ENTRY PER RIM-RING POINT — frame() pairs them off by index, so this list
    # has to track clip_ring()'s topology exactly.  It grew by one per half when the
    # underbody pan gained its chamfer, and again when the fender gained its squaring
    # point.
    # MIRROR WITH inner[1:-1], never a literal slice — the two centreline entries are
    # the first and last, and a hard-coded end index silently duplicates one the next
    # time the section changes length.  (That exact bug painted the bed's left flank
    # black on 2026-09-05; same shape of mistake, different list.)
    #
    # THE OLD TUCKED TOP-OUTER CORNER IS GONE WITH THE POCKET.  There used to be an
    # OPEN_X_TOP that broke the top edge inboard to clear rim point 7, the fender's
    # shoulder — necessary when the hole reached out to 0.724, because an inner point
    # outboard of its own rim partner is a twisted quad that flat shading renders almost
    # black and the owner read as a crack up the fender.  At 0.436 the hole is nowhere
    # near the shoulder and the whole hazard, plus the two asserts that fenced it, has
    # nothing left to guard.
    inner = [(0.0, OPEN_Z0),
             (OPEN_X, OPEN_Z0), (OPEN_X, OPEN_Z0),        # pan chamfer
             (OPEN_X, OPEN_Z0), (OPEN_X, OPEN_Z0),        # pan side, arch soffit
             (OPEN_X, OPEN_Z1), (OPEN_X, OPEN_Z1),        # flank, squaring point
             (OPEN_X, OPEN_Z1), (0.0, OPEN_Z1)]
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
    # It only has to cover the GRILLE now — it used to span 1.55 m because the aperture
    # did, and everything past 0.45 was buried in the fascia doing nothing.
    _sweep(p, [-0.450, -0.220, 0.0, 0.220, 0.450],
           lambda x: [(0.150, OPEN_Z0 - 0.030), (0.150, OPEN_Z1 + 0.006),
                      (0.112, OPEN_Z1 + 0.006), (0.112, OPEN_Z0 - 0.030)], DARK)

    # Grille: a body-colour surround with four chrome bars, every one of them swept
    # along the barrel curve so the grille reads ROUNDED, not flat (owner: "the
    # grille is rounded, not flat").
    gx, gz0, gz1 = GRILLE_HALF, OPEN_Z0 + 0.016, OPEN_Z1 - 0.016
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
    # GRILLE SURROUND UPRIGHTS — the wall between the bars and the opening's edge.
    #
    # Owner, 2026-09-06: "wherever there's a dark background behind the headlight, make
    # sure it matches the headlights profile".  The dark is the backing panel, seen
    # through the shut line between the lamp and the opening beside it, and that line
    # only stays a constant-width bezel if BOTH edges bounding it agree.  They used to
    # agree by leaning together; since 2026-09-09 they agree by both being vertical.
    #
    # Only the outer edge is at gx + SURROUND_W.  The inner one stays at gx because the
    # grille bars die into it, and widening the surround there would open a second gap
    # behind them.
    for sx in (1, -1):
        prof = ((0.060, OPEN_Z0), (0.060, OPEN_Z1), (0.004, OPEN_Z1), (0.004, OPEN_Z0))
        rings = []
        for x in (gx, OPEN_X):
            rings.append([(sx * x, nose_y(x, z) - dy, z) for dy, z in prof])
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
    NOSE_LAMP_BACK = 0.026           # how far the section's deep edge sits BEHIND its
                                     # own face.  It is what buries the lamp's back in
                                     # the sheet metal — 9 proud minus 26 is 17 mm
                                     # inside — the same trick TAIL_LAMP_DEEP plays on
                                     # the rear panel, and the reason nothing here can
                                     # z-fight the paint.
    # THE BEZEL IS THE SECTION'S OWN RETURN — ONE FACE PER EDGE (owner, 2026-09-08: "on
    # the indicator portion it looks like we're using two vertices or two faces for every
    # section of the bezel.  That only needs to be one").
    #
    # The first pass at a visible border added a FLANGE as well as the return, so each
    # edge of the cluster was two dark faces stacked: a near-frontal band and, behind it,
    # the steep run back into the metal.  Head-on they merged into one line, but the
    # moment the lamp turned onto the fender both faces came into view at once and the
    # indicator's bezel read twice as wide as the headlamp's — which is also the whole of
    # "the bezel is also larger on the indicator area ... see if you can unify those two
    # sizes".  Two faces cannot be unified with one; there is only one now.
    #
    # It is exactly the tail lamp's section: deep point, face points, deep point.  The
    # single band between the deep point and the face's outer point IS the bezel, and its
    # face-on width is BEZEL_U's share of the lamp's height whatever angle you view it
    # from, because the same face carries it everywhere.
    BEZEL_U = 0.075                  # how much of the lamp's height each bezel return
                                     # takes, top and bottom: 16 mm of the 218, the same
                                     # as the inboard band below, so all four edges of
                                     # the cluster carry one width.
    BEZEL_LIP = 0.001                # ...and the return is BROKEN AT THE SKIN LINE, 1 mm
                                     # inside it.
                                     # THE MEASURED WIDTH IS THE VISIBLE WIDTH, and that
                                     # is the whole reason this point exists.  A return
                                     # that runs straight from the buried deep edge to
                                     # the face spends most of its height inside the sheet
                                     # metal — with the lamp 9 mm proud and the deep edge
                                     # 26 mm behind the face, only 9/26 of it is ever out
                                     # in the light, so a nominal 16 mm bezel rendered as
                                     # 6 and the owner read it as "a little bit smaller"
                                     # than the indicator's.  Breaking the return at the
                                     # skin puts the WHOLE of BEZEL_U outside the panel.
                                     # It is still ONE visible face per edge — the band
                                     # below the lip is buried by construction, which is
                                     # what the earlier flange got wrong by sitting 4 mm
                                     # PROUD of the skin and showing both.
    NOSE_LAMP_PROUD = 0.009          # how far the lens face stands off the sheet metal.
                                     # A CLEARANCE, not a styling choice: the clip section
                                     # has a KNEE at Z_HIP where the flank stops going
                                     # straight up and starts tucking toward the shoulder,
                                     # and the lens samples its own height at fixed
                                     # fractions, so between two of them it chords STRAIGHT
                                     # ACROSS that knee — 3.7 mm inside the metal at the
                                     # worst station.  At 4 mm the fender came out through
                                     # the lens as a red splinter.  9 mm clears it and
                                     # still reads flush; a real lens stands off its wing
                                     # about that.
                                     # IT IS ONE NUMBER NOW, not a ramp.  There used to be
                                     # a NOSE_LAMP_FACE table running -30 mm (deep in the
                                     # fascia pocket) to +9 (proud on the fender), because
                                     # the cluster spanned both.  With the pocket gone the
                                     # whole lamp sits on one surface, and one offset is
                                     # what "a light on a flat surface" means.
    FACE_X = (0.422, 0.438, 0.500, 0.575, 0.664, 0.724)
    N_FACE = len(FACE_X)             # stations on the nose face, before the corner
    N_BEZEL = 1                      # ...of which the first BAND is the inboard bezel —
                                     # and the LAST band of the whole path is the trailing
                                     # one, out on the fender.  16 mm each, and each leans
                                     # with the end face beside it so it stays 16 mm all
                                     # the way up: the same width as the top and bottom
                                     # returns, so the cluster is framed on all four sides.
    N_CLEAR = 4                      # ...and how many BANDS of it are the headlamp.
                                     # THE DIVIDER LANDS AT 0.664, so the amber gets
                                     # 60 mm of front face and everything else is round
                                     # the corner.  Measured off the reference front
                                     # shot, the amber is only ~15% of the cluster's
                                     # projected width — it reads big in a three-quarter
                                     # view because that is where the wrap faces the
                                     # camera, and putting the divider where the
                                     # three-quarter view suggests made the front view
                                     # 38% orange.
    # Convex apex added to the face at mid height.  The owner's note from 2026-09-04
    # stands — "the headlights are smooth curved objects, not rectangles" — so the
    # clear end keeps a real bulge; it fades out round the corner, where the lens is
    # following the fender's curvature instead of its own.
    NOSE_LAMP_BULGE = (0.022, 0.022, 0.022, 0.020, 0.012, 0.006,
                       0.004, 0.002, 0.0, 0.0, 0.0, 0.0)
    # How much of the lamp's height is eaten per station as it dies onto the flank,
    # and 66% of that comes off the BOTTOM: on the reference the top edge runs level
    # with the hood line right round the corner while the lower edge lifts away.  ZERO
    # across every front-face station — that whole stretch is the single rectangle
    # with one top edge that the reference cluster is.
    # THERE IS NO TAPER.  The lamp is a constant 202 mm from the grille to the point it
    # dies on the flank, and it ends on a flat bezelled cap rather than running out to
    # a point.  (218 mm since 2026-09-08: with the fascia pocket gone the lamp is no
    # longer inset 8 mm inside a hole, so its outer edges run level with the grille
    # opening's top and bottom instead of tucking under them.)
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
    # ONLY THE OUTBOARD END SLANTS.  On the fender the amber's trailing edge rakes
    # forward as it rises (owner, 2026-09-06: "push the side upper corner forwards a tiny
    # bit"), and that still stands.
    #
    # THE INBOARD END DOES NOT, since 2026-09-09: "the inner vertical edges of the
    # headlights are angled outwards.  make them straight".  It used to lean out by
    # LAMP_LEAN_IN, from the same 2026-09-06 pass ("pull the upper inside corner on the
    # front out a little bit"), which is REVERSED here — see the opening's own note.
    #
    # It is a displacement ALONG THE PATH TANGENT, scaled by height — positive is toward
    # the outboard end of the path, so the flank stations' NEGATIVE lean pulls their tops
    # forward.  BOTH trailing stations take the SAME lean, which is what keeps the bezel
    # band between them a constant 16 mm instead of a wedge: the band's two edges rake
    # together, so the frame follows the raked trailing edge rather than being pinched by
    # it.  The amber band ahead of them absorbs the width change, and absorbs it
    # invisibly — it is amber on both sides, so there is no material edge to see.
    NOSE_LAMP_LEAN = (0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
                      0.0, 0.0, 0.0, 0.0, -0.014, -0.014)
    # ROUND ON THE TOP OUTER CORNER (owner, 2026-09-06).  This is the one place the lens
    # is allowed to lose height, and it is a corner radius, not the taper that was
    # deleted: it comes off the TOP EDGE ONLY, starts outboard of the aperture, and the
    # base stays dead flat the whole way — so it cannot read as a wedge from any angle.
    # It grows to the end, which rounds the corner in the front view where the lens turns
    # AND at the trailing edge on the fender, the two places the reference shows a
    # radius.  If this ever starts reading as a taper again, it has crept inboard of
    # station 5; that is the line it must not cross.
    # AND IT IS SOLVED FROM ARC LENGTH, NOT TYPED PER STATION (2026-09-25).  As a
    # hand-typed ramp it started at station 6 — 192 mm back along a 520 mm path, more
    # than a third of the run — so the top edge left its straight line with a KINK and
    # then sagged the whole way round the corner.  That put the break within a station
    # of the clear/amber divider, and the owner read the result as the two lenses not
    # agreeing: "the marker/indicator is also discontinuous with the headlight at its
    # top edge".  This is the tail lamps' defect class exactly (see edge_fillet): a
    # radius spread over a third of a run IS a taper, and no amount of shrinking the
    # numbers fixes a wrong shape.
    #
    # edge_fillet() is a real circle measured back from the trailing tip: zero slope
    # where it starts, so the top edge runs DEAD LEVEL from the grille right around the
    # corner and only breaks in the last 40 mm, out on the fender where the reference
    # shows a radius.  The divider is 273 mm from that end and now sits on the flat.
    NOSE_LAMP_ROUND_R = 0.040
    NOSE_LAMP_TAIL = (0.0, 0.019, 0.035)
                                     # how far back along the STRAIGHT fender the lamp runs
                                     # past the rim blend, per station.  The LAST entry is
                                     # the trailing edge: 60 mm off IMG_0879 originally —
                                     # the reference amber shows ~135 mm from the side and
                                     # the rim is only 84 mm deep — pulled to 35 on
                                     # 2026-09-07 ("pull the rear edges of the ambers
                                     # forward a little"), leaving ~112 mm.  These are the
                                     # ONLY stations that move: everything ahead of them is
                                     # pinned to a rim ring, so shortening the lamp never
                                     # disturbs the corner it wraps.
                                     # THE MIDDLE ONE EXISTS TO CARRY THE BEZEL (owner,
                                     # 2026-09-10: "extend the headlight bezel on the
                                     # rearward side so that it frames the marker light
                                     # from the side just as it frames the headlight from
                                     # the front").  The trailing end used to be nothing but
                                     # the loft's dark end CAP, which is perpendicular to
                                     # the path — so from a side view, the one view the
                                     # marker light is actually seen in, it is edge-on and
                                     # the amber ran straight into the paint.  35 - 19 is
                                     # 16 mm, the same width as BEZEL_U's returns and the
                                     # inboard band, so all four sides of the cluster now
                                     # carry one frame.

    def head_lamp(sx):
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
                yb = CLIP_ST[0][0] - NOSE_LAMP_TAIL[j - len(NOSE_RIM)]
                x, y = ring_flank(clip_ring(yb), z)
            return (sx * abs(x), y)

        n = N_FACE + len(NOSE_RIM) + len(NOSE_LAMP_TAIL)   # face, rim rings, flank
        for sched in (NOSE_LAMP_BULGE, NOSE_LAMP_LEAN):
            assert len(sched) == n, "one entry per path station"
        zm = 0.5 * (OPEN_Z0 + OPEN_Z1)
        path = [station(i, zm) for i in range(n)]
        # Cumulative arc length along the plan path, so the corner round-off can be a
        # circle of a stated radius rather than a per-station guess — the stations are
        # bunched hard through the rim and sparse on the face, so anything keyed to the
        # station INDEX changes shape the moment a station is added or moved.
        cum = [0.0]
        for i in range(1, n):
            cum.append(cum[-1] + math.hypot(path[i][0] - path[i - 1][0],
                                            path[i][1] - path[i - 1][1]))
        round_z = [edge_fillet(cum[-1] - c, NOSE_LAMP_ROUND_R) for c in cum]

        # Outward normal = the plan tangent turned a quarter turn, taken from the
        # NEIGHBOURS so consecutive sections share it and the sweep cannot kink.
        # It points +y (forward) along the nose face and swings to +x (outboard)
        # as the path turns back down the flank.  sx flips the turn with the side.
        nrm = []
        for i in range(n):
            a, b = path[max(0, i - 1)], path[min(n - 1, i + 1)]
            tx, ty = b[0] - a[0], b[1] - a[1]
            L = math.hypot(tx, ty) or 1.0
            nrm.append((-sx * ty / L, sx * tx / L, tx / L, ty / L))

        u_mid = _lens_mid_knots(station, nrm, round_z, n, OPEN_Z0, OPEN_Z1, BEZEL_U)

        rings = []
        for i in range(n):
            nx, ny, ux, uy = nrm[i]                      # ux, uy: unit tangent, for the lean
            # ONE floor for every station, clear lens and amber alike — that is the
            # whole of "square", and the floor never varies.  The ceiling only comes
            # down for the corner radius, out where the lamp dies on the fender.
            z0, z1 = OPEN_Z0, OPEN_Z1 - round_z[i]
            h, off, bul = z1 - z0, NOSE_LAMP_PROUD, NOSE_LAMP_BULGE[i]
            lean = NOSE_LAMP_LEAN[i]

            def at(o, u, i=i, nx=nx, ny=ny, ux=ux, uy=uy, z0=z0, h=h, lean=lean):
                z = z0 + h * u
                bx, by = station(i, z)
                d = lean * u                             # zero at the base, full at the top
                return (bx + nx * o + ux * d, by + ny * o + uy * d, z)
            # 0 and 6 are the buried deep edge, 1 and 5 the lip AT the skin, 2..4 the
            # lit face.  So bands 1 and 4 ARE the bezel — one visible face each — 0 and
            # 5 are inside the panel, and 6 is the back plane.
            ring = [at(off - NOSE_LAMP_BACK, 0.0), at(-BEZEL_LIP, 0.0),
                    at(off, BEZEL_U), at(off + bul, u_mid[i]), at(off, 1.0 - BEZEL_U),
                    at(-BEZEL_LIP, 1.0), at(off - NOSE_LAMP_BACK, 1.0)]
            rings.append(ring)
        # The clear/amber divider is a band material, not a body boundary — see the note
        # above — and so is the bezel: section bands 2 and 3 are the lit face, everything
        # else is dark, and the whole FIRST path band is dark to bezel the inboard end.
        def lens_mat(seg, k):
            if k not in (2, 3) or seg < N_BEZEL or seg >= n - 1 - N_BEZEL:
                return DARK
            return "RangerLens" if seg < N_CLEAR else "RangerAmber"
        # Both caps are bezel-dark: the inboard one butts the grille surround, the
        # outboard one is where the lens dies on the fender.  Band 6 is the section's
        # back plane, 17 mm inside the sheet metal, and is never drawn — same call as
        # TAIL_LAMP_BURIED.
        loft(p, rings, "RangerLens", band_mats=lens_mat, skip=lambda _s, k: k == 6,
             cap_first_mat=DARK, cap_last_mat=DARK)

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

    # Tail lamps — see the note above tail_skin_at().  They wrap the bed's rear
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
        #
        # THE BOTTOM EDGE IS THE MODEL'S LOWEST POINT, so it is also what shiftDown is
        # derived from: raise it and data/vehicle-models.js has to be re-copied from
        # report()'s printout or the truck floats by exactly the difference.  Owner,
        # 2026-09-22: "make the mudflaps slightly shorter" — 0.108 to 0.146, so they
        # hang 328 -> 290 mm and clear the ground by 146 mm rather than 108.
        box(p, sx * 0.590, sx * 0.816, -2.132, -2.100, 0.146, 0.389, "RangerTrim")


# ---------------------------------------------------------------------------
# EXTERIOR TRIM
# ---------------------------------------------------------------------------
# THE ROOT IS ON THE SAIL PATCH (owner, 2026-09-22: "reattach the wing mirrors").  It
# used to be pinned to the door SKIN, at or below the beltline, because above the belt
# there was nothing but glass to bolt to.  Lowering the belt made that placement read as
# a mirror stuck to the middle of the door, and the patch — which is where the real one
# mounts — now exists to carry it.  x is the patch's own plane, so the wedge emerges
# through it instead of floating beside it.
MIRROR_AT = (0.759, 0.660, 1.120)   # sail-mount root, ON THE A-PILLAR.  It has to touch
                                    # metal: parked in the window opening with only the
                                    # cabin behind it, the wedge reads from three-quarter
                                    # front as daylight between the mirror and the truck.
                                    # The pillar is 68 mm wide now, which is enough to
                                    # land the mount on without a patch under it.


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
        box(p, sx * 0.796, sx * 0.822, -0.320, -0.188, 0.949, 0.987, "RangerTrim")

    # Cowl: the black plenum strip at the base of the windscreen, plus two wipers.
    # Without it the glass runs straight into the hood and the nose reads unfinished.
    box(p, -0.672, 0.672, Y_COWL - 0.006, Y_COWL + 0.062, 1.158, 1.186, DARK)
    for x in (-0.402, 0.128):
        strut(p, (x, Y_COWL + 0.030, 1.188), (x + 0.300, Y_COWL + 0.018, 1.196),
              0.020, 0.014, "RangerTrim")

    # NO antenna mast here.  It is built procedurally by src/vehicle-model.js so it can
    # BEND under the truck's motion; a mast baked into this mesh can only ride it rigidly.
    # Its mount is `antenna` in data/vehicle-models.js, taken from where it used to stand:
    # (0.782, 1.020, 1.118) -> (0.812, 1.002, 1.928) here, radius 0.011, RangerTrim.


# ---------------------------------------------------------------------------
# INTERIOR — the cockpit camera's reason to exist.
# Read through glass against a bright flank, only the VALUE gap survives, so the
# whole tub is near-black and the seats are the one thing lifted off it.
# ---------------------------------------------------------------------------
def build_interior(p):
    # Transmission tunnel down the centre of the floor.
    # Everything standing ON the cab floor starts 8 mm above it.  Sharing the plane
    # exactly puts a coincident face pair under each fitting.
    hexa(p, [(-W_TUNNEL, -0.415, Z_FLOOR + 0.008), (W_TUNNEL, -0.415, Z_FLOOR + 0.008),
             (W_TUNNEL, Y_COWL, Z_FLOOR + 0.008), (-W_TUNNEL, Y_COWL, Z_FLOOR + 0.008),
             (-W_TUNNEL + 0.045, -0.415, Z_TUNNEL), (W_TUNNEL - 0.045, -0.415, Z_TUNNEL),
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
    Y_DASH = 0.427                          # rear edge of the pad
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
    strut(p, (-0.355, 0.355, 1.019), (-0.355, 0.557, 0.933), 0.086, 0.078, DARK)

    # --- Console + shifter --------------------------------------------------
    hexa(p, [(-0.168, 0.043, Z_TUNNEL - 0.040), (0.168, 0.043, Z_TUNNEL - 0.040),
             (0.168, 0.347, Z_TUNNEL - 0.040), (-0.168, 0.347, Z_TUNNEL - 0.040),
             (-0.150, 0.043, 0.868), (0.150, 0.043, 0.868),
             (0.150, 0.347, 0.842), (-0.150, 0.347, 0.842)], DARK)
    strut(p, (-0.016, 0.209, 0.842), (-0.016, 0.133, 0.986), 0.030, 0.030, DARK)
    box(p, -0.046, 0.014, 0.101, 0.161, 0.982, 1.028, "RangerTrim")      # shift knob

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
        loft(p, [seat_section(cx, 0.230, hz, -0.315, zc, 0.030),
                 seat_section(cx, 0.232, hz, -0.075, zc, 0.034),
                 seat_section(cx, 0.222, hz * 0.86, 0.125, zc - 0.022, 0.030)],
             "RangerSeat")
        # Back: swept BOTTOM-TO-TOP, so its slices are horizontal (x-y at fixed z),
        # not vertical like the cushion's.  Leans back and narrows into the headrest.
        back = [(-0.319, Z_CUSHION - 0.030, 0.228, 0.056),
                (-0.357, 1.110, 0.226, 0.054),
                (-0.397, Z_SEATBACK - 0.130, 0.214, 0.050),
                (-0.423, Z_SEATBACK - 0.036, 0.176, 0.046),
                (-0.435, Z_SEATBACK, 0.140, 0.038)]
        loft(p, [seat_section_h(cx, hw, ht, cy, cz, 0.026)
                 for cy, cz, hw, ht in back], "RangerSeat")

    # --- Door cards: an armrest and a pull, both proud of the tub wall ---------
    for sx in (1, -1):
        box(p, sx * 0.636, sx * 0.700, -0.091, 0.269, 0.930, 0.984, DARK)
        box(p, sx * 0.660, sx * 0.700, 0.043, 0.213, 0.943, 0.983, "RangerTrim")

    # --- Overhead: mirror and two visors.  Cheap, and they sell the cockpit. ----
    # HUNG OFF Z_HEADLINER, never typed.  These were hand-placed against a 1.526
    # ceiling; thinning the roof raised it 30 mm and left all three floating in the
    # air.  As offsets they simply come along.
    hl = Z_HEADLINER
    box(p, -0.062, 0.062, 0.019, 0.111, hl - 0.080, hl - 0.026, DARK)
    strut(p, (-0.062, 0.167, hl - 0.056), (-0.062, 0.045, hl - 0.056),
          0.026, 0.026, DARK)
    for sx in (1, -1):
        hexa(p, [(sx * 0.130, 0.133, hl - 0.032), (sx * 0.560, 0.133, hl - 0.032),
                 (sx * 0.560, 0.043, hl - 0.032), (sx * 0.130, 0.043, hl - 0.032),
                 (sx * 0.130, 0.157, hl - 0.016), (sx * 0.560, 0.157, hl - 0.016),
                 (sx * 0.560, 0.065, hl - 0.016), (sx * 0.130, 0.065, hl - 0.016)],
             DARK)


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
    prism's other cross axis.  Used for pillars and the shifter."""
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


# ---------------------------------------------------------------------------
# THE GREENHOUSE IS ONE RULED SKIN — rewritten 2026-09-22.
#
# Owner: "its clear they're an assortment of boxes meeting at nodes.  figure out the
# cheapest way to blend them into one continuous face or a door face and a roof face."
# Right, and it was structural, not a matter of nudging.  The A/B/C pillars were prisms
# CENTRED on their own hand-typed lines, the drip rail was a box and the roof was a
# third box — four different half widths for what is physically one panel:
#
#     pillar feet 0.764 | pillar heads 0.700 | drip rail 0.706 | roof side 0.676
#
# so the surface stepped in and out four times on the way up, and every joint was a
# node.  No amount of tuning fixes that; the fault is that there were four numbers.
#
# There is ONE number now: gh_x(z), a straight tumblehome from the door shoulder
# (W_BELT at Z_BELT, exactly where cab_ring leaves off) to the roof edge (W_ROOF at
# Z_ROOF).  Every greenhouse part puts its OUTER FACE on it —
#   * the pillars, from their feet up to the daylight-opening line;
#   * the cant rail, which is not a part at all any more: it is the roof's own turned-
#     down edge, one loft section running crown -> deck -> over the edge -> down the
#     tumblehome -> under the rail -> back along the headliner;
#   * the glass, one inset behind it.
# Pillar and rail then meet BUTTED on the same plane at Z_DLO_TOP, which flat shading
# draws as no seam at all: a door face and a roof face, which is what was asked for.
# The two deleted drip-rail boxes paid for the roof section's extra points.
# ---------------------------------------------------------------------------
Z_DLO_TOP = 1.534       # daylight-opening top = the cant rail's lower edge.  Pillars
                        # END here and the rail's outer face STARTS here, so the two
                        # butt rather than overlap — coplanar-and-butted is a seam,
                        # coplanar-and-overlapping is a z-fight (see audit()).
W_RAIL_IN = 0.662       # rail inner face — the reveal the side glass tucks up behind.
                        # IT HAS TO CLEAR THE SCREENS (asserted in report()).  The rail
                        # hangs 36 mm below the headliner, so anywhere it overlaps a
                        # screen in plan the aperture's top line steps down by that much
                        # and the corner reads as a notch — which is exactly what it did
                        # at 0.646.  Outboard of the windscreen's own edge it cannot:
                        # the headliner is then the only thing cutting the pane, and the
                        # top of the aperture is one straight line all the way across.
ROOF_EDGE = 0.018       # chamfer where the roof deck turns down onto the tumblehome.
                        # 26 mm until the roof was thinned: the band it is a chamfer ON
                        # is only 48 mm tall now, and a chamfer that eats half of its
                        # own face stops reading as a highlight and starts reading as
                        # the face.
PILLAR_TUCK = 0.014     # how far a pillar's stub above Z_DLO_TOP necks IN — outboard,
PILLAR_TUCK_Y = 0.008   # and fore-and-aft.  The stub has to go somewhere, and left at
                        # full section every face of it is coplanar with something: its
                        # outer face with the rail's, its top cap with the rail's
                        # underside, and — for the A and C pillars, whose edge lines ARE
                        # the header planes — its front and rear faces with the roof's
                        # own caps.  Necked on both axes it is simply buried, and the
                        # visible pillar still dies exactly on Z_DLO_TOP.
GLASS_INSET = 0.010     # side glass, behind the skin
SCREEN_REVEAL = 0.040   # windscreen / backlight: how much painted pillar they leave
                        # showing outboard.  Must stay under the pillar thickness or
                        # the glass edge falls off the back of the front face.
SCREEN_INSET = 0.012    # ...and how far behind the header face they sit, so the glass
                        # and the raked cap are parallel but never coplanar.


def gh_x(z):
    """Half width of the cab's outer skin at height z.  THE greenhouse surface."""
    return W_BELT + (W_ROOF - W_BELT) * (z - Z_BELT) / (Z_ROOF - Z_BELT)


# Pillars as (y, z) ONLY.  x is not typed anywhere: it comes off gh_x(), which is the
# whole point of the rewrite.
A_FOOT = (0.661, 1.168)    # A-pillar foot, on the cowl deck.  Sunk below it and the
                           # section pokes out through the hood.
A_HEAD = (0.1438, 1.580)   # ...and its head, buried in the roof's front corner.  The
                           # heads are ON THE SAME RAKE as before, just carried higher:
                           # they have to clear Z_HEADLINER so the top cap stays inside
                           # the slab, and the slab's underside went up 30 mm.
# THE C-PILLAR SITS ON THE CAB, not 28 mm behind it.  Its rear edge is the whole cab's
# rear surface — the panel, the roof's rear cap and the brake light all key off it — and
# it used to land at y -0.658 while the cab loft's own rear cap is at Y_CAB_REAR (-0.630).
# So the entire upper rear panel overhung the lower body, and what you saw from behind
# was the UNDERSIDE of that overhang: 62 cm2 of downward-facing paint with nothing below
# it.  The rear edge now lands 3.6 mm inside Y_CAB_REAR at the beltline — inside, so the
# cab's own cap hides the panel's bottom edge and the pillar's foot; not flush, because
# flush is coplanar.  It also makes the cab-to-bed gap the same 80 mm above the beltline
# as below, which is what Y_BED_F's comment always claimed it was.
C_FOOT = (-0.4860, 1.063)
C_HEAD = (-0.4178, 1.580)
# THERE IS NO B-PILLAR (owner, 2026-09-25: "let's get rid of the split window and make it
# just a regular window").  A regular-cab Ranger has one door glass and no quarter light;
# the division was a line read off the reference that is not actually there.
PILLARS = ((A_FOOT, A_HEAD, PILLAR_A, PILLAR_T_A),
           (C_FOOT, C_HEAD, PILLAR_C, PILLAR_T_C))
C_RAKE = (C_HEAD[0] - C_FOOT[0]) / (C_HEAD[1] - C_FOOT[1])
A_RAKE = (A_HEAD[0] - A_FOOT[0]) / (A_HEAD[1] - A_FOOT[1])


def pillar_rake(foot, head):
    """(dy/dz, cosine of the rake) for a pillar given as two (y, z) points."""
    dy, dz = head[0] - foot[0], head[1] - foot[1]
    return dy / dz, dz / math.hypot(dy, dz)


def pillar_edge_y(foot, head, width, z, s):
    """y of a pillar's front (s = +1) or rear (s = -1) edge at height z.

    A HORIZONTAL cut through a raked slab spans width / cos(rake), which is why this
    is not just width/2: the pillar's face is `width` across measured square to it.
    """
    m, dzn = pillar_rake(foot, head)
    return foot[0] + m * (z - foot[1]) + s * 0.5 * width / dzn


# THE WINDOW SURROUND IS ONE WIDTH ON ALL FOUR EDGES, AND IT IS THE WIDTH YOU SEE.
# Until 2026-09-25 every edge inset by the same 20 mm measured in its OWN axis, which
# is not the same thing at all: the A-pillar rakes 51 degrees, so 20 mm of y drew a
# 12 mm band beside it, and the top edge's outer line was GLASS_TOP_Z — 16 mm ABOVE the
# cant rail's underside — so 16 of its 20 mm were buried behind the rail and 4 mm
# showed.  Owner: "the top is way too thin and the sides are a little too thin ... the
# bottom can be slightly thicker than the other sides".  Each raked edge now takes
# TRIM_VIS * hypot(rake, 1) so the band measures TRIM_VIS SQUARE TO ITSELF, and the top
# is measured down from Z_DLO_TOP, the line the eye actually reads.
TRIM_VIS = 0.028        # visible width of the surround on the top, front and rear...
TRIM_VIS_B = 0.038      # ...and along the bottom, the one edge allowed to be heavier.


def _trim_dy(m):
    """Horizontal offset that draws a band TRIM_VIS wide SQUARE to an edge raked m.

    A horizontal cut through a line raked m = dy/dz is longer than the perpendicular
    distance by hypot(m, 1) — the same factor pillar_edge_y() applies to a pillar's
    width, and for the same reason.
    """
    return TRIM_VIS * math.hypot(m, 1.0)


def _solve_glass_bottom(dy):
    """Height at which the window aperture's FRONT edge crosses the cab's shoulder.

    THE GLASS STARTS HERE, not at the sheet-metal belt.  Lower than this the aperture's
    front boundary has run forward of the cowl and the sill is above it, so a pane drawn
    down to the belt gets its front corner sliced off at an angle and stops being a quad.
    Solved, never typed: the pillar's rake, its width, the surround's own width and the
    cowl's step have each moved this month and all four land here.  `dy` is how far the
    aperture sits behind the pillar's rear edge — widening the surround moves the
    crossing DOWN, which is why the solve takes it rather than assuming zero.
    """
    lo, hi = Z_BELT, 1.30
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        y = pillar_edge_y(A_FOOT, A_HEAD, PILLAR_A, mid, -1) - dy
        if _interp(CAB_ST, y)[2] - mid > 0.0:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


# ...and the bottom band is whichever is TALLER: the height the quad constraint forces,
# or TRIM_VIS_B.  Neither one alone is safe — the first can come out thinner than the
# other three edges, the second can slice the front corner off.
GH_BELT = max(Z_BELT + TRIM_VIS_B, _solve_glass_bottom(_trim_dy(A_RAKE)))


def pillar_frame(foot, head, width, thick, sx, chamfer=0.0):
    """(rings, front_edge, rear_edge) for one window pillar.

    `chamfer` bevels the REAR-OUTER corner of the section, which is the cab's own
    trailing edge above the beltline — see CAB_END_EDGE.  It adds a point, so the C
    pillar's section is five-sided where the A's is four: the band map keys off that
    (SKIN_BAND in build_greenhouse).

    THE WAVY-LINE FIX, kept and extended (owner, 2026-08-25: "the A pillar line where
    the window glass meets the pillar should be much straighter and less wavy").  The
    pillar and the glass edges beside it still come off ONE line, so they are parallel
    by construction rather than by nudging three hand-typed lines toward each other.
    What is new is that the line lives ON gh_x(): the returned edges are the pillar's
    front and rear edges AS DRAWN, on the skin, and every consumer insets from there.

    THE RINGS ARE HORIZONTAL, not square to the pillar.  The edge lines come out the
    same either way — see pillar_edge_y — but a horizontal top ring lands flat on
    Z_DLO_TOP, and that is what lets the pillar butt the cant rail instead of crossing
    it at the rake angle and leaving the notch the owner could see in the corner.
    """
    m, _dzn = pillar_rake(foot, head)

    def yc(z):
        return foot[0] + m * (z - foot[1])

    hy = pillar_edge_y(foot, head, width, foot[1], 1) - yc(foot[1])

    def ring(z, tuck=0.0, tuck_y=0.0):
        xo, h = gh_x(z) - tuck, hy - tuck_y
        rear = [(sx * xo, yc(z) - h, z)] if not chamfer else [
            (sx * xo, yc(z) - h + chamfer, z), (sx * (xo - chamfer), yc(z) - h, z)]
        return ([(sx * xo, yc(z) + h, z)] + rear
                + [(sx * (xo - thick), yc(z) - h, z), (sx * (xo - thick), yc(z) + h, z)])

    rings = [ring(foot[1]), ring(Z_DLO_TOP),
             ring(head[1], PILLAR_TUCK, PILLAR_TUCK_Y)]
    zs = (foot[1], head[1])
    front = [(sx * gh_x(z), yc(z) + hy, z) for z in zs]
    rear = [(sx * gh_x(z), yc(z) - hy, z) for z in zs]
    return rings, front, rear


def _edge_at_z(e0, e1, z):
    """Point at height z on a pillar edge line, extrapolated past the ends if need be
    — the glass top sits below the pillar head and the sill above its foot."""
    t = (z - e0[2]) / (e1[2] - e0[2])
    return tuple(e0[k] + (e1[k] - e0[k]) * t for k in range(3))


def _inset_line(line, sx, dx, dy=0.0):
    """A pillar edge line moved dx inboard and dy along y.  Still a straight line, so
    _edge_at_z() still reads it, and a pane built from two of them is still planar."""
    return [(x - sx * dx, y + dy, z) for x, y, z in line]


ROOF_BANDS = {4: DARK, 5: DARK, 6: DARK, 7: DARK}   # rail inner faces + headliner


# Direction each point of roof_ring()'s outline moves when the rear ring is bevelled —
# along its own OUTWARD normal, which bevel_ring() cannot do because it only moves x.
# The roof's rear edge is horizontal across the top, so up there the chamfer is a drop
# in z; by the time it reaches the cant rail it is a move inboard; the roof's own side
# chamfer in between takes both.  The last three are the rail's inner face and the
# headliner — inside the cabin, and they stay put.
ROOF_BEVEL = ((0.0, -1.0), (0.0, -1.0), (-0.707, -0.707), (-1.0, 0.0),
              (0.0, 0.0), (0.0, 0.0), (0.0, 0.0))


def roof_ring(rake, y0, inset=0.0):
    """Roof section at one end of the loft, LEANING at `rake` with the screen it closes.

    The caps used to be vertical planes at a constant y, and the A-pillar — raked 51
    degrees — crossed one: its head stuck out through the header, which is the notch
    in the front corner.  A cap that leans at the SAME rake is edge-on to the screen,
    so the pillar runs into the header and there is nothing left to see.  It costs
    nothing: a loft ring is a list of points and they were never obliged to share a y.
    """
    def y(z):
        return y0 + rake * (z - Z_DLO_TOP)
    ze = Z_ROOF - ROOF_EDGE
    r = [(0.0, Z_ROOF + Z_ROOF_CROWN), (W_ROOF - ROOF_EDGE, Z_ROOF),
         (gh_x(ze), ze), (gh_x(Z_DLO_TOP), Z_DLO_TOP),
         (W_RAIL_IN, Z_DLO_TOP), (W_RAIL_IN, Z_HEADLINER), (0.0, Z_HEADLINER)]
    if inset:
        r = [(x + inset * dx, z + inset * dz)
             for (x, z), (dx, dz) in zip(r, ROOF_BEVEL)]
    return ([(x, y(z), z) for x, z in r]
            + [(-x, y(z), z) for x, z in reversed(r[1:-1])])


WS_BASE_Y, WS_BASE_Z = 0.685, 1.160    # windscreen bottom edge
WS_TOP_Y, WS_TOP_Z = 0.194, 1.566      # windscreen top edge, 10 mm up INSIDE the roof:
                                       # the visible top of the aperture is the header's
                                       # own lower edge at Z_HEADLINER, not the pane
WS_HALF_B, WS_HALF_T = 0.704, 0.646    # nominal half width — report()'s clearance
                                       # plane only; the pane's own edges are the
                                       # A-pillar's, and always were
BL_BASE_Z, BL_TOP_Z = Z_RAIL, 1.578    # bottom edge FLUSH WITH THE BED RAILS     # backlight.  Its y is not typed: the pane takes
                                       # its edges from the C-pillar and the panel around
                                       # it rides that same rear surface.
BL_HALF_B, BL_HALF_T = 0.640, 0.545    # tapered in at the top, following the
                                       # cab's own tumblehome (owner, ref photo 3)
GLASS_TOP_Z = 1.550                    # side glass tucks up behind the rail's underside
Y_DGLASS_R = -0.250                    # THE WINDOW'S TRAILING EDGE, and it is its own
                                       # line, not the C-pillar's (owner, 2026-09-25:
                                       # "there's a fair amount of cab body behind the
                                       # side windows" on the reference, "whereas our side
                                       # windows go almost all the way to the back").
                                       # Measured there: the glass stops 264 mm ahead of
                                       # the cab's rear, 22% of the cab's length; ours
                                       # stopped 75 mm short of it.  It reuses the
                                       # C-pillar's rake so the two read as parallel
                                       # members rather than closing into a wedge.


TRIM_SINK = 0.004       # window trim: how far the band is recessed from the skin.
                        # Its WIDTHS are TRIM_VIS / TRIM_VIS_B, up beside GH_BELT —
                        # the glass bottom is solved from them, so they have to exist
                        # before it does.


def dlo_inner(sx):
    """(y, z) of the window APERTURE's four corners — the inside of the trim band.

    The frame and the pane are cut from this one list, so the glass cannot drift out of
    its own surround.  The top is Z_DLO_TOP - TRIM_VIS, NOT GLASS_TOP_Z - TRIM_VIS: the
    frame's outer top edge is deliberately tucked 16 mm up behind the cant rail, so
    measuring the band from there hides most of it.  The bottom carries TRIM_VIS_B or
    whatever the quad constraint forces, whichever is taller — see GH_BELT.
    """
    af = pillar_frame(A_FOOT, A_HEAD, PILLAR_A, PILLAR_T_A, sx)[2]
    zb, zt = GH_BELT, Z_DLO_TOP - TRIM_VIS
    def fy(z):
        return _edge_at_z(*af, z)[1] - _trim_dy(A_RAKE)
    def ry(z):
        return Y_DGLASS_R + C_RAKE * (z - GH_BELT) + _trim_dy(C_RAKE)
    return [(fy(zb), zb), (ry(zb), zb), (ry(zt), zt), (fy(zt), zt)]


def build_greenhouse(p):
    # ROOF AND CANT RAIL, ONE LOFT.  Two stations, each leaning with its own screen,
    # and the headers land exactly on the A and C pillar edges rather than near them.
    ra, _ = pillar_rake(A_FOOT, A_HEAD)
    rc, _ = pillar_rake(C_FOOT, C_HEAD)
    y_hdr_f = pillar_edge_y(A_FOOT, A_HEAD, PILLAR_A, Z_DLO_TOP, 1)
    y_hdr_r = pillar_edge_y(C_FOOT, C_HEAD, PILLAR_C, Z_DLO_TOP, -1)
    # THREE STATIONS, NOT TWO: the last 22 mm are the cab's trailing chamfer, carried
    # across the top of the back face so it meets the C-pillar's at the cant rail and
    # the cab shell's below that — one unbroken bevel right round the rear opening.
    loft(p, [roof_ring(ra, y_hdr_f),
             roof_ring(rc, y_hdr_r + CAB_END_EDGE),
             roof_ring(rc, y_hdr_r, CAB_END_EDGE)], "RangerPaint",
         band_mats=ROOF_BANDS)

    # THE STUB ABOVE THE RAIL IS INTERIOR-DARK, not paint.  Every face of it is buried
    # except its inboard one, which hangs below the rail's own inner face and is seen
    # through the backlight — as a bright wedge of body colour against the headliner,
    # which is exactly what it looked like.  Dark, it is trim meeting trim.
    # ...EXCEPT ITS OUTWARD FACE, which is not buried at all.  Each pillar has one:
    # the A-pillar's front and the C-pillar's rear are the ends of the cab, and the
    # stub stands 6 mm proud of the screen panel beside it, so dark drew a 32 x 18 mm
    # hole at the top corner of EACH screen — the owner's "little gaps at all four
    # corners of the rear glass", and the windscreen had the same pair.
    #
    # THE C-PILLAR ALSO CARRIES THE CAB'S TRAILING CHAMFER.  CAB_END_EDGE bevels the cab
    # shell's rear corner, but the shell stops at the beltline, so the chamfer died there
    # and the corner went square for the whole height of the greenhouse (owner,
    # 2026-09-26: "there's a chamfer on the rear edge of the cab, but it gets cut off
    # ... make that chamfer continuous all the way around the back face").  Same 22 mm,
    # same corner, carried by the pillar's own section from its foot at the belt to its
    # head in the roof — and roof_ring() picks it up from there and takes it across the
    # top.
    #
    # The A-pillar's ring is outer-front, outer-rear, inner-rear, inner-front; the C's
    # has the chamfer spliced in after outer-front.  So the SKIN bands — paint, not
    # interior dark — are 3 on the A, and 1 (the chamfer) and 2 (the rear face) on the C.
    SKIN_BAND = ((3,), (1, 2))
    for sx in (1, -1):
        for n_p, (foot, head, w, t) in enumerate(PILLARS):
            ch = CAB_END_EDGE if n_p else 0.0
            loft(p, pillar_frame(foot, head, w, t, sx, ch)[0], "RangerPaint",
                 band_mats=lambda seg, k, b=SKIN_BAND[n_p]:
                     None if (not seg or k in b) else DARK,
                 cap_last_mat=DARK)

    # QUARTER PANEL — the painted body between the window's trailing edge and the
    # C-pillar.  Pulling the glass forward to Y_DGLASS_R left that as a hole straight
    # into the cabin: the side glass used to run all the way to the pillar, so nothing
    # had ever needed to fill it.  A slab on gh_x(), so its outer face is the same one
    # surface as the pillar beside it and the rail above it.
    # It over-runs at BOTH ends on purpose.  Its bottom sits below the beltline and its
    # top inside the rail, because a face that lands exactly on either lands coplanar
    # with the shell's belt ledge or the rail's underside and z-fights; and its rear
    # face laps 10 mm INTO the C-pillar for the same reason.
    QP_T = 0.048
    for sx in (1, -1):
        def ring(zs):
            out = []
            for z, y in zs:
                out.append((sx * gh_x(z), y, z))
            for z, y in reversed(zs):
                out.append((sx * (gh_x(z) - QP_T), y, z))
            return out
        z0, z1 = Z_BELT - 0.030, Z_DLO_TOP + 0.014
        front = [(z, Y_DGLASS_R + C_RAKE * (z - GH_BELT) + 0.008) for z in (z0, z1)]
        rear = [(z, pillar_edge_y(C_FOOT, C_HEAD, PILLAR_C, z, 1) - 0.010) for z in (z0, z1)]
        loft(p, [ring(front), ring(rear)], "RangerPaint")

    # WINDOW TRIM — a dark band all the way ROUND the glass, which is what the reference
    # has (owner, 2026-09-25: "it could look good if it framed the entire window").  It
    # replaces the strip that ran only along the bottom, and it earns the bottom strip's
    # height back by being the thing that covers the belt rather than sitting on top of
    # it: the frame's outer bottom edge IS Z_BELT, its inner edge is GH_BELT.
    for sx in (1, -1):
        af = pillar_frame(A_FOOT, A_HEAD, PILLAR_A, PILLAR_T_A, sx)[2]
        def pt(y, z):
            return (sx * (gh_x(z) - TRIM_SINK), y, z)
        outer = [pt(_edge_at_z(*af, Z_BELT)[1], Z_BELT),
                 pt(Y_DGLASS_R + C_RAKE * (Z_BELT - GH_BELT), Z_BELT),
                 pt(Y_DGLASS_R + C_RAKE * (GLASS_TOP_Z - GH_BELT), GLASS_TOP_Z),
                 pt(_edge_at_z(*af, GLASS_TOP_Z)[1], GLASS_TOP_Z)]
        frame(p, outer, [pt(y, z) for y, z in dlo_inner(sx)],
              DARK, (sx, 0.0, 0.0))

    # Cab rear panel above the beltline, either side of the backlight, plus the
    # header strip over it — the backlight is a hole in a panel, not a floating pane.
    #
    # IT RIDES THE C-PILLAR'S REAR EDGE, 6 mm forward of it.  Pinned to a constant y
    # it sat 35 mm AHEAD of that edge, so the glass — which has always taken its own
    # edges from the pillar — hung out behind the panel and the aperture was whatever
    # the pillar allowed rather than what BL_HALF asks for.  On the rake, the panel and
    # the pillar are one rear surface with the post standing a little proud of it, and
    # the pane is back inside the hole.  6 mm, not 0: flush, the two rear faces are
    # coplanar where the panel's outer edge runs under the pillar, which z-fights.
    # That outer edge shadows gh_x() 14 mm inboard for the same reason.
    # ONE PLANE, AND IT IS THE PILLAR'S OWN REAR FACE.  The panels used to sit 6 mm
    # forward of it and stop 14 mm short of the flank, so the C-pillar stood proud all
    # the way round the backlight and the window read as a frame sunk into the back of
    # the cab (owner, 2026-09-26: "the frame around the rear window is inset a little
    # bit relative to the rest of the back wall ... make all of those vertices line up
    # so it looks like one continuous piece of sheet metal").  Flush now, and the
    # panels run out to the pillar's INNER edge — a butt joint, not an overlap, which
    # is what the 6 mm was avoiding.  Outboard of that the pillar's own rear face and
    # then its chamfer carry the surface to the corner.
    def rear_face(z):
        return pillar_edge_y(C_FOOT, C_HEAD, PILLAR_C, z, -1)

    def rear_edge_x(z):
        return gh_x(z) - PILLAR_T_C

    for sx in (1, -1):
        zb, zt = BL_BASE_Z - 0.03, BL_TOP_Z
        yb, yt = rear_face(zb), rear_face(zt)
        xb, xt = rear_edge_x(zb), rear_edge_x(zt)
        hexa(p, [(sx * BL_HALF_B, yb, zb), (sx * xb, yb, zb),
                 (sx * xb, yb + 0.05, zb), (sx * BL_HALF_B, yb + 0.05, zb),
                 (sx * BL_HALF_T, yt, zt), (sx * xt, yt, zt),
                 (sx * xt, yt + 0.05, zt), (sx * BL_HALF_T, yt + 0.05, zt)],
             "RangerPaint")

    # ...and the panel BELOW the backlight.  Raising the glass to the bed rail left the
    # band between it and the beltline looking straight into the cabin: the side hexas
    # above only close the aperture's sides, never its floor.
    #
    # IT RUNS OUT TO THE FLANK, not to BL_HALF_B + 30 mm.  Stopped at 0.670 it left a
    # bare corner either side — the side hexas start 30 mm ABOVE the glass line, so
    # between the beltline and there, outboard of 0.670, the cab rear was simply OPEN
    # and a ray fired at it came out on the dash (owner, 2026-09-25: "there are little
    # gaps at all four corners of the rear glass").  rear_edge_x() is the same outer
    # edge the side panels use, so the three now share one line.
    zb, zt = Z_BELT - 0.010, BL_BASE_Z + 0.006
    xb, xt = rear_edge_x(zb), rear_edge_x(zt)
    yb, yt = rear_face(zb), rear_face(zt)
    hexa(p, [(-xb, yb, zb), (xb, yb, zb), (xb, yb + 0.05, zb), (-xb, yb + 0.05, zb),
             (-xt, yt, zt), (xt, yt, zt), (xt, yt + 0.05, zt), (-xt, yt + 0.05, zt)],
         "RangerPaint")

    # Third brake light, high on the cab rear — dead centre, unmistakable at night.
    # It rides the same rear surface: a box at a constant y sat buried at its bottom
    # edge and floated off the panel at its top once that surface started leaning.
    #
    # ITS TOP IS Z_HEADLINER, not Z_DLO_TOP (owner, 2026-09-22: "move the center brake
    # light up to meet the roof").  The rail's underside is 22 mm lower than the roof's
    # own, and only outboard of W_RAIL_IN — on the centreline, where this lamp is, the
    # backlight runs all the way up to the headliner, so keying to the rail left the
    # lamp stranded a couple of centimetres down the glass.  The 4 mm is a shut line,
    # not clearance: flush, its top face and the headliner are coplanar.
    z1 = Z_HEADLINER - 0.004
    z0 = z1 - 0.046
    y0, y1 = rear_face(z0), rear_face(z1)
    hexa(p, [(-0.105, y0 + 0.040, z0), (0.105, y0 + 0.040, z0),
             (0.105, y0 - 0.011, z0), (-0.105, y0 - 0.011, z0),
             (-0.105, y1 + 0.040, z1), (0.105, y1 + 0.040, z1),
             (0.105, y1 - 0.011, z1), (-0.105, y1 - 0.011, z1)], "RangerTail")


def build_glass(g):
    """Every pane is a single quad, double-sided, and drawn from OUTSIDE in.

    Winding matters even for a double-sided pane: Three.js still lights the front
    face, so a pane wound inward reads dark from the driver's seat.

    All six panes take their side edges from pillar_frame(), never from hand-typed
    coordinates — see the note there.  That is what makes the A-pillar/glass line read
    straight instead of wandering a few millimetres along its length.  The SIDE panes
    sit GLASS_INSET behind the skin; the two screens sit SCREEN_REVEAL inboard and
    SCREEN_INSET back, which is what leaves a painted pillar lip beside them.
    """
    A = {sx: pillar_frame(A_FOOT, A_HEAD, PILLAR_A, PILLAR_T_A, sx) for sx in (1, -1)}
    C = {sx: pillar_frame(C_FOOT, C_HEAD, PILLAR_C, PILLAR_T_C, sx) for sx in (1, -1)}

    # Windscreen: spans between the two A-pillars' nose-side edges.
    wl = _inset_line(A[-1][1], -1, SCREEN_REVEAL, -SCREEN_INSET)
    wr = _inset_line(A[1][1], 1, SCREEN_REVEAL, -SCREEN_INSET)
    pane(g, _edge_at_z(*wl, WS_BASE_Z), _edge_at_z(*wr, WS_BASE_Z),
         _edge_at_z(*wr, WS_TOP_Z), _edge_at_z(*wl, WS_TOP_Z),
         "RangerGlass", (0.0, 0.65, 0.76))
    # Backlight: between the two C-pillars' tail-side edges.
    bl = _inset_line(C[-1][2], -1, SCREEN_REVEAL, SCREEN_INSET)
    br = _inset_line(C[1][2], 1, SCREEN_REVEAL, SCREEN_INSET)
    pane(g, _edge_at_z(*br, BL_BASE_Z), _edge_at_z(*bl, BL_BASE_Z),
         _edge_at_z(*bl, BL_TOP_Z), _edge_at_z(*br, BL_TOP_Z),
         "RangerGlass", (0.0, -0.99, 0.13))
    # ONE side window per side, and it is cut from the SAME aperture the trim is —
    # dlo_inner() — so the pane cannot drift out of its own surround.
    for sx in (1, -1):
        c = [(sx * (gh_x(z) - GLASS_INSET), y, z) for y, z in dlo_inner(sx)]
        pane(g, c[0], c[1], c[2], c[3], "RangerGlass", (sx * 0.97, 0.0, 0.24))


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
    # THE LAMP BAND MUST CLEAR THE RIM'S ROLLED CREASE.  SQUARE_Z keeps the fender's
    # squaring crease out of z 0.780..0.982 on the LAST FULL SECTION, and that is not
    # the section the lamp meets: nose_rim_ring() rolls the whole thing down by the
    # rim's drop, creases and all.  Rolled into the band, the flank loses 65 mm of
    # width in the 34 mm above the crease, the lens follows it and its top band folds
    # over itself.  One check, both halves of the fix — the drop AND Z_LAMP1.
    _base = clip_ring(CLIP_ST[0][0])
    _zs = [q[2] for q in _base]
    _sh = CLIP_ST[0][3] - CLIP_ST[0][4]
    _sq = _sh - SQUARE_Z * (_sh - Z_HIP)
    _t = (_sq - min(_zs)) / (max(_zs) - min(_zs))
    _rolled = _sq + NOSE_RISE * (1.0 - _t) - (NOSE_DROP_LIN + NOSE_DROP) * _t
    chk("lamp band clears the rim's rolled crease", _rolled > Z_LAMP1 + 0.004,
        f"crease rolls to {_rolled:.4f} vs lamp top {Z_LAMP1:.3f}")
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
    # The cant rail must not overhang a screen: where it does, that screen's top edge is
    # cut 36 mm lower than the rest of the aperture and the corner reads as a notch.
    ws_edge = gh_x(Z_HEADLINER) - SCREEN_REVEAL
    chk("cant rail clears the screens", ws_edge < W_RAIL_IN - 0.005,
        f"screen edge {ws_edge:.3f} vs rail inner {W_RAIL_IN:.3f}")
    chk("screens seat inside the pillar faces",
        SCREEN_REVEAL < min(PILLAR_T_A, PILLAR_T_C) - 0.003,
        f"reveal {SCREEN_REVEAL:.3f} vs thinnest screen pillar "
        f"{min(PILLAR_T_A, PILLAR_T_C):.3f}")
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
        # EXPECTED, not faults.  The 10 non-manifold edges are the cowl ring, where the
        # firewall (an interior partition) is welded into the outer skin and three
        # surfaces meet on one edge.  The border edges are all deliberate openings:
        # ~54 at the nose, which is a real hole with the dark recess box behind it;
        # ~44 at the tails, the boundary of the back plane each lamp sweep skips
        # (TAIL_LAMP_BURIED — it is buried 28 mm inside a 54 mm panel, and the count
        # scales with the sweep's station count, so extending the lamp moves it);
        # and the glass panes are single quads, so all 24 of their edges are borders
        # by construction.
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
