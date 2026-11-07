"""
ASSET-84 — the TACKLE SHOP.  Parametric generator.

Built for: Blender 5.2  |  Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

The tackleShop POI (src/poi.js), a bait-and-tackle shack.  A teal board-and-batten box on a dark skirt,
cream corner boards and casings, under a galvanised standing-seam gable roof.  The roof's front slope
runs on, flatter, over a plank porch on four posts.  A lettered board on the porch roof says BAIT &
TACKLE (generic: the shop's name rolls per seed, data/offer-names.js).  A leaping bass, built as
GEOMETRY like the burger joint's burger, stands on the ridge so the place reads as fishing from down the
road.  On the porch: a white LIVE BAIT fridge and a bench under the window.  A red canoe lies upside
down on two sawhorses off the -X end; a fish-cleaning table with two buckets stands off the +X end.

    TackleShop   one mesh, 8 materials, 1 image (the 1024 x 512 atlas: the board + the fridge label)

AXES.  Blender +Y = glTF -Z = forward = the ROAD face (porch, board, the fish's lettered side).  Width runs
along X = along the road.  Base-seated (z = 0), centred on the shack's wall footprint (x -3..3, y -1.8..1.8).
Three.js model frame = (x, z, -y): every registry number below is printed in that frame.

ON THE 14 x 8 LAY-BY, seat 3.5 (pad x = x, pad z = SEAT - y).
  - test/poi-yard.mjs: every collision-box corner within PAD_RIM_HOLD - 0.25 = 1.35 m of the pad's rounded
    outline.  The back wall stands 1.3 m past the pad's far edge.
  - The pad is flat from 1.4 m in from its road edge (pad z -2.6).  Nothing on the ground comes nearer
    the road than the porch step, at the pad centre.
  - No `park` box: the shop is an ordinary giver, so the ring stands at the pad centre, at the foot of the
    porch step (the burger joint's awning covers its centre the same way).
pad_check() proves both limits.

WINDING.  Every face goes through face(), which takes the direction the face must point and flips the
polygon to suit.  check_facing() proves it by ray cast.  NOTHING IS STACKED: decals (deck gaps, the
fridge's kick plate, the fish's belly, stripe and eye) are cut into their backing plane by tile() or stand
1.5 cm or more proud of it.

Headless (never the owner's GUI Blender):
    /Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 \\
        --python assets/models/src/tackle-shop.py -- export render
`export` writes the .glb and saves the .blend (model only); `render` then adds the pad, the road and a
parked Ranger and writes the review renders to RENDER_DIR (under wip/, git-invisible).
"""

import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector

# ---------------------------------------------------------------------------
# PARAMETERS
# ---------------------------------------------------------------------------
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))   # this checkout
NAME = "tackle-shop"
OUT_DIR = f"{REPO}/assets/models"
OUT_BLEND = f"{OUT_DIR}/src/{NAME}.blend"
RENDER_DIR = f"{REPO}/wip/{NAME}/out"
TRI_BUDGET = 1600
RANGER_GLB = f"{REPO}/assets/models/ranger.glb"   # render scenery only, never exported

# --- the lay-by (pad frame: x along the road, pad z = SEAT - y, -z = road side) ---
SEAT = 3.5                  # registry `seat`
PAD_HX, PAD_HZ, PAD_R = 7.0, 4.0, 1.5   # poi.js poiPadHalfLen / HalfWid / CornerR
FLAT_Z = -2.6               # the pad is flat from here back (1.4 m in from its road edge)
RIM = 1.6                   # road-carve.js PAD_RIM_HOLD: graded flat this far beyond the pad
RIM_KEEP = RIM - 0.25       # test/poi-yard.mjs: every collision-box corner within this of the pad
TRUCK_PAD_Z = -2.2          # the review renders' parked Ranger, nose along the road

# --- the shack ---
HX, HY = 3.0, 1.8           # wall footprint half extents
SKIRT_H, SKIRT_OUT = 0.30, 0.03
EAVE, RIDGE = 2.75, 3.85    # wall top (front / back), roof top at the ridge
RT = 0.06                   # roof sheet thickness
K1 = (RIDGE - (EAVE + RT)) / HY          # main pitch, rise per metre (30 deg)
BACK_Y = -(HY + 0.30)       # back eave overhang
PORCH_Y, PORCH_ZT = 3.35, 2.40           # the porch roof's front edge and its top there
K2 = (EAVE + RT - PORCH_ZT) / (PORCH_Y - HY)   # porch pitch (15 deg)
RX = HX + 0.25              # rake overhang
BAT_W, BAT_T, BAT_STEP = 0.05, 0.02, 0.50      # board-and-batten
CORNER = 0.12               # corner boards (square posts, 3 cm proud)
CAS_W, CAS_T = 0.08, 0.03   # opening casings
REC = 0.10                  # opening reveal depth

# --- the porch ---
DECK_Y, DECK_Z, DECK_X = (HY + SKIRT_OUT, 3.20), SKIRT_H, 3.15
POSTS_X, POST_W, POST_Y = (-3.06, -1.0, 1.0, 3.06), 0.12, 3.12
STEP = ((-2.15, -1.25), (3.20, 3.50), 0.15)
DOOR_X, DOOR_Z = (-2.15, -1.25), (SKIRT_H, 2.35)
WIN_X, WIN_Z = (-0.55, 1.55), (1.00, 2.15)
SIDE_WIN = ((-0.40, 0.40), (1.25, 1.95))        # the +X gable's window (u = y)
FRIDGE = ((1.86, 2.60), (HY + SKIRT_OUT + 0.01, 2.58), 2.00)
LABEL = ((1.92, 2.54), (1.52, 1.83))            # 0.62 x 0.31 = the atlas's 2:1 label region
BENCH = ((-0.45, 1.45), (1.90, 2.26), 0.75)

# --- the board on the porch roof (4:1 = the atlas's top half) ---
BOARD_X, BOARD_Y, BOARD_Z = (-1.8, 1.8), (3.00, 3.06), (2.46, 3.36)
TEX_W, TEX_H = 1024, 512
LABEL_PX = (448, 224)                           # the label's region, bottom-left of the atlas
SIGN_FONT = "/System/Library/Fonts/Supplemental/Arial Black.ttf"

