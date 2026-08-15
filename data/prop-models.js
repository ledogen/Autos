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

  // FEAT-36/FEAT-48 physics-test props — deliberately dead simple (44 / 20 tris), NOT the real
  // ASSET-25/26 barrels. Thrown via the debug projectile selector; src/debris.js builds each
  // collider as the convex hull of the GLB's own vertices, so `collision` metadata is moot here.
  testBarrel: {
    url: 'assets/models/test-barrel.glb',
    collision: { shape: 'hull-from-mesh', size: [0.6, 0.9, 0.6] },
  },
  testRock: {
    url: 'assets/models/test-rock.glb',
    collision: { shape: 'hull-from-mesh', size: [0.44, 0.4, 0.36] },
  },

  // ASSET-21 — single-wide mobile home, the first modelled POI marker (FEAT-60). Stands on a
  // lay-by pad as mom's house and Larry's house.
  trailerHomeA: {
    url: 'assets/models/trailer-home-a.glb',
    // BODY ONLY — excludes the stoop, which you should be able to clip a mirror on without the
    // truck stopping dead. Model-local axes: the 12 m length runs along +X (measured off the GLB:
    // 12.36 x 3.71 x 4.58 overall), so a marker yawed to face the road lays its length ALONG the
    // road — the only orientation it fits a 14 x 8 m pad in.
    collision: { shape: 'box', size: [12.0, 3.15, 3.5] },
  },
}
