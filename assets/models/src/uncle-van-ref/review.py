"""review.py — in the GUI Blender: add the 8 solved board cameras, each with its reference photo as
a camera background drawn IN FRONT at half opacity.  Select a camera, Numpad 0: the model sits under
its photo exactly as in uncle-van-ref/overlay.py.  Run AFTER the generator's build()/export() (shipped frame).

    import runpy; runpy.run_path('<checkout>/assets/models/src/uncle-van-ref/review.py')

The photos are third-party reference: loaded by path, never packed, never saved into the shipped
.blend (export() saves first; this only dresses the live session)."""
import json
import os
import sys
import importlib.util
import bpy
from mathutils import Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import img  # noqa: E402
spec = importlib.util.spec_from_file_location("uncle_van", os.path.join(os.path.dirname(HERE), "uncle-van.py"))
gen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen)

solve = json.load(open(os.path.join(HERE, "solve.json")))
sc = bpy.context.scene
coll = bpy.data.collections.get("Board") or bpy.data.collections.new("Board")
if coll.name not in sc.collection.children:
    sc.collection.children.link(coll)
for ob in list(coll.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
shift = Matrix.Translation((0.0, -gen.y_centre(), 0.0))        # measurement frame -> shipped frame
for name, cam in solve["cameras"].items():
    cd = bpy.data.cameras.new("Board " + name)
    ob = bpy.data.objects.new("Board " + name, cd)
    coll.objects.link(ob)
    M = Matrix(cam["R"]).to_4x4()
    M.translation = cam["C"]
    ob.matrix_world = shift @ M
    cd.sensor_fit, cd.sensor_width = "HORIZONTAL", 36.0
    cd.lens = cam["f"] * 36.0 / cam["W"]
    cd.clip_start, cd.clip_end = 0.1, 500.0
    cd.display_size = 0.4
    cd.show_background_images = True
    bg = cd.background_images.new()
    bg.image = bpy.data.images.load(os.path.join(img.WIP, "ref", "board", name + ".jpg"), check_existing=True)
    bg.display_depth = "FRONT"
    bg.alpha = 0.5
    bg.frame_method = "FIT"
sc.render.resolution_x, sc.render.resolution_y = 2048, 1366      # every board photo is 2048 x 1366
sc.camera = bpy.data.objects["Board side-L-003"]
print("board cameras:", sorted(o.name for o in coll.objects))
