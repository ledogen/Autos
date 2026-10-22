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
    "PadOrange":  ((0.82, 0.30, 0.02, 1), 0.55),
    "PadNavy":    ((0.03, 0.07, 0.20, 1), 0.55),
    "BagGreen":   ((0.05, 0.13, 0.06, 1), 0.65),
    "Flannel":    ((0.55, 0.38, 0.18, 1), 0.95),
    "PlugBrown":  ((0.13, 0.05, 0.02, 1), 0.7),
    "CheckStripe":((0.08, 0.02, 0.018, 1), 0.95),
    "CheckDeep":  ((0.012, 0.010, 0.010, 1), 0.95),
    # SM-3 part icons + tire-repair kit (2026-10-21) — saturated paint, cast iron, friction material.
    "SpringRed":  ((0.645, 0.003, 0.027, 1), 0.45),   # #D20A2E (owner, 2026-10-21)
    "ShockYellow":((0.85, 0.55, 0.02, 1), 0.45),
    "Chrome":     ((0.62, 0.63, 0.64, 1), 0.25),
    "CastIron":   ((0.16, 0.16, 0.17, 1), 0.75),
    "Friction":   ((0.09, 0.08, 0.07, 1), 0.95),
    "ArbBlue":    ((0.03, 0.18, 0.55, 1), 0.5),
    "PolyRed":    ((0.55, 0.04, 0.03, 1), 0.6),
    "Zinc":       ((0.52, 0.50, 0.40, 1), 0.4),
    "Brass":      ((0.55, 0.36, 0.07, 1), 0.4),
    "GaugeFace":  ((0.82, 0.82, 0.80, 1), 0.5),
    # Stop-leak bottle (2026-10-21): printed label colours.
    "BottleNavy": ((0.010, 0.018, 0.050, 1), 0.45),
    "CapRed":     ((0.70, 0.02, 0.025, 1), 0.45),
    "LabelGreen": ((0.05, 0.38, 0.05, 1), 0.5),
    "LabelOrange":((0.88, 0.36, 0.02, 1), 0.5),
    "LabelRed":   ((0.72, 0.03, 0.02, 1), 0.5),
    # Compressor (2026-10-21).
    "Alu":        ((0.46, 0.47, 0.48, 1), 0.35),
    "GasketGrey": ((0.08, 0.08, 0.085, 1), 0.8),
    "Foam":       ((0.025, 0.025, 0.025, 1), 0.95),
    "Copper":     ((0.62, 0.28, 0.12, 1), 0.35),
    # Round 6 (2026-10-21). Diecast colours come from SHEEN below; this is the viewport colour.
    "Diecast":    ((0.20, 0.21, 0.22, 1), 0.35),
    "DiecastDark":((0.14, 0.145, 0.15, 1), 0.4),
    "PotatoSkin": ((0.30, 0.17, 0.07, 1), 0.9),
    "PotatoEye":  ((0.045, 0.022, 0.008, 1), 0.9),
    "JerryGreen": ((0.085, 0.11, 0.035, 1), 0.55),
    "WheelPaint": ((0.17, 0.175, 0.18, 1), 0.4),
    # Engine-bay parts (2026-10-22): filter paper, urethane, lamp optics, painted iron, pallet wood.
    "FilterPaper":((0.72, 0.60, 0.34, 1), 0.95),
    "Urethane":   ((0.05, 0.05, 0.055, 1), 0.8),
    "FilterCrease":((0.13, 0.10, 0.05, 1), 0.95),
    "Rust":       ((0.20, 0.075, 0.03, 1), 0.9),
    "Amber":      ((0.90, 0.38, 0.0, 1), 0.3),
    "Mirror":     ((0.40, 0.41, 0.42, 1), 0.2),
    "Lens":       ((0.80, 0.85, 0.90, 1), 0.05),
    "EngineBlue": ((0.03, 0.10, 0.42, 1), 0.5),
    "Pallet":     ((0.42, 0.28, 0.12, 1), 0.95),
    # Round 7 reworks (2026-10-22): plastic jerry can, russet skin, the Ranger's own lamp colours.
    "PlasticRed": ((0.62, 0.030, 0.018, 1), 0.45),
    "PotatoDark": ((0.15, 0.075, 0.028, 1), 0.9),
    "LampLens":   ((0.700, 0.690, 0.640, 1), 0.22),   # = ranger.py RangerLens
    "LampAmber":  ((0.640, 0.215, 0.010, 1), 0.28),   # = ranger.py RangerAmber
    # Round 7 food (2026-10-22).
    "Lettuce":    ((0.10, 0.36, 0.04, 1), 0.7),
    "Tomato":     ((0.62, 0.06, 0.03, 1), 0.5),
    "Cheese":     ((0.90, 0.52, 0.03, 1), 0.5),
    "Sesame":     ((0.86, 0.78, 0.55, 1), 0.7),
    "Kraft":      ((0.46, 0.30, 0.14, 1), 0.95),
    "KraftDark":  ((0.20, 0.12, 0.05, 1), 0.95),
    "Apple":      ((0.60, 0.04, 0.03, 1), 0.4),
    "Stem":       ((0.10, 0.06, 0.02, 1), 0.8),
    "Baguette":   ((0.62, 0.36, 0.11, 1), 0.85),
    "Carrot":     ((0.85, 0.28, 0.02, 1), 0.7),
    "FoilRed":    ((0.62, 0.04, 0.03, 1), 0.3),
    "FoilOrange": ((0.88, 0.30, 0.02, 1), 0.3),
    "Peanut":     ((0.62, 0.40, 0.17, 1), 0.8),
    "CandyBrown": ((0.11, 0.045, 0.02, 1), 0.35),
    "GummyBlue":  ((0.03, 0.22, 0.85, 1), 0.3),
    "GummyRed":   ((0.80, 0.03, 0.03, 1), 0.3),
    "GummyGreen": ((0.12, 0.62, 0.05, 1), 0.3),
    "GummyYellow":((0.92, 0.62, 0.02, 1), 0.3),
    "GummyOrange":((0.92, 0.30, 0.02, 1), 0.3),
    "DrinkYellow":((0.88, 0.64, 0.02, 1), 0.3),
    # Round 7 gear (2026-10-22).
    "CoolerBlue": ((0.03, 0.15, 0.52, 1), 0.5),
    "CoolerTan":  ((0.52, 0.42, 0.27, 1), 0.7),
    "Gold":       ((0.85, 0.58, 0.05, 1), 0.35),
    "Rope":       ((0.62, 0.55, 0.40, 1), 0.9),
    "JackRed":    ((0.66, 0.025, 0.02, 1), 0.45),
    "Ash":        ((0.58, 0.40, 0.20, 1), 0.8),
    "BladeBlack": ((0.035, 0.035, 0.04, 1), 0.5),
    "Screen":     ((0.025, 0.035, 0.045, 1), 0.3),
    "MapGreen":   ((0.10, 0.35, 0.10, 1), 0.6),
    "PadBlue":    ((0.04, 0.12, 0.42, 1), 0.9),
    "PadGrey":    ((0.10, 0.10, 0.11, 1), 0.9),
    "RubberLight":((0.09, 0.09, 0.095, 1), 0.9),
    "Lime":       ((0.35, 0.85, 0.02, 1), 0.4),
    "IceBag":     ((0.60, 0.72, 0.80, 1), 0.3),
    "IceBlue":    ((0.03, 0.18, 0.62, 1), 0.4),
    "IceCube":    ((0.80, 0.88, 0.94, 1), 0.15),
}


# Bare cast metal (dark, mid, light) linear grey by facet facing — no environment map in this rig, so
# reflections are painted on per facet (owner, 2026-10-21: the compressor's metal read as white paint).
SHEEN = {"Diecast": (0.05, 0.20, 0.62), "DiecastDark": (0.035, 0.13, 0.40), "Mirror": (0.02, 0.28, 0.95),
         "FilterPaper": ((0.34, 0.27, 0.13), (0.76, 0.65, 0.40), (0.96, 0.87, 0.60))}   # a stop may be an RGB triple
ALPHA = {"Lens": 0.22}   # see-through: the headlight's clear lens


