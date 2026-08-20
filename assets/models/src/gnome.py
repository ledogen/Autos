"""
ASSET-02 - ceramic garden gnome, parametric generator.

Built for: Blender 5.x  |  Target: assets/models/gnome.glb
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

NO TEXTURE.  The ticket budgeted one 256x256 baked albedo for a painted face;
the owner's reference call (2026-08-19) is the *low-poly* face -- brim, beard,
and a single faceted nose between them, no eyes, no mouth.  With no face to
paint there is nothing a texture would carry that geometry does not, so this
lands back on the ART-STYLE default: 5 flat Principled materials, 0 images.

POSE: STANDING, and HUMANOID.  The classic upright lawn ornament.  Two earlier
passes were rejected: seated (the colour reference's pose, read too literally),
then standing but portly -- an egg widest at the belly tapering to narrow
shoulders, which reads as a skittle rather than a little man.

THE FIX IS THE VERTICAL LAYOUT, NOT THE WAISTLINE.  Proportions are taken off
the owner's 2026-08-20 reference as fractions of total height, measured from
the ground: boot top 0.11, coat hem 0.17, belt 0.31, SHOULDER LINE 0.50, beard
bottom 0.39, hat brim 0.70, tip 1.00.  Head plus hat is exactly the top half of
the figure.  The torso is then a narrow tube -- rx 0.056..0.063 against the old
0.100 belly -- WIDEST AT THE SHOULDERS, nipped at the belt, flaring slightly to
the hem.  A humanoid silhouette is shoulders + waist + legs; the previous one
had none of the three.

NO BASE DISC.  Standing on two boots does not need a plinth, and the flamingos
(ASSET-01) already ship two thin legs with no base.

SIX MATERIALS, one over the ART-STYLE soft limit, spent on the buckle.  The
reference's mid-brown trousers and near-black boots are MERGED into one
GnomeLeather with the belt: three surfaces, one dark leather role, and at the
20 m viewing distance the value split between them is invisible while the boot
silhouette carries the read.  GnomeBuckle is the one thing that could not be
merged -- it is the only warm metal on the model and it is the detail the owner
asked for by name.

BUILT 2026-08-20 against Blender 5.2.0 LTS.  FINAL: 492 tris (budget 500),
264 verts, 6 materials, 0 images, 0 UV layers, one mesh object, 31.0 kB .glb.
0.1964 W x 0.400 H x 0.170 D m -- inside the ticket's 0.22 x 0.40 x 0.22 --
base-seated at exactly y = 0 in the GLB (both soles flat on it), forward = -Z,
single-sided, no Draco.  Audit clean: 0 object-vs-object clips, 0 coplanar
pairs, 0 non-manifold edges, 0/4000 inverted first-hit rays.
Rebuild:  exec(open(__file__).read()); build(); export()

AXIS TRAP.  The glTF exporter's "+Y up" maps blender (x,y,z) -> gltf (x, z, -y),
so blender +Y becomes gltf -Z.  ASSETS.md wants forward = -Z, therefore
*** the gnome faces +Y in Blender. ***  Base-seated: boot soles at z = 0.

ONE OBJECT, FIVE MATERIAL SLOTS.  Beard, nose, arms and boots deliberately
interpenetrate the body -- that is how the parts blend without a seam.  Keeping
them in ONE mesh means the audit's object-vs-object clipping check stays a
meaningful signal instead of reporting the assembly back at us every run.

SEG = 8, PHASE = pi/2.  A vertex on +Y (the nose line) and one on -Y (the
spine), and the angle set is closed under reflection about the forward axis, so
the gnome is exactly left-right symmetric.  It was 9 while the figure was an egg;
the humanoid rebuild needs a belt band and two limbs it could not otherwise
afford, and one ring segment across the whole model pays for them.

STOCKY, NOT WILLOWY.  The first humanoid pass narrowed the torso correctly and
then left everything else at that width, producing a slim 0.156 m figure.  The
reference is a STOUT little man: head and boots are oversized against the torso,
and the widest thing on the model is the hands at the belt, not the shoulders.
Girth here is ~1.3x that pass, with the head and hat at 1.4x and the boots 1.45x.

THE BEARD DRAPES, IT DOES NOT HANG FLAT.  Its forward offset is SOLVED from the
body profile (see BEARD_SHAPE) so its front face always clears the coat by a
stated margin.  That makes the beard follow the belly outward as it descends,
which is what a real one does -- and it is why the offset must never be stated
as an absolute: two earlier passes did, and widening the body silently swallowed
the lower beard, cutting the white silhouette off with a horizontal edge.
"""

import bpy
import bmesh
import math

