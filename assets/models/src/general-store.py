"""
ASSET-74 — the GENERAL STORE.  Parametric generator.

Built for: Blender 5.x  |  PROMOTED 2026-10-08 (owner) from wip/ to assets/models/ + assets/models/src/.
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

A rural country store: off-white stucco walls, a red board-and-batten gable that runs down
over the top of every wall, a dark peaked roof, red-framed windows with drawn blinds and a
dark glass shop door.  A shaped, hand-lettered "Country Store" board hangs on the road
gable — generic on purpose, so any named store can stand on it.  A white ice chest with an
ICE placard stands on the concrete apron, whose edge is painted safety yellow.
Reference: the owner's photo (Red Lick Country Store).

    GeneralStore   one mesh, 6 materials, ONE 512x512 atlas (sign + ICE placard + ice
                   chest colours), so the chest costs no material of its own

Final (2026-10-08, Blender 5.2.0 LTS): 1068 tris (budget 1500), 6 materials, 1 image
(512x512 PNG atlas), .glb 125 kB.  Overall 8.67 x 7.50 x 5.14 m (x, y, z); walls 7.0 x 5.5,
ridge 5.0 (5.14 over the slab).  Audit: no z-fight, 0/3120 inverted ray hits, 0/2 mirrored
lettered faces.  704 non-manifold edges BY DESIGN (single-sheet walls, backless trim, no
floor — the barn's convention).

AXES.  Blender +Y = glTF -Z = forward = the road gable (door, sign, apron).  Width (7 m)
runs along X = along the road, so the marker's own yaw fits it to the 14 x 8 m pad with no
yawOffset.  Base-seated (z = 0), centred on the WALL footprint; the apron and the roof
overhang reach past it.  From the road, the viewer's LEFT is Blender +X — that is where the
ice chest stands, as in the photo.

WINDING.  Every face goes through face(), which takes the direction the face must point and
flips the polygon to suit (the barn.py pattern).  check_facing() proves it by ray cast.

ATLAS (512 x 512, v up):  v 0.50-1.00 the sign board · v 0.1875-0.4375 the ICE placard ·
v 0-0.125 four flat patches (chest white, chest-door grey, sign-edge dark, spare).  32 px
gutters keep minification from bleeding one region into the next.  Everything is drawn in
the same metres the geometry uses, so a board resize re-bakes cleanly.
"""

import bpy
import bmesh
import math
import os
from mathutils import Vector

# ---------------------------------------------------------------------------
# PARAMETERS
# ---------------------------------------------------------------------------
OUT_DIR = "/Users/ledogen/CodeShit/CarGame/assets/models"
OUT_BLEND = f"{OUT_DIR}/src/general-store.blend"
NAME = "general-store"
TRI_BUDGET = 1500

# --- envelope ---
W, D = 7.0, 5.5             # wall footprint: along the road (X), depth (Y)
EAVE = 2.7                  # side wall top
RIDGE = 5.0                 # 33° pitch
SKIN_Z = 2.3                # red board-and-batten starts here on every wall
SKIN_OUT = 0.04             # ...standing this proud of the stucco: a drip line
SLOPE = (RIDGE - EAVE) / (W / 2)

# --- board and batten ---
BAT_P, BAT_W, BAT_D = 0.45, 0.07, 0.025

# --- roof slab (underside = the wall profile, extended straight to the eave tip) ---
ROOF_T = 0.12
EAVE_OUT = 0.40
RAKE = 0.30

# --- apron + painted curb ---
AP_H = 0.15
AP_X = (-3.8, 4.7)          # wider on the +X side: the ice chest stands there
AP_D = 1.7
CURB_W = 0.14

# --- paved lot out front (the farm pad: 22 m along the road x 11.2 m deep, FEAT-105) ---
# Nose-in stalls, curb to the pad's road edge; you pull straight off the road and back out onto
# it, so the road is the drive aisle.  The apron's 0.15 m curb is the wheel stop: a pickup's
# nose overhangs it by ~0.5 m, the reason STALL_D can be 5.0 and not a full 5.5.
LOT_STALLS = 5
STALL_W = 2.7               # pickup-width stalls
STALL_D = 5.0               # curb to the pad's road edge
LOT_MARGIN = 0.6            # asphalt past the outer lines, along the road
LOT_T = 0.03                # proud of the pad: VISUAL ONLY (physics rides the carved pad), so tyres
                            # sink 3 cm into it. Thinner z-fights the terrain at the fog limit:
                            # depth error ~ d^2 / (near * 2^24) = 15 mm at 160 m with near 0.1
