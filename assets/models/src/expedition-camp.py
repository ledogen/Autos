"""
ASSET-71 — the expedition camp (R1's boss, FEAT-103), + the road barrier that ends the road past it.
Parametric generator.

Built for: Blender 5.2  |  Promoted 2026-10-29 after the owner's review (chairs off the table and
the crates, fire out from the fly, radio crate swung clear of the guys, roof jack laid with the slope).
Result: camp 4931 tris / 19 materials / 0 images; barrier 532 tris / 5 materials.
Run in the GUI over blender-mcp (headless `blender -b` never exports): exec this file, call export().
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

RE-SCOPE (owner, 2026-10-27).  The ticket was written for the `workSite` job site (trailer, fence,
materials).  FEAT-103 (2026-10-24) made ASSET-71 the expedition camp's model instead: a crew at the
wall searching for the Roamer's old trail out.  Content picked by the owner:
  * hero piece: a canvas WALL TENT, door to the road, stovepipe through the roof;
  * a mess fly (orange tarp) over a map table, a survey tripod with a banded range pole, a guyed
    radio mast with a pennant;
  * composited from shipped models: two small tents, campfire + cooking kit, camp chairs, fuel drums;
  * the camp visibly NEEDS the requisition (firewood, crew, food, fuel, gear): an almost empty
    firewood rack, jerry cans and drums, a few gear crates.
The barrier is the second output (owner: "this kit, own .glb"): one Type III barricade, 3.0 m;
FEAT-103 places it across the road deck past the camp.

Outputs (one generator, per ASSETS.md "a kit is ONE generator"):
  expedition-camp.glb  — the POI, base-seated, centred on the 14 x 8 m pad, ONE merged mesh
  road-barrier.glb     — base-seated, centred, striped face to -Z (glTF)

AXES.  Blender +Y = glTF -Z = forward = the road side of the pad.  Pad: X along the road
(±7.0 m, poi.js poiPadHalfLen), Y across it (±4.0 m, poiPadHalfWid).
Composited models keep their shipped mesh; their materials are ALIASED onto this file's where the
colour and sidedness match (ALIAS), so the camp's draw calls stay countable.
Determinism: no randomness except random.Random(seed).
"""

import bpy
import os
import bmesh
import math
import random
from mathutils import Matrix, Vector

# ---------------------------------------------------------------------------
# PARAMETERS
# ---------------------------------------------------------------------------
MODELS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # composited kit is read here
OUT_DIR = MODELS
OUT_BLEND = f"{MODELS}/src/expedition-camp.blend"

TRI_BUDGETS = {"expedition-camp": 5000, "road-barrier": 600}   # owner 2026-10-27: ~5000

PAD = (7.0, 4.0)        # half extents; nothing may leave it

MATS = {
    #  name           base colour (linear)              rough  double-sided
    "Canvas":       ((0.560, 0.500, 0.360, 1.0), 0.95, False),
    "CanvasSod":    ((0.050, 0.060, 0.035, 1.0), 0.95, False),
    "TentDark":     ((0.018, 0.016, 0.014, 1.0), 0.95, False),
    "FlyOrange":    ((0.620, 0.130, 0.020, 1.0), 0.85, True),
    "Pole":         ((0.130, 0.130, 0.135, 1.0), 0.45, False),
    "StovePipe":    ((0.028, 0.027, 0.026, 1.0), 0.80, False),
    "WoodBark":     ((0.090, 0.055, 0.030, 1.0), 0.95, False),
    "WoodSplit":    ((0.520, 0.380, 0.220, 1.0), 0.90, False),
    "SignWhite":    ((0.780, 0.780, 0.760, 1.0), 0.60, False),
    "SurveyYellow": ((0.620, 0.360, 0.020, 1.0), 0.60, False),
    "CrateOlive":   ((0.075, 0.090, 0.040, 1.0), 0.80, False),
    "TentGuy":      ((0.350, 0.280, 0.180, 1.0), 0.85, True),    # = tent.glb's, so they merge
    "DrumPaint":    ((0.240, 0.055, 0.032, 1.0), 0.45, False),   # = drum-closed.glb's
    # barrier
    "BarrierOrange": ((0.700, 0.130, 0.010, 1.0), 0.55, False),
    "Sandbag":      ((0.200, 0.150, 0.080, 1.0), 0.95, False),
    "LampAmber":    ((0.800, 0.350, 0.010, 1.0), 0.30, False),
}

# Composited material -> this file's material (same role, near colour, same sidedness).
ALIAS = {
    "KitIron": "StovePipe", "ChairFrame": "StovePipe", "FireCoal": "TentDark",
    "KitChain": "Pole", "DrumSteel": "Pole", "FireLog": "WoodBark",
    "ChairFabric": "FlyOrange",     # orange expedition chairs, matched to the fly
}

# Wall tent (local: door at +Y, X across, Z up).  A 12 x 14 ft outfitter's tent.
WT_AT = (-3.8, -0.6, 0.0)       # x, y, yaw
WT_W, WT_L = 3.6, 4.4           # wall to wall, gable to gable
WT_WALL, WT_RIDGE = 1.55, 2.75  # wall height, ridge height (roof underside)
WT_SOD = 0.16                   # sod-cloth band at the foot of the walls
WT_EAVE = 0.16                  # roof overhang past the wall
WT_T = 0.025                    # roof canvas + rafter thickness (its top face stands this proud)
WT_FRAMES = 4                   # frame lines (gables included) -> 3 bays
WT_SAG_WALL, WT_SAG_ROOF = 0.05, 0.08     # canvas sag mid-bay (flat shading turns it into banding)
WT_DOOR = (0.42, 1.80, 0.55)    # door half-width, height, recess depth
WT_PIPE = (0.9, -1.15, 0.065, 1.0)   # stovepipe x, y (tent local), radius, height above the roof
WT_GUY = 0.95                   # guy stake distance out from the eave

