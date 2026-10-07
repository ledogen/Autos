"""
ASSET-28 (small) + ASSET-68 (large) — slatted wooden shipping crates: small + large, plain + FRAGILE.

Built for: Blender 5.2  |  Targets (a kit — one .py, one .blend, one .glb each):
  assets/models/small-crate.glb   small-crate-fragile.glb
  assets/models/large-crate.glb   large-crate-fragile.glb
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md
Sibling: assets/models/src/pallet.py (same accumulator, same per-piece tint).

SIZES are set by the 1.20 x 1.00 pallet (ASSET-27), long axis along its 1.20:
  small 0.58 x 0.45 x 0.45 — 2 x 2 per pallet WITH margin (the ticket's 0.60
        makes 2 x 0.60 exactly 1.20, which fails its own acceptance);
  large 0.81 cube — the small one's 0.45 x1.8, a cube (owner, 2026-10-07); ONE per
        pallet with 195 / 95 mm margin.  Four slat bands, not three, so its
        boards stay plank-sized instead of growing to 0.25 m.

ONE material, `CrateWood`, either way.  Geometry carries slats, gaps, proud
corner battens and the lid; a dark inner box is what the gaps show.  Per-piece
tint is a COLOR_0 vertex colour multiplied in (ART-STYLE rule 1).
  plain   — no UVs, no image: base colour factor x tint, exactly like the pallet.
  fragile — one 512x512 image for the FRAGILE / HANDLE WITH CARE stencil
            (ART-STYLE rule 1's lettering exception).  Every unlettered face
            samples a flat wood swatch of that same image, so it is still one
            draw call.  The image is baked by this script and packed.
No strap (owner, 2026-10-07: the yellow band is gone).

AXIS.  Stencilled faces face Blender +Y (= glTF -Z, forward) and -Y.  Base at
z=0, lid at z=H: every variant stacks flush on itself.
"""

import bpy
import math
import os

# ---------------------------------------------------------------------------
# PARAMETERS
# ---------------------------------------------------------------------------

OUT_DIR = "/Users/ledogen/CodeShit/CarGame/assets/models"
OUT_BLEND = "/Users/ledogen/CodeShit/CarGame/assets/models/src/crate.blend"


class Size:
    def __init__(self, W, D, H, B, P, T, G, n_side, n_lid, lines, per_pallet, budget):
        self.W, self.D, self.H = W, D, H   # X (long, stencilled), Y, Z — battens' outer extents
        self.B = B                         # corner batten section
        self.P = P                         # batten stands proud of the slat faces by this
        self.T = T                         # slat / lid board thickness
        self.G = G                         # gap between slats and between lid boards
        self.n_side, self.n_lid = n_side, n_lid
        self.lines = lines                 # (text, band from the top, cap height m, max width frac)
        self.per_pallet = per_pallet       # (along 1.20, along 1.00)
        self.budget = budget
        # Derived.
        self.z_top = H - T                                      # walls stop, lid sits on top
        hs = (self.z_top - (n_side - 1) * G) / n_side
        self.bands = [(i * (hs + G), i * (hs + G) + hs) for i in range(n_side)]
        self.xo, self.yo = W / 2 - P, D / 2 - P                 # slat outer planes
        self.sw = W - 2 * B                                     # stencilled width
        self.st_z0, st_z1 = self.bands[-2][0], self.bands[-1][1]   # top two bands
        self.st_v0 = 1.0 - (st_z1 - self.st_z0) / self.sw       # atlas units: 1 = sw metres


SMALL = Size(0.58, 0.45, 0.45, B=0.045, P=0.012, T=0.016, G=0.014, n_side=3, n_lid=3,
             lines=[("FRAGILE", 0, 0.080, 0.84), ("HANDLE WITH CARE", 1, 0.034, 0.80)],
             per_pallet=(2, 2), budget=350)
LARGE = Size(0.81, 0.81, 0.81, B=0.070, P=0.016, T=0.020, G=0.018, n_side=4, n_lid=4,
             lines=[("FRAGILE", 0, 0.150, 0.80), ("HANDLE WITH CARE", 1, 0.065, 0.76)],
             per_pallet=(1, 1), budget=350)

VARIANTS = [  # (name, size, fragile)
    ("small-crate", SMALL, False),
    ("small-crate-fragile", SMALL, True),
    ("large-crate", LARGE, False),
    ("large-crate-fragile", LARGE, True),
]
PALLET = (1.20, 1.00)

