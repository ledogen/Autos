"""
ASSET-22 - rural mailbox, FIVE flavours, one parametric generator.  AUTOS.

    blender --background --python mailbox.py -- export
    (or, the way it was actually built: paste into Blender's text editor, or
     exec the file over blender-mcp, and call export())

Built against Blender 5.2.0 LTS.
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md


WHAT THIS IS
------------
Eleven mailboxes, one generator, ELEVEN .glb FILES - the steel-drum.py / road-signs.py
packaging.  Each variant is built alone in a fresh scene and exported on its own, so a
spawner brings in ONE mailbox, not a set:

    mailbox-classic.glb   galvanised tunnel box, 4x4 timber post, flag up
    mailbox-tube.glb      same box on a steel pipe post, newspaper tube slung beneath
    mailbox-leaning.glb   canted post, dented box, door hanging open, flag snapped off
    mailbox-cluster.glb   three small boxes on a shared rail between two posts
    mailbox-pillar.glb    box on a mortared stone pillar with a concrete cap
    mailbox-bucket.glb    post set in a 5-gallon pail of concrete
    mailbox-planter.glb   wash-tub planter at the foot, flat cap on the post
    mailbox-barn.glb      a barn: gable, overhanging dark roof, white trim on red
    mailbox-limb.glb      a tree limb for the post, standard box
    mailbox-chicken.glb   jigsawn chicken cut-outs bolted to a standard box
    mailbox-fancy.glb     cast aluminium box cantilevered off a sleeved post: plaque, scroll bracket, ball

SIX OF THE ELEVEN REUSE tunnel_box() UNCHANGED.  That is the shape of the kit: a mailbox
is a mailbox, and the variety lives in WHAT IT IS MOUNTED ON.  Only the barn and the cast
one replace the box itself, because those are a different object in the world rather than
a different mounting.

The .blend holds all five side by side as the source view.  `build()` gives you that;
`export()` writes the files and then rebuilds the combined view before saving.


NO TEXTURE - ART-STYLE SUPERSEDES THE TICKET'S 512x256 ALBEDO
-------------------------------------------------------------
The ticket (2026-08-03) budgets one albedo for "galvanised steel, rust at the seams,
timber grain, a faint house number".  Three of those four are WEAR, which ART-STYLE rule
1 names as the anti-pattern, and gas-pump (2026-08-22) already had exactly that list
stripped down to the printed parts.  The fourth, the house number, is ~25 mm of lettering
on a 0.20 m box: at the 40 m silhouette distance the ticket itself sets, it is sub-pixel,
and there is no addressing system in the game for it to carry information INTO.  So the
whole kit is flat colour, zero images - which is also the escape ASSETS.md offers from
the kit texture trap ("either give each variant its own small bake or keep the kit
untextured"), since five .glb files cannot share one image and three.js cannot dedupe an
image across separate loads.

Variety instead comes from two places that cost nothing:
  * FIVE DISTINCT SILHOUETTES - the real anti-clone lever at driving distance.
  * RUNTIME RECOLOUR of `MailBox` via the curated palette in data/prop-models.js
    (gnome.glb precedent, owner ruling 2026-08-21).  Everything else is fixed.


AXES AND CONVENTIONS  (ASSETS.md)
---------------------------------
Blender +Z up, exported with +Y up, so (x, y, z)_blender -> (x, z, -y)_gltf.

  * BASE-SEATED: lowest point at z = 0, post foot at the origin in x/y.
  * The box OPENING (its door) faces Blender +Y, which is glTF -Z = the project
    forward.  DERIVE THIS, DO NOT GUESS IT: the conversion sends Blender +Y to
    glTF -Z, so a door modelled facing Blender -Y - which is what "facing you in
    Blender's Front view" means, and is the natural thing to type - exports
    facing glTF +Z and the mailbox addresses the wrong side of the road.  This
    generator shipped that way for three audit rounds and no screenshot showed
    it; the numeric check did.  road-signs.py states the same derivation.
  * The FLAG is on Blender -X, which is glTF -X (the conversion is a proper
    rotation, determinant +1, so X is untouched).  Ticket requirement.

THE FLAG IS ITS OWN NODE, named `Flag`, a CHILD of the body, with its origin ON the
pivot, and transforms deliberately NOT applied to it (ranger.glb's SteeringWheel
precedent - applying location would move the origin to the world centre and rotating it
would orbit the whole mailbox).  So "flag down" is a transform, never a second model:

    flag.rotation.x = +1.35          // ~ +77 degrees, blade swings rearward (+Z gltf)

The axis really is node-local X in three.js: a Blender rotation about +X maps to a glTF
rotation about +X with the same sign, because the +Y-up conversion M = [[1,0,0],[0,0,1],
[0,-1,0]] gives M Rx(t) M^-1 = Rx(t).  Derived, not eyeballed.

mailbox-leaning has NO Flag node, on purpose: its flag is snapped off and only the
bracket stub remains, which is part of the body.  Check for the node, do not assume it.


WHAT TO WATCH IF YOU EDIT THIS
------------------------------
  * TRI BUDGET 250 IS HARD (ticket).  This is the most-repeated object in the game.
    Report evaluated tris through the depsgraph, never the base mesh.
  * THE DOOR IS BUILT TWO WAYS, and the cheap one exists for a reason.  The four
    single-box variants get a PROUD slab (the inset outline extruded out past the box
    lip: 36 tris) because the leaning variant has to be able to swing it open on a real
    hinge line.  The cluster gets a RECESSED door instead (a rim ring stepping back to an
    inset cap: 44 tris for the whole box vs 64) because three boxes of proud slab does not
    fit in 250.  At a bank-of-three's viewing distance the rim shadow reads better than
    the slab edge anyway.
  * NOTHING ABUTS EXACTLY.  Every joint interpenetrates by 3-10 mm.  Two pieces sharing a
    face plane exactly give you either welded-away verts or a pair of coincident parallel
    faces, and the second one z-fights under engine lighting where the Blender viewport
    shows nothing.
  * NO RANDOMNESS.  The leaning variant's dents are sin-based and deterministic, same as
    drum-crushed.  Date/random are banned in this pipeline.
"""

import bpy
import bmesh
import math
import os

# ===========================================================================
# PARAMETERS
# ===========================================================================

OUT_DIR = "/Users/ledogen/CodeShit/CarGame/assets/models"
OUT_BLEND = "/Users/ledogen/CodeShit/CarGame/assets/models/src/mailbox.blend"

TRI_BUDGET = 250                     # ticket, hard, per variant

# --- the #1-size steel tunnel box ------------------------------------------
# Real T1 rural box is 165 wide x 220 tall x 480 deep.  The ticket rounds the
# width up to 0.20, which also makes the arch radius equal the half width, so
# the straight side and the arch meet tangentially with no kink.
BOX_HW = 0.100                       # half width -> 0.200 overall
BOX_SIDE = 0.112                     # straight side wall before the arch
BOX_H = BOX_SIDE + BOX_HW            # 0.212 local height
BOX_D = 0.455                        # tunnel depth; + the door = the ticket's 0.48
ARCH_SEG = 7                         # arch segments (-> 10-point section loop)

DOOR_RIM = 0.006                     # box lip left visible around the door
DOOR_OUT = 0.013                     # how far the door stands proud
DOOR_IN = 0.010                      # how far it reaches back inside (no coplanar pair)
LATCH = (0.016, 0.010, 0.026)        # handle half-x, proud-y, half-z

BOX_TOP = 1.150                      # ticket: 1.15 m to the box top
BOX_Z0 = BOX_TOP - BOX_H             # 0.938

# --- timber ----------------------------------------------------------------
POST_HS = 0.0445                     # 4x4 nominal = 89 mm square
BOARD_HX, BOARD_HY, BOARD_T = 0.070, 0.150, 0.024    # crossarm platform

# --- flag ------------------------------------------------------------------
FLAG_GAP = 0.013                     # pivot plane outboard of the box wall
FLAG_DY = 0.105                      # pivot toward the door end (+Y)
FLAG_DZ = 0.042                      # pivot above the box floor
FLAG_SHAFT = (0.0045, 0.008, 0.120)  # half-x, half-y, height
FLAG_BLADE = (0.006, 0.042, 0.155)   # thickness-x, half-y, height
FLAG_DROP = 0.020                    # blade root below the shaft top

# --- variant 2: pipe post + newspaper tube ---------------------------------
PIPE_R, PIPE_SEG = 0.029, 6
# The tube is DELIBERATELY oversize (0.145 vs a real 0.115 bore) and wears
# MailBox rather than MailHardware.  At true size in hardware-dark it rendered
# as a flat bar on a dark post and disappeared entirely - the whole point of
# this variant is that a paper-route target is legible from the road.
NEWS_R, NEWS_WALL, NEWS_SEG = 0.0725, 0.011, 8
NEWS_D = 0.320                       # SHORTER than the box, and set forward, so
NEWS_Y = 0.038                       # the two do not stack into one slab
NEWS_Z = 0.826                       # tube axis height (tucked under the box)