LINE_W = 0.10
LINE_LEN = 4.6              # painted from the curb, stopping short of the road edge

# --- front openings ---
FRAME_W, FRAME_T = 0.12, 0.04
REC = 0.10                  # opening reveal depth
DOOR_W = 0.95
DOOR_Z1 = SKIN_Z - FRAME_W  # frame header tucks under the skin
DOOR_AL = 0.08              # aluminium stile around the glass
WIN_X = (1.25, 2.55)        # |x| span of each window
WIN_Z = (0.95, 2.00)
BLIND_P, BLIND_D = 0.12, 0.015
SIDE_WIN_W = 1.30           # one per side wall, centred, same sill/head as the front

# --- sign board ---
SIGN_HW, SIGN_HH = 1.4, 0.7         # half extents, metres. MUST stay 2:1 — the atlas region is 512x256
SIGN_ZC = 3.30
SIGN_R = 0.21                       # concave corner notch radius
SIGN_ARC = 3                        # segments per notch
SIGN_T = 0.05
SIGN_FONT = "/System/Library/Fonts/Supplemental/Bradley Hand Bold.ttf"
ICE_FONT = "/System/Library/Fonts/Supplemental/Arial Black.ttf"
SIGN_LINES = (  # text, z centre, max width, max height, colour key, shadow
    ("Country", 0.23, 2.10, 0.40, "ink", False),
    ("Store", -0.20, 1.75, 0.52, "red", True),
)
SIGN_SHADOW = 0.014
GLYPH_OFFSET = 0.0          # faux-bold on the font curve. MUST stay 0 on Bradley Hand: any
                            # offset self-intersects its brush strokes into spikes

# --- ice chest ---
ICE_X0, ICE_W, ICE_DP, ICE_H = 2.60, 1.90, 0.80, 1.75
ICE_GAP = 0.12              # off the wall
ICE_DOOR = (0.80, 1.25, 0.25)   # each of two doors: width, height, z above chest base
ICE_PLAQ = (1.60, 0.40, 0.05)   # placard w, h, t

TEX = 512

MATS = {
    #  name             base colour (linear)        rough
    "StoreWall":     ((0.620, 0.590, 0.510, 1.0), 0.90),   # stucco + blinds + door stiles
    "StoreRed":      ((0.340, 0.055, 0.025, 1.0), 0.80),   # siding, frames, soffit
    "StoreRoof":     ((0.030, 0.031, 0.036, 1.0), 0.55),   # roof, door glass, handles
    "StoreConcrete": ((0.260, 0.250, 0.230, 1.0), 0.95),
    "StoreCurb":     ((0.780, 0.520, 0.020, 1.0), 0.70),   # safety yellow: curb + stall lines
    "StoreAsphalt":  ((0.055, 0.055, 0.058, 1.0), 0.95),
    "StoreSign":     (None, 0.80),                         # the atlas
}

# Atlas colours (linear; Standard view transform writes them through unchanged)
INK = {
    "cream": (0.700, 0.640, 0.480),
    "ink":   (0.030, 0.020, 0.012),
    "red":   (0.420, 0.035, 0.020),
    "white": (0.780, 0.790, 0.780),
    "grey":  (0.300, 0.310, 0.320),
}
PATCH = {"white": (0.125, 0.0625), "grey": (0.375, 0.0625),
         "ink": (0.625, 0.0625), "spare": (0.875, 0.0625)}

X_, Y_, Z_ = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
YF = D / 2                  # front wall plane


# ---------------------------------------------------------------------------
# Geometry accumulator
# ---------------------------------------------------------------------------
class Part:
    def __init__(self, name):
        self.name, self.v, self.f, self.m, self.uv = name, [], [], [], []

    def face(self, pts, mat, out, uv=None):
        """One polygon, wound so its normal points along `out`.  `uv`: per-vertex list,
        a single (u, v) for every corner, or None."""
        pts = [Vector(p) for p in pts]
        if uv is None:
            uv = PATCH["spare"]
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


def solid(p, bot, top, mat, skip=(), uv=None):
    """Convex prism between two matching rings; each face points away from the centroid."""
    bot, top = [Vector(v) for v in bot], [Vector(v) for v in top]
    c = sum(bot + top, Vector()) / (2 * len(bot))
    n = len(bot)
    for i in range(n):
        if i in skip:
            continue
        q = [bot[i], bot[(i + 1) % n], top[(i + 1) % n], top[i]]
        p.face(q, mat, sum(q, Vector()) / 4 - c, uv)
    if "bot" not in skip:
        p.face(bot, mat, sum(bot, Vector()) / n - c, uv)
    if "top" not in skip:
        p.face(top, mat, sum(top, Vector()) / n - c, uv)


