"""
ASSET-08 — backyard fire ring, brick-and-mortar.  Parametric generator.

Built for: Blender 5.2  |  Targets: assets/models/<name>.glb  ·  source: assets/models/src/fire-pit.blend
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

The read is BUILT, not found (ticket): one block modelled once and placed 24 times on a
radial transform, staggered courses, mortar as a recessed second material, a dead-level
cap line.  One top-course block is missing and lies tipped on the ground outside the
ring — the single cheap irregularity that says "built, then weathered".

AXIS.  Rotationally symmetric; base plane z=0 (Blender) = y=0 (glTF).  The mortar ring
and ash bed go a little BELOW z=0 so the ring reads founded on a graded pad.
Empty `FireFlameAnchor` at the flame origin (ASSET-24 convention), parented to the body.

Materials (all fixed, none recolourable — masonry is masonry):
    FirePitBlock  FirePitMortar  FirePitCap  FirePitAsh  FirePitChar  FirePitLog
"""
import bpy, bmesh, math
from mathutils import Vector, Matrix

NAME = "fire-pit"
OUT_DIR = "/Users/ledogen/CodeShit/CarGame/assets/models"
OUT_BLEND = "/Users/ledogen/CodeShit/CarGame/assets/models/src/fire-pit.blend"
TRI_BUDGET = 700   # owner 2026-10-09: separation on the cap tiles beat the 550 figure

# ring geometry
N = 12                 # blocks per course
R_OUT = 0.50           # outer radius (1.0 m diameter)
R_IN = 0.31            # inner radius (block depth 0.19)
COURSE_H = 0.13
COURSES = 2
JOINT = 0.010          # head + bed joint width
PROUD = 0.006          # how far block faces stand proud of the mortar
FOOT = 0.03            # mortar footing below z=0
CAP_T = 0.04
CAP_OVER = 0.02
MISSING = (1, 7)       # (course, index) of the block that is gone
BED_Z = -0.02          # ash bed surface
R_CHAR = 0.17

MATS = {
    "FirePitBlock":  ((0.30, 0.28, 0.25, 1), 0.9),
    "FirePitMortar": ((0.56, 0.53, 0.47, 1), 0.95),
    "FirePitCap":    ((0.17, 0.17, 0.18, 1), 0.85),
    "FirePitAsh":    ((0.36, 0.35, 0.33, 1), 1.0),
    "FirePitChar":   ((0.012, 0.011, 0.010, 1), 1.0),
    "FirePitLog":    ((0.10, 0.065, 0.035, 1), 0.95),
}


def get_material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    col, rough = MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = col
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = 0.0
    m.diffuse_color = col
    m.roughness = rough
    m.use_backface_culling = True
    return m


class Builder:
    """Accumulates faces into one bmesh with material indices."""
    def __init__(self):
        self.bm = bmesh.new()
        self.slots = list(MATS)

    def face(self, pts, mat):
        vs = [self.bm.verts.new(p) for p in pts]
        f = self.bm.faces.new(vs)
        f.material_index = self.slots.index(mat)
        f.smooth = False
        return f

    def box(self, corners, mat, xform=Matrix.Identity(4)):
        """8 corners: bottom 0..3 CCW seen from above, top 4..7 same order."""
        c = [xform @ Vector(p) for p in corners]
        q = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        for a in q:
            self.face([c[i] for i in a], mat)

    def finish(self, name):
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.normal_update()
        up = {self.slots.index("FirePitAsh"), self.slots.index("FirePitChar")}
        for f in bm.faces:                      # the open bed sheet must face UP
            if f.material_index in up and f.normal.z < 0:
                f.normal_flip()
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me); bm.free()
        for s in self.slots:
            me.materials.append(get_material(s))
        ob = bpy.data.objects.new(name, me)
        bpy.context.collection.objects.link(ob)
        for p in me.polygons:
            p.use_smooth = False
        return ob


def ngon_ring(b, r_in, r_out, z0, z1, n, mat, phase=0.0, top=True, bottom=False):
    """Prism ring with n flat facets (apothem = r); walls + optional annular caps."""
    def pt(r, i, z):
        a = phase + 2 * math.pi * i / n
        rr = r / math.cos(math.pi / n)        # apothem -> vertex radius
        return (rr * math.cos(a), rr * math.sin(a), z)
    for i in range(n):
        j = (i + 1) % n
        b.face([pt(r_out, i, z0), pt(r_out, j, z0), pt(r_out, j, z1), pt(r_out, i, z1)], mat)
        b.face([pt(r_in, j, z0), pt(r_in, i, z0), pt(r_in, i, z1), pt(r_in, j, z1)], mat)
        if top:
            b.face([pt(r_in, i, z1), pt(r_out, i, z1), pt(r_out, j, z1), pt(r_in, j, z1)], mat)
        if bottom:
            b.face([pt(r_out, i, z0), pt(r_in, i, z0), pt(r_in, j, z0), pt(r_out, j, z0)], mat)


def block_corners():
    """One tapered block, centred on +X, base at z=0, outer face at x=R_OUT+PROUD."""
    half = math.pi / N
    wo = (R_OUT * 2 * math.tan(half) - JOINT) / 2     # half width at outer face
    wi = (R_IN * 2 * math.tan(half) - JOINT) / 2      # half width at inner face
    xo, xi = R_OUT + PROUD, R_IN - PROUD
    h = COURSE_H - JOINT
    return [(xi, -wi, 0), (xo, -wo, 0), (xo, wo, 0), (xi, wi, 0),
            (xi, -wi, h), (xo, -wo, h), (xo, wo, h), (xi, wi, h)]


