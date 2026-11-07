"""
ASSET-83 — the CONSTRUCTION SITE.  Parametric generator.

Built for: Blender 5.2  |  Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

The workSite POI, "the {last} job site": a small concrete-block building half built on a fresh slab.  The
back corner is up to full height with racked leads stepping down along both walls; the front and +X walls
are two or three courses up with rebar standing out of the cells.  Its freight is what it is built from
(data/offers.js: cinder-block and bagged-concrete pallets from the general store), so the pallets wait at the
-X end beside a mixer.  One bay of frame scaffold inside, a lumber stack and a portable toilet at the +X end,
a wheelbarrow.  The road half of the pad is open ground: the PARK box, one truck alongside the road.

    ConstructionSite   one mesh, 9 materials, 0 images (no lettering: the site's name rolls per seed)

AXES.  Blender +Y = glTF -Z = forward = the road side.  Width runs along X = along the road.  Base-seated
(z = 0), centred on the SLAB.  Three.js model frame = (x, z, -y): every registry number is printed in it.

ON THE 14 x 8 LAY-BY, seat 2.7 (pad z = SEAT - y): the slab's back edge lands 1.2 m past the pad's far edge,
inside the 1.6 m band the carve grades flat (road-carve.js PAD_RIM_HOLD), the barn's precedent.  Nothing
touching the ground stands nearer the road than pad z -2.6, where the lay-by turns flat (road.js
POI_ROAD_FEATHER reaches 1.4 m into the pad).  pad_check() proves both.

NO ORANGE.  The placeholder this model replaces is an orange cube, so nothing on the site is orange: the
mixer is red, the bags yellow.

WINDING / NOTHING STACKED: as service-station.py (face() takes the outward direction; tile() cuts decals,
here the mortar joints, into their backing plane).

Headless (never the owner's GUI Blender):
    /Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 \\
        --python assets/models/src/construction-site.py -- export render
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
NAME = "construction-site"
OUT_DIR = f"{REPO}/assets/models"
OUT_BLEND = f"{OUT_DIR}/src/{NAME}.blend"
RENDER_DIR = f"{REPO}/wip/{NAME}/out"
TRI_BUDGET = 3000
RANGER_GLB = f"{REPO}/assets/models/ranger.glb"   # render scenery only, never exported

# --- the lay-by (pad frame: x along the road, pad z = SEAT - y, -z = road side) ---
SEAT = 2.7
PAD_HX, PAD_HZ, PAD_R = 7.0, 4.0, 1.5
FLAT_Z = -2.6
RIM = 1.6

# --- the PARK box: one truck alongside the road, CG in the box (Blender frame) ---
PARK = (0.0, 4.6, 3.2, 1.5)         # x, y, half along the road, half across
RANGER_HALF = (2.35, 1.0)           # Ranger half length, half width over the mirrors

# --- slab + block walls ---
SLAB = (4.0, 2.5, 0.15)             # half x, half y, height
IN_X, IN_Y = 3.5, 2.0               # the walls' inner faces
WT = 0.20                           # 8" block
COURSE, JOINT, NC = 0.20, 0.018, 14  # course height, mortar joint, courses to full height
RACK = 0.20                         # a racked lead steps back half a block per course
WIN = (-2.6, -1.4, 5, 9)            # back-wall window: x span, courses left open
DOOR = (-0.45, 0.45)                # front-wall door gap
REBAR_UP, REBAR_W = 0.80, 0.025

MATS = {
    #  name             base colour (linear)        rough
    "SiteBlock":    ((0.330, 0.325, 0.300), 0.95),   # concrete block
    "SiteConcrete": ((0.470, 0.455, 0.420), 0.95),   # the slab, mortar joints, wet mortar
    "SiteDark":     ((0.035, 0.035, 0.035), 0.85),   # tyres, fork holes, the mixer's mouth, vents
    "SiteSteel":    ((0.380, 0.390, 0.400), 0.45),   # scaffold, frames, straps, the barrow
    "SiteWood":     ((0.520, 0.360, 0.180), 0.85),   # pallets, lumber, planks, dunnage
    "SiteRust":     ((0.230, 0.080, 0.035), 0.80),   # rebar
    "SiteRed":      ((0.430, 0.035, 0.025), 0.70),   # the mixer
    "SiteBlue":     ((0.030, 0.120, 0.400), 0.70),   # the portable toilet
    "SiteYellow":   ((0.800, 0.500, 0.020), 0.70),   # bagged concrete
}

X_, Y_, Z_ = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))


# ---------------------------------------------------------------------------
# Geometry accumulator (burger-joint.py's)
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
    """Axis box.  Side order: 0 -Y, 1 +X, 2 +Y, 3 -X."""
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    ring = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    solid(p, [(x, y, z0) for x, y in ring], [(x, y, z1) for x, y in ring], mat, skip)


def ngon(r, n, cx=0.0, cz=0.0, a0=math.pi / 2):
    return [(cx + r * math.cos(a0 + 2 * math.pi * k / n), cz + r * math.sin(a0 + 2 * math.pi * k / n))
            for k in range(n)]


def tile(p, rects, P, out):
    """Coplanar rectangles (u0, u1, v0, v1, mat), later ones on top, cut into non-overlapping quads in
    ONE plane.  mat None = a hole."""
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


class Frame:
    """A local frame on the ground: origin (x, y), yaw about Z.  Local +x/+y/+z -> world."""
    def __init__(self, x, y, yaw):
        self.o, self.c, self.s = Vector((x, y, 0)), math.cos(yaw), math.sin(yaw)

    def __call__(self, lx, ly, lz):
        return (self.o.x + self.c * lx - self.s * ly, self.o.y + self.s * lx + self.c * ly, lz)

    def d(self, v):                     # a direction
        return Vector((self.c * v[0] - self.s * v[1], self.s * v[0] + self.c * v[1], v[2]))


def fbox(p, F, lo, hi, mat, skip=()):
    """box() in a Frame."""
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    ring = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    solid(p, [F(x, y, z0) for x, y in ring], [F(x, y, z1) for x, y in ring], mat, skip)


def wheel(p, F, c, r, w, n=8, mat="SiteDark"):
    """A wheel with its axle along the frame's local y."""
    cx, cy, cz = c
    ring = ngon(r, n, cx, cz, math.pi / n)
    solid(p, [F(x, cy - w / 2, z) for x, z in ring], [F(x, cy + w / 2, z) for x, z in ring], mat)


