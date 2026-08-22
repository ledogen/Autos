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
//   palette    object — CURATED RECOLOUR POOL, { <material name substring>: [[r,g,b], ...] }.
//                       Owner ruling 2026-08-21: recolouring is not a free-for-all tint. Each
//                       model that wants variety declares a short, hand-picked list of colours it
//                       is ALLOWED to be, and spawners pick an index. The look stays art-directed;
//                       the world stops looking cloned.
//                         * Colours are LINEAR RGB — the same numbers as the .glb's
//                           baseColorFactor, NOT sRGB. See ART-STYLE.md rule 5.
//                         * Index 0 MUST equal the colour authored in the .glb. It is the default,
//                           and test/model-palette.mjs asserts the two have not drifted.
//                         * Every array must be the SAME LENGTH — the index is one variant number
//                           for the whole model, so two materials listed here recolour in lockstep
//                           and you can define a coordinated outfit rather than independent dice.
//                         * The key is matched by SUBSTRING against material names, the same
//                           convention the vehicle loader's spec.paint uses. Renaming a material on
//                           re-export silently drops the hookup, which is what the gate is for.
//                       spawnModel(key, { variant: n }) selects one; n is taken modulo the palette
//                       length, so callers pass a raw hash and never think about the count.
//                       DETERMINISM: the caller owns it. Derive n from the seed the way poi.js
//                       does for modelKey (hash32(`...:${seed}:${id}`)), never Math.random().
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

  // ASSET-24 — the player's campfire.  472 tris, 0.708 x 0.378 x 0.675 m, four
  // flat materials, no textures.  CAMP GEAR, not lawn furniture: it renders at
  // the player's own campsite under items.md's visible-kit rule, and per that
  // doc the bedroll-and-campfire is the DEFAULT camp with no modifier — so this
  // is on screen every night of a 20-day run.
  //
  // OVER THE TICKET'S 300-TRI BUDGET, deliberately.  The 11-stone fire ring is
  // 220 of the 472; everything the ticket actually specified is 252.  ASSET-08
  // (the permanent fire pit, the other asset with a stone ring) budgets 450 with
  // ~300 earmarked for stones, which is the right order for a ring-fire.
  //
  // FLAG: the ring means this and ASSET-08 now share their strongest silhouette
  // cue.  The tickets are explicit that a stone-ringed pit must read as "someone
  // lives here" against this one's "I slept here", so ASSET-08 needs a different
  // distinguishing feature — a built kerb, a dug pit — before both ship.
  //
  // SHIPS COLD.  glTF carries no lights and no particle systems, so the flames,
  // the point light and the flicker are a VFX ticket.  What the .glb provides is
  // the empty node FireFlameAnchor at (0, 0.085, 0) in model space — parent the
  // flame quads and the light to that.  Find it by name off the loaded scene;
  // it is a plain Object3D with no geometry.
  //
  // NO COLLISION, by the ticket.  A 0.38 m fire sits on the 6 m camp pad the
  // player parks the truck on, and colliding it would make the campsite a
  // hazard course.  Material names are the API for the VFX rig: FireAsh,
  // FireCoal, FireLog, FireStone.  No palette — a fire is not recolourable.
  campfire: {
    url: 'assets/models/campfire.glb',
    collision: { shape: 'none', size: [0.708, 0.378, 0.675] },
  },

  // ASSET-02 — ceramic garden gnome, 500 tris, the classic STANDING lawn
  // ornament: boots, belted coat, beard over the chest, tall red hat.  Lawn
  // furniture, same rule as the flamingos: scatter WITH a POI, never on bare
  // ground.  NO POOL TAG for the same reason — a gnome is not a place that
  // hands out work, and 'lawnFurniture' has no consumer yet.
  //
  // NO TEXTURE.  The ticket budgeted a 256x256 baked face; the owner's 2026-08-19
  // reference call is the low-poly read — brim, beard, and a nose between them,
  // no eyes — so there is nothing left for a texture to carry.
  //
  // SIX MATERIALS, one over the ART-STYLE soft limit.  GnomeLeather carries the
  // belt, trousers and boots as one dark-leather role; GnomeBuckle is the brass
  // buckle and is the only thing that could not be merged into it.
  gnome: {
    url: 'assets/models/gnome.glb',
    // 0.206 wide x 0.400 tall x 0.165 deep, measured off the GLB — inside the
    // ticket's 0.22 envelope.  THE MODEL IS NOT SYMMETRIC: the pose puts weight
    // on one leg, bends one arm to the belt and hangs the other at the hip.
    // X happens to come out even at -0.1031 .. +0.1031; Z is where the pose
    // shows, running -0.095 .. +0.070 (the nose and boot toes reach forward,
    // i.e. -Z).  This box is a size, not a centred extent, so it over-covers on
    // one side — the right way round for knockable set dressing.
    collision: { shape: 'box', size: [0.206, 0.400, 0.165] },
    // Blue / green / burgundy. The hat, beard, skin, leather and buckle are FIXED — a gnome is a
    // red hat and a white beard, and recolouring those stops it being a gnome.
    //
    // The burgundy is deliberately much darker than the hat it sits under (luminance 0.042 against
    // the hat's 0.113, a 2.7x ratio). A coat matched to the hat's pillar-box red would collapse the
    // figure into one red mass at distance, which is the whole value structure gone — ART-STYLE
    // rule 5 wants something dark low and something bright to catch the eye, and here the hat is
    // the bright thing.
    palette: {
      GnomeCoat: [
        [0.030, 0.085, 0.340],   // 0 — cobalt, the authored colour (must match the .glb)
        [0.022, 0.147, 0.040],   // 1 — bottle green
        [0.163, 0.009, 0.013],   // 2 — burgundy
      ],
    },
  },

  // ASSET-03 — segmented beach ball, 252 tris, 0.40 m across.  Six vertical
  // gores as five flat material slots, no texture (the ticket offers per-panel
  // slots as its own alternative and ART-STYLE rule 1 prefers it).
  //
  // *** ORIGIN IS THE SPHERE CENTRE, NOT BASE-SEATED. ***  Every other model in
  // this registry sits on y = 0; this one straddles it, because it is meant to
  // be simulated (FEAT-36) and a rigid body spins about its origin.  Anything
  // placing it statically MUST lift it by 0.20 or it sinks to its equator.
  //
  // mass_kg / restitution are inert until dynamic prop physics exists — carried
  // now so nothing is re-plumbed later, per FEAT-59's rule.  EVERY vertex sits
  // exactly on the r=0.20 sphere, so the visual is perfectly inscribed in its
  // collider and can never interpenetrate whatever it rests on.
  beachBall: {
    url: 'assets/models/beach-ball.glb',
    collision: {
      shape: 'sphere', radius: 0.20, size: [0.40, 0.40, 0.40],
      mass_kg: 0.15, restitution: 0.75,
    },
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

  // ASSET-14 — the lone gas pump, 460 tris, 2.50 x 4.55 x 1.40 m. RESHAPED BY THE OWNER
  // twice on 2026-08-22: first from "one pump on a small pad" into the roadside island in
  // the reference photo — a 4.55 m pole carrying a lit GAS sign, and at its foot TWO box
  // pumps back to back so a car can pull up on either side — then the pump itself, from
  // narrow-and-upright into the wide, squat cabinet with an overhanging chrome-framed head.
  // Six materials, one 512x512 atlas carrying the word GAS and the gauge face.
  gasPump: {
    url: 'assets/models/gas-pump.glb',
    // ISLAND AND PUMPS ONLY, up to the head at 1.42 m. The pole above that is 0.13 m of
    // galvanised tube and is deliberately NOT in the box: a 4.55 m collider would be an
    // invisible wall to anything tall, and clipping a mirror on a sign post is not a crash.
    // The 2.50 m length runs along +X (pole at x -1.05, pumps at x +0.28); the first pump's
    // gauge face, holster and hose face -Z.
    collision: { shape: 'box', size: [2.50, 1.45, 1.40] },
    // yawOffset 0 ON PURPOSE. The pad is 14 m along the road x 8 m across, and the marker yaw
    // already points model -Z at the road — which lays the island's 2.50 m length ALONG the
    // road and turns the -Z pump to face it, exactly how a car pulls in alongside. A quarter
    // turn (the Winnebago's fix, for an 8 m body) would point both pumps up and down the road
    // instead, which is the one orientation you cannot fuel from.
    //
    // PumpSkirt is the recolourable material if this ever wants a curated pool; none is
    // declared, because nothing passes a `variant` yet and an unused palette is only gate
    // surface. CAVEAT: the gauge face's red GASOLINE band is baked into the atlas at the same
    // red, and a palette swap would not move it — keep any pool to reds or re-bake per variant.
    //
    // 'gasStation' IS A POOL OF ITS OWN, NOT 'missionGiver' (owner ruling 2026-08-22): this POI
    // does not hand out work, it sells you fuel. NOTHING CONSUMES THIS POOL YET — no roster slot
    // in src/poi.js names it, so the model does not spawn. That is deliberate and matches the
    // flamingo rule above: do not re-tag it missionGiver to make it appear. The slot arrives
    // with FEAT-50 refuelling, which is what gives a gas stop something to do.
    tags: ['gasStation'],
  },
}

/** Every registry key carrying `tag`, in registry order — the pool a roster slot draws from. */
export function modelsTagged (tag) {
  return Object.keys(PROP_MODELS).filter(k => PROP_MODELS[k].tags?.includes(tag))
}
