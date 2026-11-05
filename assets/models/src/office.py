"""
ASSET-69 — the small OFFICE.  Parametric generator.

Built for: Blender 5.2 LTS  |  PROMOTED 2026-10-31 (owner) from wip/ to assets/models/ + assets/models/src/.
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

A single-storey flat-roofed office on a 14 x 8 m lay-by: light stucco over a dark brick
wainscot, a deep-blue parapet band with a raised false front on the road side that carries an
JOB WORK board, an aluminium storefront (glass door + sidelight + transom) under a flat canopy,
windows with drawn venetian blinds, and a rooftop unit that breaks the roofline.  The board
says JOB WORK (owner, 2026-10-30), not a name, because the office's name is rolled per seed (data/offer-names.js:
"{last} & Associates", "{last} Realty", ...) and any of them can be a tenant here.

    Office     one mesh, 8 materials, ONE 512x128 image (the sign board)

AXES.  Blender +Y = glTF -Z = forward = the road face.  Length (10 m) runs along X = along the
road, so the marker's own yaw fits it to the pad with no yawOffset.  Base-seated (z = 0),
centred on the WALL footprint; the stoop and canopy reach past it on the road side.

WINDING.  Every face goes through face(), which takes the direction the face must point and
flips the polygon to suit (the barn.py / general-store.py pattern).  check_facing() proves it
by ray cast.  Hidden faces (wall backs, butt joints) are not built, so the shell is open BY
DESIGN — non-manifold edges are expected, not a defect.

JOINTS.  Anything that would leave an open end is buried: the brick and its cap butt into the
storefront pilasters, the side copings tuck between the front and back ones, and the pilasters
stop under the canopy.
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
OUT_BLEND = f"{OUT_DIR}/src/office.blend"
NAME = "office"
TRI_BUDGET = 1200

# --- envelope ---
W, D = 10.0, 5.0            # wall footprint: along the road (X), depth (Y)
DECK = 3.30                 # roof deck, inside the parapet
PAR = 3.75                  # parapet top, sides and back
PAR_T = 0.20                # parapet thickness
FALSE_HW, FALSE_Z = 2.30, 4.45   # the raised centre of the road parapet, behind the sign
BAND_Z, BAND_OUT = 2.95, 0.04    # the blue band: starts here all round, a drip line proud
COPE_H, COPE_OUT, COPE_IN = 0.08, 0.05, 0.03

# --- brick wainscot ---
BASE_Z, BASE_OUT = 0.85, 0.04
BRICK_N, BRICK_GD = 5, 0.014     # coursing: V-grooves cut inward, mitred at the corners
CAP_H, CAP_OUT = 0.06, 0.08

# --- stoop + canopy ---
# The stoop top is the first course line, so the brick either side of it stays in course.
AP_H, AP_HW, AP_D = BASE_Z / BRICK_N, 1.60, 1.10
CAN_HW, CAN_D, CAN_Z0, CAN_T = 1.45, 1.00, 2.80, 0.12
ROD_R, ROD_Z = 0.018, 3.35  # tie rods: canopy front corners up to the band

# --- storefront: door + sidelight + transom in one aluminium frame ---
SF_X0, SF_X1, SF_Z1 = -0.75, 0.75, 2.75
REC = 0.12                  # opening reveal depth (stucco plane -> glass)
PIL_W, PIL_OUT = 0.16, 0.10 # blue pilasters either side; OUT > CAP_OUT so the cap butts in
AL, AL_D = 0.05, 0.05       # frame member face width, and how far it stands off the glass
DOOR_X1 = 0.25              # the door leaf runs SF_X0 + AL .. DOOR_X1; the sidelight the rest
TRANSOM_Z = 2.30
STILE, RAIL_B, RAIL_T = 0.09, 0.22, 0.09
BAR_Z = 1.05                # push bar

# --- windows ---
WIN_X = (1.70, 4.10)        # |x| span of each front window
WIN_Z = (1.05, 2.35)
WIN_MULL = 2                # vertical mullions per front window
SILL_H, SILL_OUT = 0.05, 0.07
BLIND_P, BLIND_D = 0.13, 0.015
OPEN_FRAC = (0.0, 0.30)     # left, right window: share of the height left open below the blind
SIDE_WIN_W = 1.60           # one per side wall, built proud of the sealed wall
SIDE_OPEN = (0.25, 0.0)     # +X, -X
BACK_WIN_X = (-2.4, 2.4)    # two on the back wall, the same
BACK_OPEN = (0.35, 0.12)
PROUD_FW, PROUD_FT = 0.07, 0.04

# --- roof gear ---
HV_C, HV_S = (2.60, -0.70), (1.30, 0.95, 0.90)   # rooftop unit: centre (x, y), size
HV_GROOVES, HV_GD = 5, 0.025
FAN_R, FAN_H = 0.34, 0.07
STACK_C, STACK_R, STACK_H = (-3.0, -1.1), 0.05, 0.85

# --- downspouts (side walls, near the road corners) ---
DS_Y = D / 2 - 0.40
DS_R = 0.045
DS_OFF = CAP_OUT + DS_R + 0.02       # pipe centre off the stucco plane: clears the cap

# --- sign board ---
SIGN_HW, SIGN_HH = 1.80, 0.45        # half extents, metres. MUST stay 4:1 — the image is 512x128
SIGN_ZC, SIGN_T = 3.86, 0.06
SIGN_FONT = "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"
SIGN_TEXT, SIGN_TW, SIGN_TH = "JOB WORK", 2.90, 0.46
SIGN_SPACING = 1.25                  # letter spacing (Blender's space_character)
TEX_W, TEX_H = 512, 128

MATS = {
    #  name              base colour (linear)        rough
    "OfficeWall":     ((0.520, 0.500, 0.450, 1.0), 0.90),   # stucco
    "OfficeBrick":    ((0.150, 0.050, 0.028, 1.0), 0.90),   # wainscot
    "OfficeAccent":   ((0.022, 0.060, 0.150, 1.0), 0.70),   # band, pilasters, canopy, downspouts
    "OfficeTrim":     ((0.760, 0.740, 0.680, 1.0), 0.70),   # coping, sills, cap, blinds
    "OfficeMetal":    ((0.420, 0.430, 0.440, 1.0), 0.40),   # clear-anodised frames, rooftop unit
    "OfficeGlass":    ((0.010, 0.013, 0.018, 1.0), 0.08),   # door glass, fan, the gap under a blind
    "OfficeConcrete": ((0.260, 0.250, 0.230, 1.0), 0.95),   # stoop, roof deck
    "OfficeSign":     (None, 0.80),                          # the board image
}
INK = {
    "cream": (0.700, 0.660, 0.550),
    "navy":  MATS["OfficeAccent"][0][:3],
    "line":  (0.060, 0.120, 0.260),
}

X_, Y_, Z_ = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
HX, YF = W / 2, D / 2       # side wall plane |x|, front wall plane y
EDGE_UV = (0.004, 0.5)      # a texel inside the board's navy border: the board's edges


# ---------------------------------------------------------------------------
# Geometry accumulator
# ---------------------------------------------------------------------------
class Part:
    def __init__(self, name):
        self.name, self.v, self.f, self.m, self.uv = name, [], [], [], []

    def face(self, pts, mat, out, uv=None):
        """One polygon, wound so its normal points along `out`.  `uv`: per-vertex list or None."""
        pts = [Vector(p) for p in pts]
        uvs = list(uv) if uv else [EDGE_UV] * len(pts)
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


def back_side(N):
    """box() side index of the face that lies against a wall whose outward normal is N."""
    return {(0, 1): 0, (0, -1): 2, (1, 0): 3, (-1, 0): 1}[(round(N.x), round(N.y))]


def tube(p, a, b, r, mat, sides=4, caps=(False, False)):
    """Straight bar of n-gon section from a to b, half-width r."""
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
        p.face(q, mat, c - ax * c.dot(ax))          # radial: away from the bar's axis
    if caps[0]:
        p.face(r0, mat, -ax)
    if caps[1]:
        p.face(r1, mat, ax)


def wall(p, origin, N, us, zs, mat_at):
    """A planar wall on a (u, z) grid, u along A = Z x N.  mat_at(world point) -> material or
    None (a hole).  Each row is greedy-merged, so a plain run is ONE quad."""
    A, O = Z_.cross(N), Vector(origin)
    for za, zb in zip(zs, zs[1:]):
        run = None
        for ua, ub in list(zip(us, us[1:])) + [(None, None)]:
            m = mat_at(O + A * ((ua + ub) / 2) + Z_ * ((za + zb) / 2)) if ua is not None else None
            if run and m == run[2]:
                run = (run[0], ub, m)
                continue
            if run:
                u0, u1 = run[0], run[1]
                p.face([O + A * u0 + Z_ * za, O + A * u1 + Z_ * za,
                        O + A * u1 + Z_ * zb, O + A * u0 + Z_ * zb], run[2], N)
            run = (ua, ub, m) if m else None


def grooves(p, O, A, N, u0, u1, z0, z1, pitch, depth, mat, mitre=(False, False)):
    """Horizontal V-grooves cut INWARD from the plane at O (blinds, louvres, brick).  u along A.

    `mitre` (u0 end, u1 end): that end is an outside corner whose neighbour wall is grooved on
    the same courses.  The end pulls in by the local groove depth, so the two walls' corner
    edges are the same line — without it a 1-2 cm slit opens at every groove.  Each strip
    stays planar: its edge moves in step with its own recess."""
    n = max(1, round((z1 - z0) / pitch))
    zz = [z0 + (z1 - z0) * k / n for k in range(n + 1)]
    ua = lambda d: u0 - d if mitre[0] else u0      # d <= 0 is the recess
    ub = lambda d: u1 + d if mitre[1] else u1
    for za, zc in zip(zz, zz[1:]):
        zm = (za + zc) / 2
        for zl, zh, dl, dh in ((za, zm, 0.0, -depth), (zm, zc, -depth, 0.0)):
            p.face([O + A * ua(dl) + Z_ * zl + N * dl, O + A * ub(dl) + Z_ * zl + N * dl,
                    O + A * ub(dh) + Z_ * zh + N * dh, O + A * ua(dh) + Z_ * zh + N * dh], mat, N)


def pipe(p, pts, r, mat, sides=4, cap_end=False):
    """A bent bar along the polyline `pts`, half-width r, with MITRED joints: the ring at a bend
    lies in the bisector plane, so the two legs share it and no wedge opens on the outside of
    the bend.  The frame's u axis is normal to the bend plane (pts must be coplanar)."""
    pts = [Vector(q) for q in pts]
    ds = [(b - a).normalized() for a, b in zip(pts, pts[1:])]
    u = ds[0].cross(ds[-1]) if len(ds) > 1 else Vector()
    if u.length < 1e-6:
        u = ds[0].cross(Z_ if abs(ds[0].z) < 0.9 else X_)
    u.normalize()
    ph = math.pi / sides
    rings = []
    for i, c in enumerate(pts):
        d = ds[max(0, i - 1)] if i == len(pts) - 1 else ds[i]
        din = ds[i - 1] if i > 0 else d
        v = din.cross(u)
        offs = [(u * math.cos(ph + 2 * math.pi * k / sides) +
                 v * math.sin(ph + 2 * math.pi * k / sides)) * r for k in range(sides)]
        if 0 < i < len(pts) - 1:                      # slide onto the bisector plane
            nb = (ds[i - 1] + ds[i]).normalized()
            offs = [o - din * (o.dot(nb) / din.dot(nb)) for o in offs]
        rings.append([c + o for o in offs])
    for i, d in enumerate(ds):
        a = pts[i]
        for k in range(sides):
            k2 = (k + 1) % sides
            q = [rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]]
            cq = sum(q, Vector()) / 4 - a
            p.face(q, mat, cq - d * cq.dot(d))
    if cap_end:
        p.face(rings[-1], mat, ds[-1])


