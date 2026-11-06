"""
ASSET-80 — the BURGER JOINT.  Parametric generator.

Built for: Blender 5.2  |  PROMOTED 2026-11-05 (owner) from wip/ to assets/models/ + assets/models/src/.
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

The foodVendor POI, where the player is fired (opening.md § The firing): a roadside walk-up burger
stand, not a chain.  A cream box on a dark skirt with a red belt line, a red fascia with a yellow
pinstripe, a wide open service window under a red-and-cream striped awning, a stainless counter, a
backlit menu board, and a round rooftop sign carrying a burger built as GEOMETRY (no name — the name
rolls per seed from data/offer-names.js).  Through the window: a griddle line under a steel hood, the
back wall steel-clad.  The fluorescent light is the menu lightbox, the tube under the awning and the hood
light (BurgerLight, the one emissive material).

    BurgerJoint   one mesh, 8 materials, 0 images

AXES.  Blender +Y = glTF -Z = forward = the ROAD face (window, menu, sign).  Width runs along X =
along the road.  Base-seated (z = 0), centred on the WALL footprint; the awning and counter reach
past it toward the road, the sign and roof gear stand on top.

THE TRUCK'S STRIP (FEAT-147).  The opening seats the truck on this pad at pad-local z = -2.8
(main.js JOINT_SEAT_M), footprint x +-2.6 x z -3.7..-1.9.  The registry's `seat` slides the model
SEAT metres away from the road, so pad z = SEAT - (Blender y).  strip_check() proves every vertex
stays behind z = -1.9 and inside the 14 x 8 pad.

WINDING.  Every face goes through face(), which takes the direction the face must point and flips
the polygon to suit (the general-store / barn pattern).  check_facing() proves it by ray cast.

Headless (never the owner's GUI Blender):
    /Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 \\
        --python assets/models/src/burger-joint.py -- export render
`export` writes the .glb and saves the .blend (model only); `render` then adds the pad, the road
and the seated truck and writes the review renders to RENDER_DIR (under wip/, git-invisible).

NOTHING IS STACKED.  Every decal (menu lettering, sign rings, door window, griddle plate, hood light)
is cut into its backing plane by tile()/annulus(); a face a few mm over another z-fights at range
(owner review 2026-11-05: the menu flickered from far away).
"""

import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector, Matrix

# ---------------------------------------------------------------------------
# PARAMETERS
# ---------------------------------------------------------------------------
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))   # this checkout
NAME = "burger-joint"
OUT_DIR = f"{REPO}/assets/models"
OUT_BLEND = f"{OUT_DIR}/src/{NAME}.blend"
RENDER_DIR = f"{REPO}/wip/{NAME}/out"
TRI_BUDGET = 1200
RANGER_GLB = f"{REPO}/assets/models/ranger.glb"   # render scenery only, never exported

# --- the lay-by (pad frame: x along the road, z = SEAT - y, -z = road side) ---
SEAT = 1.95                 # registry `seat`: the back fascia 0.30 m inside the pad's back edge
PAD_HX, PAD_HZ = 7.0, 4.0   # the 14 x 8 lay-by, half extents
STRIP_HX, STRIP_Z = 2.6, (-3.7, -1.9)   # the truck's parking strip (FEAT-147)
TRUCK_PAD_Z = -2.8          # main.js JOINT_SEAT_M

# --- envelope ---
W, D = 7.0, 3.4             # wall footprint: along the road (X), depth (Y)
YF = D / 2                  # front wall plane
SKIRT_H, SKIRT_OUT = 0.35, 0.03
BELT_Z, BELT_OUT = (0.55, 0.68), 0.02
FASCIA_Z, FASCIA_OUT = (2.75, 3.20), 0.05
PIN_Z, PIN_OUT = (2.83, 2.90), 0.015     # yellow pinstripe, proud of the fascia
ROOF_Z = FASCIA_Z[1]        # parapet top (the steel coping)
PARAPET_T = 0.10            # parapet thickness inside the wall plane
ROOF_DECK = ROOF_Z - 0.15   # the flat roof, sunk behind the parapet: the firing camera looks down on it

# --- service window + counter ---
WIN_X = (-2.9, 0.5)
WIN_Z = (1.04, 2.30)        # sill = the counter top
REC = 0.12                  # wall thickness shown at the opening
TRIM_W, TRIM_T = 0.08, 0.03
MULL_W = 0.06
LEDGE_D, LEDGE_T = 0.38, 0.06
BRACKET = (0.30, 0.24)      # gusset reach out, drop down

# --- what the window shows ---
ROOM_X = (-3.2, 0.8)
ROOM_Y0 = 0.15              # back wall of the kitchen line
ROOM_TOP = 2.65
COUNTER_Y0 = 1.15           # inner counter depth
GRIDDLE_Y1, GRIDDLE_Z = 0.80, 0.92
HOOD = [(ROOM_Y0, 1.88), (0.95, 1.88), (0.95, 2.05), (0.55, 2.45), (ROOM_Y0, 2.45)]  # (y, z) profile

# --- awning ---
AW_X = (-3.2, 0.8)
AW_ROOT_Z, AW_OUT, AW_DROP = 2.62, 0.95, 0.37
AW_T = 0.02
STRIPES = 11                # odd: red at both ends
VAL = (0.14, 0.22)          # valance flap: side depth, point depth

# --- menu lightbox (right of the window) ---
MENU_X, MENU_Z, MENU_T = (1.10, 2.80), (1.15, 2.40), 0.06
MENU_ROWS = 5
MENU_W = ((0.44, 0.36, 0.48, 0.30, 0.40), (0.38, 0.46, 0.32, 0.42, 0.28))   # text-bar widths per column

# --- side door (+X wall) ---
DOOR_Y, DOOR_Z = (-1.25, -0.35), (SKIRT_H, 2.40)
DOOR_FW, DOOR_FT = 0.07, 0.04

# --- roof gear ---
AC = ((1.5, 2.6), (-1.35, -0.45), 0.60)
STACK = ((-1.55, -1.20), (0.30, 0.65), 0.85)