# --- variant 3: the derelict -----------------------------------------------
LEAN_POST_TOP = 0.868                # sagging: 54 mm lower than the classic
# COMPOUND lean, and the Y term is the bigger one on purpose: the box faces
# the road, so the player sees it head-on, and a lean about X (toward/away from
# the road) is invisible from exactly the angle it is viewed from.  A lean about
# Y leans it left-right in the player's view, which is the one that reads.
# NEGATIVE tips the top toward the road.  About +X, y' = y cos t - z sin t, so
# a point high on the post moves to +Y only when sin t < 0.  The sign that
# "looks right" when typed is the one that leans it away.
LEAN_X = math.radians(-5.0)
LEAN_Y = math.radians(8.0)
LEAN_BOX_ROLL = math.radians(4.5)    # box itself sits crooked on the post
# PAST 90 DEGREES, deliberately.  At 62 the door stood out level like a shelf;
# a real unlatched door swings past horizontal and DANGLES below its hinge, and
# that droop is the whole silhouette cue.
DOOR_SWING = math.radians(-146.0)    # negative: about +X, the top falls to +Y
DENT = (0.034, 0.014)                # crown stave-in, flank ripple

# --- variant 4: the shared-driveway bank -----------------------------------
C_HW = 0.0825                        # 0.165 wide small boxes (true T1 width)
C_SIDE = 0.092
C_H = C_SIDE + C_HW                  # 0.1745
C_D = 0.400
C_SEG = 5
C_X = (-0.300, 0.0, 0.300)           # box centres
C_RAIL = (0.420, 0.080, 0.046)       # half-x, half-y, thickness
C_RAIL_TOP = 0.900
C_POST_X = 0.300

# --- variant 5: the masonry pillar -----------------------------------------
# (height, half-x, half-y, yaw degrees).  Uneven courses + alternating yaw is
# what makes a stack of boxes read as laid stone instead of as a tapered plinth.
# Taper is SMALL (32 mm total) and yaw is LARGE relative to it.  The first cut
# tapered 48 mm with 2 degrees of yaw and every course read as a deliberate
# ledge - a wedding cake, not laid stone.  Once a corner's yaw swing (~17 mm)
# is the same order as the step, the steps read as jitter instead.
PILLAR_COURSES = [
    (0.200, 0.252, 0.234, 3.0),
    (0.190, 0.244, 0.226, -4.5),
    (0.185, 0.236, 0.219, 2.0),
    (0.175, 0.228, 0.212, -3.5),
    (0.155, 0.220, 0.205, 4.0),
]
PILLAR_CAP = (0.075, 0.250, 0.242)   # thickness, half-x, half-y

# --- variant 6: post set in a 5-gallon pail of concrete --------------------
# Real pail: 290 top dia x 250 bottom x 370 tall.
BUCKET_RT, BUCKET_RB, BUCKET_H, BUCKET_SEG = 0.145, 0.125, 0.370, 8
BUCKET_WALL, CONCRETE_H = 0.010, 0.318

# --- variant 7: galvanised wash-tub planter, flat cap on the post ----------
TUB_RT, TUB_RB, TUB_H, TUB_SEG = 0.300, 0.252, 0.205, 8
TUB_WALL, SOIL_H = 0.013, 0.158
PLANTER_POST_TOP = 1.200             # the post runs PAST the box to a flat cap
PLANTER_CAP_T = 0.008                # cap board above the post top

# --- variant 8: the barn ---------------------------------------------------
# TALLER than the kit box (owner, 2026-10-01): at 0.118 walls the barn read as
# a squat shed. 0.170 + a 0.110 gable puts the ridge at 1.22 m - the barn
# grows UPWARD from the kit's standard 0.924 sill, it does not sink.
BARN_HW, BARN_WALL_H, BARN_GABLE = 0.112, 0.170, 0.110
BARN_D, BARN_EAVE = 0.430, 0.026
BARN_ROOF_T, BARN_ROOF_DROP, BARN_OVER = 0.018, 0.010, 0.028
BARN_Z0 = 0.924

# --- variant 9: a tree limb for the post -----------------------------------
# (z, radius, x offset, y offset).  Deterministic wander, no randomness: the
# offsets ARE the variant - a straight tapered column reads as a turned post.
LIMB_SEG = 6
LIMB_STATIONS = [(0.000, 0.085,  0.000,  0.000),
                 (0.230, 0.076,  0.014, -0.009),
                 (0.460, 0.069,  0.006,  0.012),
                 (0.690, 0.062, -0.011,  0.007),
                 (0.922, 0.056, -0.003, -0.005)]

# --- variant 10: the chicken ----------------------------------------------
# Flat cut-outs standing in the box's lengthwise plane, thin in X - which is
# exactly how the real ones are made (jigsawn ply bolted to a stock box), so
# the cheap way to build it and the honest way are the same way.
CHICK_T = 0.010
# Legs sit OUTBOARD of the post (half-width 0.0445) or the post swallows them,
# and inboard of the flag at x -0.113.
CHICK_LEG_X, CHICK_LEG = 0.062, (0.015, 0.009, 0.185)

# --- variant 11: the cast-aluminium one ------------------------------------
# Rebuilt 2026-10-01 from the owner's reference photo (box cantilevered off a
# square post on a base sleeve). Box is square-sectioned, not arched.
FANCY_HW, FANCY_H, FANCY_D = 0.105, 0.215, 0.420
FANCY_Y0 = 0.035                     # box back end, 11 mm into the post
FANCY_Z0 = 0.915                     # box floor; lid top lands at ~1.15
# The reference box is CHUNKY - ~0.55 tall-to-long with the lid. At 0.170 it
# read as a kit tunnel box with corners, not the cast one.
FANCY_LID_OVER = 0.008               # NOT more: the flag blade passes at 9.5 mm
FANCY_POST_HS = 0.046                # ~4.5 in square
FANCY_SLEEVE = (0.080, 0.400)        # half-width, height of the base sleeve
FANCY_POST_TOP = 1.400               # a clear shaft of post above the lid
FANCY_BALL = 0.046                   # ball radius (sits on the post cap)
FANCY_BRACKET = (0.130, 0.220, 0.024)  # reach along Y, drop, band thickness

# --- materials (LINEAR, judged rendered - ART-STYLE rule 5) ----------------
MATS = {
    #  name            base colour (linear)              rough
    # Galvanised steel.  THE recolour hook (data/prop-models.js palette).
    "MailBox": ((0.185, 0.192, 0.198, 1.0), 0.45),
    # Weathered, silvered timber - greyer and far darker than it looks typed.
    "MailPost": ((0.108, 0.092, 0.072, 1.0), 0.92),
    # Signal red.  Fixed: a mailbox flag is red or it is not a mailbox flag.
    "MailFlag": ((0.420, 0.034, 0.022, 1.0), 0.55),
    # Dark hardware: latch, brackets, pipe post, newspaper tube.
    "MailHardware": ((0.052, 0.055, 0.060, 1.0), 0.40),
    # Pillar only.  Dark laid stone...
    "MailStone": ((0.150, 0.146, 0.138, 1.0), 0.85),
    # ...under a light cast cap.  The split buys the pillar its value structure
    # (dark base / light belt / saturated box), which one grey could not.
    # ALSO carries the galvanised wash tub and the bucket's concrete - a light
    # grey cast/galvanised surface is one material, used three ways.
    "MailCap": ((0.208, 0.202, 0.190, 1.0), 0.80),
    # Weathered plastic pail.  DARK on purpose: a light bucket at the foot of a
    # post inverts the value structure ART-STYLE rule 5 asks for (something dark
    # at the base to sit it down).
    "MailBucket": ((0.145, 0.160, 0.140, 1.0), 0.55),
    # Planting.  The tub's fill surface IS this, so no separate soil material -
    # at tub scale you see foliage, not dirt.  BLOOMS REUSE MailFlag: red
    # geraniums are the commonest thing in a tub planter and the red is already
    # in the model for the flag, which saves a seventh draw call on the one
    # variant that was going to need it.
    "MailLeaf": ((0.052, 0.140, 0.040, 1.0), 0.90),
    # --- the barn ---
    "BarnBody": ((0.230, 0.038, 0.028, 1.0), 0.80),
    "BarnTrim": ((0.620, 0.600, 0.560, 1.0), 0.85),
    "BarnRoof": ((0.072, 0.076, 0.082, 1.0), 0.70),
    # --- the cast-aluminium one.  One white carries box, post AND plinth, so
    # the whole variant is three materials - the cheapest in the kit.
    "FancyWhite": ((0.640, 0.628, 0.608, 1.0), 0.55),
    # --- per-flavour box paints.  Same steel as MailBox, different AUTHORED
    # colour, because each pool's colour 0 must equal what the .glb carries
    # and these two flavours forbid the galvanised grey.  Values are entries of
    # MAILBOX_PAINT in data/prop-models.js - keep them identical.
    "PillarBox": ((0.195, 0.042, 0.028, 1.0), 0.45),     # oxide red
    "ChickenBody": ((0.520, 0.495, 0.430, 1.0), 0.45),   # cream (the white bird)
    # --- the chicken.  Beak AND legs, so it earns its draw call twice.
    "ChickenBeak": ((0.520, 0.290, 0.030, 1.0), 0.70),
}


