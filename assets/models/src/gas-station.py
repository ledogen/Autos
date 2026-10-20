"""
ASSET-13 — the GAS STATION.  Parametric generator.

Built for: Blender 5.2 LTS  |  PROMOTED 2026-10-20 (owner) from wip/ to assets/models/ + assets/models/src/.
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md
Template: assets/models/src/general-store.py (Part / face() winding / atlas bake / checks).

A small rural station that IS the convenience store (FEAT-123, owner 2026-10-16).  Layout by the
owner (2026-10-19): ONE island, right in front of the store's doors, with a lane either side running
ALONG the street, so the player drives straight through past the pump and back onto the road.

    BACK     the STORE: 9 x 5.0 m single storey, flat roof behind a parapet with a red band,
             a box sign (FOOD MART) on the parapet, a red mansard over white storefront frames
             and dark glass, a concrete stoop with an ICE chest and a PROPANE exchange cage.
    SIDE     STOREFRONT PARKING: two 2.55 x 6.0 m nose-in bays beside the store's +X end wall, the
             registry's `park` box, clear of both pump zones.
    SLAB     one concrete rectangle, under everything, from the store's back wall to 1.4 m short of
             the road edge — the pad is flat only from there in (see SLAB below); a dirt apron.
    FRONT    the FORECOURT: the slab in front of the stoop, under a flat canopy
             (8.0 x 6.0 m, soffit 4.6 m, fascia top 5.5 m) on two island posts, cantilevered over
             both lanes.  One island along the street, one simplified pump on the door's centre
             line, a hose and nozzle at each end, bollards, a bin.  Two lanes, one `pumpZones` box each.

    DEPTH (the tight axis), road edge -> back wall:  front lane 2.6 | island 1.2 | back lane 2.6 |
    stoop 1.0 | store 5.0 = 12.4 m.  On the FARM pad (22 x 11.2 m) the back wall stands 1.2 m into
    the 1.6 m rim band (PAD_RIM_HOLD) — the barn's exact precedent.  Each pump zone keeps 0.35 m to
    the pad's road edge / the stoop face.  The FOOD MART sign stays readable UNDER the soffit from a
    1.5 m eye on the road (78-100% of it, 8-60 m out; posts and the pump take the rest).

    GasStation   one mesh, 7 materials, ONE 1024x512 atlas (FOOD MART, GAS x3, ICE, PROPANE,
                 the pump register face, flat patches)

AXES.  Blender +Y = glTF -Z = forward = the road.  Length (11 m) runs along X = along the road,
so the marker's own yaw fits it to a pad with no yawOffset.  Base-seated: the forecourt is z = 0,
centred on the canopy/door line along X (the slab runs x -5.5..11.2, so seatAlong centres it on a
pad — build() prints it) and on the 12.4 m depth (road edge y +6.2, back wall y -6.2).

MATERIALS (the night hooks are addressable, nothing glows in the file — ticket ASSET-13):
    StationFascia   canopy fascia, posts, storefront frames, ice chest, tanks — RECOLOURABLE (brand)
    StationAccent   the red: fascia stripe, store band, pump cabinets, bollards — RECOLOURABLE (brand)
    StationLamp     the six soffit lenses — the LIGHTING HOOK (attach lights / emissive at placement)
    StationSign     the atlas — every lettered face; lit at night it lights all of them
    StationWall     store block + canopy soffit
    StationConcrete slab, curbs, stoop, collars, HVAC
    StationDark     glass, roofs, cage frame, hoses, nozzles

WINDING.  Every face goes through face(), which flips the polygon to point along `out`.
check_facing() proves it by ray cast; check_uv_handedness() proves no lettered face is mirrored.
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
OUT_BLEND = f"{OUT_DIR}/src/gas-station.blend"
NAME = "gas-station"
TRI_BUDGET = 3500

# --- DEPTH, road edge (+Y) to back wall, all on the farm pad's 11.2 m + the barn's 1.2 m into the
# rim band:  front lane 2.6 | island 1.2 | back lane 2.6 | stoop 1.0 | store 5.0  = 12.4 m ---
# --- store (behind the island) ---
ST_X = (-4.5, 4.5)
ST_Y = (-6.2, -1.2)          # back wall, front wall
WALL_H = 3.70                # roof deck
PARAPET = 4.50
WT = 0.20                    # parapet thickness (its inner face is the only "inside" built)
COPE = (0.05, 0.08)          # coping overhang, thickness
BAND_Z = (3.28, 3.42)        # red band round the whole store
BASE_Z = 0.55                # concrete plinth band: the dark base that sits the box down
STOOP_H, STOOP_D = 0.15, 1.00
FRAME_W, FRAME_T, REC = 0.10, 0.04, 0.10
DOOR = (-0.5, 0.5, 2.30)     # x0, x1, head — on the pump's centre line
WINS = ((-2.6, -0.7), (0.7, 2.6))
WIN_Z = (0.70, 2.30)
SIDE_WIN = (-3.70, 1.60, 1.00, 2.10)   # both end walls: centre y, width, sill, head
MANSARD = (0.75, 2.55)       # storefront overhang: projection, soffit height (top meets the band)
BACK_DOOR = (-3.0, -2.0, 2.10)
HVAC = ((-2.1, -4.5, WALL_H), (-0.7, -3.5, 4.78))

# --- ice chest + propane cage (on the stoop) ---
ICE_X = (2.88, 4.38)
ICE_DP, ICE_H = 0.80, 1.75
CAGE_X = (-4.35, -3.05)
CAGE_DP, CAGE_H = 0.80, 1.60
CAGE_SHELF = 0.93
TANK_R, TANK_H = 0.15, 0.50

# --- forecourt (in front of the store: two lanes along the street, one island between) ---
# ONE rectangle, road edge to the store's back wall, under everything (owner 2026-10-19: an L-shaped
# slab with the store hanging off its back read as a building half off its pad).  Its back 1.2 m lies
# past the farm pad's far edge, inside the 1.6 m PAD_RIM_HOLD band the carve keeps at full pad depth;
# its corners at pad u +-7.9 stay on the pad's straight edge (corner rounding starts at u +-9.5).
ROAD_EDGE = 6.2              # the pad's road edge (seat 0.6 on the farm pad's 5.6 m half-depth)
# The slab STOPS 1.4 m short of it.  The pad is only flat from there in: its near edge stands
# poiPadGap 0.6 m past the shoulder, and src/road.js _poiPadCarve has no authority inside the
# ribbon + shoulder and ramps to full over POI_ROAD_FEATHER 2.0 m — 1.4 m into the pad.  Across that
# strip the ground follows the ROAD's grade (measured seed 6: -0.7..+0.4 m against the pad along the
# slab's 15.8 m), so a slab out to the edge floated at one end and was buried at the other.  The strip
# is bare dirt apron, ratified by design: a pad can never move the road.
SLAB = ((-5.5, -6.2), (10.3, ROAD_EDGE - 1.4))   # +X end 0.3 m past the outer bay line
# --- STOREFRONT PARKING (owner 2026-10-19): two nose-in bays beside the store's +X end wall, clear
# of both pump zones (x +-2.6), entered from the back lane. ---
BAY_LINES_X = (4.9, 7.45, 10.0)    # 2.55 m bays (truck 1.85); the first line stands 0.4 m off the wall
BAY_LINES_Y = (-5.8, 0.2)    # 6.0 m lines (truck 4.7): nose 0.4 m short of the slab's back edge
LINE_W, LINE_UP = 0.10, 0.005      # painted line width; laid this far proud of the slab (z-fight)
PAD_LEN = 22.0               # the farm pad, for the printed seatAlong
SLAB_Z, SKIRT = 0.03, 0.12
CAN = ((-4.0, 0.0), (4.0, 6.0))
SOFFIT, CAN_TOP, RIM, DECK = 4.60, 5.50, 0.15, 5.30
STRIPE = (4.98, 5.16)
ISL_YC = (3.0,)
ISL_X = (-2.5, 2.5)
ISL_HW, ISL_H, ISL_NOSE = 0.60, 0.18, 0.35     # half width, curb height, nose taper length
POST_X = (-1.8, 1.8)            # two posts on the island: the canopy cantilevers over both lanes
POST_S, COLLAR_S, COLLAR_H = 0.30, 0.50, 0.90
BOLLARD_X = (-2.2, 2.2)
BOLLARD_R, BOLLARD_H = 0.10, 0.90
BIN_X, BIN_R, BIN_H = 1.05, 0.22, 0.90
LAMPS_X, LAMPS_Y, LAMP = (-2.6, 0.0, 2.6), (4.9, 1.1), (0.9, 0.6, 0.06)   # over the lane centres

# --- pump (one per island, centred) ---
PUMP_X = 0.0
PLINTH = (1.10, 0.60, 0.12)
CAB = (0.90, 0.50, 1.25)     # w (X), d (Y), h above plinth
HEAD = (1.00, 0.56, 0.35)
GAUGE_W, GAUGE_ZC = 0.80, 1.17

# --- lanes / zones (printed for the registry, glTF frame) ---
LANE_HALF = 1.0              # pump zone half depth: the 1.85 m truck with slack

TEX_W, TEX_H = 1024, 512
SIGN_FONT = "/System/Library/Fonts/Supplemental/Arial Black.ttf"
DIGIT_FONT = "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf"

# Atlas regions in PIXELS (x0, y0, w, h), v up.  >= 32 px gutters.  A plate's height in metres is
# DERIVED from its region's aspect (plate_h), so the mesh and the artwork cannot drift apart.
REG = {
    "sign":    (0, 352, 1024, 160),
    "gas":     (0, 176, 480, 144),
    "ice":     (512, 208, 512, 112),
    "propane": (640, 96, 384, 80),
    "gauge":   (0, 0, 192, 144),
}
PLATE_W = {"sign": 5.6, "gas": 2.4, "ice": 1.30, "propane": 1.20, "gauge": GAUGE_W}
PATCH_PX = {"white": 256, "grey": 352, "ink": 448, "red": 544}   # 64 px squares at y 0..64

MATS = {
    #  name               base colour (linear)        rough
    "StationFascia":   ((0.780, 0.780, 0.760, 1.0), 0.60),
    "StationAccent":   ((0.420, 0.040, 0.025, 1.0), 0.60),
    "StationLamp":     ((0.850, 0.830, 0.750, 1.0), 0.30),
    "StationSign":     (None, 0.60),
    "StationWall":     ((0.520, 0.480, 0.410, 1.0), 0.90),
    "StationConcrete": ((0.300, 0.290, 0.270, 1.0), 0.95),
    "StationDark":     ((0.030, 0.031, 0.036, 1.0), 0.50),
}

INK = {
    "white": (0.780, 0.780, 0.760),
    "cream": (0.690, 0.660, 0.575),
    "grey":  (0.300, 0.310, 0.320),
    "ink":   (0.012, 0.012, 0.013),
    "red":   (0.420, 0.040, 0.025),
    "blue":  (0.020, 0.090, 0.330),
    "glass": (0.040, 0.045, 0.040),
    "lcd":   (0.550, 0.700, 0.420),
}

X_, Y_, Z_ = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
YF = ST_Y[1]                 # store front wall plane


def plate_h(key):
    _, _, w, h = REG[key]
    return PLATE_W[key] * h / w


def patch_uv(key):
    return ((PATCH_PX[key] + 32) / TEX_W, 32 / TEX_H)


# ---------------------------------------------------------------------------
# Geometry accumulator (general-store.py)
# ---------------------------------------------------------------------------
class Part:
    def __init__(self, name):
        self.name, self.v, self.f, self.m, self.uv = name, [], [], [], []

    def face(self, pts, mat, out, uv=None):
        pts = [Vector(p) for p in pts]
        if uv is None:
            uv = patch_uv("white")
        uvs = list(uv) if isinstance(uv[0], (tuple, list)) else [uv] * len(pts)
        n = Vector()
        for i, a in enumerate(pts):          # Newell normal
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
    """Axis box.  Side order: 0 -Y, 1 +X, 2 +Y, 3 -X."""
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    ring = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    solid(p, [(x, y, z0) for x, y in ring], [(x, y, z1) for x, y in ring], mat, skip, uv)


def ngon_ring(cx, cy, r, n=8, rot=math.pi / 8):
    return [(cx + r * math.cos(rot + 2 * math.pi * k / n), cy + r * math.sin(rot + 2 * math.pi * k / n))
            for k in range(n)]


def cyl(p, cx, cy, r, z0, z1, mat, n=8, skip=("bot",)):
    ring = ngon_ring(cx, cy, r, n)
    solid(p, [(x, y, z0) for x, y in ring], [(x, y, z1) for x, y in ring], mat, skip)


def frustum(p, cx, cy, r0, r1, z0, z1, mat, n=8, skip=("bot",)):
    solid(p, [(x, y, z0) for x, y in ngon_ring(cx, cy, r0, n)],
          [(x, y, z1) for x, y in ngon_ring(cx, cy, r1, n)], mat, skip)


def rect_ring(p, o, i, z0, z1, outer_bands, top_mat, inner_mat=None, inner_z0=None, bottom_mat=None):
    """A rectangular frame: outer rect o, inner rect i (each ((x0, y0), (x1, y1))).  Outer side
    faces in z bands [(za, zb, mat)], a top ring at z1, optional inner faces (inner_z0..z1) and a
    bottom ring at z0.  No two pieces overlap, so the corners cannot z-fight."""
    def corners(r):
        (x0, y0), (x1, y1) = r
        return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    O, I = corners(o), corners(i)
    outs = [-Y_, X_, Y_, -X_]
    for k in range(4):
        a, b, c, d = O[k], O[(k + 1) % 4], I[(k + 1) % 4], I[k]
        if top_mat:
            p.face([(*a, z1), (*b, z1), (*c, z1), (*d, z1)], top_mat, Z_)
        if bottom_mat:
            p.face([(*a, z0), (*b, z0), (*c, z0), (*d, z0)], bottom_mat, -Z_)
        for za, zb, m in outer_bands:
            p.face([(*a, za), (*b, za), (*b, zb), (*a, zb)], m, outs[k])
        if inner_mat:
            p.face([(*d, inner_z0), (*c, inner_z0), (*c, z1), (*d, z1)], inner_mat, -outs[k])


def plate(p, c, out, key, thick=0.03, edge="ink", back=False):
    """A lettered plate centred at c, face pointing `out`, back on the surface it is mounted to.
    UVs by construction: image-right = the viewer's right = Z x out (check_uv_handedness proves it)."""
    c, N = Vector(c), Vector(out).normalized()
    R = Z_.cross(N).normalized()
    w, h = PLATE_W[key], plate_h(key)
    x0, y0, rw, rh = REG[key]
    u0, u1, v0, v1 = x0 / TEX_W, (x0 + rw) / TEX_W, y0 / TEX_H, (y0 + rh) / TEX_H
    P = lambda s, t, d: c + R * (s * w / 2) + Z_ * (t * h / 2) + N * d
    p.face([P(-1, -1, thick), P(1, -1, thick), P(1, 1, thick), P(-1, 1, thick)], "StationSign", N,
           [(u0, v0), (u1, v0), (u1, v1), (u0, v1)])
    if back:
        p.face([P(-1, -1, 0), P(1, -1, 0), P(1, 1, 0), P(-1, 1, 0)], "StationSign", -N, patch_uv(edge))
    if thick <= 0:
        return
    for (sa, ta), (sb, tb), o in (((-1, -1), (1, -1), -Z_), ((1, -1), (1, 1), R),
                                  ((1, 1), (-1, 1), Z_), ((-1, 1), (-1, -1), -R)):
        p.face([P(sa, ta, 0), P(sb, tb, 0), P(sb, tb, thick), P(sa, ta, thick)], "StationSign", o,
               patch_uv(edge))