# --- the sign ---
SIGN_ZC, SIGN_R, SIGN_SEG = 4.95, 1.25, 24
SIGN_Y = (1.16, 1.30)       # board back, front
SIGN_RING_R = 1.13          # yellow ring inside the red rim
SIGN_FACE_R = 1.04          # cream disk inside the yellow ring
POST_X, POST_W = 0.55, 0.10

MATS = {
    #  name            base colour (linear)        rough  emissive
    "BurgerWall":   ((0.700, 0.660, 0.550), 0.90, None),   # walls, awning stripes, sign face, seeds
    "BurgerRed":    ((0.430, 0.032, 0.022), 0.70, None),   # belt, fascia, awning stripes, door, sign rim
    "BurgerYellow": ((0.800, 0.480, 0.030), 0.70, None),   # pinstripe, cheese
    "BurgerDark":   ((0.040, 0.026, 0.018), 0.85, None),   # skirt, roof, patty, griddle, menu text
    "BurgerSteel":  ((0.380, 0.390, 0.400), 0.45, None),   # counter, trim, hood, fixtures, posts, roof gear
    "BurgerBun":    ((0.560, 0.230, 0.050), 0.75, None),
    "BurgerGreen":  ((0.110, 0.380, 0.030), 0.80, None),   # lettuce
    "BurgerLight":  ((0.600, 0.660, 0.640), 0.50, (0.700, 0.770, 0.750)),   # the fluorescents
}

X_, Y_, Z_ = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))


# ---------------------------------------------------------------------------
# Geometry accumulator
# ---------------------------------------------------------------------------
class Part:
    def __init__(self, name):
        self.name, self.v, self.f, self.m = name, [], [], []

    def face(self, pts, mat, out):
        """One polygon, wound so its normal points along `out`."""
        pts = [Vector(p) for p in pts]
        n = Vector()
        for i, a in enumerate(pts):          # Newell normal: robust for any planar polygon
            b = pts[(i + 1) % len(pts)]
            n += Vector(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x),
                         (a.x - b.x) * (a.y + b.y)))
        if n.dot(Vector(out)) < 0:
            pts.reverse()
        o = len(self.v)
        self.v.extend(tuple(p) for p in pts)
        self.f.append(list(range(o, o + len(pts))))
        self.m.append(mat)


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


def ring(p, hx, hy, z0, z1, out, mat, top=True, bot=True):
    """A band standing `out` proud of the rectangle +-hx x +-hy, from z0 to z1, all four sides."""
    ix, iy, ox, oy = hx, hy, hx + out, hy + out
    corners = [(-ox, -oy), (ox, -oy), (ox, oy), (-ox, oy)]
    inner = [(-ix, -iy), (ix, -iy), (ix, iy), (-ix, iy)]
    for i in range(4):
        (ax, ay), (bx, by) = corners[i], corners[(i + 1) % 4]
        mid = Vector(((ax + bx) / 2, (ay + by) / 2, 0))
        p.face([(ax, ay, z0), (bx, by, z0), (bx, by, z1), (ax, ay, z1)], mat, mid)
        (cx, cy), (dx, dy) = inner[(i + 1) % 4], inner[i]
        for z, s, on in ((z1, 1, top), (z0, -1, bot)):
            if on:
                p.face([(ax, ay, z), (bx, by, z), (cx, cy, z), (dx, dy, z)], mat, Z_ * s)


def poly_area(pts):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:] + pts[:1])) / 2


def relief(p, pts, y0, y1, mat, cx=0.0, cz=0.0):
    """A flat (x, z) outline extruded from the plane y0 out to y1 (+Y): front face + side walls, no
    back (it sits on whatever is at y0).  Works for concave outlines."""
    ccw = poly_area(pts) > 0
    P = lambda x, z, y: (cx + x, y, cz + z)
    p.face([P(x, z, y1) for x, z in pts], mat, Y_)
    for (ax, az), (bx, bz) in zip(pts, pts[1:] + pts[:1]):
        dx, dz = bx - ax, bz - az
        out = Vector((dz, 0, -dx)) if ccw else Vector((-dz, 0, dx))
        p.face([P(ax, az, y0), P(bx, bz, y0), P(bx, bz, y1), P(ax, az, y1)], mat, out)


def ngon(r, n, cx=0.0, cz=0.0, a0=math.pi / 2):
    return [(cx + r * math.cos(a0 + 2 * math.pi * k / n), cz + r * math.sin(a0 + 2 * math.pi * k / n))
            for k in range(n)]


def rrect(x0, x1, z0, z1, rb, rt, seg):
    """Rounded rectangle, CCW in (x, z): bottom corners radius rb, top corners rt."""
    pts = []
    for (cx, cz, r, a0) in ((x1 - rb, z0 + rb, rb, -math.pi / 2), (x1 - rt, z1 - rt, rt, 0.0),
                            (x0 + rt, z1 - rt, rt, math.pi / 2), (x0 + rb, z0 + rb, rb, math.pi)):
        for k in range(seg + 1):
            a = a0 + (math.pi / 2) * k / seg
            pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return pts


def tile(p, rects, P, out):
    """Coplanar rectangles (u0, u1, v0, v1, mat), later ones on top, cut into non-overlapping quads
    in ONE plane.  A decal stacked a few mm over its backing z-fights at range (0.1 m near plane:
    2 mm fights past ~60 m), so nothing on this model is stacked.  Cells greedy-merged along rows and
    along columns, whichever gives fewer quads."""
    sw = lambda rs: [(v0, v1, u0, u1, m) for u0, u1, v0, v1, m in rs]
    for u0, u1, v0, v1, m in min(_greedy(rects), sw(_greedy(sw(rects))), key=len):
        p.face([P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)], m, out)