def box(p, lo, hi, mat, skip=(), uv=None):
    """Axis box.  Side order: 0 -Y, 1 +X, 2 +Y (front), 3 -X."""
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    ring = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    solid(p, [(x, y, z0) for x, y in ring], [(x, y, z1) for x, y in ring], mat, skip, uv)


def cells(p, y, out, xs, zs, mat_at):
    """A planar wall at depth y split on a grid; mat_at(cx, cz) -> material or None (hole)."""
    for xa, xb in zip(xs, xs[1:]):
        for za, zb in zip(zs, zs[1:]):
            m = mat_at((xa + xb) / 2, (za + zb) / 2)
            if m:
                p.face([(xa, y, za), (xb, y, za), (xb, y, zb), (xa, y, zb)], m, out)


# ---------------------------------------------------------------------------
# Walls
# ---------------------------------------------------------------------------
def gable_z(x):
    """Roof underside at |x| — one straight line from the ridge out to the eave tip."""
    return RIDGE - abs(x) * SLOPE


def batten_wall(p, origin, N, u0, u1, z0, top, breaks=()):
    """Board-and-batten skin: the plane at `origin`, battens standing BAT_D proud along N.
    u runs along A = Z x N; top(u) is the skin height there; `breaks` are u values where
    top() kinks (the ridge), inserted so every column stays planar."""
    A, O = Z_.cross(N), Vector(origin)
    n = max(1, round((u1 - u0) / BAT_P))
    pitch = (u1 - u0) / n
    pts = [(u0, 0.0)]
    for k in range(n):
        c = u0 + pitch * (k + 0.5)
        pts += [(c - BAT_W / 2, 0.0), (c - BAT_W / 2, BAT_D), (c + BAT_W / 2, BAT_D),
                (c + BAT_W / 2, 0.0)]
    pts.append((u1, 0.0))
    for b in breaks:
        for i, ((ua, da), (ub, db)) in enumerate(zip(pts, pts[1:])):
            if ua < b < ub:
                pts.insert(i + 1, (b, da))
                break
    for (ua, da), (ub, db) in zip(pts, pts[1:]):
        if ua == ub and da == db:
            continue
        pa, pb = O + A * ua + N * da, O + A * ub + N * db
        out = N if ua != ub else (-A if db > da else A)
        p.face([pa + Z_ * z0, pb + Z_ * z0, pb + Z_ * top(ub), pa + Z_ * top(ua)], "StoreRed", out)
        if ua != ub and da > 0:               # batten end grain, seen from below
            qa, qb = O + A * ua + Z_ * z0, O + A * ub + Z_ * z0
            p.face([qa, qb, pb + Z_ * z0, pa + Z_ * z0], "StoreRed", -Z_)


def skins(p):
    hx, hy, s = W / 2, D / 2, SKIN_OUT
    band_top = lambda u: EAVE - s * SLOPE     # roof underside where the side skin stands
    for sy in (1, -1):                        # gables (front +Y, back -Y)
        N = Y_ * sy
        batten_wall(p, (0, sy * (hy + s), 0), N, -(hx + s), hx + s, SKIN_Z, gable_z, (0.0,))
        y0, y1 = sorted((sy * hy, sy * (hy + s)))
        p.face([(-hx - s, y0, SKIN_Z), (hx + s, y0, SKIN_Z), (hx + s, y1, SKIN_Z),
                (-hx - s, y1, SKIN_Z)], "StoreRed", -Z_)
    for sx in (1, -1):                        # side bands
        N = X_ * sx
        batten_wall(p, (sx * (hx + s), 0, 0), N, -(hy + s), hy + s, SKIN_Z, band_top)
        x0, x1 = sorted((sx * hx, sx * (hx + s)))
        p.face([(x0, -hy, SKIN_Z), (x1, -hy, SKIN_Z), (x1, hy, SKIN_Z), (x0, hy, SKIN_Z)],
               "StoreRed", -Z_)


def stucco(p):
    hx, hy = W / 2, D / 2
    for sx in (1, -1):
        p.face([(sx * hx, -hy, 0), (sx * hx, hy, 0), (sx * hx, hy, SKIN_Z), (sx * hx, -hy, SKIN_Z)],
               "StoreWall", X_ * sx)
    p.face([(-hx, -hy, 0), (hx, -hy, 0), (hx, -hy, SKIN_Z), (-hx, -hy, SKIN_Z)], "StoreWall", -Y_)
    holes = openings_list()
    xs = sorted({-hx, hx, *[h[0] for h in holes], *[h[1] for h in holes]})
    zs = sorted({AP_H, SKIN_Z, *[h[2] for h in holes], *[h[3] for h in holes]})

    def mat_at(cx, cz):
        inside = any(h[0] < cx < h[1] and h[2] < cz < h[3] for h in holes)
        return None if inside else "StoreWall"
    cells(p, YF, Y_, xs, zs, mat_at)


