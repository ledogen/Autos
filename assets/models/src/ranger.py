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
FRONT_OH, REAR_OH = 0.676, 1.084  # see the tiling note below
Y_NOSE = AX_F + FRONT_OH         # +1.9585  extreme front (bumper face)
Y_TAIL = AX_R - REAR_OH          # -2.6515  extreme rear (bumper face)

# THE LONGITUDINAL TILING.  4.610 = 0.064 front bumper + 1.311 hood + 1.214 cab
# + 0.080 cab/bed gap + 1.831 bed + 0.111 rear bumper.  Only the OVERHANGS are
# scaled to fit the physics preset (by 1.76/1.903); the cab and bed keep their real
# lengths, because shrinking those is what a viewer actually notices.
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
Z_UNDER = 0.285                  # frame / underbody pan — the model's lowest point
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
Y_NOSE_SHEET = 1.630             # sheet-metal nose; the bumper fills to Y_NOSE
Z_LAMP0, Z_LAMP1 = 0.772, 0.990  # headlamp / grille opening.  Re-measured off the
                                 # DEAD-ON reference (547 px/m there): the first pass
                                 # took these off the profile shot and left a 28 cm
                                 # blank painted band between the grille and the
                                 # bumper, where the real truck has about 10 cm.
Z_BUMP0, Z_BUMP1 = 0.492, 0.648  # chrome blade
Z_VAL0 = 0.285                   # bottom of the grey valance

