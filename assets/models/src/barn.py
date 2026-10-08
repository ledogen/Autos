"""
ASSET-66 — the farm BARN.  Parametric generator.

Built for: Blender 5.x  |  PROMOTED 2026-10-07 (owner) from wip/ to assets/models/ + assets/models/src/.
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

A classic gambrel-roof pole barn: barn-red ribbed metal walls, off-white trim, a dark
metal roof, a concrete plinth.  The road gable carries the big sliding double doors
(CLOSED, owner 2026-10-07) hung under a track header, and a hayloft door above, each
with the white frame-and-X trim.  Reference: the owner's photo (red pole barn, white X
doors, dark roof with a white rake soffit).

    Barn        one mesh, 4 materials, NO texture, NO UVs

Final (2026-10-07, Blender 5.2.0 LTS): 708 tris (budget 1200), 4 materials, 0 images.
Wall footprint 9.0 x 12.0 m, ridge 8.0 m (8.16 over the roof slab); overall 10.0 x 12.7 m.
Audit: no clipping, no z-fight, 0/2474 inverted ray hits.  524 non-manifold edges BY
DESIGN: the walls are single sheets and trim backs that lie on a wall are not built.

AXES.  Blender +Y = glTF -Z = forward = the road gable (doors).  Width (9 m) runs along
X, length (12 m) along Y.  Base-seated (z = 0), centred on the WALL footprint; the roof
overhang reaches past it.

WINDING.  Every face goes through face(), which takes the direction the face must point
and flips the polygon to suit.  Nothing relies on recalc_face_normals: half the trim is
open shells (the backs that lie on a wall are not built), and normal recalculation on an
open shell is a guess.  check_facing() proves the result by ray cast.

RIBS.  The metal siding is V-grooves cut INWARD from the wall plane (offset 0 on every
rib line, -RIB_D between), the trailer's siding trick turned vertical.  Every gable
break (eave corner, knee, ridge) is snapped onto a rib line so each column is a planar
quad under a single roof segment; the pitch is fitted per span, so it varies a few
centimetres between the outer and inner spans, which nobody will ever see.
"""

import bpy
import bmesh
import math
from mathutils import Vector

# ---------------------------------------------------------------------------
# PARAMETERS
# ---------------------------------------------------------------------------
OUT_DIR = "/Users/ledogen/CodeShit/CarGame/assets/models"
OUT_BLEND = f"{OUT_DIR}/src/barn.blend"
NAME = "barn"
TRI_BUDGET = 1200

# --- envelope (measured off the reference against a 9 m gable) ---
W, L = 9.0, 12.0            # wall footprint: gable width (X), length (Y)
EAVE = 3.9                  # side wall height
KNEE_X, KNEE_Z = 2.9, 6.3   # gambrel break: steep lower slope (55°) -> shallow upper (30°)
RIDGE = 8.0

# --- roof: a slab whose UNDERSIDE is the wall profile, thickness outward ---
ROOF_T = 0.14
RAKE = 0.35                 # roof past each gable wall
EAVE_OUT, EAVE_DROP = 0.45, 0.20   # eave overhang past the side wall (a slight kick)

# --- ribbed metal siding ---
RIB_PITCH = 0.40            # nominal; fitted per span
RIB_D = 0.025               # groove depth, inward

# --- base + corners ---
PLINTH_H, PLINTH_OUT = 0.25, 0.05
CORNER_W, CORNER_OUT = 0.16, 0.03   # white corner boards; OUT < PLINTH_OUT so they sit on it

# --- sliding double doors (closed) ---
DOOR_W, DOOR_H = 4.0, 3.3   # the closed PAIR
LEAF_GAP = 0.02             # at the meeting stiles
LEAF_STAND = 0.04           # leaf back clear of the rib peaks: they hang on the track
LEAF_T = 0.06
HEADER_H, HEADER_OVER = 0.22, 0.60   # track cover; runs past the doors each side
HEADER_T = LEAF_STAND + LEAF_T + 0.06

