"""
FEAT-122 — inventory item THUMBNAILS.  Generator + render rig, one function per item.

Built for: Blender 5.2  |  Targets: assets/items/<id>.png (256 px, transparent)
Style brief: .planning/research/ART-STYLE.md (flat colour, faceted, no textures, saturated man-made)

Each item is modelled at real size (metres, Blender Z up, front = −Y) and rendered through ONE
fixed rig — orthographic 3/4 view from front-right-above, sun + sky ambient, transparent film — so
the inventory grid reads as one set.  These models exist for the thumbnail only; none ships as a
.glb from here (the camp render, FEAT-66, would promote pack/bedroll through the asset pipeline).

Run in the GUI Blender (blender-mcp):
    import sys, importlib; sys.path.insert(0, "<repo>/assets/models/src"); import items
    importlib.reload(items); items.run_all()            # or items.run("coffee")
The ids are data/items.js ITEMS keys — test/inventory.mjs fails if one has no PNG.
"""
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "assets", "items")
RES = 256

# Linear base colours, roughness (ART-STYLE rule 5: values render ~1.5x lighter — judge rendered).
MATS = {
    "CupPaper":   ((0.80, 0.77, 0.70, 1), 0.85),
    "CupSleeve":  ((0.28, 0.13, 0.05, 1), 0.9),
    "CupLid":     ((0.035, 0.03, 0.028, 1), 0.5),
    "Tray":       ((0.78, 0.76, 0.72, 1), 0.9),
    "TrayTrim":   ((0.55, 0.03, 0.02, 1), 0.8),
    "Bun":        ((0.62, 0.30, 0.08, 1), 0.85),
    "Sausage":    ((0.34, 0.07, 0.03, 1), 0.55),
    "Chili":      ((0.20, 0.05, 0.02, 1), 0.7),
    "Mustard":    ((0.86, 0.58, 0.02, 1), 0.6),
    "Onion":      ((0.85, 0.84, 0.78, 1), 0.6),
    "Rubber":     ((0.03, 0.03, 0.033, 1), 0.9),
    "Steel":      ((0.30, 0.31, 0.32, 1), 0.45),
    "SteelDark":  ((0.06, 0.06, 0.065, 1), 0.6),
    "CanRed":     ((0.55, 0.035, 0.02, 1), 0.5),
    "CanBlack":   ((0.03, 0.03, 0.03, 1), 0.6),
    "Canvas":     ((0.24, 0.22, 0.08, 1), 0.95),
    "CanvasDark": ((0.13, 0.12, 0.04, 1), 0.95),
    "Leather":    ((0.16, 0.06, 0.02, 1), 0.7),
    "Buckle":     ((0.45, 0.42, 0.36, 1), 0.45),
    "Wool":       ((0.09, 0.115, 0.026, 1), 0.95),
    "WoolStripe": ((0.78, 0.70, 0.52, 1), 0.95),
    # Batch 2 (2026-10-20): camp sleep kit, field repairs, cargo protection.
    "Flock":      ((0.05, 0.14, 0.30, 1), 0.95),
    "Vinyl":      ((0.02, 0.06, 0.14, 1), 0.5),
    "FoamYellow": ((0.80, 0.52, 0.02, 1), 0.9),
    "FoamSilver": ((0.42, 0.43, 0.44, 1), 0.55),
    "FoamCream":  ((0.70, 0.64, 0.48, 1), 0.95),
    "ShellRed":   ((0.42, 0.04, 0.03, 1), 0.6),
    "RedWool":    ((0.40, 0.03, 0.025, 1), 0.95),
    "BlackWool":  ((0.025, 0.022, 0.02, 1), 0.95),
    "NylonOrange":((0.75, 0.20, 0.02, 1), 0.6),
    "NylonDark":  ((0.05, 0.05, 0.055, 1), 0.7),
    "Nylon":      ((0.035, 0.035, 0.035, 1), 0.55),
    "TapeSilver": ((0.36, 0.37, 0.38, 1), 0.5),
    "Cardboard":  ((0.38, 0.22, 0.09, 1), 0.95),
    "TinRed":     ((0.50, 0.03, 0.02, 1), 0.4),
    "PatchOrange":((0.85, 0.30, 0.03, 1), 0.8),
    "PlasticWhite":((0.78, 0.78, 0.76, 1), 0.45),
    "LabelYellow":((0.85, 0.60, 0.02, 1), 0.6),
    "Bubble":     ((0.55, 0.68, 0.75, 1), 0.2),
    "BubbleSheet":((0.42, 0.55, 0.62, 1), 0.3),
}


def get_material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    col, rough = MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = col; b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = 0.0
    m.diffuse_color = col; m.roughness = rough
    return m


