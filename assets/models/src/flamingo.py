"""
ASSET-01 — pink plastic lawn flamingo, two poses, parametric generator.

Built for: Blender 5.x  |  Targets: assets/models/flamingo-a.glb (head up),
assets/models/flamingo-b.glb (head down).
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

NO TEXTURE.  Four flat Principled materials; FlamingoBody is the recolour hook
(a flock of one colour is dull — the ticket's "absurd flock" wants variance).

TWO .GLB, ONE TICKET.  The ticket names a single flamingo.glb; the owner asked
for the reference photo's pair, so the -a/-b suffix follows trailer-home-a.
Poses are DIFFERENT MESHES, not a rotated head: the neck spine table is the
only thing that differs, and it is the whole silhouette.

BUILT 2026-08-18 against Blender 5.2.0 LTS.  Final: flamingo-a 358 tris,
flamingo-b 344 tris (budget 400 each), 4 materials, 0 images, 0 UV layers.
flamingo-a  0.160 W x 0.868 H x 0.494 L m   flamingo-b  0.160 x 0.587 x 0.725.
Both base-seated at exactly y = 0 in the GLB, forward = -Z, no Draco.
Rebuild:  exec(open(__file__).read()); export()

AXIS TRAP.  The glTF exporter's "+Y up" maps blender (x,y,z) -> gltf (x, z, -y),
so blender +Y becomes gltf -Z.  ASSETS.md wants forward = -Z, therefore
*** the bird faces +Y in Blender. ***  Base-seated: leg tips at z = 0.

BODY+NECK+HEAD ARE ONE TUBE.  A single swept spine from tail tip to beak root
with a per-station elliptical cross-section.  Capping the chest and starting a
second tube there would cost a hidden cap, a hidden ring and a visible seam;
one continuous surface costs neither and the neck-to-body blend is free.

SEG = 7, PHASE = pi/2.  Odd segment count with the first vertex on the up axis:
the set of angles is closed under mirroring about the vertical, so the bird is
exactly left-right symmetric, there is a vertex on the spine ridge and a flat
facet on the belly.  Even counts put an edge on the ridge and read boxy.
"""

import bpy
import bmesh
import math
import mathutils

# ---------------------------------------------------------------------------
# PARAMETERS
# ---------------------------------------------------------------------------

TRI_BUDGETS = {"flamingo-a": 400, "flamingo-b": 400}
OUT_DIR = "/Users/ledogen/CodeShit/CarGame/assets/models"
OUT_BLEND = "/Users/ledogen/CodeShit/CarGame/assets/models/src/flamingo.blend"

SEG = 7                      # body/neck/head cross-section
PHASE = math.pi / 2          # first ring vertex on the up axis (see header)
BEAK_SEG = 5
LEG_SEG = 4

# --- body: shared by both poses, tail tip -> chest.  (y, z, halfwidth, halfheight)
# y is forward (+Y = the bird's nose), z is up.  Belly bottom lands at 0.432,
# which is the leg length.
BODY = [
    (-0.212, 0.556, 0.005, 0.005),   # tail tip — a tiny ring, not a point: a
    (-0.178, 0.508, 0.026, 0.034),   #   degenerate ring welds into a fan and
    (-0.132, 0.472, 0.054, 0.070),   #   loses the blunt moulded-plastic tip
    (-0.075, 0.456, 0.070, 0.088),   # TAIL TAPER STAYS LATE.  Spreading it over
    (-0.015, 0.452, 0.082, 0.092),   #   half the body turned the bird into a
    ( 0.045, 0.456, 0.074, 0.082),   #   banana boat: a lawn flamingo is a fat
    ( 0.105, 0.466, 0.054, 0.058),   #   oval with a SHORT blunt upswept stub.
    ( 0.150, 0.477, 0.034, 0.038),   # chest — the neck tables continue from here
]

# The folded wing.  Free detail: push the two shoulder vertices out on the
# middle body stations and flat shading turns the crease into a light/dark band
# for 0 extra tris (ART-STYLE rule 2).
# At SEG 7 / PHASE pi/2 the ring angles are 90 + 51.43k degrees, so k 1 and 6
# sit at 141/39 deg — the UPPER flank, which is where a folded wing lies.  The
# first pass used k 2 and 5 (193/347 deg); those are BELOW the mid-line and the
# crease vanished into the belly shading.
WING_STATIONS = (3, 4, 5, 6)
WING_VERTS = (1, 6)
WING_BULGE = 0.22            # fraction of the local half-width

