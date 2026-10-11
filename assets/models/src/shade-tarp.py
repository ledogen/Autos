"""
ASSET-26 — shade tarp, the player's scrappy lean-to.  Parametric generator.

Built for: Blender 5.2  |  Targets: assets/models/<name>.glb  ·  source: assets/models/src/shade-tarp.blend
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

The ticket's 512 albedo (weave, grommets, fade, tape) predates ART-STYLE: flat colours win.
Weave and fade are wear — dropped.  The tape patch is geometry (a raised rectangle in a second
material).  Grommets are too small to read at 20 m — dropped.  Sag is in the mesh.

Layout (Blender axes; +Y = glTF -Z = project forward):
    high edge at y=-1.2 on two 2.0 m poles, low edge at y=+1.2 on two 1.3 m poles — the open low
    edge faces forward.  Guy lines from the high pole tops back to stakes at y=-2.1.
    One low corner (+X) droops: its pole leans out and is shorter.
Materials: TarpPoly (double-sided — looked at from underneath), TarpTape, TarpPole, TarpLine.
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix

NAME = "shade-tarp"
OUT_DIR = "/Users/ledogen/CodeShit/CarGame/assets/models"
OUT_BLEND = "/Users/ledogen/CodeShit/CarGame/assets/models/src/shade-tarp.blend"
TRI_BUDGET = 400

SPAN_X, SPAN_Y = 3.0, 2.4
Z_HIGH, Z_LOW = 2.0, 1.3
NX, NY = 8, 6              # fabric grid
SAG = 0.16                 # mid-panel sag
DROOP = 0.28               # the bad corner
POLE_R = 0.022
STAKE_Y = -2.1

MATS = {
    "TarpPoly": ((0.05, 0.16, 0.52, 1), 0.85),
    "TarpTape": ((0.55, 0.55, 0.52, 1), 0.6),
    "TarpPole": ((0.14, 0.15, 0.16, 1), 0.5),
    "TarpLine": ((0.72, 0.68, 0.55, 1), 0.9),
}


def get_material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    col, rough = MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = col; b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = 0.0
    m.diffuse_color = col; m.roughness = rough
    m.use_backface_culling = name != "TarpPoly"     # the fabric exports doubleSided
    return m


class Builder:
    def __init__(self):
        self.bm = bmesh.new(); self.slots = list(MATS)

    def face(self, pts, mat):
        f = self.bm.faces.new([self.bm.verts.new(Vector(p)) for p in pts])
        f.material_index = self.slots.index(mat); f.smooth = False
        return f

    def box(self, lo, hi, mat, xform=Matrix.Identity(4), skip=()):
        x0, y0, z0 = lo; x1, y1, z1 = hi
        c = [xform @ Vector(p) for p in [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                                         (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]]
        q = {"-z": (0, 3, 2, 1), "+z": (4, 5, 6, 7), "-y": (0, 1, 5, 4), "+x": (1, 2, 6, 5), "+y": (2, 3, 7, 6), "-x": (3, 0, 4, 7)}
        for k, a in q.items():
            if k not in skip:
                self.face([c[i] for i in a], mat)

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
    """Orient every face toward open air (see freight.py).  Thin sheets stay as built."""
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


def pole(b, foot, top, r=POLE_R):
    """Square-section pole from foot to top (both Vectors), 4 side quads + a top cap."""
    foot, top = Vector(foot), Vector(top)
    ax = (top - foot).normalized()
    u = ax.cross(Vector((0, 1, 0))).normalized() if abs(ax.y) < 0.9 else Vector((1, 0, 0))
    v = ax.cross(u).normalized()
    ring = lambda c: [c + u * r + v * r, c - u * r + v * r, c - u * r - v * r, c + u * r - v * r]
    a, t = ring(foot), ring(top)
    for k in range(4):
        j = (k + 1) % 4
        b.face([a[k], a[j], t[j], t[k]], "TarpPole")
    b.face(t, "TarpPole")


def line(b, p0, p1, w=0.012):
    """A guy line as a thin ribbon (two-sided by the fixer leaving sheets alone)."""
    p0, p1 = Vector(p0), Vector(p1)
    d = (p1 - p0).normalized(); s = d.cross(Vector((0, 0, 1))).normalized() * (w / 2)
    b.face([p0 + s, p1 + s, p1 - s, p0 - s], "TarpLine")


def corner_z(ix, iy):
    """Fabric corner heights: iy=0 high edge, iy=1 low edge; (+X, low) is the droop corner."""
    z = Z_HIGH if iy == 0 else Z_LOW
    if iy == 1 and ix == 1:
        z -= DROOP
    return z


def build():
    b = Builder()
    corners = {}
    for ix, x in enumerate((-SPAN_X / 2, SPAN_X / 2)):
        for iy, y in enumerate((-SPAN_Y / 2, SPAN_Y / 2)):
            z = corner_z(ix, iy)
            lean = Vector((0.18, 0.10, 0)) if (ix, iy) == (1, 1) else Vector((0, 0, 0))
            foot = Vector((x, y, 0)) + lean
            top = Vector((x, y, z))
            pole(b, foot, top)
            corners[(ix, iy)] = top
    # fabric: bilinear sheet through the four pole tops, sagging in the middle, and a loose
    # skirt past the poles that droops and ripples (owner 2026-10-09: lose the tape, loosen the edge)
    rnd = random.Random(4)
    OVER = 0.22            # metres of fabric outside the pole rectangle
    def P(u, v):
        x = -SPAN_X / 2 + u * SPAN_X; y = -SPAN_Y / 2 + v * SPAN_Y
        uc, vc = min(max(u, 0.0), 1.0), min(max(v, 0.0), 1.0)
        z = ((1 - uc) * (1 - vc) * corners[(0, 0)].z + uc * (1 - vc) * corners[(1, 0)].z +
             (1 - uc) * vc * corners[(0, 1)].z + uc * vc * corners[(1, 1)].z)
        z -= SAG * math.sin(math.pi * uc) * math.sin(math.pi * vc)
        z -= 0.05 * math.sin(math.pi * uc) * (1 - vc)
        dx = max(0.0, -u, u - 1) * SPAN_X; dy = max(0.0, -v, v - 1) * SPAN_Y
        d = math.hypot(dx, dy)
        if d > 0:
            z -= 1.6 * d + 0.05 * math.sin(14 * u + 3) * math.sin(11 * v + 1) * (d / OVER)
        return (x, y, z)
    eu, ev = OVER / SPAN_X, OVER / SPAN_Y
    us = [-eu] + [i / NX for i in range(NX + 1)] + [1 + eu]
    vs = [-ev] + [j / NY for j in range(NY + 1)] + [1 + ev]
    for i in range(len(us) - 1):
        for j in range(len(vs) - 1):
            b.face([P(us[i], vs[j]), P(us[i + 1], vs[j]), P(us[i + 1], vs[j + 1]), P(us[i], vs[j + 1])], "TarpPoly")
    # guy lines from the two high pole tops back to stakes, and the stakes
    for ix in (0, 1):
        top = corners[(ix, 0)]
        stake = Vector((top.x + (0.35 if ix else -0.35), STAKE_Y, 0))
        line(b, top, stake + Vector((0, 0, 0.12)))
        b.box((stake.x - 0.015, stake.y - 0.015, 0), (stake.x + 0.015, stake.y + 0.015, 0.18), "TarpPole",
              Matrix.Translation(stake) @ Matrix.Rotation(math.radians(-20), 4, 'X') @ Matrix.Translation(-stake), skip=("-z",))
    return b.finish("ShadeTarp")


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