class Builder:
    """Faceted mesh builder (cooking-kit.py pattern) with a current transform `M` for every point."""

    def __init__(self):
        self.bm = bmesh.new(); self.slots = []; self.M = Matrix.Identity(4)

    def _mi(self, mat):
        if mat not in self.slots:
            self.slots.append(mat)
        return self.slots.index(mat)

    def face(self, pts, mat):
        f = self.bm.faces.new([self.bm.verts.new(self.M @ Vector(p)) for p in pts])
        f.material_index = self._mi(mat); f.smooth = False
        return f

    def bar(self, p0, p1, w, mat, h=None, caps=True, up=(0, 0, 1)):
        """Rectangular-section bar between two points (w wide, h thick; h defaults to w)."""
        h = w if h is None else h
        p0, p1 = Vector(p0), Vector(p1)
        ax = (p1 - p0).normalized()
        ref = Vector(up) if abs(ax.dot(Vector(up))) < 0.9 else Vector((0, 1, 0))
        u = ax.cross(ref).normalized(); v = ax.cross(u).normalized()
        ring = lambda c: [c + u * w / 2 + v * h / 2, c - u * w / 2 + v * h / 2, c - u * w / 2 - v * h / 2, c + u * w / 2 - v * h / 2]
        a, t = ring(p0), ring(p1)
        for k in range(4):
            j = (k + 1) % 4
            self.face([a[k], a[j], t[j], t[k]], mat)
        if caps:
            self.face(list(reversed(a)), mat); self.face(t, mat)

    def lathe(self, profile, seg, mat, cap_bottom=True, cap_top=True, phase=0.0):
        """profile: list of (radius, z) bottom->top, faceted ring of `seg` sides about local Z."""
        ang = [phase + 2 * math.pi * k / seg for k in range(seg)]
        pt = lambda r, z, k: (r * math.cos(ang[k]), r * math.sin(ang[k]), z)
        for (ra, za), (rb, zb) in zip(profile, profile[1:]):
            for k in range(seg):
                j = (k + 1) % seg
                if ra == 0 and rb == 0:
                    continue
                if ra == 0:
                    self.face([pt(0, za, k), pt(rb, zb, j), pt(rb, zb, k)], mat)
                elif rb == 0:
                    self.face([pt(ra, za, k), pt(ra, za, j), pt(0, zb, k)], mat)
                else:
                    self.face([pt(ra, za, k), pt(ra, za, j), pt(rb, zb, j), pt(rb, zb, k)], mat)
        if cap_bottom and profile[0][0] > 0:
            self.face([pt(profile[0][0], profile[0][1], k) for k in reversed(range(seg))], mat)
        if cap_top and profile[-1][0] > 0:
            self.face([pt(profile[-1][0], profile[-1][1], k) for k in range(seg)], mat)

    def loft(self, rings, mat, cap_bottom=True, cap_top=True):
        """Connect equal-length point rings in order; cap the ends with n-gons."""
        n = len(rings[0])
        for a, b in zip(rings, rings[1:]):
            for k in range(n):
                j = (k + 1) % n
                self.face([a[k], a[j], b[j], b[k]], mat)
        if cap_bottom:
            self.face(list(reversed(rings[0])), mat)
        if cap_top:
            self.face(rings[-1], mat)

    def hull(self, pts, mat):
        """Convex hull of points — chamfered boxes, lumps, buckles."""
        vs = [self.bm.verts.new(self.M @ Vector(p)) for p in pts]
        ret = bmesh.ops.convex_hull(self.bm, input=vs)
        drop = list({g for g in ret["geom_interior"] + ret["geom_unused"] if isinstance(g, bmesh.types.BMVert)})
        if drop:
            bmesh.ops.delete(self.bm, geom=drop, context="VERTS")
        mi = self._mi(mat)
        for g in ret["geom"]:
            if isinstance(g, bmesh.types.BMFace):
                g.material_index = mi; g.smooth = False

    def cbox(self, c, size, mat, ch=0.0):
        """Chamfered box centred at c, full size (sx, sy, sz), chamfer ch."""
        sx, sy, sz = (s / 2 for s in size)
        pts = []
        for dx in (-1, 1):
            for dy in (-1, 1):
                for dz in (-1, 1):
                    pts += [(c[0] + dx * (sx - ch), c[1] + dy * (sy - ch), c[2] + dz * sz),
                            (c[0] + dx * (sx - ch), c[1] + dy * sy, c[2] + dz * (sz - ch)),
                            (c[0] + dx * sx, c[1] + dy * (sy - ch), c[2] + dz * (sz - ch))]
        self.hull(pts, mat)

    def ribbon(self, pts, out, width, thick, mat):
        """A flat strap along a polyline; `out` is the direction its face looks (constant)."""
        out = Vector(out).normalized()
        P = [Vector(p) for p in pts]
        L, R = [], []
        for i, p in enumerate(P):
            d = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()
            s = d.cross(out).normalized() * width / 2
            L.append(p + s); R.append(p - s)
        inn = lambda q: q - out * thick
        for i in range(len(P) - 1):
            self.face([L[i], R[i], R[i + 1], L[i + 1]], mat)                       # face
            self.face([inn(L[i + 1]), inn(R[i + 1]), inn(R[i]), inn(L[i])], mat)   # back
            self.face([R[i], inn(R[i]), inn(R[i + 1]), R[i + 1]], mat)             # edges
            self.face([L[i + 1], inn(L[i + 1]), inn(L[i]), L[i]], mat)
        self.face([L[0], inn(L[0]), inn(R[0]), R[0]], mat)
        self.face([R[-1], inn(R[-1]), inn(L[-1]), L[-1]], mat)

    def finish(self, name):
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
        me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
        for s in self.slots:
            me.materials.append(get_material(s))
        for p in me.polygons:
            p.use_smooth = False
        ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
        fix_normals(ob)
        return ob


def fix_normals(ob):
    """Orient every face toward open air (cooking-kit.py / freight.py)."""
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


def rrect(w, d, r, z, per=4, cx=0.0, cy=0.0):
    """A rounded rectangle ring at height z: w along X, d along Y, corner radius r."""
    pts = []
    for ci, (sx, sy) in enumerate(((1, 1), (-1, 1), (-1, -1), (1, -1))):
        a0 = ci * math.pi / 2
        for k in range(per + 1):
            a = a0 + (math.pi / 2) * k / per
            pts.append((cx + sx * (w / 2 - r) + r * math.cos(a), cy + sy * (d / 2 - r) + r * math.sin(a), z))
    return pts


# ── Items ────────────────────────────────────────────────────────────────────────────────────────

def build_coffee():
    """A 12 oz paper to-go cup: tapered cup, rolled rim, kraft sleeve, squared-off sip lid."""
    b = Builder(); SEG = 32
    r = lambda z: 0.030 + (0.0455 - 0.030) * z / 0.128
    b.lathe([(0.0285, 0.0), (0.030, 0.002)] + [(r(z), z) for z in (0.02, 0.05, 0.08, 0.11, 0.126)]
            + [(0.0472, 0.129), (0.0472, 0.1325)], SEG, "CupPaper", cap_top=False)
    z0, z1 = 0.034, 0.094
    b.lathe([(r(z0), z0), (r(z0) + 0.0022, z0), (r(z0 + 0.03) + 0.0022, z0 + 0.03), (r(z1) + 0.0022, z1), (r(z1), z1)],
            SEG, "CupSleeve", cap_bottom=False, cap_top=False)
    # Lid: a skirt over the rolled rim with a bead, a flat shelf, then a near-vertical wall up to a
    # squared-off raised band around a recessed flat centre; the sip slot sits on the band at the front.
    b.lathe([(0.0478, 0.1290), (0.0492, 0.1298), (0.0492, 0.1335), (0.0497, 0.1342), (0.0497, 0.1356),
             (0.0492, 0.1362), (0.0444, 0.1366), (0.0434, 0.1478), (0.0426, 0.1488), (0.0372, 0.1488),
             (0.0366, 0.1478), (0.0, 0.1478)], SEG, "CupLid", cap_bottom=False, cap_top=False)
    b.cbox((0.0, -0.0400, 0.1489), (0.011, 0.0035, 0.0006), "Chili", ch=0.0)   # sip slot: coffee showing through
    return b.finish("coffee")


