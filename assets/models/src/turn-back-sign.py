"""
ASSET-77 — the TURN-BACK SIGN.  Parametric generator: one board on two stakes, one .glb per wording.

Built for: Blender 5.2  |  generator + .blend in assets/models/src/, the .glbs in assets/models/.
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

The camp's demolition line (FEAT-65): boards that keep appearing overnight on the roads near the wall,
and nobody admits putting them up.  Hand-made, not municipal: a sheet of 12 mm ply cut by hand saw
(every edge wanders, the top runs out of square, one corner split and bent back), house paint brushed
on short of the edges, the words lettered freehand and running out of room, screwed to two 2x2 stakes
driven at a lean.  The words are the one image (ART-STYLE's sign exception); everything else is flat.

    TurnBackSign   one mesh, 4 materials (SignFace textured, SignPly, SignStake, SignScrew)

PACKAGING.  The road-sign / mailbox rule: a wording is a .glb of its own (turn-back-sign.glb,
turn-back-sign-keep-out.glb, ...), so a spawner brings in one board, not a set.  A palette variant only
recolours, it cannot swap lettering.  The words are the owner's (2026-11-06); paint and ink are ours.

AXES.  Blender +Y = glTF -Z = forward = the painted face, toward oncoming traffic.  Base-seated: the
stakes stand on z = 0, origin centred between them.  The whole sign is a debris body when hit
(demolition.js), so nothing in the file is ground dressing: it would fly off with the board.

Headless (never the owner's GUI Blender):
    /Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 \\
        --python assets/models/src/turn-back-sign.py -- [export] [preview] [render]

export writes the four .glbs + the .blend; preview (Workbench) and render (EEVEE) write review images
to the git-invisible wip/turn-back-sign/out/.
"""

import bpy
import bmesh
import math
import os
import random
import sys
from mathutils import Vector, Matrix

NAME = "turn-back-sign"
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OUT_DIR = f"{REPO}/assets/models"
OUT_BLEND = f"{OUT_DIR}/src/{NAME}.blend"
RENDER_DIR = f"{REPO}/wip/{NAME}/out"
TRI_BUDGET = 600
TEX_W, TEX_H = 576, 384                                    # the board's 3:2, 640 px/m

# ---------------------------------------------------------------------------
# PARAMETERS (metres, Blender axes)
# ---------------------------------------------------------------------------
W, H, T = 0.90, 0.60, 0.012          # the ply sheet
Z0 = 0.62                            # board bottom edge above the ground
SAW_STEP, SAW_JIT = 0.06, 0.0035     # hand-saw wander along every edge
SKEW = (-0.008, 0.005)               # the top edge's height error at -X and +X ends
STAKE, STAKE_X, STAKE_TOP = 0.038, 0.30, 1.30   # 2x2 (38 mm actual), centres +-x, height
MUSH = 0.004                         # how far the sledge mushroomed the stake tops
LEAN_BACK, LEAN_SIDE = 4.0, 2.5      # degrees: top leans away from traffic, and to +X
# the split: viewer's top-right corner (Blender -X).  The crack runs from the top edge in to the
# side edge; the corner beyond it is bent back about the crack's chord.
CRACK = [(-W / 2 + 0.165, H), (-W / 2 + 0.120, H - 0.045), (-W / 2 + 0.075, H - 0.070),
         (-W / 2 + 0.030, H - 0.115), (-W / 2, H - 0.135)]
CRACK_GAP, CRACK_BEND = 0.003, 14.0  # m opened at the crack, degrees bent back
SCREW_R, SCREW_H = 0.007, 0.004
SCREWS = [(sx * STAKE_X, z) for sx in (-1, 1) for z in (0.10, H - 0.10)]

YB = STAKE / 2                       # board back face: the stakes' front faces
YF = YB + T                          # the painted face

