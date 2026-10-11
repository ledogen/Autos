"""
Freight cargo kit — four strapped bed loads, one parametric generator, one .glb each
(ASSETS.md kit rule).  All ride welded to the bed (FEAT-96), so each is one rigid piece.

Built for: Blender 5.2  |  Targets: assets/models/<name>.glb  ·  source: assets/models/src/freight.blend
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

    plywood-sheets        ASSET-54  ≤200   12 sheets 2.44 x 1.22, strapped
    railway-ties          ASSET-52  ≤300   5 creosoted sleepers 2.6 m, 3+2, strapped
    tire-stack            ASSET-61  ≤400   two stacks of four tyres, strapped
    cinder-block-pallet   ASSET-55  ≤400   45 CMU on a plain pallet, cores on top

Base-seated, centred on the footprint; long axis along Blender +Y (= glTF -Z).
Per-piece variation is COLOR_0 vertex tint (ART-STYLE rule 1), one material per role:
    PlyFace PlyEdge · TieWood TieEnd · TyreRubber · BlockConcrete BlockCore PalletWood · Strap
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix

OUT_DIR = "/Users/ledogen/CodeShit/CarGame/assets/models"
OUT_BLEND = "/Users/ledogen/CodeShit/CarGame/assets/models/src/freight.blend"
BUDGETS = {"plywood-sheets": 200, "railway-ties": 300, "tire-stack": 2600, "cinder-block-pallet": 800}   # owner 2026-10-09: ~1000 floor

MATS = {
    "PlyFace":       ((0.78, 0.64, 0.42, 1), 0.9),
    "PlyEdge":       ((0.45, 0.32, 0.18, 1), 1.0),
    "TieWood":       ((0.055, 0.040, 0.028, 1), 0.95),
    "TieEnd":        ((0.12, 0.085, 0.05, 1), 1.0),
    "TyreRubber":    ((0.020, 0.021, 0.022, 1), 0.85),
    "BlockConcrete": ((0.34, 0.33, 0.31, 1), 1.0),
    "BlockCore":     ((0.025, 0.025, 0.024, 1), 1.0),
    "PalletWood":    ((0.52, 0.42, 0.28, 1), 0.95),
    "Strap":         ((0.09, 0.10, 0.11, 1), 0.45),
}
TINTS = [(1, 1, 1), (0.80, 0.78, 0.75), (0.92, 0.90, 0.86), (0.72, 0.70, 0.68), (0.86, 0.84, 0.80), (0.97, 0.96, 0.94)]


def get_material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    col, rough = MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    attr = nt.nodes.new("ShaderNodeVertexColor"); attr.layer_name = "Col"
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0; mix.inputs[6].default_value = col
    nt.links.new(attr.outputs["Color"], mix.inputs[7]); nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough; b.inputs["Metallic"].default_value = 0.0
    m.diffuse_color = col; m.roughness = rough; m.use_backface_culling = name != "Strap"   # straps are seen from both sides
    return m


class Builder:
    def __init__(self):
        self.bm = bmesh.new(); self.slots = list(MATS); self.k = 0
        self.tint_layer = self.bm.loops.layers.float_color.new("Col")

    def tint(self):
        self.k += 1
        return TINTS[(self.k * 5) % len(TINTS)]

    def face(self, pts, mat, tint=(1, 1, 1)):
        f = self.bm.faces.new([self.bm.verts.new(Vector(p)) for p in pts])
        f.material_index = self.slots.index(mat); f.smooth = False
        for l in f.loops:
            l[self.tint_layer] = (*tint, 1.0)
        return f

    def box(self, lo, hi, mat, tint=(1, 1, 1), xform=Matrix.Identity(4), skip=(), mats=None):
        """mats: optional per-face material override {'+y': 'TieEnd', ...}"""
        x0, y0, z0 = lo; x1, y1, z1 = hi
        c = [xform @ Vector(p) for p in [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                                         (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]]
        q = {"-z": (0, 3, 2, 1), "+z": (4, 5, 6, 7), "-y": (0, 1, 5, 4), "+x": (1, 2, 6, 5), "+y": (2, 3, 7, 6), "-x": (3, 0, 4, 7)}
        for k, a in q.items():
            if k not in skip:
                self.face([c[i] for i in a], (mats or {}).get(k, mat), tint)

    def finish(self, name):
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
        for s in self.slots:
            me.materials.append(get_material(s))
        me.color_attributes.active_color = me.color_attributes["Col"]
        for p in me.polygons:
            p.use_smooth = False
        ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
        fix_normals(ob)
        return split_by_material(ob)
def fix_normals(ob):
    """Orient every face toward open air.  For each face, probe a hair off both sides along the
    normal: if only the back side escapes to infinity, the face is inside-out — flip it.  Thin
    sheets (both sides open) and cavities (neither) are left alone.  Works on open shells, where
    bmesh's recalc_face_normals guesses."""
    from mathutils.bvhtree import BVHTree
    me = ob.data
    bm = bmesh.new(); bm.from_mesh(me); bm.normal_update()
    tree = BVHTree.FromBMesh(bm)
    flip = []
    for f in bm.faces:
        c, n = f.calc_center_median(), f.normal.copy()
        out_p = tree.ray_cast(c + n * 1e-4, n)[0] is None
        out_m = tree.ray_cast(c - n * 1e-4, -n)[0] is None
        if out_m and not out_p:
            flip.append(f)
    for f in flip:
        f.normal_flip()
    bm.to_mesh(me); bm.free(); me.update()
    return len(flip)

