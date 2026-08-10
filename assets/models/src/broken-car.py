"""
ASSET-18 — broken-down car (1990s Buick Century Estate wagon), parametric generator.

Built for: Blender 4.x  |  Target: assets/models/broken-car.glb
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

BUILD REPORT (2026-08-09, Blender 5.2.0 LTS — mid-90s front-end + wrap bumper pass)
  BrokenCar       2178 tris   (body, greenhouse, interior, trim, 3 road wheels,
                               brake drum, spare, scissor jack, tyre iron)
  BrokenCarGlass    16 tris   (6 panes, alpha-blended, double-sided)
  TOTAL           2194 tris   budget 2500
  materials 9 · images 0 · car 2.03 W (mirror to mirror) x 5.07 L x 1.46 H m
  Front end matched to the MID-90s ('89-96 facelift) Century reference — NOT the
  '80 square nose (2026-08-09, user: "specifically the mid 90s one"): an integrated
  CHIN — the whole lower nose is one surface leaning forward from the fascia to an
  apex at the rub strip, tucking under, then WRAPPING the corner and running back
  along the flank to die into the fender at the wheel arch (CHIN table + WRAP
  path), rub strip riding the whole way — a DROOPED hood (~20 mm), a narrow raked
  vertical-rib waterfall grille, wide slim lamps with AMBER wraparound corner
  signals (CarSignal), two black bumperettes hanging BELOW the bumper line, a
  centre licence plate under the bumper, a stand-up hood ornament, and
  rounded-rectangular mirror heads.
  A bumper built as a separate primitive reads glued-on; don't.
  Asserted at every build (see build()/export()): forward -Z, base-seated origin,
  nothing below the ground plane, nothing overhanging the front fascia, the wheel
  pocket clearing the tyre's inner face, the steering wheel clearing the windscreen,
  and 400 inward rays hitting 0 faces that point away.

AXIS TRAP.  The glTF exporter's "+Y up" maps blender (x,y,z) -> gltf (x, z, -y).
So blender +Y becomes gltf -Z.  ASSETS.md wants the nose on -Z, therefore
*** the nose is modelled at +Y in Blender. ***  Verified numerically after export.
Left-hand drive follows from that: left = up x forward = -X, so the wheel is at -X.

STYLE TRAPS this file exists to not re-learn:
  - baseColorFactor is LINEAR and renders ~1.5x lighter than the tuple reads.
    Every colour below is linear and was judged rendered, never from the number.
  - Everything is flat-shaded on purpose.  The facets are the look.  No bevels,
    no smoothing groups, no subdivision.
  - TWO DELIBERATE EXCEPTIONS to ART-STYLE, both signed off 2026-08-05:
      rule 7 "no transparency"      -> CarGlass is alpha-blended.
      anti-pattern "no interiors"   -> a low-detail tub, benches and a wheel.
    No other shipped model does either.  Do not copy this into a scatter prop:
    the alpha costs sort order and the interior costs tris, and both are only
    affordable because this is a POI placed a handful of times.

STORY.  Right-rear corner on a scissor jack, that wheel off, brake drum bare,
spare lying flat on the ground, tyre iron beside it.  The body deliberately does
NOT tilt: rotating it about the contact diagonal sinks the front-left wheel below
z=0, and a static prop cannot absorb that in suspension.  The empty arch plus the
jack carries the read on its own.
"""

import bpy
import bmesh
import math

# ---------------------------------------------------------------------------
# PARAMETERS — everything tunable lives here.
# ---------------------------------------------------------------------------

NAME = "broken-car"
TRI_BUDGET = 2500       # raised from 2000 (2026-08-07) for the front-end rework:
                        # leading bumper, raked waterfall grille, corner signals,
                        # bumperettes + plate + ornament (2026-08-09 mid-90s pass)
OUT_GLB = "/Users/ledogen/CodeShit/CarGame/assets/models/broken-car.glb"
OUT_BLEND = "/Users/ledogen/CodeShit/CarGame/assets/models/src/broken-car.blend"

# Real 1993 Buick Century Estate wagon, metres.  L 4.88 x W 1.81 x H 1.47
L_NOSE, L_TAIL = 2.44, -2.44
AX_F, AX_R = 1.35, -1.35        # axle Y
# TRACK.  An earlier pass ran this out to 0.790 so the tyres would sit PROUD of the
# flank — a cheat that was only needed while the arches were a flat decal with no
# opening behind them.  The wells are real now (see ARCH_R / WELL_DEPTH), so the
# track is back near its honest value and the tyre face lands just inside the
# fender lip, which is what puts the wheel IN the opening instead of on top of it.
TRACK = 0.755                   # wheel centre |X|; tyre face lands at 0.855

WHEEL_R, WHEEL_W = 0.335, 0.20
WHEEL_SEG = 12
HUB_R = 0.185

REAR_WHEEL_OFF = True           # right-rear removed, on the jack
SPARE_AT = (1.34, -1.30)        # (x, y) spare lying flat
IRON_AT = (1.30, -0.55)         # (x, y) tyre iron on the ground
JACK_AT = (0.80, -1.66)         # (x, y) scissor jack, tucked UNDER the rocker

# Greenhouse
Z_ROOF = 1.415
WS_BASE_Y, WS_TOP_Y = 0.90, 0.22
RR_ROOF_Y = -2.36      # roof runs nearly to the tail; a short ledge reads as a wagon,
                       # a long one reads as a notchback with a box on the roof
ROOF_HW = 0.735

# Interior
Z_FLOOR = 0.520
TUB_HW = 0.810          # tub walls sit right behind the glass, NOT beside the seats:
                        # at 0.700 the wall was only 70 mm outboard of a 0.630 seat and
                        # its top edge cut across the backrest from every side angle.
                        # TUB_HW + TUB_WALL must reach the beltline half-width (~0.855)
                        # or the cabin opening leaves a see-through slit down each side.
TUB_WALL = 0.045
TUB_DROP = 0.055        # how far the tub top sits below the beltline
SEAT_HW = 0.600
SEAT_CUSHION_Z = 0.700  # top of the horizontal bench cushions
# INTERIOR SIGHTLINE TRAP: the window band starts at the beltline (~1.02).  Anything
# whose top sits below that is invisible from outside no matter how well modelled —
# the first pass had the seat backs at 0.96 and the cabin read as completely empty.
# Every interior part that is meant to be seen must break the beltline.
# WINDSCREEN CLEARANCE: at y=0.640 the top of the rim reached y=0.724 while the glass
# at that height is only at y=0.682, so the wheel poked out through the windscreen.
# The rim rakes FORWARD as it rises (SW_TILT), so the top of the wheel is the part that
# gets you — moving it back is not optional headroom, it is the constraint.
# export() asserts the clearance; do not push this forward without re-running it.
SW_CENTRE = (-0.40, 0.545, 0.935)   # steering wheel hub
SW_R, SW_INNER = 0.180, 0.146
SW_TILT = math.radians(24.0)        # from vertical
SW_SEG = 10

# RIDE HEIGHT.  The body floor rides 0.060 higher than the first pass, which sat the
# sills so close to the tyres that the car looked bottomed out on its bumpstops.  The
# arch lip is centred on the AXLE (see ARCH_Z) rather than on the sill — getting that
# wrong put the arch top below the top of the tyre, which is what actually read as
# "compressed suspension".  Raise these two together or the look comes straight back.
#
# Body CONTROL stations: (y, w_sill, w_max, w_belt, z_bottom, z_belt).  These are the
# hand-tuned profile; the actual ring set is sampled from them by _interp_station() and
# is much denser through the arches (see STATION_YS).  No station sits inside an arch —
# the arch sampling owns that range.
# NOSE ROUNDING.  The front used to be two stations, 2.440 -> 2.300, so the corner
# between the flat front face and the fender was a single hard crease and the whole nose
# read as a slab.  Three stations now curve the plan view: the cap is NARROWER (0.788,
# was 0.800) and the body swells back to full width faster than a straight taper would,
# which is what puts a radius on the corner.  Everything mounted on the fascia has to
# respect the smaller cap — see the guard in build().
# HOOD DROOP (2026-08-09).  The mid-90s Century's hood falls away toward the nose —
# the front belt now sits ~21 mm lower than the slab-nosed first pass and the drop is
# spread over the front four stations so the hood is a fall, not a kink.  Everything
# mounted on the fascia lives below z 0.885 now; the grille top rail runs right up
# under the hood lip because on the reference the two nearly touch.
BODY_STATIONS = [
    (2.440, 0.730, 0.788, 0.748, 0.375, 0.885),   # front face — rounded corner
    (2.410, 0.766, 0.822, 0.782, 0.360, 0.910),
    (2.365, 0.786, 0.844, 0.804, 0.340, 0.930),
    (2.300, 0.790, 0.855, 0.820, 0.320, 0.945),
    (1.950, 0.800, 0.878, 0.855, 0.300, 0.980),   # ahead of the front arch
    (0.900, 0.800, 0.885, 0.858, 0.295, 1.000),   # cowl / windshield base
    (0.300, 0.805, 0.885, 0.856, 0.295, 1.010),
    (-0.450, 0.805, 0.885, 0.854, 0.295, 1.020),
    (-2.100, 0.790, 0.875, 0.845, 0.320, 1.050),  # behind the rear arch
    (-2.440, 0.780, 0.845, 0.820, 0.360, 1.060),  # tail face
]