# --- pose A: head up.  Neck leans BACK off the chest, arcs over, head comes
# forward again — the reference's tall bird.  Peak of the head ~0.856 m.
NECK_A = [
    (0.180, 0.518, 0.028, 0.030),
    (0.190, 0.566, 0.023, 0.024),
    (0.190, 0.616, 0.021, 0.022),
    (0.180, 0.664, 0.020, 0.021),
    (0.160, 0.710, 0.019, 0.020),
    (0.132, 0.752, 0.019, 0.020),
    (0.106, 0.784, 0.019, 0.020),
    (0.096, 0.808, 0.020, 0.021),    # back of the arc
    (0.114, 0.824, 0.028, 0.030),
    (0.146, 0.830, 0.036, 0.038),    # head, widest (index 9 — see EYE_STATION)
    (0.178, 0.818, 0.034, 0.036),
    (0.198, 0.798, 0.022, 0.026),
    (0.208, 0.786, 0.015, 0.018),    # beak root
]
BEAK_A = [
    (0.208, 0.788, 0.016, 0.020),    # CHUNKY.  A lawn flamingo's bill is nearly
    (0.242, 0.766, 0.013, 0.017),    #   head-thick at the root; a slim taper
    (0.268, 0.734, 0.008, 0.011),    #   reads as a pencil, not a caricature.
    (0.276, 0.706, 0.002, 0.002),    # tip
]

# --- pose B: head down.  Same chest, neck swings forward and sweeps down to
# graze.  Head lands level with the belly, not on the floor.
#
# THE DESCENT MUST STILL BE HEADING DOWN-FORWARD AT THE BEAK ROOT.  The first
# version curled the last three stations BACK (y 0.428 -> 0.362) so the skull
# tapered rearward while the bill shot forward: a 112-degree kink that bolted
# the bill onto the underside of the head with a visible shelf.  Pose A's joint
# is +17 degrees and reads clean, so keep this one in that neighbourhood --
# check it with the KINK arithmetic before believing a screenshot.
NECK_B = [
    (0.190, 0.508, 0.028, 0.030),
    (0.228, 0.546, 0.023, 0.024),
    (0.268, 0.566, 0.020, 0.021),    # crest — CLEARS the back (0.545), or the
    (0.310, 0.564, 0.019, 0.020),    #   whole pose reads limp rather than grazing
    (0.348, 0.546, 0.019, 0.020),
    (0.378, 0.516, 0.019, 0.020),
    (0.398, 0.478, 0.019, 0.020),
    (0.412, 0.438, 0.020, 0.021),
    (0.424, 0.402, 0.025, 0.027),
    (0.436, 0.372, 0.034, 0.036),    # head, widest (index 9 — see EYE_STATION).
                                     # WIDER than pose A's 0.030: the neck runs
                                     # dead straight through the skull here, so
                                     # without extra bulge there is no bend to
                                     # read the head against and it goes snake.
    (0.448, 0.346, 0.026, 0.029),
    (0.456, 0.328, 0.016, 0.019),    # beak root
]
BEAK_B = [
    (0.456, 0.330, 0.016, 0.020),
    (0.480, 0.302, 0.013, 0.017),
    (0.500, 0.270, 0.008, 0.011),
    (0.508, 0.246, 0.002, 0.002),    # tip — clear of the grass, just
]

BEAK_DARK_FROM = 2           # beak spans >= this index are the black tip

# --- eyes: a black tetrahedron per side, spiked out of the head.  Both neck
# tables deliberately put the head's widest station at neck index 9, so spine
# index 8 + 9 = 17 is the eye line in either pose.
EYE_STATION = 17
EYE_DIR = (0.94, 0.22, 0.38)     # (sideways, up, forward) in the ring's frame.
                                 # up 0.35 parked them on the crown — from below
                                 # they read as ears, not eyes.
EYE_BASE_R = 0.013
EYE_SINK = 0.72                  # base triangle sits this far out along the radius
EYE_SPIKE = 0.011                # apex clears the head surface by this