# ---------------------------------------------------------------------------
# PARAMETERS
# ---------------------------------------------------------------------------

TRI_BUDGET = 500
OUT_GLB = "/Users/ledogen/CodeShit/CarGame/assets/models/gnome.glb"
OUT_BLEND = "/Users/ledogen/CodeShit/CarGame/assets/models/src/gnome.blend"
OBJ_NAME = "Gnome"

SEG = 8                    # rings on body / hat / beard
SEG_LIMB = 6               # rings on arms / legs - they are ~35 mm across
PHASE = math.pi / 2        # first ring vertex on +Y (the nose line)

# Materials: (name, linear base colour, roughness).  LINEAR -- renders ~1.5x
# lighter than the tuple reads (ART-STYLE rule 5).
MATERIALS = {
    "GnomeHat":     ((0.450, 0.022, 0.026, 1.0), 0.55),  # classic pillar-box red
    "GnomeCoat":    ((0.030, 0.085, 0.340, 1.0), 0.55),  # cobalt blue tunic
    "GnomeBeard":   ((0.780, 0.780, 0.755, 1.0), 0.72),  # warm off-white
    "GnomeSkin":    ((0.800, 0.520, 0.420, 1.0), 0.60),  # nose, face band, hands
    "GnomeLeather": ((0.042, 0.024, 0.014, 1.0), 0.78),  # belt + trousers + boots
                                                         # rough, or the boots
                                                         # blow out to pale grey
                                                         # on every lit facet
    "GnomeBuckle":  ((0.690, 0.420, 0.055, 1.0), 0.35),  # brass, metalness still 0
}
MAT_ORDER = ["GnomeHat", "GnomeCoat", "GnomeBeard", "GnomeSkin",
             "GnomeLeather", "GnomeBuckle"]

# Stations are (z, cy, rx, ry) or (z, cx, cy, rx, ry) -- the 5-tuple form is for
# the limbs, which sit off the centreline.  All rings are horizontal.

# --- body: coat hem up through the belt, chest, shoulders, neck and head.  One
# sweep, six bands, because the belt is a BAND OF THIS TUBE and not a separate
# ring around it: as its own cylinder it cost 32 tris and needed two caps buried
# inside the coat, as two extra stations here it costs 16 and cannot z-fight.
#
# rx > ry throughout -- a torso is wider than it is deep, and a circular section
# is most of why the previous pass read as a skittle.
BODY = [
    (0.067, 0.0, 0.076, 0.062),   # coat hem, slight flare
    (0.112, 0.0, 0.071, 0.058),   # belt, lower edge      [band -> GnomeLeather]
    (0.132, 0.0, 0.072, 0.059),   # belt, upper edge
    (0.166, 0.0, 0.077, 0.062),   # chest
    (0.196, 0.0, 0.081, 0.065),   # SHOULDERS - the widest point on the torso,
    (0.216, 0.0, 0.050, 0.043),   #   at half the figure's height
    (0.238, 0.0, 0.064, 0.057),   # head       [band -> GnomeSkin]
    (0.258, 0.0, 0.058, 0.052),   # crown, capped by the hat
]
BODY_BANDS = ["GnomeCoat", "GnomeLeather", "GnomeCoat", "GnomeCoat",
              "GnomeCoat", "GnomeSkin", "GnomeSkin"]

# --- hat: a band that comes DOWN over the head, a brim flare, then the cone.
# The band matters: without it the hat sits on top of the skull like a lid and
# the back of the head is bare skin, since there is no hair on this model.
HAT = [
    (0.240, 0.000, 0.070, 0.062),   # band, hugging the head below the brim
    (0.272, 0.000, 0.079, 0.070),   # brim flare - widest, and it shades the face
    (0.284, 0.001, 0.065, 0.058),
    (0.316, 0.005, 0.048, 0.043),
    (0.350, 0.012, 0.031, 0.028),
    (0.380, 0.022, 0.015, 0.014),
    (0.400, 0.032, 0.005, 0.005),   # tip -> total height 0.400 m
]

# --- beard: (z, rx, ry, PROUD).  `proud` is how far the beard's front face
# clears the body's front face at that height; the cy offset is solved from the
# body profile.  See the header note on why this is not an absolute offset.
BEARD_SHAPE = [
    (0.266, 0.048, 0.036, 0.014),   # tucked under the hat band
    (0.240, 0.064, 0.050, 0.018),
    (0.214, 0.072, 0.058, 0.020),   # widest - and DELIBERATELY NARROWER than
    (0.184, 0.062, 0.052, 0.018),   #   the 0.081 shoulders, so blue shows at
                                    #   either side of it.  At 0.082 the beard
                                    #   ate them and the torso lost its slope.
    (0.150, 0.018, 0.024, 0.010),   # tip, landing just above the belt
]