FLY_AT = (2.4, 0.4)             # mess fly centre
FLY_HX, FLY_HY = 2.2, 1.7
FLY_RIDGE, FLY_EDGE = 2.55, 2.0
FLY_SAG = 0.07
FLY_NX, FLY_NY = 8, 4
FLY_GUY = 0.9

TABLE_AT = (2.3, 0.5, math.radians(4))
CHAIRS = [(1.15, 0.30, math.radians(-80)), (3.45, 0.95, math.radians(100)),   # at the table ends
          (0.35, 2.95, math.radians(95)), (-2.15, 2.85, math.radians(-80))]   # either side of the fire
FIRE_AT = (-0.9, 3.0, math.radians(20))    # out in front, clear of the fly
TENTS = [(1.8, -2.6, math.radians(88)), (5.1, -2.6, math.radians(-93))]   # side-on, doors facing
RACK_AT = (-1.05, -3.3, 0.0)
FUEL_AT = (-6.0, 2.85)
CRATES_AT = (-1.55, -0.6, math.radians(-4))   # between two of the wall tent's guy lines
SURVEY_AT = (5.9, 2.7)
MAST_AT = (5.9, 0.6)
MAST_H = 6.5
MAST_GUY_R = 1.0
MAST_KIT_SWING = math.radians(58)   # radio crate swung round the mast, between two guys

BAR_LEN = 3.0                   # barrier rail length
BAR_RAILS = (0.42, 0.82, 1.22)  # rail bottoms
BAR_RAIL_H, BAR_RAIL_T = 0.20, 0.025
BAR_STRIPE = 0.15               # stripe width measured square to the 45° stripe
BAR_POSTS = 1.15                # upright x
BAR_TOP = 1.50


# ---------------------------------------------------------------------------
# Geometry accumulator + primitives (as splitting-yard.py)
# ---------------------------------------------------------------------------
class Part:
    def __init__(self, name):
        self.name, self.v, self.f, self.m = name, [], [], []

    def add(self, verts, faces, mat, M=None):
        o = len(self.v)
        if M is not None:
            verts = [tuple(M @ Vector(c)) for c in verts]
        self.v.extend(tuple(c) for c in verts)
        for k, fc in enumerate(faces):
            self.f.append([i + o for i in fc])
            self.m.append(mat[k] if isinstance(mat, list) else mat)

    def extend(self, other, M=None):
        self.add(other.v, [list(f) for f in other.f], list(other.m), M)

    def zmin(self):
        return min(v[2] for v in self.v)


def T(x, y, z=0.0):
    return Matrix.Translation((x, y, z))


def RZ(a):
    return Matrix.Rotation(a, 4, "Z")


def place(x, y, yaw, z=0.0):
    return T(x, y, z) @ RZ(yaw)


ALONG_X = Matrix.Rotation(math.pi / 2, 4, "Y")     # local Z -> world +X
ALONG_Y = Matrix.Rotation(-math.pi / 2, 4, "X")    # local Z -> world +Y


