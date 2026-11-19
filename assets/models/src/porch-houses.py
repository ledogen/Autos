"""
ASSET-91 — three small houses with a porch, a deck or a landing (the residences kit).

Built for: Blender 5.2 LTS  |  Targets: assets/models/<name>.glb  ·  source: assets/models/src/porch-houses.blend
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

    cottage-porch   folk cottage, full-width covered front porch     CottageXxx materials
    ranch-deck      low ranch, open front deck, no railing          RanchXxx materials
    cabin-landing   front-gable cabin on piers, landing + side stair  CabinXxx materials

WHY THEY EXIST.  FEAT-295 puts paper-route customers at houses: a paper thrown at the wall or the
door must drop onto a FLAT floor that faces the road, and a paper must be able to rest there.  So
each house has a porch floor at the front door, open on the road side (no railing across the
front: every floor is under 0.76 m, the height above which a real porch needs a guard), and its
registry entry makes that floor a solid box (data/prop-models.js).

REFERENCE BOARD (typical US small-house practice; the named features every pass is checked against)
  cottage-porch  (a folk / hall-and-parlor cottage):  side-gabled 8:12 roof; a symmetric front, a
                 centred door between two windows; a FULL-WIDTH porch 1.8 m deep under its own
                 low-slope shed roof on square posts; porch floor about 0.5 m up on a brick
                 foundation, painted grey tongue-and-groove boards running toward the road; two
                 steps at the door; an EXTERIOR brick chimney up one gable end; shutters.
  ranch-deck     (a 1950s-60s ranch):  long and low, side-gabled 4:12 roof with deep 0.55 m eaves;
                 an off-centre door; a wide PICTURE WINDOW; small high bedroom windows; a concrete
                 block foundation; a stone chimney through the roof; an uncovered wood DECK at the
                 door on posts, boards parallel to the house, steps at the front, and NO railing
                 (0.40 m up; a side rail stood between an oblique thrower and the door).
  cabin-landing  (a pier-built hunting cabin):  front-gabled 10:12 roof, green standing-seam
                 metal, rake overhanging the door; red board-and-batten siding; the floor 0.72 m
                 up on concrete pier blocks, open underneath; a LANDING at the door and an open
                 stair (two stringers, three treads, one handrail on its WALL side, so it never
                 stands between the road and the door) running down along the front wall; a stovepipe through the roof; a small window in the front gable.

AXES.  Blender +Y = glTF -Z = forward = the road face.  The width runs along X = along the road,
so the marker's yaw fits each to the 14 x 8 m pad with no yawOffset.  Base-seated (z = 0),
centred on the WALL footprint; the porch, steps and stair reach past it on the road side.

SIDING.  Lap siding is doctors-office.py's: shallow V-grooves cut INWARD, every opening snapped
onto a course line.  Board-and-batten is a flat wall with proud battens split around openings.

WINDING.  Every face goes through face(), which takes the direction the face must point.
check_facing() proves it by ray cast.  Hidden faces are not built: the shell is open by design.

Run headless (never the owner's GUI Blender):
    blender -b --python-exit-code 1 --python assets/models/src/porch-houses.py -- export
    blender -b --python-exit-code 1 --python assets/models/src/porch-houses.py -- render
'render' writes the review views and the sheet to wip/asset-91/out (git-invisible).
"""

import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector

SRC = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.dirname(SRC)                       # this checkout's assets/models
REPO = os.path.dirname(os.path.dirname(OUT_DIR))
OUT_BLEND = f"{SRC}/porch-houses.blend"
RENDER_DIR = f"{REPO}/wip/asset-91/out"
TRAILER_GLB = f"{OUT_DIR}/trailer-home-a.glb"        # render comparison only, never exported
PAD_HX, PAD_HZ, PAD_GAP = 7.0, 4.0, 0.6              # src/poi.js poiPadHalfLen / HalfWid / Gap
BACK_CLEAR = 0.30                                    # back eave this far inside the pad's back edge

X_, Y_, Z_ = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))

MATS = {
    #  name               base colour (linear)        rough
    "CottageSiding":  ((0.140, 0.260, 0.520, 1.0), 0.85),   # cornflower blue
    "CottageTrim":    ((0.780, 0.770, 0.730, 1.0), 0.70),
    "CottageRoof":    ((0.060, 0.060, 0.065, 1.0), 0.85),   # charcoal shingle
    "CottageRed":     ((0.420, 0.035, 0.025, 1.0), 0.60),   # door + shutters
    "CottageFloor":   ((0.200, 0.205, 0.215, 1.0), 0.80),   # painted porch floor + steps
    "CottageBrick":   ((0.240, 0.075, 0.045, 1.0), 0.95),   # foundation, porch skirt, chimney
    "CottageCurtain": ((0.820, 0.740, 0.560, 1.0), 0.95),

    "RanchSiding":    ((0.700, 0.300, 0.200, 1.0), 0.85),   # coral
    "RanchTrim":      ((0.780, 0.770, 0.730, 1.0), 0.70),
    "RanchRoof":      ((0.110, 0.090, 0.075, 1.0), 0.85),   # brown-grey shingle
    "RanchDoor":      ((0.030, 0.260, 0.270, 1.0), 0.60),   # door + shutters, turquoise
    "RanchDeck":      ((0.300, 0.180, 0.095, 1.0), 0.90),   # deck, steps, rails
    "RanchStone":     ((0.260, 0.255, 0.245, 1.0), 0.95),   # foundation + chimney
    "RanchCurtain":   ((0.800, 0.780, 0.700, 1.0), 0.95),

    "CabinSiding":    ((0.330, 0.045, 0.030, 1.0), 0.90),   # barn red board-and-batten
    "CabinTrim":      ((0.700, 0.660, 0.550, 1.0), 0.75),   # cream frames, corners, rim band
    "CabinRoof":      ((0.030, 0.120, 0.060, 1.0), 0.55),   # green standing-seam metal
    "CabinWood":      ((0.300, 0.200, 0.110, 1.0), 0.90),   # landing, stair, door, underside
    "CabinStone":     ((0.230, 0.230, 0.220, 1.0), 0.95),   # pier blocks
    "CabinMetal":     ((0.040, 0.040, 0.045, 1.0), 0.45),   # stovepipe
    "CabinCurtain":   ((0.780, 0.700, 0.520, 1.0), 0.95),
}

