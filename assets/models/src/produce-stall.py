"""
produce-stall - parametric generator for ASSET-15: a farm produce market stall.

    ProduceStall    one mesh, 12 material slots, 1 texture

A roadside farm stand built ON A TRAILER (owner direction 2026-08-17, replacing the
ticket's "trestle table"): ladder-frame chassis on a single axle with a tongue jack, a
plank deck, boxed-in posts under a peaked gable roof, five open crates of produce, and
a hand-painted sign leaning on the drawbar.

Built 2026-08-18 against Blender 5.2.0 LTS. Ships at 1752 tris (ART-STYLE mid-structure
band is 700-1800; the ticket's 1200 predates that table and needs amending), one packed
512x384 texture, 12 materials.

    exec(open('assets/models/src/produce-stall.py').read())

Final counts by material:
    StallCrate 300 | ProduceTomato 276 | StallFrame 260 | ProduceBeet 228
    StallPost 208 | ProduceMelon 156 | ProduceSquash 124 | StallTire 72
    ProduceCarrot 60 | StallSign 36 | StallRoof 20 | StallDeck 12

All dimensions are metres. Change a PARAM and re-run; do not hand-edit the mesh.

CONVENTIONS (.planning/research/ASSETS.md + ART-STYLE.md)
  * Base-seated: lowest point (tyre contact) at z=0. Overall 4.347 x 2.250 x 2.400.
  * Long axis along Blender +X; the OPEN SERVING SIDE faces Blender +Y, which becomes
    glTF -Z after the +Y-up export - so placement code turns the serving side to the road.
  * Flat colours, every face flat-shaded, metalness 0 throughout.

THREE DEPARTURES FROM THE TICKET, each an explicit owner call - do not "fix" them back:
  1. It is a TRAILER, not a trestle table (2026-08-17). That is why the footprint is
     4.35 m rather than the ticket's 3.0 - the drawbar adds 1.2 m ahead of the deck.
  2. Produce is MODELLED SOLIDS, not the ticket's alpha-tested cards. ART-STYLE rule 7
     bans transparency and the prop pipeline is no-alpha-blend for iGPU reasons.
  3. The sign IS textured (2026-08-18), on the same grounds news-roll.glb earned its
     texture: printed text is information geometry cannot carry. Drawing the letters as
     geometry cost 784 tris - 29% of the model - and still could not carry grain or a
     two-tone shadowed letterform. See bake_sign_texture().

TEXTURE
  The sign artwork is BAKED BY THIS SCRIPT, not authored by hand - an orthographic
  render of flat emitters laid out in board metres, packed into the .blend. Re-running
  the generator reproduces the texture along with the mesh. Everything else in the file
  is untextured flat colour. Only the sign board's FRONT face carries real UVs; every
  other face collapses to a point on plain timber, or the back shows mirrored artwork.

  SIGN_FONT is a BUILD-TIME dependency only (macOS Georgia Bold Italic). The glyphs are
  baked to pixels, so the .glb carries no font reference; the script warns and falls
  back to Blender's built-in if the file is absent.

RECOLOUR / REGION VARIATION
  Material names are the runtime API, matched by substring exactly like the vehicle
  loader does for paint. StallSign carries the artwork - swapping its image is how a
  region gets different lettering, with no re-model.
"""

import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix

NAME = "ProduceStall"

# ---------------------------------------------------------------------------
# PARAMS
# ---------------------------------------------------------------------------

# --- deck / chassis envelope ---
DECK_L      = 3.00   # deck length along X
DECK_W      = 1.80   # deck width along Y
DECK_THK    = 0.05   # plank thickness
DECK_Z      = 0.82   # top of the frame rails = underside of the deck planks
                     # (set so a useful slice of wheel shows below the rails - at 0.70
                     #  the tyre hid behind the rail and the trailer read as a cart)

FRAME_W     = 1.70   # rail centreline spread (outer faces just inside the deck edge)
RAIL_W      = 0.07   # rail thickness in Y
RAIL_D      = 0.14   # rail depth in Z
N_CROSS     = 5      # ladder rungs between the rails
CROSS_W     = 0.06
CROSS_D     = 0.10

# --- drawbar ---
TONGUE_L    = 0.95   # from the front cross member to the coupler
TONGUE_W    = 0.06
TONGUE_D    = 0.10
COUPLER_L   = 0.18

# --- tongue jack (the trailer has to stand on something other than its wheels) ---
JACK_X      = 2.20   # on the drawbar centreline, just aft of the coupler
JACK_TUBE   = 0.075  # outer tube, square section
JACK_TOP    = 0.98   # top of the outer tube, above the drawbar
JACK_SLIDE  = 0.42   # bottom of the outer tube = top of the extended inner leg
JACK_LEG    = 0.055  # inner leg section
JACK_FOOT   = 0.17   # foot pad, square
JACK_FOOT_T = 0.05
JACK_CRANK  = 0.24   # crank arm length in Y
JACK_GRIP   = 0.11

# --- running gear ---
TIRE_R      = 0.33
TIRE_W      = 0.18
TIRE_SIDES  = 10
AXLE_X      = -0.15  # axle sits aft of deck centre so the tongue carries load
FENDER_GAP  = 0.06   # tyre crown -> fender underside
FENDER_THK  = 0.02
FENDER_SEGS = 3      # 3 facets: front slope, flat-ish top, rear slope
RIM_R       = 0.19   # painted steel rim, flat cap (no dish) like the vehicle wheels
RIM_PROUD   = 0.014  # how far the rim stands out past the tyre sidewall

# --- superstructure ---
POST_S      = 0.09   # posts are square in plan
POST_INSET  = 0.10   # post centreline inset from the deck edge
N_POSTS     = 3      # per side, evenly spaced along X
EAVE_Z      = 1.88   # top of the posts / plates. The roof UNDERSIDE is built to land
                     # exactly here at the post line and carry on down to the eave, so
                     # the roof sits ON the frame instead of floating above it.
PEAK_Z      = 2.40   # ridge - the ticket's overall height
PLATE_D     = 0.10   # top plate (the beam the rafters sit on) depth in Z
ROOF_THK    = 0.06
ROOF_OVER_Y = 0.22   # eave overhang past the deck edge - shades the serving side
GABLE_THK   = 0.05   # gable-end infill panel thickness in X

