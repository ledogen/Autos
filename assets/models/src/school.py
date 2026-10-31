"""
ASSET-73 — the COUNTRY SCHOOL.  Parametric generator.

Built for: Blender 5.2 LTS  |  PROMOTED 2026-10-31 (owner) from wip/ to assets/models/ + assets/models/src/.
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

A one-room schoolhouse: white clapboard, tall six-over-six windows with drawn burgundy curtains, a steep dark roof, a gabled
entry vestibule on the road side with red double doors and a SCHOOL plaque in
its gable, a bell cupola on the ridge above it, and a flagpole flying the flag.  The plaque says
SCHOOL, not a name, because the school is named per seed ("{last} School" / "{last} Academy").

    School     one mesh, 7 materials, ONE 512x512 atlas (the plaque + the flag)

AXES.  Blender +Y = glTF -Z = forward = the road face.  Length (9.6 m) runs along X = along the
road, so the marker's own yaw fits it to the pad with no yawOffset.  Base-seated (z = 0),
centred on the main block's wall footprint; the vestibule, steps and flagpole reach past it on
the road side.

CLAPBOARD.  Lapped boards, not V-grooves: each course's face leans back from 0 at its butt to
-LAP_D at its top, and the next course's butt steps back out with a downward-facing edge — the
shadow line clapboard has.  Inward only, so the openings' reveals, the corner boards and the roof
meet the wall flush (the trailer's rule); every opening height sits on a course line.  The
courses carry on up the gables as trapezoid strips.

ROOFS.  The vestibule's roof is a slab that runs back INTO the main roof; the two slabs
intersect, and the intersection is the valley.  Its back end is buried (behind the main wall,
under the main roof), so nothing has to be cut.

WINDING.  Every face goes through face(), which takes the direction the face must point.
check_facing() proves it by ray cast.  Hidden faces are not built: open shell BY DESIGN.
"""

import bpy
import bmesh
import math
import os
from mathutils import Vector

# ---------------------------------------------------------------------------
# PARAMETERS
# ---------------------------------------------------------------------------
OUT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))     # assets/models
OUT_BLEND = f"{OUT_DIR}/src/school.blend"
NAME = "school"
TRI_BUDGET = 1200

# --- main block ---
W, D = 9.6, 4.8             # wall footprint: along the road (X), depth (Y)
FLOOR = 0.54                # foundation top = floor (three 0.18 risers)
FND_OUT = 0.03
COURSE_NOM, WALL_H = 0.27, 3.00
PITCH = 0.75                # 9:12
EAVE_OUT, RAKE = 0.35, 0.30
ROOF_T = 0.10
LAP_D = 0.040               # clapboard: how far each course leans back over its height (at
                            # 0.025 the 6 degree lean did not read under engine light)
CORNER_W, CORNER_OUT = 0.12, 0.02

# --- vestibule (entry porch block, gabled to the road) ---
VW, VD = 2.40, 1.20         # width (X), depth off the main wall (Y)
V_WALL = 2.75               # floor -> its eave, snapped onto a course line
V_EAVE_OUT, V_RAKE = 0.25, 0.22
V_BURY = 1.45               # y the vestibule roof runs back to: inside the main roof

# --- openings ---
WIN_W = 0.90
WIN_SILL, WIN_HEAD = 1.30, 3.04   # snapped onto course lines
WIN_DEPTH = 0.10
FRAME_W, FRAME_OUT = 0.09, 0.03
MUNTIN_HW, RAIL_HW = 0.018, 0.030
FRONT_WIN_X = (-3.85, -2.45, 2.45, 3.85)
BACK_WIN_X = (-2.4, 2.4)
DOOR_HW, DOOR_HEAD = 0.70, 2.72   # double door, head snapped.  No transom: a dark transom pane
                                  # read as a black void (owner, 2026-10-30)
DOOR_DEPTH = 0.10
LEAF_GAP = 0.02
PANEL = (0.10, 0.14, 0.02)  # raised panel per leaf: inset from the leaf edge, gap to the
                            # door head above / to the leaf's mid height below, proud

# --- steps ---
STEP_HW, STEP_RUN = 0.95, 0.30

# --- gable vents (main block ends) ---
VENT_W, VENT_H, VENT_Z, VENT_T, VENT_N = 0.55, 0.36, 0.80, 0.03, 2

# --- bell cupola ---
CU_HW = 0.55                # base half width
CU_BASE = 0.42              # base top above the ridge's top surface
CU_POST_R, CU_POST_H = 0.085, 0.80
CU_PLATE_H, CU_PLATE_IN = 0.14, 0.15
CU_ROOF_OVER, CU_ROOF_H = 0.14, 0.62
FINIAL_R, FINIAL_H = 0.035, 0.38
BELL_R0, BELL_R1, BELL_H = 0.20, 0.11, 0.36

# --- flagpole + flag ---
POLE_C, POLE_R, POLE_H = (4.15, 3.55), 0.055, 6.30   # (x, y), circumradius, height
FLAG_L, FLAG_H = 1.40, 0.74                         # fly, hoist (1.9 : 1)
FLAG_TOP = 6.18
FLAG_FOLD = (0.0, 0.10, -0.04, 0.08)                # y offset of each fold line, hoist -> fly

# --- plaque ---
PLAQ_HW, PLAQ_HH, PLAQ_T = 0.50, 0.125, 0.04        # MUST stay 4:1 — atlas region is 512x128
PLAQ_Z = 0.30               # centre above the vestibule eave
PLAQ_FONT = "/System/Library/Fonts/Supplemental/Rockwell.ttc"
TEX = 512
ATLAS_PLAQ_V = (0.75, 1.00)
ATLAS_FLAG_V = (0.00, FLAG_H / FLAG_L)              # 0 .. 0.529, the flag at its own aspect