# --- legs: bare steel wire, straight, splayed.  4-sided tubes per the ticket
# ("legs are the tri sink"), no ground spike below z = 0.
LEG_R = 0.0055
LEG_TOP = (0.038, -0.020, 0.375)      # (x, y, z) — z sits inside the belly
LEG_BOT = (0.050, -0.032, 0.000)

MATS = {
    #  name             base colour (linear)              rough  
    # Hot coral, pushed past the reference photo's salmon: it has to read at
    # 40 m against #4f8a3a bush and #3b6840 pine (ART-STYLE palette).
    "FlamingoBody": ((0.848, 0.119, 0.147, 1.0), 0.55),
    "FlamingoBeak": ((0.955, 0.523, 0.010, 1.0), 0.50),
    "FlamingoDark": ((0.015, 0.015, 0.018, 1.0), 0.35),
    "FlamingoLeg":  ((0.220, 0.220, 0.232, 1.0), 0.35),
}

# ---------------------------------------------------------------------------
# Geometry accumulator (same machinery as steel-drum.py)
# ---------------------------------------------------------------------------
class Part:
    def __init__(self, name):
        self.name = name
        self.v = []
        self.f = []
        self.m = []

    def add_face(self, idx, mat):
        self.f.append(list(idx))
        self.m.append(mat)


def _frame(t):
    """Ring frame for a spine tangent lying in the x = 0 plane.

    right is always +X (the spine never leaves the y-z plane, so it can never
    go parallel to it and the frame never degenerates).  up = right x t, which
    rotates continuously with the tangent — a fixed world-up would flip the
    ring inside out where the neck goes vertical.
    """
    ty, tz = t
    n = math.hypot(ty, tz) or 1.0
    ty, tz = ty / n, tz / n
    return (1.0, 0.0, 0.0), (0.0, -tz, ty)


def tube(p, stations, seg, phase, mat, span_mat=None,
         cap_first=True, cap_last=True, ridge=None, x0=0.0):
    """Swept tube along a (y, z, halfwidth, halfheight) spine.

    stations may be prefixed with an x offset (x0) for the legs, which are the
    only parts off the centre plane.
    """
    n = len(stations)
    base = len(p.v)
    for i, (y, z, w, h) in enumerate(stations):
        pv = stations[max(i - 1, 0)]
        nx = stations[min(i + 1, n - 1)]
        t = (nx[0] - pv[0], nx[1] - pv[1])
        if t == (0.0, 0.0):
            t = (0.0, 1.0)
        right, up = _frame(t)
        for k in range(seg):
            a = phase + 2 * math.pi * k / seg
            g = 1.0 + (ridge(i, k) if ridge else 0.0)
            cw, sh = math.cos(a) * w * g, math.sin(a) * h * g
            p.v.append((x0 + right[0] * cw + up[0] * sh,
                        y + right[1] * cw + up[1] * sh,
                        z + right[2] * cw + up[2] * sh))
    for s in range(n - 1):
        a0, a1 = base + s * seg, base + (s + 1) * seg
        m = (span_mat(s) if span_mat else None) or mat
        for k in range(seg):
            k2 = (k + 1) % seg
            p.add_face([a0 + k, a0 + k2, a1 + k2, a1 + k], m)
    if cap_first:
        p.add_face([base + k for k in range(seg - 1, -1, -1)],
                   (span_mat(0) if span_mat else None) or mat)
    if cap_last:
        o = base + (n - 1) * seg
        p.add_face([o + k for k in range(seg)],
                   (span_mat(n - 2) if span_mat else None) or mat)
    return base


