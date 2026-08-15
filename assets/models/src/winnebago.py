"""
ASSET-09 — Winnebago RV (1985 Winnebago Chieftain 27DB, Class-A), parametric generator.

Built for: Blender 5.x  |  Target: assets/models/winnebago.glb
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md
Reference: assets/models/src/ref-chieftain/ — 3 exterior angles pulled from the BaT
listing (bringatrailer.com/listing/1985-winnebago-chieftain), 2026-08-13.

BUILD REPORT — filled in by build(); see the printout.

DESIGN RULINGS (2026-08-13, user):
  - Class-A flat-front Chieftain, NOT the ticket's original Class-C cab-over.
    The ticket was amended the same day.
  - ALL windows are transparent alpha-blended glass (third sanctioned alpha
    exception after broken-car; recorded in ART-STYLE.md).  Camper windows carry
    CLOSED pleated curtains behind their glass; the cab carries a minimal
    interior (dash, wheel, two captain chairs) behind its.
  - Awning ROLLED UP against the door-side wall (ASSET-06 stays the deployed one).
  - Roof kit: one A/C shroud + one vent.  No ladder, no spare, no roof rack.

AXIS TRAP.  The glTF exporter's "+Y up" maps blender (x,y,z) -> gltf (x, z, -y).
So blender +Y becomes gltf -Z.  ASSETS.md wants the nose on -Z, therefore
*** the nose is modelled at +Y in Blender. ***  Left-hand drive follows:
left = up x forward = -X, so the driver sits at -X and the entry door is at +X.

CONSTRUCTION NOTES:
  - The hull is one loft: an 18-point cross-section swept tail->nose.  The maroon
    stripe bands, the dark wheel-arch shadows and the dark underbody are all
    band materials on that loft — zero extra geometry.
  - Camper windows are PROUD assemblies (frame + glass + pleated curtain sitting
    0.04 outboard of the wall).  No hole in the hull, so every curtained window
    is self-sealing.  Only the cab has REAL openings: the windshield lives in the
    hand-built nose cap, and one slider per cab side is cut out of the loft
    (skip faces) and sealed with jamb returns + a glass pane.
  - Curtains are folded zigzags (trailer-home-a's trick): flat shading turns each
    fold into a light/dark band for free.  One material, no texture.
  - baseColorFactor is LINEAR and renders ~1.5x lighter than the tuple reads.
    All colours below were judged rendered.  Everything flat-shaded, no bevels.
"""

import bpy
import bmesh
import math

# ---------------------------------------------------------------------------
# PARAMETERS — everything tunable lives here.
# ---------------------------------------------------------------------------

NAME = "winnebago"
TRI_BUDGET = 2000
OUT_GLB = "/Users/ledogen/CodeShit/CarGame/assets/models/winnebago.glb"
OUT_BLEND = "/Users/ledogen/CodeShit/CarGame/assets/models/src/winnebago.blend"

# Real Chieftain 27DB is 27 ft; ticket says 8.0 x 2.4 x 3.2 m.  Bumper faces land
# exactly on +/-4.0 so the collision box in the ticket stays honest.
BODY_NOSE, BODY_TAIL = 3.92, -3.94     # cap base planes (bumpers add the last 6-8 cm)
HALF_W = 1.20
Z_SKIRT = 0.42                          # hull bottom
Z_SHOULDER = 2.60                       # where the roof chamfer starts
Z_ROOF = 2.92
ROOF_HALF_W = 1.00                      # roof deck half width after the chamfer

# Stripe cluster (from ref-01: one thick maroon band low, one thin above a gap)
Z_THICK0, Z_THICK1 = 0.92, 1.10
Z_THIN0, Z_THIN1 = 1.18, 1.24
Z_RIB = 1.42                            # corrugation hint: one jogged loop between
RIB_INSET = 0.007                       # the stripes and the sills, x pulled in a hair
Z_SILL = 1.72                           # cab window sill; camper sills sit above this

# Axles / wheels.  Front axle well back from the nose — that is the Class-A
# look.  Rear axle corrected 2026-08-14 against the profile photo: the P30
# chassis clusters both axles forward (~3.7 m wheelbase) and drags a ~2.9 m
# rear overhang — the wheels sit under the MIDDLE of the coach, not the tail.
AX_F, AX_R = 2.68, -1.075
# REAL wheel-well openings (2026-08-14): the skirt band (0.42..0.92) is cut out
# over these spans and lined with a dark pocket.  Each span must clear the
# 0.80 m tyre diameter or the tyre pokes through the well end walls.
ARCH_F = (2.20, 3.16)
ARCH_R = (-1.55, -0.60)
WELL_X = 0.80                           # pocket inner wall |x|
WELL_TOP = 0.92                         # pocket ceiling = skirt band top
ARCH_RAD = 0.44                         # radiused arch opening (tyre 0.40 + gap)
ARCH_SEG = 6                            # semicircle facets — the faceting is the look
LIP_W, LIP_PROUD = 0.05, 0.012          # fender molding around the arch edge
TRACK = 1.02
WHEEL_R, HUB_R, WHEEL_W, WHEEL_SEG = 0.40, 0.16, 0.26, 10

# Cab glazing (photo-measured 2026-08-14: the slider sits further back and
# larger than first guessed — glass from y 2.40 nearly to the A-pillar)
CAB_WIN = (2.40, 3.45)                  # real opening, both sides, Z_SILL..Z_SHOULDER

# --- Shaped nose (2026-08-14: "still just a rectangle — add a shaped cab") ---
# The Chieftain front cap is not a slab: the body tapers in plan toward the
# nose, the BELTLINE is the proudest line (the brow), the windshield rakes BACK
# above it and the lower fascia tucks back below it, and the header rakes hard
# into the roof.  Implemented as two extra loft stations (keeping the stripe
# band materials and welding for free) + a contoured cap built strip-by-strip.
# PROFILE RULING (2026-08-15, after one rejected attempt): the brow stays AT
# THE BELTLINE (z 1.62) and the face is CONVEX around it — a "low peak above
# the bumper" variant caved the whole face in and was thrown out on sight.
# To steepen, drag the BROW VERTEX forward (it sits at y 4.00, flush with the
# bumper face, so overall length holds 8.0) — never pull the peak downward.
# Windshield ~26 deg, fascia lean ~16 deg, and NO loft folds: every rim point
# stays ahead of station A, which stays ahead of the straight hull at 3.45.
# Brow at +0.07 (y 3.99), a hair behind the bumper face: the wipers and W
# flash ride the cap surface proud, and at +0.08 they poked past y 4.0 and
# broke the 8.0 m length assert.
# EVERY kink z in this table MUST be a _SIDE_R ring level: the cap is built
# from ring samples, so an off-level kink gets chorded across and the built
# surface diverges from cap_y()/tail_y() — surface-riding details then float
# or clip (the rear curtain grew cream spikes exactly that way).
NOSE_BROW = [(0.42, -0.26), (1.72, 0.07),
             (2.60, -0.36), (2.92, -0.42)]   # (z, y offset from the cap base)
NOSE_ST = [(3.72, 0.50, 0.975),              # (y base, brow fraction, plan scale)
           (3.92, 1.00, 0.885)]              # cap rim: brow lands on y 4.00
WS_X = 0.92                             # windshield opening half width (on the cap)
WS_Z0, WS_Z1 = 1.72, 2.60               # sill..shoulder, glazed in the raked plane
WS_INSET = 0.035                        # glass sits this far behind the cap plane

# --- Shaped tail: the SAME brow-at-beltline shape as the nose, gentler (user
# 2026-08-15, per ref-02): rearmost line at z 1.62, skirt tucking under below
# it, upper face leaning forward above it into the roof curl.  Positive
# offsets pull the cap forward, so the tail never crosses y = BODY_TAIL.  The
# rear window zone (1.62..2.35) leans ~5 deg; curtain_window_tail plants
# itself on the AVERAGE surface there.
TAIL_BROW = [(0.42, 0.16), (0.70, 0.12), (1.72, 0.00),
             (2.60, 0.10), (2.92, 0.24)]    # kinks on ring levels only
TAIL_ST = [(-3.94, 1.00, 0.960),        # cap rim (built first — loft runs tail->nose)
           (-3.76, 0.50, 0.990)]
