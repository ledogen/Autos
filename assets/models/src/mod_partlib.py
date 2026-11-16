"""
FEAT-204 shared kit for the four truck parts (light bar, bed toolbox, roof rack, bull bar).

Each mod-<part>.py generator beside it imports this (a module name needs underscores, hence mod_partlib).  Run headless only:
    /Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 --python assets/models/src/mod-<part>.py

FRAME CONVENTION (all four parts).  Every part is authored in ranger.py's own Blender frame:
x = 0 the centreline (driver at -X), +Y the NOSE, z = 0 the tyre contact plane, y = 0 the CG
station (front axle +1.2825, rear -1.5675).  The glTF export maps that to the shipped ranger.glb's
frame exactly (forward -Z, +Y up), so a part loaded and added as a CHILD of the loaded ranger root
with an identity transform lands on its mounts — wiring is data-only, no offsets to copy.  Each
generator also prints its mount point(s) in both frames.
"""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

SRC = os.path.dirname(os.path.abspath(__file__))        # assets/models/src: generators + .blend
MODELS = os.path.dirname(SRC)                           # assets/models: the shipped .glb files
ROOT = os.path.dirname(os.path.dirname(MODELS))         # this checkout
RANGER_GLB = f"{MODELS}/ranger.glb"
RENDERS = f"{ROOT}/wip/feat-204-common/renders"         # review renders: wip/ is git-invisible

# ---- ranger.glb cab roof, measured by a ray probe (round 2).  The flat painted roof panel (RangerPaint,
# up-facing, z > 1.5) spans x -0.658 .. +0.658 and y -0.428 .. +0.148 on the centreline (+0.173 at the
# front corners: the windscreen header bows forward); crown z 1.620 -> 1.600 at x 0.658; the bevel
# runs out to the edge x 0.676.  1.32 m wide x 0.58 m long.
ROOF_Z = lambda x: 1.620 - 0.0302 * abs(x)
ROOF_EDGE_X = 0.676
ROOF_Y_REAR, ROOF_Y_FRONT = -0.428, 0.148

# ---- round-2 roof rack, shared with light-bar-rack (the pods mount on its front rail) ----
RACK_HX = 0.560                        # basket half width (tube centre line)
RACK_Y_REAR, RACK_Y_FRONT = -0.400, 0.130
RACK_Z_LOW, RACK_Z_TOP = 1.700, 1.815  # lower (floor) loop and upper rail loop centre lines
RACK_FRONT_DROP = 0.075                # the upper rail sweeps down this much into the fairing
RACK_CORNER = 0.070
RACK_R_MAIN = 0.0127
# the upper loop's straight front run (where light-bar-rack's brackets clamp)
RACK_RAIL_Y = RACK_Y_FRONT - 0.010
RACK_RAIL_Z = RACK_Z_TOP - RACK_FRONT_DROP
RACK_RAIL_HALF = RACK_HX - 0.010 - RACK_CORNER


def fillet(pts, radii, n=6):
    """Round every interior corner of a 3D control polygon with a circular arc of radii[i-1]
    (n segments per arc).  End points are kept."""
    P = [Vector(p) for p in pts]
    out = [P[0]]
    for i in range(1, len(P) - 1):
        a, b, c = P[i - 1], P[i], P[i + 1]
        u, w = (a - b).normalized(), (c - b).normalized()
        ang = u.angle(w)                        # interior angle
        r = radii[i - 1]
        t = r / math.tan(ang / 2)               # tangent length
        p0 = b + u * t
        ctr = b + (u + w).normalized() * (r / math.sin(ang / 2))
        v0, v1 = p0 - ctr, (b + w * t) - ctr
        sweep = v0.angle(v1); axis = v0.cross(v1).normalized()
        for k in range(n + 1):
            out.append(ctr + Matrix.Rotation(sweep * k / n, 3, axis) @ v0)
    out.append(P[-1])
    return out


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, col, rough, alpha=1.0, double=None):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*col, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = 0.0
    m.diffuse_color = (*col, alpha); m.roughness = rough
    m.use_backface_culling = True                      # closed solids -> glTF doubleSided false
    if alpha < 1.0:
        b.inputs["Alpha"].default_value = alpha
        for attr, val in (("blend_method", "BLEND"), ("surface_render_method", "BLENDED")):
            try:
                setattr(m, attr, val)                  # 5.x EEVEE reads the second, the exporter either
            except (TypeError, AttributeError):
                pass
        m.use_backface_culling = False
    if double is not None:
        m.use_backface_culling = not double
    return m


