"""
Freight cargo kit 2 — the job box, a strapped bed load. (Water carboys ASSET-50 and traffic cones
ASSET-49 were built here too and killed by the owner, 2026-10-10.)

Built for: Blender 5.2  |  Targets: assets/models/<name>.glb  ·  source: assets/models/src/freight-2.blend
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

    job-box         ASSET-57  ≤300   steel jobsite chest on skids, lid shut, two straps to the bed
                                     tie-downs; JobBoxPaint recolours

Base-seated, centred on the footprint; long axis along Blender +Y (= glTF -Z, forward).
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix

OUT_DIR = "/Users/ledogen/CodeShit/CarGame/assets/models"
OUT_BLEND = "/Users/ledogen/CodeShit/CarGame/assets/models/src/freight-2.blend"
BUDGETS = {"job-box": 600}

MATS = {   # name: (linear rgba, roughness, alpha)
    "JobBoxPaint":  ((0.03, 0.30, 0.22, 1), 0.55, 1),
    "JobBoxSteel":  ((0.10, 0.10, 0.11, 1), 0.5, 1),
    "JobBoxDark":   ((0.012, 0.13, 0.09, 1), 0.55, 1),
    "Strap":        ((0.09, 0.10, 0.11, 1), 0.45, 1),
}

BED_HALF_W = 0.70   # Ranger bed inner half-width (data/vehicle-models.js innerHalfW): every strap
                    # runs out to a tie-down at the bed wall on the floor (owner 2026-10-09)
BED_ANCHORS = [(-BED_HALF_W, 0.0), (BED_HALF_W, 0.0)]


def _upper_hull(P):
    """Upper convex hull of 2D points, left to right — the path a tensioned strap takes."""
    P = sorted(set((round(a, 5), round(c, 5)) for a, c in P))
    def cross(o, a, b): return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    hull = []
    for p in reversed(P):
        while len(hull) >= 2 and cross(hull[-2], hull[-1], p) <= 0:
            hull.pop()
        hull.append(p)
    return hull[::-1]


def hull_strap(b, pts, y, anchors, w=0.03, axis="y"):
    """Double-sided ribbon over the upper hull of a 2D section, anchor to anchor (see freight.py)."""
    path = _upper_hull(list(pts) + list(anchors))
    for (a0, c0), (a1, c1) in zip(path, path[1:]):
        if axis == "y":
            b.face([(a0, y - w / 2, c0), (a1, y - w / 2, c1), (a1, y + w / 2, c1), (a0, y + w / 2, c0)], "Strap")
        else:
            b.face([(y - w / 2, a0, c0), (y - w / 2, a1, c1), (y + w / 2, a1, c1), (y + w / 2, a0, c0)], "Strap")


def get_material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    col, rough, alpha = MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = col; b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = 0.0
    if alpha < 1:
        b.inputs["Alpha"].default_value = alpha
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            m.blend_method = 'BLEND'
    m.diffuse_color = (*col[:3], alpha); m.roughness = rough; m.use_backface_culling = name != "Strap"
    return m


class Builder:
    def __init__(self):
        self.bm = bmesh.new(); self.slots = list(MATS)

    def face(self, pts, mat):
        f = self.bm.faces.new([self.bm.verts.new(Vector(p)) for p in pts])
        f.material_index = self.slots.index(mat); f.smooth = False
        return f

    def box(self, lo, hi, mat, xform=Matrix.Identity(4), skip=(), mats=None):
        x0, y0, z0 = lo; x1, y1, z1 = hi
        c = [xform @ Vector(p) for p in [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                                         (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]]
        q = {"-z": (0, 3, 2, 1), "+z": (4, 5, 6, 7), "-y": (0, 1, 5, 4), "+x": (1, 2, 6, 5), "+y": (2, 3, 7, 6), "-x": (3, 0, 4, 7)}
        for k, a in q.items():
            if k not in skip:
                self.face([c[i] for i in a], (mats or {}).get(k, mat))

    def bar(self, p0, p1, w, mat, caps=True):
        p0, p1 = Vector(p0), Vector(p1)
        ax = (p1 - p0).normalized()
        ref = Vector((0, 0, 1)) if abs(ax.z) < 0.9 else Vector((0, 1, 0))
        u = ax.cross(ref).normalized(); v = ax.cross(u).normalized()
        ring = lambda c: [c + (u + v) * w / 2, c + (-u + v) * w / 2, c + (-u - v) * w / 2, c + (u - v) * w / 2]
        a, t = ring(p0), ring(p1)
        for k in range(4):
            j = (k + 1) % 4
            self.face([a[k], a[j], t[j], t[k]], mat)
        if caps:
            self.face(list(reversed(a)), mat); self.face(t, mat)

    def lathe(self, profile, seg, mats, cx=0, cy=0, cap_bottom=True, cap_top=True, xform=Matrix.Identity(4), phase=0.0):
        """profile: (radius, z) bottom->top; mats: one name or a list, one per span."""
        if isinstance(mats, str):
            mats = [mats] * (len(profile) - 1)
        ang = [2 * math.pi * k / seg + phase for k in range(seg)]
        pt = lambda r, z, k: xform @ Vector((cx + r * math.cos(ang[k]), cy + r * math.sin(ang[k]), z))
        for s, ((ra, za), (rb, zb)) in enumerate(zip(profile, profile[1:])):
            for k in range(seg):
                j = (k + 1) % seg
                self.face([pt(ra, za, k), pt(ra, za, j), pt(rb, zb, j), pt(rb, zb, k)], mats[s])
        if cap_bottom and profile[0][0] > 0:
            self.face([pt(profile[0][0], profile[0][1], k) for k in reversed(range(seg))], mats[0])
        if cap_top and profile[-1][0] > 0:
            self.face([pt(profile[-1][0], profile[-1][1], k) for k in range(seg)], mats[-1])

    def rotate_z(self, deg):
        """Turn everything built so far about Z — puts the long axis along +Y, the bed's length."""
        M = Matrix.Rotation(math.radians(deg), 4, 'Z')
        for v in self.bm.verts:
            v.co = M @ v.co

    def finish(self, name):
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
        for s in self.slots:
            me.materials.append(get_material(s))
        for p in me.polygons:
            p.use_smooth = False
        ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
        fix_normals(ob)
        return ob