def _upper_hull(P):
    """Upper convex hull of 2D points, left to right — the path a tensioned strap takes."""
    P = sorted(set((round(a, 5), round(c, 5)) for a, c in P))
    def cross(o, a, b): return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    hull = []
    for p in reversed(P):
        while len(hull) >= 2 and cross(hull[-2], hull[-1], p) <= 0:
            hull.pop()
        hull.append(p)
    return hull[::-1]

def split_by_material(ob):
    """Blender 5.2's glTF exporter only writes COLOR_0 for a mesh's FIRST material slot (verified
    2026-10-09: every later primitive exports white).  So the combined mesh is split into one object
    per material under an empty root — same draw calls in three.js, tints survive export."""
    me = ob.data; name = ob.name
    root = bpy.data.objects.new(name + "_root", None)
    bpy.context.collection.objects.link(root)
    for mi, mat in enumerate(me.materials):
        bm = bmesh.new(); bm.from_mesh(me)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index != mi], context='FACES')
        if not bm.faces:
            bm.free(); continue
        part = bpy.data.meshes.new(f"{ob.name}_{mat.name}"); bm.to_mesh(part); bm.free()
        part.materials.append(mat)
        for p in part.polygons:
            p.material_index = 0; p.use_smooth = False
        if "Col" in part.color_attributes:
            part.color_attributes.active_color = part.color_attributes["Col"]
        po = bpy.data.objects.new(part.name, part); bpy.context.collection.objects.link(po); po.parent = root
    bpy.data.objects.remove(ob, do_unlink=True)
    root.name = name                       # the mesh object held the name until now
    return root


def bounds(root):
    """(dx, dy, dz) of a root's mesh children in world space."""
    import itertools
    pts = [ch.matrix_world @ Vector(c) for ch in root.children for c in ch.bound_box]
    if not pts:
        return (0.0, 0.0, 0.0)
    return tuple(round(max(p[i] for p in pts) - min(p[i] for p in pts), 2) for i in range(3))



def rect_pts(x0, x1, z0, z1, off=0.004):
    return [(x0 - off, z0), (x1 + off, z0), (x1 + off, z1 + off), (x0 - off, z1 + off)]


def circle_pts(cx, cz, r, off=0.004, n=24):
    return [(cx + (r + off) * math.cos(2 * math.pi * k / n), cz + (r + off) * math.sin(2 * math.pi * k / n)) for k in range(n)]


BED_HALF_W = 0.70   # Ranger bed inner half-width (data/vehicle-models.js innerHalfW): every strap
                    # runs out to a tie-down at the bed wall on the floor, so the load reads as
                    # strapped to the TRUCK, not to its own pallet (owner 2026-10-09)
BED_ANCHORS = [(-BED_HALF_W, 0.0), (BED_HALF_W, 0.0)]


def hull_strap(b, pts, y, anchors, w=0.03, axis="y"):
    """Double-sided ribbon over the upper hull of `pts` (2D section) from anchor to anchor.
    axis="y": section is (x,z) at y; axis="x": section is (y,z) at x."""
    path = _upper_hull(list(pts) + list(anchors))
    for (a0, c0), (a1, c1) in zip(path, path[1:]):
        if axis == "y":
            b.face([(a0, y - w / 2, c0), (a1, y - w / 2, c1), (a1, y + w / 2, c1), (a0, y + w / 2, c0)], "Strap")
        else:
            b.face([(y - w / 2, a0, c0), (y - w / 2, a1, c1), (y + w / 2, a1, c1), (y + w / 2, a0, c0)], "Strap")