# --- arms: shoulder -> hand, two bands, the second one bare skin.  The hands
# come FORWARD onto the belly at the belt line (cy 0.040), the way the reference
# rests them either side of the buckle -- hung straight down they read as two
# pink dots on the flanks.
ARM = [
    (0.192, 0.078, 0.004, 0.023, 0.023),   # shoulder     [sleeve]
    (0.150, 0.080, 0.026, 0.021, 0.021),   # cuff         [hand starts]
    (0.130, 0.066, 0.046, 0.022, 0.022),   # hand, ON the belly by the buckle -
                                           #   9 mm proud, no more.  At 23 mm
                                           #   the forward sweep from the cuff
                                           #   became a pale spike in profile.
]
ARM_BANDS = ["GnomeCoat", "GnomeSkin"]

# --- leg + boot as ONE limb: trouser at the top, widening down into the boot.
# Two separate parts cost 104 tris and a buried seam; one 4-station sweep costs
# 88 and the trouser-to-boot flare is free.  A scaled icosphere boot is the
# obvious cheap option and is wrong -- its sole is a point, so the gnome
# balances on two dots and only two vertices touch z = 0.
LIMB = [
    (0.000, 0.048, 0.034, 0.038, 0.066),   # sole, toe forward and PAST THE HEM
    (0.026, 0.047, 0.018, 0.034, 0.050),
    (0.048, 0.043, 0.004, 0.028, 0.033),   # boot cuff
    (0.082, 0.038, 0.000, 0.020, 0.020),   # trouser, up inside the coat hem
]

# --- nose: an icosahedron (20 tris), the ONLY face feature.  Sits at the hat
# band so it emerges from under the brim -- that gap IS the face.  It has to
# clear THE BRIM (y 0.050), not just the beard: past the beard alone it reads as
# a sliver in profile.
NOSE = ("GnomeSkin", (0.000, 0.066, 0.250), (0.024, 0.029, 0.024))

# --- buckle: a brass box on the front of the belt.  Six quads, twelve tris, and
# it is the single detail that says "garden gnome" rather than "small monk".
BUCKLE = ("GnomeBuckle", (-0.017, 0.056, 0.110), (0.017, 0.068, 0.134))


def _body_front(z):
    """Forward reach (max y) of the coat surface at height z."""
    pts = [(s[0], s[1] + s[3]) for s in BODY]
    if z <= pts[0][0]:
        return pts[0][1]
    for (z0, f0), (z1, f1) in zip(pts, pts[1:]):
        if z <= z1:
            t = (z - z0) / (z1 - z0)
            return f0 + t * (f1 - f0)
    return pts[-1][1]


BEARD = [(z, _body_front(z) + proud - ry, rx, ry)
         for (z, rx, ry, proud) in BEARD_SHAPE]


# ---------------------------------------------------------------------------
# GEOMETRY HELPERS
# ---------------------------------------------------------------------------

def _unpack(station):
    """(z, cy, rx, ry) or (z, cx, cy, rx, ry) -> (z, cx, cy, rx, ry)."""
    if len(station) == 4:
        z, cy, rx, ry = station
        return z, 0.0, cy, rx, ry
    return station


def ring(bm, station, seg, phase=PHASE, mirror=1.0):
    """One horizontal cross-section, CCW seen from +Z."""
    z, cx, cy, rx, ry = _unpack(station)
    cx *= mirror
    out = []
    for k in range(seg):
        a = phase + 2.0 * math.pi * k / seg
        out.append(bm.verts.new((cx + mirror * rx * math.cos(a),
                                 cy + ry * math.sin(a), z)))
    return out


def sweep(bm, stations, bands, seg=SEG, mirror=1.0,
          cap_bottom=True, cap_top=True):
    """Vertical swept tube.  `bands[i]` names the material of the band between
    station i and i+1; caps inherit the adjacent band's material.

    WINDING TRAP.  The face winding below assumes ring i sits BELOW ring i+1,
    and `mirror = -1` (the left limb) reverses handedness.  A beard table
    written top-down, or a mirrored arm, inverts every one of its faces --
    invisible in the viewport, which draws backfaces, and caught only by the
    ray-cast test in the audit."""
    if stations[0][0] > stations[-1][0]:
        stations = list(reversed(stations))
        bands = list(reversed(bands))
    rings = [ring(bm, s, seg, mirror=mirror) for s in stations]
    flip = mirror < 0
    for i in range(len(rings) - 1):
        lo, hi = rings[i], rings[i + 1]
        mi = MAT_ORDER.index(bands[i])
        for k in range(seg):
            k2 = (k + 1) % seg
            quad = (lo[k], lo[k2], hi[k2], hi[k])
            f = bm.faces.new(tuple(reversed(quad)) if flip else quad)
            f.material_index = mi
    if cap_bottom:
        r = rings[0] if flip else tuple(reversed(rings[0]))
        bm.faces.new(r).material_index = MAT_ORDER.index(bands[0])
    if cap_top:
        r = tuple(reversed(rings[-1])) if flip else rings[-1]
        bm.faces.new(r).material_index = MAT_ORDER.index(bands[-1])


