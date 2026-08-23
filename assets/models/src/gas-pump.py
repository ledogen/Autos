"""
ASSET-14 - the lone gas pump, parametric generator.

Built for: Blender 5.x  |  Target: assets/models/gas-pump.glb
Style brief: .planning/research/ART-STYLE.md  |  Mechanics: .planning/research/ASSETS.md

RESHAPED BY OWNER 2026-08-22, TWICE.  The ticket specified ONE pump on a small pad.
Pass 1 replaced that with the roadside island from the first reference photo: a tall
pole carrying a lit GAS sign, and at its foot TWO box pumps back to back so a car can
pull up on either side.  Pass 2 replaced the pump ITSELF, against a second reference
(a Wayne/Bennett-era cabinet): the first pump was "a little bit too narrow and
upright", so the body is now WIDE and SQUAT under a CHROME-FRAMED HEAD THAT OVERHANGS
it on three sides, and the head carries a real gauge face instead of two blank
windows.  The name gas-pump.glb is kept because it is the name the acceptance criteria
and the model registry use.

ONE TEXTURE, AN ATLAS, AND ONLY FOR THINGS GEOMETRY CANNOT SAY.  512x512, holding two
artworks: the word GAS for the pole sign (top strip) and the pump's gauge face (lower
block) - registers, digits, captions and the red GASOLINE band.  Both are the
ART-STYLE rule-1 lettering exception (news-roll, then produce-stall): printed words
and printed dials, not wear.  The ticket ALSO budgeted its texture for "faded livery,
rust streaks" - those are wear, the named anti-pattern, and they are still dropped.

ONE ATLAS, NOT TWO IMAGES, AND THAT IS WHY IT IS SQUARE.  Sign and gauge share one
image so they can share ONE material and ONE draw call.  Everything is laid out in
ATLAS UNITS (the unit square that renders to 512x512), never in per-region normalised
coordinates - the two regions have different aspects, so region-normalised drawing
would stretch the gauge artwork and not the sign.  The regions leave a 32 px gutter
between them so minification cannot bleed one into the other.

THE ARTWORK IS BAKED BY THIS SCRIPT, not hand-painted -- an orthographic render of
flat emitters, packed into the .blend.  Re-running the generator reproduces the
texture along with the mesh, so a plate's proportions and its pixels can never drift
apart: PLATE ASPECTS ARE DERIVED FROM THE REGION PIXEL SIZES, not typed in twice.
The fonts are baked to pixels, so the .glb carries no font reference; the script warns
and falls back to Bfont if one is missing.

SIX MATERIALS = six draw calls.  This is a POI placed a handful of times, not scatter
density, so six is affordable.
  PumpConcrete  the island slab.  Mid grey, the ground the whole thing sits on.
  PumpBody      the pole, the sign arm, the sign bezel, the floodlight arm.
  PumpSkirt     the pump bodies.  Faded red, THE RECOLOURABLE ONE (see below).
  PumpTrim      every near-black part: plinth, hoses, lamp head.  NOT the nozzle any
                more - that is bare metal now, see PumpMetal.
  PumpMetal     the head casing and its bezel, AND the whole nozzle casting.  Owner
                ruling 2026-08-22: the frame is the same metal as the pump handle, so
                the two share one material - which is also the merge rule doing its
                job, since they are the same colour and the same role (bare cast
                metal).  It is the one split that needed arguing: a mid-grey band
                framing a cream dial over a red body is the whole read of this pump,
                and cream (PumpBody) or near-black (PumpTrim) both kill it.
  PumpGraphic   the baked atlas: sign faces AND gauge faces.  Textured; the other five
                are flat colour with no UVs that mean anything.

RECOLOUR: PumpSkirt only.  A curated pool belongs on the data/prop-models.js entry per
the 2026-08-21 palette ruling, not here.  CAVEAT IF ONE IS EVER ADDED: the gauge
face's red GASOLINE band is BAKED at the same red, and a palette swap will not move
it.  Either keep the pool to reds or re-bake per variant.

VALUE STRUCTURE (ART-STYLE rule 5), bottom to top: near-black plinth seats the pumps,
wide red bodies carry the saturation, a bright chrome head with a cream dial reads as
the one thing you look AT, then a white pole runs up to a white sign with black
letters at 4 m.  The sign is the silhouette the player navigates by; the gauge face is
what they get once they have already arrived.

FORWARD IS -Z (glTF), i.e. +Y in Blender: that is the direction the FIRST pump's gauge
face, holster-side nozzle and hose face, and one of the two faces the sign reads from.
The second pump is that pump mirrored through y = 0, so the island is symmetric about
its long axis and either approach direction works.  Base-seated: the island slab's
underside is at exactly z = 0 in Blender (y = 0 in the GLB).

AXIS NOTE.  The exporter's "+Y up" maps blender (x,y,z) -> gltf (x, z, -y).  So glTF
-Z (forward) is blender +Y, and the island's long axis X survives unchanged.
"""

import bpy
import bmesh
import math
import os
from mathutils import Vector

# ---------------------------------------------------------------------------
# Parameters.  Everything tunable lives here; the body below only consumes it.
# ---------------------------------------------------------------------------

# --- island slab (a battered frustum, as a poured concrete kerb really is) ---
PAD_X0, PAD_X1 = -1.50, 1.00     # 2.50 m along the island
PAD_Y = 0.70                     # half-width, 1.40 m across
PAD_H = 0.16
PAD_BATTER = 0.05                # how far the top face is inset from the bottom

# --- pole ---
POLE_X = -1.05                   # at the far end of the island from the pumps
POLE_R = 0.065
POLE_SIDES = 8
POLE_TOP = 4.55
COLLAR_R = 0.105                 # cast base collar, the thing that sits it down
COLLAR_TOP = 0.34

# --- sign arm and sign box ---
ARM_X1 = 0.56                    # arm runs +X from the pole, out over the pumps
ARM_Z0, ARM_Z1 = 4.09, 4.20
ARM_HW = 0.045                   # half-thickness across Y
BRACE_Z = 3.62                   # where the diagonal brace leaves the pole
BRACE_X = -0.44                  # where it meets the arm
BRACE_W = 0.05