# ---------------------------------------------------------------------------
# Walls
# ---------------------------------------------------------------------------
def front_holes():
    """(x0, x1, z0, z1) of every opening in the road wall."""
    a, b = WIN_X
    return [(SF_X0, SF_X1, AP_H, SF_Z1), (-b, -a, *WIN_Z), (a, b, *WIN_Z)]


def walls(p):
    hy = D / 2
    pil = (SF_X0 - PIL_W, SF_X1 + PIL_W)
    holes = front_holes()

    # stucco, road face: BASE_Z .. BAND_Z, holes for the openings, nothing behind the pilasters
    def front_at(q):
        if any(h[0] < q.x < h[1] and h[2] < q.z < h[3] for h in holes):
            return None
        if pil[0] < q.x < pil[1] and q.z < CAN_Z0 and not (SF_X0 < q.x < SF_X1):
            return None
        return "OfficeWall"
    xs = sorted({-HX, HX, pil[0], pil[1], *[h[i] for h in holes for i in (0, 1)]})
    zs = sorted({BASE_Z, BAND_Z, CAN_Z0, *[h[i] for h in holes for i in (2, 3)]} - {AP_H})
    wall(p, (0, YF, 0), Y_, [-x for x in xs[::-1]], zs, front_at)
    # the other three are plain stucco fields
    wall(p, (0, -hy, 0), -Y_, [-HX, HX], [BASE_Z, BAND_Z], lambda q: "OfficeWall")
    for sx in (1, -1):
        wall(p, (sx * HX, 0, 0), X_ * sx, [-hy, hy], [BASE_Z, BAND_Z], lambda q: "OfficeWall")


