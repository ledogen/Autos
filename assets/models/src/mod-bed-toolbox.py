"""
FEAT-204 — BED TOOLBOX for the hero Ranger: a 60 in low-profile aluminium CROSSOVER (saddle) box
across the bed right behind the cab (owner, 2026-11-13).  Generator.

Run:  /Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 --python assets/models/src/mod-bed-toolbox.py
Out:  assets/models/mod-bed-toolbox.glb · src/mod-bed-toolbox.blend;  review renders -> wip/feat-204-common/renders/ (git-invisible)
Refs: wip/feat-204-refs/ (not committed: third-party photos) refs.md § Bed toolbox (UWS 58-63 in low-profile crossovers listed for 1998-2011
Rangers, with the UWS dimension drawing; Lund; latch / mount close-ups).

SIZES are the UWS drawing's, which is a box sold for this truck: 59.875 in over the lid, 46 in
across the body's foot, 14.75 in tall of which 11.75 in hangs below the rail flange, 20 in front to
back over the lid and 17 in at the body.  They land on ranger.glb (a ray probe) as: rails z 1.141 over
x 0.70-0.78, bed inner wall x 0.700, bed front wall inner face y -0.633, floor pan z 0.704 (rib
crests 0.728), rear wheelhouses from y -1.1675.  So the lid flange sits ON the rails (rubber pads
between), the body hangs inside the bed clear of the walls, and its foot is 0.115 m above the rib
crests.  The box takes bed floor from y -0.633 to -1.12: cargo placement must start behind that.

DIAMOND PLATE is geometry (ART-STYLE rule 2): raised 4-tri studs, alternating ±45°, on the lid and
the rear face.  Flat shading turns each one into a light/dark fleck, which is the look of tread
plate without a texture.  Hinge at the cab side, two paddle latches on the rear face.
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))     # mod_partlib.py sits beside this file
import bpy
from mathutils import Vector
import mod_partlib as L

NAME = "bed-toolbox"
IN = 0.0254

RAIL_Z = 1.141
LID_HX = 59.875 * IN / 2          # 0.760
BODY_HX = 46.0 * IN / 2           # 0.584
Y_FRONT = -0.612                  # lid front edge, over the bed front wall's top
LID_D = 20.0 * IN                 # 0.508
BODY_D = 17.0 * IN                # 0.432
Y_BODY_F = -0.640                 # body front face: 7 mm off the bed front wall
PAD = 0.006                       # rubber rail pads
Z_SHOULDER = RAIL_Z + PAD         # underside of the over-rail shoulder
Z_LIDSEAT = RAIL_Z + 0.052        # top of the shoulder band, lid sits on it
LID_T = 0.024
SKIRT = 0.034
Z_FOOT = RAIL_Z - 11.75 * IN      # 0.843
CHAMFER = 0.045                   # foot chamfer on the rear (tailgate-side) lower edge
DIAMOND_PITCH = 0.055
DIAMOND_A, DIAMOND_B, DIAMOND_H = 0.019, 0.0065, 0.0028

MATS = {
    "ToolboxAluminium": ((0.50, 0.52, 0.54), 0.35),
    "ToolboxLatch":     ((0.74, 0.75, 0.76), 0.18),
    "ToolboxRubber":    ((0.018, 0.018, 0.018), 0.9),
}


def build():
    for nme, (c, r) in MATS.items():
        L.material(nme, c, r)
    m = L.Mesh(MATS)
    y_back = Y_FRONT - LID_D
    y_body_r = Y_BODY_F - BODY_D
    # lower body, its rear foot edge chamfered (section in y-z, extruded across x)
    m.extrude([(Y_BODY_F, Z_FOOT), (y_body_r + CHAMFER, Z_FOOT), (y_body_r, Z_FOOT + CHAMFER),
               (y_body_r, Z_SHOULDER + 0.001), (Y_BODY_F, Z_SHOULDER + 0.001)], "x", -BODY_HX, BODY_HX, "ToolboxAluminium")
    # over-rail shoulder band, full width, a little inside the lid outline
    sh_f, sh_r = Y_FRONT - 0.010, y_back + 0.012
    m.boxm((-LID_HX + 0.008, sh_r, Z_SHOULDER), (LID_HX - 0.008, sh_f, Z_LIDSEAT), "ToolboxAluminium")
    # the bent end flange of each shoulder: a lip turned down outboard of the rail's inner edge
    for s in (-1, 1):
        x0, x1 = sorted((s * (LID_HX - 0.008), s * (LID_HX - 0.014)))
        m.boxm((x0, sh_r, Z_SHOULDER - 0.018), (x1, sh_f, Z_SHOULDER), "ToolboxAluminium")
        # rubber pads on the rail
        xa, xb = sorted((s * 0.712, s * 0.752))
        m.boxm((xa, sh_r + 0.02, RAIL_Z - 0.0005), (xb, sh_f - 0.02, Z_SHOULDER + 0.0005), "ToolboxRubber")
    # lid: a slab with a skirt down the rear and both ends, and a raised centre panel (the stiffening crown)
    zl0, zl1 = Z_LIDSEAT, Z_LIDSEAT + LID_T
    m.boxm((-LID_HX, y_back, zl0), (LID_HX, Y_FRONT, zl1), "ToolboxAluminium")
    m.boxm((-LID_HX, y_back, zl0 - SKIRT), (LID_HX, y_back + 0.004, zl0 + 0.002), "ToolboxAluminium")      # rear skirt
    for s in (-1, 1):
        x0, x1 = sorted((s * LID_HX, s * (LID_HX - 0.004)))
        m.boxm((x0, y_back, zl0 - SKIRT), (x1, Y_FRONT, zl0 + 0.002), "ToolboxAluminium")                # end skirts
    crown_hx, crown_y0, crown_y1 = LID_HX - 0.17, y_back + 0.06, Y_FRONT - 0.05
    m.extrude([(crown_y0, zl1 - 0.001), (crown_y1, zl1 - 0.001), (crown_y1 - 0.02, zl1 + 0.012), (crown_y0 + 0.02, zl1 + 0.012)],
              "x", -crown_hx, crown_hx, "ToolboxAluminium")
    # piano hinge along the cab-side top edge
    m.lathe([(0.0, 0.0), (0.0065, 0.0), (0.0065, 2 * (LID_HX - 0.03)), (0.0, 2 * (LID_HX - 0.03))],
            (-(LID_HX - 0.03), Y_FRONT + 0.002, zl0 + 0.004), (1, 0, 0), "ToolboxLatch", segs=6)
    # foam gasket line visible under the lid edge
    m.boxm((-LID_HX + 0.010, y_back + 0.004, zl0 - 0.004), (LID_HX - 0.010, y_back + 0.012, zl0), "ToolboxRubber")
    # two paddle latches in the rear face, just under the shoulder: housing, paddle, lock cylinder
    for s in (-1, 1):
        xc = s * 0.400; zc = Z_SHOULDER - 0.060; yf = y_body_r
        m.boxm((xc - 0.060, yf - 0.010, zc - 0.040), (xc + 0.060, yf + 0.002, zc + 0.040), "ToolboxLatch")    # housing flange
        m.boxm((xc - 0.045, yf - 0.014, zc - 0.012), (xc + 0.030, yf - 0.009, zc + 0.026), "ToolboxLatch")    # paddle
        m.boxm((xc - 0.050, yf - 0.012, zc - 0.034), (xc + 0.050, yf - 0.009, zc - 0.022), "ToolboxRubber")   # pocket shadow
        m.lathe([(0.0, 0.0), (0.011, 0.0), (0.011, 0.010), (0.0, 0.010)], (xc + 0.045, yf - 0.009, zc + 0.006),
                (0, -1, 0), "ToolboxLatch", segs=8)
    # tread plate: lid top (outside the crown's footprint too — the crown carries its own field)
    nu = int(2 * LID_HX / DIAMOND_PITCH); nv = int(LID_D / DIAMOND_PITCH)
    ox = -nu * DIAMOND_PITCH / 2; oy = y_back + (LID_D - nv * DIAMOND_PITCH) / 2
    for i in range(nu):
        for j in range(nv):
            cx = ox + (i + 0.5) * DIAMOND_PITCH; cy = oy + (j + 0.5) * DIAMOND_PITCH
            on_crown = abs(cx) < crown_hx - 0.03 and crown_y0 + 0.03 < cy < crown_y1 - 0.03
            z = zl1 + (0.012 if on_crown else 0.0)
            if not on_crown and (abs(cx) < crown_hx + 0.01 and crown_y0 - 0.01 < cy < crown_y1 + 0.01):
                continue                                   # the crown's sloped sides stay bare
            axis = Vector((1, 1, 0)) if (i + j) % 2 == 0 else Vector((1, -1, 0))
            m.stud((cx, cy, z), (0, 0, 1), axis, DIAMOND_A, DIAMOND_B, DIAMOND_H, "ToolboxAluminium")
    # tread plate: the whole rear face of the body above the chamfer, leaving the latch housings bare
    nu2 = int(2 * BODY_HX / DIAMOND_PITCH); nz = int((Z_SHOULDER - 0.008 - (Z_FOOT + CHAMFER)) / DIAMOND_PITCH)
    ox2 = -nu2 * DIAMOND_PITCH / 2; oz2 = Z_FOOT + CHAMFER + 0.004
    for i in range(nu2):
        for j in range(nz):
            cx = ox2 + (i + 0.5) * DIAMOND_PITCH; cz = oz2 + (j + 0.5) * DIAMOND_PITCH
            if abs(abs(cx) - 0.400) < 0.060 + 0.025 and abs(cz - (Z_SHOULDER - 0.060)) < 0.040 + 0.025:
                continue
            axis = Vector((1, 0, 1)) if (i + j) % 2 == 0 else Vector((1, 0, -1))
            m.stud((cx, y_body_r, cz), (0, -1, 0), axis, DIAMOND_A, DIAMOND_B, DIAMOND_H, "ToolboxAluminium")
    return m.finish("BedToolbox")


def main():
    L.reset()
    ob = build()
    bpy.context.view_layer.update()
    n = L.tris(ob); d = ob.dimensions
    print(f"{NAME}: {n} tris, size {d.x:.3f} x {d.y:.3f} x {d.z:.3f} m (x,y,z), mats {[s.material.name for s in ob.material_slots]}")
    bad = L.check_normals(ob)
    L.mount_print("rail pads (each side)", (0.732, (Y_FRONT + Y_FRONT - LID_D) / 2, RAIL_Z))
    print(f"  bed floor taken: y {Y_FRONT:.3f} .. {Y_FRONT - LID_D:.3f}; body foot z {Z_FOOT:.3f} (rib crests 0.728)")
    L.export_glb([ob], f"{L.MODELS}/mod-{NAME}.glb")
    bpy.ops.wm.save_as_mainfile(filepath=f"{L.SRC}/mod-{NAME}.blend")
    os.makedirs(L.RENDERS, exist_ok=True)
    L.render_views([ob], f"{L.RENDERS}/r3-{NAME}", {"rear": ((0.0, -1.0, 0.15), 1.0), "side": ((1.0, 0.0, 0.10), 1.0),
                                                  "threeq": ((0.70, -0.80, 0.60), 1.0),
                                                  "closeup": ((0.45, -1.0, 0.45), 3.0, (0.40, -1.05, 1.12))})
    truck = L.import_ranger()
    L.render_views([o for o in truck if o.type == "MESH"], f"{L.RENDERS}/r3-{NAME}-ontruck",
                   {"threeq": ((0.80, -0.85, 0.75), 1.35, (0.0, -0.9, 1.0))}, truck=True)
    if bad:
        raise SystemExit("inverted faces")


main()