# --- hayloft door ---
LOFT_W, LOFT_H, LOFT_Z0 = 1.6, 1.6, 4.4
LOFT_T = 0.04

# --- frame-and-X trim on every door ---
TRIM_W = 0.16
TRIM_T = 0.04
BRACE_T = (0.030, 0.036)    # the two diagonals at different depths: the crossing cannot z-fight

MATS = {
    #  name          base colour (linear)        rough
    "BarnRed":   ((0.330, 0.045, 0.022, 1.0), 0.75),
    "BarnTrim":  ((0.780, 0.760, 0.700, 1.0), 0.70),   # aged off-white, not white
    "BarnRoof":  ((0.035, 0.038, 0.046, 1.0), 0.50),   # dark blue-grey metal
    "BarnBase":  ((0.180, 0.175, 0.165, 1.0), 0.95),   # concrete
}

X_, Y_, Z_ = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))


# ---------------------------------------------------------------------------
# Geometry accumulator
# ---------------------------------------------------------------------------
class Part:
    def __init__(self, name):
        self.name, self.v, self.f, self.m = name, [], [], []

    def face(self, pts, mat, out):
        """One polygon, wound so its normal points along `out`."""
        pts = [Vector(p) for p in pts]
        n = Vector()
        for i, a in enumerate(pts):          # Newell normal: robust for any planar polygon
            b = pts[(i + 1) % len(pts)]
            n += Vector(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x),
                         (a.x - b.x) * (a.y + b.y)))
        if n.dot(Vector(out)) < 0:
            pts.reverse()
        o = len(self.v)
        self.v.extend(tuple(p) for p in pts)
        self.f.append(list(range(o, o + len(pts))))
        self.m.append(mat)


def solid(p, bot, top, mat, skip=()):
    """Convex prism between two matching rings; each face points away from the centroid.
    `skip`: indices of side faces not to build (i -> the side from ring[i] to ring[i+1]),
    plus 'bot' / 'top'."""
    bot, top = [Vector(v) for v in bot], [Vector(v) for v in top]
    c = sum(bot + top, Vector()) / (2 * len(bot))
    n = len(bot)
    for i in range(n):
        if i in skip:
            continue
        q = [bot[i], bot[(i + 1) % n], top[(i + 1) % n], top[i]]
        p.face(q, mat, sum(q, Vector()) / 4 - c)
    if "bot" not in skip:
        p.face(bot, mat, sum(bot, Vector()) / n - c)
    if "top" not in skip:
        p.face(top, mat, sum(top, Vector()) / n - c)


def box(p, lo, hi, mat, skip=()):
    """Axis box.  Side order: 0 -Y, 1 +X, 2 +Y, 3 -X."""
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    ring = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    solid(p, [(x, y, z0) for x, y in ring], [(x, y, z1) for x, y in ring], mat, skip)


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------
def gable_z(x):
    """Wall top (= roof underside) at |x|."""
    x = abs(x)
    if x >= KNEE_X:
        return EAVE + (W / 2 - x) / (W / 2 - KNEE_X) * (KNEE_Z - EAVE)
    return KNEE_Z + (KNEE_X - x) / KNEE_X * (RIDGE - KNEE_Z)


def roof_profile():
    """Roof underside in (x, z), left eave tip -> right eave tip, over the ridge."""
    tip_in = [(W / 2 + EAVE_OUT, EAVE - EAVE_DROP), (W / 2, EAVE), (KNEE_X, KNEE_Z)]
    return [(-x, z) for x, z in tip_in] + [(0.0, RIDGE)] + tip_in[::-1]


def offset_up(pts, t):
    """Offset an open (x, z) polyline by t along its upper normal (mitred)."""
    def nrm(a, b):
        d = Vector((b[0] - a[0], b[1] - a[1])).normalized()
        return Vector((-d.y, d.x))
    out = []
    for i, pt in enumerate(pts):
        ns = []
        if i > 0:
            ns.append(nrm(pts[i - 1], pt))
        if i < len(pts) - 1:
            ns.append(nrm(pt, pts[i + 1]))
        m = sum(ns, Vector((0, 0))).normalized()
        k = t / m.dot(ns[0])             # mitre: keep thickness t on both segments
        out.append((pt[0] + m.x * k, pt[1] + m.y * k))
    return out