def tube(p, pts, r, mat, up=Z_):
    """Square-section tube along a polyline (hoses), capped both ends."""
    pts = [Vector(q) for q in pts]
    rings = []
    for i, q in enumerate(pts):
        a, b = pts[max(i - 1, 0)], pts[min(i + 1, len(pts) - 1)]
        t = (b - a).normalized()
        s = t.cross(up)
        if s.length < 1e-6:
            s = t.cross(X_)
        s.normalize()
        u = s.cross(t).normalized()
        rings.append([q + (s * math.cos(k * math.pi / 2 + math.pi / 4) +
                           u * math.sin(k * math.pi / 2 + math.pi / 4)) * r for k in range(4)])
    p.face(rings[0], mat, pts[0] - pts[1])
    p.face(rings[-1], mat, pts[-1] - pts[-2])
    for ra, rb, qa, qb in zip(rings, rings[1:], pts, pts[1:]):
        mid = (qa + qb) / 2
        for k in range(4):
            quad = [ra[k], ra[(k + 1) % 4], rb[(k + 1) % 4], rb[k]]
            p.face(quad, mat, sum(quad, Vector()) / 4 - mid)


# ---------------------------------------------------------------------------
# Store
# ---------------------------------------------------------------------------
def holes_front():
    return ([(DOOR[0], DOOR[1], STOOP_H, DOOR[2], "door")] +
            [(a, b, WIN_Z[0], WIN_Z[1], "win") for a, b in WINS])