def brick(p):
    """Wainscot BASE_OUT proud of the stucco, with a trim cap; it butts into the pilasters."""
    hy, bo = D / 2, BASE_OUT
    pil = (SF_X0 - PIL_W, SF_X1 + PIL_W)

    pitch, gd, m = BASE_Z / BRICK_N, BRICK_GD, "OfficeBrick"
    # Road face, each side of the stoop: one run above the stoop top to the pilaster, one
    # course below it to the stoop's end.  On +Y, u = -x, so the outer corner is the u1 end
    # on the left run and the u0 end on the right.
    O = Vector((0, YF + bo, 0))
    grooves(p, O, -X_, Y_, -pil[0], HX + bo, AP_H, BASE_Z, pitch, gd, m, mitre=(False, True))
    grooves(p, O, -X_, Y_, AP_HW, HX + bo, 0, AP_H, pitch, gd, m, mitre=(False, True))
    grooves(p, O, -X_, Y_, -HX - bo, -pil[1], AP_H, BASE_Z, pitch, gd, m, mitre=(True, False))
    grooves(p, O, -X_, Y_, -HX - bo, -AP_HW, 0, AP_H, pitch, gd, m, mitre=(True, False))
    grooves(p, Vector((0, -hy - bo, 0)), X_, -Y_, -HX - bo, HX + bo, 0, BASE_Z, pitch, gd, m,
            mitre=(True, True))
    for sx in (1, -1):
        N = X_ * sx
        grooves(p, Vector((sx * (HX + bo), 0, 0)), Z_.cross(N), N, -hy - bo, hy + bo, 0, BASE_Z,
                pitch, gd, m, mitre=(True, True))
    # cap: a ring of boxes; front/back run corner to corner, the ends tuck between them
    co, z0, z1 = CAP_OUT, BASE_Z, BASE_Z + CAP_H
    for x0, x1, end in ((-HX - co, pil[0], 1), (pil[1], HX + co, 3)):    # `end` butts a pilaster
        box(p, (x0, YF, z0), (x1, YF + co, z1), "OfficeTrim", skip={0, end})
    box(p, (-HX - co, -hy - co, z0), (HX + co, -hy, z1), "OfficeTrim", skip={2})
    for sx in (1, -1):
        xa, xb = sorted((sx * HX, sx * (HX + co)))
        box(p, (xa, -hy, z0), (xb, hy, z1), "OfficeTrim", skip={0, 2, 1 if sx < 0 else 3})


