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
BODY_LEN = 4.61
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
FRONT_OH, REAR_OH = 0.755, 1.005  # see the tiling note below
Y_NOSE = AX_F + FRONT_OH         # +2.0375  extreme front (bumper face)
Y_TAIL = AX_R - REAR_OH          # -2.5725  extreme rear (bumper face)

# THE LONGITUDINAL TILING.  4.611 = 0.060 front bumper + 1.508 hood + 1.100 cab
# + 0.080 cab/bed gap + 1.800 bed + 0.063 rear bumper.  Those five spans come from
# the published regular-cab dimensions (111.6 in wheelbase, 189.4 in long, 6 ft
# bed), with ONLY the overhangs scaled by 4.61/4.81 to fit the physics preset — the
# cab and bed keep their real lengths, because shrinking those is what a viewer
# actually notices.  The first pass shrank the cab to 1.045 and the roof to 0.50
# and the greenhouse read like a cap perched on the back.
#
# HOW THE HEIGHTS WERE GOT.  Every station below was read off the reference profile
# photo (IMG_0879) using the TYRE as the ruler: the wheelbase measures 1025 px and is
# known to be 2.85 m, giving 359 px/m, and every other feature was then divided by
# that.  This is why the hood is nearly FLAT — the first pass guessed a 0.175 m fall
# from cowl to nose and the truck immediately read as a car.  The real fall is 0.076.
# The overhangs came out at 0.70 / 1.06, which sum to exactly the 1.76 m the physics
# preset leaves over — so the real proportions fit the preset with nothing forced.

# --- Heights (z = 0 is the tyre contact plane) ---
Z_GROUND = 0.0
Z_UNDER = 0.285                  # frame / underbody pan — the model's lowest point
Z_ROCKER = 0.435                 # rocker step: flank bottom out of the arch zones
Z_HIP = 0.86                     # widest point of the flank
Z_BELT = 1.200                   # door beltline = base of the side glass
Z_ROOF = 1.600                   # roof deck (bodyHeight 1.60)
Z_ROOF_CROWN = 0.020             # centre of the roof sits this much proud of the rails
Z_RAIL = 1.110                   # bed rail top — reads BELOW the door belt, as on the ref
Z_BEDFLOOR = 0.700               # bed floor pan (rib crests sit RIB_H above)
Z_HEADLINER = 1.526              # underside of the roof slab

# --- Wheel arches.  Tyre is 0.736 dia x 0.25 wide on a 1.46 track. ---
ARCH_R = 0.470                   # opening radius (tyre radius 0.368 + 0.10 clearance)
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
Z_WHEELHOUSE = 0.965             # wheelhouse box top

# --- Cab / greenhouse (all y MEASURED, see above) ---
Y_COWL = 0.470                   # base of the windscreen
Y_CAB_REAR = -0.630              # cab rear panel
Y_HDR_F = 0.025                  # windscreen header
Y_HDR_R = -0.581                 # rear header
W_ROOF = 0.676                   # roof half width (tumblehome from W_BELT)
PILLAR_A = 0.038                 # A-pillar section (across the glass)
PILLAR_C = 0.072                 # C-pillar section

# --- Bed ---
Y_BED_F = -0.710                 # bed front wall (8 cm gap behind the cab)
Y_BED_R = -2.540                 # bed loft tail; the 30 mm tailgate slab takes the
                                 # outer face to -2.510, so the bed is 1.800 m —
                                 # a real 6-foot bed, un-scaled
N_RIBS = 8                       # bed-floor rib crests across the full width
RIB_H = 0.028

# --- Front clip ---
Y_NOSE_SHEET = 1.978             # sheet-metal nose; the bumper fills to Y_NOSE
Z_LAMP0, Z_LAMP1 = 0.772, 1.006  # headlamp / grille opening.  Re-measured off the
                                 # DEAD-ON reference (547 px/m there): the first pass
                                 # took these off the profile shot and left a 28 cm
                                 # blank painted band between the grille and the
                                 # bumper, where the real truck has about 10 cm.