# ===========================================================================
# GEOMETRY PRIMITIVES
# ===========================================================================

class Part:
    """A flat soup of verts + faces + a per-face material name."""

    def __init__(self, name):
        self.name = name
        self.v = []
        self.f = []
        self.m = []

    def add(self, verts, faces, mats):
        o = len(self.v)
        self.v.extend(verts)
        if isinstance(mats, str):
            mats = [mats] * len(faces)
        for f, mt in zip(faces, mats):
            self.f.append(tuple(o + i for i in f))
            self.m.append(mt)

    def mark(self):
        return len(self.v)

    def xform(self, i0, fn, i1=None):
        """Rewrite verts [i0, i1) through fn((x,y,z)) -> (x,y,z)."""
        i1 = len(self.v) if i1 is None else i1
        for i in range(i0, i1):
            self.v[i] = fn(self.v[i])

    def seat(self):
        """Base-seat: lowest point to z = 0."""
        dz = min(v[2] for v in self.v)
        self.v = [(x, y, z - dz) for (x, y, z) in self.v]


def box(p, x0, x1, y0, y1, z0, z1, mat):
    """Axis-aligned box, 6 quads, windings outward (and _orient_islands
    backstops it anyway)."""
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
         (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7),          # -Z, +Z
         (0, 1, 5, 4), (2, 3, 7, 6),          # -Y, +Y
         (3, 0, 4, 7), (1, 2, 6, 5)]          # -X, +X
    p.add(v, f, mat)


def yawed_box(p, cx, cy, hx, hy, z0, z1, deg, mat):
    """A box rotated about its own vertical centre line.  The pillar's courses."""
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    corners = [(-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy)]
    r = [(cx + x * c - y * s, cy + x * s + y * c) for (x, y) in corners]
    v = [(r[i][0], r[i][1], z0) for i in range(4)] + \
        [(r[i][0], r[i][1], z1) for i in range(4)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7),
         (0, 1, 5, 4), (2, 3, 7, 6),
         (3, 0, 4, 7), (1, 2, 6, 5)]
    p.add(v, f, mat)


def arch_loop(hw, side, seg):
    """The mailbox cross-section, as a CLOSED loop of (x, z) in box-local space
    with z = 0 at the floor: up the left wall, over a semicircular arch whose
    radius IS the half width, down the right wall, and the floor closes it.

    seg arch segments -> seg + 3 points, so seg + 3 extruded side quads."""
    pts = [(-hw, 0.0)]
    for i in range(seg + 1):
        a = math.pi * (1.0 - i / seg)           # 180 deg -> 0
        pts.append((hw * math.cos(a), side + hw * math.sin(a)))
    pts.append((hw, 0.0))
    return pts


def inset_loop(loop, d):
    """Offset a convex closed loop inward by d, by intersecting offset edges.
    Exact, unlike a bisector nudge, which drifts at the arch/wall tangent."""
    n = len(loop)
    area = 0.5 * sum(loop[i][0] * loop[(i + 1) % n][1] -
                     loop[(i + 1) % n][0] * loop[i][1] for i in range(n))
    s = 1.0 if area > 0.0 else -1.0             # inward normal handedness
    lines = []
    for i in range(n):
        px, pz = loop[i]
        qx, qz = loop[(i + 1) % n]
        ex, ez = qx - px, qz - pz
        L = math.hypot(ex, ez)
        nx, nz = -ez / L * s, ex / L * s        # left normal = inward for CCW
        lines.append((nx, nz, nx * px + nz * pz + d))
    out = []
    for i in range(n):
        ax, az, ac = lines[(i - 1) % n]
        bx, bz, bc = lines[i]
        det = ax * bz - az * bx
        if abs(det) < 1e-9:
            out.append(loop[i])
            continue
        out.append(((ac * bz - az * bc) / det, (ax * bc - ac * bx) / det))
    return out


def extrude(p, loop, y0, y1, mat, cap0=True, cap1=True, mat0=None, mat1=None):
    """Sweep a closed (x, z) loop along Y.  len(loop) side quads + 2 ngon caps."""
    n = len(loop)
    v = [(x, y0, z) for (x, z) in loop] + [(x, y1, z) for (x, z) in loop]
    f, m = [], []
    for i in range(n):
        j = (i + 1) % n
        f.append((i, j, n + j, n + i))
        m.append(mat)
    if cap0:
        f.append(tuple(range(n - 1, -1, -1)))
        m.append(mat0 or mat)
    if cap1:
        f.append(tuple(range(n, 2 * n)))
        m.append(mat1 or mat)
    p.add(v, f, m)


def ring(p, loop_a, ya, loop_b, yb, mat):
    """Quad band between two loops of equal length at two Y depths.  The
    recessed-door rim, and the newspaper tube's mouth."""
    n = len(loop_a)
    v = [(x, ya, z) for (x, z) in loop_a] + [(x, yb, z) for (x, z) in loop_b]
    f = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    p.add(v, f, mat)


def ngon(p, loop, y, mat, flip=False):
    n = len(loop)
    v = [(x, y, z) for (x, z) in loop]
    idx = tuple(range(n - 1, -1, -1)) if flip else tuple(range(n))
    p.add(v, [idx], mat)


def pipe_y(p, cx, cz, r, y0, y1, mat, seg=6, cap0=True, cap1=True):
    loop = [(cx + r * math.cos(2 * math.pi * (i + 0.5) / seg),
             cz + r * math.sin(2 * math.pi * (i + 0.5) / seg)) for i in range(seg)]
    extrude(p, loop, y0, y1, mat, cap0, cap1)


def open_tube_y(p, cx, cz, r, wall, y0, y1, mat, seg=6, back=0.040,
                bore_mat=None):
    """A newspaper tube: closed at +Y, open mouth at y0, with a real wall
    thickness so the mouth reads as a hole and not as a flat disc.

    Built as ONE closed manifold (outer shell + mouth rim + inner wall + inner
    floor + back cap), so recalc_face_normals orients the cavity correctly on
    its own - the inner wall's 'outward' is toward the axis."""
    def circ(rad):
        return [(cx + rad * math.cos(2 * math.pi * (i + 0.5) / seg),
                 cz + rad * math.sin(2 * math.pi * (i + 0.5) / seg))
                for i in range(seg)]
    bore_mat = bore_mat or mat
    sgn = 1.0 if y1 > y0 else -1.0       # the blind end steps back TOWARD the mouth
    outer, inner = circ(r), circ(r - wall)
    extrude(p, outer, y0, y1, mat, cap0=False, cap1=True)     # shell + back
    ring(p, outer, y0, inner, y0, mat)                        # mouth rim
    # The bore is DARK, not the shell colour.  Lit from outside, a same-colour
    # bore just shades slightly and the mouth reads as a flat disc - the tube
    # comes back as a collar on the post.  Same move as the derelict's cavity.
    extrude(p, inner, y0, y1 - sgn * back, bore_mat, cap0=False, cap1=False)
    ngon(p, inner, y1 - sgn * back, bore_mat)                       # bore floor




# --- primitives the second wave of flavours needed -------------------------

def band(p, ring_a, ring_b, mat):
    """Quad band between two equal-length vertex rings. The stacked-ring
    builder behind every vessel and column below."""
    n = len(ring_a)
    v = list(ring_a) + list(ring_b)
    f = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    p.add(v, f, mat)


def disc(p, ring_v, mat, flip=False):
    n = len(ring_v)
    idx = tuple(range(n - 1, -1, -1)) if flip else tuple(range(n))
    p.add(list(ring_v), [idx], mat)


def ring_z(r, z, seg, dx=0.0, dy=0.0):
    return [(dx + r * math.cos(2 * math.pi * (i + 0.5) / seg),
             dy + r * math.sin(2 * math.pi * (i + 0.5) / seg), z) for i in range(seg)]


def extrude_x(p, loop, x0, x1, mat, cap0=True, cap1=True):
    """Sweep a closed (y, z) loop along X - the orthogonal twin of extrude().
    Every flat cut-out that stands in the box's LENGTHWISE plane goes through
    here: the chicken's neck, comb, beak and tail, and the fancy one's scroll
    bracket."""
    n = len(loop)
    v = [(x0, y, z) for (y, z) in loop] + [(x1, y, z) for (y, z) in loop]
    f, m = [], []
    for i in range(n):
        j = (i + 1) % n
        f.append((i, j, n + j, n + i))
        m.append(mat)
    if cap0:
        f.append(tuple(range(n - 1, -1, -1)))
        m.append(mat)
    if cap1:
        f.append(tuple(range(n, 2 * n)))
        m.append(mat)
    p.add(v, f, m)