def add_eyes(p, spine, station):
    """Two black tets, one per flank, spiked out of the head surface."""
    y, z, w, h = spine[station]
    pv, nx = spine[station - 1], spine[station + 1]
    right, up = _frame((nx[0] - pv[0], nx[1] - pv[1]))
    fwd = mathutils.Vector((0.0, nx[0] - pv[0], nx[1] - pv[1])).normalized()
    R, U = mathutils.Vector(right), mathutils.Vector(up)
    c = mathutils.Vector((0.0, y, z))
    r = max(w, h)
    for side in (1.0, -1.0):
        d = (R * (EYE_DIR[0] * side) + U * EYE_DIR[1] + fwd * EYE_DIR[2]).normalized()
        # A stable basis in the plane perpendicular to d.
        e1 = d.cross(mathutils.Vector((0.0, 0.0, 1.0)))
        if e1.length < 1e-4:
            e1 = d.cross(mathutils.Vector((0.0, 1.0, 0.0)))
        e1.normalize()
        e2 = d.cross(e1).normalized()
        base = len(p.v)
        origin = c + d * (r * EYE_SINK)
        for k in range(3):
            a = 2 * math.pi * k / 3
            v = origin + e1 * (math.cos(a) * EYE_BASE_R) + e2 * (math.sin(a) * EYE_BASE_R)
            p.v.append((v.x, v.y, v.z))
        apex = c + d * (r + EYE_SPIKE)
        p.v.append((apex.x, apex.y, apex.z))
        for k in range(3):
            p.add_face([base + k, base + (k + 1) % 3, base + 3], "FlamingoDark")
        p.add_face([base + 2, base + 1, base + 0], "FlamingoDark")


def add_legs(p):
    for side in (1.0, -1.0):
        tx, ty, tz = LEG_TOP
        bx, by, bz = LEG_BOT
        base = len(p.v)
        for (cx, cy, cz) in ((bx * side, by, bz), (tx * side, ty, tz)):
            for k in range(LEG_SEG):
                a = math.pi / 4 + 2 * math.pi * k / LEG_SEG
                p.v.append((cx + math.cos(a) * LEG_R, cy + math.sin(a) * LEG_R, cz))
        for k in range(LEG_SEG):
            k2 = (k + 1) % LEG_SEG
            p.add_face([base + k, base + k2, base + LEG_SEG + k2,
                        base + LEG_SEG + k], "FlamingoLeg")
        p.add_face([base + LEG_SEG + k for k in range(LEG_SEG)], "FlamingoLeg")
        p.add_face([base + k for k in range(LEG_SEG - 1, -1, -1)], "FlamingoLeg")


def _wing(i, k):
    return WING_BULGE if (i in WING_STATIONS and k in WING_VERTS) else 0.0


def build_pose(name, neck, beak):
    p = Part(name)
    spine = BODY + neck
    tube(p, spine, SEG, PHASE, "FlamingoBody", ridge=_wing)
    tube(p, beak, BEAK_SEG, 0.0, "FlamingoBeak",
         span_mat=lambda s: "FlamingoDark" if s >= BEAK_DARK_FROM else None)
    add_eyes(p, spine, EYE_STATION)
    add_legs(p)
    return p


def build_a():
    return build_pose("FlamingoUp", NECK_A, BEAK_A)


def build_b():
    return build_pose("FlamingoDown", NECK_B, BEAK_B)


VARIANTS = [("flamingo-a", build_a), ("flamingo-b", build_b)]

# ---------------------------------------------------------------------------
# Bake / verify / export  (lifted from steel-drum.py — same pipeline)
# ---------------------------------------------------------------------------
def get_material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    col, rough = MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = col
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = 0.0
    m.diffuse_color = col
    m.roughness = rough
    m.use_backface_culling = True
    return m


def _orient_islands(bm):
    bm.faces.ensure_lookup_table()
    todo = {f.index for f in bm.faces}
    flipped = 0
    while todo:
        start = bm.faces[next(iter(todo))]
        island, stack, seen = [], [start], {start.index}
        while stack:
            f = stack.pop()
            island.append(f)
            for e in f.edges:
                for nf in e.link_faces:
                    if nf.index not in seen:
                        seen.add(nf.index)
                        stack.append(nf)
        todo -= seen
        vol = 0.0
        for f in island:
            vs = [v.co for v in f.verts]
            for i in range(1, len(vs) - 1):
                vol += vs[0].dot(vs[i].cross(vs[i + 1]))
        if abs(vol) < 1e-9:
            continue
        if vol < 0.0:
            bmesh.ops.reverse_faces(bm, faces=island)
            flipped += 1
    return flipped


