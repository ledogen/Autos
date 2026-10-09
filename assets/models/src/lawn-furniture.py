"""
Lawn furniture kit — ASSET-06 awning + a folding camp chair.  Parametric
generator (a kit: one .py, one .glb per item, per ASSETS.md).

Built for: Blender 5.x  |  First placed at the firewood vendor (ASSET-36,
`SpotAwning`): splitting-yard.py composites awning.glb + camp-chair.glb into
the yard, so RE-EXPORT THE YARD after changing either.
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

Outputs:
  awning.glb      — free-standing striped camp awning, 3.0 x 2.5 m, eave 2.2 /
                    ridge 2.5 m, four poles, open front to -Z (glTF).
  camp-chair.glb  — folding quad camp chair, sling seat, fabric arms.

NO TEXTURE (ART-STYLE rule 1).  The ticket allowed per-panel material slots
instead of a stripe albedo: the canopy is cut into STRIPES panels that
alternate `AwningStripe` / `AwningWhite`.  Each is a recolour hook.

DOUBLE-SIDED FABRIC.  The canopy, valance and chair sling are single sheets,
seen from both sides, so their materials export `doubleSided` (backface
culling off) — ASSET-06 acceptance.  Their open edges are non-manifold by
design.  Frames are closed tubes, single-sided.

AXES.  Blender +Y = glTF -Z = the awning's open front / the way a chair faces.
Base-seated at z = 0, centred on the footprint.
"""

import bpy
import bmesh
import math
from mathutils import Matrix, Vector

# ---------------------------------------------------------------------------
# PARAMETERS
# ---------------------------------------------------------------------------
MODELS = "/Users/ledogen/CodeShit/CarGame/assets/models"
OUT_DIR = MODELS
OUT_BLEND = f"{MODELS}/src/lawn-furniture.blend"

TRI_BUDGETS = {"awning": 450, "camp-chair": 250}

MATS = {
    #  name             base colour (linear)          rough  double-sided
    "AwningStripe":  ((0.030, 0.110, 0.380, 1.0), 0.90, True),    # recolour hook
    "AwningWhite":   ((0.780, 0.760, 0.700, 1.0), 0.90, True),
    "AwningFrame":   ((0.180, 0.180, 0.190, 1.0), 0.45, False),
    "ChairFabric":   ((0.020, 0.110, 0.040, 1.0), 0.90, True),    # recolour hook
    "ChairFrame":    ((0.025, 0.025, 0.028, 1.0), 0.50, False),
}

# Awning (ASSET-06): ridge along X, slopes front (+Y) and back.
AW_W, AW_D = 3.0, 2.5           # footprint, X x Y
AW_EAVE, AW_RIDGE = 2.2, 2.5
STRIPES = 8                     # panels across the width, alternating colours
SAG_SPAN = 0.05                 # fabric dips this much mid-span between poles
SAG_SLOPE = 0.04                # ...and this much mid-slope, ridge to eave
VALANCE = 0.20                  # pointed valance drop at the front and back eaves
POLE_R, POLE_SEG = 0.022, 6

# Camp chair: seat front at +Y.
CH_W = 0.54                     # leg-to-leg width
CH_FRONT, CH_BACK = 0.24, -0.24 # leg y at the feet
CH_SEAT = 0.42                  # seat rail height
CH_SAG = 0.07                   # sling dips this much mid-seat
CH_ARM = 0.62                   # armrest height
CH_TOP, CH_RECLINE = 0.92, 0.10 # backrest top height, how far back it leans
TUBE = 0.022                    # frame tube size
# RESCALED 2026-10-07 (owner, FEAT-71): the chair ships x1.1, applied to the finished part, so the
# CH_* dimensions above stay the original chair's. splitting-yard.py composites camp-chair.glb, so
# the yard was re-exported with it (4972 tris, budget 5000) — re-export it after any chair change.
CH_SCALE = 1.1


# ---------------------------------------------------------------------------
# Geometry accumulator + primitives (same machinery as splitting-yard.py)
# ---------------------------------------------------------------------------
class Part:
    def __init__(self, name):
        self.name, self.v, self.f, self.m = name, [], [], []

    def add(self, verts, faces, mat, M=None):
        o = len(self.v)
        if M is not None:
            verts = [tuple(M @ Vector(c)) for c in verts]
        self.v.extend(tuple(c) for c in verts)
        for k, fc in enumerate(faces):
            self.f.append([i + o for i in fc])
            self.m.append(mat[k] if isinstance(mat, list) else mat)