def get_material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    col, rough = MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = col; b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = 0.0
    if name in SHEEN:   # base colour from the facet's facing: bright up-left, dark down — reads as bare metal
        nt = m.node_tree; geo = nt.nodes.new("ShaderNodeNewGeometry")
        dot = nt.nodes.new("ShaderNodeVectorMath"); dot.operation = "DOT_PRODUCT"
        dot.inputs[1].default_value = Vector((-0.45, 0.25, 0.86)).normalized()
        ramp = nt.nodes.new("ShaderNodeValToRGB"); els = ramp.color_ramp.elements
        rgb = lambda v, blue: (*v, 1) if isinstance(v, tuple) else (v, v, v * blue, 1)
        dark, mid, light = SHEEN[name]
        els[0].position, els[0].color = 0.0, rgb(dark, 1.05)
        els[1].position, els[1].color = 1.0, rgb(light, 1.02)
        e = els.new(0.5); e.color = rgb(mid, 1.04)
        rng = nt.nodes.new("ShaderNodeMapRange"); rng.inputs["From Min"].default_value = -1.0
        nt.links.new(geo.outputs["Normal"], dot.inputs[0]); nt.links.new(dot.outputs["Value"], rng.inputs["Value"])
        nt.links.new(rng.outputs["Result"], ramp.inputs["Fac"]); nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    if name in ALPHA:
        b.inputs["Alpha"].default_value = ALPHA[name]
        try:
            m.surface_render_method = "BLENDED"
        except (AttributeError, TypeError):
            m.blend_method = "BLEND"
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

    def tube(self, path, r, seg, mat, caps=True):
        """A round tube swept along a polyline, frames parallel-transported so it never twists."""
        P = [Vector(p) for p in path]
        T = [(P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized() for i in range(len(P))]
        u = T[0].cross(Vector((0, 0, 1)) if abs(T[0].z) < 0.9 else Vector((1, 0, 0))).normalized()
        rings = []
        for i, p in enumerate(P):
            u = (u - T[i] * u.dot(T[i])).normalized()
            v = T[i].cross(u)
            rings.append([p + (u * math.cos(2 * math.pi * k / seg) + v * math.sin(2 * math.pi * k / seg)) * r for k in range(seg)])
        self.loft(rings, mat, cap_bottom=caps, cap_top=caps)

    def prism(self, outline, z0, z1, mat, top=True, bottom=True):
        """Extrude a CCW (x, y) outline from z0 to z1."""
        n = len(outline)
        for k in range(n):
            j = (k + 1) % n
            (xa, ya), (xb, yb) = outline[k], outline[j]
            self.face([(xa, ya, z0), (xb, yb, z0), (xb, yb, z1), (xa, ya, z1)], mat)
        if bottom:
            self.face([(x, y, z0) for x, y in reversed(outline)], mat)
        if top:
            self.face([(x, y, z1) for x, y in outline], mat)

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
    """A 12 oz paper to-go cup: tapered cup, rolled rim, kraft sleeve, squared-off sip lid. Seven-sided
    (owner, 2026-10-21: lower poly reads with more spice than a smooth round cup)."""
    b = Builder(); SEG = 7; PH = math.radians(-90) + math.pi / SEG   # seven sides, a flat facing front
    r = lambda z: 0.030 + (0.0455 - 0.030) * z / 0.128
    b.lathe([(0.0285, 0.0), (0.030, 0.002)] + [(r(z), z) for z in (0.02, 0.05, 0.08, 0.11, 0.126)]
            + [(0.0472, 0.129), (0.0472, 0.1325)], SEG, "CupPaper", cap_top=False, phase=PH)
    z0, z1 = 0.034, 0.094
    b.lathe([(r(z0), z0), (r(z0) + 0.0022, z0), (r(z0 + 0.03) + 0.0022, z0 + 0.03), (r(z1) + 0.0022, z1), (r(z1), z1)],
            SEG, "CupSleeve", cap_bottom=False, cap_top=False, phase=PH)
    # Lid: a skirt reaching down past the rolled rim (owner, 2026-10-21) with a bead, a flat shelf, then a near-vertical wall up to a
    # squared-off raised band around a recessed flat centre; the sip slot sits on the band at the front.
    b.lathe([(0.0458, 0.1252), (0.0490, 0.1252), (0.0492, 0.1262), (0.0492, 0.1335), (0.0497, 0.1342), (0.0497, 0.1356),
             (0.0492, 0.1362), (0.0444, 0.1366), (0.0434, 0.1478), (0.0426, 0.1488), (0.0372, 0.1488),
             (0.0366, 0.1478), (0.0, 0.1478)], SEG, "CupLid", cap_bottom=False, cap_top=False, phase=PH)
    ap = 0.0403 * math.cos(math.pi / SEG)   # the raised band's mid radius, measured to the front flat
    b.cbox((0.0, -ap, 0.1489), (0.011, 0.0035, 0.0006), "Chili", ch=0.0)   # sip slot: coffee showing through
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
    N = 24   # lower poly (owner, 2026-10-21)
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
    def arch(x0, x1, z1, lw, th, k):   # the handle's side outline: two legs and a bar, corners cut by k
        z0 = top - 0.012
        return [(x0, z0), (x0 + lw, z0), (x0 + lw, z1 - th - k), (x0 + lw + k, z1 - th), (x1 - lw - k, z1 - th),
                (x1 - lw, z1 - th - k), (x1 - lw, z0), (x1, z0), (x1, z1 - k), (x1 - k, z1), (x0 + k, z1), (x0, z1 - k)]
    HT, CH = 0.032, 0.005   # handle thickness; chamfer on its front and back edges (owner, 2026-10-21: one solid)
    full = arch(-0.110, 0.060, top + 0.055, 0.032, 0.026, 0.012)
    inset = arch(-0.110 + CH, 0.060 - CH, top + 0.055 - CH, 0.032 - 2 * CH, 0.026 - 2 * CH, 0.012)
    hl = [(inset, -HT / 2), (full, -HT / 2 + CH), (full, HT / 2 - CH), (inset, HT / 2)]
    for (la, ya), (lb, yb) in zip(hl, hl[1:]):
        for k in range(len(full)):
            j = (k + 1) % len(full)
            b.face([(la[k][0], ya, la[k][1]), (la[j][0], ya, la[j][1]), (lb[j][0], yb, lb[j][1]), (lb[k][0], yb, lb[k][1])], "CanRed")
    for lp, y in ((inset, -HT / 2), (inset, HT / 2)):
        b.face([(x, y, z_) for x, z_ in lp], "CanRed")
    b.M = Matrix.Translation((0.128, 0, top - 0.012)) @ Matrix.Rotation(math.radians(-18), 4, "Y")
    b.lathe([(0.040, 0.0), (0.040, 0.014), (0.044, 0.017), (0.044, 0.050), (0.040, 0.055), (0.0, 0.057)], 12, "CanBlack", cap_top=False)
    for k in range(12):  # knurl ribs on the (bigger) cap
        a = 2 * math.pi * (k + 0.5) / 12
        b.bar((0.045 * math.cos(a), 0.045 * math.sin(a), 0.019), (0.045 * math.cos(a), 0.045 * math.sin(a), 0.047), 0.005, "CanBlack")
    b.M = Matrix.Identity(4)
    return b.finish("emergencyGas")


def build_pack():
    """A small canvas book bag: boxy body with rounded top edges, two leather straps buckled over the
    top, leather base, leather-flapped front pocket with two buckled straps, canvas webbing shoulder
    straps on leather tabs, a leather grab loop."""
    b = Builder()
    D = 0.106   # body depth at its widest
    body = ((0.0, 0.25, 0.085), (0.02, 0.27, 0.10), (0.20, 0.276, D), (0.31, 0.276, D), (0.350, 0.264, 0.099),
            (0.369, 0.228, 0.082))   # lower poly (owner, 2026-10-21)
    b.loft([rrect(w, d, min(0.025, d / 2 - 0.002), z, per=2) for z, w, d in body], "Canvas")
    # Leather base, wrapped a few mm proud of the canvas.
    base = ((0.0, 0.256, 0.091), (0.02, 0.276, 0.106), (0.06, 0.280, 0.110))
    b.loft([rrect(w, d, 0.026, z, per=2) for z, w, d in base], "Leather", cap_top=False)
    # Two leather straps over the top, from the back down the front, buckled above the pocket.
    over = [r for r in body if r[0] >= 0.30]
    path = [(d / 2, z) for z, w, d in over] + [(-d / 2, z) for z, w, d in reversed(over)] + [(-D / 2, 0.255)]
    for x in (-0.06, 0.06):
        for (y0, z0), (y1, z1) in zip(path, path[1:]):
            t = Vector((0, y1 - y0, z1 - z0)).normalized(); n = (0, -t.z, t.y)
            b.bar((x, y0, z0), (x, y1, z1), 0.022, "Leather", h=0.004, caps=False, up=n)
        yb, bz = -D / 2 - 0.003, 0.290
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
    for z, w, d in ((0.0, 0.26, 0.13), (0.02, 0.285, 0.155), (0.10, 0.305, 0.175), (0.24, 0.31, 0.178),
                    (0.36, 0.295, 0.165), (0.42, 0.27, 0.145), (0.445, 0.24, 0.12)):   # lower poly (owner, 2026-10-21)
        rings.append(rrect(w, d, 0.045, z, per=2))
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
    # Two leather straps from under the top flap, buckled above the pocket; the pocket's own two short
    # straps run down from its flap (owner, 2026-10-21: the long ones clipped through it — do it like the pack).
    def buckle(x, y, bz, hw, hh, t):
        for (p, q) in (((x - hw, y, bz - hh), (x + hw, y, bz - hh)), ((x - hw, y, bz + hh), (x + hw, y, bz + hh)),
                       ((x - hw, y, bz - hh), (x - hw, y, bz + hh)), ((x + hw, y, bz - hh), (x + hw, y, bz + hh))):
            b.bar(p, q, t, "Buckle")
    for x in (-0.065, 0.065):
        b.ribbon([(x, -0.103, 0.335), (x, -0.100, 0.300), (x, -0.094, 0.270), (x, -0.092, 0.236)], (0, -1, 0), 0.024, 0.004, "Leather")
        buckle(x, -0.097, 0.262, 0.017, 0.013, 0.005)
        b.ribbon([(x * 0.85, -0.1395, 0.200), (x * 0.85, -0.1345, 0.150), (x * 0.85, -0.134, 0.090)], (0, -1, 0), 0.020, 0.003, "Leather")
        buckle(x * 0.85, -0.137, 0.140, 0.014, 0.011, 0.004)
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
    b = Builder(); SEG = 15   # owner, 2026-10-21
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
    """A camping air mattress, long along X: a round, bulging vinyl body and a flocked top quilted by
    dimples pressed into the surface, and a valve. No pillow: the sleeping bag lies on it in camp."""
    b = Builder()
    L, W, H = 1.88, 0.76, 0.17
    b.loft([rrect(L - 2 * i, W - 2 * i, 0.16 - i, z, per=7) for z, i in
            ((0.0, 0.05), (0.02, 0.018), (0.06, 0.0), (0.11, 0.0), (0.15, 0.018), (H, 0.045))], "Vinyl", cap_top=False)
    # Flocked top: a height field over the top ring's footprint, dimpled on a coil-beam grid. Its
    # border sits on the body's top ring, so the round edge carries straight on into the quilting.
    NX, NY = 72, 30
    ring = rrect(L - 0.09, W - 0.09, 0.115, H, per=7)
    def inside(x, y):   # rounded-rectangle test, shrunk to the top ring
        ax, ay, r = abs(x) - ((L - 0.09) / 2 - 0.115), abs(y) - ((W - 0.09) / 2 - 0.115), 0.115
        return (ax <= 0 or ay <= 0 or ax * ax + ay * ay <= r * r) and abs(x) <= (L - 0.09) / 2 and abs(y) <= (W - 0.09) / 2
    def z(x, y):
        dx = ((x + L / 2) % 0.105) - 0.0525; dy = ((y + W / 2) % 0.095) - 0.0475
        dimple = 0.019 * math.exp(-(dx * dx + dy * dy) / (2 * 0.015 ** 2))
        edge = min((L - 0.09) / 2 - abs(x), (W - 0.09) / 2 - abs(y))
        puff = 0.022 * min(1.0, max(0.0, edge) / 0.06) ** 0.5
        return H + puff - dimple
    xs = [-(L - 0.09) / 2 + (L - 0.09) * i / NX for i in range(NX + 1)]
    ys = [-(W - 0.09) / 2 + (W - 0.09) * j / NY for j in range(NY + 1)]
    for i in range(NX):
        for j in range(NY):
            c = [(xs[i], ys[j]), (xs[i + 1], ys[j]), (xs[i + 1], ys[j + 1]), (xs[i], ys[j + 1])]
            if all(inside(x, y) for x, y in c):
                b.face([(x, y, z(x, y)) for x, y in c], "Flock")
    b.face(list(reversed(ring)), "Vinyl")   # floor under the field, closes any corner sliver
    b.M = Matrix.Translation((L / 2 - 0.50, -W / 2 + 0.002, 0.085)) @ Matrix.Rotation(math.pi / 2, 4, "X")
    b.lathe([(0.018, -0.004), (0.018, 0.008), (0.013, 0.010), (0.013, 0.024), (0.0, 0.026)], 12, "Buckle")
    b.M = Matrix.Identity(4)
    return b.finish("airMattress")




def inflatable_pad(name, L, W0, W1, H, pitch, top, bottom, pillow=0.0):
    """An unrolled inflatable pad, long along X: stadium cross-sections lofted along the length,
    their height pinched at every lateral baffle so the tubes read; tapers W0 (head) → W1 (foot)."""
    b = Builder()
    n_ring, seg = int(L / pitch) * 8, 12
    rings, mats = [], []
    for i in range(n_ring + 1):
        x = -L / 2 + L * i / n_ring
        t = (x + L / 2) / L
        w = W0 + (W1 - W0) * max(0.0, (t - 0.35) / 0.65)   # head two-thirds straight, then taper
        tube = 0.80 + 0.20 * abs(math.sin(math.pi * (x + L / 2) / pitch))
        end = min(1.0, (L / 2 - abs(x)) / 0.03) ** 0.5
        h = H * tube * (0.35 + 0.65 * end) + (pillow if x < -L / 2 + 0.30 and x > -L / 2 + 0.04 else 0.0)
        r = h / 2; half = max(w / 2 - r, 0.01)
        pts = []
        for k in range(seg + 1):   # +Y end cap, then −Y end cap
            a = -math.pi / 2 + math.pi * k / seg
            pts.append((x, half + r * math.cos(a), r + r * math.sin(a)))
        for k in range(seg + 1):
            a = math.pi / 2 + math.pi * k / seg
            pts.append((x, -half + r * math.cos(a), r + r * math.sin(a)))
        rings.append(pts)
    n = len(rings[0])
    for a, c in zip(rings, rings[1:]):
        for k in range(n):
            j = (k + 1) % n
            b.face([a[k], a[j], c[j], c[k]], top if (a[k][2] + a[j][2]) / 2 > max(p[2] for p in a) / 2 else bottom)
    b.face(list(reversed(rings[0])), bottom); b.face(rings[-1], bottom)
    # Valve at the foot, on the near (−Y) shoulder.
    b.M = Matrix.Translation((L / 2 - 0.06, -W1 / 2 + 0.06, H * 0.95))
    b.lathe([(0.012, 0.0), (0.012, 0.010), (0.009, 0.012), (0.009, 0.022), (0.0, 0.023)], 12, "Buckle")
    b.M = Matrix.Identity(4)
    return b.finish(name)




def build_sleepingPad():
    """A thin backpacking pad, unrolled: insulated, rectangular, lateral baffles, valve."""
    return inflatable_pad("sleepingPad", 1.83, 0.51, 0.51, 0.064, 0.085, "PadOrange", "FoamSilver")




def build_deluxeSleepingPad():
    """The thick insulated pad, unrolled: wide and rectangular, deep baffles, a raised pillow end."""
    return inflatable_pad("deluxeSleepingPad", 1.93, 0.64, 0.64, 0.10, 0.12, "PadNavy", "FoamSilver", pillow=0.035)




def build_blanket():
    """A folded wool blanket in buffalo check: one continuous fold profile swept along X, so every
    band wraps the top, the round fold and the back without a seam; the crossings run darker."""
    b = Builder()
    X, Y, T, N = 0.46, 0.34, 0.022, 4
    Hs = N * T; R = Hs / 2
    # Profile in (y, z), a closed loop: back-bottom → front fold → top → back face (stepped layers).
    prof = []
    yf = -Y / 2 + R
    step = 0.004
    y = Y / 2
    while y > yf:
        prof.append((y, 0.0)); y -= step
    for k in range(25):
        a = -math.pi / 2 - math.pi * k / 24
        prof.append((yf + R * math.cos(a), R + R * math.sin(a)))
    y = yf + step
    while y < Y / 2:
        prof.append((y, Hs)); y += step
    for i in range(N, 0, -1):   # the back face: each layer bulges out a little past the one under it
        prof += [(Y / 2 + 0.004, i * T - 0.004), (Y / 2 + 0.006, i * T - T / 2), (Y / 2 + 0.002, (i - 1) * T + 0.003)]
    across = [(-0.172, 0.036), (-0.06, 0.036), (0.06, 0.036), (0.172, 0.036)]   # (centre x, width)
    along_top = (-0.06, 0.07)                                                 # centre y on the top
    def on_along(y, z):
        if z > Hs - 1e-6:
            return any(abs(y - c) < 0.018 for c in along_top)
        if y < yf and z > 1e-6:   # on the fold: one band at ~45° up the round front
            ang = math.degrees(math.atan2(z - R, y - yf))
            return abs(ang - 135) < math.degrees(0.018 / R)
        return False
    xb = sorted({-X / 2, X / 2} | {c + s * w / 2 for c, w in across for s in (-1, 1)})
    xs = []
    for x0, x1 in zip(xb, xb[1:]):   # a few rings per stretch so the soft end corners can taper
        xs += [x0 + (x1 - x0) * k / 2 for k in range(2)]
    xs.append(X / 2)
    def ring(x):
        e = min(1.0, (X / 2 - abs(x)) / 0.012)
        s = 0.94 + 0.06 * e
        return [(x, py * s, R + (pz - R) * s) for py, pz in prof]
    rings = [ring(x) for x in xs]
    n = len(prof)
    for ra, rb_, xa, xb_ in zip(rings, rings[1:], xs, xs[1:]):
        xm = (xa + xb_) / 2
        cross = any(abs(xm - c) < w / 2 for c, w in across)
        for k in range(n):
            j = (k + 1) % n
            pm = ((prof[k][0] + prof[j][0]) / 2, (prof[k][1] + prof[j][1]) / 2)
            al = on_along(*pm)
            mat = "CheckDeep" if cross and al else ("CheckStripe" if cross or al else "RedWool")
            b.face([ra[k], ra[j], rb_[j], rb_[k]], mat)
    b.face(list(reversed(rings[0])), "RedWool"); b.face(rings[-1], "RedWool")
    return b.finish("blanket")




def build_sleepingBag():
    """A rectangular sleeping bag laid out flat, its near head corner unzipped and turned back to
    show the flannel lining — ready to slide into. The head end (+X) is framed by a thick stuffed collar,
    which folds over with the flap. Lofted top quilted in puffy baffles; the turned-back
    flap is the top layer's own fill, so it drapes over the baffles and rolls round a fold whose
    radius is that fill's thickness — the open corner sits up on top of the bag."""
    b = Builder()
    L, W, s = 1.90, 0.85, 0.025
    nu, nv, nc = int(round(L / s)), int(round(W / s)), 24   # fold line u + v = nc·s (0.60 m: leaves a third of the head collar on the bag)
    zb, ht = 0.050, 0.085   # bottom layer; the top layer's loft at its fullest
    # Bottom layer: a soft slab, outer shell; its top shows flannel where the corner is turned back.
    b.cbox((0, 0, zb / 2), (L, W, zb), "BagGreen", ch=0.020)
    b.cbox((0, 0, zb + 0.0005), (L - 0.04, W - 0.04, 0.001), "Flannel")
    # Grid in (u, v): u from the +X end, v from the −Y side. x = L/2 − u, y = v − W/2.
    def top_z(u, v):   # baffles puff between the sewn-through seams; the loft rounds down at the zips
        baffle = 0.80 + 0.20 * math.sin(math.pi * ((u % 0.19) / 0.19))
        edge = min(u, L - u, v, W - v)
        return zb + ht * baffle * min(1.0, max(0.0, edge) / 0.10) ** 0.5
    P = lambda u, v, z: (L / 2 - u, v - W / 2, z)
    def tris(i, j):
        a, bb, c, d = (i, j), (i + 1, j), (i, j + 1), (i + 1, j + 1)
        return [((a, bb, c), i + j + 1), ((bb, d, c), i + j + 2)]
    keep, flap = [], []
    for i in range(nu):
        for j in range(nv):
            for t, smax in tris(i, j):
                (flap if smax <= nc else keep).append(t)
    for t in keep:
        b.face([P(i * s, j * s, top_z(i * s, j * s)) for i, j in t], "BagGreen")
    def boundary(ts):   # edges used by one triangle only
        cnt = {}
        for t in ts:
            for e in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
                k = tuple(sorted(e)); cnt[k] = cnt.get(k, 0) + 1
        return [k for k, c in cnt.items() if c == 1]
    fold = lambda e: all(i + j == nc for i, j in e)
    # The flap: reflected across the fold (u, v) → (c − v, c − u). Its underside rests on the kept top
    # it now covers; its thickness is the fill it had where it came from (thin at its zipped edges).
    c = nc * s
    R = lambda u, v: (c - v, c - u)
    # The baffles puff on the shell side only, so the turned-back flap shows a smooth lining (owner,
    # 2026-10-21): it drapes on the baffles' mean loft and keeps its own thickness, no puffs on top.
    smooth = lambda u, v: zb + ht * 0.93 * min(1.0, max(0.0, min(u, L - u, v, W - v)) / 0.10) ** 0.5
    under = lambda u, v: smooth(u, v) + 0.003                   # (u, v) = where the flap now lies
    over = lambda u, v: under(u, v) + smooth(*R(u, v)) - zb     # R(u, v) = where that bit came from
    for t in flap:
        q = [R(i * s, j * s) for i, j in t]
        b.face([P(u, v, over(u, v)) for u, v in q], "Flannel")
        b.face([P(u, v, under(u, v)) for u, v in reversed(q)], "BagGreen")
    for (i0, j0), (i1, j1) in boundary(flap):
        if fold(((i0, j0), (i1, j1))) or i0 == i1 == 0:   # the head edge carries the collar, not a zip
            continue
        (u0, v0), (u1, v1) = R(i0 * s, j0 * s), R(i1 * s, j1 * s)
        if over(u0, v0) - under(u0, v0) > 0.002 or over(u1, v1) - under(u1, v1) > 0.002:
            b.face([P(u0, v0, under(u0, v0)), P(u1, v1, under(u1, v1)), P(u1, v1, over(u1, v1)), P(u0, v0, over(u0, v0))], "BagGreen")
        b.bar(P(u0, v0, over(u0, v0) + 0.002), P(u1, v1, over(u1, v1) + 0.002), 0.014, "Nylon", h=0.006)   # zip tape on the flap edge
    # The bend: the top layer rolls 180° along the fold, from the bottom layer up to the flap's face.
    # Per station: a half circle bulging over the opened corner, radius = the fill's thickness there.
    nrm = Vector((1, -1, 0)).normalized()   # toward the opened corner, in x/y
    rings = []
    for k in range(nc * 2 + 1):
        uf = c * (1 - k / (nc * 2)); vf = c - uf
        z0, z1 = zb, over(uf, vf)
        rad, zc = (z1 - z0) / 2, (z1 + z0) / 2
        base = Vector(P(uf, vf, 0.0))
        rings.append([base + nrm * (rad * math.sin(math.pi * m / 10)) + Vector((0, 0, zc - rad * math.cos(math.pi * m / 10)))
                      for m in range(11)])
    for ra, rb_ in zip(rings, rings[1:]):   # folding a layer over puts its lining on the outside of the roll
        for m in range(10):
            b.face([ra[m], ra[m + 1], rb_[m + 1], rb_[m]], "Flannel")
    # Zipper along the opened legs on the bottom layer, then on along the near side seam.
    b.bar(P(0.0, 0.008, zb + 0.003), P(c, 0.008, zb + 0.003), 0.016, "Nylon", h=0.006)
    b.bar(P(c, 0.001, zb + 0.004), P(L - 0.02, 0.001, zb + 0.004), 0.008, "Nylon", h=0.006)
    b.cbox(P(c + 0.02, -0.006, zb + 0.004), (0.022, 0.012, 0.010), "Buckle", ch=0.002)   # zip pull
    # The head opening is framed by a thick stuffed collar on the top layer's edge (owner, 2026-10-21; it
    # replaced a drawcord too small to see). It folds with the flap: the collar's centre line, inset dc
    # from the edge, meets the fold at (dc, c − dc), turns 90° there and runs on along the turned-back
    # edge, resting on the bag the flap now covers.
    RC, dc = 0.060, 0.045
    nk, nf = 6, 12
    kept = [P(dc, (W - 0.045) + ((c - dc + 0.03) - (W - 0.045)) * k / nk, zb + RC) for k in range(nk + 1)]
    turned = [P(u, c - dc, under(u, c - dc) + RC) for u in (dc + 0.03 + (c - 0.075 - dc) * k / nf for k in range(nf + 1))]
    b.tube(kept + [P(dc, c - dc, zb + RC + 0.035)] + turned, RC, 10, "BagGreen")
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
    """A roll of silver duct tape on edge, cardboard core; the loose end wraps the underside of the
    roll and runs straight out along the ground. Its far end dives under the roll's surface, so there
    is no step where the loose layer begins."""
    b = Builder(); SEG = 18   # lower poly (owner, 2026-10-21)
    Ro, Ri, Hw = 0.060, 0.040, 0.024
    ap = Ro * math.cos(math.pi / SEG)   # the roll stands on a flat, so its axle is at the flat's distance
    b.M = Matrix.Translation((0, 0, ap)) @ Matrix.Rotation(math.pi / 2, 4, "X")
    b.lathe([(Ri, -Hw), (Ro - 0.003, -Hw), (Ro, -Hw + 0.002), (Ro, Hw - 0.002), (Ro - 0.003, Hw), (Ri, Hw)], SEG, "TapeSilver",
            cap_bottom=False, cap_top=False)
    b.lathe([(Ri + 0.0002, Hw + 0.0006), (0.0345, Hw + 0.0006), (0.0345, -Hw - 0.0006), (Ri + 0.0002, -Hw - 0.0006)], SEG, "Cardboard",
            cap_bottom=False, cap_top=False)
    for r in (0.047, 0.054):
        for sg in (-1, 1):
            z = sg * (Hw + 0.0003)
            b.lathe([(r, z), (r + 0.0012, z)] if sg > 0 else [(r + 0.0012, z), (r, z)], SEG, "SteelDark", cap_bottom=False, cap_top=False)
    b.M = Matrix.Identity(4)
    # The strip's centre line in XZ: an arc hugging the roll from the back round to the bottom, then
    # flat along the ground and curling up at the end. Two skins 0.8 mm apart along the local normal.
    def r(d):   # starts tucked under the roll's faceted surface, eases out to sit on it by 205°
        t = min(1.0, max(0.0, (d - 150) / 55))
        surf = ap / math.cos(math.radians((d % (360 / SEG)) - 180 / SEG))   # the facet under angle d
        return surf - 0.0014 + 0.0023 * (3 * t * t - 2 * t * t * t)
    path = [(r(d) * math.cos(math.radians(d)), ap + r(d) * math.sin(math.radians(d))) for d in range(150, 271, 5)]
    path += [(0.03, 0.0006), (0.06, 0.0006), (0.09, 0.0006), (0.11, 0.003), (0.122, 0.011)]
    hw = Hw - 0.0005
    def norm(k):   # toward the roll's centre on the arc, up on the ground
        p0, p1 = Vector(path[max(k - 1, 0)]), Vector(path[min(k + 1, len(path) - 1)])
        d = (p1 - p0).normalized()
        return Vector((-d.y, d.x))
    for k in range(len(path) - 1):
        (x0, z0), (x1, z1) = path[k], path[k + 1]
        n0, n1 = norm(k), norm(k + 1)
        o0 = (x0 + n0.x * 0.0008, z0 + n0.y * 0.0008); o1 = (x1 + n1.x * 0.0008, z1 + n1.y * 0.0008)
        b.face([(x0, hw, z0), (x1, hw, z1), (x1, -hw, z1), (x0, -hw, z0)], "TapeSilver")
        b.face([(o0[0], -hw, o0[1]), (o1[0], -hw, o1[1]), (o1[0], hw, o1[1]), (o0[0], hw, o0[1])], "TapeSilver")
    return b.finish("ductTape")




def build_tirePlugKit():
    """A roadside tire plug kit, laid out like the photo on its box: the T-handle spiral reamer and
    the T-handle insertion needle side by side, one handle up and one down, and five sticky string
    plugs in a neat row beside them. Grips carry finger grooves."""
    b = Builder()
    # The grip, along local Y: three finger scallops either side of the ferrule.
    prof = [(0.0, -0.054), (0.007, -0.0535), (0.0115, -0.051)]
    zs = [-0.048 + 0.096 * k / 48 for k in range(49)]
    for z in zs:
        a = abs(z)
        g = math.sin(math.pi * (a - 0.012) / 0.0113) ** 2 if 0.012 < a < 0.046 else 0.0
        prof.append((0.0135 - 0.0028 * g, z))
    prof += [(0.0115, 0.051), (0.007, 0.0535), (0.0, 0.054)]
    def t_tool(origin, yaw, tip):
        M0 = Matrix.Translation(origin) @ Matrix.Rotation(yaw, 4, "Z")
        b.M = M0 @ Matrix.Translation((0, 0, 0.0135)) @ Matrix.Rotation(math.pi / 2, 4, "X")
        b.lathe(prof, 12, "TinRed", cap_bottom=False, cap_top=False)
        b.M = M0 @ Matrix.Translation((0, 0, 0.0135)) @ Matrix.Rotation(math.pi / 2, 4, "Y")
        b.lathe([(0.0080, 0.011), (0.0080, 0.022), (0.0060, 0.025), (0.0045, 0.028)], 12, "Steel", cap_bottom=False)   # ferrule
        b.M = M0
        tip(b)
        b.M = Matrix.Identity(4)
    zx = lambda x: 0.0135 + (0.0030 - 0.0135) * (x - 0.028) / 0.080   # shaft runs down to rest its tip on the ground
    def reamer(b):   # a square bar twisted along its length — the spiral rasp — to a point
        rings = []
        for k in range(41):
            t = k / 40; x = 0.028 + 0.080 * t
            a = t * 7 * math.pi; s = 0.0036 * (1.0 if t < 0.85 else 1 - 0.8 * (t - 0.85) / 0.15)
            rings.append([(x, s * math.cos(a + q * math.pi / 2), zx(x) + s * math.sin(a + q * math.pi / 2)) for q in range(4)])
        b.loft(rings, "Steel")
    def needle(b):   # a flat blade with an open eye near the tip
        b.bar((0.028, 0, zx(0.028)), (0.084, 0, zx(0.084)), 0.0058, "Steel", h=0.0018)
        for y in (-0.0022, 0.0022):
            b.bar((0.084, y, zx(0.084)), (0.100, y, zx(0.100)), 0.0014, "Steel", h=0.0018)
        b.bar((0.100, 0, zx(0.100)), (0.108, 0, zx(0.108)), 0.0040, "Steel", h=0.0018)
    t_tool((-0.072, 0.017, 0.0), 0.0, reamer)        # handle on the left, shaft pointing right
    t_tool((0.072, -0.017, 0.0), math.pi, needle)    # handle on the right, shaft pointing left
    for k in range(5):   # five string plugs in a row, each with a slight kink
        y = -0.088 - 0.0135 * k
        kink = 0.0035 * (1 if k % 2 else -1)
        pts = [(-0.050, y, 0.0014), (-0.004, y + kink, 0.0016), (0.050, y + 0.6 * kink, 0.0014)]
        b.bar(pts[0], pts[1], 0.0068, "PlugBrown", h=0.0028)
        b.bar(pts[1], pts[2], 0.0068, "PlugBrown", h=0.0028)
    return b.finish("tirePlugKit")




def build_stopLeak():
    """A bottle of radiator stop-leak, ten-sided (owner, 2026-10-21): dark navy bottle, red cap, a
    printed label whose colour bands rise to the right, and STOP over LEAK in two lines. Bands and
    letters are laid out flat (u = distance round the bottle from the front facet's centre, z = height),
    cut at the facet edges and folded onto the facets, so every piece lies flat on its facet."""
    b = Builder(); N = 10; R = 0.036
    TH = math.atan2(VIEW_DIR.y, VIEW_DIR.x)            # the front facet faces the camera
    PH = TH - math.pi / N                              # lathe phase that centres a facet on TH
    ap, w = R * math.cos(math.pi / N), 2 * R * math.sin(math.pi / N)
    b.lathe([(0.0, 0.0), (0.032, 0.0), (R, 0.004), (R, 0.129), (0.0345, 0.140), (0.030, 0.150), (0.024, 0.157),
             (0.0185, 0.161), (0.0175, 0.164), (0.0175, 0.170)], N, "BottleNavy", cap_top=False, phase=PH)
    b.lathe([(0.0175, 0.166), (0.0198, 0.166), (0.0198, 0.170), (0.0175, 0.170)], N, "CapRed",
            cap_bottom=False, cap_top=False, phase=PH)
    b.lathe([(0.0175, 0.1705), (0.0205, 0.1705), (0.0205, 0.1925), (0.0183, 0.1950), (0.0, 0.1952)], N, "CapRed",
            cap_bottom=False, phase=PH)
    for k in range(2 * N):   # cap ribs: on the corners and on each facet's centre, sitting on the surface
        a = PH + math.pi * k / N
        rr = (0.0205 if k % 2 == 0 else 0.0205 * math.cos(math.pi / N)) + 0.0006
        b.bar((rr * math.cos(a), rr * math.sin(a), 0.1725), (rr * math.cos(a), rr * math.sin(a), 0.1915), 0.0018, "CapRed")

    def clip(poly, a, c, k):   # keep the part of a 2D polygon where a*u + c*z <= k
        out = []
        for i, p in enumerate(poly):
            q = poly[(i + 1) % len(poly)]
            dp, dq = a * p[0] + c * p[1] - k, a * q[0] + c * q[1] - k
            if dp <= 0:
                out.append(p)
            if dp * dq < 0:
                t = dp / (dp - dq); out.append((p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])))
        return out

    def decal(poly, mat, lift):   # fold a flat (u, z) polygon onto the facets, `lift` proud of them
        sc = 1 + lift / ap
        for j in range(-N // 2, N // 2):
            piece = clip(clip(poly, 1, 0, (j + 0.5) * w), -1, 0, -(j - 0.5) * w)
            if len(piece) < 3:
                continue
            ph = TH + 2 * math.pi * j / N
            b.face([((ap * math.cos(ph) - (u - j * w) * math.sin(ph)) * sc,
                     (ap * math.sin(ph) + (u - j * w) * math.cos(ph)) * sc, z) for u, z in piece], mat)

    S, Z0, Z1, U = 0.30, 0.006, 0.127, N * w / 2        # band slope, label bottom/top, half the way round
    def band(lo, hi, mat):   # lo/hi: the band's edges at the front (u = 0); None = the label's own edge
        poly = [(-U, Z0), (U, Z0), (U, Z1), (-U, Z1)]
        if lo is not None:
            poly = clip(poly, S, -1, -lo)
        if hi is not None:
            poly = clip(poly, -S, 1, hi)
        decal(poly, mat, 0.0003)
    band(None, 0.033, "LabelOrange"); band(0.033, 0.044, "LabelGreen")
    band(0.091, 0.102, "LabelGreen"); band(0.107, 0.115, "LabelRed")

    def words(text, size, offset, centre, mat, lift):   # Blender's text -> triangles, tilted with the bands
        cu = bpy.data.curves.new("txt", "FONT"); cu.body = text; cu.size = size; cu.offset = offset
        cu.shear = 0.15; cu.align_x = "CENTER"; cu.align_y = "CENTER"
        ob = bpy.data.objects.new("txt", cu); bpy.context.collection.objects.link(ob)
        ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
        ca, sa = math.cos(math.atan(S)), math.sin(math.atan(S))
        for p in me.polygons:
            decal([(centre[0] + me.vertices[i].co.x * ca - me.vertices[i].co.y * sa,
                    centre[1] + me.vertices[i].co.x * sa + me.vertices[i].co.y * ca) for i in p.vertices], mat, lift)
        ev.to_mesh_clear(); bpy.data.objects.remove(ob); bpy.data.curves.remove(cu)
    words("STOP", 0.024, 0.0008, (0.0, 0.0790), "LabelOrange", 0.0009)
    words("LEAK", 0.024, 0.0018, (0.0, 0.0560), "PlasticWhite", 0.0006)   # white outline, like the print
    words("LEAK", 0.024, 0.0008, (0.0, 0.0560), "LabelRed", 0.0009)
    return b.finish("stopLeak")


def build_bubbleWrap():
    """A roll of bubble wrap on a cardboard core, a sheet unrolled across the ground in front of it.
    Bubbles: wide and low, fewer of them."""
    b = Builder()
    R, L, SEG = 0.10, 0.40, 32
    PITCH, RB, HB = 0.033, 0.0135, 0.0042
    def bubble(p, n, t1, t2):
        ring = lambda r, h: [p + r * (math.cos(f) * t1 + math.sin(f) * t2) + n * h for f in (2 * math.pi * k / 8 for k in range(8))]
        b.hull(ring(RB, 0.0) + ring(RB * 0.72, HB * 0.75) + [p + n * HB], "Bubble")
    b.M = Matrix.Translation((0, 0, R)) @ Matrix.Rotation(math.pi / 2, 4, "Y")
    b.lathe([(0.032, -L / 2), (R - 0.004, -L / 2), (R, -L / 2 + 0.004), (R, L / 2 - 0.004), (R - 0.004, L / 2), (0.032, L / 2)],
            SEG, "BubbleSheet", cap_bottom=False, cap_top=False)
    b.lathe([(0.032, L / 2 + 0.008), (0.026, L / 2 + 0.008), (0.026, -L / 2 - 0.008), (0.032, -L / 2 - 0.008), (0.032, L / 2 + 0.008)],
            SEG, "Cardboard", cap_bottom=False, cap_top=False)
    for sg in (-1, 1):
        for r in (0.045, 0.060, 0.075, 0.090):
            z = sg * (L / 2 + 0.0005)
            b.lathe([(r, z), (r + 0.0025, z)] if sg > 0 else [(r + 0.0025, z), (r, z)], SEG, "Bubble", cap_bottom=False, cap_top=False)
    n_around = int(2 * math.pi * R / PITCH)
    rows = int((L - 0.02) / PITCH)
    for row in range(rows):
        z = -L / 2 + 0.010 + PITCH / 2 + row * PITCH
        for k in range(n_around):
            a = 2 * math.pi * (k + 0.5 * (row % 2)) / n_around
            n = Vector((math.cos(a), math.sin(a), 0)); t1 = Vector((-math.sin(a), math.cos(a), 0)); t2 = Vector((0, 0, 1))
            bubble(Vector((R * n.x, R * n.y, z)), n, t1, t2)
    b.M = Matrix.Identity(4)
    D = 0.20
    b.cbox((0, -D / 2 - 0.005, 0.001), (L - 0.004, D, 0.002), "BubbleSheet")
    for row in range(int(D / PITCH)):
        y = -0.020 - row * PITCH
        for k in range(rows + 1):
            x = -L / 2 + 0.010 + PITCH / 2 + k * PITCH + (PITCH / 2 if row % 2 else 0)
            if x < L / 2 - 0.012:
                bubble(Vector((x, y, 0.002)), Vector((0, 0, 1)), Vector((1, 0, 0)), Vector((0, 1, 0)))
    return b.finish("bubbleWrap")


# ── SM-3 part icons (2026-10-21) — ONE thumbnail per part kind (data/parts.js partIcon(): the slot
#    with Front/Rear dropped). Every part of a kind shares it; the inventory tints the square behind it
#    by rarity, so the background stays transparent like every other item.

def build_tire():
    """Part icon `tire`: one bare P235/75R15 standing on its tread, no wheel — all-season tread in
    five rows, a raised band and lettering on the sidewall, the bead opening showing the liner."""
    b = Builder(); SEG = 44
    hw, Ro, Rb = 0.1175, 0.367, 0.192
    b.M = Matrix.Translation((0, 0, Ro)) @ Matrix.Rotation(math.pi / 2, 4, "Y")   # axis along X, sidewall to the viewer
    RHO = 0.034; zs, rs = hw - RHO, 0.356 - RHO   # shoulder radius (owner, 2026-10-21: square read as a semi tyre)
    crown = lambda z: 0.356 if abs(z) <= zs else rs + math.sqrt(max(0.0, RHO * RHO - (abs(z) - zs) ** 2))
    arc = [(rs + RHO * math.sin(math.radians(t)), zs + RHO * math.cos(math.radians(t))) for t in range(0, 91, 15)]
    outer = ([(Rb, -hw + 0.020), (0.205, -hw + 0.005), (0.26, -hw - 0.004)] + [(r_, -z_) for r_, z_ in arc]
             + [(r_, z_) for r_, z_ in reversed(arc)] + [(0.26, hw + 0.004), (0.205, hw - 0.005), (Rb, hw - 0.020)])
    liner = [(Rb - 0.004, hw - 0.032), (Rb + 0.012, hw - 0.040), (0.30, hw - 0.045), (0.335, hw - 0.050),
             (0.335, -hw + 0.050), (0.30, -hw + 0.045), (Rb + 0.012, -hw + 0.040), (Rb - 0.004, -hw + 0.032)]
    b.lathe(outer + liner + [outer[0]], SEG, "Rubber", cap_bottom=False, cap_top=False)
    for sd in (1, -1):   # a raised rim-protector band on each sidewall
        b.lathe([(0.296, sd * (hw + 0.002)), (0.300, sd * (hw + 0.006)), (0.306, sd * (hw + 0.006)), (0.310, sd * (hw + 0.002))]
                if sd > 0 else [(0.310, -hw - 0.002), (0.306, -hw - 0.006), (0.300, -hw - 0.006), (0.296, -hw - 0.002)],
                SEG, "Rubber", cap_bottom=False, cap_top=False)
    # Tread: N pitches × five rows of blocks, skewed a little, the rows staggered.
    N = 60
    rows = [(-0.104, -0.068, 0.0), (-0.058, -0.022, 0.5), (-0.014, 0.014, 0.25), (0.022, 0.058, 0.75), (0.068, 0.104, 0.0)]
    for k in range(N):
        for z0, z1, ph in rows:
            a = 2 * math.pi * (k + ph) / N
            da = math.pi / N * 0.78
            sk = 0.06 * (1 if z0 < 0 else -1)
            pts = []
            for zz in (z0, z1):
                aa = a + sk * (zz - (z0 + z1) / 2) / 0.04 * da
                for e in (-da, da):
                    for rr in (crown(zz) - 0.004, crown(zz) + 0.011):
                        pts.append((rr * math.cos(aa + e), rr * math.sin(aa + e), zz))
            b.hull(pts, "Rubber")
    for k in range(18):   # moulded lettering on the near sidewall: short raised strokes along an arc
        a = math.radians(100 + 4.2 * k)
        if k in (5, 11):
            continue
        for rr0, rr1 in ((0.262, 0.284),) if k % 3 else ((0.262, 0.272), (0.276, 0.284)):
            b.bar((rr0 * math.cos(a), rr0 * math.sin(a), hw + 0.006), (rr1 * math.cos(a), rr1 * math.sin(a), hw + 0.006),
                  0.0035, "Rubber", h=0.004)
    b.M = Matrix.Identity(4)
    return b.finish("tire")


def build_wheel():
    """Part icon `wheel` (owner, 2026-10-21: wheels and tires are separate parts): a bare pressed-steel
    15x7 wheel standing on its flange, its face to the viewer (owner, 2026-10-22: "rotate 180°, I'd like
    to see the face" — the hub side showed before) — drop-centre rim, the disc dished in from the outer
    side of the well with six oval vents, five lug holes on the 4.5 in circle, the centre bore and the
    valve stem. Local +z is the face."""
    b = Builder(); SEG = 24
    b.M = Matrix.Rotation(math.radians(-25), 4, "Z") @ Matrix.Translation((0, 0, 0.202)) @ Matrix.Rotation(math.pi / 2, 4, "Y")   # face turned toward the eye
    rim = [(0.198, -0.102), (0.202, -0.097), (0.196, -0.089), (0.191, -0.086), (0.191, -0.058), (0.168, -0.044),
           (0.165, -0.034), (0.165, 0.018), (0.187, 0.038), (0.191, 0.050), (0.191, 0.086), (0.196, 0.089),
           (0.202, 0.097), (0.198, 0.102)]
    b.lathe(rim + [(r - 0.004, z) for r, z in reversed(rim)] + [rim[0]], SEG, "WheelPaint", cap_bottom=False, cap_top=False)
    disc = [(0.161, 0.018), (0.150, 0.010), (0.105, -0.022), (0.090, -0.016), (0.048, -0.016), (0.042, -0.024), (0.036, -0.024)]   # dished away from the face
    b.lathe(disc + [(r, z - 0.004) for r, z in reversed(disc)] + [disc[0]], SEG, "WheelPaint", cap_bottom=False, cap_top=False)
    def spot(r, z, a, along, half_r, half_t, n=10):   # a through-hole: dark on both skins of the disc, each in its tangent plane
        er, et = Vector((math.cos(a), math.sin(a), 0)), Vector((-math.sin(a), math.cos(a), 0))
        t = (er * along[0] + Vector((0, 0, along[1]))).normalized(); nrm = t.cross(et)
        if nrm.z < 0:
            nrm = -nrm
        for c in (er * r + Vector((0, 0, z)) + nrm * 0.0006, er * r + Vector((0, 0, z - 0.004)) - nrm * 0.0006):
            b.face([c + t * half_r * math.cos(2 * math.pi * k / n) + et * half_t * math.sin(2 * math.pi * k / n) for k in range(n)], "SteelDark")
    for k in range(6):   # vents on the disc's slope, between the lugs
        spot(0.1275, -0.006, 2 * math.pi * (k + 0.5) / 6, (-0.045, -0.032), 0.019, 0.014)
    for k in range(5):   # lug holes on the flat mounting face
        spot(0.057, -0.016, 2 * math.pi * k / 5, (1, 0), 0.0075, 0.0075, 8)
    spot(0.0, -0.024, 0.0, (1, 0), 0.036, 0.036, 12)   # centre bore
    a = math.radians(-20)   # valve stem through the well's outer wall, leaning out toward the face
    er = Vector((math.cos(a), math.sin(a), 0))
    p0 = er * 0.174 + Vector((0, 0, 0.026)); p1 = er * 0.184 + Vector((0, 0, 0.056))
    b.tube([p0, p1], 0.0045, 6, "Rubber")
    b.tube([p1, p1 + (p1 - p0).normalized() * 0.012], 0.0032, 6, "CanBlack")
    b.M = Matrix.Identity(4)
    return b.finish("wheel")


def build_springs():
    """Part icon `springs`: one coil spring standing on end — round wire, closed ends, red powder coat."""
    b = Builder()
    R, wr, H, turns, te, N = 0.064, 0.0095, 0.30, 6.0, 0.9, 12   # one coil fewer, fatter wire (owner, 2026-10-21)
    pe = 2 * wr + 0.0005
    pa = (H - 2 * wr - 2 * te * pe) / (turns - 2 * te)
    def z(t):
        if t < te:
            return wr + pe * t
        if t > turns - te:
            return H - wr - pe * (turns - t)
        return wr + pe * te + pa * (t - te)
    path = [(R * math.cos(2 * math.pi * k / N), R * math.sin(2 * math.pi * k / N), z(k / N)) for k in range(int(turns * N) + 1)]
    b.tube(path, wr, 6, "SpringRed")
    return b.finish("springs")


def build_dampers():
    """Part icon `dampers`: one shock absorber lying on the ground — yellow body, black seal cap and
    dust boot, chrome shaft, a bushed eye at each end."""
    b = Builder(); SEG = 18
    rb = 0.0275
    M0 = Matrix.Translation((0, 0, rb)) @ Matrix.Rotation(math.radians(100), 4, "Z") @ Matrix.Rotation(math.pi / 2, 4, "Y")
    def at(z, *rot):
        m = M0 @ Matrix.Translation((0, 0, z))
        for r in rot:
            m = m @ r
        return m
    b.M = M0
    b.lathe([(0.0, 0.024), (0.022, 0.026), (rb, 0.036), (rb, 0.300)], SEG, "ShockYellow", cap_top=False)
    b.lathe([(rb, 0.300), (0.024, 0.304), (0.024, 0.318), (0.012, 0.320)], SEG, "CanBlack", cap_top=False)   # seal cap
    folds = [(0.020 if k % 2 == 0 else 0.0245, 0.320 + 0.0095 * k) for k in range(11)]
    b.lathe(folds, SEG, "CanBlack", cap_bottom=False, cap_top=False)   # dust boot
    b.lathe([(0.0090, 0.415), (0.0090, 0.452)], 12, "Chrome", cap_bottom=False, cap_top=False)
    b.lathe([(0.0, 0.452), (0.016, 0.452), (0.016, 0.462), (0.0, 0.464)], 12, "SteelDark")
    for z in (0.0, 0.486):   # the eyes: steel ring, rubber bushing, sleeve through
        b.M = at(z, Matrix.Rotation(math.pi / 2, 4, "Y"))
        b.lathe([(0.0145, -0.019), (0.0235, -0.019), (0.0235, 0.019), (0.0145, 0.019), (0.0145, -0.019)], SEG, "SteelDark",
                cap_bottom=False, cap_top=False)
        b.lathe([(0.0075, -0.021), (0.0145, -0.021), (0.0145, 0.021), (0.0075, 0.021), (0.0075, -0.021)], 12, "CanBlack",
                cap_bottom=False, cap_top=False)
        b.lathe([(0.0045, -0.024), (0.0075, -0.024), (0.0075, 0.024), (0.0045, 0.024), (0.0045, -0.024)], 10, "Chrome",
                cap_bottom=False, cap_top=False)
    b.M = M0
    b.bar((0, 0, 0.014), (0, 0, 0.026), 0.018, "SteelDark")
    b.bar((0, 0, 0.462), (0, 0, 0.472), 0.016, "SteelDark")
    b.M = Matrix.Identity(4)
    return b.finish("dampers")


def build_pads():
    """Part icon `pads`: a pair of front disc brake pads (rear shoes have their own icon, owner 2026-10-21),
    one friction side up, one turned over to show its backing plate: stamped sheet steel with the
    retention holes the friction is moulded through, two locating dimples and a bent clip tab."""
    b = Builder()
    C = (0.0, -0.2475)
    pol = lambda phi, r: (C[0] + r * math.cos(math.radians(phi)), C[1] + r * math.sin(math.radians(phi)))
    tan = lambda phi: (-math.sin(math.radians(phi)), math.cos(math.radians(phi)))
    def plate_outline():
        out = [pol(76 + 28 * k / 14, 0.275) for k in range(15)]
        t = tan(104); a, c = pol(104, 0.256), pol(104, 0.240)
        out += [a, (a[0] + t[0] * 0.008, a[1] + t[1] * 0.008), (c[0] + t[0] * 0.008, c[1] + t[1] * 0.008), c]
        out += [pol(104 - 28 * k / 10, 0.220) for k in range(11)]
        t = tan(76); c, a = pol(76, 0.240), pol(76, 0.256)
        out += [c, (c[0] - t[0] * 0.008, c[1] - t[1] * 0.008), (a[0] - t[0] * 0.008, a[1] - t[1] * 0.008), a]
        return out
    def block(p0, p1, z0, z1):   # one friction half, chamfered ends
        n = 8
        lo = [pol(p0 + (p1 - p0) * k / n, 0.270) for k in range(n + 1)] + [pol(p1 - (p1 - p0) * k / n, 0.225) for k in range(n + 1)]
        q0, q1 = p0 + 0.9, p1 - 0.9
        hi = [pol(q0 + (q1 - q0) * k / n, 0.267) for k in range(n + 1)] + [pol(q1 - (q1 - q0) * k / n, 0.228) for k in range(n + 1)]
        b.loft([[(x, y, z0) for x, y in lo], [(x, y, z1) for x, y in hi]], "Friction")
    po = plate_outline()
    # Pad 1, in front, friction up: two blocks split by the centre slot, a wear-indicator tab.
    b.M = Matrix.Translation((0.0, -0.038, 0.0))
    FT = 0.0115   # friction 6 mm thick on a 5.5 mm plate (owner: the first cut was too tall)
    b.prism(po, 0.0, 0.0055, "Steel")
    block(77.5, 89.4, 0.0055, FT); block(90.6, 102.5, 0.0055, FT)
    tab = Vector(pol(79, 0.262))
    b.bar((tab.x, tab.y, 0.0055), (tab.x, tab.y, 0.016), 0.007, "Steel", h=0.0012)
    b.bar((tab.x, tab.y, 0.016), (tab.x + 0.005, tab.y + 0.004, 0.020), 0.007, "Steel", h=0.0012)
    # Pad 2, behind, turned over: friction on the ground, the plate's stamped back on top (local z < 0).
    M2 = Matrix.Translation((0.012, 0.038, FT)) @ Matrix.Rotation(math.radians(-6), 4, "Z") @ Matrix.Rotation(math.pi, 4, "Y")
    b.M = M2
    b.prism(po, 0.0, 0.0055, "Steel")
    block(77.5, 89.4, 0.0055, FT); block(90.6, 102.5, 0.0055, FT)
    for phi in (84.0, 90.0, 96.0):   # retention holes: the friction shows through
        x, y = pol(phi, 0.2475)
        b.M = M2 @ Matrix.Translation((x, y, -0.0003)) @ Matrix.Rotation(math.pi, 4, "X")
        b.lathe([(0.0, 0.0), (0.0042, 0.0)], 8, "Friction", cap_bottom=False, cap_top=False)
    for phi in (79.5, 100.5):        # stamped locating dimples
        x, y = pol(phi, 0.2475)
        b.M = M2 @ Matrix.Translation((x, y, 0.0)) @ Matrix.Rotation(math.pi, 4, "X")
        b.lathe([(0.0068, 0.0), (0.0052, 0.0016), (0.0, 0.0018)], 8, "Steel", cap_bottom=False)
    b.M = M2                          # a clip tab punched from the outer edge and bent up
    t0, t1 = Vector(pol(88.4, 0.271)), Vector(pol(91.6, 0.271))
    for tt in (t0, t1):
        b.bar((tt.x, tt.y, 0.0), (tt.x, tt.y, -0.0075), 0.0016, "Steel", h=0.0012)
    b.bar((t0.x, t0.y, -0.0075), (t1.x, t1.y, -0.0075), 0.0016, "Steel", h=0.0012)
    b.prism([pol(87.6 + 4.8 * k / 4, 0.2745) for k in range(5)] + [pol(92.4 - 4.8 * k / 4, 0.2665) for k in range(5)],
            -0.0002, 0.0, "SteelDark")   # the slot the tab came out of
    b.M = Matrix.Identity(4)
    return b.finish("pads")


def build_shoes():
    """Part icon `shoes`: a pair of rear drum-brake shoes laid out as fitted in a 9 in drum (owner,
    2026-10-21: shoes are rear-only, pads front-only). Each is a curved steel table with the lining
    bonded on and a crescent web with spring holes; a return spring spans the top ends and the
    star-wheel adjuster sits between the bottom ends."""
    b = Builder()
    W = b.M = Matrix.Rotation(math.radians(50), 4, Vector((-VIEW_DIR.y, VIEW_DIR.x, 0)).normalized())   # tipped up toward the eye
    R, LIN, T, Wt = 0.114, 0.005, 0.003, 0.045       # drum radius, lining, table thickness, table width
    sector = lambda r0, r1, a0, a1, n=10: ([(r1 * math.cos(math.radians(a0 + (a1 - a0) * k / n)),
                                             r1 * math.sin(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]
                                           + [(r0 * math.cos(math.radians(a1 - (a1 - a0) * k / n)),
                                               r0 * math.sin(math.radians(a1 - (a1 - a0) * k / n))) for k in range(n + 1)])
    rt = R - LIN - T
    for c in (0.0, 180.0):
        b.prism(sector(rt, R - LIN, c - 56, c + 56), 0.0, Wt, "Steel")                     # table
        b.prism(sector(R - LIN, R, c - 50, c + 50), 0.003, Wt - 0.003, "Friction")         # lining
        web = [(rt * math.cos(math.radians(c - 54 + 108 * k / 12)), rt * math.sin(math.radians(c - 54 + 108 * k / 12))) for k in range(13)]
        web += [((rt - 0.012 - 0.018 * math.sin(math.pi * (12 - k) / 12)) * math.cos(math.radians(c + 54 - 108 * k / 12)),
                 (rt - 0.012 - 0.018 * math.sin(math.pi * (12 - k) / 12)) * math.sin(math.radians(c + 54 - 108 * k / 12))) for k in range(13)]
        b.prism(web, Wt / 2 - 0.002, Wt / 2 + 0.002, "Steel")                              # crescent web
        for d, rr in ((c + 46, rt - 0.008), (c - 46, rt - 0.008), (c, rt - 0.020)):        # spring / hold-down holes
            b.M = W @ Matrix.Translation((rr * math.cos(math.radians(d)), rr * math.sin(math.radians(d)), Wt / 2 + 0.0022))
            b.lathe([(0.0, 0.0), (0.0035, 0.0)], 8, "SteelDark", cap_bottom=False, cap_top=False)
            b.M = W
    # Return spring across the top ends, hooked into the web holes.
    ya, xa, zs = (rt - 0.008) * math.sin(math.radians(46)), (rt - 0.008) * math.cos(math.radians(46)), Wt / 2 + 0.008
    coil = [(-xa + 0.012 + (2 * xa - 0.024) * k / 120, ya + 0.0055 * math.cos(2 * math.pi * k / 10), zs + 0.0055 * math.sin(2 * math.pi * k / 10))
            for k in range(121)]
    b.tube([(-xa, ya, Wt / 2), (-xa, ya, zs), coil[0]] , 0.0014, 6, "ShockYellow")
    b.tube(coil, 0.0014, 6, "ShockYellow")
    b.tube([coil[-1], (xa, ya, zs), (xa, ya, Wt / 2)], 0.0014, 6, "ShockYellow")
    # Star-wheel adjuster between the bottom ends: socket, threaded screw, toothed wheel.
    ya = -ya
    b.tube([(-xa, ya, zs - 0.002), (-0.010, ya, zs - 0.002)], 0.0050, 8, "Zinc")
    b.tube([(-0.010, ya, zs - 0.002), (xa, ya, zs - 0.002)], 0.0038, 8, "Zinc")
    b.M = W @ Matrix.Translation((-0.004, ya, zs - 0.002)) @ Matrix.Rotation(math.pi / 2, 4, "Y")
    b.lathe([(0.0, -0.003), (0.010, -0.003), (0.010, 0.003), (0.0, 0.003)], 12, "Zinc", cap_bottom=False, cap_top=False)
    for k in range(12):
        a_ = 2 * math.pi * (k + 0.5) / 12
        b.bar((0.010 * math.cos(a_), 0.010 * math.sin(a_), 0.0), (0.0135 * math.cos(a_), 0.0135 * math.sin(a_), 0.0), 0.0025, "Zinc", h=0.005)
    b.M = W
    return b.finish("shoes")


def build_arb():
    """Part icon `arb`: an anti-roll bar lying flat — a blue torsion bar bent into a wide U, flattened
    eye ends for the end links, two red urethane bushings in steel brackets."""
    b = Builder()
    rb, zc = 0.016, 0.031
    half, arm, rr = 0.40, 0.30, 0.08
    path = []
    for k in range(9):   # left arm, running in toward the bend
        path.append((-half, arm - (arm - rr) * k / 8, zc))
    for k in range(1, 10):
        a = math.pi - (math.pi / 2) * k / 9
        path.append((-half + rr + rr * math.cos(a), rr - rr * math.sin(a) * 1.0, zc))
    for k in range(1, 12):
        path.append((-half + rr + (2 * (half - rr)) * k / 12, 0.0, zc))
    for k in range(1, 10):
        a = math.pi / 2 - (math.pi / 2) * k / 9
        path.append((half - rr + rr * math.cos(a), rr - rr * math.sin(a), zc))
    for k in range(1, 9):
        path.append((half, rr + (arm - rr) * k / 8, zc))
    yaw = Matrix.Rotation(math.radians(-28), 4, "Z")
    b.M = yaw
    b.tube(path, rb, 12, "ArbBlue")
    for sx in (-1, 1):   # flattened paddle with an eye hole
        x = sx * half
        b.hull([(x + dx, arm + dy, zc + dz) for dx in (-0.024, 0.024) for dy in (0.0, 0.060) for dz in (-0.007, 0.007)], "ArbBlue")
        b.M = yaw @ Matrix.Translation((x, arm + 0.036, zc))
        b.lathe([(0.0, 0.0072), (0.012, 0.0072)], 12, "SteelDark", cap_bottom=False, cap_top=False)
        b.M = yaw
    for x in (-0.20, 0.20):
        b.M = yaw @ Matrix.Translation((x, 0.0, zc)) @ Matrix.Rotation(math.pi / 2, 4, "Y")
        b.lathe([(rb + 0.001, -0.028), (0.029, -0.028), (0.031, -0.024), (0.031, 0.024), (0.029, 0.028), (rb + 0.001, 0.028)],
                14, "PolyRed", cap_bottom=False, cap_top=False)
        b.M = yaw
        # Bracket: a steel strap over the bushing, flanges out to the sides with a bolt each.
        strap = [(x, 0.0335 * math.cos(math.pi * k / 12), zc + 0.0335 * math.sin(math.pi * k / 12)) for k in range(13)]
        for p0, p1 in zip(strap, strap[1:]):
            b.bar(p0, p1, 0.003, "Steel", h=0.040, caps=False, up=(1, 0, 0))
        for sy in (-1, 1):
            b.cbox((x, sy * 0.047, 0.0015), (0.040, 0.028, 0.003), "Steel")
            b.M = yaw @ Matrix.Translation((x, sy * 0.052, 0.003))
            b.lathe([(0.0, 0.0), (0.0075, 0.0), (0.0075, 0.006), (0.0, 0.006)], 6, "Zinc", cap_bottom=False, cap_top=False)
            b.M = yaw
    b.M = Matrix.Identity(4)
    return b.finish("arb")


def build_diff():
    """Part icon `diff` (owner, 2026-10-21): the differential itself — the carrier that sits inside the
    ring gear. Axisymmetric about the axle line (X): a short can with two windows onto the spider gears,
    tapering at one end, the ring-gear flange with its bolt holes at the other, and a bearing stub with
    a splined bore at each end where the axle shafts go in."""
    b = Builder(); SEG = 16; zc = 0.085
    b.M = Matrix.Translation((0, 0, zc)) @ Matrix.Rotation(math.pi / 2, 4, "Y")   # lathe axis -> +X
    # Left stub, taper, (can), flange, hub, right stub — profiles as (radius, x).
    b.lathe([(0.0, -0.118), (0.024, -0.118), (0.024, -0.092), (0.031, -0.090), (0.058, -0.062), (0.058, -0.060)],
            SEG, "Steel", cap_bottom=False, cap_top=False)
    b.lathe([(0.058, 0.010), (0.085, 0.010), (0.085, 0.024), (0.040, 0.024), (0.040, 0.040), (0.024, 0.042),
             (0.024, 0.066), (0.0, 0.066)], SEG, "Steel", cap_bottom=False, cap_top=False)
    for x in (-0.1182, 0.0662):   # splined bores
        b.lathe([(0.013, x), (0.0, x)] if x > 0 else [(0.0, x), (0.013, x)], 10, "SteelDark", cap_bottom=False, cap_top=False)
    for k in range(10):           # ring-gear bolt holes on the flange face
        ang = 2 * math.pi * k / 10
        b.M = Matrix.Translation((0.0242, 0.072 * math.cos(ang), zc + 0.072 * math.sin(ang))) @ Matrix.Rotation(math.pi / 2, 4, "Y")
        b.lathe([(0.0, 0.0), (0.0048, 0.0)], 8, "SteelDark", cap_bottom=False, cap_top=False)
    b.M = Matrix.Identity(4)
    # The can: outer and inner walls, two windows cut through (centred 160° and −20° round the axle,
    # tipped toward the viewer), cut edges closed between the walls.
    Ro, Ri, WN = 0.058, 0.050, (-0.048, 0.000)
    xs = [-0.060, WN[0], WN[1], 0.010]
    ph = math.radians(160) - math.pi / SEG
    ang = [ph + 2 * math.pi * k / SEG for k in range(SEG + 1)]
    P = lambda r, a_, x: (x, r * math.cos(a_), zc + r * math.sin(a_))
    win = lambda k: min(k % (SEG // 2), -k % (SEG // 2)) <= 1   # segments 0 and SEG/2, and each one's neighbours
    for k in range(SEG):
        for j in range(3):
            if j == 1 and win(k):
                continue
            x0, x1 = xs[j], xs[j + 1]
            b.face([P(Ro, ang[k], x0), P(Ro, ang[k + 1], x0), P(Ro, ang[k + 1], x1), P(Ro, ang[k], x1)], "Steel")
            b.face([P(Ri, ang[k], x1), P(Ri, ang[k + 1], x1), P(Ri, ang[k + 1], x0), P(Ri, ang[k], x0)], "SteelDark")
        if win(k):   # window cut edges: the two ends along X, the sides where the next segment is solid
            for x in WN:
                b.face([P(Ro, ang[k], x), P(Ri, ang[k], x), P(Ri, ang[k + 1], x), P(Ro, ang[k + 1], x)], "Steel")
            for kk, nb in ((k, k - 1), (k + 1, k + 1)):
                if not win(nb % SEG):
                    b.face([P(Ro, ang[kk], WN[0]), P(Ro, ang[kk], WN[1]), P(Ri, ang[kk], WN[1]), P(Ri, ang[kk], WN[0])], "Steel")
    # Inside: the cross pin, two spider gears on it and the two side gears on the axle line.
    xm = sum(WN) / 2
    pin = Vector((0, math.cos(math.radians(70)), math.sin(math.radians(70))))
    c0 = Vector((xm, 0, zc))
    b.tube([c0 - pin * Ri, c0 + pin * Ri], 0.0065, 8, "Chrome")
    for sg in (-1, 1):
        b.M = Matrix.Translation(c0 + pin * sg * 0.016) @ (pin * sg).to_track_quat("Z", "X").to_matrix().to_4x4()
        b.lathe([(0.0, 0.0), (0.012, 0.0), (0.020, 0.014), (0.020, 0.020), (0.0, 0.020)], 12, "Chrome", cap_bottom=False)
        b.M = Matrix.Translation((xm + sg * 0.012, 0, zc)) @ Matrix.Rotation(sg * math.pi / 2, 4, "Y")
        b.lathe([(0.0, 0.0), (0.014, 0.0), (0.024, 0.012), (0.024, 0.016), (0.0, 0.016)], 12, "Chrome", cap_bottom=False)
    b.M = Matrix.Identity(4)
    return b.finish("diff")

def build_lift():
    """Part icon `lift` (lower poly, owner 2026-10-21): a lift kit laid out — two tapered rear blocks, each straddled by a pair of
    zinc U-bolts with nuts, and two orange front strut spacers with their studs."""
    b = Builder()
    for bx in (-0.10, 0.10):
        b.hull([(bx + dx, dy, z) for dx in (-0.032, 0.032) for dy in (-0.075, 0.075) for z in (0.0, 0.056 + 0.008 * dy / 0.075)]
               + [(bx + dx * 0.9, dy * 0.95, 0.060 + 0.008 * dy / 0.075) for dx in (-0.032, 0.032) for dy in (-0.075, 0.075)], "CastIron")
        b.M = Matrix.Translation((bx, 0.0, 0.064))
        b.lathe([(0.0085, 0.0), (0.0085, 0.010), (0.0, 0.011)], 6, "SteelDark", cap_bottom=False)   # centre pin
        b.M = Matrix.Identity(4)
        for y in (-0.050, 0.050):   # a U-bolt over the block, legs down either side
            path = [(bx - 0.042, y, 0.0), (bx - 0.042, y, 0.110)]
            path += [(bx - 0.042 * math.cos(math.pi * k / 6), y, 0.110 + 0.042 * math.sin(math.pi * k / 6)) for k in range(1, 6)]
            path += [(bx + 0.042, y, 0.110), (bx + 0.042, y, 0.0)]
            b.tube(path, 0.0072, 6, "Zinc")
            for sx in (-1, 1):
                b.M = Matrix.Translation((bx + sx * 0.042, y, 0.0))
                b.lathe([(0.0, 0.0), (0.016, 0.0), (0.016, 0.003), (0.0, 0.003)], 8, "Zinc", cap_bottom=False, cap_top=False)   # washer
                b.lathe([(0.0, 0.003), (0.012, 0.003), (0.012, 0.016), (0.0, 0.016)], 6, "SteelDark", cap_bottom=False, cap_top=False)   # nut
                b.M = Matrix.Identity(4)
    for sx in (-1, 1):   # strut spacers in front, studs up
        b.M = Matrix.Translation((sx * 0.105, -0.215, 0.0))
        b.lathe([(0.055, 0.0), (0.088, 0.0), (0.088, 0.044), (0.083, 0.050), (0.060, 0.050), (0.055, 0.044), (0.055, 0.0)], 12,
                "NylonOrange", cap_bottom=False, cap_top=False)
        for k in range(3):
            a = 2 * math.pi * k / 3 + 0.4
            b.M = Matrix.Translation((sx * 0.105 + 0.0715 * math.cos(a), -0.215 + 0.0715 * math.sin(a), 0.050))
            b.lathe([(0.0055, 0.0), (0.0055, 0.022), (0.0035, 0.025), (0.0, 0.025)], 6, "Zinc", cap_bottom=False)
            b.M = Matrix.Identity(4)
    return b.finish("lift")


def build_compressor():
    """A 12 V portable compressor, the kind with a handle on top (owner, 2026-10-21): chrome tray base,
    silver motor can along X with a grey end cap, chrome crankcase with a big knurled air filter, a
    fluted cylinder and finned head, a steel strap arching from head to motor end under a foam grip,
    and red/black leads to copper-jawed battery clamps lying in front. Bare cast metal, not chrome paint
    (owner, 2026-10-21: it read as painted white)."""
    b = Builder()
    W = b.M = Matrix.Rotation(math.radians(65), 4, "Z")   # filter end to the near left, like the photo
    b.prism([(x, y) for x, y, _ in rrect(0.26, 0.15, 0.012, 0, per=3)], 0.0, 0.005, "Diecast")   # stamped tray
    for (x0, y0), (x1, y1) in (((-0.124, -0.069), (0.124, -0.069)), ((-0.124, 0.069), (0.124, 0.069)),
                               ((-0.124, -0.069), (-0.124, 0.069)), ((0.124, -0.069), (0.124, 0.069))):
        b.bar((x0, y0, 0.008), (x1, y1, 0.008), 0.006, "Diecast")                                  # its rolled lip
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.M = W @ Matrix.Translation((sx * 0.105, sy * 0.055, -0.004))
            b.lathe([(0.0, 0.0), (0.008, 0.0), (0.008, 0.004), (0.0, 0.004)], 8, "Rubber", cap_bottom=False, cap_top=False)
    # Motor: a can along X, a grey gasket plate with four nuts, and a grey domed end cap.
    MZ = 0.070
    b.M = W @ Matrix.Translation((0, 0, MZ)) @ Matrix.Rotation(math.pi / 2, 4, "Y")
    b.lathe([(0.040, -0.008), (0.044, -0.004), (0.044, 0.100), (0.040, 0.104)], 16, "DiecastDark", cap_bottom=False, cap_top=False)
    b.lathe([(0.040, 0.114), (0.040, 0.134), (0.035, 0.147), (0.023, 0.155), (0.0, 0.157)], 16, "GasketGrey", cap_bottom=False)
    b.M = W
    b.cbox((0.109, 0, MZ), (0.010, 0.100, 0.100), "GasketGrey", ch=0.006)
    b.cbox((-0.011, 0, MZ), (0.010, 0.098, 0.098), "Diecast", ch=0.004)                           # crankcase flange
    for sy in (-1, 1):
        for sz in (-1, 1):
            b.M = W @ Matrix.Translation((0.114, sy * 0.037, MZ + sz * 0.037)) @ Matrix.Rotation(math.pi / 2, 4, "Y")
            b.lathe([(0.0055, 0.0), (0.0055, 0.006), (0.0, 0.006)], 6, "Diecast", cap_bottom=False)
    b.M = W
    for x in (0.020, 0.085):
        b.cbox((x, 0, 0.022), (0.012, 0.060, 0.026), "Diecast", ch=0.002)                          # motor brackets
    # Crankcase, fluted cylinder and finned head, standing at the -X end.
    CX = -0.052
    b.M = W @ Matrix.Translation((CX, 0, 0))
    b.lathe([(0.030, 0.006), (0.036, 0.016), (0.036, 0.105), (0.031, 0.115)], 16, "Diecast", cap_bottom=False)
    b.lathe([(0.029, 0.115), (0.029, 0.166)], 16, "DiecastDark", cap_bottom=False, cap_top=False)
    for k in range(16):
        b.M = W @ Matrix.Translation((CX, 0, 0)) @ Matrix.Rotation(2 * math.pi * k / 16, 4, "Z")
        b.bar((0.032, 0, 0.117), (0.032, 0, 0.164), 0.008, "DiecastDark", h=0.003)
    b.M = W
    b.cbox((CX, 0, 0.180), (0.082, 0.082, 0.030), "Diecast", ch=0.006)
    for k in range(4):
        b.cbox((CX, -0.027 + 0.018 * k, 0.203), (0.070, 0.005, 0.018), "Diecast", ch=0.002)
    # Air filter: a big knurled disc on the crankcase's outer end, its paper label facing out.
    b.M = W @ Matrix.Translation((CX - 0.036, 0, 0.060)) @ Matrix.Rotation(-math.pi / 2, 4, "Y")
    b.lathe([(0.016, -0.004), (0.016, 0.008), (0.040, 0.008), (0.042, 0.010), (0.042, 0.026), (0.040, 0.028), (0.0, 0.028)],
            20, "Diecast", cap_bottom=False)
    b.lathe([(0.032, 0.0284), (0.0, 0.0284)], 20, "GaugeFace", cap_bottom=False, cap_top=False)
    for k in range(30):
        a = 2 * math.pi * (k + 0.5) / 30
        b.bar((0.0425 * math.cos(a), 0.0425 * math.sin(a), 0.011), (0.0425 * math.cos(a), 0.0425 * math.sin(a), 0.025), 0.0022, "Diecast")
    b.M = W
    # Handle: a steel strap from the head's side, up, across and down onto the gasket plate; foam grip on top.
    strap = [(-0.009, 0.166), (-0.009, 0.205), (-0.004, 0.222), (0.008, 0.231), (0.100, 0.231), (0.112, 0.222),
             (0.116, 0.205), (0.116, 0.114)]
    for (x0, z0), (x1, z1) in zip(strap, strap[1:]):
        b.bar((x0, 0, z0), (x1, 0, z1), 0.003, "Diecast", h=0.050, up=(0, 1, 0))
    b.M = W @ Matrix.Translation((0, 0, 0.231)) @ Matrix.Rotation(math.pi / 2, 4, "Y")
    b.lathe([(0.0, 0.014), (0.017, 0.014), (0.020, 0.017), (0.020, 0.091), (0.017, 0.094), (0.0, 0.094)], 12, "Foam")
    b.M = W
    b.tube([(0.117, 0, 0.198), (0.134, 0, 0.198)], 0.0065, 8, "CanBlack")                       # air outlet
    b.tube([(0.134, 0, 0.198), (0.146, 0, 0.198)], 0.0040, 8, "CanBlack")
    # Leads out of the end cap to two battery clamps lying side by side in front, jaws pointing at the viewer.
    for y0, cx, mat in ((-0.010, 0.178, "CapRed"), (0.010, 0.222, "CanBlack")):
        b.tube([(0.150, y0, 0.074), (0.168, y0, 0.074), (0.180 + 0.3 * (cx - 0.18), y0 - 0.012, 0.052),
                (cx, y0 - 0.040, 0.016), (cx, -0.070, 0.007), (cx, -0.088, 0.007)], 0.0035, 8, mat)
        b.hull([(cx + sx * 0.008, -0.086, z) for sx in (-1, 1) for z in (0.002, 0.012)]
               + [(cx + sx * 0.012, -0.146, z) for sx in (-1, 1) for z in (0.0, 0.020)], mat)       # insulated handle
        for z0, tilt in ((0.002, 0.0), (0.012, 0.22)):                                              # copper jaws, slightly open
            pts = []
            for yy, half in ((-0.140, 0.011), (-0.188, 0.006)):
                zz = z0 + tilt * (-0.140 - yy)
                pts += [(cx + sx * half, yy, zz + dz) for sx in (-1, 1) for dz in (0.0, 0.003)]
            b.hull(pts, "Copper")
    return b.finish("compressor")


def build_bikePump():
    """The bike pump — always in the truck, never an item; this is the repair card's pictogram. A
    floor pump: two feet, steel barrel, gauge at the foot, T-handle, hose clipped up the barrel."""
    b = Builder()
    for sx in (-1, 1):   # the feet
        b.hull([(sx * dx, dy, z) for dx in (0.018, 0.105) for dy in (-0.030, 0.030) for z in (0.0, 0.012)]
               + [(sx * 0.112, 0.0, 0.006)], "CanBlack")
    # Lower poly, fatter barrel, bigger gauge and handle so it reads small (owner, 2026-10-21).
    b.lathe([(0.0, 0.0), (0.042, 0.0), (0.042, 0.024), (0.032, 0.040), (0.032, 0.050), (0.0, 0.051)], 10, "CanBlack")   # base boss
    b.lathe([(0.028, 0.050), (0.028, 0.600)], 10, "Steel", cap_bottom=False, cap_top=False)   # barrel
    b.lathe([(0.031, 0.596), (0.031, 0.618), (0.012, 0.624), (0.0, 0.625)], 10, "CanBlack", cap_bottom=False)   # top cap
    b.lathe([(0.0065, 0.624), (0.0065, 0.680)], 6, "Chrome", cap_bottom=False, cap_top=False)   # plunger rod
    b.M = Matrix.Translation((0, 0, 0.690)) @ Matrix.Rotation(math.pi / 2, 4, "Y")   # T-handle along X
    hp = [(0.0, -0.125), (0.013, -0.124), (0.019, -0.118), (0.019, -0.026), (0.014, -0.022), (0.014, 0.022), (0.019, 0.026),
          (0.019, 0.118), (0.013, 0.124), (0.0, 0.125)]
    b.lathe(hp, 8, "CanBlack", cap_bottom=False, cap_top=False)
    b.M = Matrix.Identity(4)
    # Gauge on the base, face toward the viewer.
    b.M = Matrix.Translation((0.0, -0.052, 0.100)) @ Matrix.Rotation(math.radians(75), 4, "X")
    b.lathe([(0.0, -0.012), (0.049, -0.012), (0.053, 0.0), (0.053, 0.007), (0.048, 0.009)], 12, "CanBlack", cap_top=False)
    b.lathe([(0.048, 0.006), (0.0, 0.006)], 12, "GaugeFace", cap_bottom=False, cap_top=False)
    b.bar((0.0, 0.0, 0.0068), (0.024, 0.026, 0.0068), 0.004, "CanRed", h=0.0010)
    b.M = Matrix.Identity(4)
    b.bar((0.0, -0.026, 0.088), (0.0, -0.040, 0.096), 0.012, "CanBlack")
    # Hose: out of the base, a loop out to the side, up to a clip high on the barrel, chuck parked.
    hose = [(0.036, 0.014, 0.030), (0.066, 0.034, 0.030), (0.092, 0.044, 0.080), (0.097, 0.044, 0.180), (0.087, 0.040, 0.300),
            (0.066, 0.035, 0.400), (0.046, 0.032, 0.470), (0.036, 0.031, 0.500)]
    b.tube(hose, 0.0070, 6, "CanBlack")
    b.cbox((0.0, 0.030, 0.500), (0.060, 0.010, 0.022), "CanBlack", ch=0.003)   # holster clip on the barrel
    b.tube([(0.036, 0.031, 0.500), (0.036, 0.031, 0.535), (0.036, 0.031, 0.562)], 0.0110, 8, "CanRed")   # chuck
    return b.finish("bikePump")


def build_potato():
    """A russet potato (owner, 2026-10-21: the campfire meal; 10-22: "you can do better"): a long,
    flattened, slightly bent tuber, one end fuller; broad lumps, sunken eyes with a dark bud in each,
    and mottled russet skin (darker facets) — a lat-long skin, not a hull, so the eyes can dip in."""
    b = Builder(); rnd = random.Random(11)
    A, B, C = 0.072, 0.044, 0.034   # half-axes: 144 x 88 x 68 mm
    NI, NJ = 22, 26
    bumps = [(Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))).normalized(), rnd.uniform(-0.07, 0.09)) for _ in range(14)]
    eyes = [Vector(v).normalized() for v in ((0.55, -0.55, 0.62), (-0.35, -0.75, 0.55), (0.05, -0.35, 0.94), (0.92, -0.25, 0.30),
                                               (-0.80, -0.30, 0.52), (0.30, -0.92, -0.10), (-0.10, 0.40, 0.90))]
    def surf(u, v):   # u along the length (0..pi), v round it
        d = Vector((-math.cos(u), math.sin(u) * math.cos(v), math.sin(u) * math.sin(v)))
        r = 1 + sum(h * math.exp(-(1 - d.dot(n)) / 0.18) for n, h in bumps)
        r -= sum(0.075 * max(0.0, 1 - (1 - d.dot(e)) / 0.012) for e in eyes)   # the eye pits
        x = A * d.x * r
        return Vector((x, B * d.y * r * (1 + 0.10 * d.x) + 0.010 * (1 - (d.x) ** 2), C * d.z * r * (1 + 0.08 * d.x))), d
    us = [math.pi * (i + 0.5) / NI for i in range(NI)]
    rings = [[surf(u, 2 * math.pi * j / NJ)[0] for j in range(NJ)] for u in us]
    lift = -min(p.z for ring in rings for p in ring)
    b.M = Matrix.Rotation(math.atan2(VIEW_DIR.x, -VIEW_DIR.y) + 0.25, 4, "Z") @ Matrix.Translation((0, 0, lift))   # long axis near screen-right
    for ra, rb in zip(rings, rings[1:]):
        for j in range(NJ):
            k = (j + 1) % NJ
            b.face([ra[j], ra[k], rb[k], rb[j]], "PotatoDark" if rnd.random() < 0.16 else "PotatoSkin")
    b.face(list(reversed(rings[0])), "PotatoSkin"); b.face(rings[-1], "PotatoSkin")
    for e in eyes:   # a dark bud at the bottom of each pit
        u = math.acos(max(-1.0, min(1.0, -e.x))); v = math.atan2(e.z, e.y)
        c, _ = surf(u, v)
        n = (surf(u + 0.02, v)[0] - surf(u - 0.02, v)[0]).cross(surf(u, v + 0.02)[0] - surf(u, v - 0.02)[0]).normalized()
        if n.dot(c) < 0:
            n = -n
        t1 = n.cross(Vector((0, 0, 1)) if abs(n.z) < 0.9 else Vector((1, 0, 0))).normalized(); t2 = n.cross(t1)
        b.face([c + n * 0.0012 + (t1 * math.cos(2 * math.pi * q / 5) * 0.0060 + t2 * math.sin(2 * math.pi * q / 5) * 0.0040) for q in range(5)], "PotatoEye")
    b.M = Matrix.Identity(4)
    return b.finish("potato")


def build_jerryCan():
    """A 5 gal jerry can (owner, 2026-10-21: the refillable top-tier fuel reward; 10-22: "the red plastic
    injection molded type"): a round-shouldered red plastic body with moulded side panels and a yellow
    warning label, the carry handle moulded into the top, the spout neck with its black cap at the
    front corner and a small vent cap at the back."""
    b = Builder()
    L, W, H, R = 0.380, 0.190, 0.300, 0.045
    b.M = Matrix.Rotation(math.radians(8), 4, "Z")
    rings = [rrect(L - 0.030, W - 0.030, R - 0.015, 0.0, per=3), rrect(L - 0.006, W - 0.006, R - 0.003, 0.008, per=3),
             rrect(L, W, R, 0.022, per=3), rrect(L, W, R, H - 0.040, per=3), rrect(L - 0.012, W - 0.012, R - 0.006, H - 0.014, per=3),
             rrect(L - 0.040, W - 0.050, R - 0.020, H, per=3)]
    b.loft(rings, "PlasticRed")
    for sy in (-1, 1):   # moulded panels standing proud on both broad faces
        y = sy * (W / 2 + 0.004)
        out = [(x, z) for x, z, _ in rrect(L - 0.090, H - 0.110, 0.030, 0, per=3)]
        b.loft([[(x, sy * W / 2 - sy * 0.002, z + H / 2 - 0.005) for x, z in out], [(x, y, z + H / 2 - 0.005) for x, z in out]], "PlasticRed", cap_bottom=False)
        if sy < 0:   # warning label on the side we see
            b.loft([[(x * 0.55 - 0.020, y - 0.0005 * 0, z * 0.45 + H / 2 - 0.030) for x, z in out],
                    [(x * 0.55 - 0.020, y - 0.0015, z * 0.45 + H / 2 - 0.030) for x, z in out]], "LabelYellow", cap_bottom=False)
            for k in range(3):
                zz = H / 2 - 0.012 - 0.018 * k
                b.bar((-0.080, y - 0.0025, zz), (0.040 - 0.030 * (k == 2), y - 0.0025, zz), 0.005, "CanBlack", h=0.001, up=(0, 1, 0))
    # Carry handle moulded into the top: a flat bar arching from the back shoulder over to mid-top.
    hp = [(-0.150, H - 0.012), (-0.140, H + 0.030), (-0.115, H + 0.048), (0.010, H + 0.048), (0.035, H + 0.030), (0.045, H - 0.010)]
    for (x0, z0), (x1, z1) in zip(hp, hp[1:]):
        b.bar((x0, 0, z0), (x1, 0, z1), 0.030, "PlasticRed", h=0.024, up=(0, 1, 0))
    # Spout neck and its black cap, leaning out at the front corner; vent cap at the back.
    b.M = Matrix.Rotation(math.radians(8), 4, "Z") @ Matrix.Translation((0.128, 0, H - 0.020)) @ Matrix.Rotation(math.radians(25), 4, "Y")
    b.lathe([(0.026, 0.0), (0.026, 0.030)], 12, "PlasticRed", cap_bottom=False, cap_top=False)
    b.lathe([(0.033, 0.026), (0.033, 0.052), (0.028, 0.058), (0.0, 0.059)], 12, "CanBlack")
    for k in range(12):
        a = 2 * math.pi * (k + 0.5) / 12
        b.bar((0.034 * math.cos(a), 0.034 * math.sin(a), 0.029), (0.034 * math.cos(a), 0.034 * math.sin(a), 0.050), 0.004, "CanBlack")
    b.M = Matrix.Rotation(math.radians(8), 4, "Z") @ Matrix.Translation((-0.160, 0.040, H - 0.020))
    b.lathe([(0.012, 0.0), (0.012, 0.018), (0.0, 0.019)], 8, "CanBlack", cap_bottom=False)
    b.M = Matrix.Identity(4)
    return b.finish("jerryCan")


def build_airFilter():
    """Part icon `airFilter` (2026-10-22): the stock panel filter — a pleated paper pack in a urethane
    frame, tipped toward the viewer, the folds running straight away from them so both faces of every
    fold show: the sunlit one cream, the other in shade."""
    b = Builder()
    b.M = Matrix.Rotation(math.radians(35), 4, "Z") @ Matrix.Rotation(math.radians(30), 4, "X")
    L, W, H = 0.300, 0.200, 0.046                     # outside of the frame
    PL, PW, N = 0.272, 0.172, 15                      # the pleat pack and its folds
    top, low, cr = 0.038, 0.014, 0.0012                 # fold peaks, valleys, half-width of the shadowed crease
    xs = [-PL / 2 + PL * k / (2 * N) for k in range(2 * N + 1)]
    for k in range(2 * N):
        xa, xb = xs[k], xs[k + 1]
        if k % 2 == 0:   # falling face, then the crease
            b.face([(xa, -PW / 2, top), (xb - cr, -PW / 2, low), (xb - cr, PW / 2, low), (xa, PW / 2, top)], "FilterPaper")
            b.face([(xb - cr, -PW / 2, low), (xb, -PW / 2, low - 0.001), (xb, PW / 2, low - 0.001), (xb - cr, PW / 2, low)], "FilterCrease")
        else:
            b.face([(xa, -PW / 2, low - 0.001), (xa + cr, -PW / 2, low), (xa + cr, PW / 2, low), (xa, PW / 2, low - 0.001)], "FilterCrease")
            b.face([(xa + cr, -PW / 2, low), (xb, -PW / 2, top), (xb, PW / 2, top), (xa + cr, PW / 2, low)], "FilterPaper")
    # The frame: outer wall, chamfered top lip, inner wall down past the folds, bottom.
    rings = [rrect(L, W, 0.010, 0.0, per=2), rrect(L, W, 0.010, H - 0.005, per=2), rrect(L - 0.010, W - 0.010, 0.006, H, per=2),
             rrect(PL, PW, 0.002, H, per=2), rrect(PL, PW, 0.002, 0.0, per=2), rrect(L, W, 0.010, 0.0, per=2)]
    b.loft(rings, "Urethane", cap_bottom=False, cap_top=False)
    b.M = Matrix.Identity(4)
    return b.finish("airFilter")


def build_headlight():
    """Part icon `headlight` (owner, 2026-10-22: "rip it straight out of the ranger model"): the left
    headlamp's own lens and amber wraparound faces from assets/models/ranger.glb, turned to face the
    viewer with the wrap on the near side, on a black housing hulled back from them. No reflector or
    bulb — the truck model has none, so the icon doesn't either."""
    src = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ranger.glb")   # assets/models/
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=src)
    new = [o for o in bpy.data.objects if o not in before]
    body = next(o for o in new if o.type == "MESH" and any(m and m.name == "RangerLens" for m in o.data.materials))
    names = [m.name if m else "" for m in body.data.materials]
    pick = {names.index("RangerLens"): "LampLens", names.index("RangerAmber"): "LampAmber"}
    faces = []
    for p in body.data.polygons:
        c = body.matrix_world @ p.center
        if p.material_index in pick and c.x < 0 and c.y > 0:   # the front-left lamp
            faces.append(([body.matrix_world @ body.data.vertices[v].co for v in p.vertices], pick[p.material_index]))
    for o in new:
        data = o.data; bpy.data.objects.remove(o)
        if data and data.users == 0:
            bpy.data.meshes.remove(data)
    for m in list(bpy.data.materials):
        if m.name.startswith("Ranger") and m.users == 0:
            bpy.data.materials.remove(m)
    pts = [v for f, _ in faces for v in f]
    ctr = sum(pts, Vector()) / len(pts)
    YAW = math.radians(26)
    T = Matrix.Rotation(YAW, 4, "Z") @ Matrix.Rotation(math.pi, 4, "Z") @ Matrix.Translation(-ctr)   # nose to the viewer, wrap to +X
    b = Builder()
    loc = [[(T @ v) for v in f] for f, _ in faces]
    lift = -min(v.z for f in loc for v in f) + 0.012
    b.M = Matrix.Translation((0, 0, lift))
    allv = [v for f in loc for v in f]
    back = Matrix.Rotation(YAW, 4, "Z") @ Vector((0, 1, 0))                 # the truck's rearward, after the turn
    mid = sum(allv, Vector()) / len(allv); D = 0.050
    hc = mid + back * D / 2                                                 # the housing's middle
    for f, (_, mat) in zip(loc, faces):   # the lamp faces, a hair proud of the housing
        n = (f[1] - f[0]).cross(f[2] - f[0]).normalized()
        if n.dot(sum(f, Vector()) / len(f) - hc) < 0:
            n = -n
        b.face([v + n * 0.002 for v in f], mat)
    rim = [mid + (v - mid) * 1.07 + back * 0.006 for v in allv]            # the housing's lip, a border round the lens
    b.hull(rim + [mid + back * D + (v - mid) * 0.72 for v in allv], "Urethane")   # tapering back
    zt = max(v.z for v in rim)
    side = Matrix.Rotation(YAW, 4, "Z") @ Vector((-1, 0, 0))
    for k in (-0.35, 0.30):   # mounting tabs on top, each with its bolt hole
        c = mid + side * (k * 0.32) + back * 0.022; c.z = zt + 0.012
        q = back.to_track_quat("Z", "Y").to_matrix().to_4x4()
        b.M = Matrix.Translation((0, 0, lift)) @ Matrix.Translation(c) @ q
        b.cbox((0, 0, 0), (0.026, 0.028, 0.006), "Urethane", ch=0.002)
        b.lathe([(0.0, -0.0031), (0.0055, -0.0031)], 8, "SteelDark", cap_bottom=False, cap_top=False)
    b.M = Matrix.Translation((0, 0, lift)) @ Matrix.Translation(mid + back * D) @ back.to_track_quat("Z", "Y").to_matrix().to_4x4()
    b.lathe([(0.028, 0.0), (0.028, 0.020), (0.024, 0.026), (0.0, 0.026)], 12, "Urethane", cap_bottom=False)   # bulb socket
    b.cbox((0.0, 0.0, 0.034), (0.020, 0.014, 0.018), "CanBlack", ch=0.002)                                     # connector
    b.tube([(0.0, 0.0, 0.043), (0.0, 0.020, 0.060), (0.012, 0.040, 0.066)], 0.004, 6, "CanBlack")
    b.M = Matrix.Identity(4)
    return b.finish("headlight")


def build_radiator():
    """Part icon `radiator` (2026-10-22): the stock crossflow radiator standing up — aluminium core (flat
    tubes across, the fin pack between), black plastic end tanks on crimped headers, the upper hose neck
    and the filler cap on the left tank, the lower neck, transmission-cooler fittings and drain cock on
    the right, rubber mounting pegs."""
    b = Builder()
    R = b.M = Matrix.Rotation(math.radians(15), 4, "Z")
    CX, Z0, Z1, T = 0.330, 0.035, 0.465, 0.032      # core half-width, bottom, top, thickness (front face y = 0)
    TX, TZ0, TZ1 = CX + 0.034, 0.014, 0.486         # tank centre x, bottom, top
    b.cbox((0, T / 2, (Z0 + Z1) / 2), (2 * CX, T - 0.004, Z1 - Z0), "DiecastDark")            # the fin pack
    n = 18
    for k in range(n):                                                                       # tubes, proud of the fins
        b.cbox((0, T / 2, Z0 + 0.014 + (Z1 - Z0 - 0.028) * (k + 0.5) / n), (2 * CX, T + 0.004, 0.009), "Diecast", ch=0.002)
    for z in (Z0 + 0.006, Z1 - 0.006):                                                       # side channels
        b.cbox((0, T / 2, z), (2 * CX, T + 0.008, 0.012), "Diecast", ch=0.002)
    for sx in (-1, 1):
        b.cbox((sx * (CX + 0.004), T / 2, (TZ0 + TZ1) / 2), (0.010, T + 0.016, TZ1 - TZ0 - 0.012), "Diecast", ch=0.002)   # header
        b.cbox((sx * TX, T / 2, (TZ0 + TZ1) / 2), (0.054, 0.058, TZ1 - TZ0), "Nylon", ch=0.010)                         # tank
        b.M = R @ Matrix.Translation((sx * TX, T / 2, 0.0))                                                              # bottom peg
        b.lathe([(0.0, 0.0), (0.011, 0.0), (0.011, 0.016), (0.0, 0.016)], 8, "Rubber", cap_bottom=False, cap_top=False)
        b.M = R
    b.M = R @ Matrix.Translation((TX, T / 2 + 0.010, TZ1))                                                               # top peg
    b.lathe([(0.0, -0.004), (0.010, -0.004), (0.010, 0.016), (0.0, 0.016)], 8, "Rubber", cap_bottom=False)
    def neck(sx, z):   # a hose neck out of the tank's outer side, beaded, open end dark
        b.M = R @ Matrix.Translation((sx * (TX + 0.024), T / 2, z)) @ Matrix.Rotation(sx * math.pi / 2, 4, "Y")
        b.lathe([(0.019, 0.0), (0.019, 0.034), (0.023, 0.038), (0.023, 0.044), (0.019, 0.048), (0.019, 0.056), (0.014, 0.056), (0.014, 0.046), (0.0, 0.046)],
                14, "Nylon", cap_bottom=False, cap_top=False)
    neck(-1, 0.405); neck(1, 0.095)
    # Filler neck and cap on the left tank, a little forward of centre.
    b.M = R @ Matrix.Translation((-TX, T / 2 - 0.004, TZ1 - 0.004))
    b.lathe([(0.017, 0.0), (0.017, 0.014), (0.024, 0.016), (0.026, 0.021), (0.026, 0.027), (0.020, 0.033), (0.0, 0.034)], 16, "Mirror", cap_bottom=False)
    for sy in (-1, 1):
        b.bar((0, sy * 0.010, 0.030), (0, sy * 0.010, 0.040), 0.040, "Mirror", h=0.004, up=(0, 1, 0))
    b.M = R
    # Transmission-cooler fittings (brass hex) and the drain cock on the right tank.
    for z in (0.200, 0.290):
        b.M = R @ Matrix.Translation((TX + 0.026, T / 2, z)) @ Matrix.Rotation(math.pi / 2, 4, "Y")
        b.lathe([(0.0, -0.002), (0.012, -0.002), (0.012, 0.009), (0.007, 0.009), (0.007, 0.022), (0.0, 0.022)], 6, "Brass", cap_bottom=False)
    b.M = R
    b.cbox((TX, -0.016, 0.050), (0.016, 0.008, 0.022), "PlasticWhite", ch=0.002)
    b.M = Matrix.Identity(4)
    return b.finish("radiator")


def build_engine():
    """Part icon `engine` (2026-10-22): the used stock 4.0 V6, crate-ready on a pallet. Crank along Y, the
    front (belt drive) toward the viewer: painted block and 60° heads, black valve covers (yellow oil
    cap), the cast intake plenum and throttle body on top, timing cover, balancer, water pump,
    alternator, steering pump, A/C compressor and idler on one serpentine belt, rusty exhaust logs,
    an orange oil filter and the yellow dipstick loop, the flexplate behind."""
    b = Builder()
    R = b.M = Matrix.Rotation(math.radians(-8), 4, "Z")
    def at(p, d=(0, 0, 1)):   # lathe frame: origin p, local +Z along d
        b.M = R @ Matrix.Translation(p) @ Vector(d).normalized().to_track_quat("Z", "Y").to_matrix().to_4x4()
    # Pallet: three stringers along Y, five deck boards across.
    for x in (-0.26, 0.0, 0.26):
        b.cbox((x, 0, 0.040), (0.060, 0.78, 0.080), "Pallet", ch=0.004)
    for k in range(5):
        b.cbox((0, -0.33 + 0.165 * k, 0.089), (0.64, 0.105, 0.018), "Pallet", ch=0.003)
    Z0 = 0.098; ZC = Z0 + 0.235                      # pallet top; crank centre
    YF, YR = -0.25, 0.25                             # block front / rear faces
    # Oil pan: deep sump forward, shallow behind; its flange rail.
    b.cbox((0, -0.11, Z0 + 0.085), (0.28, 0.24, 0.170), "SteelDark", ch=0.012)
    b.cbox((0, 0.115, Z0 + 0.130), (0.30, 0.21, 0.080), "SteelDark", ch=0.010)
    b.cbox((0, 0.0, Z0 + 0.175), (0.38, 0.49, 0.014), "SteelDark", ch=0.003)
    # Lower block (crankcase skirt).
    b.cbox((0, 0, (Z0 + 0.182 + ZC + 0.06) / 2), (0.40, YR - YF, ZC + 0.06 - Z0 - 0.182), "EngineBlue", ch=0.012)
    # Banks at ±30°: cylinder block, head, valve cover — each a hull in the bank's own (along a, across p) frame.
    def bank_hull(sx, s0, s1, w0, w1, y0, y1, mat, ich=0.0):
        a = Vector((sx * 0.5, 0, 0.8660)); pv = Vector((0.8660 * sx, 0, -0.5 * sx)); c = Vector((0, 0, ZC))
        pts = []
        for s_, w_, ins in ((s0, w0, 0.0), (s1, w1, ich)):
            for t in (-w_ / 2, w_ / 2):
                for y in (y0 + ins, y1 - ins):
                    q = c + a * s_ + pv * t; pts.append((q.x, y, q.z))
        b.hull(pts, mat)
        return a, pv, c
    for sx, dy in ((1, -0.020), (-1, 0.020)):        # the right bank sits a little forward
        bank_hull(sx, 0.06, 0.245, 0.17, 0.17, YF + dy + 0.005, YR + dy - 0.005, "EngineBlue")
        bank_hull(sx, 0.245, 0.335, 0.19, 0.185, YF + dy - 0.005, YR + dy - 0.015, "EngineBlue")
        a, pv, c = bank_hull(sx, 0.335, 0.395, 0.175, 0.13, YF + dy + 0.005, YR + dy - 0.025, "CanBlack", ich=0.025)
        for t in (-0.035, 0.0, 0.035):               # ribs on the valve cover
            q = c + a * 0.399 + pv * t
            b.bar((q.x, YF + dy + 0.06, q.z), (q.x, YR + dy - 0.08, q.z), 0.008, "CanBlack", h=0.010)
        if sx == 1:                                  # oil filler cap
            q = c + a * 0.395 + pv * 0.0
            at((q.x, YF + dy + 0.045, q.z), a)
            b.lathe([(0.0, -0.004), (0.024, -0.004), (0.024, 0.016), (0.020, 0.022), (0.0, 0.022)], 12, "LabelYellow", cap_bottom=False)
            b.M = R
        # Exhaust log along the head's outer face, three runners, rusty.
        q = c + a * 0.27 + pv * 0.125
        b.tube([(q.x, YF + dy + 0.05, q.z - 0.02), (q.x, YR + dy - 0.03, q.z - 0.02)], 0.024, 10, "Rust")
        for y in (-0.15, 0.0, 0.15):
            h0 = c + a * 0.29 + pv * 0.09
            b.tube([(h0.x, y + dy, h0.z), (q.x, y + dy, q.z - 0.02)], 0.020, 8, "Rust")
        b.tube([(q.x, YR + dy - 0.03, q.z - 0.02), (q.x + sx * 0.01, YR + dy - 0.01, q.z - 0.10)], 0.024, 10, "Rust")
    # Intake: the lower manifold filling the V, the plenum on top, the throttle body at its front.
    b.hull([(x, y, z) for x in (-0.10, 0.10) for y in (-0.20, 0.18) for z in (ZC + 0.20, ZC + 0.34)], "Diecast")
    b.cbox((0.0, -0.01, ZC + 0.390), (0.230, 0.40, 0.100), "Diecast", ch=0.030)
    for y in (-0.13, 0.0, 0.13):                     # runner bumps down each side of the plenum
        for sx in (-1, 1):
            b.tube([(sx * 0.105, y, ZC + 0.410), (sx * 0.125, y, ZC + 0.370), (sx * 0.110, y, ZC + 0.320)], 0.020, 8, "Diecast")
    at((0.0, -0.21, ZC + 0.395), (0, -1, 0))
    b.lathe([(0.040, 0.0), (0.040, 0.050), (0.032, 0.050), (0.032, 0.040), (0.0, 0.040)], 16, "Diecast", cap_bottom=False, cap_top=False)
    b.M = R
    # Timing cover over the block front.
    b.hull([(x * k, y, z) for y in (YF - 0.035, YF + 0.01) for x, z in ((0.17, Z0 + 0.18), (0.19, ZC + 0.08), (0.13, ZC + 0.29), (0.0, ZC + 0.33))
            for k in (-1, 1)], "Diecast")
    # Belt drive on the front plane: (x, z, radius) of each pulley; the belt is their convex hull.
    YP = YF - 0.060
    pulleys = [(0.0, ZC, 0.085, "SteelDark"), (0.0, ZC + 0.190, 0.062, "SteelDark"), (0.205, ZC + 0.300, 0.034, "SteelDark"),
               (-0.185, ZC + 0.270, 0.058, "SteelDark"), (-0.205, ZC + 0.020, 0.056, "SteelDark"), (0.115, ZC + 0.105, 0.036, "Diecast")]
    for x, z, r, m in pulleys:
        at((x, YP - 0.014, z), (0, -1, 0))
        b.lathe([(0.0, -0.010), (r, -0.010), (r, 0.0), (r - 0.006, 0.004), (r - 0.006, 0.020), (r, 0.024), (r, 0.030), (r * 0.45, 0.030), (r * 0.45, 0.036), (0.0, 0.036)],
                20 if r > 0.05 else 14, m, cap_bottom=False)
    b.M = R
    ring = [(x + (r + 0.004) * math.cos(2 * math.pi * k / 36), z + (r + 0.004) * math.sin(2 * math.pi * k / 36)) for x, z, r, _ in pulleys for k in range(36)]
    ring = sorted(set(ring)); cross = lambda o, p, q: (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0])
    lo, hi = [], []
    for pt in ring:                                  # convex hull, monotone chain
        while len(lo) >= 2 and cross(lo[-2], lo[-1], pt) <= 0: lo.pop()
        lo.append(pt)
    for pt in reversed(ring):
        while len(hi) >= 2 and cross(hi[-2], hi[-1], pt) <= 0: hi.pop()
        hi.append(pt)
    hullp = lo[:-1] + hi[:-1]
    for (x0, z0), (x1, z1) in zip(hullp, hullp[1:] + hullp[:1]):
        if math.hypot(x1 - x0, z1 - z0) > 1e-4:
            b.bar((x0, YP - 0.001, z0), (x1, YP - 0.001, z1), 0.007, "Rubber", h=0.024, up=(0, 1, 0))
    # Alternator and steering pump bodies behind their pulleys.
    at((0.205, YP + 0.020, ZC + 0.300), (0, 1, 0))
    b.lathe([(0.020, 0.0), (0.060, 0.010), (0.066, 0.025), (0.066, 0.100), (0.050, 0.120), (0.0, 0.125)], 16, "Diecast", cap_bottom=False)
    at((-0.185, YP + 0.020, ZC + 0.270), (0, 1, 0))
    b.lathe([(0.018, 0.0), (0.045, 0.008), (0.045, 0.080), (0.0, 0.085)], 12, "SteelDark", cap_bottom=False)
    at((-0.205, YP + 0.020, ZC + 0.020), (0, 1, 0))
    b.lathe([(0.020, 0.0), (0.060, 0.010), (0.060, 0.130), (0.0, 0.135)], 14, "Diecast", cap_bottom=False)
    b.M = R
    # Oil filter off the right of the block, angled down-out; dipstick tube up to its yellow loop.
    at((0.195, -0.06, Z0 + 0.250), (0.85, 0, -0.35))
    b.lathe([(0.030, -0.01), (0.046, 0.0), (0.048, 0.010), (0.048, 0.105), (0.042, 0.115), (0.0, 0.117)], 16, "PatchOrange", cap_bottom=False)
    b.M = R
    dip = [(0.205, -0.17, ZC + 0.03), (0.240, -0.18, ZC + 0.15), (0.255, -0.19, ZC + 0.34)]
    b.tube(dip, 0.005, 6, "Steel")
    lp = [(0.255 + 0.020 * math.sin(2 * math.pi * k / 12), -0.19, ZC + 0.36 + 0.020 * math.cos(2 * math.pi * k / 12) - 0.0) for k in range(13)]
    b.tube(lp, 0.005, 6, "LabelYellow")
    # Flexplate behind the block.
    at((0.0, YR + 0.005, ZC), (0, 1, 0))
    b.lathe([(0.0, 0.0), (0.150, 0.0), (0.150, 0.012), (0.0, 0.012)], 24, "Steel", cap_bottom=False, cap_top=False)
    b.M = Matrix.Identity(4)
    return b.finish("engine")


