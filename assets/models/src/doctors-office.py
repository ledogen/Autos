"""
ASSET-70 — the DOCTOR'S OFFICE.  Parametric generator.

Built for: Blender 5.2 LTS  |  PROMOTED 2026-10-31 (owner) from wip/ to assets/models/ + assets/models/src/.
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

A country clinic in a converted house: a pale-yellow side-gabled bungalow in lap siding, white
corner boards and trim, green shutters, a charcoal roof with a chimney.  The conversion shows at
the front door: a porch landing under a shed roof, the old steps off one side and a wheelchair
ramp with white rails running along the front wall off the other.  A post sign by the road reads
CLINIC beside a green cross (green, not red: the red cross is a protected emblem).  The sign names
no doctor because the doctor is rolled per seed ("Dr. {last}", data/offer-names.js).

    DoctorsOffice   one mesh, 8 materials, ONE 512x256 image (the sign board)

AXES.  Blender +Y = glTF -Z = forward = the road face.  Length (9 m) runs along X = along the
road, so the marker's own yaw fits it to the pad with no yawOffset.  Base-seated (z = 0),
centred on the WALL footprint; the porch, ramp, steps and sign reach past it on the road side.

SIDING.  The trailer's lap siding (trailer-home-a.py): shallow V-grooves cut INWARD, offset 0 on
every course line, every opening height snapped onto a course line, so the wall meets the
foundation ledge, the openings' reveals and the roof flush.  The courses carry on up the gables,
where each strip is a trapezoid.  Corner boards cover the one seam the grooves open.

WINDING.  Every face goes through face(), which takes the direction the face must point (the
barn.py pattern).  check_facing() proves it by ray cast.  Hidden faces are not built, so the
shell is open BY DESIGN — non-manifold edges are expected.
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
OUT_BLEND = f"{OUT_DIR}/src/doctors-office.blend"
NAME = "doctors-office"
TRI_BUDGET = 1200

# --- envelope ---
W, D = 9.0, 5.0             # wall footprint: along the road (X), depth (Y)
FLOOR = 0.40                # foundation top = floor = porch landing
FND_OUT = 0.03              # foundation stands this proud of the siding plane
COURSE_NOM, WALL_H = 0.24, 2.64
RISE = 1.25                 # eave -> ridge (a 6:12 roof)
EAVE_OUT, RAKE = 0.35, 0.28
ROOF_T = 0.10
RIDGE_CAP_HW, RIDGE_CAP_T = 0.10, 0.05

# --- siding ---
SIDING_D = 0.020            # groove depth, inward
CORNER_W, CORNER_OUT = 0.11, 0.02

# --- openings ---
WIN_W = 0.85
WIN_SILL, WIN_HEAD = 1.12, 2.56   # snapped onto course lines
WIN_DEPTH = 0.10
FRAME_W, FRAME_OUT = 0.09, 0.03
RAIL_HW = 0.025             # double-hung meeting rail, half height
PLEATS, PLEAT_D = 4, 0.06
PLEAT_MIX = (1.0, 0.7)
FRONT_WIN_X = (-3.0, -0.9, 3.45)   # 3.45: its outer shutter clears the corner board
SIDE_WIN_C = 0.0            # one per gable wall, centred
BACK_WIN_X = (-2.0, 2.0)
SHUT_W, SHUT_T, SHUT_GAP = 0.36, 0.04, 0.02
DOOR_X, DOOR_W = 1.70, 0.90
DOOR_DEPTH = 0.10
DOOR_WIN = (0.42, 0.62, 1.30)     # window let into the door: w, h, bottom above the floor
DOOR_WIN_DEPTH = 0.03
KNOB = (0.09, 0.06, 0.05)

# --- porch, steps, ramp ---
LX0, LX1, L_D = 0.85, 2.55, 1.40  # landing: x span, depth off the front wall
PORCH_X = (0.65, 2.75)
PORCH_Z_WALL, PORCH_Z_FRONT, PORCH_D, PORCH_T = 2.80, 2.55, 1.55, 0.10
POST_R = 0.070              # 4x4 posts (circumradius of the square section)
RAIL_R = 0.032
RAIL_H = 0.90
STEP_N, STEP_RUN = 3, 0.28
STEP_Y = (0.25, 1.25)       # off the front wall
RAMP_L = 4.80               # 1:12
RAMP_Y = (0.15, 1.15)       # off the front wall

# --- chimney ---
CH_C, CH_HW, CH_TOP = (-2.4, -0.55), 0.30, 0.85   # centre (x, y), half width, height over ridge
CH_CAP_OUT, CH_CAP_T = 0.05, 0.08

# --- gable vents ---
VENT_W, VENT_H, VENT_Z, VENT_T, VENT_N = 0.50, 0.32, 0.62, 0.03, 3   # VENT_Z above the eave

# --- sign ---
SIGN_C = (4.10, 1.60)       # x, and y off the front wall
SIGN_HW, SIGN_HH = 0.80, 0.40     # MUST stay 2:1 — the image is 512x256
SIGN_ZC, SIGN_T = 1.00, 0.05
SIGN_POST_H = 1.56
SIGN_FONT = "/System/Library/Fonts/Supplemental/Verdana Bold.ttf"
TEX_W, TEX_H = 512, 256

MATS = {
    #  name               base colour (linear)        rough
    "ClinicSiding":   ((0.720, 0.600, 0.330, 1.0), 0.85),   # pale yellow
    "ClinicTrim":     ((0.780, 0.780, 0.740, 1.0), 0.70),   # corner boards, frames, soffit, rails
    "ClinicRoof":     ((0.050, 0.052, 0.058, 1.0), 0.85),   # charcoal shingle
    "ClinicGreen":    ((0.015, 0.100, 0.045, 1.0), 0.60),   # shutters, door
    "ClinicWood":     ((0.300, 0.220, 0.140, 1.0), 0.90),   # landing, ramp, steps
    "ClinicStone":    ((0.200, 0.190, 0.180, 1.0), 0.95),   # foundation, chimney
    "ClinicCurtain":  ((0.800, 0.720, 0.580, 1.0), 0.95),   # the only colour seen through a window
    "ClinicSign":     (None, 0.80),                          # the board image
}
INK = {
    "white": (0.780, 0.790, 0.770),
    "green": (0.012, 0.150, 0.055),
}

X_, Y_, Z_ = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
YF = D / 2
EDGE_UV = (0.004, 0.5)      # inside the board's green border: its edges
BACK_UV = (0.5, 0.86)       # inside the white field above the lettering: its back

# --- derived siding lattice ---
N_COURSE = max(1, round(WALL_H / COURSE_NOM))
COURSE = WALL_H / N_COURSE
EAVE = FLOOR + WALL_H
RIDGE = EAVE + RISE
COURSE_LINES = [FLOOR + COURSE * k for k in range(N_COURSE + 1)]


def snap(v):
    """Nearest course line, so the wall stays flush there."""
    return min(COURSE_LINES, key=lambda c: abs(c - v))


def siding_off(z):
    """Inward offset at height z: 0 on course lines, -SIDING_D at the mid-lines."""
    if z <= FLOOR:
        return 0.0
    t = (z - FLOOR) / COURSE
    return -SIDING_D * (1.0 - abs((t % 1.0) * 2.0 - 1.0))


def lattice(z0, z1):
    out = {z0, z1}
    k = 0
    while FLOOR + COURSE * k / 2 < z1:
        z = FLOOR + COURSE * k / 2
        if z > z0:
            out.add(z)
        k += 1
    return sorted(out)


SILL, HEAD = snap(WIN_SILL), snap(WIN_HEAD)


def gable_half(z):
    """Half-width of the gable wall at height z (it is the roof underside's profile)."""
    return (D / 2) * (RIDGE - z) / RISE


def under_z(y):
    """Roof underside at y; pinned to EAVE on the wall line so the walls meet it."""
    return EAVE + RISE * (1.0 - abs(y) / (D / 2))


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


def tube(p, a, b, r, mat, sides=4, caps=(False, False)):
    """Straight bar of n-gon section from a to b; r is the section's circumradius."""
    a, b = Vector(a), Vector(b)
    ax = (b - a).normalized()
    ref = Z_ if abs(ax.z) < 0.9 else X_
    u = ax.cross(ref).normalized()
    v = ax.cross(u)
    ph = math.pi / sides
    ring = lambda c: [c + (u * math.cos(ph + 2 * math.pi * k / sides) +
                           v * math.sin(ph + 2 * math.pi * k / sides)) * r for k in range(sides)]
    r0, r1 = ring(a), ring(b)
    for k in range(sides):
        k2 = (k + 1) % sides
        q = [r0[k], r0[k2], r1[k2], r1[k]]
        c = sum(q, Vector()) / 4 - a
        p.face(q, mat, c - ax * c.dot(ax))
    if caps[0]:
        p.face(r0, mat, -ax)
    if caps[1]:
        p.face(r1, mat, ax)


# ---------------------------------------------------------------------------
# Walls
# ---------------------------------------------------------------------------
def wall_frame(side):
    """(origin at the wall's centre on the ground, u axis A, outward normal N, length).
    A = Z x N, so a quad wound (u0,v0) (u1,v0) (u1,v1) (u0,v1) faces along N."""
    return {
        '+y': (Vector((0, YF, 0)), -X_, Y_, W),
        '-y': (Vector((0, -YF, 0)), X_, -Y_, W),
        '+x': (Vector((W / 2, 0, 0)), Y_, X_, D),
        '-x': (Vector((-W / 2, 0, 0)), -Y_, -X_, D),
    }[side]


def wp(side, u, v, n=0.0):
    """Wall-local (u, v, normal offset) -> world."""
    O, A, N, _ = wall_frame(side)
    return O + A * u + Z_ * v + N * n


def siding(p, side, holes, gable):
    """Lap-sided wall with rectangular holes (u0, u1, v0, v1), greedy-merged per strip.
    A gable wall carries on above the eave as trapezoid strips up to the ridge."""
    O, A, N, L = wall_frame(side)
    P = lambda u, z: O + A * u + Z_ * z + N * siding_off(z)
    m = "ClinicSiding"
    vs = sorted(set(lattice(FLOOR, RIDGE if gable else EAVE)) | {h[i] for h in holes for i in (2, 3)})
    us = sorted({-L / 2, L / 2} | {h[i] for h in holes for i in (0, 1)})
    for v0, v1 in zip(vs, vs[1:]):
        if v0 >= EAVE - 1e-9:
            h0, h1 = gable_half(v0), gable_half(v1)
            if h1 < 1e-6:
                p.face([P(-h0, v0), P(h0, v0), P(0.0, v1)], m, N)
            else:
                p.face([P(-h0, v0), P(h0, v0), P(h1, v1), P(-h1, v1)], m, N)
            continue
        vm, run = (v0 + v1) / 2, None
        for ua, ub in list(zip(us, us[1:])) + [(None, None)]:
            solid_ = ua is not None and not any(h[0] < (ua + ub) / 2 < h[1] and h[2] < vm < h[3]
                                               for h in holes)
            if solid_:
                run = (run[0], ub) if run else (ua, ub)
            elif run:
                p.face([P(run[0], v0), P(run[1], v0), P(run[1], v1), P(run[0], v1)], m, N)
                run = None


def corners(p):
    """White corner boards over the seam the inward grooves open at each corner.  All four
    sides: the two facing back along the walls close the slot beside the board's proud face."""
    hx, hy = W / 2, D / 2
    for sx in (-1, 1):
        for sy in (-1, 1):
            xs = sorted((sx * (hx - CORNER_W), sx * (hx + CORNER_OUT)))
            ys = sorted((sy * (hy - CORNER_W), sy * (hy + CORNER_OUT)))
            box(p, (xs[0], ys[0], FLOOR), (xs[1], ys[1], EAVE - 0.015), "ClinicTrim", skip={"bot"})


def foundation(p):
    hx, hy, o = W / 2, D / 2, FND_OUT
    outer = [(-hx - o, -hy - o), (hx + o, -hy - o), (hx + o, hy + o), (-hx - o, hy + o)]
    inner = [(-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy)]
    for i in range(4):
        a, b = outer[i], outer[(i + 1) % 4]
        c, d = inner[(i + 1) % 4], inner[i]
        mid = Vector(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0))
        p.face([(*a, 0), (*b, 0), (*b, FLOOR), (*a, FLOOR)], "ClinicStone", mid)
        p.face([(*a, FLOOR), (*b, FLOOR), (*c, FLOOR), (*d, FLOOR)], "ClinicStone", Z_)


