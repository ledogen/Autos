"""
ASSET-31 - Californian roadside signage on a timber 4x4.  RangerSim.

    blender --background --python road-signs.py -- export
    (or paste into Blender's text editor and call export())

Built against Blender 5.2.0 LTS.


WHAT THIS IS
------------
Seven signs, one generator, SEVEN .glb FILES - the steel-drum.py packaging, not the
gas-pump one.  Each variant is built alone in a fresh scene and exported on its own, so
a spawner brings in one sign, not a set:

    sign-grade.glb      steep downgrade, truck on the hill   (MUTCD W7-1)
    sign-curves.glb     winding road, S with an arrow        (W1-5)
    sign-rockslide.glb  ROCK / SLIDE / AREA                  (W8-?)
    sign-tee.glb        T intersection ahead                 (W2-4)
    sign-cross.glb      4-way intersection ahead             (W2-1)
    sign-stop.glb       STOP octagon                         (R1-1)
    sign-icy.glb        ICY                                  (W8-?)

The .blend holds all seven side by side as the source view.  `build()` gives you that;
`export()` writes the files and then rebuilds the combined view before you save.


THE ONE IDEA THAT MAKES THIS CHEAP: THE OUTLINE IS DECLARED IN CANVAS UNITS
--------------------------------------------------------------------------
Every variant declares its blank's outline as a closed polygon in CANVAS COORDINATES -
the unit square [0,1]^2 that the baked 512x512 renders into.  Both the mesh and the
artwork are then derived from that same list:

    mesh:     (cx, cy) -> (x = (cx - 0.5) * FACE_SIZE,  z = FACE_CZ + (cy - 0.5) * FACE_SIZE)
    artwork:  drawn directly in canvas units
    UVs:      plate_uv() over the plate's own bounding box, which IS the canvas square

So the black border can never drift off the blank's edge and a new sign type is an
outline plus an artwork function - never a new mesh.  This is the produce-stall lesson
("derive each plate's aspect from its region, never type it twice") applied to shape
rather than to aspect ratio.

Corollary, and it is load-bearing: THE CANVAS BACKGROUND IS THE FIELD COLOUR.  The
outline is the silhouette, so the outermost texels are sampled right at the mesh edge;
filling the canvas with yellow (red, on the stop sign the outermost ring is ink) means
mip bleed at that edge can only ever bleed the colour that is already there.


HANDEDNESS - derived, never eyeballed
-------------------------------------
The blank faces +Y in Blender, which is -Z after export, which is the project's
forward.  A viewer standing in front of it looks down -Y with +Z up, so their right is
view x up = (0,-1,0) x (0,0,1) = (-1,0,0): IMAGE-RIGHT LANDS ON LOCAL -X.  That is the
whole content of plate_uv()'s `u = 1 - ...`.  It matters here because three of the
seven signs are not left/right symmetric (the S-curve, the truck on the grade, the
downhill wedge), and a mirrored winding-road sign is exactly the "a sign that lies"
failure the ticket warns about.  Never check this from a screenshot - a model seen from
behind looks mirrored when it is fine and fine when it is mirrored.


WHAT IS DELIBERATELY NOT HERE
-----------------------------
* No cant, no lean, no bullet holes.  A baked cant makes EVERY sign on the map lean the
  same way, which reads as a modelling error rather than as weathering.  Lean is a
  placement-time rotation; the ticket's "faded, shot at, canted" belongs to whoever
  writes the placement pass.
* No fingerpost.  The ticket budgeted one; the owner's brief (2026-08-23) replaced the
  kit with these seven types.  Route shields and mile markers went the same way.
* No wear texture.  ART-STYLE rule 1: the image buys the PRINTED INFORMATION - the
  legend and the border - and nothing else.  Grain, rust and fade are wear, the named
  anti-pattern.


LEGIBILITY, HONESTLY
--------------------
The ticket asks for legibility at 60 m.  A 0.914 m sign at 60 m subtends ~0.0152 rad,
which is about 16 px tall on a 1080p screen at a 60 deg fov.  No lettering survives
that and neither would a real sign - what reads at 60 m is COLOUR AND SILHOUETTE
(yellow diamond vs red octagon), and the symbol resolves somewhere around 25 m.  That
is why the symbol signs carry heavy, high-contrast shapes and why the three lettered
ones are the three whose meaning nothing else could carry.  512 px per face is a
generous match to the ~300 px the face fills at 3 m.
"""

import math
import os

import bmesh
import bpy
from mathutils import Vector

# ---------------------------------------------------------------------------
# BLANK GEOMETRY
# ---------------------------------------------------------------------------
FACE_SIZE = 0.914          # 36 in, and the canvas edge.  Owner call 2026-08-24: the blank
                           # read small against the 4x4.  This is the NEXT SIZE UP THE
                           # MUTCD LADDER, not an arbitrary scale factor - 30 in is the
                           # conventional-road warning blank, 36 in the one used on faster
                           # and multilane roads - so the post-to-blank proportion stays a
                           # real one.  (It does put the blank over the ticket's 0.60-0.75 m
                           # Spec row, which was already stale after the 2026-08-23 rebrief.)
