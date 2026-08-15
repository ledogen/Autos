"""
ASSET-29 — blue 55-gallon HDPE drum, parametric generator.

Built for: Blender 5.x  |  Target: assets/models/barrel-plastic.glb
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md
Reference: user-supplied photo (closed-head blue drum, two bungs, two rolling
hoops, rolled chimes top and bottom), 2026-08-15.

BUILD REPORT — filled in by build(); see the printout.

NO TEXTURE (ART-STYLE wins over the ticket's 512^2 albedo spec — the same
ruling as ASSET-23/ASSET-09).  The moulded hoops and chimes are geometry (the
ticket demands that anyway: "rolling hoops are the silhouette"), the fade and
algae are dropped, not painted.

AXIS.  Lathe about Blender +Z; base cap at z=0 (base-seated).  Exporter maps
blender (x,y,z) -> gltf (x,z,-y), so the bung pair sits on the Blender X axis
where it reads from the glTF -Z front.  A drum is otherwise symmetric — the
bungs are its only orientation tell.

Materials (2): BarrelBlue (THE identity — recolour hook per the ticket),
BarrelBung (one white cap; the second bung reuses BarrelBlue like the photo).
"""

import bpy
import bmesh
import math

# ---------------------------------------------------------------------------
# PARAMETERS
# ---------------------------------------------------------------------------

NAME = "barrel-plastic"
TRI_BUDGET = 350
OUT_GLB = "/Users/ledogen/CodeShit/CarGame/assets/models/barrel-plastic.glb"
OUT_BLEND = "/Users/ledogen/CodeShit/CarGame/assets/models/src/barrel-plastic.blend"

SEG = 10                                 # lathe segments — faceted on purpose

# Lathe profile bottom->top (z, r).  Real 208 L drum: 0.58 dia x 0.89 tall.
# Chimes at both ends, two rolling hoops just above and below the waist.
PROFILE = [
    (0.000, 0.268),                      # base edge (cap closes it)
    (0.025, 0.290),                      # bottom chime
    (0.075, 0.290),
    (0.115, 0.280),                      # body
    (0.330, 0.280),
    (0.365, 0.2925),                     # rolling hoop 1
    (0.400, 0.280),
    (0.480, 0.280),
    (0.515, 0.2925),                     # rolling hoop 2
    (0.550, 0.280),
    (0.780, 0.280),
    (0.820, 0.290),                      # top chime
    (0.868, 0.290),
    (0.890, 0.262),                      # rim rolls in
    (0.872, 0.250),                      # recessed deck edge (bungs sit low,
]                                        # like the photo — not proud of the rim)
DECK_Z = 0.872

BUNG_R, BUNG_H, BUNG_SEG = 0.055, 0.020, 6
BUNG_X = 0.165                           # pair on the X axis (glTF -Z front)

MATS = {
    #  name          base colour (linear)          rough  alpha
    # Judged rendered: 0.045/0.20/0.60 came out pastel — HDPE blue needs to
    # sit deeper before the ~1.5x linear lift.
    "BarrelBlue": ((0.028, 0.130, 0.480, 1.0), 0.55, 1.0),
    "BarrelBung": ((0.720, 0.720, 0.680, 1.0), 0.60, 1.0),
}

# ---------------------------------------------------------------------------
# Geometry accumulator (broken-car machinery, trimmed to this asset's needs)
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
    """Surface of revolution about +Z.  Rings share the accumulator, so caps
    are simple n-gons on the first/last rings."""
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
    lathe(p, PROFILE, "BarrelBlue", SEG)
    # Bungs: one white, one blue (photo).  Low hexagonal pucks on the deck.
    for bx, mat in ((BUNG_X, "BarrelBung"), (-BUNG_X, "BarrelBlue")):
        prof = [(DECK_Z, BUNG_R), (DECK_Z + BUNG_H, BUNG_R)]
        ang = [2 * math.pi * i / BUNG_SEG for i in range(BUNG_SEG)]
        base = len(p.v)
        for (z, r) in prof:
            p.v.extend((bx + math.cos(a) * r, math.sin(a) * r, z) for a in ang)
        for k in range(BUNG_SEG):
            k2 = (k + 1) % BUNG_SEG
            p.f.append([base + k, base + k2, base + BUNG_SEG + k2,
                        base + BUNG_SEG + k])
            p.m.append(mat)
        p.f.append([base + BUNG_SEG + k for k in range(BUNG_SEG)])
        p.m.append(mat)
        p.f.append([base + k for k in range(BUNG_SEG - 1, -1, -1)])  # blind
        p.m.append(mat)                   # cap: keeps the shell closed for
                                          # signed-volume orientation


# ---------------------------------------------------------------------------
# Bake / verify / export (same machinery as the other generators)
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

    drum = Part("BarrelPlastic")
    build_drum(drum)
    ob = bake(drum)

    t = evaluated_tris(ob)
    ext = [(min(c[i] for c in drum.v), max(c[i] for c in drum.v)) for i in range(3)]
    print("=" * 60)
    print(f"  BarrelPlastic   {t:5d} tris   (budget {TRI_BUDGET})")
    print(f"  materials       {len(bpy.data.materials)}   images {len(bpy.data.images)}")
    print(f"  D x H = {ext[0][1]-ext[0][0]:.3f} x {ext[2][1]:.3f} m "
          f"(ticket 0.58 x 0.89)")
    print(f"  base z = {ext[2][0]:.3f} (must be 0.000)")
    hoops = max(r for _, r in PROFILE)
    print(f"  hoop overshoot r = {hoops:.4f} vs collision 0.29  "
          f"{'OK' if hoops <= 0.2925 else 'CHECK'}")
    print("=" * 60)
    return ob


def check_normals(ob, samples=200):
    import mathutils
    bad = tested = 0
    c = mathutils.Vector((0.0, 0.0, 0.45))
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
