"""overlay.py — render the generator's van through every solved board camera onto its photo.

  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python uncle-van-ref/overlay.py -- <tag> [photo ...]

Writes wip/uncle-van/out/<tag>/<photo>.png (photo + model fill + model edges in yellow) and two 2x2 sheets,
ortho.png and diag.png.  Cameras come from solve.json (ba.py)."""
import importlib.util
import json
import os
import subprocess
import sys
import numpy as np
import bpy
from mathutils import Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import img  # noqa: E402

SCALE = 0.5
ORTHO = ["side-L-003", "side-R-009", "front-018", "rear-045"]
DIAG = ["fq-L-001", "fq-R-015", "rq-L-007", "rq-R-008"]


def load_generator():
    spec = importlib.util.spec_from_file_location("uncle_van", os.path.join(ROOT, "uncle-van.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def setup_render(sc):
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "MATERIAL"
    sc.display.render_aa = "OFF"
    sc.render.film_transparent = True
    sc.view_settings.view_transform = "Standard"
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.resolution_percentage = 100


def place_camera(sc, cam):
    if "BoardCam" not in bpy.data.objects:
        cd = bpy.data.cameras.new("BoardCam")
        ob = bpy.data.objects.new("BoardCam", cd)
        sc.collection.objects.link(ob)
    ob = bpy.data.objects["BoardCam"]
    R = Matrix(cam["R"])
    M = R.to_4x4()
    M.translation = cam["C"]
    ob.matrix_world = M
    cd = ob.data
    cd.sensor_fit = "HORIZONTAL"
    cd.sensor_width = 36.0
    cd.lens = cam["f"] * 36.0 / cam["W"]
    cd.clip_start, cd.clip_end = 0.1, 500.0
    sc.camera = ob
    sc.render.resolution_x = int(cam["W"] * SCALE)
    sc.render.resolution_y = int(cam["H"] * SCALE)


def edges(rgba):
    a = rgba[..., 3] > 0
    c = rgba[..., :3].astype(int)
    e = np.zeros(a.shape, bool)
    for dy, dx in ((0, 1), (1, 0)):
        s0 = (slice(0, a.shape[0] - dy), slice(0, a.shape[1] - dx))
        s1 = (slice(dy, None), slice(dx, None))
        diff = (a[s0] != a[s1]) | (np.abs(c[s0] - c[s1]).sum(-1) > 18) & a[s0] & a[s1]
        e[s0] |= diff
        e[s1] |= diff
    return e


def composite(photo, render_png, out_png):
    W, H = img.size(render_png)
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", photo, "-vf", f"scale={W}:{H}", "-f", "rawvideo",
                          "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    ph = np.frombuffer(raw, np.uint8).reshape(H, W, 3).astype(float)
    r = img.load_rgba(render_png)
    a = (r[..., 3:4] > 0) * 0.30
    out = ph * (1 - a) + r[..., :3] * a
    out[edges(r)] = (255, 232, 0)
    img.save(out, out_png)


def sheet(pngs, out_png):
    tiles = [img.load(p) for p in pngs]
    h, w = tiles[0].shape[:2]
    S = np.zeros((2 * h + 6, 2 * w + 6, 3), np.uint8)
    for i, t in enumerate(tiles):
        r, c = divmod(i, 2)
        S[r * (h + 6):r * (h + 6) + h, c * (w + 6):c * (w + 6) + w] = t
    img.save(S, out_png)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    tag = argv[0] if argv else "latest"
    photos = argv[1:] or ORTHO + DIAG
    gen = load_generator()
    for ob in gen.build():                       # back to the measurement frame (y 0 = mid-wheelbase)
        ob.location.y += gen.y_centre()
    sc = bpy.context.scene
    setup_render(sc)
    solve = json.load(open(os.path.join(HERE, "solve.json")))
    out_dir = os.path.join(img.WIP, "out", tag)
    os.makedirs(out_dir, exist_ok=True)
    tmp = os.path.join(out_dir, "_render.png")
    for p in photos:
        place_camera(sc, solve["cameras"][p])
        sc.render.filepath = tmp
        bpy.ops.render.render(write_still=True)
        composite(os.path.join(img.WIP, "ref", "board", p + ".jpg"), tmp, os.path.join(out_dir, p + ".png"))
        print("wrote", p)
    os.remove(tmp)
    for name, group in (("ortho", ORTHO), ("diag", DIAG)):
        if all(g in photos for g in group):
            sheet([os.path.join(out_dir, g + ".png") for g in group], os.path.join(out_dir, name + ".png"))
            print("wrote", name)


main()