FACE_CZ = 2.000            # ticket spec: 2.0 m to the face centre.  At 36 in that puts the
                           # diamond's bottom point at 1.54 m, still clear of the 5 ft
                           # (1.524 m) rural minimum - so the bigger blank did not have to
                           # buy its size by hanging lower into the road.
FACE_T = 0.012             # blank thickness (sheet + a little, so it is a real edge)
FACE_GAP = 0.002           # plate back sunk INTO the post face.  Never flush: two
                           # exactly-coplanar faces z-fight under engine lighting, and
                           # this generator's audit has caught that four times elsewhere.

DIAMOND_CHAMFER = 0.060    # corner cut, as a fraction of the diamond's edge length

# ---------------------------------------------------------------------------
# THE POST - a real 4x4, which is 3.5 in (89 mm) dressed
# ---------------------------------------------------------------------------
POST_W = 0.089
POST_TOP = FACE_CZ + 0.180     # stops behind the blank's upper half; at that height the
                               # diamond is still 0.55 m wide, so nothing pokes out
POST_CAP_H = 0.055             # sawn weather bevel on the top
POST_CAP_IN = 0.014            # how far each side draws in over that bevel

# ---------------------------------------------------------------------------
# ARTWORK, in CANVAS UNITS (the unit square that renders to TEX_PX)
#
# BORDER_OFF/W are PERPENDICULAR distances from the blank's edge, so they stay a
# constant stripe width whatever the outline is.  MUTCD's own numbers (0.375 in offset,
# 0.5 in stripe on a 30 in blank = 0.0125 / 0.0167 units) are far too fine to survive
# minification - these are roughly doubled, which is what the reference photographs
# actually look like at distance.
# ---------------------------------------------------------------------------
TEX_PX = 512
BORDER_OFF = 0.024
BORDER_W = 0.032
SYMBOL_INSET = 0.075       # perpendicular clearance a LEGEND must stay inside
SYMBOL_INSET_BOLD = 0.070  # ...and the tighter one the heavy geometric symbols use.
                           # Two numbers on purpose: a letterform needs air around it to
                           # stay readable, a solid black bar does not and reads better
                           # bigger.  The reference photographs show exactly this - the
                           # T and the cross very nearly touch their border stripe.
                           # HARD FLOOR: it must exceed BORDER_OFF + BORDER_W (0.056) or
                           # the symbol crosses its own border stripe.  The first pass
                           # used 0.050 and the cross's four arms poked out into the
                           # yellow rim - invisible in a thumbnail, obvious at 5 m.

BOLT_R = 0.017             # the two mounting bolts, top and bottom of the centreline
BOLT_CY = (0.185, 0.815)

FONT = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_HEAVY = "/System/Library/Fonts/Supplemental/Arial Black.ttf"

# EVERY LEGEND IS DRAWN AT FULL SIZE AND THEN SHRUNK ABOUT THE BLANK'S CENTRE by this
# factor (owner, 2026-08-24: "they're too big on the sign").  It is applied by Canvas,
# not by editing forty coordinates, so the layout numbers below still read as the
# composition you would draw by hand and the air around it is one dial.
#
# The border stripe and the bolt heads are NOT scaled - they are tied to the blank's
# edge, not to the legend - so warning_blank() turns the scale on only as it finishes.
# Note this also means every diamond_halfw() clearance below is now conservative:
# shrinking toward the centre can only move a symbol further from its border.
#
# THE STOP SIGN OPTS OUT AND GOES THE OTHER WAY (owner, same pass): a regulatory legend
# is meant to fill its blank, and R1-1 lettering really is that big.
LEGEND_SCALE = 0.90

# ---------------------------------------------------------------------------
# COLOURS - LINEAR.  These render ~1.5x lighter than the number reads (ART-STYLE
# rule 5); judge them in the viewport, never from the digits.
# ---------------------------------------------------------------------------
YELLOW = (0.887, 0.554, 0.010)     # MUTCD yellow, a touch weathered
INK = (0.012, 0.012, 0.013)
STOP_RED = (0.500, 0.015, 0.022)
ENAMEL = (0.780, 0.775, 0.760)     # the white on the stop sign

MATERIALS = [
    ("SignPost", (0.235, 0.190, 0.140), 0.92),   # weathered timber
    ("SignBack", (0.145, 0.150, 0.158), 0.55),   # the blank's rim and back
    ("SignFace", (1.000, 1.000, 1.000), 0.55),   # baseColor IS the bake
]

OUT_DIR = os.path.join(os.path.dirname(bpy.data.filepath) or ".", "..")
BLEND_PATH = os.path.join(os.path.dirname(bpy.data.filepath) or ".", "road-signs.blend")
TRI_BUDGET = 120           # per sign; the ticket allows post 120 + face 40


# ===========================================================================
# 2-D OUTLINE HELPERS  (canvas units, CCW, origin bottom-left)
# ===========================================================================