# --- the fish on the ridge ---
FISH_X, FISH_Z, FISH_TILT = 0.15, RIDGE + 0.95, math.radians(14)
FISH_Y0, FISH_Y1 = -0.05, 0.05                  # body slab
FISH_POSTS = (-0.30, 0.70)

# --- the canoe on its sawhorses (-X end) and the cleaning table (+X end) ---
CANOE_X, CANOE_YC, CANOE_B, CANOE_H = (-7.5, -3.4), 0.90, 0.42, 0.36
HORSE_X, HORSE_Z = (-6.7, -4.2), 0.72           # sawhorse beams; the gunwales rest on them
TABLE_X, TABLE_Y, TABLE_Z = (3.55, 4.75), (0.30, 0.95), 0.90
BUCKETS = ((4.95, 0.50), (4.97, 0.92))

# --- the stovepipe on the back slope ---
PIPE = (1.9, -0.9, 0.09, 4.30)                  # x, y, radius, top

MATS = {
    #  name           base colour (linear)        rough
    "TackleWall":  ((0.025, 0.115, 0.105), 0.90),   # board-and-batten, muted teal
    "TackleTrim":  ((0.760, 0.730, 0.630), 0.75),   # corner boards, casings, posts, fridge, buckets, fish belly
    "TackleRoof":  ((0.300, 0.310, 0.320), 0.50),   # galvanised sheet, ridge cap, fish posts, the tap
    "TackleWood":  ((0.300, 0.205, 0.115), 0.90),   # deck, step, bench, board back, sawhorses, table
    "TackleDark":  ((0.030, 0.030, 0.032), 0.85),   # skirt, panes, door, deck gaps, canoe inside, stripe
    "TackleFish":  ((0.230, 0.250, 0.035), 0.70),   # the bass, olive
    "TackleRed":   ((0.430, 0.040, 0.025), 0.60),   # the canoe
    "TackleSign":  (None, 0.80),                    # the atlas
}
INK = {  # atlas colours (linear; the Standard view transform writes them through unchanged)
    "cream": MATS["TackleTrim"][0],
    "teal":  MATS["TackleWall"][0],
    "red":   MATS["TackleRed"][0],
}

X_, Y_, Z_ = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))


def zt(y):
    """The roof's top surface height at depth y."""
    if y <= 0:
        return RIDGE + K1 * y
    if y <= HY:
        return RIDGE - K1 * y
    return EAVE + RT - K2 * (y - HY)


def zu(y):
    """The roof's underside."""
    return zt(y) - RT


# ---------------------------------------------------------------------------
# Geometry accumulator (service-station.py's: burger-joint.py's plus a per-face UV for the sign)
# ---------------------------------------------------------------------------
class Part:
    def __init__(self, name):
        self.name, self.v, self.f, self.m, self.uv = name, [], [], [], []

    def face(self, pts, mat, out, uv=None):
        """One polygon, wound so its normal points along `out`.  `uv`: per-vertex, sign faces only."""
        pts = [Vector(p) for p in pts]
        uvs = list(uv) if uv else [(0.0, 0.0)] * len(pts)
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


def relief(p, pts, y0, y1, mat, back=False):
    """A flat (x, z) outline extruded from the plane y0 out to y1 (+Y): front face + side walls, and the
    back face too when `back` (a free-standing slab).  Works for concave outlines."""
    ccw = poly_area(pts) > 0
    p.face([(x, y1, z) for x, z in pts], mat, Y_)
    if back:
        p.face([(x, y0, z) for x, z in pts], mat, -Y_)
    for (ax, az), (bx, bz) in zip(pts, pts[1:] + pts[:1]):
        dx, dz = bx - ax, bz - az
        out = Vector((dz, 0, -dx)) if ccw else Vector((-dz, 0, dx))
        p.face([(ax, y0, az), (bx, y0, bz), (bx, y1, bz), (ax, y1, az)], mat, out)


def ngon(r, n, cx=0.0, cz=0.0, a0=math.pi / 2):
    return [(cx + r * math.cos(a0 + 2 * math.pi * k / n), cz + r * math.sin(a0 + 2 * math.pi * k / n))
            for k in range(n)]


def tile(p, rects, P, out):
    """Coplanar rectangles (u0, u1, v0, v1, mat), later ones on top, cut into non-overlapping quads
    in ONE plane (a mat of None is a hole).  A decal stacked a few mm over its backing z-fights at range,
    so nothing on this model is stacked.  Cells greedy-merged along rows and along columns, whichever
    gives fewer quads."""
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


# ---------------------------------------------------------------------------
# The four walls, each as a frame: world = O + U*u + N*d + Z*z (d = distance out of the wall plane)
# ---------------------------------------------------------------------------
WALLS = {
    "front": (Vector((0, HY, 0)), X_, Y_),
    "back":  (Vector((0, -HY, 0)), X_, -Y_),
    "east":  (Vector((HX, 0, 0)), Y_, X_),
    "west":  (Vector((-HX, 0, 0)), Y_, -X_),
}
HALF = {"front": HX, "back": HX, "east": HY, "west": HY}


def wtop(wall, u):
    """The wall's top at u: the eave on the long walls, the roof's underside on the gables."""
    return EAVE if wall in ("front", "back") else zu(u)


def wpt(wall, u, d, z):
    O, U, N = WALLS[wall]
    return tuple(O + U * u + N * d + Z_ * z)


def wbox(p, wall, u0, u1, d0, d1, z0, z1, mat, skip=()):
    """A box in a wall's frame.  Side order: 0 the wall side (d0), 1 u1, 2 out (d1), 3 u0."""
    ring_ = [(u0, d0), (u1, d0), (u1, d1), (u0, d1)]
    solid(p, [wpt(wall, u, d, z0) for u, d in ring_], [wpt(wall, u, d, z1) for u, d in ring_], mat, skip)


OPENINGS = {   # (u0, u1, z0, z1) per wall
    "front": [(*DOOR_X, *DOOR_Z), (*WIN_X, *WIN_Z)],
    "back": [],
    "east": [(*SIDE_WIN[0], *SIDE_WIN[1])],
    "west": [],
}