MATS = {
    #  name             base colour (linear)        rough
    "SchoolWhite":  ((0.760, 0.750, 0.700, 1.0), 0.85),   # clapboard, trim, cupola, pole
    "SchoolRoof":   ((0.035, 0.048, 0.045, 1.0), 0.80),   # slate green-grey
    "SchoolRed":    ((0.330, 0.040, 0.025, 1.0), 0.65),   # doors, cupola roof
    "SchoolStone":  ((0.220, 0.210, 0.190, 1.0), 0.95),   # foundation, steps, pole base
    "SchoolGlass":  ((0.012, 0.015, 0.020, 1.0), 0.10),   # door gap, vent louvres, the bell
    "SchoolCurtain":((0.130, 0.008, 0.025, 1.0), 0.90),   # burgundy, drawn: bare dark glass read
                                                          # as a black void (owner, 2026-10-30)
    "SchoolSign":   (None, 0.80),                          # the atlas
}
INK = {
    "white": (0.780, 0.780, 0.750),
    "ink":   (0.018, 0.018, 0.022),
    "red":   (0.400, 0.020, 0.030),
    "blue":  (0.018, 0.030, 0.150),
}

X_, Y_, Z_ = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
YF = D / 2
EDGE_UV = (0.5, 0.995)      # the plaque's black border: plaque edges and back

# --- derived ---
N_COURSE = max(1, round(WALL_H / COURSE_NOM))
COURSE = WALL_H / N_COURSE
EAVE = FLOOR + WALL_H
RISE = D / 2 * PITCH
RIDGE = EAVE + RISE
COURSE_LINES = [FLOOR + COURSE * k for k in range(200) if FLOOR + COURSE * k < 20]


def snap(v):
    return min(COURSE_LINES, key=lambda c: abs(c - v))


V_EAVE = snap(FLOOR + V_WALL)
V_RISE = VW / 2 * PITCH
V_RIDGE = V_EAVE + V_RISE
SILL, HEAD = snap(WIN_SILL), snap(WIN_HEAD)
DHEAD = snap(DOOR_HEAD)
YV = YF + VD                # vestibule front wall plane


def under_main(y):
    """Main roof underside at y; pinned to EAVE on the wall line."""
    return EAVE + RISE * (1.0 - abs(y) / (D / 2))


def under_vest(x):
    return V_EAVE + V_RISE * (1.0 - abs(x) / (VW / 2))


# ---------------------------------------------------------------------------
# Geometry accumulator
# ---------------------------------------------------------------------------
class Part:
    def __init__(self, name):
        self.name, self.v, self.f, self.m, self.uv = name, [], [], [], []

    def face(self, pts, mat, out, uv=None):
        """One polygon, wound so its normal points along `out`.  `uv`: per-vertex list, a single
        (u, v) for every corner, or None."""
        pts = [Vector(p) for p in pts]
        if uv is None:
            uv = EDGE_UV
        uvs = list(uv) if isinstance(uv[0], (tuple, list)) else [uv] * len(pts)
        n = Vector()
        for i, a in enumerate(pts):          # Newell normal: robust for any planar polygon
            b = pts[(i + 1) % len(pts)]
            n += Vector(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x),
                         (a.x - b.x) * (a.y + b.y)))
        if n.dot(Vector(out)) < 0:
            pts.reverse()
            uvs.reverse()
        o = len(self.v)
        self.v.extend(tuple(p) for p in pts)
        self.f.append(list(range(o, o + len(pts))))
        self.m.append(mat)
        self.uv.append(uvs)


def solid(p, bot, top, mat, skip=()):
    """Convex prism between two matching rings; each face points away from the centroid."""
    bot, top = [Vector(v) for v in bot], [Vector(v) for v in top]
    c = sum(bot + top, Vector()) / (2 * len(bot))
    n = len(bot)
    for i in range(n):
        if i in skip:
            continue
        q = [bot[i], bot[(i + 1) % n], top[(i + 1) % n], top[i]]
        p.face(q, mat, sum(q, Vector()) / 4 - c)
    if "bot" not in skip:
        p.face(bot, mat, sum(bot, Vector()) / n - c)
    if "top" not in skip:
        p.face(top, mat, sum(top, Vector()) / n - c)


def box(p, lo, hi, mat, skip=()):
    """Axis box.  Side order: 0 -Y, 1 +X, 2 +Y (front), 3 -X."""
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    ring = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    solid(p, [(x, y, z0) for x, y in ring], [(x, y, z1) for x, y in ring], mat, skip)


def tube(p, a, b, r, mat, sides=4, caps=(False, False), r1=None):
    """Straight bar of n-gon section from a to b; r (and r1 at b, for a taper) are circumradii."""
    a, b = Vector(a), Vector(b)
    ax = (b - a).normalized()
    ref = Z_ if abs(ax.z) < 0.9 else X_
    u = ax.cross(ref).normalized()
    v = ax.cross(u)
    ph = math.pi / sides
    ring = lambda c, rr: [c + (u * math.cos(ph + 2 * math.pi * k / sides) +
                               v * math.sin(ph + 2 * math.pi * k / sides)) * rr for k in range(sides)]
    r0, rb = ring(a, r), ring(b, r if r1 is None else r1)
    for k in range(sides):
        k2 = (k + 1) % sides
        q = [r0[k], r0[k2], rb[k2], rb[k]]
        c = sum(q, Vector()) / 4 - a
        p.face(q, mat, c - ax * c.dot(ax))
    if caps[0]:
        p.face(r0, mat, -ax)
    if caps[1]:
        p.face(rb, mat, ax)


# ---------------------------------------------------------------------------
# Walls: a frame is (origin on the ground at the wall's centre, u axis A, normal N, length);
# A = Z x N, so a quad wound (u0,v0) (u1,v0) (u1,v1) (u0,v1) faces along N.
# ---------------------------------------------------------------------------
FRAMES = {
    'front': (Vector((0, YF, 0)), -X_, Y_, W),
    'back':  (Vector((0, -YF, 0)), X_, -Y_, W),
    '+x':    (Vector((W / 2, 0, 0)), Y_, X_, D),
    '-x':    (Vector((-W / 2, 0, 0)), -Y_, -X_, D),
    'vfront': (Vector((0, YV, 0)), -X_, Y_, VW),
    # the vestibule's sides run LAP_D back into the main wall, under its receding courses
    'v+x':   (Vector((VW / 2, YF + (VD - LAP_D) / 2, 0)), Y_, X_, VD + LAP_D),
    'v-x':   (Vector((-VW / 2, YF + (VD - LAP_D) / 2, 0)), -Y_, -X_, VD + LAP_D),
}