def vessel(p, z0, h, r_top, r_bot, wall, fill_h, mat, fill_mat, seg=8):
    """An open-topped tapered vessel with a real wall thickness and a fill
    surface: the pail of concrete and the wash tub of flowers.

    Built as ONE closed manifold - bottom, outer wall, rim band, inner wall,
    fill disc - so recalc_face_normals turns the cavity inward by itself. The
    rim band is what makes it read as a vessel rather than a solid stump: a
    fill disc flush with the top edge reads as a painted lid.
    Cost: 8*seg - 4 tris."""
    k = (r_top - r_bot) / h
    ob = ring_z(r_bot, z0, seg)
    ot = ring_z(r_top, z0 + h, seg)
    it = ring_z(r_top - wall, z0 + h, seg)
    inf = ring_z(r_bot + k * fill_h - wall, z0 + fill_h, seg)
    disc(p, ob, mat, flip=True)
    band(p, ob, ot, mat)
    band(p, ot, it, mat)
    band(p, it, inf, mat)
    disc(p, inf, fill_mat)


def column_z(p, stations, mat, seg=6):
    """A wandering tapered column. stations are (z, radius, dx, dy)."""
    rings = [ring_z(r, z, seg, dx, dy) for (z, r, dx, dy) in stations]
    disc(p, rings[0], mat, flip=True)
    for a, b in zip(rings[:-1], rings[1:]):
        band(p, a, b, mat)
    disc(p, rings[-1], mat)


def octa(p, c, r, mat):
    """An octahedron. 8 tris, and at road distance it is a ball - a real
    lathed sphere would be 30+ tris to say the same thing, and ART-STYLE rule 3
    wants the facets anyway."""
    cx, cy, cz = c
    rx, ry, rz = r
    v = [(cx, cy, cz + rz), (cx + rx, cy, cz), (cx, cy + ry, cz),
         (cx - rx, cy, cz), (cx, cy - ry, cz), (cx, cy, cz - rz)]
    f = [(0, 1, 2), (0, 2, 3), (0, 3, 4), (0, 4, 1),
         (5, 2, 1), (5, 3, 2), (5, 4, 3), (5, 1, 4)]
    p.add(v, f, mat)


def ball(p, c, r, mat, seg=6):
    """A faceted ball: two latitude rings and two poles. 4*seg tris - 32 at
    seg 8. The fancy post's finial. The octahedron it replaced read as a
    spike, and at seg 6 the ball read as a little hip-roofed box: at the top
    of a post the silhouette is all there is, so this is where 8 tris go."""
    cx, cy, cz = c
    # Rings at +/-25 deg and STAGGERED half a step, so the equator is a zigzag
    # of triangles rather than a vertical band - a straight band reads as a
    # cut gem or a lantern, the stagger reads as round.
    la, st = math.radians(25.0), math.pi / seg
    rr, hz = r * math.cos(la), r * math.sin(la)
    up = [(cx + rr * math.cos(2 * math.pi * i / seg), cy + rr * math.sin(2 * math.pi * i / seg),
           cz + hz) for i in range(seg)]
    dn = [(cx + rr * math.cos(2 * math.pi * i / seg + st),
           cy + rr * math.sin(2 * math.pi * i / seg + st), cz - hz) for i in range(seg)]
    v = [(cx, cy, cz + r), (cx, cy, cz - r)] + up + dn
    f = []
    for i in range(seg):
        j = (i + 1) % seg
        u_i, u_j, d_i, d_j = 2 + i, 2 + j, 2 + seg + i, 2 + seg + j
        f.append((0, u_i, u_j))
        f.append((u_i, d_i, u_j))
        f.append((u_j, d_i, d_j))
        f.append((1, d_j, d_i))
    p.add(v, f, mat)


def slab_xz(p, cx, cz, w, h, y0, y1, deg, mat):
    """A rectangle rotated in the XZ plane and extruded along Y - the barn
    door's X-braces and the tree limb's lopped branch stub."""
    a = math.radians(deg)
    c, sn = math.cos(a), math.sin(a)
    pts = [(-w * 0.5, -h * 0.5), (w * 0.5, -h * 0.5),
           (w * 0.5, h * 0.5), (-w * 0.5, h * 0.5)]
    extrude(p, [(cx + x * c - z * sn, cz + x * sn + z * c) for (x, z) in pts],
            y0, y1, mat)


# ===========================================================================
# SUB-ASSEMBLIES
# ===========================================================================

CAVITY_D = 0.090                     # how far you can see into an open box
SLEEVE_IN = 0.008                    # cavity sleeve inset from the shell


def tunnel_box(p, hw, side, depth, seg, z0, proud_door=True,
               mat="MailBox", latch=True, cx=0.0, open_front=False):
    """The steel box.  Returns (loop, y_front, i_shell, i_door) so callers can
    hinge the door or dent the shell afterwards.

    open_front builds a real recessed CAVITY behind the door instead of a
    closed front cap.  The derelict needs it: swing the door away from a capped
    shell and the "open" mailbox is a solid galvanised wall.  It is still
    ART-STYLE's "cap every opening" - the opening is capped, 90 mm back and in
    the dark hardware colour, the same move as the trailer's recessed
    curtains."""
    i0 = p.mark()
    loop = [(cx + x, z0 + z) for (x, z) in arch_loop(hw, side, seg)]
    yf, yb = depth * 0.5, -depth * 0.5      # yf = FRONT = +Y = glTF -Z

    if proud_door:
        if open_front:
            # Shell + lip + sleeve + cavity floor is ONE closed manifold, so
            # recalc_face_normals turns the sleeve inward on its own.
            extrude(p, loop, yf, yb, mat, cap0=False, cap1=True)
            # 8 mm, not 4: the derelict DENTS this shell afterwards, and the
            # sleeve has to stay nested inside it through the dent.
            sleeve = inset_loop(loop, SLEEVE_IN)
            ring(p, loop, yf, sleeve, yf - SLEEVE_IN, mat)
            extrude(p, sleeve, yf - SLEEVE_IN, yf - CAVITY_D, "MailHardware",
                    cap0=False, cap1=False)
            ngon(p, sleeve, yf - CAVITY_D, "MailHardware")
        else:
            # Shell front cap stays whole: a DOOR_RIM lip shows around the slab.
            extrude(p, loop, yf, yb, mat)
        door = inset_loop(loop, DOOR_RIM)
        d0 = p.mark()
        extrude(p, door, yf + DOOR_OUT, yf - DOOR_IN, mat)
        if latch:
            lz = z0 + side + hw * 0.52
            box(p, cx - LATCH[0], cx + LATCH[0],
                yf + DOOR_OUT - 0.004, yf + DOOR_OUT + LATCH[1],
                lz - LATCH[2], lz + LATCH[2], "MailHardware")
        return loop, yf, i0, d0
    else:
        # Cheap door: shell open at the front, a rim ring steps back to an
        # inset cap.  44 tris for the whole box instead of 64.
        extrude(p, loop, yf, yb, mat, cap0=False, cap1=True)
        door = inset_loop(loop, DOOR_RIM * 1.6)
        ring(p, loop, yf, door, yf - 0.014, mat)
        ngon(p, door, yf - 0.014, mat, flip=True)
        return loop, yf, i0, None


def flag_part(hw, z0, cx=0.0):
    """The flag, in ITS OWN local space: origin on the pivot, so a down state
    is flag.rotation.x and nothing else.  Returns (Part, pivot world xyz)."""
    p = Part("Flag")
    sx, sy, sh = FLAG_SHAFT
    bt, bhy, bh = FLAG_BLADE
    box(p, -sx, sx, -sy, sy, 0.0, sh, "MailFlag")                  # shaft
    box(p, -(sx + bt), -sx + 0.001, -bhy, bhy,
        sh - FLAG_DROP, sh - FLAG_DROP + bh, "MailFlag")           # blade
    pivot = (cx - (hw + FLAG_GAP), FLAG_DY, z0 + FLAG_DZ)
    return p, pivot


def flag_stub(p, hw, z0, cx=0.0):
    """What is left after the blade snaps off: the bracket and 40 mm of shaft."""
    sx, sy = FLAG_SHAFT[0], FLAG_SHAFT[1]
    x = cx - (hw + FLAG_GAP)
    box(p, x - sx, x + sx, FLAG_DY - sy, FLAG_DY + sy,
        z0 + FLAG_DZ - 0.010, z0 + FLAG_DZ + 0.040, "MailHardware")


# ===========================================================================
# VARIANTS
# ===========================================================================

def build_classic():
    p = Part("MailboxClassic")
    board_z0 = BOX_Z0 - BOARD_T
    box(p, -POST_HS, POST_HS, -POST_HS, POST_HS, 0.0, board_z0 + 0.008, "MailPost")
    box(p, -BOARD_HX, BOARD_HX, -BOARD_HY, BOARD_HY,
        board_z0, BOX_Z0 + 0.004, "MailPost")
    tunnel_box(p, BOX_HW, BOX_SIDE, BOX_D, ARCH_SEG, BOX_Z0)
    fp, pivot = flag_part(BOX_HW, BOX_Z0)
    return p, fp, pivot