# ---------------------------------------------------------------------------
# The slab and the block walls
# ---------------------------------------------------------------------------
def course_z(k):
    return SLAB[2] + k * COURSE


def racked(u_full, u_far, step_dir, k):
    """A lead built to full height up to u_full, stepping back RACK per course toward u_far."""
    reach = u_full + step_dir * (NC - 1 - k) * RACK
    return min(reach, u_far) if step_dir > 0 else max(reach, u_far)


# Each wall: P(u, z, w) -> world (w = 0 the inner face, WT the outer), its outward normal, its u axis,
# and per course a list of (u0, u1) spans.  Back and front walls own the corners.
def walls_spec():
    bx0, bx1 = -IN_X - WT, IN_X + WT
    back = []
    for k in range(NC):
        a, b = bx0, racked(0.5, bx1, +1, k)
        back.append([(a, WIN[0]), (WIN[1], b)] if WIN[2] <= k <= WIN[3] else [(a, b)])
    left = [[(-IN_Y, racked(-0.4, IN_Y, +1, k))] for k in range(NC)]
    front = [[(bx0, DOOR[0]), (DOOR[1], bx1)] for _ in range(3)]
    right = [[(-IN_Y, IN_Y)] for _ in range(2)]
    return [
        ("back",  lambda u, z, w: (u, -IN_Y - w, z), -Y_, X_, back),
        ("left",  lambda u, z, w: (-IN_X - w, u, z), -X_, Y_, left),
        ("front", lambda u, z, w: (u, IN_Y + w, z), Y_, X_, front),
        ("right", lambda u, z, w: (IN_X + w, u, z), X_, Y_, right),
    ]


