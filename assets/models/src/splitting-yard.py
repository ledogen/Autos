"""
ASSET-36 — roadside firewood vendor (region-1 haul yard), + the firewood BUNDLE
that re-scopes ASSET-37.  Parametric generator.

Built for: Blender 5.x  |  PROMOTED 2026-10-05 (owner) from wip/ to assets/models/ +
assets/models/src/.
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

RE-SCOPE (owner, 2026-10-04).  The ticket's trailer processor + elevating
conveyor is replaced by a cheap red towable gas-hydraulic splitter; the yard
is a firewood VENDOR: splitter, a big messy pile of splits, and a pyramid row
of ~30 shrink-wrapped bundles.  The bundle replaces ASSET-37's loose armload as
the haul's cargo unit (it is convex by construction — a wrapped prism — which
is exactly what the hull-from-mesh cargo path wants).  Room is LEFT for the
vendor's own pickup (`SpotPickup` — the place is staffed; not modelled until
we have a non-hero pickup of our own).  Under `SpotAwning` stand the ASSET-06
awning and two camp chairs, COMPOSITED from awning.glb + camp-chair.glb
(generator: lawn-furniture.py) — re-export this yard after changing those.

Outputs (one generator, a kit + a POI, per ASSETS.md "a kit is ONE generator"):
  firewood-bundle-{a,b,c}.glb  — cargo kit, bbox-centred, axis along -Z (glTF)
  splitting-yard.glb           — the POI, base-seated, centred on footprint

THE BUNDLE IS THE HERO PIECE (owner, 2026-10-04): every split modelled.
6-9 pieces per bundle, mostly pie slices (wedges of a split round) with an
occasional small whole round at the heart.  The end is partitioned into
cells (outline arcs meeting a small inner polygon); each cell is inset by a
gap and extruded as its own prism with staggered, tilted saw-cut ends.  Some
pieces pack split-face out, so the flank mixes bark and pale wood.

CLEAR SHRINK FILM — A FRESH TRANSPARENCY RULING (owner, 2026-10-04: "plastic
wrap as the tie, so translucent colorless").  `BundleWrap` is the only alpha
material: BLEND at 0.14, single-sided, roughness 0.15 so the sun's specular
reads as plastic sheen (the game has no env map, so Blender's material
preview over-states it — judge it in the game).  The film is the taut 2D
convex hull of the pack, 4 mm proud, rolled 2 cm past each end into a collar
with an open hole.  Those holes are the bundle's non-manifold edges, by
design.  The film is also exactly the convex hull the cargo collider wants.

NO TEXTURE, no label (dropped for the colourless film).

AXES.  Blender +Y = glTF -Z = forward = the road side of the yard.  Bundles lie
along Blender Y (ends to the road).  Splitter tongue points Blender +X.
Determinism: random.Random(seed) only — stable across runs and Pythons.
"""

import bpy
import bmesh
import math
import random
from mathutils import Matrix, Vector

# ---------------------------------------------------------------------------
# PARAMETERS
# ---------------------------------------------------------------------------
MODELS = "/Users/ledogen/CodeShit/CarGame/assets/models"
OUT_DIR = MODELS
OUT_BLEND = f"{MODELS}/src/splitting-yard.blend"

# Final (2026-10-04): bundles 176/202/168; yard 7896 = splitter 856 + pile 1582
# + rounds 84 + 30-bundle row 5374.  7 materials, 0 images.  Blender 5.2.0.
TRI_BUDGETS = {
    "firewood-bundle-a": 250, "firewood-bundle-b": 250, "firewood-bundle-c": 250,
    "splitting-yard": 5000,   # ticket said 2500 for processor+conveyor; +awning +2 chairs; owner's call
}

MATS = {
    #  name            base colour (linear)           rough
    "SplitterRed":   ((0.500, 0.025, 0.018, 1.0), 0.45),
    "SplitterBlack": ((0.018, 0.018, 0.020, 1.0), 0.80),
    "SplitterSteel": ((0.250, 0.250, 0.260, 1.0), 0.40),
    "WoodBark":      ((0.090, 0.055, 0.030, 1.0), 0.95),
    "WoodSplit":     ((0.520, 0.380, 0.220, 1.0), 0.90),
    "WoodEnd":       ((0.290, 0.165, 0.070, 1.0), 0.90),
    # Clear shrink film — the one alpha material (owner ruling 2026-10-04).
    "BundleWrap":    ((0.850, 0.850, 0.870, 0.14), 0.15),
}

# (name, seed, radius, length, heart is a small round)
BUNDLES = [
    ("firewood-bundle-a", 11, 0.138, 0.40, False),
    ("firewood-bundle-b", 23, 0.140, 0.41, True),
    ("firewood-bundle-c", 37, 0.135, 0.39, False),
]
PIECES = (6, 9)         # splits per hero bundle
LOD_PIECES = 6          # splits per row (light) bundle
ROUND_SIDES = 5         # the occasional small whole round
PIECE_GAP = 0.004       # minimum clearance between neighbouring splits
PACK_TRIES = 400        # candidate spots tried per split
FILL = 0.72             # wood share of the nominal circle; settling packs it ~0.30 m across
SETTLE_GAP = 0.0015     # settled pieces rest this close (touching, no z-fight)
SETTLE_STEPS = (0.02, 0.01, 0.005, 0.0025, 0.001, 0.0)   # slides, coarse to fine; 0 = twist in place
SETTLE_TWISTS = (0.0, 0.04, -0.04, 0.1, -0.1, 0.2, -0.2, 0.35, -0.35)   # rad tried per slide
SETTLE_SLANTS = (0.0, 0.785, -0.785, 1.22, -1.22)   # slide direction off the axis line
SETTLE_SWEEPS = 60
WRAP_LEN = 0.5          # film covers the middle half; the wood ends are bare
WRAP_TOL = (0.003, 0.005)       # film thinning tolerance, standoff (hero)
WRAP_TOL_LOD = (0.008, 0.010)   # coarser for the row
HULL_MAX = 42           # Box3D hull cap is 255 half-edges, ~5.3 per hull vert
                        # measured (53 verts -> 282) => 42 verts ~ 225, 12% margin
