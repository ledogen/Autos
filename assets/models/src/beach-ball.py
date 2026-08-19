"""
ASSET-03 — segmented beach ball, parametric generator.

Built for: Blender 5.x  |  Target: assets/models/beach-ball.glb
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

NO TEXTURE — the ticket's 256x256 albedo is dropped in favour of the per-panel
material slots the ticket itself offers as the alternative.  ART-STYLE rule 1
supersedes a ticket's texture spec (steel-drum/tent/winnebago precedent), and a
beach ball is the ideal case for it: the panels ARE the artwork, they are large
flat areas of pure colour, and a gore boundary is a mesh edge either way.  Four
slots, four draw calls, zero texture memory, free runtime recolour.

UV SPHERE, NOT AN ICOSPHERE.  The ticket says "low-subdiv icosphere"; an
icosphere cannot carry vertical gores, because its faces do not align to
meridians and every panel boundary would zig-zag.  A lat/long sphere puts an
edge loop exactly on each seam.  SEG is a multiple of GORES for that reason.

ORIGIN IS THE SPHERE CENTRE, not base-seated.  This DELIBERATELY breaks the
ASSETS.md default because the ball is meant to be simulated (FEAT-36) and a
rigid body spins about its origin.  Anything placing it must offset by RADIUS
or it will sink half-way into the ground — flagged in the registry entry.

AXIS.  Rotationally symmetric, so there is no forward convention.  The valve is
the only feature that breaks symmetry and it is deliberately off-axis.
"""

import bpy
import bmesh
import math

# ---------------------------------------------------------------------------
# PARAMETERS
# ---------------------------------------------------------------------------

TRI_BUDGET = 320
OUT_GLB = "/Users/ledogen/CodeShit/CarGame/assets/models/beach-ball.glb"
OUT_BLEND = "/Users/ledogen/CodeShit/CarGame/assets/models/src/beach-ball.blend"

RADIUS = 0.20                # 0.40 m diameter, per the ticket
SEG = 18                     # meridians — MUST be a multiple of GORES
STACKS = 8                   # latitude bands; tris = 2 * SEG * (STACKS - 1).
                             # EVEN, so one ring lands exactly on the equator at
                             # full RADIUS and the widest cross-section is a true
                             # 0.400 m.  9 would give a squarer 20 deg facet but
                             # no equator ring, shrinking the ball to 0.394 —
                             # worse, because the sphere COLLIDER is r 0.20 and a
                             # visual inside its collider never interpenetrates.
                             # 2.5 deg of extra latitude step is invisible; a
                             # visual/collider mismatch on a ball you punt is not.
GORES = 6

# Two white gores, on OPPOSITE sides, and four colours.  Strict white/colour
# alternation is the textbook beach ball but it is half white, and since a gore
# is 60 deg you only ever see about three at once — face-on that put one big
# blank panel across the middle of the ball.  This order shows 1 white + 2
# colours from every viewpoint, and no two whites are ever adjacent.
# ORDER MATTERS: the two colour pairs that end up touching are red|green and
# blue|yellow, both near-complementary.  A yellow|green pairing (the first
# arrangement) sat two hue neighbours of similar value side by side and the seam
# between them vanished at any distance.
# The polar fans are forced white on top of this (see POLE_CAPS) so the six
# gores do not converge into a pinwheel — a real ball has a patch over that seam.
GORE_MATS = ["BallWhite", "BallRed", "BallGreen", "BallWhite", "BallBlue", "BallYellow"]
POLE_CAPS = True

# The air valve — the detail that says "inflatable" rather than "sphere".
# Sits mid-latitude on the centre of a white gore, where a real one is moulded.
VALVE = True
VALVE_LAT = math.radians(50.0)      # from the north pole
VALVE_GORE = 0                      # white
VALVE_R = 0.013
VALVE_SEG = 5
VALVE_IN = 0.180                    # inner end, buried in the shell
VALVE_OUT = 0.202                   # outer end.  MUST stay near RADIUS: the
                                    # collider is a r=0.20 SPHERE, so anything
                                    # sticking out further clips the ground at
                                    # the rest orientation that puts the valve
                                    # underneath.  The first cut used 0.212 and
                                    # overshot by 12.3 mm; 0.202 with R 0.013
                                    # overshoots by 2.4 mm and still stands ~5 mm
                                    # proud of the neighbouring facet centres
                                    # (which sit at RADIUS*cos(10 deg) = 0.197).
                                    # Check with hypot(VALVE_OUT, VALVE_R), NOT
                                    # with the axis-aligned bounding box — the
                                    # valve is off-axis and the bbox hides it.

MATS = {
    #  name          base colour (linear)              rough
    # Glossy vinyl: roughness 0.30, the lowest in the project's asset set, and
    # the one place it is justified — a beach ball is the shiniest thing a camp
    # site owns.  Metalness stays 0 like everything else.
    "BallWhite":  ((0.820, 0.820, 0.810, 1.0), 0.30),
    "BallRed":    ((0.787, 0.015, 0.017, 1.0), 0.30),
    "BallBlue":   ((0.005, 0.100, 0.570, 1.0), 0.30),
    "BallYellow": ((0.955, 0.638, 0.007, 1.0), 0.30),
    "BallGreen":  ((0.010, 0.342, 0.047, 1.0), 0.30),
}