def build_chiliDog():
    """A chili dog in a paper boat: open tray with red trim, split bun, sausage, chili, onions, mustard."""
    b = Builder(); rnd = random.Random(7)
    # Tray: outer shell + inner shell + rim (open top), slanted walls.
    W0, D0, W1, D1, H, T = 0.17, 0.060, 0.205, 0.090, 0.034, 0.002
    def ring(w, d, z): return [(w / 2, d / 2, z), (-w / 2, d / 2, z), (-w / 2, -d / 2, z), (w / 2, -d / 2, z)]
    ob, ot = ring(W0, D0, 0.0), ring(W1, D1, H)
    ib, it = ring(W0 - 2 * T, D0 - 2 * T, T), ring(W1 - 2 * T, D1 - 2 * T, H)
    b.face(list(reversed(ob)), "Tray"); b.face(ib, "Tray")
    for k in range(4):
        j = (k + 1) % 4
        b.face([ob[k], ob[j], ot[j], ot[k]], "Tray")
        b.face([ib[j], ib[k], it[k], it[j]], "Tray")
        b.face([ot[k], ot[j], it[j], it[k]], "TrayTrim")
    tz = 0.024   # trim band just under the rim, proud of the outer wall
    for k in range(4):
        j = (k + 1) % 4
        lo = lambda p: Vector((p[0] * (W0 + (W1 - W0) * tz / H) / W0 * 1.012, p[1] * (D0 + (D1 - D0) * tz / H) / D0 * 1.03, tz))
        hi = lambda p: Vector((p[0] * 1.004, p[1] * 1.012, H - 0.001))
        b.face([lo(ob[k]), lo(ob[j]), hi(ot[j]), hi(ot[k])], "TrayTrim")
    # Bun: two halves lying split along X, each a lathe about X, rolled outward.
    L, R = 0.175, 0.021
    prof = [(0.0, -L / 2), (0.012, -L / 2 + 0.004), (0.018, -L / 2 + 0.014), (R, -L / 2 + 0.035),
            (R, L / 2 - 0.035), (0.018, L / 2 - 0.014), (0.012, L / 2 - 0.004), (0.0, L / 2)]
    for s in (-1, 1):
        b.M = (Matrix.Translation((0, s * 0.017, 0.019)) @ Matrix.Rotation(s * math.radians(14), 4, "X")
               @ Matrix.Diagonal((1, 1, 0.85, 1)) @ Matrix.Rotation(math.pi / 2, 4, "Y"))
        b.lathe(prof, 16, "Bun", cap_bottom=False, cap_top=False)
    # Sausage: a longer capsule, poking out of both ends.
    Ls, Rs = 0.20, 0.0115
    b.M = Matrix.Translation((0, 0, 0.034)) @ Matrix.Rotation(math.pi / 2, 4, "Y")
    b.lathe([(0.0, -Ls / 2), (0.007, -Ls / 2 + 0.002), (Rs, -Ls / 2 + 0.009), (Rs, Ls / 2 - 0.009),
             (0.007, Ls / 2 - 0.002), (0.0, Ls / 2)], 12, "Sausage", cap_bottom=False, cap_top=False)
    b.M = Matrix.Identity(4)
    # Chili: chunky lumps heaped along the sausage.
    for i in range(34):
        x = rnd.uniform(-0.072, 0.072); y = rnd.uniform(-0.012, 0.012)
        z = 0.044 + 0.006 * math.cos(x / 0.072 * math.pi / 2) + rnd.uniform(-0.002, 0.003)
        s = rnd.uniform(0.006, 0.010)
        b.hull([(x + rnd.uniform(-s, s), y + rnd.uniform(-s, s), z + rnd.uniform(-s * 0.6, s * 0.6)) for _ in range(9)], "Chili")
    # Onions: little white dice on top.
    for i in range(18):
        x = rnd.uniform(-0.065, 0.065); y = rnd.uniform(-0.010, 0.010)
        b.cbox((x, y, 0.053 + rnd.uniform(0, 0.003)), (0.005, 0.005, 0.004), "Onion")
    # Mustard: a zigzag line over the top.
    pts = [(-0.07 + 0.0175 * k, 0.009 * (1 if k % 2 else -1), 0.058) for k in range(9)]
    for p, q in zip(pts, pts[1:]):
        b.bar(p, q, 0.0045, "Mustard", h=0.003)
    return b.finish("chiliDog")


def build_spareTire():
    """P235/75R15 on a painted steel wheel: carcass, tread lugs, dished centre, lug holes, vent slots."""
    b = Builder(); SEG = 36
    b.M = Matrix.Translation((0, 0, 0.367)) @ Matrix.Rotation(math.pi / 2, 4, "X")   # standing up, axis along Y
    hw = 0.1175
    b.lathe([(0.192, -hw + 0.02), (0.205, -hw + 0.005), (0.26, -hw - 0.004), (0.315, -hw), (0.345, -hw + 0.012),
             (0.358, -hw + 0.030), (0.358, hw - 0.030), (0.345, hw - 0.012), (0.315, hw), (0.26, hw + 0.004),
             (0.205, hw - 0.005), (0.192, hw - 0.02)], SEG, "Rubber", cap_bottom=False, cap_top=False)
    # Tread lugs: two staggered rows of blocks with a centre groove.
    for k in range(SEG * 2):
        a = 2 * math.pi * k / (SEG * 2)
        for row in (-1, 1):
            if (k + (row > 0)) % 2:
                continue
            zc = row * 0.048
            c, s = math.cos(a), math.sin(a)
            r0, r1 = 0.356, 0.367
            da = math.pi / (SEG * 2) * 0.8
            pts = []
            for aa in (a - da, a + da):
                for rr in (r0, r1):
                    for zz in (zc - 0.040, zc + 0.040):
                        pts.append((rr * math.cos(aa), rr * math.sin(aa), zz + (0.008 * row if rr == r1 else 0)))
            b.hull(pts, "Rubber")
    # Steel wheel: barrel + flanges + dished face, offset toward the viewer (−Y after the turn).
    b.lathe([(0.196, -0.108), (0.188, -0.100), (0.176, -0.092), (0.176, 0.090), (0.188, 0.098), (0.196, 0.106),
             (0.190, 0.110)], SEG, "Steel", cap_bottom=False, cap_top=False)
    b.lathe([(0.176, 0.060), (0.150, 0.066), (0.118, 0.080), (0.090, 0.082), (0.062, 0.078), (0.046, 0.086),
             (0.032, 0.088), (0.0, 0.088)], SEG, "Steel", cap_bottom=False, cap_top=False)
    for k in range(5):   # lug nut holes on a 4.5" PCD
        a = 2 * math.pi * k / 5 + 0.3
        c = (0.057 * math.cos(a), 0.057 * math.sin(a))
        b.M_save = b.M
        b.M = b.M @ Matrix.Translation((c[0], c[1], 0.079))
        b.lathe([(0.0075, 0.0), (0.0075, 0.006)], 8, "SteelDark", cap_bottom=False)
        b.M = b.M_save
    for k in range(6):   # vent slots in the dish
        a = 2 * math.pi * k / 6
        c, s = math.cos(a), math.sin(a)
        b.bar((0.120 * c, 0.120 * s, 0.081), (0.142 * c, 0.142 * s, 0.073), 0.026, "SteelDark", h=0.004)
    b.lathe([(0.0, 0.088), (0.028, 0.088), (0.028, 0.091), (0.0, 0.091)], 16, "SteelDark", cap_bottom=False, cap_top=False)
    b.M = Matrix.Identity(4)
    return b.finish("spareTire")


