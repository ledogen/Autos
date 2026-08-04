// data/prop-models.js — hand-modelled asset registry (FEAT-59).
//
// Distinct from data/vehicle-models.js (vehicle visuals): this registry lists every non-vehicle
// .glb asset the game can load — mission items, static POI dressing, future physics props. The
// generic service in src/model-service.js consumes any spec of this shape, so adding an asset is
// data-only:
//   1. drop its .glb in assets/models/ (export convention: .planning/research/ASSETS.md —
//      base-seated origin, forward = -Z, embedded textures, no Draco/KTX2)
//   2. add an entry below
//   3. spawn it — spawnModel('<key>') from src/model-service.js
// No loader changes required.
//
// Field reference (only `url` is required):
//   url        string — path to the .glb (served static; vite.config.js copies assets/models/*.glb
//                       into dist/ at the same path — NOT an ES import)
//   collision  object — authored collision metadata, carried verbatim on the loaded record.
//                       UNUSED today; consumed by future dynamic-prop physics (FEAT-59 §4).
//                       Shape convention: { shape: 'box'|'capsule'|'none', size: [x, y, z] m }
//                       in model-local axes (base-seated, forward = -Z).
//   credit     string — attribution if third-party; also recorded in assets/models/CREDITS.md

export const PROP_MODELS = {
  newsRoll: {
    url: 'assets/models/news-roll.glb',
    // Rolled newspaper, ~90 x 74 mm cross-section, 420 mm long along -Z. You drive over it, so
    // 'box' here is future-physics metadata, not a driving obstacle.
    collision: { shape: 'box', size: [0.090, 0.074, 0.420] },
  },
}