def band(p):
    """The blue parapet band, BAND_OUT proud, from BAND_Z to the coping; stepped on the road."""
    hy, bo = D / 2, BAND_OUT
    yo = YF + bo
    for xa, xb, zt in ((-HX - bo, -FALSE_HW, PAR), (-FALSE_HW, FALSE_HW, FALSE_Z),
                       (FALSE_HW, HX + bo, PAR)):
        p.face([(xa, yo, BAND_Z), (xb, yo, BAND_Z), (xb, yo, zt), (xa, yo, zt)], "OfficeAccent", Y_)
    p.face([(-HX - bo, -hy - bo, BAND_Z), (HX + bo, -hy - bo, BAND_Z), (HX + bo, -hy - bo, PAR),
            (-HX - bo, -hy - bo, PAR)], "OfficeAccent", -Y_)
    for sx in (1, -1):
        x = sx * (HX + bo)
        p.face([(x, -hy - bo, BAND_Z), (x, hy + bo, BAND_Z), (x, hy + bo, PAR), (x, -hy - bo, PAR)],
               "OfficeAccent", X_ * sx)
    # drip-line underside, a mitred ring
    outer = [(-HX - bo, -hy - bo), (HX + bo, -hy - bo), (HX + bo, hy + bo), (-HX - bo, hy + bo)]
    inner = [(-HX, -hy), (HX, -hy), (HX, hy), (-HX, hy)]
    for i in range(4):
        a, b, c, d = outer[i], outer[(i + 1) % 4], inner[(i + 1) % 4], inner[i]
        p.face([(*a, BAND_Z), (*b, BAND_Z), (*c, BAND_Z), (*d, BAND_Z)], "OfficeAccent", -Z_)