def pillow_bag(b, L, W, T, mat, seal_mat=None, C=0.014, paint=None):
    """A sealed snack bag lying flat along X: a lens-section body puffed in the middle, flat crimped
    seals C long at both ends. `paint(x, y)` may name a material for the body face there (printed
    bands follow the skin exactly). Returns top(x, y), the top surface's height, for decals."""
    env = lambda x: max(0.0, math.sin(math.pi * min(1.0, max(0.0, (x + L / 2 - C) / (L - 2 * C))))) ** 0.45
    prof = lambda y: max(0.0, 1 - (2 * y / W) ** 2) ** 0.6
    top = lambda x, y: T / 2 * (1 + env(x) * prof(y))
    bot = lambda x, y: T / 2 * (1 - env(x) * prof(y))
    ys = [-W / 2 + W * k / 8 for k in range(9)]
    rings = []
    for i in range(11):
        x = -L / 2 + C + (L - 2 * C) * i / 10
        rings.append([(x, y, top(x, y)) for y in ys] + [(x, y, bot(x, y)) for y in reversed(ys[1:-1])])
    n = len(rings[0])
    for ra, rb in zip(rings, rings[1:]):
        for k in range(n):
            q = [ra[k], ra[(k + 1) % n], rb[(k + 1) % n], rb[k]]
            cx, cy = sum(v[0] for v in q) / 4, sum(v[1] for v in q) / 4
            b.face(q, (paint and paint(cx, cy)) or mat)
    b.face(list(reversed(rings[0])), mat); b.face(rings[-1], mat)
    for sx in (-1, 1):   # the crimped seals: a flat strip with a ridge every few mm
        x0, x1 = sx * (L / 2 - C), sx * L / 2
        b.cbox(((x0 + x1) / 2, 0, T / 2), (C, W, 0.0016), seal_mat or mat)
        for k in range(3):
            xr = x0 + (x1 - x0) * (k + 0.5) / 3
            b.bar((xr, -W / 2 + 0.002, T / 2 + 0.0008), (xr, W / 2 - 0.002, T / 2 + 0.0008), 0.0012, seal_mat or mat, h=0.0008)
    return top