def _frame(t):
    """Two unit vectors perpendicular to tangent t."""
    t = t.normalized()
    a = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
    u = t.cross(a).normalized()
    return u, t.cross(u).normalized()


class Mesh:
    """One bmesh per object.  Every primitive is a CLOSED solid with shared verts, so
    recalc_face_normals orients each island outward; check_normals() then proves it."""

    def __init__(self, mats):
        self.bm = bmesh.new(); self.mats = list(mats); self.late = []

    def f(self, vs, mat):
        fc = self.bm.faces.new(vs); fc.material_index = self.mats.index(mat); fc.smooth = False
        return fc

    def v(self, p):
        return self.bm.verts.new(Vector(p))

    def ring_bridge(self, rings, mat, closed=False, caps=True):
        """Bridge a list of equal-length vertex rings into a tube; cap the ends."""
        n = len(rings[0])
        pairs = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if closed else [])
        for a, b in pairs:
            for i in range(n):
                self.f([a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]], mat)
        if caps and not closed:
            self.f(list(reversed(rings[0])), mat); self.f(rings[-1], mat)

    def sweep(self, path, mat, r=0.03, sides=8, section=None, closed=False, caps=True, twist=0.0):
        """Sweep a ring along a polyline, mitred at joints (parallel-transport frame).
        section: optional list of (u, v) offsets instead of a round ring of radius r."""
        P = [Vector(p) for p in path]
        if section is None:
            section = [(r * math.cos(2 * math.pi * k / sides + twist), r * math.sin(2 * math.pi * k / sides + twist))
                       for k in range(sides)]
        m = len(P)
        tang = []
        for i in range(m):
            if closed:
                a, b = P[i - 1], P[(i + 1) % m]
                tin, tout = (P[i] - a).normalized(), (b - P[i]).normalized()
            else:
                tin = (P[i] - P[i - 1]).normalized() if i > 0 else (P[1] - P[0]).normalized()
                tout = (P[i + 1] - P[i]).normalized() if i < m - 1 else tin
            tang.append((tin, tout))
        u, w = _frame(tang[0][1] if not closed else (tang[0][0] + tang[0][1]))
        rings = []
        for i in range(m):
            tin, tout = tang[i]
            t = (tin + tout).normalized() if (tin + tout).length > 1e-6 else tout
            # parallel transport: rotate previous frame onto the new tangent
            if i > 0:
                q = prev_t.rotation_difference(t); u = q @ u; w = q @ w
            prev_t = t
            # mitre: stretch the ring along the bend's in-plane direction
            c = max(tin.dot(tout), -0.95)
            half = math.sqrt((1 + c) / 2)                # cos(half bend angle)
            bend = (tout - tin)
            bdir = (bend - t * bend.dot(t)).normalized() if bend.length > 1e-6 else None
            ring = []
            for (su, sv) in section:
                off = u * su + w * sv
                if bdir is not None and half > 1e-3:
                    k = off.dot(bdir); off = off + bdir * k * (1 / half - 1)
                ring.append(self.v(P[i] + off))
            rings.append(ring)
        self.ring_bridge(rings, mat, closed=closed, caps=caps)

    def tube(self, p0, p1, mat, r=0.02, sides=8, section=None, twist=0.0):
        self.sweep([p0, p1], mat, r=r, sides=sides, section=section, twist=twist)

    def boxm(self, mn, mx, mat):
        x0, y0, z0 = mn; x1, y1, z1 = mx
        c = [self.v(p) for p in [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                                 (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]]
        for q in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]:
            self.f([c[i] for i in q], mat)

    def box(self, c, s, mat):
        self.boxm([c[i] - s[i] / 2 for i in range(3)], [c[i] + s[i] / 2 for i in range(3)], mat)

    def obox(self, c, ax, ay, az, hx, hy, hz, mat):
        """Oriented box: centre c, unit axes, half sizes."""
        c, ax, ay, az = Vector(c), Vector(ax).normalized(), Vector(ay).normalized(), Vector(az).normalized()
        P = [c + ax * sx * hx + ay * sy * hy + az * sz * hz
             for sz in (-1, 1) for (sx, sy) in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        v = [self.v(p) for p in P]
        for q in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]:
            self.f([v[i] for i in q], mat)

    def extrude(self, poly, axis, a0, a1, mat):
        """Extrude a 2D polygon (in the two axes other than `axis`, in x->y->z order) from a0 to a1."""
        def P(uv, a):
            u, w = uv
            return {"x": (a, u, w), "y": (u, a, w), "z": (u, w, a)}[axis]
        r0 = [self.v(P(p, a0)) for p in poly]; r1 = [self.v(P(p, a1)) for p in poly]
        self.ring_bridge([r0, r1], mat)

    def lathe(self, prof, origin, axis, mat, segs=12, phase=0.0, caps=(True, True), loop=False):
        """Revolve a (radius, distance-along-axis) profile.  radius 0 -> a pole.
        loop=True revolves a CLOSED section (a ring / bezel / bowl with wall thickness)."""
        o, a = Vector(origin), Vector(axis).normalized()
        u, w = _frame(a)
        rings = []
        for (r, t) in prof:
            if r < 1e-6:
                rings.append([self.v(o + a * t)])
            else:
                rings.append([self.v(o + a * t + (u * math.cos(2 * math.pi * k / segs + phase) +
                                                   w * math.sin(2 * math.pi * k / segs + phase)) * r)
                              for k in range(segs)])
        pairs = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if loop else [])
        for A, B in pairs:
            if len(A) == 1 and len(B) == 1:
                continue
            if len(A) == 1:
                for i in range(segs):
                    self.f([A[0], B[(i + 1) % segs], B[i]][::-1], mat)
            elif len(B) == 1:
                for i in range(segs):
                    self.f([A[i], A[(i + 1) % segs], B[0]], mat)
            else:
                for i in range(segs):
                    self.f([A[i], A[(i + 1) % segs], B[(i + 1) % segs], B[i]], mat)
        if loop:
            return
        if caps[0] and len(rings[0]) > 1:
            self.f(list(reversed(rings[0])), mat)
        if caps[1] and len(rings[-1]) > 1:
            self.f(rings[-1], mat)

    def stud(self, c, n, u, a, b, h, mat):
        """An OPEN raised pyramid (4 tris) on a surface, base sunk 0.5 mm: c centre, n surface normal,
        u the long axis, a/b half length/width, h height.  Wound outward explicitly and added after
        the island re-orientation (an open island has no inside to orient against)."""
        c, n, u = Vector(c), Vector(n).normalized(), Vector(u).normalized()
        w = n.cross(u)
        base = [c + u * a - n * 0.0005, c + w * b - n * 0.0005, c - u * a - n * 0.0005, c - w * b - n * 0.0005]
        apex = c + n * h
        for i in range(4):
            self.late.append(([base[i], base[(i + 1) % 4], apex], mat))

    def finish(self, name):
        bm = self.bm
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)   # per connected (closed) island
        for pts, mat in self.late:
            self.f([self.v(p) for p in pts], mat)
        me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
        for mn in self.mats:
            me.materials.append(bpy.data.materials[mn])
        for p in me.polygons:
            p.use_smooth = False
        ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
        return ob