def parapet_and_deck(p):
    """Inner parapet faces, the deck, the false front's ends, and the coping on top."""
    hy = D / 2
    ix, iy = HX - PAR_T, hy - PAR_T
    yi = YF - PAR_T                          # inner face of the road parapet
    m = "OfficeAccent"
    for xa, xb, zt in ((-ix, -FALSE_HW, PAR), (-FALSE_HW, FALSE_HW, FALSE_Z), (FALSE_HW, ix, PAR)):
        p.face([(xa, yi, DECK), (xb, yi, DECK), (xb, yi, zt), (xa, yi, zt)], m, -Y_)
    p.face([(-ix, -iy, DECK), (ix, -iy, DECK), (ix, -iy, PAR), (-ix, -iy, PAR)], m, Y_)
    for sx in (1, -1):
        p.face([(sx * ix, -iy, DECK), (sx * ix, iy, DECK), (sx * ix, iy, PAR), (sx * ix, -iy, PAR)],
               m, -X_ * sx)
    p.face([(-ix, -iy, DECK), (ix, -iy, DECK), (ix, iy, DECK), (-ix, iy, DECK)], "OfficeConcrete", Z_)
    # the false front's two ends, above the low coping
    for sx in (1, -1):
        x = sx * FALSE_HW
        p.face([(x, yi, PAR + COPE_H), (x, YF + BAND_OUT, PAR + COPE_H), (x, YF + BAND_OUT, FALSE_Z),
                (x, yi, FALSE_Z)], m, X_ * sx)
    # coping: front pieces and back run corner to corner, the sides tuck between them
    co, ci, t = COPE_OUT, COPE_IN, COPE_H
    yo = YF + BAND_OUT + co
    for xa, xb in ((-HX - BAND_OUT - co, -FALSE_HW), (FALSE_HW, HX + BAND_OUT + co)):
        box(p, (xa, yi - ci, PAR), (xb, yo, PAR + t), "OfficeTrim")
    box(p, (-FALSE_HW - co, yi - ci, FALSE_Z), (FALSE_HW + co, yo, FALSE_Z + t), "OfficeTrim")
    yb = -hy - BAND_OUT - co
    box(p, (-HX - BAND_OUT - co, yb, PAR), (HX + BAND_OUT + co, -iy + ci, PAR + t), "OfficeTrim")
    for sx in (1, -1):
        xa, xb = sorted((sx * (ix - ci), sx * (HX + BAND_OUT + co)))
        box(p, (xa, -iy + ci, PAR), (xb, yi - ci, PAR + t), "OfficeTrim", skip={0, 2})


# ---------------------------------------------------------------------------
# Openings
# ---------------------------------------------------------------------------
def reveal(p, x0, x1, z0, z1, mat="OfficeWall", sill=True):
    yb = YF - REC
    p.face([(x0, yb, z0), (x0, YF, z0), (x0, YF, z1), (x0, yb, z1)], mat, X_)
    p.face([(x1, yb, z0), (x1, YF, z0), (x1, YF, z1), (x1, yb, z1)], mat, -X_)
    p.face([(x0, yb, z1), (x1, yb, z1), (x1, YF, z1), (x0, YF, z1)], mat, -Z_)
    if sill:
        p.face([(x0, yb, z0), (x1, yb, z0), (x1, YF, z0), (x0, YF, z0)], mat, Z_)


def al_frame(p, x0, x1, z0, z1, bars=(), posts=(), bottom=True):
    """Aluminium members standing AL_D off the glass plane: jambs, head (+ sill), and any
    horizontal `bars` (z) / vertical `posts` (x) between them.  Backs and buried ends skipped."""
    yb, yf, a = YF - REC, YF - REC + AL_D, AL
    box(p, (x0, yb, z0), (x0 + a, yf, z1), "OfficeMetal", skip={0, 3, "bot", "top"})
    box(p, (x1 - a, yb, z0), (x1, yf, z1), "OfficeMetal", skip={0, 1, "bot", "top"})
    box(p, (x0 + a, yb, z1 - a), (x1 - a, yf, z1), "OfficeMetal", skip={0, 1, 3, "top"})
    if bottom:
        box(p, (x0 + a, yb, z0), (x1 - a, yf, z0 + a), "OfficeMetal", skip={0, 1, 3, "bot"})
    for z in bars:
        box(p, (x0 + a, yb, z), (x1 - a, yf, z + a), "OfficeMetal", skip={0, 1, 3})
    top = min(bars) if bars else z1 - a        # a post stops under the lowest bar
    for x in posts:
        box(p, (x - a / 2, yb, z0 + (a if bottom else 0)), (x + a / 2, yf, top), "OfficeMetal",
            skip={0, "bot", "top"})