def decal(b, pts, z_at, mat, lift=0.0009):
    """A flat (x, y) polygon laid onto a surface z_at(x, y): a fan of triangles, each corner on the skin."""
    cx = sum(p[0] for p in pts) / len(pts); cy = sum(p[1] for p in pts) / len(pts)
    P = lambda x, y: (x, y, z_at(x, y) + lift)
    n = 4   # each fan triangle split n x n so it follows the skin
    for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1]):
        at = lambda i, j: (cx + (x0 - cx) * i / n + (x1 - x0) * j / n, cy + (y0 - cy) * i / n + (y1 - y0) * j / n)   # i along centre->edge, j along the edge
        for i in range(n):
            for j in range(i + 1):
                b.face([P(*at(i, j)), P(*at(i + 1, j)), P(*at(i + 1, j + 1))], mat)
                if j < i:
                    b.face([P(*at(i, j)), P(*at(i + 1, j + 1)), P(*at(i, j + 1))], mat)


def ellipse(cx, cy, rx, ry, n=14, rot=0.0):
    c, s_ = math.cos(rot), math.sin(rot)
    return [(cx + rx * math.cos(2 * math.pi * k / n) * c - ry * math.sin(2 * math.pi * k / n) * s_,
             cy + rx * math.cos(2 * math.pi * k / n) * s_ + ry * math.sin(2 * math.pi * k / n) * c) for k in range(n)]