def block_wall(p, P, N, U, courses):
    """Coursed block: both faces with a mortar bed joint under every course above the first, the exposed
    tops of each course, and the ends (merged up the height where a run of courses ends together)."""
    for w, out in ((WT, N), (0.0, -N)):
        rects = []
        for k, spans in enumerate(courses):
            z0 = course_z(k)
            for a, b in spans:
                rects.append((a, b, z0, z0 + COURSE, "SiteBlock"))
                if k:
                    rects.append((a, b, z0, z0 + JOINT, "SiteConcrete"))
        tile(p, rects, lambda u, z, w=w: P(u, z, w), out)
    for k, spans in enumerate(courses):
        above = courses[k + 1] if k + 1 < len(courses) else []
        z = course_z(k + 1)
        for a, b in spans:
            cuts = sorted([a, b] + [e for s in above for e in s if a < e < b])
            for u0, u1 in zip(cuts, cuts[1:]):
                um = (u0 + u1) / 2
                if not any(s0 <= um <= s1 for s0, s1 in above):
                    p.face([P(u0, z, 0), P(u1, z, 0), P(u1, z, WT), P(u0, z, WT)], "SiteBlock", Z_)
    ends = {}
    for k, spans in enumerate(courses):
        for a, b in spans:
            ends.setdefault((a, -1), []).append(k)
            ends.setdefault((b, +1), []).append(k)
    for (u, s), ks in ends.items():
        runs, start = [], ks[0]
        for i in range(1, len(ks) + 1):
            if i == len(ks) or ks[i] != ks[i - 1] + 1:
                runs.append((start, ks[i - 1]))
                if i < len(ks):
                    start = ks[i]
        for k0, k1 in runs:
            z0, z1 = course_z(k0), course_z(k1 + 1)
            p.face([P(u, z0, 0), P(u, z0, WT), P(u, z1, WT), P(u, z1, 0)], "SiteBlock", U * s)


def rebar(p, P, courses, every):
    """Bars standing out of the top course's cells, every `every` metres along it."""
    k = len(courses) - 1
    z = course_z(k + 1)
    for a, b in courses[k]:
        n = int((b - a) / every)
        for i in range(n):
            u = a + (b - a) * (i + 0.5) / n
            c = Vector(P(u, z, WT / 2))
            h = REBAR_W / 2
            box(p, (c.x - h, c.y - h, z), (c.x + h, c.y + h, z + REBAR_UP), "SiteRust", skip={"bot"})


def slab_and_walls(p):
    sx, sy, sh = SLAB
    box(p, (-sx, -sy, 0), (sx, sy, sh), "SiteConcrete", skip={"bot"})
    for name, P, N, U, courses in walls_spec():
        block_wall(p, P, N, U, courses)
        rebar(p, P, courses, 0.8)
    # the left lead is grouted at its full-height end too: bars where it stands to the top
    # (rebar() already does the top course of every wall)


