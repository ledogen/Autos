# test-rock.py — FEAT-36/FEAT-48 physics-test prop: a dead-simple low-poly rock.
#
# NOT an art asset: exists so the tire-over-debris translation layer has a small dynamic body
# to roll under a wheel. Flat desaturated grey (nature = desaturated, ART-STYLE.md), faceted,
# base-seated origin. Deterministic displacement (fixed seed) so re-runs are byte-stable.
#
# Final parameters: icosphere subdiv 1 squashed to ~0.44 x 0.36 x 0.40 m → 80 tris. No texture.
# Blender 5.2.0 LTS.
# Rebuild: /Applications/Blender.app/Contents/MacOS/Blender --background --python assets/models/src/test-rock.py

import bpy, os, random

RADIUS  = 0.22     # m — nominal; wheel radius is 0.368 m, so this fits under the tire
SQUASH  = (1.0, 0.82, 0.91)   # x/y/z scale — a river cobble, not a sphere
JITTER  = 0.035    # m — per-vertex radial displacement
SEED    = 7
COLOR   = (0.42, 0.41, 0.39, 1.0)   # desaturated warm grey
NAME    = 'TestRock'
OUT_GLB = 'assets/models/test-rock.glb'
OUT_BLEND = 'assets/models/src/test-rock.blend'

bpy.ops.wm.read_factory_settings(use_empty=True)

bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=RADIUS, location=(0, 0, 0))
obj = bpy.context.active_object
obj.name = NAME

rng = random.Random(SEED)
for v in obj.data.vertices:
    n = v.co.normalized()
    v.co += n * (rng.uniform(-JITTER, JITTER))
obj.scale = SQUASH
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# Base-seat: lowest vertex to z=0.
zmin = min(v.co.z for v in obj.data.vertices)
for v in obj.data.vertices:
    v.co.z -= zmin

mat = bpy.data.materials.new('TestRockBody')
mat.use_nodes = True
bsdf = mat.node_tree.nodes['Principled BSDF']
bsdf.inputs['Base Color'].default_value = COLOR
bsdf.inputs['Roughness'].default_value = 0.95
obj.data.materials.append(mat)

for poly in obj.data.polygons:
    poly.use_smooth = False

deps = bpy.context.evaluated_depsgraph_get()
tris = sum(len(p.vertices) - 2 for p in obj.evaluated_get(deps).data.polygons)
print(f'[test-rock] tris={tris}')

root = os.getcwd()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(root, OUT_BLEND))
bpy.ops.export_scene.gltf(filepath=os.path.join(root, OUT_GLB), export_format='GLB',
                          export_yup=True, export_apply=True)
print(f'[test-rock] exported {OUT_GLB}')