# SIGN LIGHTING.  Two flat luminaires on a crossbar THROUGH the top of the pole, one
# per sign face, each aimed down and inward at the lettering (owner, 2026-08-23).
#
# THE FIXTURES' LONG AXIS RUNS ALONG X, i.e. ALONG THE SIGN, not along their own arm.
# The brief was "rotate it 90 degrees about the pole", and the arm does exactly that -
# it now reaches out to +/-Y instead of over the pumps.  But the stated goal was that
# the throw covers the sign text, and a fixture turned bodily with the arm would spread
# its light across the sign's 200 mm thickness instead of down its 1.46 m length.  So
# the arm turned and the housing did not, which is also how every real sign floodlight
# is mounted.
#
# ONE CROSSBAR, NOT TWO ARMS: a single beam from -Y to +Y through the pole is 12 tris
# instead of 24 and reads as the gantry it is.  Its tips are buried in the housings.
LAMP_Z = 4.40                    # crossbar centreline, just under the pole cap
LAMP_BAR_HALF = 0.44             # crossbar half-length across Y
LAMP_BAR_W = 0.038
LAMP_Y = 0.42                    # housing axis, out from the pole (mirrored)
LAMP_DROP = 0.035                # housing axis, below the crossbar
LAMP_X = (-1.14, 0.06)           # housing extent ALONG the sign: 1.20 m
LAMP_W = 0.190                   # housing width
LAMP_DEEP = 0.085                # housing depth
# Aim, in degrees off vertical.  From (y 0.42, z 4.365) to the letter block's centre
# (y 0.106, z 3.81) is atan(0.314 / 0.555) = 29.5 degrees, so this points at the text
# rather than at whatever happens to be under the fixture.
LAMP_TILT = 31.0

SIGN_CX = -0.24                  # sign box centre
SIGN_W = 1.46                    # box, along X
SIGN_H = 0.60                    # box, along Z
SIGN_T = 0.20                    # box, across Y
SIGN_CZ = 3.81
SIGN_FACE_W = 1.40               # lit face plate width; its HEIGHT is derived from the
                                 # atlas region so artwork and plate cannot drift
SIGN_FACE_PROUD = 0.006          # stands off the bezel; 6 mm, well clear of the
                                 # 1 mm parallel-face z-fighting threshold
SIGN_FACE_T = 0.010              # plate thickness.  A single quad would be cheaper by
                                 # 10 tris and leave an open, non-manifold boundary --
                                 # closed geometry is worth more than 10 tris here.

# --- pumps: WIDE AND SQUAT, per the second reference ---
PUMP_CX = 0.28                   # both pumps sit at this X; they differ only in Y
PUMP_HW = 0.330                  # body half-width along X -> 0.66 m wide
PUMP_Y0 = 0.015                  # body back, just off the centreline: the 30 mm gap
PUMP_Y1 = 0.480                  # is what makes them read as TWO pumps
PLINTH_H = 0.24                  # dark base, shared by both bodies
BODY_TOP = 0.98
BODY_TAPER = 0.028               # the red panel narrows going DOWN, as in the reference

HEAD_OVER_X = 0.031              # the head OVERHANGS the body: sides...
HEAD_OVER_Y = 0.035              # ...and front.  NOT the back - two mirrored heads
                                 # would interpenetrate across the centreline.
HEAD_MARGIN = 0.035              # chrome frame width around the gauge plate
FACE_PROUD = 0.008               # gauge plate stands off the head's front face
FACE_T = 0.014

# THE BEZEL.  Four raised chrome rails tiling the margin band, so the dial sits in a
# RECESS instead of being a decal on a flat box - the reference has this and the owner
# asked for it read louder than the reference does it.  The top rail is proud twice as
# far as the others and rises a little above the head: that is the drip hood, the thing
# that would actually keep rain off the digits, and it is the whole point of the part.
#
# Every rail is deliberately kept off the head's own faces.  A rail whose outer face
# lands exactly ON the head's side, top or bottom face is the flush-ending z-fight this
# model has already hit three times, so the sides inset, the sill starts high, and the
# hood overshoots.
FRAME_LAP = 0.008                # how far the rails overlap the plate's edges
FRAME_INSET = 0.005              # rail outer edge, inset from the head's side faces
FRAME_SILL = 0.006               # bottom rail start, above the head's underside
FRAME_CAP = 0.006                # top rail rise, above the head's top face
FRAME_ROOT = 0.015               # how far the rails are rooted back into the head
FRAME_PROUD = 0.026              # sides and sill
HOOD_PROUD = 0.048               # top rail: the rain hood

# THE NOZZLE.  X values are offsets from the BODY EDGE (PUMP_HW), Y values are offsets
# back from the BODY FRONT (PUMP_Y1), so re-proportioning the cabinet drags the whole
# cluster with it instead of stranding it mid-panel.
#
# REBUILT 2026-08-22 pass 4.  The first version was four dark boxes and did not read as
# a handheld nozzle at all.  This one is the anatomy of the reference casting: a chunky
# BODY, a tapered SPOUT leaving its top-front and leaning up and forward, a big open
# D-shaped GUARD hanging below, and a TRIGGER inside the guard.  The guard loop is the
# signature silhouette - it is what says "you pick this up" - so it gets three of the
# five parts.  The loop lies in the Y-Z plane, flat against the pump's flank, because
# that is how a nozzle actually hangs and it keeps the thing out of the driving line.
NOZ_DX = 0.040                   # nozzle plane, out from the body edge
NOZ_BODY_HT = 0.025              # casting half-thickness across X
NOZ_BODY_DY = (-0.125, -0.023)   # casting, front to back along the flank
NOZ_BODY_Z = (0.730, 0.808)

NOZ_SPOUT_A = (-0.060, 0.800)    # (dy, z) where the spout leaves the casting
NOZ_SPOUT_B = ( 0.018, 0.944)    # ...and its tip.  Forward travel is capped by the
                                 # head's front overhang, so the length comes from Z.
NOZ_SPOUT_R = (0.023, 0.013)     # tapered: root, tip
NOZ_SPOUT_SIDES = 5              # 5 reads round enough at 20 mm and costs 16 tris