def wall_mat(cz):
    if cz < BASE_Z:
        return "StationConcrete"
    return "StationAccent" if BAND_Z[0] < cz < BAND_Z[1] else "StationWall"


def store_walls(p):
    (x0, x1), (y0, y1) = ST_X, ST_Y
    zs_plain = [0.0, BASE_Z, BAND_Z[0], BAND_Z[1], PARAPET]
    for za, zb in zip(zs_plain, zs_plain[1:]):
        m = wall_mat((za + zb) / 2)
        p.face([(x0, y0, za), (x1, y0, za), (x1, y0, zb), (x0, y0, zb)], m, -Y_)   # back
        p.face([(x0, y0, za), (x0, y1, za), (x0, y1, zb), (x0, y0, zb)], m, -X_)   # -X end
        p.face([(x1, y0, za), (x1, y1, za), (x1, y1, zb), (x1, y0, zb)], m, X_)    # +X side
    holes = holes_front()
    xs = sorted({x0, x1, *[h[0] for h in holes], *[h[1] for h in holes]})
    zs = sorted({STOOP_H, BASE_Z, BAND_Z[0], BAND_Z[1], PARAPET, *[h[2] for h in holes], *[h[3] for h in holes]})
    for xa, xb in zip(xs, xs[1:]):
        for za, zb in zip(zs, zs[1:]):
            cx, cz = (xa + xb) / 2, (za + zb) / 2
            if any(h[0] < cx < h[1] and h[2] < cz < h[3] for h in holes):
                continue
            p.face([(xa, YF, za), (xb, YF, za), (xb, YF, zb), (xa, YF, zb)], wall_mat(cz), Y_)


