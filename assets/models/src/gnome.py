"""
ASSET-02 - ceramic garden gnome, parametric generator.

Built for: Blender 5.x  |  Target: assets/models/gnome.glb
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

NO TEXTURE.  The ticket budgeted one 256x256 baked albedo for a painted face;
the owner's reference call (2026-08-19) is the *low-poly* face -- brim, beard,
and a single faceted nose between them, no eyes, no mouth.  With no face to
paint there is nothing a texture would carry that geometry does not, so this
lands back on the ART-STYLE default: 5 flat Principled materials, 0 images.

POSE: seated, cross-legged, on a dark plinth (reference 1).  Bare feet peek
from the hem and the knees are a free ring bulge.  NO HANDS -- see the note on
HANDS below.  The solar orbs of the reference are NOT modelled: they are a
garden-lighting gimmick, they would need emissive + alpha (ART-STYLE rule 7),
and the ticket asks for a plain ceramic gnome.

BUILT 2026-08-19 against Blender 5.2.0 LTS.  Final: 426 tris (budget 500),
225 verts, 5 materials, 0 images, 0 UV layers, one mesh object, 27.9 kB .glb.
0.2915 W x 0.400 H x 0.3142 D m, base-seated at exactly y = 0 in the GLB,
forward = -Z, single-sided, no Draco.  Audit clean: 0 object-vs-object clips,
0 coplanar pairs, 0 non-manifold edges, 0/2000 inverted first-hit rays.
Rebuild:  exec(open(__file__).read()); build(); export()

AXIS TRAP.  The glTF exporter's "+Y up" maps blender (x,y,z) -> gltf (x, z, -y),
so blender +Y becomes gltf -Z.  ASSETS.md wants forward = -Z, therefore
*** the gnome faces +Y in Blender. ***  Base-seated: plinth underside at z = 0.

ONE OBJECT, FIVE MATERIAL SLOTS.  Beard, nose and feet deliberately
interpenetrate the body -- that is how the parts blend without a seam.  Keeping
them in ONE mesh means the audit's object-vs-object clipping check stays a
meaningful signal instead of reporting the assembly back at us every run.

SEG = 9, PHASE = pi/2.  Odd ring count with the first vertex on +Y: the angle
set is closed under reflection about the forward axis, so the gnome is exactly
left-right symmetric, with a vertex on the nose line and a flat facet at the
spine.  (Same reasoning as flamingo.py.)

THE BEARD MUST OUT-REACH THE COAT.  A gnome read from the front is beard --
the coat is a rim of colour at the sides and below.  Beard front reach is
~0.128 m against the coat's ~0.118 m at the same height; drop below that and
the beard sinks into the chest and the silhouette goes to a blue egg.
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
PHASE = math.pi / 2        # first ring vertex on +Y (the nose line)

# Materials: (name, linear base colour, roughness).  LINEAR -- renders ~1.5x
# lighter than the tuple reads (ART-STYLE rule 5).
MATERIALS = {
    "GnomeHat":   ((0.450, 0.022, 0.026, 1.0), 0.55),   # classic pillar-box red
    "GnomeCoat":  ((0.030, 0.085, 0.340, 1.0), 0.55),   # cobalt blue
    "GnomeBeard": ((0.780, 0.780, 0.755, 1.0), 0.72),   # warm off-white
    "GnomeSkin":  ((0.800, 0.520, 0.420, 1.0), 0.60),   # nose, hands, feet
    "GnomeBase":  ((0.030, 0.032, 0.028, 1.0), 0.60),   # dark plinth
}
MAT_ORDER = ["GnomeHat", "GnomeCoat", "GnomeBeard", "GnomeSkin", "GnomeBase"]

# --- body: one sweep from the plinth underside up to the neck.  (z, cy, rx, ry)
# Bands 0..1 are the plinth, 2.. are the robe.  Widest at the lap (z 0.090):
# a seated gnome spreads, and that spread is most of the silhouette.
BODY = [
    (0.000, 0.020, 0.130, 0.160),  # plinth: an OVAL pushed forward, so the feet
    (0.022, 0.020, 0.132, 0.162),  #   land on it instead of overhanging it.
                                   # top lip a hair proud -> a dark shadow
    (0.030, 0.008, 0.140, 0.126),  #  band under the hem for free (flat shading)
    (0.090, 0.010, 0.148, 0.132),  # lap - widest, and pushed FORWARD: a seated
                                   #   figure has a lap, a cone does not
    (0.160, 0.0, 0.126, 0.112),
    (0.215, 0.0, 0.100, 0.090),   # shoulders
    (0.248, 0.0, 0.074, 0.068),   # neck, swallowed by the hat brim
]
BODY_BANDS = ["GnomeBase", "GnomeBase", "GnomeCoat",
              "GnomeCoat", "GnomeCoat", "GnomeCoat"]

# The crossed knees, for FREE.  At SEG 9 / PHASE pi/2 the ring angles are
# 90 + 40k degrees, so k = 1 and 8 sit at 130/50 deg -- the front quarters,
# exactly where a cross-legged figure's knees push the robe out.  Displacing
# those two vertices on the two lap stations costs no tris and flat shading
# turns each bulge into its own light/dark facet pair (ART-STYLE rule 2).
# Modelling the knees as separate blobs instead cost 40 tris and read as
# pebbles stuck to the flanks.
KNEE_STATIONS = (2, 3)
KNEE_VERTS = (1, 8)
KNEE_BULGE = 0.20            # fraction of the local radius, pushed out and forward

# --- hat: brim, then a cone leaning forward into a blunt curled tip.
# The tip is a small RING, not a point: a degenerate ring welds into a fan and
# loses the moulded-ceramic blunt end (flamingo.py learned this the hard way).
HAT = [
    (0.200, 0.000, 0.132, 0.120),   # brim edge - MUST out-reach the shoulders,
    (0.222, 0.002, 0.126, 0.115),   #   the overhang is what puts the face in
    (0.238, 0.004, 0.104, 0.096),   #   shadow.  The step here reads as a band.
    (0.282, 0.010, 0.086, 0.079),
    (0.326, 0.020, 0.060, 0.056),
    (0.364, 0.036, 0.034, 0.032),
    (0.391, 0.056, 0.015, 0.014),
    (0.400, 0.072, 0.005, 0.005),   # tip -> total height 0.400 m
]

# --- beard: a broad shield hung off the brim, tapering to a blunt point above
# the lap.  Stated as (z, rx, ry, PROUD): `proud` is how far the beard's front
# face clears the coat's front face at that height, and the cy offset is solved
# from the body profile below.  Stating it as an absolute cy is how the first
# two passes went wrong -- widening the lap silently ate the clearance and the
# lower beard sank inside the coat, cutting the white silhouette off with a
# horizontal edge halfway down.
BEARD_SHAPE = [
    (0.204, 0.092, 0.070, 0.022),   # tucked under the brim
    (0.180, 0.122, 0.088, 0.028),
    (0.150, 0.132, 0.096, 0.030),   # widest - WIDER than the coat here.
    (0.120, 0.118, 0.092, 0.030),   #   The beard IS the front of the figure.
    (0.098, 0.082, 0.074, 0.026),
    (0.082, 0.026, 0.034, 0.018),   # blunt tip, above the lap
]

# --- blobs: (material, centre, radii).  Icosahedra (20 tris each) scaled --
# at 0.4 m tall a nose is a facet cluster, not a modelled feature.
NOSE = ("GnomeSkin", (0.000, 0.130, 0.188), (0.034, 0.038, 0.034))
# NO HANDS.  Reference 1's hands exist to cup its two solar orbs; with the orbs
# gone they were tried three ways -- on the flanks, on the knee crests, and
# outboard of the beard -- and every one read as a pebble stuck to the model.
# A hand needs an arm to explain it, and an arm is 60 tris to be hidden behind
# the beard from every angle that matters.  Cut, and the 40 tris stayed unspent.
#
# Feet toe OUT (yaw), which is what sells "cross-legged" -- two axis-aligned
# ellipsoids side by side read as a pair of pebbles at the hem.
FEET = [("GnomeSkin", (sx * 0.060, 0.132, 0.034), (0.038, 0.056, 0.022),
         sx * -0.42) for sx in (-1, 1)]


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

def ring(bm, station, seg=SEG, phase=PHASE):
    """One horizontal cross-section, CCW seen from +Z."""
    z, cy, rx, ry = station
    out = []
    for k in range(seg):
        a = phase + 2.0 * math.pi * k / seg
        out.append(bm.verts.new((rx * math.cos(a), cy + ry * math.sin(a), z)))
    return out


def sweep(bm, stations, bands, cap_bottom=True, cap_top=True, seg=SEG,
          bulge=None):
    """Vertical swept tube.  `bands[i]` names the material of the band between
    station i and i+1.  Caps inherit the adjacent band's material.
    `bulge` = (station_indices, vert_indices, amount) displaces those ring
    vertices outward and forward -- free geometric detail, no extra tris."""
    # WINDING TRAP.  The face winding below assumes ring i sits BELOW ring i+1.
    # BEARD_SHAPE is written top-down because that is how a beard is described,
    # and building it as given inverted every one of its faces -- invisible in
    # the viewport (Blender draws backfaces), caught only by the ray-cast test.
    if stations[0][0] > stations[-1][0]:
        stations = list(reversed(stations))
        bands = list(reversed(bands))
        if bulge:
            n = len(stations) - 1
            bulge = ([len(stations) - 1 - i for i in bulge[0]], bulge[1], bulge[2])
    rings = [ring(bm, s, seg) for s in stations]
    if bulge:
        st_idx, v_idx, amt = bulge
        for i in st_idx:
            for k in v_idx:
                v = rings[i][k]
                v.co.x *= (1.0 + amt)
                v.co.y += amt * abs(v.co.y - stations[i][1]) + 0.006
    faces = []
    for i in range(len(rings) - 1):
        lo, hi = rings[i], rings[i + 1]
        mi = MAT_ORDER.index(bands[i])
        for k in range(seg):
            k2 = (k + 1) % seg
            f = bm.faces.new((lo[k], lo[k2], hi[k2], hi[k]))   # outward normal
            f.material_index = mi
            faces.append(f)
    if cap_bottom:
        f = bm.faces.new(tuple(reversed(rings[0])))            # -Z
        f.material_index = MAT_ORDER.index(bands[0])
        faces.append(f)
    if cap_top:
        f = bm.faces.new(tuple(rings[-1]))                     # +Z
        f.material_index = MAT_ORDER.index(bands[-1])
        faces.append(f)
    return faces


def blob(bm, mat, centre, radii, yaw=0.0):
    """A scaled icosahedron - 20 flat facets, no smoothing, no subdivision."""
    res = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
    mi = MAT_ORDER.index(mat)
    verts = res["verts"]
    ca, sa = math.cos(yaw), math.sin(yaw)
    for v in verts:
        x, y, z = v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2]
        v.co.x = centre[0] + x * ca - y * sa
        v.co.y = centre[1] + x * sa + y * ca
        v.co.z = centre[2] + z
    seen = set()
    for v in verts:
        for f in v.link_faces:
            if f.index not in seen or f.index < 0:
                f.material_index = mi
                seen.add(f.index)
    return verts


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
    sweep(bm, BODY, BODY_BANDS,
          bulge=(KNEE_STATIONS, KNEE_VERTS, KNEE_BULGE))
    sweep(bm, HAT, ["GnomeHat"] * (len(HAT) - 1))
    sweep(bm, BEARD, ["GnomeBeard"] * (len(BEARD) - 1))
    for spec in [NOSE] + FEET:
        blob(bm, *spec)

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