# WHEEL WELLS — a real pocket the wheel could travel up into.
#
# Two earlier attempts and why they failed, because both are easy to walk back into:
#   1. A proud dark ring stuck on a flat flank.  No opening at all; the tyre read as
#      glued to the side of the car.
#   2. Displacing ONE section point (the top of the lower band) up and inboard.  That
#      point is also the BOTTOM OF THE FLANK, so the whole lower body came inboard with
#      it — a rectangular depression around the wheel with the fender eaten away, and
#      only 110 mm deep against a 200 mm-wide tyre.
#
# The arch has to be its OWN pair of section edges, which costs two extra points a side:
#   C = (well_x, arch_z)  the inner face of the pocket
#   D = (w_max,  arch_z)  the arch opening in the skin
# C->D is the pocket ceiling and D is where the skin resumes, so the flank stays at full
# width from the arch lip all the way to the belt — the fender is a thin member in line
# with the body, exactly as it was before any of this.  Outside an arch C and D coincide
# and the pair collapses back to the plain lower band.
ARCH_Z = WHEEL_R        # arch circle centres on the axle, NOT on the sill
ARCH_R = 0.415          # arch radius — 80 mm of daylight over a 0.335 tyre
# Depth is set by the TYRE, not by eye: the pocket's inner face must clear the tyre's
# inner face (TRACK - WHEEL_W/2 = 0.655) or the wheel could not rise into it.
# w_max at the axles is ~0.880, so 0.250 puts the pocket wall at 0.630 — 25 mm of daylight
# behind the tyre.  build() asserts this; do not reduce it without rechecking there.
WELL_DEPTH = 0.250
# Flare: the arch lip D stands proud of the flank while the shoulder E stays flush, so
# the skin slopes gently back inboard as it rises out of the opening.  Costs nothing —
# it is the same point, moved — and it tapers away with the arch, so the flank between
# the wheels is dead flat and the panel-cut rub strips never meet a flare.
ARCH_FLARE = 0.022

# Sampling: the arch only exists where its circle rises above the lower band, which at
# ARCH_R = 0.415 is |y - axle| < 0.374.  The end offsets sit exactly on that boundary so
# the well depth tapers to zero there and the arch blends into the band with no step.
# Change ARCH_R and these MUST be recomputed: sqrt(ARCH_R^2 - (z_band - ARCH_Z)^2).
# The interior offsets are uniform in ANGLE, not in Y, so the facets sit evenly on the arc.
ARCH_OFFSETS = (-0.374, -0.285, -0.158, 0.0, 0.158, 0.285, 0.374)

# ---------------------------------------------------------------------------
# MATERIALS — the name is the runtime API (ASSETS.md, substring match).
# LINEAR values.  metalness 0 everywhere; roughness carries the difference.
# ---------------------------------------------------------------------------
MATS = {
    #  name           base colour (linear)          rough  alpha
    "CarPaint":     ((0.500, 0.408, 0.255, 1.0), 0.80, 1.0),   # faded beige — RECOLOURABLE
    "CarTrim":      ((0.035, 0.035, 0.038, 1.0), 0.85, 1.0),   # bumper strips, mouldings, arches
    "CarChrome":    ((0.500, 0.498, 0.480, 1.0), 0.40, 1.0),   # grille, hubcaps, jack, iron
    "CarTire":      ((0.020, 0.020, 0.022, 1.0), 0.95, 1.0),
    "CarLamp":      ((0.670, 0.662, 0.610, 1.0), 0.25, 1.0),   # headlamp lenses
    "CarSignal":    ((0.560, 0.190, 0.012, 1.0), 0.30, 1.0),   # amber corner signals
    "CarTail":      ((0.520, 0.030, 0.022, 1.0), 0.35, 1.0),
    # Interior is deliberately near-black: it is read THROUGH glass against a beige
    # flank, and at anything but point-blank range only the value gap survives.
    "CarInterior":  ((0.030, 0.026, 0.021, 1.0), 0.95, 1.0),   # dulled tan, in shade
    # ROUGHNESS TRAP: at 0.10 the panes act as mirrors and blow out to near-white
    # under any bright sky, which reads as beige panels, not windows.  A dead car's
    # glass is filthy — 0.32 keeps a soft sheen and lets the dark interior through.
    "CarGlass":     ((0.024, 0.032, 0.036, 1.0), 0.32, 0.72),  # THE alpha exception
}

RECOLOURABLE = ("CarPaint",)   # everything else is fixed; stated in the ticket


# ---------------------------------------------------------------------------
# Geometry accumulator
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