def opening(p, x0, x1, z0, z1, kind):
    door = kind == "door"
    yb, yf, fw = YF - REC, YF + FRAME_T, FRAME_W
    p.face([(x0, yb, z0), (x0, yf, z0), (x0, yf, z1), (x0, yb, z1)], "StationFascia", X_)
    p.face([(x1, yb, z0), (x1, yf, z0), (x1, yf, z1), (x1, yb, z1)], "StationFascia", -X_)
    p.face([(x0, yb, z1), (x1, yb, z1), (x1, yf, z1), (x0, yf, z1)], "StationFascia", -Z_)
    ys = YF if door else yf
    p.face([(x0, yb, z0), (x1, yb, z0), (x1, ys, z0), (x0, ys, z0)],
           "StationConcrete" if door else "StationFascia", Z_)
    zb = z0 if door else z0 - fw
    box(p, (x0 - fw, YF, zb), (x0, yf, z1 + fw), "StationFascia", skip={0, 1} | ({"bot"} if door else set()))
    box(p, (x1, YF, zb), (x1 + fw, yf, z1 + fw), "StationFascia", skip={0, 3} | ({"bot"} if door else set()))
    box(p, (x0, YF, z1), (x1, yf, z1 + fw), "StationFascia", skip={0, 1, 3, "bot"})
    if not door:
        box(p, (x0, YF, z0 - fw), (x1, yf, z0), "StationFascia", skip={0, 1, 3, "top"})
    # the glass, and its white stiles / mullion laid on it
    p.face([(x0, yb, z0), (x1, yb, z0), (x1, yb, z1), (x0, yb, z1)], "StationDark", Y_)
    st = 0.05
    if door:
        xm = (x0 + x1) / 2                       # double glass door: centre stile + push bar
        box(p, (xm - st / 2, yb, z0 + 0.12), (xm + st / 2, yb + 0.02, z1), "StationFascia", skip={0, "bot", "top"})
        box(p, (x0, yb, z0), (x1, yb + 0.02, z0 + 0.12), "StationFascia", skip={0, 1, 3, "bot"})
        box(p, (x0 + 0.08, yb + 0.02, 1.02), (x1 - 0.08, yb + 0.05, 1.06), "StationDark", skip={0})
    else:
        xm = (x0 + x1) / 2
        box(p, (xm - st / 2, yb, z0), (xm + st / 2, yb + 0.02, z1), "StationFascia", skip={0, "bot", "top"})


def side_windows(p):
    """One per end wall, proud of the sealed wall (the RV trick): white frame ring round dark glass."""
    yc, w, z0, z1 = SIDE_WIN
    fw, ft = FRAME_W, FRAME_T
    u0, u1 = yc - w / 2, yc + w / 2
    for xw, sx in ((ST_X[1], 1), (ST_X[0], -1)):
        xa, xb = sorted((xw, xw + sx * ft))
        wall = 3 if sx > 0 else 1                 # the box face lying on the wall
        box(p, (xa, u0 - fw, z0 - fw), (xb, u0, z1 + fw), "StationFascia", skip={wall})
        box(p, (xa, u1, z0 - fw), (xb, u1 + fw, z1 + fw), "StationFascia", skip={wall})
        box(p, (xa, u0, z1), (xb, u1, z1 + fw), "StationFascia", skip={0, 2, wall})
        box(p, (xa, u0, z0 - fw), (xb, u1, z0), "StationFascia", skip={0, 2, wall})
        xg = xw + sx * 0.01
        p.face([(xg, u0, z0), (xg, u1, z0), (xg, u1, z1), (xg, u0, z1)], "StationDark", X_ * sx)


def mansard(p):
    """Red sloped overhang across the storefront: wall at the band's foot -> MANSARD out, a drip
    edge, a flat soffit back to the wall, triangular end caps."""
    (x0, x1), (dp, zs) = ST_X, MANSARD
    zt, drip = BAND_Z[0], 0.06
    yo = YF + dp
    up = Vector((0, zt - zs - drip, dp))
    p.face([(x0, YF, zt), (x1, YF, zt), (x1, yo, zs + drip), (x0, yo, zs + drip)], "StationAccent", up)
    p.face([(x0, yo, zs), (x1, yo, zs), (x1, yo, zs + drip), (x0, yo, zs + drip)], "StationAccent", Y_)
    p.face([(x0, YF, zs), (x1, YF, zs), (x1, yo, zs), (x0, yo, zs)], "StationWall", -Z_)
    for x, o in ((x0, -X_), (x1, X_)):
        p.face([(x, YF, zs), (x, yo, zs), (x, yo, zs + drip), (x, YF, zt)], "StationAccent", o)


def back_door(p):
    x0, x1, z1 = BACK_DOOR
    y, fw = ST_Y[0], 0.08
    box(p, (x0, y - 0.04, 0.0), (x1, y, z1), "StationDark", skip={2, "bot"})
    box(p, (x0 - fw, y - 0.06, 0.0), (x0, y, z1 + fw), "StationFascia", skip={2, "bot"})
    box(p, (x1, y - 0.06, 0.0), (x1 + fw, y, z1 + fw), "StationFascia", skip={2, "bot"})
    box(p, (x0, y - 0.06, z1), (x1, y, z1 + fw), "StationFascia", skip={1, 2, 3})