# --- Rear ---
Z_TAIL0, Z_TAIL1 = 0.722, 0.998  # tail lamp band
Z_RBUMP0, Z_RBUMP1 = 0.383, 0.539
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
    """
    d = abs(y - axle)
    if d >= ARCH_R:
        return Z_ROCKER
    return max(Z_ROCKER, ARCH_Z + math.sqrt(ARCH_R * ARCH_R - d * d))


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
    (1.7525, 0.824, 0.738, 1.108, 0.022),  # last FULL station.  MUST equal AX_F+ARCH_R
                                           # exactly (asserted in report()): 2.5 mm off it
                                           # and the arch sample lands beside this station
                                           # instead of on it, leaving a sliver face that
                                           # came out inverted.
    # The FENDER ties into the nose (owner, 2026-08-27): it carries its crown past
    # the axle, then tucks in over the last 0.30 m to hand off to the prow.  Left
    # prismatic to the arch tangent, the bullet would look grafted onto a slab.
    (1.620, 0.838, 0.754, 1.126, 0.022),
    (1.450, 0.845, 0.768, 1.142, 0.020),   # fender crown carried forward of the axle
    (1.2825, 0.845, 0.774, 1.156, 0.018),  # front axle
    (1.050, 0.842, 0.778, 1.166, 0.012),
    (0.820, 0.832, 0.779, 1.171, 0.007),
    (0.584, 0.816, 0.778, 1.172, 0.003),   # cowl
]

# Cab: (y, w_flank, w_shoulder, z_belt).  Meets CLIP_ST's numbers at the cowl so the
# fender-to-door transition has no step.
CAB_ST = [
    (0.584, 0.816, 0.778, 1.172),          # cowl — matches CLIP_ST so the shells weld
    (0.300, 0.810, 0.775, Z_BELT),
    (-0.630, 0.806, 0.775, Z_BELT),        # cab rear panel
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


BED_EDGE = 0.020                   # chamfer on the bed's top and bottom edges


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
        zb = max(zb, Z_ROCKER + (Z_RBUMP1 - 0.010 - Z_ROCKER) * t * t)
    return zb


def bed_ring(y):
    """24-point closed section for the bed: outer skin up, over the rail, down the
    inner wall (stepping in over the wheelhouse), across the floor and back.

    Both outer corners are CHAMFERED (owner, 2026-09-04: "the whole bed is rounded
    on top and bottom edges").  One extra point per corner rather than a full
    fillet: at this scale a 20 mm bevel already reads as a radius, and flat shading
    turns it into a highlight line down the length of the bed for free.
    """
    zb = bed_bottom(y)
    d = abs(y - AX_R)
    wh = W_WHEELHOUSE if d < ARCH_R + 0.055 else W_BED_IN   # box, not a curve
    r = [(0.0, Z_UNDER), (W_UNDER, Z_UNDER), (W_UNDER, zb),
         (W_FLANK - BED_EDGE, zb), (W_FLANK, zb + BED_EDGE),          # bottom edge
         (W_FLANK, Z_HIP),
         (W_BED_OUT, Z_RAIL - BED_EDGE), (W_BED_OUT - BED_EDGE, Z_RAIL),  # top edge
         (W_BED_IN, Z_RAIL),
         (W_BED_IN, Z_WHEELHOUSE), (wh, Z_WHEELHOUSE), (wh, Z_BEDFLOOR),
         (0.0, Z_BEDFLOOR)]
    return ([(x, y, z) for x, z in r]
            + [(-x, y, z) for x, z in reversed(r[1:12])])


# Section-edge -> material.  Index k is the face spanning ring point k -> k+1.
DARK = "RangerInterior"
CLIP_BANDS = {0: DARK, 1: DARK, 2: DARK, 9: DARK, 10: DARK, 11: DARK}
CAB_BANDS = {0: DARK, 1: DARK, 2: DARK, 6: DARK, 7: DARK, 8: DARK, 9: DARK,
             13: DARK, 14: DARK, 15: DARK}
# Indices shifted when bed_ring gained its two chamfers (20 points -> 24).
BED_BANDS = {0: DARK, 1: DARK, 2: DARK, 21: DARK, 22: DARK, 23: DARK}


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
Y_FACE_C = 1.920                 # the APEX: frontmost sheet metal, on the centreline
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
NOSE_RIM_N = 5
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
    # cap_first at the cowl would z-fight the firewall the front clip already put
    # there, so it is omitted; loft() still orients from the virtual closed volume.
    loft(p, rings, "RangerPaint", cap_first=False, cap_last=True,
         band_mats=CAB_BANDS)


# THE TAIL GETS THE NOSE'S TREATMENT (owner, 2026-09-04).  Same architecture as
# nose_y()/nose_rim_ring(), with the signs flipped and much smaller numbers: a
# tailgate really is close to flat, it is the CORNERS and the TOP EDGE that turn.
#   - TAIL_PROW rounds the rear corners in plan;
#   - TAIL_LEAN_UP is "the tailgate also rounds away at the top" — the face falls
#     forward as it approaches the rail;
#   - the rim needs room to do it, which is why Y_BED_R now sits 100 mm ahead of
#     the tailgate plane instead of 30.  At 30 mm the prow plus the lean exceeded
#     the span and the rings folded forward.
TAIL_RIM_N = 3
TAIL_TUCK = 0.032                  # plan-view corner radius on the rear verticals
TAIL_DROP = 0.026                  # rail line rolls down across the rim
TAIL_RISE = 0.012
TAIL_PROW = 0.026                  # plan: centreline leads the rear corners
Z_TAIL_APEX = 0.900                # rearmost height, mid-tailgate
TAIL_LEAN_UP = 0.050               # how far the face rolls forward by the rail
TAIL_LEAN_DN = 0.016

TAIL_RIM = []
for _i in range(1, TAIL_RIM_N + 1):
    _th = 0.5 * math.pi * _i / TAIL_RIM_N
    _e = 1.0 - math.cos(_th)
    TAIL_RIM.append((math.sin(_th), 1.0 - TAIL_TUCK * _e,
                     TAIL_DROP * _e, TAIL_RISE * _e))


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
    """One tail rim ring.  Only the OUTER skin moves onto the tail surface: the
    tub's inner wall and floor just advance rearward, because the tailgate closes
    them off and tucking them too would visibly pinch the bed."""
    frac, scale, drop, rise = spec
    y_last = Y_BED_R
    zs = [q[2] for q in base]
    z0, z1 = min(zs), max(zs)
    out = []
    for x, _y, z in base:
        if abs(x) > W_BED_IN + 0.001:
            nx = x * scale
            t = (z - z0) / (z1 - z0)
            nz = z + rise * (1.0 - t) - drop * t
            out.append((nx, y_last + frac * (tail_y(nx, nz) - y_last), nz))
        else:
            out.append((x, y_last + frac * (Y_TAILGATE - y_last), z))
    return out


def build_bed(p):
    ys = sorted({Y_BED_F, -0.980, Y_BED_R, -2.200, -2.330}
                | {round(v, 5) for v in arch_samples(AX_R)}
                | {AX_R - ARCH_R - 0.06, AX_R + ARCH_R + 0.06}, reverse=True)
    ys = [y for y in ys if Y_BED_R <= y <= Y_BED_F]
    ys = simplify_stations(ys, bed_ring)
    rings = [bed_ring(y) for y in ys]
    base_last = rings[-1]
    # Rear rim: three rings that turn the bedsides INTO the tail and roll the rail
    # line forward as it meets the tailgate.
    for spec in TAIL_RIM:
        rings.append(tail_rim_ring(spec, rings[0 if False else -1] if False else base_last))
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

    # Tailgate outer: the horizontal crease that splits the panel, and the handle.
    # Keyed to the TAILGATE plane.  These were hardcoded at the old Y_TAIL and ended
    # up 32 mm behind the tailgate, i.e. floating inside the bumper.
    box(p, -0.500, 0.500, Y_TAILGATE - 0.019, Y_TAILGATE - 0.003, 0.985, 1.045,
        "RangerPaint")
    box(p, -0.115, 0.115, Y_TAILGATE - 0.023, Y_TAILGATE - 0.003, 0.880, 0.935,
        "RangerTrim")

    # Stake pockets — two per rail.  Tiny, but they are the only thing that says
    # "this rail is a folded steel channel" rather than a solid bar.
    for sx in (1, -1):
        for yy in (-1.020, -2.130):
            box(p, sx * 0.726, sx * 0.800, yy - 0.052, yy + 0.052,
                Z_RAIL - 0.030, Z_RAIL + 0.002, DARK)


# ---------------------------------------------------------------------------
# FRONT END
# ---------------------------------------------------------------------------
def _sweep(part, xs, prof, mat, cap=True):
    """Sweep a y-z profile along x, laying each station on the nose's barrel curve.

    `prof(x)` returns the section at that x as (dy, z) pairs measured BACK from the
    face; this adds nose_y(x, z) so every swept part — bar, bezel, lens, valance —
    projects by the same amount as the panel it sits in, in BOTH axes.  Evaluating
    at the profile point's own z is what makes a headlamp sweep back at its top and
    bottom the way the sheet metal around it does; using only x would leave every
    fitting on a vertical plane inside a bullet-shaped hole.
    """
    rings = [[(x, nose_y(x, z) - dy, z) for dy, z in prof(x)] for x in xs]
    loft(part, rings, mat, cap_first=cap, cap_last=cap)


def build_front_end(p):
    # The opening is bounded by the nose outline, which tapers toward the top —
    # push it wider than this and the frame inverts.
    OPEN_X, OPEN_Z0, OPEN_Z1 = 0.712, Z_LAMP0, Z_LAMP1

    # The nose cap, as a frame around the lamp/grille opening.  Point order matches
    # the rim ring; the duplicated corners collapse into triangles, which is what
    # turns a 12-point body outline into a rectangular hole.
    inner = [(0.0, OPEN_Z0), (OPEN_X, OPEN_Z0), (OPEN_X, OPEN_Z0), (OPEN_X, OPEN_Z0),
             (OPEN_X, 0.5 * (OPEN_Z0 + OPEN_Z1)), (OPEN_X, OPEN_Z1), (0.0, OPEN_Z1)]
    inner = inner + [(-x, z) for x, z in reversed(inner[1:6])]
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
           lambda x: [(0.150, Z_VAL0 + 0.020), (0.150, OPEN_Z1 + 0.006),
                      (0.112, OPEN_Z1 + 0.006), (0.112, Z_VAL0 + 0.020)], DARK)

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
    for sx in (1, -1):                        # grille surround uprights
        _sweep(p, [sx * gx, sx * (gx + 0.022)],
               lambda x: [(0.060, OPEN_Z0), (0.060, OPEN_Z1),
                          (0.004, OPEN_Z1), (0.004, OPEN_Z0)], "RangerPaint")

    # Headlamps.  Six-point section, not a box: the lens face is convex and rolls
    # back at the top and bottom, and the whole unit follows the barrel curve, so it
    # reads as a moulded object rather than a rectangle stuck on the front (owner:
    # "the headlights are smooth curved objects, not rectangles").
    def lens_prof(z0, z1, deep):
        zm = 0.5 * (z0 + z1)
        return lambda x: [(deep, z0), (deep * 0.34, z0 + 0.016), (0.008, zm),
                          (deep * 0.34, z1 - 0.016), (deep, z1), (deep + 0.030, zm)]
    for sx in (1, -1):
        # Inboard station is gx + 0.030, i.e. CLEAR of the grille surround upright
        # (which spans gx..gx+0.022).  At 0.404 it sat inside the upright, and the
        # lens's convex apex poked out through its side as a bump at mid height
        # (owner, 2026-09-04).
        _sweep(p, [sx * (gx + 0.030), sx * 0.520, sx * 0.612],
               lens_prof(OPEN_Z0 + 0.008, OPEN_Z1 - 0.010, 0.052), "RangerLens")
        # Amber corner: shorter, and it wraps harder because it is out where the
        # nose is already turning back into the fender.
        _sweep(p, [sx * 0.616, sx * 0.668, sx * 0.712],
               lens_prof(OPEN_Z0 + 0.010, OPEN_Z1 - 0.042, 0.056), "RangerAmber")

    # Chrome bumper blade.  Seven-point ROUND section — a rolled top, a convex face
    # and a tuck under — swept along X so the ends wrap back.  Owner: "the bumpers
    # are especially rounded and they stick out pretty far", so the crown sits a
    # full 60 mm ahead of the face centre and the section is 100 mm deep.
    # The blade's plan curve is DERIVED from the prow, not hand-typed: a bumper that
    # wraps less than the nose it hangs off looks bolted on, and one that wraps more
    # disappears in profile.  BUMP_WRAP is a little deeper than NOSE_PROW because a
    # real bumper does turn harder at its ends than the sheet metal behind it.
    BUMP_WRAP, BUMP_W = 0.150, 0.836
    xs = [-0.836, -0.780, -0.560, 0.0, 0.560, 0.780, 0.836]
    dys = [BUMP_WRAP * (min(1.0, abs(x) / BUMP_W) ** 2) for x in xs]
    ZBM = 0.5 * (Z_BUMP0 + Z_BUMP1)

    def bprof(x, dy):
        yf = Y_NOSE - dy                       # this blade's own front plane
        return [(x, yf - 0.104, Z_BUMP0), (x, yf - 0.040, Z_BUMP0 - 0.006),
                (x, yf - 0.008, Z_BUMP0 + 0.026), (x, yf, ZBM),
                (x, yf - 0.010, Z_BUMP1 - 0.024), (x, yf - 0.044, Z_BUMP1),
                (x, yf - 0.104, Z_BUMP1)]
    loft(p, [bprof(x, dy) for x, dy in zip(xs, dys)], "RangerChrome")

    # Grey lower valance.  It rides nose_y() like everything else on the nose — a
    # hand-typed wrap schedule put its ENDS 60 mm BEHIND the nose rim, so the body
    # showed through in body colour at both bottom corners.  Anything that has to
    # stay proud of a curved panel must be driven by the same curve, not by a
    # separate table that happens to look similar.
    # THE AIR DAM'S BOTTOM FOLLOWS THE BODY, not a constant z.  The nose section only
    # reaches down to Z_UNDER for |x| <= W_UNDER (0.560) — the underbody pan — and
    # stops at the rocker (0.442) outboard of that.  A valance with a flat bottom at
    # 0.285 therefore hung in mid-air from x 0.560 outward with nothing behind it,
    # and the painted nose face showed beside it: the two red wedges the owner
    # arrowed (2026-09-04).  Its lower edge now rises to the rocker line across the
    # same span the body does.
    vxs = [-0.786, -0.700, -0.560, -0.300, 0.0, 0.300, 0.560, 0.700, 0.786]

    def val_bottom(x):
        # Lands EXACTLY on the body's own lower edge — Z_UNDER under the pan, the
        # rocker outboard of it — so there is no sliver of painted face left showing
        # below the fascia at any x.
        t = min(1.0, max(0.0, (abs(x) - W_UNDER) / (0.720 - W_UNDER)))
        return Z_UNDER + (Z_ROCKER - Z_UNDER) * t * t
    # NEGATIVE dy = PROUD of the sheet metal.  Below the bumper the nose frame is
    # still painted body panel, so a valance recessed behind it simply vanished and
    # the truck showed body colour under the chrome — which is not what the fascia
    # does on the reference car.  It now stands 14 mm ahead of the face at its crown,
    # with the bumper another 40 mm ahead of that.
    # The back edge HUGS the face (dy 0.012), it does not return 150 mm into the
    # truck.  At 0.150 the fascia's own bottom lip sat that far behind the painted
    # nose, so the body showed in front of it as two red wedges under the bumper.
    _sweep(p, vxs, lambda x: [(0.012, val_bottom(x)),
                              (-0.010, val_bottom(x) + 0.018),
                              (-0.022, 0.5 * (val_bottom(x) + Z_BUMP0) + 0.018),
                              (-0.004, Z_BUMP0 + 0.004),
                              (0.012, Z_BUMP0 + 0.004)], "RangerTrim")
    _sweep(p, [-0.360, -0.180, 0.0, 0.180, 0.360],
           lambda x: [(0.048, Z_VAL0 + 0.036), (0.048, Z_BUMP0 - 0.036),
                      (0.014, Z_BUMP0 - 0.036), (0.014, Z_VAL0 + 0.036)], DARK)
    # Licence-plate bracket, hung off the valance dead centre (as on the ref car).
    # Proud of the valance face (which is at Y_NOSE - 0.046 on the centreline), not
    # behind it — at 0.050 back the bracket was buried inside the plastic.
    box(p, -0.150, 0.150, Y_FACE_C + 0.016, Y_FACE_C + 0.026, Z_VAL0 + 0.058,
        Z_VAL0 + 0.178, DARK)


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
    Y_P0, Y_P1 = Y_TAILGATE - 0.003, Y_TAILGATE + 0.050
    # The panels fit INSIDE the bed's rear rim, which tucked the outer skin by
    # TAIL_TUCK and dropped the rail by TAIL_DROP.  Both extents are derived from
    # those constants, never typed, so a change to the rim cannot leave the panels
    # behind.  The width comes off the FLANK (the widest thing the rim tucks), not
    # off the rail — at the lamps' height that is what the corner actually is.
    W_PANEL = W_FLANK * (1.0 - TAIL_TUCK) - 0.006
    Z_P0, Z_P1 = 0.690, Z_RAIL - TAIL_DROP - 0.002
    # Tailgate, and the two body-colour corner panels the lamps are let into.  The
    # gap between them at |x| 0.545 is the tailgate shut line, for free.
    #
    # Both are LOFTED up their own height rather than boxed, so the top edge can ROLL
    # FORWARD to follow the bed's rear rim — owner, 2026-09-04: "the tailgate also
    # rounds away at the top".  A flat-topped box punches straight through the rim
    # once the rim starts turning.
    def rear_panel(x0, x1):
        # The forward roll is tail_lean(z) itself, so the panel's top edge lands on
        # the rim's rail line instead of chasing it with typed offsets.
        #
        # The OUTER edge has to narrow with height too.  The rim tucks the rail in
        # further than the flank (the rail is already inboard of W_FLANK before the
        # tuck is applied), so a panel of constant width stands ~36 mm proud of the
        # rim at the top and leaves a dark sliver at each corner.
        def wx(z, x):
            if abs(x) < 0.560:                       # the tailgate: no taper needed
                return x
            t = min(1.0, max(0.0, (z - 0.940) / (Z_P1 - 0.940)))
            return x - (x / abs(x)) * 0.042 * t * t

        zs = [Z_P0, 0.940, Z_P1 - 0.058, Z_P1 - 0.024, Z_P1]
        loft(p, [[(wx(z, x0), Y_P0 + tail_lean(z), z),
                  (wx(z, x1), Y_P0 + tail_lean(z), z),
                  (wx(z, x1), Y_P1, z), (wx(z, x0), Y_P1, z)] for z in zs],
             "RangerPaint")

    rear_panel(-0.545, 0.545)
    for sx in (1, -1):
        rear_panel(sx * 0.551, sx * W_PANEL)
        # Tail lamp: red / clear / red, top to bottom, per the reference unit.  The
        # dark bezel is not decoration — with a red default body the red lens would
        # otherwise vanish into the paint and only the clear band would read.
        box(p, sx * 0.558, sx * (W_PANEL - 0.008), Y_P0 - 0.004, Y_P0 + 0.016,
            Z_TAIL0 - 0.014, Z_TAIL1 + 0.014, DARK)
        for z0, z1, mt in ((0.906, Z_TAIL1, "RangerTail"),
                           (0.812, 0.902, "RangerLens"),
                           (Z_TAIL0, 0.808, "RangerTail")):
            box(p, sx * 0.570, sx * (W_PANEL - 0.020), Y_P0 - 0.024, Y_P0 + 0.010,
                z0, z1, mt)

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
        box(p, sx * 0.590, sx * 0.816, -2.132, -2.100, 0.108, 0.442, "RangerTrim")


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
    box(p, -0.692, 0.692, Y_CAB_REAR + 0.015, Y_CAB_REAR + 0.045, Z_FLOOR + 0.008,
        Z_BELT, DARK)

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