def diamond_outline(chamfer=DIAMOND_CHAMFER):
    """The warning blank: a square on its point with its four corners cut off.

    Chamfering is 4 extra verts and 8 extra tris and it is what stops the point
    reading as a needle at distance - real blanks are radiused, and one straight cut
    is the faceted-style way to say so (ART-STYLE rule 3: never smooth it)."""
    pts = [(0.5, 0.0), (1.0, 0.5), (0.5, 1.0), (0.0, 0.5)]   # CCW
    if chamfer <= 0.0:
        return pts
    out = []
    n = len(pts)
    for i in range(n):
        p = Vector(pts[i])
        prev = Vector(pts[i - 1])
        nxt = Vector(pts[(i + 1) % n])
        out.append(tuple(p + (prev - p) * chamfer))
        out.append(tuple(p + (nxt - p) * chamfer))
    return out


def octagon_outline():
    """The stop blank.  A vertex sits at 22.5 deg, which puts FLATS top, bottom, left
    and right - so the outline's bounding box is exactly the flats, exactly the canvas
    square, and the artwork cannot spill outside the UV range."""
    r = 0.5 / math.cos(math.radians(22.5))
    return [(0.5 + r * math.cos(math.radians(22.5 + 45 * k)),
             0.5 + r * math.sin(math.radians(22.5 + 45 * k))) for k in range(8)]


def inset_poly(pts, d):
    """Shrink a convex CCW polygon by a constant PERPENDICULAR distance d.

    Offsetting each edge inward and intersecting consecutive offset lines - not
    scaling about the centroid, which would give a border that is wider at the points
    than along the edges on a diamond.  Inward normal of a CCW edge (dx,dy) is
    (-dy,dx)."""
    n = len(pts)
    lines = []
    for i in range(n):
        ax, ay = pts[i]
        bx, by = pts[(i + 1) % n]
        ex, ey = bx - ax, by - ay
        L = math.hypot(ex, ey)
        if L < 1e-9:
            lines.append(None)
            continue
        nx, ny = -ey / L, ex / L
        lines.append((ax + nx * d, ay + ny * d, ex / L, ey / L))
    out = []
    for i in range(n):
        a = lines[i - 1]
        b = lines[i]
        if a is None or b is None:
            out.append(pts[i])
            continue
        px, py, dx, dy = a
        qx, qy, ex, ey = b
        den = dx * ey - dy * ex
        if abs(den) < 1e-9:          # parallel edges (a chamfer degenerating) - midpoint
            out.append(((px + qx) * 0.5, (py + qy) * 0.5))
            continue
        t = ((qx - px) * ey - (qy - py) * ex) / den
        out.append((px + dx * t, py + dy * t))
    return out


def diamond_halfw(cy, inset=SYMBOL_INSET):
    """Usable half-width of the diamond blank at canvas height cy, allowing `inset` of
    perpendicular clearance.  The diamond's edges run at 45 deg, so a perpendicular
    inset costs sqrt(2) horizontally.  Call this instead of typing coordinates - a
    legend that overruns its blank is the defect a screenshot hides at 40 m."""
    return 0.5 - abs(cy - 0.5) - inset * math.sqrt(2.0)


def polyline_min_radius(pts):
    """Tightest turning radius along a polyline, as the smallest circumradius of three
    consecutive points.  Cheap, and it is the number that decides whether an offset
    band is drawable at all - see ribbon()."""
    best = float("inf")
    for i in range(1, len(pts) - 1):
        a, b, cc = (Vector(pts[i - 1]), Vector(pts[i]), Vector(pts[i + 1]))
        ab, bc, ca = (b - a).length, (cc - b).length, (a - cc).length
        area2 = abs((b.x - a.x) * (cc.y - a.y) - (cc.x - a.x) * (b.y - a.y))
        if area2 < 1e-12:
            continue                        # straight run: infinite radius
        best = min(best, ab * bc * ca / (2.0 * area2))
    return best


def ribbon(pts, half_w):
    """A constant-width band along a 2-D polyline, as a list of quads.

    Emitted as quads rather than one polygon because the S-curve outline is CONCAVE and
    Blender tessellates a concave n-gon however it likes.

    THE FAILURE MODE THIS WARNS ABOUT.  Offsetting a polyline inward by half_w only
    works where the turning radius EXCEEDS half_w.  Turn tighter than that and the inner
    edge crosses itself, and the band grows a thin spur pointing out of the inside of
    the bend.  On the winding-road sign that spur landed right beside the arrowhead and
    read as a modelling fault.  The cure is always a longer, gentler bend - never a
    thinner band, which just moves the limit."""
    r = polyline_min_radius(pts)
    if r < half_w:
        print(f"WARN: ribbon turns at r={r:.4f} < half width {half_w:.4f} - "
              f"the inner edge will fold back on itself")
    quads = []
    left, right = [], []
    n = len(pts)
    for i in range(n):
        if i == 0:
            t = Vector(pts[1]) - Vector(pts[0])
        elif i == n - 1:
            t = Vector(pts[-1]) - Vector(pts[-2])
        else:
            t = Vector(pts[i + 1]) - Vector(pts[i - 1])
        t.normalize()
        nrm = Vector((-t.y, t.x)) * half_w
        p = Vector(pts[i])
        left.append(p + nrm)
        right.append(p - nrm)
    for i in range(n - 1):
        quads.append([tuple(right[i]), tuple(left[i]),
                      tuple(left[i + 1]), tuple(right[i + 1])])
    return quads


