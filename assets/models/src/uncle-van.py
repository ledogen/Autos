"""
ASSET-32 — Uncle Larry's van: a 1984 Chevrolet G20 panel van (125" wheelbase), rear doors open,
paper bundles inside.  Parametric generator.

Built for: Blender 5.2  |  2200 tris, 11 materials, one 1024x128 image  |  owner signed off 2026-10-29.
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

REFERENCE.  Every dimension is measured off the BaT reference board (8 photos of one 1984 G20,
https://bringatrailer.com/listing/1984-chevrolet-g20-van/; board names carry the gallery index) by bundle adjustment: uncle-van-ref/ba.py solves all 8 cameras and the 3D
landmarks together from pixel picks (uncle-van-ref/picks.py), scaled by the 125" wheelbase; the side
silhouette comes from a paint-colour mask (uncle-van-ref/profile.py).  uncle-van-ref/overlay.py renders this model
through every solved camera onto its photo — that overlay is the comparison, round after round.
"BA" below = a bundle-adjusted landmark (x, y, z).

AXES.  Blender +Y = glTF -Z = forward (nose).  X across, -X = driver side (left-hand drive),
Z up, z = 0 the ground under the tyres.  y = 0 at mid-wheelbase.
"""

import bpy
import bmesh
import math
import os
from mathutils import Matrix, Vector

# ---------------------------------------------------------------------------
# PARAMETERS — measured (see header)
# ---------------------------------------------------------------------------
OUT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))     # assets/models
OUT_BLEND = f"{OUT_DIR}/src/uncle-van.blend"
NAME = "uncle-van"
OBJECT = "UncleVan"
TRI_BUDGET = 2200

WB = 3.175                  # 125" wheelbase
AX_F, AX_R = WB / 2, -WB / 2
HUB_Z_BA = 0.331            # BA: hub height on the loaded tyre
TYRE_R = 0.342              # unloaded radius (side photos: 127 px at 2.69 mm/px)
TYRE_W = 0.215
TREAD_X = 0.86              # BA: tread centre 0.864 front / 0.851 rear
WHEEL_SEG = 10
HUB_Z = TYRE_R * math.cos(math.pi / WHEEL_SEG)   # 0.325: the 10-gon's bottom FLAT on the ground (BA 0.331)

# ---- body: a loft of horizontal SLICES (plan rings) stacked bottom -> top ---------------------
# Each slice is a plan outline at height z.  Its tail y and nose y come straight from the side
# silhouette (paint mask, uncle-van-ref/profile.py, both side photos averaged), so the hood slope, the
# windshield rake and the rear doors' lean are the slices' front/rear ends stepping with z.  Its
# half-width carries the tumblehome; its corner radii carry the plan rounding at that height.
# Ring layout (per slice, 18 points, CCW from above): 0 tail centre, 1-4 rear corner arc, 5 S
# (front end of the flat side), 6 T, 7 A (A-pillar / fender corner), 8 C (front-face corner; the
# windshield corner on the glass slices), 9 nose centre, 10-17 the mirror image.
Z_SILL = 0.40
HW = 0.975                  # half width over the side panels (BA: markers / fuel door 0.98, proud)
# fender plan in front of the cab door (lower body): (x, y), side -> front-face corner; the front
# face is flat to +-0.905 (grille surround corners measure x 0.910 at y 2.218, proud of it)
FENDER = [(0.975, 1.60), (0.945, 2.04), (0.932, 2.14), (0.905, 2.188)]
Y_FACE = 2.19
Z_BELT, Z_LEDGE = 1.33, 1.37   # the shoulder: lower body below Z_BELT, upper body set in above Z_LEDGE
# the upper side is ONE plane from the ledge to the drip rail (the lettering lies on it)
UPPER = ((0.925, Z_LEDGE), (0.866, 1.81))       # (x, z) at its two ends


def upper_x(z):
    (x0, z0), (x1, z1) = UPPER
    return x0 + (x1 - x0) * (z - z0) / (z1 - z0)


#   z      tail y   half-w   rear corner (rx, ry)   front: ("lower"|"hood", nose y) or (nose y, [S, T, A, C])
SLICES = [
    (0.40, -2.700, 0.965, (0.08, 0.14), ("lower", Y_FACE)),
    (1.05, -2.700, 0.975, (0.09, 0.15), ("lower", Y_FACE)),    # the face is vertical to here (paint mask)
    (1.13, -2.700, 0.975, (0.09, 0.15), ("hood", 2.14)),       # hood front edge
    (1.21, -2.690, 0.975, (0.09, 0.15), ("hood", 2.00)),
    (1.29, -2.665, 0.975, (0.09, 0.15), ("hood", 1.79)),
    (Z_BELT, -2.660, 0.975, (0.10, 0.15), ("hood", 1.72)),
    # shoulder ledge: the upper body steps in ~5 cm (rear-view silhouette + cab-glass landmarks).
    # S..C is the A-pillar: S sits just ahead of the door glass's front edge, C on the BA
    # windshield corner (0.856, 1.539, 1.365) .. (0.759, 1.210, 1.810)
    (Z_LEDGE, -2.650, upper_x(Z_LEDGE), (0.12, 0.15), (1.61, [(upper_x(Z_LEDGE), 1.46), (0.915, 1.50), (0.89, 1.53), (0.85, 1.555)])),
    (1.59, -2.585, upper_x(1.59), (0.16, 0.16), (1.39, [(upper_x(1.59), 1.28), (0.88, 1.31), (0.845, 1.345), (0.807, 1.373)])),
    (1.81, -2.500, upper_x(1.81), (0.18, 0.17), (1.24, [(upper_x(1.81), 1.135), (0.85, 1.16), (0.81, 1.188), (0.759, 1.21)])),
    (1.88, -2.470, upper_x(1.88), (0.20, 0.18), (1.20, [(upper_x(1.88), 1.02), (0.83, 1.08), (0.79, 1.13), (0.73, 1.17)])),
    (1.97, -2.300, 0.760, (0.28, 0.24), (0.88, [(0.76, 0.62), (0.73, 0.74), (0.68, 0.81), (0.58, 0.85)])),
    (2.00, -2.150, 0.620, (0.33, 0.30), (0.62, [(0.62, 0.35), (0.58, 0.48), (0.51, 0.55), (0.40, 0.60)])),
]
GLASS_BANDS = (Z_LEDGE, 1.59)       # windshield = ring segments C..nose..C on the bands starting here