HULL_RETRIES = 20

# Yard layout (Blender metres, origin = footprint centre, +Y = road)
# Fits the standard 14 x 8 m lay-by pad (owner, 2026-10-04): ~12.5 x 7 m.
ROW_CENTRE = (-4.2, 2.9)    # bundle pyramid, running along X
ROW_COUNTS = (11, 10, 9)    # bottom..top = 30 bundles
ROW_PULL = 0.3              # settle cost: height + this x distance from centre
ROW_STEPS = (0.04, 0.02, 0.01, 0.005, 0.002)
ROW_TWISTS = (0.0, 0.05, -0.05, 0.15, -0.15)   # roll about the bundle axis
ROW_SWEEPS = 80
PILE_CENTRE = (-4.05, -1.75)
PILE_RX, PILE_RY, PILE_H = 1.8, 1.4, 1.2
PILE_SEG, PILE_RINGS = 18, 5
PILE_SURF_PIECES, PILE_GROUND_PIECES = 165, 14
PILE_CORE = 0.92        # dark core just inside the splits' nominal dome
PILE_SINK = (-0.06, -0.005)  # split centres this far under the core's smooth
                             # surface: past the facet sag (~2.5 cm at 18 x 5)
                             # less a split's half-thickness, so every split
                             # TOUCHES the core, yet most of it shows
SPLITTER_AT = (-0.6, -1.7, math.radians(12))   # x, y, yaw
# LOADING (owner, 2026-10-05): no truck bay.  The player reverses their bed
# over a painted drop zone BETWEEN row and pile (glTF centre (-4.0, 0, -1.2),
# 1.84 x 1.40 m) — read by the haul code from its own data, not from this
# model.  The lane (Blender y -0.26..2.65) must stay clear of everything from
# the drop zone to x 4.9; the player enters through the mouth between the
# row's end and the vendor's pickup.
# Reserved, not modelled:  (centre x, y, half-extents)
SPOT_PICKUP = (5.9, -0.85, 1.0, 2.65)   # vendor's pickup, nose to the road
SPOT_AWNING = (3.05, -1.85, 1.5, 1.25)  # ASSET-06 awning, 3.0 x 2.5 m, behind
                                        # the lane (clears it by 0.34 m)
CHAIRS = [(2.55, -1.55, math.radians(12)),   # x, y, yaw — under the awning,
          (3.55, -1.75, math.radians(-15))]  # facing the lane and the road

# Splitter (local: X along beam, tongue +X; Z up; ground z = 0)
WHEEL_R, WHEEL_W, WHEEL_Y, AXLE_X = 0.21, 0.10, 0.47, -0.55
BEAM_TOP, BEAM_H, BEAM_W, BEAM_X = 0.60, 0.15, 0.10, (-1.00, 0.62)


# ---------------------------------------------------------------------------
# Geometry accumulator + primitives
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


def T(x, y, z):
    return Matrix.Translation((x, y, z))


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


def lathe(p, profile, seg, mat, cap=None, M=None):
    """Surface of revolution about local Z; profile = [(z, r)], capped."""
    v, f = [], []
    for z, r in profile:
        v += [(math.cos(2 * math.pi * k / seg) * r,
               math.sin(2 * math.pi * k / seg) * r, z) for k in range(seg)]
    for s in range(len(profile) - 1):
        a, b = s * seg, (s + 1) * seg
        f += [[a + k, a + (k + 1) % seg, b + (k + 1) % seg, b + k]
              for k in range(seg)]
    last = (len(profile) - 1) * seg
    f += [list(range(seg - 1, -1, -1)), list(range(last, last + seg))]
    m = [mat] * (len(f) - 2) + [cap or mat] * 2
    p.add(v, f, m, M)