def roof_and_parapet(p):
    (x0, x1), (y0, y1) = ST_X, ST_Y
    ov, ct = COPE
    rect_ring(p, ((x0 - ov, y0 - ov), (x1 + ov, y1 + ov)), ((x0 + WT + ov, y0 + WT + ov), (x1 - WT - ov, y1 - WT - ov)),
              PARAPET, PARAPET + ct, [(PARAPET, PARAPET + ct, "StationDark")], "StationDark",
              "StationDark", PARAPET, "StationDark")
    # parapet inner faces (seen from the canopy top / the air) and the roof deck
    i = ((x0 + WT, y0 + WT), (x1 - WT, y1 - WT))
    (ix0, iy0), (ix1, iy1) = i
    for a, b, o in (((ix0, iy0), (ix1, iy0), Y_), ((ix1, iy0), (ix1, iy1), -X_),
                    ((ix1, iy1), (ix0, iy1), -Y_), ((ix0, iy1), (ix0, iy0), X_)):
        p.face([(*a, WALL_H), (*b, WALL_H), (*b, PARAPET), (*a, PARAPET)], "StationWall", o)
    p.face([(ix0, iy0, WALL_H), (ix1, iy0, WALL_H), (ix1, iy1, WALL_H), (ix0, iy1, WALL_H)], "StationDark", Z_)
    (hx0, hy0, hz0), (hx1, hy1, hz1) = HVAC
    box(p, (hx0, hy0, hz0), (hx1, hy1, hz1), "StationConcrete", skip={"bot"})
    for k in range(4):                           # grille slats on its road face
        z = hz0 + 0.2 + k * 0.17
        box(p, (hx0 + 0.1, hy1, z), (hx1 - 0.1, hy1 + 0.03, z + 0.07), "StationDark", skip={0})
    cyl(p, (hx0 + hx1) / 2, (hy0 + hy1) / 2, 0.32, hz1, hz1 + 0.04, "StationDark")


def store_sign(p):
    w, h = PLATE_W["sign"], plate_h("sign")
    xc = (ST_X[0] + ST_X[1]) / 2
    zc = PARAPET - 0.07 - h / 2
    d = 0.22
    box(p, (xc - w / 2, YF, zc - h / 2), (xc + w / 2, YF + d, zc + h / 2), "StationDark", skip={0, 2})
    plate(p, (xc, YF + d, zc), Y_, "sign", thick=0.02)


def stoop(p):
    (x0, x1), y0, y1 = ST_X, YF, YF + STOOP_D
    box(p, (x0, y0, 0.0), (x1, y1, STOOP_H), "StationConcrete", skip={0, "bot"})


def ice_chest(p):
    x0, x1 = ICE_X
    y0, y1 = YF + 0.10, YF + 0.10 + ICE_DP
    z0, z1 = STOOP_H, STOOP_H + ICE_H
    box(p, (x0, y0, z0), (x1, y1, z1), "StationFascia", skip={"bot"})
    W = x1 - x0
    dw, dh, dz = 0.62, 1.20, 0.25
    gap = (W - 2 * dw) / 3
    for k in range(2):
        dx0 = x0 + gap + k * (dw + gap)
        box(p, (dx0, y1, z0 + dz), (dx0 + dw, y1 + 0.03, z0 + dz + dh), "StationConcrete", skip={0})
        hx = dx0 + dw - 0.10 if k == 0 else dx0 + 0.06
        box(p, (hx, y1 + 0.03, z0 + dz + dh * 0.45), (hx + 0.04, y1 + 0.07, z0 + dz + dh * 0.70),
            "StationDark", skip={0})
    h = plate_h("ice")
    box(p, ((x0 + x1) / 2 - PLATE_W["ice"] / 2, y1 - 0.06, z1), ((x0 + x1) / 2 + PLATE_W["ice"] / 2, y1 - 0.03, z1 + h),
        "StationFascia", skip={"bot", 2})
    plate(p, ((x0 + x1) / 2, y1 - 0.03, z1 + h / 2), Y_, "ice", thick=0.0)


def propane_cage(p):
    x0, x1 = CAGE_X
    y0, y1 = YF + 0.08, YF + 0.08 + CAGE_DP
    z0, z1 = STOOP_H, STOOP_H + CAGE_H
    s, t = 0.05, 0.04
    for xa, ya in ((x0, y0), (x1 - s, y0), (x0, y1 - s), (x1 - s, y1 - s)):
        box(p, (xa, ya, z0), (xa + s, ya + s, z1 - t), "StationDark", skip={"bot", "top"})
    box(p, (x0, y0, z1 - t), (x1, y1, z1), "StationDark")                       # lid
    box(p, (x0 + s, y0 + s, z0), (x1 - s, y1 - s, z0 + 0.04), "StationDark", skip={"bot"})
    box(p, (x0 + s, y0 + s, CAGE_SHELF), (x1 - s, y1 - s, CAGE_SHELF + 0.04), "StationDark")
    bw, bd = 0.022, 0.015
    n = 11                                                                     # front bars
    for k in range(n):
        x = x0 + s + (x1 - x0 - 2 * s) * (k + 0.5) / n
        box(p, (x - bw / 2, y1 - bd, z0 + 0.04), (x + bw / 2, y1, z1 - t), "StationDark",
            skip={"bot", "top"})
    for xs in (x0, x1 - bd):                                                   # end bars
        for k in range(6):
            y = y0 + s + (y1 - y0 - 2 * s) * (k + 0.5) / 6
            box(p, (xs, y - bw / 2, z0 + 0.04), (xs + bd, y + bw / 2, z1 - t), "StationDark",
                skip={"bot", "top"})
    yc = (y0 + y1) / 2
    for zb in (z0 + 0.04, CAGE_SHELF + 0.04):                                  # 2 x 3 tanks
        for k in range(3):
            xc = x0 + s + (x1 - x0 - 2 * s) * (k + 0.5) / 3
            cyl(p, xc, yc, TANK_R, zb, zb + TANK_H * 0.75, "StationFascia", skip=("bot", "top"))
            frustum(p, xc, yc, TANK_R, 0.06, zb + TANK_H * 0.75, zb + TANK_H, "StationFascia", skip=("bot",))
    h = plate_h("propane")
    plate(p, ((x0 + x1) / 2, y1 - 0.30, z1 + h / 2), Y_, "propane", thick=0.03, back=True)
    box(p, ((x0 + x1) / 2 - 0.4, y1 - 0.33, z1), ((x0 + x1) / 2 + 0.4, y1 - 0.30, z1 + 0.04),
        "StationDark", skip={"bot", 2})