TAIL_N = len(TAIL_ST)                   # rings prepended before the straight hull

# Camper windows (y0, y1, z0, z1) per side.  Curtained + proud, no hull holes.
# Positions MEASURED off the profile photo (220 px/m): bedroom window at the
# tail, then a LONG blank panel (bathroom + fridge), a window over the rear
# wheel, a tall lower-silled window hard against the door, and a small one
# between door and cab.
WINDOWS_R = [(-3.60, -2.55, 1.62, 2.35),   # bedroom
             (-0.78, -0.12, 1.62, 2.35),   # over the rear wheel
             (0.42, 0.82, 1.35, 2.35),     # tall, drops below the others
             (1.70, 2.16, 1.62, 2.35)]     # small, door-to-cab
WINDOWS_L = [(-3.60, -2.55, 1.62, 2.35),
             (-0.78, -0.12, 1.62, 2.35),
             (0.42, 0.82, 1.35, 2.35),
             (1.20, 2.16, 1.62, 2.35)]     # wider — no door on this side
WIN_FRAME = 0.045                       # frame border around the opening
# Curtain depth ruling (2026-08-15): the pleats were pressed against the glass
# with a 10 mm swing and read as wallpaper.  Deepening must move them AWAY
# from the glass only — the deep creases drop to the wall surface and the
# GLASS moved outboard to open the gap; the crests never chased it.
WIN_DEPTH = 0.050                       # how proud the frame face sits
CURT_LO, CURT_HI = 0.002, 0.024         # pleat zigzag depths (outboard of wall)
GLASS_OFF = 0.044                       # pane depth (recessed behind the frame face)
PLEAT_W = 0.11                          # a fold roughly every 11 cm

# Entry door (curbside, +X), with its own curtained window (photo: y 0.93-1.54)
DOOR_Y0, DOOR_Y1 = 0.93, 1.55
DOOR_Z0, DOOR_Z1 = 0.46, 2.42
DOOR_PROUD = 0.012
DOOR_WIN = (1.05, 1.45, 1.62, 2.20)

# Rolled awning, door side
AWN_Y0, AWN_Y1 = -2.45, 2.32
AWN_Z, AWN_R = 2.51, 0.065
AWN_ARM_Y = (-2.30, 2.24)               # on blank wall between window frames
AWN_ARM_Z0 = 1.40

# Luggage bays (proud body-colour panels, curbside, below the stripes) —
# one in the long rear overhang, one between the axles.
BAYS_R = [(-3.35, -2.35), (-0.30, 0.50)]
BAY_Z0, BAY_Z1 = 0.50, 0.86

# Roof kit
AC_Y0, AC_Y1 = -1.65, -0.95
AC_HALF_W, AC_TOP_Z = 0.48, 3.14
VENT = (-0.16, 0.16, 0.72, 1.04, 2.92, 3.02)   # x0,x1,y0,y1,z0,z1

# Cab interior (all near-black except the velour chairs)
FLOOR_Z0, FLOOR_Z1 = 0.82, 0.88
SEAT_X = 0.60                           # chair centreline |x|
WHEEL_TILT = math.radians(35.0)
# Hub raised so the rim breaks the 1.72 sill: a bus wheel is VISIBLE through the
# windshield (ref-04), and below the sill the whole cab reads unoccupied.
SW_C = (-SEAT_X, 3.50, 1.60)            # steering wheel hub
SW_RO, SW_RI, SW_TH = 0.19, 0.14, 0.03

# Front fascia (ref-01: headlights LOW beside a low grille, stripes wrapping the
# nose, the flying-W flash above them)
GRILLE = (0.55, 0.70, 0.90)             # half w, z0, z1
# Kept inside the tapered cap rim (|x| = 1.062) — wider boxes float clear of
# the corner transition surface and read as detached slabs from the side.
HEADLIGHT_X = (0.66, 0.98)
HEADLIGHT_Z = (0.72, 0.94)
MARKER_X, MARKER_Z = (0.88, 1.00), (1.44, 1.52)
WFLASH_HW, WFLASH_Z0, WFLASH_Z1, WFLASH_TH = 0.70, 1.30, 1.55, 0.10
BUMPER_Z0, BUMPER_Z1 = 0.44, 0.66
TAILLIGHT_X, TAILLIGHT_Z = (0.93, 1.08), (0.70, 0.88)   # cream gap between
                                                        # bumper top and stripes

MATS = {
    #  name          base colour (linear)           rough  alpha
    "RVBody":     ((0.700, 0.665, 0.560, 1.0), 0.85, 1.0),
    "RVStripe":   ((0.170, 0.028, 0.048, 1.0), 0.70, 1.0),  # also the taillights
    "RVTrim":     ((0.360, 0.365, 0.375, 1.0), 0.45, 1.0),
    "RVDark":     ((0.030, 0.030, 0.032, 1.0), 0.90, 1.0),  # wells, tyres, interior
    "RVCurtain":  ((0.430, 0.260, 0.215, 1.0), 0.95, 1.0),  # pleats + rolled awning
    "RVSeat":     ((0.165, 0.050, 0.068, 1.0), 0.95, 1.0),  # maroon velour —
    # brighter than broken-car's tub logic suggests: these chairs sit behind
    # 0.45 glass, not 0.72, and at 0.13 they vanished into the void.
    "RVSignal":   ((0.750, 0.280, 0.030, 1.0), 0.40, 1.0),
    # Lighter than broken-car's 0.72: these panes sit OVER the curtains and the
    # cab interior, and at 0.72 the pleats black out entirely.  0.45 keeps a
    # glassy tint while letting what's behind carry the read.
    "RVGlass":    ((0.024, 0.032, 0.036, 1.0), 0.32, 0.45),
}

# ---------------------------------------------------------------------------
# Geometry accumulator (identical machinery to broken-car.py)
# ---------------------------------------------------------------------------
class Part:
    def __init__(self, name):
        self.name = name
        self.v = []
        self.f = []
        self.m = []

    def add(self, verts, faces, mat):
        o = len(self.v)
        self.v.extend(verts)
        for fc in faces:
            self.f.append([i + o for i in fc])
            self.m.append(mat)