# ---------------------------------------------------------------------------
# Builders
# ---------------------------------------------------------------------------
def spans(breaks):
    """Rib lines across a wall: every break kept, each span split at ~RIB_PITCH."""
    us = [breaks[0]]
    for a, b in zip(breaks, breaks[1:]):
        n = max(1, round((b - a) / RIB_PITCH))
        us += [a + (b - a) * k / n for k in range(1, n + 1)]
    return us


def ribbed_wall(p, origin, N, breaks, top):
    """V-grooved wall.  u runs along A = Z x N (so A, Z, N is right-handed and a face
    wound A-then-Z points along N); top(u) is the wall height there."""
    A = Z_.cross(N)
    O = Vector(origin)
    us = spans(breaks)
    pts = []                                   # (u, depth) zigzag: rib line, groove, rib line ...
    for a, b in zip(us, us[1:]):
        pts += [(a, 0.0), ((a + b) / 2, -RIB_D)]
    pts.append((us[-1], 0.0))
    for (ua, da), (ub, db) in zip(pts, pts[1:]):
        pa, pb = O + A * ua + N * da, O + A * ub + N * db
        p.face([pa, pb, pb + Z_ * top(ub), pa + Z_ * top(ua)], "BarnRed", N)


def walls(p):
    hx, hy = W / 2, L / 2
    side = lambda u: EAVE
    ribbed_wall(p, (hx, 0, 0), X_, [-hy, hy], side)
    ribbed_wall(p, (-hx, 0, 0), -X_, [-hy, hy], side)
    brk = [-hx, -KNEE_X, 0.0, KNEE_X, hx]
    # On the +Y gable A = -X, so u = -x; the profile is symmetric, so top(u) = gable_z(u).
    ribbed_wall(p, (0, hy, 0), Y_, brk, gable_z)
    ribbed_wall(p, (0, -hy, 0), -Y_, brk, gable_z)


def roof(p):
    lo = roof_profile()
    hi = offset_up(lo, ROOF_T)
    y0, y1 = -L / 2 - RAKE, L / 2 + RAKE
    for i in range(len(lo) - 1):
        (ax, az), (bx, bz) = lo[i], lo[i + 1]
        up = Vector((-(bz - az), 0, bx - ax))
        (cx, cz), (dx, dz) = hi[i], hi[i + 1]
        p.face([(cx, y0, cz), (dx, y0, dz), (dx, y1, dz), (cx, y1, cz)], "BarnRoof", up)
        # Underside: the visible part is the soffit (eaves + rake), off-white like the photo.
        p.face([(ax, y0, az), (bx, y0, bz), (bx, y1, bz), (ax, y1, az)], "BarnTrim", -up)
        for y, s in ((y0, -1), (y1, 1)):       # gable-end fascia, dark like the roof edge
            p.face([(ax, y, az), (bx, y, bz), (dx, y, dz), (cx, y, cz)], "BarnRoof", Y_ * s)
    for i, j in ((0, 1), (-1, -2)):            # eave edge
        (ax, az), (bx, bz) = lo[i], lo[j]
        out = Vector((ax - bx, 0, az - bz))
        (cx, cz) = hi[i]
        p.face([(ax, y0, az), (ax, y1, az), (cx, y1, cz), (cx, y0, cz)], "BarnRoof", out)


def plinth(p):
    ox, oy = W / 2 + PLINTH_OUT, L / 2 + PLINTH_OUT
    ix, iy = W / 2, L / 2
    outer = [(-ox, -oy), (ox, -oy), (ox, oy), (-ox, oy)]
    inner = [(-ix, -iy), (ix, -iy), (ix, iy), (-ix, iy)]
    for i in range(4):
        a, b = outer[i], outer[(i + 1) % 4]
        c, d = inner[(i + 1) % 4], inner[i]
        mid = Vector(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0))
        p.face([(*a, 0), (*b, 0), (*b, PLINTH_H), (*a, PLINTH_H)], "BarnBase", mid)
        p.face([(*a, PLINTH_H), (*b, PLINTH_H), (*c, PLINTH_H), (*d, PLINTH_H)], "BarnBase", Z_)