# ---------------------------------------------------------------------------
# Openings
# ---------------------------------------------------------------------------
def openings_list():
    """(x0, x1, z0, z1, kind) for every hole in the front wall."""
    a, b = WIN_X
    return [(-DOOR_W / 2, DOOR_W / 2, AP_H, DOOR_Z1, "door"),
            (-b, -a, *WIN_Z, "win"), (a, b, *WIN_Z, "win")]


def opening(p, x0, x1, z0, z1, kind):
    door = kind == "door"
    yb, yf = YF - REC, YF + FRAME_T
    fw = FRAME_W
    # reveals, merged with the frame's inner faces (front at yf, except the door sill)
    p.face([(x0, yb, z0), (x0, yf, z0), (x0, yf, z1), (x0, yb, z1)], "StoreWall", X_)
    p.face([(x1, yb, z0), (x1, yf, z0), (x1, yf, z1), (x1, yb, z1)], "StoreWall", -X_)
    p.face([(x0, yb, z1), (x1, yb, z1), (x1, yf, z1), (x0, yf, z1)], "StoreWall", -Z_)
    ys = YF if door else yf
    p.face([(x0, yb, z0), (x1, yb, z0), (x1, ys, z0), (x0, ys, z0)],
           "StoreConcrete" if door else "StoreWall", Z_)
    # frame: two posts + header (+ sill board on a window), backs on the wall not built
    zb = z0 if door else z0 - fw
    cap = {"top"} if door else set()          # the door's header tucks under the skin ledge
    box(p, (x0 - fw, YF, zb), (x0, yf, z1 + fw), "StoreRed",
        skip={0, 1} | cap | ({"bot"} if door else set()))
    box(p, (x1, YF, zb), (x1 + fw, yf, z1 + fw), "StoreRed",
        skip={0, 3} | cap | ({"bot"} if door else set()))
    box(p, (x0, YF, z1), (x1, yf, z1 + fw), "StoreRed", skip={0, 1, 3, "bot"} | cap)
    if not door:
        box(p, (x0, YF, z0 - fw), (x1, yf, z0), "StoreRed", skip={0, 1, 3, "top"})
    # what is behind the hole
    if door:
        al = DOOR_AL
        cells(p, yb, Y_, [x0, x0 + al, x1 - al, x1], [z0, z0 + 1.6 * al, z1 - al, z1],
              lambda cx, cz: "StoreRoof" if (x0 + al < cx < x1 - al and
                                             z0 + 1.6 * al < cz < z1 - al) else "StoreWall")
    else:                                     # drawn blinds: horizontal V-grooves
        n = max(1, round((z1 - z0) / BLIND_P))
        zz = [z0 + (z1 - z0) * k / n for k in range(n + 1)]
        for za, zc in zip(zz, zz[1:]):
            zm = (za + zc) / 2
            for zl, zh, dl, dh in ((za, zm, 0.0, -BLIND_D), (zm, zc, -BLIND_D, 0.0)):
                pts = [(x0, yb + dl, zl), (x1, yb + dl, zl), (x1, yb + dh, zh), (x0, yb + dh, zh)]
                p.face(pts, "StoreWall", Y_)


def front(p):
    for h in openings_list():
        opening(p, *h)


