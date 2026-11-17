"""
FEAT-204 — BULL BAR for the hero Ranger's front bumper, ROUND 2 (DEC-340, owner: "the bent tubular
kind so it goes up at an angle. one continuous tube with one welded in crossbar").  Generator.

Run:  /Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 --python assets/models/src/mod-bull-bar.py
Out:  assets/models/mod-bull-bar.glb (the plain bar, DEC-341: the skid-plate variant was dropped; its round-2
      generator stays in wip/bull-bar/) · src/mod-bull-bar.blend;  review renders -> wip/feat-204-common/renders/ (git-invisible)
Refs: the owner's two photos wip/feat-204-refs/ (not committed: third-party photos) owner-bullbar-1.png (blue Ranger, no plate, LED strip
on the crossbar) and owner-bullbar-2.png (2010 Ranger, stainless skid plate under the crossbar).

THE PART: ONE continuous 68 mm black tube.  Each end starts at a mount under the bumper, runs
forward under the bumper's lower lip, bends up round the lip and rises LEANING FORWARD (10 deg) past
the bumper face, then turns across the front of the grille through two generous corners: a single
hoop whose top sits at the grille opening's bottom edge (tube top = headlamp centre height).  One
straight 60 mm crossbar is welded in between the legs at bumper height.  Mount plates run from the
tube's level run back under the bumper into the frame horns (they enter the body: nothing floats).

FRAME: ranger.py's Blender frame (see mod_partlib.py).  Measured on ranger.glb (a ray probe, round 2): chrome
bumper blade z 0.49-0.69, face y 2.052 at x 0 -> 2.023 at x 0.40, underside z 0.486 back to y 1.935;
painted valance z 0.70-0.78 at y 1.96; grille opening z 0.79-0.94 (x +-0.38), its bars y 1.955;
headlamp lenses x 0.40-0.67, z 0.798-0.934 (centre 0.866); chin z 0.38-0.48 at y 1.88-1.93.
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))     # mod_partlib.py sits beside this file
import bpy, bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import mod_partlib as L


TUBE_R = 0.034            # 68 mm hoop tube
CROSS_R = 0.030           # 60 mm crossbar
XL = 0.400                # leg centre lines: the hoop spans the grille opening
Z_TOP, Y_TOP = 0.830, 2.130   # hoop top centre line: tube top 0.864 = headlamp centre, bottom 0.796 = grille edge
LEAN = math.radians(10.0)     # legs lean forward going up
Z_RUN = 0.425             # level run under the bumper lip (tube top 0.459, lip 0.486)
Y_MOUNT = 1.940           # tube ends here, on the mount plates
R_LOW, R_TOP = 0.070, 0.130   # bend radii: round the bumper lip, the hoop's top corners
CROSS_Z = 0.620           # crossbar at bumper height
SIDES = 12

MATS = {
    "BullBarSteel": ((0.018, 0.018, 0.019), 0.5),
}


def y_leg(z):
    return Y_TOP - (Z_TOP - z) * math.tan(LEAN)


def hoop_path():
    """One continuous centre line: left mount -> level run -> lip bend -> leaning leg -> corner ->
    across -> corner -> leg -> lip bend -> level run -> right mount."""
    ctrl = [(-XL, Y_MOUNT, Z_RUN), (-XL, y_leg(Z_RUN), Z_RUN), (-XL, Y_TOP, Z_TOP),
            (XL, Y_TOP, Z_TOP), (XL, y_leg(Z_RUN), Z_RUN), (XL, Y_MOUNT, Z_RUN)]
    return L.fillet(ctrl, [R_LOW, R_TOP, R_TOP, R_LOW], n=9)


def build():
    for n, (c, r) in MATS.items():
        L.material(n, c, r)
    m = L.Mesh(MATS)
    m.sweep(hoop_path(), "BullBarSteel", r=TUBE_R, sides=SIDES)
    # the welded-in crossbar: ends buried in the legs, a weld bead ring at each joint
    yc = y_leg(CROSS_Z)
    m.tube((-XL, yc, CROSS_Z), (XL, yc, CROSS_Z), "BullBarSteel", r=CROSS_R, sides=SIDES)
    for s in (-1, 1):
        xb = s * (XL - TUBE_R + 0.001)
        m.lathe([(CROSS_R - 0.001, 0.0), (CROSS_R + 0.005, 0.0), (CROSS_R - 0.001, 0.008)],
                (xb, yc, CROSS_Z), (-s, 0, 0), "BullBarSteel", segs=SIDES, loop=True)
    # mount plates: on each level run's inboard face, back under the bumper and up into the frame horn
    for s in (-1, 1):
        prof = [(Y_MOUNT + 0.055, Z_RUN - 0.028), (Y_MOUNT + 0.055, Z_RUN + 0.026), (1.900, 0.474),
                (1.880, 0.540), (1.790, 0.540), (1.790, 0.405), (1.880, 0.396)]
        xa = s * (XL - TUBE_R + 0.002)
        m.extrude(prof, "x", min(xa, xa - s * 0.010), max(xa, xa - s * 0.010), "BullBarSteel")
        # end cap plate on the tube end, two through-bolts per plate
        m.obox((s * XL, Y_MOUNT - 0.003, Z_RUN), (1, 0, 0), (0, 1, 0), (0, 0, 1), TUBE_R + 0.004, 0.003, TUBE_R + 0.004, "BullBarSteel")
        for (yb, zb) in ((Y_MOUNT + 0.025, Z_RUN), (1.830, 0.470)):
            m.lathe([(0.0, 0.0), (0.012, 0.0), (0.012, 0.008), (0.0, 0.008)],
                    (s * (XL - TUBE_R - 0.007), yb, zb), (-s, 0, 0), "BullBarSteel", segs=6)
    return m.finish("BullBar")


def tree(ob):
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.transform(ob.matrix_world); t = BVHTree.FromBMesh(bm)
    bm.faces.ensure_lookup_table(); cen = [f.calc_center_median() for f in bm.faces]; bm.free()
    return t, cen


def main():
    L.reset()
    ob = build(); bpy.context.view_layer.update()
    n = L.tris(ob); d = ob.dimensions
    print(f"{ob.name}: {n} tris, size {d.x:.3f} x {d.y:.3f} x {d.z:.3f} m (x,y,z), mats {[s.material.name for s in ob.material_slots]}")
    if L.check_normals(ob):
        raise SystemExit("inverted faces")
    L.mount_print("frame-horn plates (each side)", (XL - TUBE_R, 1.83, 0.47))
    print(f"  hoop top z {Z_TOP + TUBE_R:.3f} (headlamp centre 0.866), y {Y_TOP:.3f}; crossbar z {CROSS_Z:.3f} y {y_leg(CROSS_Z):.3f}")
    L.export_glb([ob], f"{L.MODELS}/mod-bull-bar.glb")
    bpy.ops.wm.save_as_mainfile(filepath=f"{L.SRC}/mod-bull-bar.blend")
    os.makedirs(L.RENDERS, exist_ok=True)
    L.render_views([ob], f"{L.RENDERS}/r3-bull-bar", L.PART_VIEWS)
    truck = L.import_ranger()
    body = next(o for o in truck if o.name == "Ranger")
    bt, _ = tree(body)
    t, cen = tree(ob)
    hits = [cen[a] for a, b in t.overlap(bt)]
    tube_hits = [c for c in hits if c.y > 1.94 + 0.01]
    print(f"  {ob.name} x truck body: {len(hits)} face pairs, {len(tube_hits)} ahead of the mount plates (must be 0)")
    L.render_views([o for o in truck if o.type == "MESH"], f"{L.RENDERS}/r3-bull-bar-ontruck",
                   {"threeq": ((0.85, 0.9, 0.30), 1.6, (0.0, 1.75, 0.70)), "side": ((1.0, 0.0, 0.05), 2.2, (0.0, 1.85, 0.6)),
                    "front": ((0.0, 1.0, 0.10), 1.7, (0.0, 2.0, 0.70))}, truck=True)


main()