def tris(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = ob.evaluated_get(dg).to_mesh()
    n = sum(len(p.vertices) - 2 for p in me.polygons)
    ob.evaluated_get(dg).to_mesh_clear()
    return n


def check_normals(ob, samples=600):
    """Rays from a sphere around the bbox centre, aimed at jittered points inside it: the first
    face hit must face the ray.  0 bad = no inverted windings visible from outside."""
    bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    c = sum(bb, Vector()) / 8; R = max((p - c).length for p in bb) * 2 + 0.5
    me = ob.data; bm = bmesh.new(); bm.from_mesh(me); bm.normal_update(); tree = BVHTree.FromBMesh(bm)
    bad = hit = 0
    for i in range(samples):
        t = (i + 0.5) / samples; phi = math.acos(1 - 2 * t); th = math.pi * (1 + 5 ** 0.5) * i
        d = Vector((math.sin(phi) * math.cos(th), math.sin(phi) * math.sin(th), math.cos(phi)))
        tgt = c + Vector(((i * 0.37) % 1 - 0.5, (i * 0.61) % 1 - 0.5, (i * 0.13) % 1 - 0.5)) * (R / 3)
        o = c + d * R; dirn = (tgt - o).normalized()
        loc, nrm, idx, dist = tree.ray_cast(o, dirn)
        if loc is None:
            continue
        hit += 1
        if nrm.dot(dirn) > 0:
            bad += 1
    bm.free()
    print(f"  normals {ob.name}: {hit} rays hit, {bad} inverted ({'OK' if bad == 0 else 'INVERTED FACES'})")
    return bad


def export_glb(objs, path):
    for o in bpy.context.scene.objects:
        o.select_set(o in objs)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True,
        export_draco_mesh_compression_enable=False, export_yup=True, export_apply=True,
        export_materials="EXPORT", export_texcoords=False, export_normals=True,
        export_cameras=False, export_lights=False)