FONT = "/System/Library/Fonts/Supplemental/Chalkduster.ttf"
# key suffix -> (lines, paint behind the words or None for bare ply, ink, seed)
WORDINGS = {
    "-keep-out": (("KEEP", "OUT"), None, "black", 2),
    "":          (("TURN", "BACK"), "white", "red", 1),
    "-beware":   (("BEWARE",), "red", "white", 4),
    "-no-entry": (("NO", "ENTRY"), "blue", "black", 3),
}
INK = {                                # linear RGB
    "ply":   (0.430, 0.300, 0.165),
    "grain": (0.330, 0.215, 0.110),
    "white": (0.760, 0.740, 0.690),
    "red":   (0.420, 0.030, 0.022),
    "blue":  (0.200, 0.300, 0.400),
    "black": (0.022, 0.020, 0.019),
}
MATS = {                               # name: (linear colour or None = the baked face, roughness)
    "SignFace":  (None, 0.85),
    "SignPly":   ((*INK["ply"], 1.0), 0.90),
    "SignStake": ((0.470, 0.400, 0.270, 1.0), 0.90),
    "SignScrew": ((0.090, 0.090, 0.095, 1.0), 0.50),
}

X_, Y_, Z_ = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))


# ---------------------------------------------------------------------------
# Geometry accumulator
# ---------------------------------------------------------------------------
class Part:
    def __init__(self, name):
        self.name, self.v, self.f, self.m, self.uv = name, [], [], [], []

    def face(self, pts, mat, out, uv=None):
        """One polygon, wound so its normal points along `out`; uv is per point (or none)."""
        pts = [Vector(p) for p in pts]
        uv = list(uv) if uv else [(0.0, 0.0)] * len(pts)
        n = Vector()
        for i, a in enumerate(pts):          # Newell normal: robust for any planar polygon
            b = pts[(i + 1) % len(pts)]
            n += Vector(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x),
                         (a.x - b.x) * (a.y + b.y)))
        if n.dot(Vector(out)) < 0:
            pts.reverse()
            uv.reverse()
        o = len(self.v)
        self.v.extend(tuple(p) for p in pts)
        self.f.append(list(range(o, o + len(pts))))
        self.m.append(mat)
        self.uv.append(uv)


def solid(p, bot, top, mat, skip=()):
    """Convex prism between two matching rings; each face points away from the centroid."""
    bot, top = [Vector(v) for v in bot], [Vector(v) for v in top]
    c = sum(bot + top, Vector()) / (2 * len(bot))
    n = len(bot)
    for i in range(n):
        q = [bot[i], bot[(i + 1) % n], top[(i + 1) % n], top[i]]
        p.face(q, mat, sum(q, Vector()) / 4 - c)
    if "bot" not in skip:
        p.face(bot, mat, sum(bot, Vector()) / n - c)
    if "top" not in skip:
        p.face(top, mat, sum(top, Vector()) / n - c)


def face_uv(x, z):
    """Board (x, z) -> atlas (u, v).  Seen from the road +X is the reader's LEFT, so u runs to -X."""
    return ((W / 2 - x) / W, z / H)


def slab(p, outline, xf=Matrix.Identity(4)):
    """The ply: painted front (textured), bare back, sawn edges.  outline is board (x, z)."""
    P = lambda x, z, y: tuple(xf @ Vector((x, y, Z0 + z)))
    out = lambda v: (xf.to_3x3() @ Vector(v))
    p.face([P(x, z, YF) for x, z in outline], "SignFace", out(Y_), [face_uv(x, z) for x, z in outline])
    p.face([P(x, z, YB) for x, z in outline], "SignPly", out(-Y_))
    cx = sum(x for x, _ in outline) / len(outline)
    cz = sum(z for _, z in outline) / len(outline)
    for (ax, az), (bx, bz) in zip(outline, outline[1:] + outline[:1]):
        dx, dz = bx - ax, bz - az
        n = Vector((dz, 0, -dx))
        if n.dot(Vector(((ax + bx) / 2 - cx, 0, (az + bz) / 2 - cz))) < 0:
            n = -n                   # outward for this outline (convex enough at every edge)
        p.face([P(ax, az, YB), P(bx, bz, YB), P(bx, bz, YF), P(ax, az, YF)], "SignPly", out(n))


def sawn(a, b, rng):
    """Points from a toward b (b excluded), wandering off the line like a hand-saw cut."""
    a, b = Vector(a), Vector(b)
    n = max(1, round((b - a).length / SAW_STEP))
    perp = Vector((-(b - a).y, (b - a).x)).normalized()
    pts = [tuple(a)]
    for k in range(1, n):
        q = a.lerp(b, k / n) + perp * rng.uniform(-SAW_JIT, SAW_JIT)
        pts.append(tuple(q))
    return pts


