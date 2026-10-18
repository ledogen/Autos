// data/vehicle-models.js — vehicle VISUAL definitions (3D model file, alignment, light materials).
//
// Distinct from data/vehicles.js, which holds the PHYSICS presets (mass, geometry, tire params,
// switched via the debug dropdown). This registry describes only how a vehicle LOOKS. The generic
// loader in src/vehicle-model.js consumes any spec of this shape, so adding a vehicle is data-only:
//   1. drop its .glb in assets/models/
//   2. add an entry below
//   3. point the game at it — createVehicleModel(scene, params, VEHICLE_MODELS.<id>)
// No loader changes required. To link a visual to a physics preset, key it by the same name used
// in data/vehicles.js (e.g. 'Ranger') and select both together when switching vehicles.
//
// Field reference (only `url` is required — omit a light field and that light is simply skipped):
//   url          string  — path to the .glb (served static)
//   targetLength number  — m; model auto-scaled so its longest horizontal axis = this
//   bodyScale    number  — extra body-only multiplier (wheels are sized from physics params)
//   yaw          number  — rad; extra Y rotation if the model faces the wrong way (forward = -Z)
//   shiftRear    number  — m; fine-align nudge rearward (+Z) relative to the wheels
//   shiftDown    number  — m; fine-align nudge downward to seat the body on the wheels
//   paint        string  — material name of the recolorable body coat
//   tail         string  — material name of the rear lamp (driven as tail/brake light)
//   reverse      object  — { material, rearZ }: white lens material + model-local Z above which
//                          its faces are the rear lens (split off and driven on reverse)
//   ownWheels    bool    — set FALSE if the model was authored with no wheels at all, so the
//                          procedural set is the only set. Omit for models that carry their own
//                          (the loader then hides the small child nodes it finds). The loader
//                          cannot infer this: a wheel-less model is a single big node, which looks
//                          exactly like a merged model with its wheels baked in.
//   credit       string  — attribution (license requirement); also recorded in assets/models/CREDITS.md

