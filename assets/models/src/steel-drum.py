"""
ASSET-30 — 55-gallon steel drum, all three variants, parametric generator.

Built for: Blender 5.x  |  Targets: assets/models/drum-closed.glb,
drum-open.glb, drum-crushed.glb (three .glb, one ticket — the sanctioned
lumber-yard-style kit exception).
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

NO TEXTURE (ART-STYLE supersedes the ticket's 1024 atlas — ASSET-23/09/29
precedent).  Variety is RUNTIME RECOLOUR of `DrumPaint` (red-oxide default);
`DrumSteel` (bungs, open interior) stays fixed.

Variants:
  closed  — the default: recessed head, 2" + 3/4" bung pair.
  open    — lid gone: rim rolls inward to a full interior wall and floor
            (bare DrumSteel).  No contents, per the ticket.
  crushed — the same lathe run through a DETERMINISTIC crumple (sin-based,
            no randomness — Date/random are banned in this pipeline anyway):
            axial crush to ~0.60 m, radial buckling that grows with height,
            a staved-in head, and a 7-degree cant reseated onto its actual
            contact points.  A distinct mesh, not a squashed transform.

AXIS.  Lathe about +Z, base-seated at z=0.  Bung pair on the Blender X axis
(reads from the glTF -Z front).
"""

import bpy
import bmesh
import math

# ---------------------------------------------------------------------------
# PARAMETERS
# ---------------------------------------------------------------------------

TRI_BUDGETS = {"drum-closed": 350, "drum-open": 450, "drum-crushed": 400}
OUT_DIR = "/Users/ledogen/CodeShit/CarGame/assets/models"
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

# Open variant: exterior up to the rolled rim, then straight down inside.
PROFILE_OPEN = PROFILE[:13] + [
    (0.850, 0.270),                      # rim rolls over
    (0.846, 0.254),                      # inner lip
    (0.070, 0.254),                      # interior wall, floor caps it
]
OPEN_STEEL_FROM = 14                     # spans from here down are bare steel

# Crushed variant: an extra mid-body ring so the crumple has geometry to
# bend.  Spliced BETWEEN the hoops (index 7) — an earlier [:5] splice put
# 0.430 before 0.283 and the folded-back band shipped as a ring of inverted
# faces.  z must stay monotonic through the body.
PROFILE_CRUSH = (PROFILE[:7] + [(0.430, 0.282)] + PROFILE[7:])
assert all(a[0] < b[0] for a, b in zip(PROFILE_CRUSH[:-2], PROFILE_CRUSH[1:-1])), \
    "PROFILE_CRUSH z not monotonic (rim tail excepted)"
CRUSH_H = 0.64                           # axial squash factor (0.85 -> ~0.58)
CRUSH_CANT = math.radians(7.0)

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


def lathe(p, profile, mat, seg, cap_first=True, cap_last=True,
          span_mat=None, cap_last_mat=None):
    """Surface of revolution about +Z.  span_mat(s) -> material overrides the
    default for span s (the open drum's interior goes bare steel)."""
    ang = [2 * math.pi * i / seg for i in range(seg)]
    base = len(p.v)
    for (z, r) in profile:
        p.v.extend((math.cos(a) * r, math.sin(a) * r, z) for a in ang)
    for s in range(len(profile) - 1):
        a0, a1 = base + s * seg, base + (s + 1) * seg
        m = (span_mat(s) if span_mat else None) or mat
        for k in range(seg):
            k2 = (k + 1) % seg
            p.f.append([a0 + k, a0 + k2, a1 + k2, a1 + k])
            p.m.append(m)
    if cap_first:
        p.f.append([base + k for k in range(seg - 1, -1, -1)])
        p.m.append(mat)
    if cap_last:
        o = base + (len(profile) - 1) * seg
        p.f.append([o + k for k in range(seg)])
        p.m.append(cap_last_mat or mat)


def add_bungs(p):
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


def build_closed():
    p = Part("DrumClosed")
    lathe(p, PROFILE, "DrumPaint", SEG)
    add_bungs(p)
    return p


def build_open():
    p = Part("DrumOpen")
    lathe(p, PROFILE_OPEN, "DrumPaint", SEG,
          span_mat=lambda s: "DrumSteel" if s >= OPEN_STEEL_FROM else None,
          cap_last_mat="DrumSteel")
    return p