# ---------------------------------------------------------------------------
# Kit
# ---------------------------------------------------------------------------
def scaffold(p):
    """One bay of frame scaffold inside, against the back wall: two H-frames, an X brace, two planks."""
    z0, h = SLAB[2], 1.90
    y0, y1 = -IN_Y + 0.10, -IN_Y + 1.10
    t = 0.05
    for x in (-3.1, -1.0):
        for y in (y0, y1):
            box(p, (x - t / 2, y - t / 2, z0), (x + t / 2, y + t / 2, z0 + h), "SiteSteel", skip={"bot"})
        for z in (z0 + 0.95, z0 + h - t):
            box(p, (x - t / 2, y0 + t / 2, z), (x + t / 2, y1 - t / 2, z + t), "SiteSteel", skip={1, 3})
    y = y1 - t / 2 - 0.03
    sq = lambda x, z: [(x, y - 0.015, z - 0.015), (x, y + 0.015, z - 0.015), (x, y + 0.015, z + 0.015),
                       (x, y - 0.015, z + 0.015)]
    for (xa, za), (xb, zb) in (((-3.05, z0 + 0.15), (-1.05, z0 + h - 0.15)), ((-3.05, z0 + h - 0.15), (-1.05, z0 + 0.15))):
        solid(p, sq(xa, za), sq(xb, zb), "SiteSteel")
    for ya, yb in ((y0 - 0.05, y0 + 0.42), (y0 + 0.48, y1 + 0.05)):
        box(p, (-3.35, ya, z0 + h), (-0.75, yb, z0 + h + 0.05), "SiteWood")
    for k in range(2):                       # the mason's next two blocks, up on the plank
        bx = -2.6 + k * 0.42
        box(p, (bx, y0, z0 + h + 0.05), (bx + 0.40, y0 + 0.20, z0 + h + 0.25), "SiteBlock", skip={"bot"})


def pallet(p, F, cx, cy, w=1.2, d=1.0, h=0.14):
    """A wood pallet: fork holes cut into its two faces across the stringers."""
    x0, x1, y0, y1 = cx - w / 2, cx + w / 2, cy - d / 2, cy + d / 2
    fbox(p, F, (x0, y0, 0), (x1, y1, h), "SiteWood", skip={0, 2, "bot"})
    for yy, out in ((y0, -1), (y1, 1)):
        holes = [(x0 + 0.12, x0 + 0.47, 0.02, h - 0.03, "SiteDark"), (x1 - 0.47, x1 - 0.12, 0.02, h - 0.03, "SiteDark")]
        tile(p, [(x0, x1, 0, h, "SiteWood")] + holes, lambda x, z, yy=yy: F(x, yy, z), F.d((0, out, 0)))


def block_pallet(p, F):
    """45 blocks on a pallet as a coursed stack: 3 blocks along x, 5 across, 4 courses."""
    pallet(p, F, 0, 0)
    z0, z1 = 0.14, 0.14 + 4 * COURSE
    x0, x1, y0, y1 = -0.6, 0.6, -0.5, 0.5
    joints = lambda a, b: [(a, b, z0, z1, "SiteBlock")] + [(a, b, z0 + k * COURSE, z0 + k * COURSE + JOINT, "SiteConcrete")
                                                           for k in range(1, 4)]
    tile(p, joints(x0, x1), lambda x, z: F(x, y0, z), F.d((0, -1, 0)))
    tile(p, joints(x0, x1), lambda x, z: F(x, y1, z), F.d((0, 1, 0)))
    tile(p, joints(y0, y1), lambda y, z: F(x0, y, z), F.d((-1, 0, 0)))
    tile(p, joints(y0, y1), lambda y, z: F(x1, y, z), F.d((1, 0, 0)))
    p.face([F(x0, y0, z1), F(x1, y0, z1), F(x1, y1, z1), F(x0, y1, z1)], "SiteBlock", Z_)


def bag_pallet(p, F):
    """Bagged concrete: two layers of four pillowed bags on a pallet."""
    pallet(p, F, 0, 0)
    prof = [(-0.22, 0.0), (0.22, 0.0), (0.25, 0.06), (0.22, 0.13), (-0.22, 0.13), (-0.25, 0.06)]   # (y, z)
    for layer in range(2):
        z = 0.14 + layer * 0.13
        for bx in (-0.30, 0.30):
            for by in (-0.24, 0.24):
                ring = lambda x: [F(x, by + y, z + zz) for y, zz in prof]
                solid(p, ring(bx - 0.29), ring(bx + 0.29), "SiteYellow")