def build_emergencyGas():
    """A 2 gal RotoPax-style flat pack: rounded slab with the mounting hole, ribs, top handle, black cap."""
    b = Builder()
    W, H, T, C = 0.375, 0.315, 0.100, 0.014
    N = 64
    def outline(w, h, r, cx=0, cz=0):
        out = []
        for k in range(N):
            a = 2 * math.pi * k / N
            dx, dz = math.cos(a), math.sin(a)
            # ray from the centre to a rounded rectangle (superellipse is close enough, faceted anyway)
            p = 6.0
            t = 1.0 / ((abs(dx) / (w / 2)) ** p + (abs(dz) / (h / 2)) ** p) ** (1 / p)
            out.append((cx + dx * t, cz + dz * t))
        return out
    O_full, O_in = outline(W, H, 0), outline(W - 2 * C, H - 2 * C, 0)
    Hc = (0.0, 0.0)
    hole = [(Hc[0] + 0.062 * math.cos(2 * math.pi * k / N), Hc[1] + 0.062 * math.sin(2 * math.pi * k / N)) for k in range(N)]
    hole_c = [(Hc[0] + 0.074 * math.cos(2 * math.pi * k / N), Hc[1] + 0.074 * math.sin(2 * math.pi * k / N)) for k in range(N)]
    zc = H / 2 + 0.01
    P = lambda xz, y: (xz[0], y, xz[1] + zc)
    loops = [(O_in, -T / 2), (O_full, -T / 2 + C), (O_full, T / 2 - C), (O_in, T / 2)]
    for (la, ya), (lb, yb) in zip(loops, loops[1:]):
        for k in range(N):
            j = (k + 1) % N
            b.face([P(la[k], ya), P(la[j], ya), P(lb[j], yb), P(lb[k], yb)], "CanRed")
    hl = [(hole_c, -T / 2), (hole, -T / 2 + 0.012), (hole, T / 2 - 0.012), (hole_c, T / 2)]
    for (la, ya), (lb, yb) in zip(hl, hl[1:]):
        for k in range(N):
            j = (k + 1) % N
            b.face([P(lb[k], yb), P(lb[j], yb), P(la[j], ya), P(la[k], ya)], "CanRed")
    for y, (lo, hi) in ((-T / 2, (O_in, hole_c)), (T / 2, (O_in, hole_c))):
        for k in range(N):
            j = (k + 1) % N
            b.face([P(lo[k], y), P(lo[j], y), P(hi[j], y), P(hi[k], y)], "CanRed")
    # Moulded ribs across both faces, either side of the hole.
    for y in (-T / 2, T / 2):
        s = 1 if y > 0 else -1
        for zz in (-0.105, 0.105):
            for x0 in ((-0.150, -0.085), (0.085, 0.150)):
                b.cbox(((x0[0] + x0[1]) / 2, y + s * 0.003, zc + zz), (x0[1] - x0[0], 0.010, 0.016), "CanRed", ch=0.003)
    # Carry handle along the top, and the black cap on the top-right shoulder.
    top = zc + H / 2
    b.bar((-0.095, 0, top - 0.010), (-0.080, 0, top + 0.040), 0.034, "CanRed", h=0.030)
    b.bar((0.045, 0, top - 0.010), (0.030, 0, top + 0.040), 0.034, "CanRed", h=0.030)
    b.bar((-0.090, 0, top + 0.040), (0.040, 0, top + 0.040), 0.034, "CanRed", h=0.030)
    b.M = Matrix.Translation((0.128, 0, top - 0.012)) @ Matrix.Rotation(math.radians(-18), 4, "Y")
    b.lathe([(0.030, 0.0), (0.030, 0.012), (0.033, 0.014), (0.033, 0.040), (0.030, 0.044), (0.0, 0.046)], 16, "CanBlack", cap_top=False)
    for k in range(16):  # knurl ribs on the cap
        a = 2 * math.pi * (k + 0.5) / 16
        b.bar((0.034 * math.cos(a), 0.034 * math.sin(a), 0.016), (0.034 * math.cos(a), 0.034 * math.sin(a), 0.038), 0.004, "CanBlack")
    b.M = Matrix.Identity(4)
    return b.finish("emergencyGas")


def build_pack():
    """A small canvas book bag: boxy body with rounded top edges, two leather straps buckled over the
    top, leather base, leather-flapped front pocket with two buckled straps, canvas webbing shoulder
    straps on leather tabs, a leather grab loop."""
    b = Builder()
    body = ((0.0, 0.25, 0.085), (0.008, 0.262, 0.097), (0.02, 0.27, 0.10), (0.06, 0.274, 0.104), (0.20, 0.276, 0.106),
            (0.31, 0.276, 0.106), (0.335, 0.272, 0.104), (0.352, 0.262, 0.098), (0.363, 0.246, 0.090), (0.369, 0.228, 0.082))
    b.loft([rrect(w, d, min(0.025, d / 2 - 0.002), z, per=5) for z, w, d in body], "Canvas")
    # Leather base, wrapped a few mm proud of the canvas.
    base = ((0.0, 0.256, 0.091), (0.008, 0.268, 0.103), (0.02, 0.276, 0.106), (0.06, 0.280, 0.110))
    b.loft([rrect(w, d, 0.026, z, per=5) for z, w, d in base], "Leather", cap_top=False)
    # Two leather straps over the top, from the back down the front, buckled above the pocket.
    over = [r for r in body if r[0] >= 0.30]
    path = [(d / 2, z) for z, w, d in over] + [(-d / 2, z) for z, w, d in reversed(over)] + [(-body[4][2] / 2, 0.255)]
    for x in (-0.06, 0.06):
        for (y0, z0), (y1, z1) in zip(path, path[1:]):
            t = Vector((0, y1 - y0, z1 - z0)).normalized(); n = (0, -t.z, t.y)
            b.bar((x, y0, z0), (x, y1, z1), 0.022, "Leather", h=0.004, caps=False, up=n)
        yb, bz = -body[4][2] / 2 - 0.003, 0.290
        for (p, q) in (((x - 0.015, yb, bz - 0.011), (x + 0.015, yb, bz - 0.011)),
                       ((x - 0.015, yb, bz + 0.011), (x + 0.015, yb, bz + 0.011)),
                       ((x - 0.015, yb, bz - 0.011), (x - 0.015, yb, bz + 0.011)),
                       ((x + 0.015, yb, bz - 0.011), (x + 0.015, yb, bz + 0.011))):
            b.bar(p, q, 0.004, "Buckle")
    # Front pocket under a leather flap, two short straps buckled down over it.
    b.cbox((0.0, -0.068, 0.13), (0.20, 0.045, 0.15), "Canvas", ch=0.016)
    b.cbox((0.0, -0.072, 0.197), (0.208, 0.050, 0.030), "Leather", ch=0.010)
    for x in (-0.055, 0.055):
        b.ribbon([(x, -0.0955, 0.192), (x, -0.0935, 0.15), (x, -0.092, 0.095)], (0, -1, 0), 0.018, 0.003, "Leather")
        bz = 0.140
        for (p, q) in (((x - 0.013, -0.098, bz - 0.010), (x + 0.013, -0.098, bz - 0.010)),
                       ((x - 0.013, -0.098, bz + 0.010), (x + 0.013, -0.098, bz + 0.010)),
                       ((x - 0.013, -0.098, bz - 0.010), (x - 0.013, -0.098, bz + 0.010)),
                       ((x + 0.013, -0.098, bz - 0.010), (x + 0.013, -0.098, bz + 0.010))):
            b.bar(p, q, 0.004, "Buckle")
    # Canvas webbing shoulder straps on the back, anchored low on leather tabs; leather grab loop on top.
    for x in (-0.06, 0.06):
        b.ribbon([(x * 0.7, 0.040, 0.350), (x, 0.068, 0.31), (x * 1.1, 0.078, 0.20), (x * 1.25, 0.073, 0.08), (x * 1.3, 0.057, 0.040)],
                 (0, 1, 0), 0.034, 0.006, "CanvasDark")
        b.cbox((x * 1.3, 0.058, 0.036), (0.040, 0.010, 0.032), "Leather", ch=0.003)
    b.ribbon([(-0.03, 0.012, 0.366), (-0.02, 0.016, 0.392), (0.02, 0.016, 0.392), (0.03, 0.012, 0.366)], (0, 1, 0.3), 0.018, 0.004, "Leather")
    return b.finish("pack")