def bez(p0, p1, p2, p3, n):
    out = []
    for i in range(n + 1):
        t = i / n
        u = 1.0 - t
        out.append((p0[0] * u ** 3 + 3 * p1[0] * u * u * t + 3 * p2[0] * u * t * t + p3[0] * t ** 3,
                    p0[1] * u ** 3 + 3 * p1[1] * u * u * t + 3 * p2[1] * u * t * t + p3[1] * t ** 3))
    return out


def rot2(p, origin, u, v):
    """Place a point given in a local (along, across) frame into canvas coords."""
    return (origin[0] + u[0] * p[0] + v[0] * p[1],
            origin[1] + u[1] * p[0] + v[1] * p[1])


# ===========================================================================
# 3-D GEOMETRY HELPERS
#
# Every helper returns (verts, faces, matnames, uvs).  Faces are index tuples wound
# counter-clockwise seen from OUTSIDE.  uvs[i] is None on every face that carries no
# artwork, which is all of them but one.
# ===========================================================================

def box(x0, x1, y0, y1, z0, z1, mat):
    v = [Vector((x0, y0, z0)), Vector((x1, y0, z0)), Vector((x1, y1, z0)), Vector((x0, y1, z0)),
         Vector((x0, y0, z1)), Vector((x1, y0, z1)), Vector((x1, y1, z1)), Vector((x0, y1, z1))]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
         (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return v, f, [mat] * len(f), [None] * len(f)


def frustum(x0, x1, y0, y1, z0, z1, inset_hi, mat):
    """A box drawn in at the top by `inset_hi` on all four sides - the sawn weather
    bevel on the post head."""
    b = inset_hi
    v = [Vector((x0, y0, z0)), Vector((x1, y0, z0)), Vector((x1, y1, z0)), Vector((x0, y1, z0)),
         Vector((x0 + b, y0 + b, z1)), Vector((x1 - b, y0 + b, z1)),
         Vector((x1 - b, y1 - b, z1)), Vector((x0 + b, y1 - b, z1))]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
         (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return v, f, [mat] * len(f), [None] * len(f)


def plate_uv(verts, face, x0, x1, z0, z1):
    """UVs for the artwork face of a +Y-facing plate.

    Screen-right for a viewer at +Y is -X (see the handedness note in the module
    docstring), so U runs BACKWARDS along X.  Getting this wrong mirrors the winding-
    road sign, which is the one failure mode this asset must not have."""
    out = []
    for i in face:
        p = verts[i]
        out.append((1.0 - (p.x - x0) / (x1 - x0), (p.z - z0) / (z1 - z0)))
    return out


def blank(outline, mat_rim, mat_face):
    """Extrude a canvas-space outline into the sign blank.

    Caps and rim are wound from the polygon's own CCW-in-(x,z) order.  Verified with
    the triple product rather than by eye: a CCW loop in the (x,z) plane has normal
    -Y, so the BACK cap keeps that order and the FRONT cap is reversed; the rim quad
    (i, n+i, n+j, j) works out to (dz, 0, -dx), which is the outward side."""
    n = len(outline)
    half = FACE_SIZE * 0.5
    # The post occupies y in [-POST_W, 0], so its FRONT face is y = 0 and the blank
    # goes in front of that, sunk FACE_GAP into it.  Getting this the other way round
    # bolts the sign to the back of the post and the timber runs straight down the
    # middle of the legend - which is exactly what the first front-elevation showed.
    y0 = -FACE_GAP
    y1 = y0 + FACE_T
    xz = [((cx - 0.5) * FACE_SIZE, FACE_CZ + (cy - 0.5) * FACE_SIZE) for cx, cy in outline]
    v = [Vector((x, y0, z)) for x, z in xz] + [Vector((x, y1, z)) for x, z in xz]
    f = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
    for i in range(n):
        j = (i + 1) % n
        f.append((i, n + i, n + j, j))
    mats = [mat_rim] * len(f)
    uvs = [None] * len(f)
    mats[1] = mat_face
    uvs[1] = plate_uv(v, f[1], -half, half, FACE_CZ - half, FACE_CZ + half)
    return v, f, mats, uvs


# ===========================================================================
# ARTWORK BAKE
# ===========================================================================

def _emission(name, col):
    """Flat emitter.  Under the Standard view transform an emission of value v writes
    exactly v, so these linear colours survive the round trip: Blender sRGB-encodes on
    save and the sRGB texture decodes back to the same linear value when sampled."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs[0].default_value = (col[0], col[1], col[2], 1.0)
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(e.outputs[0], o.inputs[0])
    return m


def _purge_bake_leftovers():
    """Re-running must not accumulate a copy of every face image on every run."""
    for img in list(bpy.data.images):
        if img.name.startswith("SignFace"):
            bpy.data.images.remove(img)
    for sc in list(bpy.data.scenes):
        if sc.name.startswith("SignBake"):
            bpy.data.scenes.remove(sc)


class Canvas:
    """A scratch scene holding flat emitters in canvas units, rendered through an ortho
    camera framing the unit square.  Shapes stack in Z in painter's order."""

    def __init__(self):
        engines = {i.identifier for i in
                   bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items}
        sc = bpy.data.scenes.new("SignBake")
        sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
        sc.render.resolution_x = sc.render.resolution_y = TEX_PX
        sc.render.resolution_percentage = 100
        sc.render.film_transparent = False
        sc.view_settings.view_transform = "Standard"
        sc.render.image_settings.file_format = "PNG"
        sc.render.image_settings.color_mode = "RGB"
        # NO DITHER.  Blender ships dither_intensity = 1.0, which stipples every flat
        # region with +/-1 LSB noise so 8-bit gradients do not band.  There are no
        # gradients here - the whole image is four flat colours - and the noise defeats
        # PNG's row filters completely: it took these faces from 15 kB to 230 kB each,
        # i.e. most of the .glb.  Anything baking flat artwork wants this off.
        sc.render.dither_intensity = 0.0
        cam_data = bpy.data.cameras.new("SignCam")
        cam_data.type = "ORTHO"
        cam_data.ortho_scale = 1.0
        cam = bpy.data.objects.new("SignCam", cam_data)
        cam.location = (0.5, 0.5, 4.0)
        sc.collection.objects.link(cam)
        sc.camera = cam
        self.sc, self.cam, self.cam_data = sc, cam, cam_data
        self.objs, self.mats = [], []
        self.z = 0.0
        self.scale = 1.0        # see LEGEND_SCALE; set by the blank helpers

    def _s(self, p):
        """Shrink a canvas point toward the blank's centre by the current legend scale."""
        k = self.scale
        return (0.5 + (p[0] - 0.5) * k, 0.5 + (p[1] - 0.5) * k)

    def _next_z(self):
        self.z += 0.01
        return self.z

    def _add(self, verts, faces, col, tag):
        me = bpy.data.meshes.new(tag)
        me.from_pydata(verts, [], faces)
        me.update()
        o = bpy.data.objects.new(tag, me)
        mat = _emission(tag, col)
        self.mats.append(mat)
        me.materials.append(mat)
        self.sc.collection.objects.link(o)
        self.objs.append(o)

    def poly(self, pts, col, tag):
        """One CONVEX polygon.  Concave shapes must come through quads()."""
        z = self._next_z()
        pts = [self._s(p) for p in pts]
        self._add([(x, y, z) for x, y in pts], [tuple(range(len(pts)))], col, tag)

    def quads(self, quad_list, col, tag):
        z = self._next_z()
        verts, faces = [], []
        for q in quad_list:
            b = len(verts)
            verts.extend([(x, y, z) for x, y in (self._s(p) for p in q)])
            faces.append((b, b + 1, b + 2, b + 3))
        if verts:
            self._add(verts, faces, col, tag)

    def rect(self, x0, x1, y0, y1, col, tag):
        self.poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], col, tag)

    def circle(self, cx, cy, r, col, tag, sides=24):
        self.poly([(cx + r * math.cos(2 * math.pi * k / sides),
                    cy + r * math.sin(2 * math.pi * k / sides)) for k in range(sides)],
                  col, tag)

    def text(self, body, cx, cy, col, tag, cap_h, max_width=None, font=FONT):
        """Centred text at a given cap height, refitted down if it would overrun
        max_width.  Returns the placed glyph box (x0, x1, y0, y1).

        Two traps, both paid for elsewhere in this repo:
          * align_y='CENTER' centres on the FONT's metrics, which reserve descender
            space these all-caps lines never use, so the block always sits low.  Centre
            on the MEASURED glyph bbox instead and cy means what it says.
          * fitting glyphs to a hand-typed window width instead of the other way round
            is how the gas pump's five digits came out taller than their window."""
        z = self._next_z()
        cx, cy = self._s((cx, cy))
        cap_h *= self.scale
        if max_width is not None:
            max_width *= self.scale
        cu = bpy.data.curves.new(tag, type="FONT")
        cu.body = body
        cu.size = 1.0
        cu.align_x = "CENTER"
        cu.align_y = "CENTER"
        try:
            cu.font = bpy.data.fonts.load(font, check_existing=True)
        except (RuntimeError, OSError):
            print("WARN: font not found, falling back to Bfont:", font)
        o = bpy.data.objects.new(tag, cu)
        mat = _emission(tag, col)
        self.mats.append(mat)
        cu.materials.append(mat)
        self.sc.collection.objects.link(o)
        self.objs.append(o)
        me = o.to_mesh()
        xs = [v.co.x for v in me.vertices]
        ys = [v.co.y for v in me.vertices]
        if not xs:
            o.to_mesh_clear()
            return (cx, cx, cy, cy)
        w, h = max(xs) - min(xs), max(ys) - min(ys)
        mid = (max(ys) + min(ys)) * 0.5
        o.to_mesh_clear()
        k = cap_h / h if h > 0 else 1.0
        if max_width is not None and k * w > max_width:
            k = max_width / w
        o.scale = (k, k, k)
        o.location = (cx, cy - k * mid, z)
        return (cx - k * w * 0.5, cx + k * w * 0.5, cy - k * h * 0.5, cy + k * h * 0.5)

    def render(self, name):
        path = os.path.join(bpy.app.tempdir, "%s.png" % name)
        self.sc.render.filepath = path
        win = bpy.context.window
        prev = win.scene
        win.scene = self.sc
        try:
            bpy.ops.render.render(write_still=True)
        finally:
            win.scene = prev
        img = bpy.data.images.load(path, check_existing=False)
        img.name = "SignFace_%s" % name
        img.pack()                 # NEVER leave it in tempdir - that is wiped on quit
        img.filepath_raw = ""
        for o in list(self.objs) + [self.cam]:
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.scenes.remove(self.sc)
        for m in self.mats:
            bpy.data.materials.remove(m)
        bpy.data.cameras.remove(self.cam_data)
        return img