# ---------------------------------------------------------------------------
# Openings (trailer-home-a.py's frame / recess / curtain, in wall-local coordinates)
# ---------------------------------------------------------------------------
def frame(p, side, hole, skip_bottom=False):
    """Proud picture frame: a mitred front ring FRAME_OUT off the wall + its outer edge wall."""
    _, A, N, _ = wall_frame(side)
    iu0, iu1, iv0, iv1 = hole
    ou0, ou1 = iu0 - FRAME_W, iu1 + FRAME_W
    ov0, ov1 = (iv0 if skip_bottom else iv0 - FRAME_W), iv1 + FRAME_W
    P = lambda u, v, n: wp(side, u, v, n)
    F, m, B = FRAME_OUT, "ClinicTrim", -SIDING_D   # B: the outer edge starts in the grooves'
    if not skip_bottom:                            # depth, or a slot opens under the ring
        p.face([P(ou0, ov0, F), P(ou1, ov0, F), P(iu1, iv0, F), P(iu0, iv0, F)], m, N)
    p.face([P(iu0, iv1, F), P(iu1, iv1, F), P(ou1, ov1, F), P(ou0, ov1, F)], m, N)
    p.face([P(ou0, ov0, F), P(iu0, iv0, F), P(iu0, iv1, F), P(ou0, ov1, F)], m, N)
    p.face([P(iu1, iv0, F), P(ou1, ov0, F), P(ou1, ov1, F), P(iu1, iv1, F)], m, N)
    if not skip_bottom:                     # a door frame stands on the floor: no underside
        p.face([P(ou0, ov0, B), P(ou1, ov0, B), P(ou1, ov0, F), P(ou0, ov0, F)], m, -Z_)
    p.face([P(ou1, ov1, B), P(ou0, ov1, B), P(ou0, ov1, F), P(ou1, ov1, F)], m, Z_)
    p.face([P(ou0, ov0, B), P(ou0, ov0, F), P(ou0, ov1, F), P(ou0, ov1, B)], m, -A)
    p.face([P(ou1, ov0, B), P(ou1, ov1, B), P(ou1, ov1, F), P(ou1, ov0, F)], m, A)


