"""
ASSET-72 — propane 4-pack on a pallet (freight cargo), composite generator.

Built for: Blender 5.x  |  Target: assets/models/propane-pallet.glb
Final: 1692 tris (budget 1800) = small pallet 244 + 4 x tank 330 + 2 straps
128; 4 materials, 0 images, 0.80 x 0.81 x 0.61 m.  PROMOTED 2026-10-07 (owner).
The exporter warns "multiple materials with different Vertex Color": expected —
the tank corners carry white COLOR_0 (see ONE MESH below).
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

REUSE, NOT REMODEL.  The cylinder is propane-tank.py's build_tank() + bake()
and the pallet is pallet.py's SMALL variant (0.80 x 0.80 m, owner 2026-10-07:
the 4-pack looked lost on the full 1.2 x 1.0) via build_pallet() + bake() — imported as modules,
so the geometry is identical to ASSET-05 / ASSET-27 by construction (no .glb
round trip, which would also have dropped the pallet's per-board tints).
Re-export this after changing either source generator.

This ticket adds only the ARRANGEMENT (2 x 2, outlets all facing -Z) and TWO
straps (owner, 2026-10-07 — replaced a single band round the block): one per
tank column, each a loop in the fore-aft plane that runs over both collars,
down the tanks' ends, round the deck's end board and back UNDER the top deck
through the fork tunnel.  The columns sit at x = +-0.16, inside the tunnels
between stringers, so the straps clear the stringers by construction.  Each
loop is the CONVEX HULL of the real tank profile + collar rim + deck corners
(a taut strap is a convex hull), offset outward — so it follows the parts if
either source generator changes.  The straps reuse TankDark, so the model has
no material of its own: TankPaint, ValveBrass, TankDark, PalletWood.

ONE MESH.  Pallet and tanks are joined; the join gives the tank corners the
pallet's COLOR_0 attribute, which is set to white so glTF's multiply leaves
the tank materials untouched.  The same model serves full and empty legs —
only the mass differs (ticket).

AXIS.  As the parts: base-seated at z=0, centred on the pallet, Blender +Y =
glTF -Z forward (stringers and valve outlets both point that way).
"""

import bpy
import importlib.util
import math

# ---------------------------------------------------------------------------
# PARAMETERS
# ---------------------------------------------------------------------------

TRI_BUDGET = 1800
NAME = "propane-pallet"
SRC = "/Users/ledogen/CodeShit/CarGame/assets/models/src"
OUT_DIR = "/Users/ledogen/CodeShit/CarGame/assets/models"
OUT_BLEND = f"{SRC}/{NAME}.blend"

# Tank centres sit PITCH apart: 0.31 m diameter + a 10 mm gap.  Touching
# (0.310) would put two tanks' facet edges exactly on top of each other.
PITCH = 0.320

# Straps: width across X, thickness, clearance off the surfaces they bear on.
STRAP_W = 0.040          # 1.5 in polyester strap
STRAP_T = 0.003
STRAP_GAP = 0.002