def lumber(p):
    """A bundle of 2x4s on dunnage, two steel straps round it, its long side across the pad."""
    x0, x1, y0, y1, zb = 4.6, 5.5, -1.4, 2.2, 0.10
    for y in (y0 + 0.4, y1 - 0.4):
        box(p, (x0 - 0.05, y - 0.05, 0), (x1 + 0.05, y + 0.05, zb), "SiteWood", skip={"bot"})
    box(p, (x0, y0, zb), (x1, y1, zb + 0.55), "SiteWood", skip={"bot"})
    for y in (y0 + 0.8, y1 - 0.8):           # straps: 1 cm proud, wrapping the top and both sides
        box(p, (x0 - 0.01, y - 0.02, zb + 0.02), (x1 + 0.01, y + 0.02, zb + 0.56), "SiteSteel", skip={"bot"})


def toilet(p, F):
    """A portable toilet facing the road: blue shell, a lighter roof cap, a vent strip and a pull."""
    w, d, h = 1.10, 1.10, 2.25
    fbox(p, F, (-w / 2, -d / 2, 0), (w / 2, d / 2, h), "SiteBlue", skip={2, "top"})
    tile(p, [(-w / 2, w / 2, 0, h, "SiteBlue"), (-0.40, 0.40, 1.95, 2.05, "SiteDark")],
         lambda x, z: F(x, d / 2, z), F.d((0, 1, 0)))
    fbox(p, F, (-w / 2 - 0.04, -d / 2 - 0.04, h), (w / 2 + 0.04, d / 2 + 0.04, h + 0.10), "SiteConcrete")
    fbox(p, F, (0.32, d / 2, 0.95), (0.40, d / 2 + 0.05, 1.20), "SiteSteel", skip={0})


def mixer(p, F):
    """A towable drum mixer: chassis on two wheels, a post and yoke, the red drum tilted up, the tow bar
    to local -x."""
    t = 0.07
    fbox(p, F, (-1.25, -t / 2, 0.36), (0.55, t / 2, 0.36 + t), "SiteSteel")              # chassis beam
    fbox(p, F, (-0.04, -0.50, 0.21), (0.04, 0.50, 0.29), "SiteSteel")                    # axle
    for y in (-0.55, 0.55):
        wheel(p, F, (0.0, y, 0.25), 0.25, 0.14)
    fbox(p, F, (-1.30, -0.04, 0), (-1.22, 0.04, 0.36), "SiteSteel", skip={"bot"})        # jack leg
    fbox(p, F, (-0.05, -0.05, 0.43), (0.05, 0.05, 0.85), "SiteSteel")                    # post
    fbox(p, F, (-0.06, -0.46, 0.80), (0.06, 0.46, 0.88), "SiteSteel")                    # yoke
    # the drum: a lathe along an axis tilted 25 deg up toward local +x
    tilt = math.radians(25)
    ax = Vector((math.cos(tilt), 0, math.sin(tilt)))
    e1, e2 = Vector((0, 1, 0)), Vector((-math.sin(tilt), 0, math.cos(tilt)))
    base = Vector((0, 0, 0.88)) - 0.42 * ax
    prof = [(0.00, 0.18), (0.12, 0.40), (0.55, 0.42), (0.86, 0.25), (1.00, 0.18)]
    n = 10
    rings = []
    for a, r in prof:
        c = base + a * ax
        rings.append([c + r * (math.cos(2 * math.pi * k / n) * e1 + math.sin(2 * math.pi * k / n) * e2)
                      for k in range(n)])
    W = lambda v: F(v.x, v.y, v.z)
    for (ra, rb), ((aa, _), (ab, _)) in zip(zip(rings, rings[1:]), zip(prof, prof[1:])):
        mid = base + (aa + ab) / 2 * ax
        for k in range(n):
            q = [ra[k], ra[(k + 1) % n], rb[(k + 1) % n], rb[k]]
            out = sum(q, Vector()) / 4 - mid
            p.face([W(v) for v in q], "SiteRed", F.d(out))
    p.face([W(v) for v in rings[0]], "SiteRed", F.d(-ax))
    p.face([W(v) for v in rings[-1]], "SiteDark", F.d(ax))                                  # the mouth
    for k in range(0, n, 2):                                                                # mixing fins' ridges
        a0, a1 = rings[1][k], rings[2][k]
        p.face([W(a0), W(a1), W(a1 + (a1 - (base + 0.55 * ax)).normalized() * 0.03)], "SiteRed",
               F.d((a1 - a0).cross(ax)))


