"""
ASSET-14 - the lone gas pump, parametric generator.

Built for: Blender 5.x  |  Target: assets/models/gas-pump.glb
Style brief: .planning/research/ART-STYLE.md  |  Mechanics: .planning/research/ASSETS.md

RESHAPED BY OWNER 2026-08-22.  The ticket specified ONE pump on a small pad.  The
owner's brief replaced that with the roadside island from the reference photo: a
tall vertical pole carrying a lit GAS sign, and at its foot TWO box pumps mounted
back to back so a car can pull up on either side.  So the asset is an ISLAND, not
a pump, and its footprint, tri count and collision box all grew accordingly --
see the ticket's Resolution note.  The name gas-pump.glb is kept because it is the
name the acceptance criteria and the model registry use.

ONE TEXTURE, AND ONLY FOR THE WORD.  512x192, carrying nothing but "GAS" on a
white field.  That is the ART-STYLE rule-1 lettering exception (news-roll, then
produce-stall): a texture buys information geometry cannot carry, which is
printed words and nothing else.  The ticket also budgeted the texture for "dial
face, faded livery, rust streaks, price digits" -- all four are WEAR or are too
small to read at driving distance, so all four are dropped.  The pump registers
are modelled as two pale windows in a dark bezel, with no digits.

THE ARTWORK IS BAKED BY THIS SCRIPT, not hand-painted -- an orthographic render
of flat emitters laid out in sign metres, packed into the .blend.  Re-running the
generator reproduces the texture along with the mesh, so the sign's proportions
and its pixels can never drift apart.  The font is baked to pixels, so the .glb
carries no font reference; the script warns and falls back to Bfont if the font
is missing.

FIVE MATERIALS = five draw calls.  This is a POI placed a handful of times, not
scatter density, so five is affordable.
  PumpConcrete  the island slab.  Mid grey, the ground the whole thing sits on.
  PumpBody      cream cabinet tops, the pole, the sign arm, the sign bezel.
  PumpSkirt     the faded-red lower panels.  THE RECOLOURABLE ONE (see below).
  PumpTrim      every dark part: plinth, dial bezel, holsters, nozzles, hoses.
                Hose and bezel do NOT get their own materials -- same colour,
                same role, so the ART-STYLE rule-6 merge applies and two draw
                calls are saved.
  PumpSign      the baked GAS artwork.  Textured; everything else is flat.

RECOLOUR: PumpSkirt only.  A curated pool belongs on the data/prop-models.js
entry per the 2026-08-21 palette ruling, not here.  The other four are fixed --
the pole and sign read as "gas station" precisely because they are always white.

VALUE STRUCTURE (ART-STYLE rule 5), bottom to top: near-black plinth seats the
pumps, faded red skirts carry the only saturation, cream cabinets lift, then a
white pole runs up to a white sign with black letters at 4 m.  The sign is the
silhouette the player actually navigates by -- everything below it is detail they
only get when they have already arrived.

FORWARD IS -Z (glTF), i.e. +Y in Blender: that is the direction the FIRST pump's
dial, holster-side nozzle and hose face, and one of the two faces the sign reads
from.  The second pump is that pump mirrored through y = 0, so the island is
symmetric about its long axis and either approach direction works.  Base-seated:
the island slab's underside is at exactly z = 0 in Blender (y = 0 in the GLB).

AXIS NOTE.  The exporter's "+Y up" maps blender (x,y,z) -> gltf (x, z, -y).  So
glTF -Z (forward) is blender +Y, and the island's long axis X survives unchanged.
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
PAD_X0, PAD_X1 = -1.35, 0.95     # 2.30 m along the island
PAD_Y = 0.62                     # half-width, 1.24 m across
PAD_H = 0.16
PAD_BATTER = 0.05                # how far the top face is inset from the bottom

# --- pole ---
POLE_X = -0.95                   # at the far end of the island from the pumps
POLE_R = 0.065
POLE_SIDES = 8
POLE_TOP = 4.55
COLLAR_R = 0.105                 # cast base collar, the thing that sits it down
COLLAR_TOP = 0.34

# --- sign arm and sign box ---
ARM_X1 = 0.62                    # arm runs +X from the pole, out over the pumps
ARM_Z0, ARM_Z1 = 4.09, 4.20
ARM_HW = 0.045                   # half-thickness across Y
BRACE_Z = 3.62                   # where the diagonal brace leaves the pole
BRACE_X = -0.34                  # where it meets the arm
BRACE_W = 0.05

# Floodlight part-way up, aimed down at the island.  It is in the reference photo,
# and without it the pole is 3 m of blank white in the middle of the silhouette.
LAMP_Z = 3.02
LAMP_REACH = 0.40
LAMP_ARM_W = 0.038
LAMP_HEAD = (0.17, 0.15)         # length along its own axis, cross-section
LAMP_DROP = 0.13                 # how far the head's far end hangs below its root

SIGN_CX = -0.12                  # sign box centre
SIGN_W = 1.46                    # box, along X
SIGN_H = 0.60                    # box, along Z
SIGN_T = 0.20                    # box, across Y
SIGN_CZ = 3.81
SIGN_TEXT = "GAS"
SIGN_FONT = "/System/Library/Fonts/Supplemental/Arial Black.ttf"

# The lit face plate. Its aspect MUST equal the texture's or the letters stretch:
# 1.40 / 0.525 = 2.6667 = 512 / 192, exactly.
SIGN_FACE_W = 1.40
SIGN_FACE_H = 0.525
SIGN_FACE_PROUD = 0.006          # stands off the bezel; 6 mm, well clear of the
                                 # 1 mm parallel-face z-fighting threshold
SIGN_FACE_T = 0.010              # plate thickness.  A single quad would be cheaper by
                                 # 10 tris and leave an open, non-manifold boundary --
                                 # closed geometry is worth more than 10 tris here.
SIGN_TEX_W = 512
SIGN_TEX_H = 192
SIGN_TXT_FILL = 0.62             # letter block width as a fraction of the face
SIGN_MARGIN = 0.055              # dark rule inset from the face edge, in face metres
SIGN_RULE_W = 0.022

# --- pumps ---
PUMP_CX = 0.30                   # both pumps sit at this X; they differ only in Y
PUMP_HW = 0.29                   # cabinet half-width along X
PUMP_Y0 = 0.015                  # cabinet back, just off the centreline: the 30 mm
PUMP_Y1 = 0.415                  # gap is what makes them read as TWO pumps
PLINTH_H = 0.24                  # dark base, shared by both cabinets
SKIRT_TOP = 0.78
CAB_TOP = 1.30
SKIRT_INSET = 0.012              # lower panel recessed: a free shadow line under
                                 # flat shading (ART-STYLE rule 2)
# The light panel on the roof is ONE box spanning BOTH cabinets, not one per pump.
# Mirrored per-pump panels stepped away from each other and read as two hats stacked
# behind one another; a single crown is what a back-to-back twin actually has, and
# it costs 12 tris instead of 24.
TOP_HW = 0.255
TOP_H = 0.14
TOP_INSET_Y = 0.022              # how far the crown is pulled in from the cabinet ends

BEZEL_HW = 0.235                 # dark register surround on the face
BEZEL_Z0, BEZEL_Z1 = 0.88, 1.20
BEZEL_PROUD = 0.010
WIN_Z0, WIN_Z1 = 0.93, 1.15      # the two pale register windows
WIN_GAP = 0.020
WIN_PROUD = 0.004

# Holster, nozzle, handle and hose, all on the +X end of the cabinet.  These X
# values are PUMP-LOCAL (0 = cabinet centre); the builder adds PUMP_CX.  Y and Z
# are already world, since the cabinet is not offset in either.
# The four boxes below are deliberately close together and share edges: they have
# to read as ONE hanging nozzle at 10 m, not as four dark sticks.
FIT_X0, FIT_X1 = 0.258, 0.330       # hose fitting, straddling the cabinet edge
FIT_Y0, FIT_Y1 = 0.298, 0.362
FIT_Z0, FIT_Z1 = 0.905, 0.985
BOOT_X0, BOOT_X1 = 0.283, 0.357     # holster the nozzle hangs in
BOOT_Y0, BOOT_Y1 = 0.155, 0.268
BOOT_Z0, BOOT_Z1 = 0.775, 0.888
NOZ_X0, NOZ_X1 = 0.295, 0.345       # nozzle body
NOZ_Y0, NOZ_Y1 = 0.172, 0.252
NOZ_Z0, NOZ_Z1 = 0.640, 0.800
SPOUT_X0, SPOUT_X1 = 0.307, 0.333   # spout, pointing down
SPOUT_Y0, SPOUT_Y1 = 0.188, 0.232
SPOUT_Z0, SPOUT_Z1 = 0.482, 0.655
LEVER_X0, LEVER_X1 = 0.299, 0.341   # the squeeze handle: the one detail the owner
LEVER_Y0, LEVER_Y1 = 0.250, 0.300   # asked for by name, so it gets real geometry
LEVER_Z0, LEVER_Z1 = 0.688, 0.728

HOSE_R = 0.018
HOSE_SIDES = 4
HOSE_SEGS = 6                       # 4 segments read as two straight sticks
# Cubic Bezier in pump-local coordinates: out of the fitting, sagging in a U that
# hugs the cabinet flank, then back up into the nozzle in its holster.  Keep the
# out-swing modest - past x ~ 0.42 local the loop hangs off the island entirely.
HOSE_P0 = (0.300, 0.330, 0.945)
HOSE_P1 = (0.430, 0.300, 0.560)
HOSE_P2 = (0.430, 0.120, 0.370)
HOSE_P3 = (0.320, 0.212, 0.855)   # ends INSIDE the holster box, so no open seam
                                  # and the loop never crosses in front of the grip

# ---------------------------------------------------------------------------
# COLOURS  (LINEAR - renders ~1.5x lighter than the number reads; ART-STYLE
# rule 5.  Judge them rendered, never from the number.)
# ---------------------------------------------------------------------------
MATERIALS = [
    ("PumpConcrete", (0.300, 0.295, 0.278), 0.95),
    ("PumpBody",     (0.700, 0.675, 0.600), 0.60),
    ("PumpSkirt",    (0.360, 0.075, 0.055), 0.75),
    ("PumpTrim",     (0.045, 0.046, 0.048), 0.55),
    ("PumpSign",     (1.000, 1.000, 1.000), 0.70),   # baseColor is the bake
]

OBJ_NAME = 'GasPump'
OUT_GLB = os.path.join(os.path.dirname(bpy.data.filepath) or '.', '..', 'gas-pump.glb')


# ---------------------------------------------------------------------------
# GEOMETRY HELPERS
#
# Every helper returns (verts, faces, matnames) so a whole part list can be
# mirrored through y = 0 in one place -- see mirror_y().  Faces are index tuples
# wound counter-clockwise seen from outside.
# ---------------------------------------------------------------------------

def box(x0, x1, y0, y1, z0, z1, mat):
    v = [Vector((x0, y0, z0)), Vector((x1, y0, z0)), Vector((x1, y1, z0)), Vector((x0, y1, z0)),
         Vector((x0, y0, z1)), Vector((x1, y0, z1)), Vector((x1, y1, z1)), Vector((x0, y1, z1))]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
         (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return v, f, [mat] * len(f)


def frustum(x0, x1, y0, y1, z0, z1, inset, mat):
    """A box whose top face is inset on all four sides - the batter every poured
    kerb has, and the cheapest way to stop a slab reading as a floating cuboid."""
    v = [Vector((x0, y0, z0)), Vector((x1, y0, z0)), Vector((x1, y1, z0)), Vector((x0, y1, z0)),
         Vector((x0 + inset, y0 + inset, z1)), Vector((x1 - inset, y0 + inset, z1)),
         Vector((x1 - inset, y1 - inset, z1)), Vector((x0 + inset, y1 - inset, z1))]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
         (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return v, f, [mat] * len(f)


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
    return v, f, [mat] * len(f)


def beam(p0, p1, w, h, mat):
    """Rectangular beam between two points.  Cross-section w across the beam's
    own horizontal normal, h across its own vertical - so a diagonal brace keeps
    a constant section instead of shearing."""
    p0, p1 = Vector(p0), Vector(p1)
    d = (p1 - p0).normalized()
    up = Vector((0.0, 0.0, 1.0))
    if abs(d.dot(up)) > 0.999:
        up = Vector((0.0, 1.0, 0.0))
    side = d.cross(up).normalized()
    vert = side.cross(d).normalized()
    a, b = side * (w * 0.5), vert * (h * 0.5)
    v = [p0 - a - b, p0 + a - b, p0 + a + b, p0 - a + b,
         p1 - a - b, p1 + a - b, p1 + a + b, p1 - a + b]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
         (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return v, f, [mat] * len(f)


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
    """Capped n-gon tube swept along a polyline.  The ring frame is carried along
    the curve (parallel transport) rather than rebuilt per segment, so the tube
    does not spin about its own axis where the curve bends hardest."""
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
    return v, f, [mat] * len(f)


def mirror_y(parts):
    """Mirror a part list through y = 0.  A mirror flips handedness, so every
    face has to be re-wound or the whole copy renders inside-out - invisible in
    Blender's default two-sided viewport and very visible in the game."""
    out = []
    for v, f, m in parts:
        mv = [Vector((p.x, -p.y, p.z)) for p in v]
        mf = [tuple(reversed(idx)) for idx in f]
        out.append((mv, mf, list(m)))
    return out