def outlines(rng):
    """The board less its split corner, and the corner piece, both in board (x, z)."""
    zt = lambda x: H + SKEW[0] + (SKEW[1] - SKEW[0]) * (x + W / 2) / W
    c0, c1 = CRACK[0], CRACK[-1]
    top0 = (c0[0], zt(c0[0]))
    crack = [top0] + CRACK[1:-1] + [c1]
    board = (sawn((-W / 2, 0), (W / 2, 0), rng) + sawn((W / 2, 0), (W / 2, zt(W / 2)), rng)
             + sawn((W / 2, zt(W / 2)), top0, rng) + crack[:-1] + sawn(c1, (-W / 2, 0), rng))
    # the corner: its own side of the crack, pulled back by the gap toward the corner
    corner_pt = Vector((-W / 2, zt(-W / 2)))
    pulled = [tuple(Vector(q) + (corner_pt - Vector(q)).normalized() * CRACK_GAP) for q in crack]
    piece = list(reversed(pulled)) + [tuple(corner_pt)]
    return board, piece, (Vector(top0), Vector(c1))


def stake(p, x):
    s = STAKE / 2
    sq = lambda r, z: [(x - r, -r, z), (x + r, -r, z), (x + r, r, z), (x - r, r, z)]
    # the sledge mushroomed the top: a flare 2 cm down, a beaten-in bevel on the top edge
    rings = [sq(s, 0.0), sq(s, STAKE_TOP - 0.025), sq(s + MUSH, STAKE_TOP - 0.008), sq(s - 0.002, STAKE_TOP)]
    for a, b in zip(rings, rings[1:]):
        solid(p, a, b, "SignStake", skip={"bot", "top"})
    p.face(rings[-1], "SignStake", Z_)


def screw(p, x, z):
    """A round head: an 8-gon collar on the face, domed to a point."""
    n, y0 = 8, YF
    ring = lambda r, y: [(x + r * math.cos(2 * math.pi * k / n), y, Z0 + z + r * math.sin(2 * math.pi * k / n))
                         for k in range(n)]
    a, b = ring(SCREW_R, y0), ring(SCREW_R * 0.8, y0 + SCREW_H * 0.6)
    solid(p, a, b, "SignScrew", skip={"bot", "top"})
    apex = (x, y0 + SCREW_H, Z0 + z)
    for k in range(n):
        p.face([b[k], b[(k + 1) % n], apex], "SignScrew", Y_)


def build_part(seed):
    rng = random.Random(seed)
    p = Part("TurnBackSign")
    board, piece, (h0, h1) = outlines(rng)
    slab(p, board)
    # the corner, bent back about the crack's chord (a hinge in board (x, z) at the back face)
    a3, b3 = Vector((h0.x, YB, Z0 + h0.y)), Vector((h1.x, YB, Z0 + h1.y))
    axis = (b3 - a3).normalized()
    if axis.dot(Vector((-1, 0, -1))) < 0:
        axis = -axis
    bend = Matrix.Translation(a3) @ Matrix.Rotation(math.radians(CRACK_BEND), 4, axis) @ Matrix.Translation(-a3)
    if (bend @ Vector((-W / 2, YF, Z0 + H))).y > YF:            # make sure it bends AWAY from the road
        bend = (Matrix.Translation(a3) @ Matrix.Rotation(-math.radians(CRACK_BEND), 4, axis)
                @ Matrix.Translation(-a3))
    slab(p, piece, bend)
    for sx in (-1, 1):
        stake(p, sx * STAKE_X)
    for x, z in SCREWS:
        screw(p, x, z)
    return p


# ---------------------------------------------------------------------------
# The painted face: an orthographic render of flat emitters (general-store.py's rig)
# ---------------------------------------------------------------------------
def _emission(name, col):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    e = nt.nodes.new('ShaderNodeEmission')
    e.inputs[0].default_value = (*col, 1.0)
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(e.outputs[0], o.inputs[0])
    return m


