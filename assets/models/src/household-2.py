"""
Household freight kit 2 — four more fragile loads, one generator, one .glb each.

Built for: Blender 5.2  |  Targets: assets/models/<name>.glb  ·  source: assets/models/src/household-2.blend
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

    dining-chairs       ASSET-59  ≤400   one chair, placed four times: two up, two inverted seat-to-seat
    ornate-vase         ASSET-41  ≤250   8-sided glazed vase strapped to a small base
    full-length-mirror  ASSET-64  ≤200   mirror on its long edge, blanket-wrapped, glass showing one end
    garden-fountain     ASSET-62  ≤400   cast-stone fountain in its tiers: basin, nested bowl, pedestal, finial

Base-seated, centred; forward −Z (Blender +Y).  Builder and materials are household.py's.
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix

OUT_DIR = "/Users/ledogen/CodeShit/CarGame/assets/models"
OUT_BLEND = "/Users/ledogen/CodeShit/CarGame/assets/models/src/household-2.blend"
BUDGETS = {"dining-chairs": 400, "ornate-vase": 500, "full-length-mirror": 200, "garden-fountain": 900}

MATS = {
    "FurnWood":   ((0.30, 0.14, 0.06, 1), 0.6),
    "FurnDark":   ((0.08, 0.04, 0.02, 1), 0.7),
    "PianoBlack": ((0.015, 0.015, 0.016, 1), 0.3),
    "Brass":      ((0.70, 0.50, 0.15, 1), 0.4),
    "KeysWhite":  ((0.92, 0.90, 0.82, 1), 0.5),
    "CrateWood":  ((0.72, 0.60, 0.40, 1), 0.95),
    "Canvas":     ((0.10, 0.30, 0.55, 1), 0.9),
    "Strap":      ((0.09, 0.10, 0.11, 1), 0.45),
    "VaseGlaze":  ((0.02, 0.12, 0.45, 1), 0.2),
    "VaseGold":   ((0.75, 0.55, 0.15, 1), 0.35),
    "BlanketFelt": ((0.18, 0.20, 0.26, 1), 1.0),
    "MirrorGlass": ((0.60, 0.72, 0.80, 1), 0.05),
    "CastStone":  ((0.50, 0.48, 0.43, 1), 1.0),
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


class Builder:
    def __init__(self):
        self.bm = bmesh.new(); self.slots = list(MATS)

    def face(self, pts, mat):
        f = self.bm.faces.new([self.bm.verts.new(Vector(p)) for p in pts])
        f.material_index = self.slots.index(mat); f.smooth = False
        return f

    def box(self, lo, hi, mat, skip=(), xform=Matrix.Identity(4)):
        x0, y0, z0 = lo; x1, y1, z1 = hi
        c = [xform @ Vector(p) for p in [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                                         (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]]
        q = {"-z": (0, 3, 2, 1), "+z": (4, 5, 6, 7), "-y": (0, 1, 5, 4), "+x": (1, 2, 6, 5), "+y": (2, 3, 7, 6), "-x": (3, 0, 4, 7)}
        for k, a in q.items():
            if k not in skip:
                self.face([c[i] for i in a], mat)

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

    def lathe(self, profile, seg, mat, cx=0, cy=0, cap_bottom=True, cap_top=True):
        ang = [2 * math.pi * k / seg for k in range(seg)]
        pt = lambda r, z, k: (cx + r * math.cos(ang[k]), cy + r * math.sin(ang[k]), z)
        for (ra, za), (rb, zb) in zip(profile, profile[1:]):
            for k in range(seg):
                j = (k + 1) % seg
                self.face([pt(ra, za, k), pt(ra, za, j), pt(rb, zb, j), pt(rb, zb, k)], mat)
        if cap_bottom:
            self.face([pt(profile[0][0], profile[0][1], k) for k in reversed(range(seg))], mat)
        if cap_top:
            self.face([pt(profile[-1][0], profile[-1][1], k) for k in range(seg)], mat)

    def rotate_z(self, deg):
        """Turn everything built so far about Z — puts a load's long axis along +Y (the truck's
        length) when it was easier to author it along X."""
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

def _upper_hull(P):
    P = sorted(set((round(a, 5), round(c, 5)) for a, c in P))
    def cross(o, a, b_): return (a[0] - o[0]) * (b_[1] - o[1]) - (a[1] - o[1]) * (b_[0] - o[0])
    hull = []
    for p in reversed(P):
        while len(hull) >= 2 and cross(hull[-2], hull[-1], p) <= 0:
            hull.pop()
        hull.append(p)
    return hull[::-1]


BED_HALF_W = 0.70   # Ranger bed inner half-width (data/vehicle-models.js innerHalfW): every strap
                    # runs out to a tie-down at the bed wall on the floor, so the load reads as
                    # strapped to the TRUCK, not to its own pallet (owner 2026-10-09)
BED_ANCHORS = [(-BED_HALF_W, 0.0), (BED_HALF_W, 0.0)]


def hull_strap(b, pts, y, anchors, w=0.03, axis="y"):
    path = _upper_hull(list(pts) + list(anchors))
    for (a0, c0), (a1, c1) in zip(path, path[1:]):
        if axis == "y":
            b.face([(a0, y - w / 2, c0), (a1, y - w / 2, c1), (a1, y + w / 2, c1), (a0, y + w / 2, c0)], "Strap")
        else:
            b.face([(y - w / 2, a0, c0), (y - w / 2, a1, c1), (y + w / 2, a1, c1), (y + w / 2, a0, c0)], "Strap")



def strap_x(b, lo, hi, xs, t=0.03, s=0.004):
    """Band around the Y/Z section at x=xs (over the top, down both long sides)."""
    _, y0, z0 = lo; _, y1, z1 = hi
    b.box((xs - t / 2, y0 - s, z0 - s), (xs + t / 2, y1 + s, z1 + s), "Strap", skip=("+x", "-x"))


def strap_y(b, lo, hi, ys, t=0.03, s=0.004):
    x0, _, z0 = lo; x1, _, z1 = hi
    b.box((x0 - s, ys - t / 2, z0 - s), (x1 + s, ys + t / 2, z1 + s), "Strap", skip=("+y", "-y"))



# ---------------------------------------------------------------- chairs
def chair(b, xform):
    S, SH, LEG = 0.45, 0.45, 0.03           # seat size, seat height, leg stock
    b.box((-S / 2, -S / 2, SH - 0.04), (S / 2, S / 2, SH), "FurnWood", xform=xform)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p0 = xform @ Vector((sx * (S / 2 - 0.03), sy * (S / 2 - 0.03), 0)); p1 = xform @ Vector((sx * (S / 2 - 0.03), sy * (S / 2 - 0.03), SH - 0.04))
            b.bar(p0, p1, LEG, "FurnWood")          # capped: the feet of the inverted pair face the sky (owner 2026-10-09)
    for sx in (-1, 1):                                    # back posts rise from the rear legs
        p0 = xform @ Vector((sx * (S / 2 - 0.03), -(S / 2 - 0.03), SH)); p1 = xform @ Vector((sx * (S / 2 - 0.03), -(S / 2 - 0.03), 0.9))
        b.bar(p0, p1, LEG, "FurnWood")
    for z0 in (0.62, 0.80):                               # two back slats
        b.box((-S / 2 + 0.03, -(S / 2 - 0.03) - 0.012, z0), (S / 2 - 0.03, -(S / 2 - 0.03) + 0.012, z0 + 0.07), "FurnWood", xform=xform)


def build_chairs(b):
    for sx in (-1, 1):
        up = Matrix.Translation((sx * 0.26, 0, 0))
        chair(b, up)
        # inverted partner: flipped about X, seat on seat, its back hanging past the front
        inv = Matrix.Translation((sx * 0.26, 0.08, 0.90)) @ Matrix.Rotation(math.pi, 4, 'X')   # flipped about X: its back hangs down the FRONT, 8 cm clear of the legs
        chair(b, inv)
        # one strap per pair (owner 2026-10-09): over the upright's backrest, diagonally down to
        # the front edge of the inverted seat, then out to the bed-wall tie-down each side.  It
        # runs down each pair's centreline, between the inverted chair's upturned legs.
        sec = [(-0.195 - 0.015, 0.904), (-0.195 + 0.015, 0.904), (0.08 + 0.225 + 0.004, 0.494), (0.08 + 0.225 + 0.004, 0.45)]
        hull_strap(b, sec, sx * 0.26, BED_ANCHORS, axis="x")
    b.rotate_z(90)      # the two pairs sit one behind the other along the bed, so those straps cross it


# ---------------------------------------------------------------- vase
def build_vase(b):
    """Twelve-facet glazed vase with a fuller profile: foot ring, belly, shoulder, neck, flared lip,
    gold bands at foot, shoulder and lip; strapped to a small base (owner 2026-10-09 bar)."""
    b.box((-0.25, -0.25, 0), (0.25, 0.25, 0.05), "CrateWood", skip=("-z",))
    prof = [(0.09, 0.05), (0.115, 0.06), (0.12, 0.085), (0.105, 0.10), (0.15, 0.20), (0.175, 0.32), (0.172, 0.40),
            (0.15, 0.48), (0.115, 0.54), (0.105, 0.56), (0.09, 0.60), (0.075, 0.66), (0.078, 0.70), (0.11, 0.74), (0.118, 0.76), (0.10, 0.77)]
    mats = ["VaseGold", "VaseGold", "VaseGlaze", "VaseGlaze", "VaseGlaze", "VaseGlaze", "VaseGlaze", "VaseGold", "VaseGlaze",
            "VaseGlaze", "VaseGlaze", "VaseGlaze", "VaseGold", "VaseGold", "VaseGold"]
    seg = 12
    ang = [2 * math.pi * k / seg for k in range(seg)]
    pt = lambda r, z, k: (r * math.cos(ang[k]), r * math.sin(ang[k]), z)
    for s_, ((ra, za), (rb, zb)) in enumerate(zip(prof, prof[1:])):
        for k in range(seg):
            j = (k + 1) % seg
            b.face([pt(ra, za, k), pt(ra, za, j), pt(rb, zb, j), pt(rb, zb, k)], mats[s_])
    b.face([pt(0.10, 0.77, k) for k in range(seg)], "VaseGold")
    # two straps cross over the top flange and wrap its edge, then run straight out to the
    # bed-wall tie-downs (owner 2026-10-09); the second rides 4 mm over the first where they cross
    sec = [(-0.122, 0.76), (0.122, 0.76), (-0.104, 0.774), (0.104, 0.774), (-0.114, 0.744), (0.114, 0.744)]
    hull_strap(b, sec, 0.0, BED_ANCHORS)
    hull_strap(b, [(a_, c + 0.004) for a_, c in sec], 0.0, BED_ANCHORS, axis="x")


# ---------------------------------------------------------------- mirror
def build_mirror(b):
    """Standing full-length mirror, glass showing, propped on a kickstand and leaning back a little,
    one strap over the top: comically fragile on purpose (owner 2026-10-09)."""
    W, H, T = 0.6, 1.7, 0.05
    # +7° about X tips the top toward -Y, AWAY from the glass on +Y, so the mirror faces a little
    # skyward (owner 2026-10-09: -7° had it looking at the floor); lifted 6 mm so the tipped foot
    # rail's back edge stays on the floor
    lean = Matrix.Translation((0, 0, 0.006)) @ Matrix.Rotation(math.radians(7), 4, 'X')
    b.box((-W / 2, -T / 2, 0), (W / 2, T / 2, H), "FurnWood", skip=("-z",), xform=lean)
    b.box((-W / 2 + 0.05, T / 2 - 0.004, 0.06), (W / 2 - 0.05, T / 2 + 0.004, H - 0.06), "MirrorGlass", skip=("-y",), xform=lean)
    b.box((-W / 2 - 0.02, -T / 2 - 0.02, H - 0.06), (W / 2 + 0.02, T / 2 + 0.02, H), "FurnWood", xform=lean)     # crown rail
    b.box((-W / 2 - 0.02, -T / 2 - 0.02, 0), (W / 2 + 0.02, T / 2 + 0.02, 0.08), "FurnWood", skip=("-z",), xform=lean)   # foot rail
    top_back = lean @ Vector((0, -T / 2, 1.15))
    foot = Vector((0, -0.55, 0.015))
    b.bar(top_back, foot, 0.035, "FurnWood")                                                                       # kickstand, from the back down to its foot
    b.bar((-0.15, foot.y, foot.z), (0.15, foot.y, foot.z), 0.03, "FurnWood")                                       # cross foot, at the kickstand's end
    # one strap over the top, down to the bed-wall tie-downs
    top = lean @ Vector((0, 0, H))
    hull_strap(b, [(-W / 2 - 0.02, top.z + 0.004), (W / 2 + 0.02, top.z + 0.004), (-W / 2 - 0.02, 0.1), (W / 2 + 0.02, 0.1)], top.y, BED_ANCHORS)


# ---------------------------------------------------------------- fountain
def build_fountain(b):
    """Cast-stone fountain in its tiers: basin, bowl nested in it, the fluted column standing up
    in the bowl's centre with the finial on top, two straps following the top contours to the
    floor (owner 2026-10-09)."""
    basin = [(0.30, 0), (0.46, 0.05), (0.50, 0.22), (0.52, 0.27), (0.50, 0.30), (0.45, 0.29), (0.41, 0.12), (0.0, 0.12)]
    b.lathe(basin, 12, "CastStone", cap_bottom=True, cap_top=False)
    bowl = [(0.14, 0.12), (0.28, 0.16), (0.31, 0.26), (0.33, 0.30), (0.31, 0.32), (0.27, 0.31), (0.23, 0.20), (0.0, 0.20)]
    b.lathe(bowl, 12, "CastStone", cap_bottom=True, cap_top=False)
    n = 16
    def ring(r_base, z, flute=0.012):
        return [Vector(((r_base - (flute if k % 2 else 0.0)) * math.cos(2 * math.pi * k / n + math.pi / n),
                        (r_base - (flute if k % 2 else 0.0)) * math.sin(2 * math.pi * k / n + math.pi / n), z)) for k in range(n)]
    ped = [(0.14, 0.20, 0.0), (0.11, 0.25, 0.0), (0.10, 0.30, 0.012), (0.10, 0.60, 0.012), (0.11, 0.65, 0.0), (0.14, 0.70, 0.0)]
    rings = [ring(r, zz, fl) for r, zz, fl in ped]
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(n):
            j = (k + 1) % n
            b.face([r0[k], r0[j], r1[j], r1[k]], "CastStone")
    b.face(rings[-1], "CastStone")
    b.lathe([(0.05, 0.70), (0.08, 0.75), (0.04, 0.85), (0.0, 0.89)], 8, "CastStone", 0.0, 0.0, cap_bottom=False, cap_top=False)   # finial
    sec = [(0.52, 0.27), (-0.52, 0.27), (0.50, 0.30), (-0.50, 0.30), (0.33, 0.30), (-0.33, 0.30), (0.31, 0.32), (-0.31, 0.32),
           (0.14, 0.70), (-0.14, 0.70), (0.08, 0.75), (-0.08, 0.75), (0.0, 0.89)]
    hull_strap(b, sec, 0.0, [(-0.60, 0), (0.60, 0)])
    hull_strap(b, [(a_, c + 0.004) for a_, c in sec], 0.0, [(-0.60, 0), (0.60, 0)], axis="x")


VARIANTS = [("dining-chairs", build_chairs), ("ornate-vase", build_vase),
            ("full-length-mirror", build_mirror), ("garden-fountain", build_fountain)]


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
