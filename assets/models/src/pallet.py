"""
ASSET-27 — timber stringer pallet, parametric generator.

Built for: Blender 5.2  |  Target: assets/models/pallet.glb (one piece, empty)
Style brief: .planning/research/ART-STYLE.md  ·  Mechanics: .planning/research/ASSETS.md

FOOTPRINT 1.20 x 1.00 m (owner, 2026-10-06): the ticket's 1.20 x 0.80 is the
EUR *block* pallet; a stringer pallet is the US GMA 48x40 in, rounded here to
1.2 x 1.0 to match the five load tickets that reuse this base (ASSET-46/47/48/
55/56) and the 2 x 2 crate layout of ASSET-28.

NO TEXTURE (owner, 2026-10-06 — same ruling as the crate): nail heads,
weathering and a stencil are wear / unreadable print.  ONE material,
`PalletWood`, so the pallet stays one draw call per placed copy.
BOARD-TO-BOARD VARIATION is a per-piece vertex-colour tint (COLOR_0), which
glTF multiplies into baseColorFactor — so the authored colour is the LIGHTEST
board and every tint is <= 1 (owner, 2026-10-06; ART-STYLE rule 1).
Character is geometry: real deck gaps, notched stringers (four-way entry),
one split top board with a broken-off end, one forklift-chewed stringer end.

AXIS.  Stringers run along Blender +Y (= glTF -Z, the project forward); fork
entry is across X.  Bottom deck at z=0, top deck at z=H exactly — so a second
pallet placed at z=H sits flush (the acceptance criterion that matters):
every bottom board lies over a top board of the pallet beneath.
"""

import bpy
import bmesh
import math

# ---------------------------------------------------------------------------
# PARAMETERS
# ---------------------------------------------------------------------------

TRI_BUDGET = 300
OUT_DIR = "/Users/ledogen/CodeShit/CarGame/assets/models"
OUT_BLEND = "/Users/ledogen/CodeShit/CarGame/assets/models/src/pallet.blend"
NAME = "pallet"

W, L, H = 1.00, 1.20, 0.145          # across forks (X), along stringers (Y), height
T_DECK = 0.019                       # deck board thickness (3/4 in), top and bottom
T_STR = 0.038                        # stringer thickness (1.5 in nominal)
Z_STR0, Z_STR1 = T_DECK, H - T_DECK  # stringer spans between the decks

# Top deck: 7 boards, wide lead boards at the ends, centre board on y=0
# (the bottom centre board needs it to stack onto).
TOP_LEAD, TOP_MID = 0.140, 0.089
# Bottom deck: three boards — both ends and the centre.
BOT_W = 0.140

# Four-way notches in each stringer's underside: 9 in long, 1.5 in deep,
# centred between the bottom boards.
NOTCH_LEN, NOTCH_DEPTH = 0.229, 0.038
NOTCH_Y = 0.30

# Character.
SPLIT_BOARD = 2          # top board index (0 = -Y lead) cracked lengthwise
SPLIT_GAP = 0.008
SPLIT_BREAK = 0.22       # one half is missing this much at its +X end
CHEW = (0.050, 0.030)    # forklift chew on the +X stringer's -Y bottom corner (dy, dz)

MATS = {
    #  name         base colour (linear)        rough
    # The lightest, warmest board; TINTS only darken from here.
    "PalletWood": ((0.285, 0.245, 0.180, 1.0), 0.90),
}

# Linear RGB multipliers, one per piece, dealt out in order (deterministic).
# Fresh pine / weathered grey / dark / honey / pale grey.  A greyer tint drops
# R more than B, which pulls the warm base toward neutral.
TINTS = [
    (1.00, 1.00, 1.00),
    (0.70, 0.76, 0.88),
    (0.64, 0.61, 0.58),
    (0.97, 0.82, 0.58),
    (0.85, 0.88, 0.94),
    (0.77, 0.73, 0.67),
]
TINT_STRIDE = 5          # step through TINTS so neighbours differ (coprime with len)