def build_burger():
    """Burger (owner 2026-10-21/22: the standard meal, "The classic"): sesame bun, a beef patty, a slice
    of cheese with its corners hanging over, lettuce frill and tomato."""
    b = Builder(); SEG = 16
    b.lathe([(0.0, 0.0), (0.050, 0.0), (0.056, 0.006), (0.057, 0.016), (0.052, 0.022), (0.0, 0.022)], SEG, "Bun")       # heel
    b.lathe([(0.0, 0.022), (0.059, 0.022), (0.061, 0.029), (0.059, 0.037), (0.0, 0.037)], SEG, "Sausage")               # patty
    sq = [(0.050 * math.cos(math.pi / 4 + k * math.pi / 2), 0.050 * math.sin(math.pi / 4 + k * math.pi / 2)) for k in range(4)]
    b.M = Matrix.Rotation(0.3, 4, "Z")
    b.prism([(x * 1.18, y * 1.18) for x, y in sq], 0.037, 0.040, "Cheese")                                             # cheese slice
    for x, y in sq:   # corners folded down over the patty
        b.bar((x * 1.18, y * 1.18, 0.0385), (x * 1.30, y * 1.30, 0.028), 0.030, "Cheese", h=0.003)
    b.M = Matrix.Identity(4)
    b.lathe([(0.0, 0.040), (0.058, 0.040), (0.058, 0.046), (0.0, 0.046)], SEG, "Tomato")                                # tomato
    frill = [(0.064 if k % 2 else 0.056) for k in range(20)]
    b.loft([[(r * math.cos(2 * math.pi * k / 20), r * math.sin(2 * math.pi * k / 20), 0.046 + (0.003 if k % 2 else 0)) for k, r in enumerate(frill)],
            [(0.050 * math.cos(2 * math.pi * k / 20), 0.050 * math.sin(2 * math.pi * k / 20), 0.050) for k in range(20)]], "Lettuce")
    crown = [(0.0, 0.049), (0.058, 0.049), (0.061, 0.056), (0.058, 0.070), (0.050, 0.081), (0.036, 0.089), (0.018, 0.093), (0.0, 0.094)]
    b.lathe(crown, SEG, "Bun")
    rnd = random.Random(3)
    for k in range(16):   # sesame seeds on the crown's visible side
        a = rnd.uniform(-2.6, 0.9); r = rnd.uniform(0.012, 0.048)
        z = 0.094 - 0.0185 * (r / 0.03) ** 2 * 0.6 - (0.004 if r > 0.04 else 0)
        n = Vector((r * math.cos(a), r * math.sin(a), 0.11)).normalized()
        c = Vector((r * math.cos(a), r * math.sin(a), max(z, 0.06) + 0.0012))
        t1 = n.cross(Vector((0, 0, 1))).normalized() if abs(n.z) < 0.99 else Vector((1, 0, 0)); t2 = n.cross(t1)
        b.face([c + t1 * 0.0035 * math.cos(2 * math.pi * q / 6) + t2 * 0.0019 * math.sin(2 * math.pi * q / 6) for q in range(6)], "Sesame")
    return b.finish("burger")