def corners(p):
    for sx in (-1, 1):
        for sy in (-1, 1):
            xs = sorted((sx * (W / 2 - CORNER_W), sx * (W / 2 + CORNER_OUT)))
            ys = sorted((sy * (L / 2 - CORNER_W), sy * (L / 2 + CORNER_OUT)))
            # Only the two outward faces: the rest are inside the walls or the soffit.
            keep = {1 if sx > 0 else 3, 2 if sy > 0 else 0}
            box(p, (xs[0], ys[0], PLINTH_H), (xs[1], ys[1], EAVE), "BarnTrim",
                skip={0, 1, 2, 3, "bot", "top"} - keep)


def clip(poly, n, c, keep_le):
    """Sutherland-Hodgman: keep the part of convex `poly` (2D) where n.(q - c) <= keep_le."""
    f = lambda q: n.dot(Vector(q) - c) - keep_le
    out = []
    for i, a in enumerate(poly):
        b = poly[(i + 1) % len(poly)]
        fa, fb = f(a), f(b)
        if fa <= 0:
            out.append(a)
        if (fa < 0) != (fb < 0) and fa != fb:
            t = fa / (fa - fb)
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def plate(p, poly, y0, y1, mat):
    """A trim board: (x, z) polygon on the +Y gable, from y0 (back, not built) to y1."""
    solid(p, [(x, y0, z) for x, z in poly], [(x, y1, z) for x, z in poly], mat,
          skip={"bot"})


def door(p, x0, x1, z0, z1, y_back, t):
    """A door slab with the white frame and X on its face."""
    box(p, (x0, y_back, z0), (x1, y_back + t, z1), "BarnRed", skip={0})
    yf = y_back + t
    # Frame: a ring, not four boards — four boards would overlap at the corners and
    # z-fight there.  Built as four trapezoid-free quads per surface.
    ox, oz, ix0, ix1, iz0, iz1 = (x0, x1), (z0, z1), x0 + TRIM_W, x1 - TRIM_W, z0 + TRIM_W, z1 - TRIM_W
    outer = [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]
    inner = [(ix0, iz0), (ix1, iz0), (ix1, iz1), (ix0, iz1)]
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    for i in range(4):
        a, b, c, d = outer[i], outer[(i + 1) % 4], inner[(i + 1) % 4], inner[i]
        p.face([(a[0], yf + TRIM_T, a[1]), (b[0], yf + TRIM_T, b[1]),
                (c[0], yf + TRIM_T, c[1]), (d[0], yf + TRIM_T, d[1])], "BarnTrim", Y_)
        mo = Vector(((a[0] + b[0]) / 2 - cx, 0, (a[1] + b[1]) / 2 - cz))
        p.face([(a[0], yf, a[1]), (b[0], yf, b[1]),
                (b[0], yf + TRIM_T, b[1]), (a[0], yf + TRIM_T, a[1])], "BarnTrim", mo)
        p.face([(d[0], yf, d[1]), (c[0], yf, c[1]),
                (c[0], yf + TRIM_T, c[1]), (d[0], yf + TRIM_T, d[1])], "BarnTrim", -mo)
    # The X: two strips along the inner rectangle's diagonals, clipped to it.
    rect = inner
    for (a, b), bt in zip((((ix0, iz0), (ix1, iz1)), ((ix0, iz1), (ix1, iz0))), BRACE_T):
        d = (Vector(b) - Vector(a)).normalized()
        n = Vector((-d.y, d.x))
        c = Vector(a)
        poly = clip(clip(rect, n, c, TRIM_W / 2), -n, c, TRIM_W / 2)
        plate(p, poly, yf, yf + bt, "BarnTrim")


