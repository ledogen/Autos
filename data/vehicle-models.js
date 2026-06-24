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
}

export const DEFAULT_VEHICLE_MODEL = VEHICLE_MODELS.hilux