def storefront(p):
    x0, x1, z0, z1 = SF_X0, SF_X1, AP_H, SF_Z1
    yb, a = YF - REC, AL
    reveal(p, x0, x1, z0, z1, sill=False)
    p.face([(x0, yb, z0), (x1, yb, z0), (x1, YF, z0), (x0, YF, z0)], "OfficeConcrete", Z_)
    # pilasters: front + outer side; the inner side continues the reveal out to the face
    for xa, xb, s in ((x0 - PIL_W, x0, -1), (x1, x1 + PIL_W, 1)):
        box(p, (xa, YF, z0), (xb, YF + PIL_OUT, CAN_Z0), "OfficeAccent", skip={0, "bot", "top"})
    # the glass plane: door leaf (stiles + rails), sidelight with a kick panel, transom
    gx0, gx1 = x0 + a, DOOR_X1
    sx0 = DOOR_X1 + a

    def glass_at(q):
        if q.z > TRANSOM_Z:
            return "OfficeGlass"
        if q.x < DOOR_X1:
            inside = gx0 + STILE < q.x < gx1 - STILE and z0 + RAIL_B < q.z < TRANSOM_Z - RAIL_T
            return "OfficeGlass" if inside else "OfficeMetal"
        return "OfficeGlass" if q.z > z0 + RAIL_B else "OfficeMetal"
    us = [x0, gx0, gx0 + STILE, gx1 - STILE, gx1, sx0, x1]
    zs = [z0, z0 + RAIL_B, TRANSOM_Z - RAIL_T, TRANSOM_Z, z1]
    wall(p, (0, yb, 0), Y_, [-u for u in us[::-1]], zs, glass_at)
    al_frame(p, x0, x1, z0, z1, bars=(TRANSOM_Z,), posts=(DOOR_X1 + a / 2,), bottom=False)
    # push bar across the door glass
    box(p, (gx0 + 0.10, yb + 0.03, BAR_Z - 0.02), (gx1 - 0.10, yb + 0.07, BAR_Z + 0.02),
        "OfficeMetal", skip={0})


def front_window(p, x0, x1, open_frac):
    z0, z1 = WIN_Z
    yb = YF - REC
    reveal(p, x0, x1, z0, z1)
    zb = z0 + (z1 - z0) * open_frac         # blind bottom; below it, the dark room
    if open_frac > 0:
        p.face([(x0, yb, z0), (x1, yb, z0), (x1, yb, zb), (x0, yb, zb)], "OfficeGlass", Y_)
    grooves(p, Vector((0, yb, 0)), -X_, Y_, -x0, -x1, zb, z1, BLIND_P, BLIND_D, "OfficeTrim")
    w = (x1 - x0) / (WIN_MULL + 1)
    al_frame(p, x0, x1, z0, z1, posts=[x0 + w * k for k in range(1, WIN_MULL + 1)])
    box(p, (x0 - 0.05, YF, z0 - SILL_H), (x1 + 0.05, YF + SILL_OUT, z0), "OfficeTrim", skip={0})