def build_crushed():
    p = Part("DrumCrushed")
    lathe(p, PROFILE_CRUSH, "DrumPaint", SEG)
    add_bungs(p)

    # Deterministic crumple.  Envelope keeps the base round enough to read as
    # a drum; buckling grows with height; the head staves in toward centre.
    zmax = 0.850
    out = []
    for (x, y, z) in p.v:
        a = math.atan2(y, x)
        t = min(z / zmax, 1.0)
        env = 0.15 + 0.85 * t
        if z > 0.80:
            env *= 0.3       # the rim-roll rings sit 4 mm apart up here —
                             # full-strength dents fold them through each other
        # Low-frequency buckle only: a 7a term at SEG=10 swung adjacent ring
        # verts far enough to fold quads through themselves (21 back-facing
        # ray hits on the isolated mesh).
        dr = env * (0.032 * math.sin(3.0 * a + 9.0 * t + 1.7)
                    + 0.010 * math.sin(5.0 * a - 4.0 * t))
        rr = math.hypot(x, y)
        s = (rr + dr) / rr if rr > 1e-6 else 1.0
        zc = z * (CRUSH_H + 0.03 * math.sin(2.0 * a + 1.0) * t)
        # Head + rim tail + bungs stave in toward centre.  Selected by RADIUS
        # (< 0.275), not by z alone: a plain z >= DECK_Z cut sank the chime's
        # 0.842 ring but not its 0.828 ring, folding the chime flat upside
        # down — a full band of inverted faces.
        if z > 0.80 and rr < 0.275:
            zc -= 0.085 * (1.0 - min(rr / 0.258, 1.0) * 0.55)
        out.append((x * s, y * s, zc))
    # Cant, then reseat onto the actual contact points, centred.
    ca, sa = math.cos(CRUSH_CANT), math.sin(CRUSH_CANT)
    out = [(x, y * ca - z * sa, y * sa + z * ca) for (x, y, z) in out]
    zmin = min(v[2] for v in out)
    xs = [v[0] for v in out]
    ys = [v[1] for v in out]
    cx, cy = (min(xs) + max(xs)) * 0.5, (min(ys) + max(ys)) * 0.5
    p.v = [(x - cx, y - cy, z - zmin) for (x, y, z) in out]
    return p


VARIANTS = [("drum-closed", build_closed), ("drum-open", build_open),
            ("drum-crushed", build_crushed)]

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


def _fresh_scene():
    bpy.ops.wm.read_homefile(use_empty=True)
    for d in (bpy.data.objects, bpy.data.meshes, bpy.data.materials):
        for x in list(d):
            d.remove(x)


def _report(name, part, ob):
    t = evaluated_tris(ob)
    ext = [(min(c[i] for c in part.v), max(c[i] for c in part.v))
           for i in range(3)]
    print(f"  {name:14s} {t:4d} tris (budget {TRI_BUDGETS[name]}) "
          f"W {ext[0][1]-ext[0][0]:.3f} x D {ext[1][1]-ext[1][0]:.3f} "
          f"x H {ext[2][1]:.3f} m, base z {ext[2][0]:.3f}")
    return t


def build(offset=True):
    """All three side by side (the .blend source view)."""
    _fresh_scene()
    print("=" * 60)
    for i, (name, builder) in enumerate(VARIANTS):
        part = builder()
        if offset:
            part.v = [(x + i * 0.8, y, z) for (x, y, z) in part.v]
        ob = bake(part)
        _report(name, part, ob)
    print(f"  materials       {len(bpy.data.materials)}   "
          f"images {len(bpy.data.images)}")
    print("=" * 60)


def check_normals(ob, samples=200):
    import mathutils
    bad = tested = 0
    c = mathutils.Vector((0.0, 0.0, 0.4))
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
    """One .glb per variant (each built alone in a fresh scene), then the
    combined side-by-side scene saved as the .blend source."""
    total_bad = 0
    for name, builder in VARIANTS:
        _fresh_scene()
        part = builder()
        ob = bake(part)
        ov = _ui_override()
        with bpy.context.temp_override(**ov):
            ob.select_set(True)
            bpy.context.view_layer.objects.active = ob
            bpy.ops.object.transform_apply(location=True, rotation=True,
                                           scale=True)
        print("=" * 60)
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


if __name__ == "__main__":
    build()