def warning_blank(c, bolts=True):
    """Yellow field, black border stripe, two bolt heads.  Shared by all six warning
    signs; the field colour also fills the canvas so edge bleed is invisible."""
    outline = diamond_outline()
    c.rect(0.0, 1.0, 0.0, 1.0, YELLOW, "Bleed")
    c.poly(outline, YELLOW, "Field")
    c.poly(inset_poly(outline, BORDER_OFF), INK, "Border")
    c.poly(inset_poly(outline, BORDER_OFF + BORDER_W), YELLOW, "Inner")
    if bolts:
        for cy in BOLT_CY:
            c.circle(0.5, cy, BOLT_R, INK, "Bolt%d" % int(cy * 100))
    c.scale = LEGEND_SCALE      # everything drawn from here on is the LEGEND


# --- the seven legends -----------------------------------------------------

def art_grade(c):
    """W7-1: a rig on a downgrade.  The hill descends to the LEFT, which is the
    direction of travel - the reference has the truck nose-down toward the viewer's
    left, and that asymmetry is exactly why plate_uv()'s handedness is derived.

    The rig is laid out in FRACTIONS OF THE SLOPE LENGTH, not in canvas units, so
    retuning the wedge angle moves the truck with it instead of leaving it hanging in
    the air or buried in the hill."""
    warning_blank(c)
    y_b, y_top = 0.300, 0.650
    hw = diamond_halfw(y_b, SYMBOL_INSET_BOLD)
    x_lo, x_hi = 0.5 - hw, 0.5 + hw
    c.poly([(x_lo, y_b), (x_hi, y_b), (x_hi, y_top)], INK, "Hill")

    # slope-local frame: u runs UP the hill, v is the surface's outward normal
    u = Vector((x_hi - x_lo, y_top - y_b))
    L = u.length
    u.normalize()
    v = Vector((-u.y, u.x))
    org = (x_lo, y_b)
    s0 = 0.100                                    # bumper's start, as a fraction of L

    def part(s_a, s_b, h_a, h_b, tag):
        pts = [(s_a, h_a), (s_b, h_a), (s_b, h_b), (s_a, h_b)]
        c.poly([rot2(((s0 + a) * L, b * L), org, u, v) for a, b in pts], INK, tag)

    # The rig spans 89% of the hypotenuse and stands 0.30 L off it, which is the
    # proportion the reference has.  THE YELLOW GAP UNDER THE CHASSIS IS THE WHOLE
    # READ: truck and hill are the same black, so the only thing separating them is
    # that strip of field and the wheels bridging it.  Sink the body and the sign
    # becomes one blob.
    part(0.000, 0.090, 0.040, 0.135, "Hood")
    part(0.072, 0.195, 0.040, 0.250, "Cab")
    part(0.165, 0.700, 0.070, 0.105, "Chassis")
    part(0.140, 0.720, 0.135, 0.375, "Trailer")
    for s in (0.055, 0.205, 0.265, 0.650):
        p = rot2(((s0 + s) * L, 0.062 * L), org, u, v)
        c.circle(p[0], p[1], 0.062 * L, INK, "Wheel%d" % int(s * 1000))