# Openings are (kind, side, along, width, sill, head) with sill/head above the FLOOR and `along`
# the world coordinate along that wall (x on the +-y walls, y on the +-x walls).
VARIANTS = {
    "cottage-porch": dict(
        P="Cottage", W=7.2, D=4.4, FLOOR=0.50, WALL_H=2.60, RISE=1.47, ridge="x",
        EAVE_OUT=0.30, RAKE=0.25, siding="lap", COURSE_NOM=0.18, budget=1600,
        openings=[("dh", "+y", -2.3, 0.90, 0.75, 2.05, True), ("dh", "+y", 2.3, 0.90, 0.75, 2.05, True),
                  ("door", "+y", 0.0, 0.92, 0.0, 2.05, False),
                  ("dh", "-y", -2.0, 0.80, 0.85, 2.05, False), ("dh", "-y", 1.6, 0.80, 0.85, 2.05, False),
                  ("dh", "+x", 0.0, 0.80, 0.85, 2.05, False),
                  ("dh", "-x", -1.40, 0.60, 0.85, 2.05, False), ("dh", "-x", 1.40, 0.60, 0.85, 2.05, False)],
        vents=["+x"],
        # porch: full width, depth off the front wall, shed roof heights above FLOOR (wall, front)
        porch=dict(kind="covered", x=(-3.6, 3.6), depth=1.80, roof=(2.36, 2.14), posts=(-3.45, -1.05, 1.05, 3.45),
                   steps=(-0.70, 0.70), risers=3, run=0.28, board=0.14, along="y"),
    ),
    "ranch-deck": dict(
        P="Ranch", W=8.8, D=4.8, FLOOR=0.40, WALL_H=2.45, RISE=0.80, ridge="x",
        EAVE_OUT=0.45, RAKE=0.35, siding="lap", COURSE_NOM=0.25, budget=1400,
        openings=[("pic", "+y", -1.6, 2.00, 0.60, 2.00, False), ("dh", "+y", -3.6, 0.90, 0.85, 2.00, False),
                  ("dh", "+y", 3.4, 1.00, 1.10, 2.00, True), ("door", "+y", 1.2, 0.92, 0.0, 2.00, False),
                  ("dh", "-y", -3.0, 0.90, 1.10, 2.00, False), ("dh", "-y", -0.5, 0.60, 1.35, 2.00, False),
                  ("dh", "-y", 2.5, 0.90, 1.10, 2.00, False),
                  ("dh", "+x", 0.0, 0.90, 1.10, 2.00, False), ("dh", "-x", 0.0, 0.90, 1.10, 2.00, False)],
        vents=["+x", "-x"],
        porch=dict(kind="deck", x=(-0.40, 2.80), depth=1.90, rim=0.22, steps=(0.50, 1.90), risers=2, run=0.28,
                   board=0.14, along="x"),
        chimney=dict(c=(-2.2, -0.45), hw=0.32, top=0.75),
    ),
    "cabin-landing": dict(
        P="Cabin", W=5.4, D=5.0, FLOOR=0.72, WALL_H=2.30, RISE=2.25, ridge="y",
        EAVE_OUT=0.30, RAKE=0.55, siding="batten", budget=1400,
        openings=[("door", "+y", -1.0, 0.86, 0.0, 2.00, False), ("dh", "+y", 1.55, 0.80, 0.90, 1.90, False),
                  ("gable", "+y", 0.0, 0.60, 2.65, 3.25, False),
                  ("dh", "-y", 0.8, 0.80, 0.90, 1.90, False),
                  ("dh", "+x", 0.0, 0.80, 0.90, 1.90, False), ("dh", "-x", 0.6, 0.80, 0.90, 1.90, False)],
        vents=[],
        porch=dict(kind="landing", x=(-2.20, 0.20), depth=1.50, rim=0.25, stair_y=(0.48, 1.48), risers=4,
                   run=0.28, board=0.14, along="x", rail_h=0.90),
        stovepipe=dict(c=(1.25, -1.1), r=0.09, top=0.9),
    ),
}

# shared detail sizes
FND_OUT = 0.03
SIDING_D = 0.020
CORNER_W, CORNER_OUT = 0.11, 0.02
WIN_DEPTH = 0.10
FRAME_W, FRAME_OUT = 0.09, 0.03
RAIL_HW = 0.025
PLEAT_D, PLEAT_MIX = 0.06, (1.0, 0.7)
SHUT_W, SHUT_T, SHUT_GAP = 0.36, 0.04, 0.02
DOOR_DEPTH = 0.10
KNOB = (0.09, 0.06, 0.05)
ROOF_T = 0.10
RIDGE_CAP_HW, RIDGE_CAP_T = 0.10, 0.05
VENT_W, VENT_H, VENT_Z, VENT_T, VENT_N = 0.50, 0.32, 0.55, 0.03, 3
BATTEN_STEP, BATTEN_W, BATTEN_T = 0.40, 0.07, 0.022
POST_R = 0.075
GROOVE = 0.008                  # floor-board edge dip: the board crowns sit ON the collision top


class H:
    """One house's parameters plus everything derived from them."""

    def __init__(self, name, **k):
        self.name = name
        self.__dict__.update(k)
        self.YF = self.D / 2
        self.EAVE = self.FLOOR + self.WALL_H
        self.RIDGE = self.EAVE + self.RISE
        if self.siding == "lap":
            n = max(1, round(self.WALL_H / self.COURSE_NOM))
            self.COURSE = self.WALL_H / n
            self.LINES = [self.FLOOR + self.COURSE * i for i in range(n + 1)]
        self.SPAN_A = self.D if self.ridge == "x" else self.W     # across the ridge
        self.SPAN_B = self.W if self.ridge == "x" else self.D     # along the ridge

    def m(self, role):
        return self.P + role

    def snap(self, z):
        if self.siding != "lap" or z > self.EAVE:
            return z
        return min(self.LINES, key=lambda c: abs(c - z))

    def off(self, z):
        """Siding's inward offset at height z (0 on course lines, -SIDING_D mid-course)."""
        if self.siding != "lap" or z <= self.FLOOR:
            return 0.0
        t = (z - self.FLOOR) / self.COURSE
        return -SIDING_D * (1.0 - abs((t % 1.0) * 2.0 - 1.0))

    def lattice(self, z0, z1):
        out = {z0, z1}
        if self.siding == "lap":
            k = 0
            while self.FLOOR + self.COURSE * k / 2 < z1:
                z = self.FLOOR + self.COURSE * k / 2
                if z > z0:
                    out.add(z)
                k += 1
        return sorted(out)

    def under(self, a):
        """Roof underside at `a` (across the ridge), pinned to EAVE on the wall line."""
        return self.EAVE + self.RISE * (1.0 - abs(a) / (self.SPAN_A / 2))

    def rmap(self, a, b, z):
        """Roof frame (a across, b along the ridge, z) -> world."""
        return Vector((b, a, z)) if self.ridge == "x" else Vector((a, b, z))

    def is_gable(self, side):
        return (side in ("+x", "-x")) == (self.ridge == "x")

    def frame_of(self, side):
        """(origin on the ground at the wall centre, u axis A, outward normal N, length).
        A = Z x N, so a quad wound (u0,v0) (u1,v0) (u1,v1) (u0,v1) faces along N."""
        YF, XF = self.D / 2, self.W / 2
        return {
            "+y": (Vector((0, YF, 0)), -X_, Y_, self.W),
            "-y": (Vector((0, -YF, 0)), X_, -Y_, self.W),
            "+x": (Vector((XF, 0, 0)), Y_, X_, self.D),
            "-x": (Vector((-XF, 0, 0)), -Y_, -X_, self.D),
        }[side]

    def wp(self, side, u, v, n=0.0):
        O, A, N, _ = self.frame_of(side)
        return O + A * u + Z_ * v + N * n

    def gable_half(self, L, z):
        return (L / 2) * (self.RIDGE - z) / self.RISE


def to_u(side, c):
    """World coordinate along a wall -> that wall's u."""
    return {"+y": -c, "-y": c, "+x": c, "-x": -c}[side]