def bake_face(key, lines, paint, ink, seed):
    """Drawn in READER metres: rx = W/2 - x (left to right as read from the road), rz = z."""
    rng = random.Random(seed * 101)
    engines = {i.identifier for i in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items}
    sc = bpy.data.scenes.new("FaceBake")
    sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engines else 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = TEX_W, TEX_H
    sc.render.resolution_percentage = 100
    sc.render.dither_intensity = 0.0
    for k in dir(sc.render):                  # no stamp metadata: re-exports stay byte-identical
        if k.startswith("use_stamp_"):
            setattr(sc.render, k, False)
    sc.view_settings.view_transform = 'Standard'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGB'
    cd = bpy.data.cameras.new("FaceCam")
    cd.type, cd.ortho_scale = 'ORTHO', W
    cam = bpy.data.objects.new("FaceCam", cd)
    cam.location = (W / 2, H / 2, 5.0)
    sc.collection.objects.link(cam)
    sc.camera = cam
    junk, mats, layer = [], [], [0]

    def zl():
        layer[0] += 1
        return layer[0] * 0.001

    def poly(pts, col):
        me = bpy.data.meshes.new("a")
        z = zl()
        me.from_pydata([(u, v, z) for u, v in pts], [], [list(range(len(pts)))])
        o = bpy.data.objects.new("a", me)
        m = _emission("a", INK[col] if isinstance(col, str) else col)
        mats.append(m)
        me.materials.append(m)
        sc.collection.objects.link(o)
        junk.append(o)

    def shade(col, k):
        return tuple(min(1.0, c * k) for c in INK[col])

    # bare ply and its grain
    poly([(0, 0), (W, 0), (W, H), (0, H)], "ply")
    for i in range(9):
        zc, amp, th = rng.uniform(0.02, H - 0.02), rng.uniform(0.004, 0.012), rng.uniform(0.002, 0.006)
        xs = [W * k / 12 for k in range(13)]
        wave = [(x, zc + amp * math.sin(x * rng.uniform(6, 14) + rng.uniform(0, 6))) for x in xs]
        poly(wave + [(x, z + th) for x, z in reversed(wave)], "grain")
    # the coat, brushed short of the edges, in three passes of slightly different load
    if paint:
        def ragged(inset):
            pts = []
            for (ax, az), (bx, bz) in (((0, 0), (W, 0)), ((W, 0), (W, H)), ((W, H), (0, H)), ((0, H), (0, 0))):
                n = 14
                for k in range(n):
                    t = k / n
                    x, z = ax + (bx - ax) * t, az + (bz - az) * t
                    d = inset + rng.uniform(0.0, 0.022)
                    x = min(max(x, d), W - d)
                    z = min(max(z, d), H - d)
                    pts.append((x, z))
            return pts
        poly(ragged(0.012), paint)
        for i in range(4):
            z0 = rng.uniform(0.05, H - 0.12)
            th = rng.uniform(0.03, 0.07)
            x0, x1 = rng.uniform(0.03, 0.15), W - rng.uniform(0.03, 0.15)
            poly([(x0, z0), (x1, z0 + rng.uniform(-0.01, 0.01)), (x1, z0 + th), (x0, z0 + th)],
                 shade(paint, rng.choice((0.90, 1.08))))
    # the words: letter by letter, freehand
    font = bpy.data.fonts.load(FONT, check_existing=True)

    def glyph(ch):
        cu = bpy.data.curves.new("t", type='FONT')
        cu.body, cu.font = ch, font
        o = bpy.data.objects.new("t", cu)
        m = _emission("t", INK[ink])
        mats.append(m)
        cu.materials.append(m)
        sc.collection.objects.link(o)
        junk.append(o)
        me = o.to_mesh()
        xs = [v.co.x for v in me.vertices] or [0, 0.4]
        ys = [v.co.y for v in me.vertices] or [0, 0.7]
        o.to_mesh_clear()
        return o, (min(xs), max(xs), min(ys), max(ys))

    margin = 0.06
    band = (H - 2 * margin) / len(lines)
    for li, line in enumerate(lines):
        cap = band * (0.80 if len(lines) > 1 else 0.70)
        gl = [None if ch == " " else glyph(ch) for ch in line]
        widths = [cap * 0.45 if g is None else (g[1][1] - g[1][0]) / max(1e-6, g[1][3] - g[1][2]) * cap
                  for g in gl]
        gap = cap * 0.10
        total = sum(widths) + gap * (len(gl) - 1)
        fit = min(1.0, (W - 2 * margin) / total)
        # run out of room: the hand starts big and squeezes the last letters in
        squeeze = [1.0 + 0.08 * (1 - 2 * k / max(1, len(gl) - 1)) for k in range(len(gl))]
        sw = [w * fit * s for w, s in zip(widths, squeeze)]
        total = sum(sw) + gap * fit * (len(gl) - 1)
        x = (W - total) / 2 + rng.uniform(-0.02, 0.02)
        zc = H - margin - band * (li + 0.5) + rng.uniform(-0.01, 0.01)
        for g, w, s in zip(gl, sw, squeeze):
            if g is not None:
                o, (x0, x1, y0, y1) = g
                k = cap * fit * s * rng.uniform(0.94, 1.06) / (y1 - y0)
                o.scale = (k, k, 1)
                o.rotation_euler.z = math.radians(rng.uniform(-5, 5))
                o.location = (x + w / 2 - k * (x0 + x1) / 2, zc - k * (y0 + y1) / 2 + rng.uniform(-0.01, 0.01), zl())
                if rng.random() < 0.3:          # a drip off the bottom of the stroke
                    dx = x + rng.uniform(0.25, 0.75) * w
                    top = zc - cap * fit * 0.42
                    ln, dw = rng.uniform(0.02, 0.07), rng.uniform(0.004, 0.008)
                    poly([(dx - dw / 2, top - ln), (dx + dw / 2, top - ln), (dx + dw / 2, top), (dx - dw / 2, top)], ink)
                    poly([(dx + dw * 0.9 * math.cos(a), top - ln + dw * 0.9 * math.sin(a))
                          for a in [2 * math.pi * j / 8 for j in range(8)]], ink)
            x += w + gap * fit

    path = os.path.join(bpy.app.tempdir, f"{NAME}{key}-face.png")
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True, scene=sc.name)
    img = bpy.data.images.load(path, check_existing=False)
    img.name = f"SignFace{key or '-turn-back'}"
    img.pack()
    img.filepath_raw = ""
    for o in junk + [cam]:
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if isinstance(data, bpy.types.Mesh):
            bpy.data.meshes.remove(data)
        elif isinstance(data, bpy.types.Curve):
            bpy.data.curves.remove(data)
    bpy.data.cameras.remove(cd)
    bpy.data.scenes.remove(sc)
    for m in mats:
        bpy.data.materials.remove(m)
    return img, path