def wp(fr, u, v, n=0.0):
    O, A, N, _ = FRAMES[fr]
    return O + A * u + Z_ * v + N * n


def clapboard(p, fr, holes, top, gable=None):
    """Lapped siding from FLOOR to `top` with holes (u0, u1, v0, v1) on course lines.
    gable = (eave, ridge, half_width at the eave): above the eave the strips are trapezoids."""
    O, A, N, L = FRAMES[fr]
    P = lambda u, z, n: O + A * u + Z_ * z + N * n
    m = "SchoolWhite"
    end = gable[1] if gable else top
    zs = [c for c in COURSE_LINES if c < end - 1e-6] + [end]
    us = sorted({-L / 2, L / 2} | {h[i] for h in holes for i in (0, 1)})
    half = (lambda z: gable[2] * (gable[1] - z) / (gable[1] - gable[0])) if gable else None

    def cells(za, zb):
        """Solid u-cells of the course za..zb (None above the eave: the gable trapezoid)."""
        if gable and za >= gable[0] - 1e-9:
            return None
        zm = (za + zb) / 2
        return [(ua, ub) for ua, ub in zip(us, us[1:])
                if not any(h[0] < (ua + ub) / 2 < h[1] and h[2] < zm < h[3] for h in holes)]

    def runs(cs):
        out = []
        for ua, ub in cs:
            if out and abs(out[-1][1] - ua) < 1e-9:
                out[-1] = (out[-1][0], ub)
            else:
                out.append((ua, ub))
        return out

    for k, (za, zb) in enumerate(zip(zs, zs[1:])):
        lean = -LAP_D * (zb - za) / COURSE           # a partial last course leans back less
        cs = cells(za, zb)
        if cs is None:
            ha, hb = half(za), half(zb)
            if hb < 1e-6:
                p.face([P(-ha, za, 0), P(ha, za, 0), P(0, zb, lean)], m, N)
            else:
                p.face([P(-ha, za, 0), P(ha, za, 0), P(hb, zb, lean), P(-hb, zb, lean)], m, N)
        else:
            for u0, u1 in runs(cs):
                p.face([P(u0, za, 0), P(u1, za, 0), P(u1, zb, lean), P(u0, zb, lean)], m, N)
        if k + 2 >= len(zs):                          # the top course: no butt above it
            continue
        # the butt edge of the course above, where both courses are solid
        above = cells(zb, zs[k + 2])
        if cs is None or above is None:
            hb = half(zb) if (cs is None or above is None) and gable else None
            if above is None and cs is not None:      # the eave line of a gable wall
                span = [r for r in runs(cs)]
            else:
                span = [(-hb, hb)]
        else:
            span = runs([c for c in cs if c in above])
        for u0, u1 in span:
            p.face([P(u0, zb, lean), P(u1, zb, lean), P(u1, zb, 0), P(u0, zb, 0)], m, -Z_)


def corner_boards(p, x, y, sx, sy, z1):
    """All four sides: the two that face back along the walls close the slot the receding lap
    would open beside the board's proud face."""
    xs = sorted((x - sx * CORNER_W, x + sx * CORNER_OUT))
    ys = sorted((y - sy * CORNER_W, y + sy * CORNER_OUT))
    box(p, (xs[0], ys[0], FLOOR), (xs[1], ys[1], z1), "SchoolWhite", skip={"bot"})


def foundation(p):
    hx, hy, o, vx = W / 2, D / 2, FND_OUT, VW / 2
    # main block ring + the vestibule's three sides, one outline
    outer = [(-hx - o, -hy - o), (hx + o, -hy - o), (hx + o, hy + o), (vx + o, hy + o),
             (vx + o, YV + o), (-vx - o, YV + o), (-vx - o, hy + o), (-hx - o, hy + o)]
    for i in range(len(outer)):
        a, b = outer[i], outer[(i + 1) % len(outer)]
        out = Vector((b[1] - a[1], -(b[0] - a[0]), 0))    # CCW outline: the right normal
        p.face([(*a, 0), (*b, 0), (*b, FLOOR), (*a, FLOOR)], "SchoolStone", out)
    # the ledge between the outline and the wall planes, as strips
    for (x0, y0, x1, y1) in ((-hx - o, -hy - o, hx + o, -hy),             # back
                             (hx, -hy, hx + o, hy + o), (-hx - o, -hy, -hx, hy + o),
                             (vx, hy, hx, hy + o), (-hx, hy, -vx, hy + o),
                             (vx, hy + o, vx + o, YV + o), (-vx - o, hy + o, -vx, YV + o),
                             (-vx, YV, vx, YV + o)):
        p.face([(x0, y0, FLOOR), (x1, y0, FLOOR), (x1, y1, FLOOR), (x0, y1, FLOOR)], "SchoolStone", Z_)


# ---------------------------------------------------------------------------
# Openings
# ---------------------------------------------------------------------------
def frame(p, fr, hole, skip_bottom=False):
    """Proud picture frame: a mitred front ring FRAME_OUT off the wall + its outer edge wall."""
    _, A, N, _ = FRAMES[fr]
    iu0, iu1, iv0, iv1 = hole
    ou0, ou1 = iu0 - FRAME_W, iu1 + FRAME_W
    ov0, ov1 = (iv0 if skip_bottom else iv0 - FRAME_W), iv1 + FRAME_W
    P = lambda u, v, n: wp(fr, u, v, n)
    F, m, B = FRAME_OUT, "SchoolWhite", -LAP_D   # B: the outer edge starts in the lap's recess,
    if not skip_bottom:                          # or a slot opens under the ring at every course
        p.face([P(ou0, ov0, F), P(ou1, ov0, F), P(iu1, iv0, F), P(iu0, iv0, F)], m, N)
        p.face([P(ou0, ov0, B), P(ou1, ov0, B), P(ou1, ov0, F), P(ou0, ov0, F)], m, -Z_)
    p.face([P(iu0, iv1, F), P(iu1, iv1, F), P(ou1, ov1, F), P(ou0, ov1, F)], m, N)
    p.face([P(ou0, ov0, F), P(iu0, iv0, F), P(iu0, iv1, F), P(ou0, ov1, F)], m, N)
    p.face([P(iu1, iv0, F), P(ou1, ov0, F), P(ou1, ov1, F), P(iu1, iv1, F)], m, N)
    p.face([P(ou1, ov1, B), P(ou0, ov1, B), P(ou0, ov1, F), P(ou1, ov1, F)], m, Z_)
    p.face([P(ou0, ov0, B), P(ou0, ov0, F), P(ou0, ov1, F), P(ou0, ov1, B)], m, -A)
    p.face([P(ou1, ov0, B), P(ou1, ov1, B), P(ou1, ov1, F), P(ou1, ov0, F)], m, A)


