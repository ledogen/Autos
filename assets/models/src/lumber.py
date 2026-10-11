"""
ASSET-38 lumber-bundle (cargo) + ASSET-12 lumber-yard kit — one parametric generator,
four .glb files (ASSETS.md kit rule: one .py, one .blend, one .glb per variant).

Built for: Blender 5.2  |  Targets: assets/models/<name>.glb  ·  source: assets/models/src/lumber.blend
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

    lumber-bundle   ≤300   0.60 x 0.35 x 1.80  banded 2x4 bundle, the sawmill haul load
    lumber-stack    ≤450   4.0 x 1.2 x 1.0     two stickered units of 2x10, banded
    timber-rack     ≤600   5.0 x 1.5 x 2.5     three-post cantilever rack, loaded
    offcut-pile     ≤350   2.0 x 2.0 x 0.6     heap of short ends

THE TRICK.  A bundle is one box; the END faces are a grid of per-board quads, each with
its own vertex tint (COLOR_0) so the sawn ends read as individual boards.  A few boards
stick out proud of the end plane as real boxes — that is the "ragged" read, at 12 tris a
board instead of 12 tris x 70.  Boards run along Blender +Y (= glTF -Z, project forward).

Materials: LumberFace (board faces), LumberEnd (sawn end grain, darker/warmer),
LumberStrap (steel banding), RackSteel (rack frame).  Tints live in COLOR_0 so the first
two stay ONE draw call each; authored colour is the lightest board, every tint <= 1.
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix

OUT_DIR = "/Users/ledogen/CodeShit/CarGame/assets/models"
OUT_BLEND = "/Users/ledogen/CodeShit/CarGame/assets/models/src/lumber.blend"
BUDGETS = {"lumber-bundle": 800, "board-2x4": 12, "board-2x6": 12, "board-2x8": 12, "lumber-stack": 1000, "timber-rack": 600, "offcut-pile": 500}   # owner 2026-10-09: real boards

MATS = {
    "LumberFace":  ((0.62, 0.50, 0.32, 1), 0.9),
    "LumberEnd":   ((0.55, 0.38, 0.20, 1), 1.0),
    "LumberStrap": ((0.09, 0.10, 0.11, 1), 0.45),
    "RackSteel":   ((0.70, 0.30, 0.08, 1), 0.6),     # safety-orange rack, the man-made saturation
}
TINTS = [(1, 1, 1), (0.78, 0.74, 0.68), (0.92, 0.86, 0.74), (0.70, 0.66, 0.62), (0.86, 0.80, 0.70), (0.97, 0.94, 0.88)]


def get_material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    col, rough = MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    attr = nt.nodes.new("ShaderNodeVertexColor"); attr.layer_name = "Col"
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0; mix.inputs[6].default_value = col
    nt.links.new(attr.outputs["Color"], mix.inputs[7]); nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough; b.inputs["Metallic"].default_value = 0.0
    m.diffuse_color = col; m.roughness = rough; m.use_backface_culling = name != "LumberStrap"
    return m


class Builder:
    def __init__(self):
        self.bm = bmesh.new(); self.slots = list(MATS); self.k = 0
        self.tint_layer = self.bm.loops.layers.float_color.new("Col")

    def tint(self):
        self.k += 1
        return TINTS[(self.k * 5) % len(TINTS)]

    def face(self, pts, mat, tint=(1, 1, 1)):
        f = self.bm.faces.new([self.bm.verts.new(Vector(p)) for p in pts])
        f.material_index = self.slots.index(mat); f.smooth = False
        for l in f.loops:
            l[self.tint_layer] = (*tint, 1.0)
        return f

    def box(self, lo, hi, mat, tint=(1, 1, 1), xform=Matrix.Identity(4), skip=()):
        x0, y0, z0 = lo; x1, y1, z1 = hi
        c = [xform @ Vector(p) for p in [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                                         (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]]
        q = {"-z": (0, 3, 2, 1), "+z": (4, 5, 6, 7), "-y": (0, 1, 5, 4), "+x": (1, 2, 6, 5), "+y": (2, 3, 7, 6), "-x": (3, 0, 4, 7)}
        for k, a in q.items():
            if k not in skip:
                self.face([c[i] for i in a], mat, tint)

    def finish(self, name):
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
        for s in self.slots:
            me.materials.append(get_material(s))
        me.color_attributes.active_color = me.color_attributes["Col"]
        for p in me.polygons:
            p.use_smooth = False
        ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
        fix_normals(ob)
        return split_by_material(ob)
def board(b, lo, hi, tint, xform=Matrix.Identity(4)):
    """One board: six faces, sawn ends in LumberEnd (board runs along Y)."""
    x0, y0, z0 = lo; x1, y1, z1 = hi
    c = [xform @ Vector(p) for p in [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                                     (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]]
    q = {"-z": (0, 3, 2, 1), "+z": (4, 5, 6, 7), "-y": (0, 1, 5, 4), "+x": (1, 2, 6, 5), "+y": (2, 3, 7, 6), "-x": (3, 0, 4, 7)}
    for k, a in q.items():
        b.face([c[i] for i in a], "LumberEnd" if k in ("+y", "-y") else "LumberFace", tint)


def _upper_hull(P):
    P = sorted(set((round(a, 5), round(c, 5)) for a, c in P))
    def cross(o, a, b_): return (a[0] - o[0]) * (b_[1] - o[1]) - (a[1] - o[1]) * (b_[0] - o[0])
    hull = []
    for p in reversed(P):
        while len(hull) >= 2 and cross(hull[-2], hull[-1], p) <= 0:
            hull.pop()
        hull.append(p)
    return hull[::-1]


def hull_strap(b, pts, y, anchors, w=0.03):
    """Double-sided ribbon over the upper hull of the (x,z) section points, anchor to anchor."""
    path = _upper_hull(list(pts) + list(anchors))
    for (a0, c0), (a1, c1) in zip(path, path[1:]):
        b.face([(a0, y - w / 2, c0), (a1, y - w / 2, c1), (a1, y + w / 2, c1), (a0, y + w / 2, c0)], "LumberStrap")

def fix_normals(ob):
    """Orient every face toward open air: probe a hair off both sides of each face along its normal;
    if only the back side escapes to infinity the face is inside-out.  Thin sheets stay as built."""
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


def split_by_material(ob):
    """Blender 5.2's glTF exporter only writes COLOR_0 for a mesh's FIRST material slot (verified
    2026-10-09: every later primitive exports white).  So the combined mesh is split into one object
    per material under an empty root — same draw calls in three.js, tints survive export."""
    me = ob.data; name = ob.name
    root = bpy.data.objects.new(name + "_root", None)
    bpy.context.collection.objects.link(root)
    for mi, mat in enumerate(me.materials):
        bm = bmesh.new(); bm.from_mesh(me)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index != mi], context='FACES')
        if not bm.faces:
            bm.free(); continue
        part = bpy.data.meshes.new(f"{ob.name}_{mat.name}"); bm.to_mesh(part); bm.free()
        part.materials.append(mat)
        for p in part.polygons:
            p.material_index = 0; p.use_smooth = False
        if "Col" in part.color_attributes:
            part.color_attributes.active_color = part.color_attributes["Col"]
        po = bpy.data.objects.new(part.name, part); bpy.context.collection.objects.link(po); po.parent = root
    bpy.data.objects.remove(ob, do_unlink=True)
    root.name = name                       # the mesh object held the name until now
    return root


def bounds(root):
    """(dx, dy, dz) of a root's mesh children in world space."""
    import itertools
    pts = [ch.matrix_world @ Vector(c) for ch in root.children for c in ch.bound_box]
    if not pts:
        return (0.0, 0.0, 0.0)
    return tuple(round(max(p[i] for p in pts) - min(p[i] for p in pts), 2) for i in range(3))