def art_curves(c):
    """W1-5: winding road.  The band is CONCAVE, so it goes down as a quad strip.

    NO BOLT HEADS: the lower one sits at cy 0.185 and the road's tail starts at 0.200,
    and the two merged into a spur that read as a modelling fault rather than as a
    bolt.  A sign whose legend reaches the centreline does not get bolts drawn on it."""
    warning_blank(c, bolts=False)
    # TWO bends, then a STRAIGHT run into the head - not three bends.  The first draft
    # squeezed a third S into 0.065 of height, far tighter than the band's own 0.056
    # half-width, so the inner edge folded back and left a spur beside the arrowhead
    # (owner: "the bend near the arrowhead is a little off").  The reference has no
    # third bend either: the road leaves the upper bend going straight up and the head
    # simply sits on top of it.
    #
    # Every joint is tangent-continuous - vertical in, vertical out - and the path ends
    # on a straight step, because the arrow takes its direction from path[-1] - path[-2]
    # and a bezier's final CHORD is not its final TANGENT (where the end derivative is
    # small the second-order term dominates, which threw the first head 9 deg off).
    path = ([(0.500, 0.170)]
            + bez((0.500, 0.195), (0.500, 0.300), (0.645, 0.290), (0.645, 0.395), 26)
            + bez((0.645, 0.395), (0.645, 0.505), (0.455, 0.490), (0.455, 0.610), 26)[1:]
            + [(0.455, 0.665)])
    c.quads(ribbon(path, 0.056), INK, "Road")
    tip = Vector(path[-1]) - Vector(path[-2])
    tip.normalize()
    nrm = Vector((-tip.y, tip.x))
    base = Vector(path[-1])
    # A SQUAT triangle reads as a flag on a pole; the head has to be about as tall as it
    # is wide before it reads as an arrowhead.
    c.poly([tuple(base + nrm * 0.128), tuple(base - nrm * 0.128),
            tuple(base + tip * 0.170)], INK, "Arrow")