# --- crates (open-topped, to be populated with fruit in a later pass) ---
CRATE_THK   = 0.028  # board thickness (scaled with the crates)
# (length X, width Y, height Z, yaw deg, x, y, stack-on-index or None)
# Sizes are the original set x1.5. Reseated to suit: the posts stand at |y| >= 0.755,
# so every crate is kept inside |y| <= 0.70 and clears them at any x.
CRATES = [
    (0.78, 0.54, 0.42,  -6.0, -1.00,  0.36, None),   # display row, pushed to the road
    (0.66, 0.48, 0.36,  11.0, -0.30, -0.40, None),   # stock, kept back
    (0.93, 0.60, 0.26,   3.0,  0.42,  0.36, None),   # shallow tray, display row
    (0.60, 0.45, 0.45,  -9.0,  1.10, -0.34, None),
    (0.54, 0.41, 0.30,  16.0,  1.10, -0.34, 3),      # stacked on the tall one
]

# --- produce ---
# Modelled as flat-shaded solids, NOT the ticket's alpha-tested cards: ART-STYLE.md
# rule 7 bans transparency outright and the prop pipeline is no-alpha-blend for iGPU
# reasons. Everything here is a 10-24 tri faceted blob or a 8-tri cone.
#
# The fill layer sits at RIM HEIGHT, not on the crate floor. A watermelon resting on
# the floor of a 0.42 m crate tops out at 0.22 and you would be looking into an empty
# box; the grid is sized to cover the opening so the hollow below never shows.
PRODUCE_SEED  = 20260818
PRODUCE_LIFT  = 0.045   # how far the mound crowns above the crate rim
PRODUCE_JIT   = 0.30    # grid jitter, as a fraction of the cell
# Everything here is DOUBLE life size (owner call 2026-08-18) - a real 9 cm tomato
# vanished at driving distance. The scaling is uniform across all five so the display
# stays internally consistent; the side effect is a 0.60 m watermelon, which no longer
# fits two-abreast in its crate (see the melon grid below).
#
# Facets are stated per item rather than derived from size. seg is the count AROUND the
# equator, which for an elongated item is the count ALONG its length - so seg is the
# knob that stops a squash reading as a football, and rings is the knob that stops a
# watermelon's ends coming to a point.
# (crate index, material, grid nx x ny, radii (rx, ry, rz), shape, seg, rings)
PRODUCE = [
    (0, "ProduceMelon",  (1, 1), (0.300, 0.186, 0.186), "blob", 8, 4),
    (1, "ProduceBeet",   (3, 2), (0.096, 0.096, 0.088), "blob", 6, 3),
    (2, "ProduceTomato", (4, 2), (0.092, 0.092, 0.086), "blob", 6, 3),
    (3, "ProduceSquash", (1, 2), (0.210, 0.086, 0.086), "blob", 7, 3),
    (4, "ProduceCarrot", (1, 3), (0.046, 0.046, 0.210), "cone", 5, 0),
]
# Loose stock scattered on the deck around the crates. COUNTS, not coordinates: at
# double size a 0.60 m watermelon overhangs a 1.8 m deck from positions that looked
# perfectly fine by eye on the previous pass, and hand-tuned coordinates go stale the
# moment a crate moves. The generator seeds a search instead and places biggest-first
# against the deck edge, the posts, the crate footprints and the items already down.
MELON  = ((0.300, 0.186, 0.186), "blob", 8, 4)
BEET   = ((0.096, 0.096, 0.088), "blob", 6, 3)
TOMATO = ((0.092, 0.092, 0.086), "blob", 6, 3)
SQUASH = ((0.210, 0.086, 0.086), "blob", 7, 3)
CARROT = ((0.046, 0.046, 0.210), "cone", 5, 0)
PRODUCE_LOOSE = [
    ("ProduceMelon",  MELON,  2),
    ("ProduceSquash", SQUASH, 2),
    ("ProduceCarrot", CARROT, 3),
    ("ProduceTomato", TOMATO, 3),
    ("ProduceBeet",   BEET,   3),
]
PRODUCE_LOOSE_GAP = 0.03   # breathing room between loose items

# --- hand-painted sign, leaned against the drawbar ---
# THE LEAN IS DERIVED, NOT DIALLED IN. A sign propped on the drawbar has to lie flat
# against it, so the board's yaw is taken from the beam's own plan angle and the lean
# off vertical is whatever puts the top edge at the beam's height. Both fall out of
# the tongue geometry - change TONGUE_L and the sign still leans on it.
SIGN_W      = 1.15   # board width, along the beam
SIGN_H      = 0.8625 # board height. EXACTLY SIGN_W * 384/512 so the baked
                     # texture maps 1:1 with no stretch and no letterboxing.
SIGN_THK    = 0.04
SIGN_PLANKS = 1      # ONE board, as in the reference - gaps cut through the letters
SIGN_GAP    = 0.012
SIGN_BEAM_T = 0.5    # where along the drawbar beam the board rests (0 = frame, 1 = tip)
SIGN_TEXT   = ("FRESH", "FRUIT")
# Lines are scaled to FILL the board rather than set at a fixed cap height - that edge
# to edge fit is most of what makes the reference read as signwritten. Fraction of the
# width inside the border rule, and the height of each line's centre as a fraction of
# the board.
SIGN_TXT_FILL = 0.94
SIGN_TXT_ROWS = (0.645, 0.355)   # symmetric about 0.5 - the block sits centred
# THE SIGN IS THE ONE TEXTURED SURFACE (owner call 2026-08-18), on the same grounds
# news-roll.glb earned its texture: ART-STYLE.md rule 1 allows an image only for
# information geometry cannot carry, and names printed text as the example. Drawing the
# letters as geometry cost 784 tris - 29% of the whole model - and still could not carry
# grain, wear or a two-tone shadowed letter. The artwork is BAKED here, not authored by
# hand: the generator renders it from an orthographic camera and packs the result, so
# re-running this script reproduces the texture along with the mesh.
SIGN_TEX_W  = 512    # board aspect is SIGN_W : SIGN_H = 512 : 384 exactly, by design
SIGN_TEX_H  = 384
SIGN_EDGE   = 0.022  # green painted edge around the very rim of the board
# Board seams. These were randomised streaks and read as arbitrary lines rather than
# as timber - randomness only sells grain when there is enough of it to average out.
# Now it is honest tongue-and-groove: SIGN_PLANK_N boards of EQUAL height, separated by
# identical seams. Consistent beats naturalistic at this resolution.
SIGN_PLANK_N   = 6       # boards making up the face; 0 turns the seams off entirely
SIGN_SEAM_W    = 0.006   # seam thickness in board metres
SIGN_SEAM_TONE = 0.55    # seam darkness as a fraction of the board colour
SIGN_TXT_RES = 0     # font curve resolution. 0 = one segment per Bezier span, the
                     # floor. Measured on this font: res 0 costs 388 tris for the ten
                     # letters, res 2 costs 656, res 3 costs 862 - and at sign scale
                     # through fog none of that extra outline is visible.