def wheelbarrow(p, F):
    """A barrow of wet mortar: the tray (its top the mortar), a wheel at the front, two handles and legs."""
    bot = [(-0.25, -0.20, 0.32), (0.25, -0.20, 0.32), (0.25, 0.20, 0.32), (-0.25, 0.20, 0.32)]
    top = [(-0.42, -0.33, 0.60), (0.44, -0.33, 0.60), (0.44, 0.33, 0.60), (-0.42, 0.33, 0.60)]
    solid(p, [F(*v) for v in bot], [F(*v) for v in top], "SiteSteel", skip={"top"})
    p.face([F(*v) for v in top], "SiteConcrete", Z_)
    wheel(p, F, (0.62, 0.0, 0.20), 0.20, 0.08)
    for y in (-0.22, 0.22):
        a, b = (0.62, y * 0.3, 0.20), (-0.85, y, 0.55)
        sq = lambda c: [F(c[0], c[1] - 0.02, c[2] - 0.02), F(c[0], c[1] + 0.02, c[2] - 0.02),
                        F(c[0], c[1] + 0.02, c[2] + 0.02), F(c[0], c[1] - 0.02, c[2] + 0.02)]
        solid(p, sq(a), sq(b), "SiteSteel")
        fbox(p, F, (-0.30, y - 0.02, 0), (-0.26, y + 0.02, 0.36), "SiteSteel", skip={"bot"})


# Kit placement (Blender frame): ground frames and their footprints, for the colliders and the park check
KIT = {
    "block pallet A": (Frame(-6.0, 0.4, 0), block_pallet, (0.6, 0.5, 0.94)),
    "block pallet B": (Frame(-6.0, -1.0, 0), block_pallet, (0.6, 0.5, 0.94)),
    "bag pallet":     (Frame(-4.75, -1.0, 0), bag_pallet, (0.6, 0.5, 0.40)),
    "mixer":          (Frame(-5.35, 2.35, -math.pi / 2), mixer, None),
    "toilet":         (Frame(6.25, 3.0, 0), toilet, (0.59, 0.59, 2.35)),
    "wheelbarrow":    (Frame(4.2, 3.55, math.pi / 2 + 0.25), wheelbarrow, None),
}


def build_part():
    p = Part("ConstructionSite")
    slab_and_walls(p)
    scaffold(p)
    lumber(p)
    for F, fn, _ in KIT.values():
        fn(p, F)
    return p


# ---------------------------------------------------------------------------
# Registry numbers (three.js model frame: x, height, -y)
# ---------------------------------------------------------------------------
def wall_boxes():
    """Per wall, columns of equal height merged while within 0.6 m of each other (the racked leads come
    out as a few steps, not one box per course)."""
    out = []
    for name, P, N, U, courses in walls_spec():
        us = sorted({e for spans in courses for s in spans for e in s})
        cols = []
        for u0, u1 in zip(us, us[1:]):
            um = (u0 + u1) / 2
            ks = [k for k, spans in enumerate(courses) if any(a <= um <= b for a, b in spans)]
            if ks:
                cols.append([u0, u1, course_z(max(ks) + 1)])
        merged = []
        for c in cols:
            if merged and merged[-1][1] == c[0] and abs(merged[-1][2] - c[2]) <= 0.6 and \
                    min(merged[-1][3], c[2]) >= max(merged[-1][2], c[2]) - 0.6:
                m = merged[-1]
                m[1], m[2], m[3] = c[1], max(m[2], c[2]), min(m[3], c[2])
            else:
                merged.append([c[0], c[1], c[2], c[2]])
        for u0, u1, h, _ in merged:
            a, b = Vector(P(u0, 0, 0)), Vector(P(u1, 0, WT))
            lo = (min(a.x, b.x), min(a.y, b.y), 0)
            hi = (max(a.x, b.x), max(a.y, b.y), h)
            out.append((f"{name} wall", lo, hi))
    return out