def bar(p, a, b, w, mat):
    """Square tube of side w from point a to point b (hoses, struts)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    q = d.normalized().to_track_quat("Z", "Y").to_matrix().to_4x4()
    box(p, (-w / 2, -w / 2, 0), (w / 2, w / 2, d.length), mat,
        Matrix.Translation(a) @ q)


# ---------------------------------------------------------------------------
# Firewood bundle — every split modelled, in a clear shrink-film wrap
# ---------------------------------------------------------------------------
def convex_hull(pts):
    """Monotone-chain 2D hull, CCW."""
    pts = sorted(set(pts))
    def half(seq):
        h = []
        for q in seq:
            while len(h) >= 2 and ((h[-1][0] - h[-2][0]) * (q[1] - h[-2][1]) -
                                   (h[-1][1] - h[-2][1]) * (q[0] - h[-2][0])) <= 0:
                h.pop()
            h.append(q)
        return h
    lo, hi = half(pts), half(reversed(pts))
    return lo[:-1] + hi[:-1]


def _overlap(a, b, margin):
    """Separating-axis test for two CONVEX polygons: True if they overlap or
    come closer than margin (the gap between splits)."""
    for poly in (a, b):
        for i in range(len(poly)):
            (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % len(poly)]
            nx, ny = y2 - y1, x1 - x2
            L = math.hypot(nx, ny) or 1.0
            pa = [(x * nx + y * ny) / L for x, y in a]
            pb = [(x * nx + y * ny) / L for x, y in b]
            if max(pa) + margin <= min(pb) or max(pb) + margin <= min(pa):
                return False
    return True


def split_section(rng, lod):
    """One split's cross-section, apex at the origin: a pie slice of its OWN
    parent round — chunky (50-100 deg), single-facet bark when narrow."""
    alpha = math.radians(rng.uniform(50, 100))
    rp = rng.uniform(0.10, 0.15)
    seg = 1 if (lod or alpha < math.radians(70)) else 2
    poly = [(0.0, 0.0)] + [(rp * math.cos(-alpha / 2 + alpha * i / seg),
                            rp * math.sin(-alpha / 2 + alpha * i / seg))
                           for i in range(seg + 1)]
    return poly, set(range(1, seg + 1))          # the arc edges are bark


def pack_section(seed, r, round_heart, lod):
    """Pack 6-9 splits into a bundle cross-section.  NOT a puzzle-cut
    partition (that mated perfectly — owner, 2026-10-04): every split is its
    own chunky pie slice, dropped in one at a time at a random angle into the
    clear spot that keeps the bundle most compact (smallest radius to its
    farthest corner) — so they turn every which way, leave voids inside, and
    the outline comes out lumpy-round, like a real bundle.  r is the nominal
    bundle radius (spots are drawn from 1.6 r).  Deterministic.
    Returns [(polygon, bark edge indices)]."""
    rng = random.Random(seed)
    count = LOD_PIECES if lod else rng.randint(*PIECES)
    shapes = [split_section(rng, lod) for _ in range(count)]
    if round_heart and not lod:     # the occasional small whole round
        rr = rng.uniform(0.035, 0.05)
        shapes[rng.randrange(count)] = (
            [(math.cos(2 * math.pi * i / ROUND_SIDES) * rr,
              math.sin(2 * math.pi * i / ROUND_SIDES) * rr)
             for i in range(ROUND_SIDES)], set(range(ROUND_SIDES)))
    # Size the splits to the bundle: their combined cross-section fills FILL
    # of the nominal circle, so 6 come out chunky and 9 come out smaller.
    def area(poly):
        return abs(sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1)
                       in zip(poly, poly[1:] + poly[:1]))) / 2
    k = math.sqrt(FILL * math.pi * r * r / sum(area(p) for p, _ in shapes))
    shapes = [([(x * k, y * k) for x, y in p], bk) for p, bk in shapes]
    placed = []
    for local, bark in shapes:
        cx = sum(p[0] for p in local) / len(local)
        cy = sum(p[1] for p in local) / len(local)
        best, best_r = None, 1e9
        for _ in range(PACK_TRIES):
            ang = rng.uniform(0, 2 * math.pi)
            rad = 1.6 * r * math.sqrt(rng.random())   # wide: compactness pulls in
            th = rng.uniform(0, 2 * math.pi)
            tx, ty = rad * math.cos(th), rad * math.sin(th)
            c, sn = math.cos(ang), math.sin(ang)
            poly = [(tx + (x - cx) * c - (y - cy) * sn,
                     ty + (x - cx) * sn + (y - cy) * c) for x, y in local]
            far = max(math.hypot(x, y) for x, y in poly)
            if far < best_r and not any(_overlap(poly, q, PIECE_GAP)
                                        for q, _ in placed):
                best, best_r = poly, far
        if best is not None:
            placed.append((best, bark))
    assert len(placed) >= min(count, PIECES[0]), "pack failed: raise PACK_TRIES"
    return settle(placed), rng


def _centroid(poly):
    return (sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly))


def _settle_cost(poly):
    """What the film's squeeze minimises: the piece's pull from the axis,
    plus its far corner (so a twist that tucks a corner in counts)."""
    cx, cy = _centroid(poly)
    return math.hypot(cx, cy) + 0.5 * max(math.hypot(x, y) for x, y in poly)


def settle(placed):
    """Shrink-film squeeze: sweep the pieces, inner first, trying small
    slides toward the axis (straight in, or angled up to 70 deg off it so a
    piece can roll round a neighbour) combined with twists, or a pure twist in
    place; keep any pose that
    lowers _settle_cost without overlapping a neighbour closer than
    SETTLE_GAP.  Repeat until a sweep moves nothing — every piece then
    rests against its neighbours, voids and all."""
    polys = [p for p, _ in placed]
    for _ in range(SETTLE_SWEEPS):
        moved = False
        for i in sorted(range(len(polys)), key=lambda j: _settle_cost(polys[j])):
            cur, cost = polys[i], _settle_cost(polys[i])
            others = polys[:i] + polys[i + 1:]
            cx, cy = _centroid(cur)
            d = math.hypot(cx, cy) or 1.0
            for step in SETTLE_STEPS:
                best = None
                for slant in SETTLE_SLANTS:
                    ux = -(cx * math.cos(slant) - cy * math.sin(slant)) / d
                    uy = -(cx * math.sin(slant) + cy * math.cos(slant)) / d
                    for tw in SETTLE_TWISTS:
                        c, sn = math.cos(tw), math.sin(tw)
                        cand = [(cx + ux * step + (x - cx) * c - (y - cy) * sn,
                                 cy + uy * step + (x - cx) * sn + (y - cy) * c)
                                for x, y in cur]
                        k = _settle_cost(cand)
                        if k < cost - 1e-5 and not any(
                                _overlap(cand, q, SETTLE_GAP) for q in others):
                            best, cost = cand, k
                if best is not None:
                    polys[i], moved = best, True
                    break
        if not moved:
            break
    return [(p, bk) for p, (_, bk) in zip(polys, placed)]


def nearest_gap(poly, others):
    """Smallest clearance from a convex polygon to any of the others (m)."""
    def seg_d(px, py, a, b):
        (ax, ay), (bx, by) = a, b
        L2 = (bx - ax) ** 2 + (by - ay) ** 2 or 1e-12
        t = max(0.0, min(1.0, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / L2))
        return math.hypot(px - ax - t * (bx - ax), py - ay - t * (by - ay))
    best = 1e9
    for q in others:
        for a, b in ((poly, q), (q, poly)):
            for px, py in a:
                for e in range(len(b)):
                    best = min(best, seg_d(px, py, b[e], b[(e + 1) % len(b)]))
    return best


def piece(p, poly, bark_edges, y0, y1, tilt, end="WoodEnd"):
    """One split: its cross-section extruded along Blender Y (the bundle axis),
    each end a saw cut tilted a few degrees.  Bark edges get bark, the rest
    split faces, ends end-grain."""
    k = len(poly)
    v = ([(x, y0 + tilt[0] * x + tilt[1] * z, z) for x, z in poly] +
         [(x, y1 + tilt[2] * x + tilt[3] * z, z) for x, z in poly])
    f = [[i, (i + 1) % k, k + (i + 1) % k, k + i] for i in range(k)]
    m = ["WoodBark" if i in bark_edges else "WoodSplit" for i in range(k)]
    f += [list(range(k - 1, -1, -1)), list(range(k, 2 * k))]
    m += [end, end]
    p.add(v, f, m)


def film_ring(pts, tol, gap):
    """The taut film's cross-section: convex hull of the pack, thinned (drop a
    vertex while the film would bend over it by less than tol), then pushed
    out by gap (> tol, so the thinned chords still clear the wood)."""
    hull = convex_hull(pts)

    def sag(i):
        (ax, ay), (bx, by), (px, py) = hull[i - 1], hull[(i + 1) % len(hull)], hull[i]
        return abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / \
            (math.hypot(bx - ax, by - ay) or 1.0)

    while len(hull) > 5:
        i = min(range(len(hull)), key=sag)
        if sag(i) > tol:
            break
        del hull[i]
    out = []
    for i, (x, z) in enumerate(hull):
        (ax, az), (bx, bz) = hull[i - 1], hull[(i + 1) % len(hull)]
        nx, nz = (bz - az), -(bx - ax)             # outward for a CCW hull
        L = math.hypot(nx, nz) or 1.0
        out.append((x + nx / L * gap, z + nz / L * gap))
    return out


def hull_verts(part):
    """Vertex count of the part's 3D convex hull — what src/debris.js hands
    Box3D as the cargo collider."""
    bm = bmesh.new()
    vs = [bm.verts.new(c) for c in part.v]
    res = bmesh.ops.convex_hull(bm, input=vs, use_existing_faces=False)
    n = len({v for g in res["geom"] if isinstance(g, bmesh.types.BMFace)
             for v in g.verts})
    bm.free()
    return n


def build_bundle(spec, lod=False):
    """lod=False: the hero cargo piece.  lod=True: the yard row's light
    variant — 6 triangular splits, single-facet bark, no heart round, a
    coarser film.

    BOX3D HULL LIMIT (BUG found 2026-10-05 by the FEAT-91 haul window): Box3D
    refuses a hull over 255 half-edges ("hull final half edge count of 282
    exceeds limit of 255") and the cargo body goes NaN.  Bundle-a's first pack
    had 53 hull verts (282 half-edges).  The hull is set by the splits'
    staggered outer corners, not the film, so no film/tilt knob fixes it: a
    bundle over HULL_MAX is re-packed from the next seed instead."""
    name, seed, r, length, round_heart = spec
    for attempt in range(HULL_RETRIES):
        p = _build_bundle(name, seed + 1000 * attempt, r, length, round_heart, lod)
        if hull_verts(p) <= HULL_MAX:
            return p
    raise RuntimeError(f"{name}: no pack within {HULL_MAX} hull verts")


def _build_bundle(name, seed, r, length, round_heart, lod):
    pieces, rng = pack_section(seed, r, round_heart, lod)
    p = Part(name + ("-lod" if lod else ""))
    hull_src = []
    for poly, bark in pieces:
        L = length + rng.uniform(-0.05, 0.0)
        y0 = -length / 2 + rng.uniform(0.0, 0.04)
        tilt = [rng.uniform(-0.08, 0.08) for _ in range(4)]
        end = "WoodEnd" if rng.random() < 0.6 else "WoodSplit"   # aged vs fresh cut
        piece(p, poly, bark, y0, y0 + L, tilt, end)
        hull_src += poly
    # Shrink film round the middle WRAP_LEN of the bundle; the wood ends are
    # bare.  One open tube, no thickness, no collar.
    ring = film_ring(hull_src, *(WRAP_TOL_LOD if lod else WRAP_TOL))
    h, yw = len(ring), length * WRAP_LEN / 2
    v = [(x, y, z) for y in (-yw, yw) for x, z in ring]
    p.add(v, [[i, (i + 1) % h, h + (i + 1) % h, h + i] for i in range(h)],
          "BundleWrap")
    c = [(min(q[k] for q in p.v) + max(q[k] for q in p.v)) / 2 for k in range(3)]
    p.v = [(x - c[0], y - c[1], z - c[2]) for x, y, z in p.v]
    return p


# ---------------------------------------------------------------------------
# Splitter — small towable gas-hydraulic, red
# ---------------------------------------------------------------------------
def build_splitter():
    p = Part("Splitter")
    R, K, S = "SplitterRed", "SplitterBlack", "SplitterSteel"
    top, bot = BEAM_TOP, BEAM_TOP - BEAM_H
    fl, wb = 0.014, 0.007
    # I-beam, profile in local (y, z) extruded along X
    ibeam = [(-BEAM_W / 2, bot), (BEAM_W / 2, bot), (BEAM_W / 2, bot + fl),
             (wb, bot + fl), (wb, top - fl), (BEAM_W / 2, top - fl),
             (BEAM_W / 2, top), (-BEAM_W / 2, top), (-BEAM_W / 2, top - fl),
             (-wb, top - fl), (-wb, bot + fl), (-BEAM_W / 2, bot + fl)]
    prism(p, [(-z, y) for y, z in ibeam], BEAM_X[0], BEAM_X[1], R, M=ALONG_X)
    # butt plate, tongue, coupler, jack stand
    box(p, (BEAM_X[1], -0.13, bot), (BEAM_X[1] + 0.04, 0.13, top + 0.26), R)
    box(p, (BEAM_X[1], -0.035, 0.40), (1.40, 0.035, 0.47), R)
    box(p, (1.40, -0.045, 0.38), (1.56, 0.045, 0.47), S)
    box(p, (1.44, -0.03, 0.47), (1.53, 0.03, 0.50), S)
    box(p, (1.10, -0.02, 0.03), (1.14, 0.02, 0.40), K)
    box(p, (1.06, -0.06, 0.0), (1.18, 0.06, 0.03), K)
    # hydraulic cylinder on the beam, rod, wedge on a sliding shoe
    cz = top + 0.065
    lathe(p, [(-1.00, 0.062), (-0.95, 0.062), (-0.95, 0.055),
              (-0.33, 0.055), (-0.33, 0.062), (-0.28, 0.062)], 8, R,
          M=T(0, 0, cz) @ ALONG_X)
    lathe(p, [(-0.28, 0.025), (-0.08, 0.025)], 6, S, M=T(0, 0, cz) @ ALONG_X)
    box(p, (-0.10, -0.075, top), (0.02, 0.075, top + 0.05), R)
    box(p, (-0.10, -0.075, top + 0.04), (-0.06, 0.075, top + 0.30), R)  # overlaps shoe: no shared edge
    prism(p, [(-0.06, -0.05), (0.10, 0.0), (-0.06, 0.05)],
          top + 0.05, top + 0.28, S)
    # log cradles — plates flaring out either side of the working zone
    for sgn in (-1, 1):
        box(p, (0.0, -0.10, -0.006), (0.60, 0.10, 0.006), R,
            T(0.0, sgn * 0.13, top - 0.01) @
            Matrix.Rotation(sgn * math.radians(22), 4, "X"))
    # axle = hydraulic tank, struts up to the beam
    lathe(p, [(-0.42, 0.07), (0.42, 0.07)], 8, R, M=T(AXLE_X, 0, WHEEL_R) @ ALONG_Y)
    box(p, (AXLE_X - 0.04, -0.05, WHEEL_R + 0.05), (AXLE_X + 0.04, 0.05, bot), R)
    box(p, (-0.98, -0.04, 0.0), (-0.92, 0.04, bot), K)          # rear stand
    # wheels: black tyre lathe about Y, red rim caps, steel hub; red fenders
    for sgn in (-1, 1):
        y = sgn * WHEEL_Y
        tyre = [(-0.05, 0.11), (-0.05, 0.18), (-0.04, WHEEL_R),
                (0.04, WHEEL_R), (0.05, 0.18), (0.05, 0.11)]
        lathe(p, tyre, 10, K, cap=R, M=T(AXLE_X, y, WHEEL_R) @ ALONG_Y)
        lathe(p, [(0.0, 0.045), (0.075, 0.045)], 6, S,
              M=T(AXLE_X, y, WHEEL_R) @ ALONG_Y @
              Matrix.Rotation(0 if sgn > 0 else math.pi, 4, "X"))
        arc = [(math.cos(a) * 0.255, math.sin(a) * 0.255)
               for a in (math.radians(d) for d in (15, 50, 90, 130, 165))]
        fender = arc + [(x * 1.05, z * 1.05) for x, z in reversed(arc)]
        prism(p, fender, -0.07, 0.07, R,
              M=T(AXLE_X, y, WHEEL_R) @ Matrix.Rotation(math.pi / 2, 4, "X"))
    # engine on a plate over the axle, left of the beam
    ex, ey, ez = AXLE_X - 0.05, -0.25, WHEEL_R + 0.07
    box(p, (ex - 0.18, ey - 0.15, ez), (ex + 0.18, ey + 0.15, ez + 0.03), K)
    box(p, (ex - 0.15, ey - 0.12, ez + 0.03), (ex + 0.13, ey + 0.12, ez + 0.24), K)
    box(p, (ex - 0.12, ey - 0.11, ez + 0.24), (ex + 0.08, ey + 0.11, ez + 0.34), R)
    box(p, (ex - 0.04, ey - 0.02, ez + 0.34), (ex, ey + 0.02, ez + 0.37), K)
    box(p, (ex - 0.20, ey - 0.09, ez + 0.06), (ex - 0.15, ey + 0.09, ez + 0.22), S)
    box(p, (ex + 0.08, ey - 0.10, ez + 0.20), (ex + 0.16, ey + 0.02, ez + 0.30), K)
    box(p, (ex + 0.13, ey + 0.03, ez + 0.06), (ex + 0.21, ey + 0.11, ez + 0.16), S)
    lathe(p, [(ey + 0.12, 0.04), (-0.055, 0.04)], 6, S,
          M=T(ex, 0, ez + 0.12) @ ALONG_Y)                           # pump
    # Hydraulics, honestly routed: the control valve bolts onto the
    # cylinder's base end (pump side), its lever stands up and leans back away
    # from the wedge, and ONE pressure hose runs from the pump to the valve.
    vx0, vx1 = -1.00, -0.88
    box(p, (vx0, -0.12, cz - 0.04), (vx1, -0.05, cz + 0.06), S)
    lever = T(-0.94, -0.085, cz + 0.06) @ Matrix.Rotation(math.radians(-20), 4, "Y")
    box(p, (-0.012, -0.012, 0.0), (0.012, 0.012, 0.30), K, lever)
    box(p, (-0.025, -0.025, 0.30), (0.025, 0.025, 0.35), K, lever)
    pump_top = (ex, -0.09, ez + 0.16)
    bend = (-0.80, -0.09, 0.55)
    bar(p, pump_top, bend, 0.022, K)
    bar(p, bend, (-0.94, -0.09, cz - 0.04), 0.022, K)
    return p


# ---------------------------------------------------------------------------
# Wood pile — a jittered dome core studded with splits, splits round the toe
# ---------------------------------------------------------------------------
def split_piece(rng, M=None, p=None):
    """One split: triangular prism along local Y, bark on one face."""
    L = rng.uniform(0.36, 0.55)
    w, d = rng.uniform(0.11, 0.19), rng.uniform(0.09, 0.15)
    ax = rng.uniform(-0.03, 0.03)
    tri = [(-w / 2, d / 3), (w / 2, d / 3), (ax, -2 * d / 3)]
    q = Part("split")
    # prism along local Z, then Z -> Y; edge 0 is the bark face
    prism(q, tri, -L / 2, L / 2, ["WoodBark", "WoodSplit", "WoodSplit"],
          cap="WoodEnd", M=Matrix.Rotation(-math.pi / 2, 4, "X"))
    if p is not None:
        p.extend(q, M)
    return q


def lump(th, ph):
    """Low-frequency unevenness of the heap (smooth, so splits can sit on it)."""
    return (1 + 0.05 * math.sin(3 * th + 1.3) * math.cos(2 * ph)
            + 0.035 * math.sin(5 * th + 0.4 + 3 * ph))


def dome(th, ph):
    pt = Vector((PILE_RX * math.cos(ph) * math.cos(th),
                 PILE_RY * math.cos(ph) * math.sin(th), PILE_H * math.sin(ph)))
    n = Vector((pt.x / PILE_RX ** 2, pt.y / PILE_RY ** 2, pt.z / PILE_H ** 2))
    return pt, n.normalized()


def build_pile():
    rng = random.Random(3636)
    p = Part("Pile")
    # core: lathe-style rings, every vertex jittered, every quad split to tris
    phis = [i * (math.pi / 2) / (PILE_RINGS + 1) for i in range(PILE_RINGS + 1)]
    v = []
    for ri, ph in enumerate(phis):
        for k in range(PILE_SEG):
            th = 2 * math.pi * (k + 0.5 * (ri % 2)) / PILE_SEG
            pt, _ = dome(th, ph)
            s = PILE_CORE * lump(th, ph)
            v.append((pt.x * s, pt.y * s, 0.0 if ri == 0 else pt.z * s))
    apex = len(v)
    v.append((0.0, 0.0, PILE_H * PILE_CORE * lump(0.0, math.pi / 2)))
    f = []
    for ri in range(PILE_RINGS):
        a, b = ri * PILE_SEG, (ri + 1) * PILE_SEG
        for k in range(PILE_SEG):
            k1 = (k + 1) % PILE_SEG
            f += [[a + k, a + k1, b + k], [a + k1, b + k1, b + k]]
    last = PILE_RINGS * PILE_SEG
    f += [[last + k, last + (k + 1) % PILE_SEG, apex] for k in range(PILE_SEG)]
    f.append(list(range(PILE_SEG - 1, -1, -1)))
    # dark core = the shadow between splits; the splits carry the colour
    p.add(v, f, "WoodBark")

    # splits lying ON the heap at random tilts, some proud, some half-buried
    for _ in range(PILE_SURF_PIECES):
        th = rng.uniform(0, 2 * math.pi)
        ph = math.asin(rng.uniform(0.05, 0.97) ** 0.65)   # biased to the crown
        pt, nrm = dome(th, ph)
        t = nrm.cross(Vector((0, 0, 1)))
        if t.length < 1e-3:
            t = Vector((1, 0, 0))
        t.normalize()
        ax = (Matrix.Rotation(rng.uniform(-1.4, 1.4), 3, nrm) @ t)
        ax = (ax + nrm * rng.uniform(-0.35, 0.35)).normalized()
        z = (nrm - ax * nrm.dot(ax)).normalized()
        x = ax.cross(z)
        basis = Matrix((x, ax, z)).transposed().to_4x4()
        roll = Matrix.Rotation(rng.uniform(0, 2 * math.pi), 4, "Y")
        loc = pt * PILE_CORE * lump(th, ph) + nrm * rng.uniform(*PILE_SINK)
        split_piece(rng, Matrix.Translation(loc) @ basis @ roll, p)

    # splits fallen round the toe, lying flat on the ground
    for i in range(PILE_GROUND_PIECES):
        th = 2 * math.pi * i / PILE_GROUND_PIECES + rng.uniform(-0.2, 0.2)
        rad = PILE_CORE * lump(th, 0.0) * rng.uniform(1.0, 1.12)   # at the toe
        loc = Vector((PILE_RX * rad * math.cos(th), PILE_RY * rad * math.sin(th), 0))
        q = split_piece(rng)
        M = (Matrix.Rotation(rng.uniform(0, 2 * math.pi), 4, "Z") @
             Matrix.Rotation(rng.choice((0.0, math.pi)), 4, "Y"))
        zmin = min((M @ Vector(c)).z for c in q.v)
        p.extend(q, Matrix.Translation(loc - Vector((0, 0, zmin))) @ M)
    return p


def build_rounds():
    """Unsplit rounds waiting by the splitter: one stood up, two lying."""
    p = Part("Rounds")
    for (x, y, r, h, lying, yaw) in [(-0.2, -2.75, 0.21, 0.42, False, 0.3),
                                     (-1.1, -2.9, 0.19, 0.40, True, 0.9),
                                     (0.6, -2.7, 0.17, 0.38, True, 2.2)]:
        M = T(x, y, r if lying else 0.0) @ Matrix.Rotation(yaw, 4, "Z")
        if lying:
            M = M @ ALONG_X @ T(0, 0, -h / 2)
        lathe(p, [(0.0, r), (h, r)], 8, "WoodBark", cap="WoodEnd", M=M)
    return p


# ---------------------------------------------------------------------------
# Bundle row — a pyramid of bundles, ends to the road
# ---------------------------------------------------------------------------
def build_row(bundles):
    """Pyramid of bundles, ends to the road.  Laid out loose on a hex grid,
    then SETTLED under gravity (owner, 2026-10-05: bundles must touch): each
    bundle's end-on silhouette (its film outline, convex) drops, slides in
    toward the row's centre line and rolls a little, bottom-up, until it rests
    on the ground or on its neighbours — the same sweep as settle(), with
    height + a pull to the centre as the cost."""
    rng = random.Random(3030)
    rmax = max(max(math.hypot(x, z) for x, _, z in b.v) for b in bundles)
    D = 2 * rmax + 0.01
    x0, y0 = ROW_CENTRE
    zc, items = rmax, []
    for row, cnt in enumerate(ROW_COUNTS):
        for k in range(cnt):
            b = bundles[rng.randrange(len(bundles))]
            x = x0 + (k - (cnt - 1) / 2) * D
            M = (T(x, y0 + rng.uniform(-0.03, 0.03), zc) @
                 Matrix.Rotation(rng.uniform(0, 2 * math.pi), 4, "Y") @
                 Matrix.Rotation(rng.choice((0.0, math.pi)), 4, "Z"))
            if row == 0:   # seat the bottom row on the ground
                zmin = min((M @ Vector(c)).z for c in b.v)
                M = T(0, 0, -zmin) @ M
            items.append([b, M])
        zc += D * math.sqrt(3) / 2

    def silhouette(b, M):
        return convex_hull([((M @ Vector(c)).x, (M @ Vector(c)).z) for c in b.v])

    polys = [silhouette(b, M) for b, M in items]

    def cost(poly):
        cx, cz = _centroid(poly)
        return cz + ROW_PULL * abs(cx - x0)

    for _ in range(ROW_SWEEPS):
        moved = False
        for i in sorted(range(len(polys)), key=lambda j: _centroid(polys[j])[1]):
            cur, c0 = polys[i], cost(polys[i])
            others = polys[:i] + polys[i + 1:]
            cx, cz = _centroid(cur)
            sx = -1.0 if cx > x0 else 1.0           # toward the centre line
            for step in ROW_STEPS:
                best = None
                for dx, dz in ((0.0, -1.0), (sx * 0.707, -0.707), (sx, 0.0),
                               (-sx * 0.5, -0.866)):
                    for tw in ROW_TWISTS:
                        c, sn = math.cos(tw), math.sin(tw)
                        cand = [(cx + dx * step + (x - cx) * c - (z - cz) * sn,
                                 cz + dz * step + (x - cx) * sn + (z - cz) * c)
                                for x, z in cur]
                        if min(z for _, z in cand) < 0.0:
                            continue
                        k = cost(cand)
                        if k < c0 - 1e-6 and not any(
                                _overlap(cand, q, SETTLE_GAP) for q in others):
                            best, c0 = (cand, dx * step, dz * step, tw), k
                if best:
                    polys[i], dx, dz, tw = best
                    # same move on the mesh: a CCW turn in (x, z) is Ry(-tw)
                    items[i][1] = (T(dx, 0, dz) @ T(cx, 0, cz) @
                                   Matrix.Rotation(-tw, 4, "Y") @
                                   T(-cx, 0, -cz) @ items[i][1])
                    moved = True
                    break
        if not moved:
            break

    p = Part("BundleRow")
    for b, M in items:
        p.extend(b, M)
    return p


# ---------------------------------------------------------------------------
# Bake / verify / export
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
    if col[3] < 1.0:    # exports alphaMode BLEND, single-sided
        b.inputs["Alpha"].default_value = col[3]
        try:
            m.surface_render_method = "BLENDED"
        except AttributeError:
            m.blend_method = "BLEND"
    return m


def _orient_islands(bm):
    bm.faces.ensure_lookup_table()
    todo = {f.index for f in bm.faces}
    flipped = 0
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
        # Signed volume about the island's OWN centroid: for a closed shell the
        # reference point does not matter, but the bundle film is OPEN (holes
        # at the ends), and measured about the world origin a film sitting
        # metres away came out with the wrong sign and was flipped inside out.
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
            flipped += 1
    return flipped


def bake(part, merge_doubles=True):
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
    if merge_doubles:
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
    # Clear in place.  NOT wm.read_homefile: that frees the window/screen, and
    # a caller holding a context override on it crashes Blender outright.
    for d in (bpy.data.objects, bpy.data.meshes, bpy.data.materials,
              bpy.data.images):
        for x in list(d):
            d.remove(x)


def _empty(name, x, y, hx, hy):
    """A flat CUBE empty whose scale IS the reserved area's half-extents."""
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "CUBE"
    e.empty_display_size = 1.0
    e.location = (x, y, 0.0)
    e.scale = (hx, hy, 0.05)
    bpy.context.collection.objects.link(e)
    return e


def _empties():
    _empty("SpotPickup", *SPOT_PICKUP)
    _empty("SpotAwning", *SPOT_AWNING)


def glb_part(path, name):
    """A shipped kit model as a Part (world-space polys + material names), so
    the yard composites the SAME mesh the standalone .glb ships.  Its
    materials stay in bpy.data, and bake() reuses them by name — including
    their doubleSided flag."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    p = Part(name)
    for o in new:
        if o.type != "MESH":
            continue
        me = o.data
        verts = [tuple(o.matrix_world @ v.co) for v in me.vertices]
        p.add(verts, [list(f.vertices) for f in me.polygons],
              [me.materials[f.material_index].name for f in me.polygons])
    for o in new:
        data = o.data
        bpy.data.objects.remove(o)
        if data is not None and data.users == 0:
            bpy.data.meshes.remove(data)
    return p


def build_furniture():
    """Awning on SpotAwning, chairs under it — composited from their .glb."""
    p = Part("Furniture")
    ax, ay = SPOT_AWNING[:2]
    p.extend(glb_part(f"{MODELS}/awning.glb", "awning"), T(ax, ay, 0))
    chair = glb_part(f"{MODELS}/camp-chair.glb", "camp-chair")
    for x, y, yaw in CHAIRS:
        p.extend(chair, T(x, y, 0) @ Matrix.Rotation(yaw, 4, "Z"))
    return p


def yard_parts():
    bundles = [build_bundle(s) for s in BUNDLES]
    row = build_row([build_bundle(s, lod=True) for s in BUNDLES])
    sx, sy, syaw = SPLITTER_AT
    spl = Part("Splitter")
    spl.extend(build_splitter(), T(sx, sy, 0) @ Matrix.Rotation(syaw, 4, "Z"))
    pile = Part("Pile")
    pile.extend(build_pile(), T(PILE_CENTRE[0], PILE_CENTRE[1], 0))
    return bundles, [spl, pile, build_rounds(), row, build_furniture()]


def build():
    """Source view: yard parts as separate objects + the three bundles on show."""
    _fresh_scene()
    bundles, parts = yard_parts()
    print("=" * 60)
    total = 0
    for part in parts:
        ob = bake(part)
        t = evaluated_tris(ob)
        total += t
        print(f"  {part.name:12s} {t:5d} tris")
    print(f"  YARD TOTAL   {total:5d} tris (budget {TRI_BUDGETS['splitting-yard']})")
    for i, b in enumerate(bundles):
        show = Part(b.name)
        show.extend(b, T(3.6 + i * 0.5, 4.6, 0.2))
        ob = bake(show)
        print(f"  {b.name:18s} {evaluated_tris(ob):4d} tris "
              f"(budget {TRI_BUDGETS[b.name]})")
    _empties()
    print(f"  materials {len(bpy.data.materials)}  images {len(bpy.data.images)}")
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
    """One .glb per bundle (each alone), the yard as ONE merged mesh (7
    materials = 7 draw calls, not 4 objects x their materials) + its marker
    empties; then the separate-object source view saved as the .blend."""
    for spec in BUNDLES:
        _fresh_scene()
        ob = bake(build_bundle(spec))
        print(f"  {spec[0]}: {evaluated_tris(ob)} tris")
        _glb(spec[0])
    _fresh_scene()
    _, parts = yard_parts()
    yard = Part("SplittingYard")
    for part in parts:
        yard.extend(part)
    ob = bake(yard)
    print(f"  splitting-yard: {evaluated_tris(ob)} tris")
    _empties()
    _glb("splitting-yard")
    build()
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    print(f"  wrote {OUT_BLEND}")


if __name__ == "__main__":
    build()