# ---------------------------------------------------------------------------
# Geometry accumulator
# ---------------------------------------------------------------------------
class Part:
    def __init__(self, name):
        self.name = name
        self.v = []
        self.f = []
        self.c = []          # per-face tint, see TINTS
        self.k = 0           # pieces dealt so far

    def tint(self):
        t = TINTS[(self.k * TINT_STRIDE) % len(TINTS)]
        self.k += 1
        return t

    def box(self, x0, x1, y0, y1, z0, z1):
        c = self.tint()
        o = len(self.v)
        self.v += [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                   (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        for fc in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
                   (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            self.f.append([i + o for i in fc])
            self.c.append(c)

    def prism_x(self, x0, x1, prof):
        """Extrude a (y, z) profile polygon along X from x0 to x1."""
        c = self.tint()
        n, o = len(prof), len(self.v)
        self.v += [(x0, y, z) for y, z in prof] + [(x1, y, z) for y, z in prof]
        self.f.append([o + i for i in range(n)])
        self.f.append([o + n + i for i in reversed(range(n))])
        self.c += [c, c]
        for i in range(n):
            j = (i + 1) % n
            self.f.append([o + i, o + j, o + n + j, o + n + i])
            self.c.append(c)


def top_boards():
    """(y0, y1) of each top deck board, evenly gapped, -Y to +Y."""
    widths = [TOP_LEAD] + [TOP_MID] * 5 + [TOP_LEAD]
    gap = (L - sum(widths)) / (len(widths) - 1)
    out, y = [], -L / 2
    for w in widths:
        out.append((y, y + w))
        y += w + gap
    return out


def bottom_boards():
    return [(-L / 2, -L / 2 + BOT_W), (-BOT_W / 2, BOT_W / 2),
            (L / 2 - BOT_W, L / 2)]


def stringer_profile(chew=False):
    """Stringer side profile in (y, z), counter-clockwise seen from +X."""
    a, b = Z_STR0, Z_STR1
    n0, n1 = NOTCH_Y - NOTCH_LEN / 2, NOTCH_Y + NOTCH_LEN / 2
    nz = a + NOTCH_DEPTH
    bottom = [(-L / 2, a), (-n1, a), (-n1, nz), (-n0, nz), (-n0, a),
              (n0, a), (n0, nz), (n1, nz), (n1, a), (L / 2, a)]
    if chew:
        bottom = [(-L / 2, a + CHEW[1]), (-L / 2 + CHEW[0], a)] + bottom[1:]
    return bottom + [(L / 2, b), (-L / 2, b)]


def build_pallet():
    p = Part("Pallet")
    for i, (y0, y1) in enumerate(top_boards()):
        if i == SPLIT_BOARD:
            ym = (y0 + y1) / 2
            p.box(-W / 2, W / 2, y0, ym - SPLIT_GAP / 2, H - T_DECK, H)
            p.box(-W / 2, W / 2 - SPLIT_BREAK, ym + SPLIT_GAP / 2, y1,
                  H - T_DECK, H)
        else:
            p.box(-W / 2, W / 2, y0, y1, H - T_DECK, H)
    for y0, y1 in bottom_boards():
        p.box(-W / 2, W / 2, y0, y1, 0.0, T_DECK)
    for k, xc in enumerate((-W / 2 + T_STR / 2, 0.0, W / 2 - T_STR / 2)):
        p.prism_x(xc - T_STR / 2, xc + T_STR / 2, stringer_profile(chew=(k == 2)))
    return p


# ---------------------------------------------------------------------------
# Bake / verify / export
# ---------------------------------------------------------------------------
def get_material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    col, rough = MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    # Base Color = col x vertex tint — the same multiply glTF does at runtime,
    # so the .blend previews the boards as the game draws them (the exporter
    # reads this pattern back as baseColorFactor + COLOR_0).
    nt = m.node_tree
    attr = nt.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.inputs[6].default_value = col                    # A (RGBA socket)
    nt.links.new(attr.outputs["Color"], mix.inputs[7])   # B
    nt.links.new(mix.outputs[2], b.inputs["Base Color"])
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
    me.materials.append(get_material("PalletWood"))
    # Every part above is a closed convex/prism shell with consistent outward
    # winding by construction; recalc is the belt-and-braces check.
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = False
    # Per-corner so each piece keeps its own flat tint; FLOAT_COLOR is linear,
    # the same space as baseColorFactor.  Face order survives the bmesh trip.
    col = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    for poly in me.polygons:
        r, g, b = part.c[poly.index]
        for li in poly.loop_indices:
            col.data[li].color = (r, g, b, 1.0)
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
    for d in (bpy.data.objects, bpy.data.meshes, bpy.data.materials):
        for x in list(d):
            d.remove(x)


def check_stack():
    """Acceptance: a second pallet at z=H sits flush. Flush = model spans
    exactly [0, H], and every bottom board's footprint lies over a top board."""
    tops = top_boards()
    ok = all(any(t0 < b1 and b0 < t1 for t0, t1 in tops)
             for b0, b1 in bottom_boards())
    print(f"  stack: z span [0, {H}], every bottom board bears on a top board: "
          f"{'OK' if ok else 'FAIL'}")
    return ok


def check_normals(ob, samples=400):
    import mathutils
    bad = tested = 0
    c = mathutils.Vector((0.0, 0.0, H / 2))
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


def _report(part, ob):
    t = evaluated_tris(ob)
    ext = [(min(c[i] for c in part.v), max(c[i] for c in part.v)) for i in range(3)]
    print(f"  {NAME}  {t} tris (budget {TRI_BUDGET})  "
          f"X {ext[0][1]-ext[0][0]:.3f} x Y {ext[1][1]-ext[1][0]:.3f} "
          f"x Z {ext[2][1]:.3f} m, base z {ext[2][0]:.3f}")
    print(f"  top gaps {top_boards()[1][0] - top_boards()[0][1]:.3f} m  "
          f"materials {len(bpy.data.materials)}  images {len(bpy.data.images)}")
    return t


def build(stack_preview=False):
    """The .blend source view: one pallet (plus a second stacked on it when
    stack_preview, for eyeballing the stack)."""
    _fresh_scene()
    print("=" * 60)
    part = build_pallet()
    ob = bake(part)
    _report(part, ob)
    check_normals(ob)
    check_stack()
    if stack_preview:
        ob2 = ob.copy()
        ob2.location.z = H
        bpy.context.collection.objects.link(ob2)
    print("=" * 60)
    return ob


def _ui_override():
    win = bpy.context.window_manager.windows[0]
    area = next(a for a in win.screen.areas if a.type == "VIEW_3D")
    region = next(r for r in area.regions if r.type == "WINDOW")
    return dict(window=win, screen=win.screen, area=area, region=region,
                scene=bpy.context.scene, view_layer=bpy.context.view_layer)


def export():
    """Needs the GUI Blender (blender-mcp): `blender -b` has no VIEW_3D area."""
    ob = build()
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
    return ob


if __name__ == "__main__":
    build()