def _greedy(rects):
    us = sorted({e for r in rects for e in r[:2]})
    vs = sorted({e for r in rects for e in r[2:4]})
    grid = {}
    for i in range(len(us) - 1):
        for j in range(len(vs) - 1):
            u, v = (us[i] + us[i + 1]) / 2, (vs[j] + vs[j + 1]) / 2
            hit = [m for u0, u1, v0, v1, m in rects if u0 < u < u1 and v0 < v < v1]
            grid[i, j] = hit[-1] if hit else None
    quads = []
    for j in range(len(vs) - 1):
        for i in range(len(us) - 1):
            m = grid[i, j]
            if m is None:
                continue
            i1, j1 = i, j
            while grid.get((i1 + 1, j)) == m:
                i1 += 1
            while all(grid.get((k, j1 + 1)) == m for k in range(i, i1 + 1)):
                j1 += 1
            for k in range(i, i1 + 1):
                for l in range(j, j1 + 1):
                    grid[k, l] = None
            quads.append((us[i], us[i1 + 1], vs[j], vs[j1 + 1], m))
    return quads


def annulus(p, r0, r1, n, P, mat, out):
    """The flat ring between two matching n-gons -- the round counterpart of tile()."""
    a, b = ngon(r0, n), ngon(r1, n)
    for k in range(n):
        p.face([P(*a[k]), P(*a[(k + 1) % n]), P(*b[(k + 1) % n]), P(*b[k])], mat, out)


# ---------------------------------------------------------------------------
# Body
# ---------------------------------------------------------------------------
def walls(p):
    hx, hy = W / 2, D / 2
    z0, z1 = SKIRT_H, FASCIA_Z[0]
    for sx in (1, -1):
        p.face([(sx * hx, -hy, z0), (sx * hx, hy, z0), (sx * hx, hy, z1), (sx * hx, -hy, z1)],
               "BurgerWall", X_ * sx)
    p.face([(-hx, -hy, z0), (hx, -hy, z0), (hx, -hy, z1), (-hx, -hy, z1)], "BurgerWall", -Y_)
    (wa, wb), (wz0, wz1) = WIN_X, WIN_Z
    for xa, xb, za, zb in ((-hx, wa, z0, z1), (wb, hx, z0, z1), (wa, wb, z0, wz0), (wa, wb, wz1, z1)):
        p.face([(xa, YF, za), (xb, YF, za), (xb, YF, zb), (xa, YF, zb)], "BurgerWall", Y_)
    ring(p, hx, hy, 0.0, SKIRT_H, SKIRT_OUT, "BurgerDark", bot=False)
    ring(p, hx, hy, *BELT_Z, BELT_OUT, "BurgerRed")
    ring(p, hx, hy, *FASCIA_Z, FASCIA_OUT, "BurgerRed", top=False)
    ring(p, hx + FASCIA_OUT, hy + FASCIA_OUT, *PIN_Z, PIN_OUT, "BurgerYellow")
    # parapet: steel coping over the fascia + the wall, inner faces down to the sunk deck
    ox, oy, ix, iy = hx + FASCIA_OUT, hy + FASCIA_OUT, hx - PARAPET_T, hy - PARAPET_T
    outer = [(-ox, -oy), (ox, -oy), (ox, oy), (-ox, oy)]
    inner = [(-ix, -iy), (ix, -iy), (ix, iy), (-ix, iy)]
    for i in range(4):
        (ax, ay), (bx, by) = outer[i], outer[(i + 1) % 4]
        (cx, cy), (dx, dy) = inner[(i + 1) % 4], inner[i]
        p.face([(ax, ay, ROOF_Z), (bx, by, ROOF_Z), (cx, cy, ROOF_Z), (dx, dy, ROOF_Z)], "BurgerSteel", Z_)
        mid = Vector(((cx + dx) / 2, (cy + dy) / 2, 0))
        p.face([(dx, dy, ROOF_DECK), (cx, cy, ROOF_DECK), (cx, cy, ROOF_Z), (dx, dy, ROOF_Z)], "BurgerRed", -mid)
    p.face([(-ix, -iy, ROOF_DECK), (ix, -iy, ROOF_DECK), (ix, iy, ROOF_DECK), (-ix, iy, ROOF_DECK)],
           "BurgerDark", Z_)
    # two downspouts off the back corners, a kick-out shoe at the foot
    for sx in (-1, 1):
        x0, x1 = sx * (hx - 0.30), sx * (hx - 0.20)
        x0, x1 = min(x0, x1), max(x0, x1)
        y0, y1 = -hy - 0.12, -hy - 0.02
        box(p, (x0, y0, 0.18), (x1, y1, FASCIA_Z[0]), "BurgerSteel", skip={2, "bot"})
        solid(p, [(x0, y0, 0.18), (x1, y0, 0.18), (x1, y1, 0.18), (x0, y1, 0.18)],
              [(x0 + sx * 0.16, y0, 0.04), (x1 + sx * 0.16, y0, 0.04), (x1 + sx * 0.16, y1, 0.04),
               (x0 + sx * 0.16, y1, 0.04)],   # kicked out sideways: the pad's back edge is a cut bank
              "BurgerSteel", skip={"bot"})


def wall_gear(p):
    """The two side walls' service kit: a kitchen extract fan on -X, the electric meter on +X."""
    hx = W / 2
    # extract fan: a steel box on the -X wall, its face a stack of louvre V-grooves
    (y0, y1), (z0, z1), d = (-0.30, 0.30), (1.85, 2.45), 0.22
    box(p, (-hx - d, y0, z0), (-hx, y1, z1), "BurgerSteel", skip={1, 3})
    n = 4
    for k in range(n):
        za, zb = z0 + (z1 - z0) * k / n, z0 + (z1 - z0) * (k + 1) / n
        zm = (za + zb) / 2
        for zl, zh, dl, dh in ((za, zm, 0.0, -0.04), (zm, zb, -0.04, 0.0)):
            p.face([(-hx - d - dl, y0, zl), (-hx - d - dl, y1, zl), (-hx - d - dh, y1, zh),
                    (-hx - d - dh, y0, zh)], "BurgerDark" if dl < dh else "BurgerSteel", -X_)
        for y, s in ((y0 + 0.01, 1), (y1 - 0.01, -1)):   # the groove's end walls, 1 cm thick: a cap
            # in the box side's own plane, facing the other way, is a coplanar pair (ray ties)
            p.face([(-hx - d, y, za), (-hx - d + 0.04, y, zm), (-hx - d, y, zb)], "BurgerSteel", Y_ * s)
    # meter: a box on the +X wall by the door, a conduit up into the fascia
    box(p, (hx, 0.35, 1.30), (hx + 0.14, 0.62, 1.68), "BurgerSteel", skip={3})
    box(p, (hx, 0.455, 1.68), (hx + 0.05, 0.515, FASCIA_Z[0]), "BurgerSteel", skip={3, "bot", "top"})