def bake(part):
    me = bpy.data.meshes.new(part.name)
    me.from_pydata(part.v, [], part.f)
    me.update()
    used = []
    for m in part.m:
        if m not in used:
            used.append(m)
    idx = {n: i for i, n in enumerate(used)}
    for n in used:
        me.materials.append(get_material(n))
    for i, poly in enumerate(me.polygons):
        poly.material_index = idx[part.m[i]]
        poly.use_smooth = False

    ob = bpy.data.objects.new(part.name, me)
    bpy.context.collection.objects.link(ob)

    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    flipped = _orient_islands(bm)
    if flipped:
        print(f"  (re-oriented {flipped} inside-out island(s) after recalc)")
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = False
    return ob


def evaluated_tris(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    m = ev.to_mesh()
    m.calc_loop_triangles()
    n = len(m.loop_triangles)
    ev.to_mesh_clear()
    return n


def _fresh_scene():
    bpy.ops.wm.read_homefile(use_empty=True)
    for d in (bpy.data.objects, bpy.data.meshes, bpy.data.materials):
        for x in list(d):
            d.remove(x)


def _report(name, part, ob):
    t = evaluated_tris(ob)
    ext = [(min(c[i] for c in part.v), max(c[i] for c in part.v))
           for i in range(3)]
    print(f"  {name:12s} {t:4d} tris (budget {TRI_BUDGETS[name]})  "
          f"W {ext[0][1]-ext[0][0]:.3f} x L {ext[1][1]-ext[1][0]:.3f} "
          f"x H {ext[2][1]:.3f} m, base z {ext[2][0]:.4f}")
    return t


def build(offset=True):
    """Both poses side by side (the .blend source view)."""
    _fresh_scene()
    print("=" * 66)
    for i, (name, builder) in enumerate(VARIANTS):
        part = builder()
        if offset:
            part.v = [(x + i * 0.55, y, z) for (x, y, z) in part.v]
        ob = bake(part)
        _report(name, part, ob)
    print(f"  materials {len(bpy.data.materials)}   images {len(bpy.data.images)}")
    print("=" * 66)


def check_normals(ob, samples=300):
    bad = tested = 0
    c = mathutils.Vector((0.0, -0.01, 0.516))     # inside the body
    for i in range(samples):
        t = (i + 0.5) / samples
        phi = math.acos(1 - 2 * t)
        theta = math.pi * (1 + 5 ** 0.5) * i
        d = mathutils.Vector((math.sin(phi) * math.cos(theta),
                              math.sin(phi) * math.sin(theta),
                              math.cos(phi)))
        hit, loc, nrm, idx = ob.ray_cast(c + d * 5.0, -d)
        if not hit:
            continue
        tested += 1
        if nrm.dot(-d) >= 0.0:
            bad += 1
    print(f"  normals: {tested} rays hit, {bad} pointing away  "
          f"({'OK' if bad == 0 else 'INVERTED FACES'})")
    return bad


def _ui_override():
    win = bpy.context.window_manager.windows[0]
    scr = win.screen
    area = next(a for a in scr.areas if a.type == "VIEW_3D")
    region = next(r for r in area.regions if r.type == "WINDOW")
    return dict(window=win, screen=scr, area=area, region=region,
                scene=bpy.context.scene, view_layer=bpy.context.view_layer)


def export():
    """One .glb per pose (each built alone in a fresh scene), then the
    side-by-side scene saved as the .blend source."""
    total_bad = 0
    for name, builder in VARIANTS:
        _fresh_scene()
        part = builder()
        ob = bake(part)
        ov = _ui_override()
        with bpy.context.temp_override(**ov):
            ob.select_set(True)
            bpy.context.view_layer.objects.active = ob
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        print("=" * 66)
        _report(name, part, ob)
        total_bad += check_normals(ob)
        with bpy.context.temp_override(**ov):
            bpy.ops.export_scene.gltf(
                filepath=f"{OUT_DIR}/{name}.glb",
                export_format="GLB",
                export_draco_mesh_compression_enable=False,
                export_yup=True,
                export_apply=True,
                export_materials="EXPORT",
                export_texcoords=False,
                export_normals=True,
                export_cameras=False,
                export_lights=False,
                use_selection=False,
            )
        print(f"  wrote {OUT_DIR}/{name}.glb")
    build(offset=True)
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    print(f"  wrote {OUT_BLEND}")
    return total_bad