# ---------------------------------------------------------------------------
# Geometry accumulator (doctors-office.py's)
# ---------------------------------------------------------------------------
class Part:
    def __init__(self, name):
        self.name, self.v, self.f, self.m = name, [], [], []

    def face(self, pts, mat, out):
        pts = [Vector(p) for p in pts]
        n = Vector()
        for i, a in enumerate(pts):          # Newell normal: robust for any planar polygon
            b = pts[(i + 1) % len(pts)]
            n += Vector(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x), (a.x - b.x) * (a.y + b.y)))
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
def siding(p, h, side, holes):
    """Wall with rectangular holes (u0, u1, v0, v1), greedy-merged per strip.  A gable wall
    carries on above the eave as trapezoid strips, cut around any gable hole."""
    O, A, N, L = h.frame_of(side)
    gable = h.is_gable(side)
    P = lambda u, z: O + A * u + Z_ * z + N * h.off(z)
    m = h.m("Siding")
    vs = set(h.lattice(h.FLOOR, h.RIDGE if gable else h.EAVE)) | {hl[i] for hl in holes for i in (2, 3)}
    if gable:
        vs.add(h.EAVE)
    vs = sorted(vs)
    us = sorted({-L / 2, L / 2} | {hl[i] for hl in holes for i in (0, 1)})
    for v0, v1 in zip(vs, vs[1:]):
        vm = (v0 + v1) / 2
        if v0 >= h.EAVE - 1e-9:
            g0, g1 = h.gable_half(L, v0), h.gable_half(L, v1)
            cuts = sorted(hl[i] for hl in holes if hl[2] < vm < hl[3] for i in (0, 1))
            if not cuts:
                if g1 < 1e-6:
                    p.face([P(-g0, v0), P(g0, v0), P(0.0, v1)], m, N)
                else:
                    p.face([P(-g0, v0), P(g0, v0), P(g1, v1), P(-g1, v1)], m, N)
                continue
            p.face([P(-g0, v0), P(cuts[0], v0), P(cuts[0], v1), P(-g1, v1)], m, N)
            for i in range(1, len(cuts) - 1, 2):
                p.face([P(cuts[i], v0), P(cuts[i + 1], v0), P(cuts[i + 1], v1), P(cuts[i], v1)], m, N)
            p.face([P(cuts[-1], v0), P(g0, v0), P(g1, v1), P(cuts[-1], v1)], m, N)
            continue
        run = None
        for ua, ub in list(zip(us, us[1:])) + [(None, None)]:
            solid_ = ua is not None and not any(hl[0] < (ua + ub) / 2 < hl[1] and hl[2] < vm < hl[3]
                                               for hl in holes)
            if solid_:
                run = (run[0], ub) if run else (ua, ub)
            elif run:
                p.face([P(run[0], v0), P(run[1], v0), P(run[1], v1), P(run[0], v1)], m, N)
                run = None


def battens(p, h, side, holes):
    """Board-and-batten: proud battens every BATTEN_STEP, split around each opening's frame.
    No end faces: an end either sits on the rim band, hides under the roof, or butts a frame
    that stands prouder (FRAME_OUT > BATTEN_T)."""
    O, A, N, L = h.frame_of(side)
    gable = h.is_gable(side)
    top = (lambda u: h.EAVE + h.RISE * (1 - abs(u) / (L / 2))) if gable else (lambda u: h.EAVE)
    m = h.m("Siding")
    lim = L / 2 - CORNER_W - 0.06
    n = int((2 * lim - BATTEN_W) // BATTEN_STEP)
    start = -(n * BATTEN_STEP) / 2
    for i in range(n + 1):
        uc = start + i * BATTEN_STEP
        u0, u1 = uc - BATTEN_W / 2, uc + BATTEN_W / 2
        spans = [(h.FLOOR, None)]                   # None: runs up to the wall top
        for hl in holes:
            fu0, fu1 = hl[0] - FRAME_W, hl[1] + FRAME_W
            if u1 <= fu0 or u0 >= fu1:
                continue
            fv0 = hl[2] if hl[2] <= h.FLOOR + 1e-6 else hl[2] - FRAME_W
            fv1 = hl[3] + FRAME_W
            nxt = []
            for a, b in spans:
                bb = b if b is not None else min(top(u0), top(u1))
                if fv1 <= a or fv0 >= bb:
                    nxt.append((a, b))
                    continue
                if fv0 > a:
                    nxt.append((a, fv0))
                if fv1 < bb:
                    nxt.append((fv1, b))
            spans = nxt
        for a, b in spans:
            b0 = top(u0) if b is None else b
            b1 = top(u1) if b is None else b
            if min(b0, b1) - a < 0.12:
                continue
            P = lambda u, v, t: h.wp(side, u, v, t)
            p.face([P(u0, a, BATTEN_T), P(u1, a, BATTEN_T), P(u1, b1, BATTEN_T), P(u0, b0, BATTEN_T)], m, N)
            p.face([P(u0, a, 0), P(u0, a, BATTEN_T), P(u0, b0, BATTEN_T), P(u0, b0, 0)], m, -A)
            p.face([P(u1, a, 0), P(u1, b1, 0), P(u1, b1, BATTEN_T), P(u1, a, BATTEN_T)], m, A)


def corners(p, h):
    """Corner boards over the seam at each corner, all four sides (closes the slot beside them)."""
    hx, hy = h.W / 2, h.D / 2
    o = CORNER_OUT if h.siding == "lap" else 0.03
    for sx in (-1, 1):
        for sy in (-1, 1):
            xs = sorted((sx * (hx - CORNER_W), sx * (hx + o)))
            ys = sorted((sy * (hy - CORNER_W), sy * (hy + o)))
            box(p, (xs[0], ys[0], h.FLOOR), (xs[1], ys[1], h.EAVE - 0.015), h.m("Trim"), skip={"bot"})


def ring_band(p, h, z0, z1, mat, out=FND_OUT, top=True, bottom=False):
    """A band proud of the wall footprint from z0 to z1, with its top ledge (and underside)."""
    hx, hy, o = h.W / 2, h.D / 2, out
    outer = [(-hx - o, -hy - o), (hx + o, -hy - o), (hx + o, hy + o), (-hx - o, hy + o)]
    inner = [(-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy)]
    for i in range(4):
        a, b = outer[i], outer[(i + 1) % 4]
        c, d = inner[(i + 1) % 4], inner[i]
        mid = Vector(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0))
        p.face([(*a, z0), (*b, z0), (*b, z1), (*a, z1)], mat, mid)
        if top:
            p.face([(*a, z1), (*b, z1), (*c, z1), (*d, z1)], mat, Z_)
    if bottom:
        p.face([(*q, z0) for q in outer], h.m("Wood"), -Z_)


def foundation(p, h):
    if h.siding == "batten":                         # the cabin: rim band on pier blocks
        rim = h.porch["rim"]
        ring_band(p, h, h.FLOOR - rim, h.FLOOR, h.m("Trim"), bottom=True)
        zb = h.FLOOR - rim
        for x in (-h.W / 2 + 0.2, 0.0, h.W / 2 - 0.2):
            for y in (-h.D / 2 + 0.2, 0.0, h.D / 2 - 0.2):
                box(p, (x - 0.17, y - 0.17, 0), (x + 0.17, y + 0.17, zb), h.m("Stone"), skip={"bot", "top"})
        return
    ring_band(p, h, 0.0, h.FLOOR, h.m("Brick") if h.P == "Cottage" else h.m("Stone"))


