"""
Palletised singles — the freight list's drum, barrel and crates as ONE item on a pallet under two
straps to the bed tie-downs, so each is a real bed load (owner 2026-10-10). The bare drum, barrel
and crate models stay as they are for mixes and yard dressing; these composites are what the
freight missions put in the bed. One generator, one .glb per variant, nothing remodelled: the
pallet is pallet.py's, the loads are steel-drum.py / barrel-plastic.py / crate.py's own parts.

Built for: Blender 5.2  |  Targets: assets/models/<name>.glb  ·  source: assets/models/src/freight-pallet.blend

    drum-pallet          closed 55-gal steel drum, small 0.80 pallet
    barrel-pallet        55-gal HDPE barrel, small pallet
    small-crate-pallet   one small crate, small pallet
    large-crate-pallet   the 0.81 m crate, full 1.0 x 1.2 pallet

Base-seated, centred on the pallet, pallet stringers along Blender +Y (= glTF -Z). Each .glb is an
empty root with three mesh children — pallet, load, straps — so the pallet keeps its COLOR_0 tints
(Blender 5.2 writes COLOR_0 for a mesh's first material only) and the load keeps its recolour hook.
The strap section is the LOAD MESH'S OWN cut at the strap plane (every edge crossing it), 4 mm proud,
so it hugs a faceted drum as closely as a boxed crate.
"""
import bpy, importlib.util, math, random
from mathutils import Vector

SRC = "/Users/ledogen/CodeShit/CarGame/assets/models/src"
OUT_DIR = "/Users/ledogen/CodeShit/CarGame/assets/models"
OUT_BLEND = f"{SRC}/freight-pallet.blend"
BUDGETS = {"drum-pallet": 900, "barrel-pallet": 900, "small-crate-pallet": 800, "large-crate-pallet": 800}


def _load(name, file):
    spec = importlib.util.spec_from_file_location(name, f"{SRC}/{file}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


fr = _load("freight", "freight.py")           # Builder, hull_strap, BED_ANCHORS, normals check, scene helpers
pl = _load("pallet", "pallet.py")
sd = _load("steel_drum", "steel-drum.py")
bp = _load("barrel_plastic", "barrel-plastic.py")
cr = _load("crate", "crate.py")


def section(ob, ys, proud=0.004):
    """(x, z) points of the mesh's cut at the plane y = ys (world), pushed `proud` outward."""
    M = ob.matrix_world
    pts = []
    me = ob.data
    for e in me.edges:
        a, b = M @ me.vertices[e.vertices[0]].co, M @ me.vertices[e.vertices[1]].co
        if (a.y - ys) * (b.y - ys) <= 0 and a.y != b.y:
            t = (ys - a.y) / (b.y - a.y)
            p = a.lerp(b, t)
            pts.append((p.x + math.copysign(proud, p.x), p.z + proud))
    return pts


def compose(name, pallet_variant, load_fn, strap_ys):
    pl.use(pallet_variant)
    pallet = pl.bake(pl.build_pallet())                     # base-seated, 0.145 tall
    load = load_fn()                                        # base-seated, centred
    load.location.z = pl.H
    bpy.context.view_layer.update()
    b = fr.Builder()
    W = pl.W
    for ys in strap_ys:
        pts = section(load, ys) + [(-W / 2 - 0.004, pl.H + 0.004), (W / 2 + 0.004, pl.H + 0.004)]   # over the pallet's edge
        fr.hull_strap(b, pts, ys, fr.BED_ANCHORS)
    root = b.finish(name)                                   # an empty named `name` with a Strap child
    pallet.parent = root; load.parent = root
    return root


def drum():
    return sd.bake(sd.build_closed())


def barrel():
    p = bp.Part("BarrelPlastic"); bp.build_drum(p)
    return bp.bake(p)


def crate(size):
    def fn():
        return cr.bake(cr.build_crate("Crate", size, False), None)
    return fn


VARIANTS = [("drum-pallet", lambda: compose("DrumPallet", "pallet-small", drum, (-0.15, 0.15))),
            ("barrel-pallet", lambda: compose("BarrelPallet", "pallet-small", barrel, (-0.15, 0.15))),
            ("small-crate-pallet", lambda: compose("SmallCratePallet", "pallet-small", crate(cr.SMALL), (-0.17, 0.17))),
            ("large-crate-pallet", lambda: compose("LargeCratePallet", "pallet", crate(cr.LARGE), (-0.25, 0.25)))]


def export(only=None):
    for name, fn in VARIANTS:
        if only and name not in only:
            continue
        fr.fresh_scene(); ob = fn()
        bpy.context.view_layer.update(); tris = fr.evaluated_tris(ob); hit, bad = fr.check_normals(ob)
        print(f"{name}: {tris}/{BUDGETS[name]} tris, {bad} inverted of {hit}, dims {fr.bounds(ob)}")
        with bpy.context.temp_override(**fr._ui_override()):
            bpy.ops.export_scene.gltf(
                filepath=f"{OUT_DIR}/{name}.glb", export_format="GLB",
                export_draco_mesh_compression_enable=False, export_yup=True, export_apply=True,
                export_materials="EXPORT", export_vertex_color="ACTIVE", export_texcoords=False,
                export_normals=True, export_cameras=False, export_lights=False, use_selection=False)
    fr.fresh_scene(); x = 0.0
    for name, fn in VARIANTS:
        ob = fn(); ob.location.x = x; x += fr.bounds(ob)[0] + 1.0
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)


if __name__ == "__main__":
    export()
