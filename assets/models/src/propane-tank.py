"""
ASSET-05 — 20 lb exchange propane cylinder, parametric generator.

Built for: Blender 5.x  |  Target: assets/models/propane-tank.glb
Final: 330 tris (budget 350), 3 materials, 0 images, 0.31 x 0.46 m.
PROMOTED 2026-10-07 (owner) from wip/.  Export from GUI Blender over
blender-mcp — `blender -b` does not write the .glb.
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

NO TEXTURE.  Three materials:
  TankPaint  — body + collar.  Off-white ONLY (owner, 2026-10-07: no palette).
  ValveBrass — valve body + outlet.  Fixed.
  TankDark   — foot ring + handwheel.  Fixed; the dark base that sits it down.

HEIGHT (owner, 2026-10-07): 0.46 m is OVERALL, collar included — a real 20 lb
cylinder.  The ticket's "excl. collar" would have stood it 0.56 m tall, 1.8x its
diameter, which stops reading squat.  Collision cylinder r 0.16 h 0.46 now
covers the whole tank.

COLLAR is 3 arc panels (ticket: "3 arcs, not a swept ring") with a short rim
bridge across each gap, so the gaps read as hand-hole WINDOWS in one ring.
Full-height gaps read as a crown.  One window is centred on the valve outlet.
Faces buried in the dome or the brass are not emitted (collar bottoms, the
valve body's floor, the outlet's back cap) — they paid for the bridges.

AXIS.  Lathe about +Z, base-seated at z=0.  Outlet points Blender +Y, which the
+Y-up export turns into glTF -Z (the project's forward).
"""

import bpy
import bmesh
import math

# ---------------------------------------------------------------------------
# PARAMETERS
# ---------------------------------------------------------------------------

TRI_BUDGET = 350
NAME = "propane-tank"
MODELS = "/Users/ledogen/CodeShit/CarGame/assets/models"
OUT_DIR = MODELS
OUT_BLEND = f"{MODELS}/src/{NAME}.blend"

SEG = 12

# Body lathe (z, r).  Foot ring is a narrower skirt under the lower dome.
FOOT_R, FOOT_H = 0.118, 0.052
PROFILE = [
    (0.000, FOOT_R),                     # foot ring base (cap closes it)
    (FOOT_H, FOOT_R),                    # foot ring top
    (0.062, 0.138),                      # lower dome
    (0.100, 0.155),                      # straight body (r 0.155 = 0.31 dia)
    (0.300, 0.155),
    (0.345, 0.135),                      # upper dome
    (0.372, 0.090),
    (0.384, 0.030),                      # valve boss (cap closes it)
]
FOOT_SPANS = 1                           # spans [0, FOOT_SPANS) are TankDark

# Collar: 3 arc panels on a circle, gaps centred at GAP_AT (deg, 90 = +Y).
COLLAR_R, COLLAR_T = 0.098, 0.004        # mid-radius, wall thickness
COLLAR_Z0, COLLAR_Z1 = 0.360, 0.460      # buried into the dome -> rim
GAP_DEG = 34.0
BRIDGE_H = 0.022                         # rim bridge over each window
GAP_AT = (90.0, 210.0, 330.0)
ARC_STEPS = 3                            # facets per arc panel

# Valve: brass hex body on the boss, outlet toward +Y, dark handwheel on top.
VALVE_R, VALVE_Z0, VALVE_Z1 = 0.020, 0.378, 0.425
OUTLET_R, OUTLET_Z, OUTLET_LEN = 0.013, 0.402, 0.048
WHEEL_R, WHEEL_Z0, WHEEL_Z1 = 0.032, 0.425, 0.439
VALVE_SEG = 6