def walls(p):
    for wall, (O, U, N) in WALLS.items():
        h = HALF[wall]
        rects = [(-h, h, SKIRT_H, EAVE, "TackleWall")] + [(u0, u1, z0, z1, None) for u0, u1, z0, z1 in OPENINGS[wall]]
        tile(p, rects, lambda u, z, w=wall: wpt(w, u, 0, z), N)
        if wall in ("east", "west"):   # the gable triangle up to the roof's underside
            p.face([wpt(wall, -HY, 0, EAVE), wpt(wall, HY, 0, EAVE), wpt(wall, 0, 0, RIDGE - RT)], "TackleWall", N)
        for u0, u1, z0, z1 in OPENINGS[wall]:
            opening(p, wall, u0, u1, z0, z1, door=(wall == "front" and (u0, u1) == DOOR_X))
    ring(p, HX, HY, 0.0, SKIRT_H, SKIRT_OUT, "TackleDark", bot=False)
    # corner boards: square posts on the skirt corners, 3 cm proud each way
    for sx in (-1, 1):
        for sy in (-1, 1):
            x0, x1 = sorted((sx * (HX - CORNER + SKIRT_OUT), sx * (HX + SKIRT_OUT)))
            y0, y1 = sorted((sy * (HY - CORNER + SKIRT_OUT), sy * (HY + SKIRT_OUT)))
            box(p, (x0, y0, SKIRT_H), (x1, y1, EAVE), "TackleTrim", skip={"bot", "top"})