def apple(b, x, y, r=0.038):
    b.M = Matrix.Translation((x, y, 0))
    b.lathe([(0.0, 0.004), (r * 0.55, 0.0), (r * 0.95, r * 0.45), (r, r * 0.95), (r * 0.85, r * 1.45), (r * 0.45, r * 1.75), (r * 0.12, r * 1.62), (0.0, r * 1.55)], 14, "Apple")
    b.tube([(0, 0, r * 1.55), (0.002, 0, r * 1.95)], 0.0022, 6, "Stem")
    b.hull([(0.002, 0, r * 1.85), (0.018, 0.006, r * 1.98), (0.026, 0.002, r * 1.92), (0.012, -0.004, r * 1.86), (0.010, 0.0, r * 1.92)], "Lettuce")
    b.M = Matrix.Identity(4)


def paper_bag(b, W, D, H, seed, top_open=True):
    """A kraft paper bag: side gussets creased in, the walls crinkled a little. Open: walls with a
    dark inside, the top edge cut in a zigzag. Returns the top height."""
    rnd = random.Random(seed)
    def ring(z, j=0.0, gus=1.0):
        g = 0.20 * D * gus
        pts = [(W / 2, -D / 2), (W / 2, D / 2), (0, D / 2), (-W / 2, D / 2), (-W / 2, -D / 2), (0, -D / 2)]
        pts = [(-W / 2, -D / 2), (0.0, -D / 2), (W / 2, -D / 2), (W / 2 - g, 0.0), (W / 2, D / 2), (0.0, D / 2), (-W / 2, D / 2), (-W / 2 + g, 0.0)]
        return [(x + rnd.uniform(-j, j), y + rnd.uniform(-j, j), z) for x, y in pts]
    zs = [0.0, 0.25 * H, 0.55 * H, 0.80 * H, H]
    rings = [ring(z, 0.0 if z == 0 else 0.004, 0.2 if z == 0 else 1.0) for z in zs]
    b.loft(rings, "Kraft", cap_bottom=True, cap_top=not top_open)
    if top_open:
        inner = [[(x * 0.97, y * 0.95, z) for x, y, z in r] for r in rings[1:]]
        b.loft(list(reversed(inner)), "KraftDark", cap_bottom=False, cap_top=True)
        for p0, p1 in zip(rings[-1], rings[-1][1:] + rings[-1][:1]):   # the zigzag cut
            for k in range(4):
                a = Vector(p0).lerp(Vector(p1), k / 4); c = Vector(p0).lerp(Vector(p1), (k + 1) / 4); m = a.lerp(c, 0.5)
                b.face([a, c, m + Vector((0, 0, 0.008))], "Kraft")
    return H