# ---------------------------------------------------------------------------
# Forecourt
# ---------------------------------------------------------------------------
def slab(p):
    """The whole site's slab, with a skirt down into the pad; the store stands on it."""
    (x0, y0), (x1, y1) = SLAB
    rect_ring(p, ((x0, y0), (x1, y1)), ((x0, y0), (x1, y1)), -SKIRT, SLAB_Z,
              [(-SKIRT, SLAB_Z, "StationConcrete")], None)
    p.face([(x0, y0, SLAB_Z), (x1, y0, SLAB_Z), (x1, y1, SLAB_Z), (x0, y1, SLAB_Z)], "StationConcrete", Z_)
    z, (ya, yb) = SLAB_Z + LINE_UP, BAY_LINES_Y
    for x in BAY_LINES_X:
        w = LINE_W / 2
        p.face([(x - w, ya, z), (x + w, ya, z), (x + w, yb, z), (x - w, yb, z)], "StationFascia", Z_)


def island_ring(yc):
    a, b = ISL_X
    hw, nl, tip = ISL_HW, ISL_NOSE, 0.25
    return [(a, yc - tip), (a + nl, yc - hw), (b - nl, yc - hw), (b, yc - tip),
            (b, yc + tip), (b - nl, yc + hw), (a + nl, yc + hw), (a, yc + tip)]


def island(p, yc):
    r = island_ring(yc)
    solid(p, [(x, y, SLAB_Z) for x, y in r], [(x, y, ISL_H) for x, y in r], "StationConcrete", skip=("bot",))
    for x in POST_X:
        box(p, (x - COLLAR_S / 2, yc - COLLAR_S / 2, ISL_H), (x + COLLAR_S / 2, yc + COLLAR_S / 2, COLLAR_H),
            "StationConcrete", skip={"bot"})
        box(p, (x - POST_S / 2, yc - POST_S / 2, COLLAR_H), (x + POST_S / 2, yc + POST_S / 2, SOFFIT),
            "StationFascia", skip={"bot", "top"})
    for x in BOLLARD_X:
        cyl(p, x, yc, BOLLARD_R, ISL_H, ISL_H + BOLLARD_H, "StationAccent")
    cyl(p, BIN_X, yc, BIN_R, ISL_H, ISL_H + BIN_H, "StationDark", skip=("bot", "top"))
    cyl(p, BIN_X, yc, BIN_R + 0.02, ISL_H + BIN_H, ISL_H + BIN_H + 0.06, "StationFascia")
    pump(p, yc)


def pump(p, yc):
    x, (pw, pd, ph) = PUMP_X, PLINTH
    z0 = ISL_H
    box(p, (x - pw / 2, yc - pd / 2, z0), (x + pw / 2, yc + pd / 2, z0 + ph), "StationConcrete", skip={"bot"})
    cw, cd, chh = CAB
    zc0, zc1 = z0 + ph, z0 + ph + chh
    box(p, (x - cw / 2, yc - cd / 2, zc0), (x + cw / 2, yc + cd / 2, zc1), "StationAccent", skip={"bot", "top"})
    hw, hd, hh = HEAD
    box(p, (x - hw / 2, yc - hd / 2, zc1), (x + hw / 2, yc + hd / 2, zc1 + hh), "StationFascia")
    for sy in (1, -1):                                     # register face on each lane side
        plate(p, (x, yc + sy * cd / 2, GAUGE_ZC), Y_ * sy, "gauge", thick=0.008, edge="grey")
    for sx in (1, -1):                                     # a nozzle in a boot at each end + hose
        xe = x + sx * cw / 2
        box(p, (min(xe, xe + sx * 0.08), yc - 0.07, 0.80), (max(xe, xe + sx * 0.08), yc + 0.07, 1.05),
            "StationDark", skip={3 if sx > 0 else 1})
        xn = xe + sx * 0.08
        box(p, (min(xn, xn + sx * 0.05), yc - 0.03, 0.92), (max(xn, xn + sx * 0.05), yc + 0.03, 1.14),
            "StationDark", skip={3 if sx > 0 else 1})
        hx = lambda d: x + sx * (cw / 2 + d)
        tube(p, [(hx(0.02), yc + 0.10, zc1 - 0.01), (hx(0.17), yc + 0.12, zc1 - 0.10),
                 (hx(0.25), yc + 0.12, zc1 - 0.28), (hx(0.22), yc + 0.08, zc1 - 0.42),
                 (hx(0.13), yc + 0.02, 1.14)], 0.022, "StationDark")


