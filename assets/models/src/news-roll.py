"""
news-roll - parametric generator for the rolled-newspaper prop.

    NewspaperRoll   256 tris   material "Newsprint"  (512x276 packed texture)
    RollString      102 tris   material "Twine"      (flat colour, no UVs)
    TOTAL           358 tris
    bounds          90.2 x 420.4 x 73.9 mm, base-seated (lowest point at z=0)

Built against Blender 5.2 LTS on macOS (font paths are macOS-specific).

    blender --background --python news-roll.py -- --export

All dimensions are metres. Change a PARAM and re-run; do not hand-edit the mesh.

Ships to assets/models/news-roll.glb per .planning/research/ASSETS.md. Loading it in-game is
FEAT-59 - the prop system is procedural instanced geometry and cannot load a .glb yet.

DESIGN NOTES - the two things that will bite a future edit:

  * UVs are ANALYTIC, assigned from grid indices during the build. There is no unwrap, and
    there is deliberately NO Mapping node in the material - V already carries the spiral arc
    length in page-heights. If you ever find a Mapping node in the .blend, it is a stray: check
    whether it actually reaches Image Texture's Vector input before believing it does anything.
    (One did, dangling and unconnected, and baking it into the UVs squashed the page 2.4x and
    made the masthead repeat.)

  * U_OFF parks the masthead on facet centre 10.5 so a crease does not cut the letterforms;
    HEAD_Y was chosen to drop the headline exactly 2 facets below, at 8.5. Any change to N_T,
    TURNS, R_END or the page layout invalidates that and it must be re-solved.

Texture is 512x276 and NOT power-of-two. That is fine and intentional - see ASSETS.md: the
renderer is WebGL2, where NPOT textures mipmap and repeat-wrap normally.
"""

import bpy, bmesh, math, os, random, sys
import numpy as np
from mathutils import Vector

# ---------------------------------------------------------------------------
# PARAMS
# ---------------------------------------------------------------------------
NAME = "news-roll"

# --- roll geometry ---
R0        = 0.016      # core radius
TURNS     = 2.5
R_END     = 0.036      # outer radius
LENGTH    = 0.42
SQUASH_Z  = 0.85       # radial squash -> elliptical section
FLARE     = 0.27       # end splay amount
FLARE_POW = 2.5        # falloff: flat middle, fast rise at the ends
N_T       = 12         # spiral steps, sampled by ARC LENGTH (not angle)
CROSS_TS  = [0.0, 0.10, 0.50, 0.90, 1.0]   # 5 verts across the paper width
THICKNESS = 0.004      # Solidify

# --- string / knot ---
S_A, S_B  = 0.0368, 0.0314    # band ellipse, cinched slightly into the paper
S_TUBE    = 0.0026
S_MAJ     = 12         # 12 puts ring 3 exactly at top dead centre (knot sits centred)
S_MIN     = 4
S_BULGE   = {3: 2.40, 2: 1.45, 4: 1.45}    # knot = bulged rings, not a separate mesh

# --- page bake ---
# Rendered at 2x and area-averaged down: a downsampled 2x render is supersampled, so the
# serif masthead survives far better than a native 512x276 render would.
RENDER_W, RENDER_H = 1024, 551
TEX_W,    TEX_H    = 512,  276
PAGE_H       = 0.538   # page height in bake units (ortho_scale 1.0 -> x spans 1.0)
SHIFT        = 0.0199  # headline and everything below it, moved down onto a facet centre
MASTHEAD     = "Daily News"
HEADLINE     = "Meadow Pass to close for six weeks"
MAST_Y, MAST_SIZE = 0.186,  0.125
HEAD_Y, HEAD_SIZE = 0.0241, 0.046
SEED         = 11

# --- paper grain, BAKED INTO the texture ---
# Was a live Noise->ColorRamp->MixRGB(multiply) chain on Base Color. glTF drops procedural
# nodes, so it is baked in as periodic 2D value noise reproducing the same multiplier range
# (0.946 - 0.984). Periodic because V tiles; an aperiodic grain would seam at every wrap.
GRAIN_SEED   = 20260803
GRAIN_FAC    = 0.12                     # the old MixRGB Fac
GRAIN_LO     = (0.62, 0.60, 0.55)       # ColorRamp stop at 0.36
GRAIN_HI     = (0.87, 0.85, 0.78)       # ColorRamp stop at 0.70
GRAIN_POS    = (0.36, 0.70)
GRAIN_CYC_U  = 18      # cycles across the page width  (old Noise Scale 18 on Generated coords)
GRAIN_CYC_V  = 10      # cycles across one page height; INTEGER so the grain tiles seamlessly
GRAIN_OCT    = 4       # old Noise Detail
GRAIN_ROUGH  = 0.5

