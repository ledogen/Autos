# test-barrel.py — FEAT-36/FEAT-48 physics-test prop: a dead-simple plastic barrel.
#
# NOT an art asset: this exists so the box3d debris path has something honest to throw and
# drive over (asset-plastic-barrel.md stays open for the real one). Flat colour, no texture,
# faceted (ART-STYLE.md), base-seated origin, forward = -Z irrelevant (radially symmetric).
#
# Final parameters: 12 sides, r 0.30 m, h 0.90 m → 68 tris. No texture. Blender 5.2.0 LTS.
# Rebuild: /Applications/Blender.app/Contents/MacOS/Blender --background --python assets/models/src/test-barrel.py
#
# Run from the repo root (paths below are relative to it).

import bpy, math, os

RADIUS   = 0.30    # m
HEIGHT   = 0.90    # m
SIDES    = 12
COLOR    = (0.13, 0.35, 0.65, 1.0)   # saturated plastic blue (man-made = saturated, ART-STYLE)
NAME     = 'TestBarrel'
OUT_GLB  = 'assets/models/test-barrel.glb'
OUT_BLEND = 'assets/models/src/test-barrel.blend'

bpy.ops.wm.read_factory_settings(use_empty=True)

bpy.ops.mesh.primitive_cylinder_add(vertices=SIDES, radius=RADIUS, depth=HEIGHT,
                                    location=(0, 0, HEIGHT / 2))   # base-seated: lowest point at z=0
obj = bpy.context.active_object
obj.name = NAME

mat = bpy.data.materials.new('TestBarrelBody')
mat.use_nodes = True
bsdf = mat.node_tree.nodes['Principled BSDF']
bsdf.inputs['Base Color'].default_value = COLOR
bsdf.inputs['Roughness'].default_value = 0.6
obj.data.materials.append(mat)

# Faceted: flat shading is the primitive default — assert rather than assume.
for poly in obj.data.polygons:
    poly.use_smooth = False

bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

deps = bpy.context.evaluated_depsgraph_get()
tris = sum(len(p.vertices) - 2 for p in obj.evaluated_get(deps).data.polygons)
print(f'[test-barrel] tris={tris}')

root = os.getcwd()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(root, OUT_BLEND))
bpy.ops.export_scene.gltf(filepath=os.path.join(root, OUT_GLB), export_format='GLB',
                          export_yup=True, export_apply=True)
print(f'[test-barrel] exported {OUT_GLB}')