ATLAS_PX = 512
WOOD_UV = (0.5, 0.10)        # unlettered faces collapse onto this swatch point
WOOD = (0.360, 0.290, 0.190)          # fresh pine, linear — lighter than the pallet
INK = (0.300, 0.025, 0.018)           # stencil red, a touch faded
FONT_BIG = "/System/Library/Fonts/Supplemental/Impact.ttf"
FONT_SMALL = "/System/Library/Fonts/Supplemental/Arial Black.ttf"

ROUGH = 0.90
TINTS = [  # linear multipliers, <= 1; dealt out per piece (see pallet.py).
    # Two-thirds of the pallet's spread (owner, 2026-10-07: a little calmer).
    (1.00, 1.00, 1.00),
    (0.80, 0.84, 0.92),
    (0.76, 0.74, 0.72),
    (0.98, 0.88, 0.72),
    (0.90, 0.92, 0.96),
    (0.85, 0.82, 0.78),
]
TINT_STRIDE = 5
CORE_TINT = (0.42, 0.40, 0.38)        # inner box: what the slat gaps show


# ---------------------------------------------------------------------------
# Geometry accumulator
# ---------------------------------------------------------------------------
class Part:
    def __init__(self, name):
        self.name = name
        self.v, self.f, self.c, self.uv = [], [], [], []   # uv: per face, per corner
        self.k = 0

    def tint(self):
        t = TINTS[(self.k * TINT_STRIDE) % len(TINTS)]
        self.k += 1
        return t

    def box(self, x0, x1, y0, y1, z0, z1, tint=None, uvf=None):
        """uvf(normal, verts) -> per-corner (u, v), or None for the wood swatch."""
        c = tint or self.tint()
        o = len(self.v)
        vs = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
              (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        self.v += vs
        for fc, n in (((0, 3, 2, 1), "-z"), ((4, 5, 6, 7), "+z"), ((0, 1, 5, 4), "-y"),
                      ((1, 2, 6, 5), "+x"), ((2, 3, 7, 6), "+y"), ((3, 0, 4, 7), "-x")):
            self.f.append([i + o for i in fc])
            self.c.append(c)
            uv = uvf(n, [vs[i] for i in fc]) if uvf else None
            self.uv.append(uv or [WOOD_UV] * 4)


def stencil_uv(s, side):
    """Planar map of the +Y (front) or -Y (back) slat faces into the stencil
    region, laid out so the text reads left-to-right from outside.
    Viewer at +Y looking -Y: right = forward x up = (0,-1,0) x (0,0,1) = -X,
    so the front's u runs along -X; the back's along +X."""
    sgn = -1.0 if side == "+y" else 1.0

    def f(n, verts):
        if n != side or any(z < s.st_z0 - 1e-6 for _, _, z in verts):
            return None
        return [((sgn * x) / s.sw + 0.5, s.st_v0 + (z - s.st_z0) / s.sw) for x, _, z in verts]
    return f


def build_crate(name, s, fragile):
    p = Part(name)
    W, D, B, T = s.W, s.D, s.B, s.T
    # Inner box — what the gaps show.
    p.box(-s.xo + T, s.xo - T, -s.yo + T, s.yo - T, 0.0, s.z_top, tint=CORE_TINT)
    # Corner battens.
    for sx in (-1, 1):
        for sy in (-1, 1):
            xa, xb = sorted((sx * W / 2, sx * (W / 2 - B)))
            ya, yb = sorted((sy * D / 2, sy * (D / 2 - B)))
            p.box(xa, xb, ya, yb, 0.0, s.z_top)
    # Long-face slats (+-Y), stencilled on their outer faces when fragile.
    for side, (y0, y1) in (("+y", (s.yo - T, s.yo)), ("-y", (-s.yo, -s.yo + T))):
        for z0, z1 in s.bands:
            p.box(-W / 2 + B, W / 2 - B, y0, y1, z0, z1,
                  uvf=stencil_uv(s, side) if fragile else None)
    # End slats (+-X).
    for x0, x1 in ((s.xo - T, s.xo), (-s.xo, -s.xo + T)):
        for z0, z1 in s.bands:
            p.box(x0, x1, -D / 2 + B, D / 2 - B, z0, z1)
    # Lid: boards along X over the full footprint, capping the battens.
    lw = (D - (s.n_lid - 1) * s.G) / s.n_lid
    for i in range(s.n_lid):
        y0 = -D / 2 + i * (lw + s.G)
        p.box(-W / 2, W / 2, y0, y0 + lw, s.z_top, s.H)
    return p


# ---------------------------------------------------------------------------
# Atlas bake (gas-pump.py's machinery, cut down)
# ---------------------------------------------------------------------------
def _emission(name, col):
    """Flat emitter: with the Standard view transform an emission of v writes v."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs[0].default_value = (col[0], col[1], col[2], 1.0)
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(e.outputs[0], o.inputs[0])
    return m


def bake_atlas(name, s):
    engines = {i.identifier for i in
               bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items}
    sc = bpy.data.scenes.new("CrateAtlasBake")
    sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
    sc.render.resolution_x = sc.render.resolution_y = ATLAS_PX
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.render.dither_intensity = 0.0          # ART-STYLE: dither noise defeats PNG filters
    sc.view_settings.view_transform = "Standard"
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"

    cam_data = bpy.data.cameras.new("CrateAtlasCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 1.0
    cam = bpy.data.objects.new("CrateAtlasCam", cam_data)
    cam.location = (0.5, 0.5, 2.0)
    sc.collection.objects.link(cam)
    sc.camera = cam
    scratch, mats = [], []

    def rect(x0, x1, y0, y1, z, col, tag):
        me = bpy.data.meshes.new(tag)
        me.from_pydata([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], [], [(0, 1, 2, 3)])
        o = bpy.data.objects.new(tag, me)
        m = _emission(tag, col)
        mats.append(m)
        me.materials.append(m)
        sc.collection.objects.link(o)
        scratch.append(o)

    def text(body, cx, cy, cap_h, max_w, font, tag):
        cu = bpy.data.curves.new(tag, type="FONT")
        cu.body = body
        cu.align_x = "CENTER"
        try:
            cu.font = bpy.data.fonts.load(font, check_existing=True)
        except (RuntimeError, OSError):
            print("WARN: font not found, falling back to Bfont:", font)
        o = bpy.data.objects.new(tag, cu)
        m = _emission(tag, INK)
        mats.append(m)
        cu.materials.append(m)
        sc.collection.objects.link(o)
        scratch.append(o)
        me = o.to_mesh()
        xs = [v.co.x for v in me.vertices]
        ys = [v.co.y for v in me.vertices]
        o.to_mesh_clear()
        k = min(cap_h / (max(ys) - min(ys)), max_w / (max(xs) - min(xs)))
        o.scale = (k, k, k)
        o.location = (cx - k * (max(xs) + min(xs)) / 2, cy - k * (max(ys) + min(ys)) / 2, 0.05)

    rect(0, 1, 0, 1, 0.0, WOOD, "AtlasWood")                 # background + wood swatch
    for body, i, cap, wf in s.lines:
        z0, z1 = s.bands[-1 - i]
        cy = s.st_v0 + ((z0 + z1) / 2 - s.st_z0) / s.sw
        text(body, 0.5, cy, cap / s.sw, wf, FONT_BIG if i == 0 else FONT_SMALL, f"AtlasText{i}")

    path = os.path.join(bpy.app.tempdir, f"{name}-atlas.png")
    sc.render.filepath = path
    # Name the scene explicitly: after read_homefile the context's window/scene
    # are stale for the rest of the call, so swapping win.scene is not enough.
    bpy.ops.render.render(write_still=True, scene=sc.name)
    img = bpy.data.images.load(path, check_existing=False)
    img.name = f"{name}-atlas"
    img.pack()                    # never leave it in tempdir — wiped on quit
    img.filepath_raw = ""
    for o in scratch + [cam]:
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.scenes.remove(sc)
    for m in mats:
        bpy.data.materials.remove(m)
    bpy.data.cameras.remove(cam_data)
    return img


# ---------------------------------------------------------------------------
# Bake / verify / export
# ---------------------------------------------------------------------------
def make_material(img):
    """Base Color = (image or WOOD) x vertex tint — the multiply glTF does, so
    the .blend previews what the game draws.  The exporter reads this back as
    baseColorTexture/baseColorFactor + COLOR_0."""
    m = bpy.data.materials.new("CrateWood")
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    attr = nt.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    if img:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        tex.interpolation = "Linear"
        nt.links.new(tex.outputs["Color"], mix.inputs[6])
    else:
        mix.inputs[6].default_value = (*WOOD, 1.0)
    nt.links.new(attr.outputs["Color"], mix.inputs[7])
    nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = ROUGH
    b.inputs["Metallic"].default_value = 0.0
    m.diffuse_color = (*WOOD, 1.0)
    m.use_backface_culling = True
    return m


def bake(part, img, dx=0.0):
    me = bpy.data.meshes.new(part.name)
    me.from_pydata([(x + dx, y, z) for x, y, z in part.v], [], part.f)
    me.update()
    me.materials.append(make_material(img))
    for poly in me.polygons:
        poly.use_smooth = False
    # Every piece is a closed box wound outward by construction (the ray cast
    # proves it), so there is no recalc_face_normals pass.
    col = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    uvl = me.uv_layers.new(name="UVMap") if img else None
    for poly in me.polygons:
        r, g, b = part.c[poly.index]
        for corner, li in enumerate(poly.loop_indices):
            col.data[li].color = (r, g, b, 1.0)
            if uvl:
                uvl.data[li].uv = part.uv[poly.index][corner]
    me.color_attributes.active_color = col
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


def _fresh_scene():
    bpy.ops.wm.read_homefile(use_empty=True)
    for d in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for x in list(d):
            d.remove(x)


def check_normals(ob, s, samples=400):
    import mathutils
    bad = tested = 0
    c = mathutils.Vector(  # crate centre — build() offsets variants along X
(sum(v.co.x for v in ob.data.vertices) / len(ob.data.vertices), 0.0, s.H / 2))
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
    return tested, bad


def check_fit(part, s):
    """Acceptance: per_pallet crates on the 1.20 x 1.00 pallet with margin; flush stack."""
    xs = [v[0] for v in part.v]
    ys = [v[1] for v in part.v]
    zs = [v[2] for v in part.v]
    na, nb = s.per_pallet
    la, lb = na * (max(xs) - min(xs)), nb * (max(ys) - min(ys))
    ok = (la < PALLET[0] and lb < PALLET[1]
          and abs(min(zs)) < 1e-9 and abs(max(zs) - s.H) < 1e-9)
    return f"{na}x{nb} on pallet: {la:.3f}/{PALLET[0]} x {lb:.3f}/{PALLET[1]}, " \
           f"z [{min(zs):.3f}, {max(zs):.3f}] {'OK' if ok else 'FAIL'}"


def _variant(name, s, fragile, dx=0.0):
    img = bake_atlas(name, s) if fragile else None
    part = build_crate(name, s, fragile)
    ob = bake(part, img, dx)
    tested, bad = check_normals(ob, s)
    print(f"  {name:20s} {evaluated_tris(ob):3d}/{s.budget} tris  "
          f"{s.W:.2f}x{s.D:.2f}x{s.H:.2f} m  image {'512' if img else 'none'}  "
          f"normals {bad}/{tested} bad  {check_fit(part, s)}")
    return ob


def build():
    """All four side by side — the .blend source view."""
    _fresh_scene()
    print("=" * 60)
    x = 0.0
    for name, s, fragile in VARIANTS:
        _variant(name, s, fragile, dx=x + s.W / 2)
        x += s.W + 0.25
    print(f"  materials {len(bpy.data.materials)}  "
          f"images {sum(i.type == 'IMAGE' for i in bpy.data.images)}")
    print("=" * 60)


def _ui_override():
    win = bpy.context.window_manager.windows[0]
    area = next(a for a in win.screen.areas if a.type == "VIEW_3D")
    region = next(r for r in area.regions if r.type == "WINDOW")
    return dict(window=win, screen=win.screen, area=area, region=region,
                scene=bpy.context.scene, view_layer=bpy.context.view_layer)


def export():
    """One .glb per variant (each built alone in a fresh scene), then the
    side-by-side scene saved as the .blend.  Needs the GUI Blender
    (blender-mcp): `blender -b` has no VIEW_3D area."""
    for name, s, fragile in VARIANTS:
        _fresh_scene()
        _variant(name, s, fragile)
        with bpy.context.temp_override(**_ui_override()):
            bpy.ops.export_scene.gltf(
                filepath=f"{OUT_DIR}/{name}.glb",
                export_format="GLB",
                export_draco_mesh_compression_enable=False,
                export_yup=True,
                export_apply=True,
                export_materials="EXPORT",
                export_vertex_color="ACTIVE",   # MATERIAL mode drops it
                export_texcoords=fragile,
                export_normals=True,
                export_cameras=False,
                export_lights=False,
                use_selection=False,
            )
        print(f"  wrote {OUT_DIR}/{name}.glb")
    build()
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    print(f"  wrote {OUT_BLEND}")


if __name__ == "__main__":
    build()