def build_rucksack():
    """An old canvas rucksack: lofted body, top flap, front pocket, leather straps + buckles, haul loop."""
    b = Builder()
    rings = []
    for z, w, d in ((0.0, 0.26, 0.13), (0.008, 0.276, 0.146), (0.02, 0.285, 0.155), (0.06, 0.298, 0.168),
                    (0.10, 0.305, 0.175), (0.17, 0.309, 0.178), (0.24, 0.31, 0.178), (0.30, 0.304, 0.172),
                    (0.36, 0.295, 0.165), (0.40, 0.283, 0.155), (0.42, 0.27, 0.145), (0.445, 0.24, 0.12)):
        rings.append(rrect(w, d, 0.045, z, per=6))
    b.loft(rings, "Canvas")
    # Top flap: a soft lid draped over the top and down the front. A grid of (profile x across)
    # points: the side profile in YZ, its edges drooping into the body as |v|^3 so the flap wraps the
    # shoulders, and its front hem cut short at the corners into a U. Two skins 1 cm apart + a rim.
    prof = [Vector(p) for p in ((0.07, 0.455), (0.02, 0.468), (-0.04, 0.462), (-0.085, 0.440), (-0.098, 0.400),
                                (-0.100, 0.330), (-0.096, 0.300))]
    arc = [0.0]
    for p0, p1 in zip(prof, prof[1:]):
        arc.append(arc[-1] + (p1 - p0).length)
    def at(sv):   # (point, outward normal) on the profile at arc length sv
        k = max(i for i in range(len(arc) - 1) if arc[i] <= sv) if sv < arc[-1] else len(arc) - 2
        p0, p1 = prof[k], prof[k + 1]
        t = (p1 - p0).normalized()
        return p0.lerp(p1, (sv - arc[k]) / (p1 - p0).length), Vector((-t.y, t.x)) * -1
    NU, NV, TH = 12, 10, 0.010
    outer, inner = [], []
    for i in range(NU):
        ro, ri = [], []
        for j in range(NV):
            v = -1 + 2 * j / (NV - 1)
            p, n = at((i / (NU - 1)) * (arc[-1] - 0.06 * v ** 4))
            hw = 0.140 + 0.012 * (i / (NU - 1))
            q = p - n * (0.038 * abs(v) ** 3)
            ro.append((hw * v, q.x, q.y)); ri.append((hw * v * 0.97, q.x - n.x * TH, q.y - n.y * TH))
        outer.append(ro); inner.append(ri)
    for i in range(NU - 1):
        for j in range(NV - 1):
            b.face([outer[i][j], outer[i][j + 1], outer[i + 1][j + 1], outer[i + 1][j]], "CanvasDark")
            b.face([inner[i + 1][j], inner[i + 1][j + 1], inner[i][j + 1], inner[i][j]], "CanvasDark")
    rim = [(0, j) for j in range(NV)] + [(i, NV - 1) for i in range(1, NU)] + \
          [(NU - 1, j) for j in range(NV - 2, -1, -1)] + [(i, 0) for i in range(NU - 2, 0, -1)]
    for (i0, j0), (i1, j1) in zip(rim, rim[1:] + rim[:1]):
        b.face([outer[i0][j0], inner[i0][j0], inner[i1][j1], outer[i1][j1]], "CanvasDark")
    # Front pocket.
    b.cbox((0.0, -0.105, 0.135), (0.215, 0.055, 0.17), "Canvas", ch=0.018)
    b.cbox((0.0, -0.110, 0.205), (0.222, 0.056, 0.035), "CanvasDark", ch=0.012)   # pocket flap
    # Two leather straps: from under the top flap down over the pocket, with buckles.
    for x in (-0.065, 0.065):
        b.ribbon([(x, -0.103, 0.335), (x, -0.104, 0.300), (x, -0.124, 0.230), (x, -0.136, 0.170), (x, -0.135, 0.105)],
                 (0, -1, 0), 0.024, 0.004, "Leather")
        bz = 0.150
        for (p, q) in (((x - 0.017, -0.140, bz - 0.013), (x + 0.017, -0.140, bz - 0.013)),
                       ((x - 0.017, -0.140, bz + 0.013), (x + 0.017, -0.140, bz + 0.013)),
                       ((x - 0.017, -0.140, bz - 0.013), (x - 0.017, -0.140, bz + 0.013)),
                       ((x + 0.017, -0.140, bz - 0.013), (x + 0.017, -0.140, bz + 0.013))):
            b.bar(p, q, 0.005, "Buckle")
    # Shoulder straps on the back, and the haul loop on top.
    for x in (-0.075, 0.075):
        b.ribbon([(x * 0.8, 0.075, 0.420), (x, 0.115, 0.380), (x * 1.15, 0.125, 0.240), (x * 1.3, 0.115, 0.080), (x * 1.3, 0.085, 0.03)],
                 (0, 1, 0), 0.045, 0.008, "Leather")
    b.ribbon([(-0.03, 0.045, 0.452), (-0.02, 0.052, 0.478), (0.02, 0.052, 0.478), (0.03, 0.045, 0.452)], (0, 1, 0.3), 0.020, 0.004, "Leather")
    # Side compression pockets.
    for s in (-1, 1):
        b.cbox((s * 0.158, 0.0, 0.16), (0.04, 0.12, 0.17), "Canvas", ch=0.014)
    return b.finish("rucksack")


def build_bedroll():
    """A rolled wool blanket: stepped spiral ends, cream stripe bands, two leather straps with buckles."""
    b = Builder(); SEG = 20
    R, L = 0.088, 0.56
    b.M = Matrix.Translation((0, 0, R)) @ Matrix.Rotation(math.pi / 2, 4, "Y")
    # Body, with the spiral read from three stepped layers at each end.
    end = [(0.0, -L / 2 + 0.012), (0.030, -L / 2 + 0.012), (0.032, -L / 2 + 0.008), (0.056, -L / 2 + 0.008),
           (0.058, -L / 2 + 0.004), (0.078, -L / 2 + 0.004), (0.080, -L / 2), (R - 0.004, -L / 2), (R, -L / 2 + 0.006)]
    body = end + [(R, L / 2 - 0.006)] + [(r, -z) for r, z in reversed(end)]
    b.lathe(body, SEG, "Wool", cap_bottom=False, cap_top=False)
    # The loose outer edge of the roll: a lip running the length.
    b.M = b.M
    for zz in (-L / 2 + 0.06, L / 2 - 0.10):
        b.lathe([(R - 0.001, zz), (R + 0.0025, zz + 0.002), (R + 0.0025, zz + 0.030), (R - 0.001, zz + 0.032)],
                SEG, "WoolStripe", cap_bottom=False, cap_top=False)
    lip = [(R * math.cos(a), R * math.sin(a)) for a in (math.radians(-60), math.radians(-48))]
    b.face([(lip[0][0], lip[0][1], -L / 2 + 0.006), (lip[1][0] * 1.05, lip[1][1] * 1.05, -L / 2 + 0.006),
            (lip[1][0] * 1.05, lip[1][1] * 1.05, L / 2 - 0.006), (lip[0][0], lip[0][1], L / 2 - 0.006)], "Wool")
    # Two straps around the roll, buckled on the front.
    for zz in (-0.15, 0.15):
        b.lathe([(R + 0.001, zz - 0.014), (R + 0.005, zz - 0.014), (R + 0.005, zz + 0.014), (R + 0.001, zz + 0.014)],
                SEG, "Leather", cap_bottom=False, cap_top=False)
        a = math.radians(-80)
        c, s = math.cos(a), math.sin(a)
        for (p, q) in (((R + 0.006) * c, (R + 0.006) * s),):
            b.cbox((p, q, zz), (0.010, 0.010, 0.034), "Buckle", ch=0.002)
            b.cbox((p * 1.02, q * 1.02, zz + 0.026), (0.008, 0.008, 0.03), "Leather", ch=0.001)
    b.M = Matrix.Identity(4)
    return b.finish("bedroll")


# ── Batch 2 (2026-10-20): sleep kit, field repairs, cargo protection ───────────────────────────────
# Ids squash to the FEAT-121 row title (the dashboard matches thumbnails by name), so each file is
# also the future data/items.js key.