def counter_gear(p):
    """On the ledge, right of centre: ketchup, mustard, a napkin box."""
    z = WIN_Z[0]
    for x, col in ((-0.20, "BurgerRed"), (-0.08, "BurgerYellow")):
        y = YF + 0.20
        body = [(x + 0.035 * math.cos(a), y + 0.035 * math.sin(a)) for a in
                [2 * math.pi * k / 6 for k in range(6)]]
        solid(p, [(bx, by, z) for bx, by in body], [(bx, by, z + 0.17) for bx, by in body], col,
              skip={"bot", "top"})
        tip = Vector((x, y, z + 0.25))
        for (ax, ay), (bx, by) in zip(body, body[1:] + body[:1]):
            p.face([(ax, ay, z + 0.17), (bx, by, z + 0.17), tip], col,
                   Vector(((ax + bx) / 2 - x, (ay + by) / 2 - y, 0.3)))
    box(p, (0.10, YF + 0.10, z), (0.26, YF + 0.22, z + 0.15), "BurgerSteel", skip={"bot"})


def service_window(p):
    (x0, x1), (z0, z1) = WIN_X, WIN_Z
    yb, yf, fw = YF - REC, YF + TRIM_T, TRIM_W
    # reveals, merged with the trim's inner faces; the counter is the sill
    p.face([(x0, yb, z0), (x0, yf, z0), (x0, yf, z1), (x0, yb, z1)], "BurgerWall", X_)
    p.face([(x1, yb, z0), (x1, yf, z0), (x1, yf, z1), (x1, yb, z1)], "BurgerWall", -X_)
    p.face([(x0, yb, z1), (x1, yb, z1), (x1, yf, z1), (x0, yf, z1)], "BurgerWall", -Z_)
    # steel trim: two posts on the counter + a header, backs on the wall not built
    box(p, (x0 - fw, YF, z0), (x0, yf, z1 + fw), "BurgerSteel", skip={0, 1, "bot"})
    box(p, (x1, YF, z0), (x1 + fw, yf, z1 + fw), "BurgerSteel", skip={0, 3, "bot"})
    box(p, (x0, YF, z1), (x1, yf, z1 + fw), "BurgerSteel", skip={0, 1, 3, "bot"})
    # two mullions: the sliding sashes' frames, slid open
    for k in (1, 2):
        c = x0 + (x1 - x0) * k / 3
        box(p, (c - MULL_W / 2, YF - 0.06, z0), (c + MULL_W / 2, YF + 0.02, z1), "BurgerSteel",
            skip={"bot", "top"})
    # the counter: the outside ledge, the inside top, and the gussets under the ledge
    box(p, (x0 - 0.10, YF, z0 - LEDGE_T), (x1 + 0.10, YF + LEDGE_D, z0), "BurgerSteel", skip={0})
    p.face([(ROOM_X[0], COUNTER_Y0, z0), (ROOM_X[1], COUNTER_Y0, z0), (ROOM_X[1], YF, z0),
            (ROOM_X[0], YF, z0)], "BurgerSteel", Z_)
    zt, (reach, drop) = z0 - LEDGE_T, BRACKET
    for x in (x0 + 0.3, (x0 + x1) / 2, x1 - 0.3):
        tri = lambda xx: [(xx, YF, zt), (xx, YF + reach, zt), (xx, YF, zt - drop)]
        solid(p, tri(x - 0.02), tri(x + 0.02), "BurgerSteel", skip={0, 2})


def kitchen(p):
    """Only what the window shows (ART-STYLE rule 7): a closed box behind the opening with the
    griddle line, a backsplash and the hood in it."""
    (rx0, rx1), y0 = ROOM_X, ROOM_Y0
    p.face([(rx0, y0, 0), (rx0, YF, 0), (rx0, YF, ROOM_TOP), (rx0, y0, ROOM_TOP)], "BurgerWall", X_)
    p.face([(rx1, y0, 0), (rx1, YF, 0), (rx1, YF, ROOM_TOP), (rx1, y0, ROOM_TOP)], "BurgerWall", -X_)
    p.face([(rx0, y0, ROOM_TOP), (rx1, y0, ROOM_TOP), (rx1, YF, ROOM_TOP), (rx0, YF, ROOM_TOP)],
           "BurgerWall", -Z_)
    p.face([(rx0, y0, 0), (rx1, y0, 0), (rx1, COUNTER_Y0, 0), (rx0, COUNTER_Y0, 0)], "BurgerDark", Z_)
    gx = (-2.8, 0.4)
    box(p, (gx[0], y0, 0), (gx[1], GRIDDLE_Y1, GRIDDLE_Z), "BurgerSteel", skip={0, "bot", "top"})
    tile(p, [(gx[0], gx[1], y0, GRIDDLE_Y1, "BurgerSteel"), (-2.5, -0.4, 0.30, 0.70, "BurgerDark")],
         lambda x, y: (x, y, GRIDDLE_Z), Z_)                                  # the griddle plate
    p.face([(rx0, y0, 0), (rx1, y0, 0), (rx1, y0, ROOM_TOP), (rx0, y0, ROOM_TOP)], "BurgerSteel", Y_)  # steel-clad
    # the hood: a (y, z) profile run along X, its back on the wall
    hx0, hx1 = -2.85, 0.45
    prof = HOOD
    c = sum((Vector((0, y, z)) for y, z in prof), Vector()) / len(prof)
    for (ya, za), (yb2, zb) in zip(prof[1:-1], prof[2:]):                    # the underside is tiled
        q = [(hx0, ya, za), (hx1, ya, za), (hx1, yb2, zb), (hx0, yb2, zb)]
        mid = Vector((0, (ya + yb2) / 2, (za + zb) / 2))
        p.face(q, "BurgerSteel", mid - c)
    for x, s in ((hx0, -1), (hx1, 1)):
        p.face([(x, y, z) for y, z in prof], "BurgerSteel", X_ * s)
    tile(p, [(hx0, hx1, prof[0][0], prof[1][0], "BurgerSteel"), (hx0, hx1, 0.40, 0.88, "BurgerLight")],
         lambda x, y: (x, y, prof[0][1]), -Z_)