def curtain(p, side, rect, n, pleats, mat="ClinicCurtain"):
    """Pleated curtain at normal offset n; even `pleats` so both edges meet the reveal."""
    _, A, N, _ = wall_frame(side)
    u0, u1, v0, v1 = rect
    fold = lambda i: 0.0 if i in (0, pleats) else (
        PLEAT_D * PLEAT_MIX[(i // 2) % len(PLEAT_MIX)] if i % 2 else PLEAT_D * 0.15)
    for i in range(pleats):
        ua = u0 + (u1 - u0) * i / pleats
        ub = u0 + (u1 - u0) * (i + 1) / pleats
        da, db = n - fold(i), n - fold(i + 1)
        p.face([wp(side, ua, v0, da), wp(side, ub, v0, db), wp(side, ub, v1, db),
                wp(side, ua, v1, da)], mat, N)


def recess(p, side, hole, depth, start, mat, floor_mat=None, floor_to=None):
    """Reveal from `start` back to start - depth; returns the back plane's offset.  `floor_to`
    stops the bottom face short of `start` (the door: the foundation ledge owns 0..FND_OUT)."""
    _, A, N, _ = wall_frame(side)
    u0, u1, v0, v1 = hole
    b = start - depth
    P = lambda u, v, n: wp(side, u, v, n)
    p.face([P(u0, v0, b), P(u0, v0, start), P(u0, v1, start), P(u0, v1, b)], mat, A)
    p.face([P(u1, v0, b), P(u1, v1, b), P(u1, v1, start), P(u1, v0, start)], mat, -A)
    p.face([P(u0, v1, b), P(u1, v1, b), P(u1, v1, start), P(u0, v1, start)], mat, -Z_)
    f = start if floor_to is None else floor_to
    p.face([P(u0, v0, b), P(u1, v0, b), P(u1, v0, f), P(u0, v0, f)], floor_mat or mat, Z_)
    return b


def window(p, side, uc, shutters=False):
    hole = (uc - WIN_W / 2, uc + WIN_W / 2, SILL, HEAD)
    _, A, N, _ = wall_frame(side)
    b = recess(p, side, hole, WIN_DEPTH + FRAME_OUT, FRAME_OUT, "ClinicTrim")
    curtain(p, side, hole, b, PLEATS)
    frame(p, side, hole)
    # double-hung meeting rail: front, top and bottom, ends buried in the reveal
    vm, f = (SILL + HEAD) / 2, -0.02
    u0, u1 = hole[0], hole[1]
    P = lambda u, v, n: wp(side, u, v, n)
    p.face([P(u0, vm - RAIL_HW, f), P(u1, vm - RAIL_HW, f), P(u1, vm + RAIL_HW, f),
            P(u0, vm + RAIL_HW, f)], "ClinicTrim", N)
    p.face([P(u0, vm + RAIL_HW, b), P(u1, vm + RAIL_HW, b), P(u1, vm + RAIL_HW, f),
            P(u0, vm + RAIL_HW, f)], "ClinicTrim", Z_)
    p.face([P(u0, vm - RAIL_HW, b), P(u1, vm - RAIL_HW, b), P(u1, vm - RAIL_HW, f),
            P(u0, vm - RAIL_HW, f)], "ClinicTrim", -Z_)
    if shutters:
        ov0, ov1 = SILL - FRAME_W, HEAD + FRAME_W
        for s in (-1, 1):
            ua = uc + s * (WIN_W / 2 + FRAME_W + SHUT_GAP)
            ub = ua + s * SHUT_W
            ua, ub = sorted((ua, ub))
            pts = lambda n: [P(ua, ov0, n), P(ub, ov0, n), P(ub, ov1, n), P(ua, ov1, n)]
            bot, top = pts(-SIDING_D), pts(SHUT_T)   # from the grooves' depth: no slot behind
            c = sum(bot + top, Vector()) / 8
            for i in range(4):
                q = [bot[i], bot[(i + 1) % 4], top[(i + 1) % 4], top[i]]
                p.face(q, "ClinicGreen", sum(q, Vector()) / 4 - c)
            p.face(top, "ClinicGreen", N)


def door(p):
    side = '+y'
    uc = -DOOR_X
    hole = (uc - DOOR_W / 2, uc + DOOR_W / 2, FLOOR, HEAD)
    _, A, N, _ = wall_frame(side)
    b = recess(p, side, hole, DOOR_DEPTH + FRAME_OUT, FRAME_OUT, "ClinicTrim", "ClinicWood", 0.0)
    ww, wh, wz = DOOR_WIN
    win = (uc - ww / 2, uc + ww / 2, FLOOR + wz, FLOOR + wz + wh)
    # the slab is a ring around its window, or it would cover it
    u0, u1, v0, v1 = hole
    i0, i1, j0, j1 = win
    P = lambda u, v: wp(side, u, v, b)
    for q in ([P(u0, v0), P(u1, v0), P(i1, j0), P(i0, j0)], [P(i0, j1), P(i1, j1), P(u1, v1), P(u0, v1)],
              [P(u0, v0), P(i0, j0), P(i0, j1), P(u0, v1)], [P(i1, j0), P(u1, v0), P(u1, v1), P(i1, j1)]):
        p.face(q, "ClinicGreen", N)
    wb = recess(p, side, win, DOOR_WIN_DEPTH, b, "ClinicGreen")
    curtain(p, side, win, wb, 2)
    frame(p, side, hole, skip_bottom=True)
    kw, kh, ko = KNOB                       # latch side: away from the hinge, toward the steps
    ku = u0 + 0.12
    k = [wp(side, ku - kw / 2, FLOOR + 1.0 - kh / 2, b), wp(side, ku + kw / 2, FLOOR + 1.0 + kh / 2, b + ko)]
    box(p, tuple(min(k[0][i], k[1][i]) for i in range(3)), tuple(max(k[0][i], k[1][i]) for i in range(3)),
        "ClinicTrim", skip={0})


def vent(p, side):
    """Louvred gable vent: a proud trim box whose face is V-grooves."""
    _, A, N, _ = wall_frame(side)
    z0, z1 = EAVE + VENT_Z - VENT_H / 2, EAVE + VENT_Z + VENT_H / 2
    u0, u1, t, B = -VENT_W / 2, VENT_W / 2, VENT_T, -SIDING_D   # edges from the grooves' depth
    P = lambda u, v, n: wp(side, u, v, n)
    p.face([P(u0, z0, B), P(u1, z0, B), P(u1, z0, t), P(u0, z0, t)], "ClinicTrim", -Z_)
    p.face([P(u0, z1, B), P(u1, z1, B), P(u1, z1, t), P(u0, z1, t)], "ClinicTrim", Z_)
    p.face([P(u0, z0, B), P(u0, z1, B), P(u0, z1, t), P(u0, z0, t)], "ClinicTrim", -A)
    p.face([P(u1, z0, B), P(u1, z1, B), P(u1, z1, t), P(u1, z0, t)], "ClinicTrim", A)
    zz = [z0 + (z1 - z0) * k / VENT_N for k in range(VENT_N + 1)]
    for za, zb in zip(zz, zz[1:]):
        zm = (za + zb) / 2
        for zl, zh, dl, dh in ((za, zm, t, t - 0.02), (zm, zb, t - 0.02, t)):
            p.face([P(u0, zl, dl), P(u1, zl, dl), P(u1, zh, dh), P(u0, zh, dh)], "ClinicTrim", N)


def walls_and_openings(p):
    fw = lambda xs, side: [(-x if side == '+y' else x) for x in xs]
    win = lambda uc: (uc - WIN_W / 2, uc + WIN_W / 2, SILL, HEAD)
    front = [win(u) for u in fw(FRONT_WIN_X, '+y')] + \
            [(-DOOR_X - DOOR_W / 2, -DOOR_X + DOOR_W / 2, FLOOR, HEAD)]
    siding(p, '+y', front, False)
    siding(p, '-y', [win(u) for u in fw(BACK_WIN_X, '-y')], False)
    siding(p, '+x', [win(SIDE_WIN_C)], True)
    siding(p, '-x', [win(-SIDE_WIN_C)], True)
    for u in fw(FRONT_WIN_X, '+y'):
        window(p, '+y', u, shutters=True)
    for u in fw(BACK_WIN_X, '-y'):
        window(p, '-y', u)
    window(p, '+x', SIDE_WIN_C)
    window(p, '-x', -SIDE_WIN_C)
    door(p)
    vent(p, '+x')
    vent(p, '-x')


# ---------------------------------------------------------------------------
# Roof + chimney
# ---------------------------------------------------------------------------
def roof(p):
    hx, hy = W / 2 + RAKE, D / 2 + EAVE_OUT
    und = [(-hy, under_z(-hy)), (0.0, under_z(0.0)), (hy, under_z(hy))]
    top = [(y, z + ROOF_T) for y, z in und]
    for i in range(2):
        (ya, za), (yb, zb) = top[i], top[i + 1]
        up = Vector((0, -(zb - za), yb - ya))
        p.face([(-hx, ya, za), (hx, ya, za), (hx, yb, zb), (-hx, yb, zb)], "ClinicRoof", up)
        (ya, za), (yb, zb) = und[i], und[i + 1]
        p.face([(-hx, ya, za), (hx, ya, za), (hx, yb, zb), (-hx, yb, zb)], "ClinicTrim", -up)
    for idx, s in ((0, -1), (2, 1)):                      # eave fascia
        y, uz = und[idx]
        p.face([(-hx, y, uz), (hx, y, uz), (hx, y, uz + ROOF_T), (-hx, y, uz + ROOF_T)],
               "ClinicTrim", Y_ * s)
    for x, s in ((hx, 1), (-hx, -1)):                     # rake ends: three quads, not a hexagon
        for i in range(2):
            (ya, za), (yb, zb) = und[i], und[i + 1]
            p.face([(x, ya, za), (x, yb, zb), (x, yb, zb + ROOF_T), (x, ya, za + ROOF_T)],
                   "ClinicTrim", X_ * s)


def ridge_cap(p):
    """A cap board along the ridge: the crisp top line a shingle roof has."""
    hx, z = W / 2 + RAKE + 0.02, RIDGE + ROOF_T
    s = RISE / (D / 2)                       # roof slope: the cap's bottom edges sit on it
    box(p, (-hx, -RIDGE_CAP_HW, z - RIDGE_CAP_HW * s), (hx, RIDGE_CAP_HW, z + RIDGE_CAP_T),
        "ClinicRoof", skip={"bot"})


def chimney(p):
    (cx, cy), h = CH_C, CH_HW
    z0 = min(under_z(cy - h), under_z(cy + h)) - 0.05   # inside the roof: it hides the bottom
    z1 = RIDGE + CH_TOP
    box(p, (cx - h, cy - h, z0), (cx + h, cy + h, z1), "ClinicStone", skip={"bot", "top"})
    o = CH_CAP_OUT
    box(p, (cx - h - o, cy - h - o, z1), (cx + h + o, cy + h + o, z1 + CH_CAP_T), "ClinicStone")
    f, zc = h * 0.55, z1 + CH_CAP_T
    box(p, (cx - f, cy - f, zc), (cx + f, cy + f, zc + 0.12), "ClinicRoof", skip={"bot"})   # flue tile


# ---------------------------------------------------------------------------
# Porch landing, steps, ramp, rails
# ---------------------------------------------------------------------------
def porch(p):
    m = "ClinicWood"
    box(p, (LX0, YF + FND_OUT, 0), (LX1, YF + L_D, FLOOR), m, skip={0, "bot"})
    # steps off the +X side, two treads below the landing
    rise = FLOOR / STEP_N
    y0, y1 = YF + STEP_Y[0], YF + STEP_Y[1]
    for k in range(1, STEP_N):              # k = 1 next to the landing (highest)
        xa, xb = LX1 + STEP_RUN * (k - 1), LX1 + STEP_RUN * k
        box(p, (xa, y0, 0), (xb, y1, FLOOR - rise * k), m, skip={"bot", 3})
    # shed roof on two posts
    x0, x1 = PORCH_X
    yf = YF + PORCH_D
    zt = lambda y: PORCH_Z_WALL + (PORCH_Z_FRONT - PORCH_Z_WALL) * (y - YF) / PORCH_D
    yw = YF - SIDING_D                      # its back runs into the grooves: no slot at the wall
    bot = [(x0, yw, zt(yw) - PORCH_T), (x1, yw, zt(yw) - PORCH_T), (x1, yf, zt(yf) - PORCH_T),
           (x0, yf, zt(yf) - PORCH_T)]
    top = [(x, y, z + PORCH_T) for x, y, z in bot]
    up = Vector((0, -(zt(yf) - zt(YF)), PORCH_D))
    p.face(top, "ClinicRoof", up)
    p.face(bot, "ClinicTrim", -up)
    p.face([bot[2], bot[3], top[3], top[2]], "ClinicTrim", Y_)
    p.face([bot[0], bot[3], top[3], top[0]], "ClinicTrim", -X_)
    p.face([bot[1], bot[2], top[2], top[1]], "ClinicTrim", X_)
    py = YF + L_D - 0.10
    posts = []
    for px in (LX0 + 0.10, LX1 - 0.10):
        tube(p, (px, py, FLOOR), (px, py, zt(py) - PORCH_T), POST_R, "ClinicTrim")
        posts.append(px)
    # landing front rail between the posts: top and bottom
    for z in (FLOOR + RAIL_H, FLOOR + 0.12):
        tube(p, (posts[0] + POST_R * 0.7, py, z), (posts[1] - POST_R * 0.7, py, z), RAIL_R, "ClinicTrim")


def ramp(p):
    """A skirted wedge down the front wall from the landing, rails on white posts both sides."""
    foot = LX0 - RAMP_L
    y0, y1 = YF + RAMP_Y[0], YF + RAMP_Y[1]
    deck = lambda x: FLOOR * (x - foot) / RAMP_L
    m = "ClinicWood"
    p.face([(foot, y0, 0), (LX0, y0, FLOOR), (LX0, y1, FLOOR), (foot, y1, 0)], m, Vector((-FLOOR, 0, RAMP_L)))
    for y, s in ((y0, -1), (y1, 1)):
        p.face([(foot, y, 0), (LX0, y, 0), (LX0, y, FLOOR)], m, Y_ * s)
    for y in (y0 + 0.06, y1 - 0.06):
        xs = (foot + 0.12, (foot + LX0) / 2, LX0 - 0.10)
        for x in xs:
            tube(p, (x, y, deck(x)), (x, y, deck(x) + RAIL_H), POST_R * 0.8, "ClinicTrim", caps=(False, True))
        a, b = xs[0], xs[-1]
        tube(p, (a, y, deck(a) + RAIL_H - 0.05), (b + 0.10, y, deck(b + 0.10) + RAIL_H - 0.05), RAIL_R,
             "ClinicTrim", caps=(True, True))


# ---------------------------------------------------------------------------
# Sign
# ---------------------------------------------------------------------------
def sign_uv(x, z):
    """Board metres (x along world X, z from the board centre) -> image.  The board faces +Y,
    so the reader's right is -X (check_uv_handedness proves it)."""
    return (0.5 - x / (2 * SIGN_HW), 0.5 + z / (2 * SIGN_HH))


def sign(p):
    cx, cy = SIGN_C[0], YF + SIGN_C[1]
    hw, hh, zc, t = SIGN_HW, SIGN_HH, SIGN_ZC, SIGN_T
    yb, yf = cy - t / 2, cy + t / 2
    corners = [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)]
    p.face([(cx + x, yf, zc + z) for x, z in corners], "ClinicSign", Y_,
           [sign_uv(x, z) for x, z in corners])
    p.face([(cx + x, yb, zc + z) for x, z in corners], "ClinicSign", -Y_, BACK_UV)
    for i in range(4):
        (ax, az), (bx, bz) = corners[i], corners[(i + 1) % 4]
        out = Vector((bz - az, 0, -(bx - ax)))
        p.face([(cx + ax, yb, zc + az), (cx + bx, yb, zc + bz), (cx + bx, yf, zc + bz),
                (cx + ax, yf, zc + az)], "ClinicSign", out)
    for s in (-1, 1):
        x = cx + s * (hw + POST_R * 0.75)
        tube(p, (x, cy, 0), (x, cy, SIGN_POST_H), POST_R, "ClinicTrim", caps=(False, True))


def build_part():
    p = Part("DoctorsOffice")
    foundation(p)
    walls_and_openings(p)
    corners(p)
    roof(p)
    ridge_cap(p)
    chimney(p)
    porch(p)
    ramp(p)
    sign(p)
    return p


# ---------------------------------------------------------------------------
# Sign bake: an orthographic render of flat emitters, drawn in board metres
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


def bake_sign():
    engines = {i.identifier for i in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items}
    sc = bpy.data.scenes.new("SignBake")
    sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engines else 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = TEX_W, TEX_H
    sc.render.resolution_percentage = 100
    sc.render.dither_intensity = 0.0          # flat artwork: dither only bloats the PNG
    for k in dir(sc.render):                  # no date/render-time stamps: re-runs stay identical
        if k.startswith("use_stamp_"):
            setattr(sc.render, k, False)
    sc.view_settings.view_transform = 'Standard'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGB'
    # Scene units ARE board metres as the reader sees the board: +x = the reader's right.
    cd = bpy.data.cameras.new("SignCam")
    cd.type, cd.ortho_scale = 'ORTHO', 2 * SIGN_HW
    cam = bpy.data.objects.new("SignCam", cd)
    cam.location = (0.0, 0.0, 5.0)
    sc.collection.objects.link(cam)
    sc.camera = cam
    junk, mats, layer = [], [], [0]

    def z():
        layer[0] += 1
        return layer[0] * 0.01

    def rect(x0, y0, x1, y1, col):
        me = bpy.data.meshes.new("a")
        zz = z()
        me.from_pydata([(x0, y0, zz), (x1, y0, zz), (x1, y1, zz), (x0, y1, zz)], [], [[0, 1, 2, 3]])
        o = bpy.data.objects.new("a", me)
        m = _emission("a", INK[col])
        mats.append(m)
        me.materials.append(m)
        sc.collection.objects.link(o)
        junk.append(o)

    def text(body, xc, yc, w, h, col):
        cu = bpy.data.curves.new("t", type='FONT')
        cu.body = body
        try:
            cu.font = bpy.data.fonts.load(SIGN_FONT, check_existing=True)
        except (RuntimeError, OSError):
            print("WARN: font not found, falling back to Bfont:", SIGN_FONT)
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
        o.location = (xc - k * (max(xs) + min(xs)) / 2, yc - k * (max(ys) + min(ys)) / 2, z())

    hw, hh = SIGN_HW, SIGN_HH
    rect(-hw, -hh, hw, hh, "green")           # border (and the board's edges, EDGE_UV)
    rect(-hw + 0.04, -hh + 0.04, hw - 0.04, hh - 0.04, "white")
    rect(-hw + 0.065, -hh + 0.065, hw - 0.065, hh - 0.065, "green")
    rect(-hw + 0.075, -hh + 0.075, hw - 0.075, hh - 0.075, "white")
    cx, a, b = -0.47, 0.20, 0.066             # the cross: arm half-length, half-width
    rect(cx - b, -a, cx + b, a, "green")
    rect(cx - a, -b, cx + a, b, "green")
    text("CLINIC", 0.21, 0.0, 0.80, 0.30, "green")

    path = os.path.join(bpy.app.tempdir, "doctors-office-sign.png")
    sc.render.filepath = path
    win = bpy.context.window
    prev = win.scene
    win.scene = sc
    try:
        bpy.ops.render.render(write_still=True)
    finally:
        win.scene = prev
    img = bpy.data.images.load(path, check_existing=False)
    img.name = "ClinicSign"
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
    (+0.0137 rad keeps symmetric rays off shared edges.)"""
    from mathutils.bvhtree import BVHTree
    tree = BVHTree.FromObject(ob, bpy.context.evaluated_depsgraph_get())
    bad = hits = 0
    targets = [Vector((x, y, z)) for x in (-4, -2, 0, 2, 4) for y in (-2, 0, 2, 3.5)
               for z in (0.3, 1.5, 2.5, 3.5, 4.5)]
    eyes = [Vector((math.cos(a) * 25, math.sin(a) * 25, h))
            for a in [2 * math.pi * k / n + 0.0137 for k in range(n)] for h in (1.5, 5, 18)]
    for e in eyes:
        for t in targets:
            d = (t - e).normalized()
            loc, nrm, i, dist = tree.ray_cast(e, d)
            if loc is None:
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
    """Same-facing faces within `gap` of one plane that overlap with area: they z-fight under
    engine lighting.  Exact for convex faces (every face here is convex)."""
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
        polys.append((nrm, nrm.dot(pts[0]), ax, p2, lo, hi, poly.index))
    bad = []
    for i in range(len(polys)):
        ni, di, ai, pi2, loi, hii, pi = polys[i]
        for j in range(i + 1, len(polys)):
            nj, dj, aj, pj2, loj, hij, pj = polys[j]
            if ai != aj or ni.dot(nj) < 0.999 or abs(di - dj) > gap:
                continue
            if min(hii[0], hij[0]) <= max(loi[0], loj[0]) or min(hii[1], hij[1]) <= max(loi[1], loj[1]):
                continue
            if _clip_area(pi2, pj2) > 1e-6:
                bad.append((pi, pj))
    return bad


def check_uv_handedness(ob):
    """Every textured face whose UVs span an area must map image-right to the viewer's
    right: (dP/du x dP/dv) . n > 0.  A mirrored face reads backwards text."""
    me = ob.data
    uvl = me.uv_layers.active.data
    sign_idx = [i for i, m in enumerate(me.materials) if m.name.startswith("ClinicSign")]
    bad = n = 0
    for poly in me.polygons:
        if poly.material_index not in sign_idx:
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
    img = bake_sign()
    ob = bake(build_part(), img)
    t = evaluated_tris(ob)
    bad, hits = check_facing(ob)
    mir, tex = check_uv_handedness(ob)
    zf = check_zfight(ob)
    lo = [min(v.co[i] for v in ob.data.vertices) for i in range(3)]
    hi = [max(v.co[i] for v in ob.data.vertices) for i in range(3)]
    print("=" * 60)
    print(f"  DoctorsOffice  {t} tris (budget {TRI_BUDGET})  materials {len(ob.data.materials)}"
          f"  images {sum(i.type == 'IMAGE' for i in bpy.data.images)}")
    for k, v in sorted(tris_by_material(ob).items(), key=lambda kv: -kv[1]):
        print(f"     {k:<16}{v:5d}")
    print(f"  siding: {N_COURSE} courses of {COURSE:.4f} m; eave {EAVE:.2f}, ridge {RIDGE:.2f}")
    print(f"  bbox  x {lo[0]:.2f}..{hi[0]:.2f}  y {lo[1]:.2f}..{hi[1]:.2f}  z {lo[2]:.2f}..{hi[2]:.2f}")
    print(f"  facing: {bad} inverted first-hits of {hits}")
    print(f"  uv handedness: {mir} mirrored of {tex} lettered faces")
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