def build_airMattress():
    """A camping air mattress, long along X: vinyl sides, flocked top in six tubes, a pillow bolster, valve."""
    b = Builder()
    L, W, H = 1.88, 0.76, 0.15
    b.loft([rrect(L - 2 * i, W - 2 * i, 0.07 - i, z, per=5) for z, i in ((0.0, 0.03), (0.02, 0.0), (H, 0.0))], "Vinyl")
    for k in range(6):
        y = -W / 2 + (k + 0.5) * W / 6
        b.M = Matrix.Translation((0, y, H - 0.015)) @ Matrix.Rotation(math.pi / 2, 4, "Y")
        x0, x1 = -L / 2 + 0.035, L / 2 - 0.32
        b.lathe([(0.0, x0), (0.045, x0 + 0.01), (W / 12, x0 + 0.04), (W / 12, x1 - 0.04), (0.045, x1 - 0.01), (0.0, x1)],
                12, "Flock", cap_bottom=False, cap_top=False)
    b.M = Matrix.Identity(4)
    b.cbox((L / 2 - 0.17, 0, H + 0.03), (0.28, W - 0.03, 0.12), "Flock", ch=0.05)
    b.M = Matrix.Translation((L / 2 - 0.42, -W / 2, 0.075)) @ Matrix.Rotation(math.pi / 2, 4, "X")
    b.lathe([(0.016, -0.004), (0.016, 0.008), (0.012, 0.010), (0.012, 0.022), (0.0, 0.024)], 12, "Buckle")
    b.M = Matrix.Identity(4)
    return b.finish("airMattress")


def build_sleepingPad():
    """Accordion-folded closed-cell foam: eight panels, yellow/silver faces alternating fold to fold,
    rounded hinges on alternate sides, egg-crate bumps on the top panel."""
    b = Builder()
    N, X, Y, T = 8, 0.51, 0.13, 0.021
    for i in range(N):
        mat = "FoamYellow" if i % 2 else "FoamSilver"
        b.cbox((0.003 * ((i * 7) % 3 - 1), 0, i * T + T / 2), (X, Y, T * 0.96), mat, ch=0.004)
        if i < N - 1:   # the fold to the next panel, on alternating long edges
            s = 1 if i % 2 else -1
            b.M = Matrix.Translation((0, s * (Y / 2 - T * 0.45), (i + 1) * T)) @ Matrix.Rotation(math.pi / 2, 4, "Y")
            b.lathe([(T * 0.92, -X / 2 + 0.002), (T * 0.92, X / 2 - 0.002)], 10, mat)
            b.M = Matrix.Identity(4)
    top = N * T
    for ix in range(17):   # corrugated top face: low rounded ridges across the panel
        x = -0.232 + ix * 0.029
        b.M = Matrix.Translation((x, 0, top - 0.002)) @ Matrix.Rotation(math.pi / 2, 4, "X")
        b.lathe([(0.0085, -Y / 2 + 0.006), (0.0085, Y / 2 - 0.006)], 8, "FoamYellow")
    b.M = Matrix.Identity(4)
    return b.finish("sleepingPad")


def build_deluxeSleepingPad():
    """A thick self-inflating pad rolled tight: red shell, cream foam showing as a spiral at the
    ends, two black compression straps with buckles, a brass valve."""
    b = Builder(); SEG = 24
    R, L = 0.085, 0.66
    b.M = Matrix.Translation((0, 0, R)) @ Matrix.Rotation(math.pi / 2, 4, "Y")
    b.lathe([(0.0, -L / 2), (R - 0.006, -L / 2), (R, -L / 2 + 0.006), (R, L / 2 - 0.006), (R - 0.006, L / 2), (0.0, L / 2)],
            SEG, "ShellRed", cap_bottom=False, cap_top=False)
    for s in (-1, 1):   # foam turns of the roll, a hair proud of each end
        for r0, r1 in ((0.006, 0.022), (0.029, 0.047), (0.054, 0.073)):
            z = s * (L / 2 + 0.0006)
            b.lathe([(r0, z), (r1, z)] if s > 0 else [(r1, z), (r0, z)], SEG, "FoamCream", cap_bottom=False, cap_top=False)
    for zz in (-0.19, 0.19):
        b.lathe([(R + 0.001, zz - 0.013), (R + 0.005, zz - 0.013), (R + 0.005, zz + 0.013), (R + 0.001, zz + 0.013)],
                SEG, "Nylon", cap_bottom=False, cap_top=False)
        a = math.radians(-80)
        b.cbox(((R + 0.007) * math.cos(a), (R + 0.007) * math.sin(a), zz), (0.010, 0.012, 0.036), "Buckle", ch=0.002)
    b.M = b.M @ Matrix.Translation((0.0, -0.064, L / 2))
    b.lathe([(0.009, 0.0), (0.009, 0.010), (0.011, 0.012), (0.011, 0.022), (0.0, 0.023)], 12, "Buckle")
    b.M = Matrix.Identity(4)
    return b.finish("deluxeSleepingPad")


def build_blanket():
    """A folded red wool blanket: four layers with a rounded fold across the front, black bands."""
    b = Builder()
    X, Y, T, N = 0.46, 0.34, 0.022, 4
    jit = ((0.004, -0.002), (-0.005, 0.003), (0.002, 0.004), (-0.003, -0.001))
    for i in range(N):
        b.cbox((jit[i][0], 0.012 + jit[i][1], i * T + T / 2), (X, Y - 0.024, T * 0.98), "RedWool", ch=0.009)
    Hs = N * T
    b.M = Matrix.Translation((0, -Y / 2 + Hs / 2, Hs / 2)) @ Matrix.Rotation(math.pi / 2, 4, "Y")
    b.lathe([(Hs / 2, -X / 2 + 0.006), (Hs / 2, X / 2 - 0.006)], 16, "RedWool")
    XB = (-0.172, -0.057, 0.057, 0.172)   # buffalo check: bands across (over the fold) and along
    for x in XB:
        b.lathe([(Hs / 2 + 0.0015, x - 0.026), (Hs / 2 + 0.0015, x + 0.026)], 16, "BlackWool", cap_bottom=False, cap_top=False)
    b.M = Matrix.Identity(4)
    for x in XB:
        b.cbox((x, 0.012, Hs + 0.0008), (0.052, Y - 0.05, 0.003), "BlackWool")
        b.cbox((x, Y / 2 + 0.0015, Hs / 2), (0.052, 0.004, Hs - 0.006), "BlackWool")
    for y in (-0.045, 0.075):
        b.cbox((0, y, Hs + 0.0014), (X - 0.02, 0.052, 0.003), "BlackWool")
        b.cbox((X / 2 + 0.0015, y, Hs / 2), (0.004, 0.052, Hs - 0.006), "BlackWool")
    return b.finish("blanket")


