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
  hilux: {
    url: 'assets/models/hilux.glb',
    targetLength: 4.6,
    bodyScale: 1.065,
    yaw: 0,
    shiftRear: 0.318,
    shiftDown: 0.21,
    paint: 'M_0042_Sienna',
    tail: 'Lisanne_Bandana',
    reverse: { material: 'FrontColor', rearZ: -50 },
    credit: 'Toyota Hilux 97 by Muhammad Reyhan [CC-BY]',
  },

  // ASSET-34 — the hero truck, and the only model authored specifically for this game.
  // Modelled to the PHYSICS PRESET rather than to the real truck: `assets/models/src/ranger.py`
  // places the wheel arches on data/ranger.js's axles (car-local z -1.2825 / +1.5675) and sizes
  // the body to bodyLength 4.61, so the procedural wheels land in the openings. targetLength,
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
    targetLength: 4.61,
    bodyScale: 1.0,
    yaw: 0,
    shiftRear: 0.3465,
    // -0.007 = -(model's lowest point, 0.108) + (static suspension sag, 0.101).  The
    // loader plants box.min at car-local y = -cgHeight, which assumes the suspension is
    // fully extended; at rest it sags ~0.10 m and the truck visibly floats without this.
    shiftDown: -0.007,
    ownWheels: false,
    paint: 'RangerPaint',
    tail: 'RangerTail',
    // One lens material serves the headlamps AND the reverse lamps; rearZ = 0 splits them, since
    // the headlamps sit near model-local z -1.9 and the reverse lenses near +2.5.
    reverse: { material: 'RangerLens', rearZ: 0 },
    credit: 'Own work — 2002 Ford Ranger, built for RangerSim (ASSET-34)',
  },
}

export const DEFAULT_VEHICLE_MODEL = VEHICLE_MODELS.ranger