# wheel arches (chrome-lip outline, side photos), relative to the axle: (dy, z), front foot first
ARCH = [(0.46, Z_SILL), (0.39, 0.70), (0.26, 0.775), (0.0, 0.80), (-0.23, 0.785),
        (-0.34, 0.72), (-0.42, 0.59), (-0.465, Z_SILL)]
WELL_X = 0.62               # wheelhouse inner wall

# cab door glass on the upper side plane, (y, z): BA rear edge y 0.64 z 1.356..1.791; the front edge
# follows the A-pillar (side photo: (1.42, 1.343) .. (1.109, 1.786)); glass 2 cm inside the skin
SIDE_WIN = [(0.64, 1.42), (0.655, 1.395), (0.68, 1.385), (1.405, 1.385), (1.10, 1.785),
            (0.68, 1.785), (0.655, 1.775), (0.64, 1.75)]
WIN_DEPTH = 0.02
VENT_BAR = ((1.01, 1.39), (1.065, 1.785))       # vent-window divider, side photo

# front end (BA: surround outer corners x 0.910 z 0.667 / 1.000 at y 2.218; headlamp lens outer
# x 0.847, upper top z 0.964, lower bottom z 0.693; front photo for the rest)
SURROUND = dict(x=0.91, z=(0.667, 1.000), w=0.025, y=(2.19, 2.222))     # sits ON the face
GRILLE_Y = 2.15                                  # floor of the recess behind the surround
LAMP_X = (0.687, 0.847)
LAMP_Z = ((0.858, 0.964), (0.70, 0.80))
POD_BAR_X = 0.637                                # chrome upright between lamp pod and grille
BARS_Z = ((0.807, 0.817), (0.837, 0.847))        # the twin chrome bars across the whole front
SLATS_Z = [(0.868, 0.880), (0.903, 0.915), (0.938, 0.950), (0.712, 0.724), (0.747, 0.759)]
PARK_X, PARK_Z = (0.476, 0.612), (0.70, 0.795)   # amber parking lamps behind the grille ends
VALANCE_SLOTS = [(-0.46, -0.17), (-0.135, 0.135), (0.17, 0.46)]
VALANCE_Z = (0.583, 0.653)
MARKER_F = dict(y=(1.967, 2.123), z=(0.895, 0.968))   # BA centre (0.937, 2.045, 0.931); side photo size

# mirrors: BA head centre (1.084, 1.062, 1.411); side photo head z 1.36..1.52, base plate on the door
MIRROR_HEAD = dict(c=(1.084, 1.08, 1.415), size=(0.165, 0.06, 0.155), yaw=math.radians(10))
MIRROR_BASE = dict(y=(1.06, 1.22), z=(1.19, 1.31))

DRIP = dict(y=(-2.44, 1.02), z=(1.855, 1.875), out=0.018)

# bumpers: (x, face y, back y) stations [wrapped end, face corner], z (bottom, face top, flange top)
# — side photos for depth and the flange; front/rear overlays for width and the face height
BUMP_F = dict(st=[(0.945, 2.18, 2.11), (0.90, 2.265, 2.13)], z=(0.39, 0.572, 0.60))
BUMP_R = dict(st=[(0.95, -2.67, -2.61), (0.90, -2.752, -2.62)], z=(0.44, 0.585, 0.61))

# ---- the rear: cargo bay, open doors, lamps ---------------------------------------------------
# BA: rear doors' outer corners x 0.70 (top z 1.881 at y -2.471, bottom z 0.619 at y -2.680), the
# centre seam on the same lean; tail lamps outer x 0.898, z 0.908..1.082 (red over a clear
# back-up lens, rear photo); rear side marker centre (0.981, -2.448, 0.977); fuel door (left)
# centre (-0.982, -2.266, 1.016).
DOOR_X, DOOR_T = 0.70, 0.045
DOOR_Z = (0.62, 1.88)
DOOR_OPEN = math.radians(100)
DOOR_HINGES_Z = (0.72, 1.30)                     # rear photo
APERTURE = dict(x=0.685, z=(0.64, 1.86))
FLOOR_Z, BULK_Y, WALL = 0.64, 0.55, 0.035        # cargo floor, bulkhead behind the seats, skin
TAIL_LAMP = dict(x=(0.726, 0.898), red=(0.952, 1.082), clear=(0.908, 0.948), bezel=0.010)
MARKER_R = dict(y=(-2.525, -2.371), z=(0.94, 1.015))
FUEL = dict(y=(-2.343, -2.19), z=(0.94, 1.094))
HANDLES = [(1, (0.62, 0.78)), (-1, (0.62, 0.78)), (1, (0.40, 0.52))]   # (side, y span); z HANDLE_Z
HANDLE_Z = (1.200, 1.225)
# shut lines (grooves): (side, y) — cab doors' rear edges, the right side's sliding door rear edge;
# cab doors' front edges run from the arch to the belt
SEAMS = [(-1, 0.593), (1, 0.593), (1, -0.66)]
SEAMS_FRONT = [(-1, 1.55), (1, 1.55)]
SEAM_W, SEAM_PROUD = 0.007, 0.002

# ---- cargo: strapped paper bundles on the floor and the right-hand wheel hump ---------------
BUNDLE = (0.40, 0.30, 0.17)                      # x, y, z of one bundle
STRAP_W = 0.035
#           x       y      base z        yaw deg
BUNDLES = [(-0.30, -2.30, FLOOR_Z, 4), (-0.31, -2.29, FLOOR_Z + 0.172, -8), (0.22, -2.25, FLOOR_Z, -6),
           (-0.02, -1.80, FLOOR_Z, 3), (0.76, -1.55, 0.84, 84)]