def build_packedLunch():
    """Packed lunch (owner: "Homemade!"): a brown paper lunch sack with its top rolled down twice, and an
    apple beside it."""
    b = Builder()
    b.M = Matrix.Rotation(math.radians(20), 4, "Z")
    W, D, H = 0.130, 0.080, 0.190
    paper_bag(b, W, D, H, 5, top_open=False)
    for k, (z, t) in enumerate(((H - 0.004, 0.016), (H - 0.020, 0.016))):   # the rolled top
        b.cbox((0.0, -0.002 * k, z - 0.004), (W + 0.004, D + 0.006 + 0.004 * k, t), "Kraft", ch=0.006)
    b.M = Matrix.Identity(4)
    apple(b, 0.118, -0.050)
    return b.finish("packedLunch")


def build_groceries():
    """Groceries (owner: "Fresh and goes together easy"): an open kraft grocery bag with a baguette, a
    head of greens and carrots standing out of it."""
    b = Builder()
    b.M = Matrix.Rotation(math.radians(18), 4, "Z")
    W, D, H = 0.280, 0.170, 0.300
    paper_bag(b, W, D, H, 9)
    b.M = Matrix.Rotation(math.radians(18), 4, "Z") @ Matrix.Translation((-0.070, 0.020, 0.150)) @ Matrix.Rotation(math.radians(-14), 4, "Y")
    b.lathe([(0.0, 0.0), (0.024, 0.020), (0.032, 0.080), (0.032, 0.230), (0.024, 0.290), (0.0, 0.305)], 10, "Baguette")
    for k in range(4):   # the baguette's slashes
        z = 0.200 + 0.024 * k
        b.bar((-0.026, -0.022, z), (-0.012, -0.030, z + 0.016), 0.006, "Bun", h=0.003)
    b.M = Matrix.Rotation(math.radians(18), 4, "Z")
    rnd = random.Random(4)
    for k in range(7):   # a head of greens
        a = 2 * math.pi * k / 7; c = Vector((0.050 + 0.030 * math.cos(a), 0.015 + 0.025 * math.sin(a), H + 0.020 + rnd.uniform(0, 0.02)))
        b.hull([c + Vector((rnd.uniform(-0.035, 0.035), rnd.uniform(-0.030, 0.030), rnd.uniform(-0.03, 0.04))) for _ in range(10)], "Lettuce")
    for k, (x, y, lean) in enumerate(((0.100, -0.040, 0.30), (0.118, -0.020, 0.45))):   # carrots and their fronds
        top = Vector((x + lean * 0.06, y - 0.01, H + 0.050))
        b.tube([Vector((x, y, H - 0.050)), top], 0.011, 8, "Carrot")
        for q in range(4):
            a = q * 1.4
            b.tube([top, top + Vector((0.020 * math.cos(a), 0.020 * math.sin(a), 0.045))], 0.0035, 5, "Lettuce")
    b.M = Matrix.Identity(4)
    return b.finish("groceries")


def build_bagOfPeanuts():
    """Bag of peanuts (owner: "Mmm, salty"): a small red foil snack bag, a yellow oval label with three
    peanuts printed on it."""
    b = Builder()
    b.M = Matrix.Rotation(math.radians(35), 4, "Z") @ Matrix.Rotation(math.radians(28), 4, "X")
    top = pillow_bag(b, 0.150, 0.100, 0.032, "FoilRed")
    decal(b, ellipse(0.0, 0.0, 0.046, 0.032), top, "LabelYellow")
    for x, y, r in ((-0.022, 0.006, 0.5), (0.0, -0.010, -0.3), (0.022, 0.008, 0.9)):   # peanuts: two lobes each
        for dx in (-0.006, 0.006):
            decal(b, ellipse(x + dx * math.cos(r), y + dx * math.sin(r), 0.0075, 0.0060, 10), top, "Peanut", lift=0.0018)
    b.M = Matrix.Identity(4)
    return b.finish("bagOfPeanuts")


def build_spicyChips():
    """Spicy chips (owner: "Almost too hot"): an orange chip bag with a red band and a yellow flame."""
    b = Builder()
    b.M = Matrix.Rotation(math.radians(35), 4, "Z") @ Matrix.Rotation(math.radians(28), 4, "X")
    top = pillow_bag(b, 0.240, 0.170, 0.066, "FoilOrange", seal_mat="FoilRed", C=0.018, paint=lambda x, y: "FoilRed" if x < -0.070 else None)
    flame = [(0.000, -0.042), (0.026, -0.034), (0.040, -0.012), (0.040, 0.012), (0.030, 0.030), (0.036, 0.058), (0.016, 0.036), (0.010, 0.050),
             (0.002, 0.078), (-0.008, 0.040), (-0.018, 0.052), (-0.022, 0.030), (-0.036, 0.044), (-0.040, 0.010), (-0.034, -0.016), (-0.020, -0.034)]   # (across, up the print)
    decal(b, [(u + 0.012, v) for v, u in flame], top, "LabelYellow", lift=0.0012)
    decal(b, [(0.55 * u + 0.004, 0.55 * v) for v, u in flame], top, "FoilRed", lift=0.0020)
    b.M = Matrix.Identity(4)
    return b.finish("spicyChips")


def build_candyBar():
    """Candy bar (owner: "A bit melty"): a chocolate bar in its wrapper, crimped fins at both ends, a red
    label band round the middle."""
    b = Builder()
    b.M = Matrix.Rotation(math.radians(35), 4, "Z")
    L, W, T = 0.130, 0.042, 0.016
    b.cbox((0, 0, T / 2), (L, W, T), "CandyBrown", ch=0.004)
    b.cbox((0.012, 0, T / 2), (0.050, W + 0.002, T + 0.002), "CapRed", ch=0.004)
    b.cbox((0.012, 0, T / 2), (0.054, W + 0.0024, 0.004), "LabelYellow")
    for sx in (-1, 1):   # crimped fins, zigzag edge
        x0 = sx * L / 2; x1 = sx * (L / 2 + 0.014)
        zig = [(x0, -W / 2 - 0.002)] + [(x1 if k % 2 == 0 else x1 - sx * 0.003, -W / 2 - 0.002 + (W + 0.004) * k / 8) for k in range(9)] + [(x0, W / 2 + 0.002)]
        b.prism(zig if sx > 0 else list(reversed(zig)), T / 2 - 0.0008, T / 2 + 0.0008, "CandyBrown")
    b.M = Matrix.Identity(4)
    return b.finish("candyBar")


def build_gummyWorms():
    """Gummy worms (owner: "Only a couple blue ones"): a loose pile of two-tone worms, two of them blue."""
    b = Builder(); rnd = random.Random(21)
    pairs = [("GummyRed", "GummyYellow"), ("GummyGreen", "GummyOrange"), ("GummyOrange", "GummyYellow"), ("GummyBlue", "GummyRed"),
             ("GummyRed", "GummyGreen"), ("GummyYellow", "GummyGreen"), ("GummyBlue", "GummyYellow")]
    for k, (ma, mb) in enumerate(pairs):
        a0 = rnd.uniform(0, math.pi); L = rnd.uniform(0.10, 0.13); x0, y0 = rnd.uniform(-0.03, 0.03), rnd.uniform(-0.03, 0.03)
        z = 0.0055 + 0.0085 * (k % 3)
        path = []
        for i in range(17):
            t = i / 16 - 0.5
            w = 0.010 * math.sin(2 * math.pi * (1.6 * t + k * 0.3))
            path.append(Vector((x0 + math.cos(a0) * L * t - math.sin(a0) * w, y0 + math.sin(a0) * L * t + math.cos(a0) * w, z)))
        b.tube(path[:9], 0.0055, 8, ma); b.tube(path[8:], 0.0055, 8, mb)
    return b.finish("gummyWorms")


def build_energyDrink():
    """Energy drink: a tall 16 oz can, yellow with one big black lightning bolt down the front and a
    silver lid. Generic on purpose — no real brand's look."""
    b = Builder(); R = 0.033
    b.M = Matrix.Rotation(math.radians(35), 4, "Z")
    b.lathe([(0.0, 0.003), (0.022, 0.0), (0.030, 0.004), (0.033, 0.012)], 16, "Diecast", cap_bottom=False, cap_top=False)
    b.lathe([(0.033, 0.012), (0.033, 0.150)], 16, "DrinkYellow", cap_bottom=False, cap_top=False)
    b.lathe([(0.033, 0.150), (0.028, 0.162), (0.027, 0.168), (0.025, 0.168), (0.025, 0.165), (0.0, 0.165)], 16, "Diecast", cap_bottom=False)
    b.bar((0.004, -0.004, 0.1665), (0.004, 0.012, 0.1665), 0.010, "Diecast", h=0.002)   # the tab
    a0 = -math.pi / 2 - math.radians(35) + 0.15                                       # the side facing the eye
    on = lambda sx, z: (R * 1.03 * math.cos(a0 + sx / R), R * 1.03 * math.sin(a0 + sx / R), z)   # (arc length, height) -> skin
    for poly in ([(-0.006, 0.142), (0.016, 0.142), (0.005, 0.094), (-0.017, 0.094)],          # the bolt: upper bar,
                 [(-0.017, 0.094), (0.017, 0.094), (0.017, 0.082), (-0.017, 0.082)],          # the jog,
                 [(-0.004, 0.082), (0.017, 0.082), (-0.013, 0.024)]):                        # the spike
        cx = sum(p[0] for p in poly) / len(poly); cz = sum(p[1] for p in poly) / len(poly)
        for (x0, z0), (x1, z1) in zip(poly, poly[1:] + poly[:1]):
            b.face([on(cx, cz), on(x0, z0), on((x0 + x1) / 2, (z0 + z1) / 2)], "CanBlack"); b.face([on(cx, cz), on((x0 + x1) / 2, (z0 + z1) / 2), on(x1, z1)], "CanBlack")
    b.M = Matrix.Identity(4)
    return b.finish("energyDrink")

def build_ice():
    """Ice (owner: "Cold and wet"): a gas-station bag of ice lying flat — frosted pale bag, a blue band,
    cubes pressing up through the plastic."""
    b = Builder(); rnd = random.Random(8)
    b.M = Matrix.Rotation(math.radians(35), 4, "Z") @ Matrix.Rotation(math.radians(28), 4, "X")
    top = pillow_bag(b, 0.380, 0.260, 0.110, "IceBag", C=0.020, paint=lambda x, y: "IceBlue" if abs(x) < 0.050 else None)
    for k in range(14):
        x, y = rnd.uniform(-0.15, 0.15), rnd.uniform(-0.09, 0.09)
        if abs(x) < 0.068:
            continue
        b.M = Matrix.Rotation(math.radians(35), 4, "Z") @ Matrix.Rotation(math.radians(28), 4, "X") @ Matrix.Translation((x, y, top(x, y) - 0.006)) @ Matrix.Rotation(rnd.uniform(0, 3), 4, "Z") @ Matrix.Rotation(rnd.uniform(-0.4, 0.4), 4, "X")
        b.cbox((0, 0, 0), (0.040, 0.040, 0.032), "IceCube", ch=0.008)
    b.M = Matrix.Identity(4)
    return b.finish("ice")


def cooler_box(b, L, W, H, LH, body, lid, R=0.040, wall=1.0):
    """A cooler's body (tapering a little to the foot) and its lid, rounded corners. Returns the lid top."""
    b.loft([rrect(L - 0.030, W - 0.030, R - 0.010, 0.0, per=3), rrect(L - 0.006, W - 0.006, R - 0.003, 0.012, per=3),
            rrect(L, W, R, H, per=3)], body, cap_bottom=True, cap_top=True)
    b.loft([rrect(L + 0.006, W + 0.006, R + 0.003, H, per=3), rrect(L + 0.006, W + 0.006, R + 0.003, H + LH - 0.012, per=3),
            rrect(L - 0.014, W - 0.014, R - 0.008, H + LH, per=3)], lid)
    return H + LH


def build_cooler():
    """Cooler (owner: "Keeps stuff cold"; runs on ice, refilled every three days): a 48 qt two-tone
    cooler — blue body, white lid with two cup rings, swing handles at the ends, a drain cap."""
    b = Builder()
    W0 = b.M = Matrix.Rotation(math.radians(20), 4, "Z")
    L, W, H = 0.560, 0.340, 0.300
    top = cooler_box(b, L, W, H, 0.060, "CoolerBlue", "PlasticWhite")
    for x in (0.150, 0.215):   # cup rings in the lid
        b.M = W0 @ Matrix.Translation((x, -0.090, top - 0.004))
        b.lathe([(0.030, 0.004), (0.026, 0.0), (0.0, 0.0)], 14, "PlasticWhite", cap_bottom=False)
    b.M = W0
    for sx in (-1, 1):   # swing handles: a bar across each end, pivots in bosses
        x = sx * (L / 2 + 0.010)
        b.tube([(x, -0.120, H - 0.040), (x + sx * 0.030, -0.110, H - 0.090), (x + sx * 0.030, 0.110, H - 0.090), (x, 0.120, H - 0.040)], 0.008, 8, "PlasticWhite")
        for y in (-0.120, 0.120):
            b.M = W0 @ Matrix.Translation((x - sx * 0.004, y, H - 0.040)) @ Matrix.Rotation(sx * math.pi / 2, 4, "Y")
            b.lathe([(0.016, 0.0), (0.016, 0.010), (0.0, 0.012)], 10, "CoolerBlue", cap_bottom=False)
            b.M = W0
    b.M = W0 @ Matrix.Translation((L / 2 - 0.080, -W / 2 + 0.006, 0.030)) @ Matrix.Rotation(math.pi / 2, 4, "X")
    b.lathe([(0.014, 0.0), (0.014, 0.010), (0.010, 0.014), (0.0, 0.014)], 10, "PlasticWhite", cap_bottom=False)   # drain cap
    b.M = Matrix.Identity(4)
    return b.finish("cooler")


def build_iceKing():
    """Ice King (owner, 2026-10-22: the better cooler, renamed — ice keeps five days): a heavy
    roto-moulded cooler, tan, thick lid, black rubber T-latches, rope handles in black grips, a gold
    crown on the front."""
    b = Builder()
    W0 = b.M = Matrix.Rotation(math.radians(20), 4, "Z")
    L, W, H = 0.660, 0.400, 0.330
    top = cooler_box(b, L, W, H, 0.085, "CoolerTan", "CoolerTan", R=0.035)
    b.loft([rrect(L - 0.060, W - 0.060, 0.025, top, per=3), rrect(L - 0.070, W - 0.070, 0.022, top + 0.010, per=3)], "CoolerTan")   # raised lid panel
    for x in (-0.180, 0.180):   # T-latches over the lid lip
        b.cbox((x, -W / 2 - 0.006, H - 0.010), (0.022, 0.012, 0.090), "Rubber", ch=0.003)
        b.cbox((x, -W / 2 - 0.009, H - 0.062), (0.060, 0.016, 0.022), "Rubber", ch=0.004)
    for sx in (-1, 1):   # rope handles in black grips
        x = sx * (L / 2 + 0.004)
        b.tube([(x, -0.100, H - 0.050), (x + sx * 0.050, -0.080, H - 0.075), (x + sx * 0.050, 0.080, H - 0.075), (x, 0.100, H - 0.050)], 0.0065, 6, "Rope")
        b.tube([(x + sx * 0.050, -0.050, H - 0.075), (x + sx * 0.050, 0.050, H - 0.075)], 0.014, 8, "Rubber")
    crown = [(-0.050, 0.150), (0.050, 0.150), (0.058, 0.215), (0.030, 0.185), (0.0, 0.230), (-0.030, 0.185), (-0.058, 0.215)]
    y = -W / 2 - 0.0012
    cx = 0.0; cz = 0.180
    for (x0, z0), (x1, z1) in zip(crown, crown[1:] + crown[:1]):   # the crown, fanned from its middle
        b.face([(cx, y, cz), (x0, y, z0), (x1, y, z1)], "Gold")
    b.M = Matrix.Identity(4)
    return b.finish("iceKing")