def build_tube():
    """The paper-route drop point: pipe post, newspaper tube under the box.
    The newsRoll asset already exists; this is the thing it goes in."""
    p = Part("MailboxTube")
    plate_z0 = BOX_Z0 - 0.014
    # Pipe post: a 6-gon column.  Built as a Z column via the generic box path
    # would be 12 tris too, but the hexagon silhouette is the whole point of
    # the variant reading as steel rather than timber.
    seg = PIPE_SEG
    loop_xy = [(PIPE_R * math.cos(2 * math.pi * (i + 0.5) / seg),
                PIPE_R * math.sin(2 * math.pi * (i + 0.5) / seg)) for i in range(seg)]
    v = [(x, y, 0.0) for (x, y) in loop_xy] + \
        [(x, y, plate_z0 + 0.010) for (x, y) in loop_xy]
    f = [(i, (i + 1) % seg, seg + (i + 1) % seg, seg + i) for i in range(seg)]
    f.append(tuple(range(seg - 1, -1, -1)))
    f.append(tuple(range(seg, 2 * seg)))
    p.add(v, f, "MailHardware")
    # Mounting plate
    box(p, -0.054, 0.054, -0.112, 0.112, plate_z0, BOX_Z0 + 0.004, "MailHardware")
    tunnel_box(p, BOX_HW, BOX_SIDE, BOX_D, ARCH_SEG, BOX_Z0)
    # Newspaper tube + its strap
    # y0 is the MOUTH, so it is the +Y (road-facing) end.
    open_tube_y(p, 0.0, NEWS_Z, NEWS_R, NEWS_WALL,
                NEWS_Y + NEWS_D * 0.5, NEWS_Y - NEWS_D * 0.5, "MailBox",
                seg=NEWS_SEG, bore_mat="MailHardware")
    box(p, -0.028, 0.028, NEWS_Y - NEWS_D * 0.5 + 0.008, NEWS_Y - NEWS_D * 0.5 + 0.048,
        NEWS_Z + NEWS_R - 0.014, plate_z0 + 0.002, "MailHardware")
    fp, pivot = flag_part(BOX_HW, BOX_Z0)
    return p, fp, pivot


def build_leaning():
    """The derelict.  Three separate signals, because a lean alone reads as a
    modelling mistake: the post is canted AND short, the box is dented AND
    crooked, and the door hangs open."""
    p = Part("MailboxLeaning")
    bz0 = LEAN_POST_TOP + 0.004
    box(p, -POST_HS, POST_HS, -POST_HS * 0.92, POST_HS * 0.92,
        0.0, LEAN_POST_TOP, "MailPost")
    flag_stub(p, BOX_HW, bz0)

    b0 = p.mark()
    loop, yf, _, d0 = tunnel_box(p, BOX_HW, BOX_SIDE, BOX_D, ARCH_SEG, bz0,
                                 latch=True, open_front=True)

    # Door hangs open: hinge on its own bottom-front edge.  Rotating about +X
    # by +DOOR_SWING carries the door's up vector toward -Y, i.e. it falls
    # open and down, which is what an unlatched one does.
    hy, hz = yf + DOOR_OUT, bz0
    c, s = math.cos(DOOR_SWING), math.sin(DOOR_SWING)
    p.xform(d0, lambda v: (v[0],
                           hy + (v[1] - hy) * c - (v[2] - hz) * s,
                           hz + (v[1] - hy) * s + (v[2] - hz) * c))

    # Deterministic shell dents, drum-crushed's sin envelope.  Keyed on angle
    # about the box axis so the arch crown staves in and one flank bulges;
    # amplitude tapers to zero at the floor so the box still sits flat.
    axis_z = bz0 + BOX_SIDE
    def dent(v):
        x, y, z = v
        dx, dz = x, z - axis_z
        r = math.hypot(dx, dz)
        if r < 1e-5:
            return v
        a = math.atan2(dz, dx)
        t = max(0.0, min(1.0, (z - bz0) / BOX_H))
        env = t * t                                  # nothing at the floor
        # LONGITUDINAL VARIATION IS DELIBERATELY WEAK (0.006 at 3 rad/m, so
        # under 2 mm across the 90 mm cavity).  The first cut ran the second
        # term at 12 rad/m, which moved the shell's front rim and the cavity
        # sleeve 90 mm behind it by up to 28 mm DIFFERENTLY - the sleeve came
        # out through the shell and its inward-facing wall was visible from
        # outside as a hole.  Dents that run the length of the box read fine;
        # dents that break the nesting do not.
        dr = env * (DENT[0] * math.sin(2.4 * a + 1.1)
                    + DENT[1] * math.sin(4.3 * a + 0.6)
                    + 0.006 * math.sin(3.0 * y + 0.4))
        k = (r + dr) / r
        return (dx * k, y, axis_z + dz * k)
    p.xform(b0, dent, d0)      # SHELL ONLY - the door has already swung away,
                               # so denting it radially about the box axis
                               # would fling it across the road

    # Box sits crooked on the post: roll about its own length (Y).
    cr, sr = math.cos(LEAN_BOX_ROLL), math.sin(LEAN_BOX_ROLL)
    p.xform(b0, lambda v: (v[0] * cr - (v[2] - bz0) * sr,
                           v[1],
                           bz0 + v[0] * sr + (v[2] - bz0) * cr))

    # Whole assembly cants about the post foot, two axes.
    cx_, sx_ = math.cos(LEAN_X), math.sin(LEAN_X)
    p.xform(0, lambda v: (v[0], v[1] * cx_ - v[2] * sx_, v[1] * sx_ + v[2] * cx_))
    cy_, sy_ = math.cos(LEAN_Y), math.sin(LEAN_Y)
    p.xform(0, lambda v: (v[0] * cy_ + v[2] * sy_, v[1], -v[0] * sy_ + v[2] * cy_))
    p.seat()
    return p, None, None                              # no Flag node: snapped off


def build_cluster():
    """Shared-driveway bank of three.  The one variant whose silhouette is
    WIDE, which is what stops a road of mailboxes reading as a metronome - and
    the multi-customer drop point the ticket's 2026-09-30 note anticipates."""
    p = Part("MailboxCluster")
    rz0 = C_RAIL_TOP - C_RAIL[2]
    for sx in (-C_POST_X, C_POST_X):
        box(p, sx - POST_HS, sx + POST_HS, -POST_HS, POST_HS,
            0.0, rz0 + 0.010, "MailPost")
    box(p, -C_RAIL[0], C_RAIL[0], -C_RAIL[1], C_RAIL[1],
        rz0, C_RAIL_TOP + 0.004, "MailPost")
    for cx in C_X:
        tunnel_box(p, C_HW, C_SIDE, C_D, C_SEG, C_RAIL_TOP,
                   proud_door=False, latch=False, cx=cx)
    flag_stub(p, C_HW, C_RAIL_TOP, cx=C_X[2])         # middle box's is down/broken
    fp, pivot = flag_part(C_HW, C_RAIL_TOP, cx=C_X[0])
    return p, fp, pivot


def build_pillar():
    """Mortared stone pillar.  The only wide dark base in the kit, so it is the
    only one that reads as a PROPERTY rather than as road furniture."""
    p = Part("MailboxPillar")
    z = 0.0
    for (h, hx, hy, yaw) in PILLAR_COURSES:
        yawed_box(p, 0.0, 0.0, hx, hy, z, z + h + 0.004, yaw, "MailStone")
        z += h
    cap_t, cap_hx, cap_hy = PILLAR_CAP
    box(p, -cap_hx, cap_hx, -cap_hy, cap_hy, z - 0.004, z + cap_t, "MailCap")
    bz0 = z + cap_t - 0.004
    # PillarBox, not MailBox: galvanised grey on grey stone read as one
    # monotone lump (owner, 2026-10-01), so this box has its own pool WITHOUT
    # the grey, and colour 0 (the authored one) has to be one of the others.
    tunnel_box(p, BOX_HW, BOX_SIDE, BOX_D, ARCH_SEG, bz0, mat="PillarBox")
    fp, pivot = flag_part(BOX_HW, bz0)
    return p, fp, pivot




# ---------------------------------------------------------------------------
# THE SECOND WAVE (owner, 2026-09-30): six more flavours, same conventions.
#
# Four of them reuse tunnel_box() unchanged - the whole point of the kit is
# that a mailbox is a mailbox and the VARIETY LIVES IN WHAT IT IS MOUNTED ON.
# Only the barn and the cast one replace the box itself, and both of those are
# a different object in the world rather than a different mounting.
# ---------------------------------------------------------------------------

def build_bucket():
    """Post set in a 5-gallon pail of concrete. The 'I am not digging a hole'
    mailbox - a renter's fix, and the one that says nobody owns this place."""
    p = Part("MailboxBucket")
    vessel(p, 0.0, BUCKET_H, BUCKET_RT, BUCKET_RB, BUCKET_WALL, CONCRETE_H,
           "MailBucket", "MailCap", seg=BUCKET_SEG)
    board_z0 = BOX_Z0 - BOARD_T
    # The post foot sits BELOW the concrete surface, hidden under the fill
    # disc - it has to emerge from the concrete, not balance on it.
    box(p, -POST_HS, POST_HS, -POST_HS, POST_HS,
        CONCRETE_H - 0.070, board_z0 + 0.008, "MailPost")
    box(p, -BOARD_HX, BOARD_HX, -BOARD_HY, BOARD_HY,
        board_z0, BOX_Z0 + 0.004, "MailPost")
    tunnel_box(p, BOX_HW, BOX_SIDE, BOX_D, ARCH_SEG, BOX_Z0)
    fp, pivot = flag_part(BOX_HW, BOX_Z0)
    return p, fp, pivot