def box(bm, mat, lo, hi):
    """An axis-aligned box - 6 quads, 12 tris, outward winding."""
    mi = MAT_ORDER.index(mat)
    v = {}
    for ix in (0, 1):
        for iy in (0, 1):
            for iz in (0, 1):
                v[(ix, iy, iz)] = bm.verts.new(
                    ((hi if ix else lo)[0], (hi if iy else lo)[1],
                     (hi if iz else lo)[2]))
    # Outward winding, each verified as (v1-v0) x (v2-v1) pointing out of the
    # box.  The first cut had all six reversed, which the viewport happily drew
    # (it renders backfaces) and only the ray-cast test caught.
    quads = [
        [(0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0)],   # -X
        [(1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)],   # +X
        [(0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)],   # -Y
        [(0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0)],   # +Y
        [(0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0)],   # -Z
        [(0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)],   # +Z
    ]
    for q in quads:
        bm.faces.new(tuple(v[k] for k in q)).material_index = mi


def blob(bm, mat, centre, radii):
    """A scaled icosahedron - 20 flat facets, no smoothing, no subdivision."""
    res = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
    mi = MAT_ORDER.index(mat)
    for v in res["verts"]:
        v.co.x = centre[0] + v.co.x * radii[0]
        v.co.y = centre[1] + v.co.y * radii[1]
        v.co.z = centre[2] + v.co.z * radii[2]
    for v in res["verts"]:
        for f in v.link_faces:
            f.material_index = mi


# ---------------------------------------------------------------------------
# BUILD
# ---------------------------------------------------------------------------

def _material(name):
    spec = MATERIALS[name]
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = spec[0]
    bsdf.inputs["Roughness"].default_value = spec[1]
    bsdf.inputs["Metallic"].default_value = 0.0
    # glTF exports doubleSided = not use_backface_culling.  Every shell here is
    # closed and the winding is ray-cast verified, so cull: it is free fill rate.
    m.use_backface_culling = True
    m.diffuse_color = spec[0]
    return m


def build():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for me in list(bpy.data.meshes):
        if me.users == 0:
            bpy.data.meshes.remove(me)

    bm = bmesh.new()
    sweep(bm, BODY, BODY_BANDS)
    sweep(bm, HAT, ["GnomeHat"] * (len(HAT) - 1))
    sweep(bm, BEARD, ["GnomeBeard"] * (len(BEARD) - 1))
    for m in (1.0, -1.0):
        sweep(bm, ARM, ARM_BANDS, seg=SEG_LIMB, mirror=m)
        sweep(bm, LIMB, ["GnomeLeather"] * (len(LIMB) - 1),
              seg=SEG_LIMB, mirror=m)
    blob(bm, *NOSE)
    box(bm, *BUCKLE)

    bm.normal_update()
    for f in bm.faces:
        f.smooth = False                      # ART-STYLE rule 3: faceted

    me = bpy.data.meshes.new(OBJ_NAME)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(OBJ_NAME, me)
    bpy.context.collection.objects.link(obj)
    for name in MAT_ORDER:
        me.materials.append(_material(name))
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    return obj


def stats():
    dg = bpy.context.evaluated_depsgraph_get()
    obj = bpy.data.objects[OBJ_NAME]
    ev = obj.evaluated_get(dg).to_mesh()
    tris = sum(len(p.vertices) - 2 for p in ev.polygons)
    xs = [v.co.x for v in ev.vertices]
    ys = [v.co.y for v in ev.vertices]
    zs = [v.co.z for v in ev.vertices]
    return {
        "tris": tris,
        "budget": TRI_BUDGET,
        "verts": len(ev.vertices),
        "materials": len(obj.data.materials),
        "images": len(bpy.data.images),
        "size": (round(max(xs) - min(xs), 4),
                 round(max(ys) - min(ys), 4),
                 round(max(zs) - min(zs), 4)),
        "z_min": round(min(zs), 5),
    }


def export():
    obj = bpy.data.objects[OBJ_NAME]
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.export_scene.gltf(
        filepath=OUT_GLB,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_draco_mesh_compression_enable=False,
        export_materials='EXPORT',
    )
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    return OUT_GLB
