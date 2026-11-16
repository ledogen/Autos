"""
FEAT-204 — roof LIGHT PODS, rounds 2-3 (DEC-340, DEC-341): TWO models from one generator, sharing the
pod geometry and the material names (the runtime hooks below):
  mod-light-bar-solo.glb  no rack owned: the pods on their own bridge member (the round-1 channel bar,
                          feet + gutterless clamps on the roof deck), just behind the windscreen header.
  mod-light-bar-rack.glb  rack owned too: the pods hung IN FRONT of the roof rack's upper front rail
                          (mod_partlib.RACK_RAIL_*) on welded L-brackets, lamp centres at rail height.
The game picks -rack when both mods are owned, -solo when only the lights are.

Round 1 below was the solo bar — for the hero Ranger: four round incandescent reflector lamps on a
low-profile roof bar (owner, 2026-11-13: "older style 4 reflector incandescent").  Generator.

Run:  /Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 --python assets/models/src/mod-light-bar.py
Out:  assets/models/mod-light-bar-solo.glb · mod-light-bar-rack.glb · src/mod-light-bar.blend (both);  review renders -> wip/feat-204-common/renders/ (git-invisible)
Refs: wip/feat-204-refs/ (not committed: third-party photos) refs.md § Light bar (6 photos: four real 1998-2003 Rangers + the Carr bar).

FRAME: ranger.py's Blender frame (see mod_partlib.py).  The bar sits across the cab roof's flat deck
just behind the windscreen header (the deck runs y -0.45 .. +0.15 at z 1.60-1.62 on ranger.glb),
lamps facing +Y (= glTF -Z, forward).  Feet stand at x = ±FOOT_X; black gutterless clamps (DEC-341) hook
over the roof edge (x 0.676) into the door opening, the way the Carr kit does on a gutterless cab.

RUNTIME HOOKS (material names are the API): LightBarReflector is what glows when the lamps are on
(set its emissive), LightBarGlass is the one clear material (BLEND, single-sided: a closed lens).
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))     # mod_partlib.py sits beside this file
import bpy
from mathutils import Vector
import mod_partlib as L

NAME = "light-bar"          # outputs light-bar-solo / light-bar-rack

# --- ranger.glb roof, measured by a ray probe (round 1) ---
ROOF_Z, ROOF_EDGE_X = L.ROOF_Z, L.ROOF_EDGE_X

# --- parameters ---
BAR_Y = 0.125            # bar centre line (deck front edge is +0.15)
BAR_W, BAR_H = 0.050, 0.028   # rectangular channel section (y, z)
BAR_Z0 = 1.668           # channel underside
FOOT_X = 0.600           # foot centre
POD_X = (-0.405, -0.135, 0.135, 0.405)   # clustered mid-roof, ~0.10 m gaps, as on the 1998-2001 refs
POD_R = 0.082            # can radius: a 6.5 in lamp
POD_Y = 0.105            # can rear
POD_ZC = BAR_Z0 + BAR_H + 0.030 + POD_R          # lamp axis height (stud 30 mm)
SEG = 14

MATS = {
    "LightBarSteel":     ((0.016, 0.016, 0.017), 0.55, 1.0),
    "LightBarChrome":    ((0.52, 0.53, 0.55), 0.22, 1.0),
    "LightBarReflector": ((0.86, 0.83, 0.74), 0.18, 1.0),
    "LightBarGlass":     ((0.40, 0.42, 0.44), 0.08, 0.16),
}


def pod(m, x, POD_Y=POD_Y, POD_ZC=POD_ZC, zb=BAR_Z0 + BAR_H, pig=None):
    """One lamp: can, bezel, reflector, bulb, lens, stud on the mount face at height zb, and a pigtail:
    the path `pig`, or by default from the can's underside back into the solo channel's rear face."""
    o = Vector((x, POD_Y, POD_ZC)); ax = (0, 1, 0)
    # can: domed back, straight barrel to the bezel seat
    # (the profile turns back in at the mouth and closes on the axis BEHIND the reflector, so no
    #  front cap hides the bowl — a flat cap here read as a black disc through the lens)
    m.lathe([(0.0, -0.004), (0.052, 0.004), (0.076, 0.030), (POD_R, 0.062), (POD_R, 0.086),
             (0.074, 0.086), (0.060, 0.050), (0.0, 0.030)], o, ax, "LightBarSteel", segs=SEG)
    # chrome bezel: a closed ring section proud of the can's mouth
    m.lathe([(0.073, 0.084), (0.087, 0.084), (0.086, 0.100), (0.073, 0.098)],
            o, ax, "LightBarChrome", segs=SEG, loop=True)
    # reflector bowl (wall thickness 3 mm), hole for the bulb
    m.lathe([(0.016, 0.040), (0.050, 0.058), (0.074, 0.088),
             (0.077, 0.088), (0.052, 0.055), (0.016, 0.037)],
            o, ax, "LightBarReflector", segs=10, loop=True)
    # bulb: a short capsule on the axis
    m.lathe([(0.0, 0.036), (0.011, 0.044), (0.010, 0.064), (0.0, 0.072)],
            o, ax, "LightBarReflector", segs=6)
    # lens: shallow faceted dome, closed by a flat back inside the bezel
    m.lathe([(0.075, 0.090), (0.068, 0.100), (0.040, 0.108), (0.0, 0.111)],
            o, ax, "LightBarGlass", segs=SEG)
    # mounting stud + hex nut + aim boss between the can and the mount face
    yc = POD_Y + 0.040
    m.lathe([(0.0, 0.0), (0.020, 0.0), (0.020, 0.010), (0.011, 0.010), (0.011, 0.034), (0.0, 0.034)],
            (x, yc, zb), (0, 0, 1), "LightBarSteel", segs=6)   # round 3: black, a chrome boss read as a white puck
    m.lathe([(0.0, 0.026), (0.026, 0.026), (0.022, 0.040), (0.0, 0.040)],
            (x, yc, zb), (0, 0, 1), "LightBarSteel", segs=10)
    # pigtail
    if pig is None:
        pig = [(x + 0.02, POD_Y + 0.010, POD_ZC - 0.070), (x + 0.03, POD_Y - 0.010, zb + 0.006),
               (x + 0.04, BAR_Y - BAR_W / 2 - 0.006, BAR_Z0 + BAR_H * 0.5)]
    m.sweep(pig, "LightBarSteel", r=0.0045, sides=5)


def foot(m, s):
    """Cast foot: a wedge from the roof up to the channel, rubber pad under it, clamp over the edge."""
    x0 = s * (FOOT_X - 0.050); x1 = s * (FOOT_X + 0.055)
    y0, y1 = BAR_Y - 0.045, BAR_Y + 0.045
    zr0, zr1 = ROOF_Z(abs(x0)), ROOF_Z(abs(x1))
    zt = BAR_Z0 + BAR_H
    # pad (8 mm) following the crown
    for (ya, yb) in [(y0, y1)]:
        m.extrude([(x0, zr0 - 0.001), (x1, zr1 - 0.001), (x1, zr1 + 0.008), (x0, zr0 + 0.008)], "y", ya, yb, "LightBarSteel")
    # wedge body: front view is a trapezoid rising inboard to the channel
    xin = s * (FOOT_X - 0.080)
    prof = [(x0, zr0 + 0.008), (x1, zr1 + 0.008), (x1, zr1 + 0.030), (s * (FOOT_X + 0.020), zt), (xin, zt)]
    if s < 0:
        prof = list(reversed(prof))
    m.extrude(prof, "y", y0 + 0.008, y1 - 0.008, "LightBarSteel")
    # gutterless clamp: black-painted strap (DEC-341: "paint the roof clamp hardware black") from the foot top, over the roof edge, hooking into the door gap
    xe = s * (ROOF_EDGE_X + 0.012)
    path = [(s * (FOOT_X + 0.030), BAR_Y, zr1 + 0.031), (s * (ROOF_EDGE_X - 0.004), BAR_Y, ROOF_Z(ROOF_EDGE_X) + 0.004),
            (xe, BAR_Y, ROOF_Z(ROOF_EDGE_X) - 0.020), (xe, BAR_Y, 1.556), (s * (ROOF_EDGE_X - 0.010), BAR_Y, 1.548)]   # short hook into the door gap
    m.sweep(path, "LightBarSteel", section=[(-0.003, -0.022), (0.003, -0.022), (0.003, 0.022), (-0.003, 0.022)])
    # two bolt heads on the foot's top face
    for dy in (-0.022, 0.022):
        m.lathe([(0.0, 0.0), (0.011, 0.0), (0.011, 0.007), (0.0, 0.007)], (s * (FOOT_X - 0.035), BAR_Y + dy, zt - 0.001),
                (0, 0, 1), "LightBarSteel", segs=6)


def mats():
    for n, (c, r, a) in MATS.items():
        L.material(n, c, r, a, double=False if a < 1 else None)


def build_solo():
    mats()
    m = L.Mesh(MATS)
    # channel: closed rectangular tube, end caps square, from foot to foot
    xa = FOOT_X + 0.020
    m.extrude([(BAR_Y - BAR_W / 2, BAR_Z0), (BAR_Y + BAR_W / 2, BAR_Z0), (BAR_Y + BAR_W / 2, BAR_Z0 + BAR_H),
               (BAR_Y - BAR_W / 2, BAR_Z0 + BAR_H)], "x", -xa, xa, "LightBarSteel")
    # a lip along the channel's top front edge (reads as the bent flange of the Carr channel)
    m.extrude([(BAR_Y + BAR_W / 2 - 0.004, BAR_Z0 + BAR_H - 0.002), (BAR_Y + BAR_W / 2 + 0.004, BAR_Z0 + BAR_H - 0.002),
               (BAR_Y + BAR_W / 2 + 0.004, BAR_Z0 + BAR_H + 0.006), (BAR_Y + BAR_W / 2 - 0.004, BAR_Z0 + BAR_H + 0.006)],
              "x", -xa + 0.01, xa - 0.01, "LightBarSteel")
    for s in (-1, 1):
        foot(m, s)
    for x in POD_X:
        pod(m, x)
    # loom: along the channel's back face to the driver's (-X) foot, over the clamp, into the door gap
    yb = BAR_Y - BAR_W / 2 - 0.007
    zl = BAR_Z0 + BAR_H * 0.5
    xe = -(ROOF_EDGE_X + 0.020)
    m.sweep([(POD_X[-1] + 0.04, yb, zl), (-FOOT_X + 0.06, yb, zl), (-FOOT_X - 0.01, yb - 0.012, ROOF_Z(FOOT_X) + 0.040),
             (-(ROOF_EDGE_X - 0.002), yb - 0.015, ROOF_Z(ROOF_EDGE_X) + 0.010), (xe, yb - 0.015, ROOF_Z(ROOF_EDGE_X) - 0.025),
             (xe, yb - 0.015, 1.552), (-(ROOF_EDGE_X - 0.012), yb - 0.015, 1.545)], "LightBarSteel", r=0.0065, sides=6)
    return m.finish("LightBarSolo")


# --- rack mount, ROUND 3 (DEC-341, owner: pods "in front would be better" than on top of the rail) ---
# Each pod hangs IN FRONT of the rack's upper front rail on a welded L-bracket: a short weld block off
# the rail's front face, an upright flat bar that also rests on the lower loop's front, and a level
# plate forward under the lamp.  The lamp's stud stands on that plate, so the lamp centre sits at about
# the rail's height (12 mm above it) and the can top is level with the basket's top rail.
RAIL_Y, RAIL_Z, RAIL_R = L.RACK_RAIL_Y, L.RACK_RAIL_Z, L.RACK_R_MAIN
LOW_FRONT_Y = L.RACK_Y_FRONT + L.RACK_R_MAIN          # front face of the lower loop's front run
BR_HW, BR_T = 0.022, 0.006                           # bracket half width (x), plate thickness
BR_Y0 = LOW_FRONT_Y + 0.0003                         # upright's back face: on the lower loop
PL_Z = 1.640                                         # plate top (roof 1.608-1.616 under its back end)
RACK_POD_Y = BR_Y0 + BR_T + 0.014                    # can's back pole 10 mm ahead of the upright
RACK_POD_ZC = PL_Z + 0.030 + POD_R
PL_Y1 = RACK_POD_Y + 0.040 + 0.028                   # plate runs 28 mm past the stud
LOOM_Y, LOOM_Z = RAIL_Y - 0.008, RAIL_Z + 0.019      # loom rides on the rail's top-rear


def bracket(m, x):
    # weld block: its back face 0.3 mm off the rail's front (reads as welded, keeps the co-fit check at 0)
    m.boxm((x - 0.015, RAIL_Y + RAIL_R + 0.0003, RAIL_Z - 0.007), (x + 0.015, BR_Y0 + 0.0002, RAIL_Z + 0.007), "LightBarSteel")
    m.boxm((x - BR_HW, BR_Y0, PL_Z - BR_T), (x + BR_HW, BR_Y0 + BR_T, RAIL_Z + 0.016), "LightBarSteel")
    m.boxm((x - BR_HW, BR_Y0, PL_Z - BR_T), (x + BR_HW, PL_Y1, PL_Z), "LightBarSteel")


def build_rack():
    mats()
    m = L.Mesh(MATS)
    for x in POD_X:
        bracket(m, x)
        # pigtail: out of the can's back beside the upright, over the rail into the loom
        pig = [(x + 0.030, RACK_POD_Y + 0.006, RACK_POD_ZC + 0.020), (x + 0.030, BR_Y0 + 0.002, RACK_POD_ZC + 0.020),
               (x + 0.035, RAIL_Y + 0.008, LOOM_Z + 0.010), (x + 0.040, LOOM_Y, LOOM_Z)]
        pod(m, x, POD_Y=RACK_POD_Y, POD_ZC=RACK_POD_ZC, zb=PL_Z, pig=pig)
    # loom: along the rail's top to the driver's (-X) end, forward over the rail and down in front of
    # the basket's corner to the roof, across the deck and over the edge into the door gap
    xr = -(L.RACK_RAIL_HALF - 0.010)
    yd = LOW_FRONT_Y + 0.012
    xe = -(ROOF_EDGE_X + 0.020)
    m.sweep([(POD_X[-1] + 0.04, LOOM_Y, LOOM_Z), (xr, LOOM_Y, LOOM_Z), (xr - 0.012, RAIL_Y + 0.020, LOOM_Z + 0.004),
             (xr - 0.030, yd, RAIL_Z - 0.006), (xr - 0.040, yd, L.RACK_Z_LOW + 0.010),
             (xr - 0.06, yd, ROOF_Z(abs(xr) + 0.06) + 0.008), (-(ROOF_EDGE_X - 0.002), yd, ROOF_Z(ROOF_EDGE_X) + 0.008),
             (xe, yd, ROOF_Z(ROOF_EDGE_X) - 0.025), (xe, yd, 1.552), (-(ROOF_EDGE_X - 0.012), yd, 1.545)],
            "LightBarSteel", r=0.0065, sides=6)
    return m.finish("LightBarRack")


def report(ob, label):
    n = L.tris(ob); d = ob.dimensions
    print(f"{label}: {n} tris, size {d.x:.3f} x {d.y:.3f} x {d.z:.3f} m (x,y,z), mats {[s.material.name for s in ob.material_slots]}")
    return L.check_normals(ob)


def main():
    L.reset()
    solo = build_solo(); bpy.context.view_layer.update()
    bad = report(solo, "light-bar-solo")
    L.mount_print("solo feet (roof deck, each side)", (FOOT_X, BAR_Y, ROOF_Z(FOOT_X)))
    print(f"  solo lamp axis z {POD_ZC:.3f}, lens face y {POD_Y + 0.111:.3f}")
    L.export_glb([solo], f"{L.MODELS}/mod-light-bar-solo.glb")
    L.reset()
    rack = build_rack(); bpy.context.view_layer.update()
    bad += report(rack, "light-bar-rack")
    L.mount_print("rack brackets (rack upper front rail, x per pod)", (POD_X[-1], RAIL_Y + RAIL_R, RAIL_Z))
    print(f"  rack lamp axis z {RACK_POD_ZC:.3f} (rail centre {RAIL_Z:.3f}), can top {RACK_POD_ZC + POD_R:.3f} (basket top rail {L.RACK_Z_TOP + L.RACK_R_MAIN:.3f}),"
          f" can back y {RACK_POD_Y - 0.004:.3f} (rail front y {RAIL_Y + RAIL_R:.3f}), lens face y {RACK_POD_Y + 0.111:.3f}, plate underside z {PL_Z - BR_T:.3f}")
    L.export_glb([rack], f"{L.MODELS}/mod-light-bar-rack.glb")
    # one .blend holding both, renders per variant
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=f"{L.MODELS}/mod-light-bar-solo.glb")
    solo = [o for o in bpy.data.objects if o not in before and o.type == "MESH"][0]
    solo.location.x += 2.0
    bpy.ops.wm.save_as_mainfile(filepath=f"{L.SRC}/mod-light-bar.blend")
    solo.location.x -= 2.0
    os.makedirs(L.RENDERS, exist_ok=True)
    rk = f"{L.MODELS}/mod-roof-rack.glb"
    for ob, tag in ((solo, "solo"), (rack, "rack")):
        other = rack if ob is solo else solo
        other.hide_render = True; ob.hide_render = False
        L.render_views([ob], f"{L.RENDERS}/r3-light-bar-{tag}", L.PART_VIEWS)
    rack.hide_render = True; solo.hide_render = False
    truck = L.import_ranger()
    tv = {"threeq": ((0.85, 0.75, 0.45), 0.95, (0.0, 0.3, 1.25)), "front": ((0.0, 1.0, 0.18), 1.0, (0.0, 0.5, 1.0)),
          "side": ((1.0, 0.0, 0.10), 1.6, (0.0, 0.0, 1.45))}
    L.render_views([o for o in truck if o.type == "MESH"], f"{L.RENDERS}/r3-light-bar-solo-ontruck", tv, truck=True)
    solo.hide_render = True; rack.hide_render = False
    bpy.ops.import_scene.gltf(filepath=rk)        # the rack variant is only ever fitted on the rack
    L.render_views([o for o in truck if o.type == "MESH"], f"{L.RENDERS}/r3-light-bar-rack-ontruck", tv, truck=True)
    L.render_views([rack], f"{L.RENDERS}/r3-light-bar-rack-closeup",
                   {"bracket": ((0.6, 0.8, 0.35), 3.0, (POD_X[2], RAIL_Y + 0.05, RAIL_Z))})
    if bad:
        raise SystemExit("inverted faces")


main()