def art_rockslide(c):
    """Three stacked lines.  Each is allowed the width the DIAMOND has at its own
    height, which is why the long word goes in the middle."""
    warning_blank(c)
    # ARIAL BLACK, not Bold (owner, 2026-08-24).  Three short stacked words are the
    # hardest thing on any of these blanks to read at speed, and weight buys more
    # legibility per unit of area than size does - which matters when everything just
    # got 10% smaller.
    for line, cy in (("ROCK", 0.665), ("SLIDE", 0.500), ("AREA", 0.335)):
        c.text(line, 0.5, cy, INK, "L_" + line, cap_h=0.125, font=FONT_HEAVY,
               max_width=2.0 * diamond_halfw(cy) - 0.02)


def art_tee(c):
    """W2-4.  The bar's span is read off diamond_halfw() at its own top edge, so the T
    can never overrun the border however the blank is retuned.  It sits low enough that
    the diamond is still wide there - a bar placed high on a diamond is a SHORT bar."""
    warning_blank(c, bolts=False)
    bar_y0, bar_y1 = 0.520, 0.672
    hw = min(diamond_halfw(bar_y1, SYMBOL_INSET_BOLD),
             diamond_halfw(bar_y0, SYMBOL_INSET_BOLD))
    c.rect(0.5 - hw, 0.5 + hw, bar_y0, bar_y1, INK, "Bar")
    c.rect(0.5 - 0.076, 0.5 + 0.076, 0.245, bar_y1, INK, "Stem")


def art_cross(c):
    """W2-1.  Both arms reach the same clearance, so the plus stays square."""
    warning_blank(c, bolts=False)
    t = 0.076
    hw = diamond_halfw(0.5 + t, SYMBOL_INSET_BOLD)
    c.rect(0.5 - hw, 0.5 + hw, 0.5 - t, 0.5 + t, INK, "Arm")
    c.rect(0.5 - t, 0.5 + t, 0.5 - hw, 0.5 + hw, INK, "Stem")


def art_stop(c):
    """R1-1.  The outermost ring is INK here rather than the field colour - a red
    octagon needs a dark edge or it dissolves into low sun."""
    outline = octagon_outline()
    c.rect(0.0, 1.0, 0.0, 1.0, INK, "Bleed")
    c.poly(outline, INK, "Edge")
    c.poly(inset_poly(outline, 0.011), ENAMEL, "Border")
    c.poly(inset_poly(outline, 0.011 + 0.038), STOP_RED, "Field")
    # NO LEGEND_SCALE HERE, and the legend is bigger than it was (owner, 2026-08-24).
    # c.scale is still 1.0 because this blank does not go through warning_blank().  A
    # warning sign is a picture with air around it; a regulatory sign is a WORD, and
    # R1-1 lettering really does run most of the way across the octagon.
    c.text("STOP", 0.5, 0.5, ENAMEL, "Legend", cap_h=0.295, max_width=0.745)


def art_icy(c):
    warning_blank(c)
    c.text("ICY", 0.5, 0.5, INK, "Legend", cap_h=0.270, max_width=0.600)


VARIANTS = [
    ("sign-grade", diamond_outline, art_grade),
    ("sign-curves", diamond_outline, art_curves),
    ("sign-rockslide", diamond_outline, art_rockslide),
    ("sign-tee", diamond_outline, art_tee),
    ("sign-cross", diamond_outline, art_cross),
    ("sign-stop", octagon_outline, art_stop),
    ("sign-icy", diamond_outline, art_icy),
]


# ===========================================================================
# ASSEMBLY
# ===========================================================================