def build_planter():
    """Wash-tub planter at the foot, flat-capped post. The maintained,
    somebody-lives-here mailbox, and the kit's counterweight to the derelict.

    THE POST RUNS THE FULL HEIGHT, STRAIGHT THROUGH THE BOX. Both are closed
    solids, so the overlap is invisible and it reads exactly as the reference
    does - a post standing behind the box and continuing up to its cap. The
    alternative, cantilevering the box forward on a bracket, puts the flag on
    +X and breaks the ticket's -X rule, so it is not worth the 8 mm of honesty.
    """
    p = Part("MailboxPlanter")
    vessel(p, 0.0, TUB_H, TUB_RT, TUB_RB, TUB_WALL, SOIL_H,
           "MailCap", "MailLeaf", seg=TUB_SEG)
    # Planting: one foliage mound off-centre plus three blooms. The tub's fill
    # surface is already MailLeaf, so this is relief on green, not green on dirt.
    octa(p, (0.105, -0.080, SOIL_H + 0.030), (0.115, 0.105, 0.052), "MailLeaf")
    for (bx, by) in ((-0.120, 0.070), (0.160, 0.095), (-0.055, -0.150)):
        octa(p, (bx, by, SOIL_H + 0.058), (0.040, 0.040, 0.034), "MailFlag")
    # Flat-capped post, no finial: the pyramid read as a spike (owner,
    # 2026-10-01). The cap board overhangs 10 mm all round and its underside
    # sits 18 mm BELOW the post top, so no face of the two shares a plane.
    box(p, -POST_HS, POST_HS, -POST_HS, POST_HS,
        SOIL_H - 0.055, PLANTER_POST_TOP, "MailPost")
    box(p, -POST_HS - 0.010, POST_HS + 0.010, -POST_HS - 0.010, POST_HS + 0.010,
        PLANTER_POST_TOP - 0.018, PLANTER_POST_TOP + PLANTER_CAP_T, "MailPost")
    board_z0 = BOX_Z0 - BOARD_T
    box(p, -BOARD_HX, BOARD_HX, -BOARD_HY, BOARD_HY,
        board_z0, BOX_Z0 + 0.004, "MailPost")
    tunnel_box(p, BOX_HW, BOX_SIDE, BOX_D, ARCH_SEG, BOX_Z0)
    fp, pivot = flag_part(BOX_HW, BOX_Z0)
    return p, fp, pivot


def build_barn():
    """A barn, simplified to its three load-bearing cues: a gable, a dark roof
    that overhangs on all four sides, and white trim on red. Everything the
    reference carries beyond that - battens, cupola, two-tone siding - is below
    the detail threshold at road distance and was dropped.

    The BARN DOOR IS THE MAILBOX DOOR: the X-braced gable end is the +Y face,
    which is glTF -Z, which is the opening. That coincidence is the reason this
    silhouette works as a mailbox at all."""
    p = Part("MailboxBarn")
    hw, wh, gh = BARN_HW, BARN_WALL_H, BARN_GABLE
    yf, yb = BARN_D * 0.5, -BARN_D * 0.5
    board_z0 = BARN_Z0 - BOARD_T

    box(p, -POST_HS, POST_HS, -POST_HS, POST_HS, 0.0, board_z0 + 0.008, "MailPost")
    box(p, -BOARD_HX, BOARD_HX, -BOARD_HY, BOARD_HY,
        board_z0, BARN_Z0 + 0.004, "MailPost")
    # Knee brace, straight off the reference - it is most of what says "barn on
    # a post" rather than "barn".
    # Top 6 mm INTO the board: flush with board_z0 put two faces on one plane.
    slab_xz(p, 0.0, board_z0 - 0.147, 0.040, 0.300, 0.080, 0.150, 0.0, "MailPost")

    # Body: walls + gable, one extruded section.
    body = [(-hw, 0.0), (-hw, wh), (0.0, wh + gh), (hw, wh), (hw, 0.0)]
    extrude(p, [(x, BARN_Z0 + z) for (x, z) in body], yf, yb, "BarnBody")
    # White belt at the sill.
    box(p, -hw - 0.006, hw + 0.006, yf + 0.004, yb - 0.004,
        BARN_Z0 - 0.005, BARN_Z0 + 0.022, "BarnTrim")
    # Roof: a lambda band with eaves AND gable-end overhang, one piece so it
    # cannot delaminate from itself at the ridge.
    e, t, d = BARN_EAVE, BARN_ROOF_T, BARN_ROOF_DROP
    roof = [(-hw - e, wh - d), (0.0, wh + gh + t), (hw + e, wh - d),
            (hw + e, wh - d - t), (0.0, wh + gh), (-hw - e, wh - d - t)]
    extrude(p, [(x, BARN_Z0 + z) for (x, z) in roof],
            yf + BARN_OVER, yb - BARN_OVER, "BarnRoof")
    # The door, on the +Y gable: a WHITE FRAME, a red panel proud of it, and two
    # white braces inside the panel.
    #
    # The frame is not decoration. Without it the door is BarnBody on a BarnBody
    # wall and the whole gable end goes flat - only the X reads, floating. One
    # white rectangle behind the panel gives the end a light border, which is
    # the value break that survives fog where a 12 mm step does not.
    box(p, -hw * 0.70, hw * 0.70, yf - 0.004, yf + 0.007,
        BARN_Z0 + 0.006, BARN_Z0 + wh * 0.97, "BarnTrim")
    box(p, -hw * 0.60, hw * 0.60, yf + 0.006, yf + 0.015,
        BARN_Z0 + 0.014, BARN_Z0 + wh * 0.88, "BarnBody")
    # Braces run corner to corner of the panel, DERIVED from it - so the X
    # stays a door's X whatever BARN_WALL_H is. A fixed length hung 24 mm
    # below the sill at one height and floated small at another.
    #
    # LAPPED, not stacked. Both braces share a centre, so at one depth their end
    # caps are coplanar and the crossing z-fights - and their back faces were
    # coplanar with the panel front as well. Giving each its own 2 mm of depth
    # fixes all three and is how the joint is actually made: one board over the
    # other.
    pz0, pz1 = BARN_Z0 + 0.014, BARN_Z0 + wh * 0.88
    pw, ph = 2.0 * hw * 0.60 - 0.024, (pz1 - pz0) - 0.024
    lean = math.degrees(math.atan2(pw, ph))
    for ang, dy in ((lean, 0.0), (-lean, 0.002)):
        slab_xz(p, 0.0, 0.5 * (pz0 + pz1), 0.018, math.hypot(pw, ph) - 0.018,
                yf + 0.011 + dy, yf + 0.021 + dy, ang, "BarnTrim")
    # Two windows, on the +X flank only - the -X flank belongs to the flag.
    # Centred at 60 % of the wall so they ride up with it.
    wz = BARN_Z0 + wh * 0.60
    for wy in (-0.105, 0.105):
        box(p, hw - 0.004, hw + 0.008, wy - 0.030, wy + 0.030,
            wz - 0.026, wz + 0.026, "BarnTrim")
    # The flag rides OUTBOARD OF THE EAVE on a hardware standoff. Since the
    # walls went to 0.170 the eave sits inside the blade's height range, and a
    # flag on the wall drove its blade straight through the roof.
    fp, pivot = flag_part(hw + BARN_EAVE + 0.004, BARN_Z0)
    sx, sy = FLAG_SHAFT[0], FLAG_SHAFT[1]
    box(p, pivot[0] + sx + 0.001, -hw + 0.004, FLAG_DY - sy - 0.002, FLAG_DY + sy + 0.002,
        pivot[2] - 0.016, pivot[2] + 0.012, "MailHardware")
    return p, fp, pivot


def build_limb():
    """A tree limb for the post, carrying the standard box. The owner's call:
    reuse the box, change what it stands on.

    The limb's WANDER is the whole asset - LIMB_STATIONS offsets each ring in
    x and y, so the column leans and recovers. A straight tapered hexagon reads
    as a turned post, not as something cut out of the woodlot."""
    p = Part("MailboxLimb")
    column_z(p, LIMB_STATIONS, "MailPost", seg=LIMB_SEG)
    # A lopped branch, because a limb that has never been cut is a dowel.
    slab_xz(p, 0.072, 0.602, 0.115, 0.044, -0.024, 0.024, 28.0, "MailPost")
    board_z0 = BOX_Z0 - BOARD_T
    box(p, -BOARD_HX, BOARD_HX, -BOARD_HY, BOARD_HY,
        board_z0, BOX_Z0 + 0.004, "MailPost")
    tunnel_box(p, BOX_HW, BOX_SIDE, BOX_D, ARCH_SEG, BOX_Z0)
    fp, pivot = flag_part(BOX_HW, BOX_Z0)
    return p, fp, pivot