def box(p, lo, hi, mat, M=None):
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
         (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    f = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
         [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
    p.add(v, f, mat, M)


def prism(p, poly, z0, z1, mat, cap=None, M=None):
    """Extrude a local-XY polygon along local Z.  mat: str or per-edge list."""
    n = len(poly)
    v = [(a, b, z0) for a, b in poly] + [(a, b, z1) for a, b in poly]
    f, m = [], []
    for i in range(n):
        j = (i + 1) % n
        f.append([i, j, n + j, n + i])
        m.append(mat[i] if isinstance(mat, list) else mat)
    f += [list(range(n - 1, -1, -1)), list(range(n, 2 * n))]
    m += [cap or (mat if isinstance(mat, str) else mat[0])] * 2
    p.add(v, f, m, M)


def lathe(p, profile, seg, mat, cap=None, M=None, phase=0.0):
    """Surface of revolution about local Z; profile = [(z, r)], capped."""
    v, f = [], []
    for z, r in profile:
        v += [(math.cos(2 * math.pi * k / seg + phase) * r,
               math.sin(2 * math.pi * k / seg + phase) * r, z) for k in range(seg)]
    for s in range(len(profile) - 1):
        a, b = s * seg, (s + 1) * seg
        f += [[a + k, a + (k + 1) % seg, b + (k + 1) % seg, b + k]
              for k in range(seg)]
    last = (len(profile) - 1) * seg
    f += [list(range(seg - 1, -1, -1)), list(range(last, last + seg))]
    m = [mat] * (len(f) - 2) + [cap or mat] * 2
    p.add(v, f, m, M)


def frame_to(a, b):
    """Matrix taking local Z (0..|b-a|) onto the segment a -> b."""
    a, b = Vector(a), Vector(b)
    q = (b - a).normalized().to_track_quat("Z", "Y").to_matrix().to_4x4()
    return Matrix.Translation(a) @ q, (b - a).length


def bar(p, a, b, w, mat):
    """Square tube of side w from point a to point b."""
    M, L = frame_to(a, b)
    box(p, (-w / 2, -w / 2, 0), (w / 2, w / 2, L), mat, M)


def rod(p, a, b, r, mat, seg=6):
    """Round tube from a to b."""
    M, L = frame_to(a, b)
    lathe(p, [(0, r), (L, r)], seg, mat, M=M)


def seated(part):
    """The same part lifted so its lowest vertex is on z = 0."""
    out = Part(part.name)
    out.extend(part, T(0, 0, -part.zmin()))
    return out


# ---------------------------------------------------------------------------
# The wall tent
# ---------------------------------------------------------------------------
def wt_ring(sw, sr):
    """Cross-section (x, z) at one station; sw / sr = wall / roof sag there.
    Floor-left, up the left wall, out under the eave, over the ridge, mirror."""
    hw = WT_W / 2
    m = (WT_RIDGE - WT_WALL) / hw          # roof slope
    left = [(-hw, 0.0), (-hw + sw * 0.5, WT_SOD), (-hw + sw, WT_WALL),
            (-hw - WT_EAVE, WT_WALL - m * WT_EAVE),
            (-hw - WT_EAVE, WT_WALL - m * WT_EAVE + WT_T),
            (-hw / 2, WT_WALL + m * hw / 2 + WT_T - sr)]
    ridge = [(0.0, WT_RIDGE + WT_T)]
    return left + ridge + [(-x, z) for x, z in reversed(left)]




def build_wall_tent():
    p = Part("WallTent")
    hw, hl = WT_W / 2, WT_L / 2
    m = (WT_RIDGE - WT_WALL) / hw
    # stations: each frame line + each bay middle
    nb = WT_FRAMES - 1
    st = [(-hl + WT_L * k / (2 * nb), (k % 2)) for k in range(2 * nb + 1)]
    rings = [wt_ring(WT_SAG_WALL * w, WT_SAG_ROOF * w) for _, w in st]
    n = len(rings[0])
    # edge materials: 0 sod, 1 wall, 2 eave underside, 3 eave lip, 4..9 roof,
    # mirrored back down, last = floor
    # edges: sod, wall, eave underside, eave lip, roof x2, roof x2, lip, underside, wall, sod,
    # and the floor (the ring closes floor-right -> floor-left) — never seen, so not built: the
    # ground the tent stands on is what shows through the door
    em = ["CanvasSod"] + ["Canvas"] * 10 + ["CanvasSod", None]
    assert len(em) == n, (len(em), n)
    verts, faces, mats = [], [], []
    for (y, _), r in zip(st, rings):
        verts += [(x, y, z) for x, z in r]
    for s in range(len(st) - 1):
        a, b = s * n, (s + 1) * n
        for i in range(n):
            if em[i] is None:
                continue
            j = (i + 1) % n
            faces.append([a + i, a + j, b + j, b + i])
            mats.append(em[i])
    # back gable: plain cap
    faces.append(list(range(n - 1, -1, -1)))
    mats.append("Canvas")
    # front gable with the door notched out of its bottom edge
    dw, dh, dd = WT_DOOR
    front = (len(st) - 1) * n
    o = len(verts)
    verts += [(dw, hl, 0.0), (dw, hl, dh), (-dw, hl, dh), (-dw, hl, 0.0)]
    faces.append([front + i for i in range(n)] + [o, o + 1, o + 2, o + 3])
    mats.append("Canvas")
    # the recess behind the door: a dark dent welded to the notch (no bottom: the floor is
    # the ground the tent stands on)
    o2 = len(verts)
    verts += [(dw, hl - dd, 0.0), (dw, hl - dd, dh), (-dw, hl - dd, dh), (-dw, hl - dd, 0.0)]
    faces += [[o, o2, o2 + 1, o + 1], [o + 1, o2 + 1, o2 + 2, o + 2],
              [o + 2, o2 + 2, o2 + 3, o + 3], [o2, o2 + 3, o2 + 2, o2 + 1]]
    mats += ["TentDark"] * 4
    p.add(verts, faces, mats)

    # door flaps rolled up beside the door, tied
    for sx in (-1, 1):
        x = sx * (dw + 0.07)
        rod(p, (x, hl + 0.07, 0.10), (x * 1.04, hl + 0.07, dh + 0.02), 0.065, "Canvas", seg=6)
        for z in (0.75, 1.45):
            box(p, (x - 0.075, hl + 0.0, z), (x + 0.075, hl + 0.145, z + 0.025), "TentGuy")
    # valance strip over the door (the flap's head, rolled)
    rod(p, (-dw - 0.12, hl + 0.06, dh + 0.06), (dw + 0.12, hl + 0.06, dh + 0.06), 0.05, "Canvas")
    # ridge pole ends through both gables
    for y0, y1 in ((hl - 0.01, hl + 0.14), (-hl - 0.14, -hl + 0.01)):
        box(p, (-0.03, y0, WT_RIDGE - 0.06), (0.03, y1, WT_RIDGE - 0.0), "WoodSplit")
    # stovepipe through the right slope, rear bay: jack plate, pipe, rain cap
    px, py, pr, ph = WT_PIPE
    zr = WT_RIDGE + WT_T - m * px            # roof top at the pipe (unsagged)

    def roof_z(x, y):
        """Roof top on the +x slope, as lofted: linear in x either side of the mid-slope sag
        line, linear in y between stations."""
        k = max(i for i in range(len(st) - 1) if st[i][0] <= y)
        t = (y - st[k][0]) / (st[k + 1][0] - st[k][0])
        sr = WT_SAG_ROOF * (st[k][1] * (1 - t) + st[k + 1][1] * t)
        zc, ze = WT_RIDGE + WT_T - m * hw / 2 - sr, WT_RIDGE + WT_T - m * (hw + WT_EAVE)
        if x <= hw / 2:
            return WT_RIDGE + WT_T + (zc - WT_RIDGE - WT_T) * x / (hw / 2)
        return zc + (ze - zc) * (x - hw / 2) / (hw / 2 + WT_EAVE)

    # jack plate: follows the sagged canvas (a flat plate floats over the sag line), seated into it
    a, b, th, sink = 0.2, 0.2, 0.03, 0.015   # the twisted canvas quads stray +-1 cm from roof_z
    xs = sorted({px - a, px + a} | ({hw / 2} if px - a < hw / 2 < px + a else set()))
    ys = (py - b, py + b)
    nx = len(xs)
    lo = [(x, y, roof_z(x, y) - sink) for y in ys for x in xs]
    pv = lo + [(x, y, z + th) for x, y, z in lo]
    B = lambda i, j: j * nx + i
    U = lambda i, j: 2 * nx + j * nx + i
    pf = []
    for i in range(nx - 1):
        pf += [[U(i, 0), U(i + 1, 0), U(i + 1, 1), U(i, 1)], [B(i, 1), B(i + 1, 1), B(i + 1, 0), B(i, 0)],
               [B(i, 0), B(i + 1, 0), U(i + 1, 0), U(i, 0)], [B(i + 1, 1), B(i, 1), U(i, 1), U(i + 1, 1)]]
    pf += [[B(0, 1), B(0, 0), U(0, 0), U(0, 1)], [B(nx - 1, 0), B(nx - 1, 1), U(nx - 1, 1), U(nx - 1, 0)]]
    p.add(pv, pf, "StovePipe")
    lathe(p, [(zr - 0.1, pr), (zr + ph, pr), (zr + ph, pr * 1.15)], 8, "StovePipe",
          M=T(px, py, 0))
    lathe(p, [(zr + ph + 0.06, pr * 2.4), (zr + ph + 0.16, 0.012)], 8, "StovePipe",
          M=T(px, py, 0))
    for k in range(4):                      # cap legs
        a = math.pi / 4 + k * math.pi / 2
        bar(p, (px + math.cos(a) * pr * 0.8, py + math.sin(a) * pr * 0.8, zr + ph),
            (px + math.cos(a) * pr * 1.6, py + math.sin(a) * pr * 1.6, zr + ph + 0.07),
            0.008, "StovePipe")
    # guy lines from each frame line's eave to a stake
    ez = WT_WALL - m * WT_EAVE + WT_T
    for k in range(WT_FRAMES):
        y = -hl + WT_L * k / nb
        y = max(-hl + 0.08, min(hl - 0.08, y))
        for sx in (-1, 1):
            x0 = sx * (hw + WT_EAVE - 0.02)
            x1 = sx * (hw + WT_EAVE + WT_GUY)
            bar(p, (x0, y, ez - 0.01), (x1, y, 0.10), 0.012, "TentGuy")
            box(p, (x1 - 0.02, y - 0.02, -0.04), (x1 + 0.02, y + 0.02, 0.12), "WoodSplit")
    return p


# ---------------------------------------------------------------------------
# Mess fly + table
# ---------------------------------------------------------------------------
def fly_z(x, y):
    ridge = FLY_EDGE + (FLY_RIDGE - FLY_EDGE) * (1 - abs(y) / FLY_HY)
    return ridge - FLY_SAG * math.sin(math.pi * (x + FLY_HX) / (2 * FLY_HX))


def build_fly():
    p = Part("Fly")
    verts, faces = [], []
    for j in range(FLY_NY + 1):
        y = -FLY_HY + 2 * FLY_HY * j / FLY_NY
        for i in range(FLY_NX + 1):
            x = -FLY_HX + 2 * FLY_HX * i / FLY_NX
            verts.append((x, y, fly_z(x, y)))
    W = FLY_NX + 1
    for j in range(FLY_NY):
        for i in range(FLY_NX):
            a = j * W + i
            faces.append([a, a + 1, a + W + 1, a + W])
    p.add(verts, faces, "FlyOrange")
    # poles: four corners + two ridge poles
    for x in (-FLY_HX, FLY_HX):
        for y in (-FLY_HY, 0.0, FLY_HY):
            rod(p, (x, y, 0.0), (x, y, fly_z(x, y) + 0.06), 0.02, "Pole")
        # ridge guy out along X
        sx = 1 if x > 0 else -1
        bar(p, (x, 0.0, FLY_RIDGE + 0.02), (x + sx * FLY_GUY, 0.0, 0.08), 0.01, "TentGuy")
        box(p, (x + sx * FLY_GUY - 0.02, -0.02, -0.04), (x + sx * FLY_GUY + 0.02, 0.02, 0.10),
            "WoodSplit")
    return p


def build_table():
    p = Part("Table")
    hx, hy, top = 0.8, 0.36, 0.72
    box(p, (-hx, -hy, top), (hx, hy, top + 0.03), "WoodSplit")
    for sx in (-1, 1):                       # folding legs, an X per end
        x = sx * (hx - 0.12)
        bar(p, (x, -hy + 0.04, 0.0), (x, hy - 0.04, top), 0.03, "Pole")
        bar(p, (x, hy - 0.04, 0.0), (x, -hy + 0.04, top), 0.03, "Pole")
    # the map, held flat by the lantern and a stone
    box(p, (-0.46, -0.30, top + 0.03), (0.40, 0.29, top + 0.034), "SignWhite",
        T(0.05, 0, 0) @ RZ(math.radians(-7)) @ T(0, 0, 0))
    box(p, (-0.05, -0.04, 0), (0.06, 0.05, 0.05), "CrateOlive", T(-0.36, 0.22, top + 0.034))
    # lantern: base, globe, hood, bail
    L = T(0.48, -0.12, top + 0.03)
    lathe(p, [(0, 0.07), (0.05, 0.07)], 8, "StovePipe", M=L)
    lathe(p, [(0.05, 0.05), (0.11, 0.075), (0.18, 0.05)], 8, "SignWhite", M=L)
    lathe(p, [(0.18, 0.07), (0.22, 0.03)], 8, "StovePipe", M=L)
    return p


# ---------------------------------------------------------------------------
# Survey kit + radio mast
# ---------------------------------------------------------------------------
def build_survey():
    p = Part("Survey")
    head = 1.38
    for k in range(3):
        a = math.radians(90 + 120 * k)
        bar(p, (math.cos(a) * 0.05, math.sin(a) * 0.05, head),
            (math.cos(a) * 0.52, math.sin(a) * 0.52, -0.03), 0.035, "SurveyYellow")
    lathe(p, [(head, 0.09), (head + 0.04, 0.09)], 8, "SurveyYellow")
    # the instrument: body, standards, telescope pointing +X (down the road, at the wall)
    box(p, (-0.08, -0.07, head + 0.04), (0.08, 0.07, head + 0.12), "CrateOlive")
    for sy in (-1, 1):
        box(p, (-0.04, sy * 0.06 - 0.015, head + 0.12), (0.04, sy * 0.06 + 0.015, head + 0.26),
            "CrateOlive")
    lathe(p, [(-0.16, 0.035), (0.16, 0.035), (0.18, 0.045)], 8, "StovePipe",
          M=T(0, 0, head + 0.22) @ ALONG_X)
    # the range pole, banded, stuck in the ground a few metres off and leaning
    base, tip = Vector((-0.9, 0.55, -0.05)), Vector((-0.97, 0.62, 2.0))
    nband = 8
    for b in range(nband):
        a = base.lerp(tip, b / nband)
        c = base.lerp(tip, (b + 1) / nband)
        rod(p, a, c, 0.02, "DrumPaint" if b % 2 else "SignWhite", seg=6)
    return p


def build_mast():
    p = Part("Mast")
    lathe(p, [(0, 0.055), (2.6, 0.055)], 6, "Pole")
    lathe(p, [(2.6, 0.042), (4.8, 0.042)], 6, "Pole")
    lathe(p, [(4.8, 0.03), (MAST_H, 0.03)], 6, "Pole")
    lathe(p, [(0, 0.16), (0.03, 0.16)], 6, "Pole")       # base plate
    # dipole across the top, a whip above it
    rod(p, (-0.8, 0.0, MAST_H - 0.12), (0.8, 0.0, MAST_H - 0.12), 0.01, "Pole", seg=4)
    rod(p, (0.0, 0.0, MAST_H), (0.0, 0.0, MAST_H + 1.0), 0.008, "Pole", seg=4)
    # pennant, double-sided orange
    p.add([(0.03, 0, MAST_H - 0.25), (0.03, 0, MAST_H - 0.6), (0.62, 0.05, MAST_H - 0.45)],
          [[0, 1, 2]], "FlyOrange")
    # two guy levels, three anchors
    for k in range(3):
        a = math.radians(30 + 120 * k)
        g = (math.cos(a) * MAST_GUY_R, math.sin(a) * MAST_GUY_R, 0.06)
        for z in (2.5, 4.7):
            bar(p, (0, 0, z), g, 0.008, "TentGuy")
        box(p, (g[0] - 0.03, g[1] - 0.03, -0.04), (g[0] + 0.03, g[1] + 0.03, 0.10), "Pole")
    # radio crate at the foot, the set on top, the feed up the mast
    S = RZ(MAST_KIT_SWING)
    crate(p, 0.55, 0.38, 0.40, S @ T(0.55, 0.35, 0) @ RZ(math.radians(25)))
    box(p, (-0.17, -0.12, 0), (0.17, 0.12, 0.16), "StovePipe",
        S @ T(0.55, 0.35, 0.43) @ RZ(math.radians(25)))
    bar(p, S @ Vector((0.42, 0.30, 0.55)), S @ Vector((0.04, 0.0, 1.1)), 0.012, "StovePipe")
    return p


# ---------------------------------------------------------------------------
# Stores: crates, jerry cans, the near-empty firewood rack
# ---------------------------------------------------------------------------
def crate(p, lx, ly, lz, M):
    """Expedition box: olive body, a lid band standing 1 cm proud, dark end handles."""
    box(p, (-lx / 2, -ly / 2, 0), (lx / 2, ly / 2, lz - 0.06), "CrateOlive", M)
    box(p, (-lx / 2 - 0.01, -ly / 2 - 0.01, lz - 0.06), (lx / 2 + 0.01, ly / 2 + 0.01, lz),
        "CrateOlive", M)
    for sx in (-1, 1):
        box(p, (sx * lx / 2 - (0.0 if sx > 0 else 0.025), -0.09, lz - 0.17),
            (sx * lx / 2 + (0.025 if sx > 0 else 0.0), 0.09, lz - 0.13), "StovePipe", M)
    # latch plates on the long face
    for sx in (-1, 1):
        box(p, (sx * lx / 4 - 0.03, -ly / 2 - 0.018, lz - 0.10),   # 8 mm proud of the lid band
            (sx * lx / 4 + 0.03, -ly / 2, lz - 0.03), "StovePipe", M)


def build_crates():
    p = Part("Crates")
    crate(p, 0.80, 0.50, 0.48, T(0, 0, 0))
    crate(p, 0.80, 0.50, 0.48, T(0.86, 0.05, 0) @ RZ(math.radians(4)))
    crate(p, 0.62, 0.42, 0.40, T(0.12, -0.02, 0.48) @ RZ(math.radians(-8)))
    return p


def jerry(p, M):
    w, d, h = 0.165, 0.345, 0.47
    box(p, (-w / 2, -d / 2, 0), (w / 2, d / 2, h - 0.04), "DrumPaint", M)
    # the X-press: two shallow diagonal ribs on each flank
    for sx in (-1, 1):
        x0 = sx * w / 2
        x1 = x0 + sx * 0.008
        for a, b in (((-d / 2 + 0.04, 0.04), (d / 2 - 0.04, h - 0.10)),
                     ((d / 2 - 0.04, 0.04), (-d / 2 + 0.04, h - 0.10))):
            bar(p, M @ Vector(((x0 + x1) / 2, a[0], a[1])), M @ Vector(((x0 + x1) / 2, b[0], b[1])),
                0.016, "DrumPaint")
    # shoulders, three handles, the spout
    box(p, (-w / 2 + 0.01, -d / 2 + 0.01, h - 0.04), (w / 2 - 0.01, d / 2 - 0.01, h - 0.03),
        "DrumPaint", M)
    for y in (-0.09, 0.0, 0.09):
        box(p, (-0.012, y - 0.012, h - 0.03), (0.012, y + 0.012, h), "DrumPaint", M)
    lathe(p, [(h - 0.03, 0.026), (h + 0.02, 0.026)], 6, "StovePipe",
          M=M @ T(0, d / 2 - 0.05, 0))


def build_fuel():
    p = Part("Fuel")
    drum = glb_part(f"{MODELS}/drum-closed.glb", "drum")
    p.extend(drum, T(0.1, 0.05, 0) @ RZ(0.4))
    # one empty drum knocked over, lying across the line
    lying = Part("lying")
    lying.extend(drum, Matrix.Rotation(math.pi / 2, 4, "Y"))
    p.extend(seated(lying), T(0.35, -0.75, 0) @ RZ(math.radians(-12)))
    jerry(p, T(-0.45, 0.25, 0) @ RZ(math.radians(8)))
    jerry(p, T(-0.68, 0.22, 0) @ RZ(math.radians(-5)))
    lie = Part("jerry")
    jerry(lie, Matrix.Rotation(math.pi / 2, 4, "Y"))
    p.extend(seated(lie), T(-0.62, -0.38, 0) @ RZ(math.radians(70)))
    return p


def wedge(p, r, length, a0, M):
    """A split: a quarter of a round, bark on its arc, lying along local Z."""
    arc = [(math.cos(a0 + t) * r, math.sin(a0 + t) * r) for t in (0, math.pi / 4, math.pi / 2)]
    poly = [(0.0, 0.0)] + arc
    prism(p, poly, -length / 2, length / 2,
          ["WoodSplit", "WoodBark", "WoodBark", "WoodSplit"], cap="WoodSplit", M=M)


def build_rack():
    """A firewood rack built for a cord, holding three splits."""
    p = Part("Rack")
    hx, hy, h, rail = 0.95, 0.28, 1.05, 0.12
    for sx in (-1, 1):
        for sy in (-1, 1):
            box(p, (sx * hx - 0.035, sy * hy - 0.035, 0), (sx * hx + 0.035, sy * hy + 0.035, h),
                "WoodSplit")
        box(p, (sx * hx - 0.035, -hy - 0.035, 0), (sx * hx + 0.035, hy + 0.035, 0.07), "WoodSplit")
    for sy in (-1, 1):
        box(p, (-hx - 0.035, sy * hy - 0.04, 0.07), (hx + 0.035, sy * hy + 0.04, rail),
            "WoodSplit")
    # three splits on the rails, across them
    for i, (x, a0, ln) in enumerate(((-0.55, 0.3, 0.70), (-0.30, 2.0, 0.66), (0.42, 4.1, 0.72))):
        s = Part("split")
        wedge(s, 0.14, ln, a0, ALONG_Y)
        s2 = seated(s)
        p.extend(s2, T(x, 0.02 * i, rail) @ RZ(math.radians((-4, 7, 3)[i])))
    return p


# ---------------------------------------------------------------------------
# The barrier: Type III barricade, 45° stripes as geometry
# ---------------------------------------------------------------------------
def striped_rail(p, x0, x1, z0, h, y0, t):
    """A rail x0..x1, z0..z0+h, y0..y0+t.  Orange/white 45° stripes on both faces, built
    from ONE boundary list so the faces and the edge quads share every vertex."""
    z1 = z0 + h
    W = BAR_STRIPE * math.sqrt(2)          # stripe pitch measured along the rail
    u = lambda x, z: x - (z - z0)         # constant along a stripe edge
    umin, umax = u(x0, z1), u(x1, z0)
    cuts = []
    s = umin + W
    while s < umax - 1e-6:
        cuts.append(s)
        s += W
    # boundary, counter-clockwise in (x, z): bottom, right, top, left, with cut points inserted
    right = sorted([(x1, z0 + (x1 - c)) for c in cuts if z0 < z0 + (x1 - c) < z1], key=lambda q: q[1])
    pts = [(x0, z0)] + [(c, z0) for c in cuts if x0 < c < x1] + [(x1, z0)] + right + [(x1, z1)]
    top = sorted([(c + h, z1) for c in cuts if x0 < c + h < x1], key=lambda q: -q[0])
    # left edge: u = x0 - (z - z0) = c  ->  z = z0 + x0 - c
    left = sorted([(x0, z0 + x0 - c) for c in cuts if z0 < z0 + x0 - c < z1], key=lambda q: -q[1])
    pts += top + [(x0, z1)] + left
    n = len(pts)
    bounds = [umin] + cuts + [umax]
    v = [(x, y0, z) for x, z in pts] + [(x, y0 + t, z) for x, z in pts]
    f, m = [], []
    for i in range(n):                     # edge quads take the colour of the stripe they bound
        j = (i + 1) % n
        mx, mz = (pts[i][0] + pts[j][0]) / 2, (pts[i][1] + pts[j][1]) / 2
        k = max(0, min(len(bounds) - 2, sum(1 for b in bounds[1:-1] if u(mx, mz) > b)))
        f.append([i, j, n + j, n + i])
        m.append("BarrierOrange" if k % 2 == 0 else "SignWhite")
    eps = 1e-6
    for k in range(len(bounds) - 1):
        ids = [i for i, (x, z) in enumerate(pts) if bounds[k] - eps <= u(x, z) <= bounds[k + 1] + eps]
        if len(ids) < 3:
            continue
        mat = "BarrierOrange" if k % 2 == 0 else "SignWhite"
        f.append(ids[::-1])                # face at y0 (wound one way)
        m.append(mat)
        f.append([n + i for i in ids])     # face at y0 + t
        m.append(mat)
    p.add(v, f, m)


def sandbag(p, M, seed):
    rng = random.Random(seed)
    j = lambda: rng.uniform(-0.02, 0.02)
    lx, ly, lz = 0.22, 0.15, 0.12
    v = [(sx * lx + j(), sy * ly + j(), (0.0 if sz < 0 else lz + j()))
         for sz in (-1, 1) for sy in (-1, 1) for sx in (-1, 1)]
    v = [v[0], v[1], v[3], v[2], v[4], v[5], v[7], v[6]]
    f = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
    p.add(v, f, "Sandbag", M)


def build_barrier():
    p = Part("RoadBarrier")
    for sx in (-1, 1):
        x = sx * BAR_POSTS
        box(p, (x - 0.025, -0.025, 0.05), (x + 0.025, 0.025, BAR_TOP), "SignWhite")
        box(p, (x - 0.03, -0.5, 0.0), (x + 0.03, 0.5, 0.05), "Pole")        # foot
        for sy in (-1, 1):
            sandbag(p, T(x, sy * 0.33, 0.05) @ RZ(math.radians(90 + 8 * sx * sy)), seed=7 + sx + 3 * sy)
    for z in BAR_RAILS:
        striped_rail(p, -BAR_LEN / 2, BAR_LEN / 2, z, BAR_RAIL_H, 0.025, BAR_RAIL_T)
    # amber lamp on the left upright, facing the traffic (+Y)
    x = -BAR_POSTS
    box(p, (x - 0.06, 0.0, BAR_TOP), (x + 0.06, 0.07, BAR_TOP + 0.16), "Pole")
    lathe(p, [(0.0, 0.085), (0.03, 0.085)], 8, "LampAmber",
          M=T(x, 0.07, BAR_TOP + 0.08) @ ALONG_Y)
    return p


# ---------------------------------------------------------------------------
# Bake / verify / export
# ---------------------------------------------------------------------------
def get_material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    col, rough, ds = MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = col
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = 0.0
    m.diffuse_color = col
    m.roughness = rough
    m.use_backface_culling = not ds
    return m


def _orient_islands(bm):
    bm.faces.ensure_lookup_table()
    todo = {f.index for f in bm.faces}
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
        ctr = sum((v.co for f in island for v in f.verts), Vector()) / \
            sum(len(f.verts) for f in island)
        vol = 0.0
        for f in island:
            vs = [v.co - ctr for v in f.verts]
            for i in range(1, len(vs) - 1):
                vol += vs[0].dot(vs[i].cross(vs[i + 1]))
        if abs(vol) < 1e-9:
            continue
        if vol < 0.0:
            bmesh.ops.reverse_faces(bm, faces=island)


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
    ob = bpy.data.objects.new(part.name, me)
    bpy.context.collection.objects.link(ob)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _orient_islands(bm)
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = False
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
    for d in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for x in list(d):
            d.remove(x)


_GLB_CACHE = {}


def glb_part(path, name):
    """A shipped kit model as a Part (world-space polys + material names, ALIASed).  Imported
    materials whose name collides with one already here come in as 'X.001'; the suffix is
    dropped so both use the one material."""
    if path in _GLB_CACHE:
        out = Part(name)
        out.extend(_GLB_CACHE[path])
        return out
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    p = Part(name)
    for o in new:
        if o.type != "MESH":
            continue
        me = o.data
        verts = [tuple(o.matrix_world @ v.co) for v in me.vertices]
        names = []
        for f in me.polygons:
            nm = me.materials[f.material_index].name
            base = nm.split(".")[0]
            nm = base if base in bpy.data.materials else nm
            names.append(ALIAS.get(nm, nm))
        p.add(verts, [list(f.vertices) for f in me.polygons], names)
    for o in new:
        data = o.data
        bpy.data.objects.remove(o)
        if data is not None and data.users == 0:
            bpy.data.meshes.remove(data)
    _GLB_CACHE[path] = p
    out = Part(name)
    out.extend(p)
    return out


def camp_parts():
    """Every piece of the camp, placed on the pad (Blender world coords)."""
    _GLB_CACHE.clear()
    for n in MATS:                 # ours first, so composited duplicates fold onto them
        get_material(n)
    parts = []

    def put(part, M, name=None):
        q = Part(name or part.name)
        q.extend(part, M)
        parts.append(q)

    put(build_wall_tent(), place(*WT_AT))
    put(build_fly(), T(*FLY_AT))
    put(build_table(), place(*TABLE_AT))
    chairs = Part("Chairs")
    chair = glb_part(f"{MODELS}/camp-chair.glb", "camp-chair")
    for x, y, yaw in CHAIRS:
        chairs.extend(chair, place(x, y, yaw))
    parts.append(chairs)
    fire = Part("Fire")
    fire.extend(glb_part(f"{MODELS}/campfire.glb", "campfire"))
    fire.extend(glb_part(f"{MODELS}/cooking-kit.glb", "cooking-kit"))
    put(fire, place(*FIRE_AT))
    tents = Part("Tents")
    tent = glb_part(f"{MODELS}/tent.glb", "tent")
    for x, y, yaw in TENTS:
        tents.extend(tent, place(x, y, yaw))
    parts.append(tents)
    put(build_rack(), place(*RACK_AT))
    put(build_fuel(), T(*FUEL_AT))
    put(build_crates(), place(*CRATES_AT))
    put(build_survey(), T(*SURVEY_AT))
    put(build_mast(), T(*MAST_AT))
    return parts


def report_bounds(parts):
    lo = [min(v[i] for q in parts for v in q.v) for i in range(3)]
    hi = [max(v[i] for q in parts for v in q.v) for i in range(3)]
    ok = abs(lo[0]) <= PAD[0] and hi[0] <= PAD[0] and abs(lo[1]) <= PAD[1] and hi[1] <= PAD[1]
    print(f"  bounds x {lo[0]:.2f}..{hi[0]:.2f}  y {lo[1]:.2f}..{hi[1]:.2f}  "
          f"z {lo[2]:.2f}..{hi[2]:.2f}  {'inside the pad' if ok else 'OUTSIDE THE PAD'}")


def build():
    """Source view: camp pieces as separate objects, the barrier beside the pad."""
    _fresh_scene()
    parts = camp_parts()
    print("=" * 60)
    total = 0
    for part in parts:
        ob = bake(part)
        t = evaluated_tris(ob)
        total += t
        print(f"  {part.name:12s} {t:5d} tris")
    print(f"  CAMP TOTAL   {total:5d} tris (budget {TRI_BUDGETS['expedition-camp']})")
    report_bounds(parts)
    bar_ = Part("RoadBarrier")
    bar_.extend(build_barrier(), T(0, PAD[1] + 2.5, 0))
    ob = bake(bar_)
    print(f"  road-barrier {evaluated_tris(ob):5d} tris (budget {TRI_BUDGETS['road-barrier']})")
    used = {m.name for o in bpy.data.objects if o.type == "MESH" for m in o.data.materials}
    print(f"  materials in use {len(used)}: {sorted(used)}")
    print("=" * 60)


def _glb(name):
    bpy.ops.export_scene.gltf(
        filepath=f"{OUT_DIR}/{name}.glb", export_format="GLB",
        export_draco_mesh_compression_enable=False, export_yup=True,
        export_apply=True, export_materials="EXPORT", export_texcoords=False,
        export_normals=True, export_cameras=False, export_lights=False,
        use_selection=False)
    print(f"  wrote {OUT_DIR}/{name}.glb")


def export():
    """The camp as ONE merged mesh (draw calls = materials), the barrier alone; then the
    separate-object source view saved as the .blend."""
    _fresh_scene()
    camp = Part("ExpeditionCamp")
    for part in camp_parts():
        camp.extend(part)
    ob = bake(camp)
    print(f"  expedition-camp: {evaluated_tris(ob)} tris")
    _glb("expedition-camp")
    _fresh_scene()
    for n in MATS:
        get_material(n)
    ob = bake(build_barrier())
    print(f"  road-barrier: {evaluated_tris(ob)} tris")
    _glb("road-barrier")
    build()
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    print(f"  wrote {OUT_BLEND}")


if __name__ == "__main__":
    build()