def front(p):
    hy = L / 2
    z0, z1 = PLINTH_H + 0.01, PLINTH_H + 0.01 + DOOR_H
    yb = hy + LEAF_STAND
    door(p, -DOOR_W / 2, -LEAF_GAP / 2, z0, z1, yb, LEAF_T)
    door(p, LEAF_GAP / 2, DOOR_W / 2, z0, z1, yb, LEAF_T)
    hx = DOOR_W / 2 + HEADER_OVER
    box(p, (-hx, hy, z1), (hx, hy + HEADER_T, z1 + HEADER_H), "BarnTrim", skip={0})
    door(p, -LOFT_W / 2, LOFT_W / 2, LOFT_Z0, LOFT_Z0 + LOFT_H, hy, LOFT_T)


def build_part():
    p = Part("Barn")
    walls(p)
    roof(p)
    plinth(p)
    corners(p)
    front(p)
    return p


# ---------------------------------------------------------------------------
# Blender side
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


def bake(part):
    me = bpy.data.meshes.new(part.name)
    me.from_pydata(part.v, [], part.f)
    me.update()
    used = list(dict.fromkeys(part.m))
    idx = {n: i for i, n in enumerate(used)}
    for n in used:
        me.materials.append(get_material(n))
    for i, poly in enumerate(me.polygons):
        poly.material_index = idx[part.m[i]]
    bm = bmesh.new()
    bm.from_mesh(me)
    # Welds coincident corners only; winding is already authored (no recalc).
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = False
    ob = bpy.data.objects.new(part.name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def evaluated_tris(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    m = ev.to_mesh()
    m.calc_loop_triangles()
    n = len(m.loop_triangles)
    ev.to_mesh_clear()
    return n


def check_facing(ob, n=24):
    """Ray-cast from a ring of eye points (plus overhead and from below the eaves) at
    the model; every first hit must be a face pointing back at the ray."""
    from mathutils.bvhtree import BVHTree
    dg = bpy.context.evaluated_depsgraph_get()
    tree = BVHTree.FromObject(ob, dg)
    bad = hits = 0
    targets = [Vector((x, y, z)) for x in (-3, 0, 3) for y in (-4, 0, 4) for z in (1, 3, 5, 7)]
    eyes = [Vector((math.cos(a) * 30, math.sin(a) * 30, h))
            for a in [2 * math.pi * k / n for k in range(n)] for h in (1.5, 6, 20)]
    for e in eyes:
        for t in targets:
            d = (t - e).normalized()
            loc, nrm, i, dist = tree.ray_cast(e, d)
            if loc is None:
                continue
            hits += 1
            if nrm.dot(d) > 0:
                bad += 1
    return bad, hits


def _fresh_scene():
    for d in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for x in list(d):
            d.remove(x)


def build():
    _fresh_scene()
    ob = bake(build_part())
    t = evaluated_tris(ob)
    bad, hits = check_facing(ob)
    lo = [min(v.co[i] for v in ob.data.vertices) for i in range(3)]
    hi = [max(v.co[i] for v in ob.data.vertices) for i in range(3)]
    print("=" * 60)
    print(f"  Barn  {t} tris (budget {TRI_BUDGET})  materials {len(ob.data.materials)}"
          f"  images {len(bpy.data.images)}")
    print(f"  bbox  x {lo[0]:.2f}..{hi[0]:.2f}  y {lo[1]:.2f}..{hi[1]:.2f}  z {lo[2]:.2f}..{hi[2]:.2f}")
    print(f"  facing: {bad} inverted first-hits of {hits}")
    print("=" * 60)
    return ob


def export():
    build()
    bpy.ops.export_scene.gltf(
        filepath=f"{OUT_DIR}/{NAME}.glb", export_format="GLB",
        export_draco_mesh_compression_enable=False, export_yup=True,
        export_apply=True, export_materials="EXPORT", export_texcoords=False,
        export_normals=True, export_cameras=False, export_lights=False,
        use_selection=False)
    print(f"  wrote {OUT_DIR}/{NAME}.glb")
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    print(f"  wrote {OUT_BLEND}")


if __name__ == "__main__":
    build()