def zaw(y):
    """Awning top surface height at depth y."""
    return AW_ROOT_Z - (y - YF) / AW_OUT * AW_DROP


def awning(p):
    yf = YF + AW_OUT
    zr, zf = AW_ROOT_Z, zaw(yf)
    xs = [AW_X[0] + (AW_X[1] - AW_X[0]) * k / STRIPES for k in range(STRIPES + 1)]
    up = Vector((0, AW_DROP, AW_OUT))                   # normal of the sloped sheet
    for k, (xa, xb) in enumerate(zip(xs, xs[1:])):
        m = "BurgerRed" if k % 2 == 0 else "BurgerWall"
        p.face([(xa, YF, zr), (xb, YF, zr), (xb, yf, zf), (xa, yf, zf)], m, up)
        p.face([(xa, YF, zr - AW_T), (xb, YF, zr - AW_T), (xb, yf, zf - AW_T), (xa, yf, zf - AW_T)],
               m, -up)
        xm = (xa + xb) / 2
        p.face([(xa, yf, zf), (xb, yf, zf), (xb, yf, zf - VAL[0]), (xm, yf, zf - VAL[1]),
                (xa, yf, zf - VAL[0])], m, Y_)
    # end cheeks: closed triangular slabs, wall to the valance.  They start at the TOP sheet so their
    # outer face closes the slab's end: from the sheet's underside, rays slipped into the 2 cm gap
    for x, s in ((AW_X[0], 1), (AW_X[1], -1)):
        tri = lambda xx: [(xx, YF, zr), (xx, yf - 0.015, zf), (xx, yf - 0.015, zf - VAL[0])]
        solid(p, tri(x), tri(x + s * 0.02), "BurgerRed", skip={0})
    # two arms, wall to the sheet's underside
    for x in (AW_X[0] + 0.12, AW_X[1] - 0.12):
        ya, yb2 = YF, YF + AW_OUT - 0.07
        za, zb = 1.98, zaw(yb2) - AW_T
        sq = lambda y, z: [(x - 0.015, y, z - 0.015), (x + 0.015, y, z - 0.015),
                           (x + 0.015, y, z + 0.015), (x - 0.015, y, z + 0.015)]
        solid(p, sq(ya, za), sq(yb2, zb), "BurgerSteel", skip={"bot"})
    # the fluorescent tube under the awning, over the window
    box(p, (-2.5, YF, 2.42), (0.1, YF + 0.12, 2.50), "BurgerSteel", skip={0})
    box(p, (-2.45, YF + 0.02, 2.39), (0.05, YF + 0.11, 2.42), "BurgerLight", skip={0, "top"})


def menu_board(p):
    (x0, x1), (z0, z1), t = MENU_X, MENU_Z, MENU_T
    box(p, (x0, YF, z0), (x1, YF + t, z1), "BurgerSteel", skip={0, 2})
    i = 0.06
    rects = [(x0, x1, z0, z1, "BurgerSteel"), (x0 + i, x1 - i, z0 + i, z1 - i, "BurgerLight"),
             (x0 + i, x1 - i, z1 - i - 0.20, z1 - i, "BurgerRed")]              # frame, lightbox, header
    cols = ((x0 + 0.14, (x0 + x1) / 2 - 0.06), ((x0 + x1) / 2 + 0.06, x1 - 0.14))
    zt = z1 - i - 0.32
    for c, (ca, cb) in enumerate(cols):
        for r in range(MENU_ROWS):
            zc = zt - r * 0.17
            # read from the road, +X is the reader's LEFT: the item starts at cb, its price ends at ca
            rects += [(cb - MENU_W[c][r], cb, zc - 0.025, zc + 0.025, "BurgerDark"),   # the item
                      (ca, ca + 0.10, zc - 0.025, zc + 0.025, "BurgerRed")]           # its price
    tile(p, rects, lambda x, z: (x, YF + t, z), Y_)


def side_door(p):
    hx = W / 2
    (ya, yb), (za, zb), fw, ft = DOOR_Y, DOOR_Z, DOOR_FW, DOOR_FT
    for y0, y1 in ((ya - fw, ya), (yb, yb + fw)):
        box(p, (hx, y0, za), (hx + ft, y1, zb + fw), "BurgerSteel", skip={3, "bot"})
    box(p, (hx, ya, zb), (hx + ft, yb, zb + fw), "BurgerSteel", skip={0, 2, 3, "bot"})
    d = hx + 0.025
    tile(p, [(ya, yb, za, zb, "BurgerRed"), (-0.98, -0.62, 1.55, 2.05, "BurgerDark")],
         lambda y, z: (d, y, z), X_)
    box(p, (d, -0.52, 1.00), (hx + 0.07, -0.46, 1.12), "BurgerSteel", skip={3})
    box(p, (hx + SKIRT_OUT, ya - 0.15, 0.0), (hx + 0.40, yb + 0.15, 0.30), "BurgerSteel", skip={3, "bot"})


