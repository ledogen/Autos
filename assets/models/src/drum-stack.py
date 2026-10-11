"""
ASSET-48 — four closed 55-gallon drums ZIGZAGGED down the bed, no pallet, one strap each.  Generator.

Built for: Blender 5.2  |  Targets: assets/models/<name>.glb  ·  source: assets/models/src/drum-stack.blend
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

Two drums side by side are 1.16 m and the Ranger's wheelhouses leave 1.09 m, so the old 2 x 2 block on a
1.2 m pallet rode on the arch tops.  Owner 2026-10-11: no pallet, stagger them.  Centres alternate
x = ±PITCH_X and step PITCH_Y down the bed: the diagonal between neighbours is 0.60 m (2 cm of air
round 0.58 m drums), the outer edge sits 1.5 cm inside the arch wall, and four drums run 1.66 m —
inside the 1.835 m bed with the tailgate shut.  Each drum gets one hull strap across the bed at its
own centre (neighbours are 0.36 m away, past their 0.29 m radius, so no strap cuts another drum).

The drum is NOT remodelled: `steel-drum.py` builds its `build_closed()` part four times (bungs turned
37° per drum), so `DrumPaint` / `DrumSteel` are the shipped drum's materials, recolour hook included.
"""
import bpy, importlib.util, math

SRC = "/Users/ledogen/CodeShit/CarGame/assets/models/src"
NAME = "drum-stack"
OUT_DIR = "/Users/ledogen/CodeShit/CarGame/assets/models"
OUT_BLEND = f"{SRC}/drum-stack.blend"
TRI_BUDGET = 1500
PITCH_X, PITCH_Y = 0.24, 0.36      # 0.58 m drums: hypot(0.48, 0.36) = 0.60 between neighbours; 0.53 m to the arch at 0.545


def _load(name, file):
    spec = importlib.util.spec_from_file_location(name, f"{SRC}/{file}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


fr = _load("freight", "freight.py")           # Builder, hull_strap, BED_ANCHORS, normals check, scene helpers
fp = _load("freight_pallet", "freight-pallet.py")   # section(): a mesh's own cut at the strap plane
sd = fp.sd


def build():
    b = fr.Builder()
    drums = []
    for i in range(4):
        ob = sd.bake(sd.build_closed())
        ob.name = f"Drum{i}"
        ob.location = (PITCH_X * (1 if i % 2 else -1), 1.5 * PITCH_Y - i * PITCH_Y, 0)   # first drum forward (+Y)
        ob.rotation_euler = (0, 0, math.radians(37 * i))   # bungs not all facing the same way
        drums.append(ob)
    bpy.context.view_layer.update()
    for ob in drums:
        fr.hull_strap(b, fp.section(ob, ob.location.y), ob.location.y, fr.BED_ANCHORS)
    root = b.finish("DrumStack")                 # an empty with a Strap child
    for ob in drums:
        ob.parent = root
    return root


def export():
    fr.fresh_scene(); ob = build(); bpy.context.view_layer.update()
    tris = fr.evaluated_tris(ob); hit, bad = fr.check_normals(ob)
    print(f"{NAME}: {tris}/{TRI_BUDGET} tris, {bad} inverted of {hit}, dims {fr.bounds(ob)}")
    with bpy.context.temp_override(**fr._ui_override()):
        bpy.ops.export_scene.gltf(
            filepath=f"{OUT_DIR}/{NAME}.glb", export_format="GLB",
            export_draco_mesh_compression_enable=False, export_yup=True, export_apply=True,
            export_materials="EXPORT", export_vertex_color="ACTIVE", export_texcoords=False,
            export_normals=True, export_cameras=False, export_lights=False, use_selection=False)
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)


if __name__ == "__main__":
    export()