def recess(p, fr, hole, depth, start, mat, floor_mat=None, floor_to=None):
    """Reveal from `start` back to start - depth; returns the back plane's offset."""
    _, A, N, _ = FRAMES[fr]
    u0, u1, v0, v1 = hole
    b = start - depth
    P = lambda u, v, n: wp(fr, u, v, n)
    p.face([P(u0, v0, b), P(u0, v0, start), P(u0, v1, start), P(u0, v1, b)], mat, A)
    p.face([P(u1, v0, b), P(u1, v1, b), P(u1, v1, start), P(u1, v0, start)], mat, -A)
    p.face([P(u0, v1, b), P(u1, v1, b), P(u1, v1, start), P(u0, v1, start)], mat, -Z_)
    f = start if floor_to is None else floor_to
    p.face([P(u0, v0, b), P(u1, v0, b), P(u1, v0, f), P(u0, v0, f)], floor_mat or mat, Z_)
    return b


def window(p, fr, uc):
    """Six-over-six sash: drawn curtains behind the glass, a meeting rail, and muntins.  The vertical muntins stand
    a little prouder than the horizontal bars so the crossings cannot z-fight."""
    hole = (uc - WIN_W / 2, uc + WIN_W / 2, SILL, HEAD)
    _, A, N, _ = FRAMES[fr]
    b = recess(p, fr, hole, WIN_DEPTH + FRAME_OUT, FRAME_OUT, "SchoolWhite")
    u0, u1, v0, v1 = hole
    P = lambda u, v, n: wp(fr, u, v, n)
    p.face([P(u0, v0, b), P(u1, v0, b), P(u1, v1, b), P(u0, v1, b)], "SchoolCurtain", N)
    frame(p, fr, hole)
    vm = (v0 + v1) / 2
    for v, hw in ((vm, RAIL_HW), ((v0 + vm) / 2, MUNTIN_HW), ((vm + v1) / 2, MUNTIN_HW)):
        p.face([P(u0, v - hw, b + 0.012), P(u1, v - hw, b + 0.012), P(u1, v + hw, b + 0.012),
                P(u0, v + hw, b + 0.012)], "SchoolWhite", N)
    for k in (1, 2):
        u = u0 + (u1 - u0) * k / 3
        p.face([P(u - MUNTIN_HW, v0, b + 0.018), P(u + MUNTIN_HW, v0, b + 0.018),
                P(u + MUNTIN_HW, v1, b + 0.018), P(u - MUNTIN_HW, v1, b + 0.018)], "SchoolWhite", N)


def double_door(p):
    fr = 'vfront'
    hole = (-DOOR_HW, DOOR_HW, FLOOR, DHEAD)
    _, A, N, _ = FRAMES[fr]
    b = recess(p, fr, hole, DOOR_DEPTH + FRAME_OUT, FRAME_OUT, "SchoolWhite", "SchoolStone", 0.0)
    P = lambda u, v, n: wp(fr, u, v, n)
    # back plane: two red leaves with a dark gap between, full height
    g = LEAF_GAP / 2
    for (ua, ub, mat) in ((-DOOR_HW, -g, "SchoolRed"), (-g, g, "SchoolGlass"), (g, DOOR_HW, "SchoolRed")):
        p.face([P(ua, FLOOR, b), P(ub, FLOOR, b), P(ub, DHEAD, b), P(ua, DHEAD, b)], mat, N)
    # one raised panel on each leaf, upper half
    ins, gap, t = PANEL
    for s in (-1, 1):
        ua, ub = sorted((s * (g + ins), s * (DOOR_HW - ins)))
        va, vb = (FLOOR + DHEAD) / 2 + gap / 2, DHEAD - gap
        lo, hi = P(ua, va, b), P(ub, vb, b + t)
        box(p, tuple(min(lo[i], hi[i]) for i in range(3)), tuple(max(lo[i], hi[i]) for i in range(3)),
            "SchoolRed", skip={0})
    frame(p, fr, hole, skip_bottom=True)


def vent(p, fr):
    """Louvred gable vent: a proud box whose face is V-grooves."""
    _, A, N, _ = FRAMES[fr]
    z0, z1 = EAVE + VENT_Z - VENT_H / 2, EAVE + VENT_Z + VENT_H / 2
    u0, u1, t, B = -VENT_W / 2, VENT_W / 2, VENT_T, -LAP_D   # edges start in the lap's recess
    P = lambda u, v, n: wp(fr, u, v, n)
    p.face([P(u0, z0, B), P(u1, z0, B), P(u1, z0, t), P(u0, z0, t)], "SchoolWhite", -Z_)
    p.face([P(u0, z1, B), P(u1, z1, B), P(u1, z1, t), P(u0, z1, t)], "SchoolWhite", Z_)
    p.face([P(u0, z0, B), P(u0, z1, B), P(u0, z1, t), P(u0, z0, t)], "SchoolWhite", -A)
    p.face([P(u1, z0, B), P(u1, z1, B), P(u1, z1, t), P(u1, z0, t)], "SchoolWhite", A)
    zz = [z0 + (z1 - z0) * k / VENT_N for k in range(VENT_N + 1)]
    for za, zb in zip(zz, zz[1:]):
        zm = (za + zb) / 2
        for zl, zh, dl, dh in ((za, zm, t, t - 0.02), (zm, zb, t - 0.02, t)):
            p.face([P(u0, zl, dl), P(u1, zl, dl), P(u1, zh, dh), P(u0, zh, dh)], "SchoolGlass", N)