def roof_gear(p):
    (ax0, ax1), (ay0, ay1), ah = AC
    box(p, (ax0, ay0, ROOF_DECK), (ax1, ay1, ROOF_DECK + ah), "BurgerSteel", skip={"bot"})
    # the condenser fan: a short octagonal shroud on the lid, the fan dark inside it
    fz, (fx, fy) = ROOF_DECK + ah, ((ax0 + ax1) / 2, (ay0 + ay1) / 2)
    shroud = ngon(0.34, 8, fx, fy)
    solid(p, [(x, y, fz) for x, y in shroud], [(x, y, fz + 0.08) for x, y in shroud], "BurgerSteel",
          skip={"bot", "top"})
    p.face([(x, y, fz + 0.08) for x, y in shroud], "BurgerDark", Z_)        # the fan grille, flush
    (sx0, sx1), (sy0, sy1), sh = STACK
    top = ROOF_DECK + sh
    box(p, (sx0, sy0, ROOF_DECK), (sx1, sy1, top), "BurgerSteel", skip={"bot", "top"})
    box(p, (sx0 - 0.07, sy0 - 0.07, top - 0.10), (sx1 + 0.07, sy1 + 0.07, top), "BurgerSteel", skip={"top"})
    e = 0.12
    base = [(sx0 - e, sy0 - e, top), (sx1 + e, sy0 - e, top), (sx1 + e, sy1 + e, top), (sx0 - e, sy1 + e, top)]
    apex = Vector(((sx0 + sx1) / 2, (sy0 + sy1) / 2, top + 0.20))
    for a, b in zip(base, base[1:] + base[:1]):
        mid = (Vector(a) + Vector(b)) / 2
        p.face([a, b, apex], "BurgerSteel", mid - Vector((apex.x, apex.y, top)) + Z_ * 0.3)
    p.face(base, "BurgerSteel", -Z_)


def sign(p):
    yb, yf = SIGN_Y
    zb = SIGN_ZC - SIGN_R
    for sx in (-1, 1):
        x = sx * POST_X
        # the post runs 1 cm INTO the board: its front face shows below the board and is buried above
        box(p, (x - POST_W / 2, yb - POST_W, ROOF_DECK), (x + POST_W / 2, yb + 0.01, SIGN_ZC + 0.6),
            "BurgerSteel", skip={"bot"})
    # one diagonal brace between the posts, under the board
    y0b, y1b = yb - POST_W * 0.75, yb - POST_W * 0.25
    a, b = (-POST_X + POST_W / 2, ROOF_DECK + 0.10), (POST_X - POST_W / 2, zb - 0.06)
    sq = lambda x, z: [(x, y0b, z - 0.03), (x, y1b, z - 0.03), (x, y1b, z + 0.03), (x, y0b, z + 0.03)]
    solid(p, sq(*a), sq(*b), "BurgerSteel", skip={"bot", "top"})
    rim = ngon(SIGN_R, SIGN_SEG)
    solid(p, [(x, yb, SIGN_ZC + z) for x, z in rim], [(x, yf, SIGN_ZC + z) for x, z in rim], "BurgerRed",
          skip={"top"})
    # the front in one plane: red rim, yellow ring, cream face (stacked discs z-fought at range)
    P = lambda x, z: (x, yf, SIGN_ZC + z)
    annulus(p, SIGN_R, SIGN_RING_R, SIGN_SEG, P, "BurgerRed", Y_)
    annulus(p, SIGN_RING_R, SIGN_FACE_R, SIGN_SEG, P, "BurgerYellow", Y_)
    p.face([P(x, z) for x, z in ngon(SIGN_FACE_R, SIGN_SEG)], "BurgerWall", Y_)
    burger(p, yf)


def burger(p, y0):
    """The burger, back to front in depth: each layer a relief standing out of the cream face, the
    more forward layer overlapping the one behind (bun top 9 cm > lettuce 7 > bottom bun 8 > cheese 6
    > patty 5)."""
    cz = SIGN_ZC
    dome = [(0.76 * math.cos(math.pi * k / 16), 0.10 + 0.50 * math.sin(math.pi * k / 16)) for k in range(17)]
    relief(p, dome, y0, y0 + 0.09, "BurgerBun", 0, cz)
    for x, z, a in ((-0.44, 0.30, 20), (-0.16, 0.46, -12), (0.16, 0.44, 15), (0.44, 0.30, -22), (0.0, 0.25, 5)):
        c, s = math.cos(math.radians(a)), math.sin(math.radians(a))
        q = [(x + c * u - s * v, z + s * u + c * v) for u, v in ((-0.07, 0), (0, -0.03), (0.07, 0), (0, 0.03))]
        for a, b in zip(q, q[1:] + q[:1]):          # a low pyramid on the bun, not a decal over it
            p.face([(a[0], y0 + 0.09, cz + a[1]), (b[0], y0 + 0.09, cz + b[1]), (x, y0 + 0.11, cz + z)],
                   "BurgerWall", Y_)
    n = 20
    wave =[(0.84 - 1.68 * k / n, -0.02 if k % 2 == 0 else 0.06) for k in range(n + 1)]
    lettuce = [(-0.84, 0.14), (0.84, 0.14)] + wave
    relief(p, lettuce, y0, y0 + 0.07, "BurgerGreen", 0, cz)
    # the slice: four drips of different reach and shape, uneven spacing, the right corner sagging
    cheese = [(-0.80, 0.02), (0.80, 0.02), (0.82, -0.09),
              (0.66, -0.07), (0.605, -0.13), (0.595, -0.215), (0.56, -0.255), (0.52, -0.225), (0.51, -0.12),
              (0.45, -0.065),
              (0.27, -0.07), (0.215, -0.125), (0.16, -0.065),
              (-0.05, -0.06), (-0.10, -0.12), (-0.14, -0.185), (-0.18, -0.11),
              (-0.23, -0.055),
              (-0.46, -0.06), (-0.50, -0.095), (-0.545, -0.10), (-0.58, -0.065),
              (-0.80, -0.05)]
    relief(p, cheese, y0, y0 + 0.06, "BurgerYellow", 0, cz)
    relief(p, rrect(-0.80, 0.80, -0.30, -0.04, 0.08, 0.08, 2), y0, y0 + 0.05, "BurgerDark", 0, cz)
    relief(p, rrect(-0.74, 0.74, -0.56, -0.30, 0.12, 0.03, 3), y0, y0 + 0.08, "BurgerBun", 0, cz)