# ---- lettering (ART-STYLE's lettering exception; produce-stall.py's bake) -------------------
# The sign IS the body's own faces: the upper side plane from the ledge to the drip rail, tail
# corner to the cab door's shut line, re-materialled VanSign and projected.  No plate, so no plate
# edge to frame the words (v1's lesson).  Texture aspect = plate aspect: SIGN_W is derived.
SIGN_TEX = (1024, 128)
SIGN_Y_SEAM = SEAMS[0][1]                        # the cab door's rear shut line: the sign's front edge
SIGN_YC = -0.90                                  # text centre: the middle of the flat panel
SIGN_TEXT = ("LARRY'S DELIVERY", "PAPERS  \u2022  PARCELS  \u2022  555-0142")
SIGN_ROWS = (0.60, 0.21)                         # line centres, fraction of plate height
SIGN_FILL = (0.64, 0.40)                         # line width caps, fraction of plate width
SIGN_HMAX = (0.46, 0.15)                         # line height caps, fraction of plate height
SIGN_SHADOW = 0.010                              # drop shadow under line 1, plate metres
SIGN_FONT = "/System/Library/Fonts/Supplemental/Georgia Bold Italic.ttf"
SIGN_IMAGE = "UncleVanSign"

# Eleven materials = eleven draw calls.  Every dark part (tyres, grille recess, wheelhouses, floor,
# window reveals, shut lines) shares VanBlack; wheel discs and grille slats share VanGrey.
# Names are the runtime API (substring-matched): VanPaint is the recolourable body, VanSign carries
# the lettering image — swapping that image re-letters the van with no re-model.
PAINT = (0.560, 0.500, 0.370, 1.0)       # faded cream (v1's livery; the reference car is blue)
LETTER = (0.190, 0.032, 0.026)           # maroon sign-writing
MATS = {
    #  name           base colour (linear)              rough
    "VanPaint":    (PAINT, 0.60),
    "VanSign":     ((1.0, 1.0, 1.0, 1.0), 0.60),       # lettering texture (ground = PAINT)
    "VanBlack":    ((0.016, 0.016, 0.017, 1.0), 0.90),
    "VanGrey":     ((0.180, 0.185, 0.190, 1.0), 0.50),
    "VanChrome":   ((0.500, 0.500, 0.480, 1.0), 0.30),
    "VanGlass":    ((0.024, 0.030, 0.036, 1.0), 0.20),
    "LampFront":   ((0.740, 0.720, 0.640, 1.0), 0.20),
    "LampAmber":   ((0.700, 0.300, 0.010, 1.0), 0.30),
    "LampTail":    ((0.450, 0.020, 0.015, 1.0), 0.30),
    "VanInterior": ((0.200, 0.230, 0.280, 1.0), 0.80),  # painted cargo bay, door inners
    "Newsprint":   ((0.620, 0.620, 0.580, 1.0), 0.95),
}


# ---------------------------------------------------------------------------
# Geometry accumulator + primitives
# ---------------------------------------------------------------------------
class Part:
    def __init__(self, name):
        self.name, self.v, self.f, self.m = name, [], [], []

    def add(self, verts, faces, mat, M=None):
        """Faces arrive wound outward (CCW seen from outside); a mirroring M keeps them so."""
        o = len(self.v)
        if M is not None:
            verts = [tuple(M @ Vector(c)) for c in verts]
            if M.to_3x3().determinant() < 0:
                faces = [list(reversed(fc)) for fc in faces]
        self.v.extend(tuple(c) for c in verts)
        for k, fc in enumerate(faces):
            self.f.append([i + o for i in fc])
            self.m.append(mat[k] if isinstance(mat, list) else mat)


SIDE = Matrix(((0, 0, 1, 0), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1)))   # local (a,b,c) -> (c,a,b)
ALONG_X = Matrix.Rotation(math.pi / 2, 4, "Y")       # local +Z -> world +X
ALONG_NX = Matrix.Rotation(-math.pi / 2, 4, "Y")     # local +Z -> world -X


def Tr(x, y, z=0.0):
    return Matrix.Translation((x, y, z))


def MX(s):
    """Mirror across x for s = -1 (the left side); identity for s = +1."""
    return Matrix.Scale(-1, 4, (1, 0, 0)) if s < 0 else Matrix.Identity(4)


BOX_FACES = ("-z", "+z", "-y", "+x", "+y", "-x")