def bundle(b, cx, z0, nx, nz, bw, bh, length, straps, seed, gap=0.004, anchors_z=0.0, anchor_x=None):
    """A banded unit of nx x nz REAL boards (owner 2026-10-09: model the boards), each jittered a
    few mm in place and a couple of cm in length so the ends are ragged, under hull straps."""
    rnd = random.Random(seed)
    w, h = nx * (bw + gap), nz * (bh + gap)
    x0 = cx - w / 2
    pts = []
    for i in range(nx):
        for j in range(nz):
            dx, dz = rnd.uniform(-0.002, 0.002), rnd.uniform(-0.001, 0.001)
            dy0, dy1 = rnd.uniform(-0.025, 0.01), rnd.uniform(-0.01, 0.025)
            xa, za = x0 + i * (bw + gap) + dx, z0 + j * (bh + gap) + dz
            board(b, (xa, -length / 2 + dy0, za), (xa + bw, length / 2 + dy1, za + bh), b.tint())
            pts += [(xa - 0.004, za), (xa + bw + 0.004, za), (xa + bw + 0.004, za + bh + 0.004), (xa - 0.004, za + bh + 0.004)]
    ax = anchor_x if anchor_x is not None else (x0 - 0.02, x0 + w + 0.02)
    for ys in straps:
        hull_strap(b, pts, ys, [(ax[0], anchors_z), (ax[1], anchors_z)])