NOZ_GUARD_DY = (-0.115, -0.026)  # the D-loop's rear and front stiles
NOZ_GUARD_Z = 0.615              # its bottom rail
NOZ_GUARD_W = 0.030              # section across X...
NOZ_GUARD_H = 0.019              # ...and across the rail's own thickness

NOZ_TRIG_HT = 0.007              # Trigger: a SHORT bar tucked against the front stile,
                                 # not a bar across the middle.  At 60 mm it split the
                                 # loop into two small holes and the D stopped reading.
NOZ_TRIG_DY = (-0.076, -0.028)   # front end runs INTO the guard's front stile:
                                 # stopping 0.5 mm short of it was a coplanar pair
NOZ_TRIG_Z = (0.672, 0.692)

# The bracket the casting hangs on AND the port the hose leaves by - one part doing two
# jobs, which is both 12 tris cheaper than two and how a real pump is plumbed: the hose
# comes out of the flank right where the nozzle is holstered.
# A RAIL, not a bracket: 230 mm along the flank, hanging the nozzle at its front end and
# porting the hose at its rear.  Two jobs, one part, and the LENGTH is the point - the
# hose has to leave the flank well behind where the nozzle hangs or its loop has nowhere
# to sag and ends up swinging outboard, straight across the nozzle's own silhouette,
# which is exactly what pass 4's first routing did.  The nozzle itself sits as far
# FORWARD as the head's overhang allows, for the same reason.
HOOK_DX = (-0.010, 0.038)
HOOK_DY = (-0.290, -0.060)
HOOK_Z = (0.795, 0.832)

HOSE_R = 0.018
HOSE_SIDES = 4
HOSE_SEGS = 4
# Cubic Bezier, (dx from body edge, dy back from body front, z): out of the rail's REAR
# end, a U that sags below the guard, then up into the casting's rear boss - which sits
# ABOVE the guard, the way a real one is plumbed.  dx stays near the nozzle's own plane
# throughout, so the loop hangs along the flank BEHIND the nozzle rather than swinging
# out in front of it.
HOSE_P0 = (0.018, -0.272, 0.790)
HOSE_P1 = (0.058, -0.320, 0.520)
HOSE_P2 = (0.058, -0.180, 0.470)
HOSE_P3 = (0.032, -0.120, 0.756)

# ---------------------------------------------------------------------------
# TEXTURE ATLAS
#
# One 512x512 image, two artworks.  Regions are (v0, v1) - both span the full u
# range, which is what lets mirror_y() flip a plate with a plain u -> 1 - u.
# ---------------------------------------------------------------------------
ATLAS_PX = 512
SIGN_REGION = (0.625, 1.000)     # 192 px tall -> plate aspect 512/192 = 2.6667
GAUGE_REGION = (0.000, 0.5625)   # 288 px tall -> plate aspect 512/288 = 1.7778
                                 # 32 px of gutter between them, against mip bleed

SIGN_TEXT = "GAS"
SIGN_FONT = "/System/Library/Fonts/Supplemental/Arial Black.ttf"
GAUGE_FONT = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"

# Sign artwork, in ATLAS UNITS measured inside its region
SIGN_TXT_FILL = 0.62             # letter block width as a fraction of the inner field
SIGN_MARGIN = 0.040              # dark rule inset from the region edge
SIGN_RULE_W = 0.016

# Gauge artwork, in ATLAS UNITS with y measured up from the region's bottom edge.
# Rows are (row centre y, digit cap height, digits, caption).
#
# THE WINDOWS SIZE THEMSELVES.  Each register is drawn by placing its digits FIRST at
# a chosen cap height, measuring the glyph box that came back, and then laying the
# cream strip and the dark surround around it at a fixed padding.  Fitting digits to
# a hand-typed window WIDTH instead is what the first bake did, and five digits fitted
# to a wide window came out taller than the window and spilled over both edges.  Rects
# are placed by Z, not by call order, so drawing the backing after the text is fine.
GAUGE_BAND_H = 0.150             # red GASOLINE band across the bottom
GAUGE_BAND_TEXT = "GASOLINE"
GAUGE_BAND_FILL = 0.60
GAUGE_ROWS = (
    (0.4750, 0.052, "00000", "TOTAL SALE"),
    (0.3520, 0.052, "0000",  "GALLONS"),
    (0.2380, 0.038, "149",   "PRICE PER GALLON"),
)
GAUGE_STRIP_IN = 0.008           # dark surround width outside the cream strip
GAUGE_PAD = (0.016, 0.008)       # cream strip padding around the digit glyph box
GAUGE_CAP_H = 0.017              # caption cap height, in atlas units
GAUGE_CAP_GAP = 0.020            # caption baseline gap below its window

# ---------------------------------------------------------------------------
# COLOURS  (LINEAR - renders ~1.5x lighter than the number reads; ART-STYLE
# rule 5.  Judge them rendered, never from the number.)
# ---------------------------------------------------------------------------
MATERIALS = [
    ("PumpConcrete", (0.300, 0.295, 0.278), 0.95),
    ("PumpBody",     (0.700, 0.675, 0.600), 0.60),
    ("PumpSkirt",    (0.360, 0.075, 0.055), 0.75),
    ("PumpTrim",     (0.045, 0.046, 0.048), 0.55),
    ("PumpMetal",    (0.395, 0.405, 0.420), 0.38),
    ("PumpGraphic",  (1.000, 1.000, 1.000), 0.68),   # baseColor is the bake
]

# artwork colours, linear, matched to the materials they sit beside
INK = (0.012, 0.012, 0.013)
ENAMEL = (0.780, 0.770, 0.735)    # weathered sign white
CREAM = (0.690, 0.660, 0.575)     # the gauge face
BAND_RED = (0.360, 0.075, 0.055)  # SAME red as PumpSkirt - see the RECOLOUR caveat
GLASS = (0.055, 0.052, 0.050)     # register window surround

OBJ_NAME = 'GasPump'
OUT_GLB = os.path.join(os.path.dirname(bpy.data.filepath) or '.', '..', 'gas-pump.glb')