MATS = {
    #  name          base colour (linear)          rough
    "TankPaint":  ((0.640, 0.640, 0.610, 1.0), 0.55),
    "ValveBrass": ((0.420, 0.270, 0.070, 1.0), 0.45),
    "TankDark":   ((0.030, 0.030, 0.032, 1.0), 0.70),
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


def lathe(p, profile, mat, seg, span_mat=None):
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
    p.f.append([base + k for k in range(seg - 1, -1, -1)])
    p.m.append(span_mat(0) if span_mat else mat)
    o = base + (len(profile) - 1) * seg
    p.f.append([o + k for k in range(seg)])
    p.m.append(mat)


def prism(p, ring, axis, z0, z1, mat, cap0=True, cap1=True):
    """Closed n-gon prism.  ring: list of 2D (u, v) points in the plane normal
    to `axis` ('z' or 'y'); extruded from z0 to z1 along that axis."""
    n = len(ring)
    base = len(p.v)
    for h in (z0, z1):
        for (u, v) in ring:
            p.v.append((u, v, h) if axis == "z" else (u, h, v))
    for k in range(n):
        k2 = (k + 1) % n
        p.f.append([base + k, base + k2, base + n + k2, base + n + k])
        p.m.append(mat)
    if cap0:
        p.f.append([base + k for k in range(n - 1, -1, -1)])
        p.m.append(mat)
    if cap1:
        p.f.append([base + n + k for k in range(n)])
        p.m.append(mat)


def arc_box(p, a0, a1, steps, z0, z1, ends=True, bottom=True):
    """Box-section arc on the collar circle, a0..a1 radians."""
    ri, ro = COLLAR_R - COLLAR_T / 2, COLLAR_R + COLLAR_T / 2
    angs = [a0 + (a1 - a0) * i / steps for i in range(steps + 1)]
    base = len(p.v)
    # 4 verts per station: inner-bottom, outer-bottom, outer-top, inner-top
    for a in angs:
        c, s = math.cos(a), math.sin(a)
        p.v.extend([(c * ri, s * ri, z0), (c * ro, s * ro, z0),
                    (c * ro, s * ro, z1), (c * ri, s * ri, z1)])
    for i in range(steps):
        a, b = base + 4 * i, base + 4 * (i + 1)
        for j in range(4):
            if j == 0 and not bottom:
                continue
            j2 = (j + 1) % 4
            p.f.append([a + j, b + j, b + j2, a + j2])
            p.m.append("TankPaint")
    if ends:
        p.f.append([base + 3, base + 2, base + 1, base + 0])
        p.m.append("TankPaint")
        e = base + 4 * steps
        p.f.append([e + 0, e + 1, e + 2, e + 3])
        p.m.append("TankPaint")


def collar(p):
    """Three arc panels, bottoms buried in the dome (not emitted), plus a rim
    bridge over each gap — open-ended, it abuts the panels' end caps."""
    n = len(GAP_AT)
    for g in range(n):
        a0 = math.radians(GAP_AT[g] + GAP_DEG / 2)
        a1 = math.radians(GAP_AT[(g + 1) % n] - GAP_DEG / 2)
        if a1 < a0:
            a1 += 2 * math.pi
        arc_box(p, a0, a1, ARC_STEPS, COLLAR_Z0, COLLAR_Z1, bottom=False)
        g0 = math.radians(GAP_AT[g] - GAP_DEG / 2)
        g1 = math.radians(GAP_AT[g] + GAP_DEG / 2)
        arc_box(p, g0, g1, 1, COLLAR_Z1 - BRIDGE_H, COLLAR_Z1, ends=False)


def ngon(r, n, rot=0.0):
    return [(math.cos(rot + 2 * math.pi * i / n) * r,
             math.sin(rot + 2 * math.pi * i / n) * r) for i in range(n)]


def valve(p):
    prism(p, ngon(VALVE_R, VALVE_SEG), "z", VALVE_Z0, VALVE_Z1, "ValveBrass",
          cap0=False)                    # floor buried in the boss
    # Outlet along +Y: ring in the XZ plane, (u, v) = (x, z).
    ring = [(u, v + OUTLET_Z) for (u, v) in ngon(OUTLET_R, VALVE_SEG)]
    prism(p, ring, "y", VALVE_R * 0.5, VALVE_R + OUTLET_LEN, "ValveBrass",
          cap0=False)                    # back cap buried in the valve body
    # Handwheel: the OPD triangle knob, rounded to a hexagon.
    prism(p, ngon(WHEEL_R, VALVE_SEG, math.pi / 6), "z",
          WHEEL_Z0, WHEEL_Z1, "TankDark")


def build_tank():
    p = Part("PropaneTank")
    lathe(p, PROFILE, "TankPaint", SEG,
          span_mat=lambda s: "TankDark" if s < FOOT_SPANS else None)
    collar(p)
    valve(p)
    return p

# ---------------------------------------------------------------------------
# Bake / verify / export (steel-drum.py machinery)
# ---------------------------------------------------------------------------
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
    ext = [(min(c[i] for c in part.v), max(c[i] for c in part.v))
           for i in range(3)]
    print(f"  {NAME} {t} tris (budget {TRI_BUDGET}) "
          f"W {ext[0][1]-ext[0][0]:.3f} x D {ext[1][1]-ext[1][0]:.3f} "
          f"x H {ext[2][1]:.3f} m, base z {ext[2][0]:.3f}")
    return t


def check_normals(ob, samples=300):
    import mathutils
    bad = tested = 0
    c = mathutils.Vector((0.0, 0.0, 0.23))
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


def check_forward(ob):
    """Outlet must be the furthest-forward feature on Blender +Y (glTF -Z)."""
    import mathutils
    hit, loc, nrm, idx = ob.ray_cast(
        mathutils.Vector((0.0, 2.0, OUTLET_Z)), mathutils.Vector((0.0, -1.0, 0.0)))
    mat = ob.data.materials[ob.data.polygons[idx].material_index].name if hit else None
    ok = hit and mat == "ValveBrass" and loc.y > 0
    print(f"  forward: ray from +Y at outlet height hits {mat} at y={loc.y:.3f} "
          f"({'OK' if ok else 'WRONG FACING'})")
    return ok


def build():
    _fresh_scene()
    part = build_tank()
    ob = bake(part)
    print("=" * 60)
    _report(part, ob)
    print(f"  materials {len(bpy.data.materials)}   images {len(bpy.data.images)}")
    print("=" * 60)
    return part, ob


def _ui_override():
    win = bpy.context.window_manager.windows[0]
    scr = win.screen
    area = next(a for a in scr.areas if a.type == "VIEW_3D")
    region = next(r for r in area.regions if r.type == "WINDOW")
    return dict(window=win, screen=scr, area=area, region=region,
                scene=bpy.context.scene, view_layer=bpy.context.view_layer)


def export():
    """GUI Blender only — `blender -b` does not write the .glb."""
    part, ob = build()
    ov = _ui_override()
    with bpy.context.temp_override(**ov):
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bad = check_normals(ob)
    fwd = check_forward(ob)
    with bpy.context.temp_override(**ov):
        bpy.ops.export_scene.gltf(
            filepath=f"{OUT_DIR}/{NAME}.glb",
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
    print(f"  wrote {OUT_DIR}/{NAME}.glb")
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    print(f"  wrote {OUT_BLEND}")
    return bad, fwd


if __name__ == "__main__":
    build()