Z_BUMP0, Z_BUMP1 = 0.492, 0.648  # chrome blade
Z_VAL0 = 0.285                   # bottom of the grey valance

# --- Rear ---
Z_TAIL0, Z_TAIL1 = 0.735, 1.062  # tail lamp band
Z_RBUMP0, Z_RBUMP1 = 0.430, 0.612

# --- Interior ---
Z_FLOOR = 0.520                  # cab floor pan.  Higher than this and the seated
                                 # driver has no head room: cushion 0.80, headliner
                                 # 1.522 leaves 0.72, which is already snug.
Z_TUNNEL = 0.700
W_TUNNEL = 0.195
SEAT_X = 0.355                   # seat centres; driver at -SEAT_X (LHD)
Z_CUSHION = 0.855
Z_SEATBACK = 1.375               # MUST clear Z_BELT or the cabin reads as empty
SW_AT = (-0.355, 0.135, 1.048)   # steering-wheel hub
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


BOX_F = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4],
         [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]


def box(part, x0, x1, y0, y1, z0, z1, mat):
    part.add([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
              (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], BOX_F, mat)


def hexa(part, pts, mat):
    """Free-form box from 8 points: 0-3 bottom loop, 4-7 top loop (same order)."""
    part.add(pts, BOX_F, mat)


def quad(part, a, b, c, d, mat):
    part.add([a, b, c, d], [[0, 1, 2, 3]], mat)


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
    faces = [[k, (k + 1) % n, n + (k + 1) % n, n + k] for k in range(n)]
    verts = list(outer) + list(inner)
    nrm = None
    for fc in faces:
        a, b, c = (mathutils.Vector(verts[i]) for i in fc[:3])
        cr = (b - a).cross(c - a)
        if cr.length > 1e-9:
            nrm = cr.normalized()
            break
    if nrm is not None and nrm.dot(mathutils.Vector(facing)) < 0:
        faces = [list(reversed(fc)) for fc in faces]
    part.add(verts, faces, mat)


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
    """
    d = abs(y - axle)
    if d >= ARCH_R:
        return Z_ROCKER
    return max(Z_ROCKER, ARCH_Z + math.sqrt(ARCH_R * ARCH_R - d * d))


def arch_samples(axle):
    """Cosine-spaced y samples across an arch: dense where the circle turns."""
    return [axle + ARCH_R * math.cos(math.pi * i / (ARCH_SAMP - 1))
            for i in range(ARCH_SAMP)]


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
    (1.978, 0.806, 0.736, 1.118, 0.016),   # nose sheet metal
    (1.860, 0.828, 0.750, 1.126, 0.020),
    (1.640, 0.840, 0.762, 1.140, 0.024),
    (1.2825, 0.845, 0.770, 1.156, 0.024),  # front axle — widest, the fender blister
    (1.000, 0.840, 0.774, 1.166, 0.018),
    (0.700, 0.828, 0.776, 1.173, 0.009),
    (0.470, 0.816, 0.776, 1.176, 0.003),   # cowl — level with the door beltline
]

# Cab: (y, w_flank, w_shoulder, z_belt).  Meets CLIP_ST's numbers at the cowl so the
# fender-to-door transition has no step.
CAB_ST = [
    (0.470, 0.816, 0.776, 1.176),          # cowl
    (0.210, 0.810, 0.775, 1.200),
    (-0.630, 0.806, 0.775, 1.200),         # cab rear panel
]
W_DOORCARD = 0.700                         # inner face of the door trim


def clip_ring(y):
    """12-point closed section for the front clip (hood + fenders + nose)."""
    wo, wb, ztop, crown = _interp(CLIP_ST, y)
    zb = arch_z(y, AX_F)
    r = [(0.0, Z_UNDER), (W_UNDER, Z_UNDER), (W_UNDER, zb), (wo, zb),
         (wo, Z_HIP), (wb, ztop - crown), (0.0, ztop)]
    return ([(x, y, z) for x, z in r]
            + [(-x, y, z) for x, z in reversed(r[1:6])])


def cab_ring(y):
    """16-point closed section for the cab: a U, because the top of this shell IS
    the cabin floor.  Filling the deck instead would put a solid plate at window-sill
    height behind the glass, which is exactly what the interior exists to avoid."""
    wo, wb, zbelt = _interp(CAB_ST, y)
    zb = arch_z(y, AX_F)                   # the front arch stops short of the cowl
    r = [(0.0, Z_UNDER), (W_UNDER, Z_UNDER), (W_UNDER, zb), (wo, zb),
         (wo, Z_HIP), (wb, zbelt), (W_DOORCARD, zbelt),
         (W_DOORCARD, Z_FLOOR), (0.0, Z_FLOOR)]
    return ([(x, y, z) for x, z in r]
            + [(-x, y, z) for x, z in reversed(r[1:8])])


def bed_ring(y):
    """20-point closed section for the bed: outer skin up, over the rail, down the
    inner wall (stepping in over the wheelhouse), across the floor and back."""
    zb = arch_z(y, AX_R)
    d = abs(y - AX_R)
    wh = W_WHEELHOUSE if d < ARCH_R + 0.055 else W_BED_IN   # box, not a curve
    r = [(0.0, Z_UNDER), (W_UNDER, Z_UNDER), (W_UNDER, zb), (W_FLANK, zb),
         (W_FLANK, Z_HIP), (W_BED_OUT, Z_RAIL), (W_BED_IN, Z_RAIL),
         (W_BED_IN, Z_WHEELHOUSE), (wh, Z_WHEELHOUSE), (wh, Z_BEDFLOOR),
         (0.0, Z_BEDFLOOR)]
    return ([(x, y, z) for x, z in r]
            + [(-x, y, z) for x, z in reversed(r[1:10])])


# Section-edge -> material.  Index k is the face spanning ring point k -> k+1.
DARK = "RangerInterior"
CLIP_BANDS = {0: DARK, 1: DARK, 2: DARK, 9: DARK, 10: DARK, 11: DARK}
CAB_BANDS = {0: DARK, 1: DARK, 2: DARK, 6: DARK, 7: DARK, 8: DARK, 9: DARK,
             13: DARK, 14: DARK, 15: DARK}
BED_BANDS = {0: DARK, 1: DARK, 2: DARK, 17: DARK, 18: DARK, 19: DARK}


# ---------------------------------------------------------------------------
# SHELLS
# ---------------------------------------------------------------------------
def build_front_clip(p):
    ys = sorted({round(s[0], 5) for s in CLIP_ST}
                | {round(v, 5) for v in arch_samples(AX_F)}, reverse=True)
    ys = [y for y in ys if CLIP_ST[-1][0] <= y <= CLIP_ST[0][0]]
    rings = [clip_ring(y) for y in ys]     # ys DESCENDING: nose first, cowl last
    # cap_last (at the cowl) is the FIREWALL — seen from the cabin, never from the
    # engine bay, so it is interior-dark, not paint.
    # cap_first (the nose) is omitted: build_front_end() replaces it with a FRAME so
    # the grille and lamps have something to sit in.  loft() still orients from the
    # virtual closed volume, so dropping the cap costs nothing.
    loft(p, rings, "RangerPaint", cap_first=False, cap_last=True,
         band_mats=CLIP_BANDS, cap_last_mat=DARK)


def build_cab(p):
    ys = [Y_COWL, 0.210, -0.080, -0.400, Y_CAB_REAR]
    rings = [cab_ring(y) for y in ys]
    # cap_first at the cowl would z-fight the firewall the front clip already put
    # there, so it is omitted; loft() still orients from the virtual closed volume.
    loft(p, rings, "RangerPaint", cap_first=False, cap_last=True,
         band_mats=CAB_BANDS)


def build_bed(p):
    ys = sorted({Y_BED_F, -0.980, Y_BED_R, -2.300}
                | {round(v, 5) for v in arch_samples(AX_R)}
                | {AX_R - ARCH_R - 0.06, AX_R + ARCH_R + 0.06}, reverse=True)
    ys = [y for y in ys if Y_BED_R <= y <= Y_BED_F]
    rings = [bed_ring(y) for y in ys]
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
    y0, y1 = Y_BED_R + 0.020, Y_BED_F - 0.020
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
                     (Y_BED_R + 0.044, Y_BED_R + 0.010)):
        box(p, -0.560, 0.560, yb, yf, Z_BEDFLOOR + 0.055, Z_RAIL - 0.075, "RangerPaint")

    # Tailgate outer: the horizontal crease that splits the panel, and the handle.
    box(p, -0.500, 0.500, -2.5725, -2.560, 0.985, 1.045, "RangerPaint")
    box(p, -0.115, 0.115, -2.5725, -2.556, 0.880, 0.935, "RangerTrim")

    # Stake pockets — two per rail.  Tiny, but they are the only thing that says
    # "this rail is a folded steel channel" rather than a solid bar.
    for sx in (1, -1):
        for yy in (-1.020, -2.130):
            box(p, sx * 0.726, sx * 0.800, yy - 0.052, yy + 0.052,
                Z_RAIL - 0.030, Z_RAIL + 0.002, DARK)


# ---------------------------------------------------------------------------
# FRONT END
# ---------------------------------------------------------------------------
def build_front_end(p):
    Y_F = Y_NOSE_SHEET                       # sheet-metal face plane
    # OPEN_X is bounded by the nose outline, which tapers from 0.800 at z 0.86 to
    # 0.700 at z 1.082 — push the opening wider than this and the frame inverts.
    OPEN_X, OPEN_Z0, OPEN_Z1 = 0.726, Z_LAMP0, Z_LAMP1

    # The nose cap, as a frame around the lamp/grille opening.  Point order matches
    # clip_ring(); the duplicated corners collapse into triangles, which is what
    # turns a 12-point body outline into a rectangular hole.
    inner = [(0.0, OPEN_Z0), (OPEN_X, OPEN_Z0), (OPEN_X, OPEN_Z0), (OPEN_X, OPEN_Z0),
             (OPEN_X, 0.5 * (OPEN_Z0 + OPEN_Z1)), (OPEN_X, OPEN_Z1), (0.0, OPEN_Z1)]
    inner = inner + [(-x, z) for x, z in reversed(inner[1:6])]
    frame(p, clip_ring(Y_F), [(x, Y_F, z) for x, z in inner], "RangerPaint")

    # Dark box behind the opening — the thing the grille bars and bezels read
    # against, and the reason you cannot see through into the engine bay.
    # DEPTH TRAP: this box's FRONT face has to sit behind everything mounted in the
    # opening.  At Y_F-0.006 it was in front of the grille bars and the amber corners
    # and hid both, which is why the first render had a plain black grille.
    box(p, -0.775, 0.775, Y_F - 0.098, Y_F - 0.062, Z_VAL0 + 0.02, OPEN_Z1 + 0.006, DARK)

    # Grille: a body-colour surround with four chrome bars.
    gx, gz0, gz1 = 0.398, OPEN_Z0 + 0.016, OPEN_Z1 - 0.016
    for i in range(4):
        z = gz0 + (gz1 - gz0) * (i + 0.5) / 4
        # -0.006 inside gx: the surround uprights start at exactly gx, and a bar
        # ending on that plane gives four overlapping coplanar faces.
        box(p, -gx + 0.006, gx - 0.006, Y_F - 0.056, Y_F - 0.020,
            z - 0.018, z + 0.018, "RangerChrome")
    for sx in (1, -1):                        # grille surround uprights
        box(p, sx * gx, sx * (gx + 0.022), Y_F - 0.058, Y_F - 0.004, OPEN_Z0, OPEN_Z1,
            "RangerPaint")

    # Headlamps.  Big wrap-around units with an AMBER outboard corner — the single
    # most identifying feature of this generation's face.  Sized off the dead-on
    # reference shot: grille ~45% of the width, each lamp ~22%, amber the outboard
    # third of the lamp.
    for sx in (1, -1):
        hexa(p, [(sx * 0.408, Y_F - 0.048, OPEN_Z0 + 0.008),
                 (sx * 0.628, Y_F - 0.048, OPEN_Z0 + 0.004),
                 (sx * 0.628, Y_F - 0.006, OPEN_Z0 + 0.004),
                 (sx * 0.408, Y_F - 0.002, OPEN_Z0 + 0.008),
                 (sx * 0.408, Y_F - 0.048, OPEN_Z1 - 0.006),
                 (sx * 0.628, Y_F - 0.048, OPEN_Z1 - 0.024),
                 (sx * 0.628, Y_F - 0.006, OPEN_Z1 - 0.024),
                 (sx * 0.408, Y_F - 0.002, OPEN_Z1 - 0.006)], "RangerLens")
        hexa(p, [(sx * 0.632, Y_F - 0.048, OPEN_Z0 + 0.004),
                 (sx * 0.720, Y_F - 0.060, OPEN_Z0 + 0.016),
                 (sx * 0.720, Y_F - 0.020, OPEN_Z0 + 0.016),
                 (sx * 0.632, Y_F - 0.006, OPEN_Z0 + 0.004),
                 (sx * 0.632, Y_F - 0.048, OPEN_Z1 - 0.024),
                 (sx * 0.720, Y_F - 0.060, OPEN_Z1 - 0.056),
                 (sx * 0.720, Y_F - 0.020, OPEN_Z1 - 0.056),
                 (sx * 0.632, Y_F - 0.006, OPEN_Z1 - 0.024)], "RangerAmber")

    # Chrome bumper blade.  Swept as a loft along X so the ends WRAP back instead of
    # being cut off square — a bumper built as one straight prism reads glued on.
    # Two bands, not one: the upper strip is the rolled top edge, and without it the
    # bumper is a flat grey stripe with no shape at all.
    xs = [-0.818, -0.760, -0.560, 0.0, 0.560, 0.760, 0.818]
    dys = [0.115, 0.070, 0.014, 0.0, 0.014, 0.070, 0.115]
    # ONE loft with a six-point profile, not two stacked boxes: stacking them put a
    # pair of overlapping coplanar faces at the join, which is a real z-fight.
    ZB_MID = Z_BUMP1 - 0.038

    def bprof(x, dy):
        yf = Y_NOSE - dy
        return [(x, yf, Z_BUMP0), (x, yf - 0.085, Z_BUMP0),
                (x, yf - 0.085, Z_BUMP1), (x, yf - 0.022, Z_BUMP1),
                (x, yf - 0.022, ZB_MID), (x, yf, ZB_MID)]
    loft(p, [bprof(x, dy) for x, dy in zip(xs, dys)], "RangerChrome")

    # Grey lower valance, and the air intake let into it.
    vxs = [-0.788, -0.700, 0.0, 0.700, 0.788]
    vdy = [0.115, 0.060, 0.028, 0.060, 0.115]
    loft(p, [[(x, Y_NOSE - dy, Z_VAL0), (x, Y_NOSE - dy - 0.110, Z_VAL0),
              (x, Y_NOSE - dy - 0.110, Z_BUMP0 + 0.004), (x, Y_NOSE - dy, Z_BUMP0 + 0.004)]
             for x, dy in zip(vxs, vdy)], "RangerTrim")
    box(p, -0.400, 0.400, Y_NOSE - 0.075, Y_NOSE - 0.030, Z_VAL0 + 0.030,
        Z_BUMP0 - 0.030, DARK)
    # Licence-plate bracket, hung off the valance dead centre (as on the ref car).
    box(p, -0.150, 0.150, Y_NOSE - 0.032, Y_NOSE - 0.024, Z_VAL0 + 0.055,
        Z_VAL0 + 0.175, DARK)


# ---------------------------------------------------------------------------
# REAR END
# ---------------------------------------------------------------------------
def build_rear_end(p):
    Y_R = Y_BED_R
    # The bed loft's rear cap has to cover the underbody as well as the tailgate
    # aperture, and one polygon cannot be paint at the top and dark underneath — so
    # the cap goes DARK and the painted rear panels sit on it, REARWARD of it.
    # (First pass built them forward of the cap, which put the tailgate inside the
    # bed and left the lamps hanging 3.5 mm past the bumper.)
    # The panels INTERPENETRATE the cap rather than butting flush against it: two
    # faces sharing the y = Y_R plane is a z-fight, whereas a solid pushed 20 mm into
    # another solid is just geometry.  Y_P0 is set so the lens surface lands exactly
    # on Y_TAIL and nothing reaches past the bumper.
    Y_P0, Y_P1 = -2.566, Y_R + 0.020
    Z_P0, Z_P1 = Z_BEDFLOOR - 0.030, Z_RAIL
    # Tailgate, and the two body-colour corner panels the lamps are let into.  The
    # gap between them at |x| 0.545 is the tailgate shut line, for free.
    box(p, -0.545, 0.545, Y_P0, Y_P1, Z_P0, Z_P1, "RangerPaint")
    for sx in (1, -1):
        box(p, sx * 0.551, sx * W_BED_OUT, Y_P0, Y_P1, Z_P0, Z_P1, "RangerPaint")
        # Tail lamp: red / clear / red, top to bottom, per the reference unit.  The
        # dark bezel is not decoration — with a red default body the red lens would
        # otherwise vanish into the paint and only the clear band would read.
        box(p, sx * 0.560, sx * 0.812, Y_P0 - 0.004, Y_P0 + 0.016, Z_TAIL0 - 0.014,
            Z_TAIL1 + 0.014, DARK)
        for z0, z1, mt in ((0.948, Z_TAIL1, "RangerTail"),
                           (0.848, 0.944, "RangerLens"),
                           (Z_TAIL0, 0.844, "RangerTail")):
            box(p, sx * 0.572, sx * 0.800, Y_TAIL, Y_P0 + 0.010, z0, z1, mt)

    # Grey step bumper: narrower than the bed, with two tread pads on top.
    bxs = [-0.800, -0.740, 0.0, 0.740, 0.800]
    bdy = [0.078, 0.028, 0.0, 0.028, 0.078]
    loft(p, [[(x, Y_TAIL + dy, Z_RBUMP0), (x, Y_R - 0.020, Z_RBUMP0),
              (x, Y_R - 0.020, Z_RBUMP1), (x, Y_TAIL + dy, Z_RBUMP1)]
             for x, dy in zip(bxs, bdy)], "RangerTrim")
    for sx in (1, -1):
        box(p, sx * 0.086, sx * 0.320, Y_TAIL + 0.010, Y_R - 0.028,
            Z_RBUMP1 - 0.004, Z_RBUMP1 + 0.020, DARK)
    box(p, -0.150, 0.150, Y_TAIL, Y_TAIL + 0.010, Z_RBUMP0 + 0.030,
        Z_RBUMP0 + 0.150, "RangerLens")      # licence plate, ON the bumper face

    # Exhaust tip, right rear, exiting BELOW the bumper so it is actually visible.
    tube(p, (0.470, -1.980, 0.348), (0.470, -2.400, 0.330), 0.038, 6, "RangerTrim")
    # Mud flaps.  The first pass made these 4 cm wide and they read as two black
    # sticks hanging in space; a real flap is nearly as wide as the tyre.
    for sx in (1, -1):
        box(p, sx * 0.590, sx * 0.816, -2.132, -2.100, 0.108, 0.442, "RangerTrim")


# ---------------------------------------------------------------------------
# EXTERIOR TRIM
# ---------------------------------------------------------------------------
def build_trim(p):
    for sx in (1, -1):
        # Door mirror: a stalk and a head, both black.  Placed on the door skin at
        # the beltline where the reference has them, NOT on the A-pillar.
        # The stalk must START on the body skin (0.775 at the belt).  The first pass
        # began it at 0.812 and the whole mirror floated 4 cm off the door.
        strut(p, (sx * 0.774, 0.320, 1.198), (sx * 0.902, 0.290, 1.240),
              0.042, 0.054, "RangerTrim")
        hexa(p, [(sx * 0.878, 0.352, 1.196), (sx * 0.952, 0.352, 1.196),
                 (sx * 0.952, 0.232, 1.196), (sx * 0.878, 0.232, 1.196),
                 (sx * 0.878, 0.352, 1.288), (sx * 0.952, 0.352, 1.288),
                 (sx * 0.952, 0.232, 1.288), (sx * 0.878, 0.232, 1.288)],
             "RangerTrim")
        # Door handle, and the shut line that says there IS a door.
        box(p, sx * 0.796, sx * 0.822, -0.170, -0.038, 1.062, 1.100, "RangerTrim")
        box(p, sx * 0.800, sx * 0.812, -0.626, 0.462, 0.860, 0.874, DARK)

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
    box(p, -0.692, 0.692, Y_CAB_REAR + 0.015, Y_CAB_REAR + 0.045, Z_FLOOR + 0.008,
        Z_BELT, DARK)

    # --- Dash --------------------------------------------------------------
    Y_DASH = 0.245                          # rear edge of the pad
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
    strut(p, (-0.355, 0.198, 1.019), (-0.355, 0.392, 0.933), 0.086, 0.078, DARK)

    # --- Console + shifter --------------------------------------------------
    hexa(p, [(-0.168, -0.062, Z_TUNNEL - 0.040), (0.168, -0.062, Z_TUNNEL - 0.040),
             (0.168, 0.242, Z_TUNNEL - 0.040), (-0.168, 0.242, Z_TUNNEL - 0.040),
             (-0.150, -0.062, 0.868), (0.150, -0.062, 0.868),
             (0.150, 0.242, 0.842), (-0.150, 0.242, 0.842)], DARK)
    strut(p, (-0.016, 0.104, 0.842), (-0.016, 0.028, 0.986), 0.030, 0.030, DARK)
    box(p, -0.046, 0.014, -0.004, 0.056, 0.982, 1.028, "RangerTrim")     # shift knob

    # --- Seats.  The backs MUST break the beltline (1.200) or the cabin reads as
    # empty through the glass no matter how good the geometry is (ART-STYLE, the
    # beltline sightline rule learned on winnebago).
    for sx in (-1, 1):
        cx = sx * SEAT_X
        hexa(p, [(cx - 0.230, -0.420, 0.660), (cx + 0.230, -0.420, 0.660),
                 (cx + 0.230, 0.020, 0.660), (cx - 0.230, 0.020, 0.660),
                 (cx - 0.230, -0.420, Z_CUSHION), (cx + 0.230, -0.420, Z_CUSHION),
                 (cx + 0.230, 0.020, Z_CUSHION - 0.030),
                 (cx - 0.230, 0.020, Z_CUSHION - 0.030)], "RangerSeat")
        hexa(p, [(cx - 0.228, -0.520, Z_CUSHION - 0.030),
                 (cx + 0.228, -0.520, Z_CUSHION - 0.030),
                 (cx + 0.228, -0.404, Z_CUSHION - 0.030),
                 (cx - 0.228, -0.404, Z_CUSHION - 0.030),
                 (cx - 0.206, -0.556, Z_SEATBACK), (cx + 0.206, -0.556, Z_SEATBACK),
                 (cx + 0.206, -0.462, Z_SEATBACK), (cx - 0.206, -0.462, Z_SEATBACK)],
             "RangerSeat")

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
GH_BELT = 1.212                    # glass sits a hair proud of the sheet-metal belt
# PILLAR TRAP.  The first pass built these at 0.058 x 0.052 and they read as roll-
# cage bars stuck to the outside of the cab.  A window frame is THIN and FLUSH: the
# section is now 0.038 across, and the feet sit inboard of the beltline (0.775) by
# just enough that half the prism's thickness lands back on the body surface.
A_FOOT = (0.744, 0.466, 1.176)     # A-pillar foot, on the cowl corner
A_HEAD = (0.680, 0.030, 1.544)     # A-pillar head, at the roof front corner
C_FOOT = (0.744, -0.622, 1.190)
C_HEAD = (0.680, -0.573, 1.544)
B_FOOT = (0.758, -0.386, 1.204)    # rear quarter division — a real line on the ref car
B_HEAD = (0.690, -0.368, 1.532)
WS_BASE_Y, WS_BASE_Z = 0.466, 1.180    # windscreen bottom edge
WS_TOP_Y, WS_TOP_Z = 0.030, 1.556      # windscreen top edge (tucked under the header)
WS_HALF_B, WS_HALF_T = 0.704, 0.646    # half width at the bottom / top edge
BL_BASE_Y, BL_BASE_Z = -0.622, 1.200   # backlight
BL_TOP_Y, BL_TOP_Z = -0.575, 1.548
BL_HALF_B, BL_HALF_T = 0.644, 0.630


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
        def m(pt):
            return (sx * pt[0], pt[1], pt[2])
        strut(p, m(A_FOOT), m(A_HEAD), PILLAR_A, 0.040, "RangerPaint")
        strut(p, m(C_FOOT), m(C_HEAD), PILLAR_C, 0.044, "RangerPaint")
        strut(p, m(B_FOOT), m(B_HEAD), 0.034, 0.038, "RangerPaint")

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


def build_glass(g):
    """Every pane is a single quad, double-sided, and drawn from OUTSIDE in.

    Winding matters even for a double-sided pane: Three.js still lights the front
    face, so a pane wound inward reads dark from the driver's seat.
    """
    # Windscreen — faces forward and up.
    pane(g, (-WS_HALF_B, WS_BASE_Y, WS_BASE_Z), (WS_HALF_B, WS_BASE_Y, WS_BASE_Z),
         (WS_HALF_T, WS_TOP_Y, WS_TOP_Z), (-WS_HALF_T, WS_TOP_Y, WS_TOP_Z),
         "RangerGlass", (0.0, 0.65, 0.76))
    # Backlight — faces rearward and up.
    pane(g, (BL_HALF_B, BL_BASE_Y, BL_BASE_Z), (-BL_HALF_B, BL_BASE_Y, BL_BASE_Z),
         (-BL_HALF_T, BL_TOP_Y, BL_TOP_Z), (BL_HALF_T, BL_TOP_Y, BL_TOP_Z),
         "RangerGlass", (0.0, -0.99, 0.13))
    # Door glass + rear quarter, both sides.  Split at the B-division so the pane
    # edges land ON the divider instead of running behind it.
    for sx in (1, -1):
        pane(g, (sx * 0.766, 0.452, GH_BELT), (sx * 0.766, -0.378, GH_BELT),
             (sx * 0.692, -0.362, 1.536), (sx * 0.692, 0.044, 1.536),
             "RangerGlass", (sx * 0.97, 0.0, 0.24))
        pane(g, (sx * 0.766, -0.394, GH_BELT), (sx * 0.766, -0.618, GH_BELT),
             (sx * 0.692, -0.578, 1.536), (sx * 0.692, -0.374, 1.536),
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
        tested += 1
        if hit[1].dot(-d) >= 0.0:
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