def walls(p):
    win = lambda uc: (uc - WIN_W / 2, uc + WIN_W / 2, SILL, HEAD)
    front = [win(-x) for x in FRONT_WIN_X]               # front: u = -x
    back = [win(x) for x in BACK_WIN_X]
    clapboard(p, 'front', front, EAVE)
    clapboard(p, 'back', back, EAVE)
    clapboard(p, '+x', [], EAVE, (EAVE, RIDGE, D / 2))
    clapboard(p, '-x', [], EAVE, (EAVE, RIDGE, D / 2))
    clapboard(p, 'vfront', [(-DOOR_HW, DOOR_HW, FLOOR, DHEAD)], V_EAVE, (V_EAVE, V_RIDGE, VW / 2))
    clapboard(p, 'v+x', [], V_EAVE)
    clapboard(p, 'v-x', [], V_EAVE)
    for u in [-x for x in FRONT_WIN_X]:
        window(p, 'front', u)
    for u in BACK_WIN_X:
        window(p, 'back', u)
    double_door(p)
    vent(p, '+x')
    vent(p, '-x')
    for sx in (-1, 1):
        for sy in (-1, 1):
            corner_boards(p, sx * W / 2, sy * YF, sx, sy, EAVE - 0.015)
        corner_boards(p, sx * VW / 2, YV, sx, 1, V_EAVE - 0.015)


# ---------------------------------------------------------------------------
# Roofs
# ---------------------------------------------------------------------------
def gable_slab(p, prof, a0, a1, along, ends):
    """A roof slab: `prof` = underside (c, z) points across the slab; it runs a0..a1 along
    `along` ('x' or 'y').  Top = underside + ROOF_T.  `ends` = which end caps to build (a0, a1)."""
    P = (lambda c, a, z: (a, c, z)) if along == 'x' else (lambda c, a, z: (c, a, z))
    C = Y_ if along == 'x' else X_
    AX = X_ if along == 'x' else Y_
    top = [(c, z + ROOF_T) for c, z in prof]
    for i in range(len(prof) - 1):
        (ca, za), (cb, zb) = top[i], top[i + 1]
        up = C * (-(zb - za)) + Z_ * (cb - ca)
        p.face([P(ca, a0, za), P(ca, a1, za), P(cb, a1, zb), P(cb, a0, zb)], "SchoolRoof", up)
        (ca, za), (cb, zb) = prof[i], prof[i + 1]
        p.face([P(ca, a0, za), P(ca, a1, za), P(cb, a1, zb), P(cb, a0, zb)], "SchoolWhite", -up)
    for idx, s in ((0, -1), (len(prof) - 1, 1)):             # eave fascias
        c, z = prof[idx]
        p.face([P(c, a0, z), P(c, a1, z), P(c, a1, z + ROOF_T), P(c, a0, z + ROOF_T)], "SchoolWhite", C * s)
    for a, s, use in ((a0, -1, ends[0]), (a1, 1, ends[1])):  # rake ends
        if not use:
            continue
        for i in range(len(prof) - 1):
            (ca, za), (cb, zb) = prof[i], prof[i + 1]
            p.face([P(ca, a, za), P(cb, a, zb), P(cb, a, zb + ROOF_T), P(ca, a, za + ROOF_T)],
                   "SchoolWhite", AX * s)


def roofs(p):
    hy = D / 2 + EAVE_OUT
    gable_slab(p, [(-hy, under_main(-hy)), (0.0, RIDGE), (hy, under_main(hy))],
               -W / 2 - RAKE, W / 2 + RAKE, 'x', (True, True))
    hx = VW / 2 + V_EAVE_OUT
    gable_slab(p, [(-hx, under_vest(-hx)), (0.0, V_RIDGE), (hx, under_vest(hx))],
               V_BURY, YV + V_RAKE, 'y', (False, True))


# ---------------------------------------------------------------------------
# Steps, cupola, flagpole, plaque
# ---------------------------------------------------------------------------
def steps(p):
    n = 3
    rise = FLOOR / n
    y0 = YV + FND_OUT
    for k in range(1, n):                     # k = 1 next to the door (highest)
        ya, yb = y0 + STEP_RUN * (k - 1), y0 + STEP_RUN * k
        box(p, (-STEP_HW, ya, 0), (STEP_HW, yb, FLOOR - rise * k), "SchoolStone", skip={"bot", 0})


def cupola(p):
    h = CU_HW
    zr = RIDGE + ROOF_T
    zb = under_main(h) + ROOF_T - 0.05          # below the roof surface at its sides
    z0 = zr + CU_BASE
    box(p, (-h, -h, zb), (h, h, z0), "SchoolWhite", skip={"bot"})
    z1 = z0 + CU_POST_H
    pi = h - 0.07
    for sx in (-1, 1):
        for sy in (-1, 1):
            tube(p, (sx * pi, sy * pi, z0), (sx * pi, sy * pi, z1), CU_POST_R, "SchoolWhite")
    # plate: a square ring band the posts carry
    o, i, z2 = h + 0.03, h - CU_PLATE_IN, z1 + CU_PLATE_H
    ring = lambda r: [(-r, -r), (r, -r), (r, r), (-r, r)]
    ro, ri = ring(o), ring(i)
    for k in range(4):
        a, b = ro[k], ro[(k + 1) % 4]
        c, d = ri[(k + 1) % 4], ri[k]
        out = Vector((b[1] - a[1], -(b[0] - a[0]), 0))
        p.face([(*a, z1), (*b, z1), (*b, z2), (*a, z2)], "SchoolWhite", out)
        p.face([(*d, z1), (*c, z1), (*c, z2), (*d, z2)], "SchoolWhite", -out)
        p.face([(*a, z1), (*b, z1), (*c, z1), (*d, z1)], "SchoolWhite", -Z_)
    # pyramid roof with its underside
    r = h + CU_ROOF_OVER
    base = [(x, y, z2) for x, y in ring(r)]
    apex = Vector((0, 0, z2 + CU_ROOF_H))
    for k in range(4):
        a, b = Vector(base[k]), Vector(base[(k + 1) % 4])
        p.face([a, b, apex], "SchoolRed", (a + b) / 2 - Vector((0, 0, z2)) + Z_ * 0.5)
    p.face(base, "SchoolWhite", -Z_)
    tube(p, apex - Z_ * 0.08, apex + Z_ * FINIAL_H, FINIAL_R, "SchoolWhite", caps=(False, True), r1=0.008)
    # the bell, hung from a yoke beam whose ends run into the plate
    yz = z1 + CU_PLATE_H / 2
    zt = yz - 0.02
    tube(p, (0, 0, zt - BELL_H), (0, 0, zt), BELL_R0, "SchoolGlass", sides=6, caps=(True, True), r1=BELL_R1)
    tube(p, (0, -i - 0.06, yz), (0, i + 0.06, yz), 0.035, "SchoolGlass")