def battens(p):
    """Board-and-batten: a 5 cm batten every BAT_STEP, broken round the openings and their casings."""
    for wall in WALLS:
        h = HALF[wall] - CORNER
        n = int((2 * h) // BAT_STEP)
        for k in range(n + 1):
            uc = -n * BAT_STEP / 2 + k * BAT_STEP
            u0, u1 = uc - BAT_W / 2, uc + BAT_W / 2
            spans = [(SKIRT_H, None)]                        # (z0, z1 or None = the wall top)
            for a0, a1, b0, b1 in OPENINGS[wall]:
                if u1 > a0 - CAS_W and u0 < a1 + CAS_W:
                    lo, hi = b0 - 0.10, b1 + CAS_W           # the window sill reaches 7 cm below the opening
                    spans = [s for z0, z1 in spans for s in ((z0, lo), (hi, z1)) if (s[1] or 99) - s[0] > 0.05]
            for z0, z1 in spans:
                ring_ = [(u0, 0), (u1, 0), (u1, BAT_T), (u0, BAT_T)]
                top = [wpt(wall, u, d, z1 if z1 is not None else wtop(wall, u)) for u, d in ring_]
                solid(p, [wpt(wall, u, d, z0) for u, d in ring_], top, "TackleWall",
                      skip={0, "bot"} | ({"top"} if z1 is None else set()))


def opening(p, wall, u0, u1, z0, z1, door):
    """A recessed opening: reveals in the wall colour, a dark back, cream casing; a window gets a cross
    mullion and a sill, the door a screen door standing in the reveal."""
    O, U, N = WALLS[wall]
    for u, s in ((u0, 1), (u1, -1)):
        p.face([wpt(wall, u, -REC, z0), wpt(wall, u, 0, z0), wpt(wall, u, 0, z1), wpt(wall, u, -REC, z1)],
               "TackleWall", U * s)
    p.face([wpt(wall, u0, -REC, z1), wpt(wall, u1, -REC, z1), wpt(wall, u1, 0, z1), wpt(wall, u0, 0, z1)],
           "TackleWall", -Z_)
    if not door:
        p.face([wpt(wall, u0, -REC, z0), wpt(wall, u1, -REC, z0), wpt(wall, u1, 0, z0), wpt(wall, u0, 0, z0)],
               "TackleWall", Z_)
    p.face([wpt(wall, u0, -REC, z0), wpt(wall, u1, -REC, z0), wpt(wall, u1, -REC, z1), wpt(wall, u0, -REC, z1)],
           "TackleDark", N)
    # casing: two jambs and a head, 3 cm proud
    w, t = CAS_W, CAS_T
    wbox(p, wall, u0 - w, u0, 0, t, z0, z1 + w, "TackleTrim", skip={0, "bot"})
    wbox(p, wall, u1, u1 + w, 0, t, z0, z1 + w, "TackleTrim", skip={0, "bot"})
    wbox(p, wall, u0, u1, 0, t, z1, z1 + w, "TackleTrim", skip={0, 1, 3})
    if door:
        # the screen door, shut, in the reveal: two stiles and three rails over the dark doorway
        d0, d1, sw_ = -0.05, -0.02, 0.07
        wbox(p, wall, u0, u0 + sw_, d0, d1, z0, z1, "TackleTrim", skip={0, 3, "bot", "top"})
        wbox(p, wall, u1 - sw_, u1, d0, d1, z0, z1, "TackleTrim", skip={0, 1, "bot", "top"})
        for za, zb2 in ((z0, z0 + 0.22), (1.12, 1.22), (z1 - 0.10, z1)):
            wbox(p, wall, u0 + sw_, u1 - sw_, d0, d1, za, zb2, "TackleTrim",
                 skip={0, 1, 3} | ({"bot"} if za == z0 else set()) | ({"top"} if zb2 == z1 else set()))
        wbox(p, wall, u1 - sw_ + 0.015, u1 - 0.015, d1, d1 + 0.03, 1.00, 1.10, "TackleDark", skip={0})   # the latch
    else:
        # the sill: a ledge the jambs stand on; a cross mullion in the reveal
        wbox(p, wall, u0 - w - 0.04, u1 + w + 0.04, 0, t + 0.04, z0 - 0.07, z0, "TackleTrim", skip={0})
        um, zm, mw = (u0 + u1) / 2, (z0 + z1) / 2, 0.05
        wbox(p, wall, um - mw / 2, um + mw / 2, -REC, -REC + 0.04, z0, z1, "TackleTrim", skip={0, "bot", "top"})
        wbox(p, wall, u0, um - mw / 2, -REC, -REC + 0.04, zm - mw / 2, zm + mw / 2, "TackleTrim", skip={0, 3})
        wbox(p, wall, um + mw / 2, u1, -REC, -REC + 0.04, zm - mw / 2, zm + mw / 2, "TackleTrim", skip={0, 1})


# ---------------------------------------------------------------------------
# Roof
# ---------------------------------------------------------------------------
ROOF_YS = (BACK_Y, 0.0, HY, PORCH_Y)


def roof(p):
    """The sheet: one (y, z) profile, ridge -> eave -> porch, RT thick, run along X."""
    ys = ROOF_YS
    for ya, yb in zip(ys, ys[1:]):
        ny = -(zt(yb) - zt(ya))                              # sheet normal ~ (0, -dz, dy)
        up = Vector((0, ny, yb - ya))
        p.face([(-RX, ya, zt(ya)), (RX, ya, zt(ya)), (RX, yb, zt(yb)), (-RX, yb, zt(yb))], "TackleRoof", up)
        p.face([(-RX, ya, zu(ya)), (RX, ya, zu(ya)), (RX, yb, zu(yb)), (-RX, yb, zu(yb))], "TackleRoof", -up)
        for x, s in ((-RX, -1), (RX, 1)):
            p.face([(x, ya, zu(ya)), (x, yb, zu(yb)), (x, yb, zt(yb)), (x, ya, zt(ya))], "TackleRoof", X_ * s)
    for y, s in ((ys[0], -1), (ys[-1], 1)):
        p.face([(-RX, y, zu(y)), (RX, y, zu(y)), (RX, y, zt(y)), (-RX, y, zt(y))], "TackleRoof", Y_ * s)
    # standing seams: a 3 cm V-rib every 0.5 m, each run closed at both ends, stopping under the ridge cap
    rw, rh = 0.025, 0.03
    runs = ((BACK_Y, -0.16), (0.16, HY), (HY, PORCH_Y))
    for k in range(13):
        x = -3.0 + 0.5 * k
        for ya, yb in runs:
            A = lambda y, dx: (x + dx, y, zt(y))
            T = lambda y: (x, y, zt(y) + rh)
            for dx in (-rw, rw):
                p.face([A(ya, dx), A(yb, dx), T(yb), T(ya)], "TackleRoof", Vector((dx, 0, rw * 1.5)))
            for y, s in ((ya, -1), (yb, 1)):
                if (y, s) in ((HY, 1), (HY, -1)):            # the two runs meet at the kink: no cap there
                    continue
                p.face([A(y, -rw), A(y, rw), T(y)], "TackleRoof", Y_ * s)
    # ridge cap: two flats sunk 1 cm into the sheet at their edges, closed at the rakes
    cy, ch = 0.15, 0.05
    L = lambda x, y: (x, y, zt(y) - 0.01)
    R = lambda x: (x, 0.0, RIDGE + ch)
    for s in (-1, 1):
        p.face([L(-RX, s * cy), L(RX, s * cy), R(RX), R(-RX)], "TackleRoof", Vector((0, s * 0.5, 1)))
    for x, s in ((-RX, -1), (RX, 1)):
        p.face([L(x, -cy), L(x, cy), R(x)], "TackleRoof", X_ * s)


def stovepipe(p):
    x, y, r, top = PIPE
    ring_ = ngon(r, 6, x, y, 0.0)
    z0 = zt(y) - 0.04
    solid(p, [(a, b, z0) for a, b in ring_], [(a, b, top) for a, b in ring_], "TackleDark", skip={"bot", "top"})
    p.face([(a, b, top) for a, b in ring_], "TackleDark", -Z_ * 0 + Z_)
    hat = ngon(r + 0.10, 6, x, y, 0.0)                       # the rain hat, 8 cm over the pipe
    hz, apex = top + 0.08, Vector((x, y, top + 0.20))
    for a, b in zip(hat, hat[1:] + hat[:1]):
        p.face([(*a, hz), (*b, hz), apex], "TackleDark", Vector(((a[0] + b[0]) / 2 - x, (a[1] + b[1]) / 2 - y, 0.3)))
    p.face([(a, b, hz) for a, b in hat], "TackleDark", -Z_)
    for a, b in ring_[::2]:                                  # three straps, pipe top to hat
        solid(p, [(a - 0.01, b - 0.01, top), (a + 0.01, b - 0.01, top), (a + 0.01, b + 0.01, top), (a - 0.01, b + 0.01, top)],
              [(a - 0.01, b - 0.01, hz), (a + 0.01, b - 0.01, hz), (a + 0.01, b + 0.01, hz), (a - 0.01, b + 0.01, hz)],
              "TackleDark", skip={"bot", "top"})


# ---------------------------------------------------------------------------
# Porch
# ---------------------------------------------------------------------------
def porch(p):
    (y0, y1), z = DECK_Y, DECK_Z
    box(p, (-DECK_X, y0, 0), (DECK_X, y1, z), "TackleWood", skip={0, "bot", "top"})
    # the deck top: boards along X, a 1.5 cm dark gap every 0.2 m
    rects = [(-DECK_X, DECK_X, y0, y1, "TackleWood")]
    g = y0 + 0.20
    while g < y1 - 0.1:
        rects.append((-DECK_X, DECK_X, g, g + 0.015, "TackleDark"))
        g += 0.20
    tile(p, rects, lambda x, y: (x, y, z), Z_)
    (sx0, sx1), (sy0, sy1), sh = STEP
    box(p, (sx0, sy0, 0), (sx1, sy1, sh), "TackleWood", skip={0, "bot"})
    for x in POSTS_X:
        h = POST_W / 2
        box(p, (x - h, POST_Y - h, z), (x + h, POST_Y + h, zu(POST_Y - h)), "TackleTrim", skip={"bot", "top"})


def bench(p):
    (x0, x1), (y0, y1), zs = BENCH
    box(p, (x0, y0, zs - 0.05), (x1, y1, zs), "TackleWood")
    for xa in (x0 + 0.08, x1 - 0.13):
        box(p, (xa, y0 + 0.04, DECK_Z), (xa + 0.05, y1 - 0.04, zs - 0.05), "TackleWood", skip={"bot", "top"})


def fridge(p):
    """The upright LIVE BAIT fridge: a cream box, a dark kick plate, the label off the atlas, a handle."""
    (x0, x1), (y0, y1), zt_ = FRIDGE
    box(p, (x0, y0, DECK_Z), (x1, y1, zt_), "TackleTrim", skip={0, 2, "bot"})
    (lx0, lx1), (lz0, lz1) = LABEL
    tile(p, [(x0, x1, DECK_Z, zt_, "TackleTrim"), (x0, x1, DECK_Z, DECK_Z + 0.12, "TackleDark"),
             (lx0, lx1, lz0, lz1, None)], lambda x, z: (x, y1, z), Y_)
    lw, lh = lx1 - lx0, lz1 - lz0
    su, sv = LABEL_PX[0] / TEX_W, LABEL_PX[1] / TEX_H
    uv = lambda x, z: ((lx1 - x) / lw * su, (z - lz0) / lh * sv)     # faces +Y: the viewer's right is -X
    pts = [(lx0, y1, lz0), (lx1, y1, lz0), (lx1, y1, lz1), (lx0, y1, lz1)]
    p.face(pts, "TackleSign", Y_, [uv(x, z) for x, _, z in pts])
    box(p, (x0 + 0.05, y1, 0.95), (x0 + 0.09, y1 + 0.04, 1.40), "TackleDark", skip={0})   # the handle


def board(p):
    """BAIT & TACKLE, standing on the porch roof: wood edges and back, the atlas on its face, two braces."""
    (x0, x1), (y0, y1), (z0, z1) = BOARD_X, BOARD_Y, BOARD_Z
    box(p, (x0, y0, z0), (x1, y1, z1), "TackleWood", skip={2, "bot"})
    sw, sh = x1 - x0, z1 - z0
    uv = lambda x, z: ((x1 - x) / sw, 0.5 + 0.5 * (z - z0) / sh)
    pts = [(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)]
    p.face(pts, "TackleSign", Y_, [uv(x, z) for x, _, z in pts])
    for xb in (x0 + 0.5, x1 - 0.5):
        yb = 2.35                                            # the brace's foot, back up the porch roof
        sq = lambda y, z: [(xb - 0.03, y, z - 0.03), (xb + 0.03, y, z - 0.03), (xb + 0.03, y, z + 0.03), (xb - 0.03, y, z + 0.03)]
        solid(p, sq(yb, zt(yb) - 0.03), sq(y0, z1 - 0.15), "TackleWood", skip={"bot", "top"})


# ---------------------------------------------------------------------------
# The fish (a leaping largemouth bass, head to +X, read side-on from the road)
# ---------------------------------------------------------------------------
FISH = [  # outline, unrotated, body centre at 0: snout -> back -> tail -> belly -> jaw -> mouth corner
    (1.30, 0.04), (1.16, 0.17), (0.98, 0.29), (0.72, 0.41),
    (0.62, 0.62), (0.50, 0.45), (0.38, 0.66), (0.26, 0.47), (0.14, 0.66), (0.02, 0.48), (-0.10, 0.60),
    (-0.18, 0.44), (-0.30, 0.64), (-0.52, 0.62), (-0.68, 0.40), (-0.92, 0.19),
    (-1.18, 0.30), (-1.40, 0.56), (-1.33, 0.18), (-1.24, 0.00), (-1.33, -0.17), (-1.40, -0.52), (-1.16, -0.27),
    (-0.92, -0.15), (-0.66, -0.26), (-0.56, -0.48), (-0.36, -0.36), (-0.05, -0.38),
    (0.30, -0.40), (0.40, -0.60), (0.54, -0.38), (0.84, -0.30), (1.10, -0.18), (1.30, -0.10), (1.04, -0.02),
]
BELLY = [(0.90, -0.10), (0.82, -0.27), (0.54, -0.35), (0.30, -0.37), (-0.05, -0.35), (-0.35, -0.33),
         (-0.62, -0.23), (-0.75, -0.14), (-0.40, -0.12), (0.10, -0.12), (0.55, -0.10)]
STRIPE = [(0.70, 0.06), (0.48, 0.11), (0.22, 0.05), (-0.02, 0.12), (-0.28, 0.05), (-0.52, 0.10), (-0.80, 0.07),
          (-0.80, -0.02), (-0.52, -0.06), (-0.28, 0.00), (-0.02, -0.07), (0.22, -0.01), (0.48, -0.07), (0.70, -0.02)]
GILL = [(0.80, 0.28), (0.86, 0.05), (0.80, -0.20), (0.74, -0.18), (0.79, 0.05), (0.74, 0.26)]
EYE = (1.00, 0.12, 0.075, 0.042)                # centre, cream radius, pupil radius


def leap(pts):
    c, s = math.cos(FISH_TILT), math.sin(FISH_TILT)
    return [(FISH_X + x * c - z * s, FISH_Z + x * s + z * c) for x, z in pts]


def fish(p):
    y0, y1 = FISH_Y0, FISH_Y1
    relief(p, leap(FISH), y0, y1, "TackleFish", back=True)
    relief(p, leap(BELLY), y1, y1 + 0.015, "TackleTrim")
    relief(p, leap(STRIPE), y1, y1 + 0.015, "TackleDark")
    relief(p, leap(GILL), y1, y1 + 0.03, "TackleDark")
    ex, ez, er, pr = EYE
    relief(p, leap(ngon(er, 8, ex, ez)), y1, y1 + 0.02, "TackleTrim")
    relief(p, leap(ngon(pr, 6, ex, ez)), y1 + 0.02, y1 + 0.04, "TackleDark")
    for xp in FISH_POSTS:                                   # two posts behind the fish, down into the ridge cap
        box(p, (xp - 0.04, -0.15, zt(-0.15) - 0.02), (xp + 0.04, y0 - 0.01, FISH_Z), "TackleRoof", skip={"bot", "top"})


# ---------------------------------------------------------------------------
# The ends: the canoe on its sawhorses (-X), the cleaning table and buckets (+X)
# ---------------------------------------------------------------------------
def canoe(p):
    """Upside down: the keel on top, nearly straight; the gunwales underneath, resting on the sawhorse
    beams at mid-length and dropping toward the ends (the sheer, inverted).  Pointed stems."""
    (x0, x1), yc, B, H = CANOE_X, CANOE_YC, CANOE_B, CANOE_H
    n, arc = 8, 4
    keel = HORSE_Z + H
    stations = []
    for i in range(n + 1):
        t = i / n
        e = (2 * t - 1) ** 2
        b = B * max(0.0, 1 - e) ** 0.55
        zg = HORSE_Z - 0.16 * e
        zk = keel - 0.04 * e
        x = x0 + (x1 - x0) * t
        stations.append([(x, yc - b * math.cos(math.pi * k / arc), zg + (zk - zg) * math.sin(math.pi * k / arc))
                         for k in range(arc + 1)])
    mid = Vector(((x0 + x1) / 2, yc, HORSE_Z))
    for sa, sb in zip(stations, stations[1:]):
        for k in range(arc):
            for tri in ((sa[k], sb[k], sb[k + 1]), (sa[k], sb[k + 1], sa[k + 1])):
                if (Vector(tri[0]) - Vector(tri[1])).length < 1e-6 or (Vector(tri[1]) - Vector(tri[2])).length < 1e-6 \
                        or (Vector(tri[0]) - Vector(tri[2])).length < 1e-6:
                    continue
                c = sum((Vector(v) for v in tri), Vector()) / 3
                p.face(tri, "TackleRed", c - Vector((c.x, yc, HORSE_Z - 0.3)))
        # the open hull underneath, seen as its dark inside
        q = [sa[0], sb[0], sb[arc], sa[arc]]
        if (Vector(q[0]) - Vector(q[3])).length > 1e-6 or (Vector(q[1]) - Vector(q[2])).length > 1e-6:
            p.face([v for i, v in enumerate(q) if i == 0 or (Vector(v) - Vector(q[i - 1])).length > 1e-6], "TackleDark", -Z_)
    for xh in HORSE_X:
        sawhorse(p, xh, yc)


def sawhorse(p, xc, yc):
    zb = HORSE_Z - 0.08
    box(p, (xc - 0.05, yc - 0.50, zb), (xc + 0.05, yc + 0.50, HORSE_Z), "TackleWood")
    for sy in (-1, 1):
        for sx in (-1, 1):
            y = yc + sy * 0.40
            sq = lambda x, yy, z: [(x - 0.025, yy - 0.025, z), (x + 0.025, yy - 0.025, z), (x + 0.025, yy + 0.025, z), (x - 0.025, yy + 0.025, z)]
            solid(p, sq(xc + sx * 0.28, y + sy * 0.06, 0.0), sq(xc + sx * 0.03, y, zb), "TackleWood", skip={"top", "bot"})


def cleaning_table(p):
    (x0, x1), (y0, y1), z = TABLE_X, TABLE_Y, TABLE_Z
    box(p, (x0, y0, z - 0.05), (x1, y1, z), "TackleWood")
    box(p, (x0, y0, z), (x1, y0 + 0.04, z + 0.32), "TackleWood", skip={"bot"})       # the splash board
    for xa in (x0 + 0.04, x1 - 0.09):
        for ya in (y0 + 0.04, y1 - 0.09):
            box(p, (xa, ya, 0), (xa + 0.05, ya + 0.05, z - 0.05), "TackleWood", skip={"bot", "top"})
    # the tap: a pipe up the splash board, a spout over the table
    tx = (x0 + x1) / 2
    box(p, (tx - 0.02, y0 - 0.05, 0), (tx + 0.02, y0 - 0.01, z + 0.45), "TackleRoof", skip={"bot"})
    box(p, (tx - 0.02, y0 - 0.01, z + 0.41), (tx + 0.02, y0 + 0.20, z + 0.45), "TackleRoof", skip={0})
    for bx, by in BUCKETS:
        r0, r1, h = 0.13, 0.15, 0.36
        solid(p, [(a, b, 0) for a, b in ngon(r0, 6, bx, by, 0.0)], [(a, b, h) for a, b in ngon(r1, 6, bx, by, 0.0)],
              "TackleTrim", skip={"bot", "top"})
        p.face([(a, b, h - 0.04) for a, b in ngon(r1 - 0.006, 6, bx, by, 0.0)], "TackleDark", Z_)
        ins = ngon(r1 - 0.006, 6, bx, by, 0.0)
        top = ngon(r1, 6, bx, by, 0.0)
        for (a0, b0), (a1, b1), (c0, d0), (c1, d1) in zip(top, top[1:] + top[:1], ins, ins[1:] + ins[:1]):
            p.face([(a0, b0, h), (a1, b1, h), (c1, d1, h - 0.04), (c0, d0, h - 0.04)], "TackleTrim",
                   Vector((bx - (a0 + a1) / 2, by - (b0 + b1) / 2, 0.5)))


def build_part():
    p = Part("TackleShop")
    walls(p)
    battens(p)
    roof(p)
    stovepipe(p)
    porch(p)
    bench(p)
    fridge(p)
    board(p)
    fish(p)
    canoe(p)
    cleaning_table(p)
    return p


# ---------------------------------------------------------------------------
# Registry numbers (three.js model frame: x, height, -y)
# ---------------------------------------------------------------------------
def collider_boxes():
    """(name, Blender lo, Blender hi) for every solid part.  The fish, the board, the step and the
    stovepipe are not colliders."""
    return [
        ("shack", (-HX, -HY, 0), (HX, HY, RIDGE)),
        ("porch", (-DECK_X, HY, 0), (DECK_X, DECK_Y[1], zu(POST_Y))),
        ("canoe on its sawhorses", (CANOE_X[0], CANOE_YC - 0.50, 0), (CANOE_X[1], CANOE_YC + 0.50, HORSE_Z + CANOE_H)),
        ("cleaning table + buckets", (TABLE_X[0], TABLE_Y[0] - 0.05, 0), (5.12, TABLE_Y[1] + 0.15, TABLE_Z + 0.45)),
    ]


def three(lo, hi):
    """Blender lo/hi -> three.js { c, s }."""
    c = [(lo[0] + hi[0]) / 2, (lo[2] + hi[2]) / 2, -(lo[1] + hi[1]) / 2]
    s = [hi[0] - lo[0], hi[2] - lo[2], hi[1] - lo[1]]
    return c, s


def registry():
    f = lambda v: f"{v:.3f}".rstrip("0").rstrip(".") if abs(v) > 1e-9 else "0"
    lines = []
    for name, lo, hi in collider_boxes():
        c, s = three(lo, hi)
        lines.append(f"        {{ c: [{', '.join(map(f, c))}], s: [{', '.join(map(f, s))}] }},"
                     f"{' ' * max(1, 44 - len(', '.join(map(f, c + s))))}// {name}")
    return lines


# ---------------------------------------------------------------------------
# Blender side
# ---------------------------------------------------------------------------
def _emission(name, col):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs[0].default_value = (*col, 1.0)
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(e.outputs[0], o.inputs[0])
    return m


def bake_atlas():
    """The atlas: an orthographic render of flat emitters laid out in atlas PIXELS (ART-STYLE: atlas units,
    never per-region units).  Top half: the board, 1024 x 256.  Bottom left: the fridge label, 448 x 224.
    Dither and render stamps off so a re-export is byte-identical."""
    sc = bpy.data.scenes.new("AtlasBake")
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = TEX_W, TEX_H
    sc.render.resolution_percentage = 100
    sc.render.dither_intensity = 0.0
    for k in dir(sc.render):
        if k.startswith("use_stamp_"):
            setattr(sc.render, k, False)
    sc.view_settings.view_transform = "Standard"
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    cd = bpy.data.cameras.new("AtlasCam")
    cd.type, cd.ortho_scale = "ORTHO", TEX_W
    cam = bpy.data.objects.new("AtlasCam", cd)
    cam.location = (TEX_W / 2, TEX_H / 2, 5.0)
    sc.collection.objects.link(cam)
    sc.camera = cam
    junk, mats, layer = [], [], [0]

    def z():
        layer[0] += 1
        return layer[0] * 0.01

    def rect(u0, v0, u1, v1, col):
        me = bpy.data.meshes.new("a")
        h = z()
        me.from_pydata([(u0, v0, h), (u1, v0, h), (u1, v1, h), (u0, v1, h)], [], [[0, 1, 2, 3]])
        o = bpy.data.objects.new("a", me)
        m = _emission("a", INK[col])
        mats.append(m)
        me.materials.append(m)
        sc.collection.objects.link(o)
        junk.append(o)

    def text(body, uc, vc, w, h, col):
        """Fit `body` inside w x h pixels, its glyph box centred on (uc, vc)."""
        cu = bpy.data.curves.new("t", type="FONT")
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
        xs, ys = [v.co.x for v in me.vertices], [v.co.y for v in me.vertices]
        o.to_mesh_clear()
        k = min(w / (max(xs) - min(xs)), h / (max(ys) - min(ys)))
        o.scale = (k, k, 1)
        o.location = (uc - k * (max(xs) + min(xs)) / 2, vc - k * (max(ys) + min(ys)) / 2, z())

    rect(0, 0, TEX_W, TEX_H, "cream")                  # the unused corner too
    # the board (v 256..512): a teal frame, cream field, the words; the bottom 2 cm sit in the roof
    rect(0, 256, TEX_W, TEX_H, "teal")
    rect(18, 278, TEX_W - 18, TEX_H - 18, "cream")
    text("BAIT & TACKLE", TEX_W / 2, 420, TEX_W - 110, 118, "red")
    rect(150, 349, TEX_W - 150, 355, "teal")
    text("LIVE BAIT · RODS · REELS", TEX_W / 2, 315, TEX_W - 300, 40, "teal")
    # the fridge label (0..448 x 0..224): red, two cream lines
    lw, lh = LABEL_PX
    rect(0, 0, lw, lh, "red")
    text("LIVE", lw / 2, 158, lw - 120, 78, "cream")
    text("BAIT", lw / 2, 62, lw - 120, 78, "cream")
    path = os.path.join(bpy.app.tempdir, f"{NAME}-atlas.png")
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True, scene=sc.name)   # no window swap: runs under blender -b too
    img = bpy.data.images.load(path, check_existing=False)
    img.name = "TackleShopSign"
    img.pack()
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
        b.inputs["Base Color"].default_value = (*col, 1.0)
        m.diffuse_color = (*col, 1.0)
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
    per = {}
    for t in m.loop_triangles:
        k = m.materials[t.material_index].name
        per[k] = per.get(k, 0) + 1
    ev.to_mesh_clear()
    return sum(per.values()), per