def proud_window(p, O, N, w, open_frac=0.0):
    """A window on a sealed wall (the store's / RV's trick): a trim ring and a blinds panel
    standing proud, no hole behind.  O = wall-plane point at the window centre (z ignored)."""
    z0, z1 = WIN_Z
    fw, ft = PROUD_FW, PROUD_FT
    A = Z_.cross(N)
    O = Vector((O[0], O[1], 0))
    P = lambda u, z, d: O + A * u + Z_ * z + N * d
    u0, u1 = -w / 2, w / 2
    outer = [(u0 - fw, z0 - fw), (u1 + fw, z0 - fw), (u1 + fw, z1 + fw), (u0 - fw, z1 + fw)]
    inner = [(u0, z0), (u1, z0), (u1, z1), (u0, z1)]
    for i in range(4):
        a, b = outer[i], outer[(i + 1) % 4]
        c, d = inner[(i + 1) % 4], inner[i]
        p.face([P(*a, ft), P(*b, ft), P(*c, ft), P(*d, ft)], "OfficeMetal", N)
        mid = P((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0) - P(0, (z0 + z1) / 2, 0)
        p.face([P(*a, 0), P(*b, 0), P(*b, ft), P(*a, ft)], "OfficeMetal", mid)
        p.face([P(*d, 0.01), P(*c, 0.01), P(*c, ft), P(*d, ft)], "OfficeMetal", -mid)
    zb = z0 + (z1 - z0) * open_frac         # blind bottom; below it, the dark room
    if open_frac > 0:
        p.face([P(u0, z0, 0.01), P(u1, z0, 0.01), P(u1, zb, 0.01), P(u0, zb, 0.01)], "OfficeGlass", N)
    grooves(p, O + N * (0.01 + BLIND_D), A, N, u0, u1, zb, z1, BLIND_P, BLIND_D, "OfficeTrim")
    m = AL / 2                              # centre mullion: front and two sides
    p.face([P(-m, z0, ft), P(m, z0, ft), P(m, z1, ft), P(-m, z1, ft)], "OfficeMetal", N)
    for s in (-1, 1):
        d0 = 0.01 + BLIND_D                 # from the blind peaks: the blind runs on behind it
        p.face([P(s * m, z0, d0), P(s * m, z1, d0), P(s * m, z1, ft), P(s * m, z0, ft)],
               "OfficeMetal", A * s)
    # sill under it
    lo = P(u0 - fw - 0.04, z0 - fw - SILL_H, 0)
    hi = P(u1 + fw + 0.04, z0 - fw, SILL_OUT)
    box(p, tuple(min(lo[i], hi[i]) for i in range(3)), tuple(max(lo[i], hi[i]) for i in range(3)),
        "OfficeTrim", skip={back_side(N)})


def openings(p):
    storefront(p)
    a, b = WIN_X
    front_window(p, -b, -a, OPEN_FRAC[0])
    front_window(p, a, b, OPEN_FRAC[1])
    for sx, o in zip((1, -1), SIDE_OPEN):
        proud_window(p, (sx * HX, 0), X_ * sx, SIDE_WIN_W, o)
    for x, o in zip(BACK_WIN_X, BACK_OPEN):
        proud_window(p, (x, -D / 2), -Y_, SIDE_WIN_W, o)


# ---------------------------------------------------------------------------
# Stoop, canopy, roof gear, downspouts
# ---------------------------------------------------------------------------
def stoop_and_canopy(p):
    box(p, (-AP_HW, YF, 0), (AP_HW, YF + AP_D, AP_H), "OfficeConcrete", skip={0, "bot"})
    box(p, (-CAN_HW, YF, CAN_Z0), (CAN_HW, YF + CAN_D, CAN_Z0 + CAN_T), "OfficeAccent", skip={0})
    for sx in (1, -1):
        tube(p, (sx * (CAN_HW - 0.12), YF + CAN_D - 0.06, CAN_Z0 + CAN_T),
             (sx * (CAN_HW - 0.12), YF + BAND_OUT, ROD_Z), ROD_R, "OfficeMetal")


def roof_gear(p):
    (cx, cy), (sx, sy, sz) = HV_C, HV_S
    x0, x1, y0, y1 = cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2
    z0, z1 = DECK, DECK + sz
    box(p, (x0, y0, z0), (x1, y1, z1), "OfficeMetal", skip={0, 2, "bot"})
    for N, y in ((Y_, y1), (-Y_, y0)):       # louvred long faces
        A = Z_.cross(N)
        O = Vector((cx, y, 0))
        u0, u1 = sorted(((x0 - cx) * A.x, (x1 - cx) * A.x))
        gz0, gz1 = z0 + 0.12, z1 - 0.10
        for za, zb in ((z0, gz0), (gz1, z1)):
            p.face([O + A * u0 + Z_ * za, O + A * u1 + Z_ * za, O + A * u1 + Z_ * zb,
                    O + A * u0 + Z_ * zb], "OfficeMetal", N)
        grooves(p, O, A, N, u0, u1, gz0, gz1, (gz1 - gz0) / HV_GROOVES, HV_GD, "OfficeMetal")
    # fan shroud on top, dark inside
    ring = [(cx + FAN_R * math.cos(2 * math.pi * k / 8 + math.pi / 8),
             cy + FAN_R * math.sin(2 * math.pi * k / 8 + math.pi / 8)) for k in range(8)]
    solid(p, [(x, y, z1) for x, y in ring], [(x, y, z1 + FAN_H) for x, y in ring], "OfficeMetal",
          skip={"bot", "top"})
    p.face([(x, y, z1 + FAN_H) for x, y in ring], "OfficeGlass", Z_)
    # vent stack
    tube(p, (STACK_C[0], STACK_C[1], DECK), (STACK_C[0], STACK_C[1], DECK + STACK_H), STACK_R,
         "OfficeMetal", sides=6, caps=(False, True))


def downspouts(p):
    for sx in (1, -1):
        x = sx * (HX + DS_OFF)
        # scupper box through the band, then the pipe, then a kick-out shoe
        xa, xb = sorted((sx * (HX + BAND_OUT), sx * (HX + DS_OFF + DS_R + 0.02)))
        box(p, (xa, DS_Y - 0.11, PAR - 0.42), (xb, DS_Y + 0.11, PAR - 0.22), "OfficeAccent",
            skip={1 if sx < 0 else 3})
        pipe(p, [(x, DS_Y, PAR - 0.42), (x, DS_Y, 0.30), (x + sx * 0.28, DS_Y, 0.06)], DS_R,
             "OfficeAccent", cap_end=True)


# ---------------------------------------------------------------------------
# Sign board
# ---------------------------------------------------------------------------
def sign_uv(x, z):
    """Board metres -> image.  u runs along -X: the board faces +Y, so the viewer's right is -X
    (check_uv_handedness proves it).  z is relative to the board centre."""
    return (0.5 - x / (2 * SIGN_HW), 0.5 + z / (2 * SIGN_HH))


def sign(p):
    yb = YF + BAND_OUT
    yf = yb + SIGN_T
    hw, hh, zc = SIGN_HW, SIGN_HH, SIGN_ZC
    corners = [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)]
    p.face([(x, yf, zc + z) for x, z in corners], "OfficeSign", Y_,
           [sign_uv(x, z) for x, z in corners])
    for i in range(4):
        (ax, az), (bx, bz) = corners[i], corners[(i + 1) % 4]
        out = Vector((bz - az, 0, -(bx - ax)))
        p.face([(ax, yb, zc + az), (bx, yb, zc + bz), (bx, yf, zc + bz), (ax, yf, zc + az)],
               "OfficeSign", out)


