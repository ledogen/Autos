"""
ASSET-02 - ceramic garden gnome, parametric generator.

Built for: Blender 5.x  |  Target: assets/models/gnome.glb
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

NO TEXTURE.  The ticket budgeted one 256x256 baked albedo for a painted face;
the owner's reference call (2026-08-19) is the *low-poly* face -- brim, beard,
and a single faceted nose between them, no eyes, no mouth.  With no face to
paint there is nothing a texture would carry that geometry does not, so this
lands back on the ART-STYLE default: 5 flat Principled materials, 0 images.

POSE: STANDING.  The classic upright lawn ornament -- boots on the ground,
tunic to the boot tops, arms down the sides with bare hands showing, beard
draped over the belly, tall floppy hat.  (A first pass built the seated,
cross-legged pose of the colour reference; the owner's call 2026-08-20 is
standing, which is also what the ticket's 0.22 x 0.40 x 0.22 envelope assumes.)

NO BASE DISC.  The seated version needed a plinth; standing on two boots does
not, and the flamingos (ASSET-01) already ship two thin legs with no base.
That also frees the fifth material for the boots instead of a plinth.

BUILT 2026-08-20 against Blender 5.2.0 LTS.  FINAL: 478 tris (budget 500),
255 verts, 5 materials, 0 images, 0 UV layers, one mesh object, 29.3 kB .glb.
0.2088 W x 0.400 H x 0.2056 D m -- inside the ticket's 0.22 x 0.40 x 0.22 --
base-seated at exactly y = 0 in the GLB (both soles flat on it), forward = -Z,
single-sided, no Draco.  Audit clean: 0 object-vs-object clips, 0 coplanar
pairs, 0 non-manifold edges, 0/3000 inverted first-hit rays.
Rebuild:  exec(open(__file__).read()); build(); export()

AXIS TRAP.  The glTF exporter's "+Y up" maps blender (x,y,z) -> gltf (x, z, -y),
so blender +Y becomes gltf -Z.  ASSETS.md wants forward = -Z, therefore
*** the gnome faces +Y in Blender. ***  Base-seated: boot soles at z = 0.

ONE OBJECT, FIVE MATERIAL SLOTS.  Beard, nose, arms and boots deliberately
interpenetrate the body -- that is how the parts blend without a seam.  Keeping
them in ONE mesh means the audit's object-vs-object clipping check stays a
meaningful signal instead of reporting the assembly back at us every run.

SEG = 9, PHASE = pi/2.  Odd ring count with the first vertex on +Y: the angle
set is closed under reflection about the forward axis, so the gnome is exactly
left-right symmetric, with a vertex on the nose line and a flat facet at the
spine.  (Same reasoning as flamingo.py.)

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

SEG = 9                    # rings on body / hat / beard
SEG_LIMB = 6               # rings on arms / boots - they are 40 mm across
PHASE = math.pi / 2        # first ring vertex on +Y (the nose line)

# Materials: (name, linear base colour, roughness).  LINEAR -- renders ~1.5x
# lighter than the tuple reads (ART-STYLE rule 5).
MATERIALS = {
    "GnomeHat":   ((0.450, 0.022, 0.026, 1.0), 0.55),   # classic pillar-box red
    "GnomeCoat":  ((0.030, 0.085, 0.340, 1.0), 0.55),   # cobalt blue tunic
    "GnomeBeard": ((0.780, 0.780, 0.755, 1.0), 0.72),   # warm off-white
    "GnomeSkin":  ((0.800, 0.520, 0.420, 1.0), 0.60),   # nose and hands
    "GnomeBoot":  ((0.045, 0.026, 0.016, 1.0), 0.60),   # dark brown boots
}
MAT_ORDER = ["GnomeHat", "GnomeCoat", "GnomeBeard", "GnomeSkin", "GnomeBoot"]

# Stations are (z, cy, rx, ry) or (z, cx, cy, rx, ry) -- the 5-tuple form is for
# the limbs, which sit off the centreline.  All rings are horizontal.

# --- body: tunic hem up to the neck.  Widest at the belly, because a gnome is
# a pear: narrow the belly and the whole thing reads as a traffic cone.
BODY = [
    (0.045, 0.0, 0.068, 0.064),   # hem - the boot tops come up through this
    (0.085, 0.0, 0.094, 0.088),
    (0.120, 0.0, 0.100, 0.094),   # belly - widest point on the figure
    (0.165, 0.0, 0.096, 0.090),
    (0.212, 0.0, 0.082, 0.076),   # chest
    (0.248, 0.0, 0.058, 0.054),   # shoulders
    (0.270, 0.0, 0.042, 0.040),   # neck, swallowed by the hat brim
]

# --- hat: brim, then a cone leaning forward into a blunt tip.  The tip is a
# small RING, not a point: a degenerate ring welds into a fan and loses the
# moulded-ceramic blunt end (flamingo.py learned this the hard way).
HAT = [
    (0.250, 0.000, 0.106, 0.098),   # brim edge - MUST out-reach the BEARD, not
    (0.268, 0.002, 0.100, 0.092),   #   just the shoulders; a brim narrower than
    (0.282, 0.004, 0.076, 0.070),   #   shadow.  The step here reads as a band.
    (0.316, 0.010, 0.058, 0.054),
    (0.352, 0.022, 0.038, 0.036),
    (0.382, 0.040, 0.018, 0.017),
    (0.400, 0.058, 0.005, 0.005),   # tip -> total height 0.400 m
]

# --- beard: (z, rx, ry, PROUD).  `proud` is how far the beard's front face
# clears the coat's front face at that height; the cy offset is solved from the
# body profile.  See the header note on why this is not an absolute offset.
BEARD_SHAPE = [
    (0.252, 0.060, 0.046, 0.016),   # tucked under the brim
    (0.222, 0.080, 0.058, 0.020),
    (0.190, 0.086, 0.064, 0.022),   # widest
    (0.150, 0.062, 0.052, 0.018),   # TAPER HARD from here - a beard that stays
    (0.115, 0.016, 0.026, 0.010),   #   fat to the hem reads as a snowman
]

# --- arms: shoulder -> hand, two bands, the second one bare skin.  This is the
# whole reason the standing pose can have hands and the seated one could not:
# an arm explains a hand.  THE SHOULDER STATION SITS LOW, at z 0.228 where the
# tunic is still 75 mm wide, so the arm emerges from inside the flank; hung off
# the 0.248 shoulder instead it perched on the outside and read as a bolted-on
# slab with a visible flat cap.  The beard
# (which sits ~35 mm further forward) hides their inner edge from the front.
ARM = [
    (0.228, 0.070, 0.004, 0.026, 0.026),   # shoulder     [sleeve]
    (0.155, 0.082, 0.010, 0.022, 0.022),   # cuff         [hand starts]
    (0.120, 0.086, 0.018, 0.021, 0.021),   # knuckles
]
ARM_BANDS = ["GnomeCoat", "GnomeSkin"]

# --- boots: flat-soled, toes forward and splayed.  A scaled icosphere was the
# obvious cheap boot and is wrong: its sole is a point, so the gnome balances on
# two dots and z_min is only touched at two vertices.  A 3-station sweep is the
# same tri cost and lands the whole sole on z = 0.
BOOT = [
    (0.000, 0.050, 0.030, 0.030, 0.056),   # sole - THE TOE MUST CLEAR THE HEM.
    (0.028, 0.050, 0.016, 0.028, 0.044),   #   The tunic reaches y 0.064 and a
    (0.056, 0.048, 0.004, 0.026, 0.034),   #   boot tucked under it has no toe.
                                           # cx 0.050, NOT 0.042: at 0.042 the
                                           # two boots very nearly touch and
                                           # read as one stumpy pedestal.
]

# --- nose: an icosahedron (20 tris), the ONLY face feature.  Sits at the brim
# line so it emerges from under the overhang -- that gap IS the face.  It has
# to clear THE BRIM (y 0.098), not just the beard: 13 mm past the brim read as
# a sliver in profile, 21 mm reads as a nose.
NOSE = ("GnomeSkin", (0.000, 0.082, 0.232), (0.033, 0.037, 0.033))


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
    sweep(bm, BODY, ["GnomeCoat"] * (len(BODY) - 1))
    sweep(bm, HAT, ["GnomeHat"] * (len(HAT) - 1))
    sweep(bm, BEARD, ["GnomeBeard"] * (len(BEARD) - 1))
    for m in (1.0, -1.0):
        sweep(bm, ARM, ARM_BANDS, seg=SEG_LIMB, mirror=m)
        sweep(bm, BOOT, ["GnomeBoot"] * (len(BOOT) - 1), seg=SEG_LIMB, mirror=m)
    blob(bm, *NOSE)

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