def build_bundle(b):
    # 6 x 9 two-by-fours, 0.56 x 0.38 m section. Boards are 1.73 m, not the ticket's 1.80: the ragged
    # ends add up to 5 cm, and the whole bundle has to drop into the 1.835 m bed with the tailgate
    # shut and a little to spare (owner 2026-10-10: shorter boards, keep the stagger) — 1.78 m max.
    bundle(b, 0, 0, 6, 9, 0.089, 0.038, 1.73, (-0.55, 0.0, 0.55), seed=3)


def build_board_2x8(b):
    board(b, (-0.092, -0.9, -0.019), (0.092, 0.9, 0.019), (0.78, 0.74, 0.68))


def build_board_2x4(b):
    board(b, (-0.0445, -0.9, -0.019), (0.0445, 0.9, 0.019), (1, 1, 1))


def build_board_2x6(b):
    board(b, (-0.07, -0.9, -0.019), (0.07, 0.9, 0.019), (0.92, 0.86, 0.74))


def build_stack(b):
    # two 2x10 units on 4x4 bearers + 4x4 stickers between
    L, W, UH = 4.0, 1.2, 6 * 0.042
    bear = 0.09
    for z, n in ((0, 3), (bear + UH, 3)):
        for ys in (-1.6, 0.0, 1.6):
            b.box((-W / 2 - 0.05, ys - 0.045, z), (W / 2 + 0.05, ys + 0.045, z + bear), "LumberFace", (0.7, 0.66, 0.6))
    # two units of 5 x 6 two-by-tens (0.235 x 0.038), 4.0 m, on 4x4 bearers
    bundle(b, 0, bear, 5, 6, 0.235, 0.038, L, (), seed=5)            # no straps: a stickered yard stack is loose (owner 2026-10-09)
    bundle(b, 0.03, 2 * bear + 6 * 0.042, 5, 6, 0.235, 0.038, L, (), seed=9)


def build_rack(b):
    L, D, H = 5.0, 1.5, 2.5
    post, arm = 0.12, 0.08
    for x in (-2.0, 0.0, 2.0):
        b.box((x - post / 2, -post / 2, 0), (x + post / 2, post / 2, H), "RackSteel")
        b.box((x - post / 2, -D / 2, 0), (x + post / 2, D / 2, 0.10), "RackSteel")        # foot
        for z in (0.7, 1.4, 2.1):
            for side in (-1, 1):
                ya, yb = sorted((side * post / 2, side * D / 2))
                b.box((x - arm / 2, ya, z), (x + arm / 2, yb, z + arm), "RackSteel")
    # load: long timbers lying across the arms, boards along X
    rnd = random.Random(7)
    for z, fill in ((0.78, 5), (1.48, 4), (2.18, 2)):
        for side in (-1, 1):
            for k in range(fill):
                y = side * (0.12 + k * 0.14) + rnd.uniform(-0.01, 0.01)
                ln = rnd.uniform(4.2, 5.0); dx = rnd.uniform(-0.25, 0.25)
                t = b.tint()
                b.box((dx - ln / 2, y - 0.06, z), (dx + ln / 2, y + 0.06, z + 0.10), "LumberFace", t, skip=("+x", "-x"))
                # end grain caps
                for xe, sgn in ((dx - ln / 2, -1), (dx + ln / 2, 1)):
                    pts = [(xe, y - 0.06, z), (xe, y + 0.06, z), (xe, y + 0.06, z + 0.10), (xe, y - 0.06, z + 0.10)]
                    if sgn > 0:
                        pts.reverse()
                    b.face(pts, "LumberEnd", t)