def collider_boxes():
    boxes = wall_boxes()
    for name, (F, fn, ext) in KIT.items():
        if name == "wheelbarrow":
            continue
        if ext is None:            # the mixer: chassis, drum and tow bar
            pts = [Vector(F(x, y, 0)) for x in (-1.30, 0.75) for y in (-0.62, 0.62)]
            h = 1.40
        else:
            hx, hy, h = ext
            pts = [Vector(F(x, y, 0)) for x in (-hx, hx) for y in (-hy, hy)]
        boxes.append((name, (min(v.x for v in pts), min(v.y for v in pts), 0),
                      (max(v.x for v in pts), max(v.y for v in pts), h)))
    boxes.append(("lumber", (4.55, -1.4, 0), (5.55, 2.2, 0.66)))
    return boxes


def three(lo, hi):
    c = [(lo[0] + hi[0]) / 2, (lo[2] + hi[2]) / 2, -(lo[1] + hi[1]) / 2]
    s = [hi[0] - lo[0], hi[2] - lo[2], hi[1] - lo[1]]
    return c, s


def fmt(v):
    return f"{v:.3f}".rstrip("0").rstrip(".") if abs(v) > 1e-9 else "0"


def park_check(boxes):
    """A Ranger anywhere its CG may stand in the park box (the box itself, any heading along the road)
    must clear every collider."""
    px, py, hx, hy = PARK
    lx, ly = RANGER_HALF
    x0, x1, y0, y1 = px - hx - lx, px + hx + lx, py - hy - ly, py + hy + ly
    gaps = []
    for name, lo, hi in boxes:
        dx = max(lo[0] - x1, x0 - hi[0])
        dy = max(lo[1] - y1, y0 - hi[1])
        gaps.append((max(dx, dy), name))
    return min(gaps)


# ---------------------------------------------------------------------------
# Blender side
# ---------------------------------------------------------------------------
def get_material(name):
    col, rough = MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*col, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = 0.0
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
    """Ray-cast from a ring of eyes at the model; every first hit must face back at the ray.  Targets sit
    off the round numbers: a ray through an exact edge may report either face."""
    from mathutils.bvhtree import BVHTree
    tree = BVHTree.FromObject(ob, bpy.context.evaluated_depsgraph_get())
    bad, hits = [], 0
    targets = [Vector((x + 0.013, y + 0.017, z + 0.011)) for x in (-6, -4.5, -2.5, 0, 2.5, 4.8, 6.2)
               for y in (-2, 0, 1.5, 3) for z in (0.3, 0.9, 1.8, 2.9)]
    eyes = [Vector((math.cos(a) * 25, math.sin(a) * 25, h))
            for a in [2 * math.pi * k / n for k in range(n)] for h in (1.2, 4, 9, 18)]
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