def check_facing(ob, n=24):
    """Ray-cast from a ring of eyes at the model (and two under the porch roof); every first hit must
    face back at the ray."""
    from mathutils.bvhtree import BVHTree
    tree = BVHTree.FromObject(ob, bpy.context.evaluated_depsgraph_get())
    bad, hits = [], 0
    # off the round numbers: a ray through an exact edge may report either face
    targets = [Vector((x + 0.013, y + 0.017, z + 0.011)) for x in (-6, -4.5, -2, 0, 2, 4.2)
               for y in (-1.5, 0.6, 2.4, 3.3) for z in (0.5, 1.4, 2.6, 3.6, 4.8)]
    eyes = [Vector((math.cos(a) * 25, math.sin(a) * 25, h))
            for a in [2 * math.pi * k / n for k in range(n)] for h in (1.2, 4, 9, 18)]
    eyes += [Vector((2.3, 7.0, 1.6)), Vector((-2.0, 5.0, 1.0))]   # standing at the porch
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


def check_uv_handedness(ob):
    """Every lettered face must map image-right to the viewer's right: (dP/du x dP/dv) . n > 0."""
    me = ob.data
    uvl = me.uv_layers.active.data
    sign_idx = [i for i, m in enumerate(me.materials) if m.name.startswith("TackleSign")]
    bad = n = 0
    for poly in me.polygons:
        if poly.material_index not in sign_idx:
            continue
        li = list(poly.loop_indices)[:3]
        p0, p1, p2 = (me.vertices[me.loops[i].vertex_index].co for i in li)
        t0, t1, t2 = (uvl[i].uv for i in li)
        du1, du2 = t1 - t0, t2 - t0
        det = du1.x * du2.y - du1.y * du2.x
        e1, e2 = p1 - p0, p2 - p0
        dpdu = (e1 * du2.y - e2 * du1.y) / det
        dpdv = (e2 * du1.x - e1 * du2.x) / det
        n += 1
        bad += dpdu.cross(dpdv).dot(poly.normal) <= 0
    return bad, n