def hull_band(b, pts, z, w=0.03):
    """Double-sided vertical band around the full convex hull of plan points at height z."""
    P = sorted(set((round(a, 5), round(c, 5)) for a, c in pts))
    def cross(o, a, b_): return (a[0] - o[0]) * (b_[1] - o[1]) - (a[1] - o[1]) * (b_[0] - o[0])
    lo, up = [], []
    for p in P:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(P):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0: up.pop()
        up.append(p)
    ring = lo[:-1] + up[:-1]
    for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
        b.face([(x0, y0, z - w / 2), (x1, y1, z - w / 2), (x1, y1, z + w / 2), (x0, y0, z + w / 2)], "Strap")



def strap(b, lo, hi, ys, t=0.025, s=0.004):
    """A band around the X/Z section at y=ys: four faces, open ends."""
    x0, _, z0 = lo; x1, _, z1 = hi
    b.box((x0 - s, ys - t / 2, z0 - s), (x1 + s, ys + t / 2, z1 + s), "Strap", skip=("+y", "-y"))


def strap_x(b, lo, hi, xs, t=0.025, s=0.004):
    """A band around the Y/Z section at x=xs."""
    _, y0, z0 = lo; _, y1, z1 = hi
    b.box((xs - t / 2, y0 - s, z0 - s), (xs + t / 2, y1 + s, z1 + s), "Strap", skip=("+x", "-x"))


# ---------------------------------------------------------------- the bed, for loads longer than it
# The Ranger bed (data/vehicle-models.js `bed`, body-local → above-floor): 1.835 m from the front
# wall to the tailgate's inner face, the tailgate top 0.413 m up, the wheelhouses 0.207 m tall from
# 0.4925 m behind the front wall. A load longer than the bed rides ANGLED (owner 2026-10-10): its
# front edge against the headboard, its underside on the tailgate's top edge, the rest hanging out.
# The model's forward-most point is that headboard contact and its lowest is z = 0, the floor: the
# loader (main.js _loadFreight) parks the hull's bbox front on the front wall and its bottom on the
# deck, so the overhang lands over the gate by itself.
BED_LEN, GATE_H, WH_Z, WH_Y = 1.835, 0.413, 0.207, 0.4925


def tilted(b, blocks, rests, thick, straps, mat, mats):
    """Stack `blocks` — local boxes (lo, hi, tint, skip) authored flat with the headboard end at
    y = 0 and the length running to -Y, z from 0 — tilted about X so its underside passes through
    the two `rests` ((metres behind the headboard, height) points) with its top-front edge at
    y = 0. Hull straps at `straps` (metres behind the headboard) run out to the bed-wall tie-downs
    over the stack's section there."""
    (y1, z1), (y2, z2) = rests
    th = math.atan2(z2 - z1, y2 - y1)                  # the underside's slope, rising toward the tail
    d = thick * math.sin(th)                           # the top-front edge leads the bottom one by this
    zf = z1 - (y1 - d) * math.tan(th)                  # underside height at its front corner (y = -d)
    X = Matrix.Translation((0, -d, zf)) @ Matrix.Rotation(-th, 4, 'X')
    for lo, hi, tint, skip in blocks:
        b.box(lo, hi, mat, tint, xform=X, skip=skip, mats=mats)
    x0, x1 = min(lo[0] for lo, *_ in blocks), max(hi[0] for _, hi, *_ in blocks)
    for ys in straps:
        zl = zf + (ys - d) * math.tan(th)              # the underside, ys behind the headboard
        hull_strap(b, rect_pts(x0, x1, zl, zl + thick / math.cos(th)), -ys, BED_ANCHORS)


# ---------------------------------------------------------------- plywood
def build_plywood(b):
    """Twelve 4 x 8 sheets: 2.44 m in a 1.835 m bed, 1.22 m across a 1.09 m arch gap — so the stack
    lies on the front corners of the wheelhouses and the tailgate top (8.7°), front edge to the
    headboard, 0.5 m hanging past the gate (owner 2026-10-10). Straps at the arches and the gate."""
    rnd = random.Random(2)
    n, t = 12, 0.019
    W, L = 1.22, 2.44
    blocks = []
    for i in range(n):
        dx, yf = rnd.uniform(-0.012, 0.012), rnd.uniform(-0.03, 0.0)
        # whole boxes: with the ends staggered, a sheet's skipped top showed the one below's back
        blocks.append(((dx - W / 2, yf - L, i * t), (dx + W / 2, yf, (i + 1) * t), b.tint(), ()))
    tilted(b, blocks, [(WH_Y, WH_Z), (BED_LEN, GATE_H)], n * t, (0.75, 1.70), "PlyEdge", {"+z": "PlyFace", "-z": "PlyFace"})