def build_chicken():
    """A stock box with a jigsawn chicken bolted to it - which is how the real
    ones are made, so the cheap way to model it (flat plates, thin in X) and
    the honest way are the same way.

    The box is the standard one but wears ChickenBody, not MailBox: the owner
    allows this bird WHITE OR BLACK only (2026-10-01), and a pool's colour 0
    must be the authored colour, so it needs its own white-authored material.
    Neck and tail are ChickenBody too, so the whole bird changes with it. Comb
    and wattle reuse MailFlag (the red is already in the model); beak and legs
    share ChickenBeak, so the one new material earns its draw call twice."""
    p = Part("MailboxChicken")
    BT = BOX_TOP
    board_z0 = BOX_Z0 - BOARD_T
    box(p, -POST_HS, POST_HS, -POST_HS, POST_HS, 0.0, board_z0 + 0.008, "MailPost")
    box(p, -BOARD_HX, BOARD_HX, -BOARD_HY, BOARD_HY,
        board_z0, BOX_Z0 + 0.004, "MailPost")
    # latch=False buys the 12 tris the thicker neck and fuller tail cost. On a
    # box with a chicken bolted to it, nobody is looking at the handle.
    tunnel_box(p, BOX_HW, BOX_SIDE, BOX_D, ARCH_SEG, BOX_Z0, latch=False,
               mat="ChickenBody")

    t = CHICK_T * 0.5
    # Neck + head, rising over the door end (+Y).
    #
    # THE NECK IS THICK AND SHORT, and that is the whole read. The first cut was
    # 60 mm wide and 290 mm tall and came back a goose - a periscope with a comb
    # on it; the second was still a slab. A chicken's neck FLARES into the
    # breast and carries a SMALL head, so: 116 mm at the root, 224 mm of rise
    # (about one box height, matching the reference), and a 130 mm head blob
    # with the comb sitting down on the crown rather than perched above it.
    extrude_x(p, [(0.088, BT - 0.030), (0.106, BT + 0.086), (0.128, BT + 0.160),
                  (0.152, BT + 0.200), (0.198, BT + 0.224), (0.244, BT + 0.204),
                  (0.258, BT + 0.176), (0.250, BT + 0.150), (0.234, BT + 0.118),
                  (0.220, BT + 0.058), (0.204, BT - 0.030)],
              -t, t, "ChickenBody")
    # Comb and wattle - red, same material as the flag. Three bumps, not two
    # spikes: two reads as a dinosaur.
    extrude_x(p, [(0.158, BT + 0.206), (0.170, BT + 0.252), (0.188, BT + 0.260),
                  (0.204, BT + 0.232), (0.222, BT + 0.256), (0.240, BT + 0.200)],
              -t * 0.8, t * 0.8, "MailFlag")
    extrude_x(p, [(0.244, BT + 0.140), (0.256, BT + 0.108), (0.242, BT + 0.082),
                  (0.228, BT + 0.114)],
              -t * 0.8, t * 0.8, "MailFlag")
    # Beak.
    extrude_x(p, [(0.256, BT + 0.188), (0.318, BT + 0.164), (0.252, BT + 0.146)],
              -t * 0.8, t * 0.8, "ChickenBeak")
    # Tail: a rounded hump swept up and back, not the thin fin of the first cut.
    # ROOT IT WIDE (118 mm) or it is a fin. A tail is a mass over the back end
    # of the bird, not a blade standing on it.
    extrude_x(p, [(-0.118, BT - 0.030), (-0.142, BT + 0.098), (-0.196, BT + 0.168),
                  (-0.278, BT + 0.182), (-0.268, BT + 0.098), (-0.236, BT - 0.030)],
              -t, t, "ChickenBody")
    # Two legs dangling under the box. Separate boxes, not one cut-out: a
    # two-legged outline is CONCAVE and an ngon cap triangulates it wrong.
    lx, ly, ll = CHICK_LEG
    for sx in (-CHICK_LEG_X, CHICK_LEG_X):
        box(p, sx - lx, sx + lx, 0.045 - ly, 0.045 + ly,
            BOX_Z0 - ll, BOX_Z0 + 0.010, "ChickenBeak")
    fp, pivot = flag_part(BOX_HW, BOX_Z0)
    return p, fp, pivot


def build_fancy():
    """The cast-aluminium one, after the owner's reference photo (2026-10-01):
    a panelled box CANTILEVERED forward off a square post, a scroll bracket
    curving down from its belly into the post, a name plaque standing on the
    lid, and a post on a wide base sleeve that runs up past the box to a capped
    top and a ball. The house with money.

    THE BOX HANGS IN FRONT OF THE POST, not through it. The first version ran
    the post straight through the box and every cue that makes this one read -
    the bracket, the shaft of post above the box, the sleeve - got swallowed.
    Cantilevering along +Y (toward the road, the door end) keeps the flag on -X
    as the ticket requires.

    THREE MATERIALS: one white casting colour carries box, post, sleeve and
    bracket; dark hardware for the knob; the flag."""
    p = Part("MailboxFancy")
    hw, bh, ph = FANCY_HW, FANCY_H, FANCY_POST_HS
    y0, yf = FANCY_Y0, FANCY_Y0 + FANCY_D
    yc = 0.5 * (y0 + yf)
    bz = FANCY_Z0

    # --- the post ---
    box(p, -ph, ph, -ph, ph, FANCY_SLEEVE[1] - 0.040, FANCY_POST_TOP, "FancyWhite")
    sh, sz = FANCY_SLEEVE
    box(p, -sh, sh, -sh, sh, 0.0, sz, "FancyWhite")                       # base sleeve
    box(p, -sh - 0.014, sh + 0.014, -sh - 0.014, sh + 0.014,
        sz - 0.012, sz + 0.020, "FancyWhite")                             # sleeve moulding
    box(p, -ph - 0.010, ph + 0.010, -ph - 0.010, ph + 0.010,
        FANCY_POST_TOP - 0.110, FANCY_POST_TOP - 0.088, "FancyWhite")     # trim band
    box(p, -ph - 0.016, ph + 0.016, -ph - 0.016, ph + 0.016,
        FANCY_POST_TOP - 0.006, FANCY_POST_TOP + 0.018, "FancyWhite")     # post cap
    ball(p, (0.0, 0.0, FANCY_POST_TOP + 0.015 + FANCY_BALL), FANCY_BALL,
         "FancyWhite", seg=8)

    # --- the box: square body, overhanging chamfered lid, base lip ---
    # Back end 11 mm INSIDE the post front face, so the joint has no seam.
    box(p, -hw, hw, y0, yf, bz, bz + bh, "FancyWhite")
    ow, lz = hw + FANCY_LID_OVER, bz + bh - 0.004
    lid = [(-ow, lz), (ow, lz), (ow, lz + 0.012), (hw - 0.012, lz + 0.026),
           (-hw + 0.012, lz + 0.026), (-ow, lz + 0.012)]
    extrude(p, lid, yf + 0.014, y0 - 0.010, "FancyWhite")
    box(p, -hw - 0.006, hw + 0.006, y0 + 0.002, yf + 0.006,
        bz - 0.004, bz + 0.016, "FancyWhite")                             # base lip
    # Raised panel on the +X flank only - the -X flank belongs to the flag.
    box(p, hw - 0.003, hw + 0.005, yc - 0.120, yc + 0.140,
        bz + 0.036, bz + bh - 0.030, "FancyWhite")
    box(p, -hw * 0.80, hw * 0.80, yf - 0.003, yf + 0.008,
        bz + 0.026, bz + bh - 0.022, "FancyWhite")                        # door panel
    octa(p, (-hw * 0.45, yf + 0.012, bz + bh * 0.66),
         (0.011, 0.008, 0.011), "MailHardware")                           # knob

    # --- name plaque standing on the lid, lengthwise, so it faces the road ---
    tz = lz + 0.022
    py = y0 + 0.165
    extrude_x(p, [(py - 0.075, tz), (py + 0.075, tz), (py + 0.075, tz + 0.030),
                  (py + 0.045, tz + 0.062), (py - 0.045, tz + 0.062),
                  (py - 0.075, tz + 0.030)],
              -0.005, 0.005, "FancyWhite")

    # --- scroll bracket: a quarter-ellipse band from the box belly into the
    # post. It BULGES TOWARD THE CORNER, as in the photo - the centre sits out
    # under the box, low - which is what makes it read as a cast scroll rather
    # than a straight knee brace. Both ends are buried (top in the box, foot
    # in the post) so nothing abuts.
    ry, rz, t = FANCY_BRACKET
    cy, cz = ph - 0.006 + ry + t, bz - rz
    outer, inner = [], []
    for i in range(5):
        a = math.radians(90.0 + 90.0 * i / 4)
        outer.append((cy + (ry + t) * math.cos(a), cz + (rz + t) * math.sin(a)))
        inner.append((cy + ry * math.cos(a), cz + rz * math.sin(a)))
    extrude_x(p, outer + inner[::-1], -0.010, 0.010, "FancyWhite")

    fp, pivot = flag_part(hw, bz)
    pivot = (pivot[0], yc + FLAG_DY, pivot[2])
    return p, fp, pivot