def mount_print(label, p):
    """A point in ranger.py's Blender frame and the same point in ranger.glb's frame."""
    x, y, z = p
    print(f"  mount {label}: blender ({x:+.3f}, {y:+.3f}, {z:+.3f})  ->  glTF ({x:+.3f}, {z:+.3f}, {-y:+.3f})")


# ---------------------------------------------------------------------------- review renders
def _engine(sc):
    for e in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "BLENDER_WORKBENCH"):
        try:
            sc.render.engine = e; return e
        except TypeError:
            continue


def render_views(objs, out_prefix, views, res=(960, 640), truck=False, lens=50):
    """views: {name: (direction from target to camera, extra zoom)}.  Frames the union bbox of objs
    (or of the truck when truck=True)."""
    sc = bpy.context.scene
    _engine(sc)
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = False
    sc.view_settings.view_transform = "Standard"
    for k in [k for k in dir(sc.render) if k.startswith("use_stamp")]:
        try:
            setattr(sc.render, k, False)
        except Exception:
            pass
    if sc.world is None:
        w = bpy.data.worlds.new("W"); sc.world = w; w.use_nodes = True
        bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
        bg.inputs[0].default_value = (0.62, 0.66, 0.70, 1); bg.inputs[1].default_value = 0.9
        sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
        sun.data.energy = 3.2; sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(150))
        sc.collection.objects.link(sun)
    ground = None
    pts = []
    for o in objs:
        pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    if truck:
        bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0)); ground = bpy.context.active_object
        ground.data.materials.append(material("ReviewGround", (0.30, 0.29, 0.26), 0.95))
    c = (mn + mx) / 2; R = (mx - mn).length / 2
    cam = sc.camera or bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    if cam.name not in sc.collection.objects:
        sc.collection.objects.link(cam)
    cam.data.lens = lens; sc.camera = cam
    fov = cam.data.angle
    out = []
    for name, spec in views.items():
        d, zoom = spec[0], spec[1]
        tc = Vector(spec[2]) if len(spec) > 2 else c         # optional explicit target point
        d = Vector(d).normalized()
        dist = R / math.sin(fov / 2) * 0.80 / zoom
        cam.location = tc + d * dist
        cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
        sc.render.filepath = f"{out_prefix}-{name}.png"
        bpy.ops.render.render(write_still=True, scene=sc.name)
        out.append(sc.render.filepath)
    return out


def import_ranger():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=RANGER_GLB)
    return [o for o in bpy.data.objects if o not in before]


PART_VIEWS = {
    "front": ((0.0, 1.0, 0.12), 1.0),
    "side": ((1.0, 0.0, 0.10), 1.0),
    "threeq": ((0.75, 0.80, 0.55), 1.0),
}