# ---------------------------------------------------------------- railway ties
def build_ties(b):
    """Five 2.6 m ties, 3 + 2: 0.76 m across sits on the floor between the arches, so the stack
    tilts from the floor at the headboard up onto the tailgate top (13.3°) and hangs 0.7 m past the
    gate (owner 2026-10-10). Straps at the floor contact and the gate."""
    rnd = random.Random(4)
    L, W, H = 2.6, 0.23, 0.18
    rows = [((-0.26, 0, 0.26), 0), ((-0.13, 0.13), H)]
    blocks = []
    for xs, z in rows:
        for x in xs:
            yf, dx = rnd.uniform(-0.1, 0.0), rnd.uniform(-0.006, 0.006)
            blocks.append(((x + dx - W / 2, yf - L, z), (x + dx + W / 2, yf, z + H), b.tint(), ()))
    # the front rest is the stack's own bottom-front corner on the floor, which sits d = 2H·sinθ
    # behind the headboard; θ = atan(0.413 / (1.835 - d)) converges to 13.26°, d = 0.083
    tilted(b, blocks, [(0.083, 0.0), (BED_LEN, GATE_H)], 2 * H, (0.45, 1.70), "TieWood", {"+y": "TieEnd", "-y": "TieEnd"})


# ---------------------------------------------------------------- tyres
TYRE_R, TYRE_BORE, TYRE_H, TYRE_C = 0.325, 0.19, 0.21, 0.03     # outer radius, bore, height, edge radius


def tyre(b, cx, cy, z0, seg=16, phase=0.0):
    """One tyre: a plain hollow cylinder — cylindrical tread band, flat sidewalls, open bore — with
    a small radius (two facets) on its two outer edges, nothing else (owner 2026-10-09: start over
    from hollow cylinders).  The profile is a closed loop walked bore → bottom → tread → top → bore,
    so every face points outward."""
    R, ri, h, c = TYRE_R, TYRE_BORE, TYRE_H, TYRE_C
    zt = z0 + h
    prof = [(ri, z0), (R - c, z0), (R - 0.293 * c, z0 + 0.293 * c), (R, z0 + c),
            (R, zt - c), (R - 0.293 * c, zt - 0.293 * c), (R - c, zt), (ri, zt), (ri, z0)]
    ang = [2 * math.pi * k / seg + phase for k in range(seg)]
    pt = lambda rad, z, k: (cx + rad * math.cos(ang[k]), cy + rad * math.sin(ang[k]), z)
    for (ra, za), (rb, zb) in zip(prof, prof[1:]):
        for k in range(seg):
            j = (k + 1) % seg
            b.face([pt(ra, za, k), pt(ra, za, j), pt(rb, zb, j), pt(rb, zb, k)], "TyreRubber")


def build_tyres(b):
    # plain pallet (1.2 along Y x 1.0 along X); the two stacks overhang 7 cm each end, as they would
    PW, PL, PH = 1.0, 1.2, 0.14
    for x in (-0.46, 0, 0.46):
        b.box((x - 0.04, -PL / 2, 0.02), (x + 0.04, PL / 2, PH - 0.02), "PalletWood", (0.85, 0.82, 0.78))
    b.box((-PW / 2, -PL / 2, PH - 0.02), (PW / 2, PL / 2, PH), "PalletWood")
    b.box((-PW / 2, -PL / 2, 0), (PW / 2, PL / 2, 0.02), "PalletWood", (0.8, 0.78, 0.75))
    # the same tyre eight times: two stacks of four, each tyre nudged a few mm and turned a little,
    # 2 mm between tyres so no two sidewalls share a plane (the edge radii make the V between them)
    rnd = random.Random(6)
    gap = 0.002
    top = PH + 4 * (TYRE_H + gap)
    for cy in (-0.335, 0.335):
        for i in range(4):
            tyre(b, rnd.uniform(-0.008, 0.008), cy + rnd.uniform(-0.008, 0.008), PH + i * (TYRE_H + gap), phase=rnd.uniform(0, 0.4))
    # one strap across each stack, hugging the tyre profile, out to the bed-wall tie-downs (owner
    # 2026-10-09).  The lengthwise strap is gone: it could only anchor to the pallet, and a strap
    # to the front wall or tailgate would bake in where the pallet sits along the bed.
    R = TYRE_R + 0.012
    for cy in (-0.335, 0.335):
        sec = [(s * R, PH + i * (TYRE_H + gap) + z) for i in range(4) for s in (-1, 1) for z in (TYRE_C, TYRE_H - TYRE_C)]
        sec += [(s * (TYRE_R - TYRE_C), top + 0.004) for s in (-1, 1)]
        sec += [(s * (TYRE_R - 0.293 * TYRE_C + 0.009), top - 0.293 * TYRE_C + 0.007) for s in (-1, 1)]   # the top edge radius
        hull_strap(b, sec, cy, BED_ANCHORS)