# Plate aspects DERIVED from the atlas, never typed twice.  The PLATE is the artwork;
# the OPENING is the hole the bezel leaves, one FRAME_LAP smaller all round, so the
# rails cover the plate's outer 8 mm the way a real bezel covers a dial's rim.
SIGN_FACE_H = SIGN_FACE_W * (SIGN_REGION[1] - SIGN_REGION[0])
HEAD_HW = PUMP_HW + HEAD_OVER_X
GAUGE_PLATE_W = 2.0 * HEAD_HW - 2.0 * HEAD_MARGIN + 2.0 * FRAME_LAP
GAUGE_PLATE_H = GAUGE_PLATE_W * (GAUGE_REGION[1] - GAUGE_REGION[0])
OPEN_W = GAUGE_PLATE_W - 2.0 * FRAME_LAP
OPEN_H = GAUGE_PLATE_H - 2.0 * FRAME_LAP
HEAD_TOP = BODY_TOP + OPEN_H + 2.0 * HEAD_MARGIN


# ---------------------------------------------------------------------------
# GEOMETRY HELPERS
#
# Every helper returns (verts, faces, matnames, uvs) so a whole part list can be
# mirrored through y = 0 in one place -- see mirror_y().  Faces are index tuples
# wound counter-clockwise seen from outside.  uvs[i] is None for every face that
# carries no artwork, which is nearly all of them.
# ---------------------------------------------------------------------------

# box() face order, referred to by index elsewhere in this file
BOX_MZ, BOX_PZ, BOX_MY, BOX_PX, BOX_PY, BOX_MX = 0, 1, 2, 3, 4, 5


