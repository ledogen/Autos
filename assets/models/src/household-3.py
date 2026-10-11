"""
Household freight kit 3 — the fragile top end.  One generator, one .glb each.

    glass-panes    ASSET-40  ≤300   six sheet-glass panes on a timber A-frame, strapped; GlassPane is the clear material
    xray-machine   ASSET-45  ≤500   baggage scanner: housing, curtained tunnel, conveyor stubs, console
    sculpture-a    ASSET-43  ≤400   abstract: twisted stack of bronze cubes on a plinth
    sculpture-b    ASSET-43  ≤400   figurative: tapering marble figure, on a plinth

Base-seated, centred; forward −Z (Blender +Y).  Builder and materials are household.py's.
"""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix

OUT_DIR = "/Users/ledogen/CodeShit/CarGame/assets/models"
OUT_BLEND = "/Users/ledogen/CodeShit/CarGame/assets/models/src/household-3.blend"
BUDGETS = {"glass-panes": 600, "xray-machine": 800, "sculpture-a": 400, "sculpture-b": 800}

MATS = {
    "FurnWood":   ((0.30, 0.14, 0.06, 1), 0.6),
    "FurnDark":   ((0.08, 0.04, 0.02, 1), 0.7),
    "PianoBlack": ((0.015, 0.015, 0.016, 1), 0.3),
    "Brass":      ((0.70, 0.50, 0.15, 1), 0.4),
    "KeysWhite":  ((0.92, 0.90, 0.82, 1), 0.5),
    "CrateWood":  ((0.72, 0.60, 0.40, 1), 0.95),
    "Canvas":     ((0.10, 0.30, 0.55, 1), 0.9),
    "Strap":      ((0.09, 0.10, 0.11, 1), 0.45),
    "GlassPane":  ((0.55, 0.75, 0.70, 1), 0.05),
    "GlassEdge":  ((0.65, 0.85, 0.75, 1), 0.3),
    "ScanBeige":  ((0.60, 0.58, 0.50, 1), 0.7),
    "ScanDark":   ((0.03, 0.03, 0.03, 1), 0.9),
    "LeadCurtain": ((0.10, 0.10, 0.11, 1), 1.0),
    "Screen":     ((0.05, 0.25, 0.30, 1), 0.2),
    "Plinth":     ((0.22, 0.22, 0.23, 1), 0.9),
    "Bronze":     ((0.30, 0.18, 0.08, 1), 0.5),
    "Marble":     ((0.80, 0.78, 0.74, 1), 0.4),
}


def get_material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    col, rough = MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = col; b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = 0.0
    if name == "GlassPane":
        b.inputs["Alpha"].default_value = 0.35
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            m.blend_method = 'BLEND'
    m.diffuse_color = col; m.roughness = rough; m.use_backface_culling = name != "Strap"
    return m


