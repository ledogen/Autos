"""
ASSET-30 — 55-gallon steel drum, closed-head variant, parametric generator.

Built for: Blender 5.x  |  Target: assets/models/drum-closed.glb
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

NO TEXTURE (ART-STYLE supersedes the ticket's 1024 atlas — ASSET-23/09/29
precedent).  The ticket's "rust in the atlas" variety plan becomes RUNTIME
RECOLOUR instead, which is what was asked for: `DrumPaint` is the hook — one
`material.color.set()` per placement (red-oxide default, olive, black, faded
blue...).  `DrumSteel` (bungs) stays fixed.

DELIBERATELY NOT the plastic barrel (ASSET-29, see its ticket note): straight
walls with NO belly, thin rolled chimes instead of tall moulded ones, sharp
pressed hoops at the third-lines, and a 2-inch + 3/4-inch bung pair instead of
twin caps.  Siblings, not variants.

Open and crushed variants (same ticket) are NOT built yet — this is the
closed default only.

AXIS.  Lathe about +Z, base-seated at z=0.  Bung pair on the Blender X axis
(reads from the glTF -Z front).
"""

import bpy
import bmesh
import math

# ---------------------------------------------------------------------------
# PARAMETERS
# ---------------------------------------------------------------------------

NAME = "drum-closed"
TRI_BUDGET = 350
OUT_GLB = "/Users/ledogen/CodeShit/CarGame/assets/models/drum-closed.glb"
OUT_BLEND = "/Users/ledogen/CodeShit/CarGame/assets/models/src/steel-drum.blend"

SEG = 10

# Real steel drum: 0.58 dia x 0.85 tall.  Straight 0.282 body; chimes and the
# two pressed hoops all peak at 0.290 (the collision radius).
PROFILE = [
    (0.000, 0.272),                      # base edge (cap closes it)
    (0.008, 0.290),                      # bottom chime — a thin rolled lip
    (0.022, 0.290),
    (0.035, 0.282),                      # straight body
    (0.272, 0.282),
    (0.283, 0.290),                      # pressed hoop 1 (lower third)
    (0.294, 0.282),
    (0.556, 0.282),
    (0.567, 0.290),                      # pressed hoop 2 (upper third)
    (0.578, 0.282),
    (0.815, 0.282),
    (0.828, 0.290),                      # top chime
    (0.842, 0.290),
    (0.850, 0.270),                      # rim rolls in
    (0.836, 0.258),                      # recessed head (bungs sit below rim)
]
DECK_Z = 0.836

# Real closure: one 2-inch bung + one 3/4-inch vent, both low steel pucks.
BUNGS = [(0.160, 0.050), (-0.160, 0.030)]   # (x, radius)
BUNG_H, BUNG_SEG = 0.014, 5

MATS = {
    #  name         base colour (linear)          rough  alpha
    # Red-oxide default, judged rendered.  THE recolour hook.
    "DrumPaint": ((0.240, 0.055, 0.032, 1.0), 0.45, 1.0),
    "DrumSteel": ((0.130, 0.130, 0.135, 1.0), 0.40, 1.0),
}

# ---------------------------------------------------------------------------
# Geometry accumulator (same machinery as barrel-plastic.py)
# ---------------------------------------------------------------------------
class Part:
    def __init__(self, name):
        self.name = name
        self.v = []
        self.f = []
        self.m = []

    def add(self, verts, faces, mat):
        o = len(self.v)
        self.v.extend(verts)
        for fc in faces:
            self.f.append([i + o for i in fc])
            self.m.append(mat)


def lathe(p, profile, mat, seg, cap_first=True, cap_last=True):
    ang = [2 * math.pi * i / seg for i in range(seg)]
    base = len(p.v)
    for (z, r) in profile:
        p.v.extend((math.cos(a) * r, math.sin(a) * r, z) for a in ang)
    for s in range(len(profile) - 1):
        a0, a1 = base + s * seg, base + (s + 1) * seg
        for k in range(seg):
            k2 = (k + 1) % seg
            p.f.append([a0 + k, a0 + k2, a1 + k2, a1 + k])
            p.m.append(mat)
    if cap_first:
        p.f.append([base + k for k in range(seg - 1, -1, -1)])
        p.m.append(mat)
    if cap_last:
        o = base + (len(profile) - 1) * seg
        p.f.append([o + k for k in range(seg)])
        p.m.append(mat)


def build_drum(p):
    lathe(p, PROFILE, "DrumPaint", SEG)
    for bx, br in BUNGS:
        ang = [2 * math.pi * i / BUNG_SEG for i in range(BUNG_SEG)]
        base = len(p.v)
        for z in (DECK_Z, DECK_Z + BUNG_H):
            p.v.extend((bx + math.cos(a) * br, math.sin(a) * br, z) for a in ang)
        for k in range(BUNG_SEG):
            k2 = (k + 1) % BUNG_SEG
            p.f.append([base + k, base + k2, base + BUNG_SEG + k2,
                        base + BUNG_SEG + k])
            p.m.append("DrumSteel")
        p.f.append([base + BUNG_SEG + k for k in range(BUNG_SEG)])
        p.m.append("DrumSteel")
        p.f.append([base + k for k in range(BUNG_SEG - 1, -1, -1)])  # blind cap:
        p.m.append("DrumSteel")           # closed shell for signed-volume orient


# ---------------------------------------------------------------------------
# Bake / verify / export
# ---------------------------------------------------------------------------
def get_material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    col, rough, alpha = MATS[name]
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
        if abs(vol) < 1e-6:
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


def build():
    bpy.ops.wm.read_homefile(use_empty=True)
    for d in (bpy.data.objects, bpy.data.meshes, bpy.data.materials):
        for x in list(d):
            d.remove(x)

    drum = Part("DrumClosed")
    build_drum(drum)
    ob = bake(drum)

    t = evaluated_tris(ob)
    ext = [(min(c[i] for c in drum.v), max(c[i] for c in drum.v)) for i in range(3)]
    print("=" * 60)
    print(f"  DrumClosed      {t:5d} tris   (budget {TRI_BUDGET})")
    print(f"  materials       {len(bpy.data.materials)}   images {len(bpy.data.images)}")
    print(f"  D x H = {ext[0][1]-ext[0][0]:.3f} x {ext[2][1]:.3f} m "
          f"(ticket 0.58 x 0.85)")
    print(f"  base z = {ext[2][0]:.3f} (must be 0.000)")
    rmax = max(r for _, r in PROFILE)
    print(f"  max r = {rmax:.3f} vs collision 0.29  "
          f"{'OK' if rmax <= 0.2901 else 'OVER'}")
    print("=" * 60)
    return ob


def check_normals(ob, samples=200):
    import mathutils
    bad = tested = 0
    c = mathutils.Vector((0.0, 0.0, 0.42))
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
    ob = build()
    ov = _ui_override()
    with bpy.context.temp_override(**ov):
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

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


if __name__ == "__main__":
    build()