FONT_DIR  = "/System/Library/Fonts/Supplemental/"
FONT_MAST = "BigCaslon.ttf"
FONT_HEAD = "Times New Roman Bold.ttf"

# derived
_TH   = 2 * math.pi * TURNS
_B    = (R_END - R0) / _TH
TOTAL = R0 * _TH + _B * _TH * _TH / 2      # arc length of the whole strip
TILE  = 2 * math.pi * R_END                # one page height = one outer turn
FACET = (TOTAL / TILE) / N_T               # facet width in UV-V

# Park the masthead on a facet centre (index 10.5) so creases miss the letterforms.
# HEAD_Y was chosen so the headline lands exactly 2 facets below, at index 8.5.
U_OFF = ((MAST_Y + PAGE_H / 2) / PAGE_H) - FACET * 10.5


def theta_at(s):
    """Invert arc length -> theta for r = R0 + B*theta."""
    return (-R0 + math.sqrt(R0 * R0 + 2 * _B * s)) / _B


# ---------------------------------------------------------------------------
# page bake
# ---------------------------------------------------------------------------
def _font(fn):
    for f in bpy.data.fonts:
        if f.filepath.endswith(fn):
            return f
    return bpy.data.fonts.load(FONT_DIR + fn)


def render_page():
    """Render the newspaper page via a throwaway Workbench scene. Returns (H,W,4) linear."""
    random.seed(SEED)
    f_mast, f_head = _font(FONT_MAST), _font(FONT_HEAD)

    if "NewsprintBake" in bpy.data.scenes:
        bpy.data.scenes.remove(bpy.data.scenes["NewsprintBake"])
    sc = bpy.data.scenes.new("NewsprintBake")

    def mkmat(n, c):
        m = bpy.data.materials.get(n) or bpy.data.materials.new(n)
        m.diffuse_color = c
        return m

    ink  = mkmat("bk_ink",  (0.045, 0.040, 0.035, 1))
    bar  = mkmat("bk_bar",  (0.30, 0.28, 0.26, 1))
    phot = mkmat("bk_phot", (0.52, 0.50, 0.46, 1))

    def text(body, fnt, size, y, x=0.0, sp=1.0, off=0.0):
        cu = bpy.data.curves.new("t", type='FONT')
        cu.body, cu.font, cu.size = body, fnt, size
        cu.align_x, cu.align_y, cu.space_character = 'CENTER', 'CENTER', sp
        cu.offset = off                     # faux-bold; thin serifs die under filtering
        ob = bpy.data.objects.new("t", cu)
        sc.collection.objects.link(ob)
        ob.location = (x, y, 0.02)
        cu.materials.append(ink)

    bm = bmesh.new()

    def quad(x0, y0, x1, y1, z=0.01, mi=0):
        vs = [bm.verts.new((x0, y0, z)), bm.verts.new((x1, y0, z)),
              bm.verts.new((x1, y1, z)), bm.verts.new((x0, y1, z))]
        f = bm.faces.new(vs)
        f.material_index = mi
        return f

    for y, h in ((0.256, 0.0040), (0.120, 0.0040), (0.0935 - SHIFT, 0.0040)):
        quad(-0.478, y, 0.478, y + h)

    text(MASTHEAD, f_mast, MAST_SIZE, MAST_Y, sp=1.05, off=0.0022)
    text(HEADLINE, f_head, HEAD_SIZE, HEAD_Y, off=0.0011)

    # blocked line row where the dateline would sit
    for x0, w in ((-0.478, 0.190), (-0.230, 0.150), (-0.040, 0.230), (0.238, 0.240)):
        quad(x0, 0.1020, x0 + w, 0.1090)

    # blocked deck lines under the headline
    for y, w in ((0.010 - SHIFT, 0.640), (-0.005 - SHIFT, 0.470)):
        quad(-w / 2, y - 0.0068, w / 2, y)

    NC, W, G = 6, 0.956, 0.016
    cw = (W - (NC - 1) * G) / NC
    for ci in range(NC):
        x0 = -W / 2 + ci * (cw + G)
        x1 = x0 + cw
        y = -0.024 - SHIFT
        if ci in (2, 3):
            if ci == 2:
                quad(x0, -0.104 - SHIFT, x1 + cw + G, -0.028 - SHIFT, z=0.011, mi=1)
            y = -0.122 - SHIFT
        while y > -0.262:
            w = cw * (random.uniform(0.40, 0.70) if random.random() < 0.14
                      else random.uniform(0.94, 1.0))
            quad(x0, y - 0.0068, x0 + w, y)
            y -= 0.0150

    bm.normal_update()
    me = bpy.data.meshes.new("bk_type")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("bk_type", me)
    sc.collection.objects.link(ob)
    me.materials.append(bar)
    me.materials.append(phot)

    cam = bpy.data.cameras.new("bk_cam")
    cam.type, cam.ortho_scale = 'ORTHO', 1.0
    co = bpy.data.objects.new("bk_cam", cam)
    sc.collection.objects.link(co)
    co.location = (0, 0, 2)
    sc.camera = co

    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.render.resolution_x, sc.render.resolution_y = RENDER_W, RENDER_H
    sh = sc.display.shading
    sh.light, sh.color_type = 'FLAT', 'MATERIAL'
    sh.background_type, sh.background_color = 'VIEWPORT', (0.862, 0.840, 0.770)
    sh.show_specular_highlight = False

    path = os.path.join(bpy.app.tempdir, "newsprint_page.png")
    sc.render.filepath = path
    # temp_override works in --background, where bpy.context.window is None
    with bpy.context.temp_override(scene=sc):
        bpy.ops.render.render(write_still=True)

    tmp = bpy.data.images.load(path, check_existing=False)
    px = np.array(tmp.pixels[:], dtype=np.float32).reshape(tmp.size[1], tmp.size[0], 4)
    bpy.data.images.remove(tmp)
    bpy.data.scenes.remove(sc)
    return px