# ---------------------------------------------------------------------------
# Openings (trailer-home-a.py's frame / recess / curtain, in wall-local coordinates)
# ---------------------------------------------------------------------------
def frame(p, h, side, hole, skip_bottom=False):
    _, A, N, _ = h.frame_of(side)
    iu0, iu1, iv0, iv1 = hole
    ou0, ou1 = iu0 - FRAME_W, iu1 + FRAME_W
    ov0, ov1 = (iv0 if skip_bottom else iv0 - FRAME_W), iv1 + FRAME_W
    P = lambda u, v, n: h.wp(side, u, v, n)
    F, m, B = FRAME_OUT, h.m("Trim"), -SIDING_D      # B: the outer edge starts in the grooves
    if not skip_bottom:
        p.face([P(ou0, ov0, F), P(ou1, ov0, F), P(iu1, iv0, F), P(iu0, iv0, F)], m, N)
    p.face([P(iu0, iv1, F), P(iu1, iv1, F), P(ou1, ov1, F), P(ou0, ov1, F)], m, N)
    p.face([P(ou0, ov0, F), P(iu0, iv0, F), P(iu0, iv1, F), P(ou0, ov1, F)], m, N)
    p.face([P(iu1, iv0, F), P(ou1, ov0, F), P(ou1, ov1, F), P(iu1, iv1, F)], m, N)
    if not skip_bottom:
        p.face([P(ou0, ov0, B), P(ou1, ov0, B), P(ou1, ov0, F), P(ou0, ov0, F)], m, -Z_)
    p.face([P(ou1, ov1, B), P(ou0, ov1, B), P(ou0, ov1, F), P(ou1, ov1, F)], m, Z_)
    p.face([P(ou0, ov0, B), P(ou0, ov0, F), P(ou0, ov1, F), P(ou0, ov1, B)], m, -A)
    p.face([P(ou1, ov0, B), P(ou1, ov1, B), P(ou1, ov1, F), P(ou1, ov0, F)], m, A)


