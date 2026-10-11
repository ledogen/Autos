"""
Household freight kit — four fragile/freight furniture loads, one generator, one .glb each.

Built for: Blender 5.2  |  Targets: assets/models/<name>.glb  ·  source: assets/models/src/household.blend
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

    wardrobe        ASSET-63  ≤300   tall wardrobe standing, doors shut (the high-CG job)
    upright-piano   ASSET-42  ≤500   upright, lid shut, keyboard showing
    framed-artwork  ASSET-44  ≤250   painting on edge in an open-slat travel crate
    dining-table    ASSET-60  ≤300   inverted on its top, turned legs up

Base-seated, centred; long axis along Blender +Y (= glTF −Z).  FurnWood is the recolour hook
for the wardrobe and table (one of three stains); the piano is PianoBlack.
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix

OUT_DIR = "/Users/ledogen/CodeShit/CarGame/assets/models"
OUT_BLEND = "/Users/ledogen/CodeShit/CarGame/assets/models/src/household.blend"
BUDGETS = {"wardrobe": 500, "upright-piano": 700, "framed-artwork": 500, "dining-table": 600}

MATS = {
    "FurnWood":   ((0.30, 0.14, 0.06, 1), 0.6),
    "FurnDark":   ((0.08, 0.04, 0.02, 1), 0.7),
    "PianoWood":  ((0.26, 0.12, 0.05, 1), 0.3),      # brown finished wood (owner: black was unreadable)
    "KeysBlack":  ((0.02, 0.02, 0.02, 1), 0.4),
    "Brass":      ((0.70, 0.50, 0.15, 1), 0.4),
    "KeysWhite":  ((0.92, 0.90, 0.82, 1), 0.5),
    "CrateWood":  ((0.72, 0.60, 0.40, 1), 0.95),
    "SkyTop":     ((0.22, 0.32, 0.60, 1), 0.9),
    "SkyLow":     ((0.92, 0.58, 0.32, 1), 0.9),
    "Mountain":   ((0.18, 0.20, 0.32, 1), 0.9),
    "Lake":       ((0.28, 0.48, 0.58, 1), 0.9),
    "Hill":       ((0.07, 0.20, 0.08, 1), 0.9),
    "Sun":        ((0.98, 0.88, 0.55, 1), 0.9),
    "Strap":      ((0.09, 0.10, 0.11, 1), 0.45),
}


def get_material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    col, rough = MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = col; b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = 0.0
    m.diffuse_color = col; m.roughness = rough; m.use_backface_culling = name != "Strap"
    return m


class Builder:
    def __init__(self):
        self.bm = bmesh.new(); self.slots = list(MATS)

    def face(self, pts, mat):
        f = self.bm.faces.new([self.bm.verts.new(Vector(p)) for p in pts])
        f.material_index = self.slots.index(mat); f.smooth = False
        return f

    def box(self, lo, hi, mat, skip=(), xform=Matrix.Identity(4)):
        x0, y0, z0 = lo; x1, y1, z1 = hi
        c = [xform @ Vector(p) for p in [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                                         (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]]
        q = {"-z": (0, 3, 2, 1), "+z": (4, 5, 6, 7), "-y": (0, 1, 5, 4), "+x": (1, 2, 6, 5), "+y": (2, 3, 7, 6), "-x": (3, 0, 4, 7)}
        for k, a in q.items():
            if k not in skip:
                self.face([c[i] for i in a], mat)

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

    def lathe(self, profile, seg, mat, cx=0, cy=0, cap_bottom=True, cap_top=True):
        ang = [2 * math.pi * k / seg for k in range(seg)]
        pt = lambda r, z, k: (cx + r * math.cos(ang[k]), cy + r * math.sin(ang[k]), z)
        for (ra, za), (rb, zb) in zip(profile, profile[1:]):
            for k in range(seg):
                j = (k + 1) % seg
                self.face([pt(ra, za, k), pt(ra, za, j), pt(rb, zb, j), pt(rb, zb, k)], mat)
        if cap_bottom:
            self.face([pt(profile[0][0], profile[0][1], k) for k in reversed(range(seg))], mat)
        if cap_top:
            self.face([pt(profile[-1][0], profile[-1][1], k) for k in range(seg)], mat)

    def transform(self, M):
        """Move everything built so far — used to lay a load down, or to put its long axis along
        +Y (the truck's length) when it was easier to author along X."""
        for v in self.bm.verts:
            v.co = M @ v.co

    def rotate_z(self, deg):
        self.transform(Matrix.Rotation(math.radians(deg), 4, 'Z'))

    def finish(self, name):
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
        for s in self.slots:
            me.materials.append(get_material(s))
        for p in me.polygons:
            p.use_smooth = False
        ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
        fix_normals(ob)
        return ob


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
    P = sorted(set((round(a, 5), round(c, 5)) for a, c in P))
    def cross(o, a, b_): return (a[0] - o[0]) * (b_[1] - o[1]) - (a[1] - o[1]) * (b_[0] - o[0])
    hull = []
    for p in reversed(P):
        while len(hull) >= 2 and cross(hull[-2], hull[-1], p) <= 0:
            hull.pop()
        hull.append(p)
    return hull[::-1]


BED_HALF_W = 0.70   # Ranger bed inner half-width (data/vehicle-models.js innerHalfW): every strap
                    # runs out to a tie-down at the bed wall on the floor, so the load reads as
                    # strapped to the TRUCK, not to its own pallet (owner 2026-10-09)
BED_ANCHORS = [(-BED_HALF_W, 0.0), (BED_HALF_W, 0.0)]


def rect_pts(x0, x1, z0, z1, off=0.004):
    return [(x0 - off, z0), (x1 + off, z0), (x1 + off, z1 + off), (x0 - off, z1 + off)]


def hull_strap(b, pts, y, anchors, w=0.03, axis="y"):
    """Double-sided ribbon over the upper hull of a 2D section, anchor to anchor (a tensioned strap)."""
    path = _upper_hull(list(pts) + list(anchors))
    for (a0, c0), (a1, c1) in zip(path, path[1:]):
        if axis == "y":
            b.face([(a0, y - w / 2, c0), (a1, y - w / 2, c1), (a1, y + w / 2, c1), (a0, y + w / 2, c0)], "Strap")
        else:
            b.face([(y - w / 2, a0, c0), (y - w / 2, a1, c1), (y + w / 2, a1, c1), (y + w / 2, a0, c0)], "Strap")



def strap_x(b, lo, hi, xs, t=0.03, s=0.004):
    """Band around the Y/Z section at x=xs (over the top, down both long sides)."""
    _, y0, z0 = lo; _, y1, z1 = hi
    b.box((xs - t / 2, y0 - s, z0 - s), (xs + t / 2, y1 + s, z1 + s), "Strap", skip=("+x", "-x"))


def strap_y(b, lo, hi, ys, t=0.03, s=0.004):
    x0, _, z0 = lo; x1, _, z1 = hi
    b.box((x0 - s, ys - t / 2, z0 - s), (x1 + s, ys + t / 2, z1 + s), "Strap", skip=("+y", "-y"))


# ---------------------------------------------------------------- wardrobe
def build_wardrobe(b):
    """Tall wardrobe, doors shut: carcass on a plinth with bun feet, crown moulding in two steps,
    two doors each with two raised panels, brass knobs and escutcheons, side panels framed,
    three straps (owner 2026-10-09 bar)."""
    W, D, H = 1.2, 0.6, 2.0          # wide across X, doors face +Y
    b.box((-W / 2, -D / 2, 0.10), (W / 2, D / 2, H - 0.08), "FurnWood", skip=("-z",))
    b.box((-W / 2 + 0.02, -D / 2 + 0.02, 0.06), (W / 2 - 0.02, D / 2 - 0.02, 0.10), "FurnDark")                 # plinth
    for sx in (-1, 1):                                                                                          # bun feet
        for sy in (-1, 1):
            b.lathe([(0.035, 0), (0.05, 0.02), (0.045, 0.06)], 6, "FurnDark", sx * (W / 2 - 0.08), sy * (D / 2 - 0.08), cap_bottom=True, cap_top=False)
    b.box((-W / 2 - 0.02, -D / 2 - 0.02, H - 0.08), (W / 2 + 0.02, D / 2 + 0.02, H - 0.04), "FurnDark")         # crown, two steps
    b.box((-W / 2 - 0.04, -D / 2 - 0.04, H - 0.04), (W / 2 + 0.04, D / 2 + 0.04, H), "FurnDark")
    for sx in (-1, 1):                                                                                          # doors, proud, with two raised panels each
        x0, x1 = (0.012, W / 2 - 0.05) if sx > 0 else (-W / 2 + 0.05, -0.012)
        b.box((x0, D / 2, 0.16), (x1, D / 2 + 0.018, H - 0.14), "FurnWood", skip=("-y",))
        for (z0, z1) in ((0.26, 0.95), (1.08, H - 0.26)):
            b.box((x0 + 0.07, D / 2 + 0.018, z0), (x1 - 0.07, D / 2 + 0.032, z1), "FurnWood", skip=("-y",))
            b.box((x0 + 0.055, D / 2 + 0.018, z0 - 0.015), (x1 - 0.055, D / 2 + 0.024, z1 + 0.015), "FurnDark", skip=("-y",))   # panel shadow line
        b.bar((sx * 0.07, D / 2 + 0.032, 1.0), (sx * 0.07, D / 2 + 0.07, 1.0), 0.03, "Brass")
        b.box((sx * 0.07 - 0.02, D / 2 + 0.018, 0.85), (sx * 0.07 + 0.02, D / 2 + 0.024, 0.92), "Brass", skip=("-y",))        # escutcheon
    for sx in (-1, 1):                                                                                          # framed side panels
        xs = sx * (D / 2) ; x = sx * W / 2
        b.box((x - (0 if sx > 0 else 0.012), -D / 2 + 0.06, 0.26), (x + (0.012 if sx > 0 else 0), D / 2 - 0.06, H - 0.26), "FurnWood", skip=("-x" if sx > 0 else "+x",))
    b.box((-W / 2 + 0.012, -D / 2 - 0.004, 0.16), (W / 2 - 0.012, -D / 2 + 0.008, H - 0.14), "FurnDark", skip=("+y",))        # back board
    # two straps over the crown, 4 mm proud of it, straight down to the bed-wall tie-downs either
    # side (owner 2026-10-09); the wardrobe rides lengthwise, doors to one bed side
    sec_y = [(-D / 2 - 0.044, H - 0.04), (D / 2 + 0.044, H - 0.04), (-D / 2 - 0.044, H + 0.004), (D / 2 + 0.044, H + 0.004), (-D / 2, 0.1), (D / 2 + 0.07, 1.0)]
    for xs in (-0.35, 0.35):
        hull_strap(b, sec_y, xs, BED_ANCHORS, axis="x")
    b.rotate_z(90)


# ---------------------------------------------------------------- piano
def build_piano(b):
    L, D, H = 1.5, 0.6, 1.25        # long across X, keyboard faces +Y
    b.box((-L / 2, -D / 2, 0.06), (L / 2, D / 2 - 0.25, H), "PianoWood", skip=("-z",))                      # case
    b.box((-L / 2, D / 2 - 0.25, 0.06), (L / 2, D / 2 - 0.02, 0.70), "PianoWood", skip=("-z",))             # lower front
    b.box((-L / 2, D / 2 - 0.25, 0.70), (L / 2, D / 2, 0.80), "PianoWood")                                   # key bed
    b.box((-L / 2 + 0.08, D / 2 - 0.25 + 0.001, 0.80), (L / 2 - 0.08, D / 2 - 0.03, 0.815), "KeysWhite", skip=("-z",))  # white keys
    n = 0
    for i in range(36):
        if i % 7 in (2, 6):
            continue
        x = -L / 2 + 0.10 + i * (1.34 / 36)
        b.box((x, D / 2 - 0.25 + 0.001, 0.815), (x + 0.018, D / 2 - 0.12, 0.828), "KeysBlack", skip=("-z",))
        n += 1
    # the nameboard over the keys (the open fallboard's front edge): between the key cheeks, not
    # through them (owner 2026-10-09: it was clipping the cheeks).  The keys stay showing — that is
    # the ticket's "keyboard showing" — so it covers the back 13 cm of them, not all of them.
    b.box((-(L / 2 - 0.082), D / 2 - 0.25, 0.83), (L / 2 - 0.082, D / 2 - 0.12, 0.87), "KeysBlack")
    b.box((-L / 2 - 0.02, -D / 2 - 0.02, H), (L / 2 + 0.02, D / 2 - 0.25 + 0.02, H + 0.03), "PianoWood")     # lid
    b.box((-L / 2 + 0.25, D / 2 - 0.25 - 0.015, 0.90), (L / 2 - 0.25, D / 2 - 0.25 + 0.002, 1.08), "PianoWood")   # music desk, proud of the upper panel
    b.box((-L / 2 + 0.20, D / 2 - 0.25 - 0.03, 0.88), (L / 2 - 0.20, D / 2 - 0.25 + 0.002, 0.905), "PianoWood")  # music desk ledge
    for sx in (-1, 1):                                                                                        # key cheeks either end of the keyboard
        b.box((sx * (L / 2 - 0.04) - 0.04, D / 2 - 0.25, 0.80), (sx * (L / 2 - 0.04) + 0.04, D / 2, 0.86), "PianoWood")
    b.box((-0.18, D / 2 - 0.25, 0.06), (0.18, D / 2 - 0.19, 0.16), "PianoWood")                                # pedal lyre block
    for z0 in (0.20, 0.45):                                                                                   # two moulding bands on the lower front
        b.box((-L / 2 - 0.004, D / 2 - 0.02, z0), (L / 2 + 0.004, D / 2 - 0.004, z0 + 0.03), "PianoWood")
    for sx in (-1, 1):                                                                                          # legs + casters
        b.bar((sx * (L / 2 - 0.05), D / 2 - 0.08, 0.0), (sx * (L / 2 - 0.05), D / 2 - 0.08, 0.70), 0.06, "PianoWood")
    for x in (-0.12, 0, 0.12):                                                                                  # pedals
        b.bar((x, D / 2 - 0.25, 0.08), (x, D / 2 - 0.12, 0.10), 0.025, "Brass")
    # two straps over the lid (clear of its overhang), down past the keys to the bed-wall
    # tie-downs (owner 2026-10-09); the piano rides lengthwise, keyboard to one bed side
    yf = D / 2 - 0.25                                                                                           # the upper panel's face
    sec = [(-D / 2 - 0.024, H + 0.034), (yf + 0.024, H + 0.034), (-D / 2 - 0.024, H), (yf + 0.024, H),
           (yf - 0.019, 1.08), (D / 2 - 0.116, 0.87), (D / 2 - 0.026, 0.815), (D / 2 + 0.004, 0.80), (D / 2 + 0.004, 0.70),
           (D / 2, 0.48), (-D / 2 - 0.004, 0.06)]
    for xs in (-0.45, 0.45):
        hull_strap(b, sec, xs, BED_ANCHORS, axis="x")
    b.rotate_z(90)


# ---------------------------------------------------------------- framed artwork
def build_artwork(b):
    """Painting LYING FLAT, face up, in an open-slat travel crate (owner 2026-10-09: on edge it
    would never ride like that).  Authored standing — frame slab, inner moulding step, the canvas
    as a flat-colour evening lake on the face that ends up on top, corner blocks, end rails, three
    narrow slats over the picture and four wide ones under it — then laid on its back, long side
    along the bed, with two straps across it to the bed-wall tie-downs."""
    L, T, H = 1.2, 0.15, 0.9
    fw = 0.06
    b.box((-L / 2 + 0.08, -0.025, 0.08), (L / 2 - 0.08, 0.025, H - 0.08), "FurnWood")                       # frame slab
    b.box((-L / 2 + 0.08 + 0.02, -0.03, 0.08 + 0.02), (L / 2 - 0.08 - 0.02, 0.03, H - 0.08 - 0.02), "FurnDark")   # inner moulding step
    x0, x1, z0, z1 = -L / 2 + 0.08 + fw, L / 2 - 0.08 - fw, 0.08 + fw, H - 0.08 - fw
    W_, H_ = x1 - x0, z1 - z0
    def poly(pts, mat, lift=0.0):
        b.face([(x0 + W_ * u, 0.031 + lift, z0 + H_ * v) for u, v in pts], mat)
    # an evening lake: dusk sky in two bands, a low sun, a mountain range, water, dark hills and a pine
    poly([(0, 0.62), (1, 0.62), (1, 1), (0, 1)], "SkyTop")
    poly([(0, 0.40), (1, 0.40), (1, 0.62), (0, 0.62)], "SkyLow")
    su, sv, sr = 0.68, 0.50, 0.06
    poly([(su + sr * math.cos(2 * math.pi * k / 8), sv + sr * 1.3 * math.sin(2 * math.pi * k / 8)) for k in range(8)], "Sun", 0.0006)
    poly([(0, 0.40), (0.42, 0.40), (0.26, 0.66), (0.12, 0.56)], "Mountain", 0.0012)
    poly([(0.30, 0.40), (0.78, 0.40), (0.60, 0.60), (0.48, 0.52)], "Mountain", 0.0013)
    poly([(0.70, 0.40), (1, 0.40), (1, 0.52), (0.86, 0.56)], "Mountain", 0.0014)
    poly([(0, 0.22), (1, 0.22), (1, 0.40), (0, 0.40)], "Lake", 0.0018)
    poly([(0, 0), (1, 0), (1, 0.22), (0.7, 0.26), (0.4, 0.20), (0.15, 0.27), (0, 0.24)], "Hill", 0.0024)
    poly([(0.14, 0.20), (0.22, 0.20), (0.18, 0.58)], "Hill", 0.0030)                                           # pine
    poly([(0.175, 0.08), (0.185, 0.08), (0.185, 0.24), (0.175, 0.24)], "Hill", 0.0030)
    for sx in (-1, 1):                                                                                      # corner blocks
        for zz in (0.0, H - 0.10):
            b.box((sx * L / 2 - (0.10 if sx > 0 else 0), -T / 2, zz), (sx * L / 2 + (0 if sx > 0 else 0.10), T / 2, zz + 0.10), "CrateWood")
    for sy, slats, sw in ((1, (0.20, 0.44, 0.68), 0.05), (-1, (0.12, 0.32, 0.52, 0.70), 0.07)):           # slats + end uprights a face
        y0, y1 = (T / 2 - 0.02, T / 2) if sy > 0 else (-T / 2, -T / 2 + 0.02)
        for zz in slats:
            b.box((-L / 2, y0, zz), (L / 2, y1, zz + sw), "CrateWood")
        for xx in (-L / 2, L / 2 - 0.08):
            b.box((xx, y0, 0.10), (xx + 0.08, y1, H - 0.10), "CrateWood")
    b.box((-L / 2, -T / 2, H - 0.10), (L / 2, T / 2, H), "CrateWood")                                       # end rails
    b.box((-L / 2, -T / 2, 0), (L / 2, T / 2, 0.03), "CrateWood")
    # lay it on its back (+Y face up), seat it on the floor, centre it, long side along the bed
    b.transform(Matrix.Translation((0, H / 2, T / 2)) @ Matrix.Rotation(math.radians(90), 4, 'X'))
    b.rotate_z(90)
    for ys in (-0.35, 0.35):
        hull_strap(b, rect_pts(-H / 2, H / 2, 0, T), ys, BED_ANCHORS)


# ---------------------------------------------------------------- dining table (inverted)
def build_table(b):
    """Top down, legs up, its 1.6 m length DOWN the bed (+Y) — it is wider than the 1.4 m bed the
    other way (owner 2026-10-10) — so the two straps cross the bed over the top slab and the long
    aprons, between the legs, out to the bed-wall tie-downs."""
    L, W, T = 1.6, 0.9, 0.04
    b.box((-W / 2, -L / 2, 0), (W / 2, L / 2, T), "FurnWood", skip=("-z",))                                     # top, face down
    ap = 0.08
    b.box((-W / 2 + 0.1, -L / 2 + 0.1, T), (-W / 2 + 0.13, L / 2 - 0.1, T + ap), "FurnWood", skip=("-z",))    # long aprons, along the bed
    b.box((W / 2 - 0.13, -L / 2 + 0.1, T), (W / 2 - 0.1, L / 2 - 0.1, T + ap), "FurnWood", skip=("-z",))
    b.box((-W / 2 + 0.13, -L / 2 + 0.1, T), (W / 2 - 0.13, -L / 2 + 0.13, T + ap), "FurnWood", skip=("-z",))  # end aprons
    b.box((-W / 2 + 0.13, L / 2 - 0.13, T), (W / 2 - 0.13, L / 2 - 0.1, T + ap), "FurnWood", skip=("-z",))
    leg = [(0.036, T), (0.036, T + 0.10), (0.048, T + 0.16), (0.030, T + 0.24), (0.034, T + 0.42), (0.046, T + 0.55), (0.024, T + 0.64), (0.024, T + 0.71)]   # turned, 8 facets (owner 2026-10-09 bar)
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.lathe(leg, 8, "FurnWood", sx * (W / 2 - 0.15), sy * (L / 2 - 0.15), cap_bottom=False)
    for ys in (-0.42, 0.42):                             # straps across the top and apron, between the legs (owner: over the top, not the legs)
        pts = [(-W / 2 - 0.004, 0), (W / 2 + 0.004, 0), (-W / 2 - 0.004, T + 0.004), (W / 2 + 0.004, T + 0.004),
               (-W / 2 + 0.1 - 0.004, T + ap + 0.004), (W / 2 - 0.1 + 0.004, T + ap + 0.004)]
        hull_strap(b, pts, ys, BED_ANCHORS)


VARIANTS = [("wardrobe", build_wardrobe), ("upright-piano", build_piano),
            ("framed-artwork", build_artwork), ("dining-table", build_table)]


def evaluated_tris(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = ob.evaluated_get(dg).to_mesh()
    return sum(len(p.vertices) - 2 for p in me.polygons)


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
        print(f"{name}: {evaluated_tris(ob)}/{BUDGETS[name]} tris, dims {tuple(round(v, 2) for v in ob.dimensions)}")
        with bpy.context.temp_override(**_ui_override()):
            bpy.ops.export_scene.gltf(
                filepath=f"{OUT_DIR}/{name}.glb", export_format="GLB",
                export_draco_mesh_compression_enable=False, export_yup=True, export_apply=True,
                export_materials="EXPORT", export_texcoords=False, export_normals=True,
                export_cameras=False, export_lights=False, use_selection=False)
    fresh_scene(); x = 0.0
    for name, fn in VARIANTS:
        ob = build_one(name, fn, x); x += ob.dimensions.x + 1.0
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)


if __name__ == "__main__":
    export()