def build_sign(name, outline_fn, art_fn):
    c = Canvas()
    art_fn(c)
    img = c.render(name)

    order = [n for n, _, _ in MATERIALS]
    slot_of = {n: i for i, n in enumerate(order)}
    mats = {}
    for mname, col, rough in MATERIALS:
        m = bpy.data.materials.new(mname)
        m.use_nodes = True
        bsdf = m.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = (col[0], col[1], col[2], 1.0)
        bsdf.inputs["Roughness"].default_value = rough
        bsdf.inputs["Metallic"].default_value = 0.0
        # Single-sided, the campfire/gnome convention.  The mesh is closed everywhere,
        # so a back face is never wanted and culling halves the fill on the blank.
        m.use_backface_culling = True
        if mname == "SignFace":
            tex = m.node_tree.nodes.new("ShaderNodeTexImage")
            tex.image = img
            tex.interpolation = "Linear"
            tex.extension = "EXTEND"
            tex.location = (-400, 200)
            m.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        mats[mname] = m

    h = POST_W * 0.5
    parts = [
        box(-h, h, -POST_W, 0.0, 0.0, POST_TOP - POST_CAP_H, "SignPost"),
        frustum(-h, h, -POST_W, 0.0, POST_TOP - POST_CAP_H - 0.004, POST_TOP,
                POST_CAP_IN, "SignPost"),
        blank(outline_fn(), "SignBack", "SignFace"),
    ]

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
            face.smooth = False               # ART-STYLE rule 3: faceted, always
            for k, loop in enumerate(face.loops):
                loop[uv_layer].uv = uv[k] if uv else (0.0, 0.0)
    bm.normal_update()
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.polygons.foreach_set("use_smooth", [False] * len(mesh.polygons))
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    for mname in order:
        obj.data.materials.append(mats[mname])
    bpy.context.collection.objects.link(obj)
    return obj


def _fresh_scene():
    for d in (bpy.data.objects, bpy.data.meshes, bpy.data.materials):
        for x in list(d):
            d.remove(x)
    _purge_bake_leftovers()


# ===========================================================================
# AUDIT
# ===========================================================================

def check_inverted(ob):
    """Count faces whose winding disagrees with a recalculated outward normal.

    THE ONLY CHECK THAT CATCHES INSIDE-OUT GEOMETRY.  Blender's viewport is two-sided,
    so it shows nothing; the game, with backface culling, shows a hole.  Cheap enough
    to run on every asset, and it has already earned its place once (gas-pump's beam()
    shipped 54 inverted faces past four screenshots)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.normal_update()
    before = [f.normal.copy() for f in bm.faces]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    bad = sum(1 for f, n in zip(bm.faces, before) if f.normal.dot(n) < 0.0)
    bm.free()
    return bad


def report(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = ob.evaluated_get(dg).to_mesh()
    tris = sum(len(f.vertices) - 2 for f in me.polygons)
    verts = len(me.vertices)
    ob.evaluated_get(dg).to_mesh_clear()
    bb = [Vector(cnr) for cnr in ob.bound_box]
    dims = tuple(max(p[i] for p in bb) - min(p[i] for p in bb) for i in range(3))
    minz = min(p[2] for p in bb)
    bad = check_inverted(ob)
    flag = "OK " if tris <= TRI_BUDGET and bad == 0 and abs(minz) < 1e-6 else "!! "
    print(f"  {flag}{ob.name:15s} {tris:4d} tris (budget {TRI_BUDGET})  "
          f"{dims[0]:.3f} x {dims[1]:.3f} x {dims[2]:.3f} m  base z {minz:+.4f}  "
          f"inverted {bad}")
    return tris, bad


def build(offset=True):
    """All seven side by side - the .blend source view."""
    _fresh_scene()
    print("=" * 74)
    for i, (name, outline_fn, art_fn) in enumerate(VARIANTS):
        ob = build_sign(name, outline_fn, art_fn)
        if offset:
            ob.location.x = i * 1.20     # 0.29 m of air between 36 in blanks
        report(ob)
    print(f"     materials {len(bpy.data.materials)}   images {len(bpy.data.images)}")
    print("=" * 74)


def export():
    """One .glb per variant, each built alone in a fresh scene, then the combined
    side-by-side view rebuilt so the .blend can be saved as the source."""
    print("=" * 74)
    for name, outline_fn, art_fn in VARIANTS:
        _fresh_scene()
        ob = build_sign(name, outline_fn, art_fn)
        report(ob)
        bpy.ops.export_scene.gltf(
            filepath=os.path.abspath(os.path.join(OUT_DIR, name + ".glb")),
            export_format="GLB",
            export_yup=True,
            export_apply=True,
            export_draco_mesh_compression_enable=False,
            export_materials="EXPORT",
            export_cameras=False,
            export_lights=False,
            use_selection=False,
        )
        print(f"     wrote {name}.glb")
    print("=" * 74)
    build(offset=True)


if __name__ == "__main__":
    import sys
    if "export" in sys.argv:
        export()
    else:
        build()