def flag_uv(x, z):
    """Flag metres -> atlas.  The hoist is at the pole (+X), the fly runs toward -X; seen from the
    road (+Y) the reader's right is -X, so the canton sits top-left as it must."""
    px = POLE_C[0] - POLE_R * 0.9
    v0, v1 = ATLAS_FLAG_V
    return ((px - x) / FLAG_L, v0 + (z - (FLAG_TOP - FLAG_H)) / FLAG_H * (v1 - v0))


def flagpole(p):
    cx, cy = POLE_C
    box(p, (cx - 0.25, cy - 0.25, 0), (cx + 0.25, cy + 0.25, 0.12), "SchoolStone", skip={"bot"})
    tube(p, (cx, cy, 0.12), (cx, cy, POLE_H), POLE_R, "SchoolWhite", sides=6, caps=(False, True))
    # ball finial: a six-sided double cone
    c, r = Vector((cx, cy, POLE_H + 0.07)), 0.075
    ring = [c + Vector((math.cos(k * math.pi / 3) * r, math.sin(k * math.pi / 3) * r, 0)) for k in range(6)]
    for k in range(6):
        a, b = ring[k], ring[(k + 1) % 6]
        mid = (a + b) / 2 - c
        p.face([a, b, c + Z_ * r], "SchoolWhite", mid + Z_ * 0.5 * r)
        p.face([b, a, c - Z_ * r], "SchoolWhite", mid - Z_ * 0.5 * r)
    # the flag: a strip of folds, front and back (opposite faces, so they never z-fight)
    px = cx - POLE_R * 0.9
    z0, z1 = FLAG_TOP - FLAG_H, FLAG_TOP
    n = len(FLAG_FOLD) - 1
    xs = [px - FLAG_L * k / n for k in range(n + 1)]
    for k in range(n):
        xa, xb = xs[k], xs[k + 1]
        ya, yb = cy + FLAG_FOLD[k], cy + FLAG_FOLD[k + 1]
        q = [(xa, ya, z0), (xb, yb, z0), (xb, yb, z1), (xa, ya, z1)]
        uv = [flag_uv(x, z) for x, _, z in q]
        nrm = Vector((-(yb - ya), (xb - xa), 0))
        nrm = nrm if nrm.y > 0 else -nrm
        p.face(q, "SchoolSign", nrm, uv)
        p.face(q, "SchoolSign", -nrm, uv)


def plaque_uv(x, z):
    """Plaque metres (x along world X, z from its centre) -> atlas; it faces +Y, so the reader's
    right is -X."""
    v0, v1 = ATLAS_PLAQ_V
    return (0.5 - x / (2 * PLAQ_HW), (v0 + v1) / 2 + z / (2 * PLAQ_HH) * (v1 - v0))


def plaque(p):
    zc = V_EAVE + PLAQ_Z
    yb, yf = YV - LAP_D, YV + PLAQ_T        # edges start in the lap's recess
    hw, hh = PLAQ_HW, PLAQ_HH
    cs = [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)]
    p.face([(x, yf, zc + z) for x, z in cs], "SchoolSign", Y_, [plaque_uv(x, z) for x, z in cs])
    for i in range(4):
        (ax, az), (bx, bz) = cs[i], cs[(i + 1) % 4]
        out = Vector((bz - az, 0, -(bx - ax)))
        p.face([(ax, yb, zc + az), (bx, yb, zc + bz), (bx, yf, zc + bz), (ax, yf, zc + az)],
               "SchoolSign", out)


def build_part():
    p = Part("School")
    foundation(p)
    walls(p)
    roofs(p)
    steps(p)
    cupola(p)
    flagpole(p)
    plaque(p)
    return p


# ---------------------------------------------------------------------------
# Atlas bake: an orthographic render of flat emitters over the unit square
# ---------------------------------------------------------------------------
def _emission(name, col):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    e = nt.nodes.new('ShaderNodeEmission')
    e.inputs[0].default_value = (*col, 1.0)
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(e.outputs[0], o.inputs[0])
    return m