def box(part, x0, x1, y0, y1, z0, z1, mat):
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
         (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    f = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4],
         [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
    part.add(v, f, mat)


def hexa(part, pts, mat):
    """Free-form box from 8 points: 0-3 bottom loop, 4-7 top loop (same order)."""
    f = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4],
         [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
    part.add(pts, f, mat)


def quad(part, a, b, c, d, mat):
    part.add([a, b, c, d], [[0, 1, 2, 3]], mat)


def loft(part, rings, mat, cap_first=True, cap_last=True, band_mats=None, skip=None):
    """Closed-section tube between equal-length rings; see broken-car.py.

    band_mats: callable (segment, k) -> material-or-None.
    skip: callable (segment, k) -> True drops that face (cuts an opening).
    Self-orienting by signed volume when both caps are present.
    """
    n = len(rings[0])
    verts = [p for r in rings for p in r]
    faces, mats = [], []
    for s in range(len(rings) - 1):
        a, b = s * n, (s + 1) * n
        for k in range(n):
            if skip and skip(s, k):
                continue
            k2 = (k + 1) % n
            faces.append([a + k, a + k2, b + k2, b + k])
            if callable(band_mats):
                mats.append(band_mats(s, k) or mat)
            else:
                mats.append((band_mats or {}).get(k, mat))
    if cap_first:
        faces.append(list(range(n - 1, -1, -1)))
        mats.append(mat)
    if cap_last:
        o = (len(rings) - 1) * n
        faces.append([o + k for k in range(n)])
        mats.append(mat)
    if cap_first and cap_last:
        vol = 0.0
        for fc in faces:
            for i in range(1, len(fc) - 1):
                a, b, c = verts[fc[0]], verts[fc[i]], verts[fc[i + 1]]
                vol += (a[0] * (b[1] * c[2] - b[2] * c[1])
                        - a[1] * (b[0] * c[2] - b[2] * c[0])
                        + a[2] * (b[0] * c[1] - b[1] * c[0]))
        if vol < 0.0:
            faces = [list(reversed(fc)) for fc in faces]

    o = len(part.v)
    part.v.extend(verts)
    for fc, fm in zip(faces, mats):
        part.f.append([i + o for i in fc])
        part.m.append(fm)


# ---------------------------------------------------------------------------
# Hull: one 18-point section, swept along the stations
# ---------------------------------------------------------------------------
# Right side bottom->top, then mirrored.  The RIB point jogs inboard so flat
# shading draws one horizontal siding line between the stripes and the sills.
_SIDE_R = [(HALF_W, Z_SKIRT), (HALF_W, 0.70), (HALF_W, Z_THICK0),
           (HALF_W, Z_THICK1), (HALF_W, Z_THIN0), (HALF_W, Z_THIN1),
           (HALF_W - RIB_INSET, Z_RIB), (HALF_W, Z_SILL),
           (HALF_W, Z_SHOULDER), (ROOF_HALF_W, Z_ROOF)]
# The z=0.70 level exists ONLY so the end caps can sample the profile PEAK —
# both brow tables put their forwardmost point there; without a ring level the
# loft would chord straight across it and the traced angles would vanish.

RING = ([(-HALF_W, Z_SKIRT)] + _SIDE_R
        + [(-x, z) for (x, z) in reversed(_SIDE_R)][:-1])
# RING[0] = bottom-left; faces k span RING[k] -> RING[k+1].
N_RING = len(RING)

# Straight-hull stations only; shaped tail rings are prepended and shaped nose
# rings appended around these.
STATIONS = [-3.55, ARCH_R[0], ARCH_R[1], ARCH_F[0], CAB_WIN[0],
            ARCH_F[1], CAB_WIN[1]]
assert all(a < b for a, b in zip(STATIONS, STATIONS[1:])), STATIONS


def _piecewise(pts, z):
    if z <= pts[0][0]:
        return pts[0][1]
    for (z0, d0), (z1, d1) in zip(pts, pts[1:]):
        if z <= z1:
            return d0 + (d1 - d0) * (z - z0) / (z1 - z0)
    return pts[-1][1]


def brow(z):
    """Nose profile: y offset of the cap at height z (piecewise linear)."""
    return _piecewise(NOSE_BROW, z)


def tbrow(z):
    """Tail profile: forward pull of the rear cap at height z."""
    return _piecewise(TAIL_BROW, z)


def nose_ring(y_base, frac, scale):
    """A hull ring squeezed in plan and pushed along +Y by the brow profile."""
    return [(x * scale, y_base + frac * brow(z), z) for (x, z) in RING]


def tail_ring(y_base, frac, scale):
    return [(x * scale, y_base + frac * tbrow(z), z) for (x, z) in RING]


def cap_y(z):
    """Y of the finished nose cap surface at height z."""
    return NOSE_ST[-1][0] + brow(z)


def tail_y(z):
    """Y of the finished tail cap surface at height z."""
    return TAIL_ST[0][0] + tbrow(z)


def _face_zx(k):
    (x0, z0), (x1, z1) = RING[k], RING[(k + 1) % N_RING]
    return (z0 + z1) * 0.5, min(abs(x0), abs(x1))


def _is_side(k):
    _, ax = _face_zx(k)
    return ax > HALF_W - 0.05


def _seg_span(s):
    return STATIONS[s], STATIONS[s + 1]


def hull_band(s, k):
    z, _ = _face_zx(k)
    if k == 0:
        return "RVDark"                       # underbody, sits the mass down
    if not _is_side(k):
        return None
    if Z_THICK0 - 0.01 < z < Z_THICK1 + 0.01:
        return "RVStripe"
    if Z_THIN0 - 0.01 < z < Z_THIN1 + 0.01:
        return "RVStripe"
    return None


def hull_skip(s, k):
    """Cut the real openings out of the hull walls: the two cab sliders
    (CAB_WIN span, sill..shoulder) and the four wheel-arch mouths (arch spans,
    skirt band).  Within-span, not exact-span: the cab-window and arch edges
    interleave, so an arch can straddle two segments."""
    s2 = s - TAIL_N                           # tail/nose segments carry no openings
    if not (0 <= s2 < len(STATIONS) - 1):
        return False
    y0, y1 = _seg_span(s2)
    in_arch = any(y0 >= a0 - 0.01 and y1 <= a1 + 0.01
                  for a0, a1 in (ARCH_F, ARCH_R))
    # k=0 is the underbody (it PASSES the _is_side test — both endpoints at
    # |x|=HALF_W — so it needs its own branch).  Across the arch spans the
    # full-width floor is dropped DELIBERATELY: it used to slice through the
    # wheel centres.  build_wells puts back a centre strip between the pockets.
    if k == 0:
        return in_arch
    if not _is_side(k):
        return False
    z, _ = _face_zx(k)
    if Z_SILL - 0.01 < z < Z_SHOULDER + 0.01:
        return y0 >= CAB_WIN[0] - 0.01 and y1 <= CAB_WIN[1] + 0.01
    if Z_SKIRT - 0.01 < z < WELL_TOP + 0.01:
        return in_arch
    return False


def build_hull(p):
    rings = [tail_ring(*st) for st in TAIL_ST]
    rings += [[(x, y, z) for (x, z) in RING] for y in STATIONS]
    rings += [nose_ring(*st) for st in NOSE_ST]

    def band(s, k):
        m = hull_band(s, k)
        return "RVDark" if m == "RVWellDark" else m

    loft(p, rings, "RVBody", cap_first=False, cap_last=False,
         band_mats=band, skip=hull_skip)

    # Seal the cab sliders: jamb returns from the wall in to the glass plane.
    gx = HALF_W - 0.045
    y0, y1 = CAB_WIN
    z0, z1 = Z_SILL, Z_SHOULDER
    for sgn in (1, -1):
        w, g = sgn * HALF_W, sgn * gx
        quad(p, (w, y0, z1), (w, y1, z1), (g, y1, z1), (g, y0, z1), "RVBody")
        quad(p, (w, y0, z0), (w, y1, z0), (g, y1, z0), (g, y0, z0), "RVBody")
        quad(p, (w, y0, z0), (w, y0, z1), (g, y0, z1), (g, y0, z0), "RVBody")
        quad(p, (w, y1, z0), (w, y1, z1), (g, y1, z1), (g, y1, z0), "RVBody")


# ---------------------------------------------------------------------------
# Nose cap: contoured Class-A face closing the shaped rim
# ---------------------------------------------------------------------------
def build_nose(p, g):
    """Cap the last nose ring with horizontal strips following the brow profile.

    The rim ring already carries the shaping (taper + brow), so each strip is a
    single quad between consecutive rim z-levels; the stripe bands land on the
    cap as MATERIALS on those strips, exactly like the hull loft does it.  The
    windshield strip is replaced by jambs + an inset raked glass plane.
    """
    _, _, scale = NOSE_ST[-1]
    n_side = len(_SIDE_R)                          # rim indices 1..n_side (right)
    rim = [(x * scale, cap_y(z), z) for (x, z) in _SIDE_R]

    strip_mat = {(Z_THICK0, Z_THICK1): "RVStripe", (Z_THIN0, Z_THIN1): "RVStripe"}
    for i in range(n_side - 1):
        (x0, y0, z0), (x1, y1, z1) = rim[i], rim[i + 1]
        if abs(z0 - WS_Z0) < 0.01 and abs(z1 - WS_Z1) < 0.01:
            continue                               # glazed separately below
        quad(p, (-x0, y0, z0), (x0, y0, z0), (x1, y1, z1), (-x1, y1, z1),
             strip_mat.get((z0, z1), "RVBody"))

    # Windshield: jamb panels out to the rim, returns into the raked glass.
    xw = HALF_W * scale
    yb, yt = cap_y(WS_Z0), cap_y(WS_Z1)
    for sgn in (1, -1):
        quad(p, (sgn * WS_X, yb, WS_Z0), (sgn * xw, yb, WS_Z0),
             (sgn * xw, yt, WS_Z1), (sgn * WS_X, yt, WS_Z1), "RVBody")
    # Outward normal of the raked plane (in the YZ plane).
    import mathutils
    t = mathutils.Vector((0.0, yt - yb, WS_Z1 - WS_Z0)).normalized()
    nrm = mathutils.Vector((0.0, t.z, -t.y))       # rotated -90°: points +Y/out
    gb = (yb + nrm.y * -WS_INSET, WS_Z0 + nrm.z * -WS_INSET)
    gt = (yt + nrm.y * -WS_INSET, WS_Z1 + nrm.z * -WS_INSET)
    quad(p, (-WS_X, yb, WS_Z0), (WS_X, yb, WS_Z0),
         (WS_X, gb[0], gb[1]), (-WS_X, gb[0], gb[1]), "RVBody")   # sill return
    quad(p, (-WS_X, yt, WS_Z1), (WS_X, yt, WS_Z1),
         (WS_X, gt[0], gt[1]), (-WS_X, gt[0], gt[1]), "RVBody")   # header return
    for sgn in (1, -1):
        x = sgn * WS_X
        quad(p, (x, yb, WS_Z0), (x, yt, WS_Z1),
             (x, gt[0], gt[1]), (x, gb[0], gb[1]), "RVBody")      # jamb returns
    quad(p, (-0.025, gb[0] + 0.004, gb[1]), (0.025, gb[0] + 0.004, gb[1]),
         (0.025, gt[0] + 0.004, gt[1]), (-0.025, gt[0] + 0.004, gt[1]), "RVBody")
    for x0, x1 in ((-WS_X, -0.025), (0.025, WS_X)):
        quad(g, (x0, gb[0], gb[1]), (x1, gb[0], gb[1]),
             (x1, gt[0], gt[1]), (x0, gt[0], gt[1]), "RVGlass")

    # Wipers parked on the sill area, both leaning right (GM style),
    # following the cap surface.
    for x0 in (-0.86, 0.10):
        quad(p, (x0, cap_y(1.630) + 0.008, 1.630),
             (x0 + 0.58, cap_y(1.685) + 0.008, 1.685),
             (x0 + 0.58, cap_y(1.713) + 0.008, 1.713),
             (x0, cap_y(1.658) + 0.008, 1.658), "RVDark")

    # Fascia furniture, proud of the contoured cap.
    quad(p, (-GRILLE[0], cap_y(GRILLE[1]) + 0.006, GRILLE[1]),
         (GRILLE[0], cap_y(GRILLE[1]) + 0.006, GRILLE[1]),
         (GRILLE[0], cap_y(GRILLE[2]) + 0.006, GRILLE[2]),
         (-GRILLE[0], cap_y(GRILLE[2]) + 0.006, GRILLE[2]), "RVDark")
    hz0, hz1 = HEADLIGHT_Z
    hc0, hc1 = sorted((cap_y(hz0), cap_y(hz1)))   # fascia slope flips sign
    mc0, mc1 = sorted((cap_y(MARKER_Z[0]), cap_y(MARKER_Z[1])))
    for sgn in (1, -1):
        x0, x1 = sorted((sgn * HEADLIGHT_X[0], sgn * HEADLIGHT_X[1]))
        box(p, x0, x1, hc0 - 0.01, hc1 + 0.02, hz0, hz1, "RVTrim")
        m0, m1 = sorted((sgn * MARKER_X[0], sgn * MARKER_X[1]))
        box(p, m0, m1, mc0 - 0.005, mc1 + 0.020, MARKER_Z[0], MARKER_Z[1],
            "RVSignal")
    # Narrower than the tail bumper: the nose rim tapers to |x|=1.062, and a
    # full-width blade left 17 cm of bumper hanging past the shaped corner.
    # Back edge buried deep: the fascia rakes to y~3.67 at bumper height.
    box(p, -1.14, 1.14, 3.60, 4.00, BUMPER_Z0, BUMPER_Z1, "RVTrim")

    # Flying-W flash on the belt panel, hugging the surface.
    z0, z1, th = WFLASH_Z0, WFLASH_Z1, WFLASH_TH
    for sgn in (1, -1):
        quad(p, (0.0, cap_y(z0) + 0.006, z0),
             (sgn * WFLASH_HW, cap_y(z1) + 0.006, z1),
             (sgn * WFLASH_HW, cap_y(z1 + th) + 0.006, z1 + th),
             (0.0, cap_y(z0 + th) + 0.006, z0 + th), "RVStripe")


def build_tail(p):
    """Contoured rear cap: same strip technique as the nose, mirrored."""
    _, _, scale = TAIL_ST[0]
    rim = [(x * scale, tail_y(z), z) for (x, z) in _SIDE_R]

    strip_mat = {(Z_THICK0, Z_THICK1): "RVStripe", (Z_THIN0, Z_THIN1): "RVStripe"}
    for i in range(len(rim) - 1):
        (x0, y0, z0), (x1, y1, z1) = rim[i], rim[i + 1]
        quad(p, (x0, y0, z0), (-x0, y0, z0), (-x1, y1, z1), (x1, y1, z1),
             strip_mat.get((z0, z1), "RVBody"))

    # Rear bumper, buried into the departure tuck.
    box(p, -1.19, 1.19, -4.00, -3.80, BUMPER_Z0, BUMPER_Z1, "RVTrim")
    # Taillights: surface-hugging proud quads below the stripe cluster.
    for sgn in (1, -1):
        x0, x1 = sorted((sgn * TAILLIGHT_X[0], sgn * TAILLIGHT_X[1]))
        quad(p, (x0, tail_y(TAILLIGHT_Z[0]) - 0.008, TAILLIGHT_Z[0]),
             (x1, tail_y(TAILLIGHT_Z[0]) - 0.008, TAILLIGHT_Z[0]),
             (x1, tail_y(TAILLIGHT_Z[1]) - 0.008, TAILLIGHT_Z[1]),
             (x0, tail_y(TAILLIGHT_Z[1]) - 0.008, TAILLIGHT_Z[1]), "RVStripe")


# ---------------------------------------------------------------------------
# Curtained windows (proud, self-sealing) + entry door
# ---------------------------------------------------------------------------
def curtain_window(p, g, sgn, y0, y1, z0, z1, wall=HALF_W):
    """Frame + closed pleated curtain + glass, all outboard of the wall."""
    fy0, fy1 = y0 - WIN_FRAME, y1 + WIN_FRAME
    fz0, fz1 = z0 - WIN_FRAME, z1 + WIN_FRAME
    wf = sgn * (wall + WIN_DEPTH)
    w0 = sgn * wall

    # Perimeter return band (the protruding box's outer wall).
    quad(p, (w0, fy0, fz0), (w0, fy1, fz0), (wf, fy1, fz0), (wf, fy0, fz0), "RVTrim")
    quad(p, (w0, fy0, fz1), (w0, fy1, fz1), (wf, fy1, fz1), (wf, fy0, fz1), "RVTrim")
    quad(p, (w0, fy0, fz0), (w0, fy0, fz1), (wf, fy0, fz1), (wf, fy0, fz0), "RVTrim")
    quad(p, (w0, fy1, fz0), (w0, fy1, fz1), (wf, fy1, fz1), (wf, fy1, fz0), "RVTrim")
    # Frame face strips around the opening.
    quad(p, (wf, fy0, fz0), (wf, fy1, fz0), (wf, fy1, z0), (wf, fy0, z0), "RVTrim")
    quad(p, (wf, fy0, z1), (wf, fy1, z1), (wf, fy1, fz1), (wf, fy0, fz1), "RVTrim")
    quad(p, (wf, fy0, z0), (wf, y0, z0), (wf, y0, z1), (wf, fy0, z1), "RVTrim")
    quad(p, (wf, y1, z0), (wf, fy1, z0), (wf, fy1, z1), (wf, y1, z1), "RVTrim")

    # Closed pleats: zigzag across the full opening (a touch oversize).
    cy0, cy1, cz0, cz1 = y0 - 0.02, y1 + 0.02, z0 - 0.02, z1 + 0.02
    n = max(4, int(round((cy1 - cy0) / PLEAT_W)))
    base = len(p.v)
    for i in range(n + 1):
        t = i / n
        yy = cy0 + (cy1 - cy0) * t
        d = CURT_LO if (i % 2 == 0) else CURT_HI
        xx = sgn * (wall + d)
        p.v.append((xx, yy, cz0))
        p.v.append((xx, yy, cz1))
    for i in range(n):
        a = base + 2 * i
        p.f.append([a, a + 2, a + 3, a + 1])
        p.m.append("RVCurtain")

    # Glass pane, recessed behind the frame face.
    gx = sgn * (wall + GLASS_OFF)
    quad(g, (gx, y0, z0), (gx, y1, z0), (gx, y1, z1), (gx, y0, z1), "RVGlass")


def curtain_window_tail(p, g, x0, x1, z0, z1):
    """Same proud frame + pleats + glass, on the tail face (normal -Y).

    The tail cap LEANS (see TAIL_BROW), so every element is offset from the
    local surface tail_y(z) rather than from one flat plane — a flat-plane
    build had the leaning wall crossing the curtain (pleats clipped through
    the cream cap at the window's bottom) and the crests breaking the glass
    where the gap narrowed."""
    def sy(z, d):
        return tail_y(z) - d           # d outboard of the local surface

    fx0, fx1 = x0 - WIN_FRAME, x1 + WIN_FRAME
    fz0, fz1 = z0 - WIN_FRAME, z1 + WIN_FRAME

    # Perimeter return band, then frame face strips — all tilted with the cap.
    quad(p, (fx0, sy(fz0, 0), fz0), (fx1, sy(fz0, 0), fz0),
         (fx1, sy(fz0, WIN_DEPTH), fz0), (fx0, sy(fz0, WIN_DEPTH), fz0), "RVTrim")
    quad(p, (fx0, sy(fz1, 0), fz1), (fx1, sy(fz1, 0), fz1),
         (fx1, sy(fz1, WIN_DEPTH), fz1), (fx0, sy(fz1, WIN_DEPTH), fz1), "RVTrim")
    for fx in (fx0, fx1):
        quad(p, (fx, sy(fz0, 0), fz0), (fx, sy(fz1, 0), fz1),
             (fx, sy(fz1, WIN_DEPTH), fz1), (fx, sy(fz0, WIN_DEPTH), fz0), "RVTrim")
    quad(p, (fx0, sy(fz0, WIN_DEPTH), fz0), (fx1, sy(fz0, WIN_DEPTH), fz0),
         (fx1, sy(z0, WIN_DEPTH), z0), (fx0, sy(z0, WIN_DEPTH), z0), "RVTrim")
    quad(p, (fx0, sy(z1, WIN_DEPTH), z1), (fx1, sy(z1, WIN_DEPTH), z1),
         (fx1, sy(fz1, WIN_DEPTH), fz1), (fx0, sy(fz1, WIN_DEPTH), fz1), "RVTrim")
    for fa, fb in ((fx0, x0), (x1, fx1)):
        quad(p, (fa, sy(z0, WIN_DEPTH), z0), (fb, sy(z0, WIN_DEPTH), z0),
             (fb, sy(z1, WIN_DEPTH), z1), (fa, sy(z1, WIN_DEPTH), z1), "RVTrim")

    cx0, cx1, cz0, cz1 = x0 - 0.02, x1 + 0.02, z0 - 0.02, z1 + 0.02
    n = max(4, int(round((cx1 - cx0) / PLEAT_W)))
    base = len(p.v)
    for i in range(n + 1):
        t = i / n
        xx = cx0 + (cx1 - cx0) * t
        d = CURT_LO if (i % 2 == 0) else CURT_HI
        p.v.append((xx, sy(cz0, d), cz0))
        p.v.append((xx, sy(cz1, d), cz1))
    for i in range(n):
        a = base + 2 * i
        p.f.append([a, a + 2, a + 3, a + 1])
        p.m.append("RVCurtain")

    quad(g, (x0, sy(z0, GLASS_OFF), z0), (x1, sy(z0, GLASS_OFF), z0),
         (x1, sy(z1, GLASS_OFF), z1), (x0, sy(z1, GLASS_OFF), z1), "RVGlass")


def build_door(p, g):
    """Curbside entry door: proud panel + curtained window + handle."""
    box(p, HALF_W, HALF_W + DOOR_PROUD, DOOR_Y0, DOOR_Y1,
        DOOR_Z0, DOOR_Z1, "RVBody")
    y0, y1, z0, z1 = DOOR_WIN
    curtain_window(p, g, 1, y0, y1, z0, z1, wall=HALF_W + DOOR_PROUD)
    # The stripe bands carry on across the door (ref-01).
    xd = HALF_W + DOOR_PROUD + 0.004
    for b0, b1 in ((Z_THICK0, Z_THICK1), (Z_THIN0, Z_THIN1)):
        quad(p, (xd, DOOR_Y0, b0), (xd, DOOR_Y1, b0),
             (xd, DOOR_Y1, b1), (xd, DOOR_Y0, b1), "RVStripe")
    # Aluminium door frame riding OVER the vinyl: the surround seam is what
    # makes the door read as a door and not a decal panel.
    xf = xd + 0.001
    fw = 0.03
    for (y0, y1, z0, z1) in ((DOOR_Y0, DOOR_Y0 + fw, DOOR_Z0, DOOR_Z1),
                             (DOOR_Y1 - fw, DOOR_Y1, DOOR_Z0, DOOR_Z1),
                             (DOOR_Y0, DOOR_Y1, DOOR_Z1 - fw, DOOR_Z1),
                             (DOOR_Y0, DOOR_Y1, DOOR_Z0, DOOR_Z0 + fw)):
        quad(p, (xf, y0, z0), (xf, y1, z0), (xf, y1, z1), (xf, y0, z1), "RVTrim")
    box(p, HALF_W + DOOR_PROUD, HALF_W + DOOR_PROUD + 0.020,
        DOOR_Y0 + 0.05, DOOR_Y0 + 0.11, 1.28, 1.42, "RVTrim")


def build_bays(p):
    for y0, y1 in BAYS_R:
        box(p, HALF_W, HALF_W + 0.008, y0, y1, BAY_Z0, BAY_Z1, "RVBody")


# ---------------------------------------------------------------------------
# Cab glass + interior
# ---------------------------------------------------------------------------
def build_glass(g):
    """Cab sliders.  The windshield lives in build_nose, camper panes in the
    window builders."""
    gx = HALF_W - 0.043
    y0, y1 = CAB_WIN
    for sgn in (1, -1):
        x = sgn * gx
        quad(g, (x, y0, Z_SILL), (x, y1, Z_SILL),
             (x, y1, Z_SHOULDER), (x, y0, Z_SHOULDER), "RVGlass")


def build_slider_trim(p):
    """Vertical divider mid-slider so the cab windows read as sliders."""
    ym = (CAB_WIN[0] + CAB_WIN[1]) * 0.5
    for sgn in (1, -1):
        x0, x1 = sorted((sgn * (HALF_W - 0.055), sgn * (HALF_W - 0.035)))
        box(p, x0, x1, ym - 0.02, ym + 0.02, Z_SILL, Z_SHOULDER, "RVTrim")


def build_interior(p):
    x = HALF_W - 0.04
    # Floor stops at 3.72: the raked fascia surface is at y~3.80 down at floor
    # height, and a 3.88 slab poked straight through the nose.
    box(p, -x, x, 2.36, 3.72, FLOOR_Z0, FLOOR_Z1, "RVDark")          # cab floor
    box(p, -0.26, 0.26, 2.75, 3.62, FLOOR_Z1, 1.26, "RVDark")        # doghouse
    box(p, -x + 0.02, x - 0.02, 3.62, 3.86, 1.28, 1.58, "RVDark")    # dash
    # (cap surface is ~3.99 at dash height with the brow at the beltline)
    # Partition narrower than the floor: at its 2.68 top the roof chamfer is
    # already in to x=1.15, and a ±1.16 slab poked a dark corner through it.
    box(p, -1.13, 1.13, 2.30, 2.36, 0.86, 2.68, "RVDark")            # partition

    # Captain chairs, maroon velour.  Backs deliberately break the 1.72 beltline
    # (the broken-car sightline rule: below the belt, a cabin reads as empty).
    recl = math.tan(math.radians(10.0))          # backs recline 10 deg
    for sgn in (1, -1):
        cx = sgn * SEAT_X
        box(p, cx - 0.20, cx + 0.20, 3.10, 3.28, FLOOR_Z1, 1.08, "RVDark")   # pedestal
        box(p, cx - 0.24, cx + 0.24, 2.98, 3.44, 1.06, 1.26, "RVSeat")
        sh = 0.70 * recl                          # shear at the back's top
        hexa(p, [(cx - 0.24, 2.92, 1.26), (cx + 0.24, 2.92, 1.26),
                 (cx + 0.24, 3.02, 1.26), (cx - 0.24, 3.02, 1.26),
                 (cx - 0.24, 2.92 - sh, 1.96), (cx + 0.24, 2.92 - sh, 1.96),
                 (cx + 0.24, 3.02 - sh, 1.96), (cx - 0.24, 3.02 - sh, 1.96)],
             "RVSeat")
        hh = sh + 0.18 * recl                     # headrest continues the lean
        hexa(p, [(cx - 0.15, 2.90 - sh, 1.96), (cx + 0.15, 2.90 - sh, 1.96),
                 (cx + 0.15, 3.00 - sh, 1.96), (cx - 0.15, 3.00 - sh, 1.96),
                 (cx - 0.15, 2.90 - hh, 2.14), (cx + 0.15, 2.90 - hh, 2.14),
                 (cx + 0.15, 3.00 - hh, 2.14), (cx - 0.15, 3.00 - hh, 2.14)],
             "RVSeat")

    # Closed curtain across the cab-to-camper opening: the warm tan panel the
    # windshield looks INTO.  Without it the cab backs onto a black void and the
    # "curtains drawn everywhere" story stops at the partition.
    cy0, cy1 = -1.08, 1.08
    n = max(4, int(round((cy1 - cy0) / PLEAT_W)))
    base = len(p.v)
    for i in range(n + 1):
        t = i / n
        xx = cy0 + (cy1 - cy0) * t
        # Creases recede TOWARD the partition (0.01 clear of it) — the crest
        # line at 2.40 never moves toward the windshield.
        yy = 2.40 - (0.0 if i % 2 == 0 else 0.030)
        p.v.append((xx, yy, 1.35))
        p.v.append((xx, yy, 2.62))
    for i in range(n):
        a = base + 2 * i
        p.f.append([a, a + 2, a + 3, a + 1])
        p.m.append("RVCurtain")

    # Sun visors: dark slabs tucked behind the ~26-deg windshield (glass plane
    # is at y~3.60 by z 2.44 — keep 5+ cm of clearance).
    for x0, x1 in ((-0.90, -0.34), (0.34, 0.90)):
        box(p, x0, x1, 3.50, 3.54, 2.24, 2.44, "RVDark")

    # Steering wheel: thin octagonal annulus slab, tilted back, plus a column.
    cx, cy, cz = SW_C
    u = (1.0, 0.0, 0.0)
    v = (0.0, math.sin(WHEEL_TILT), math.cos(WHEEL_TILT))
    nrm = (0.0, -math.cos(WHEEL_TILT), math.sin(WHEEL_TILT))

    def ring_pts(r, off):
        pts = []
        for i in range(8):
            a = 2 * math.pi * i / 8
            pts.append((cx + u[0] * r * math.cos(a) + v[0] * r * math.sin(a)
                        + nrm[0] * off,
                        cy + u[1] * r * math.cos(a) + v[1] * r * math.sin(a)
                        + nrm[1] * off,
                        cz + u[2] * r * math.cos(a) + v[2] * r * math.sin(a)
                        + nrm[2] * off))
        return pts

    base = len(p.v)
    for off in (SW_TH * 0.5, -SW_TH * 0.5):
        p.v.extend(ring_pts(SW_RO, off))
        p.v.extend(ring_pts(SW_RI, off))
    TO, TI, BO, BI = base, base + 8, base + 16, base + 24
    for i in range(8):
        j = (i + 1) % 8
        p.f.append([TO + i, TO + j, TI + j, TI + i]); p.m.append("RVDark")
        p.f.append([BO + j, BO + i, BI + i, BI + j]); p.m.append("RVDark")
        p.f.append([TO + j, TO + i, BO + i, BO + j]); p.m.append("RVDark")
        p.f.append([TI + i, TI + j, BI + j, BI + i]); p.m.append("RVDark")
    hexa(p, [(cx - 0.03, 3.66, 1.30), (cx + 0.03, 3.66, 1.30),
             (cx + 0.03, 3.72, 1.30), (cx - 0.03, 3.72, 1.30),
             (cx - 0.03, cy - 0.02, cz - 0.06), (cx + 0.03, cy - 0.02, cz - 0.06),
             (cx + 0.03, cy + 0.04, cz - 0.06), (cx - 0.03, cy + 0.04, cz - 0.06)],
         "RVDark")


# ---------------------------------------------------------------------------
# Wheels, roof kit, awning, mirrors
# ---------------------------------------------------------------------------
def add_wheel(p, cx, cy, cz, outer_sign):
    n, hw = WHEEL_SEG, WHEEL_W * 0.5
    outer, inner = cx + outer_sign * hw, cx - outer_sign * hw
    # Half-step offset puts a vertex at the exact bottom (270°), so the tyre
    # truly touches z=0 instead of hovering on an inscribed-polygon chord.
    ang = [2 * math.pi * (i + 0.5) / n for i in range(n)]

    def ring(r, x):
        base = len(p.v)
        p.v.extend((x, cy + math.cos(a) * r, cz + math.sin(a) * r) for a in ang)
        return base

    def band(b0, b1, mat):
        for k in range(n):
            k2 = (k + 1) % n
            p.f.append([b0 + k, b0 + k2, b1 + k2, b1 + k])
            p.m.append(mat)

    ro, ri = ring(WHEEL_R, outer), ring(WHEEL_R, inner)
    band(ro, ri, "RVDark")
    ho = ring(HUB_R, outer)
    band(ro, ho, "RVDark")
    hc = len(p.v)
    p.v.append((outer + outer_sign * 0.012, cy, cz))
    for k in range(n):
        p.f.append([ho + k, ho + (k + 1) % n, hc])
        p.m.append("RVTrim")
    p.f.append([ri + k for k in range(n)])
    p.m.append("RVDark")


def build_wells(p):
    """Dark pockets lining the arch mouths.  Every quad's rim edge lands on
    hull vertices (arch edges are loft stations, skirt band edges are ring
    levels), so remove_doubles welds the pockets in and the hull stays a
    closed solid — signed-volume orientation keeps working.  The pocket floor
    is the dark underbody face itself; the tyre pokes through it invisibly,
    dark on dark."""
    for a0, a1 in (ARCH_F, ARCH_R):
        # Ceiling and inner wall are split at every loft station inside the
        # span so their edges COINCIDE with hull edges.  Vertex-only contact
        # (a T-junction at a mid-arch station) leaves the pocket an isolated
        # zero-volume island — recalc then orients it by heuristic, and 15
        # faces shipped inverted exactly that way.  Edge-welded, the pocket
        # joins the hull island and orientation propagates.
        spans = [a0] + [st for st in STATIONS if a0 < st < a1] + [a1]
        for sgn in (1, -1):
            w, i = sgn * HALF_W, sgn * WELL_X
            for b0, b1 in zip(spans, spans[1:]):
                quad(p, (w, b0, WELL_TOP), (w, b1, WELL_TOP),
                     (i, b1, WELL_TOP), (i, b0, WELL_TOP), "RVDark")  # ceiling
                quad(p, (i, b0, Z_SKIRT), (i, b1, Z_SKIRT),
                     (i, b1, WELL_TOP), (i, b0, WELL_TOP), "RVDark")  # inner wall
            quad(p, (w, a0, Z_SKIRT), (i, a0, Z_SKIRT),
                 (i, a0, WELL_TOP), (w, a0, WELL_TOP), "RVDark")      # aft wall
            quad(p, (w, a1, Z_SKIRT), (i, a1, Z_SKIRT),
                 (i, a1, WELL_TOP), (w, a1, WELL_TOP), "RVDark")      # fwd wall
        # Centre underbody strip between the two pockets: the full-width floor
        # is skipped across the arch span (it clipped through the wheel
        # centres), so only the between-pockets part is rebuilt.
        for b0, b1 in zip(spans, spans[1:]):
            quad(p, (-WELL_X, b0, Z_SKIRT), (WELL_X, b0, Z_SKIRT),
                 (WELL_X, b1, Z_SKIRT), (-WELL_X, b1, Z_SKIRT), "RVDark")


def build_arches(p):
    """Radiused arch panels closing the rectangular well mouths, plus a proud
    fender-lip molding.  The panel lives IN the wall plane (the hull faces
    there are skipped, so nothing fights it) and its outer edges land on hull
    vertices, welding it into the hull island for orientation."""
    for (a0, a1), ax in ((ARCH_F, AX_F), (ARCH_R, AX_R)):
        pts = []
        for i in range(ARCH_SEG + 1):
            th = math.pi * (1 - i / ARCH_SEG)          # 180deg -> 0deg
            pts.append((ax + ARCH_RAD * math.cos(th),
                        Z_SKIRT + ARCH_RAD * math.sin(th)))
        for sgn in (1, -1):
            w, wl = sgn * HALF_W, sgn * (HALF_W + LIP_PROUD)
            for (y0, z0), (y1, z1) in zip(pts, pts[1:]):     # above the arch
                quad(p, (w, y0, z0), (w, y1, z1),
                     (w, y1, WELL_TOP), (w, y0, WELL_TOP), "RVBody")
            # Slivers, split at the z=0.70 ring level: the hull's skirt border
            # is two edges since that level exists, and a full-height sliver
            # edge only touches them at vertices — a T-junction that isolates
            # the panel island and hands its winding to the recalc heuristic
            # (two panels shipped inverted exactly that way).
            for zz0, zz1 in ((Z_SKIRT, 0.70), (0.70, WELL_TOP)):
                quad(p, (w, a0, zz0), (w, ax - ARCH_RAD, zz0),
                     (w, ax - ARCH_RAD, zz1), (w, a0, zz1), "RVBody")
                quad(p, (w, ax + ARCH_RAD, zz0), (w, a1, zz0),
                     (w, a1, zz1), (w, ax + ARCH_RAD, zz1), "RVBody")

            def lip(y, z):
                dy, dz = y - ax, z - Z_SKIRT
                f = (ARCH_RAD + LIP_W) / (math.hypot(dy, dz) or 1.0)
                return ax + dy * f, Z_SKIRT + dz * f
            for (y0, z0), (y1, z1) in zip(pts, pts[1:]):
                (ly0, lz0), (ly1, lz1) = lip(y0, z0), lip(y1, z1)
                quad(p, (wl, y0, z0), (wl, y1, z1),
                     (wl, ly1, lz1), (wl, ly0, lz0), "RVBody")


def build_wheels(p):
    for ay in (AX_F, AX_R):
        for sgn in (1, -1):
            add_wheel(p, sgn * TRACK, ay, WHEEL_R, sgn)
            # Mud flap hanging off the skirt behind the tyre (profile photo).
            box(p, sgn * (TRACK - 0.14), sgn * (TRACK + 0.14),
                ay - 0.60, ay - 0.57, 0.16, Z_SKIRT + 0.01, "RVDark")


def build_roof_kit(p):
    hexa(p, [(-AC_HALF_W, AC_Y0, Z_ROOF), (AC_HALF_W, AC_Y0, Z_ROOF),
             (AC_HALF_W, AC_Y1, Z_ROOF), (-AC_HALF_W, AC_Y1, Z_ROOF),
             (-AC_HALF_W + 0.08, AC_Y0 + 0.08, AC_TOP_Z),
             (AC_HALF_W - 0.08, AC_Y0 + 0.08, AC_TOP_Z),
             (AC_HALF_W - 0.08, AC_Y1 - 0.08, AC_TOP_Z),
             (-AC_HALF_W + 0.08, AC_Y1 - 0.08, AC_TOP_Z)], "RVBody")
    box(p, *VENT, "RVTrim")


def build_awning(p):
    cx, cz = HALF_W + AWN_R, AWN_Z
    ang = [2 * math.pi * (i + 0.5) / 6 for i in range(6)]
    b0 = len(p.v)
    p.v.extend((cx + math.cos(a) * AWN_R, AWN_Y0, cz + math.sin(a) * AWN_R)
               for a in ang)
    b1 = len(p.v)
    p.v.extend((cx + math.cos(a) * AWN_R, AWN_Y1, cz + math.sin(a) * AWN_R)
               for a in ang)
    for k in range(6):
        k2 = (k + 1) % 6
        p.f.append([b0 + k, b0 + k2, b1 + k2, b1 + k])
        p.m.append("RVCurtain")
    p.f.append([b0 + k for k in range(5, -1, -1)]); p.m.append("RVTrim")
    p.f.append([b1 + k for k in range(6)]); p.m.append("RVTrim")
    for ay in AWN_ARM_Y:
        box(p, HALF_W, HALF_W + 0.042, ay, ay + 0.04,
            AWN_ARM_Z0, AWN_Z - 0.02, "RVTrim")


def build_mirrors(p):
    # The mount wall is a TWISTED quad (straight hull tapering into nose
    # station A) and its triangulation lands on opposite diagonals per side,
    # so its true surface can't be predicted to better than ~4 mm — chasing
    # it left the arm either poking into the cab or floating.  Instead the
    # arm anchors deep THROUGH the zero-thickness wall, and a near-black
    # cover plate on the interior side masks the butt: dark-on-dark inside
    # the near-black cab, and fully inboard of the wall so never seen outside.
    for sgn in (1, -1):
        a0, a1 = sorted((sgn * 1.16, sgn * 1.44))
        box(p, a0, a1, 3.54, 3.58, 2.06, 2.10, "RVTrim")
        c0, c1 = sorted((sgn * 1.155, sgn * 1.176))
        box(p, c0, c1, 3.51, 3.61, 2.03, 2.13, "RVDark")
        h0, h1 = sorted((sgn * 1.34, sgn * 1.46))
        box(p, h0, h1, 3.52, 3.56, 1.90, 2.24, "RVTrim")
        quad(p, (h0 + 0.01, 3.5195, 1.91), (h1 - 0.01, 3.5195, 1.91),
             (h1 - 0.01, 3.5195, 2.23), (h0 + 0.01, 3.5195, 2.23), "RVDark")


# ---------------------------------------------------------------------------
# Bake / verify / export (identical machinery to broken-car.py)
# ---------------------------------------------------------------------------
def get_material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    col, rough, alpha = MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = col
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = 0.0
    m.diffuse_color = col
    m.roughness = rough
    m.use_backface_culling = True
    # Curtain pleats are OPEN zigzag sheets; recalc_face_normals orients open
    # islands by heuristic and faced the -X side inward (invisible).  Winding on
    # a sheet like that is not worth pinning down — export the material
    # doubleSided instead.  Opaque, so there is no sort-order cost.
    if name == "RVCurtain":
        m.use_backface_culling = False
    if alpha < 1.0:
        b.inputs["Alpha"].default_value = alpha
        try:
            m.blend_method = "BLEND"
        except TypeError:
            m.surface_render_method = "BLENDED"
        m.use_backface_culling = False
    return m


def _orient_islands(bm):
    """Orient every connected shell outward by SIGNED VOLUME (see broken-car.py).
    The hull has two slider holes, but its enclosed volume dwarfs the leak, so the
    sign stays reliable.  Curtain sheets and jamb quads are open islands with
    volume ~0 — they are re-checked visually and by the ray test, not here."""
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
        vol = 0.0
        for f in island:
            vs = [v.co for v in f.verts]
            for i in range(1, len(vs) - 1):
                vol += vs[0].dot(vs[i].cross(vs[i + 1]))
        if abs(vol) < 1e-6:
            continue                      # open sheet: leave its winding alone
        if vol < 0.0:
            bmesh.ops.reverse_faces(bm, faces=island)
            flipped += 1
    return flipped


def bake(part, recalc=True, double_sided=False):
    used = []
    for m in part.m:
        if m not in used:
            used.append(m)
    idx = {n: i for i, n in enumerate(used)}

    me = bpy.data.meshes.new(part.name)
    me.from_pydata(part.v, [], part.f)
    me.update()
    for n in used:
        me.materials.append(get_material(n))
    for i, poly in enumerate(me.polygons):
        poly.material_index = idx[part.m[i]]
        poly.use_smooth = False

    ob = bpy.data.objects.new(part.name, me)
    bpy.context.collection.objects.link(ob)

    if recalc:
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        flipped = _orient_islands(bm)
        if flipped:
            print(f"  (re-oriented {flipped} inside-out island(s) after recalc)")
        bm.to_mesh(me)
        bm.free()
        for poly in me.polygons:
            poly.use_smooth = False
    if double_sided:
        for m in me.materials:
            m.use_backface_culling = False
    return ob


def evaluated_tris(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    m = ev.to_mesh()
    m.calc_loop_triangles()
    n = len(m.loop_triangles)
    ev.to_mesh_clear()
    return n


def build():
    bpy.ops.wm.read_homefile(use_empty=True)
    for d in (bpy.data.objects, bpy.data.meshes, bpy.data.materials):
        for x in list(d):
            d.remove(x)

    body = Part("Winnebago")
    glass = Part("WinnebagoGlass")

    build_hull(body)
    build_wells(body)
    build_arches(body)
    build_nose(body, glass)
    build_tail(body)
    for w in WINDOWS_R:
        curtain_window(body, glass, 1, *w)
    for w in WINDOWS_L:
        curtain_window(body, glass, -1, *w)
    # Fully ABOVE the tail brow kink at z 1.72: a flat pane straddling the
    # apex has the cap bulging through the curtain chord in cream wedges.
    curtain_window_tail(body, glass, -0.75, 0.75, 1.78, 2.42)
    build_door(body, glass)
    build_bays(body)
    build_interior(body)
    build_slider_trim(body)
    build_glass(glass)
    build_wheels(body)
    build_roof_kit(body)
    build_awning(body)
    sw_hull_verts = len(body.v)
    build_mirrors(body)

    ob_body = bake(body, recalc=True)
    ob_glass = bake(glass, recalc=False, double_sided=True)

    tb, tg = evaluated_tris(ob_body), evaluated_tris(ob_glass)
    ext = [(min(c[i] for c in body.v), max(c[i] for c in body.v)) for i in range(3)]
    hull = body.v[:sw_hull_verts]
    hext = [(min(c[i] for c in hull), max(c[i] for c in hull)) for i in range(3)]
    print("=" * 60)
    print(f"  Winnebago       {tb:5d} tris")
    print(f"  WinnebagoGlass  {tg:5d} tris")
    print(f"  TOTAL           {tb + tg:5d} tris   (budget {TRI_BUDGET})")
    print(f"  materials       {len(bpy.data.materials)}   images {len(bpy.data.images)}")
    print(f"  overall W x L x H = {ext[0][1]-ext[0][0]:.2f} x "
          f"{ext[1][1]-ext[1][0]:.2f} x {ext[2][1]-ext[2][0]:.2f} m (incl. mirrors)")
    print(f"  body (no mirrors) W x L x H = {hext[0][1]-hext[0][0]:.2f} x "
          f"{hext[1][1]-hext[1][0]:.2f} x {hext[2][1]-hext[2][0]:.2f} m")
    print(f"  ground contact z = {ext[2][0]:.3f} (must be 0.000)")
    ok_len = abs((ext[1][1] - ext[1][0]) - 8.0) < 0.005
    print(f"  length vs ticket 8.0 m: {'OK' if ok_len else 'MISMATCH'}")

    # Steering wheel vs the raked windshield: compare against the glass plane's
    # y at the wheel's topmost z (the plane leans back, so clearance shrinks
    # with height — a fixed-y check would pass a poking wheel).
    sw_max_y = SW_C[1] + SW_RO * math.sin(WHEEL_TILT) + SW_TH
    sw_top_z = SW_C[2] + SW_RO * math.cos(WHEEL_TILT) + SW_TH
    t = (sw_top_z - WS_Z0) / (WS_Z1 - WS_Z0)
    glass_y = cap_y(WS_Z0) + (cap_y(WS_Z1) - cap_y(WS_Z0)) * t - WS_INSET
    print(f"  steering wheel max y = {sw_max_y:.3f} vs glass {glass_y:.3f} "
          f"(at z {sw_top_z:.2f})  "
          f"{'OK' if sw_max_y < glass_y else 'POKES THROUGH'}")
    # Seat back + headrest must break the cab beltline or the cabin reads empty.
    print(f"  headrest top 2.140 vs beltline {Z_SILL:.3f}  "
          f"{'OK' if 2.14 > Z_SILL else 'BELOW BELT'}")
    # The whole point of the wells: the pocket's inner wall has to clear the
    # tyre's inner face, or the wheel could not rise into it (broken-car rule).
    tyre_in = TRACK - WHEEL_W * 0.5
    print(f"  well pocket wall = {WELL_X:.3f} vs tyre inner face {tyre_in:.3f}  "
          f"{'OK' if WELL_X < tyre_in else 'TOO SHALLOW'}")
    # And the radiused arch must fit inside its span, around the tyre.
    for name, (a0, a1), ax in (("front", ARCH_F, AX_F), ("rear", ARCH_R, AX_R)):
        fits = (a0 <= ax - ARCH_RAD and ax + ARCH_RAD <= a1
                and ARCH_RAD > WHEEL_R)
        print(f"  {name} arch r{ARCH_RAD:.2f} in {a0:.2f}..{a1:.2f}, tyre "
              f"r{WHEEL_R:.2f}  {'OK' if fits else 'ARCH DOES NOT FIT'}")
    # Raised steering wheel must break the sill too — that is why it was raised.
    sw_top = SW_C[2] + SW_RO * math.cos(WHEEL_TILT) + SW_TH
    print(f"  wheel rim top = {sw_top:.3f} vs sill {Z_SILL:.3f}  "
          f"{'OK' if sw_top > Z_SILL else 'HIDDEN'}")
    print("=" * 60)
    return ob_body, ob_glass


def check_normals(ob, samples=400):
    """Prove the winding with rays, never a screenshot (see broken-car.py)."""
    import mathutils
    bad = 0
    tested = 0
    c = mathutils.Vector((0.0, 0.0, 1.5))
    for i in range(samples):
        t = (i + 0.5) / samples
        phi = math.acos(1 - 2 * t)
        theta = math.pi * (1 + 5 ** 0.5) * i
        d = mathutils.Vector((math.sin(phi) * math.cos(theta),
                              math.sin(phi) * math.sin(theta),
                              math.cos(phi)))
        origin = c + d * 15.0
        ray = -d
        hit, loc, nrm, idx = ob.ray_cast(origin, ray)
        if not hit:
            continue
        tested += 1
        if nrm.dot(ray) >= 0.0:
            bad += 1
    print(f"  normals: {tested} rays hit, {bad} pointing away  "
          f"({'OK' if bad == 0 else 'INVERTED FACES'})")
    return bad


def _ui_override():
    win = bpy.context.window_manager.windows[0]
    scr = win.screen
    area = next(a for a in scr.areas if a.type == "VIEW_3D")
    region = next(r for r in area.regions if r.type == "WINDOW")
    return dict(window=win, screen=scr, area=area, region=region,
                scene=bpy.context.scene, view_layer=bpy.context.view_layer)


def export():
    ob_body, ob_glass = build()
    ov = _ui_override()

    with bpy.context.temp_override(**ov):
        for ob in (ob_body, ob_glass):
            ob.select_set(True)
            bpy.context.view_layer.objects.active = ob
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    bad = check_normals(ob_body)

    with bpy.context.temp_override(**ov):
        bpy.ops.export_scene.gltf(
            filepath=OUT_GLB,
            export_format="GLB",
            export_draco_mesh_compression_enable=False,
            export_yup=True,
            export_apply=True,
            export_materials="EXPORT",
            export_texcoords=False,
            export_normals=True,
            export_cameras=False,
            export_lights=False,
            use_selection=False,
        )
    print(f"  wrote {OUT_GLB}")
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    print(f"  wrote {OUT_BLEND}")
    return bad


if __name__ == "__main__":
    build()