def build_part():
    p = Part("BurgerJoint")
    walls(p)
    service_window(p)
    kitchen(p)
    awning(p)
    counter_gear(p)
    menu_board(p)
    side_door(p)
    wall_gear(p)
    roof_gear(p)
    sign(p)
    return p


# ---------------------------------------------------------------------------
# Blender side
# ---------------------------------------------------------------------------
def get_material(name):
    col, rough, emit = MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*col, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = 0.0
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1.0)
        b.inputs["Emission Strength"].default_value = 1.0
    m.diffuse_color = (*col, 1.0)
    m.roughness = rough
    m.use_backface_culling = True
    return m


def bake(part):
    me = bpy.data.meshes.new(part.name)
    me.from_pydata(part.v, [], part.f)
    me.update()
    used = list(dict.fromkeys(part.m))
    idx = {n: i for i, n in enumerate(used)}
    for n in used:
        me.materials.append(get_material(n))
    for i, poly in enumerate(me.polygons):
        poly.material_index = idx[part.m[i]]
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
    per = {}
    for t in m.loop_triangles:
        k = m.materials[t.material_index].name
        per[k] = per.get(k, 0) + 1
    ev.to_mesh_clear()
    return sum(per.values()), per


def check_facing(ob, n=24):
    """Ray-cast from a ring of eyes at the model; every first hit must face back at the ray."""
    from mathutils.bvhtree import BVHTree
    tree = BVHTree.FromObject(ob, bpy.context.evaluated_depsgraph_get())
    bad, hits = [], 0
    targets = [Vector((x, y, z)) for x in (-3, -1.2, 0, 2) for y in (-1.5, 0, 1.2, 2.2)
               for z in (0.5, 1.5, 2.4, 3.6, 5.0)]
    eyes = [Vector((math.cos(a) * 25, math.sin(a) * 25, h))
            for a in [2 * math.pi * k / n for k in range(n)] for h in (1.5, 5, 9, 18)]
    for e in eyes:
        for t in targets:
            d = (t - e).normalized()
            loc, nrm, i, dist = tree.ray_cast(e, d)
            if loc is None:
                continue
            hits += 1
            if nrm.dot(d) > 0:
                bad.append((loc, ob.data.materials[ob.data.polygons[i].material_index].name))
    for loc, m in bad[:8]:
        print(f"    inverted hit: {m} at ({loc.x:.2f}, {loc.y:.2f}, {loc.z:.2f})")
    return len(bad), hits


def strip_check(ob):
    """Pad frame: x along the road, z = SEAT - y.  The whole mesh must stay behind the truck's
    strip (z > -1.9 everywhere) and on the 14 x 8 pad."""
    vs = [v.co for v in ob.data.vertices]
    front = min(SEAT - v.y for v in vs)
    back = max(SEAT - v.y for v in vs)
    wide = max(abs(v.x) for v in vs)
    in_strip = sum(1 for v in vs if abs(v.x) < STRIP_HX and STRIP_Z[0] < SEAT - v.y < STRIP_Z[1])
    ok = front > STRIP_Z[1] and back < PAD_HZ and wide < PAD_HX and in_strip == 0
    return ok, front, back, wide


def fresh_scene():
    bpy.ops.wm.read_homefile(use_empty=True)
    for d in (bpy.data.materials, bpy.data.meshes, bpy.data.images):
        for x in list(d):
            d.remove(x)


def build():
    fresh_scene()
    ob = bake(build_part())
    t, per = evaluated_tris(ob)
    bad, hits = check_facing(ob)
    ok, front, back, wide = strip_check(ob)
    lo = [min(v.co[i] for v in ob.data.vertices) for i in range(3)]
    hi = [max(v.co[i] for v in ob.data.vertices) for i in range(3)]
    print("=" * 64)
    print(f"  BurgerJoint  {t} tris (budget {TRI_BUDGET}, floor ~1000)  materials {len(ob.data.materials)}"
          f"  images {len(bpy.data.images)}")
    print("  per material: " + ", ".join(f"{k} {v}" for k, v in sorted(per.items(), key=lambda kv: -kv[1])))
    print(f"  bbox  x {lo[0]:.2f}..{hi[0]:.2f}  y {lo[1]:.2f}..{hi[1]:.2f}  z {lo[2]:.2f}..{hi[2]:.2f}")
    print(f"  collision box (registry, [x, height, z]): "
          f"[{W + 2 * FASCIA_OUT:.2f}, {ROOF_Z:.2f}, {D + 2 * FASCIA_OUT:.2f}]  seat {SEAT}")
    print(f"  pad frame: nearest the road z {front:.2f} (strip ends -1.90: {front - STRIP_Z[1]:.2f} m clear), "
          f"back z {back:.2f} (pad edge {PAD_HZ}), |x| {wide:.2f} (pad {PAD_HX})  -> {'OK' if ok else 'FAIL'}")
    print(f"  facing: {bad} inverted first-hits of {hits}")
    print("=" * 64)
    return ob, ok and bad == 0


def export():
    ob, ok = build()
    bpy.ops.export_scene.gltf(
        filepath=f"{OUT_DIR}/{NAME}.glb", export_format="GLB",
        export_draco_mesh_compression_enable=False, export_yup=True,
        export_apply=True, export_materials="EXPORT", export_texcoords=False,
        export_normals=True, export_cameras=False, export_lights=False, use_selection=False)
    print(f"  wrote {OUT_DIR}/{NAME}.glb")
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    print(f"  wrote {OUT_BLEND}")
    return ok