def box(x0, x1, y0, y1, z0, z1, mat):
    v = [Vector((x0, y0, z0)), Vector((x1, y0, z0)), Vector((x1, y1, z0)), Vector((x0, y1, z0)),
         Vector((x0, y0, z1)), Vector((x1, y0, z1)), Vector((x1, y1, z1)), Vector((x0, y1, z1))]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
         (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return v, f, [mat] * len(f), [None] * len(f)


def frustum(x0, x1, y0, y1, z0, z1, inset_lo, inset_hi, mat):
    """A box with an independent inset at each end.  inset_lo > 0 narrows the BOTTOM,
    which is the batter on the pump's red panel; inset_hi > 0 narrows the top, which
    is the batter on a poured concrete kerb."""
    a, b = inset_lo, inset_hi
    v = [Vector((x0 + a, y0 + a, z0)), Vector((x1 - a, y0 + a, z0)),
         Vector((x1 - a, y1 - a, z0)), Vector((x0 + a, y1 - a, z0)),
         Vector((x0 + b, y0 + b, z1)), Vector((x1 - b, y0 + b, z1)),
         Vector((x1 - b, y1 - b, z1)), Vector((x0 + b, y1 - b, z1))]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
         (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return v, f, [mat] * len(f), [None] * len(f)


def prism_z(cx, cy, z0, z1, r0, r1, sides, mat, phase=0.0):
    """Vertical n-gon prism, capped both ends.  r0 != r1 gives a taper."""
    lo, hi = [], []
    for i in range(sides):
        a = phase + 2.0 * math.pi * i / sides
        lo.append(Vector((cx + r0 * math.cos(a), cy + r0 * math.sin(a), z0)))
        hi.append(Vector((cx + r1 * math.cos(a), cy + r1 * math.sin(a), z1)))
    v = lo + hi
    f = [tuple(range(sides - 1, -1, -1)), tuple(range(sides, 2 * sides))]
    for i in range(sides):
        j = (i + 1) % sides
        f.append((i, j, sides + j, sides + i))
    return v, f, [mat] * len(f), [None] * len(f)


def prism_axis(p0, p1, r0, r1, sides, mat):
    """Tapered n-gon prism between two arbitrary points, capped both ends.  prism_z()
    only runs up Z; the nozzle spout leaves its casting at an angle, and rotating a
    Z-prism into place would need a transform this file otherwise never uses."""
    p0, p1 = Vector(p0), Vector(p1)
    d = (p1 - p0).normalized()
    ref = Vector((1.0, 0.0, 0.0))
    if abs(d.dot(ref)) > 0.9:
        ref = Vector((0.0, 0.0, 1.0))
    u = (ref - d * ref.dot(d)).normalized()
    w = d.cross(u).normalized()
    v = []
    for p, r in ((p0, r0), (p1, r1)):
        for i in range(sides):
            a = 2.0 * math.pi * i / sides
            v.append(p + u * (r * math.cos(a)) + w * (r * math.sin(a)))
    f = [tuple(range(sides - 1, -1, -1)), tuple(range(sides, 2 * sides))]
    for i in range(sides):
        j = (i + 1) % sides
        f.append((i, j, sides + j, sides + i))
    return v, f, [mat] * len(f), [None] * len(f)


def beam(p0, p1, w, h, mat, up=None):
    """Rectangular beam between two points.  Cross-section w across the beam's own
    horizontal normal, h across its own vertical - so a diagonal brace keeps a
    constant section instead of shearing.  Pass `up` to roll the section about the
    beam's own axis; that is how the sign lights get their downward tilt without a
    transform."""
    p0, p1 = Vector(p0), Vector(p1)
    d = (p1 - p0).normalized()
    up = Vector((0.0, 0.0, 1.0)) if up is None else Vector(up).normalized()
    if abs(d.dot(up)) > 0.999:
        up = Vector((0.0, 1.0, 0.0))
    # HANDEDNESS.  The faces below are wound for a RIGHT-handed (side, vert, d) frame,
    # the same order box() uses for (x, y, z).  side.cross(d) gives -d back through the
    # triple product, i.e. a LEFT-handed frame, and every beam in the model then exports
    # inside-out: invisible in a two-sided viewport, a hole in the game.  d.cross(side)
    # is the one that satisfies side x vert == d.
    side = d.cross(up).normalized()
    vert = d.cross(side).normalized()
    a, b = side * (w * 0.5), vert * (h * 0.5)
    v = [p0 - a - b, p0 + a - b, p0 + a + b, p0 - a + b,
         p1 - a - b, p1 + a - b, p1 + a + b, p1 - a + b]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
         (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return v, f, [mat] * len(f), [None] * len(f)


def face_toward(verts, faces, mats, direction, mat):
    """Give `mat` to whichever face of a convex part points most along `direction`.

    Chosen by measured normal, NOT by index into box()'s face order: once a part is
    built through beam() with a rolled `up`, which index is "the underside" depends on
    the roll, and hardcoding it is how a lens ends up on the roof."""
    direction = Vector(direction).normalized()
    best, bi = -2.0, 0
    for i, idx in enumerate(faces):
        a, b, c = verts[idx[0]], verts[idx[1]], verts[idx[2]]
        d = (b - a).cross(c - a).normalized().dot(direction)
        if d > best:
            best, bi = d, i
    mats[bi] = mat


def bezier(p0, p1, p2, p3, n):
    p0, p1, p2, p3 = (Vector(p) for p in (p0, p1, p2, p3))
    out = []
    for i in range(n + 1):
        t = i / n
        u = 1.0 - t
        out.append(p0 * (u ** 3) + p1 * (3 * u * u * t)
                   + p2 * (3 * u * t * t) + p3 * (t ** 3))
    return out


def tube(points, r, sides, mat):
    """Capped n-gon tube swept along a polyline.  The ring frame is carried along the
    curve (parallel transport) rather than rebuilt per segment, so the tube does not
    spin about its own axis where the curve bends hardest."""
    pts = [Vector(p) for p in points]
    tangents = []
    for i, p in enumerate(pts):
        if i == 0:
            t = pts[1] - pts[0]
        elif i == len(pts) - 1:
            t = pts[-1] - pts[-2]
        else:
            t = pts[i + 1] - pts[i - 1]
        tangents.append(t.normalized())

    ref = Vector((0.0, 1.0, 0.0))
    if abs(tangents[0].dot(ref)) > 0.9:
        ref = Vector((1.0, 0.0, 0.0))
    u = (ref - tangents[0] * ref.dot(tangents[0])).normalized()

    v, f = [], []
    for i, (p, t) in enumerate(zip(pts, tangents)):
        if i > 0:
            u = (u - t * u.dot(t)).normalized()
        w = t.cross(u).normalized()
        base = len(v)
        for k in range(sides):
            a = 2.0 * math.pi * k / sides
            v.append(p + u * (r * math.cos(a)) + w * (r * math.sin(a)))
        if i > 0:
            prev = base - sides
            for k in range(sides):
                j = (k + 1) % sides
                f.append((prev + k, prev + j, base + j, base + k))
    f.append(tuple(range(sides - 1, -1, -1)))
    f.append(tuple(range(len(v) - sides, len(v))))
    return v, f, [mat] * len(f), [None] * len(f)


def plate_uv(verts, face, region, x0, x1, z0, z1):
    """UVs for an artwork face on a +Y-facing plate.

    Screen-right for a viewer at +Y is -X (right = cross(view_dir, up), with view_dir
    = -Y), so U must run BACKWARDS along X or the artwork reads mirrored.  mirror_y()
    flips it again for the -Y copy, which is why every atlas region spans the full U
    range.
    """
    v0, v1 = region
    out = []
    for i in face:
        p = verts[i]
        u = 1.0 - (p.x - x0) / (x1 - x0)
        t = (p.z - z0) / (z1 - z0)
        out.append((u, v0 + t * (v1 - v0)))
    return out


def mirror_y(parts):
    """Mirror a part list through y = 0.  Two things have to flip together:

    WINDING - a mirror reverses handedness, so every face is re-wound or the copy
    renders inside-out: invisible in Blender's two-sided viewport, very visible in the
    game with backface culling on.

    U - the mirrored plate faces the other way, so its artwork must run the other way
    too, or the sign reads SAG from one side.  Every atlas region spans the full U
    range, which makes that a plain u -> 1 - u.
    """
    out = []
    for v, f, m, uvs in parts:
        mv = [Vector((p.x, -p.y, p.z)) for p in v]
        mf = [tuple(reversed(idx)) for idx in f]
        mu = [None if uv is None else [(1.0 - u, w) for u, w in reversed(uv)]
              for uv in uvs]
        out.append((mv, mf, list(m), mu))
    return out


# ---------------------------------------------------------------------------
# ATLAS BAKE
# ---------------------------------------------------------------------------

def _emission(name, col):
    """Flat emitter.  With the Standard view transform an emission of value v writes
    exactly v, so the linear colours below survive the round trip: Blender sRGB-encodes
    on save and the sRGB texture decodes back to the same linear value at sample time."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    e = nt.nodes.new('ShaderNodeEmission')
    e.inputs[0].default_value = (col[0], col[1], col[2], 1.0)
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(e.outputs[0], o.inputs[0])
    return m


def _purge_bake_leftovers():
    """Re-running the generator must not accumulate a new copy of the artwork every
    time - the .blend would grow a 512x512 image per run."""
    for img in list(bpy.data.images):
        if img.name.startswith(("GasPumpAtlas", "GasPumpSign")):
            bpy.data.images.remove(img)
    for m in list(bpy.data.materials):
        if m.name.startswith(("Sign", "Gauge", "Atlas")) and m.users == 0:
            bpy.data.materials.remove(m)
    for sc in list(bpy.data.scenes):
        if sc.name.startswith("AtlasBake"):
            bpy.data.scenes.remove(sc)


def bake_atlas():
    """Render both artworks into one square image and return it, packed.

    EVERYTHING IS DRAWN IN ATLAS UNITS: the camera frames the unit square, which maps
    to ATLAS_PX in both axes, so a shape drawn 0.1 x 0.1 is square on the plate no
    matter which region it lands in.  Stacked in Z in painter's order.
    """
    engines = {i.identifier for i in
               bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items}
    sc = bpy.data.scenes.new("AtlasBake")
    sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engines else 'BLENDER_EEVEE'
    sc.render.resolution_x = sc.render.resolution_y = ATLAS_PX
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'Standard'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGB'

    cam_data = bpy.data.cameras.new("AtlasCam")
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = 1.0
    cam = bpy.data.objects.new("AtlasCam", cam_data)
    cam.location = (0.5, 0.5, 2.0)
    sc.collection.objects.link(cam)
    sc.camera = cam

    scratch, scratch_mats = [], []

    def rect(x0, x1, y0, y1, z, col, tag):
        me = bpy.data.meshes.new(tag)
        me.from_pydata([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)],
                       [], [(0, 1, 2, 3)])
        me.update()
        o = bpy.data.objects.new(tag, me)
        mat = _emission(tag, col)
        scratch_mats.append(mat)
        me.materials.append(mat)
        sc.collection.objects.link(o)
        scratch.append(o)

    def text(body, cx, cy, z, col, tag, font, width=None, cap_h=None):
        """Centred text.  Give it EITHER a width to fit to or a cap height."""
        cu = bpy.data.curves.new(tag, type='FONT')
        cu.body = body
        cu.size = 1.0
        cu.align_x = 'CENTER'
        cu.align_y = 'CENTER'
        try:
            cu.font = bpy.data.fonts.load(font, check_existing=True)
        except (RuntimeError, OSError):
            print("WARN: font not found, falling back to Bfont:", font)
        o = bpy.data.objects.new(tag, cu)
        mat = _emission(tag, col)
        scratch_mats.append(mat)
        cu.materials.append(mat)
        sc.collection.objects.link(o)
        scratch.append(o)
        me = o.to_mesh()
        xs = [v.co.x for v in me.vertices]
        ys = [v.co.y for v in me.vertices]
        if not xs:
            o.to_mesh_clear()
            return (cx, cx, cy, cy)
        if width is not None:
            k = width / (max(xs) - min(xs)) if max(xs) > min(xs) else 1.0
        else:
            k = cap_h / (max(ys) - min(ys)) if max(ys) > min(ys) else 1.0
        # align_y='CENTER' centres on the FONT's metrics, which reserve descender space
        # these all-caps lines never use - so the block sits low.  Centre on the
        # measured glyph bounding box instead and the row number means what it says.
        mid = (max(ys) + min(ys)) * 0.5
        o.to_mesh_clear()
        o.scale = (k, k, k)
        o.location = (cx, cy - k * mid, z)
        # placed glyph box, in atlas units - what the register backing is drawn around
        h = k * (max(ys) - min(ys)) * 0.5
        return (cx + k * min(xs), cx + k * max(xs), cy - h, cy + h)

    # ---- background: fill the whole atlas so the gutter is never garbage ----
    rect(0.0, 1.0, 0.0, 1.0, 0.00, INK, "AtlasGutter")

    # ---- sign region: black edge, enamel field, black rule, GAS ------------
    s0, s1 = SIGN_REGION
    m, w = SIGN_MARGIN, SIGN_RULE_W
    rect(0.0, 1.0, s0, s1, 0.01, INK, "SignEdge")
    rect(w, 1.0 - w, s0 + w, s1 - w, 0.02, ENAMEL, "SignField")
    rect(m, 1.0 - m, s0 + m, s1 - m, 0.03, INK, "SignRule")
    n = m + w
    rect(n, 1.0 - n, s0 + n, s1 - n, 0.04, ENAMEL, "SignInner")
    text(SIGN_TEXT, 0.5, (s0 + s1) * 0.5, 0.06, INK, "SignLetters", SIGN_FONT,
         width=(1.0 - 2 * n) * SIGN_TXT_FILL)

    # ---- gauge region: cream face, three registers, red band ---------------
    g0, g1 = GAUGE_REGION
    rect(0.0, 1.0, g0, g1, 0.01, CREAM, "GaugeFace")
    rect(0.0, 1.0, g0, g0 + GAUGE_BAND_H, 0.02, BAND_RED, "GaugeBand")
    text(GAUGE_BAND_TEXT, 0.5, g0 + GAUGE_BAND_H * 0.5, 0.06, ENAMEL,
         "GaugeBandText", SIGN_FONT, width=GAUGE_BAND_FILL)

    px, py = GAUGE_PAD
    e = GAUGE_STRIP_IN
    for i, (cy, digit_h, digits, caption) in enumerate(GAUGE_ROWS):
        # digits first, then the strip and the surround measured around them
        bx0, bx1, by0, by1 = text(digits, 0.5, g0 + cy, 0.05, INK,
                                  "GaugeDigits%d" % i, GAUGE_FONT, cap_h=digit_h)
        rect(bx0 - px, bx1 + px, by0 - py, by1 + py, 0.03,
             ENAMEL, "GaugeStrip%d" % i)
        rect(bx0 - px - e, bx1 + px + e, by0 - py - e, by1 + py + e, 0.02,
             GLASS, "GaugeWin%d" % i)
        text(caption, 0.5, by0 - py - e - GAUGE_CAP_GAP, 0.05, INK,
             "GaugeCap%d" % i, GAUGE_FONT, cap_h=GAUGE_CAP_H)

    path = os.path.join(bpy.app.tempdir, "gas-pump-atlas.png")
    sc.render.filepath = path
    win = bpy.context.window
    prev = win.scene
    win.scene = sc
    try:
        bpy.ops.render.render(write_still=True)
    finally:
        win.scene = prev

    img = bpy.data.images.load(path, check_existing=False)
    img.name = "GasPumpAtlas"
    img.pack()                # NEVER leave it in tempdir - that is wiped on quit
    img.filepath_raw = ""

    for o in scratch + [cam]:
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.scenes.remove(sc)
    for mm in scratch_mats:
        bpy.data.materials.remove(mm)
    bpy.data.cameras.remove(cam_data)
    return img


# ---------------------------------------------------------------------------
# PARTS
# ---------------------------------------------------------------------------

def pump_parts():
    """One pump, facing +Y (= glTF -Z, forward).  The second pump is this list put
    through mirror_y()."""
    p = []
    cx, e, fy = PUMP_CX, PUMP_HW, PUMP_Y1

    # --- body: wide, squat, and narrowing toward the floor -----------------
    # Runs 20 mm PAST BODY_TOP on purpose.  Ending it flush leaves the body's top face
    # and the head's underside exactly coplanar, which z-fights; burying the body top
    # inside the head removes it and leaves only the overhang shadow, which is the
    # detail the reference is actually built on.
    p.append(frustum(cx - e, cx + e, PUMP_Y0, fy, PLINTH_H, BODY_TOP + 0.02,
                     BODY_TAPER, 0.0, "PumpSkirt"))

    # --- head: chrome box overhanging the body on three sides --------------
    hx = HEAD_HW
    hy1 = fy + HEAD_OVER_Y
    p.append(box(cx - hx, cx + hx, PUMP_Y0, hy1, BODY_TOP, HEAD_TOP, "PumpMetal"))

    # --- gauge plate: the only face on this pump carrying artwork ----------
    # It is FRAME_LAP bigger than the opening in both axes, so its rim tucks under the
    # bezel rails below rather than butting them edge to edge.  The artwork is mapped
    # to the PLATE, so that lap hides 8 mm of cream margin and nothing that reads.
    ox0, ox1 = cx - OPEN_W * 0.5, cx + OPEN_W * 0.5
    oz0 = BODY_TOP + HEAD_MARGIN
    oz1 = oz0 + OPEN_H
    px0, px1 = ox0 - FRAME_LAP, ox1 + FRAME_LAP
    pz0, pz1 = oz0 - FRAME_LAP, oz1 + FRAME_LAP
    v, f, m, uvs = box(px0, px1, hy1 + FACE_PROUD - FACE_T, hy1 + FACE_PROUD,
                       pz0, pz1, "PumpMetal")
    m[BOX_PY] = "PumpGraphic"
    uvs[BOX_PY] = plate_uv(v, f[BOX_PY], GAUGE_REGION, px0, px1, pz0, pz1)
    p.append((v, f, m, uvs))

    # --- bezel: four raised rails, the top one a rain hood -----------------
    rx0, rx1 = cx - hx + FRAME_INSET, cx + hx - FRAME_INSET
    y0 = hy1 - FRAME_ROOT
    rails = (
        (rx0, rx1, BODY_TOP + FRAME_SILL, oz0, FRAME_PROUD),   # sill
        (rx0, rx1, oz1, HEAD_TOP + FRAME_CAP, HOOD_PROUD),     # hood
        (rx0, ox0, oz0, oz1, FRAME_PROUD),                     # left stile
        (ox1, rx1, oz0, oz1, FRAME_PROUD),                     # right stile
    )
    for a, b, z0, z1, proud in rails:
        p.append(box(a, b, y0, hy1 + proud, z0, z1, "PumpMetal"))

    # --- the nozzle, hung on its hook -------------------------------------
    # nx is the plane the whole casting lies in; the guard loop lives in it too, so
    # the nozzle hangs flat against the flank instead of sticking into the driving line.
    nx = cx + e + NOZ_DX
    p.append(box(cx + e + HOOK_DX[0], cx + e + HOOK_DX[1],
                 fy + HOOK_DY[0], fy + HOOK_DY[1], HOOK_Z[0], HOOK_Z[1], "PumpMetal"))
    p.append(box(nx - NOZ_BODY_HT, nx + NOZ_BODY_HT,
                 fy + NOZ_BODY_DY[0], fy + NOZ_BODY_DY[1],
                 NOZ_BODY_Z[0], NOZ_BODY_Z[1], "PumpMetal"))
    # spout: rooted INSIDE the casting at both the dy and the z, so there is no seam
    p.append(prism_axis((nx, fy + NOZ_SPOUT_A[0], NOZ_SPOUT_A[1]),
                        (nx, fy + NOZ_SPOUT_B[0], NOZ_SPOUT_B[1]),
                        NOZ_SPOUT_R[0], NOZ_SPOUT_R[1], NOZ_SPOUT_SIDES, "PumpMetal"))
    # the D-guard: front stile down, bottom rail back, rear stile up into the casting
    gf, gr = fy + NOZ_GUARD_DY[1], fy + NOZ_GUARD_DY[0]
    gz, gtop = NOZ_GUARD_Z, NOZ_BODY_Z[0]
    for a, b in (((nx, gf, gtop), (nx, gf, gz)),
                 ((nx, gf, gz), (nx, gr, gz)),
                 ((nx, gr, gz), (nx, gr, gtop))):
        p.append(beam(a, b, NOZ_GUARD_W, NOZ_GUARD_H, "PumpMetal"))
    p.append(box(nx - NOZ_TRIG_HT, nx + NOZ_TRIG_HT,
                 fy + NOZ_TRIG_DY[0], fy + NOZ_TRIG_DY[1],
                 NOZ_TRIG_Z[0], NOZ_TRIG_Z[1], "PumpMetal"))

    # --- hose: out of the hook, sagging U, back up into the casting -------
    curve = [(cx + e + q[0], fy + q[1], q[2])
             for q in (HOSE_P0, HOSE_P1, HOSE_P2, HOSE_P3)]
    p.append(tube(bezier(*curve, HOSE_SEGS), HOSE_R, HOSE_SIDES, "PumpTrim"))
    return p


# ---------------------------------------------------------------------------
# BUILD
# ---------------------------------------------------------------------------

def build():
    _purge_bake_leftovers()
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for me in list(bpy.data.meshes):
        bpy.data.meshes.remove(me)

    img = bake_atlas()

    order = [n for n, _, _ in MATERIALS]
    slot_of = {n: i for i, n in enumerate(order)}
    mats = {}
    for name, col, rough in MATERIALS:
        m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        m.use_nodes = True
        bsdf = m.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = (col[0], col[1], col[2], 1.0)
        bsdf.inputs["Roughness"].default_value = rough
        bsdf.inputs["Metallic"].default_value = 0.0
        # Export single-sided (campfire/gnome convention, not the older trailer's).
        # The mesh is closed and manifold everywhere, so a back face is never wanted
        # and culling them halves the fill on the sign box and the hoses.
        m.use_backface_culling = True
        if name == "PumpGraphic":
            tex = m.node_tree.nodes.new("ShaderNodeTexImage")
            tex.image = img
            tex.interpolation = 'Linear'
            tex.location = (-400, 200)
            m.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        mats[name] = m

    parts = []

    # --- island slab -------------------------------------------------------
    parts.append(frustum(PAD_X0, PAD_X1, -PAD_Y, PAD_Y, 0.0, PAD_H,
                         0.0, PAD_BATTER, "PumpConcrete"))

    # --- shared dark plinth under both pumps -------------------------------
    parts.append(box(PUMP_CX - PUMP_HW - 0.012, PUMP_CX + PUMP_HW + 0.012,
                     -PUMP_Y1 - 0.012, PUMP_Y1 + 0.012,
                     PAD_H - 0.005, PLINTH_H, "PumpTrim"))

    # --- the two pumps, back to back ---------------------------------------
    front = pump_parts()
    parts.extend(front)
    parts.extend(mirror_y(front))

    # --- pole --------------------------------------------------------------
    # phase = pi/8 puts a FACE, not a vertex, square on to +/-Y, so the pole shows a
    # flat to the road instead of a bright edge highlight.
    ph = math.pi / POLE_SIDES
    parts.append(prism_z(POLE_X, 0.0, PAD_H - 0.005, COLLAR_TOP,
                         COLLAR_R, COLLAR_R * 0.80, POLE_SIDES, "PumpTrim", ph))
    parts.append(prism_z(POLE_X, 0.0, COLLAR_TOP - 0.02, POLE_TOP,
                         POLE_R, POLE_R * 0.88, POLE_SIDES, "PumpBody", ph))

    # --- sign lights -------------------------------------------------------
    parts.append(beam((POLE_X, -LAMP_BAR_HALF, LAMP_Z), (POLE_X, LAMP_BAR_HALF, LAMP_Z),
                      LAMP_BAR_W, LAMP_BAR_W, "PumpBody"))
    tilt = math.radians(LAMP_TILT)
    lz = LAMP_Z - LAMP_DROP
    for s in (1, -1):
        # aim: down, and inward toward this side's sign face
        aim = Vector((0.0, -s * math.sin(tilt), -math.cos(tilt)))
        v, f, m, uvs = beam((LAMP_X[0], s * LAMP_Y, lz), (LAMP_X[1], s * LAMP_Y, lz),
                            LAMP_W, LAMP_DEEP, "PumpTrim", up=-aim)
        face_toward(v, f, m, aim, "PumpBody")   # the lens is the face that faces the throw
        parts.append((v, f, m, uvs))

    # --- sign arm and its brace --------------------------------------------
    parts.append(box(POLE_X, ARM_X1, -ARM_HW, ARM_HW, ARM_Z0, ARM_Z1, "PumpBody"))
    parts.append(beam((POLE_X, 0.0, BRACE_Z), (BRACE_X, 0.0, ARM_Z0 + 0.02),
                      BRACE_W, BRACE_W, "PumpBody"))

    # --- sign box: cream bezel, two lit faces standing proud of it ---------
    sx0, sx1 = SIGN_CX - SIGN_W * 0.5, SIGN_CX + SIGN_W * 0.5
    sz0, sz1 = SIGN_CZ - SIGN_H * 0.5, SIGN_CZ + SIGN_H * 0.5
    parts.append(box(sx0, sx1, -SIGN_T * 0.5, SIGN_T * 0.5, sz0, sz1, "PumpBody"))

    fx0, fx1 = SIGN_CX - SIGN_FACE_W * 0.5, SIGN_CX + SIGN_FACE_W * 0.5
    fz0, fz1 = SIGN_CZ - SIGN_FACE_H * 0.5, SIGN_CZ + SIGN_FACE_H * 0.5
    # Build the +Y plate, then mirror it: mirror_y() owns both the winding flip and
    # the u -> 1 - u, so the two faces cannot drift apart the way they did when each
    # side computed its own handedness.
    v, f, m, uvs = box(fx0, fx1, SIGN_T * 0.5 + SIGN_FACE_PROUD - SIGN_FACE_T,
                       SIGN_T * 0.5 + SIGN_FACE_PROUD, fz0, fz1, "PumpBody")
    m[BOX_PY] = "PumpGraphic"
    uvs[BOX_PY] = plate_uv(v, f[BOX_PY], SIGN_REGION, fx0, fx1, fz0, fz1)
    parts.append((v, f, m, uvs))
    parts.extend(mirror_y([(v, f, m, uvs)]))

    # --- assemble one mesh --------------------------------------------------
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    for verts, faces, mnames, uvs in parts:
        bverts = [bm.verts.new(v) for v in verts]
        bm.verts.ensure_lookup_table()
        for idx, mname, uv in zip(faces, mnames, uvs):
            try:
                face = bm.faces.new([bverts[i] for i in idx])
            except ValueError:
                continue
            face.material_index = slot_of[mname]
            face.smooth = False       # ART-STYLE rule 3: faceted, always
            for k, loop in enumerate(face.loops):
                loop[uv_layer].uv = uv[k] if uv else (0.0, 0.0)

    bm.normal_update()
    mesh = bpy.data.meshes.new(OBJ_NAME)
    bm.to_mesh(mesh)
    bm.free()
    mesh.polygons.foreach_set('use_smooth', [False] * len(mesh.polygons))
    mesh.update()

    obj = bpy.data.objects.new(OBJ_NAME, mesh)
    for name in order:
        obj.data.materials.append(mats[name])
    bpy.context.collection.objects.link(obj)
    return obj


def stats():
    dg = bpy.context.evaluated_depsgraph_get()
    ob = bpy.data.objects[OBJ_NAME]
    me = ob.evaluated_get(dg).to_mesh()
    tris = sum(len(f.vertices) - 2 for f in me.polygons)
    per = {}
    for f in me.polygons:
        n = ob.data.materials[f.material_index].name
        per[n] = per.get(n, 0) + len(f.vertices) - 2
    bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    dims = (max(v.x for v in bb) - min(v.x for v in bb),
            max(v.y for v in bb) - min(v.y for v in bb),
            max(v.z for v in bb) - min(v.z for v in bb))
    out = dict(tris=tris, verts=len(me.vertices), per_material=per,
               dims=dims, minz=min(v.z for v in bb),
               head_top=round(HEAD_TOP, 4),
               plate=(round(GAUGE_PLATE_W, 4), round(GAUGE_PLATE_H, 4)),
               opening=(round(OPEN_W, 4), round(OPEN_H, 4)),
               materials=len(ob.data.materials), images=len(bpy.data.images),
               uvs=len(ob.data.uv_layers))
    ob.evaluated_get(dg).to_mesh_clear()
    return out


def export():
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(OUT_GLB),
        export_format='GLB',
        export_yup=True,
        export_apply=True,
        export_draco_mesh_compression_enable=False,
        use_selection=False,
        export_cameras=False,
        export_lights=False,
    )
    return os.path.abspath(OUT_GLB)