# Hand-painted look, all as flat proud geometry rather than a texture: a green border
# rule inside the board edge, and every glyph drawn twice - a green shadow offset down
# and right, with the cream letter riding on top of it. That offset shadow is what
# separates "signwritten" from "text on a plank".
SIGN_BORDER_IN = 0.055   # border rule inset from the board edge
SIGN_BORDER_W  = 0.030   # its stroke width
SIGN_SHADOW    = 0.016   # shadow offset (down and to the right, as in the reference)
SIGN_FONT   = "/System/Library/Fonts/Supplemental/Georgia Bold Italic.ttf"
ROOF_OVER_X = 0.15   # gable-end overhang

# ---------------------------------------------------------------------------
# COLOURS  (LINEAR - renders ~1.5x lighter than the number reads; ART-STYLE rule 5)
# ---------------------------------------------------------------------------
MATERIALS = [
    ("StallFrame", (0.045, 0.048, 0.052), 0.55),   # dark steel chassis - sits it down
    ("StallDeck",  (0.135, 0.080, 0.042), 0.90),   # warm timber deck, kept DARK so the
                                                   # crates standing on it read as separate
    ("StallTire",  (0.012, 0.012, 0.013), 0.95),   # rubber
    ("StallPost",  (0.620, 0.600, 0.540), 0.85),   # painted timber - the light element
    ("StallRoof",  (0.300, 0.055, 0.035), 0.55),   # barn red tin - the saturated accent
    ("StallCrate", (0.255, 0.160, 0.072), 0.92),   # raw crate timber, lighter than the deck
    # The board carries the baked artwork. NAME IS THE API: swapping this material's
    # image is how a region gets different lettering, with no re-model.
    ("StallSign",  (1.000, 1.000, 1.000), 0.92),   # white - the texture supplies the colour
    # Produce. One material per colour, because that IS the point of a market display -
    # you cannot have red tomatoes and orange carrots share a draw call. Saturated
    # against the desaturated world, per ART-STYLE rule 5.
    ("ProduceMelon",  (0.016, 0.062, 0.018), 0.60),   # watermelon rind, dark green
    ("ProduceTomato", (0.420, 0.032, 0.020), 0.45),   # tomato red, slightly glossy
    ("ProduceSquash", (0.520, 0.330, 0.030), 0.50),   # YELLOW squash - see report note
    ("ProduceCarrot", (0.580, 0.150, 0.018), 0.55),
    ("ProduceBeet",   (0.130, 0.018, 0.052), 0.55),   # deep beetroot purple
]                                                     # Trim = border rule + letter shadow

# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------