def build_sleepingBag():
    """A sleeping bag in its stuff sack, standing: orange nylon body pinched by four compression
    straps, dark lid, buckles, drawcord lock and loop on top."""
    b = Builder(); SEG = 32
    prof = ((0.0, 0.092), (0.012, 0.108), (0.035, 0.116), (0.09, 0.119), (0.20, 0.121), (0.31, 0.118), (0.36, 0.111), (0.385, 0.100))
    dip = lambda a: 1 - 0.07 * ((1 + math.cos(4 * (a - math.pi / 4))) / 2) ** 6
    rings = [[(r * dip(2 * math.pi * k / SEG) * math.cos(2 * math.pi * k / SEG),
               r * dip(2 * math.pi * k / SEG) * math.sin(2 * math.pi * k / SEG), z) for k in range(SEG)] for z, r in prof]
    b.loft(rings, "NylonOrange", cap_top=False)
    b.lathe([(0.104, 0.378), (0.100, 0.398), (0.080, 0.414), (0.045, 0.424), (0.0, 0.427)], SEG, "NylonDark", cap_bottom=False)
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        b.M = Matrix.Rotation(a, 4, "Z")
        pts = [(r * 0.93 + 0.003, 0.0, z) for z, r in prof[1:-1]] + [(0.096, 0.0, 0.395)]
        b.ribbon(pts, (1, 0, 0), 0.022, 0.003, "Nylon")
        b.cbox((0.121 * 0.93 + 0.008, 0.0, 0.30), (0.010, 0.030, 0.036), "Nylon", ch=0.003)
        b.cbox((0.121 * 0.93 + 0.013, 0.0, 0.30), (0.004, 0.024, 0.008), "Buckle")
    b.M = Matrix.Identity(4)
    b.cbox((0, 0, 0.436), (0.016, 0.012, 0.020), "Nylon", ch=0.004)
    b.ribbon([(-0.004, 0, 0.444), (-0.012, 0, 0.462), (0.0, 0, 0.472), (0.012, 0, 0.462), (0.004, 0, 0.444)], (0, -1, 0), 0.004, 0.003, "Nylon")
    return b.finish("sleepingBag")


def build_zipTies():
    """A bundle of black nylon zip ties fanned at both ends, heads alternating, cinched by one tie."""
    b = Builder(); rnd = random.Random(11)
    N, HL, zc = 22, 0.15, 0.016
    for i in range(N):
        a = i * 2.39996; r = 0.0105 * math.sqrt((i + 0.5) / N)
        y, z = r * math.cos(a), r * math.sin(a)
        ends = []
        for s in (-1, 1):
            k = 2.6 + rnd.uniform(-0.5, 0.8)
            ends.append((s * (HL + rnd.uniform(-0.01, 0.01)), y * k + rnd.uniform(-0.004, 0.004), max(z * k + zc, 0.0012)))
        mid = (0.0, y, z + zc)
        for e in ends:
            b.bar(mid, e, 0.0062, "Nylon", h=0.0016)
        hx, hy, hz = ends[i % 2]
        b.cbox((hx, hy, hz), (0.010, 0.0090, 0.0072), "Nylon", ch=0.0010)
    b.M = Matrix.Translation((0, 0, zc)) @ Matrix.Rotation(math.pi / 2, 4, "Y")
    b.lathe([(0.0165, -0.0024), (0.0180, -0.0024), (0.0180, 0.0024), (0.0165, 0.0024), (0.0165, -0.0024)], 20, "Nylon",
            cap_bottom=False, cap_top=False)
    b.M = Matrix.Identity(4)
    b.cbox((0, 0, zc + 0.020), (0.0072, 0.008, 0.006), "Nylon", ch=0.0008)
    b.bar((0, 0.002, zc + 0.022), (0.0, -0.012, zc + 0.050), 0.0048, "Nylon", h=0.0013)
    return b.finish("zipTies")


def build_ductTape():
    """A roll of silver duct tape on edge, cardboard core, the loose end lying out along the ground."""
    b = Builder(); SEG = 36
    Ro, Ri, Hw = 0.060, 0.040, 0.024
    b.M = Matrix.Translation((0, 0, Ro)) @ Matrix.Rotation(math.pi / 2, 4, "X")
    b.lathe([(Ri, -Hw), (Ro - 0.003, -Hw), (Ro, -Hw + 0.002), (Ro, Hw - 0.002), (Ro - 0.003, Hw), (Ri, Hw)], SEG, "TapeSilver",
            cap_bottom=False, cap_top=False)
    b.lathe([(Ri + 0.0002, Hw + 0.0006), (0.0345, Hw + 0.0006), (0.0345, -Hw - 0.0006), (Ri + 0.0002, -Hw - 0.0006)], SEG, "Cardboard",
            cap_bottom=False, cap_top=False)
    for r in (0.047, 0.054):   # the wraps, read as faint steps on the faces
        for s in (-1, 1):
            z = s * (Hw + 0.0003)
            b.lathe([(r, z), (r + 0.0012, z)] if s > 0 else [(r + 0.0012, z), (r, z)], SEG, "SteelDark", cap_bottom=False, cap_top=False)
    b.M = Matrix.Identity(4)
    tail = [(-0.012, 0, 0.0012), (0.03, 0, 0.0008), (0.08, 0, 0.0008), (0.11, 0, 0.004), (0.122, 0, 0.012)]
    b.ribbon([(x, 0, z) for x, _, z in tail], (0, 0, 1), 2 * Hw, 0.0008, "TapeSilver")
    return b.finish("ductTape")


def build_tirePatches():
    """A red tin patch kit, lid open: stacks of orange patches, a steel scuffer, and the cement tube."""
    b = Builder()
    X, Y, H, t = 0.10, 0.065, 0.020, 0.0012
    b.cbox((0, 0, t / 2), (X, Y, t), "TinRed")
    for c, s in (((0, -Y / 2 + t / 2, H / 2), (X, t, H)), ((0, Y / 2 - t / 2, H / 2), (X, t, H)),
                 ((-X / 2 + t / 2, 0, H / 2), (t, Y, H)), ((X / 2 - t / 2, 0, H / 2), (t, Y, H))):
        b.cbox(c, s, "TinRed")
    b.cbox((-0.012, 0, H / 2), (t, Y - 2 * t, H * 0.8), "TinRed")    # divider
    for px, py in ((-0.034, -0.016), (-0.034, 0.016), (-0.0, -0.016)):
        for k in range(3):
            b.M = Matrix.Translation((px + 0.0008 * k, py, t + k * 0.0032))
            b.lathe([(0.0125, 0.0), (0.0125, 0.0028)], 16, "PatchOrange")
    b.M = Matrix.Identity(4)
    b.cbox((0.025, 0.012, t + 0.001), (0.032, 0.022, 0.002), "Steel", ch=0.0005)
    b.M = Matrix.Translation((0, Y / 2, H)) @ Matrix.Rotation(math.radians(-14), 4, "X")
    b.cbox((0, t / 2, Y / 2 + 0.001), (X + 0.002, t, Y + 0.002), "TinRed")
    b.cbox((0, -0.002, Y / 2 + 0.001), (X - 0.004, 0.004, Y - 0.004), "TinRed", ch=0.0015)
    b.M = Matrix.Translation((0.004, -Y / 2 - 0.016, 0.0095)) @ Matrix.Rotation(math.pi / 2, 4, "Y")
    b.lathe([(0.004, -0.036), (0.009, -0.028), (0.0095, -0.010), (0.0095, 0.022), (0.006, 0.027), (0.004, 0.030), (0.004, 0.034)],
            16, "Steel", cap_bottom=False, cap_top=False)
    b.lathe([(0.0055, 0.032), (0.0055, 0.045), (0.0, 0.046)], 12, "CanBlack")
    b.cbox((0, 0, -0.040), (0.0025, 0.020, 0.010), "Steel")
    b.lathe([(0.0098, -0.006), (0.0098, 0.014)], 16, "LabelYellow", cap_bottom=False, cap_top=False)
    b.M = Matrix.Identity(4)
    return b.finish("tirePatches")


