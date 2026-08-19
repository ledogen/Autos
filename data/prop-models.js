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
//                       Read by src/poi.js (oriented marker box) and stamped onto POI records at
//                       build time; src/debris.js ignores it and hulls the mesh instead.
//                       Shape convention: { shape: 'box'|'capsule'|'none', size: [x, y, z] m }
//                       in model-local axes (base-seated, forward = -Z).
//                       NOTE the field is `size`. The ASSET-NN tickets write `dims`; a `dims` here
//                       reads as no box at all and the marker silently falls back to the 1.6 m cube.
//   tags       string[] — which POOLS this asset belongs to. A POI roster slot names a tag rather
//                       than a key (src/poi.js, `modelPool`), so widening a pool is an edit to THIS
//                       file and nothing else. 'missionGiver' = "a place that hands out work".
//                       Owner ruling 2026-08-15: the per-POI choice is deterministic in the seed,
//                       and adding to a pool is ALLOWED to reshuffle which marker wears what.
//   yawOffset  number — extra yaw, in radians, applied on top of the pad yaw (which points model
//                       -Z at the road). The pad is 14 m along the road x 8 m across, so an asset
//                       whose length runs down its own -Z has only 8 m to live in unless it is
//                       turned. Default 0.
//   credit     string — attribution if third-party; also recorded in assets/models/CREDITS.md

export const PROP_MODELS = {
  newsRoll: {
    url: 'assets/models/news-roll.glb',
    // Rolled newspaper, ~90 x 74 mm cross-section, 420 mm long along -Z. You drive over it, so
    // 'box' here is future-physics metadata, not a driving obstacle.
    collision: { shape: 'box', size: [0.090, 0.074, 0.420] },
  },

  // ASSET-30 — the 55-gallon steel drum, closed head. THE thrown physics prop (src/debris.js),
  // replacing the retired 12-sided test cylinder. 328 tris, 0.58 m dia x 0.85 m tall, base-seated;
  // two materials (DrumPaint red-oxide + DrumSteel bungs), no textures.
  // src/debris.js hulls the GLB's own vertices, so `collision` here is documentation, not the
  // collider — but it records what the ticket authored: cylinder r 0.29, h 0.85, 18 kg empty.
  drumClosed: {
    url: 'assets/models/drum-closed.glb',
    collision: { shape: 'hull-from-mesh', size: [0.58, 0.85, 0.58] },
  },
  testRock: {
    url: 'assets/models/test-rock.glb',
    collision: { shape: 'hull-from-mesh', size: [0.44, 0.4, 0.36] },
  },

  // ASSET-01 — pink lawn flamingo, two poses, 358 / 344 tris.  Lawn furniture:
  // scatter these WITH a POI, never on bare ground (ticket rule — without an
  // anchor a flamingo reads as litter, not habitation).
  //
  // NO POOL TAG YET.  The only pool in this file is 'missionGiver', and a
  // flamingo is not a place that hands out work.  The POI-satellite scatter that
  // would consume a 'lawnFurniture' tag does not exist; until it does these are
  // spawnModel()-only.  Do NOT tag them missionGiver to make them show up.
  flamingoUp: {
    url: 'assets/models/flamingo-a.glb',
    // Head up, the tall alert pose.  0.16 wide x 0.87 tall x 0.49 long, the
    // length running down -Z (beak at z -0.278, tail at +0.216).  Knockable set
    // dressing, not a wall.
    collision: { shape: 'box', size: [0.16, 0.87, 0.50] },
  },

  // ASSET-01 — the grazing pose.  SHORTER but LONGER: the neck swings forward
  // and down, so it is only 0.59 tall but reaches 0.73 along -Z — the longest
  // thing in this registry relative to its height.  Sized from the GLB, not
  // copied from its sibling.
  flamingoDown: {
    url: 'assets/models/flamingo-b.glb',
    collision: { shape: 'box', size: [0.16, 0.59, 0.73] },
  },

  // ── POI markers ───────────────────────────────────────────────────────────────────────────
  // Each carries the 'missionGiver' tag, so the roster's five giver slots draw from all three.

  // ASSET-21 — single-wide mobile home, the first modelled POI marker (FEAT-60). Stands on a
  // lay-by pad as mom's house and Larry's house.
  trailerHomeA: {
    url: 'assets/models/trailer-home-a.glb',
    // BODY ONLY — excludes the stoop, which you should be able to clip a mirror on without the
    // truck stopping dead. Model-local axes: the 12 m length runs along +X (measured off the GLB:
    // 12.36 x 3.71 x 4.58 overall), so a marker yawed to face the road lays its length ALONG the
    // road — the only orientation it fits a 14 x 8 m pad in. Hence no yawOffset.
    collision: { shape: 'box', size: [12.0, 3.15, 3.5] },
    tags: ['missionGiver'],
  },

  // ASSET-09 — Winnebago RV, 1818 tris. Somebody living out of it, handing out work.
  winnebago: {
    url: 'assets/models/winnebago.glb',
    // 8.0 m long x 2.4 m body width x 3.14 m tall; length runs down -Z (the cab faces -Z).
    collision: { shape: 'box', size: [2.4, 3.2, 8.0] },
    // PARKED BROADSIDE, not nose-to-the-road. Unturned, its 8 m length would run ACROSS the pad's
    // 8 m width — nose exactly on the shoulder edge, zero margin, and every RV in the region
    // pointed at the tarmac like a row of cannons. Turned a quarter, the 8 m lies along the pad's
    // 14 m and only 2.4 m crosses it, which is also how a real one parks in a lay-by.
    yawOffset: Math.PI * 0.5,
    tags: ['missionGiver'],
  },

  // ASSET-18 — broken-down car, 2464 tris (BrokenCar + BrokenCarGlass). The stranded-motorist
  // giver: the model already tells you what the job is.
  brokenCar: {
    url: 'assets/models/broken-car.glb',
    // CAR BODY ONLY — deliberately excludes the spare, jack and tyre iron lying beside it, so you
    // can drive over the clutter without stopping dead. 5.01 m length runs down -Z (verified off
    // the GLB: headlamps at z -2.49, tail lamps at z +2.48).
    collision: { shape: 'box', size: [1.85, 1.46, 5.02] },
    // Same quarter-turn as the Winnebago, and for the stronger reason: a car that has died on a
    // lay-by was pulled OFF the road, parallel to it. Nose-on would read as parked to greet you.
    //
    // THE SIGN IS LOAD-BEARING, do not flip it to -PI/2. ASSET-18's open item is that the wreck
    // only tells its story from the RIGHT (+X) flank — that is where the missing wheel, the brake
    // drum, the jack, the spare and the tyre iron all are; the left side is an intact car. +PI/2
    // turns +X toward the road on every pad orientation (verified against the pad normal, all
    // quadrants), so the damage faces the driver. -PI/2 would park the wreck's good side out.
    yawOffset: Math.PI * 0.5,
    tags: ['missionGiver'],
  },
}

/** Every registry key carrying `tag`, in registry order — the pool a roster slot draws from. */
export function modelsTagged (tag) {
  return Object.keys(PROP_MODELS).filter(k => PROP_MODELS[k].tags?.includes(tag))
}