# ---------------------------------------------------------------------------
# SIGN TEXTURE BAKE
# ---------------------------------------------------------------------------

def _emission(name, col):
    """Flat emitter.  With the Standard view transform an emission of value v
    writes exactly v, so the linear colours below survive the round trip:
    Blender sRGB-encodes on save and the sRGB texture decodes back to the same
    linear value at sample time."""
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
    """Re-running the generator must not accumulate a new copy of the artwork
    every time - the .blend would grow a 512x192 image per run."""
    for img in list(bpy.data.images):
        if img.name.startswith("GasPumpSign"):
            bpy.data.images.remove(img)
    for m in list(bpy.data.materials):
        if m.name.startswith(("Sign", "GasPumpSign")) and m.users == 0:
            bpy.data.materials.remove(m)
    for sc in list(bpy.data.scenes):
        if sc.name.startswith("SignBake"):
            bpy.data.scenes.remove(sc)


def bake_sign_texture():
    """Render the GAS artwork from an ortho camera and return a packed image.

    Drawn in FACE METRES in the XY plane and stacked in Z in painter's order, so
    the numbers here are the same numbers the geometry uses."""
    W, H = SIGN_FACE_W, SIGN_FACE_H
    white = (0.780, 0.770, 0.735)      # weathered enamel, not paper white
    ink = (0.012, 0.012, 0.013)

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
        # align_y='CENTER' centres on the FONT's metrics, which reserve descender
        # space these all-caps lines never use - so the block sits low.  Centre on
        # the measured glyph bounding box instead and the row number means what
        # it says.
        mid = (max(ys) + min(ys)) * 0.5 if ys else 0.0
        o.to_mesh_clear()
        o.scale = (k, k, k)
        o.location = (x, y - k * mid, z)

    # painter's order, back to front
    rect(-W / 2, W / 2, -H / 2, H / 2, 0.00, ink, "SignEdge")
    m = SIGN_MARGIN
    rect(-W / 2 + SIGN_RULE_W * 0.5, W / 2 - SIGN_RULE_W * 0.5,
         -H / 2 + SIGN_RULE_W * 0.5, H / 2 - SIGN_RULE_W * 0.5, 0.01, white, "SignField")
    rect(-W / 2 + m, W / 2 - m, -H / 2 + m, H / 2 - m, 0.02, ink, "SignRule")
    n = m + SIGN_RULE_W
    rect(-W / 2 + n, W / 2 - n, -H / 2 + n, H / 2 - n, 0.03, white, "SignInner")

    text(SIGN_TEXT, 0.0, 0.0, 0.05, ink, "SignLetters",
         (W - 2 * n) * SIGN_TXT_FILL)

    path = os.path.join(bpy.app.tempdir, "gas-pump-sign.png")
    sc.render.filepath = path
    win = bpy.context.window
    prev = win.scene
    win.scene = sc
    try:
        bpy.ops.render.render(write_still=True)
    finally:
        win.scene = prev

    img = bpy.data.images.load(path, check_existing=False)
    img.name = "GasPumpSign"
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
    """One pump, facing +Y (= glTF -Z, forward).  The second pump is this list
    put through mirror_y()."""
    p = []
    cx = PUMP_CX
    x0, x1 = cx - PUMP_HW, cx + PUMP_HW
    i = SKIRT_INSET

    # lower panel, recessed all round so the flat-shaded step reads as a groove
    # The skirt runs 20 mm PAST the cabinet's underside on purpose.  Ending both at
    # SKIRT_TOP leaves two exactly-coplanar faces there; burying the skirt's top face
    # inside the cabinet removes the z-fight and leaves only the overhang lip, which
    # is the detail we actually wanted.
    p.append(box(x0 + i, x1 - i, PUMP_Y0 + i, PUMP_Y1 - i,
                 PLINTH_H, SKIRT_TOP + 0.02, "PumpSkirt"))
    # upper cabinet
    p.append(box(x0, x1, PUMP_Y0, PUMP_Y1, SKIRT_TOP, CAB_TOP, "PumpBody"))
    # dial bezel and its two pale register windows.  No digits: at 20 m through
    # fog they are one grey smudge, and ART-STYLE rule 1 does not buy smudges.
    p.append(box(cx - BEZEL_HW, cx + BEZEL_HW, PUMP_Y1 - 0.004, PUMP_Y1 + BEZEL_PROUD,
                 BEZEL_Z0, BEZEL_Z1, "PumpTrim"))
    wy = PUMP_Y1 + BEZEL_PROUD
    edge = BEZEL_HW - 0.020
    for wx0, wx1 in ((cx - edge, cx - WIN_GAP), (cx + WIN_GAP, cx + edge)):
        p.append(box(wx0, wx1, wy - 0.002, wy + WIN_PROUD, WIN_Z0, WIN_Z1, "PumpBody"))

    # fitting, holster, nozzle, spout, squeeze handle - all on the +X cabinet end
    p.append(box(cx + FIT_X0, cx + FIT_X1, FIT_Y0, FIT_Y1, FIT_Z0, FIT_Z1, "PumpTrim"))
    p.append(box(cx + BOOT_X0, cx + BOOT_X1, BOOT_Y0, BOOT_Y1,
                 BOOT_Z0, BOOT_Z1, "PumpTrim"))
    p.append(box(cx + NOZ_X0, cx + NOZ_X1, NOZ_Y0, NOZ_Y1, NOZ_Z0, NOZ_Z1, "PumpTrim"))
    p.append(box(cx + SPOUT_X0, cx + SPOUT_X1, SPOUT_Y0, SPOUT_Y1,
                 SPOUT_Z0, SPOUT_Z1, "PumpTrim"))
    p.append(box(cx + LEVER_X0, cx + LEVER_X1, LEVER_Y0, LEVER_Y1,
                 LEVER_Z0, LEVER_Z1, "PumpTrim"))

    # hose: high fitting, sagging loop, back up into the nozzle
    curve = [(cx + q[0], q[1], q[2]) for q in
             (HOSE_P0, HOSE_P1, HOSE_P2, HOSE_P3)]
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

    img = bake_sign_texture()

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
        if name == "PumpSign":
            tex = m.node_tree.nodes.new("ShaderNodeTexImage")
            tex.image = img
            tex.interpolation = 'Linear'
            tex.location = (-400, 200)
            m.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        mats[name] = m

    parts = []

    # --- island slab -------------------------------------------------------
    parts.append(frustum(PAD_X0, PAD_X1, -PAD_Y, PAD_Y, 0.0, PAD_H,
                         PAD_BATTER, "PumpConcrete"))

    # --- shared dark plinth under both pumps -------------------------------
    parts.append(box(PUMP_CX - PUMP_HW - 0.012, PUMP_CX + PUMP_HW + 0.012,
                     -PUMP_Y1 - 0.012, PUMP_Y1 + 0.012,
                     PAD_H - 0.005, PLINTH_H, "PumpTrim"))

    # --- the two pumps, back to back ---------------------------------------
    front = pump_parts()
    parts.extend(front)
    parts.extend(mirror_y(front))

    # --- one light crown over the pair --------------------------------------
    parts.append(box(PUMP_CX - TOP_HW, PUMP_CX + TOP_HW,
                     -PUMP_Y1 + TOP_INSET_Y, PUMP_Y1 - TOP_INSET_Y,
                     CAB_TOP, CAB_TOP + TOP_H, "PumpBody"))

    # --- pole --------------------------------------------------------------
    # phase = pi/8 puts a FACE, not a vertex, square on to +/-Y, so the pole
    # shows a flat to the road instead of a bright edge highlight.
    ph = math.pi / POLE_SIDES
    parts.append(prism_z(POLE_X, 0.0, PAD_H - 0.005, COLLAR_TOP,
                         COLLAR_R, COLLAR_R * 0.80, POLE_SIDES, "PumpTrim", ph))
    parts.append(prism_z(POLE_X, 0.0, COLLAR_TOP - 0.02, POLE_TOP,
                         POLE_R, POLE_R * 0.88, POLE_SIDES, "PumpBody", ph))

    # --- floodlight -------------------------------------------------------
    lx = POLE_X + LAMP_REACH
    parts.append(beam((POLE_X, 0.0, LAMP_Z), (lx, 0.0, LAMP_Z + 0.04),
                      LAMP_ARM_W, LAMP_ARM_W, "PumpBody"))
    parts.append(beam((lx - 0.02, 0.0, LAMP_Z + 0.04),
                      (lx + LAMP_HEAD[0], 0.0, LAMP_Z + 0.04 - LAMP_DROP),
                      LAMP_HEAD[1], LAMP_HEAD[1], "PumpTrim"))

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
    for s in (1, -1):
        inner = s * (SIGN_T * 0.5 + SIGN_FACE_PROUD - SIGN_FACE_T)  # buried in the bezel
        outer = s * (SIGN_T * 0.5 + SIGN_FACE_PROUD)
        y0, y1 = min(inner, outer), max(inner, outer)
        v, f, m = box(fx0, fx1, y0, y1, fz0, fz1, "PumpBody")
        # box() face order is [-Z, +Z, -Y, +X, +Y, -X]; only the outward-facing one
        # carries the artwork, the four narrow rims stay bezel-coloured.
        m[4 if s > 0 else 2] = "PumpSign"
        parts.append((v, f, m))

    # --- assemble one mesh --------------------------------------------------
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    for verts, faces, mnames in parts:
        bverts = [bm.verts.new(v) for v in verts]
        bm.verts.ensure_lookup_table()
        for idx, mname in zip(faces, mnames):
            try:
                face = bm.faces.new([bverts[i] for i in idx])
            except ValueError:
                continue
            face.material_index = slot_of[mname]
            face.smooth = False       # ART-STYLE rule 3: faceted, always
            if mname == "PumpSign":
                # Screen-right on the +Y face is -X, and +X on the -Y face (right =
                # cross(view_dir, up); view_dir is -Y and +Y respectively), so the
                # +Y face's U must run backwards or the sign reads SAG from one side.
                #
                # WHICH SIDE IS THIS?  From the vertex, NOT from face.normal: a face
                # just made by bmesh has a zero normal until normal_update() runs, so
                # testing face.normal.y here silently returns False on both plates and
                # ships a mirrored sign.  The plates sit at y = +/-0.106, so the vertex
                # y sign is unambiguous and needs no update pass.
                s = 1.0 if face.verts[0].co.y > 0 else -1.0
                for loop in face.loops:
                    px, pz = loop.vert.co.x, loop.vert.co.z
                    u = (px - fx0) / (fx1 - fx0)
                    if s > 0:
                        u = 1.0 - u
                    loop[uv_layer].uv = (u, (pz - fz0) / (fz1 - fz0))
            else:
                for loop in face.loops:
                    loop[uv_layer].uv = (0.0, 0.0)

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