def log(b, p0, p1, r, mat, sides=6):
    p0, p1 = Vector(p0), Vector(p1)
    ax = (p1 - p0).normalized()
    up = Vector((0, 0, 1)) if abs(ax.z) < 0.9 else Vector((1, 0, 0))
    u = ax.cross(up).normalized(); v = ax.cross(u)
    ring = lambda c: [c + (u * math.cos(2 * math.pi * k / sides) + v * math.sin(2 * math.pi * k / sides)) * r for k in range(sides)]
    a, c = ring(p0), ring(p1)
    for k in range(sides):
        j = (k + 1) % sides
        b.face([a[k], a[j], c[j], c[k]], mat)
    b.face(list(reversed(a)), mat); b.face(c, mat)


def build():
    b = Builder()
    blk = block_corners()
    for ci in range(COURSES):
        z = JOINT / 2 + ci * COURSE_H
        phase = (math.pi / N) * ci                   # half-block stagger
        for i in range(N):
            if (ci, i) == MISSING:
                continue
            a = phase + 2 * math.pi * i / N
            b.box(blk, "FirePitBlock", Matrix.Translation((0, 0, z)) @ Matrix.Rotation(a, 4, 'Z'))
    # the missing block, lying flat on the ground outside the ring
    a = (math.pi / N) + 2 * math.pi * MISSING[1] / N + 0.35
    xf = (Matrix.Rotation(a, 4, 'Z') @ Matrix.Translation((R_OUT + 0.24, 0, 0)) @
          Matrix.Rotation(math.radians(28), 4, 'Z') @ Matrix.Translation((-(R_IN + R_OUT) / 2, 0, 0)))
    b.box(blk, "FirePitBlock", xf)
    # mortar core: footing to the top of the last bed joint, facets aligned with course-1 blocks
    top = COURSES * COURSE_H
    # 24 facets at R_OUT - 12 mm: every mortar vertex (r = 0.488/cos 7.5deg = 0.492) stays inside the
    # block faces at 0.506, so the staggered top course is never cut by the core (was a 12-gon at
    # R_OUT whose corners poked through the course-2 blocks).  Its top face shows in the cap gaps.
    ngon_ring(b, R_IN + 0.012, R_OUT - 0.012, -FOOT, top, 2 * N, "FirePitMortar", phase=math.pi / (2 * N), top=True)
    # cap: 12 flagstones with 10 mm gaps, overhanging the blocks a little
    ri, ro, gap = R_IN - PROUD - CAP_OVER, R_OUT + PROUD + CAP_OVER, 0.010
    for i in range(N):
        a0, a1 = 2 * math.pi * i / N + gap / ro, 2 * math.pi * (i + 1) / N - gap / ro
        p = lambda r, a, z: (r * math.cos(a), r * math.sin(a), z)
        c = [p(ri, a0, top), p(ro, a0, top), p(ro, a1, top), p(ri, a1, top),
             p(ri, a0, top + CAP_T), p(ro, a0, top + CAP_T), p(ro, a1, top + CAP_T), p(ri, a1, top + CAP_T)]
        for q in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]:
            b.face([c[k] for k in q], "FirePitCap")
    # ash bed: char disc + ash annulus, sitting just below grade
    n = 10
    pt = lambda r, i, z: (r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n), z)
    b.face([pt(R_CHAR, i, BED_Z) for i in reversed(range(n))], "FirePitChar")
    for i in range(n):
        j = (i + 1) % n
        b.face([pt(R_CHAR, i, BED_Z), pt(R_IN + 0.01, i, BED_Z + 0.025),
                pt(R_IN + 0.01, j, BED_Z + 0.025), pt(R_CHAR, j, BED_Z)], "FirePitAsh")
    # two burnt log ends lying in the bed
    log(b, (-0.14, -0.08, BED_Z + 0.045), (0.16, 0.02, BED_Z + 0.045), 0.045, "FirePitLog")
    log(b, (0.02, 0.15, BED_Z + 0.04), (-0.11, -0.13, BED_Z + 0.065), 0.04, "FirePitLog")
    ob = b.finish("FirePit")
    anchor = bpy.data.objects.new("FireFlameAnchor", None)
    anchor.empty_display_size = 0.1
    anchor.location = (0, 0, BED_Z + 0.08)
    anchor.parent = ob
    bpy.context.collection.objects.link(anchor)
    return ob


def evaluated_tris(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = ob.evaluated_get(dg).to_mesh()
    return sum(len(p.vertices) - 2 for p in me.polygons)


def check_normals(ob, samples=300):
    """Rays from outside must hit faces whose normals face the ray."""
    import random
    random.seed(1)
    bad = 0; hit = 0
    for _ in range(samples):
        d = Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(0.05, 1))).normalized()   # never seen from below
        origin = d * 3.0
        ok, loc, nrm, idx = ob.ray_cast(origin, -d)
        if ok:
            hit += 1
            if nrm.dot(d) < 0:
                bad += 1
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
            return dict(window=bpy.context.window, area=area,
                        region=next(r for r in area.regions if r.type == 'WINDOW'))
    return {}


def export():
    fresh_scene()
    ob = build()
    tris = evaluated_tris(ob)
    hit, bad = check_normals(ob)
    print(f"{NAME}: {tris} tris / {TRI_BUDGET}  normals: {bad} inverted of {hit} hits  mats {len(ob.data.materials)}")
    with bpy.context.temp_override(**_ui_override()):
        bpy.ops.export_scene.gltf(
            filepath=f"{OUT_DIR}/{NAME}.glb", export_format="GLB",
            export_draco_mesh_compression_enable=False, export_yup=True, export_apply=True,
            export_materials="EXPORT", export_texcoords=False, export_normals=True,
            export_cameras=False, export_lights=False, use_selection=False)
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    return tris, bad


if __name__ == "__main__":
    export()