def T(x, y, z):
    return Matrix.Translation((x, y, z))


def box(p, lo, hi, mat, M=None):
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
         (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    f = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
         [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
    p.add(v, f, mat, M)


def lathe(p, profile, seg, mat, M=None):
    """Capped surface of revolution about local Z; profile = [(z, r)]."""
    v, f = [], []
    for z, r in profile:
        v += [(math.cos(2 * math.pi * k / seg) * r,
               math.sin(2 * math.pi * k / seg) * r, z) for k in range(seg)]
    for s in range(len(profile) - 1):
        a, b = s * seg, (s + 1) * seg
        f += [[a + k, a + (k + 1) % seg, b + (k + 1) % seg, b + k]
              for k in range(seg)]
    last = (len(profile) - 1) * seg
    f += [list(range(seg - 1, -1, -1)), list(range(last, last + seg))]
    p.add(v, f, mat, M)


def bar(p, a, b, w, mat):
    """Square tube of side w from point a to point b."""
    a, b = Vector(a), Vector(b)
    d = b - a
    q = d.normalized().to_track_quat("Z", "Y").to_matrix().to_4x4()
    box(p, (-w / 2, -w / 2, 0), (w / 2, w / 2, d.length), mat,
        Matrix.Translation(a) @ q)


def sheet(p, grid, mats):
    """A single-sided fabric sheet from a grid of points [row][col]; every
    quad is split into two triangles (sagged quads are not planar).
    mats(r, c) -> material of the quad at row r, column c."""
    rows, cols = len(grid), len(grid[0])
    o = len(p.v)
    for row in grid:
        p.v.extend(tuple(c) for c in row)
    for r in range(rows - 1):
        for c in range(cols - 1):
            a, b = o + r * cols + c, o + r * cols + c + 1
            d, e = o + (r + 1) * cols + c, o + (r + 1) * cols + c + 1
            p.f += [[a, b, e], [a, e, d]]
            p.m += [mats(r, c)] * 2


# ---------------------------------------------------------------------------
# Awning (ASSET-06)
# ---------------------------------------------------------------------------
def build_awning():
    p = Part("awning")
    hw, hd = AW_W / 2, AW_D / 2

    def canopy_z(x, y):
        """Gable roof, slack: dips mid-span (between the end poles) and
        mid-slope (between ridge and eave)."""
        t = abs(y) / hd                                  # 0 ridge .. 1 eave
        z = AW_RIDGE + (AW_EAVE - AW_RIDGE) * t
        return (z - SAG_SPAN * math.sin(math.pi * (x + hw) / AW_W)
                - SAG_SLOPE * math.sin(math.pi * t))

    xs = [-hw + AW_W * i / STRIPES for i in range(STRIPES + 1)]
    ys = [hd, hd / 2, 0.0, -hd / 2, -hd]                 # eave, mid, ridge, mid, eave
    grid = [[(x, y, canopy_z(x, y)) for x in xs] for y in ys]
    stripe = lambda r, c: "AwningStripe" if c % 2 == 0 else "AwningWhite"
    sheet(p, grid, stripe)

    # Pointed valance under each long eave: one pennant per stripe.
    for y in (hd, -hd):
        for c in range(STRIPES):
            x0, x1 = xs[c], xs[c + 1]
            xm = (x0 + x1) / 2
            z0, z1, zm = canopy_z(x0, y), canopy_z(x1, y), canopy_z(xm, y)
            o = len(p.v)
            p.v += [(x0, y, z0), (x1, y, z1), (x1, y, z1 - VALANCE * 0.6),
                    (xm, y, zm - VALANCE), (x0, y, z0 - VALANCE * 0.6)]
            p.f += [[o, o + 1, o + 2], [o, o + 2, o + 3], [o, o + 3, o + 4]]
            p.m += [stripe(0, c)] * 3

    # Frame: four poles to the eave corners, end rafters up to the ridge.
    for sx in (-1, 1):
        for sy in (-1, 1):
            lathe(p, [(0.0, POLE_R), (AW_EAVE - 0.01, POLE_R)], POLE_SEG,
                  "AwningFrame", M=T(sx * hw, sy * hd, 0))
            bar(p, (sx * hw, sy * hd, AW_EAVE - 0.03),
                (sx * hw, 0.0, AW_RIDGE - 0.03), 0.03, "AwningFrame")
    return p


# ---------------------------------------------------------------------------
# Folding camp chair
# ---------------------------------------------------------------------------
def build_chair():
    p = Part("camp-chair")
    hw = CH_W / 2
    F, K = "ChairFabric", "ChairFrame"
    back_top_y = CH_BACK - CH_RECLINE
    for sx in (-1, 1):
        x = sx * hw
        bar(p, (x, CH_FRONT, 0.0), (x, CH_FRONT - 0.02, CH_ARM), TUBE, K)   # front leg
        bar(p, (x, CH_BACK, 0.0), (x, back_top_y, CH_TOP), TUBE, K)         # back leg + upright
        bar(p, (x, CH_FRONT, 0.02), (x, CH_BACK - 0.02, CH_SEAT), TUBE, K)  # side X
        bar(p, (x, CH_BACK, 0.02), (x, CH_FRONT - 0.01, CH_SEAT), TUBE, K)
        # fabric armrest, front leg top to the upright
        ya = CH_BACK - CH_RECLINE * (CH_ARM / CH_TOP)
        box(p, (x - 0.035, ya, CH_ARM), (x + 0.035, CH_FRONT + 0.01, CH_ARM + 0.012), F)
    bar(p, (-hw, CH_FRONT, 0.02), (hw, CH_FRONT, CH_SEAT), TUBE, K)          # front X
    bar(p, (hw, CH_FRONT, 0.02), (-hw, CH_FRONT, CH_SEAT), TUBE, K)

    # Sling seat: front rail to back rail, dipping in the middle both ways.
    sx = [-hw + 0.01, 0.0, hw - 0.01]
    sy = [CH_FRONT - 0.02, (CH_FRONT + CH_BACK) / 2, CH_BACK + 0.01]

    def seat_z(i, j):
        return CH_SEAT - CH_SAG * (1 if (i == 1 and j == 1) else
                                   0.5 if (i == 1 or j == 1) else 0)
    sheet(p, [[(sx[i], sy[j], seat_z(i, j)) for i in range(3)] for j in range(3)],
          lambda r, c: F)
    # Backrest: seat back up the reclined uprights, slightly cupped.
    rows = []
    for t in (0.0, 0.5, 1.0):
        y = CH_BACK + 0.01 - CH_RECLINE * t
        z = CH_SEAT + (CH_TOP - 0.02 - CH_SEAT) * t
        rows.append([(-hw + 0.01, y, z), (0.0, y - 0.03, z), (hw - 0.01, y, z)])
    sheet(p, rows, lambda r, c: F)
    p.v = [(x * CH_SCALE, y * CH_SCALE, z * CH_SCALE) for x, y, z in p.v]
    return p


VARIANTS = [("awning", build_awning), ("camp-chair", build_chair)]


# ---------------------------------------------------------------------------
# Bake / verify / export
# ---------------------------------------------------------------------------
def get_material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    col, rough, double = MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = col
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = 0.0
    m.diffuse_color = col
    m.roughness = rough
    m.use_backface_culling = not double    # exports glTF doubleSided
    return m


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
    bpy.context.collection.objects.link(ob)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = False
    return ob


def evaluated_tris(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    m = ev.to_mesh()
    m.calc_loop_triangles()
    n = len(m.loop_triangles)
    ev.to_mesh_clear()
    return n


def _fresh_scene():
    # Clear in place — NOT wm.read_homefile (frees the screen under a caller).
    for d in (bpy.data.objects, bpy.data.meshes, bpy.data.materials):
        for x in list(d):
            d.remove(x)


def build():
    """Source view: the kit side by side."""
    _fresh_scene()
    print("=" * 60)
    for i, (name, builder) in enumerate(VARIANTS):
        part = builder()
        part.v = [(x + i * 3.6, y, z) for x, y, z in part.v]
        ob = bake(part)
        print(f"  {name:12s} {evaluated_tris(ob):4d} tris (budget {TRI_BUDGETS[name]})")
    print(f"  materials {len(bpy.data.materials)}  images {len(bpy.data.images)}")
    print("=" * 60)


def export():
    for name, builder in VARIANTS:
        _fresh_scene()
        bake(builder())
        bpy.ops.export_scene.gltf(
            filepath=f"{OUT_DIR}/{name}.glb", export_format="GLB",
            export_draco_mesh_compression_enable=False, export_yup=True,
            export_apply=True, export_materials="EXPORT", export_texcoords=False,
            export_normals=True, export_cameras=False, export_lights=False,
            use_selection=False)
        print(f"  wrote {OUT_DIR}/{name}.glb")
    build()
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    print(f"  wrote {OUT_BLEND}")


if __name__ == "__main__":
    build()