def canopy(p):
    (x0, y0), (x1, y1) = CAN
    o = ((x0, y0), (x1, y1))
    i = ((x0 + RIM, y0 + RIM), (x1 - RIM, y1 - RIM))
    bands = [(SOFFIT, STRIPE[0], "StationFascia"), (STRIPE[0], STRIPE[1], "StationAccent"),
             (STRIPE[1], CAN_TOP, "StationFascia")]
    rect_ring(p, o, i, SOFFIT, CAN_TOP, bands, "StationFascia", "StationFascia", DECK)
    (ix0, iy0), (ix1, iy1) = i
    p.face([(ix0, iy0, DECK), (ix1, iy0, DECK), (ix1, iy1, DECK), (ix0, iy1, DECK)], "StationDark", Z_)
    p.face([(x0, y0, SOFFIT), (x1, y0, SOFFIT), (x1, y1, SOFFIT), (x0, y1, SOFFIT)], "StationWall", -Z_)
    for lx in LAMPS_X:
        for ly in LAMPS_Y:
            lw, ld, lt = LAMP
            box(p, (lx - lw / 2, ly - ld / 2, SOFFIT - lt), (lx + lw / 2, ly + ld / 2, SOFFIT), "StationLamp",
                skip={"top"})
    zc = (SOFFIT + CAN_TOP) / 2
    plate(p, ((x0 + x1) / 2, y1, zc), Y_, "gas")
    plate(p, (x0, (y0 + y1) / 2, zc), -X_, "gas")
    plate(p, (x1, (y0 + y1) / 2, zc), X_, "gas")


def build_part():
    p = Part("GasStation")
    store_walls(p)
    for h in holes_front():
        opening(p, *h)
    side_windows(p)
    mansard(p)
    back_door(p)
    roof_and_parapet(p)
    store_sign(p)
    stoop(p)
    ice_chest(p)
    propane_cage(p)
    slab(p)
    for yc in ISL_YC:
        island(p, yc)
    canopy(p)
    return p


# ---------------------------------------------------------------------------
# Registry numbers (glTF/three.js model frame: x along the road, y up, -z toward the road)
# ---------------------------------------------------------------------------
def gl_box(lo, hi):
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    r = lambda v: round(v, 3)
    return {"c": [r((x0 + x1) / 2), r((z0 + z1) / 2), r(-(y0 + y1) / 2)], "s": [r(x1 - x0), r(z1 - z0), r(y1 - y0)]}


def registry():
    boxes = [gl_box((ST_X[0], ST_Y[0], 0), (ST_X[1], ST_Y[1], PARAPET + COPE[1]))]
    for yc in ISL_YC:
        boxes.append(gl_box((ISL_X[0], yc - ISL_HW, 0), (ISL_X[1], yc + ISL_HW, ISL_H + PLINTH[2] + CAB[2] + HEAD[2])))
    for yc in ISL_YC:
        for x in POST_X:
            boxes.append(gl_box((x - COLLAR_S / 2, yc - COLLAR_S / 2, 0), (x + COLLAR_S / 2, yc + COLLAR_S / 2, SOFFIT)))
    boxes.append(gl_box((ICE_X[0], YF + 0.10, 0), (ICE_X[1], YF + 0.10 + ICE_DP, STOOP_H + ICE_H + plate_h("ice"))))
    boxes.append(gl_box((CAGE_X[0], YF + 0.08, 0), (CAGE_X[1], YF + 0.08 + CAGE_DP, STOOP_H + CAGE_H + plate_h("propane"))))
    yc = ISL_YC[0]                     # zone inner edge 0.25 m off the island's collision face
    lanes = [yc + ISL_HW + 0.25 + LANE_HALF, yc - ISL_HW - 0.25 - LANE_HALF]
    zones = [{"x": PUMP_X, "z": round(-y, 3), "halfX": 2.6, "halfZ": LANE_HALF} for y in lanes]
    slack = [round(ROAD_EDGE - (lanes[0] + LANE_HALF), 3), round((lanes[1] - LANE_HALF) - (YF + STOOP_D), 3)]
    assert BAY_LINES_X[0] > PUMP_X + 2.6 + 2 * 0.3, "storefront bays must stay clear of the pump zones"
    (xa, *_, xb), (ya, yb) = BAY_LINES_X, BAY_LINES_Y   # park box = both bays, line to line
    park = {"x": round((xa + xb) / 2, 3), "z": round(-(ya + yb) / 2, 3),
            "halfX": round((xb - xa) / 2, 3), "halfZ": round((yb - ya) / 2, 3)}
    return boxes, zones, slack, park