class Builder:
    def __init__(self):
        self.bm = bmesh.new(); self.slots = list(MATS)

    def face(self, pts, mat):
        f = self.bm.faces.new([self.bm.verts.new(Vector(p)) for p in pts])
        f.material_index = self.slots.index(mat); f.smooth = False
        return f

    def box(self, lo, hi, mat, skip=(), xform=Matrix.Identity(4), mats=None):
        # lo/hi are normalised per axis: a caller passing a mirrored span (x0 > x1, as the -X
        # conveyor stub did) otherwise builds the box inside-out with its "+x" face at the LOW end
        # — that was the see-through left conveyor (owner 2026-10-09).
        x0, y0, z0 = (min(a, b_) for a, b_ in zip(lo, hi)); x1, y1, z1 = (max(a, b_) for a, b_ in zip(lo, hi))
        c = [xform @ Vector(p) for p in [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                                         (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]]
        q = {"-z": (0, 3, 2, 1), "+z": (4, 5, 6, 7), "-y": (0, 1, 5, 4), "+x": (1, 2, 6, 5), "+y": (2, 3, 7, 6), "-x": (3, 0, 4, 7)}
        for k, a in q.items():
            if k not in skip:
                self.face([c[i] for i in a], (mats or {}).get(k, mat))

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

    def skin(self, rings, mat, cap_bottom=False, cap_top=False):
        """Quads between successive rings of equal point count (rings wound CCW seen from above,
        listed bottom to top, so every face points outward)."""
        n = len(rings[0])
        for r0, r1 in zip(rings, rings[1:]):
            for k in range(n):
                j = (k + 1) % n
                self.face([r0[k], r0[j], r1[j], r1[k]], mat)
        if cap_bottom:
            self.face(list(reversed(rings[0])), mat)
        if cap_top:
            self.face(list(rings[-1]), mat)

    def tube(self, pts, radii, seg, mat, cap_end=True):
        """A bent tapered tube along the polyline `pts` (one radius per station); rings sit
        perpendicular to the averaged tangent at each station, so an elbow stays joined."""
        P = [Vector(p) for p in pts]
        tans = [(P[1] - P[0]).normalized()] + [((P[i + 1] - P[i]).normalized() + (P[i] - P[i - 1]).normalized()).normalized()
                                               for i in range(1, len(P) - 1)] + [(P[-1] - P[-2]).normalized()]
        rings = []
        for c, t, r in zip(P, tans, radii):
            ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((0, 1, 0))
            u = t.cross(ref).normalized(); v = t.cross(u).normalized()
            rings.append([c + (u * math.cos(2 * math.pi * k / seg) + v * math.sin(2 * math.pi * k / seg)) * r for k in range(seg)])
        self.skin(rings, mat, cap_bottom=False, cap_top=cap_end)

    def rotate_z(self, deg):
        """Turn everything built so far about Z — used to put a load's long axis along +Y (the
        truck's length) when it was easier to author it along X."""
        M = Matrix.Rotation(math.radians(deg), 4, 'Z')
        for v in self.bm.verts:
            v.co = M @ v.co

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


def rect_pts(x0, x1, z0, z1, off=0.004):
    return [(x0 - off, z0), (x1 + off, z0), (x1 + off, z1 + off), (x0 - off, z1 + off)]


BED_HALF_W = 0.70   # Ranger bed inner half-width (data/vehicle-models.js innerHalfW): every strap
                    # runs out to a tie-down at the bed wall on the floor, so the load reads as
                    # strapped to the TRUCK, not to its own pallet (owner 2026-10-09)


def hull_strap(b, pts, y, anchors, w=0.03, axis="y"):
    """Double-sided ribbon over the upper hull of a 2D section, anchor to anchor."""
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



# ---------------------------------------------------------------- glass panes
def build_glass(b):
    """Timber A-frame; five panes a side LEAN AGAINST THE OUTSIDE of the legs, their bottom edges
    on felt pad strips outside the foot rails; hull straps (owner 2026-10-09)."""
    L, W, H = 1.4, 0.8, 1.1
    legs_y = W / 2
    for x in (-0.6, 0.0, 0.6):                                        # three A's with a cross tie
        for s_ in (-1, 1):
            b.bar((x, s_ * legs_y, 0), (x, s_ * 0.03, H), 0.05, "CrateWood")
        b.bar((x, -legs_y * 0.55, H * 0.45), (x, legs_y * 0.55, H * 0.45), 0.04, "CrateWood")
    b.bar((-L / 2, 0, H), (L / 2, 0, H), 0.06, "CrateWood")           # ridge
    for s_ in (-1, 1):
        b.bar((-L / 2, s_ * (legs_y - 0.02), 0.03), (L / 2, s_ * (legs_y - 0.02), 0.03), 0.06, "CrateWood")    # foot rails
        y0, y1 = (legs_y + 0.02, legs_y + 0.20) if s_ > 0 else (-legs_y - 0.20, -legs_y - 0.02)
        b.box((-L / 2 + 0.05, y0, 0), (L / 2 - 0.05, y1, 0.03), "Plinth", skip=("-z",))                       # felt pad strip, OUTSIDE
    lean = math.atan2(legs_y - 0.03, H)                               # the legs' angle from vertical
    sec = []
    for s_ in (-1, 1):
        for i in range(5):
            gap = 0.035 + i * 0.03                                     # stand-off from the leg face, growing per pane
            pw, ph = 1.2 - i * 0.04, 1.0 - i * 0.03
            # bottom edge sits on the pad, outside the foot; the pane lies parallel to the leg
            yb = s_ * (legs_y + 0.02 + 0.03 * i + 0.03)
            xf = Matrix.Translation((0, yb, 0.03)) @ Matrix.Rotation(s_ * lean, 4, 'X')
            b.box((-pw / 2, -0.004, 0), (pw / 2, 0.004, ph), "GlassPane", xform=xf,
                  skip=("-z",), mats={"+z": "GlassEdge", "+x": "GlassEdge", "-x": "GlassEdge"})
            top = xf @ Vector((0, 0.004 * s_, ph)); bot = xf @ Vector((0, 0.004 * s_, 0))
            sec += [(top.y + 0.004 * s_, top.z + 0.004), (bot.y + 0.004 * s_, bot.z)]
    sec += [(-0.03, H + 0.034), (0.03, H + 0.034)]
    for xs in (-0.45, 0.45):
        hull_strap(b, sec, xs, [(-W / 2 - 0.26, 0.0), (W / 2 + 0.26, 0.0)], axis="x")


# ---------------------------------------------------------------- x-ray
def build_xray(b):
    L, W, H = 1.6, 0.8, 1.3
    b.box((-L / 2, -W / 2, 0.06), (L / 2, W / 2, H), "ScanBeige", skip=("-z",))
    b.box((-L / 2 + 0.02, -W / 2 + 0.02, H), (L / 2 - 0.02, W / 2 - 0.02, H + 0.04), "ScanBeige")           # stepped top
    b.box((-L / 2 + 0.05, -W / 2 + 0.05, 0), (L / 2 - 0.05, W / 2 - 0.05, 0.06), "ScanDark", skip=("-z",))
    for sx in (-1, 1):                                                 # tunnel mouths, curtains, conveyor stubs with rollers
        x = sx * (L / 2 + 0.003)
        b.face([(x, -0.3, 0.75), (x, 0.3, 0.75), (x, 0.3, 1.2), (x, -0.3, 1.2)][:: (1 if sx > 0 else -1)], "ScanDark")
        hide = "-x" if sx > 0 else "+x"                                # the face against the housing
        for k in range(5):
            y0 = -0.3 + k * 0.12
            b.box((sx * L / 2, y0 + 0.01, 0.80), (sx * (L / 2 + 0.01), y0 + 0.11, 1.2), "LeadCurtain", skip=(hide,))
        # conveyor stub, three stacked parts that share no face (owner 2026-10-09: the old belt and
        # rails overlapped and fought): dark under-frame, beige side rails on its edges, belt between
        # the rails 5 mm clear of them, rollers resting on the belt
        xa, xb = sx * L / 2, sx * (L / 2 + 0.38)
        b.box((xa, -0.32, 0.62), (xb, 0.32, 0.70), "ScanDark", skip=(hide,))
        for sy in (-1, 1):
            b.box((xa, sy * 0.30, 0.70), (xb, sy * 0.32, 0.78), "ScanBeige", skip=(hide, "-z"))
        b.box((xa, -0.295, 0.70), (xb, 0.295, 0.735), "ScanDark", skip=(hide, "-z"))
        for k in range(5):
            xr = sx * (L / 2 + 0.06 + k * 0.07)
            b.bar((xr, -0.29, 0.75), (xr, 0.29, 0.75), 0.03, "LeadCurtain")
        for sy in (-1, 1):                                             # stub legs, ending inside the frame
            b.bar((sx * (L / 2 + 0.36), sy * 0.28, 0.0), (sx * (L / 2 + 0.36), sy * 0.28, 0.64), 0.03, "ScanDark")
    b.box((-0.4, -W / 2 - 0.02, H + 0.04), (0.2, -0.1, H + 0.12), "ScanBeige")                                 # console base
    tilt = Matrix.Translation((0, -0.3, H + 0.12)) @ Matrix.Rotation(math.radians(-15), 4, 'X') @ Matrix.Translation((0, 0.3, -H - 0.12))
    b.box((-0.35, -W / 2 - 0.02, H + 0.12), (0.15, -0.15, H + 0.42), "ScanBeige", xform=tilt)                   # monitor housing
    b.box((-0.33, -W / 2 - 0.02 - 0.006, H + 0.14), (0.13, -W / 2 - 0.02, H + 0.40), "ScanDark", xform=tilt, skip=("+y",))   # bezel frame
    b.box((-0.31, -W / 2 - 0.02 - 0.009, H + 0.16), (0.11, -W / 2 - 0.02 - 0.006, H + 0.38), "Screen", xform=tilt, skip=("+y",))  # screen inside the bezel
    b.bar((-0.1, -W / 2 - 0.08, H + 0.12), (-0.1, -W / 2 - 0.08, H + 0.02), 0.02, "ScanDark")                   # a cable tail
    for xs in (-0.55, 0.55):
        hull_strap(b, rect_pts(-W / 2, W / 2, 0.06, H + 0.04), xs, [(-BED_HALF_W, 0), (BED_HALF_W, 0)], axis="x")
    b.rotate_z(90)      # 1.6 m long: rides lengthwise (long axis +Y), so the straps cross the bed


# ---------------------------------------------------------------- sculptures
def plinth(b):
    # the lower block keeps its bottom face: with it open, fix_normals saw the top face's centre
    # covered by the upper block and its underside open to the floor, and flipped the top face
    # inside-out (owner 2026-10-09: "inverted face on top of the lower base")
    b.box((-0.4, -0.4, 0), (0.4, 0.4, 0.12), "Plinth")
    b.box((-0.3, -0.3, 0.12), (0.3, 0.3, 0.30), "Plinth", skip=("-z",))


def plinth_straps(b):
    """Two straps over the stepped plinth, 4 mm proud of its faces, out to the bed-wall tie-downs."""
    pts = rect_pts(-0.4, 0.4, 0, 0.12) + rect_pts(-0.3, 0.3, 0.12, 0.30)
    for ys in (-0.2, 0.2):
        hull_strap(b, pts, ys, [(-BED_HALF_W, 0), (BED_HALF_W, 0)])


def build_sculpture_a(b):
    """Abstract bronze: eleven slabs rising in a twist, each thinner and more rotated, on a plinth."""
    plinth(b)
    z = 0.30
    for i in range(11):
        s_ = 0.34 - i * 0.02
        xf = Matrix.Translation((0.02 * math.sin(i * 0.9), 0.02 * math.cos(i * 0.7), z)) @ Matrix.Rotation(math.radians(i * 17), 4, 'Z') @ Matrix.Rotation(math.radians(4), 4, 'X')
        b.box((-s_ / 2, -s_ / 6, 0), (s_ / 2, s_ / 6, 0.075), "Bronze", xform=xf)
        z += 0.07
    plinth_straps(b)


# Facet directions round every ring of the figure, packed toward the face (+Y = 90°) so a nose is
# one facet wide (±13°, 1.8 cm at the head's radius) and the eye sockets sit at ±32°, while the back
# of the head gets by with three.  Index names used by the face below:
#   C = dead ahead · N = ±13° (nose flanks) · E = ±32° (eyes) · K = ±58° (cheekbones / temples)
#   S = ±90° (sides) · B = the five at the back
ANG = [90, 103, 122, 148, 180, 215, 248, 270, 292, 325, 0, 32, 58, 77]
C, N, E, K, S, B = 0, (1, 13), (2, 12), (3, 11), (4, 10), (5, 6, 7, 8, 9)


def ring(r, z, sx=1.0, sy=1.0, bump=None):
    """One ring on an ellipse (r·sx by r·sy) at height z, one point per ANG entry; `bump` scales
    the radius per facet index, which is how the face is carved INTO the head instead of glued on."""
    out = []
    for k, deg in enumerate(ANG):
        a = math.radians(deg)
        m = (bump or {}).get(k, 1.0)
        out.append(Vector((r * sx * m * math.cos(a), r * sy * m * math.sin(a), z)))
    return out


def bumps(**groups):
    """{'C': 1.2, 'N': 1.05, 'E': 0.9, ...} → per-index multipliers."""
    out = {}
    for name, m in groups.items():
        idx = {"C": (C,), "N": N, "E": E, "K": K, "S": S, "B": B}[name]
        for k in idx:
            out[k] = m
    return out


def build_sculpture_b(b):
    """Figurative marble: a woman standing in a long gown, arms folded, hair drawn back into a bun.
    Every surface is ONE faceted skin — the gown and torso are an oval column (shallower front to
    back), the head is a single ring stack with the brow, eye sockets, nose, lips and chin pushed
    in or out on the facets that are already there (owner 2026-10-09: a low-poly face, not a
    low-poly head with features stuck on).  Head 0.19 m, neck 0.055 m long and 0.10 m across, so
    the neck reads as a neck; shoulders 0.33 m across, 6.6 heads tall."""
    plinth(b)
    SX, SY = 1.0, 0.72                                                      # the body's plan: wide, shallow
    gown = [(0.215, 0.30), (0.195, 0.36), (0.155, 0.62), (0.175, 0.86), (0.125, 1.02), (0.148, 1.15),
            (0.165, 1.235), (0.125, 1.28), (0.062, 1.30)]                   # hem, knees, hips, waist, bust, shoulders, slope, neck root
    body = [ring(r, z, SX, SY) for r, z in gown]
    neck = [ring(0.052, 1.31, 0.95, 1.0), ring(0.048, 1.345, 0.95, 1.0)]
    HX, HY = 0.90, 1.0                                                      # the head is deeper than it is wide
    hair = bumps(B=1.10, S=1.05)                                            # the hair mass over the back half
    head = [
        ring(0.052, 1.355, HX, HY, bumps(C=1.12, N=1.08, E=1.02)),                       # jaw: chin forward
        ring(0.068, 1.385, HX, HY, bumps(C=1.05, N=1.03, E=0.98)),                       # mouth: lips proud, corners in
        ring(0.075, 1.415, HX, HY, bumps(C=1.17, N=1.06, E=1.0, K=1.03)),                # nose tip, cheekbones a touch
        ring(0.078, 1.448, HX, HY, bumps(C=1.05, N=1.0, E=0.88, K=1.0, B=1.06)),         # eye line: bridge out, sockets dished
        ring(0.077, 1.475, HX, HY, bumps(C=1.04, N=1.04, E=1.04, K=1.02, B=1.10, S=1.05)),   # brow ridge over the sockets, hair behind
        ring(0.070, 1.505, HX, HY, hair),                                                # forehead
        ring(0.046, 1.530, HX, HY, hair),                                                # crown
        ring(0.016, 1.542, HX, HY),
    ]
    b.skin(body + neck + head, "Marble", cap_bottom=False, cap_top=True)
    b.lathe([(0.0, 1.43), (0.036, 1.44), (0.05, 1.47), (0.036, 1.50), (0.0, 1.51)], 8, "Marble", 0.0, -0.088, cap_bottom=False, cap_top=False)   # bun, half sunk into the hair
    # arms folded: upper arm down the side of the torso to the elbow, forearms crossing in front,
    # the right one lying over the left; one tapered 6-sided tube each, the hand as the tip
    b.tube([(0.12, 0.0, 1.215), (0.19, 0.07, 1.03), (-0.06, 0.165, 1.095), (-0.14, 0.15, 1.125)], [0.046, 0.040, 0.034, 0.018], 6, "Marble")
    b.tube([(-0.12, 0.0, 1.215), (-0.19, 0.07, 1.03), (0.06, 0.13, 1.04), (0.14, 0.115, 1.07)], [0.046, 0.040, 0.034, 0.018], 6, "Marble")
    plinth_straps(b)


VARIANTS = [("glass-panes", build_glass), ("xray-machine", build_xray),
            ("sculpture-a", build_sculpture_a), ("sculpture-b", build_sculpture_b)]


def evaluated_tris(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = ob.evaluated_get(dg).to_mesh()
    return sum(len(p.vertices) - 2 for p in me.polygons)


def check_normals(ob, samples=400):
    """Scene rays from above the horizon must land on faces whose normals face the ray (an
    inside-out face is see-through under backface culling)."""
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
        hit, bad = check_normals(ob)
        print(f"{name}: {evaluated_tris(ob)}/{BUDGETS[name]} tris, {bad} inverted of {hit}, dims {tuple(round(v, 2) for v in ob.dimensions)}")
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
