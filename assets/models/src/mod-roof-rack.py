"""
FEAT-204 — ROOF RACK for the hero Ranger's cab roof: a plain steel utility basket (owner, 2026-11-13).
Generator.  Its ROLE IS UNSETTLED (FEAT-240, owner 2026-11-16: item storage versus long cargo), so this
is deliberately the generic form — a low tubular basket on four clamp feet — that suits either.

Run:  /Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 --python assets/models/src/mod-roof-rack.py
Out:  assets/models/mod-roof-rack.glb · src/mod-roof-rack.blend;  review renders -> wip/feat-204-common/renders/ (git-invisible)
Refs: wip/feat-204-refs/ (not committed: third-party photos) refs.md § Roof rack (a basket on a real 1998-2003 Ranger regular cab;
Yakima LoadWarrior, ARB steel basket, BajaRack standard basket).

FRAME: ranger.py's Blender frame (see mod_partlib.py).  ROUND 2 (DEC-340, owner: "make it fit to the
footprint of the cab roof"): the painted roof panel is 1.32 x 0.58 m (x +-0.658, y -0.428 .. +0.148,
mod_partlib.ROOF_*), so the basket is 1.15 x 0.56 m over its tubes and sits CENTRED on it: 15 mm inside
the cab's back edge, 5 mm inside the windscreen header, 85 mm in from each side.  Its upper rail's
front run (mod_partlib.RACK_RAIL_*) is where light-bar-rack's pod brackets clamp.
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))     # mod_partlib.py sits beside this file
import bpy
from mathutils import Vector
import mod_partlib as L

NAME = "roof-rack"

ROOF_Z, ROOF_EDGE_X = L.ROOF_Z, L.ROOF_EDGE_X
Y_FRONT, Y_REAR = L.RACK_Y_FRONT, L.RACK_Y_REAR
HX = L.RACK_HX
Z_LOW, Z_TOP = L.RACK_Z_LOW, L.RACK_Z_TOP
CORNER = L.RACK_CORNER
R_MAIN, R_BAR = L.RACK_R_MAIN, 0.0085   # 1 in frame tube, 3/4 in floor bars
LEG_Y = (-0.330, 0.040)       # foot stations, both on the flat deck
FOOT_X = 0.620
N_BARS = 11
N_SIDE_UP = 4
SIDES = 8

MATS = {
    "RackSteel":  ((0.020, 0.020, 0.021), 0.55),
    "RackClamp":  ((0.010, 0.010, 0.011), 0.40),   # DEC-341: "paint the roof clamp hardware black"
    "RackRubber": ((0.045, 0.045, 0.045), 0.90),
}


def rrect(hx, y0, y1, z, r, n=4, front_drop=0.0):
    """Rounded rectangle centre line, counter-clockwise from the rear-left.  front_drop lowers the
    front edge (the upper rail sweeps down into the wind fairing, as on the Yakima / BajaRack)."""
    pts = []
    corners = [((-hx + r, y0 + r), math.pi, 1.5 * math.pi), ((hx - r, y0 + r), 1.5 * math.pi, 2 * math.pi),
               ((hx - r, y1 - r), 0.0, 0.5 * math.pi), ((-hx + r, y1 - r), 0.5 * math.pi, math.pi)]
    for (cx, cy), a0, a1 in corners:
        for k in range(n + 1):
            a = a0 + (a1 - a0) * k / n
            x, y = cx + r * math.cos(a), cy + r * math.sin(a)
            pts.append((x, y, z - front_drop * max(0.0, (y - (y1 - 0.12)) / 0.12)))
    return pts


def clamp(m, s, y):
    """Foot: rubber pad on the deck, a cast block, and a black strap over the roof edge into the door gap."""
    xf = s * FOOT_X; zr = ROOF_Z(FOOT_X)
    m.boxm((xf - 0.035, y - 0.035, zr - 0.002), (xf + 0.035, y + 0.035, zr + 0.008), "RackRubber")
    m.boxm((xf - 0.028, y - 0.028, zr + 0.008), (xf + 0.028, y + 0.028, zr + 0.040), "RackSteel")
    xe = s * (ROOF_EDGE_X + 0.012)
    path = [(xf + s * 0.020, y, zr + 0.041), (s * (ROOF_EDGE_X - 0.004), y, ROOF_Z(ROOF_EDGE_X) + 0.004),
            (xe, y, ROOF_Z(ROOF_EDGE_X) - 0.020), (xe, y, 1.556), (s * (ROOF_EDGE_X - 0.010), y, 1.548)]   # short hook into the door gap
    m.sweep(path, "RackClamp", section=[(-0.003, -0.020), (0.003, -0.020), (0.003, 0.020), (-0.003, 0.020)])
    m.lathe([(0.0, 0.0), (0.010, 0.0), (0.010, 0.008), (0.0, 0.008)], (xf, y, zr + 0.040), (0, 0, 1), "RackClamp", segs=6)
    return Vector((xf, y, zr + 0.040))


def build():
    for n, (c, r) in MATS.items():
        L.material(n, c, r)
    m = L.Mesh(MATS)
    low = rrect(HX, Y_REAR, Y_FRONT, Z_LOW, CORNER)
    top = rrect(HX - 0.010, Y_REAR + 0.010, Y_FRONT - 0.010, Z_TOP, CORNER, front_drop=L.RACK_FRONT_DROP)
    m.sweep(low, "RackSteel", r=R_MAIN, sides=SIDES, closed=True)
    m.sweep(top, "RackSteel", r=R_MAIN, sides=SIDES, closed=True)
    # uprights between the loops: along both sides and across the rear (the front is the fairing)
    def up(x, y, ztop):
        m.tube((x, y, Z_LOW), (x, y, ztop), "RackSteel", r=R_BAR, sides=6)
    for k in range(N_SIDE_UP):
        y = Y_REAR + 0.070 + k * (Y_FRONT - Y_REAR - 0.24) / (N_SIDE_UP - 1)
        for s in (-1, 1):
            up(s * (HX - 0.005), y, Z_TOP)
    for k in range(5):
        up(-HX + 0.20 + k * (2 * HX - 0.40) / 4, Y_REAR + 0.005, Z_TOP)
    # wind fairing: a sheet between the loops across the front, leaning forward
    zf0, zf1 = Z_LOW + 0.004, Z_TOP - L.RACK_FRONT_DROP + 0.004
    m.extrude([(Y_FRONT - 0.004, zf0), (Y_FRONT + 0.002, zf0), (Y_FRONT - 0.006, zf1), (Y_FRONT - 0.012, zf1)],
              "x", -HX + CORNER, HX - CORNER, "RackSteel")
    # floor: longitudinal bars into the front and rear runs of the lower loop, on two cross-members
    for k in range(N_BARS):
        x = -HX + 0.08 + k * (2 * HX - 0.16) / (N_BARS - 1)
        m.tube((x, Y_REAR + 0.004, Z_LOW), (x, Y_FRONT - 0.004, Z_LOW), "RackSteel", r=R_BAR, sides=6)
    zc = Z_LOW - R_MAIN - 0.010
    sq = [(-0.011, -0.011), (0.011, -0.011), (0.011, 0.011), (-0.011, 0.011)]
    for y in LEG_Y:
        m.tube((-FOOT_X + 0.010, y, zc), (FOOT_X - 0.010, y, zc), "RackSteel", section=sq)
        # saddle brackets tying each cross-member up to the side runs of the lower loop
        for s in (-1, 1):
            m.boxm((s * HX - 0.012, y - 0.016, zc), (s * HX + 0.012, y + 0.016, Z_LOW), "RackSteel")
    # legs: each foot block up into the end of its cross-member
    tops = []
    for y in LEG_Y:
        for s in (-1, 1):
            f = clamp(m, s, y)
            m.tube(f + Vector((0, 0, -0.004)), Vector((s * (FOOT_X - 0.020), y, zc + 0.008)), "RackSteel", section=sq)
            tops.append(f)
    return m.finish("RoofRack"), tops


def main():
    L.reset()
    ob, feet = build()
    bpy.context.view_layer.update()
    n = L.tris(ob); d = ob.dimensions
    print(f"{NAME}: {n} tris, size {d.x:.3f} x {d.y:.3f} x {d.z:.3f} m (x,y,z), mats {[s.material.name for s in ob.material_slots]}")
    bad = L.check_normals(ob)
    for y in LEG_Y:
        L.mount_print(f"feet at y {y:+.3f} (each side)", (FOOT_X, y, ROOF_Z(FOOT_X)))
    print(f"  basket floor z {Z_LOW:.3f}, rail top z {Z_TOP + R_MAIN:.3f}; load area {2 * HX:.2f} x {Y_FRONT - Y_REAR:.2f} m")
    bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    print(f"  footprint x {min(p.x for p in bb):+.3f}..{max(p.x for p in bb):+.3f}  y {min(p.y for p in bb):+.3f}..{max(p.y for p in bb):+.3f}"
          f"  vs roof panel y {L.ROOF_Y_REAR:+.3f}..{L.ROOF_Y_FRONT:+.3f} (clamp straps reach x +-{ROOF_EDGE_X + 0.015:.3f}, over the edge)")
    L.export_glb([ob], f"{L.MODELS}/mod-{NAME}.glb")
    bpy.ops.wm.save_as_mainfile(filepath=f"{L.SRC}/mod-{NAME}.blend")
    os.makedirs(L.RENDERS, exist_ok=True)
    L.render_views([ob], f"{L.RENDERS}/r3-{NAME}", L.PART_VIEWS)
    truck = L.import_ranger()
    L.render_views([o for o in truck if o.type == "MESH"], f"{L.RENDERS}/r3-{NAME}-ontruck",
                   {"threeq": ((0.85, -0.70, 0.75), 1.25, (0.0, -0.2, 1.35)), "side": ((1.0, 0.0, 0.12), 1.6, (0.0, -0.1, 1.4)),
                    "top": ((0.0, -0.05, 1.0), 1.5, (0.0, -0.15, 1.5))}, truck=True)
    if bad:
        raise SystemExit("inverted faces")


main()