def fix_normals(ob):
    """Orient every face toward open air (see freight.py)."""
    from mathutils.bvhtree import BVHTree
    me = ob.data
    bm = bmesh.new(); bm.from_mesh(me); bm.normal_update()
    tree = BVHTree.FromBMesh(bm)
    flip = [f for f in bm.faces
            if tree.ray_cast(f.calc_center_median() - f.normal * 1e-4, -f.normal)[0] is None
            and tree.ray_cast(f.calc_center_median() + f.normal * 1e-4, f.normal)[0] is not None]
    for f in flip:
        f.normal_flip()
    bm.to_mesh(me); bm.free(); me.update()
    return len(flip)


# ---------------------------------------------------------------- job box
def build_jobbox(b):
    """Jobsite chest: skids, body with a darker lower band and five side ribs, lid with a lip and
    three ribs, two hasps with padlocks, drop handles, corner bumpers (owner 2026-10-09: use the budget)."""
    L, W, H, SK, LID = 1.2, 0.6, 0.50, 0.07, 0.08
    for x in (-0.45, 0.45):
        b.box((x - 0.04, -W / 2 + 0.03, 0), (x + 0.04, W / 2 - 0.03, SK), "JobBoxSteel", skip=("-z",))
    band = 0.16
    b.box((-L / 2, -W / 2, SK), (L / 2, W / 2, SK + band), "JobBoxDark", skip=("-z",))
    b.box((-L / 2, -W / 2, SK + band), (L / 2, W / 2, SK + H), "JobBoxPaint", skip=("-z",))
    for i in range(5):                                                  # vertical ribs both long sides
        x = -0.48 + i * 0.24
        for sy in (-1, 1):
            y0, y1 = (W / 2, W / 2 + 0.012) if sy > 0 else (-W / 2 - 0.012, -W / 2)
            b.box((x - 0.02, y0, SK + 0.02), (x + 0.02, y1, SK + H - 0.02), "JobBoxPaint", skip=("-y" if sy > 0 else "+y",))
    b.box((-L / 2 - 0.025, -W / 2 - 0.025, SK + H), (L / 2 + 0.025, W / 2 + 0.025, SK + H + LID), "JobBoxPaint")
    b.box((-L / 2 - 0.03, -W / 2 - 0.03, SK + H), (L / 2 + 0.03, W / 2 + 0.03, SK + H + 0.02), "JobBoxDark")      # lid lip
    for i in range(3):                                                  # lid ribs
        x = -0.36 + i * 0.36
        b.box((x - 0.03, -W / 2 - 0.025, SK + H + LID), (x + 0.03, W / 2 + 0.025, SK + H + LID + 0.012), "JobBoxPaint", skip=("-z",))
    for sx in (-1, 1):                                                  # end handles
        x = sx * (L / 2 + 0.035)
        b.bar((x, -0.12, SK + H * 0.6), (x, 0.12, SK + H * 0.6), 0.025, "JobBoxSteel")
        b.bar((x, -0.12, SK + H * 0.6), (sx * L / 2, -0.12, SK + H * 0.6), 0.02, "JobBoxSteel", caps=False)
        b.bar((x, 0.12, SK + H * 0.6), (sx * L / 2, 0.12, SK + H * 0.6), 0.02, "JobBoxSteel", caps=False)
    for x in (-0.3, 0.3):                                               # hasps + padlocks on the forward face
        b.box((x - 0.045, W / 2 + 0.012, SK + H - 0.10), (x + 0.045, W / 2 + 0.03, SK + H + 0.03), "JobBoxSteel", skip=("-y",))
        b.box((x - 0.03, W / 2 + 0.03, SK + H - 0.16), (x + 0.03, W / 2 + 0.06, SK + H - 0.09), "JobBoxSteel", skip=("-y",))
        b.bar((x - 0.02, W / 2 + 0.045, SK + H - 0.09), (x - 0.02, W / 2 + 0.045, SK + H - 0.05), 0.01, "JobBoxSteel", caps=False)
        b.bar((x + 0.02, W / 2 + 0.045, SK + H - 0.09), (x + 0.02, W / 2 + 0.045, SK + H - 0.05), 0.01, "JobBoxSteel", caps=False)
        b.bar((x - 0.02, W / 2 + 0.045, SK + H - 0.05), (x + 0.02, W / 2 + 0.045, SK + H - 0.05), 0.01, "JobBoxSteel", caps=False)
    for sx in (-1, 1):                                                  # corner bumpers
        for sy in (-1, 1):
            b.box((sx * L / 2 - (0.06 if sx > 0 else 0.005), sy * W / 2 - (0.06 if sy > 0 else 0.005), SK),
                  (sx * L / 2 + (0.005 if sx > 0 else 0.06), sy * W / 2 + (0.005 if sy > 0 else 0.06), SK + 0.12), "JobBoxSteel", skip=("-z",))
    # two straps over the lid between its ribs, down the long sides to the bed-wall tie-downs
    top = SK + H + LID
    for xs in (-0.18, 0.18):
        sec = [(-W / 2 - 0.029, 0), (W / 2 + 0.029, 0), (-W / 2 - 0.029, top + 0.004), (W / 2 + 0.029, top + 0.004),
               (-W / 2 - 0.034, SK + H + 0.024), (W / 2 + 0.034, SK + H + 0.024)]       # the lid lip
        hull_strap(b, sec, xs, BED_ANCHORS, axis="x")
    b.rotate_z(90)      # 1.2 m runs along the bed: 0.6 m across sits on the floor between the
                        # wheelhouses instead of 1.2 m riding on top of them (owner 2026-10-10)


