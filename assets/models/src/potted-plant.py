"""
ASSET-07 — potted plant, doorstep dressing.  Parametric generator.

Built for: Blender 5.2  |  Targets: assets/models/<name>.glb  ·  source: assets/models/src/potted-plant.blend
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

The ticket's alpha-tested leaf cards predate ART-STYLE rule 7, which rules out cutout foliage
("cutout foliage is a texture").  Foliage is geometry here: a dozen faceted leaf blobs
(flattened octahedra, like the procedural bushes) on short stems, over an 8-sided terracotta pot.
No texture, no alpha, so it stays on the shared opaque path the ticket worried about.

Base-seated at the pot base; near-symmetric, forward −Z nominal.  Collision is the pot only.
Materials: PotTerracotta (recolour hook: terracotta / glazed blue / white), PotSoil, PlantLeaf, PlantStem.
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix

NAME = "potted-plant"
OUT_DIR = "/Users/ledogen/CodeShit/CarGame/assets/models"
OUT_BLEND = "/Users/ledogen/CodeShit/CarGame/assets/models/src/potted-plant.blend"
TRI_BUDGET = 500
SEG = 8
LEAVES = 13

MATS = {
    "PotTerracotta": ((0.55, 0.20, 0.10, 1), 0.85),
    "PotSoil":       ((0.05, 0.035, 0.02, 1), 1.0),
    "PlantLeaf":     ((0.10, 0.32, 0.08, 1), 0.9),
    "PlantStem":     ((0.12, 0.22, 0.06, 1), 0.9),
}


def get_material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    col, rough = MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = col; b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = 0.0
    m.diffuse_color = col; m.roughness = rough; m.use_backface_culling = True
    return m


class Builder:
    def __init__(self):
        self.bm = bmesh.new(); self.slots = list(MATS)

    def face(self, pts, mat):
        f = self.bm.faces.new([self.bm.verts.new(Vector(p)) for p in pts])
        f.material_index = self.slots.index(mat); f.smooth = False
        return f

    def bar(self, p0, p1, w, mat, caps=False):
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

    def lathe(self, profile, seg, mat, cap_bottom=True, cap_top=True):
        ang = [2 * math.pi * k / seg for k in range(seg)]
        pt = lambda r, z, k: (r * math.cos(ang[k]), r * math.sin(ang[k]), z)
        for (ra, za), (rb, zb) in zip(profile, profile[1:]):
            for k in range(seg):
                j = (k + 1) % seg
                self.face([pt(ra, za, k), pt(ra, za, j), pt(rb, zb, j), pt(rb, zb, k)], mat)
        if cap_bottom:
            self.face([pt(profile[0][0], profile[0][1], k) for k in reversed(range(seg))], mat)
        if cap_top:
            self.face([pt(profile[-1][0], profile[-1][1], k) for k in range(seg)], mat)

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


def leaf(b, c, d, length, width, mat):
    """A leaf as a flattened octahedron pointing along d: tip, base, and a 4-point mid ring."""
    c, d = Vector(c), Vector(d).normalized()
    side = d.cross(Vector((0, 0, 1))).normalized()
    up = side.cross(d).normalized()
    tip, base = c + d * length * 0.6, c - d * length * 0.4
    mid = [c + side * width / 2, c + up * width * 0.18, c - side * width / 2, c - up * width * 0.18]
    for k in range(4):
        j = (k + 1) % 4
        b.face([mid[k], mid[j], tip], mat)
        b.face([mid[j], mid[k], base], mat)


def build():
    b = Builder()
    # pot: tapered, with a rolled rim; soil disc just below the rim
    pot = [(0.10, 0), (0.105, 0.01), (0.135, 0.26), (0.15, 0.27), (0.15, 0.30), (0.13, 0.30), (0.13, 0.27)]
    b.lathe(pot, SEG, "PotTerracotta", cap_bottom=True, cap_top=False)
    b.lathe([(0.13, 0.27), (0.0, 0.27)], SEG, "PotSoil", cap_bottom=False, cap_top=False)
    b.face([(0.0, 0.0, 0.27)] and [(0.13 * math.cos(2 * math.pi * k / SEG), 0.13 * math.sin(2 * math.pi * k / SEG), 0.27) for k in range(SEG)], "PotSoil")
    # foliage: stems fanning out of the soil, a leaf blob at the end of each
    rnd = random.Random(21)
    for i in range(LEAVES):
        a = 2 * math.pi * i / LEAVES + rnd.uniform(-0.2, 0.2)
        tilt = rnd.uniform(0.35, 0.95)                      # 0 = vertical
        ln = rnd.uniform(0.22, 0.38)
        d = Vector((math.cos(a) * math.sin(tilt), math.sin(a) * math.sin(tilt), math.cos(tilt)))
        root = Vector((rnd.uniform(-0.04, 0.04), rnd.uniform(-0.04, 0.04), 0.26))
        end = root + d * ln
        b.bar(root, end, 0.012, "PlantStem")
        leaf(b, end + d * 0.05, d + Vector((0, 0, -0.25)), rnd.uniform(0.16, 0.24), rnd.uniform(0.09, 0.13), "PlantLeaf")
    return b.finish("PottedPlant")


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


def export():
    fresh_scene(); ob = build(); bpy.context.view_layer.update()
    print(f"{NAME}: {evaluated_tris(ob)}/{TRI_BUDGET} tris, dims {tuple(round(v, 2) for v in ob.dimensions)}")
    with bpy.context.temp_override(**_ui_override()):
        bpy.ops.export_scene.gltf(
            filepath=f"{OUT_DIR}/{NAME}.glb", export_format="GLB",
            export_draco_mesh_compression_enable=False, export_yup=True, export_apply=True,
            export_materials="EXPORT", export_texcoords=False, export_normals=True,
            export_cameras=False, export_lights=False, use_selection=False)
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)


if __name__ == "__main__":
    export()
