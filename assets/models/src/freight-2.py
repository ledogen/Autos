"""
Freight cargo kit 2 — three more strapped bed loads, one generator, one .glb each.

Built for: Blender 5.2  |  Targets: assets/models/<name>.glb  ·  source: assets/models/src/freight-2.blend
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

    water-carboys   ASSET-50  ≤300   four 19 L carboys in a crate; CarboyWater is the one clear material
    traffic-cones   ASSET-49  ≤300   18 cones in three nested stacks (7/6/5), strapped; ConeOrange recolours
    job-box         ASSET-57  ≤300   steel jobsite chest on skids, lid shut; JobBoxPaint recolours

Base-seated, centred on the footprint; forward −Z (Blender +Y).
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix

OUT_DIR = "/Users/ledogen/CodeShit/CarGame/assets/models"
OUT_BLEND = "/Users/ledogen/CodeShit/CarGame/assets/models/src/freight-2.blend"
BUDGETS = {"water-carboys": 300, "traffic-cones": 1600, "job-box": 600}

MATS = {   # name: (linear rgba, roughness, alpha)
    "CarboyWater":  ((0.20, 0.45, 0.75, 1), 0.15, 0.55),
    "CarboyCap":    ((0.85, 0.88, 0.92, 1), 0.6, 1),
    "CrateBlue":    ((0.02, 0.06, 0.30, 1), 0.8, 1),
    "ConeOrange":   ((0.90, 0.18, 0.02, 1), 0.7, 1),
    "ConeBand":     ((0.90, 0.90, 0.88, 1), 0.5, 1),
    "ConeBase":     ((0.03, 0.03, 0.03, 1), 0.9, 1),
    "JobBoxPaint":  ((0.03, 0.30, 0.22, 1), 0.55, 1),
    "JobBoxSteel":  ((0.10, 0.10, 0.11, 1), 0.5, 1),
    "JobBoxDark":   ((0.012, 0.13, 0.09, 1), 0.55, 1),
    "Strap":        ((0.09, 0.10, 0.11, 1), 0.45, 1),
    "PalletWood":   ((0.52, 0.42, 0.28, 1), 0.95, 1),
}


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


def strap(b, lo, hi, ys, t=0.025, s=0.004):
    x0, _, z0 = lo; x1, _, z1 = hi
    b.box((x0 - s, ys - t / 2, z0 - s), (x1 + s, ys + t / 2, z1 + s), "Strap", skip=("+y", "-y"))


# ---------------------------------------------------------------- carboys
def build_carboys(b):
    S, H, T = 0.60, 0.30, 0.02
    # crate: four walls + floor slab, open top
    b.box((-S / 2, -S / 2, 0), (S / 2, S / 2, T), "CrateBlue")
    for sx in (-1, 1):
        b.box((sx * S / 2 - (T if sx > 0 else 0), -S / 2, T), (sx * S / 2 + (0 if sx > 0 else T), S / 2, H), "CrateBlue", skip=("-z",))
        b.box((-S / 2 + T, sx * S / 2 - (T if sx > 0 else 0), T), (S / 2 - T, sx * S / 2 + (0 if sx > 0 else T), H), "CrateBlue", skip=("-z",))
    prof = [(0.12, T), (0.135, 0.33), (0.07, 0.43), (0.03, 0.47)]
    for cx in (-0.145, 0.145):
        for cy in (-0.145, 0.145):
            b.lathe(prof, 6, "CarboyWater", cx, cy, cap_bottom=False, cap_top=False, phase=0.2)
            b.bar((cx, cy, 0.47), (cx, cy, 0.52), 0.06, "CarboyCap")


# ---------------------------------------------------------------- cones
def _upper_hull(P):
    P = sorted(set((round(a, 5), round(c, 5)) for a, c in P))
    def cross(o, a, b_): return (a[0] - o[0]) * (b_[1] - o[1]) - (a[1] - o[1]) * (b_[0] - o[0])
    hull = []
    for p in reversed(P):
        while len(hull) >= 2 and cross(hull[-2], hull[-1], p) <= 0:
            hull.pop()
        hull.append(p)
    return hull[::-1]


def hull_strap(b, pts, y, anchors, w=0.03, axis="y"):
    path = _upper_hull(list(pts) + list(anchors))
    for (a0, c0), (a1, c1) in zip(path, path[1:]):
        if axis == "y":
            b.face([(a0, y - w / 2, c0), (a1, y - w / 2, c1), (a1, y + w / 2, c1), (a0, y + w / 2, c0)], "Strap")
        else:
            b.face([(y - w / 2, a0, c0), (y - w / 2, a1, c1), (y + w / 2, a1, c1), (y + w / 2, a0, c0)], "Strap")


def cone_stack(b, n, xform, pts, cx, cy):
    """n full cones nested: every cone is a square base plus an 8-facet body with the white band,
    4.5 cm higher than the one below, so the body shows in the gap between bases."""
    base, bh, step = 0.36, 0.03, 0.045
    for i in range(n):
        z = i * step
        b.box((-base / 2, -base / 2, z), (base / 2, base / 2, z + bh), "ConeBase", xform, skip=("-z",) if i == 0 else ())
        z0 = z + bh
        prof = [(0.135, z0), (0.11, z0 + 0.12), (0.095, z0 + 0.20), (0.075, z0 + 0.32), (0.06, z0 + 0.42), (0.035, z0 + 0.64), (0.0, z0 + 0.67)]
        b.lathe(prof, 8, ["ConeOrange", "ConeOrange", "ConeBand", "ConeOrange", "ConeOrange", "ConeOrange"],
                cap_bottom=False, cap_top=False, xform=xform, phase=math.pi / 8)
    top = (n - 1) * step + bh + 0.67
    for ang in range(0, 360, 30):                          # the top cone's outline for the straps
        a = math.radians(ang)
        pts.append((cx + 0.14 * math.cos(a), cy + 0.14 * math.sin(a), (n - 1) * step + bh))
        pts.append((cx + 0.04 * math.cos(a), cy + 0.04 * math.sin(a), top - 0.03))
        pts.append((cx + 0.19 * math.cos(a), cy + 0.19 * math.sin(a), (n - 1) * step + bh + 0.001))
    return top


def build_cones(b):
    PW, PL, PH = 1.0, 1.2, 0.14
    for x in (-0.46, 0, 0.46):
        b.box((x - 0.04, -PL / 2, 0.02), (x + 0.04, PL / 2, PH - 0.02), "PalletWood")
    b.box((-PW / 2, -PL / 2, PH - 0.02), (PW / 2, PL / 2, PH), "PalletWood")
    b.box((-PW / 2, -PL / 2, 0), (PW / 2, PL / 2, 0.02), "PalletWood")
    pts = []
    spots = [(7, -0.25, -0.33, 0.1), (6, 0.25, -0.30, -0.2), (5, 0.0, 0.33, 0.35)]
    for n, cx, cy, yaw in spots:
        cone_stack(b, n, Matrix.Translation((cx, cy, PH)) @ Matrix.Rotation(yaw, 4, 'Z'), pts, cx, cy)
    pts = [(x, y, z + PH) for x, y, z in pts]
    for ys in (-0.3, 0.3):      # straps over the cone tips, down to the pallet deck
        sec = [(x, z) for x, y, z in pts if abs(y - ys) < 0.25]
        hull_strap(b, sec, ys, [(-PW / 2 - 0.004, PH - 0.02), (PW / 2 + 0.004, PH - 0.02)])
    sec = [(y, z) for x, y, z in pts if abs(x) < 0.3]
    hull_strap(b, sec, 0.0, [(-PL / 2 - 0.004, PH - 0.02), (PL / 2 + 0.004, PH - 0.02)], axis="x")


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


VARIANTS = [("water-carboys", build_carboys), ("traffic-cones", build_cones), ("job-box", build_jobbox)]


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