# ---------------------------------------------------------------------------
# Review renders (scenery never reaches the .glb or the .blend)
# ---------------------------------------------------------------------------
VIEWS = {
    # name: (eye, target, vertical fov deg).  The firing orbit (main.js FIRING_CAM + camera.js FOCUS_PHI):
    # 16 m from the origin 2 m up, 0.45 rad look-down, 60 deg; theta starts 0.35 rad short of square-on.
    **{f"firing-{k}": ("orbit", th, 60) for k, th in (("start", -0.35), ("square", 0.0), ("end", 0.35))},
    "roadside": ((-9.0, 17.0, 1.4), (0.0, 0.0, 2.3), 40),
    "rear":     ((10.0, -11.0, 5.0), (0.0, 0.0, 2.0), 50),
}


def _flat(name, col, rough=0.95):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*col, 1.0)
    b.inputs["Roughness"].default_value = rough
    return m


def _plane(name, x0, x1, y0, y1, z, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], [], [[0, 1, 2, 3]])
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)


def scenery():
    sc = bpy.context.scene
    _plane("Ground", -60, 60, -60, 60, -0.03, _flat("Ground", (0.16, 0.17, 0.10)))
    _plane("Pad", -PAD_HX, PAD_HX, SEAT - PAD_HZ, SEAT + PAD_HZ, -0.005, _flat("Pad", (0.24, 0.20, 0.15)))
    ry = SEAT + PAD_HZ + 1.0
    _plane("Road", -60, 60, ry, ry + 7.0, -0.01, _flat("Road", (0.05, 0.05, 0.055), 0.8))
    # the seated truck: nose along the road, pad z -2.8 -> Blender y = SEAT + 2.8
    if os.path.exists(RANGER_GLB):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=RANGER_GLB)
        parts = [o for o in bpy.data.objects if o not in before]
        rig = bpy.data.objects.new("Truck", None)
        bpy.context.collection.objects.link(rig)
        for o in parts:
            if o.parent is None:
                o.parent = rig
        bpy.context.view_layer.update()
        pts = [o.matrix_world @ Vector(c) for o in parts if o.type == "MESH" for c in o.bound_box]
        lo = Vector([min(v[i] for v in pts) for i in range(3)])
        hi = Vector([max(v[i] for v in pts) for i in range(3)])
        length = hi.y - lo.y
        rig.location = (-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, 0.33 - lo.z)
        bpy.context.view_layer.update()
        wheel = _flat("Tire", (0.02, 0.02, 0.02), 0.9)
        for ax in (length / 2 - 0.80, length / 2 - 0.80 - 2.83):   # Ranger: ~0.8 m front overhang, 2.83 m wheelbase
            for sx in (-1, 1):
                bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.36, depth=0.24,
                                                    location=(sx * 0.74, ax, 0.36), rotation=(0, math.pi / 2, 0))
                w = bpy.context.active_object
                w.data.materials.append(wheel)
                w.parent = rig
                w.matrix_parent_inverse = rig.matrix_world.inverted()
        bpy.context.view_layer.update()
        top = rig
        top_rot = bpy.data.objects.new("TruckSeat", None)
        bpy.context.collection.objects.link(top_rot)
        top.parent = top_rot
        top_rot.rotation_euler = (0, 0, math.pi / 2)          # nose along the road (Blender X)
        top_rot.location = (0, SEAT - TRUCK_PAD_Z, 0)
    else:
        print("WARN: no ranger.glb, rendering without the truck")
    w = bpy.data.worlds.new("Sky")
    sc.world = w
    w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (0.50, 0.60, 0.72, 1)
    bg.inputs[1].default_value = 0.9
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 3.6
    sun.data.angle = math.radians(4)
    sun.data.color = (1.0, 0.94, 0.84)
    sun.rotation_euler = (math.radians(50), 0, math.radians(-150))
    sc.collection.objects.link(sun)
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = 1280, 720
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.view_settings.view_transform = "AgX"
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    return sc, cam


def render():
    sc, cam = scenery()
    out = RENDER_DIR
    os.makedirs(out, exist_ok=True)
    paths = []
    for name, (eye, target, fov) in VIEWS.items():
        if eye == "orbit":
            th, phi, r = target, 0.45, 16.0
            T = Vector((0, 0, 2.0))
            # three.js theta about the road normal -> Blender: square-on is +Y, theta>0 swings toward -X
            eye = T + r * Vector((math.cos(phi) * -math.sin(th), math.cos(phi) * math.cos(th), math.sin(phi)))
            target = T
        eye, target = Vector(eye), Vector(target)
        cam.location = eye
        cam.rotation_mode = "QUATERNION"
        cam.rotation_quaternion = (target - eye).to_track_quat("-Z", "Y")
        cam.data.sensor_fit = "VERTICAL"
        cam.data.angle_y = math.radians(fov)
        cam.data.clip_end = 400
        sc.render.filepath = f"{out}/{name}.png"
        bpy.ops.render.render(write_still=True)
        paths.append(sc.render.filepath)
        print(f"  rendered {sc.render.filepath}")
    contact_sheet(paths, f"{out}/sheet.png")


def contact_sheet(paths, dest, cols=2):
    """Stitch the renders into one image, row-major from the top (numpy ships with Blender)."""
    import numpy as np
    imgs = [bpy.data.images.load(p) for p in paths]
    w, h = imgs[0].size
    rows = -(-len(imgs) // cols)
    sheet = np.ones((rows * h, cols * w, 4), dtype=np.float32)
    for k, im in enumerate(imgs):
        px = np.empty(w * h * 4, dtype=np.float32)
        im.pixels.foreach_get(px)
        r, c = divmod(k, cols)
        y0 = (rows - 1 - r) * h                 # Blender pixel rows run bottom-up
        sheet[y0:y0 + h, c * w:(c + 1) * w] = px.reshape(h, w, 4)
    out = bpy.data.images.new("Sheet", cols * w, rows * h, alpha=True)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = dest
    out.file_format = "PNG"
    out.save()
    print(f"  sheet {dest}")


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ok = export() if "export" in args else build()[1]
    if "render" in args:
        render()
    if not ok:
        sys.exit(1)