def pad_check(ob):
    """Pad frame: px = x, pz = SEAT - y.  Everything within 0.35 m of the ground stands no nearer the road
    than FLAT_Z and inside the pad's rounded outline grown by RIM; every collision-box corner within
    RIM_KEEP (test/poi-yard.mjs's rule)."""
    def outside(x, pz):          # road-carve.js padSd: signed distance outside the rounded rectangle
        qx, qz = abs(x) - (PAD_HX - PAD_R), abs(pz) - (PAD_HZ - PAD_R)
        return math.hypot(max(qx, 0), max(qz, 0)) + min(max(qx, qz), 0) - PAD_R
    low = [v.co for v in ob.data.vertices if v.co.z < 0.35]
    front = min(SEAT - v.y for v in low)
    worst = max(outside(v.x, SEAT - v.y) for v in low)
    corners = max(outside(x, SEAT - y) for _, lo, hi in collider_boxes()
                  for x in (lo[0], hi[0]) for y in (lo[1], hi[1]))
    ok = front >= FLAT_Z - 1e-6 and worst <= RIM and corners <= RIM_KEEP
    return ok, front, worst, corners


def fresh_scene():
    bpy.ops.wm.read_homefile(use_empty=True)
    for d in (bpy.data.materials, bpy.data.meshes, bpy.data.images):
        for x in list(d):
            d.remove(x)


