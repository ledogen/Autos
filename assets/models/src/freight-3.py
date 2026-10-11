"""
Freight cargo kit 3 — palletised goods + the hard case.  One generator, one .glb per variant.

Built for: Blender 5.2  |  Targets: assets/models/<name>.glb  ·  source: assets/models/src/freight-3.blend
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

    soft-drink-pallet    ASSET-46  ≤300   short stack of soda cases under one clear wrap
    potting-soil-pallet  ASSET-47  ≤300   20 soil bags cross-stacked, 5 layers
    concrete-pallet      ASSET-47  ≤300   same bag mesh, grey, 12 bags
    pelican-case         ASSET-39  ≤200   ribbed hard case, latches, handles, wheels

All pallet loads sit on a plain 60-tri pallet (the ASSET-27 pallet alone is 300 tris, which is the
whole budget of these tickets).  Per-piece variation is COLOR_0 vertex tint on one material, so the
recolour hooks (SodaCase, SoilBag, ConcreteBag) stay one draw call each.  Base-seated, centred,
forward −Z (Blender +Y).
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix

OUT_DIR = "/Users/ledogen/CodeShit/CarGame/assets/models"
OUT_BLEND = "/Users/ledogen/CodeShit/CarGame/assets/models/src/freight-3.blend"
BUDGETS = {"soft-drink-pallet": 1800, "potting-soil-pallet": 3000, "concrete-pallet": 3000, "pelican-case": 400}   # owner 2026-10-09: ~1000 floor; 18 real bags

MATS = {   # name: (linear rgba, roughness, alpha)
    "PalletWood":  ((0.52, 0.42, 0.28, 1), 0.95, 1),
    "SodaCase":    ((0.62, 0.56, 0.44, 1), 0.85, 1),      # kraft tray, tint-darkened per tray
    "SodaCan":     ((1.0, 1.0, 1.0, 1), 0.35, 1),          # white base x per-tray tint = the can colour
    "SodaCanTop":  ((0.70, 0.71, 0.72, 1), 0.3, 1),
    "SodaWrap":    ((0.85, 0.88, 0.92, 1), 0.2, 0.18),
    "SoilBag":     ((0.85, 0.68, 0.10, 1), 0.8, 1),        # yellow body, two thirds of the bag (owner 2026-10-10)
    "SoilPrint":   ((0.08, 0.40, 0.09, 1), 0.8, 1),        # the green end third — a Miracle-Gro leaf green, not forest (owner 2026-10-10)
    "ConcreteBag": ((0.55, 0.50, 0.42, 1), 0.9, 1),
    "ConcretePrint": ((0.52, 0.07, 0.05, 1), 0.9, 1),      # the printed band round a concrete bag
    "ProduceStem": ((0.18, 0.32, 0.08, 1), 0.7, 1),
    "CaseShell":   ((0.02, 0.02, 0.022, 1), 0.55, 1),      # black (owner); orange is the second palette entry
    "CaseTrim":    ((0.16, 0.16, 0.17, 1), 0.45, 1),
    "Strap":       ((0.09, 0.10, 0.11, 1), 0.45, 1),
    "CrateWood":   ((0.70, 0.58, 0.38, 1), 0.95, 1),
    "CrateGap":    ((0.03, 0.025, 0.02, 1), 1.0, 1),
    "Produce":     ((1.0, 1.0, 1.0, 1), 0.6, 1),          # white base x per-lump tint = the produce colour
}
PRODUCE = {   # variant: (piece tints, piece radius, pieces per top crate, fill depth below the rim)
    # the fill top must land inside a slat's span (0.205–0.27 above the course floor is the top slat),
    # or the gap between slats shows the outside world right at the surface.  Pieces are big
    # (owner 2026-10-10: bigger fruit, cover the fill): tomatoes and peppers fill a 3 x 4 grid per
    # bay, so `n` there is the cell count; squash are placed by sampling up to `n`.
    "tomatoes": ([(0.70, 0.04, 0.02), (0.58, 0.05, 0.02), (0.78, 0.12, 0.03), (0.66, 0.06, 0.02)], 0.065, 99, 0.065),
    "squash":   ([(0.85, 0.55, 0.03), (0.80, 0.40, 0.02), (0.90, 0.70, 0.08), (0.75, 0.48, 0.03)], 0.060, 40, 0.06),
    "peppers":  ([(0.05, 0.35, 0.04), (0.65, 0.04, 0.02), (0.08, 0.45, 0.05), (0.80, 0.50, 0.02)], 0.065, 99, 0.07),
}
CAN_TINT = (0.75, 0.04, 0.03)                   # one brand on the whole pallet (owner 2026-10-09)
BAG_TINTS = [(1, 1, 1), (0.82, 0.84, 0.80), (0.92, 0.95, 0.90), (0.74, 0.76, 0.72)]


def get_material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    col, rough, alpha = MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    attr = nt.nodes.new("ShaderNodeVertexColor"); attr.layer_name = "Col"
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0; mix.inputs[6].default_value = col
    nt.links.new(attr.outputs["Color"], mix.inputs[7]); nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough; b.inputs["Metallic"].default_value = 0.0
    if alpha < 1:
        b.inputs["Alpha"].default_value = alpha
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            m.blend_method = 'BLEND'
    m.diffuse_color = (*col[:3], alpha); m.roughness = rough; m.use_backface_culling = name != "Strap"   # straps are seen from both sides
    return m


class Builder:
    def __init__(self):
        self.bm = bmesh.new(); self.slots = list(MATS); self.k = 0
        self.tint_layer = self.bm.loops.layers.float_color.new("Col")

    def face(self, pts, mat, tint=(1, 1, 1)):
        f = self.bm.faces.new([self.bm.verts.new(Vector(p)) for p in pts])
        f.material_index = self.slots.index(mat); f.smooth = False
        for l in f.loops:
            l[self.tint_layer] = (*tint, 1.0)
        return f

    def box(self, lo, hi, mat, tint=(1, 1, 1), xform=Matrix.Identity(4), skip=()):
        x0, y0, z0 = lo; x1, y1, z1 = hi
        c = [xform @ Vector(p) for p in [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                                         (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]]
        q = {"-z": (0, 3, 2, 1), "+z": (4, 5, 6, 7), "-y": (0, 1, 5, 4), "+x": (1, 2, 6, 5), "+y": (2, 3, 7, 6), "-x": (3, 0, 4, 7)}
        for k, a in q.items():
            if k not in skip:
                self.face([c[i] for i in a], mat, tint)

    def bar(self, p0, p1, w, mat, caps=True):
        p0, p1 = Vector(p0), Vector(p1)
        ax = (p1 - p0).normalized()
        ref = Vector((0, 0, 1)) if abs(ax.z) < 0.9 else Vector((0, 1, 0))
        u = ax.cross(ref).normalized(); v = ax.cross(u).normalized()
        ring = lambda c: [c + (u + v) * w / 2, c + (-u + v) * w / 2, c + (-u - v) * w / 2, c + (u - v) * w / 2]
        a, t = ring(p0), ring(p1)
        for k in range(4):
            j = (k + 1) % 4
            self.face([a[k], a[j], t[j], t[k]], mat)
        if caps:
            self.face(list(reversed(a)), mat); self.face(t, mat)

    def lathe(self, profile, seg, mat, cx=0, cy=0, cap_bottom=True, cap_top=True, xform=Matrix.Identity(4), phase=0.0):
        ang = [2 * math.pi * k / seg + phase for k in range(seg)]
        pt = lambda r, z, k: xform @ Vector((cx + r * math.cos(ang[k]), cy + r * math.sin(ang[k]), z))
        for (ra, za), (rb, zb) in zip(profile, profile[1:]):
            for k in range(seg):
                j = (k + 1) % seg
                self.face([pt(ra, za, k), pt(ra, za, j), pt(rb, zb, j), pt(rb, zb, k)], mat)
        if cap_bottom and profile[0][0] > 0:
            self.face([pt(profile[0][0], profile[0][1], k) for k in reversed(range(seg))], mat)
        if cap_top and profile[-1][0] > 0:
            self.face([pt(profile[-1][0], profile[-1][1], k) for k in range(seg)], mat)

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
    """Orient every face toward open air (see freight.py)."""
    from mathutils.bvhtree import BVHTree
    me = ob.data
    bm = bmesh.new(); bm.from_mesh(me); bm.normal_update()
    tree = BVHTree.FromBMesh(bm)
    flip = [f for f in bm.faces
            if tree.ray_cast(f.calc_center_median() - f.normal * 1e-4, -f.normal)[0] is None
            and tree.ray_cast(f.calc_center_median() + f.normal * 1e-4, f.normal)[0] is not None]
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



PW, PL, PH = 1.0, 1.2, 0.14


def pallet(b):
    for x in (-0.46, 0, 0.46):
        b.box((x - 0.04, -PL / 2, 0.02), (x + 0.04, PL / 2, PH - 0.02), "PalletWood", (0.85, 0.82, 0.78))
    b.box((-PW / 2, -PL / 2, PH - 0.02), (PW / 2, PL / 2, PH), "PalletWood")
    b.box((-PW / 2, -PL / 2, 0), (PW / 2, PL / 2, 0.02), "PalletWood", (0.8, 0.78, 0.75))


# ---------------------------------------------------------------- soda
def build_soda(b):
    """Kraft cardboard trays of upright cans, one brand, two trays wide so nothing overhangs the
    pallet, three layers (owner 2026-10-09).  Every perimeter can is a half-octagon prism so the
    cans read as cylinders; the inner field is a flat slab at can-top height."""
    pallet(b)
    rnd = random.Random(5)
    tl, tw, th = 0.40, 0.27, 0.045          # tray footprint and lip height
    ch, cr = 0.122, 0.033                   # can height / radius
    nx, ny, gap = 2, 4, 0.006
    X0, Y0 = -(nx * tl + (nx - 1) * gap) / 2, -(ny * tw + (ny - 1) * gap) / 2
    layers = 3
    def can(cx, cy, z, outward, tint, full):
        """The 4 outward facets of an octagon for a can on a side, the whole octagon for a corner
        can (owner 2026-10-10: a half can at a corner shows its open back)."""
        ox, oy = outward
        base_a = math.atan2(oy, ox)
        angs = [base_a + math.radians(a_) for a_ in (range(-180, 181, 45) if full else (-90, -45, 0, 45, 90))]
        pts = [(cx + cr * math.cos(a_), cy + cr * math.sin(a_)) for a_ in angs]
        for (xa, ya), (xb, yb) in zip(pts, pts[1:]):
            b.face([(xa, ya, z), (xb, yb, z), (xb, yb, z + ch), (xa, ya, z + ch)], "SodaCan", tint)
    for layer in range(layers):
        zt = PH + layer * (th + ch)
        for i in range(nx):
            for j in range(ny):
                x0, y0 = X0 + i * (tl + gap), Y0 + j * (tw + gap)
                k = 0.94 + 0.06 * rnd.random()                       # kraft, a shade apart per tray
                b.box((x0, y0, zt), (x0 + tl, y0 + tw, zt + th), "SodaCase", (k, k, k), skip=("-z",) if layer else ())
                # cans: 6 x 4 per tray; only the ones on the pallet perimeter get geometry
                for ci in range(6):
                    for cj in range(4):
                        cx, cy = x0 + tl * (ci + 0.5) / 6, y0 + tw * (cj + 0.5) / 4
                        out = []
                        if i == 0 and ci == 0: out.append((-1, 0))
                        if i == nx - 1 and ci == 5: out.append((1, 0))
                        if j == 0 and cj == 0: out.append((0, -1))
                        if j == ny - 1 and cj == 3: out.append((0, 1))
                        if not out:
                            continue
                        ox = sum(o[0] for o in out); oy = sum(o[1] for o in out)
                        can(cx, cy, zt + th - 0.004, (ox, oy), CAN_TINT, full=len(out) == 2)
        # inner field: a slab at can-top height, slightly inside the perimeter cans (seen between them)
        b.box((X0 + 0.05, Y0 + 0.05, zt + th), (-X0 - 0.05, -Y0 - 0.05, zt + th + ch - 0.004), "SodaCanTop", skip=("-z", "+z"))
    # a kraft slip sheet over the whole top layer, the full tray footprint, so every can is covered
    # (owner 2026-10-10)
    zs = PH + layers * (th + ch) - 0.004
    b.box((X0, Y0, zs), (-X0, -Y0, zs + 0.008), "SodaCase", (0.97, 0.97, 0.97), skip=("-z",))
    top = zs + 0.008
    for ys in (-0.3, 0.3):                                            # down the sides, out to the bed-wall tie-downs
        hull_strap(b, rect_pts(X0, -X0, PH, top), ys, BED_ANCHORS)


# ---------------------------------------------------------------- bags
def rounded_rect(hw, hh, r):
    """Twelve-point rounded rectangle in (across, up), half-extents hw x hh, corner radius r with
    two facets per corner, wound CCW."""
    r = max(0.0, min(r, hw, hh))
    pts = []
    for cx_, cy_, a0 in ((hw - r, hh - r, 0), (-hw + r, hh - r, 90), (-hw + r, -hh + r, 180), (hw - r, -hh + r, 270)):
        for a in (a0, a0 + 45, a0 + 90):
            pts.append((cx_ + r * math.cos(math.radians(a)), cy_ + r * math.sin(math.radians(a))))
    return pts


def bag(b, cx, cy, z, along_x, mat, print_mat, tint, L=0.47, W=0.31, H=0.11, R=0.03, logo_end=-1, band=(0.07, 0.16)):
    """A palletised sack: a rectangular prism with rounded edges (owner 2026-10-10 — the floppy
    pillow could not sit on its neighbours; packed concrete bags are near-rectangular anyway), so
    the flat top and bottom stack flush.  Lofted rounded-rectangle sections, the end edges
    chamfered by R, a printed region in `print_mat` from `band[0]` to `band[1]` metres in from the
    `logo_end` (±1) end — a stripe for the concrete, the whole end third for the soil — and a
    short pasted seam flap at each end.  Returns its (x, z) outline for the straps."""
    sec = rounded_rect(W / 2, H / 2, R)
    end = rounded_rect(W / 2 - R, H / 2 - R, 0.0)
    a0, a1 = sorted(logo_end * (L / 2 - d) for d in band)
    printed = lambda along: a0 - 1e-6 <= along <= a1 + 1e-6
    cuts = sorted({round(v, 6) for v in (-L / 2, -L / 2 + R, a0, a1, L / 2 - R, L / 2)})
    stations = [(v, end if abs(abs(v) - L / 2) < 1e-6 else sec) for v in cuts]
    rings = []
    for along, pts in stations:
        ring = []
        for across, up in pts:
            x, y = (cx + along, cy + across) if along_x else (cx + across, cy + along)
            ring.append((x, y, z + H / 2 + up))
        rings.append(ring)
    N = len(sec)
    mid = Vector((cx, cy, z + H / 2))                          # wind outward here, not via the normal fixer
    q = [Vector(p) for p in (rings[1][0], rings[1][1], rings[2][1], rings[2][0])]
    flip = (q[1] - q[0]).cross(q[2] - q[1]).dot((q[0] + q[2]) / 2 - mid) < 0
    for (v0, _), (v1, _), r0, r1 in zip(stations, stations[1:], rings, rings[1:]):
        m = print_mat if printed((v0 + v1) / 2) else mat
        for k in range(N):
            j = (k + 1) % N
            quad = [r0[k], r0[j], r1[j], r1[k]]
            b.face(quad[::-1] if flip else quad, m, tint)
    for cap, v in ((list(reversed(rings[0])), -L / 2), (list(rings[-1]), L / 2)):
        b.face(cap[::-1] if flip else cap, print_mat if printed(v) else mat, tint)
    zs = z + H / 2
    w = W / 2 - R - 0.01
    for e in (-1, 1):                                         # seam flap, 2 cm proud of the end, open where it meets it
        fa0, fa1 = sorted((e * L / 2, e * (L / 2 + 0.02)))
        fm = print_mat if printed(e * L / 2) else mat
        if along_x:
            b.box((cx + fa0, cy - w, zs - 0.002), (cx + fa1, cy + w, zs + 0.002), fm, tint, skip=("+x" if e < 0 else "-x",))
        else:
            b.box((cx - w, cy + fa0, zs - 0.002), (cx + w, cy + fa1, zs + 0.002), fm, tint, skip=("+y" if e < 0 else "-y",))
    return [(x + (0.004 if x > cx else -0.004), zz + 0.004) for ring in rings for x, _, zz in ring]


def bag_stack(b, layers, mat, print_mat, H, band=(0.07, 0.16)):
    """Six bags a layer — three abreast, two long, so a bag is 1.5 × its width and the crossing
    layers share one 0.96 m square envelope, corner to corner (owner 2026-10-10: a box, not a
    middle layer sticking out); each layer sits flat on the one below with 2 mm clear.  Logo end
    drawn at random per bag, as they are thrown on."""
    pallet(b)
    rnd = random.Random(8); k = 0; outline = []
    for li in range(layers):
        z = PH + li * (H + 0.002)
        along_x = li % 2 == 1
        spots = [(sx, sy) for sx in (-0.24, 0.24) for sy in (-0.32, 0.0, 0.32)] if along_x else \
                [(sx, sy) for sx in (-0.32, 0.0, 0.32) for sy in (-0.24, 0.24)]
        for cx, cy in spots:
            k += 1
            outline += bag(b, cx + rnd.uniform(-0.004, 0.004), cy + rnd.uniform(-0.004, 0.004), z, along_x, mat, print_mat,
                           BAG_TINTS[k % 4], H=H, logo_end=rnd.choice((-1, 1)), band=band)
    for ys in (-0.3, 0.3):                                    # over the stack's envelope, out to the bed-wall tie-downs
        hull_strap(b, outline, ys, BED_ANCHORS)


def build_soil(b):
    # 18 bags, a touch thicker than the concrete; the print takes the whole end third of the bag,
    # end cap and seam flap included, so the colourway is two thirds yellow, one third green
    # (owner 2026-10-10)
    bag_stack(b, 3, "SoilBag", "SoilPrint", 0.13, band=(0.0, 0.47 / 3))


def build_concrete(b):
    bag_stack(b, 3, "ConcreteBag", "ConcretePrint", 0.11)   # 18 bags


# ---------------------------------------------------------------- pelican case
def build_case(b):
    """Black rolling equipment case: ribbed body and lid, six latches, end handles, a wheel pair
    at the -X end and a telescoping pull handle at +X (owner 2026-10-09)."""
    L, W, H = 1.0, 0.45, 0.55
    lid = 0.16
    b.box((-L / 2, -W / 2, 0.04), (L / 2, W / 2, H - lid), "CaseShell", skip=("-z",))          # body meets the lid, no gap
    b.box((-L / 2 - 0.004, -W / 2 - 0.004, H - lid), (L / 2 + 0.004, W / 2 + 0.004, H), "CaseShell")
    for i in range(6):                                                  # ribs wrap lid AND body
        x = -0.42 + i * 0.168
        b.box((x - 0.025, -W / 2 - 0.012, H - lid), (x + 0.025, W / 2 + 0.012, H + 0.012), "CaseShell")
        b.box((x - 0.025, -W / 2 - 0.012, 0.04), (x + 0.025, W / 2 + 0.012, H - lid - 0.012), "CaseShell", skip=("-z",))
    for sy in (-1, 1):                                                  # three latches a side
        for x in (-0.33, 0.0, 0.33):
            y0, y1 = (W / 2 + 0.012, W / 2 + 0.03) if sy > 0 else (-W / 2 - 0.03, -W / 2 - 0.012)
            b.box((x - 0.045, y0, H - lid - 0.07), (x + 0.045, y1, H - lid + 0.06), "CaseTrim", skip=("-y" if sy > 0 else "+y",))
    for sx in (-1, 1):                                                  # end carry handles
        x = sx * (L / 2 + 0.03)
        b.bar((x, -0.09, 0.30), (x, 0.09, 0.30), 0.028, "CaseTrim")
        b.bar((x, -0.09, 0.30), (sx * L / 2, -0.09, 0.30), 0.02, "CaseTrim", caps=False)
        b.bar((x, 0.09, 0.30), (sx * L / 2, 0.09, 0.30), 0.02, "CaseTrim", caps=False)
    wheel = [(0.0, -0.02), (0.065, -0.02), (0.065, 0.02), (0.0, 0.02)]
    for y in (-0.16, 0.16):                                             # wheels, axle along Y
        xf = Matrix.Translation((-L / 2 + 0.07, y, 0.065)) @ Matrix.Rotation(math.radians(90), 4, 'X')
        b.lathe(wheel, 8, "CaseTrim", xform=xf, cap_bottom=True, cap_top=True)
    for y in (-0.10, 0.10):                                             # telescoping handle, collapsed
        b.bar((L / 2 - 0.05, y, H - 0.02), (L / 2 - 0.05, y, H + 0.05), 0.022, "CaseTrim")
    b.bar((L / 2 - 0.05, -0.13, H + 0.05), (L / 2 - 0.05, 0.13, H + 0.05), 0.03, "CaseTrim")
    b.box((L / 2 - 0.22, -W / 2 + 0.05, 0), (L / 2 - 0.10, W / 2 - 0.05, 0.04), "CaseTrim", skip=("-z",))   # foot rail


def piece(b, mid, prof, seg, M, tint, lobes=0.0, top=None, stem=0.0, cut=None):
    """A whole fruit as a small lathe (profile in metres, z up) rotated by M about its mid-height
    point, set at `mid`; `lobes` ribs the radius with cos 4a for a bell pepper; `top` recolours
    the top cap (a tomato's calyx); `stem` adds a 4-tri pyramid that long on the top.  Then,
    per the owner (2026-10-10), every face lying wholly below `cut` — buried in the fill — is
    deleted: the fruit is built whole at any orientation and only what shows is kept.  The open
    rim that leaves is made of edges whose faces were all buried, so it sits under the fill."""
    hgt = prof[-1][1]
    c = Vector(mid) - M @ Vector((0, 0, hgt / 2))
    ang = [2 * math.pi * k / seg for k in range(seg + 1)]
    def pt(r, z, k):
        rr = r * (1 + lobes * math.cos(4 * ang[k]))
        return tuple(c + M @ Vector((rr * math.cos(ang[k]), rr * math.sin(ang[k]), z)))
    faces = []
    for (ra, za), (rb, zb) in zip(prof, prof[1:]):
        for k in range(seg):
            faces.append(b.face([pt(ra, za, k), pt(ra, za, k + 1), pt(rb, zb, k + 1), pt(rb, zb, k)], "Produce", tint))
    faces.append(b.face([pt(prof[0][0], prof[0][1], k) for k in reversed(range(seg))], "Produce", tint))
    faces.append(b.face([pt(prof[-1][0], prof[-1][1], k) for k in range(seg)], "Produce", top or tint))
    if stem:                                                   # a 3-tri spike, 12 mm across
        t = c + M @ Vector((0, 0, hgt))
        base = [t + M @ Vector((0.007 * math.cos(a), 0.007 * math.sin(a), 0)) for a in (0, 2.094, 4.189)]
        faces += [b.face([base[k], base[(k + 1) % 3], t + M @ Vector((0, 0, stem))], "ProduceStem") for k in range(3)]
    if cut is not None:
        bmesh.ops.delete(b.bm, geom=[f for f in faces if all(v.co.z < cut for v in f.verts)], context='FACES')


def lean(rnd, th, heading=None, spread=1.0):
    """Rotation tilting a piece's axis by `th` toward a random heading — or within ±`spread` rad
    of `heading` (an angle in the plan) when it must keep clear of something — then spun."""
    d = rnd.uniform(0, 2 * math.pi) if heading is None else heading + math.pi / 2 + rnd.uniform(-spread, spread)
    return Matrix.Rotation(d, 3, 'Z') @ Matrix.Rotation(th, 3, 'X') @ Matrix.Rotation(rnd.uniform(0, 2 * math.pi), 3, 'Z')


def random_rotation(rnd):
    """Uniform over all orientations (ZXZ Euler with a uniform cosine of the middle angle)."""
    return Matrix.Rotation(rnd.uniform(0, 2 * math.pi), 3, 'Z') @ Matrix.Rotation(math.acos(rnd.uniform(-1, 1)), 3, 'X') \
        @ Matrix.Rotation(rnd.uniform(0, 2 * math.pi), 3, 'Z')


def squash_pieces(b, rnd, ix0, ix1, iy0, iy1, zf, tints, r, n, strap_ys):
    """Butternuts packed over the whole top in rows, big (12 x 20 cm), cells a squash long and a
    squash wide, each at its own tilt anywhere from standing to flat (owner 2026-10-10: a
    continuum, not on-end-or-on-side), the mid-point 0.6 r (standing) to 0.2 r (lying) above the
    fill.  Past 50° the shadow is long, so the heading runs along the row (±25°, ±10° in the wall
    rows); flatter than that it leans away from the nearest strap so the raised end clears it.
    Under a strap a squash lies flat with its axis at the fill, which passes 8 mm under."""
    prof = [(0.3 * r, 0), (1.0 * r, 0.6 * r), (0.8 * r, 1.4 * r), (0.5 * r, 2.2 * r), (0.55 * r, 3.0 * r), (0.3 * r, 3.3 * r)]
    hgt = prof[-1][1]
    nx, ny = round((ix1 - ix0) / (hgt + 0.02)), round((iy1 - iy0) / (2.25 * r))
    for i, j in rnd.sample([(i, j) for i in range(nx) for j in range(ny)], min(n, nx * ny)):
        x = ix0 + (ix1 - ix0) * (i + 0.5) / nx + rnd.uniform(-0.004, 0.004)
        y = iy0 + (iy1 - iy0) * (j + 0.5) / ny + rnd.uniform(-0.004, 0.004)
        sy = min(strap_ys, key=lambda s: abs(y - s))
        along = rnd.choice((0.0, math.pi))                                  # bulb at either end of the row
        spread = 0.45 if abs(y) < 0.1 else 0.17                             # a swung bulb in any other row would reach a strap or a wall
        if abs(y - sy) < r + 0.025:
            th, dz, M = math.pi / 2, -0.004 - rnd.uniform(0, 0.2 * r), lean(rnd, math.pi / 2, along, spread)
        else:
            th = rnd.uniform(0, math.pi / 2)
            dz = 0.6 * r * math.cos(th) + 0.2 * r * math.sin(th) + rnd.uniform(-0.15 * r, 0.25 * r)   # plus its own height (owner: noise in z)
            M = lean(rnd, th, along, spread) if th > math.radians(50) else \
                lean(rnd, th, math.atan2(math.copysign(1, y - sy), 0))      # raised end away from the strap
        piece(b, (x, y, zf + dz), prof, 8, M, rnd.choice(tints), cut=zf - 0.004)


def pieces(b, kind, rnd, ix0, ix1, iy0, iy1, zf, tints, r, n, strap_ys):
    """Tomatoes or peppers packed over the whole top (the four bays share one fill, so one grid
    spans them): cells ≈ the piece's diameter, so neighbours touch.  Each is a whole fruit at a
    uniformly random orientation (owner 2026-10-10: truly random), its mid-point −0.1 r to +0.2 r
    above the fill, then clipped to what shows.  In the row under each strap the fruit stays
    within 30° of upright, leaning away from the strap, so neither body nor stem reaches it."""
    if kind == "squash":
        return squash_pieces(b, rnd, ix0, ix1, iy0, iy1, zf, tints, r, n, strap_ys)
    if kind == "peppers":
        prof = [(0.4 * r, 0), (1.0 * r, 0.5 * r), (0.8 * r, 1.05 * r), (0.45 * r, 1.2 * r)]
    else:
        prof = [(0.3 * r, 0), (1.0 * r, 0.5 * r), (0.8 * r, 0.9 * r), (0.35 * r, 1.05 * r)]
    nx, ny = round((ix1 - ix0) / (2 * r)), round((iy1 - iy0) / (2 * r))
    cells = [(i, j) for j in range(ny) for i in range(nx - j % 2)]        # odd rows shifted half a cell and one short: a staggered pack, not a grid
    for i, j in rnd.sample(cells, min(n, len(cells))):
        x = ix0 + (ix1 - ix0) * (i + 0.5 + 0.5 * (j % 2)) / nx + rnd.uniform(-0.006, 0.006)
        y = iy0 + (iy1 - iy0) * (j + 0.5) / ny + rnd.uniform(-0.006, 0.006)
        sy = min(strap_ys, key=lambda s: abs(y - s))
        # each piece at its own height (owner 2026-10-10: noise in z, or they read as one plane)
        if abs(y - sy) < r + 0.025:                                         # the body reaches under the strap
            M, dz = lean(rnd, rnd.uniform(0, math.radians(25)), math.atan2(math.copysign(1, y - sy), 0)), rnd.uniform(-0.25 * r, -0.02 * r)
        else:
            M, dz = random_rotation(rnd), rnd.uniform(-0.25 * r, 0.35 * r)
        if kind == "peppers":
            piece(b, (x, y, zf + dz), prof, 8, M, rnd.choice(tints), lobes=0.12, stem=0.02, cut=zf - 0.004)
        else:
            piece(b, (x, y, zf + dz), prof, 8, M, rnd.choice(tints), top=(0.25, 0.45, 0.12), cut=zf - 0.004)


def crate(b, x0, y0, z0, L=0.48, W=0.58, H=0.28, rnd=None, hidden=(), fill_top=None, floor=True):
    """One slatted crate shell: corner posts (none at the pallet's centre, where four would meet —
    owner 2026-10-10), floor, three slats a side.  Slats skip their end faces, which sit in the
    posts, and a slat buried in the fill (top below `fill_top`) skips its inner face too — only
    the slat the fill surface crosses shows its inside (owner 2026-10-10: reclaim those
    triangles for fruit).  `floor=False` for a course whose floor would sit inside the fill."""
    x1, y1, z1 = x0 + L, y0 + W, z0 + H
    p, t = 0.03, 0.012
    buried = fill_top is not None and z1 <= fill_top            # a lower-course post: its inner faces sit inside the fill, its top under the post above
    for (px, py) in ((x0, y0), (x1 - p, y0), (x0, y1 - p), (x1 - p, y1 - p)):
        if abs(px + p / 2) < 0.05 and abs(py + p / 2) < 0.05:
            continue
        inner = ("+z", "+x" if px == x0 else "-x", "+y" if py == y0 else "-y") if buried else ()
        b.box((px, py, z0), (px + p, py + p, z1), "CrateWood", (0.9, 0.86, 0.8), skip=("-z",) + inner)
    if floor:
        b.box((x0 + p, y0 + p, z0), (x1 - p, y1 - p, z0 + 0.015), "CrateWood", (0.8, 0.78, 0.72), skip=("-z", "+z"))
    sl = [(z0 + 0.015, z0 + 0.08), (z0 + 0.11, z0 + 0.175), (z0 + 0.205, z1 - 0.01)]
    for (za, zb) in sl:
        tint = (0.84 + 0.1 * rnd.random(), 0.82, 0.76) if rnd else (1, 1, 1)
        buried = fill_top is not None and zb <= fill_top + 0.002
        inner = lambda side: (side,) if buried else ()
        if "-y" not in hidden: b.box((x0 + p, y0, za), (x1 - p, y0 + t, zb), "CrateWood", tint, skip=("-x", "+x") + inner("+y"))
        if "+y" not in hidden: b.box((x0 + p, y1 - t, za), (x1 - p, y1, zb), "CrateWood", tint, skip=("-x", "+x") + inner("-y"))
        if "-x" not in hidden: b.box((x0, y0 + p, za), (x0 + t, y1 - p, zb), "CrateWood", tint, skip=("-y", "+y") + inner("+x"))
        if "+x" not in hidden: b.box((x1 - t, y0 + p, za), (x1, y1 - p, zb), "CrateWood", tint, skip=("-y", "+y") + inner("-x"))


def produce_pallet(b, kind):
    """Eight crate shells in two courses, turned so the 2 x 2 footprint (0.96 x 1.16 m) sits inside
    the 1.0 x 1.2 m pallet, holding ONE solid fill across all four crates and both courses in the
    fruit's shadow colour (owner 2026-10-10: a single block, no air gap between the courses) that
    stops `drop` short of the top rim, with whole pieces sitting on it."""
    pallet(b)
    rnd = random.Random(13)
    tints, r, n, drop = PRODUCE[kind]
    L, W, H = 0.48, 0.58, 0.28
    p, t = 0.03, 0.012
    zf = PH + 2 * H - drop
    for ci in range(2):
        z = PH + ci * H
        for i, x0 in enumerate((-L, 0.0)):
            for j, y0 in enumerate((-W, 0.0)):
                hidden = ("+x" if i == 0 else "-x", "+y" if j == 0 else "-y")
                crate(b, x0, y0, z, L, W, H, rnd=rnd, hidden=hidden, fill_top=zf, floor=ci == 0)
    ix0, ix1, iy0, iy1 = -L + t + 0.002, L - t - 0.002, -W + t + 0.002, W - t - 0.002
    b.box((ix0, iy0, PH + 0.015), (ix1, iy1, zf), "Produce", tuple(c * 0.55 for c in tints[0]), skip=("-z",))
    pieces(b, kind, rnd, -L + t + p, L - t - p, -W + t + p, W - t - p, zf, tints, r, n, strap_ys=(-0.3, 0.3))   # inside the outer posts
    for ys in (-0.3, 0.3):
        hull_strap(b, rect_pts(-L, L, PH, PH + 2 * H), ys, BED_ANCHORS)


def build_tomatoes(b): produce_pallet(b, "tomatoes")
def build_squash(b): produce_pallet(b, "squash")
def build_peppers(b): produce_pallet(b, "peppers")


BUDGETS.update({"produce-pallet-tomatoes": 3000, "produce-pallet-squash": 3000, "produce-pallet-peppers": 3000})   # same as the bag pallets; only the part of each fruit above the fill is modelled
VARIANTS = [("produce-pallet-tomatoes", build_tomatoes), ("produce-pallet-squash", build_squash),
            ("produce-pallet-peppers", build_peppers), ("soft-drink-pallet", build_soda), ("potting-soil-pallet", build_soil),
            ("concrete-pallet", build_concrete), ("pelican-case", build_case)]


def evaluated_tris(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    objs = [c for c in ob.children if c.type == 'MESH'] if ob.type == 'EMPTY' else [ob]
    return sum(len(p.vertices) - 2 for o in objs for p in o.evaluated_get(dg).to_mesh().polygons)
def check_normals(samples=300):
    """Scene rays from above the horizon must hit faces whose normals face the ray (tests whatever
    sits at the origin — build, check, then offset).  Returns (hits, inverted)."""
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
        fresh_scene(); ob = build_one(name, fn); bpy.context.view_layer.update()
        hit, bad = check_normals()
        print(f"{name}: {evaluated_tris(ob)}/{BUDGETS[name]} tris, dims {bounds(ob)}, normals {bad}/{hit} inverted")
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