def bake_atlas():
    engines = {i.identifier for i in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items}
    sc = bpy.data.scenes.new("AtlasBake")
    sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engines else 'BLENDER_EEVEE'
    sc.render.resolution_x = sc.render.resolution_y = TEX
    sc.render.resolution_percentage = 100
    sc.render.dither_intensity = 0.0          # flat artwork: dither only bloats the PNG
    for k in dir(sc.render):                  # no date/render-time stamps: re-runs stay identical
        if k.startswith("use_stamp_"):
            setattr(sc.render, k, False)
    sc.view_settings.view_transform = 'Standard'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGB'
    cd = bpy.data.cameras.new("AtlasCam")
    cd.type, cd.ortho_scale = 'ORTHO', 1.0
    cam = bpy.data.objects.new("AtlasCam", cd)
    cam.location = (0.5, 0.5, 5.0)
    sc.collection.objects.link(cam)
    sc.camera = cam
    junk, mats, layer = [], [], [0]

    def z():
        layer[0] += 1
        return layer[0] * 0.001

    def poly(pts, col):
        me = bpy.data.meshes.new("a")
        zz = z()
        me.from_pydata([(u, v, zz) for u, v in pts], [], [list(range(len(pts)))])
        o = bpy.data.objects.new("a", me)
        m = _emission("a", INK[col])
        mats.append(m)
        me.materials.append(m)
        sc.collection.objects.link(o)
        junk.append(o)

    def rect(u0, v0, u1, v1, col):
        poly([(u0, v0), (u1, v0), (u1, v1), (u0, v1)], col)

    def text(body, font, uc, vc, w, h, col):
        cu = bpy.data.curves.new("t", type='FONT')
        cu.body = body
        try:
            cu.font = bpy.data.fonts.load(font, check_existing=True)
        except (RuntimeError, OSError):
            print("WARN: font not found, falling back to Bfont:", font)
        o = bpy.data.objects.new("t", cu)
        m = _emission("t", INK[col])
        mats.append(m)
        cu.materials.append(m)
        sc.collection.objects.link(o)
        junk.append(o)
        me = o.to_mesh()
        xs = [v.co.x for v in me.vertices]
        ys = [v.co.y for v in me.vertices]
        o.to_mesh_clear()
        k = min(w / (max(xs) - min(xs)), h / (max(ys) - min(ys)))
        o.scale = (k, k, 1)
        o.location = (uc - k * (max(xs) + min(xs)) / 2, vc - k * (max(ys) + min(ys)) / 2, z())

    rect(0, 0, 1, 1, "white")
    # plaque: black border, white field, SCHOOL
    p0, p1 = ATLAS_PLAQ_V
    rect(0, p0, 1, p1, "ink")
    rect(0.035, p0 + 0.035, 0.965, p1 - 0.035, "white")
    text("SCHOOL", PLAQ_FONT, 0.5, (p0 + p1) / 2, 0.80, 0.15, "ink")
    # the flag: 13 stripes, the canton, 50 stars (9 rows of 6 and 5)
    f0, f1 = ATLAS_FLAG_V
    H = f1 - f0
    for k in range(13):
        rect(0, f1 - H * (k + 1) / 13, 1, f1 - H * k / 13, "red" if k % 2 == 0 else "white")
    cw, ch = 0.76 * H, H * 7 / 13
    rect(0, f1 - ch, cw, f1, "blue")
    R = 0.0616 * H / 2
    star = lambda uc, vc: [(uc + (R if j % 2 == 0 else R * 0.382) * math.sin(j * math.pi / 5),
                            vc + (R if j % 2 == 0 else R * 0.382) * math.cos(j * math.pi / 5))
                           for j in range(10)]
    for row in range(9):
        vc = f1 - ch * (row + 1) / 10
        cols = range(1, 12, 2) if row % 2 == 0 else range(2, 11, 2)
        for c in cols:
            poly(star(cw * c / 12, vc), "white")

    path = os.path.join(bpy.app.tempdir, "school-atlas.png")
    sc.render.filepath = path
    win = bpy.context.window
    prev = win.scene
    win.scene = sc
    try:
        bpy.ops.render.render(write_still=True)
    finally:
        win.scene = prev
    img = bpy.data.images.load(path, check_existing=False)
    img.name = "SchoolAtlas"
    img.pack()                                # never leave it in tempdir
    img.filepath_raw = ""
    for o in junk + [cam]:
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if isinstance(data, bpy.types.Mesh):
            bpy.data.meshes.remove(data)
        elif isinstance(data, bpy.types.Curve):
            bpy.data.curves.remove(data)
    bpy.data.cameras.remove(cd)
    bpy.data.scenes.remove(sc)
    for m in mats:
        bpy.data.materials.remove(m)
    return img


# ---------------------------------------------------------------------------
# Blender side
# ---------------------------------------------------------------------------
def get_material(name, img):
    col, rough = MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = 0.0
    if col is None:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = img
        nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    else:
        b.inputs["Base Color"].default_value = col
        m.diffuse_color = col
    m.roughness = rough
    m.use_backface_culling = True
    return m