def box(p, lo, hi, mat, M=None, skip=()):
    """mat: one name, or six for [-z, +z, -y, +x, +y, -x].  skip: faces buried in what the box is
    mounted on (named as in BOX_FACES, in the box's own frame) — never seen, never paid for."""
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
         (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    f = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
    keep = [i for i, n in enumerate(BOX_FACES) if n not in skip]
    mats = mat if isinstance(mat, list) else [mat] * 6
    p.add(v, [f[i] for i in keep], [mats[i] for i in keep], M)


def prism(p, poly, z0, z1, mat, cap=None, M=None):
    n = len(poly)
    if sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(poly, poly[1:] + poly[:1])) < 0:
        poly = list(reversed(poly))                  # CCW, so every face winds outward
        if isinstance(mat, list):
            mat = list(reversed(mat[:-1])) + mat[-1:]
    v = [(a, b, z0) for a, b in poly] + [(a, b, z1) for a, b in poly]
    f = [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    f += [list(range(n - 1, -1, -1)), list(range(n, 2 * n))]
    m = list(mat) if isinstance(mat, list) else [mat] * n
    cap = cap or (mat if isinstance(mat, str) else mat[0])
    caps = list(cap) if isinstance(cap, (list, tuple)) else [cap, cap]
    p.add(v, f, m + caps, M)


def lathe(p, profile, seg, mats, caps, M=None, phase=0.0):
    """Surface of revolution about local Z; profile = [(z, r)]; mats per band; caps (first, last)."""
    v, f = [], []
    for z, r in profile:
        v += [(math.cos(2 * math.pi * k / seg + phase) * r,
               math.sin(2 * math.pi * k / seg + phase) * r, z) for k in range(seg)]
    m = []
    for s in range(len(profile) - 1):
        a, b = s * seg, (s + 1) * seg
        f += [[a + k, a + (k + 1) % seg, b + (k + 1) % seg, b + k] for k in range(seg)]
        m += [mats[s]] * seg
    last = (len(profile) - 1) * seg
    for ring, cap in ((list(range(seg - 1, -1, -1)), caps[0]), (list(range(last, last + seg)), caps[1])):
        if cap:
            f.append(ring)
            m.append(cap)
    p.add(v, f, m, M)


def loft(p, rings, mat, cap0=None, cap1=None):
    """Stack equal-length rings into a closed shell; mat: name or fn(band, segment) -> name."""
    n = len(rings[0])
    v = [c for r in rings for c in r]
    f, m = [], []
    for k in range(len(rings) - 1):
        for i in range(n):
            f.append([k * n + i, k * n + (i + 1) % n, (k + 1) * n + (i + 1) % n, (k + 1) * n + i])
            m.append(mat(k, i) if callable(mat) else mat)
    f += [list(range(n - 1, -1, -1)), [(len(rings) - 1) * n + i for i in range(n)]]
    base = mat if isinstance(mat, str) else "VanPaint"
    m += [cap0 or base, cap1 or base]
    p.add(v, f, m)


def bar(p, a, b, w, mat, ends=True):
    a, b = Vector(a), Vector(b)
    q = Vector((0, 0, 1)).rotation_difference((b - a).normalized()).to_matrix().to_4x4()
    box(p, (-w / 2, -w / 2, 0), (w / 2, w / 2, (b - a).length), mat, Matrix.Translation(a) @ q,
        skip=() if ends else ("-z", "+z"))


def plan_plate(p, a, b, z0, z1, t, mat, M=None):
    """A lens/plate standing on the plan segment a -> b (a surface line), t proud along the
    segment's outward (+X-ward) normal, its back buried 4 mm and not built."""
    (ax, ay), (bx, by) = a, b
    d = Vector((bx - ax, by - ay, 0))
    n = Vector((d.y, -d.x, 0)).normalized()
    if n.x < 0:
        n = -n
    B = Matrix((n, d.normalized(), (0, 0, 1))).transposed().to_4x4()       # local x = n, y = along
    B.translation = (ax, ay, 0)
    box(p, (-0.004, 0, z0), (t, d.length, z1), mat, (M or Matrix.Identity(4)) @ B, skip=("-x",))


# ---------------------------------------------------------------------------
# The body
# ---------------------------------------------------------------------------
def fender_x(y, scale=1.0):
    """Lower-body plan half-width at y (FENDER taper), x scaled for the narrower sill slice."""
    pts = FENDER
    if y <= pts[0][1]:
        return pts[0][0] * scale
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if y <= y1:
            return (x0 + (x1 - x0) * (y - y0) / (y1 - y0)) * scale
    return pts[-1][0] * scale


def slice_front(kind, hw):
    """Front polyline S, T, A, C (x >= 0) and the centre nose y."""
    if isinstance(kind[0], str):
        tag, yf = kind
        k = hw / HW
        if tag == "lower":
            pts = [(x * k, y) for x, y in FENDER]
            if yf < Y_FACE:              # front face rounding back into the hood edge
                pts[-1] = (pts[-1][0] - 0.01, yf - 0.002)
                pts[-2] = (pts[-2][0], min(pts[-2][1], yf - 0.04))
            return pts, yf
        # hood: the lower plan clipped at the hood's front edge, fender-top corners eased
        return [(hw, min(FENDER[0][1], yf - 0.14)),
                (fender_x(yf - 0.07, k), yf - 0.07),
                (fender_x(yf - 0.02, k) - 0.012, yf - 0.02),
                (fender_x(yf, k) - 0.05, yf - 0.003)], yf
    yf, pts = kind
    return list(pts), yf


def slice_ring(z, yr, hw, rr, kind):
    rx, ry = rr
    right = [(hw - rx + rx * math.sin(a), yr + ry * (1 - math.cos(a)))
             for a in (0.0, math.pi / 6, math.pi / 3)] + [(hw, yr + ry)]
    front, yf = slice_front(kind, hw)
    right += front
    ring = [(0.0, yr)] + right + [(0.0, yf)] + [(-x, y) for x, y in reversed(right)]
    return [(x, y, z) for x, y in ring]


def body_mat(band, seg):
    if SLICES[band][0] in GLASS_BANDS and seg in (8, 9):
        return "VanGlass"
    return "VanPaint"


def build_body():
    p = Part("Body")
    loft(p, [slice_ring(*s) for s in SLICES], body_mat, cap0="VanBlack")
    return p


def upper_frame(s):
    """(origin at the ledge line, along-z unit, outward normal) of the upper side plane, side s."""
    (x0, z0), (x1, z1) = UPPER
    up = Vector((x1 - x0, 0, z1 - z0)).normalized()
    n = Vector((up.z, 0, -up.x))
    o, up, n = Vector((x0, 0, z0)), up, n
    if s < 0:
        o.x, up.x, n.x = -o.x, -up.x, -n.x
    return o, up, n


def on_upper(s, y, z, d=0.0):
    """Point on the upper side plane at (y, z), moved d along its outward normal."""
    o, up, n = upper_frame(s)
    t = (z - o.z) / up.z
    return o + up * t + Vector((0, y, 0)) + n * d


def window_cutter(s):
    p = Part("WinCut")
    vin = [on_upper(s, y, z, -WIN_DEPTH) for y, z in SIDE_WIN]
    vout = [on_upper(s, y, z, 0.25) for y, z in SIDE_WIN]
    n = len(SIDE_WIN)
    f = [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    f += [list(range(n - 1, -1, -1)), list(range(n, 2 * n))]
    p.add([tuple(v) for v in vin + vout], f, ["VanBlack"] * n + ["VanGlass", "VanBlack"])
    return p


def arch_cutter(s):
    """One wheel-arch cutter per side per axle: the arch outline extruded from the wheelhouse wall
    outward, so the cut opens the panel and leaves a wheelhouse, never a tunnel across the van."""
    p = Part("ArchCut")
    for ax in (AX_F, AX_R):
        poly = [(ax + dy, z) for dy, z in ARCH] + [(ax + ARCH[-1][0], -0.2), (ax + ARCH[0][0], -0.2)]
        a, b = sorted((s * WELL_X, s * 1.5))
        prism(p, poly, a, b, "VanBlack", M=SIDE)
    return p


def front_cutter():
    """The recess behind the grille surround, and the three valance slots."""
    p = Part("FrontCut")
    sx, (sz0, sz1), w = SURROUND["x"], SURROUND["z"], SURROUND["w"]
    box(p, (-(sx - w), GRILLE_Y, sz0 + w * 0.92), (sx - w, 2.40, sz1 - w), "VanBlack")
    for x0, x1 in VALANCE_SLOTS:
        box(p, (x0, Y_FACE - 0.02, VALANCE_Z[0]), (x1, 2.40, VALANCE_Z[1]), "VanBlack")
    return p


# ---------------------------------------------------------------------------
# Trim, lamps, glass details
# ---------------------------------------------------------------------------
def build_front():
    p = Part("Front")
    sx, (sz0, sz1), w, (y0, y1) = SURROUND["x"], SURROUND["z"], SURROUND["w"], SURROUND["y"]
    # chrome surround: full-width top and bottom rails, uprights between them
    box(p, (-sx, y0, sz1 - w), (sx, y1, sz1), "VanChrome", skip=("-y",))
    box(p, (-sx, y0, sz0), (sx, y1, sz0 + w * 0.92), "VanChrome", skip=("-y",))
    for s in (-1, 1):
        a, b = sorted((s * sx, s * (sx - w)))
        box(p, (a, y0, sz0 + w * 0.92), (b, y1, sz1 - w), "VanChrome", skip=("-y", "-z", "+z"))
    zin = (sz0 + w * 0.92, sz1 - w)
    yl = Y_FACE                                      # lamp faces flush with the body face
    for s in (-1, 1):
        M = MX(s)
        for z0, z1 in LAMP_Z:                        # chrome bezel + lens, four sealed beams
            box(p, (LAMP_X[0] - 0.012, GRILLE_Y, z0 - 0.012), (LAMP_X[1] + 0.012, yl - 0.008, z1 + 0.012),
                "VanChrome", M, skip=("-y",))
            box(p, (LAMP_X[0], yl - 0.010, z0), (LAMP_X[1], yl, z1), "LampFront", M, skip=("-y",))
        box(p, (POD_BAR_X - 0.006, GRILLE_Y, zin[0]), (POD_BAR_X + 0.006, yl - 0.004, zin[1]), "VanChrome", M,
            skip=("-y", "-z", "+z"))
        box(p, (PARK_X[0], GRILLE_Y, PARK_Z[0]), (PARK_X[1], GRILLE_Y + 0.008, PARK_Z[1]), "LampAmber", M,
            skip=("-y",))
        # front side marker on the fender taper
        y0m, y1m = MARKER_F["y"]
        plan_plate(p, (fender_x(y0m), y0m), (fender_x(y1m), y1m), *MARKER_F["z"], 0.006, "LampAmber", M)
    for z0, z1 in BARS_Z:                            # twin chrome bars, lamp pod to lamp pod
        box(p, (-(sx - w), GRILLE_Y, z0), (sx - w, yl - 0.004, z1), "VanChrome", skip=("-y", "-x", "+x"))
    for z0, z1 in SLATS_Z:                           # grille slats, in front of the parking lamps
        box(p, (-(POD_BAR_X - 0.006), GRILLE_Y + 0.012, z0), (POD_BAR_X - 0.006, yl - 0.012, z1), "VanGrey",
            skip=("-y", "-x", "+x"))
    return p


def build_trim():
    p = Part("Trim")
    for s in (-1, 1):
        M = MX(s)
        # mirror: base plate on the door, arm, head (glass faces rearward)
        (y0, y1), (z0, z1) = MIRROR_BASE["y"], MIRROR_BASE["z"]
        box(p, (HW - 0.004, y0, z0), (HW + 0.012, y1, z1), "VanChrome", M, skip=("-x",))
        cx, cy, cz = MIRROR_HEAD["c"]
        hx, hy, hz = (v / 2 for v in MIRROR_HEAD["size"])
        bar(p, (s * (HW + 0.008), 1.14, 1.27), (s * (cx - hx + 0.02), cy + 0.01, cz - hz + 0.01), 0.022, "VanChrome",
            ends=False)
        head = Tr(cx, cy, cz) @ Matrix.Rotation(-MIRROR_HEAD["yaw"], 4, "Z")
        box(p, (-hx, -hy, -hz), (hx, hy, hz), ["VanChrome", "VanChrome", "VanGlass", "VanChrome",
                                              "VanChrome", "VanChrome"], MX(s) @ head)
        # drip rail along the roof edge
        (dy0, dy1), (dz0, dz1) = DRIP["y"], DRIP["z"]
        xr = 0.852
        box(p, (xr - 0.004, dy0, dz0), (xr + DRIP["out"], dy1, dz1), "VanPaint", M)
        # vent-window divider, inside the door glass recess
        (vy0, vz0), (vy1, vz1) = VENT_BAR
        bar(p, tuple(on_upper(s, vy0, vz0, -WIN_DEPTH + 0.008)), tuple(on_upper(s, vy1, vz1, -WIN_DEPTH + 0.008)),
            0.014, "VanChrome", ends=False)
    return p


def build_wheels():
    p = Part("Wheels")
    h = TYRE_W / 2
    # tyre (inner sidewall, tread, outer sidewall), then the steel wheel: chrome trim ring, dish, hubcap
    prof = [(-h, 0.21), (-h + 0.02, TYRE_R), (h - 0.02, TYRE_R), (h, 0.21),
            (h - 0.025, 0.185), (h - 0.05, 0.075)]
    mats = ["VanBlack", "VanBlack", "VanBlack", "VanChrome", "VanGrey"]
    for y in (AX_F, AX_R):
        for s in (-1, 1):
            M = Tr(s * TREAD_X, y, HUB_Z) @ (ALONG_X if s > 0 else ALONG_NX)
            # phase pi/SEG: ALONG_X/NX send local +-X to world -+Z, so this puts a FLAT at the bottom.
            # The inner cap stays: left open, low views see through the tyre.
            lathe(p, prof, WHEEL_SEG, mats, ("VanBlack", "VanChrome"), M=M, phase=math.pi / WHEEL_SEG)
    return p


def bumper(p, spec, sign):
    """Chrome blade lofted across x through (x, face y, back y) stations; ends wrap back."""
    z0, zt, z1 = spec["z"]
    st = spec["st"]
    xs = [(-st[0][0], st[0]), (-st[1][0], st[1]), (st[1][0], st[1]), (st[0][0], st[0])]
    rings = []
    for x, (_, yf, yb) in xs:
        e = 0.018 * sign
        sec = [(yb, z1), (yf - 2 * e, z1), (yf, zt), (yf, z0 + 0.018), (yf - e, z0), (yb, z0)]
        if sign > 0:
            sec.reverse()                            # keep the loft wound outward
        rings.append([(x, y, z) for y, z in sec])
    loft(p, rings, "VanChrome")


def build_bumpers():
    p = Part("Bumpers")
    bumper(p, BUMP_F, 1)
    bumper(p, BUMP_R, -1)
    return p


def interp(table, z):
    """Piecewise-linear lookup in [(z, value)]."""
    if z <= table[0][0]:
        return table[0][1]
    for (z0, v0), (z1, v1) in zip(table, table[1:]):
        if z <= z1:
            t = (z - z0) / (z1 - z0)
            return tuple(a + (b - a) * t for a, b in zip(v0, v1)) if isinstance(v0, tuple) else v0 + (v1 - v0) * t
    return table[-1][1]


def tail_y(z):
    return interp([(s[0], s[1]) for s in SLICES], z)


def half_w(z):
    return interp([(s[0], s[2]) for s in SLICES], z)


def cargo_cutter():
    """The cargo bay: the outer slices inset by WALL, floor at FLOOR_Z, flat bulkhead at BULK_Y,
    the rear wheelhouse humps left standing.  Cut out of the body it leaves a WALL-thick shell."""
    p = Part("Cargo")
    rings = []
    for z in (FLOOR_Z, Z_BELT, Z_LEDGE, 1.81, 1.89):
        hw = half_w(z) - WALL
        yr = tail_y(z) + WALL
        rx, ry = interp([(s[0], s[3]) for s in SLICES], z)
        right = [(hw - rx, yr), (hw - rx * 0.3, yr + ry * 0.3), (hw, yr + ry), (hw, BULK_Y)]
        ring = [(0.0, yr)] + right + [(0.0, BULK_Y)] + [(-x, y) for x, y in reversed(right)]
        rings.append([(x, y, z) for x, y in ring])
    loft(p, rings, "VanInterior", cap0="VanBlack", cap1="VanInterior")
    return p


def hump_cutter():
    p = Part("Humps")
    for s in (-1, 1):
        a, b = sorted((s * (WELL_X - 0.03), s * 1.2))
        box(p, (a, AX_R - 0.50, -0.1), (b, AX_R + 0.50, 0.84), "VanInterior")
    return p


def aperture_cutter():
    p = Part("Aperture")
    x, (z0, z1) = APERTURE["x"], APERTURE["z"]
    box(p, (-x, -3.2, z0), (x, -2.30, z1), "VanPaint")
    return p


def shut_line(p, a, b, n):
    """A shut line: a dark strip SEAM_W wide from a to b (points ON the skin), SEAM_PROUD proud along
    the skin's outward normal n, its back buried.  (Boolean grooves cost 30 tris each, strips 6.)"""
    a, b, n = Vector(a), Vector(b), Vector(n)
    w = n.cross(b - a).normalized() * (SEAM_W / 2)     # base quad CCW seen from outside
    pts = [a - w - n * 0.003, b - w - n * 0.003, b + w - n * 0.003, a + w - n * 0.003]
    pts += [q + n * (0.003 + SEAM_PROUD) for q in pts]
    f = [[4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
    p.add([tuple(q) for q in pts], f, "VanBlack")


def build_seams():
    p = Part("Seams")
    for s, y in SEAMS:
        shut_line(p, (s * HW, y, Z_SILL + 0.02), (s * HW, y, Z_BELT - 0.005), (s, 0, 0))
        shut_line(p, tuple(on_upper(s, y, Z_LEDGE + 0.005)), tuple(on_upper(s, y, 1.85)), tuple(upper_frame(s)[2]))
    for s, y in SEAMS_FRONT:
        shut_line(p, (s * fender_x(y), y, ARCH[3][1] + 0.02), (s * fender_x(y), y, Z_BELT - 0.005), (s, 0, 0))
    return p


def build_rear():
    p = Part("Rear")
    tl = TAIL_LAMP
    yr = tail_y(1.0)
    for s in (-1, 1):
        M = MX(s)
        (x0, x1), b = tl["x"], tl["bezel"]
        box(p, (x0 - b, yr - 0.012, tl["clear"][0] - b), (x1 + b, yr + 0.01, tl["red"][1] + b), "VanChrome", M,
            skip=("+y",))
        box(p, (x0, yr - 0.016, tl["red"][0]), (x1, yr - 0.010, tl["red"][1]), "LampTail", M, skip=("+y",))
        box(p, (x0, yr - 0.016, tl["clear"][0]), (x1, yr - 0.010, tl["clear"][1]), "LampFront", M, skip=("+y",))
        y0, y1 = MARKER_R["y"]
        plan_plate(p, (HW, y0), (HW, y1), *MARKER_R["z"], 0.006, "LampTail", M)
    y0, y1 = FUEL["y"]
    plan_plate(p, (HW, y0), (HW, y1), *FUEL["z"], 0.003, "VanPaint", MX(-1))
    for s, (y0, y1) in HANDLES:
        box(p, (HW - 0.004, y0, HANDLE_Z[0]), (HW + 0.014, y1, HANDLE_Z[1]), "VanChrome", MX(s), skip=("-x",))
    return p


def door_leaf(s):
    """One rear door, closed: its skin follows the rear face's lean (tail_y); then swung open about
    a vertical hinge on the corner pillar."""
    p = Part("leaf")
    rings = []
    zs = [DOOR_Z[0], 1.25, 1.59, 1.81, DOOR_Z[1]]
    skin = [(z, tail_y(min(max(z, 0.9), 1.88))) for z in zs]
    for z, yo in skin:
        yi = yo + DOOR_T
        rings.append([(0.004, yo, z), (DOOR_X, yo, z), (DOOR_X, yi, z), (0.004, yi, z)])

    def leaf_y(z):                               # the leaf's own skin, for what mounts on it
        return interp(skin, z)
    loft(p, rings, lambda k, i: {0: "VanPaint", 2: "VanInterior"}.get(i, "VanPaint"))
    yo = leaf_y(1.2)
    if s > 0:                                    # handle on the right leaf
        box(p, (0.05, yo - 0.022, HANDLE_Z[0]), (0.19, yo + 0.002, HANDLE_Z[1]), "VanChrome", skip=("+y",))
    for z in DOOR_HINGES_Z:
        box(p, (DOOR_X - 0.05, leaf_y(z) - 0.016, z - 0.045), (DOOR_X + 0.004, leaf_y(z) + 0.002, z + 0.045), "VanPaint",
            skip=("+y",))
    hy = tail_y(1.0)                             # hinge axis on the corner pillar's face
    swing = Tr(DOOR_X, hy) @ Matrix.Rotation(DOOR_OPEN, 4, "Z") @ Tr(-DOOR_X, -hy)
    out = Part("leaf")
    out.add(p.v, p.f, list(p.m), MX(s) @ swing)
    return out


def build_doors():
    p = Part("Doors")
    for s in (-1, 1):
        leaf = door_leaf(s)
        p.add(leaf.v, leaf.f, list(leaf.m))
    return p


def build_bundles():
    p = Part("Bundles")
    bx, by, bz = BUNDLE
    for x, y, z, yaw in BUNDLES:
        M = Tr(x, y, z + 0.002) @ Matrix.Rotation(math.radians(yaw), 4, "Z")
        box(p, (-bx / 2, -by / 2, 0), (bx / 2, by / 2, bz), "Newsprint", M, skip=("-z",))
        box(p, (-bx / 2 - 0.004, -STRAP_W / 2, 0.0), (bx / 2 + 0.004, STRAP_W / 2, bz + 0.004), "VanGrey", M,
            skip=("-z",))
    return p


def sign_frame():
    """(height, width) of the plate in metres, measured IN the upper plane."""
    up = upper_frame(1)[1]
    h = (DRIP["z"][0] - Z_LEDGE) / up.z
    return h, h * SIGN_TEX[0] / SIGN_TEX[1]


def sign_uv(co):
    """Plate UV.  Text runs nose-ward on the right side (+X) and tail-ward on the left, so it reads
    left to right from outside either side."""
    h, w = sign_frame()
    u = (co.y - (SIGN_YC - w / 2)) / w
    if co.x < 0:
        u = 1.0 - u
    s = (co.z - Z_LEDGE) / upper_frame(1)[1].z
    return (u, s / h)


def is_sign_face(f):
    """Outer skin only: the cargo bay's walls and the door jambs face +-X too, but INWARD."""
    zs = [v.co.z for v in f.verts]
    c = f.calc_center_median()
    return (abs(f.normal.x) > 0.95 and f.normal.x * c.x > 0 and abs(c.x) > 0.8
            and min(zs) > Z_LEDGE - 1e-4 and max(zs) < 1.88 + 1e-4 and c.y < SIGN_Y_SEAM)


def apply_sign(ob):
    """Split the upper side faces at the cab door's shut line, re-material the panel behind it
    VanSign and give it plate UVs; every other face collapses to UV (0, 0)."""
    me = ob.data
    if "VanSign" not in me.materials:
        me.materials.append(get_material("VanSign"))
    si = list(me.materials).index(me.materials["VanSign"])
    bm = bmesh.new()
    bm.from_mesh(me)
    side = [f for f in bm.faces if abs(f.normal.x) > 0.95 and min(v.co.z for v in f.verts) > Z_LEDGE - 1e-4
            and max(v.co.z for v in f.verts) < 1.88 + 1e-4]
    geom = side + list({e for f in side for e in f.edges}) + list({v for f in side for v in f.verts})
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, SIGN_Y_SEAM, 0), plane_no=(0, 1, 0))
    uv = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        sign = is_sign_face(f)
        if sign:
            f.material_index = si
        for loop in f.loops:
            loop[uv].uv = sign_uv(loop.vert.co) if sign else (0.0, 0.0)
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = False


def _emission(name, col):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs[0].default_value = (col[0], col[1], col[2], 1.0)
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(e.outputs[0], o.inputs[0])
    return m


def bake_sign_texture():
    """Render the lettering from an ortho camera in PLATE METRES; return a packed image.  The
    ground is PAINT itself (Standard view transform, emission), so the panel shows no edge."""
    H, W = sign_frame()
    shadow = (0.030, 0.020, 0.015)
    engines = {i.identifier for i in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items}
    sc = bpy.data.scenes.new("SignBake")
    sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = SIGN_TEX
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.render.dither_intensity = 0.0                    # flat artwork: dither only bloats the PNG
    for k in dir(sc.render):
        if k.startswith("use_stamp"):
            try:
                setattr(sc.render, k, False)            # no Date/RenderTime: byte-identical re-runs
            except (AttributeError, TypeError):
                pass
    sc.view_settings.view_transform = "Standard"
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    cd = bpy.data.cameras.new("SignCam")
    cd.type = "ORTHO"
    cd.ortho_scale = W
    cam = bpy.data.objects.new("SignCam", cd)
    cam.location = (0.0, 0.0, 2.0)
    sc.collection.objects.link(cam)
    sc.camera = cam
    scratch, smats = [], []

    def rect(x0, x1, y0, y1, z, col, tag):
        me = bpy.data.meshes.new(tag)
        me.from_pydata([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], [], [(0, 1, 2, 3)])
        o = bpy.data.objects.new(tag, me)
        m = _emission(tag, col)
        smats.append(m)
        me.materials.append(m)
        sc.collection.objects.link(o)
        scratch.append(o)

    def text(body, x, y, z, col, tag, wmax, hmax):
        cu = bpy.data.curves.new(tag, type="FONT")
        cu.body = body
        cu.align_x, cu.align_y = "CENTER", "CENTER"
        if os.path.exists(SIGN_FONT):
            cu.font = bpy.data.fonts.load(SIGN_FONT, check_existing=True)
        o = bpy.data.objects.new(tag, cu)
        m = _emission(tag, col)
        smats.append(m)
        cu.materials.append(m)
        sc.collection.objects.link(o)
        scratch.append(o)
        me = o.to_mesh()
        xs = [v.co.x for v in me.vertices]
        ys = [v.co.y for v in me.vertices]
        k = min(wmax / (max(xs) - min(xs)), hmax / (max(ys) - min(ys)))
        mid = (max(ys) + min(ys)) / 2
        o.to_mesh_clear()
        o.scale = (k, k, k)
        o.location = (x, y - k * mid, z)

    rect(-W / 2, W / 2, -H / 2, H / 2, 0.0, PAINT[:3], "SignGround")
    for i, line in enumerate(SIGN_TEXT):
        ly = SIGN_ROWS[i] * H - H / 2
        wmax, hmax = SIGN_FILL[i] * W, SIGN_HMAX[i] * H
        if i == 0:
            text(line, SIGN_SHADOW, ly - SIGN_SHADOW, 0.01, shadow, "SignShadow", wmax, hmax)
        text(line, 0.0, ly, 0.02, LETTER, "SignLetter%d" % i, wmax, hmax)
    path = os.path.join(bpy.app.tempdir, "uncle-van-sign.png")
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True, scene=sc.name)
    img = bpy.data.images.load(path, check_existing=False)
    img.name = SIGN_IMAGE
    img.pack()                  # never leave it in tempdir
    img.filepath_raw = ""
    for o in scratch + [cam]:
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.scenes.remove(sc)
    for m in smats:
        bpy.data.materials.remove(m)
    bpy.data.cameras.remove(cd)
    return img


def van_objects():
    body = bake(build_body())
    cargo = bake(cargo_cutter())
    humps = bake(hump_cutter())
    boolean(cargo, humps, "DIFFERENCE")
    remove(humps)
    cutters = [arch_cutter(-1), arch_cutter(1), window_cutter(-1), window_cutter(1), front_cutter(),
               aperture_cutter()]
    for c in [cargo] + [bake(c) for c in cutters]:
        boolean(body, c, "DIFFERENCE")
        remove(c)
    apply_sign(body)
    return [body, bake(build_seams()), bake(build_front()), bake(build_rear()), bake(build_trim()),
            bake(build_doors()), bake(build_wheels()), bake(build_bumpers()), bake(build_bundles())]


# ---------------------------------------------------------------------------
# Bake / booleans / report
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
    if name == "VanSign":
        img = bpy.data.images.get(SIGN_IMAGE) or bake_sign_texture()
        tex = m.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = img
        tex.interpolation = "Linear"
        m.node_tree.links.new(tex.outputs["Color"], b.inputs["Base Color"])
        col = PAINT
    m.diffuse_color = col
    m.use_backface_culling = True
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
        isl = set(island)
        if any(sum(1 for lf in e.link_faces if lf in isl) != 2 for f in island for e in f.edges):
            continue                                 # open shell: trust its construction winding
        ctr = sum((v.co for f in island for v in f.verts), Vector()) / sum(len(f.verts) for f in island)
        vol = 0.0
        for f in island:
            vs = [v.co - ctr for v in f.verts]
            for i in range(1, len(vs) - 1):
                vol += vs[0].dot(vs[i].cross(vs[i + 1]))
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
    bpy.context.scene.collection.objects.link(ob)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    _orient_islands(bm)
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = False
    return ob


def boolean(ob, cutter, op):
    """Apply an EXACT boolean; the cutter's faces keep the cutter's materials."""
    mod = ob.modifiers.new("bool", "BOOLEAN")
    mod.operation = op
    mod.solver = "EXACT"
    mod.object = cutter
    mod.material_mode = "TRANSFER"
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.remove(mod)
    old = ob.data
    ob.data = me
    bpy.data.meshes.remove(old)
    for poly in me.polygons:
        poly.use_smooth = False


def remove(ob):
    me = ob.data
    bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.meshes.remove(me)


def evaluated_tris(ob):
    ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
    m = ev.to_mesh()
    m.calc_loop_triangles()
    n = len(m.loop_triangles)
    ev.to_mesh_clear()
    return n


def y_centre():
    """The shipped origin: centred on the footprint bumper face to bumper face (the open doors
    swing past the rear one), base-seated.  Everything above is built in the MEASUREMENT frame
    (y = 0 at mid-wheelbase), which is what uncle-van-ref/overlay.py's solved cameras live in."""
    return (BUMP_R["st"][1][1] + BUMP_F["st"][1][1]) / 2


def recentre(obs):
    for ob in obs:
        ob.data.transform(Matrix.Translation((0.0, -y_centre(), 0.0)))


def fresh_scene():
    for d in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for x in list(d):
            d.remove(x)


def build():
    """Source view: the van's parts as separate objects, in the shipped frame."""
    fresh_scene()
    obs = van_objects()
    recentre(obs)
    tot = 0
    for ob in obs:
        n = evaluated_tris(ob)
        tot += n
        print(f"  {ob.name:<12}{n:>6} tris")
    print(f"  TOTAL       {tot:>6} tris (budget {TRI_BUDGET})")
    return obs


def _ui_override():
    if not bpy.context.window_manager.windows:   # blender -b: no window; scene + view layer suffice
        return dict(scene=bpy.context.scene, view_layer=bpy.context.view_layer)
    win = bpy.context.window_manager.windows[0]
    area = next(a for a in win.screen.areas if a.type == "VIEW_3D")
    region = next(r for r in area.regions if r.type == "WINDOW")
    return dict(window=win, screen=win.screen, area=area, region=region,
                scene=bpy.context.scene, view_layer=bpy.context.view_layer)


def export():
    """ONE merged mesh (draw calls = materials) -> .glb; then the source view saved as the .blend.
    Needs the GUI Blender (blender-mcp): `blender -b` has no VIEW_3D area."""
    obs = build()
    with bpy.context.temp_override(active_object=obs[0], object=obs[0], selected_objects=obs,
                                   selected_editable_objects=obs):
        bpy.ops.object.join()
    van = obs[0]
    van.name = van.data.name = OBJECT
    print(f"  {OBJECT}: {evaluated_tris(van)} tris, {len(van.data.materials)} materials")
    with bpy.context.temp_override(**_ui_override()):
        bpy.ops.export_scene.gltf(
            filepath=f"{OUT_DIR}/{NAME}.glb", export_format="GLB",
            export_draco_mesh_compression_enable=False, export_yup=True,
            export_apply=True, export_materials="EXPORT", export_texcoords=True,
            export_normals=True, export_cameras=False, export_lights=False,
            use_selection=False)
    print(f"  wrote {OUT_DIR}/{NAME}.glb")
    build()
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    print(f"  wrote {OUT_BLEND}")


if __name__ == "__main__":
    build()