# ---------------------------------------------------------------------------
# Blender side
# ---------------------------------------------------------------------------
def get_material(name, img):
    col, rough = MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = 0.0
    if col is None:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = img
        nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    else:
        b.inputs["Base Color"].default_value = col
        m.diffuse_color = col
    m.roughness = rough
    m.use_backface_culling = True
    return m


def bake(part, img):
    me = bpy.data.meshes.new(part.name)
    me.from_pydata(part.v, [], part.f)
    me.update()
    used = list(dict.fromkeys(part.m))
    idx = {n: i for i, n in enumerate(used)}
    for n in used:
        me.materials.append(get_material(n, img))
    uvl = me.uv_layers.new(name="UVMap")
    for i, poly in enumerate(me.polygons):
        poly.material_index = idx[part.m[i]]
        for li, uv in zip(poly.loop_indices, part.uv[i]):
            uvl.data[li].uv = uv
    # the lean, as a shear about the ground: the stake feet stay exactly on z = 0
    me.transform(Matrix(((1, 0, math.tan(math.radians(LEAN_SIDE)), 0),
                         (0, 1, -math.tan(math.radians(LEAN_BACK)), 0),
                         (0, 0, 1, 0), (0, 0, 0, 1))))
    bm = bmesh.new()
    bm.from_mesh(me)
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
    per = {}
    for t in m.loop_triangles:
        k = ob.data.materials[t.material_index].name
        per[k] = per.get(k, 0) + 1
    n = len(m.loop_triangles)
    ev.to_mesh_clear()
    return n, per