def pad_check(ob):
    """Pad frame: x along the road, pz = SEAT - y.  Everything within 0.35 m of the ground must stand on
    flat ground: no nearer the road than FLAT_Z, and inside the pad's rounded outline grown by RIM."""
    def outside(x, pz):
        qx, qz = abs(x) - (PAD_HX - PAD_R), abs(pz) - (PAD_HZ - PAD_R)
        return math.hypot(max(qx, 0), max(qz, 0)) + min(max(qx, qz), 0) - PAD_R
    low = [v.co for v in ob.data.vertices if v.co.z < 0.35]
    front = min(SEAT - v.y for v in low)
    worst = max(outside(v.x, SEAT - v.y) for v in low)
    return front >= FLAT_Z - 1e-6 and worst <= RIM, front, worst


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
    ok_pad, front, worst = pad_check(ob)
    boxes = collider_boxes()
    gap, nearest = park_check(boxes)
    lo = [min(v.co[i] for v in ob.data.vertices) for i in range(3)]
    hi = [max(v.co[i] for v in ob.data.vertices) for i in range(3)]
    px, py, hx, hy = PARK
    print("=" * 72)
    print(f"  ConstructionSite  {t} tris (budget {TRI_BUDGET}, floor ~1000)  materials {len(ob.data.materials)}"
          f"  images {len(bpy.data.images)}")
    print("  per material: " + ", ".join(f"{k} {v}" for k, v in sorted(per.items(), key=lambda kv: -kv[1])))
    print(f"  bbox  x {lo[0]:.2f}..{hi[0]:.2f}  y {lo[1]:.2f}..{hi[1]:.2f}  z {lo[2]:.2f}..{hi[2]:.2f}")
    print(f"  pad: nearest the road at ground pz {front:.2f} (flat from {FLAT_Z}), worst {worst:.2f} m past the"
          f" pad edge (rim {RIM})  -> {'OK' if ok_pad else 'FAIL'}")
    print(f"  park box (pad z {SEAT - py - hy:.2f}..{SEAT - py + hy:.2f}): a Ranger anywhere in it clears every collider"
          f" by {gap:.2f} m (nearest: {nearest})  -> {'OK' if gap > 0.2 else 'FAIL'}")
    print(f"  facing: {bad} inverted first-hits of {hits}")
    print("  ---- data/prop-models.js (three.js frame) ----")
    print(f"      shape: 'box', size: [{fmt(2 * SLAB[0])}, {fmt(course_z(NC))}, {fmt(2 * SLAB[1])}],")
    print("      boxes: [")
    for name, lo_, hi_ in boxes:
        c, s = three(lo_, hi_)
        body = f"{{ c: [{', '.join(map(fmt, c))}], s: [{', '.join(map(fmt, s))}] }},"
        print(f"        {body}{' ' * max(1, 52 - len(body))}// {name}")
    print("      ],")
    print(f"    seat: {SEAT},")
    print(f"    park: {{ x: {fmt(px)}, z: {fmt(-py)}, halfX: {fmt(hx)}, halfZ: {fmt(hy)} }},")
    print("=" * 72)
    return ob, ok_pad and gap > 0.2 and bad == 0 and t <= TRI_BUDGET * 1.1


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
    "road":          ((-2.0, 13.5, 1.6), (0.0, 0.0, 1.0), 50),
    "three-quarter": ((12.0, 14.0, 6.5), (0.0, 0.5, 1.0), 45),
    "rear":          ((-11.0, -12.0, 7.0), (0.0, 0.0, 1.0), 45),
    "aerial":        ((0.5, 9.0, 14.0), (0.0, 1.0, 0.0), 55),
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
    ry = SEAT + PAD_HZ + 0.6
    _plane("Road", -60, 60, ry, ry + 7.0, -0.01, _flat("Road", (0.05, 0.05, 0.055), 0.8))
    if os.path.exists(RANGER_GLB):            # the truck in the park box, nose along the road (-X)
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
        rig.location = (-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, 0.045 - lo.z)
        bpy.context.view_layer.update()
        wheel_m = _flat("Tire", (0.02, 0.02, 0.02), 0.9)
        for ax in (0.299 + 1.2825, 0.299 - 1.5675):     # the axles from the CG, vehicle-models.js
            for sx in (-1, 1):
                bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.368, depth=0.24,
                                                    location=(sx * 0.715, ax, 0.368), rotation=(0, math.pi / 2, 0))
                w = bpy.context.active_object
                w.data.materials.append(wheel_m)
                w.parent = rig
                w.matrix_parent_inverse = rig.matrix_world.inverted()
        seat = bpy.data.objects.new("TruckSeat", None)
        bpy.context.collection.objects.link(seat)
        rig.parent = seat
        seat.rotation_euler = (0, 0, math.pi / 2)        # nose to -X
        seat.location = (PARK[0] - 0.299, PARK[1], 0)    # CG on the park box centre
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
        y0 = (rows - 1 - r) * h
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