# ---------------------------------------------------------------- cinder blocks
def grooved_face(b, corners, n, mat, tint, g=0.012, d=0.008):
    """A block face with a V-groove round its edge: flush inner quad inset by g, four bevels
    running out to the edge, which sits d inside the face plane.  Adjacent blocks therefore meet
    in a V (owner 2026-10-09: separation along every block edge)."""
    c = [Vector(q) for q in corners]; n = Vector(n)
    if (c[1] - c[0]).cross(c[2] - c[1]).dot(n) < 0:       # wind to face `n` here, not by the normal fixer's guess
        c.reverse()
    centre = sum(c, Vector()) / 4
    inner = [q + (centre - q).normalized() * g * math.sqrt(2) for q in c]
    outer = [q - n * d for q in c]
    b.face(inner, mat, tint)
    for i in range(4):
        j = (i + 1) % 4
        b.face([outer[i], outer[j], inner[j], inner[i]], mat, tint)
    return inner


def build_blocks(b):
    # plain pallet: 3 stringers + top/bottom deck slabs (the ASSET-27 pallet costs 300 alone)
    PW, PL, PH = 1.0, 1.2, 0.14
    for x in (-0.46, 0, 0.46):
        b.box((x - 0.04, -PL / 2, 0.02), (x + 0.04, PL / 2, PH - 0.02), "PalletWood", (0.85, 0.82, 0.78))
    b.box((-PW / 2, -PL / 2, PH - 0.02), (PW / 2, PL / 2, PH), "PalletWood")
    b.box((-PW / 2, -PL / 2, 0), (PW / 2, PL / 2, 0.02), "PalletWood", (0.8, 0.78, 0.75))
    # the cube: 5 blocks across X (0.19 each = 0.95, inside the 1.0 m pallet) x 3 along Y (0.39 = 1.17) x 3 courses
    bx, by, bz = 0.19, 0.39, 0.19
    nx, ny, nz = 5, 3, 3
    X0, Y0, Z0 = -nx * bx / 2, -ny * by / 2, PH
    X1, Y1, Zt = X0 + nx * bx, Y0 + ny * by, Z0 + nz * bz
    # a core box 8 mm inside the faces: the grooves' recessed edges meet it, so the V between two
    # faces at a cube edge shows dark concrete instead of a see-through slit
    b.box((X0 + 0.008, Y0 + 0.008, Z0), (X1 - 0.008, Y1 - 0.008, Zt - 0.008), "BlockConcrete", (0.45, 0.45, 0.45), skip=("-z",))
    # one tint PER BLOCK, drawn at random, shared by every face of that block — the old tint cycle
    # aliased with the loop order and left the long sides nearly uniform (owner 2026-10-09: the
    # mosaic on the ends and sides alike)
    rnd = random.Random(21)
    shades = [(1, 1, 1), (0.78, 0.77, 0.75), (0.90, 0.89, 0.86), (0.70, 0.69, 0.68), (0.84, 0.83, 0.80), (0.95, 0.94, 0.92)]
    tint_of = {(i, j, k): rnd.choice(shades) for i in range(nx) for j in range(ny) for k in range(nz)}
    for k in range(nz):
        z0, z1 = Z0 + k * bz, Z0 + (k + 1) * bz
        for i in range(nx):                                   # ±Y faces: block ends
            xa, xb = X0 + i * bx, X0 + (i + 1) * bx
            grooved_face(b, [(xa, Y0, z0), (xa, Y0, z1), (xb, Y0, z1), (xb, Y0, z0)], (0, -1, 0), "BlockConcrete", tint_of[(i, 0, k)])
            grooved_face(b, [(xa, Y1, z0), (xb, Y1, z0), (xb, Y1, z1), (xa, Y1, z1)], (0, 1, 0), "BlockConcrete", tint_of[(i, ny - 1, k)])
        for j in range(ny):                                   # ±X faces: block sides
            ya, yb = Y0 + j * by, Y0 + (j + 1) * by
            grooved_face(b, [(X0, ya, z0), (X0, yb, z0), (X0, yb, z1), (X0, ya, z1)], (-1, 0, 0), "BlockConcrete", tint_of[(0, j, k)])
            grooved_face(b, [(X1, ya, z0), (X1, ya, z1), (X1, yb, z1), (X1, yb, z0)], (1, 0, 0), "BlockConcrete", tint_of[(nx - 1, j, k)])
    for i in range(nx):                                       # top: grooved face + two dark cores
        for j in range(ny):
            xa, xb, ya, yb = X0 + i * bx, X0 + (i + 1) * bx, Y0 + j * by, Y0 + (j + 1) * by
            grooved_face(b, [(xa, ya, Zt), (xb, ya, Zt), (xb, yb, Zt), (xa, yb, Zt)], (0, 0, 1), "BlockConcrete", tint_of[(i, j, nz - 1)])
            for cy in (ya + by * 0.27, ya + by * 0.73):
                hw, hd = bx * 0.30, by * 0.17
                b.face([(xa + bx / 2 - hw, cy - hd, Zt + 0.002), (xa + bx / 2 + hw, cy - hd, Zt + 0.002),
                        (xa + bx / 2 + hw, cy + hd, Zt + 0.002), (xa + bx / 2 - hw, cy + hd, Zt + 0.002)], "BlockCore")
    for j in range(ny):                                       # one strap per block row, across the columns, to the bed walls
        ys = Y0 + (j + 0.5) * by
        hull_strap(b, rect_pts(X0, X1, Z0, Zt), ys, BED_ANCHORS)