def build_stopLeak():
    """A bottle of radiator stop-leak: white bottle, yellow label with a red band, knurled black cap."""
    b = Builder(); SEG = 28
    b.lathe([(0.0, 0.0), (0.032, 0.0), (0.036, 0.004), (0.036, 0.128), (0.032, 0.143), (0.022, 0.158), (0.015, 0.166),
             (0.015, 0.176)], SEG, "PlasticWhite", cap_bottom=False, cap_top=False)
    b.lathe([(0.0365, 0.022), (0.0365, 0.116)], SEG, "LabelYellow", cap_bottom=False, cap_top=False)
    b.lathe([(0.0369, 0.080), (0.0369, 0.094)], SEG, "CanRed", cap_bottom=False, cap_top=False)
    b.lathe([(0.0369, 0.036), (0.0369, 0.041)], SEG, "CanBlack", cap_bottom=False, cap_top=False)
    b.lathe([(0.0175, 0.170), (0.0175, 0.197), (0.0145, 0.2005), (0.0, 0.201)], SEG, "CanBlack", cap_bottom=False)
    for k in range(18):
        a = 2 * math.pi * (k + 0.5) / 18
        b.bar((0.018 * math.cos(a), 0.018 * math.sin(a), 0.173), (0.018 * math.cos(a), 0.018 * math.sin(a), 0.195), 0.0025, "CanBlack")
    return b.finish("stopLeak")


def build_bubbleWrap():
    """A roll of bubble wrap on a cardboard core, a sheet unrolled across the ground in front of it."""
    b = Builder(); rnd = random.Random(5)
    R, L, SEG = 0.10, 0.40, 32
    def bubble(p, n, t1, t2, rb=0.0085, hb=0.0055):
        b.hull([p + rb * (math.cos(f) * t1 + math.sin(f) * t2) for f in (2 * math.pi * k / 6 for k in range(6))] + [p + n * hb], "Bubble")
    b.M = Matrix.Translation((0, 0, R)) @ Matrix.Rotation(math.pi / 2, 4, "Y")
    b.lathe([(0.032, -L / 2), (R - 0.004, -L / 2), (R, -L / 2 + 0.004), (R, L / 2 - 0.004), (R - 0.004, L / 2), (0.032, L / 2)],
            SEG, "BubbleSheet", cap_bottom=False, cap_top=False)
    b.lathe([(0.032, L / 2 + 0.008), (0.026, L / 2 + 0.008), (0.026, -L / 2 - 0.008), (0.032, -L / 2 - 0.008), (0.032, L / 2 + 0.008)],
            SEG, "Cardboard", cap_bottom=False, cap_top=False)
    for s in (-1, 1):
        for r in (0.045, 0.060, 0.075, 0.090):
            z = s * (L / 2 + 0.0005)
            b.lathe([(r, z), (r + 0.0025, z)] if s > 0 else [(r + 0.0025, z), (r, z)], SEG, "Bubble", cap_bottom=False, cap_top=False)
    n_around = 30
    for row in range(17):
        z = -L / 2 + 0.018 + row * 0.0215
        for k in range(n_around):
            a = 2 * math.pi * (k + 0.5 * (row % 2)) / n_around
            n = Vector((math.cos(a), math.sin(a), 0)); t1 = Vector((-math.sin(a), math.cos(a), 0)); t2 = Vector((0, 0, 1))
            bubble(Vector((R * n.x, R * n.y, z)), n, t1, t2)
    b.M = Matrix.Identity(4)
    D = 0.20
    b.cbox((0, -D / 2 - 0.005, 0.001), (L - 0.004, D, 0.002), "BubbleSheet")
    for row in range(int(D / 0.0215)):
        y = -0.016 - row * 0.0215
        for k in range(18):
            x = -L / 2 + 0.018 + k * 0.0215 + (0.0107 if row % 2 else 0)
            if x < L / 2 - 0.01:
                bubble(Vector((x, y, 0.002)), Vector((0, 0, 1)), Vector((1, 0, 0)), Vector((0, 1, 0)))
    return b.finish("bubbleWrap")


BUILDERS = {
    "coffee": build_coffee, "chiliDog": build_chiliDog, "spareTire": build_spareTire,
    "emergencyGas": build_emergencyGas, "pack": build_pack, "rucksack": build_rucksack, "bedroll": build_bedroll,
    "airMattress": build_airMattress, "sleepingPad": build_sleepingPad, "deluxeSleepingPad": build_deluxeSleepingPad,
    "blanket": build_blanket, "sleepingBag": build_sleepingBag, "zipTies": build_zipTies, "ductTape": build_ductTape,
    "tirePatches": build_tirePatches, "stopLeak": build_stopLeak, "bubbleWrap": build_bubbleWrap,
}
BATCH2 = ["airMattress", "sleepingPad", "deluxeSleepingPad", "blanket", "sleepingBag",
          "zipTies", "ductTape", "tirePatches", "stopLeak", "bubbleWrap"]


# ── Render rig ───────────────────────────────────────────────────────────────────────────────────

VIEW_DIR = Vector((0.95, -1.35, 0.85)).normalized()   # from the object toward the eye: front-right-above


def fresh_scene():
    bpy.ops.wm.read_homefile(use_empty=True)
    for m in list(bpy.data.materials):
        bpy.data.materials.remove(m)
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.film_transparent = True
    sc.render.resolution_x = sc.render.resolution_y = RES
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    try:
        sc.view_settings.view_transform = "Standard"
    except TypeError:
        pass
    w = bpy.data.worlds.new("Sky"); sc.world = w; w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (0.46, 0.48, 0.50, 1); bg.inputs[1].default_value = 0.8
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 3.4; sun.data.angle = math.radians(8); sun.data.color = (1.0, 0.92, 0.80)
    sun.rotation_euler = (math.radians(40), math.radians(-12), math.radians(-35))
    sc.collection.objects.link(sun)
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    cam.data.type = "ORTHO"
    sc.collection.objects.link(cam); sc.camera = cam
    return sc, cam


def frame(cam, ob, margin=1.12):
    """Aim the ortho camera along −VIEW_DIR and fit the object's bounding box, centred."""
    rot = (-VIEW_DIR).to_track_quat("-Z", "Y")
    right, up = rot @ Vector((1, 0, 0)), rot @ Vector((0, 1, 0))
    corners = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    rs, us = [c.dot(right) for c in corners], [c.dot(up) for c in corners]
    centre = sum(corners, Vector()) / 8
    off = right * ((max(rs) + min(rs)) / 2 - centre.dot(right)) + up * ((max(us) + min(us)) / 2 - centre.dot(up))
    cam.rotation_mode = "QUATERNION"; cam.rotation_quaternion = rot
    cam.location = centre + off + VIEW_DIR * 5.0
    cam.data.ortho_scale = max(max(rs) - min(rs), max(us) - min(us)) * margin
    cam.data.clip_end = 20


def run(item_id):
    sc, cam = fresh_scene()
    ob = BUILDERS[item_id]()
    frame(cam, ob)
    os.makedirs(OUT_DIR, exist_ok=True)
    sc.render.filepath = os.path.join(OUT_DIR, f"{item_id}.png")
    bpy.ops.render.render(write_still=True)
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    print(f"{item_id}: {tris} tris -> {sc.render.filepath}")
    return ob


def run_all():
    for k in BUILDERS:
        run(k)