VARIANTS = [("job-box", build_jobbox)]


def evaluated_tris(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = ob.evaluated_get(dg).to_mesh()
    return sum(len(p.vertices) - 2 for p in me.polygons)


def fresh_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.meshes):
        if m.users == 0:
            bpy.data.meshes.remove(m)
    for m in list(bpy.data.materials):          # else a re-run keeps stale colours / culling flags
        if m.users == 0:
            bpy.data.materials.remove(m)


def _ui_override():
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            return dict(window=bpy.context.window, area=area, region=next(r for r in area.regions if r.type == 'WINDOW'))
    return {}


def build_one(name, fn, dx=0.0):
    b = Builder(); fn(b); ob = b.finish("".join(w.title() for w in name.split("-")))
    ob.location.x = dx
    return ob


def export(only=None):
    for name, fn in VARIANTS:
        if only and name not in only:
            continue
        fresh_scene(); ob = build_one(name, fn); bpy.context.view_layer.update()
        print(f"{name}: {evaluated_tris(ob)}/{BUDGETS[name]} tris, dims {tuple(round(v, 2) for v in ob.dimensions)}")
        with bpy.context.temp_override(**_ui_override()):
            bpy.ops.export_scene.gltf(
                filepath=f"{OUT_DIR}/{name}.glb", export_format="GLB",
                export_draco_mesh_compression_enable=False, export_yup=True, export_apply=True,
                export_materials="EXPORT", export_texcoords=False, export_normals=True,
                export_cameras=False, export_lights=False, use_selection=False)
    fresh_scene(); x = 0.0
    for name, fn in VARIANTS:
        ob = build_one(name, fn, x); x += ob.dimensions.x + 1.0
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)


if __name__ == "__main__":
    export()