VARIANTS = [
    ("mailbox-classic", build_classic),
    ("mailbox-tube", build_tube),
    ("mailbox-leaning", build_leaning),
    ("mailbox-cluster", build_cluster),
    ("mailbox-pillar", build_pillar),
    ("mailbox-bucket", build_bucket),
    ("mailbox-planter", build_planter),
    ("mailbox-barn", build_barn),
    ("mailbox-limb", build_limb),
    ("mailbox-chicken", build_chicken),
    ("mailbox-fancy", build_fancy),
]


# ===========================================================================
# BAKE / VERIFY / EXPORT   (steel-drum.py's pipeline)
# ===========================================================================

def get_material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    col, rough = MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = col
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = 0.0
    m.diffuse_color = col
    m.roughness = rough
    m.use_backface_culling = True
    return m


def _orient_islands(bm):
    """Per connected island, flip if its signed volume came out negative.
    recalc_face_normals makes an island CONSISTENT; this makes it OUTWARD."""
    bm.faces.ensure_lookup_table()
    todo = {f.index for f in bm.faces}
    flipped = 0
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
        vol = 0.0
        for f in island:
            vs = [v.co for v in f.verts]
            for i in range(1, len(vs) - 1):
                vol += vs[0].dot(vs[i].cross(vs[i + 1]))
        if abs(vol) < 1e-9:
            continue
        if vol < 0.0:
            bmesh.ops.reverse_faces(bm, faces=island)
            flipped += 1
    return flipped


def bake(part, origin=(0.0, 0.0, 0.0)):
    me = bpy.data.meshes.new(part.name)
    me.from_pydata([(x - origin[0], y - origin[1], z - origin[2])
                    for (x, y, z) in part.v], [], part.f)
    me.update()
    used = []
    for m in part.m:
        if m not in used:
            used.append(m)
    idx = {n: i for i, n in enumerate(used)}
    for n in used:
        me.materials.append(get_material(n))
    for i, poly in enumerate(me.polygons):
        poly.material_index = idx[part.m[i]]
        poly.use_smooth = False

    ob = bpy.data.objects.new(part.name, me)
    bpy.context.collection.objects.link(ob)

    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    flipped = _orient_islands(bm)
    if flipped:
        print(f"  (re-oriented {flipped} inside-out island(s))")
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = False        # ART-STYLE rule 3: the facets ARE the look
    return ob


def evaluated_tris(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    m = ev.to_mesh()
    m.calc_loop_triangles()
    n = len(m.loop_triangles)
    ev.to_mesh_clear()
    return n


def _fresh_scene():
    bpy.ops.wm.read_homefile(use_empty=True)
    for d in (bpy.data.objects, bpy.data.meshes, bpy.data.materials):
        for x in list(d):
            d.remove(x)


def check_mesh(ob):
    """Non-manifold edges, loose verts, degenerate faces, and COPLANAR FACE
    PAIRS within 1.2 mm.

    The last one is why this exists. Two solids that share a face plane exactly
    - a trim board starting flush on the wall it decorates, a finial base on
    the post top - either weld into a non-manifold mess or z-fight under engine
    lighting. Blender's viewport shows neither. Both shipped in the second wave
    and both were found here, not by eye."""
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.normal_update()
    nonman = sum(1 for e in bm.edges if len(e.link_faces) != 2)
    loose = sum(1 for v in bm.verts if not v.link_faces)
    degen = sum(1 for f in bm.faces if f.calc_area() < 1e-9)
    fs = [(f.calc_center_median().copy(), f.normal.copy()) for f in bm.faces]
    zf = 0
    for i in range(len(fs)):
        for j in range(i + 1, len(fs)):
            if (fs[i][0] - fs[j][0]).length > 0.0012:
                continue
            if abs(fs[i][1].dot(fs[j][1])) >= 0.995:
                zf += 1
    bm.free()
    n = nonman + loose + degen + zf
    print(f"  mesh {ob.name:16s} non-manifold {nonman}  loose {loose}  "
          f"degenerate {degen}  coplanar pairs {zf}  "
          f"({'OK' if n == 0 else 'DEFECTS'})")
    return n


def check_normals(ob, samples=260, centre=None):
    """Cast rays inward from a sphere and assert the first face hit points back
    at the ray.  The ONLY check that catches inside-out geometry - the Blender
    viewport is two-sided, the game is not."""
    import mathutils
    bb = [mathutils.Vector(c) for c in ob.bound_box]
    c = centre or mathutils.Vector((
        sum(v.x for v in bb) / 8.0, sum(v.y for v in bb) / 8.0,
        sum(v.z for v in bb) / 8.0))
    radius = max((v - c).length for v in bb) * 2.5 + 1.0
    bad = tested = 0
    for i in range(samples):
        t = (i + 0.5) / samples
        phi = math.acos(1 - 2 * t)
        theta = math.pi * (1 + 5 ** 0.5) * i
        d = mathutils.Vector((math.sin(phi) * math.cos(theta),
                              math.sin(phi) * math.sin(theta),
                              math.cos(phi)))
        hit, loc, nrm, idx = ob.ray_cast(c + d * radius, -d)
        if not hit:
            continue
        tested += 1
        if nrm.dot(-d) >= 0.0:
            bad += 1
    print(f"  normals: {tested} rays hit, {bad} pointing away  "
          f"({'OK' if bad == 0 else 'INVERTED FACES'})")
    return bad


def _report(name, obs):
    total = 0
    for ob in obs:
        total += evaluated_tris(ob)
    mats = sorted({m.name for ob in obs for m in ob.data.materials})
    import mathutils
    pts = [ob.matrix_world @ v.co for ob in obs for v in ob.data.vertices]
    ext = [(min(p[i] for p in pts), max(p[i] for p in pts)) for i in range(3)]
    flag = "OK " if total <= TRI_BUDGET and abs(ext[2][0]) < 1e-6 else "!! "
    print(f"  {flag}{name:17s} {total:4d} tris (budget {TRI_BUDGET})  "
          f"W {ext[0][1]-ext[0][0]:.3f} x D {ext[1][1]-ext[1][0]:.3f} "
          f"x H {ext[2][1]:.3f} m  base z {ext[2][0]:+.4f}  "
          f"mats {len(mats)} {mats}")
    return total


def _assemble(builder):
    """Body + optional Flag child.  The Flag keeps its object transform (its
    origin is the pivot); the body gets its transforms applied."""
    part, fpart, pivot = builder()
    body = bake(part)
    obs = [body]
    if fpart is not None:
        flag = bake(fpart)
        flag.location = pivot
        flag.parent = body
        flag.matrix_parent_inverse = body.matrix_world.inverted()
        obs.append(flag)
    return body, obs


def build(offset=True):
    """All five side by side - the .blend source view."""
    _fresh_scene()
    print("=" * 96)
    x = 0.0
    for name, builder in VARIANTS:
        body, obs = _assemble(builder)
        if offset:
            body.location.x = x
            dims = body.dimensions.x
            x += max(dims, 0.6) * 0.5 + 0.55
        _report(name, obs)
    print(f"     materials {len(bpy.data.materials)}   images {len(bpy.data.images)}")
    print("=" * 96)


def _ui_override():
    win = bpy.context.window_manager.windows[0]
    scr = win.screen
    area = next(a for a in scr.areas if a.type == "VIEW_3D")
    region = next(r for r in area.regions if r.type == "WINDOW")
    return dict(window=win, screen=scr, area=area, region=region,
                scene=bpy.context.scene, view_layer=bpy.context.view_layer)


def export():
    """One .glb per variant, each built alone in a fresh scene, then the
    combined side-by-side view rebuilt and saved as the .blend source."""
    total_bad = 0
    for name, builder in VARIANTS:
        _fresh_scene()
        body, obs = _assemble(builder)
        ov = _ui_override()
        with bpy.context.temp_override(**ov):
            for o in bpy.data.objects:
                o.select_set(False)
            body.select_set(True)
            bpy.context.view_layer.objects.active = body
            # Body only.  Applying the Flag's transform would move its origin to
            # the world centre and rotating it would orbit the whole mailbox.
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        print("=" * 96)
        _report(name, obs)
        total_bad += check_normals(body)
        for ob in obs:
            total_bad += check_mesh(ob)
        with bpy.context.temp_override(**ov):
            bpy.ops.export_scene.gltf(
                filepath=os.path.join(OUT_DIR, name + ".glb"),
                export_format="GLB",
                export_draco_mesh_compression_enable=False,
                export_yup=True,
                export_apply=True,
                export_materials="EXPORT",
                export_texcoords=False,
                export_normals=True,
                export_cameras=False,
                export_lights=False,
                use_selection=False,
            )
        print(f"  wrote {OUT_DIR}/{name}.glb")
    build(offset=True)
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    print(f"  wrote {OUT_BLEND}")
    print(f"  TOTAL geometry defects: {total_bad}")
    # HARD GATE.  Backface culling turns a single inverted face into a visible
    # hole, and no screenshot shows it - the Blender viewport is two-sided.
    # This caught the dent/sleeve nesting bug above on a single ray out of 257.
    assert total_bad == 0, (
        f"{total_bad} geometry defect(s) - inverted faces, non-manifold edges, "
        "loose verts, degenerate or coplanar faces. The .glb files on disk are "
        "BAD; fix the geometry and re-export.")
    return total_bad


if __name__ == "__main__":
    build()