def build():
    fresh_scene()
    img = bake_atlas()
    ob = bake(build_part(), img)
    t, per = evaluated_tris(ob)
    bad, hits = check_facing(ob)
    mir, tex = check_uv_handedness(ob)
    ok_pad, front, worst, corners = pad_check(ob)
    lo = [min(v.co[i] for v in ob.data.vertices) for i in range(3)]
    hi = [max(v.co[i] for v in ob.data.vertices) for i in range(3)]
    print("=" * 72)
    print(f"  TackleShop  {t} tris (budget {TRI_BUDGET}, floor ~1000)  materials {len(ob.data.materials)}"
          f"  images {len(bpy.data.images)}")
    print("  per material: " + ", ".join(f"{k} {v}" for k, v in sorted(per.items(), key=lambda kv: -kv[1])))
    print(f"  bbox  x {lo[0]:.2f}..{hi[0]:.2f}  y {lo[1]:.2f}..{hi[1]:.2f}  z {lo[2]:.2f}..{hi[2]:.2f}")
    print(f"  pad: nearest the road at ground pz {front:.2f} (flat from {FLAT_Z}), worst {worst:.2f} m past the"
          f" pad edge (rim {RIM}), collider corners {corners:.3f} (poi-yard {RIM_KEEP})  -> {'OK' if ok_pad else 'FAIL'}")
    print(f"  facing: {bad} inverted first-hits of {hits}   uv handedness: {mir} mirrored of {tex} sign faces")
    print("  ---- data/prop-models.js (three.js frame) ----")
    print(f"      shape: 'box', size: [{2 * DECK_X:.1f}, {RIDGE}, {DECK_Y[1] + HY:.1f}],")
    print("      boxes: [")
    for ln in registry():
        print(ln)
    print("      ],")
    print(f"    seat: {SEAT},")
    print("=" * 72)
    return ob, ok_pad and bad == 0 and mir == 0 and t <= TRI_BUDGET * 1.1