VARIANTS = [("plywood-sheets", build_plywood), ("railway-ties", build_ties),
            ("tire-stack", build_tyres), ("cinder-block-pallet", build_blocks)]


def evaluated_tris(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    objs = [c for c in ob.children if c.type == 'MESH'] if ob.type == 'EMPTY' else [ob]
    return sum(len(p.vertices) - 2 for o in objs for p in o.evaluated_get(dg).to_mesh().polygons)
def check_normals(ob, samples=300):
    """Scene rays from above the horizon must hit faces whose normals face the ray."""
    rnd = random.Random(1); hit = bad = 0
    dg = bpy.context.evaluated_depsgraph_get()
    for _ in range(samples):
        d = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(0.05, 1))).normalized()
        ok, loc, nrm, idx, o, m = bpy.context.scene.ray_cast(dg, d * 12.0, -d)
        if ok:
            hit += 1; bad += nrm.dot(d) < 0
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
            return dict(window=bpy.context.window, area=area, region=next(r for r in area.regions if r.type == 'WINDOW'))
    return {}


def build_one(name, fn, dx=0.0):
    b = Builder(); fn(b); ob = b.finish("".join(w.title() for w in name.split("-")))
    ob.location.x = dx
    return ob


def export(only=None):
    for name, fn in VARIANTS:
        if only and name not in only:
            continue
        fresh_scene(); ob = build_one(name, fn)
        bpy.context.view_layer.update(); tris = evaluated_tris(ob); hit, bad = check_normals(ob)
        print(f"{name}: {tris}/{BUDGETS[name]} tris, {bad} inverted of {hit}, dims {bounds(ob)}")
        with bpy.context.temp_override(**_ui_override()):
            bpy.ops.export_scene.gltf(
                filepath=f"{OUT_DIR}/{name}.glb", export_format="GLB",
                export_draco_mesh_compression_enable=False, export_yup=True, export_apply=True,
                export_materials="EXPORT", export_vertex_color="ACTIVE", export_texcoords=False,
                export_normals=True, export_cameras=False, export_lights=False, use_selection=False)
    fresh_scene(); x = 0.0
    for name, fn in VARIANTS:
        ob = build_one(name, fn, x); x += bounds(ob)[0] + 1.0
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)


if __name__ == "__main__":
    export()
