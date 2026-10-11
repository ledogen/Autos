"""
ASSET-25 — cooking kit: iron A-frame over the campfire, Dutch oven on an S-hook.  Generator.

Built for: Blender 5.2  |  Targets: assets/models/<name>.glb  ·  source: assets/models/src/cooking-kit.blend
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

The ticket's 512 albedo (soot, heat scale, pitting) predates ART-STYLE: all of it is wear, all of
it is dropped.  Soot-black is the material.  Two draw calls: KitIron (frame, pot) and KitChain
(chain, hook, bail — a shade lighter so the hang reads against the pot).

Layout: two A's at x=±0.5 (legs spread ±0.4 in Y), crossbar along X at z=1.0, pot hanging under
the middle with its base at 0.42 m — clear of ASSET-24's campfire (0.71 m ring, ~0.25 m tall)
when both sit on the same origin.  Base-seated and centred.  Forward −Z: the A's face ±X, so the
frame reads open from +Y (Blender) = −Z (glTF).  No collision.
"""
import bpy, bmesh, math
from mathutils import Vector, Matrix

NAME = "cooking-kit"
OUT_DIR = "/Users/ledogen/CodeShit/CarGame/assets/models"
OUT_BLEND = "/Users/ledogen/CodeShit/CarGame/assets/models/src/cooking-kit.blend"
TRI_BUDGET = 400

BAR = 0.022            # square iron bar half-width... full width
LEG_X, LEG_Y, TOP_Z = 0.5, 0.4, 1.0
POT_Z0, POT_SEG = 0.42, 8
LINKS = 3
LINK_L, LINK_W = 0.08, 0.03

MATS = {
    "KitIron":  ((0.028, 0.027, 0.026, 1), 0.9),
    "KitChain": ((0.11, 0.11, 0.115, 1), 0.5),
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

    def bar(self, p0, p1, w, mat, caps=True):
        """Square-section bar between two points."""
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

    def lathe(self, profile, seg, mat, cx=0, cy=0, cap_bottom=True, cap_top=True):
        """profile: list of (radius, z) bottom->top; faceted ring of `seg` sides."""
        ang = [2 * math.pi * k / seg for k in range(seg)]
        pt = lambda r, z, k: (cx + r * math.cos(ang[k]), cy + r * math.sin(ang[k]), z)
        for (ra, za), (rb, zb) in zip(profile, profile[1:]):
            for k in range(seg):
                j = (k + 1) % seg
                self.face([pt(ra, za, k), pt(ra, za, j), pt(rb, zb, j), pt(rb, zb, k)], mat)
        if cap_bottom and profile[0][0] > 0:
            self.face([pt(profile[0][0], profile[0][1], k) for k in reversed(range(seg))], mat)
        if cap_top and profile[-1][0] > 0:
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


def build():
    b = Builder()
    # two A's + crossbar; legs cross just above the bar so the bar sits in the V
    for x in (-LEG_X, LEG_X):
        for s in (-1, 1):
            b.bar((x, s * LEG_Y, 0), (x, -s * 0.06, TOP_Z + 0.07), BAR, "KitIron")
    b.bar((-LEG_X - 0.12, 0, TOP_Z), (LEG_X + 0.12, 0, TOP_Z), BAR, "KitIron")
    # chain: links alternate flat/upright, hung from the bar centre
    z = TOP_Z - BAR / 2
    for i in range(LINKS):
        za, zb = z - i * (LINK_L - 0.012), z - i * (LINK_L - 0.012) - LINK_L
        w = LINK_W / 2
        if i % 2 == 0:      # link in the XZ plane: two uprights + two rungs
            b.bar((-w, 0, za), (-w, 0, zb), 0.008, "KitChain", caps=False)
            b.bar((w, 0, za), (w, 0, zb), 0.008, "KitChain", caps=False)
            b.bar((-w, 0, za), (w, 0, za), 0.008, "KitChain", caps=False)
            b.bar((-w, 0, zb), (w, 0, zb), 0.008, "KitChain", caps=False)
        else:               # in the YZ plane
            b.bar((0, -w, za), (0, -w, zb), 0.008, "KitChain", caps=False)
            b.bar((0, w, za), (0, w, zb), 0.008, "KitChain", caps=False)
            b.bar((0, -w, za), (0, w, za), 0.008, "KitChain", caps=False)
            b.bar((0, -w, zb), (0, w, zb), 0.008, "KitChain", caps=False)
    hook_top = z - LINKS * (LINK_L - 0.012) - 0.012
    # S-hook: a Z of three bars
    b.bar((0, 0, hook_top + 0.02), (0.03, 0, hook_top - 0.01), 0.01, "KitChain")
    b.bar((0.03, 0, hook_top - 0.01), (-0.02, 0, hook_top - 0.05), 0.01, "KitChain")
    bail_z = hook_top - 0.05
    # Dutch oven: 8-sided, three stub legs, flanged lid with a knob
    H = 0.17
    pot_top = bail_z - 0.10
    z0 = pot_top - H
    prof = [(0.11, z0), (0.145, z0 + 0.01), (0.155, z0 + H * 0.75), (0.15, pot_top - 0.02),
            (0.165, pot_top - 0.02), (0.165, pot_top), (0.10, pot_top + 0.03), (0.03, pot_top + 0.04)]
    b.lathe(prof, POT_SEG, "KitIron")
    b.bar((0, 0, pot_top + 0.04), (0, 0, pot_top + 0.065), 0.03, "KitIron")           # knob
    for k in range(3):                                                                # legs
        a = 2 * math.pi * k / 3 + 0.3
        b.bar((0.09 * math.cos(a), 0.09 * math.sin(a), z0 + 0.005), (0.09 * math.cos(a), 0.09 * math.sin(a), z0 - 0.035), 0.016, "KitIron")
    # wire bail: two uprights from the rim lugs up to the hook, joined by a top run
    b.bar((-0.165, 0, pot_top - 0.03), (-0.04, 0, bail_z), 0.008, "KitChain")
    b.bar((0.165, 0, pot_top - 0.03), (0.04, 0, bail_z), 0.008, "KitChain")
    b.bar((-0.045, 0, bail_z), (0.045, 0, bail_z), 0.008, "KitChain")
    print("pot base at", round(z0 - 0.035, 3), "m; pot top", round(pot_top, 3))
    return b.finish("CookingKit")


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
    tris = evaluated_tris(ob)
    print(f"{NAME}: {tris}/{TRI_BUDGET} tris, dims {tuple(round(v, 2) for v in ob.dimensions)}, mats {len(ob.data.materials)}")
    with bpy.context.temp_override(**_ui_override()):
        bpy.ops.export_scene.gltf(
            filepath=f"{OUT_DIR}/{NAME}.glb", export_format="GLB",
            export_draco_mesh_compression_enable=False, export_yup=True, export_apply=True,
            export_materials="EXPORT", export_texcoords=False, export_normals=True,
            export_cameras=False, export_lights=False, use_selection=False)
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)


if __name__ == "__main__":
    export()