def check_facing(ob, n=24):
    """Ray-cast from a ring of eyes at the sign; every first hit must face back at the ray."""
    from mathutils.bvhtree import BVHTree
    tree = BVHTree.FromObject(ob, bpy.context.evaluated_depsgraph_get())
    bad, hits = [], 0
    targets = [Vector((x, y, z)) for x in (-0.4, -0.2, 0, 0.2, 0.4) for y in (-0.02, 0.02)
               for z in (0.3, 0.7, 0.9, 1.1, 1.25)]
    eyes = [Vector((math.cos(a) * 6, math.sin(a) * 6, h))
            for a in [2 * math.pi * k / n for k in range(n)] for h in (0.4, 1.2, 3.0)]
    for e in eyes:
        for t in targets:
            d = (t - e).normalized()
            loc, nrm, i, dist = tree.ray_cast(e, d)
            if loc is None:
                continue
            hits += 1
            if nrm.dot(d) > 0:
                bad.append((loc, ob.data.materials[ob.data.polygons[i].material_index].name))
    for loc, m in bad[:6]:
        print(f"    inverted hit: {m} at ({loc.x:.3f}, {loc.y:.3f}, {loc.z:.3f})")
    return len(bad), hits


def fresh_scene():
    bpy.ops.wm.read_homefile(use_empty=True)
    for m in list(bpy.data.materials):
        bpy.data.materials.remove(m)
    for im in list(bpy.data.images):
        bpy.data.images.remove(im)


def build(key):
    lines, paint, ink, seed = WORDINGS[key]
    fresh_scene()
    img, face_png = bake_face(key, lines, paint, ink, seed)
    ob = bake(build_part(seed), img)
    t, per = evaluated_tris(ob)
    bad, hits = check_facing(ob)
    lo = [min(v.co[i] for v in ob.data.vertices) for i in range(3)]
    hi = [max(v.co[i] for v in ob.data.vertices) for i in range(3)]
    ok = t <= TRI_BUDGET and bad == 0 and abs(lo[2]) < 1e-6
    print(f"  {NAME}{key}: '{' / '.join(lines)}'  {t} tris (budget {TRI_BUDGET})  "
          f"materials {len(ob.data.materials)}  images {len(bpy.data.images)}  facing {bad} bad of {hits}")
    print("    per material: " + ", ".join(f"{k} {v}" for k, v in sorted(per.items(), key=lambda kv: -kv[1])))
    print(f"    bbox x {lo[0]:.3f}..{hi[0]:.3f}  y {lo[1]:.3f}..{hi[1]:.3f}  z {lo[2]:.3f}..{hi[2]:.3f}"
          f"  -> {'OK' if ok else 'FAIL'}")
    return ob, ok, face_png


def export():
    ok_all = True
    os.makedirs(RENDER_DIR, exist_ok=True)
    for key in WORDINGS:
        ob, ok, face_png = build(key)
        ok_all &= ok
        bpy.ops.export_scene.gltf(
            filepath=f"{OUT_DIR}/{NAME}{key}.glb", export_format="GLB",
            export_draco_mesh_compression_enable=False, export_yup=True, export_apply=True,
            export_materials="EXPORT", export_texcoords=True, export_normals=True,
            export_cameras=False, export_lights=False, use_selection=False)
        import shutil
        shutil.copy(face_png, f"{RENDER_DIR}/face{key or '-turn-back'}.png")
        if key == "":
            bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    return ok_all


def preview():
    """Cheap Workbench check (textured, no EEVEE): all four boards in a row, from the road."""
    bpy.ops.wm.read_homefile(use_empty=True)
    sc = bpy.context.scene
    for i, key in enumerate(WORDINGS):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=f"{OUT_DIR}/{NAME}{key}.glb")
        for o in set(bpy.data.objects) - before:
            if o.parent is None:
                o.location.x = (1.5 - i) * 1.15
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    sc.collection.objects.link(cam)
    eye, tgt = Vector((-0.9, 5.2, 1.5)), Vector((0, 0, 0.85))
    cam.location = eye
    cam.rotation_mode = 'QUATERNION'
    cam.rotation_quaternion = (tgt - eye).to_track_quat('-Z', 'Y')
    cam.data.lens = 40
    sc.camera = cam
    sc.render.engine = 'BLENDER_WORKBENCH'
    sh = sc.display.shading
    sh.light, sh.color_type, sh.show_shadows = 'STUDIO', 'TEXTURE', True
    sc.render.resolution_x, sc.render.resolution_y = 1280, 640
    sc.render.filepath = f"{RENDER_DIR}/preview.png"
    bpy.ops.render.render(write_still=True)
    print("  preview", sc.render.filepath)