# ---------------------------------------------------------------------------
# Atlas bake (general-store.py's ortho-emitter render, at 1024 x 512)
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
    sc.render.resolution_x, sc.render.resolution_y = TEX_W, TEX_H
    sc.render.resolution_percentage = 100
    sc.render.dither_intensity = 0.0
    for k in dir(sc.render):
        if k.startswith("use_stamp_"):
            setattr(sc.render, k, False)
    sc.view_settings.view_transform = 'Standard'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGB'
    cd = bpy.data.cameras.new("AtlasCam")
    cd.type, cd.ortho_scale = 'ORTHO', 1.0          # covers the wider axis: world x 0..1 = 1024 px
    cam = bpy.data.objects.new("AtlasCam", cd)
    cam.location = (0.5, TEX_H / TEX_W / 2, 5.0)
    sc.collection.objects.link(cam)
    sc.camera = cam
    junk, mats, layer = [], [], [0]

    def z():
        layer[0] += 1
        return layer[0] * 0.002

    def poly(pts_px, col):
        me = bpy.data.meshes.new("a")
        me.from_pydata([(x / TEX_W, y / TEX_W, z()) for x, y in pts_px], [], [list(range(len(pts_px)))])
        o = bpy.data.objects.new("a", me)
        m = _emission("a", INK[col])
        mats.append(m)
        me.materials.append(m)
        sc.collection.objects.link(o)
        junk.append(o)

    def rect(x0, y0, x1, y1, col):
        poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], col)

    def text(body, font, xc, yc, w, h, col):
        """Fit `body` inside w x h px with its glyph box centred on (xc, yc) px."""
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
        xs, ys = [v.co.x for v in me.vertices], [v.co.y for v in me.vertices]
        o.to_mesh_clear()
        k = min(w / (max(xs) - min(xs)), h / (max(ys) - min(ys))) / TEX_W
        o.scale = (k, k, 1)
        o.location = (xc / TEX_W - k * (max(xs) + min(xs)) / 2, yc / TEX_W - k * (max(ys) + min(ys)) / 2, z())

    def inset(key, m_px, col):
        x0, y0, w, h = REG[key]
        rect(x0 + m_px, y0 + m_px, x0 + w - m_px, y0 + h - m_px, col)

    rect(0, 0, TEX_W, TEX_H, "ink")
    for key, x in PATCH_PX.items():
        rect(x, 0, x + 64, 64, key)
    # FOOD MART: ink edge, white field, red rule, red letters  (px per metre = 1024 / 5.6)
    x0, y0, w, h = REG["sign"]
    inset("sign", 0, "ink")
    inset("sign", 7, "white")
    inset("sign", 14, "red")
    inset("sign", 18, "white")
    text("FOOD MART", SIGN_FONT, x0 + w / 2, y0 + h / 2, w * 0.82, h * 0.56, "red")
    # GAS: red field, white rule, white letters
    x0, y0, w, h = REG["gas"]
    inset("gas", 0, "white")
    inset("gas", 6, "red")
    inset("gas", 14, "white")
    inset("gas", 19, "red")
    text("GAS", SIGN_FONT, x0 + w / 2, y0 + h / 2, w * 0.70, h * 0.60, "white")
    # ICE (general-store precedent)
    x0, y0, w, h = REG["ice"]
    inset("ice", 0, "white")
    inset("ice", 10, "red")
    inset("ice", 16, "white")
    text("ICE", SIGN_FONT, x0 + w / 2, y0 + h / 2, w * 0.5, h * 0.62, "red")
    # PROPANE: blue field, white letters
    x0, y0, w, h = REG["propane"]
    inset("propane", 0, "white")
    inset("propane", 5, "blue")
    text("PROPANE", SIGN_FONT, x0 + w / 2, y0 + h / 2, w * 0.82, h * 0.58, "white")
    # pump register: cream face, two dark windows with digits, red UNLEADED band
    x0, y0, w, h = REG["gauge"]
    inset("gauge", 0, "cream")
    rect(x0, y0, x0 + w, y0 + 34, "red")
    text("UNLEADED", SIGN_FONT, x0 + w / 2, y0 + 17, w * 0.80, 18, "white")
    for k, digits in enumerate(("12.47", "3.899")):
        cy = y0 + 112 - k * 40
        rect(x0 + 34, cy - 16, x0 + w - 34, cy + 16, "glass")
        text(digits, DIGIT_FONT, x0 + w / 2, cy, w - 84, 22, "lcd")

    path = os.path.join(bpy.app.tempdir, "gas-station-atlas.png")
    sc.render.filepath = path
    win = bpy.context.window
    prev = win.scene
    win.scene = sc
    try:
        bpy.ops.render.render(write_still=True)
    finally:
        win.scene = prev
    img = bpy.data.images.load(path, check_existing=False)
    img.name = "GasStationAtlas"
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
# Blender side (general-store.py)
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
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = False
    ob = bpy.data.objects.new(part.name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def evaluated_tris(ob, per_mat=False):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    m = ev.to_mesh()
    m.calc_loop_triangles()
    n = len(m.loop_triangles)
    pm = {}
    for t in m.loop_triangles:
        k = ob.data.materials[t.material_index].name
        pm[k] = pm.get(k, 0) + 1
    ev.to_mesh_clear()
    return (n, pm) if per_mat else n


def check_facing(ob, n=32):
    """Ray-cast from a ring of eyes; every first hit must face back at the ray."""
    from mathutils.bvhtree import BVHTree
    tree = BVHTree.FromObject(ob, bpy.context.evaluated_depsgraph_get())
    bad = hits = 0
    targets = [Vector((x, y, z)) for x in (-7, -4.5, -2, 2, 5, 8) for y in (-5, -2.4, 0, 2.4, 4)
               for z in (0.3, 1.2, 2.5, 4.0, 5.2)]
    eyes = [Vector((math.cos(a) * 32, math.sin(a) * 32, h))
            for a in [2 * math.pi * k / n for k in range(n)] for h in (1.5, 6, 25)]
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
    """Every lettered face: (dP/du x dP/dv) . n > 0, else the text reads mirrored."""
    me = ob.data
    uvl = me.uv_layers.active.data
    sign_idx = [i for i, m in enumerate(me.materials) if m.name.startswith("StationSign")]
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
    img = bake_atlas()
    ob = bake(build_part(), img)
    t, pm = evaluated_tris(ob, per_mat=True)
    bad, hits = check_facing(ob)
    mir, tex = check_uv_handedness(ob)
    lo = [min(v.co[i] for v in ob.data.vertices) for i in range(3)]
    hi = [max(v.co[i] for v in ob.data.vertices) for i in range(3)]
    boxes, zones, slack, park = registry()
    print("=" * 60)
    print(f"  GasStation  {t} tris (budget {TRI_BUDGET})  materials {len(ob.data.materials)}"
          f"  images {len(bpy.data.images)}")
    print("  per material: " + ", ".join(f"{k} {v}" for k, v in sorted(pm.items(), key=lambda kv: -kv[1])))
    print(f"  bbox  x {lo[0]:.2f}..{hi[0]:.2f}  y {lo[1]:.2f}..{hi[1]:.2f}  z {lo[2]:.2f}..{hi[2]:.2f}")
    print(f"  canopy clearance: soffit {SOFFIT} m, lamp lenses {SOFFIT - LAMP[2]:.2f} m")
    print(f"  collision boxes (glTF frame): {boxes}")
    print(f"  pumpZones: {zones}")
    print(f"  pump-zone outer edge to pad road edge / to stoop face: {slack} m")
    print(f"  park (storefront bays): {park}")
    span = (SLAB[0][0], SLAB[1][0])
    print(f"  seatAlong {-(span[0] + span[1]) / 2:.2f}: slab spans pad u {span[0] - (span[0] + span[1]) / 2:.2f}"
          f"..{span[1] - (span[0] + span[1]) / 2:.2f} of +-{PAD_LEN / 2}")
    print(f"  depth {ROAD_EDGE - ST_Y[0]:.2f} m: back wall {ROAD_EDGE - ST_Y[0] - 11.2:.2f} m past an 11.2 m pad")
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