def curtain(p, h, side, rect, n, pleats, depth=PLEAT_D):
    """Pleated curtain on the opening's back plane n.  The folds stand FORWARD of it, inside
    the reveal: folded back, each valley opened a slot past the reveal's sill into the house."""
    u0, u1, v0, v1 = rect
    _, _, N, _ = h.frame_of(side)
    fold = lambda i: 0.0 if i in (0, pleats) else (
        -depth * PLEAT_MIX[(i // 2) % len(PLEAT_MIX)] if i % 2 else -depth * 0.15)
    for i in range(pleats):
        ua = u0 + (u1 - u0) * i / pleats
        ub = u0 + (u1 - u0) * (i + 1) / pleats
        da, db = n - fold(i), n - fold(i + 1)
        p.face([h.wp(side, ua, v0, da), h.wp(side, ub, v0, db), h.wp(side, ub, v1, db),
                h.wp(side, ua, v1, da)], h.m("Curtain"), N)


def recess(p, h, side, hole, depth, start, mat, floor_mat=None, floor_to=None):
    _, A, N, _ = h.frame_of(side)
    u0, u1, v0, v1 = hole
    b = start - depth
    P = lambda u, v, n: h.wp(side, u, v, n)
    p.face([P(u0, v0, b), P(u0, v0, start), P(u0, v1, start), P(u0, v1, b)], mat, A)
    p.face([P(u1, v0, b), P(u1, v1, b), P(u1, v1, start), P(u1, v0, start)], mat, -A)
    p.face([P(u0, v1, b), P(u1, v1, b), P(u1, v1, start), P(u0, v1, start)], mat, -Z_)
    f = start if floor_to is None else floor_to
    p.face([P(u0, v0, b), P(u1, v0, b), P(u1, v0, f), P(u0, v0, f)], floor_mat or mat, Z_)
    return b


def bar(p, h, side, u0, u1, v0, v1, f, b):
    """A flat bar across an opening at offset f, with its two long edges back to offset b."""
    _, A, N, _ = h.frame_of(side)
    P = lambda u, v, n: h.wp(side, u, v, n)
    m = h.m("Trim")
    p.face([P(u0, v0, f), P(u1, v0, f), P(u1, v1, f), P(u0, v1, f)], m, N)
    if v1 - v0 < u1 - u0:                       # horizontal bar: top and bottom edges
        p.face([P(u0, v1, b), P(u1, v1, b), P(u1, v1, f), P(u0, v1, f)], m, Z_)
        p.face([P(u0, v0, b), P(u1, v0, b), P(u1, v0, f), P(u0, v0, f)], m, -Z_)
    else:                                       # vertical bar: its two sides
        p.face([P(u0, v0, b), P(u0, v1, b), P(u0, v1, f), P(u0, v0, f)], m, -A)
        p.face([P(u1, v0, b), P(u1, v1, b), P(u1, v1, f), P(u1, v0, f)], m, A)


def window(p, h, side, hole, kind, shutters):
    b = recess(p, h, side, hole, WIN_DEPTH + FRAME_OUT, FRAME_OUT, h.m("Trim"))
    u0, u1, v0, v1 = hole
    pleats = max(2, 2 * round((u1 - u0) / 0.45))
    curtain(p, h, side, hole, b, pleats)
    frame(p, h, side, hole)
    f = -0.02
    if kind == "dh":                            # double-hung meeting rail
        vm = (v0 + v1) / 2
        bar(p, h, side, u0, u1, vm - RAIL_HW, vm + RAIL_HW, f, b)
    elif kind == "pic":                         # picture window: two mullions, three lights
        for t in (1 / 3, 2 / 3):
            um = u0 + (u1 - u0) * t
            bar(p, h, side, um - RAIL_HW, um + RAIL_HW, v0, v1, f, b)
    elif kind == "gable":                       # four-light square: a cross
        um, vm = (u0 + u1) / 2, (v0 + v1) / 2
        bar(p, h, side, u0, u1, vm - RAIL_HW, vm + RAIL_HW, f, b)
        bar(p, h, side, um - RAIL_HW, um + RAIL_HW, v0, vm - RAIL_HW, f, b)
        bar(p, h, side, um - RAIL_HW, um + RAIL_HW, vm + RAIL_HW, v1, f, b)
    if shutters:
        _, A, N, _ = h.frame_of(side)
        P = lambda u, v, n: h.wp(side, u, v, n)
        ov0, ov1 = v0 - FRAME_W, v1 + FRAME_W
        uc, w = (u0 + u1) / 2, u1 - u0
        acc = h.m("Red") if h.P == "Cottage" else h.m("Door")
        for s in (-1, 1):
            ua = uc + s * (w / 2 + FRAME_W + SHUT_GAP)
            ub = ua + s * SHUT_W
            ua, ub = sorted((ua, ub))
            pts = lambda n: [P(ua, ov0, n), P(ub, ov0, n), P(ub, ov1, n), P(ua, ov1, n)]
            bot, top = pts(-SIDING_D), pts(SHUT_T)
            c = sum(bot + top, Vector()) / 8
            for i in range(4):
                q = [bot[i], bot[(i + 1) % 4], top[(i + 1) % 4], top[i]]
                p.face(q, acc, sum(q, Vector()) / 4 - c)
            p.face(top, acc, N)


def door(p, h, side, hole):
    _, A, N, _ = h.frame_of(side)
    slab = {"Cottage": "Red", "Ranch": "Door", "Cabin": "Wood"}[h.P]
    floor_mat = h.m("Floor") if h.P == "Cottage" else h.m("Deck") if h.P == "Ranch" else h.m("Wood")
    b = recess(p, h, side, hole, DOOR_DEPTH + FRAME_OUT, FRAME_OUT, h.m("Trim"), floor_mat, 0.0)
    u0, u1, v0, v1 = hole
    uc = (u0 + u1) / 2
    ww, wh = 0.42, 0.55
    wz = v0 + 1.25
    i0, i1, j0, j1 = uc - ww / 2, uc + ww / 2, wz, wz + wh
    P = lambda u, v: h.wp(side, u, v, b)
    for q in ([P(u0, v0), P(u1, v0), P(i1, j0), P(i0, j0)], [P(i0, j1), P(i1, j1), P(u1, v1), P(u0, v1)],
              [P(u0, v0), P(i0, j0), P(i0, j1), P(u0, v1)], [P(i1, j0), P(u1, v0), P(u1, v1), P(i1, j1)]):
        p.face(q, h.m(slab), N)
    wb = recess(p, h, side, (i0, i1, j0, j1), 0.03, b, h.m(slab))
    curtain(p, h, side, (i0, i1, j0, j1), wb, 2, depth=0.02)
    frame(p, h, side, hole, skip_bottom=True)
    kw, kh, ko = KNOB
    ku = u0 + 0.12
    k = [h.wp(side, ku - kw / 2, v0 + 1.0 - kh / 2, b), h.wp(side, ku + kw / 2, v0 + 1.0 + kh / 2, b + ko)]
    box(p, tuple(min(k[0][i], k[1][i]) for i in range(3)), tuple(max(k[0][i], k[1][i]) for i in range(3)),
        h.m("Trim"), skip={0 if side == "+y" else 2})


def vent(p, h, side):
    """Louvred gable vent: a proud trim box whose face is V-grooves."""
    _, A, N, _ = h.frame_of(side)
    z0, z1 = h.EAVE + VENT_Z - VENT_H / 2, h.EAVE + VENT_Z + VENT_H / 2
    u0, u1, t, B = -VENT_W / 2, VENT_W / 2, VENT_T, -SIDING_D
    P = lambda u, v, n: h.wp(side, u, v, n)
    m = h.m("Trim")
    p.face([P(u0, z0, B), P(u1, z0, B), P(u1, z0, t), P(u0, z0, t)], m, -Z_)
    p.face([P(u0, z1, B), P(u1, z1, B), P(u1, z1, t), P(u0, z1, t)], m, Z_)
    p.face([P(u0, z0, B), P(u0, z1, B), P(u0, z1, t), P(u0, z0, t)], m, -A)
    p.face([P(u1, z0, B), P(u1, z1, B), P(u1, z1, t), P(u1, z0, t)], m, A)
    zz = [z0 + (z1 - z0) * k / VENT_N for k in range(VENT_N + 1)]
    for za, zb in zip(zz, zz[1:]):
        zm = (za + zb) / 2
        for zl, zh, dl, dh in ((za, zm, t, t - 0.02), (zm, zb, t - 0.02, t)):
            p.face([P(u0, zl, dl), P(u1, zl, dl), P(u1, zh, dh), P(u0, zh, dh)], m, N)


def holes_of(h):
    """{side: [(kind, hole, shutters)]} with hole = (u0, u1, v0, v1) snapped to the courses."""
    out = {s: [] for s in ("+y", "-y", "+x", "-x")}
    for kind, side, c, w, sill, head, sh in h.openings:
        uc = to_u(side, c)
        v0 = h.FLOOR if kind == "door" else h.snap(h.FLOOR + sill)
        out[side].append((kind, (uc - w / 2, uc + w / 2, v0, h.snap(h.FLOOR + head)), sh))
    return out


def walls_and_openings(p, h):
    for side, ops in holes_of(h).items():
        holes = [hl for _, hl, _ in ops]
        siding(p, h, side, holes)
        if h.siding == "batten":
            battens(p, h, side, holes)
        for kind, hl, sh in ops:
            if kind == "door":
                door(p, h, side, hl)
            else:
                window(p, h, side, hl, kind, sh)
    for side in h.vents:
        vent(p, h, side)


# ---------------------------------------------------------------------------
# Roof (built in the ridge frame: a across, b along) + chimneys
# ---------------------------------------------------------------------------
def roof(p, h):
    M = h.rmap
    hb, ha = h.SPAN_B / 2 + h.RAKE, h.SPAN_A / 2 + h.EAVE_OUT
    und = [(-ha, h.under(-ha)), (0.0, h.under(0.0)), (ha, h.under(ha))]
    top = [(a, z + ROOF_T) for a, z in und]
    rv = lambda a, b, z: h.rmap(a, b, z)          # a direction in the ridge frame -> world
    for i in range(2):
        (aa, za), (ab, zb) = top[i], top[i + 1]
        up = rv(-(zb - za), 0, ab - aa)
        p.face([M(aa, -hb, za), M(aa, hb, za), M(ab, hb, zb), M(ab, -hb, zb)], h.m("Roof"), up)
        (aa, za), (ab, zb) = und[i], und[i + 1]
        p.face([M(aa, -hb, za), M(aa, hb, za), M(ab, hb, zb), M(ab, -hb, zb)], h.m("Trim"), -up)
    for idx, s in ((0, -1), (2, 1)):                      # eave fascia
        a, uz = und[idx]
        p.face([M(a, -hb, uz), M(a, hb, uz), M(a, hb, uz + ROOF_T), M(a, -hb, uz + ROOF_T)],
               h.m("Trim"), rv(s, 0, 0))
    for b, s in ((hb, 1), (-hb, -1)):                     # rake ends: three quads
        for i in range(2):
            (aa, za), (ab, zb) = und[i], und[i + 1]
            p.face([M(aa, b, za), M(ab, b, zb), M(ab, b, zb + ROOF_T), M(aa, b, za + ROOF_T)],
                   h.m("Trim"), rv(0, s, 0))
    # ridge cap
    hx, z = hb + 0.02, h.RIDGE + ROOF_T
    sl = h.RISE / (h.SPAN_A / 2)
    lo, hi = M(-RIDGE_CAP_HW, -hx, z - RIDGE_CAP_HW * sl), M(RIDGE_CAP_HW, hx, z + RIDGE_CAP_T)
    box(p, tuple(min(lo[i], hi[i]) for i in range(3)), tuple(max(lo[i], hi[i]) for i in range(3)),
        h.m("Roof"), skip={"bot"})
    if h.P == "Cabin":                                    # standing seams down both slopes
        n = int((2 * hb - 0.3) // 0.45)
        b0 = -(n * 0.45) / 2
        for k in range(n + 1):
            b = b0 + k * 0.45
            for s in (-1, 1):
                a0, a1 = s * RIDGE_CAP_HW, s * (ha - 0.012)    # ends just behind the fascia
                z0, z1 = h.under(a0) + ROOF_T - 0.005, h.under(a1) + ROOF_T - 0.005
                ridge_ = [M(a0, b, z0 + 0.035), M(a1, b, z1 + 0.035)]
                for d in (-1, 1):
                    foot = [M(a0, b + d * 0.025, z0), M(a1, b + d * 0.025, z1)]
                    p.face([foot[0], foot[1], ridge_[1], ridge_[0]], h.m("Roof"), rv(0, d, 0.6))
                p.face([M(a1, b - 0.025, z1), M(a1, b + 0.025, z1), M(a1, b, z1 + 0.035)],
                       h.m("Roof"), rv(s, 0, 0))


def chimney_through(p, h, c, hw, top):
    """Masonry stack through the roof (doctors-office.py's), cap and flue tile."""
    cx, cy = c
    a = lambda x, y: y if h.ridge == "x" else x
    z0 = min(h.under(a(cx, cy) - hw), h.under(a(cx, cy) + hw)) - 0.05
    z1 = h.RIDGE + top
    m = h.m("Stone")
    box(p, (cx - hw, cy - hw, z0), (cx + hw, cy + hw, z1), m, skip={"bot", "top"})
    o = 0.05
    box(p, (cx - hw - o, cy - hw - o, z1), (cx + hw + o, cy + hw + o, z1 + 0.08), m)
    f = hw * 0.55
    box(p, (cx - f, cy - f, z1 + 0.08), (cx + f, cy + f, z1 + 0.20), h.m("Roof"), skip={"bot"})


def chimney_end(p, h):
    """The cottage's exterior brick chimney up the -X gable: a wide firebox base, sloped
    shoulders, a stack past the ridge.  Its back starts inside the wall (no slot in the grooves)."""
    m = h.m("Brick")
    xw = -h.W / 2 + 0.03
    base_d, stack_d = 0.70, 0.50
    bw, sw = 0.62, 0.36
    z_sh0, z_sh1 = h.FLOOR + 1.9, h.FLOOR + 2.35
    xb, xs = xw - base_d, xw - stack_d
    # firebox base (no back, no bottom)
    box(p, (xb, -bw, 0), (xw, bw, z_sh0), m, skip={1, "bot", "top"})
    # shoulders: a frustum from the base section to the stack section
    bot = [(xb, -bw, z_sh0), (xw, -bw, z_sh0), (xw, bw, z_sh0), (xb, bw, z_sh0)]
    top = [(xs, -sw, z_sh1), (xw, -sw, z_sh1), (xw, sw, z_sh1), (xs, sw, z_sh1)]
    solid(p, bot, top, m, skip={1, "bot", "top"})
    z1 = h.RIDGE + 0.55
    box(p, (xs, -sw, z_sh1), (xw, sw, z1), m, skip={"bot", "top"})     # its back shows above the roof
    o = 0.05
    box(p, (xs - o, -sw - o, z1), (xw + o, sw + o, z1 + 0.08), m)
    box(p, (xs + 0.12, -sw + 0.12, z1 + 0.08), (xw - 0.12, sw - 0.12, z1 + 0.22), h.m("Roof"), skip={"bot"})


def stovepipe(p, h):
    s = h.stovepipe
    cx, cy = s["c"]
    a = cx if h.ridge == "y" else cy
    z0 = h.under(a) - 0.05
    z1 = h.under(a) + ROOF_T + s["top"]
    tube(p, (cx, cy, z0), (cx, cy, z1), s["r"], h.m("Metal"), sides=8)
    # storm collar at the roof and a rain cap on three legs' worth of air
    zr = h.under(a + (s["r"] + 0.05) * (1 if a < 0 else -1)) + ROOF_T
    tube(p, (cx, cy, zr - 0.06), (cx, cy, zr + 0.10), s["r"] + 0.04, h.m("Metal"), sides=8, caps=(False, True))
    tube(p, (cx, cy, z1 + 0.10), (cx, cy, z1 + 0.16), s["r"] + 0.09, h.m("Metal"), sides=8, caps=(True, True))
    for k in range(3):
        ang = 2 * math.pi * k / 3
        px, py = cx + math.cos(ang) * s["r"] * 0.8, cy + math.sin(ang) * s["r"] * 0.8
        tube(p, (px, py, z1 - 0.02), (px, py, z1 + 0.11), 0.012, h.m("Metal"), sides=3)


# ---------------------------------------------------------------------------
# Porch floors: a grooved deck, boxed steps, open stair, posts and rails
# ---------------------------------------------------------------------------
def deck(p, x0, x1, y0, y1, zt, zb, along, board, mtop, mside, skip=("-y",), mbot=None):
    """A floor slab from zb to zt whose top is boards running along `along`, their edges
    dipped GROOVE below zt (the crowns are the collision top).  Faces across the boards follow
    the profile half-board by half-board; the two long sides sit at a board edge."""
    c0, c1 = (x0, x1) if along == "y" else (y0, y1)
    n = max(1, round((c1 - c0) / board))
    bw = (c1 - c0) / n
    prof = []
    for i in range(n):
        prof += [(c0 + bw * i, zt - GROOVE), (c0 + bw * (i + 0.5), zt)]
    prof.append((c1, zt - GROOVE))
    for (ca, za), (cb, zb_) in zip(prof, prof[1:]):
        if along == "y":
            p.face([(ca, y0, za), (cb, y0, zb_), (cb, y1, zb_), (ca, y1, za)], mtop, Z_)
        else:
            p.face([(x0, ca, za), (x1, ca, za), (x1, cb, zb_), (x0, cb, zb_)], mtop, Z_)
    ends = (("-y", y0), ("+y", y1)) if along == "y" else (("-x", x0), ("+x", x1))
    for name, e in ends:
        if name in skip:
            continue
        out = {"-y": -Y_, "+y": Y_, "-x": -X_, "+x": X_}[name]
        for (ca, za), (cb, zb_) in zip(prof, prof[1:]):
            if along == "y":
                p.face([(ca, e, zb), (cb, e, zb), (cb, e, zb_), (ca, e, za)], mside, out)
            else:
                p.face([(e, ca, zb), (e, cb, zb), (e, cb, zb_), (e, ca, za)], mside, out)
    sides = (("-x", x0), ("+x", x1)) if along == "y" else (("-y", y0), ("+y", y1))
    zs = zt - GROOVE
    for name, e in sides:
        if name in skip:
            continue
        out = {"-y": -Y_, "+y": Y_, "-x": -X_, "+x": X_}[name]
        if along == "y":
            p.face([(e, y0, zb), (e, y1, zb), (e, y1, zs), (e, y0, zs)], mside, out)
        else:
            p.face([(x0, e, zb), (x1, e, zb), (x1, e, zs), (x0, e, zs)], mside, out)
    if zb > 1e-6:
        p.face([(x0, y0, zb), (x1, y0, zb), (x1, y1, zb), (x0, y1, zb)], mbot or mside, -Z_)


def boxed_steps(p, h, x0, x1, yfront, risers, run, mat):
    """Solid steps down from the floor toward the road (doctors-office.py's)."""
    rise = h.FLOOR / risers
    for k in range(1, risers):
        box(p, (x0, yfront + run * (k - 1), 0), (x1, yfront + run * k, h.FLOOR - rise * k), mat, skip={"bot", 0})


def porch_covered(p, h):
    q = h.porch
    x0, x1 = q["x"]
    y0, y1 = h.YF + FND_OUT, h.YF + q["depth"]
    deck(p, x0, x1, y0, y1, h.FLOOR, 0.0, "y", q["board"], h.m("Floor"), h.m("Brick"))
    boxed_steps(p, h, *q["steps"], y1, q["risers"], q["run"], h.m("Floor"))
    # shed roof on the posts: underside heights above FLOOR at the wall and at its front edge
    zw, zf = h.FLOOR + q["roof"][0], h.FLOOR + q["roof"][1]
    ov = 0.15
    rx0, rx1, yf = x0 - ov, x1 + ov, y1 + ov
    zu = lambda y: zw + (zf - zw) * (y - h.YF) / (yf - h.YF)
    yw = h.YF - SIDING_D
    bot = [(rx0, yw, zu(yw)), (rx1, yw, zu(yw)), (rx1, yf, zu(yf)), (rx0, yf, zu(yf))]
    top = [(x, y, z + ROOF_T) for x, y, z in bot]
    up = Vector((0, -(zu(yf) - zu(h.YF)), yf - h.YF))
    p.face(top, h.m("Roof"), up)
    p.face(bot, h.m("Trim"), -up)
    p.face([bot[0], bot[1], top[1], top[0]], h.m("Trim"), -Y_)   # shows past the corners
    p.face([bot[2], bot[3], top[3], top[2]], h.m("Trim"), Y_)
    p.face([bot[0], bot[3], top[3], top[0]], h.m("Trim"), -X_)
    p.face([bot[1], bot[2], top[2], top[1]], h.m("Trim"), X_)
    py = y1 - 0.12
    for px in q["posts"]:
        tube(p, (px, py, h.FLOOR - 0.02), (px, py, zu(py) + 0.02), POST_R, h.m("Trim"))
    # a beam under the roof's front edge, post to post
    by0, by1 = py - 0.07, py + 0.07
    box(p, (q["posts"][0] - 0.07, by0, zu(by1) - 0.16), (q["posts"][-1] + 0.07, by1, zu(by0)),
        h.m("Trim"), skip={"top"})


def posts_under(p, pts, z1, mat):
    for x, y in pts:
        box(p, (x - 0.05, y - 0.05, 0), (x + 0.05, y + 0.05, z1), mat, skip={"bot", "top"})


def porch_deck(p, h):
    q = h.porch
    x0, x1 = q["x"]
    y0, y1 = h.YF + FND_OUT, h.YF + q["depth"]
    zb = h.FLOOR - q["rim"]
    m = h.m("Deck")
    deck(p, x0, x1, y0, y1, h.FLOOR, zb, "x", q["board"], m, m)
    posts_under(p, [(x0 + 0.08, y1 - 0.08), (x1 - 0.08, y1 - 0.08), ((x0 + x1) / 2, y1 - 0.08),
                    (x0 + 0.08, y0 + 0.4), (x1 - 0.08, y0 + 0.4)], zb, m)
    boxed_steps(p, h, *q["steps"], y1, q["risers"], q["run"], m)


def porch_landing(p, h):
    q = h.porch
    x0, x1 = q["x"]
    y0, y1 = h.YF + FND_OUT, h.YF + q["depth"]
    rim = q["rim"]
    zb = h.FLOOR - rim
    m = h.m("Wood")
    deck(p, x0, x1, y0, y1, h.FLOOR, zb, "x", q["board"], m, h.m("Trim"), mbot=m)
    for x in (x0 + 0.17, x1 - 0.17):
        box(p, (x - 0.17, y1 - 0.34, 0), (x + 0.17, y1, zb), h.m("Stone"), skip={"bot", "top"})
    # open stair down +X along the front wall: two stringers, treads between, one handrail
    sy0, sy1 = h.YF + q["stair_y"][0], h.YF + q["stair_y"][1]
    n, run = q["risers"], q["run"]
    r = h.FLOOR / n
    L = n * run
    zt = lambda s: h.FLOOR - r * s / run
    st_t, st_h = 0.05, 0.24
    sg = (h.FLOOR - st_h) * run / r              # where the stringer's lower edge meets the ground
    for ya, yb in ((sy0, sy0 + st_t), (sy1 - st_t, sy1)):
        prof = [(0.0, h.FLOOR), (L, 0.0), (sg, 0.0), (0.0, h.FLOOR - st_h)]
        bot = [(x1 + s, ya, z) for s, z in prof]
        top = [(x1 + s, yb, z) for s, z in prof]
        solid(p, bot, top, m, skip={1, 3})       # not the face on the ground, nor the one on the landing
    for k in range(1, n):
        s0, s1 = run * (k - 1), run * k
        zk = h.FLOOR - r * k
        box(p, (x1 + s0 + 0.01, sy0 + st_t, zk - 0.045), (x1 + s1 + 0.02, sy1 - st_t, zk), m, skip={0, 2})
    yr = sy0 + st_t / 2                         # wall side: clear of the road's line to the door
    rh = q["rail_h"]
    pa, pb = 0.10, L - 0.18
    for s in (pa, pb):
        tube(p, (x1 + s, yr, zt(s) - 0.05), (x1 + s, yr, zt(s) + rh + 0.03), 0.045, m, caps=(False, True))
    tube(p, (x1 + pa - 0.05, yr, zt(pa - 0.05) + rh - 0.02), (x1 + pb + 0.05, yr, zt(pb + 0.05) + rh - 0.02),
         0.032, m, caps=(True, True))


def build_house(h):
    p = Part(h.name)
    foundation(p, h)
    walls_and_openings(p, h)
    corners(p, h)
    roof(p, h)
    if h.P == "Cottage":
        chimney_end(p, h)
        porch_covered(p, h)
    elif h.P == "Ranch":
        chimney_through(p, h, **h.chimney)
        porch_deck(p, h)
    else:
        stovepipe(p, h)
        porch_landing(p, h)
    return p


# ---------------------------------------------------------------------------
# Blender side
# ---------------------------------------------------------------------------
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


def bake(part, offset=0.0):
    me = bpy.data.meshes.new(part.name)
    me.from_pydata([(x + offset, y, z) for x, y, z in part.v], [], part.f)
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
    n = len(m.loop_triangles)
    ev.to_mesh_clear()
    return n


def tris_by_material(ob):
    out = {}
    for poly in ob.data.polygons:
        n = ob.data.materials[poly.material_index].name
        out[n] = out.get(n, 0) + len(poly.vertices) - 2
    return out


def bbox(ob):
    lo = [min(v.co[i] for v in ob.data.vertices) for i in range(3)]
    hi = [max(v.co[i] for v in ob.data.vertices) for i in range(3)]
    return lo, hi


def check_facing(ob, n=24):
    """Ray-cast from a ring of eyes at the model; every first hit must face back at the ray.
    (+0.0137 rad keeps symmetric rays off shared edges.)"""
    from mathutils.bvhtree import BVHTree
    tree = BVHTree.FromObject(ob, bpy.context.evaluated_depsgraph_get())
    lo, hi = bbox(ob)
    f = (0.1, 0.3, 0.5, 0.7, 0.9)
    targets = [Vector((lo[0] + (hi[0] - lo[0]) * a, lo[1] + (hi[1] - lo[1]) * b, lo[2] + (hi[2] - lo[2]) * c))
               for a in f for b in f for c in f]
    eyes = [Vector((math.cos(a) * 25, math.sin(a) * 25, z))
            for a in [2 * math.pi * k / n + 0.0137 for k in range(n)] for z in (0.4, 1.5, 5, 18)]
    bad = hits = 0
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
    """Same-facing faces within `gap` of one plane that overlap with area (z-fight)."""
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


def collision(h):
    """The registry's `collision` for this house, in glTF model axes (x, y up, z = -Blender y).
    Body: the walls (+ foundation) to the eave.  Porch: the floor slab, 0 to FLOOR, wall to front
    edge, so a paper dropping down the wall lands on it and one landing on it rests there.  Steps,
    stair, posts, rails and roofs are left soft."""
    q = h.porch
    x0, x1 = q["x"]
    bw, bd = h.W + 2 * FND_OUT, h.D + 2 * FND_OUT
    body = {"c": [0, round(h.EAVE / 2, 3), 0], "s": [round(bw, 3), round(h.EAVE, 3), round(bd, 3)]}
    za, zb = h.YF + FND_OUT, h.YF + q["depth"]
    porch = {"c": [round((x0 + x1) / 2, 3), round(h.FLOOR / 2, 3), round(-(za + zb) / 2, 3)],
             "s": [round(x1 - x0, 3), round(h.FLOOR, 3), round(zb - za, 3)]}
    return body, porch


def report(h, ob):
    t = evaluated_tris(ob)
    bad, hits = check_facing(ob)
    zf = check_zfight(ob)
    lo, hi = bbox(ob)
    seat = PAD_HZ - (-lo[1]) - BACK_CLEAR
    room = PAD_HZ + seat - hi[1]
    body, porch = collision(h)
    q = h.porch
    print("=" * 64)
    print(f"  {h.name}  {t} tris (budget {h.budget})  materials {len(ob.data.materials)}  images "
          f"{sum(i.type == 'IMAGE' for i in bpy.data.images)}")
    for k, v in sorted(tris_by_material(ob).items(), key=lambda kv: -kv[1]):
        print(f"     {k:<16}{v:5d}")
    print(f"  walls {h.W} x {h.D}; floor {h.FLOOR}; eave {h.EAVE:.2f}; ridge {h.RIDGE:.2f}")
    print(f"  overall x {lo[0]:.2f}..{hi[0]:.2f}  y {lo[1]:.2f}..{hi[1]:.2f}  z {lo[2]:.2f}..{hi[2]:.2f}"
          f"  ({hi[0]-lo[0]:.2f} x {hi[1]-lo[1]:.2f} x {hi[2]-lo[2]:.2f} m)")
    print(f"  porch floor {q['x'][1]-q['x'][0]:.2f} wide x {q['depth']-FND_OUT:.2f} deep at {h.FLOOR:.2f} m")
    print(f"  seat {seat:.2f} (back {BACK_CLEAR} m inside the pad); front {room:.2f} m inside the pad's road edge")
    print(f"  collision body {body}  porch {porch}")
    print(f"  facing: {bad} inverted first-hits of {hits}")
    print(f"  z-fight pairs: {len(zf)} {zf[:8]}")
    ok = bad == 0 and not zf and t <= h.budget and room > 0
    print(f"  {'OK' if ok else 'FAIL'}")
    return ok


def _fresh_scene():
    for d in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.images,
              bpy.data.cameras, bpy.data.lights, bpy.data.worlds):
        for x in list(d):
            d.remove(x)


def houses():
    return [H(name, **k) for name, k in VARIANTS.items()]


def build(offset=False):
    """All three side by side (the .blend's source view); returns the objects and whether every
    check passed."""
    _fresh_scene()
    obs, ok, x = [], True, 0.0
    for h in houses():
        ob = bake(build_house(h), x if offset else 0.0)
        if not offset:                      # the checks' eye ring is centred on the origin
            ok = report(h, ob) and ok
        obs.append(ob)
        x += 14.0
    return obs, ok


def export():
    ok = True
    for h in houses():
        _fresh_scene()
        ob = bake(build_house(h))
        ok = report(h, ob) and ok
        bpy.ops.export_scene.gltf(
            filepath=f"{OUT_DIR}/{h.name}.glb", export_format="GLB",
            export_draco_mesh_compression_enable=False, export_yup=True,
            export_apply=True, export_materials="EXPORT", export_texcoords=False,
            export_normals=True, export_cameras=False, export_lights=False,
            use_selection=False, use_active_scene=True)
        print(f"  wrote {OUT_DIR}/{h.name}.glb")
    build(offset=True)
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    print(f"  wrote {OUT_BLEND}")
    return ok


# ---------------------------------------------------------------------------
# Review renders: per model a front three-quarter, a side elevation and the thrower's view
# ---------------------------------------------------------------------------
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


def scenery(seat):
    sc = bpy.context.scene
    _plane("Ground", -80, 80, -80, 80, -0.03, _flat("Ground", (0.16, 0.17, 0.10)))
    _plane("Pad", -PAD_HX, PAD_HX, seat - PAD_HZ, seat + PAD_HZ, -0.005, _flat("Pad", (0.24, 0.20, 0.15)))
    ry = seat + PAD_HZ + PAD_GAP
    _plane("Road", -80, 80, ry, ry + 7.0, -0.01, _flat("Road", (0.05, 0.05, 0.055), 0.8))
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
    sc.render.resolution_x, sc.render.resolution_y = 960, 540
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.view_settings.view_transform = "AgX"
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    return sc, cam, ry


def _shoot(sc, cam, path, eye, target, fov):
    eye, target = Vector(eye), Vector(target)
    cam.location = eye
    cam.rotation_mode = "QUATERNION"
    cam.rotation_quaternion = (target - eye).to_track_quat("-Z", "Y")
    cam.data.sensor_fit = "VERTICAL"
    cam.data.angle_y = math.radians(fov)
    cam.data.clip_start = 0.05
    cam.data.clip_end = 400
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def render_one(tag, door, front_y, seat):
    """Same cameras for every model, so the sheet compares them at one scale.  The thrower sits
    in the FAR lane 1.5 m up, 12 m from the porch's front edge in front of the door (from the
    near lane, 12 m away is nearly straight down the road)."""
    sc, cam, ry = scenery(seat)
    lane = ry + 5.25
    dy = lane - front_y
    dx = math.sqrt(max(0.0, 12.0 ** 2 - dy ** 2))
    out = []
    out.append(_shoot(sc, cam, f"{RENDER_DIR}/{tag}-34.png", (12.0, 16.0, 6.0), (0.0, 1.0, 1.9), 40))
    out.append(_shoot(sc, cam, f"{RENDER_DIR}/{tag}-side.png", (26.0, 1.5, 1.6), (0.0, 1.5, 1.9), 22))
    out.append(_shoot(sc, cam, f"{RENDER_DIR}/{tag}-road.png", (door[0] + dx, lane, 1.5),
                      (door[0], door[1], door[2]), 45))
    return out


def render():
    os.makedirs(RENDER_DIR, exist_ok=True)
    paths = []
    for h in houses():
        _fresh_scene()
        ob = bake(build_house(h))
        lo, hi = bbox(ob)
        seat = PAD_HZ - (-lo[1]) - BACK_CLEAR
        door_x = next(c for k, s, c, *_ in h.openings if k == "door")
        paths += render_one(h.name, (door_x, h.YF, h.FLOOR + 1.0), h.YF + h.porch["depth"], seat)
    _fresh_scene()
    bpy.ops.import_scene.gltf(filepath=TRAILER_GLB)
    pts = [o.matrix_world @ Vector(c) for o in bpy.data.objects if o.type == "MESH" for c in o.bound_box]
    lo = [min(v[i] for v in pts) for i in range(3)]
    hi = [max(v[i] for v in pts) for i in range(3)]
    paths += render_one("trailer-home-a", (0.9, 1.75, 1.6), hi[1], 1.7)   # registry seat 1.7
    contact_sheet(paths, f"{RENDER_DIR}/sheet.png", cols=3)


def contact_sheet(paths, dest, cols):
    """Stitch the renders into one image, row-major from the top (numpy ships with Blender)."""
    import numpy as np
    imgs = [bpy.data.images.load(p) for p in paths]
    w, hgt = imgs[0].size
    rows = -(-len(imgs) // cols)
    sheet = np.ones((rows * hgt, cols * w, 4), dtype=np.float32)
    for k, im in enumerate(imgs):
        px = np.empty(w * hgt * 4, dtype=np.float32)
        im.pixels.foreach_get(px)
        r, c = divmod(k, cols)
        y0 = (rows - 1 - r) * hgt
        sheet[y0:y0 + hgt, c * w:(c + 1) * w] = px.reshape(hgt, w, 4)
    out = bpy.data.images.new("Sheet", cols * w, rows * hgt, alpha=True)
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