def build_part():
    p = Part("Office")
    walls(p)
    brick(p)
    band(p)
    parapet_and_deck(p)
    openings(p)
    stoop_and_canopy(p)
    roof_gear(p)
    downspouts(p)
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
    # Scene units ARE board metres, viewed as the reader sees the board: +x = the reader's right.
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

    def rect(hw, hh, col):
        me = bpy.data.meshes.new("a")
        zz = z()
        me.from_pydata([(-hw, -hh, zz), (hw, -hh, zz), (hw, hh, zz), (-hw, hh, zz)], [], [[0, 1, 2, 3]])
        o = bpy.data.objects.new("a", me)
        m = _emission("a", INK[col])
        mats.append(m)
        me.materials.append(m)
        sc.collection.objects.link(o)
        junk.append(o)

    def text(body, w, h, col):
        cu = bpy.data.curves.new("t", type='FONT')
        cu.body = body
        cu.space_character = SIGN_SPACING
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
        o.location = (-k * (max(xs) + min(xs)) / 2, -k * (max(ys) + min(ys)) / 2, z())

    hw, hh = SIGN_HW, SIGN_HH
    rect(hw, hh, "navy")                       # border (also the board's edges, EDGE_UV)
    rect(hw - 0.06, hh - 0.06, "cream")
    rect(hw - 0.11, hh - 0.11, "line")
    rect(hw - 0.125, hh - 0.125, "cream")
    text(SIGN_TEXT, SIGN_TW, SIGN_TH, "navy")

    path = os.path.join(bpy.app.tempdir, "office-sign.png")
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True, scene=sc.name)   # no window swap: runs under blender -b too
    img = bpy.data.images.load(path, check_existing=False)
    img.name = "OfficeSign"
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
    """Ray-cast from a ring of eyes at the model; every first hit must face back at the ray."""
    from mathutils.bvhtree import BVHTree
    tree = BVHTree.FromObject(ob, bpy.context.evaluated_depsgraph_get())
    bad = hits = 0
    targets = [Vector((x, y, z)) for x in (-4, -1.5, 0, 1.5, 4) for y in (-2, 0, 2, 3)
               for z in (0.4, 1.5, 2.5, 3.6, 4.2)]
    eyes = [Vector((math.cos(a) * 25, math.sin(a) * 25, h))
            for a in [2 * math.pi * k / n + 0.0137 for k in range(n)] for h in (1.5, 5, 18)]
    # (+0.0137 rad: the model is symmetric and so is the eye ring, so without the offset some
    # rays land exactly on a shared edge and report whichever face the BVH returns first)
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
    out, clipper = ccw(a), ccw(b)
    for c0, c1 in zip(clipper, clipper[1:] + clipper[:1]):
        inside = lambda p: (c1[0] - c0[0]) * (p[1] - c0[1]) - (c1[1] - c0[1]) * (p[0] - c0[0]) > 1e-9
        src, out = out, []
        for p, q in zip(src, src[1:] + src[:1]):
            if inside(q):
                if not inside(p):
                    out.append(_x(p, q, c0, c1))
                out.append(q)
            elif inside(p):
                out.append(_x(p, q, c0, c1))
        if len(out) < 3:
            return 0.0
    return area(out)


def _x(p, q, a, b):
    """Intersection of segment pq with the line ab."""
    d1 = (q[0] - p[0], q[1] - p[1])
    d2 = (b[0] - a[0], b[1] - a[1])
    den = d1[0] * d2[1] - d1[1] * d2[0]
    t = ((a[0] - p[0]) * d2[1] - (a[1] - p[1]) * d2[0]) / den
    return (p[0] + d1[0] * t, p[1] + d1[1] * t)


def check_zfight(ob, gap=1e-3):
    """Same-facing faces within `gap` of one plane that overlap with area: those z-fight
    under engine lighting.  Exact for convex faces (every face here is convex)."""
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
    sign_idx = [i for i, m in enumerate(me.materials) if m.name.startswith("OfficeSign")]
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
    print(f"  Office  {t} tris (budget {TRI_BUDGET})  materials {len(ob.data.materials)}"
          f"  images {sum(i.type == 'IMAGE' for i in bpy.data.images)}")
    for k, v in sorted(tris_by_material(ob).items(), key=lambda kv: -kv[1]):
        print(f"     {k:<16}{v:5d}")
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