def _flat(name, col, rough=0.9):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*col, 1)
    b.inputs["Roughness"].default_value = rough
    return m


def _plane(name, x0, x1, y0, y1, z, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], [], [[0, 1, 2, 3]])
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


# name: (layout, eye, target, vertical fov deg).  "row" = the four side by side for comparing
# wordings; "road" = one every 25 m down the right shoulder, as the driver meets them (Blender +Y is
# toward the driver, whose right is -X, so the lane is at +X).
VIEWS = {
    "row":    ("row",  (0.0, 6.4, 1.5), (0, 0, 0.9), 30),
    "driver": ("road", (3.4, 16.0, 1.35), (0, 0, 0.95), 30),
    "corner": ("road", (-1.0, 1.3, 1.7), (-0.36, -0.06, 1.12), 26),
    "back":   ("road", (1.9, -2.7, 1.3), (0, 0, 0.8), 38),
}


def render():
    """EEVEE review renders from the exported .glbs: <view>.png + sheet.png in RENDER_DIR."""
    bpy.ops.wm.read_homefile(use_empty=True)
    sc = bpy.context.scene
    _plane("Ground", -300, 300, -600, 60, 0.0, _flat("Ground", (0.16, 0.14, 0.09)))
    road = _plane("Road", 1.8, 8.8, -600, 60, 0.005, _flat("Road", (0.05, 0.05, 0.055), 0.8))
    roots = []
    for key in WORDINGS:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=f"{OUT_DIR}/{NAME}{key}.glb")
        roots += [o for o in set(bpy.data.objects) - before if o.parent is None]
    w = bpy.data.worlds.new("Sky")
    sc.world = w
    w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (0.50, 0.60, 0.72, 1)
    bg.inputs[1].default_value = 0.9
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy, sun.data.angle, sun.data.color = 3.6, math.radians(4), (1.0, 0.94, 0.84)
    sun.rotation_euler = (math.radians(50), 0, math.radians(-150))
    sc.collection.objects.link(sun)
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = 1280, 720
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.view_settings.view_transform = "AgX"
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.sensor_fit, cam.data.clip_start, cam.data.clip_end = "VERTICAL", 0.05, 300
    os.makedirs(RENDER_DIR, exist_ok=True)
    paths = []
    for name, (layout, eye, target, fov) in VIEWS.items():
        for i, o in enumerate(roots):
            o.location = ((1.5 - i) * 1.15, 0, 0) if layout == "row" else (0, -25.0 * i, 0)
        road.hide_render = layout == "row"
        eye, target = Vector(eye), Vector(target)
        cam.location = eye
        cam.rotation_mode = "QUATERNION"
        cam.rotation_quaternion = (target - eye).to_track_quat("-Z", "Y")
        cam.data.angle_y = math.radians(fov)
        sc.render.filepath = f"{RENDER_DIR}/{name}.png"
        bpy.ops.render.render(write_still=True)
        paths.append(sc.render.filepath)
        print(f"  rendered {sc.render.filepath}")
    contact_sheet(paths, f"{RENDER_DIR}/sheet.png")


def contact_sheet(paths, dest, cols=2):
    """Stitch the renders into one image, row-major from the top (numpy ships with Blender)."""
    import numpy as np
    imgs = [bpy.data.images.load(p) for p in paths]
    w, h = imgs[0].size
    rows = -(-len(imgs) // cols)
    sheet = np.ones((rows * h, cols * w, 4), dtype=np.float32)
    for k, im in enumerate(imgs):
        px = np.empty(w * h * 4, dtype=np.float32)
        im.pixels.foreach_get(px)
        r, c = divmod(k, cols)
        y0 = (rows - 1 - r) * h                 # Blender pixel rows run bottom-up
        sheet[y0:y0 + h, c * w:(c + 1) * w] = px.reshape(h, w, 4)
    out = bpy.data.images.new("Sheet", cols * w, rows * h, alpha=True)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw = dest
    out.file_format = "PNG"
    out.save()
    print(f"  sheet {dest}")


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ok = export() if "export" in args else True if "render" in args else build("")[1]
    if "preview" in args:
        preview()
    if "render" in args:
        render()
    if not ok:
        sys.exit(1)