def loft(part, rings, mat, cap_first=True, cap_last=True, band_mats=None, skip=None,
         cap_last_mat=None):
    """Closed-section tube between equal-length rings.

    band_mats maps a section-edge index k (the face spanning ring point k -> k+1)
    to its own material, so a single loft can carry a dark lower band without a
    second object or a second pass of geometry.  It may instead be a callable
    (segment, k) -> material-or-None, for bands that vary ALONG the car.

    skip(segment, k) -> True drops that face, which is how the cabin opening is cut
    out of the body's top deck.
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
        mats.append(cap_last_mat or mat)
    # SELF-ORIENTING.  Whether a loft comes out inside-out depends on the handedness of
    # its section relative to the sweep direction — the body sweeps -Y with an XZ
    # section, the bumper sweeps +X with a YZ section, and they disagree.  Leaning on
    # recalc_face_normals to sort it out is not safe: it orients per connected island
    # using an outside heuristic, and the bumper shell is partly BURIED inside the body,
    # which is exactly the case it gets wrong (it did — the whole bumper faced inward).
    # Signed volume is unambiguous, so decide it here and stop depending on the recalc.
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


def _interp_station(y):
    """(w_sill, w_max, w_belt, z_bottom, z_belt) anywhere along the car."""
    st = BODY_STATIONS
    if y >= st[0][0]:
        return st[0][1:]
    if y <= st[-1][0]:
        return st[-1][1:]
    for i in range(len(st) - 1):
        y0, y1 = st[i][0], st[i + 1][0]
        if y1 <= y <= y0:
            t = (y0 - y) / (y0 - y1)
            return tuple(st[i][k] + (st[i + 1][k] - st[i][k]) * t for k in range(1, 6))
    return st[-1][1:]


def _arch_z(y):
    """Top of the wheel-arch circle at this station, or None if clear of both."""
    best = None
    for ay in (AX_F, AX_R):
        d = abs(y - ay)
        if d < ARCH_R:
            z = ARCH_Z + math.sqrt(ARCH_R * ARCH_R - d * d)
            best = z if best is None else max(best, z)
    return best


def _well(y):
    """(arch_z, well_x, sill_x_blend_t) for this station."""
    ws, wm, wb, zb, zt = _interp_station(y)
    band_z = zb + 0.22
    a = _arch_z(y)
    if a is None or a <= band_z:
        return band_z, wm, 0.0
    # Depth is keyed to how far the arch has risen ABOVE the band, so it fades to zero
    # exactly where the arch meets it — no discontinuity to show up as a crease.
    t = min(1.0, (a - band_z) / 0.20)
    return a, wm - WELL_DEPTH * t, t


def body_ring(y):
    ws, wm, wb, zb, zt = _interp_station(y)
    arch_z, well_x, t = _well(y)
    sill_x = ws + (well_x - ws) * t     # the sill tucks in to meet the pocket wall
    lip_x = wm + ARCH_FLARE * t         # the arch lip stands proud: the flare

    # 12 points.  Outside an arch, C and D coincide at the band top and the section is
    # the original 10-point profile with one degenerate edge (welded by remove_doubles).
    # G (top centre) carries a 18 mm crown so the hood and boot lid split into two
    # facets instead of reading as one blank slab.  Free: no extra vertices.
    return [
        (0.0, y, zb),            # 0  A   underside centre
        (sill_x, y, zb),         # 1  B   sill / pocket floor edge
        (well_x, y, arch_z),     # 2  C   top of the pocket's inner face
        (lip_x, y, arch_z),      # 3  D   arch opening in the skin — flared
        (wm, y, zt - 0.16),      # 4  E   shoulder
        (wb, y, zt),             # 5  F   belt
        (0.0, y, zt + 0.018),    # 6  G   crown
        (-wb, y, zt),            # 7  F'
        (-wm, y, zt - 0.16),     # 8  E'
        (-lip_x, y, arch_z),     # 9  D'
        (-well_x, y, arch_z),    # 10 C'
        (-sill_x, y, zb),        # 11 B'
    ]


STATION_YS = sorted(
    {round(v, 4) for v in
     [s[0] for s in BODY_STATIONS] +
     [ay + d for ay in (AX_F, AX_R) for d in ARCH_OFFSETS]},
    reverse=True)


# Dark section edges.  0/11 underside, 1/10 lower band and the pocket's inner face,
# 2/9 the pocket ceiling.  That is the value structure ART-STYLE rule 5 asks for —
# something dark at the base to sit the car on the ground so it does not read as one
# beige lozenge in fog — and it makes the wheel opening read as a cavity.
#
# Edges 3..8 (flank, shoulder, deck) stay body colour ALWAYS.  A previous pass painted
# the flank edge dark inside the arches, which is what erased the fender: with no lit
# body surface reaching the arch lip there was nothing to show where the skin ended and
# the hole began.  The pocket is its own edges now, so the flank never has to give way.
BODY_BANDS = {0: "CarTrim", 1: "CarTrim", 2: "CarTrim",
              9: "CarTrim", 10: "CarTrim", 11: "CarTrim"}


def _interp_belt(y):
    """Belt half-width / height at an arbitrary Y, so parts meet the body."""
    ws, wm, wb, zb, zt = _interp_station(y)
    return wb, zt


# ---------------------------------------------------------------------------
# BODY + GREENHOUSE
# ---------------------------------------------------------------------------
# CABIN OPENING.  The body is a closed tube, so section edges 4 and 5 — belt-right ->
# crown -> belt-left — form a solid deck at BELTLINE height running the whole length.
# Under the greenhouse that deck is a lid over the interior: the tub, the benches and
# the steering wheel all sit below it and are completely invisible, with only the top
# 150 mm of each seat back poking through.  Cut edges 4 and 5 out of every segment
# from the cowl back to the tail and the cabin becomes a real opening down to the tub.
# Keyed to Y, not to a station index: the arch sampling inserts stations, so an index
# range would silently point at the wrong segments the moment ARCH_OFFSETS changes.
CABIN_FROM_Y = 0.900                # the cowl; everything behind it is open cabin


def _skip_cabin_deck(segment, k):
    return k in (5, 6) and STATION_YS[segment] <= CABIN_FROM_Y + 1e-6


def build_body(p):
    loft(p, [body_ring(y) for y in STATION_YS], "CarPaint",
         band_mats=BODY_BANDS, skip=_skip_cabin_deck)


def build_greenhouse(p):
    def roof_ring(y, hw, z):
        return [(-hw, y, z - 0.055), (-hw, y, z), (0.0, y, z + 0.018),
                (hw, y, z), (hw, y, z - 0.055), (0.0, y, z - 0.055)]

    loft(p, [
        roof_ring(WS_TOP_Y, ROOF_HW - 0.005, Z_ROOF),
        roof_ring(-0.60, ROOF_HW + 0.012, Z_ROOF + 0.004),
        roof_ring(-1.60, ROOF_HW + 0.010, Z_ROOF - 0.002),
        roof_ring(RR_ROOF_Y, ROOF_HW - 0.010, Z_ROOF - 0.012),
    ], "CarPaint")

    # TUMBLEHOME TRAP.  The belt is 0.85 half-wide and the roof only 0.735.  A pillar
    # (or a glass pane) built at constant X therefore flares 0.11 m proud of the
    # roofline and the greenhouse grows shoulders — the single worst-looking defect
    # of the first pass.  Everything spanning belt-to-roof must taper between the two.
    P_IN, P_OUT = 0.090, 0.005          # pillar inner/outer inset from the local hw

    def pillar(y0, y1, mat="CarPaint", z_top=Z_ROOF - 0.025, hw_top=ROOF_HW):
        yc = 0.5 * (y0 + y1)
        hw_b, z_b = _interp_belt(yc)
        for sx in (1, -1):
            xb0, xb1 = sx * (hw_b - P_IN), sx * (hw_b - P_OUT)
            xt0, xt1 = sx * (hw_top - P_IN), sx * (hw_top - P_OUT)
            hexa(p, [(xb0, y0, z_b - 0.02), (xb1, y0, z_b - 0.02),
                     (xb1, y1, z_b - 0.02), (xb0, y1, z_b - 0.02),
                     (xt0, y0, z_top), (xt1, y0, z_top),
                     (xt1, y1, z_top), (xt0, y1, z_top)], mat)

    # A-pillars: raked in Y as well as tapered in X
    wb_b, zt_b = _interp_belt(WS_BASE_Y)
    for sx in (1, -1):
        xb0, xb1 = sx * (wb_b - 0.10), sx * (wb_b - P_OUT)
        xt0, xt1 = sx * (ROOF_HW - 0.10), sx * (ROOF_HW - P_OUT)
        hexa(p, [(xb0, WS_BASE_Y, zt_b), (xb1, WS_BASE_Y, zt_b),
                 (xb1, WS_BASE_Y - 0.09, zt_b), (xb0, WS_BASE_Y - 0.09, zt_b),
                 (xt0, WS_TOP_Y, Z_ROOF), (xt1, WS_TOP_Y, Z_ROOF),
                 (xt1, WS_TOP_Y - 0.09, Z_ROOF), (xt0, WS_TOP_Y - 0.09, Z_ROOF)],
              "CarPaint")

    # B / C pillars (door shuts).  Kept thin: a '90s wagon is mostly glass, and fat
    # pillars chop the window band into panes that read as a bus at distance.
    # B moved back from y=0.02: with the A-pillar raking from 0.90 down to 0.22, a
    # B-pillar that far forward left a front door window barely a hand wide.
    pillar(-0.225, -0.135)
    pillar(-1.245, -1.170)
    # D-pillar: the wagon's wide sail panel
    pillar(-2.380, -2.055, z_top=Z_ROOF - 0.020)

    # TAILGATE TRAP: the first pass put a full-height painted "frame" box across the
    # back, which is not a frame — it is a wall, and it blanked the rear window
    # entirely.  The aperture is bounded by the body belt below, the D-pillars at
    # the sides and this shallow header above; the glass fills it and nothing else
    # may sit in the opening.
    box(p, -(ROOF_HW - 0.012), ROOF_HW - 0.012, -2.400, -2.330,
        Z_ROOF - 0.075, Z_ROOF - 0.020, "CarPaint")


# ---------------------------------------------------------------------------
# INTERIOR — low detail on purpose: a tub to the beltline, two benches,
# a dash and a steering wheel.  Nothing else.
# ---------------------------------------------------------------------------
def build_interior(p):
    # OPEN-SURFACE TRAP.  The tub used to be a single-thickness U-strip.
    # bmesh.ops.recalc_face_normals can only define "outward" for a closed manifold,
    # so on an open strip it picks a side arbitrarily — and it picked floor-normals
    # pointing DOWN and wall-normals pointing OUT.  Backface culling then made the
    # whole interior invisible from above: you looked through the floor to the ground.
    # Giving the tub real wall thickness makes it a closed solid, and the recalc is
    # then well-defined.  Do NOT thin this back to a strip.
    # The tub's outer wall TRACKS the beltline rather than sitting at a fixed width,
    # and it spans the whole cabin opening (0.90 .. -2.425).  Both matter: the opening
    # is cut from the body's own section, so anywhere the tub is narrower or shorter
    # than the cut you get a slit straight into the body cavity — whose inner faces are
    # backface-culled, so it reads as a hole through the car.
    # REAR ARCH HUMP.  The rear wheel pocket is 250 mm deep and reaches z 0.75, which
    # is straight through where a flat cabin floor at 0.520 would be — the tub would
    # fill the pocket it is supposed to make room for, and the rear well would end up
    # visibly shallower than the front one (the front arch is ahead of the cabin and
    # never had the problem).  So the floor humps up over the rear axle, exactly as a
    # wagon's cargo floor does.  Full width, so the cabin stays sealed from above.
    # The benches sit at |x| 0.600, inboard of the 0.630 pocket wall, so they need no
    # adjustment — the part of them below the hump is enclosed by the body.
    def tub_ring(y, t=TUB_WALL):
        outer = _interp_belt(y)[0] - 0.005
        hw = outer - t
        ztop = _interp_belt(y)[1] - TUB_DROP
        a = _arch_z(y)
        zf = Z_FLOOR if a is None else max(Z_FLOOR, a + t + 0.015)
        return [(-hw, y, ztop), (-hw, y, zf), (hw, y, zf), (hw, y, ztop),
                (outer, y, ztop), (outer, y, zf - t),
                (-outer, y, zf - t), (-outer, y, ztop)]

    stations = [0.900, 0.300, -0.450, -0.976, -1.180, -1.350,
                -1.520, -1.724, -2.280, -2.425]
    loft(p, [tub_ring(y) for y in stations], "CarInterior")

    # dash: a slab under the windscreen
    box(p, -TUB_HW, TUB_HW, 0.660, 0.880, 0.880, _interp_belt(0.77)[1] - 0.03,
        "CarInterior")

    # Benches.  Each is a horizontal cushion plus an upright backrest, built as two
    # separate boxes with the cushion standing 40 mm proud in Y — the step between
    # them is what makes a seat read as a seat instead of a filled corner.  The
    # backrests break the beltline so they show through the side glass; the cushions
    # are seen looking down through the windscreen and the tailgate.
    def bench(y_back, y_cush_front, z_backrest):
        box(p, -SEAT_HW, SEAT_HW, y_back, y_cush_front, Z_FLOOR, SEAT_CUSHION_Z,
            "CarInterior")                                    # cushion
        box(p, -SEAT_HW, SEAT_HW, y_back - 0.185, y_back + 0.040,
            Z_FLOOR, z_backrest, "CarInterior")               # backrest

    bench(-0.020, 0.400, 1.165)     # front
    bench(-1.020, -0.620, 1.135)    # rear

    # steering wheel: a flat annulus tilted back off the column
    p.sw_from = len(p.v)        # tagged so export() can assert windscreen clearance
    cx, cy, cz = SW_CENTRE
    ct, st_ = math.cos(SW_TILT), math.sin(SW_TILT)

    def sw(r, depth):
        pts = []
        for i in range(SW_SEG):
            a = 2 * math.pi * i / SW_SEG
            u, w = math.cos(a) * r, math.sin(a) * r      # in-plane
            pts.append((cx + u, cy + w * st_ + depth * ct, cz + w * ct - depth * st_))
        return pts

    ring_o_f, ring_i_f = sw(SW_R, 0.012), sw(SW_INNER, 0.012)
    ring_o_b, ring_i_b = sw(SW_R, -0.012), sw(SW_INNER, -0.012)
    base = len(p.v)
    p.v.extend(ring_o_f + ring_i_f + ring_o_b + ring_i_b)
    OF, IF, OB, IB = base, base + SW_SEG, base + 2 * SW_SEG, base + 3 * SW_SEG
    for k in range(SW_SEG):
        k2 = (k + 1) % SW_SEG
        for a, b in ((OF, IF), (IB, OB), (OB, OF), (IF, IB)):
            p.f.append([a + k, a + k2, b + k2, b + k])
            p.m.append("CarInterior")
    # hub + column
    box(p, cx - 0.045, cx + 0.045, cy - 0.030, cy + 0.030, cz - 0.045, cz + 0.045,
        "CarInterior")
    hexa(p, [(cx - 0.035, cy + 0.02, cz - 0.035), (cx + 0.035, cy + 0.02, cz - 0.035),
             (cx + 0.035, cy + 0.06, cz - 0.035), (cx - 0.035, cy + 0.06, cz - 0.035),
             (cx - 0.035, cy + 0.30, cz - 0.185), (cx + 0.035, cy + 0.30, cz - 0.185),
             (cx + 0.035, cy + 0.34, cz - 0.185), (cx - 0.035, cy + 0.34, cz - 0.185)],
          "CarInterior")
    p.sw_to = len(p.v)


# GLASS SEATING.  Every pane tucks BELOW the beltline by this much.  Sat exactly on the
# belt (or above it, as an earlier pass had them) a pane stops short of the bottom of its
# frame and leaves a slot you can see straight through — the body skin only reaches the
# belt at full width, so a few mm of overlap is what closes it.  Below the belt the skin
# is outboard of the pane, so the overlap is hidden: it costs nothing to be generous.
GLASS_SEAT = 0.030


def _windscreen():
    """The windscreen quad, as (base_left, base_right, top_right, top_left).

    Shared by build_glass() and the steering-wheel clearance assert so the two can
    never disagree about where the glass is.  Inset INTO the A-pillar's depth (which
    spans y .. y-0.09) rather than laid on its front face, where the pane edge poked
    out through the front of the pillar.
    """
    wb_b, zt_b = _interp_belt(WS_BASE_Y)
    zb_ = zt_b - GLASS_SEAT
    return ((-(wb_b - 0.105), WS_BASE_Y - 0.045, zb_),
            (wb_b - 0.105, WS_BASE_Y - 0.045, zb_),
            (ROOF_HW - 0.105, WS_TOP_Y - 0.045, Z_ROOF - 0.032),
            (-(ROOF_HW - 0.105), WS_TOP_Y - 0.045, Z_ROOF - 0.032))


def build_glass(g):
    """Separate object, double-sided, alpha.  Panes only — frames are body colour."""
    quad(g, *_windscreen(), "CarGlass")

    wb_t, zt_t = _interp_belt(-2.395)
    zb_t = zt_t - GLASS_SEAT
    quad(g, (-(wb_t - 0.095), -2.395, zb_t), (wb_t - 0.095, -2.395, zb_t),
         (ROOF_HW - 0.085, RR_ROOF_Y + 0.015, Z_ROOF - 0.048),
         (-(ROOF_HW - 0.085), RR_ROOF_Y + 0.015, Z_ROOF - 0.048), "CarGlass")

    # Side panes.  Each is (front-edge bottom Y, front-edge TOP Y, rear-edge Y) — the
    # front door's leading edge follows the A-pillar rake, so the pane is a trapezoid
    # narrowing to the roof, not a rectangle.  Built rectangular it drove its top
    # front corner straight through the A-pillar and out the front of the car.
    z_top = Z_ROOF - 0.050
    panes = (
        (0.815, 0.245, -0.150),     # front door — raked leading edge
        (-0.250, -0.250, -1.180),   # rear door
        (-1.260, -1.260, -2.045),   # cargo quarter
    )
    for yf_bot, yf_top, y_rear in panes:
        wb0, zt0 = _interp_belt(yf_bot)
        wb1, zt1 = _interp_belt(y_rear)
        for sx in (1, -1):
            xb0, xb1 = sx * (wb0 - 0.050), sx * (wb1 - 0.050)
            xt = sx * (ROOF_HW - 0.050)
            quad(g, (xb0, yf_bot, zt0 - GLASS_SEAT), (xb1, y_rear, zt1 - GLASS_SEAT),
                 (xt, y_rear, z_top), (xt, yf_top, z_top), "CarGlass")


# ---------------------------------------------------------------------------
# DETAIL
# ---------------------------------------------------------------------------
def build_detail(p):
    # ---- front ---------------------------------------------------------------
    # Bumpers stop at +/-2.50 so the whole car measures 5.00 m nose to tail; on a
    # real car the bumper IS the extremity, so letting it run past the nose station
    # inflates the length without adding anything to read.
    #
    # THE CHIN — the whole front lower is ONE surface growing out of the body, not a
    # bumper primitive parked in front of it (2026-08-07e, user: "it should be a bump
    # out of the actual body — the Century has a hell of a chin").  The section is a
    # side-view PROFILE, top to bottom:
    #     chin top (z 0.685, tucked in behind the grille's bottom rail)
    #       -> leans FORWARD as it descends -> apex at the rub strip (z 0.462-0.538)
    #       -> tucks BACK UNDER -> dark valance -> underside.
    # No horizontal top shelf, no vertical bumper face, no step: the fascia plane
    # flows into the chin and the chin peaks at the strip.  What killed the previous
    # two attempts: a constant-width loft with flat end caps proud of the body sides
    # reads as a glued-on box no matter how good its front profile is.
    #
    # WRAP-AROUND (2026-08-09, "rework the bumper on the same theme"): the mid-90s
    # cover does not stop at the corner — it turns it and runs back along the flank
    # to die into the fender just ahead of the wheel arch, rub strip riding with it
    # (stopping at the corner is the chrome-blade '80 car).  The sweep is therefore
    # no longer "rings at constant x, protruding +Y": each ring is the same 7-point
    # profile stood off a PLAN-VIEW PATH along its own outward normal (bring()
    # below).  The nose portion still comes from the CHIN table with normal (0,+1);
    # the corner and flank rings carry rotated normals, and the last ring on each
    # side is fully flush with the fender so the end cap is a buried, honest seam.
    #
    # (x, chin-top y, apex y).  yt tracks what sits ABOVE at that x: the grille's
    # bottom rail front (~2.494) inboard, the lamp bezels (~2.45) outboard, the bare
    # nose cap (2.440) past the lamps.  The apex leads the lamp/grille plane by
    # 30-65 mm everywhere the lamps exist, which is the "bumper first" read.
    CHIN = [(0.000, 2.490, 2.558),
            (0.280, 2.486, 2.554),
            (0.340, 2.470, 2.548),
            (0.620, 2.452, 2.520),
            (0.720, 2.442, 2.492)]

    def chin_at(x):
        ax = abs(x)
        for (x0, t0, a0), (x1, t1, a1) in zip(CHIN, CHIN[1:]):
            if x0 <= ax <= x1:
                t = (ax - x0) / (x1 - x0)
                return t0 + (t1 - t0) * t, a0 + (a1 - a0) * t
        return CHIN[-1][1], CHIN[-1][2]

    # ROLLED-IN TOP (2026-08-09b, user: "roll the top edge into the body").  The
    # profile's top point sits AT the path point — i.e. buried inside the skin —
    # so the chin slope rises from the strip and dies INTO the body, and the
    # visible top edge is wherever that slope crosses the skin (~z 0.625 at the
    # nose centre).  No proud top edge, no shelf: the bumper reads as a bulge OF
    # the body, and its visible height shrank ~60 mm with zt_ 0.685 -> 0.640.
    zb_, zv1_, zs0_, zs1_, zt_ = 0.245, 0.385, 0.462, 0.538, 0.640

    def bring(px, py, nx, ny, d_apex, zb=zb_, zv=zv1_):
        """One bumper ring: the profile stood off plan point (px,py) along unit
        outward normal (nx,ny).  The back edge AND the top edge sit AT the path
        point, which every path entry keeps inside the body skin — that buries
        the rear seam and rolls the top into the body.  The strip z band
        (zs0_/zs1_) is constant so the strip stays dead level all the way around
        the wrap; zb/zv rise along the flank so the cover's lower edge climbs
        clear of the rocker instead of hanging at nose depth."""
        def at(d, z):
            return (px + nx * d, py + ny * d, z)
        return [at(0.0, zb), at(d_apex - 0.058, zb), at(d_apex - 0.040, zv),
                at(d_apex, zs0_), at(d_apex, zs1_), at(0.0, zt_)]

    # Corner + flank path, one side: (px, py, nx, ny, d_apex, zb, zv).
    # MATCHED TO THE BODY'S PLAN CORNER (2026-08-09b): the first wrap attempt ran
    # the corner as its own gentle arc while the nose stations turn a much squarer
    # corner (0.788 half-wide at y 2.440 swelling to 0.855 by 2.300), so the two
    # disagreed and the seam mitred badly — the path stepped INBOARD (0.79 -> 0.78)
    # while turning, folding the surface at (0.82, 2.41).  The corner is now a
    # quarter-ellipse around C=(0.72, 2.300), rx 0.118 / ry 0.120, which tracks the
    # station swell ~20 mm inside the skin; normals are the ellipse's own, and the
    # apex taper is monotonic.  Flank wm here is 0.876-0.882; the last entry is
    # zero-protrusion ON the skin line so the cover dies flush.  Ends at y
    # 1.79/1.755 — the arch begins at 1.724.
    WRAP = [(0.779, 2.404, 0.507, 0.862, 0.062, 0.250, 0.388),   # ellipse 30°
            (0.822, 2.360, 0.870, 0.494, 0.052, 0.262, 0.390),   # ellipse 60°
            (0.838, 2.300, 1.000, 0.000, 0.045, 0.272, 0.392),   # ellipse 90°
            (0.858, 2.080, 1.000, 0.000, 0.048, 0.285, 0.395),
            (0.858, 1.790, 1.000, 0.000, 0.048, 0.300, 0.400),
            (0.830, 1.755, 1.000, 0.000, 0.000, 0.310, 0.402)]

    rings = [bring(-px, py, -nx, ny, da, zb, zv)
             for px, py, nx, ny, da, zb, zv in reversed(WRAP)]
    for x, yt, ya in [(-x, t, a) for x, t, a in reversed(CHIN[1:])] + CHIN:
        y_back = min(2.420, yt - 0.030)           # stays buried behind the nose cap
        rings.append(bring(x, y_back, 0.0, 1.0, ya - y_back))
    rings += [bring(px, py, nx, ny, da, zb, zv)
              for px, py, nx, ny, da, zb, zv in WRAP]
    # 0 underside, 1 valance, 3 the rub strip riding the apex; 2 (the tuck-under)
    # and 4 (the chin slope itself) are painted body surface — that continuity is
    # what makes it a bump out of the body rather than a fitted part.
    loft(p, rings, "CarPaint", band_mats={0: "CarTrim", 1: "CarTrim", 3: "CarTrim"})

    # Bumperettes — mid-90s, so they hang BELOW the bumper line (2026-08-09; the
    # tall uprights that stood over the strip were the '80 car and are gone).  Each
    # leads the chin's apex at its own x (the face is curved; a shared y would bury
    # one corner and float the other) and its back is buried in the valance.
    for sx in (1, -1):
        gx = sx * 0.44
        box(p, gx - 0.036, gx + 0.036, 2.396, chin_at(gx)[1] + 0.016,
            0.292, 0.452, "CarTrim")

    # Licence plate — centre, hanging under the bumper like the reference, not on it.
    # Dark backing proud of the valance, pale plate proud of the backing; the plate
    # face leads the chin apex (2.558 at x=0) by ~4 mm so it reads as hung hardware.
    box(p, -0.170, 0.170, 2.400, 2.546, 0.286, 0.462, "CarTrim")
    box(p, -0.150, 0.150, 2.410, 2.562, 0.300, 0.448, "CarLamp")

    # GRILLE TRAP: a filled chrome "surround" box sits in FRONT of the dark recess
    # and the whole nose collapses into one continuous light bar with the headlamps.
    # The chrome must be a frame plus bars only — the dark recess has to stay visible
    # between them, and a dark bezel has to separate grille from lamp.
    # DEPTH TRAP: the nose cap of the body loft is at y=2.440.  Anything whose front
    # face lands behind that is simply invisible — the first grille recess sat at
    # 2.436 and the whole aperture rendered as beige bodywork between chrome bars.
    # Every front-end layer below is stacked strictly forward of 2.440.
    # FASCIA WIDTH BUDGET.  The nose cap is only 0.800 half-wide at z 0.52-0.76 and
    # tucks to 0.760 by z 0.92, so at lamp height the body is about 0.79.  The first
    # pass ran the lamps out to 0.812 and they hung off the corners into thin air.
    # Nothing on the front face may exceed 0.735, and it is checked at export.
    #
    # Proportion follows the mid-90s reference: a NARROW centre waterfall grille
    # (vertical ribs — the horizontal slats were the '80 car) flanked by WIDE slim
    # lamps, with an AMBER corner signal owning each fender edge.  The grille runs
    # tall, its top rail tucked right under the drooped hood lip.
    #
    # The grille is RAKED: its front plane leans back ~28 mm bottom-to-top, like the
    # Century's waterfall.  raked() builds a thin slab whose top loop sits behind its
    # bottom loop; every layer shares the same slope via gy(), so ribs, recess and
    # rails stay in one plane.  Front faces stay ahead of the 2.440 nose cap at every
    # height (DEPTH TRAP above) and behind the bumper face at every x (bumper leads).
    G_RAKE = 0.028

    def raked(x0, x1, y_bot, z0, z1, mat, d=0.026):
        yt = y_bot - G_RAKE * (z1 - z0) / 0.210    # shared slope over grille height
        hexa(p, [(x0, y_bot - d, z0), (x1, y_bot - d, z0),
                 (x1, y_bot, z0), (x0, y_bot, z0),
                 (x0, yt - d, z1), (x1, yt - d, z1),
                 (x1, yt, z1), (x0, yt, z1)], mat)

    def gy(z0):
        """Front-plane y for a piece whose bottom sits at z0 — keeps every grille
        layer on the one raked plane no matter where it starts."""
        return 2.494 - G_RAKE * (z0 - 0.700) / 0.210

    raked(-0.228, 0.228, gy(0.694) - 0.016, 0.694, 0.884, "CarTrim", d=0.050)  # recess
    raked(-0.228, 0.228, gy(0.700), 0.700, 0.724, "CarChrome")         # rail, lower
    raked(-0.228, 0.228, gy(0.856), 0.856, 0.880, "CarChrome")         # rail, upper
    for sx in (1, -1):                                                 # end members
        raked(sx * 0.206, sx * 0.228, gy(0.700), 0.700, 0.880, "CarChrome")
    # VERTICAL RIBS — seven, evenly pitched across the aperture.  Still chunkier
    # than the real car's fine waterfall (16 mm rib, 36 mm gap): at this facet scale
    # that is what reads as "many vertical bars"; five wider ones read as jail bars.
    for i in range(-3, 4):
        cx = i * 0.0515
        raked(cx - 0.008, cx + 0.008, gy(0.724) - 0.002, 0.724, 0.856, "CarChrome")

    # Lamps are WEDGES, not boxes: the outboard end sits further back in Y so each
    # piece follows the nose radius instead of standing square across a curve.
    # hexa() takes 8 free points, so the wedge costs exactly what the box did.
    def wedge(xi, xo, yi0, yi1, yo0, yo1, z0, z1, mat):
        for sx in (1, -1):
            a, b = sx * xi, sx * xo
            hexa(p, [(a, yi0, z0), (b, yo0, z0), (b, yo1, z0), (a, yi1, z0),
                     (a, yi0, z1), (b, yo0, z1), (b, yo1, z1), (a, yi1, z1)], mat)

    # WIDE slim lamps (2026-08-09, mid-90s): ~330 mm of lens, nearly touching the
    # grille frame, thin dark bezel only — on the reference the lamp sits in body
    # colour with barely any surround, and a fat bezel read as '80s sealed-beams.
    wedge(0.240, 0.600, 2.412, 2.470, 2.400, 2.448, 0.745, 0.872, "CarTrim")   # bezel
    wedge(0.256, 0.582, 2.452, 2.482, 2.442, 2.468, 0.757, 0.860, "CarLamp")   # lens
    # Corner signal — AMBER, the mid-90s tell.  A separate short lens whose front
    # face angles back twice as hard as the main lens.  It CANNOT physically wrap
    # the corner: the nose cap is ~0.79 half-wide at lamp height, so anything swept
    # behind y 2.440 inboard of that is buried in the body (an early attempt reached
    # x 0.716 / y 2.35 and vanished entirely).  The angle change against the main
    # lens is what carries the wrap read.
    wedge(0.600, 0.718, 2.446, 2.472, 2.408, 2.434, 0.757, 0.860, "CarSignal")

    # Stand-up hood ornament — the tri-shield-in-a-ring reduced to a thin chrome
    # blade on the hood crown, base buried in the crown facet.  Its silhouette
    # against the sky is the entire read; 12 tris.
    box(p, -0.008, 0.008, 2.262, 2.296, 0.950, 1.012, "CarChrome")

    # ---- rear ----------------------------------------------------------------
    box(p, -0.845, 0.845, -2.500, -2.435, 0.420, 0.640, "CarPaint")
    box(p, -0.853, 0.853, -2.512, -2.462, 0.480, 0.545, "CarTrim")
    for sx in (1, -1):
        x0, x1 = sorted((sx * 0.615, sx * 0.822))
        box(p, x0, x1, -2.480, -2.425, 0.675, 0.995, "CarTail")

    # ---- flanks --------------------------------------------------------------
    # ONE strip only.  There used to be a second "rocker" strip down at z 0.245-0.300;
    # it was wholly buried inside the dark lower band (BODY_BANDS paints exactly that
    # region) so it added nothing but a seam.  Removed, not narrowed — pure duplication.
    #
    # And the survivor is cut into PANELS.  As one 4.5 m box it ran at constant X
    # straight through the fender flare and across both wheel openings — a strip at
    # z 0.590-0.650 intersects an arch out to |y-axle| = 0.308.  Each run now stops
    # clear of its arch, and takes its X from the local flank width so it stays proud
    # of a body whose width varies.
    # (The front-fender run died 2026-08-09: the bumper wrap now covers that panel
    # and carries its own strip, and two strip lines on one fender read as clutter.)
    for y0, y1 in ((-0.950, 0.950),       # both doors
                   (-2.240, -1.760)):     # rear quarter
        wmid = _interp_station(0.5 * (y0 + y1))[1]
        for sx in (1, -1):
            x0, x1 = sorted((sx * (wmid - 0.004), sx * (wmid + 0.021)))
            box(p, x0, x1, y0, y1, 0.590, 0.650, "CarTrim")

    # ---- roof rails + crossbars ---------------------------------------------
    # Black, not chrome: chrome at 0.62 linear renders near-white and the rails
    # then out-read the whole car from 40 m.  The reference photos are black too.
    for sx in (1, -1):
        x0, x1 = sorted((sx * (ROOF_HW - 0.070), sx * (ROOF_HW - 0.018)))
        box(p, x0, x1, -2.270, 0.140, Z_ROOF + 0.008, Z_ROOF + 0.046, "CarTrim")
    for cy in (-0.66, -1.90):
        box(p, -(ROOF_HW - 0.03), ROOF_HW - 0.03, cy - 0.042, cy + 0.042,
            Z_ROOF + 0.012, Z_ROOF + 0.040, "CarTrim")

    # ---- wing mirrors --------------------------------------------------------
    # A stalk and a head, not the single flat box that used to hug the door — at this
    # scale the gap between body and mirror is the whole read, and a box flush to the
    # flank just looks like a badge.  Mounted at the door's front upper corner, and the
    # reflective face looks REARWARD (toward -Y, where the driver is) since the nose
    # is +Y in Blender.
    # A mirror head is a ROUNDED RECTANGLE in section (2026-08-07f, was circular —
    # a circular pod read as a knob, and the Century's heads are flat rectangles
    # with soft corners).  Same cost: still an 8-point section, just laid out as a
    # chamfered rect, wider than tall.  It is the one part of the car small enough
    # that its SILHOUETTE is all you get.  Three rings along Y taper it front and
    # back so it is a slab with shape rather than a prism; the rear cap is the
    # reflective face.
    MH_W, MH_H, MH_C = 0.062, 0.043, 0.019    # head half-width / half-height / chamfer
    wb_m, zt_m = _interp_belt(0.73)
    for sx in (1, -1):
        cxh, czh = sx * (wb_m + 0.098), zt_m - 0.048

        def pod(yv, s):
            return [(cxh + sx * ux * s, yv, czh + uz * s)
                    for ux, uz in ((MH_W - MH_C, MH_H), (MH_W, MH_H - MH_C),
                                   (MH_W, -(MH_H - MH_C)), (MH_W - MH_C, -MH_H),
                                   (-(MH_W - MH_C), -MH_H), (-MH_W, -(MH_H - MH_C)),
                                   (-MH_W, MH_H - MH_C), (-(MH_W - MH_C), MH_H))]

        # The reflective face is the pod's own REAR CAP, not a separate n-gon laid over
        # it: a lone n-gon is an open surface, so recalc_face_normals is free to flip it
        # (and did — one inverted face).  As a cap it belongs to a closed solid.
        loft(p, [pod(0.798, 0.55), pod(0.742, 1.00), pod(0.668, 0.94)], "CarTrim",
             cap_last_mat="CarChrome")

        def stalk(xv, r):
            return [(xv, 0.735 + sx * 0.030 * r * math.cos(2 * math.pi * i / 6),
                     zt_m - 0.050 + 0.026 * r * math.sin(2 * math.pi * i / 6))
                    for i in range(6)]

        # Capped even though both ends are buried — an uncapped tube is another open
        # surface with no well-defined outward side.  8 tris to stay safe.
        loft(p, [stalk(sx * (wb_m - 0.005), 1.0), stalk(sx * (wb_m + 0.072), 0.78)],
             "CarTrim")

    # No arch-lip decal here any more.  The lip is real geometry now: it is the
    # section's own P2 -> P3 edge, where the well surface turns back outboard to the
    # full flank width.  See body_ring().


# ---------------------------------------------------------------------------
# WHEELS + THE BREAKDOWN KIT
# ---------------------------------------------------------------------------
def add_wheel(p, cx, cy, cz, axis="x", outer_sign=1, both_faces=False):
    n, hw = WHEEL_SEG, WHEEL_W * 0.5

    def place(a, r, off):
        c, s = math.cos(a) * r, math.sin(a) * r
        return (cx + off, cy + c, cz + s) if axis == "x" else (cx + c, cy + s, cz + off)

    outer, inner = outer_sign * hw, -outer_sign * hw
    ang = [2 * math.pi * i / n for i in range(n)]

    def ring(r, off):
        base = len(p.v)
        p.v.extend(place(a, r, off) for a in ang)
        return base

    def band(b0, b1, mat):
        for k in range(n):
            k2 = (k + 1) % n
            p.f.append([b0 + k, b0 + k2, b1 + k2, b1 + k])
            p.m.append(mat)

    ro, ri = ring(WHEEL_R, outer), ring(WHEEL_R, inner)
    band(ro, ri, "CarTire")
    ho = ring(HUB_R, outer)
    band(ro, ho, "CarTire")
    hc = len(p.v)
    p.v.append(place(0, 0, outer + 0.012))
    for k in range(n):
        p.f.append([ho + k, ho + (k + 1) % n, hc])
        p.m.append("CarChrome")

    if both_faces:
        hi = ring(HUB_R, inner)
        band(ri, hi, "CarTire")
        hc2 = len(p.v)
        p.v.append(place(0, 0, inner - 0.012))
        for k in range(n):
            p.f.append([hi + k, hi + (k + 1) % n, hc2])
            p.m.append("CarChrome")
    else:
        p.f.append([ri + k for k in range(n)])
        p.m.append("CarTire")


def add_drum(p, cx, cy, cz, outer_sign):
    """Bare brake drum in the empty arch.

    Earlier versions needed a dark backing plate here, because the flank had no real
    opening and an "empty" arch just showed beige bodywork through it.  The well is
    genuine now and its surface is already CarTrim, so the plate is gone and the drum
    sits at an honest depth — inside the fender lip, standing a little proud of the
    well surface behind it.  Bare steel, not black: a dark drum in a dark well is
    invisible, and the arch then reads as an empty socket rather than as a wheel that
    came off.
    """
    n = 8
    ang = [2 * math.pi * i / n for i in range(n)]
    r = 0.155
    x_in = outer_sign * 0.780
    x_out = outer_sign * 0.822
    base = len(p.v)
    p.v.extend((x_in, cy + math.cos(a) * r, cz + math.sin(a) * r) for a in ang)
    p.v.extend((x_out, cy + math.cos(a) * r * 0.85, cz + math.sin(a) * r * 0.85)
               for a in ang)
    for k in range(n):
        k2 = (k + 1) % n
        p.f.append([base + k, base + k2, base + n + k2, base + n + k])
        p.m.append("CarChrome")
    p.f.append([base + n + k for k in range(n)])
    p.m.append("CarChrome")
    # Blind inner cap.  Never seen — it faces into the well — but _orient_islands()
    # needs a CLOSED shell to get a meaningful signed volume out of this island.
    p.f.append([base + k for k in range(n - 1, -1, -1)])
    p.m.append("CarChrome")


def build_wheels(p):
    for (ax, ay) in ((TRACK, AX_F), (-TRACK, AX_F), (TRACK, AX_R), (-TRACK, AX_R)):
        sign = 1 if ax > 0 else -1
        if REAR_WHEEL_OFF and ax > 0 and ay < 0:
            # Above normal axle height on purpose: this corner is on the jack, so the
            # hub hangs higher than it would on its wheel.  It also lifts the drum out
            # of the dark lower band, where it was reading as something fallen off
            # rather than as the bare hub in the opening.
            add_drum(p, ax, ay, WHEEL_R + 0.055, sign)
            continue
        add_wheel(p, ax, ay, WHEEL_R, axis="x", outer_sign=sign)


def build_spare(p):
    """Both faces: unlike a road wheel, this one is seen from above and below.
    Lifted by the hubcap dome height (0.012) — that dome is the lowest point of the
    whole asset and without the offset the spare sinks through the ground plane."""
    add_wheel(p, SPARE_AT[0], SPARE_AT[1], WHEEL_W * 0.5 + 0.012,
              axis="z", outer_sign=1, both_faces=True)


def build_kit(p):
    """Scissor jack under the rocker, tyre iron on the ground."""
    jx, jy = JACK_AT
    lift = 0.300                      # jack saddle height
    box(p, jx - 0.075, jx + 0.075, jy - 0.090, jy + 0.090, 0.0, 0.030, "CarTrim")
    box(p, jx - 0.055, jx + 0.055, jy - 0.055, jy + 0.055, lift, lift + 0.028,
        "CarChrome")
    # the scissor diamond: four arms, front and rear pair
    for sy in (1, -1):
        for lo, hi in ((0.030, lift / 2), (lift / 2, lift)):
            y0 = jy + sy * (0.075 if lo < lift / 2 else 0.010)
            y1 = jy + sy * (0.010 if lo < lift / 2 else 0.075)
            hexa(p, [(jx - 0.026, y0 - 0.024, lo), (jx + 0.026, y0 - 0.024, lo),
                     (jx + 0.026, y0 + 0.024, lo), (jx - 0.026, y0 + 0.024, lo),
                     (jx - 0.026, y1 - 0.024, hi), (jx + 0.026, y1 - 0.024, hi),
                     (jx + 0.026, y1 + 0.024, hi), (jx - 0.026, y1 + 0.024, hi)],
                  "CarChrome")
    # jack crank
    hexa(p, [(jx + 0.02, jy + 0.09, 0.135), (jx + 0.05, jy + 0.09, 0.135),
             (jx + 0.05, jy + 0.12, 0.135), (jx + 0.02, jy + 0.12, 0.135),
             (jx + 0.02, jy + 0.34, 0.075), (jx + 0.05, jy + 0.34, 0.075),
             (jx + 0.05, jy + 0.37, 0.075), (jx + 0.02, jy + 0.37, 0.075)],
          "CarChrome")

    # tyre iron: a four-way lug wrench flat on the ground
    ix, iy = IRON_AT
    for ang in (math.radians(22), math.radians(112)):
        c, s = math.cos(ang), math.sin(ang)
        hl, hw2, t = 0.190, 0.014, 0.026
        pts = []
        for zz in (0.0, t):
            for ux, uy in ((-hl, -hw2), (hl, -hw2), (hl, hw2), (-hl, hw2)):
                pts.append((ix + ux * c - uy * s, iy + ux * s + uy * c, zz))
        hexa(p, pts, "CarChrome")


# ---------------------------------------------------------------------------
# BLENDER PLUMBING
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
    m.diffuse_color = col          # so SOLID viewport shading reads true too
    m.roughness = rough
    # glTF exports doubleSided = not use_backface_culling.  Opaque parts are closed
    # solids, so cull them and let Three.js use its default FrontSide; only the glass
    # panes are single quads that must be visible from inside the car as well.
    m.use_backface_culling = True
    if alpha < 1.0:
        b.inputs["Alpha"].default_value = alpha
        try:
            m.blend_method = "BLEND"
        except TypeError:
            m.surface_render_method = "BLENDED"
        m.use_backface_culling = False
    return m


def _orient_islands(bm):
    """Orient every connected shell outward by SIGNED VOLUME, after the recalc.

    bmesh.ops.recalc_face_normals decides "outward" per connected island using an
    outside-visibility heuristic, and it gets an island wrong when that island is
    partly BURIED inside another — which describes the bumper, whose back face sits
    behind the nose cap.  The whole front end shipped facing inward because of it.
    Signed volume has no such ambiguity: it is origin-independent for a closed shell
    and negative exactly when the shell is inside-out.

    Every island therefore has to be CLOSED.  An open one has an origin-dependent
    volume and this would flip it at random, so cap your tubes.
    """
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

    body = Part("BrokenCar")
    build_body(body)
    build_greenhouse(body)
    build_interior(body)
    build_detail(body)
    build_wheels(body)
    car_verts = len(body.v)          # everything after this is loose ground clutter
    build_spare(body)
    build_kit(body)

    glass = Part("BrokenCarGlass")
    build_glass(glass)

    # Car-only extents: the spare and the jack sit well outboard, so the object
    # bounding box overstates the vehicle by ~0.8 m and is the wrong number to
    # hand a collision box.
    cv = body.v[:car_verts]
    ext = [(min(c[i] for c in cv), max(c[i] for c in cv)) for i in range(3)]

    ob_body = bake(body, recalc=True)
    ob_glass = bake(glass, recalc=False, double_sided=True)

    tb, tg = evaluated_tris(ob_body), evaluated_tris(ob_glass)
    print("=" * 60)
    print(f"  BrokenCar       {tb:5d} tris")
    print(f"  BrokenCarGlass  {tg:5d} tris")
    print(f"  TOTAL           {tb + tg:5d} tris   (budget {TRI_BUDGET})")
    print(f"  materials       {len(bpy.data.materials)}   images {len(bpy.data.images)}")
    print(f"  car   W x L x H = {ext[0][1]-ext[0][0]:.2f} x "
          f"{ext[1][1]-ext[1][0]:.2f} x {ext[2][1]-ext[2][0]:.2f} m")
    print(f"  ground contact z = {ext[2][0]:.3f} (must be 0.000)")
    allz = min(c[2] for c in body.v)
    print(f"  lowest point incl. spare/kit = {allz:.3f} "
          f"{'OK' if allz >= -0.0005 else 'BELOW GROUND'}")

    # Fascia overhang guard: anything mounted on the front face (grille, bezels,
    # lenses, hood trim) must stay inside the nose cap or it hangs off the corner
    # into thin air.  The bumper is exempt — on a real car it IS wider than the nose.
    # y >= 2.450 keeps the body's own nose cap (at exactly 2.440, and legitimately
    # 0.800 half-wide) out of the sample; z > 0.67 drops the bumper, the bumperettes
    # and plate hanging under it (tops at 0.462) and the strip — all legitimately proud.
    # Tightened from 0.735 when the nose cap was narrowed to 0.758 for the plan-view
    # rounding: the limit is a property of the cap, so it moves whenever the cap does.
    face = [c for c in body.v[:car_verts] if c[1] >= 2.450 and c[2] > 0.67]
    over = max((abs(c[0]) for c in face), default=0.0)
    print(f"  widest front-face part = {over:.3f} (fascia allows 0.745)  "
          f"{'OK' if over <= 0.7451 else 'OVERHANGS'}")

    # The whole point of the wells: the pocket's inner face has to clear the tyre's
    # inner face, or the wheel could not rise into it and it is a dent, not a well.
    tyre_in = TRACK - WHEEL_W * 0.5
    pocket = max(_well(ay)[1] for ay in (AX_F, AX_R))
    print(f"  well pocket wall = {pocket:.3f} vs tyre inner face {tyre_in:.3f}  "
          f"{'OK' if pocket < tyre_in else 'TOO SHALLOW'}")

    # Steering wheel vs windscreen.  Signed distance to the glass plane, oriented so
    # the cabin side is negative.  Test ONLY the tagged steering-wheel vertices: a
    # geometric filter like "y > 0.4 and z > 1.0" also catches the hood crown, which
    # is ahead of the windscreen for perfectly good reasons and reads as a 0.5 m fail.
    import mathutils
    a, b, _c, d = (mathutils.Vector(v) for v in _windscreen())
    nrm = (b - a).cross(d - a).normalized()
    if nrm.dot(mathutils.Vector((0.0, 0.0, 1.2)) - a) > 0:
        nrm = -nrm
    worst = max((nrm.dot(mathutils.Vector(v) - a)
                 for v in body.v[body.sw_from:body.sw_to]), default=-1.0)
    print(f"  steering wheel vs windscreen = {worst:+.3f} m  "
          f"{'OK' if worst < 0 else 'POKES THROUGH'}")
    print("=" * 60)
    return ob_body, ob_glass


def check_normals(ob, samples=400):
    """Prove the winding, never eyeball it.

    A model seen from the far side looks mirrored when it is fine and fine when it
    is mirrored, so screenshots cannot settle this.  Fire rays inward from a sphere
    around the body and assert every first hit points BACK at its ray.  Rays that
    miss, or that land on the interior/kit clutter, are skipped.

    Sample count raised 64 -> 400: at 64 an entirely inside-out front bumper scored
    0 hits on one run and 1 on the next.  Small parts need enough rays to be struck at
    all, or this hands out a clean bill of health for a visibly broken model.
    """
    import mathutils
    bad = 0
    tested = 0
    c = mathutils.Vector((0.0, 0.0, 0.75))
    for i in range(samples):
        # deterministic spiral over the sphere — no Math.random, reproducible
        t = (i + 0.5) / samples
        phi = math.acos(1 - 2 * t)
        theta = math.pi * (1 + 5 ** 0.5) * i
        d = mathutils.Vector((math.sin(phi) * math.cos(theta),
                              math.sin(phi) * math.sin(theta),
                              math.cos(phi)))
        origin = c + d * 12.0
        ray = -d
        hit, loc, nrm, idx = ob.ray_cast(origin, ray)
        if not hit:
            continue
        tested += 1
        # A correct outward normal points back UP the ray: dot(normal, ray_dir) < 0.
        # (Getting this comparison the wrong way round reports every good face as
        # inverted and every inverted one as good — which is exactly why this check
        # has to be a number and not a screenshot.)
        if nrm.dot(ray) >= 0.0:
            bad += 1
    print(f"  normals: {tested} rays hit, {bad} pointing away  "
          f"({'OK' if bad == 0 else 'INVERTED FACES'})")
    return bad


def _ui_override():
    """read_homefile() invalidates any window/area grabbed earlier, and the MCP
    bridge's context has no active_object — both operators below need a real one.
    Fetch it AFTER the rebuild, never before."""
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

    dims = ob_body.dimensions
    print(f"  size (blender X,Y,Z) = "
          f"{dims.x:.2f} x {dims.y:.2f} x {dims.z:.2f} m")

    with bpy.context.temp_override(**ov):
        bpy.ops.export_scene.gltf(
            filepath=OUT_GLB,
            export_format="GLB",
            export_draco_mesh_compression_enable=False,   # no decoder in the loader
            export_yup=True,                              # blender +Y -> gltf -Z
            export_apply=True,
            export_materials="EXPORT",
            export_texcoords=False,                       # zero images, zero UVs
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