assert SEG % GORES == 0, "SEG must divide into whole gores or seams zig-zag"
assert len(GORE_MATS) == GORES

# ---------------------------------------------------------------------------
# Geometry accumulator (same machinery as flamingo.py / steel-drum.py)
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


def gore_mat(k):
    """Material for the strip between meridian k and k+1."""
    return GORE_MATS[(k * GORES // SEG) % GORES]


def build_ball():
    p = Part("BeachBall")
    # rings j = 1 .. STACKS-1 (the poles are single verts)
    ring0 = len(p.v)
    for j in range(1, STACKS):
        phi = math.pi * j / STACKS
        z, rr = math.cos(phi) * RADIUS, math.sin(phi) * RADIUS
        for k in range(SEG):
            a = 2 * math.pi * k / SEG
            p.v.append((math.cos(a) * rr, math.sin(a) * rr, z))
    north = len(p.v); p.v.append((0.0, 0.0, RADIUS))
    south = len(p.v); p.v.append((0.0, 0.0, -RADIUS))

    def ring(j):
        return ring0 + (j - 1) * SEG

    for k in range(SEG):
        k2 = (k + 1) % SEG
        cap = "BallWhite" if POLE_CAPS else gore_mat(k)
        p.add_face([north, ring(1) + k, ring(1) + k2], cap)
        p.add_face([south, ring(STACKS - 1) + k2, ring(STACKS - 1) + k], cap)
    for j in range(1, STACKS - 1):
        a0, a1 = ring(j), ring(j + 1)
        for k in range(SEG):
            k2 = (k + 1) % SEG
            p.add_face([a0 + k, a0 + k2, a1 + k2, a1 + k], gore_mat(k))

    if VALVE:
        add_valve(p)
    return p


def add_valve(p):
    """A short stem on the surface normal.  Closed at BOTH ends: the buried cap
    costs 3 tris and keeps the island a closed shell, which is what the
    signed-volume orientation pass needs to tell inside from outside."""
    theta = 2 * math.pi * ((VALVE_GORE + 0.5) / GORES)   # centre of that gore
    d = (math.sin(VALVE_LAT) * math.cos(theta),
         math.sin(VALVE_LAT) * math.sin(theta),
         math.cos(VALVE_LAT))
    # Any two vectors perpendicular to d.
    up = (0.0, 0.0, 1.0) if abs(d[2]) < 0.9 else (1.0, 0.0, 0.0)
    e1 = (d[1] * up[2] - d[2] * up[1], d[2] * up[0] - d[0] * up[2],
          d[0] * up[1] - d[1] * up[0])
    n = math.sqrt(sum(c * c for c in e1)); e1 = tuple(c / n for c in e1)
    e2 = (d[1] * e1[2] - d[2] * e1[1], d[2] * e1[0] - d[0] * e1[2],
          d[0] * e1[1] - d[1] * e1[0])
    base = len(p.v)
    for rad in (VALVE_IN, VALVE_OUT):
        for k in range(VALVE_SEG):
            a = 2 * math.pi * k / VALVE_SEG
            c, s = math.cos(a) * VALVE_R, math.sin(a) * VALVE_R
            p.v.append(tuple(d[i] * rad + e1[i] * c + e2[i] * s for i in range(3)))
    for k in range(VALVE_SEG):
        k2 = (k + 1) % VALVE_SEG
        p.add_face([base + k, base + k2, base + VALVE_SEG + k2,
                    base + VALVE_SEG + k], "BallWhite")
    p.add_face([base + VALVE_SEG + k for k in range(VALVE_SEG)], "BallWhite")
    p.add_face([base + k for k in range(VALVE_SEG - 1, -1, -1)], "BallWhite")


# ---------------------------------------------------------------------------
# Bake / verify / export  (lifted from flamingo.py — same pipeline)
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


def _report(part, ob):
    t = evaluated_tris(ob)
    ext = [(min(c[i] for c in part.v), max(c[i] for c in part.v)) for i in range(3)]
    ctr = [(lo + hi) * 0.5 for lo, hi in ext]
    print(f"  beach-ball     {t:4d} tris (budget {TRI_BUDGET})  "
          f"{ext[0][1]-ext[0][0]:.3f} x {ext[1][1]-ext[1][0]:.3f} x "
          f"{ext[2][1]-ext[2][0]:.3f} m")
    print(f"  centre offset  ({ctr[0]:+.4f}, {ctr[1]:+.4f}, {ctr[2]:+.4f}) — "
          f"ORIGIN IS THE CENTRE, not base-seated")
    return t


def build():
    _fresh_scene()
    print("=" * 66)
    part = build_ball()
    ob = bake(part)
    _report(part, ob)
    print(f"  materials {len(bpy.data.materials)}   images {len(bpy.data.images)}")
    print("=" * 66)


def check_normals(ob, samples=300):
    import mathutils
    bad = tested = 0
    c = mathutils.Vector((0.0, 0.0, 0.0))
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
    _fresh_scene()
    part = build_ball()
    ob = bake(part)
    ov = _ui_override()
    with bpy.context.temp_override(**ov):
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    print("=" * 66)
    _report(part, ob)
    bad = check_normals(ob)
    with bpy.context.temp_override(**ov):
        bpy.ops.export_scene.gltf(
            filepath=OUT_GLB,
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
    print(f"  wrote {OUT_GLB}")
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    print(f"  wrote {OUT_BLEND}")
    return bad
