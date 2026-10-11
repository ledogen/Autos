"""
ASSET-48 — four closed 55-gallon drums 2 x 2 on a pallet, banded as a block.  Generator.

Built for: Blender 5.2  |  Targets: assets/models/<name>.glb  ·  source: assets/models/src/drum-stack.blend
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

The drum is NOT remodelled (ticket): this script runs `assets/models/src/steel-drum.py` as a
module, bakes its `build_closed()` part four times, and adds a plain 1.2 x 1.2 pallet and one
band strap around the block.  So `DrumPaint` / `DrumSteel` are the shipped drum's materials,
recolour hook included; the drum geometry is byte-for-byte ASSET-30's.
"""
import bpy, bmesh, runpy, math
from mathutils import Vector, Matrix

NAME = "drum-stack"
OUT_DIR = "/Users/ledogen/CodeShit/CarGame/assets/models"
OUT_BLEND = "/Users/ledogen/CodeShit/CarGame/assets/models/src/drum-stack.blend"
DRUM_PY = "/Users/ledogen/CodeShit/CarGame/assets/models/src/steel-drum.py"
TRI_BUDGET = 1500
PW, PH = 1.2, 0.14
PITCH = 0.30            # drum centres at ±PITCH (0.58 m drums leave a 2 cm gap)
STRAP_Z = 0.55

MATS = {
    "PalletWood": ((0.52, 0.42, 0.28, 1), 0.95),
    "Strap":      ((0.09, 0.10, 0.11, 1), 0.45),
}


def get_material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    col, rough = MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = col; b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = 0.0
    m.diffuse_color = col; m.roughness = rough; m.use_backface_culling = name != "Strap"
    return m


def box(bm, lo, hi, mat_index, skip=()):
    x0, y0, z0 = lo; x1, y1, z1 = hi
    c = [bm.verts.new(Vector(p)) for p in [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                                            (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]]
    q = {"-z": (0, 3, 2, 1), "+z": (4, 5, 6, 7), "-y": (0, 1, 5, 4), "+x": (1, 2, 6, 5), "+y": (2, 3, 7, 6), "-x": (3, 0, 4, 7)}
    for k, a in q.items():
        if k not in skip:
            f = bm.faces.new([c[i] for i in a]); f.material_index = mat_index; f.smooth = False


def fresh_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.meshes):
        if m.users == 0:
            bpy.data.meshes.remove(m)
    for m in list(bpy.data.materials):          # else a re-run keeps stale colours / culling flags
        if m.users == 0:
            bpy.data.materials.remove(m)


def build():
    g = runpy.run_path(DRUM_PY)                       # defines, does not build
    drums = []
    for i, (x, y) in enumerate([(-PITCH, -PITCH), (PITCH, -PITCH), (-PITCH, PITCH), (PITCH, PITCH)]):
        ob = g["bake"](g["build_closed"]())
        ob.name = f"Drum{i}"
        ob.location = (x, y, PH)
        ob.rotation_euler = (0, 0, math.radians(37 * i))   # bungs not all facing the same way
        drums.append(ob)
    # pallet + strap in one mesh
    bm = bmesh.new()
    me = bpy.data.meshes.new("DrumStackBase")
    me.materials.append(get_material("PalletWood")); me.materials.append(get_material("Strap"))
    for x in (-0.55, 0, 0.55):
        box(bm, (x - 0.045, -PW / 2, 0.02), (x + 0.045, PW / 2, PH - 0.02), 0)
    box(bm, (-PW / 2, -PW / 2, PH - 0.02), (PW / 2, PW / 2, PH), 0)
    box(bm, (-PW / 2, -PW / 2, 0), (PW / 2, PW / 2, 0.02), 0)
    # band: convex hull of the four drum circles in plan, as a vertical ribbon (double-sided)
    P = sorted(set((round(x + 0.294 * math.cos(2 * math.pi * k / 32), 5), round(y + 0.294 * math.sin(2 * math.pi * k / 32), 5))
                   for x in (-PITCH, PITCH) for y in (-PITCH, PITCH) for k in range(32)))
    def cross(o, a, c): return (a[0] - o[0]) * (c[1] - o[1]) - (a[1] - o[1]) * (c[0] - o[0])
    lo, up = [], []
    for q in P:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], q) <= 0: lo.pop()
        lo.append(q)
    for q in reversed(P):
        while len(up) >= 2 and cross(up[-2], up[-1], q) <= 0: up.pop()
        up.append(q)
    ring = lo[:-1] + up[:-1]
    z0, z1 = PH + STRAP_Z, PH + STRAP_Z + 0.03
    for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
        f = bm.faces.new([bm.verts.new(Vector(q)) for q in [(x0, y0, z0), (x1, y1, z0), (x1, y1, z1), (x0, y0, z1)]])
        f.material_index = 1; f.smooth = False
    bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = False
    base = bpy.data.objects.new("DrumStackBase", me)
    bpy.context.collection.objects.link(base)
    # join into one object so the glb is one node
    for o in bpy.data.objects:
        o.select_set(False)
    for o in drums + [base]:
        o.select_set(True)
    bpy.context.view_layer.objects.active = base
    with bpy.context.temp_override(**_ui_override(), selected_editable_objects=drums + [base], active_object=base):
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        bpy.ops.object.join()
    base.name = "DrumStack"
    return base


def evaluated_tris(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = ob.evaluated_get(dg).to_mesh()
    return sum(len(p.vertices) - 2 for p in me.polygons)


def _ui_override():
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            return dict(window=bpy.context.window, area=area, region=next(r for r in area.regions if r.type == 'WINDOW'))
    return {}


def export():
    fresh_scene(); ob = build(); bpy.context.view_layer.update()
    print(f"{NAME}: {evaluated_tris(ob)}/{TRI_BUDGET} tris, dims {tuple(round(v, 2) for v in ob.dimensions)}, mats {[m.name for m in ob.data.materials]}")
    with bpy.context.temp_override(**_ui_override()):
        bpy.ops.export_scene.gltf(
            filepath=f"{OUT_DIR}/{NAME}.glb", export_format="GLB",
            export_draco_mesh_compression_enable=False, export_yup=True, export_apply=True,
            export_materials="EXPORT", export_texcoords=False, export_normals=True,
            export_cameras=False, export_lights=False, use_selection=False)
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)


if __name__ == "__main__":
    export()