def build_offcuts(b):
    """Offcuts DROPPED, not placed (owner 2026-10-09: "simulate the physics").  Each board is a
    Blender rigid body — box collision, timber friction, no bounce — released in four loose
    columns over a ground plane and run for ten seconds until everything is asleep, so every piece
    rests on real contacts: ends on other boards, tipped and skewed the way a heap settles.  The
    settled transforms are baked into the kit mesh and the simulation objects are deleted, so the
    export is still one static mesh."""
    rnd = random.Random(11)
    scene = bpy.context.scene
    if scene.rigidbody_world is None:
        bpy.ops.rigidbody.world_add()
    rbw = scene.rigidbody_world
    rbw.substeps_per_frame = 10; rbw.solver_iterations = 20
    rbw.point_cache.frame_start = 1; rbw.point_cache.frame_end = 250

    def rigid(ob, kind):
        with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
            bpy.ops.rigidbody.object_add(type=kind)
        ob.rigid_body.friction = 0.8; ob.rigid_body.restitution = 0.0

    bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, 0))
    ground = bpy.context.active_object; ground.name = "_sim_ground"; rigid(ground, 'PASSIVE')
    sims = []
    for k in range(40):
        L = rnd.uniform(0.3, 0.95); W = rnd.choice((0.089, 0.14, 0.089, 0.235)); H = rnd.choice((0.038, 0.038, 0.038, 0.089))
        col = ((-0.3, -0.3), (0.3, -0.3), (-0.3, 0.3), (0.3, 0.3))[k % 4]
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(col[0] + rnd.uniform(-0.1, 0.1), col[1] + rnd.uniform(-0.1, 0.1), 0.3 + (k // 4) * 0.16))
        ob = bpy.context.active_object; ob.name = f"_sim_board{k}"
        ob.scale = (W, L, H)                                          # the board runs along local Y, like board()
        ob.rotation_euler = (rnd.uniform(-0.15, 0.15), rnd.uniform(-0.15, 0.15), rnd.uniform(0, math.pi))
        rigid(ob, 'ACTIVE')
        ob.rigid_body.collision_shape = 'BOX'; ob.rigid_body.mass = L * W * H * 500
        ob.rigid_body.linear_damping = 0.15; ob.rigid_body.angular_damping = 0.3
        sims.append(ob)
    for f in range(1, 251):
        scene.frame_set(f)
    for ob in sims:
        board(b, (-0.5, -0.5, -0.5), (0.5, 0.5, 0.5), b.tint(), ob.matrix_world.copy())
    scene.frame_set(1)
    for ob in sims + [ground]:
        bpy.data.objects.remove(ob, do_unlink=True)
    bpy.ops.rigidbody.world_remove()


VARIANTS = [("lumber-bundle", build_bundle),
            ("board-2x4", build_board_2x4), ("board-2x6", build_board_2x6), ("board-2x8", build_board_2x8),
            ("lumber-stack", build_stack), ("timber-rack", build_rack), ("offcut-pile", build_offcuts)]


def evaluated_tris(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    objs = [c for c in ob.children if c.type == 'MESH'] if ob.type == 'EMPTY' else [ob]
    return sum(len(p.vertices) - 2 for o in objs for p in o.evaluated_get(dg).to_mesh().polygons)
def check_normals(ob, samples=300):
    rnd = random.Random(1); hit = bad = 0
    dg = bpy.context.evaluated_depsgraph_get()
    for _ in range(samples):
        d = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(0.05, 1))).normalized()
        ok, loc, nrm, idx, o, m = bpy.context.scene.ray_cast(dg, d * 12.0, -d)
        if ok:
            hit += 1; bad += nrm.dot(d) < 0
    return hit, bad
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
    b = Builder(); fn(b); ob = b.finish(name.replace("-", "_").title().replace("_", ""))
    ob.location.x = dx
    return ob


def export(only=None):
    report = {}
    for name, fn in VARIANTS:
        if only and name not in only:
            continue
        fresh_scene(); ob = build_one(name, fn)
        tris = evaluated_tris(ob); hit, bad = check_normals(ob)
        dims = bounds(ob)
        report[name] = (tris, BUDGETS[name], bad, dims)
        print(f"{name}: {tris}/{BUDGETS[name]} tris, {bad} inverted of {hit}, dims {dims}")
        with bpy.context.temp_override(**_ui_override()):
            bpy.ops.export_scene.gltf(
                filepath=f"{OUT_DIR}/{name}.glb", export_format="GLB",
                export_draco_mesh_compression_enable=False, export_yup=True, export_apply=True,
                export_materials="EXPORT", export_vertex_color="ACTIVE", export_texcoords=False,
                export_normals=True, export_cameras=False, export_lights=False, use_selection=False)
    fresh_scene()
    x = 0.0
    for name, fn in VARIANTS:
        ob = build_one(name, fn, x); x += bounds(ob)[0] + 1.5
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    return report


if __name__ == "__main__":
    export()