def _load(name, file):
    spec = importlib.util.spec_from_file_location(name, f"{SRC}/{file}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


pt = _load("propane_tank", "propane-tank.py")
pl = _load("pallet", "pallet.py")
pl.use("pallet-small")                    # 0.80 x 0.80 (owner, 2026-10-07)

DECK_Z = pl.H
TANK_R = pt.PROFILE[3][1]                 # straight-body radius, 0.155
CENTRES = [(sx * PITCH / 2, sy * PITCH / 2)
           for sx, sy in ((1, 1), (-1, 1), (-1, -1), (1, -1))]  # CCW


def _hull(pts):
    """Andrew's monotone chain; CCW, no collinear points."""
    pts = sorted(set(pts))

    def half(seq):
        out = []
        for q in seq:
            while len(out) >= 2 and ((out[-1][0] - out[-2][0]) * (q[1] - out[-2][1])
                                     - (out[-1][1] - out[-2][1]) * (q[0] - out[-2][0])) <= 0:
                out.pop()
            out.append(q)
        return out[:-1]
    return half(pts) + half(pts[::-1])


def _offset(poly, d):
    """Offset a CCW convex polygon outward by d (miter joins)."""
    n = len(poly)
    out = []
    for i in range(n):
        (ax, ay), (bx, by), (cx, cy) = poly[i - 1], poly[i], poly[(i + 1) % n]
        n1 = (by - ay, ax - bx)
        n2 = (cy - by, bx - cx)
        l1, l2 = math.hypot(*n1), math.hypot(*n2)
        n1 = (n1[0] / l1, n1[1] / l1)
        n2 = (n2[0] / l2, n2[1] / l2)
        k = d / (1.0 + n1[0] * n2[0] + n1[1] * n2[1])
        out.append((bx + (n1[0] + n2[0]) * k, by + (n1[1] + n2[1]) * k))
    return out


def strap_path():
    """(y, z) loop for a strap through one tank column, in the plane x = cx.
    Contact set: each tank's profile at its two (+-Y) silhouette points (the
    12-gon has vertices at 90/270 deg, so the profile radius IS the
    silhouette), the collar rim's outer top corner, and the top deck's four
    end corners — the strap passes under the deck, so the deck is inside."""
    pts = []
    rim = (pt.COLLAR_R + pt.COLLAR_T / 2, pt.COLLAR_Z1)
    for cy in (-PITCH / 2, PITCH / 2):
        for z, r in pt.PROFILE + [rim[::-1]]:
            pts += [(cy + r, DECK_Z + z), (cy - r, DECK_Z + z)]
    for y in (-pl.L / 2, pl.L / 2):
        pts += [(y, pl.H), (y, pl.H - pl.T_DECK)]
    return _hull(pts)


def build_straps():
    p = pt.Part("Straps")
    path = strap_path()
    inner, outer = _offset(path, STRAP_GAP), _offset(path, STRAP_GAP + STRAP_T)
    n = len(path)
    for cx in sorted({c[0] for c in CENTRES}):
        x0, x1 = cx - STRAP_W / 2, cx + STRAP_W / 2
        base = len(p.v)
        # 4 verts per station: inner/x0, outer/x0, outer/x1, inner/x1
        for (yi, zi), (yo, zo) in zip(inner, outer):
            p.v.extend([(x0, yi, zi), (x0, yo, zo), (x1, yo, zo), (x1, yi, zi)])
        for i in range(n):
            a, b = base + 4 * i, base + 4 * ((i + 1) % n)
            for j in range(4):
                j2 = (j + 1) % 4
                p.f.append([a + j, b + j, b + j2, a + j2])
                p.m.append("TankDark")
    return p


def build_load():
    """Four tanks + strap as one Part, through propane-tank.py's own bake."""
    tank = pt.build_tank()
    p = pt.Part("PropaneLoad")
    for cx, cy in CENTRES:
        o = len(p.v)
        p.v.extend((x + cx, y + cy, z + DECK_Z) for (x, y, z) in tank.v)
        p.f.extend([i + o for i in f] for f in tank.f)
        p.m.extend(tank.m)
    strap = build_straps()
    o = len(p.v)
    p.v.extend(strap.v)
    p.f.extend([i + o for i in f] for f in strap.f)
    p.m.extend(strap.m)
    return p


def _ui_override():
    win = bpy.context.window_manager.windows[0]
    area = next(a for a in win.screen.areas if a.type == "VIEW_3D")
    region = next(r for r in area.regions if r.type == "WINDOW")
    return dict(window=win, screen=win.screen, area=area, region=region,
                scene=bpy.context.scene, view_layer=bpy.context.view_layer)


def build():
    pt._fresh_scene()
    pallet = pl.bake(pl.build_pallet())
    load_part = build_load()
    load = pt.bake(load_part)
    n_pallet, n_load = pt.evaluated_tris(pallet), pt.evaluated_tris(load)
    with bpy.context.temp_override(**_ui_override()):
        for o in bpy.context.view_layer.objects:
            o.select_set(o in (pallet, load))
        bpy.context.view_layer.objects.active = pallet
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = ob.data.name = "PropanePallet"
    # Joined tank corners carry whatever default the join gave them: force
    # white so glTF's COLOR_0 multiply is neutral on the tank materials.
    me = ob.data
    col = me.color_attributes["Col"]
    wood = me.materials.find("PalletWood")
    for poly in me.polygons:
        if poly.material_index != wood:
            for li in poly.loop_indices:
                col.data[li].color = (1.0, 1.0, 1.0, 1.0)
    me.color_attributes.active_color = col
    t = pt.evaluated_tris(ob)
    xs, ys, zs = zip(*(v.co for v in me.vertices))
    print("=" * 60)
    print(f"  {NAME} {t} tris (budget {TRI_BUDGET}) = pallet {n_pallet} + "
          f"4 tanks & strap {n_load}")
    print(f"  X {max(xs)-min(xs):.3f} x Y {max(ys)-min(ys):.3f} x H {max(zs):.3f} m, "
          f"base z {min(zs):.3f}   materials {[m.name for m in me.materials]}  "
          f"images {len(bpy.data.images)}")
    print("=" * 60)
    return ob


def check_normals(ob, samples=600):
    import mathutils
    bad = tested = 0
    c = mathutils.Vector((0.0, 0.0, 0.3))
    for i in range(samples):
        t = (i + 0.5) / samples
        phi = math.acos(1 - 2 * t)
        theta = math.pi * (1 + 5 ** 0.5) * i
        d = mathutils.Vector((math.sin(phi) * math.cos(theta),
                              math.sin(phi) * math.sin(theta), math.cos(phi)))
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
    """Each tank's outlet must be the first thing a ray from +Y meets at
    outlet height through that tank's centre column (front row) — proves the
    -Z glTF facing numerically.  The strap runs down over the outlet, so the
    ray steps through TankDark faces until it meets something else."""
    import mathutils
    ok = True
    d = mathutils.Vector((0.0, -1.0, 0.0))
    for cx, cy in CENTRES[:2]:                # the +Y row
        o = mathutils.Vector((cx, 2.0, DECK_Z + pt.OUTLET_Z))
        mat = "TankDark"
        while mat == "TankDark":
            hit, loc, nrm, idx = ob.ray_cast(o, d)
            mat = ob.data.materials[ob.data.polygons[idx].material_index].name if hit else None
            o = loc + d * 1e-4
        ok &= mat == "ValveBrass"
        print(f"  forward: tank x={cx:+.2f} ray from +Y hits {mat}")
    return ok


def export():
    """GUI Blender only — `blender -b` does not write the .glb."""
    ob = build()
    bad = check_normals(ob)
    fwd = check_forward(ob)
    with bpy.context.temp_override(**_ui_override()):
        bpy.ops.export_scene.gltf(
            filepath=f"{OUT_DIR}/{NAME}.glb",
            export_format="GLB",
            export_draco_mesh_compression_enable=False,
            export_yup=True,
            export_apply=True,
            export_materials="EXPORT",
            export_vertex_color="ACTIVE",   # MATERIAL mode drops it: no attr node
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