def build_quickJack():
    """Quick-jack (owner, 2026-10-22: takes an hour off the spare change): a low red trolley jack —
    side plates, steel front wheels, swivel casters, the lift arm up to a ribbed saddle, the pump at
    the back and its handle angled up, a black grip."""
    b = Builder()
    W0 = b.M = Matrix.Rotation(math.radians(-30), 4, "Z")
    for sy in (-1, 1):   # side plates, tall at the back, low at the nose
        y = sy * 0.115
        b.hull([(x, y + dy, z) for x, z in ((-0.270, 0.040), (-0.270, 0.150), (0.000, 0.120), (0.270, 0.060), (0.270, 0.030), (-0.200, 0.030)) for dy in (-0.004, 0.004)], "JackRed")
        b.M = W0 @ Matrix.Translation((0.240, y + sy * 0.022, 0.040)) @ Matrix.Rotation(math.pi / 2, 4, "X")   # front wheel
        b.lathe([(0.0, -0.014), (0.040, -0.014), (0.040, 0.014), (0.0, 0.014)], 14, "Steel", cap_bottom=False, cap_top=False)
        b.M = W0
        b.cbox((-0.240, y, 0.060), (0.040, 0.030, 0.030), "SteelDark", ch=0.004)                                      # caster fork
        b.M = W0 @ Matrix.Translation((-0.250, y, 0.025)) @ Matrix.Rotation(math.pi / 2, 4, "X")
        b.lathe([(0.0, -0.012), (0.025, -0.012), (0.025, 0.012), (0.0, 0.012)], 12, "Rubber", cap_bottom=False, cap_top=False)
        b.M = W0
        b.bar((-0.120, y - sy * 0.012, 0.110), (0.190, y - sy * 0.012, 0.165), 0.020, "JackRed", h=0.030)            # lift arm
    b.cbox((-0.200, 0, 0.130), (0.140, 0.230, 0.010), "JackRed", ch=0.002)                                              # top plate
    b.M = W0 @ Matrix.Translation((0.200, 0, 0.165))
    b.lathe([(0.0, 0.0), (0.048, 0.0), (0.048, 0.016), (0.040, 0.020), (0.0, 0.020)], 16, "Diecast", cap_bottom=False)  # saddle
    for k in range(3):
        b.lathe([(0.012 + 0.012 * k, 0.020), (0.016 + 0.012 * k, 0.024), (0.020 + 0.012 * k, 0.020)], 16, "DiecastDark", cap_bottom=False, cap_top=False)
    b.M = W0 @ Matrix.Translation((-0.150, 0, 0.060)) @ Matrix.Rotation(math.pi / 2, 4, "Y")
    b.lathe([(0.032, -0.080), (0.032, 0.060), (0.024, 0.075), (0.0, 0.078)], 12, "Diecast", cap_bottom=False)            # pump cylinder
    b.M = W0
    hdl = [Vector((-0.270, 0, 0.110)), Vector((-0.640, 0, 0.420))]
    b.tube(hdl, 0.013, 8, "JackRed")
    b.tube([hdl[1], hdl[1] + (hdl[1] - hdl[0]).normalized() * 0.120], 0.018, 8, "Rubber")
    b.M = Matrix.Identity(4)
    return b.finish("quickJack")


def build_hiLiftJack():
    """Hi-lift jack (owner, 2026-10-22: rights a rolled truck by a few seconds of roll torque, live in
    the physics): a 48 in farm jack lying on its side — the black perforated standard, a foot plate,
    the red climbing mechanism with its lifting nose, the long handle clipped along the bar, the top
    clamp."""
    b = Builder()
    W0 = b.M = Matrix.Rotation(math.radians(100), 4, "Z")   # along the screen diagonal, so the detail isn't a sliver
    L = 1.220
    b.cbox((0, 0, 0.012), (L, 0.044, 0.008), "CanBlack")                       # the web, lying flat
    for sy in (-1, 1):
        b.cbox((0, sy * 0.022, 0.012), (L, 0.006, 0.024), "CanBlack")          # flanges
    for k in range(40):   # the holes through the web
        x = -0.52 + 0.026 * k
        b.M = W0 @ Matrix.Translation((x, 0, 0.0163))
        b.lathe([(0.0, 0.0), (0.0075, 0.0)], 8, "SteelDark", cap_bottom=False, cap_top=False)
        b.M = W0
    b.cbox((-L / 2 - 0.006, 0, 0.060), (0.012, 0.130, 0.120), "CanBlack", ch=0.004)   # foot plate, on its edge
    b.cbox((L / 2 - 0.020, 0, 0.024), (0.040, 0.060, 0.040), "JackRed", ch=0.004)     # top clamp
    b.cbox((0.120, 0, 0.040), (0.200, 0.090, 0.070), "JackRed", ch=0.010)             # the mechanism
    b.hull([(x, y, z) for x in (0.040, 0.120) for y in (-0.045, -0.140) for z in (0.020, 0.060 if y > -0.1 else 0.040)], "JackRed")   # lifting nose
    for x in (0.070, 0.170):
        b.M = W0 @ Matrix.Translation((x, 0, 0.076))
        b.lathe([(0.0, 0.0), (0.009, 0.0), (0.009, 0.008), (0.0, 0.008)], 8, "Diecast", cap_bottom=False)   # climbing pins
        b.M = W0
    b.tube([(0.200, 0.070, 0.024), (L / 2 - 0.060, 0.070, 0.024)], 0.014, 8, "JackRed")   # handle, stowed along the bar
    b.cbox((L / 2 - 0.080, 0.050, 0.024), (0.030, 0.050, 0.030), "SteelDark", ch=0.004)   # handle clip
    b.M = Matrix.Identity(4)
    return b.finish("hiLiftJack")


def shovel(b, L_handle, blade_mat, d_grip):
    """A round-point shovel lying along X, blade at +X dished upward, socket and wooden shaft back to
    the grip end at x = 0."""
    BL, BW = 0.300, 0.230
    x0 = L_handle                       # where the blade's top edge sits
    for i in range(6):   # the dished blade: rows across, the round point at the far end
        for j in range(6):
            def P(i_, j_):
                v = i_ / 6; u = j_ / 6 - 0.5
                half = BW / 2 * (1 - max(0.0, (v - 0.55) / 0.45) ** 2) ** 0.5 if v > 0.55 else BW / 2
                x = x0 + BL * v; y = 2 * u * half
                return (x, y, 0.010 + 0.040 * (2 * u) ** 2 * (1 - 0.5 * v) + 0.010 * (1 - v))
            b.face([P(i, j), P(i, j + 1), P(i + 1, j + 1), P(i + 1, j)], blade_mat)
            b.face([tuple(c - (0, 0, 0.003)[k] for k, c in enumerate(q)) for q in (P(i + 1, j), P(i + 1, j + 1), P(i, j + 1), P(i, j))], blade_mat)
    b.bar((x0, -BW / 2, 0.055), (x0, BW / 2, 0.055), 0.012, blade_mat, h=0.006)            # the rolled step
    b.tube([(x0 - 0.140, 0, 0.032), (x0 + 0.080, 0, 0.030)], 0.020, 8, blade_mat)         # the socket
    b.tube([(0.0, 0, 0.034), (x0 - 0.120, 0, 0.032)], 0.0175, 8, "Ash")                   # the shaft
    if d_grip:
        b.tube([(0.010, 0, 0.034), (-0.060, -0.055, 0.034), (-0.130, -0.055, 0.034), (-0.130, 0.055, 0.034), (-0.060, 0.055, 0.034), (0.010, 0, 0.034)], 0.011, 8, "BladeBlack")
        b.tube([(-0.130, -0.055, 0.034), (-0.130, 0.055, 0.034)], 0.016, 8, "BladeBlack")


def build_shovel():
    """Shovel (owner, 2026-10-22: renamed from the camp shovel — digs a pad on a slope): a short
    round-point shovel with a black blade and a D-grip."""
    b = Builder()
    b.M = Matrix.Rotation(math.radians(100), 4, "Z")   # along the screen diagonal
    shovel(b, 0.700, "BladeBlack", True)
    b.M = Matrix.Identity(4)
    return b.finish("shovel")


def build_longHandledShovel():
    """Long-handled shovel: the second rung — a red-bladed round-point shovel on a long straight shaft."""
    b = Builder()
    b.M = Matrix.Rotation(math.radians(100), 4, "Z")   # along the screen diagonal
    shovel(b, 1.150, "JackRed", False)
    b.M = Matrix.Identity(4)
    return b.finish("longHandledShovel")


def build_gpsUnit():
    """GPS unit (owner, 2026-10-22: "it's a minimap"): a dash GPS on its suction mount, the screen
    showing a map — grey roads, a green park, the blue route and the orange position arrow."""
    b = Builder()
    W0 = Matrix.Rotation(math.radians(28), 4, "Z")
    T = W0 @ Matrix.Translation((0, 0, 0.060)) @ Matrix.Rotation(math.radians(-12), 4, "X")   # leaned back a little
    b.M = T
    b.loft([[(x, y, z) for x, z, _ in rrect(w, h, r, 0, per=3)] for w, h, r, y in ((0.126, 0.082, 0.010, 0.013), (0.132, 0.088, 0.012, 0.002), (0.128, 0.084, 0.010, -0.010))], "CanBlack")
    y = -0.0105
    b.face([(x, y, z) for x, z, _ in reversed(rrect(0.112, 0.068, 0.004, 0, per=2))], "Screen")
    y -= 0.0006
    def quad(pts, mat):
        b.face([(x, y, z) for x, z in pts], mat)
    quad([(-0.054, -0.032), (-0.020, -0.032), (-0.020, -0.004), (-0.054, -0.004)], "MapGreen")
    for (x0, z0), (x1, z1), w in (((-0.056, 0.010), (0.056, 0.016), 0.006), ((0.012, -0.034), (0.024, 0.034), 0.006), ((-0.056, -0.020), (0.010, 0.030), 0.004)):
        d = Vector((x1 - x0, z1 - z0)).normalized(); n = Vector((-d.y, d.x)) * w / 2
        quad([(x0 + n.x, z0 + n.y), (x0 - n.x, z0 - n.y), (x1 - n.x, z1 - n.y), (x1 + n.x, z1 + n.y)], "PlasticWhite")
    y -= 0.0006
    route = [(0.000, -0.030), (0.016, -0.004), (0.020, 0.013), (0.048, 0.016)]
    for (x0, z0), (x1, z1) in zip(route, route[1:]):
        d = Vector((x1 - x0, z1 - z0)).normalized(); n = Vector((-d.y, d.x)) * 0.0035
        quad([(x0 + n.x, z0 + n.y), (x0 - n.x, z0 - n.y), (x1 - n.x, z1 - n.y), (x1 + n.x, z1 + n.y)], "GummyBlue")
    y -= 0.0006
    quad([(0.000, -0.020), (-0.008, -0.034), (0.000, -0.030), (0.008, -0.034)], "LabelOrange")
    b.M = W0
    b.tube([(0.0, 0.018, 0.060), (0.0, 0.040, 0.030), (0.0, 0.050, 0.012)], 0.006, 8, "CanBlack")             # mount arm
    b.M = W0 @ Matrix.Translation((0.0, 0.050, 0.0))
    b.lathe([(0.0, 0.0), (0.034, 0.0), (0.030, 0.005), (0.010, 0.012), (0.0, 0.013)], 16, "GasketGrey", cap_bottom=False)   # suction cup
    b.M = Matrix.Identity(4)
    return b.finish("gpsUnit")


def moving_pad(b, L, W, layers, t, cloth, stitch, binding):
    """A folded moving pad: `layers` quilted folds stacked, rounded fold edges alternating sides, bound
    edges, a diamond stitch grid on the top fold."""
    for k in range(layers):
        z0 = k * t; sx = 1 if k % 2 == 0 else -1
        b.cbox((-sx * 0.006, 0, z0 + t / 2), (L - 0.012, W, t * 0.96), cloth, ch=t * 0.30)
        b.cbox((-sx * 0.006, -W / 2 - 0.0006, z0 + t / 2), (L - 0.030, 0.003, t * 0.35), binding)       # bound edge, near side
        b.M = b.M @ Matrix.Translation((sx * (L / 2 - 0.006), 0, z0 + t)) @ Matrix.Rotation(math.pi / 2, 4, "X")
        b.lathe([(t * 0.5, -W / 2), (t * 0.5, W / 2)], 8, cloth, cap_bottom=True, cap_top=True)            # the fold
        b.M = b.M @ Matrix.Rotation(-math.pi / 2, 4, "X") @ Matrix.Translation((-sx * (L / 2 - 0.006), 0, -(z0 + t)))
    zt = layers * t + 0.0008
    hx, hy = L / 2 - 0.022, W / 2 - 0.016                       # the stitched field
    step = 0.055
    for sgn in (-1, 1):   # diagonal lines y = sgn * x + c, clipped to the field
        for k in range(-12, 13):
            c = k * step
            ends = []
            for x in (-hx, hx):
                y = sgn * x + c
                if -hy <= y <= hy:
                    ends.append((x, y))
            for y in (-hy, hy):
                x = (y - c) * sgn
                if -hx <= x <= hx:
                    ends.append((x, y))
            ends = sorted(set(ends))
            if len(ends) >= 2 and math.dist(ends[0], ends[-1]) > 0.02:
                b.bar((ends[0][0], ends[0][1], zt), (ends[-1][0], ends[-1][1], zt), 0.003, stitch, h=0.0012)

def build_furniturePad():
    """Furniture pad (owner: "Covered in fiberglass for some reason"): a folded blue moving blanket,
    quilted in diamonds, black bound edges."""
    b = Builder()
    b.M = Matrix.Rotation(math.radians(30), 4, "Z")
    moving_pad(b, 0.440, 0.300, 3, 0.022, "PadBlue", "PadNavy", "Nylon")
    b.M = Matrix.Identity(4)
    return b.finish("furniturePad")


def build_heavyDutyPad():
    """Heavy-duty pad (owner: "Not very padded"): the thick charcoal moving pad, quilted, orange bound
    edges."""
    b = Builder()
    b.M = Matrix.Rotation(math.radians(30), 4, "Z")
    moving_pad(b, 0.440, 0.300, 3, 0.032, "PadGrey", "Nylon", "PadOrange")
    b.M = Matrix.Identity(4)
    return b.finish("heavyDutyPad")


def build_rubberBedMat():
    """Rubber bed mat (owner, 2026-10-22: grips less than the bedliner): a black ribbed rubber mat,
    rolled, its end unrolled on the ground in front, a spiral on the roll's end."""
    b = Builder()
    W0 = b.M = Matrix.Rotation(math.radians(5), 4, "Z")   # the roll's end turned toward the eye
    L, R = 0.560, 0.085
    b.M = W0 @ Matrix.Translation((0, 0.040, R)) @ Matrix.Rotation(math.pi / 2, 4, "Y")
    b.lathe([(R, -L / 2), (R, L / 2)], 18, "Rubber")
    b.M = W0
    for sx in (-1, 1):   # the spiral on each end of the roll
        pts = [Vector((sx * (L / 2 + 0.0008), 0.040 + r * math.cos(a), R + r * math.sin(a))) for a, r in ((t * 0.4, 0.012 + 0.0115 * t * 0.4 / (2 * math.pi) * 2) for t in range(46))]
        for p0, p1 in zip(pts, pts[1:]):
            b.bar(p0, p1, 0.003, "RubberLight", h=0.0012, up=(1, 0, 0))
    b.cbox((0, -0.120, 0.003), (L, 0.240, 0.006), "Rubber")                  # the unrolled tongue
    for k in range(9):   # its ribs
        y = -0.225 + 0.024 * k
        b.cbox((0, y, 0.0075), (L - 0.020, 0.006, 0.004), "RubberLight", ch=0.001)
    b.M = Matrix.Identity(4)
    return b.finish("rubberBedMat")


BUILDERS = {
    "coffee": build_coffee, "chiliDog": build_chiliDog, "spareTire": build_spareTire,
    "emergencyGas": build_emergencyGas, "pack": build_pack, "rucksack": build_rucksack, "bedroll": build_bedroll,
    "airMattress": build_airMattress, "sleepingPad": build_sleepingPad, "deluxeSleepingPad": build_deluxeSleepingPad,
    "blanket": build_blanket, "sleepingBag": build_sleepingBag, "zipTies": build_zipTies, "ductTape": build_ductTape,
    "tirePlugKit": build_tirePlugKit, "stopLeak": build_stopLeak, "bubbleWrap": build_bubbleWrap,
    "tire": build_tire, "wheel": build_wheel, "springs": build_springs, "dampers": build_dampers, "pads": build_pads, "shoes": build_shoes, "arb": build_arb,
    "diff": build_diff, "lift": build_lift, "compressor": build_compressor, "bikePump": build_bikePump,
    "potato": build_potato, "jerryCan": build_jerryCan, "airFilter": build_airFilter, "headlight": build_headlight,
    "radiator": build_radiator, "engine": build_engine,
    "burger": build_burger, "packedLunch": build_packedLunch, "groceries": build_groceries, "bagOfPeanuts": build_bagOfPeanuts,
    "spicyChips": build_spicyChips, "candyBar": build_candyBar, "gummyWorms": build_gummyWorms, "energyDrink": build_energyDrink, "ice": build_ice,
    "cooler": build_cooler, "iceKing": build_iceKing, "quickJack": build_quickJack, "hiLiftJack": build_hiLiftJack, "shovel": build_shovel,
    "longHandledShovel": build_longHandledShovel, "gpsUnit": build_gpsUnit, "furniturePad": build_furniturePad, "heavyDutyPad": build_heavyDutyPad,
    "rubberBedMat": build_rubberBedMat,
}
BATCH2 = ["airMattress", "sleepingPad", "deluxeSleepingPad", "blanket", "sleepingBag",
          "zipTies", "ductTape", "tirePlugKit", "stopLeak", "bubbleWrap"]
PARTS = ["tire", "wheel", "springs", "dampers", "pads", "shoes", "arb", "diff", "lift", "engine", "radiator", "airFilter", "headlight"]
MARGIN = {"tirePlugKit": 1.03}   # a tighter crop where the item reads better close up


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
    """Aim the ortho camera along −VIEW_DIR and fit the object's silhouette (its vertices), centred."""
    rot = (-VIEW_DIR).to_track_quat("-Z", "Y")
    right, up = rot @ Vector((1, 0, 0)), rot @ Vector((0, 1, 0))
    corners = [ob.matrix_world @ v.co for v in ob.data.vertices]
    rs, us = [c.dot(right) for c in corners], [c.dot(up) for c in corners]
    centre = sum(corners, Vector()) / len(corners)
    off = right * ((max(rs) + min(rs)) / 2 - centre.dot(right)) + up * ((max(us) + min(us)) / 2 - centre.dot(up))
    cam.rotation_mode = "QUATERNION"; cam.rotation_quaternion = rot
    cam.location = centre + off + VIEW_DIR * 5.0
    cam.data.ortho_scale = max(max(rs) - min(rs), max(us) - min(us)) * margin
    cam.data.clip_end = 20


def run(item_id):
    sc, cam = fresh_scene()
    ob = BUILDERS[item_id]()
    frame(cam, ob, MARGIN.get(item_id, 1.12))
    os.makedirs(OUT_DIR, exist_ok=True)
    sc.render.filepath = os.path.join(OUT_DIR, f"{item_id}.png")
    bpy.ops.render.render(write_still=True)
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    print(f"{item_id}: {tris} tris -> {sc.render.filepath}")
    return ob


def run_all():
    for k in BUILDERS:
        run(k)