def _area_resample(src, H, W):
    """Separable exact area-average. For a 2x reduction this is an ideal box downsample."""
    def axis_matrix(n_in, n_out):
        edges = np.linspace(0, n_in, n_out + 1)
        M = np.zeros((n_out, n_in))
        for i in range(n_out):
            a, b = edges[i], edges[i + 1]
            for j in range(int(np.floor(a)), min(int(np.ceil(b)), n_in)):
                M[i, j] = max(0.0, min(b, j + 1) - max(a, j))
            M[i] /= M[i].sum()
        return M
    out = np.einsum('ij,jkc->ikc', axis_matrix(src.shape[0], H), src)
    return np.einsum('ij,kjc->kic', axis_matrix(src.shape[1], W), out)


def _periodic_value_noise(H, W, pu, pv, rng):
    """Value noise on an integer lattice that wraps at pu/pv, so the result tiles."""
    g = rng.random((pv, pu)).astype(np.float32)
    y = np.linspace(0, pv, H, endpoint=False)
    x = np.linspace(0, pu, W, endpoint=False)
    y0 = np.floor(y).astype(int); x0 = np.floor(x).astype(int)
    fy = (y - y0)[:, None]; fx = (x - x0)[None, :]
    sy = fy * fy * (3 - 2 * fy); sx = fx * fx * (3 - 2 * fx)      # smoothstep
    y0 %= pv; x0 %= pu; y1 = (y0 + 1) % pv; x1 = (x0 + 1) % pu
    a = g[np.ix_(y0, x0)]; b = g[np.ix_(y0, x1)]
    c = g[np.ix_(y1, x0)]; d = g[np.ix_(y1, x1)]
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy


def bake_page():
    """Render -> downsample -> multiply in the paper grain -> packed Blender image."""
    px = _area_resample(render_page(), TEX_H, TEX_W)

    rng = np.random.default_rng(GRAIN_SEED)
    fac = np.zeros((TEX_H, TEX_W), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(GRAIN_OCT):
        fac += amp * _periodic_value_noise(TEX_H, TEX_W,
                                           GRAIN_CYC_U * (2 ** o), GRAIN_CYC_V * (2 ** o), rng)
        tot += amp
        amp *= GRAIN_ROUGH
    fac /= tot
    fac = (fac - fac.min()) / (fac.max() - fac.min())

    t = np.clip((fac - GRAIN_POS[0]) / (GRAIN_POS[1] - GRAIN_POS[0]), 0, 1)[..., None]
    lo, hi = np.array(GRAIN_LO, np.float32), np.array(GRAIN_HI, np.float32)
    ramp = lo + t * (hi - lo)
    px[..., :3] *= 1.0 + GRAIN_FAC * (ramp - 1.0)   # MixRGB MULTIPLY == C1 * lerp(1, C2, Fac)
    px[..., 3] = 1.0

    img = bpy.data.images.new("NewsprintPage", width=TEX_W, height=TEX_H,
                              alpha=False, float_buffer=False)
    img.colorspace_settings.name = 'sRGB'
    img.pixels = px.ravel().tolist()
    img.pack()                                       # tempdir is wiped when Blender quits
    return img


# ---------------------------------------------------------------------------
# materials
# ---------------------------------------------------------------------------
def make_newsprint(img):
    """Flat by construction: Image Texture -> Base Color, nothing between. Anything else
    (Mix, ColorRamp, Noise, Bump, Mapping) is silently dropped by the glTF exporter."""
    mat = bpy.data.materials.new("Newsprint")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()

    out  = nt.nodes.new("ShaderNodeOutputMaterial"); out.location = (600, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled"); bsdf.location = (300, 0)
    tim  = nt.nodes.new("ShaderNodeTexImage");       tim.location = (-200, 0)
    tim.image, tim.extension, tim.interpolation = img, 'REPEAT', 'Linear'

    nt.links.new(tim.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    bsdf.inputs["Roughness"].default_value = 0.92
    return mat


def make_twine():
    mat = bpy.data.materials.new("Twine")
    mat.use_nodes = True
    b = mat.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.42, 0.31, 0.18, 1)
    b.inputs["Roughness"].default_value = 0.95
    return mat


# ---------------------------------------------------------------------------
# geometry
# ---------------------------------------------------------------------------
def build_roll(mat):
    thetas = [theta_at(TOTAL * i / N_T) for i in range(N_T + 1)]
    C = [(TOTAL * i / N_T) / TILE + U_OFF for i in range(N_T + 1)]   # V ladder, page-heights

    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    grid = []
    for th in thetas:
        r = R0 + _B * th
        cx, cz = math.cos(th), math.sin(th)
        row = []
        for t in CROSS_TS:
            f = 1.0 + FLARE * abs(2 * t - 1) ** FLARE_POW
            row.append(bm.verts.new((r * cx * f,
                                     -LENGTH / 2 + LENGTH * t,
                                     r * SQUASH_Z * cz * f)))
        grid.append(row)
    bm.verts.ensure_lookup_table()

    for i in range(N_T):
        for j in range(len(CROSS_TS) - 1):
            f = bm.faces.new((grid[i][j], grid[i + 1][j],
                              grid[i + 1][j + 1], grid[i][j + 1]))
            uv = ((CROSS_TS[j], C[i]), (CROSS_TS[j], C[i + 1]),
                  (CROSS_TS[j + 1], C[i + 1]), (CROSS_TS[j + 1], C[i]))
            for n, lp in enumerate(f.loops):
                lp[uvl].uv = uv[n]

    bm.normal_update()
    me = bpy.data.meshes.new("NewspaperRoll")
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new("NewspaperRoll", me)
    bpy.context.collection.objects.link(obj)
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True

    sol = obj.modifiers.new("Solidify", 'SOLIDIFY')
    sol.thickness, sol.offset, sol.use_even_offset = THICKNESS, 0, True
    return obj


def build_string(roll, mat):
    z_axis = roll.data.vertices[0].co.z      # theta=0 row sits on the roll axis

    bm = bmesh.new()
    rings = []
    for i in range(S_MAJ):
        t = i * 2 * math.pi / S_MAJ
        Cc = Vector((S_A * math.cos(t), 0.0, S_B * math.sin(t)))
        N = Vector((math.cos(t) / S_A, 0.0, math.sin(t) / S_B)).normalized()
        Y = Vector((0, 1, 0))
        sc = S_BULGE.get(i, 1.0)
        if sc > 1.0:
            Cc = Cc + N * (0.0016 * (sc - 1.0))
        rings.append([bm.verts.new(Cc + S_TUBE * sc *
                                   (math.cos(k * 2 * math.pi / S_MIN) * N +
                                    math.sin(k * 2 * math.pi / S_MIN) * Y))
                      for k in range(S_MIN)])
    for i in range(S_MAJ):
        i2 = (i + 1) % S_MAJ
        for k in range(S_MIN):
            k2 = (k + 1) % S_MIN
            bm.faces.new((rings[i][k], rings[i][k2], rings[i2][k2], rings[i2][k]))

    # tails: 3-sided cones pinching to a point, 3 tris each (real geometry, so they
    # survive backface culling - flat quads would vanish from behind)
    top = Vector((0.0, 0.0, S_B + 0.0052))
    for sgn, tip in ((1, Vector((0.012, 0.034, -0.004))),
                     (-1, Vector((-0.009, -0.029, -0.010)))):
        base_c = top + Vector((0.0015 * sgn, 0.004 * sgn, 0.0))
        axis = (tip - base_c).normalized()
        up = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
        u = axis.cross(up).normalized()
        v = axis.cross(u).normalized()
        ring = [bm.verts.new(base_c + 0.0024 * (math.cos(k * 2 * math.pi / 3) * u +
                                                math.sin(k * 2 * math.pi / 3) * v))
                for k in range(3)]
        apex = bm.verts.new(top + tip)
        for k in range(3):
            bm.faces.new((ring[k], ring[(k + 1) % 3], apex))

    bm.normal_update()
    me = bpy.data.meshes.new("RollString")
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    st = bpy.data.objects.new("RollString", me)
    bpy.context.collection.objects.link(st)
    st.location.z = z_axis
    me.materials.append(mat)
    return st


def seat_on_floor(objs):
    """Drop the group so its lowest EVALUATED point sits at z=0.

    Must be evaluated, not base-mesh: Solidify with use_even_offset scales thickness at the
    flared ends, so the shell reaches further than THICKNESS/2 below the base surface. Seating
    off the base mesh leaves the prop ~4 mm underground.
    """
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    lo = min((ev.matrix_world @ v.co).z
             for o in objs
             for ev in [o.evaluated_get(dg)]
             for v in ev.to_mesh().vertices)
    for o in objs:
        for v in o.data.vertices:
            v.co.z -= lo
        o.data.update()
    bpy.context.view_layer.update()
    return lo


# ---------------------------------------------------------------------------
# export
# ---------------------------------------------------------------------------
def tri_count(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    return sum(len(p.vertices) - 2 for p in obj.evaluated_get(dg).to_mesh().polygons)


def export_glb(path, objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,            # leave the bake rig, cameras and lights out
        export_apply=True,             # bakes Solidify; without it the roll has no thickness
        export_yup=True,               # Blender +Z up -> glTF +Y up; long axis +Y -> -Z
        export_draco_mesh_compression_enable=False,   # no decoder attached (ASSETS.md)
        export_image_format='AUTO',
        export_materials='EXPORT',
    )


# ---------------------------------------------------------------------------
def main():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)

    img  = bake_page()
    roll = build_roll(make_newsprint(img))
    strg = build_string(roll, make_twine())
    drop = seat_on_floor([roll, strg])

    a, b = tri_count(roll), tri_count(strg)
    print(f"NewspaperRoll: {a} tris\nRollString: {b} tris\nTOTAL: {a + b}")
    print("texture: %dx%d (rendered %dx%d)" % (TEX_W, TEX_H, RENDER_W, RENDER_H))
    print("seated by %.5f m; V range %.6f .. %.6f (%.4f page-heights)"
          % (drop, U_OFF, U_OFF + TOTAL / TILE, TOTAL / TILE))

    here = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else "/tmp"
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(here, NAME + ".blend"))
    if "--export" in sys.argv:
        export_glb(os.path.normpath(os.path.join(here, "..", NAME + ".glb")), [roll, strg])


if __name__ == "__main__":
    main()