def export():
    ob, ok = build()
    bpy.ops.export_scene.gltf(
        filepath=f"{OUT_DIR}/{NAME}.glb", export_format="GLB",
        export_draco_mesh_compression_enable=False, export_yup=True,
        export_apply=True, export_materials="EXPORT", export_texcoords=True,
        export_normals=True, export_cameras=False, export_lights=False,
        export_image_format="AUTO", use_selection=False)
    print(f"  wrote {OUT_DIR}/{NAME}.glb")
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    print(f"  wrote {OUT_BLEND}")
    return ok


# ---------------------------------------------------------------------------
# Review renders (scenery never reaches the .glb or the .blend)
# ---------------------------------------------------------------------------
VIEWS = {
    # name: (eye, target, vertical fov deg), Blender frame (the road runs along X at y ~ 8..15)
    "road":          ((-2.0, 16.0, 1.5), (0.0, 0.0, 2.6), 45),
    "three-quarter": ((14.0, 17.0, 6.0), (-0.5, 0.5, 2.2), 42),
    "rear":          ((-12.0, -14.0, 7.0), (0.0, 0.0, 2.5), 45),
    "porch":         ((3.6, 7.2, 1.7), (0.2, 2.0, 1.5), 60),
    "canoe-end":     ((-12.0, 7.0, 3.0), (-4.5, 0.8, 1.2), 45),
    "down-the-road": ((-30.0, 13.0, 1.5), (0.0, 0.5, 2.8), 22),
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
    _plane("Ground", -80, 80, -80, 80, -0.03, _flat("Ground", (0.16, 0.17, 0.10)))
    _plane("Pad", -PAD_HX, PAD_HX, SEAT - PAD_HZ, SEAT + PAD_HZ, -0.005, _flat("Pad", (0.24, 0.20, 0.15)))
    ry = SEAT + PAD_HZ + 0.6
    _plane("Road", -80, 80, ry, ry + 7.0, -0.01, _flat("Road", (0.05, 0.05, 0.055), 0.8))
    # a Ranger parked in front of the porch, nose along the road (burger-joint.py's rig)
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
        for ax in (length / 2 - 0.80, length / 2 - 0.80 - 2.83):
            for sx in (-1, 1):
                bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.36, depth=0.24,
                                                    location=(sx * 0.74, ax, 0.36), rotation=(0, math.pi / 2, 0))
                w = bpy.context.active_object
                w.data.materials.append(wheel)
                w.parent = rig
                w.matrix_parent_inverse = rig.matrix_world.inverted()
        seat = bpy.data.objects.new("TruckSeat", None)
        bpy.context.collection.objects.link(seat)
        rig.parent = seat
        seat.rotation_euler = (0, 0, math.pi / 2)          # nose along the road (Blender X)
        seat.location = (1.0, SEAT - TRUCK_PAD_Z, 0)
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
    os.makedirs(RENDER_DIR, exist_ok=True)
    paths = []
    for name, (eye, target, fov) in VIEWS.items():
        eye, target = Vector(eye), Vector(target)
        cam.location = eye
        cam.rotation_mode = "QUATERNION"
        cam.rotation_quaternion = (target - eye).to_track_quat("-Z", "Y")
        cam.data.sensor_fit = "VERTICAL"
        cam.data.angle_y = math.radians(fov)
        cam.data.clip_start = 0.05
        cam.data.clip_end = 400
        sc.render.filepath = f"{RENDER_DIR}/{name}.png"
        bpy.ops.render.render(write_still=True)
        paths.append(sc.render.filepath)
        print(f"  rendered {sc.render.filepath}")
    contact_sheet(paths, f"{RENDER_DIR}/sheet.png")


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