def box(bm, x0, x1, y0, y1, z0, z1, mat, xf=None):
    """Axis-aligned box, optionally placed by a 4x4 transform (crates, the sign)."""
    c = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
         (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    if xf is not None:
        c = [tuple(xf @ Vector(p)) for p in c]
    v = [bm.verts.new(p) for p in c]
    quads = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
             (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    fs = []
    for q in quads:
        f = bm.faces.new([v[i] for i in q])
        f.material_index = mat
        f.smooth = False
        fs.append(f)
    return fs


def beam(bm, p0, p1, w, z0, z1, mat):
    """Box beam running from p0 to p1 in the XY plane, w wide, spanning z0..z1."""
    a, b = Vector((p0[0], p0[1], 0.0)), Vector((p1[0], p1[1], 0.0))
    d = (b - a)
    d.normalize()
    n = Vector((-d.y, d.x, 0.0)) * (w * 0.5)
    corners = [a - n, b - n, b + n, a + n]
    lo = [bm.verts.new((c.x, c.y, z0)) for c in corners]
    hi = [bm.verts.new((c.x, c.y, z1)) for c in corners]
    quads = [(lo[0], lo[3], lo[2], lo[1]), (hi[0], hi[1], hi[2], hi[3])]
    for i in range(4):
        j = (i + 1) % 4
        quads.append((lo[i], lo[j], hi[j], hi[i]))
    for q in quads:
        f = bm.faces.new(q)
        f.material_index = mat
        f.smooth = False


def cylinder_x(bm, cx, cy, cz, r, half_w, sides, mat):
    """Faceted cylinder with its axis along Y (a wheel), centred at (cx, cy, cz)."""
    ring_a, ring_b = [], []
    for i in range(sides):
        t = 2.0 * math.pi * i / sides
        x = cx + r * math.cos(t)
        z = cz + r * math.sin(t)
        ring_a.append(bm.verts.new((x, cy - half_w, z)))
        ring_b.append(bm.verts.new((x, cy + half_w, z)))
    for i in range(sides):
        j = (i + 1) % sides
        f = bm.faces.new((ring_a[i], ring_a[j], ring_b[j], ring_b[i]))
        f.material_index = mat
        f.smooth = False
    for ring, flip in ((ring_a, True), (ring_b, False)):
        f = bm.faces.new(list(reversed(ring)) if flip else list(ring))
        f.material_index = mat
        f.smooth = False


def arch_band(bm, cx, cz, r, thk, y0, y1, a0, a1, segs, mat):
    """A swept, faceted band over an arc in the XZ plane - the trailer fender.
    Solid (outer + inner skin + two side walls + two end caps) so it reads from
    every angle without needing a double-sided material."""
    def ring(rad):
        pts = []
        for i in range(segs + 1):
            t = a0 + (a1 - a0) * i / segs
            pts.append((cx + rad * math.cos(t), cz + rad * math.sin(t)))
        return pts
    outer, inner = ring(r + thk), ring(r)

    def V(p, y):
        return bm.verts.new((p[0], y, p[1]))

    ov = [[V(p, y0) for p in outer], [V(p, y1) for p in outer]]
    iv = [[V(p, y0) for p in inner], [V(p, y1) for p in inner]]

    def quad(a, b, c, d):
        f = bm.faces.new((a, b, c, d))
        f.material_index = mat
        f.smooth = False

    for i in range(segs):
        quad(ov[0][i], ov[0][i + 1], ov[1][i + 1], ov[1][i])          # outer skin
        quad(iv[1][i], iv[1][i + 1], iv[0][i + 1], iv[0][i])          # inner skin
        quad(iv[0][i], iv[0][i + 1], ov[0][i + 1], ov[0][i])          # side y0
        quad(ov[1][i], ov[1][i + 1], iv[1][i + 1], iv[1][i])          # side y1
    quad(iv[0][0], ov[0][0], ov[1][0], iv[1][0])                      # end cap a0
    quad(iv[1][segs], ov[1][segs], ov[0][segs], iv[0][segs])          # end cap a1


def extrude_x(bm, profile, x0, x1, mat):
    """Closed solid from a CCW (y, z) cross-section swept from x0 to x1, capped both
    ends. Used for the roof: one manifold gable rather than two butted slabs, which
    would leave a coincident face pair and eight boundary edges at the ridge."""
    a = [bm.verts.new((x0, y, z)) for (y, z) in profile]
    b = [bm.verts.new((x1, y, z)) for (y, z) in profile]
    n = len(profile)

    def face(vs):
        f = bm.faces.new(vs)
        f.material_index = mat
        f.smooth = False

    for i in range(n):
        j = (i + 1) % n
        face((a[i], a[j], b[j], b[i]))
    face(list(reversed(a)))
    face(b)


def prism(bm, top, thk, mat, skip_sides=()):
    """Solid slab from a 4-point top face, extruded straight down by thk.
    skip_sides omits side walls by index - used to drop the ridge faces, which are
    sealed between the two roof slabs and would otherwise be a coplanar pair."""
    hi = [bm.verts.new(p) for p in top]
    lo = [bm.verts.new((p[0], p[1], p[2] - thk)) for p in top]

    def quad(vs):
        f = bm.faces.new(vs)
        f.material_index = mat
        f.smooth = False

    quad(hi)
    quad(list(reversed(lo)))
    for i in range(4):
        if i in skip_sides:
            continue
        j = (i + 1) % 4
        quad((lo[i], lo[j], hi[j], hi[i]))


def blob(bm, mat, xf, seg=6, rings=2):
    """Faceted unit sphere placed by xf (which carries the non-uniform scale).
    rings bands of seg meridians: 2*seg tris at rings=2, 4*seg at rings=3."""
    top = bm.verts.new(tuple(xf @ Vector((0.0, 0.0, 1.0))))
    bot = bm.verts.new(tuple(xf @ Vector((0.0, 0.0, -1.0))))
    rows = []
    for i in range(1, rings):
        phi = math.pi * i / rings
        z, r = math.cos(phi), math.sin(phi)
        rows.append([bm.verts.new(tuple(xf @ Vector(
            (r * math.cos(2 * math.pi * j / seg), r * math.sin(2 * math.pi * j / seg), z))))
            for j in range(seg)])

    def face(vs):
        f = bm.faces.new(vs)
        f.material_index = mat
        f.smooth = False

    for j in range(seg):
        k = (j + 1) % seg
        face((top, rows[0][j], rows[0][k]))
        face((bot, rows[-1][k], rows[-1][j]))
    for a, b in zip(rows, rows[1:]):
        for j in range(seg):
            k = (j + 1) % seg
            face((a[j], b[j], b[k], a[k]))


def cone(bm, mat, xf, seg=5):
    """Unit cone, base radius 1 at z=-0.5, apex at z=+0.5 - a carrot."""
    ring = [bm.verts.new(tuple(xf @ Vector(
        (math.cos(2 * math.pi * j / seg), math.sin(2 * math.pi * j / seg), -0.5))))
        for j in range(seg)]
    apex = bm.verts.new(tuple(xf @ Vector((0.0, 0.0, 0.5))))

    def face(vs):
        f = bm.faces.new(vs)
        f.material_index = mat
        f.smooth = False

    for j in range(seg):
        face((ring[j], ring[(j + 1) % seg], apex))
    face(list(reversed(ring)))


def produce_xf(pos, yaw, tilt, radii, shape):
    """Place one item. Cones are laid on their side so a carrot lies in the crate."""
    xf = Matrix.Translation(pos) @ Matrix.Rotation(yaw, 4, 'Z')
    if shape == "cone":
        xf = xf @ Matrix.Rotation(math.pi * 0.5 - tilt, 4, 'Y')
    else:
        xf = xf @ Matrix.Rotation(tilt, 4, 'Y')
    return xf @ Matrix.Diagonal((radii[0], radii[1], radii[2], 1.0))


def add_produce(bm, mat, xf, shape, seg, rings):
    """Never fewer than 3 rings: a 2-ring blob is a bipyramid, its poles are points,
    and a tomato built that way reads as a red SPIKE rather than a tomato.

    seg is the count AROUND the equator, which for an elongated item is the count
    ALONG its length - so seg is the knob that stops a squash reading as a football,
    and rings is the knob that stops a watermelon's ends coming to a point."""
    if shape == "cone":
        cone(bm, mat, xf, seg)
    else:
        blob(bm, mat, xf, seg, max(3, rings))


def crate(bm, l, w, h, thk, mat, xf):
    """Open-topped crate: floor plus four walls, built about a local origin at the
    centre of its base so the placing transform is just a yaw and a translate.
    Open on top because the next pass fills these with fruit."""
    hl, hw = l * 0.5, w * 0.5
    box(bm, -hl, hl, -hw, hw, 0.0, thk, mat, xf)                       # floor
    box(bm, -hl, hl, hw - thk, hw, thk, h, mat, xf)                    # long wall +Y
    box(bm, -hl, hl, -hw, -hw + thk, thk, h, mat, xf)                  # long wall -Y
    box(bm, -hl, -hl + thk, -hw + thk, hw - thk, thk, h, mat, xf)      # end wall -X
    box(bm, hl - thk, hl, -hw + thk, hw - thk, thk, h, mat, xf)        # end wall +X


# ---------------------------------------------------------------------------
# SIGN TEXTURE BAKE
# ---------------------------------------------------------------------------

def _emission(name, col):
    """Flat emitter. With the Standard view transform an emission of value v writes
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
    time - the .blend would grow a 512x384 image per run."""
    for img in list(bpy.data.images):
        if img.name.startswith("ProduceStallSign"):
            bpy.data.images.remove(img)
    for m in list(bpy.data.materials):
        if m.name.startswith(("Sign", "ProduceStallSign")) and m.users == 0:
            bpy.data.materials.remove(m)
    for sc in list(bpy.data.scenes):
        if sc.name.startswith("SignBake"):
            bpy.data.scenes.remove(sc)


def bake_sign_texture():
    """Render the sign artwork from an ortho camera and return a packed image.

    Everything is drawn in BOARD METRES in the XY plane and stacked in Z in painter's
    order, so the layout numbers here are the same numbers the geometry uses."""
    W, H = SIGN_W, SIGN_H
    rust = (0.290, 0.105, 0.028)
    green = (0.020, 0.055, 0.030)
    cream = (0.720, 0.680, 0.560)

    engines = {i.identifier for i in
               bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items}
    sc = bpy.data.scenes.new("SignBake")
    sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engines else 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = SIGN_TEX_W, SIGN_TEX_H
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'Standard'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGB'

    cam_data = bpy.data.cameras.new("SignCam")
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = W
    cam = bpy.data.objects.new("SignCam", cam_data)
    cam.location = (0.0, 0.0, 2.0)
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

    def text(body, x, y, z, col, tag, inner_w):
        cu = bpy.data.curves.new(tag, type='FONT')
        cu.body = body
        cu.size = 1.0
        cu.align_x = 'CENTER'
        cu.align_y = 'CENTER'
        try:
            cu.font = bpy.data.fonts.load(SIGN_FONT, check_existing=True)
        except (RuntimeError, OSError):
            print("WARN: sign font not found, falling back to Bfont:", SIGN_FONT)
        o = bpy.data.objects.new(tag, cu)
        mat = _emission(tag, col)
        scratch_mats.append(mat)
        cu.materials.append(mat)
        sc.collection.objects.link(o)
        scratch.append(o)
        me = o.to_mesh()
        xs = [v.co.x for v in me.vertices]
        ys = [v.co.y for v in me.vertices]
        k = inner_w / (max(xs) - min(xs)) if xs and max(xs) > min(xs) else 1.0
        # align_y='CENTER' centres on the FONT's metrics, which reserve descender space
        # these all-caps lines never use - so the block sat low. Centre on the measured
        # glyph bounding box instead and the row number means what it says.
        mid = (max(ys) + min(ys)) * 0.5 if ys else 0.0
        o.to_mesh_clear()
        o.scale = (k, k, k)
        o.location = (x, y - k * mid, z)

    # painter's order, back to front
    rect(-W / 2, W / 2, -H / 2, H / 2, 0.00, green, "SignEdge")
    e = SIGN_EDGE
    rect(-W / 2 + e, W / 2 - e, -H / 2 + e, H / 2 - e, 0.01, rust, "SignBoard")
    i, bw = SIGN_BORDER_IN, SIGN_BORDER_W
    rect(-W / 2 + i, W / 2 - i, -H / 2 + i, H / 2 - i, 0.02, green, "SignRule")
    j = i + bw
    rect(-W / 2 + j, W / 2 - j, -H / 2 + j, H / 2 - j, 0.03, rust, "SignField")

    # board seams: evenly spaced, identical width, identical tone
    seam = tuple(ch * SIGN_SEAM_TONE for ch in rust)
    field_lo, field_hi = -H / 2 + j, H / 2 - j
    for g in range(1, SIGN_PLANK_N):
        gy = field_lo + (field_hi - field_lo) * g / SIGN_PLANK_N
        rect(-W / 2 + j, W / 2 - j, gy - SIGN_SEAM_W * 0.5, gy + SIGN_SEAM_W * 0.5,
             0.04, seam, "SignSeam%d" % g)

    inner_w = (W - 2 * j) * SIGN_TXT_FILL
    for li, line in enumerate(SIGN_TEXT):
        ly = SIGN_TXT_ROWS[li] * H - H / 2
        # shadow down and to the right, then the cream letter over it
        text(line, SIGN_SHADOW, ly - SIGN_SHADOW, 0.05, green, "SignShadow%d" % li, inner_w)
        text(line, 0.0, ly, 0.06, cream, "SignLetter%d" % li, inner_w)

    path = os.path.join(bpy.app.tempdir, "produce-stall-sign.png")
    sc.render.filepath = path
    win = bpy.context.window
    prev = win.scene
    win.scene = sc
    try:
        bpy.ops.render.render(write_still=True)
    finally:
        win.scene = prev

    img = bpy.data.images.load(path, check_existing=False)
    img.name = "ProduceStallSign"
    img.pack()                # NEVER leave it in tempdir - that is wiped on quit
    img.filepath_raw = ""

    for o in scratch + [cam]:
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.scenes.remove(sc)
    for m in scratch_mats:
        bpy.data.materials.remove(m)
    bpy.data.cameras.remove(cam_data)
    return img


# ---------------------------------------------------------------------------
# BUILD
# ---------------------------------------------------------------------------

def build():
    _purge_bake_leftovers()
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for me in list(bpy.data.meshes):
        bpy.data.meshes.remove(me)

    bm = bmesh.new()
    MI = {name: i for i, (name, _, _) in enumerate(MATERIALS)}
    FRAME, DECK, TIRE = MI["StallFrame"], MI["StallDeck"], MI["StallTire"]
    POST, ROOF = MI["StallPost"], MI["StallRoof"]
    CRATE, SIGN = MI["StallCrate"], MI["StallSign"]

    x0, x1 = -DECK_L * 0.5, DECK_L * 0.5
    rail_z0, rail_z1 = DECK_Z - RAIL_D, DECK_Z
    ry = FRAME_W * 0.5

    # --- ladder frame: two long rails ---
    for s in (-1, 1):
        yc = s * ry
        box(bm, x0, x1, yc - RAIL_W * 0.5, yc + RAIL_W * 0.5, rail_z0, rail_z1, FRAME)

    # --- ladder frame: cross members (rungs), flush with the rail tops ---
    for i in range(N_CROSS):
        t = i / (N_CROSS - 1)
        xc = x0 + t * (x1 - x0)
        # the end rungs sit fully inboard of the rail ends
        xc = min(max(xc, x0 + CROSS_W * 0.5), x1 - CROSS_W * 0.5)
        box(bm, xc - CROSS_W * 0.5, xc + CROSS_W * 0.5,
            -ry + RAIL_W * 0.5, ry - RAIL_W * 0.5,
            rail_z1 - CROSS_D, rail_z1, FRAME)

    # --- drawbar: an A-frame converging to the coupler ---
    tip_x = x1 + TONGUE_L
    beam_p0 = Vector((x1 - 0.02, ry - RAIL_W * 0.5, 0.0))   # +Y beam, the one the sign leans on
    beam_p1 = Vector((tip_x, 0.0, 0.0))
    for s in (-1, 1):
        beam(bm, (x1 - 0.02, s * (ry - RAIL_W * 0.5)), (tip_x, 0.0),
             TONGUE_W, rail_z1 - TONGUE_D, rail_z1, FRAME)
    box(bm, tip_x - COUPLER_L * 0.5, tip_x + COUPLER_L * 0.5,
        -0.055, 0.055, rail_z1 - TONGUE_D - 0.05, rail_z1 + 0.02, FRAME)

    # --- tongue jack ---
    # Mounted on the centreline BETWEEN the two drawbar beams (they are at y ~ +/-0.21
    # here), tied to both by a cross bracket, so nothing interpenetrates.
    jx0, jx1 = JACK_X - JACK_TUBE * 0.5, JACK_X + JACK_TUBE * 0.5
    box(bm, jx0, jx1, -JACK_TUBE * 0.5, JACK_TUBE * 0.5, JACK_SLIDE, JACK_TOP, FRAME)
    box(bm, JACK_X - JACK_LEG * 0.5, JACK_X + JACK_LEG * 0.5,
        -JACK_LEG * 0.5, JACK_LEG * 0.5, JACK_FOOT_T, JACK_SLIDE + 0.03, FRAME)
    box(bm, JACK_X - JACK_FOOT * 0.5, JACK_X + JACK_FOOT * 0.5,
        -JACK_FOOT * 0.5, JACK_FOOT * 0.5, 0.0, JACK_FOOT_T, FRAME)
    # mount bracket spanning both drawbar beams
    box(bm, jx0 - 0.02, jx1 + 0.02, -0.26, 0.26,
        rail_z1 - TONGUE_D, rail_z1 - TONGUE_D + 0.05, FRAME)
    # crank: arm out in -Y with a grip on the end. Deliberately the FAR side from the
    # road (+Y is the serving face), so it never fouls the leaning sign.
    box(bm, JACK_X - 0.022, JACK_X + 0.022, -JACK_CRANK, -JACK_TUBE * 0.5,
        JACK_TOP - 0.075, JACK_TOP - 0.031, FRAME)
    box(bm, JACK_X - 0.020, JACK_X + 0.020, -JACK_CRANK, -JACK_CRANK + 0.042,
        JACK_TOP - 0.075 - JACK_GRIP, JACK_TOP - 0.031, FRAME)

    # --- deck planks (one slab; plank lines come later if they earn the tris) ---
    box(bm, x0, x1, -DECK_W * 0.5, DECK_W * 0.5, DECK_Z, DECK_Z + DECK_THK, DECK)

    # --- running gear ---
    # A faceted tyre rests on a FACET, not on the bottom of its circumscribed circle:
    # with TIRE_SIDES verts, two of them straddle the bottom and the flat between them
    # sits r*cos(pi/n) below the axle. Seat on that or the trailer floats (16 mm at n=10).
    axle_z = TIRE_R * math.cos(math.pi / TIRE_SIDES)
    wheel_y = ry + RAIL_W * 0.5 + 0.03 + TIRE_W * 0.5
    for s in (-1, 1):
        cylinder_x(bm, AXLE_X, s * wheel_y, axle_z, TIRE_R, TIRE_W * 0.5, TIRE_SIDES, TIRE)
        # painted steel rim, flat cap, standing proud of the sidewall
        rim_y = s * (wheel_y + TIRE_W * 0.5 + RIM_PROUD * 0.5)
        cylinder_x(bm, AXLE_X, rim_y, axle_z, RIM_R, RIM_PROUD * 0.5, TIRE_SIDES, POST)
        # fender: a 3-facet swept arch clearing the tyre crown
        fy0, fy1 = s * (wheel_y - TIRE_W * 0.5 - 0.03), s * (wheel_y + TIRE_W * 0.5 + 0.03)
        if fy0 > fy1:
            fy0, fy1 = fy1, fy0
        arch_band(bm, AXLE_X, axle_z, TIRE_R + FENDER_GAP, FENDER_THK, fy0, fy1,
                  math.radians(-8), math.radians(188), FENDER_SEGS, FRAME)

    # --- axle tube ---
    box(bm, AXLE_X - 0.04, AXLE_X + 0.04, -wheel_y, wheel_y,
        axle_z - 0.04, axle_z + 0.04, FRAME)

    # --- posts: N_POSTS a side, standing on the deck ---
    deck_top = DECK_Z + DECK_THK
    py = DECK_W * 0.5 - POST_INSET
    post_x0, post_x1 = x0 + POST_INSET, x1 - POST_INSET
    post_xs = [post_x0 + (post_x1 - post_x0) * i / (N_POSTS - 1) for i in range(N_POSTS)]
    for s_ in (-1, 1):
        for px in post_xs:
            box(bm, px - POST_S * 0.5, px + POST_S * 0.5,
                s_ * py - POST_S * 0.5, s_ * py + POST_S * 0.5,
                deck_top, EAVE_Z - PLATE_D, POST)
        # top plate tying the posts together - the rafters land on this
        box(bm, post_x0 - POST_S * 0.5, post_x1 + POST_S * 0.5,
            s_ * py - POST_S * 0.5, s_ * py + POST_S * 0.5,
            EAVE_Z - PLATE_D, EAVE_Z, POST)

    # --- gable-end boxing: end plates + a triangular infill under the roof ---
    # Closes the frame in at both ends so the stall reads as a built structure rather
    # than six loose posts holding a lid up.
    for xc in (post_x0, post_x1):
        box(bm, xc - POST_S * 0.5, xc + POST_S * 0.5,
            -py - POST_S * 0.5, py + POST_S * 0.5,
            EAVE_Z - PLATE_D, EAVE_Z, POST)

    # --- peaked roof: one gable solid, ridge running along X ---
    rx0, rx1 = x0 - ROOF_OVER_X, x1 + ROOF_OVER_X
    ey = DECK_W * 0.5 + ROOF_OVER_Y
    # The underside is pinned to the plate top at the post line (y = +/-py) and runs on
    # at that same slope out to the eave, so PEAK_Z stays the overall height.
    ridge_under = PEAK_Z - ROOF_THK
    slope = (ridge_under - EAVE_Z) / py          # metres of drop per metre of y
    under = lambda y: ridge_under - slope * abs(y)

    # constant-thickness gable: the underside follows the roof planes as a V ceiling,
    # so the gable ends read as a thin roof rather than a solid wedge
    roof_profile = [
        (-ey, under(ey) + ROOF_THK), (0.0, PEAK_Z), (ey, under(ey) + ROOF_THK),
        (ey, under(ey)), (0.0, ridge_under), (-ey, under(ey)),
    ]
    extrude_x(bm, roof_profile, rx0, rx1, ROOF)

    # gable infill: a triangle from the plate top up to the roof underside, both ends
    gable_profile = [(-py, EAVE_Z), (py, EAVE_Z), (0.0, ridge_under)]
    for xc in (post_x0, post_x1):
        extrude_x(bm, gable_profile, xc - GABLE_THK * 0.5, xc + GABLE_THK * 0.5, POST)

    # --- crates on the deck ---
    deck_surface = DECK_Z + DECK_THK
    tops, crate_xf = {}, {}
    for i, (cl, cw, ch, yaw, cx, cy, stack) in enumerate(CRATES):
        base = deck_surface if stack is None else tops[stack]
        xf = (Matrix.Translation((cx, cy, base))
              @ Matrix.Rotation(math.radians(yaw), 4, 'Z'))
        crate(bm, cl, cw, ch, CRATE_THK, CRATE, xf)
        tops[i], crate_xf[i] = base + ch, xf

    # --- produce, filling the crates ---
    # A crate has to look FULL, and packing it with individually modelled fruit is
    # what makes that unaffordable - a realistically dense tray of tomatoes is 60 of
    # them. So each crate gets a BED: a slab of the produce colour filling the box up
    # to just under the rim, 12 tris, hiding the floor. The modelled fruit then sits
    # half-buried in that bed and only has to carry the lumpy silhouette. Twelve tris
    # buys what another forty blobs would have cost.
    rng = random.Random(PRODUCE_SEED)
    for ci, matname, (nx, ny), radii, shape, seg, rings in PRODUCE:
        cl, cw, ch = CRATES[ci][0], CRATES[ci][1], CRATES[ci][2]
        mat = MI[matname]
        rest = radii[0] if shape == "cone" else radii[2]   # a laid cone rests on its radius
        bed_top = ch - rest * 1.6
        il, iw = cl * 0.5 - CRATE_THK, cw * 0.5 - CRATE_THK
        box(bm, -il, il, -iw, iw, CRATE_THK, bed_top, mat, crate_xf[ci])

        span_x = cl - 2 * CRATE_THK - 2 * radii[0]
        span_y = cw - 2 * CRATE_THK - 2 * radii[1]
        lift = bed_top + rest * 0.6 + PRODUCE_LIFT * 0.5
        for ix in range(nx):
            for iy in range(ny):
                fx = (ix + 0.5) / nx - 0.5
                fy = (iy + 0.5) / ny - 0.5
                jx = rng.uniform(-PRODUCE_JIT, PRODUCE_JIT) / nx
                jy = rng.uniform(-PRODUCE_JIT, PRODUCE_JIT) / ny
                pos = Vector(((fx + jx) * span_x, (fy + jy) * span_y,
                              lift + rng.uniform(-0.010, 0.010)))
                xf = crate_xf[ci] @ produce_xf(
                    pos, rng.uniform(0, math.pi * 2), rng.uniform(-0.22, 0.22),
                    radii, shape)
                add_produce(bm, mat, xf, shape, seg, rings)

    # --- loose stock sitting on the deck around the crates ---
    # Yaw is randomised, so each item is treated as a CIRCLE of its largest horizontal
    # radius and tested against the deck edge, the posts, every crate footprint and
    # everything already placed. Biggest first, because the melons have the fewest
    # legal spots and would otherwise be crowded out by the tomatoes.
    def crate_half(cl, cw, cyaw):
        c, sn = abs(math.cos(math.radians(cyaw))), abs(math.sin(math.radians(cyaw)))
        return (cl * 0.5 * c + cw * 0.5 * sn, cl * 0.5 * sn + cw * 0.5 * c)

    crate_boxes = [(c[4], c[5]) + crate_half(c[0], c[1], c[3]) for c in CRATES]
    placed = []

    def spot_ok(lx, ly, hard, soft):
        # Two radii, because the constraints are not the same kind. Hanging off the
        # deck or standing inside a post is a DEFECT, tested against the item's true
        # max extent. Touching a crate or another item is not - produce leans on
        # things - so those use a mean radius, which is also what lets a carrot (a
        # 0.42 x 0.09 stick, not a 0.42 circle) tuck in beside a crate at all.
        if abs(lx) + hard > DECK_L * 0.5 or abs(ly) + hard > DECK_W * 0.5:
            return False
        for pxx in post_xs:
            for sgn in (-1, 1):
                if (abs(lx - pxx) < hard + POST_S * 0.5
                        and abs(ly - sgn * py) < hard + POST_S * 0.5):
                    return False
        for cx, cy, hx, hy in crate_boxes:
            if abs(lx - cx) < soft + hx and abs(ly - cy) < soft + hy:
                return False
        for ox, oy, orad in placed:
            if math.hypot(lx - ox, ly - oy) < soft + orad + PRODUCE_LOOSE_GAP:
                return False
        return True

    grid = [(-DECK_L * 0.5 + 0.05 * i, -DECK_W * 0.5 + 0.05 * j)
            for i in range(int(DECK_L / 0.05) + 1) for j in range(int(DECK_W / 0.05) + 1)]
    order = sorted(PRODUCE_LOOSE,
                   key=lambda e: -max(e[1][0][0], e[1][0][1],
                                      e[1][0][2] if e[1][1] == "cone" else 0.0))
    for matname, (radii, shape, seg, rings), count in order:
        horiz = (radii[0], radii[2]) if shape == "cone" else (radii[0], radii[1])
        hard = max(horiz)
        soft = (max(horiz) + min(horiz)) * 0.5
        rest = radii[0] if shape == "cone" else radii[2]
        cand = [g for g in grid]
        rng.shuffle(cand)
        put = 0
        for lx, ly in cand:
            if put >= count:
                break
            if not spot_ok(lx, ly, hard, soft):
                continue
            placed.append((lx, ly, soft))
            put += 1
            xf = produce_xf(Vector((lx, ly, deck_surface + rest)),
                            rng.uniform(0, math.pi * 2), rng.uniform(-0.12, 0.12),
                            radii, shape)
            add_produce(bm, MI[matname], xf, shape, seg, rings)
        if put < count:
            print("NOTE: only placed %d/%d loose %s - deck is full" % (put, count, matname))

    # --- sign board, leaned against the drawbar ---
    # Local frame: width along X, height along Z with the bottom edge at z=0, face
    # toward +Y. Yaw comes from the beam's own plan angle so the board lies FLAT on it
    # rather than touching at one corner; the lean is then whatever puts the top edge
    # at the beam's height.
    bd = (beam_p1 - beam_p0)
    bd.z = 0.0
    bd.normalize()
    sign_yaw = math.atan2(bd.y, bd.x)
    nrm = Vector((-bd.y, bd.x, 0.0))            # board face direction, away from the trailer
    contact_z = rail_z1 - TONGUE_D * 0.5        # mid-height of the beam
    sign_lean = math.acos(min(1.0, contact_z / SIGN_H))
    contact = (beam_p0.lerp(beam_p1, SIGN_BEAM_T) + nrm * (TONGUE_W * 0.5))
    origin = contact + nrm * (SIGN_H * math.sin(sign_lean))
    sign_xf = (Matrix.Translation((origin.x, origin.y, 0.0))
               @ Matrix.Rotation(sign_yaw, 4, 'Z')
               @ Matrix.Rotation(sign_lean, 4, 'X'))
    plank_h = (SIGN_H - SIGN_GAP * (SIGN_PLANKS - 1)) / SIGN_PLANKS
    for i in range(SIGN_PLANKS):
        pz = i * (plank_h + SIGN_GAP)
        box(bm, -SIGN_W * 0.5, SIGN_W * 0.5, 0.0, SIGN_THK,
            pz, pz + plank_h, SIGN, sign_xf)
    # two battens on the back holding the planks together
    for bx in (-SIGN_W * 0.28, SIGN_W * 0.28):
        box(bm, bx - 0.045, bx + 0.045, -0.028, 0.0, 0.06, SIGN_H - 0.06,
            SIGN, sign_xf)

    # Every piece is a closed shell, so let bmesh settle the windings outward rather
    # than reasoning about loop order per helper (ART-STYLE: prove it, don't eyeball).
    # Nothing here is a single-sided decal any more - the sign artwork is a texture -
    # so recalc has a volume to orient every face by.
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])

    me = bpy.data.meshes.new(NAME)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(NAME, me)
    bpy.context.collection.objects.link(ob)

    # --- UVs: only the sign board needs them, but the layer has to exist mesh-wide ---
    # The board's FRONT face maps to the whole image; every other face - back, four
    # edges, battens - collapses to one point just inside the board corner, which is
    # plain painted timber. Without that, the back of the sign shows the artwork
    # mirrored, which is exactly the sort of thing you cannot spot from one screenshot.
    uv = me.uv_layers.new(name="UVMap")
    inv = sign_xf.inverted()
    inv3 = inv.to_3x3()
    # Sample point for every non-front face: midway between the green painted edge
    # (ends at SIGN_EDGE) and the green border rule (starts at SIGN_BORDER_IN), which
    # is the one band of plain rust timber on the whole board.
    plain_m = (SIGN_EDGE + SIGN_BORDER_IN) * 0.5
    plain = (plain_m / SIGN_W, plain_m / SIGN_H)
    for poly in me.polygons:
        front = (poly.material_index == SIGN
                 and (inv3 @ poly.normal).y > 0.9)
        for li in poly.loop_indices:
            if front:
                q = inv @ me.vertices[me.loops[li].vertex_index].co
                # u is FLIPPED against local +x on purpose. A viewer facing the board
                # looks down local -y with +z up, so their right is d x u =
                # (0,-1,0) x (0,0,1) = (-1,0,0): image-right must land on local -x, or
                # the lettering comes out mirrored.
                uv.data[li].uv = ((SIGN_W * 0.5 - q.x) / SIGN_W, q.z / SIGN_H)
            else:
                uv.data[li].uv = plain

    for name, col, rough in MATERIALS:
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = (*col, 1.0)
        bsdf.inputs["Roughness"].default_value = rough
        bsdf.inputs["Metallic"].default_value = 0.0
        if name == "StallSign":
            for n in list(mat.node_tree.nodes):
                if n.type == 'TEX_IMAGE':
                    mat.node_tree.nodes.remove(n)
            tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
            tex.image = bake_sign_texture()
            tex.interpolation = 'Closest' if SIGN_TEX_W < 256 else 'Linear'
            mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        me.materials.append(mat)

    for p in me.polygons:
        p.use_smooth = False
    return ob


ob = build()
print("TRIS:", sum(len(p.vertices) - 2 for p in ob.data.polygons))