def side_windows(p):
    """One window per side wall, built PROUD of the sealed wall (the RV's camper-window
    trick): a red frame ring with a blinds panel standing inside it, no hole behind."""
    w, (z0, z1) = SIDE_WIN_W, WIN_Z
    fw, ft = FRAME_W, FRAME_T
    for sx in (1, -1):
        N = X_ * sx
        A = Z_.cross(N)
        O = Vector((sx * W / 2, 0, 0))
        P = lambda u, z, d: O + A * u + Z_ * z + N * d
        u0, u1 = -w / 2, w / 2
        outer = [(u0 - fw, z0 - fw), (u1 + fw, z0 - fw), (u1 + fw, z1 + fw), (u0 - fw, z1 + fw)]
        inner = [(u0, z0), (u1, z0), (u1, z1), (u0, z1)]
        for i in range(4):
            a, b = outer[i], outer[(i + 1) % 4]
            c, d = inner[(i + 1) % 4], inner[i]
            p.face([P(*a, ft), P(*b, ft), P(*c, ft), P(*d, ft)], "StoreRed", N)
            mid = P((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0) - P(0, (z0 + z1) / 2, 0)
            p.face([P(*a, 0), P(*b, 0), P(*b, ft), P(*a, ft)], "StoreRed", mid)
            p.face([P(*d, 0), P(*c, 0), P(*c, ft), P(*d, ft)], "StoreRed", -mid)
        n = max(1, round((z1 - z0) / BLIND_P))
        zz = [z0 + (z1 - z0) * k / n for k in range(n + 1)]
        for za, zc in zip(zz, zz[1:]):
            zm = (za + zc) / 2
            for zl, zh, dl, dh in ((za, zm, 0.02, 0.02 - BLIND_D), (zm, zc, 0.02 - BLIND_D, 0.02)):
                p.face([P(u0, zl, dl), P(u1, zl, dl), P(u1, zh, dh), P(u0, zh, dh)], "StoreWall", N)


# ---------------------------------------------------------------------------
# Roof, apron
# ---------------------------------------------------------------------------
def offset_up(pts, t):
    """Offset an open (x, z) polyline by t along its upper normal (mitred)."""
    def nrm(a, b):
        d = Vector((b[0] - a[0], b[1] - a[1])).normalized()
        return Vector((-d.y, d.x))
    out = []
    for i, pt in enumerate(pts):
        ns = []
        if i > 0:
            ns.append(nrm(pts[i - 1], pt))
        if i < len(pts) - 1:
            ns.append(nrm(pt, pts[i + 1]))
        m = sum(ns, Vector((0, 0))).normalized()
        k = t / m.dot(ns[0])
        out.append((pt[0] + m.x * k, pt[1] + m.y * k))
    return out


def roof(p):
    tx = W / 2 + EAVE_OUT
    lo = [(-tx, gable_z(tx)), (0.0, RIDGE), (tx, gable_z(tx))]
    hi = offset_up(lo, ROOF_T)
    y0, y1 = -D / 2 - RAKE, D / 2 + RAKE
    for i in range(len(lo) - 1):
        (ax, az), (bx, bz) = lo[i], lo[i + 1]
        up = Vector((-(bz - az), 0, bx - ax))
        (cx, cz), (dx, dz) = hi[i], hi[i + 1]
        p.face([(cx, y0, cz), (dx, y0, dz), (dx, y1, dz), (cx, y1, cz)], "StoreRoof", up)
        p.face([(ax, y0, az), (bx, y0, bz), (bx, y1, bz), (ax, y1, az)], "StoreRed", -up)
        for y, s in ((y0, -1), (y1, 1)):
            p.face([(ax, y, az), (bx, y, bz), (dx, y, dz), (cx, y, cz)], "StoreRoof", Y_ * s)
    for i, j in ((0, 1), (-1, -2)):
        (ax, az), (bx, bz) = lo[i], lo[j]
        (cx, cz) = hi[i]
        p.face([(ax, y0, az), (ax, y1, az), (cx, y1, cz), (cx, y0, cz)], "StoreRoof",
               Vector((ax - bx, 0, az - bz)))


def lot(p):
    """Asphalt slab with painted stall lines.  The lines are polygons IN the slab top (split
    cells), never decals laid over it, so nothing can z-fight."""
    hw = LOT_STALLS * STALL_W / 2
    x0, x1 = -hw - LOT_MARGIN, hw + LOT_MARGIN
    y0, y1, t = YF + AP_D, YF + AP_D + STALL_D, LOT_T
    lines = [-hw + k * STALL_W for k in range(LOT_STALLS + 1)]
    xs = sorted({x0, x1, *[l - LINE_W / 2 for l in lines], *[l + LINE_W / 2 for l in lines]})
    ys = [y0, y0 + LINE_LEN, y1]
    for xa, xb in zip(xs, xs[1:]):
        for ya, yb in zip(ys, ys[1:]):
            cx, cy = (xa + xb) / 2, (ya + yb) / 2
            paint = cy < y0 + LINE_LEN and any(abs(cx - l) < LINE_W / 2 for l in lines)
            p.face([(xa, ya, t), (xb, ya, t), (xb, yb, t), (xa, yb, t)],
                   "StoreCurb" if paint else "StoreAsphalt", Z_)
    p.face([(x0, y1, 0), (x1, y1, 0), (x1, y1, t), (x0, y1, t)], "StoreAsphalt", Y_)
    for x, s in ((x0, -1), (x1, 1)):
        p.face([(x, y0, 0), (x, y1, 0), (x, y1, t), (x, y0, t)], "StoreAsphalt", X_ * s)
    for xl, xr in ((x0, AP_X[0]), (AP_X[1], x1)):      # back edge, where it clears the apron
        p.face([(xl, y0, 0), (xr, y0, 0), (xr, y0, t), (xl, y0, t)], "StoreAsphalt", -Y_)


def park_zone():
    """The box around every stall, in the glTF/three.js model frame (x along the road, -z toward
    it): what the registry's park zone must say.  Blender +Y = glTF -Z."""
    y0, y1 = YF + AP_D, YF + AP_D + STALL_D
    return {"x": 0.0, "z": round(-(y0 + y1) / 2, 3),
            "halfX": round(LOT_STALLS * STALL_W / 2, 3), "halfZ": round(STALL_D / 2, 3)}


def apron(p):
    (xa, xb), ya, yb, c, h = AP_X, YF, YF + AP_D, CURB_W, AP_H
    # top: concrete field + a yellow U along the three open edges
    p.face([(xa + c, ya, h), (xb - c, ya, h), (xb - c, yb - c, h), (xa + c, yb - c, h)],
           "StoreConcrete", Z_)
    p.face([(xa, yb - c, h), (xb, yb - c, h), (xb, yb, h), (xa, yb, h)], "StoreCurb", Z_)
    p.face([(xa, ya, h), (xa + c, ya, h), (xa + c, yb - c, h), (xa, yb - c, h)], "StoreCurb", Z_)
    p.face([(xb - c, ya, h), (xb, ya, h), (xb, yb - c, h), (xb - c, yb - c, h)], "StoreCurb", Z_)
    p.face([(xa, yb, 0), (xb, yb, 0), (xb, yb, h), (xa, yb, h)], "StoreCurb", Y_)
    p.face([(xa, ya, 0), (xa, yb, 0), (xa, yb, h), (xa, ya, h)], "StoreCurb", -X_)
    p.face([(xb, ya, 0), (xb, yb, 0), (xb, yb, h), (xb, ya, h)], "StoreCurb", X_)
    # the strips of apron back face that stand clear of the wall, each end
    for xl, xr in ((xa, -W / 2), (W / 2, xb)):
        p.face([(xl, ya, 0), (xr, ya, 0), (xr, ya, h), (xl, ya, h)], "StoreConcrete", -Y_)


# ---------------------------------------------------------------------------
# Sign board + ice chest (the textured parts)
# ---------------------------------------------------------------------------
def sign_outline(d=0.0):
    """Board outline inset by d (metres), CCW in (x, z): a rectangle with a concave
    quarter-round notch at each corner.  Inset is exact: edges move in by d, notch radius
    grows by d about the same corner."""
    rho = SIGN_R + d
    k = math.sqrt(rho * rho - d * d)
    pts = []
    for cx, cz in ((SIGN_HW, -SIGN_HH), (SIGN_HW, SIGN_HH), (-SIGN_HW, SIGN_HH), (-SIGN_HW, -SIGN_HH)):
        sx, sz = (1 if cx > 0 else -1), (1 if cz > 0 else -1)
        # CCW around the board: on the right edge we come up (+z), so the notch at a corner
        # starts on the edge that leads into it and ends on the one that leaves it.
        a = (-sx * d, -sz * k) if sx * sz > 0 else (-sx * k, -sz * d)
        b = (-sx * k, -sz * d) if sx * sz > 0 else (-sx * d, -sz * k)
        a0 = math.atan2(a[1], a[0])
        da = (math.atan2(b[1], b[0]) - a0 + math.pi) % (2 * math.pi) - math.pi   # short way
        for i in range(SIGN_ARC + 1):
            t = a0 + da * i / SIGN_ARC
            pts.append((cx + rho * math.cos(t), cz + rho * math.sin(t)))
    return pts


def sign_uv(x, z):
    """Board metres -> atlas.  u runs along -X: the board faces +Y, so the viewer's right
    is -X (check_uv_handedness proves it)."""
    return (0.5 - x / (2 * SIGN_HW), 0.75 + z / (2 * SIGN_HW))


def sign(p):
    yb = YF + SKIN_OUT + BAT_D + 0.01
    yf = yb + SIGN_T
    ol = sign_outline()
    p.face([(x, yf, SIGN_ZC + z) for x, z in ol], "StoreSign", Y_,
           [sign_uv(x, z) for x, z in ol])
    n = len(ol)
    cx = Vector((0, 0, SIGN_ZC))
    for i in range(n):
        (ax, az), (bx, bz) = ol[i], ol[(i + 1) % n]
        out = Vector((bz - az, 0, -(bx - ax)))   # CCW in (x, z): outward is the right normal
        p.face([(ax, yb, SIGN_ZC + az), (bx, yb, SIGN_ZC + bz), (bx, yf, SIGN_ZC + bz),
                (ax, yf, SIGN_ZC + az)], "StoreSign", out, PATCH["ink"])


def ice_chest(p):
    x0, x1 = ICE_X0, ICE_X0 + ICE_W
    y0 = YF + ICE_GAP
    y1 = y0 + ICE_DP
    z0, z1 = AP_H, AP_H + ICE_H
    box(p, (x0, y0, z0), (x1, y1, z1), "StoreSign", skip={"bot"}, uv=PATCH["white"])
    dw, dh, dz = ICE_DOOR
    gap = (ICE_W - 2 * dw) / 3
    for k in range(2):
        dx0 = x0 + gap + k * (dw + gap)
        box(p, (dx0, y1, z0 + dz), (dx0 + dw, y1 + 0.03, z0 + dz + dh), "StoreSign",
            skip={0}, uv=PATCH["grey"])
        hx = dx0 + dw - 0.10 if k == 0 else dx0 + 0.06
        box(p, (hx, y1 + 0.03, z0 + dz + dh * 0.45), (hx + 0.04, y1 + 0.07, z0 + dz + dh * 0.70),
            "StoreRoof", skip={0})
    pw, ph, pt = ICE_PLAQ
    px0 = (x0 + x1) / 2 - pw / 2
    box(p, (px0, y1 - pt, z1), (px0 + pw, y1, z1 + ph), "StoreSign", skip={"bot", 2},
        uv=PATCH["white"])
    p.face([(px0, y1, z1), (px0 + pw, y1, z1), (px0 + pw, y1, z1 + ph), (px0, y1, z1 + ph)],
           "StoreSign", Y_, [(1, 0.1875), (0, 0.1875), (0, 0.4375), (1, 0.4375)])


def build_part():
    p = Part("GeneralStore")
    stucco(p)
    skins(p)
    front(p)
    side_windows(p)
    roof(p)
    apron(p)
    lot(p)
    sign(p)
    ice_chest(p)
    return p


# ---------------------------------------------------------------------------
# Atlas bake
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
    """Orthographic render of flat emitters over the unit square = the atlas."""
    for img in list(bpy.data.images):
        if img.name.startswith("GeneralStoreAtlas"):
            bpy.data.images.remove(img)
    engines = {i.identifier for i in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items}
    sc = bpy.data.scenes.new("AtlasBake")
    sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engines else 'BLENDER_EEVEE'
    sc.render.resolution_x = sc.render.resolution_y = TEX
    sc.render.resolution_percentage = 100
    sc.render.dither_intensity = 0.0          # flat artwork: dither only bloats the PNG
    # No render-stamp metadata (date, render time...): it lands in the PNG's tEXt chunks and makes
    # every re-run differ from the last, so "re-export comes out byte-identical" could never hold.
    for k in dir(sc.render):
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
    junk, mats = [], []
    layer = [0]

    def z():
        layer[0] += 1
        return layer[0] * 0.01

    def poly(pts, col):
        me = bpy.data.meshes.new("a")
        me.from_pydata([(u, v, z()) for u, v in pts], [], [list(range(len(pts)))])
        o = bpy.data.objects.new("a", me)
        m = _emission("a", INK[col] if isinstance(col, str) else col)
        mats.append(m)
        me.materials.append(m)
        sc.collection.objects.link(o)
        junk.append(o)

    def rect(u0, v0, u1, v1, col):
        poly([(u0, v0), (u1, v0), (u1, v1), (u0, v1)], col)

    def text(body, font, uc, vc, scale_m, w, h, col):
        """Fit `body` inside w x h metres; place its glyph-box centre at atlas (uc, vc)."""
        cu = bpy.data.curves.new("t", type='FONT')
        cu.body = body
        cu.offset = GLYPH_OFFSET
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
        k = min(w / (max(xs) - min(xs)), h / (max(ys) - min(ys))) * scale_m
        o.scale = (k, k, 1)
        o.location = (uc - k * (max(xs) + min(xs)) / 2, vc - k * (max(ys) + min(ys)) / 2, z())

    rect(0, 0, 1, 1, "ink")
    # flat patches
    for key, (u, v) in PATCH.items():
        if key != "ink":
            rect(u - 0.125, 0, u + 0.125, 0.125, "white" if key == "spare" else key)
    # the sign board: outline insets, in board metres -> atlas
    s = 1 / (2 * SIGN_HW)
    for d, col in ((0.0, "ink"), (0.045, "cream"), (0.075, "red"), (0.090, "cream")):
        poly([sign_uv(x, zz) for x, zz in sign_outline(d)], col)
    for body, zc, w, h, col, shadow in SIGN_LINES:
        uc, vc = sign_uv(0, zc)
        if shadow:
            text(body, SIGN_FONT, uc + SIGN_SHADOW * s, vc - SIGN_SHADOW * s, s, w, h, "ink")
        text(body, SIGN_FONT, uc, vc, s, w, h, col)
    # the ICE placard: 1.6 x 0.4 m -> u 0..1, v 0.1875..0.4375
    pw, ph, _ = ICE_PLAQ
    q = 1 / pw
    ice = lambda x, zz: (0.5 + x * q, 0.3125 + zz * q)
    rect(*ice(-pw / 2, -ph / 2), *ice(pw / 2, ph / 2), "white")
    rect(*ice(-pw / 2 + 0.03, -ph / 2 + 0.03), *ice(pw / 2 - 0.03, ph / 2 - 0.03), "red")
    rect(*ice(-pw / 2 + 0.05, -ph / 2 + 0.05), *ice(pw / 2 - 0.05, ph / 2 - 0.05), "white")
    text("ICE", ICE_FONT, *ice(0, 0), q, 1.0, 0.22, "red")

    path = os.path.join(bpy.app.tempdir, "general-store-atlas.png")
    sc.render.filepath = path
    win = bpy.context.window
    prev = win.scene
    win.scene = sc
    try:
        bpy.ops.render.render(write_still=True)
    finally:
        win.scene = prev
    img = bpy.data.images.load(path, check_existing=False)
    img.name = "GeneralStoreAtlas"
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


def check_facing(ob, n=24):
    """Ray-cast from a ring of eyes at the model; every first hit must face back at the ray."""
    from mathutils.bvhtree import BVHTree
    tree = BVHTree.FromObject(ob, bpy.context.evaluated_depsgraph_get())
    bad = hits = 0
    targets = [Vector((x, y, z)) for x in (-3, 0, 3) for y in (-2, 0, 2, 3.5) for z in (0.5, 1.5, 2.5, 4)]
    eyes = [Vector((math.cos(a) * 25, math.sin(a) * 25, h))
            for a in [2 * math.pi * k / n for k in range(n)] for h in (1.5, 5, 18)]
    for e in eyes:
        for t in targets:
            d = (t - e).normalized()
            loc, nrm, i, dist = tree.ray_cast(e, d)
            if loc is None:
                continue
            hits += 1
            bad += nrm.dot(d) > 0
    return bad, hits


def check_uv_handedness(ob):
    """Every textured face whose UVs span an area must map image-right to the viewer's
    right: (dP/du x dP/dv) . n > 0.  A mirrored face reads backwards text."""
    me = ob.data
    uvl = me.uv_layers.active.data
    sign_idx = [i for i, m in enumerate(me.materials) if m.name.startswith("StoreSign")]
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
            continue                        # a flat-patch face: no orientation to get wrong
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
    lo = [min(v.co[i] for v in ob.data.vertices) for i in range(3)]
    hi = [max(v.co[i] for v in ob.data.vertices) for i in range(3)]
    print("=" * 60)
    print(f"  GeneralStore  {t} tris (budget {TRI_BUDGET})  materials {len(ob.data.materials)}"
          f"  images {len(bpy.data.images)}")
    print(f"  bbox  x {lo[0]:.2f}..{hi[0]:.2f}  y {lo[1]:.2f}..{hi[1]:.2f}  z {lo[2]:.2f}..{hi[2]:.2f}")
    print(f"  park zone (glTF model frame): {park_zone()}")
    print(f"  seat on an 11.2 m pad (lot front = pad road edge): {hi[1] - 5.6:.2f}")
    print(f"  facing: {bad} inverted first-hits of {hits}")
    print(f"  uv handedness: {mir} mirrored of {tex} lettered faces")
    print("=" * 60)
    return ob


def export():
    build()
    bpy.ops.export_scene.gltf(
        filepath=f"{OUT_DIR}/{NAME}.glb", export_format="GLB",
        export_draco_mesh_compression_enable=False, export_yup=True,
        export_apply=True, export_materials="EXPORT", export_texcoords=True,
        export_normals=True, export_cameras=False, export_lights=False,
        export_image_format="AUTO", use_selection=False)
    print(f"  wrote {OUT_DIR}/{NAME}.glb")
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    print(f"  wrote {OUT_BLEND}")


if __name__ == "__main__":
    build()