def bake(part, img):
    me = bpy.data.meshes.new(part.name)
    me.from_pydata(part.v, [], part.f)
    me.update()
    used = list(dict.fromkeys(part.m))
    idx = {n: i for i, n in enumerate(used)}
    for n in used:
        me.materials.append(get_material(n, img))
    uvl = me.uv_layers.new(name="UVMap")
    for i, poly in enumerate(me.polygons):
        poly.material_index = idx[part.m[i]]
        for li, uv in zip(poly.loop_indices, part.uv[i]):
            uvl.data[li].uv = uv
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)   # welds only; winding authored
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = False
    ob = bpy.data.objects.new(part.name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def evaluated_tris(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    m = ev.to_mesh()
    m.calc_loop_triangles()
    n = len(m.loop_triangles)
    ev.to_mesh_clear()
    return n


def tris_by_material(ob):
    out = {}
    for poly in ob.data.polygons:
        n = ob.data.materials[poly.material_index].name
        out[n] = out.get(n, 0) + len(poly.vertices) - 2
    return out


def check_facing(ob, n=24):
    """Ray-cast from a ring of eyes at the model; every first hit must face back at the ray.
    (+0.0137 rad keeps symmetric rays off shared edges.)  The flag is two coincident faces back
    to back, and the BVH returns either, so hits on it are not counted."""
    from mathutils.bvhtree import BVHTree
    tree = BVHTree.FromObject(ob, bpy.context.evaluated_depsgraph_get())
    me = ob.data
    flag = {i for i, poly in enumerate(me.polygons)
            if me.materials[poly.material_index].name.startswith("SchoolSign")
            and poly.center.z > FLAG_TOP - FLAG_H - 0.01}
    bad = hits = 0
    targets = [Vector((x, y, z)) for x in (-4, -2, 0, 2, 4) for y in (-2, 0, 2, 3.2)
               for z in (0.3, 1.5, 2.5, 3.5, 4.5, 6.5)]
    eyes = [Vector((math.cos(a) * 25, math.sin(a) * 25, h))
            for a in [2 * math.pi * k / n + 0.0137 for k in range(n)] for h in (1.5, 5, 18)]
    for e in eyes:
        for t in targets:
            d = (t - e).normalized()
            loc, nrm, i, dist = tree.ray_cast(e, d)
            if loc is None or i in flag:
                continue
            hits += 1
            bad += nrm.dot(d) > 0
    return bad, hits


def _clip_area(a, b):
    """Area of the intersection of two convex 2D polygons (Sutherland-Hodgman)."""
    def area(poly):
        return abs(sum(p[0] * q[1] - q[0] * p[1] for p, q in zip(poly, poly[1:] + poly[:1]))) / 2

    def ccw(poly):
        s = sum(p[0] * q[1] - q[0] * p[1] for p, q in zip(poly, poly[1:] + poly[:1]))
        return poly if s > 0 else poly[::-1]

    def cut(p, q, a, b):
        d1, d2 = (q[0] - p[0], q[1] - p[1]), (b[0] - a[0], b[1] - a[1])
        t = ((a[0] - p[0]) * d2[1] - (a[1] - p[1]) * d2[0]) / (d1[0] * d2[1] - d1[1] * d2[0])
        return (p[0] + d1[0] * t, p[1] + d1[1] * t)
    out, clipper = ccw(a), ccw(b)
    for c0, c1 in zip(clipper, clipper[1:] + clipper[:1]):
        inside = lambda p: (c1[0] - c0[0]) * (p[1] - c0[1]) - (c1[1] - c0[1]) * (p[0] - c0[0]) > 1e-9
        src, out = out, []
        for p, q in zip(src, src[1:] + src[:1]):
            if inside(q):
                if not inside(p):
                    out.append(cut(p, q, c0, c1))
                out.append(q)
            elif inside(p):
                out.append(cut(p, q, c0, c1))
        if len(out) < 3:
            return 0.0
    return area(out)


def check_zfight(ob, gap=1e-3):
    """Same-facing faces within `gap` of one plane that overlap with area AND differ in material:
    those z-fight under engine lighting.  Two flat-shaded faces of one material on one plane
    shade identically, so whichever wins the depth test the pixel is the same — the clapboard's
    butt edges overlap by a lap's depth at every corner and under the vestibule, invisibly.
    Exact for convex faces (every face here is convex)."""
    me = ob.data
    polys = []
    for poly in me.polygons:
        if poly.area < 1e-8:
            continue
        nrm = poly.normal.copy()
        pts = [me.vertices[v].co for v in poly.vertices]
        ax = max(range(3), key=lambda i: abs(nrm[i]))
        o = [i for i in range(3) if i != ax]
        p2 = [(q[o[0]], q[o[1]]) for q in pts]
        lo = [min(q[k] for q in p2) for k in (0, 1)]
        hi = [max(q[k] for q in p2) for k in (0, 1)]
        polys.append((nrm, nrm.dot(pts[0]), ax, p2, lo, hi, poly.index, poly.material_index))
    bad = []
    for i in range(len(polys)):
        ni, di, ai, pi2, loi, hii, pi, mi = polys[i]
        for j in range(i + 1, len(polys)):
            nj, dj, aj, pj2, loj, hij, pj, mj = polys[j]
            if mi == mj or ai != aj or ni.dot(nj) < 0.999 or abs(di - dj) > gap:
                continue
            if min(hii[0], hij[0]) <= max(loi[0], loj[0]) or min(hii[1], hij[1]) <= max(loi[1], loj[1]):
                continue
            if _clip_area(pi2, pj2) > 1e-6:
                bad.append((pi, pj))
    return bad


def check_uv_handedness(ob):
    """Every textured face seen from the road (normal.y > 0) must map image-right to the
    viewer's right: (dP/du x dP/dv) . n > 0.  The flag's back faces read mirrored, as a real
    flag does, so they are left out."""
    me = ob.data
    uvl = me.uv_layers.active.data
    sign_idx = [i for i, m in enumerate(me.materials) if m.name.startswith("SchoolSign")]
    bad = n = 0
    for poly in me.polygons:
        if poly.material_index not in sign_idx or poly.normal.y <= 0.5:
            continue
        li = list(poly.loop_indices)[:3]
        p0, p1, p2 = (me.vertices[me.loops[i].vertex_index].co for i in li)
        t0, t1, t2 = (uvl[i].uv for i in li)
        du1, du2 = t1 - t0, t2 - t0
        det = du1.x * du2.y - du1.y * du2.x
        if abs(det) < 1e-9:
            continue
        e1, e2 = p1 - p0, p2 - p0
        dpdu = (e1 * du2.y - e2 * du1.y) / det
        dpdv = (e2 * du1.x - e1 * du2.x) / det
        n += 1
        bad += dpdu.cross(dpdv).dot(poly.normal) <= 0
    return bad, n


def _fresh_scene():
    for d in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.images,
              bpy.data.curves, bpy.data.cameras):
        for x in list(d):
            d.remove(x)


def build():
    _fresh_scene()
    img = bake_atlas()
    ob = bake(build_part(), img)
    t = evaluated_tris(ob)
    bad, hits = check_facing(ob)
    mir, tex = check_uv_handedness(ob)
    zf = check_zfight(ob)
    lo = [min(v.co[i] for v in ob.data.vertices) for i in range(3)]
    hi = [max(v.co[i] for v in ob.data.vertices) for i in range(3)]
    print("=" * 60)
    print(f"  School  {t} tris (budget {TRI_BUDGET})  materials {len(ob.data.materials)}"
          f"  images {sum(i.type == 'IMAGE' for i in bpy.data.images)}")
    for k, v in sorted(tris_by_material(ob).items(), key=lambda kv: -kv[1]):
        print(f"     {k:<16}{v:5d}")
    print(f"  clapboard: {N_COURSE} courses of {COURSE:.4f} m; eave {EAVE:.2f}, ridge {RIDGE:.2f};"
          f" vestibule eave {V_EAVE:.2f}, ridge {V_RIDGE:.2f}")
    print(f"  bbox  x {lo[0]:.2f}..{hi[0]:.2f}  y {lo[1]:.2f}..{hi[1]:.2f}  z {lo[2]:.2f}..{hi[2]:.2f}")
    print(f"  facing: {bad} inverted first-hits of {hits}")
    print(f"  uv handedness: {mir} mirrored of {tex} road-facing textured faces")
    print(f"  z-fight pairs: {len(zf)} {zf[:8]}")
    print("=" * 60)
    return ob


def export():
    build()
    bpy.ops.export_scene.gltf(
        filepath=f"{OUT_DIR}/{NAME}.glb", export_format="GLB",
        export_draco_mesh_compression_enable=False, export_yup=True,
        export_apply=True, export_materials="EXPORT", export_texcoords=True,
        export_normals=True, export_cameras=False, export_lights=False,
        export_image_format="AUTO", use_selection=False,
        use_active_scene=True)        # never a stray bake scene left by an interrupted run
    print(f"  wrote {OUT_DIR}/{NAME}.glb")
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    print(f"  wrote {OUT_BLEND}")


if __name__ == "__main__":
    build()