export const VEHICLE_MODELS = {
  // ASSET-34 — the hero truck, and the only model authored specifically for this game.
  // Modelled to the PHYSICS PRESET rather than to the real truck: `assets/models/src/ranger.py`
  // places the wheel arches on data/ranger.js's axles (car-local z -1.2825 / +1.5675) and sizes
  // the body to bodyLength, so the procedural wheels land in the openings.  targetLength MUST
  // equal the model's own length or the loader rescales it and the wheels leave the arches —
  // it went 4.61 -> 4.705 on 2026-09-06: the front overhang was restored to its measured
  // 0.731 m, then pushed to 0.771 so the chrome blade stands 100 mm proud of the sheet metal
  // instead of 60.  targetLength,
  // shiftRear and shiftDown below are PRINTED BY THE GENERATOR — re-run it and copy them across
  // rather than eyeballing them, because they encode the loader's bounding-box re-centring.
  //
  // Clear glass and a modelled interior are a deliberate ART-STYLE exception for this file only
  // (owner ruling 2026-08-25); see .planning/research/ART-STYLE.md, "Sanctioned exceptions".
  //
  // The steering wheel ships as its own node named `SteeringWheel`, parented to the body with its
  // origin ON the column axis. To animate it later: root.getObjectByName('SteeringWheel') and set
  // `.rotation.y` — node-local Y, NOT z, because the exporter's +Y-up conversion maps the Blender
  // local Z it was built about onto glTF local Y.
  ranger: {
    url: 'assets/models/ranger.glb',
    targetLength: 4.705,
    bodyScale: 1.0,
    yaw: 0,
    shiftRear: 0.2990,
    // -0.045 = -(model's lowest point, 0.146) + (static suspension sag, 0.101).  The
    // loader plants box.min at car-local y = -cgHeight, which assumes the suspension is
    // fully extended; at rest it sags ~0.10 m and the truck visibly floats without this.
    // THE LOWEST POINT IS THE MUD FLAPS' BOTTOM EDGE, nothing structural — it went 0.108
    // -> 0.146 on 2026-09-22 when they were shortened, and this number had to follow or
    // the truck would have sat 38 mm high.  Anything that changes what hangs lowest
    // changes this: re-run the generator and copy its printout.
    shiftDown: -0.045,
    // The OPEN-BED collider (physics.js createVehicleChassis `bed`): floor, walls, tailgate and
    // wheelhouse boxes, in body-local metres (forward = -Z, origin at the CG). Every number is a
    // named constant from ranger.py mapped through the loader's transform: the glTF export puts
    // Blender +Z on model +Y and Blender -Y on model +Z, auto-scale is exactly 1.0, and the ground
    // plant lands the model root at body-local y = -0.651. So body y = <ranger.py Z> - 0.651 and
    // body z = -<ranger.py Y>; x is unchanged. RE-DERIVE after any re-export that moves the bed or
    // what hangs lowest: read root.scale.x and root.position off the loaded GLB group. Both the
    // world truck and the menu stage (src/stage.js) build from this, so cargo rides in the bed.
    bed: {
      floorY:          0.077,   // Z_BEDFLOOR 0.700 + RIB_H 0.028 — the rib CRESTS, which is what cargo
                                // actually rests on (the pan between them is 0.049)
      railY:           0.490,   // Z_RAIL 1.141 — bed rail top
      wheelhouseY:     0.284,   // Z_WHEELHOUSE 0.935 — wheelhouse box top
      innerHalfW:      0.700,   // W_BED_IN — inner wall
      outerHalfW:      0.822,   // W_BED_OUT — bed side at the rail
      wheelhouseHalfW: 0.545,   // W_WHEELHOUSE — inner wall over the rear arch
      frontZ:          0.605,   // Y_BED_F -0.605 — front wall, 8 cm behind the cab (cab moved 105 mm
                                // forward in the 2026-09-25 proportions pass; the bed front came with it)
      tailZ:           2.4405,  // Y_BED_R -2.4405 — bed loft tail
      gateZ:           2.5405,  // Y_TAILGATE -2.5405 — outer face of the closed tailgate
      archZ0:          1.0975,  // AX_R 1.5675 ∓ ARCH_R 0.470 — the rear arch the wheelhouse covers
      archZ1:          2.0375,
    },
    // FEAT-112: the STOCK load rating (src/load-verdict.js truckConfig folds upgrades over it). The
    // bed's length and width come from `bed` above; this holds only what the mesh cannot say.
    // Each part carries its own soft limit / hard cap and the truck's are the MINIMUM over the three,
    // the way a real GVWR is set (owner 2026-10-16), so one heavy-duty part alone moves nothing.
    //   softKg 570 — the manufacturer's payload: 2002 Ranger regular-cab 4x2, ~1,260 lb. Past it: warning.
    //   hardKg 820 — owner, just above the cinder blocks (785 kg). Past it: the job cannot be taken.
    //   popKg  600 — owner: past it a fresh tire starts to read worn to the puncture curve (damage.js).
    //   overhangMaxM 1.22 — 4 ft past the tailgate, the US red-flag line: past it is too long.
    load: {
      containment:  'sides',
      overhangMaxM: 1.22,
      springs: { softKg: 570, hardKg: 820 },
      dampers: { softKg: 570, hardKg: 820 },
      tires:   { softKg: 570, hardKg: 820, popKg: 600 },
    },
    // The whip antenna, built and bent procedurally by src/vehicle-model.js (createAntenna) — NOT in
    // the .glb, where it could only ride the body rigidly. base/tip in body-local metres (same
    // mapping as `bed`: ranger.py (0.782, 1.020, 1.118) -> (0.812, 1.002, 1.928)); radius at the
    // base; `material` is matched by substring against the model's materials.
    antenna: { base: [0.782, 0.467, -1.020], tip: [0.812, 1.277, -1.002], radius: 0.011, material: 'RangerTrim' },
    ownWheels: false,
    paint: 'RangerPaint',
    tail: 'RangerTail',
    // One lens material serves the headlamps AND the reverse lamps; rearZ = 0 splits them, since
    // the headlamps sit near model-local z -1.9 and the reverse lenses near +2.5.
    reverse: { material: 'RangerLens', rearZ: 0 },
    credit: 'Own work — 2002 Ford Ranger, built for AUTOS (ASSET-34)',
  },
}

export const DEFAULT_VEHICLE_MODEL = VEHICLE_MODELS.ranger
