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
//                       `boxes` (optional): [{ c: [x, y, z], s: [x, y, z] }, ...] — box CENTRES and
//                       sizes, model-local. When present these are what is solid (poi.js
//                       queryContact) and `size` is only the overall FOOTPRINT, which the pad-fit
//                       gate reads. For a POI that is several separate things on an open yard,
//                       where one box would be an invisible wall across the middle.
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
//   giverName  'home' | 'person' — FEAT-67, missionGiver models only: how the mission board names a
//                       giver standing on this model. 'home' → "the Hadley place"; 'person' → the
//                       person alone ("Earl"), for givers that are not a home (an RV, a broken-down
//                       car, later a hitchhiker). Owner ruling 2026-09-27.
//   palette   object — CURATED RECOLOUR POOL, { <material name substring>: [[r,g,b], ...] }.
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

// ASSET-31 road signs: every one of the seven is the same 4x4 timber post carrying a
// different blank, so they share one collision box. 89 mm square, 2.18 m to the post top.
const SIGN_POST_BOX = { shape: 'box', size: [0.089, 2.180, 0.089] }

// ASSET-22 mailboxes: the standard-box flavours share one curated pool on their MailBox
// material (the pillar, chicken, cast one and barn are the exceptions below). LINEAR RGB, and
// index 0 MUST stay equal to the .glb's authored baseColorFactor (test/model-palette.mjs).
// Judged rendered, not from the tuple — ART-STYLE rule 5.
const MAILBOX_PAINT = [
  [0.185, 0.192, 0.198],   // 0 galvanised steel — AUTHORED
  [0.520, 0.495, 0.430],   // 1 cream
  [0.022, 0.072, 0.038],   // 2 bottle green
  [0.195, 0.042, 0.028],   // 3 oxide red
  [0.026, 0.026, 0.028],   // 4 matte black
]

// Per-flavour pools (owner ruling 2026-10-01): some flavours only look right in
// SOME paints, so they get a shorter pool rather than the kit-wide five. Pools
// may differ in length between models — model-service takes the variant index
// modulo each model's own pool — so the one cost is that a single seed hash no
// longer means "the same paint" across every flavour, which nothing relies on.
// Index 0 still has to equal each .glb's authored colour (test/model-palette.mjs),
// which is why the pillar and the chicken carry their OWN box material
// (PillarBox, ChickenBody) authored in an allowed colour instead of MailBox grey.
// The barn has NO pool at all: barn red is the only barn.
//
// The cast one: white, black or grey only.
const FANCY_PAINT = [
  [0.640, 0.628, 0.608],   // 0 white — AUTHORED
  [0.030, 0.030, 0.032],   // 1 gloss black
  [0.215, 0.205, 0.182],   // 2 pewter
]
// The chicken: a white bird or a black one. 0 is MAILBOX_PAINT's cream.
const CHICKEN_PAINT = [
  [0.520, 0.495, 0.430],   // 0 cream — AUTHORED (the white bird of the reference)
  [0.026, 0.026, 0.028],   // 1 matte black
]
// The pillar: MAILBOX_PAINT minus the galvanised grey, which read as one
// monotone lump against grey stone. Reordered so 0 is the authored oxide red.
const PILLAR_PAINT = [
  [0.195, 0.042, 0.028],   // 0 oxide red — AUTHORED
  [0.520, 0.495, 0.430],   // 1 cream
  [0.022, 0.072, 0.038],   // 2 bottle green
  [0.026, 0.026, 0.028],   // 3 matte black
]

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
  // ASSET-04 — the kettle barbecue.  566 tris, 0.629 x 1.066 x 0.629 m, four flat
  // materials, no textures.  LAWN FURNITURE: scatter it WITH a POI, never on bare
  // ground — the ticket's rule is that without an anchor it reads as litter, not
  // habitation.  It is the anchor object of the camp-dressing cluster (ASSET-05
  // propane tank, ASSET-06 awning, ASSET-08 fire pit).
  //
  // WEBER-STYLE, owner call 2026-08-23 (the request opened as a Coleman box grill
  // and was corrected before modelling).  RESHAPED the same day against a photo
  // reference: the ball is 0.827 as tall as it is wide (was 0.70 and read as a
  // flying saucer), the bowl's widest point sits BELOW the lid joint, the bar
  // handle owns the apex with the damper offset onto the shoulder beside it, and
  // the ash pan hangs at leg height on three struts instead of floating under the
  // bowl.  1.07 m overall, which is the real 22" kettle and over the ticket's 0.95
  // estimate.
  //
  // THE 'lawnFurniture' TAG IS DECLARED BUT NOTHING CONSUMES IT YET.  src/poi.js
  // resolves `modelPool` against tags for the mission-giver roster only; the
  // POI-satellite scatter this tag is for does not exist (same note as the
  // flamingos above, which predate the tag and are still spawnModel()-only).  The
  // tag is here so that scatter, when it lands, is a consumer change and not an
  // edit to every prop entry.  Do NOT add 'missionGiver' to make it show up.
  bbqGrill: {
    url: 'assets/models/bbq-grill.glb',
    tags: ['lawnFurniture'],
    // Measured off the GLB.  Wider than the 0.57 m bowl because the LEGS splay to
    // a 0.68 m stance; the ticket's authored cylinder (r 0.28) is the bowl only and
    // would let a wheel poke through, so this box covers the stance instead.
    collision: { shape: 'box', size: [0.629, 1.066, 0.629] },
    // Black, Weber red, bottle green.  ONE key: bowl and lid share GrillEnamel
    // because on a real kettle they are the same porcelain coat, so they must
    // recolour together.  Handles, wheels, legs, grate and damper are all FIXED —
    // a red kettle still has black trim and bright steel legs, and recolouring
    // those would take the model's only value contrast with it.
    //
    // ALL THREE WERE PICKED RENDERED, NOT FROM THE NUMBERS, and both non-black
    // entries needed a second try for the same underlying reason — ART-STYLE
    // rule 5's linear trap, where a tuple renders roughly 1.5x lighter than it
    // reads.  Worth keeping, because the two failures were NOT the same failure:
    //
    //   * The red opened at 0.30 linear and came out fire-engine orange — too
    //     bright in absolute terms.  0.115 linear is about 0.37 sRGB and is the
    //     deep enamel red the reference shows.
    //   * The green opened at 0.048 and came out a grassy mid-tone that was
    //     visibly LIGHTER than the red beside it, despite the smaller number.
    //     That is the luminance weighting, not the gamma: green carries 0.715 of
    //     perceived luminance against red's 0.213, so equal-looking tuples are
    //     nowhere near equal-looking colours.  Matching the red's weight needs
    //     G ≈ 0.034, and a little blue pulls it from grass toward bottle.
    //
    // Landing the green on grass ALSO risked it reading as vegetation — the
    // nature palette is grey-green (ART-STYLE rule 5), and a man-made object that
    // shares a hue with the scenery stops being the thing your eye lands on.
    // Deep bottle green keeps the saturated-thing / desaturated-world contrast.
    //
    // All three sit at roughly the same rendered value, so the variant changes
    // the hue of the ball and nothing about the model's value structure.
    palette: {
      GrillEnamel: [
        [0.014, 0.014, 0.015],   // 0 — black enamel, the authored colour (must match the .glb)
        [0.115, 0.0055, 0.007],  // 1 — Weber red
        [0.006, 0.034, 0.016],   // 2 — bottle green
      ],
    },
  },

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
    // ASSET-21's cyan → yellow → white range, body and stripe in lockstep (BUG-43). Values are the
    // ones verified rendered in the asset ticket; the stoop, roof, skirt, trim, door, curtains and
    // metal are fixed and stay shared.
    palette: {
      TrailerBody:   [[0.28, 0.72, 0.76], [0.88, 0.76, 0.28], [0.90, 0.90, 0.88]],   // cyan AUTHORED
      TrailerAccent: [[0.10, 0.34, 0.40], [0.46, 0.34, 0.12], [0.55, 0.56, 0.58]],
    },
    tags: ['missionGiver'],
    // FEAT-67 giver naming (owner, 2026-09-27): a home — the board calls it "the Hadley place".
    giverName: 'home',
  },

  // ASSET-36 — the firewood yard (FEAT-88/91, region-1 haul giver), re-scoped by the owner on
  // 2026-10-04 from a processor + conveyor to a roadside firewood VENDOR: a red towable splitter,
  // a heap of splits, a row of shrink-wrapped bundles, an awning with two camp chairs. 12 materials,
  // no images. The load drops on
  // the roster slot's `drop` zone (src/poi.js), in the lane between the row and the pile, which
  // the model keeps clear from the zone to x 4.9; the player backs in from the +X mouth, where the
  // vendor's own pickup (SpotPickup, reserved) holds the far end. Footprint x -6.54..6.9 by
  // z -3.15..3.5: it fits the standard 14 x 8 pad (owner, 2026-10-04).
  // Three boxes, not one: one box round all of it would wall off the open yard between them. The
  // three small rounds are left soft on purpose.
  splittingYard: {
    url: 'assets/models/splitting-yard.glb',
    collision: {
      shape: 'box', size: [13.44, 2.5, 6.65],
      boxes: [
        { c: [-0.36, 0.53, 1.81], s: [2.58, 1.06, 1.16] },   // splitter (yawed 12°, so a little loose)
        { c: [-4.00, 0.58, 1.77], s: [4.07, 1.28, 3.02] },   // the pile of splits (a dome — corners generous)
        { c: [-4.10, 0.44, -2.90], s: [3.64, 0.87, 0.49] },  // the bundle row
        // The awning (ASSET-06 kit, composited into the yard): its four 0.06 m posts are solid,
        // the canopy and the two camp chairs are soft.
        { c: [1.55, 1.1, 3.10], s: [0.06, 2.2, 0.06] },
        { c: [1.55, 1.1, 0.60], s: [0.06, 2.2, 0.06] },
        { c: [4.55, 1.1, 3.10], s: [0.06, 2.2, 0.06] },
        { c: [4.55, 1.1, 0.60], s: [0.06, 2.2, 0.06] },
      ],
    },
  },

  // ASSET-36 kit — the firewood BUNDLE, the haul cargo (src/debris.js bundleA..C). Shrink-wrapped
  // splits, ~0.29 x 0.30 x 0.43 m, origin at the bbox centre, long axis -Z, ~11 kg. Three
  // packings so a bed of them is not copy-paste. debris.js hulls the mesh (the film is convex by
  // construction) and sets the mass, so `collision` here is documentation.
  firewoodBundleA: { url: 'assets/models/firewood-bundle-a.glb', collision: { shape: 'hull-from-mesh', size: [0.32, 0.31, 0.42] } },
  firewoodBundleB: { url: 'assets/models/firewood-bundle-b.glb', collision: { shape: 'hull-from-mesh', size: [0.29, 0.33, 0.43] } },
  firewoodBundleC: { url: 'assets/models/firewood-bundle-c.glb', collision: { shape: 'hull-from-mesh', size: [0.27, 0.30, 0.39] } },

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
    // FEAT-67: not a home — the board names the giver by the person alone ("Earl").
    giverName: 'person',
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
    giverName: 'person',   // FEAT-67: a stranded motorist, named by the person alone
  },

  // ASSET-14 — the lone gas pump, 592 tris, 2.50 x 4.55 x 1.40 m. RESHAPED BY THE OWNER
  // twice on 2026-08-22: first from "one pump on a small pad" into the roadside island in
  // the reference photo — a 4.55 m pole carrying a lit GAS sign, and at its foot TWO box
  // pumps back to back so a car can pull up on either side — then the pump itself, from
  // narrow-and-upright into the wide, squat cabinet with an overhanging chrome head whose
  // raised bezel recesses the dial under a rain hood, and finally the nozzle, from four
  // dark boxes into a real cast handheld one — body, tapered spout, open D-guard, trigger —
  // and the pole's single aimed floodlight into TWO flat luminaires on a crossbar through the
  // pole's top, one per sign face, each tilted to throw down the sign's length onto the letters.
  // The sign box itself is BLACK with a white face — cream-on-cream gave the board no boundary.
  // Six materials, one 512x512 atlas carrying the word GAS and the gauge face. Head casing,
  // bezel and nozzle all share PumpMetal (owner ruling: the frame is the handle's metal).
  gasPump: {
    url: 'assets/models/gas-pump.glb',
    // ISLAND AND PUMPS ONLY, up to the head's hood at 1.42 m. The pole above that is 0.13 m of
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

  // ASSET-31 — ROAD FURNITURE: seven Californian roadside signs on a timber 4x4.
  // 52 tris each, three materials (SignPost / SignBack / SignFace), one 512x512 baked face
  // per sign. Built by ONE generator, assets/models/src/road-signs.py — the steel-drum
  // packaging: a variant is a .glb of its own, so a spawner brings in one sign, not a set.
  //
  // THE PLACEMENT RULE, AND IT IS THE WHOLE RISK OF THIS ASSET (ASSET-31's own warning):
  // A SIGN THAT LIES IS WORSE THAN NO SIGN. A curve warning on a straight, or a left-curve
  // sign on a right bend, teaches the player that their instruments are untrustworthy. The
  // road system already knows the truth — the router prices curvature as k^2 and the
  // centerline carries real min-radius and honest 1-D EMA grade — so these must be DERIVED
  // FROM THE ROUTED CENTERLINE, never scattered. signCurves reads minR on the run ahead;
  // signGrade reads the grade profile; signTee / signCross read the node degree ahead;
  // signStop belongs at a junction the player must actually stop at. signRockslide and
  // signIcy are the two with no geometric truth behind them yet — they are terrain/weather
  // claims, so leave them out until something can vouch for them.
  //
  // NO POOL TAG. 'roadSign' would be a pool of things scattered at random, which is exactly
  // the mistake above. Placement is a separate ticket and it is a road-geometry query, not a
  // scatter. Reachable meanwhile via spawnModel('signStop') etc.
  //
  // Collision is the POST ONLY and it is knockable — the blank is 12 mm of sheet 1.6 m up,
  // and clipping it should cost a mirror, not stop a truck.
  signGrade: { url: 'assets/models/sign-grade.glb', collision: SIGN_POST_BOX },
  signCurves: { url: 'assets/models/sign-curves.glb', collision: SIGN_POST_BOX },
  signRockslide: { url: 'assets/models/sign-rockslide.glb', collision: SIGN_POST_BOX },
  signTee: { url: 'assets/models/sign-tee.glb', collision: SIGN_POST_BOX },
  signCross: { url: 'assets/models/sign-cross.glb', collision: SIGN_POST_BOX },
  signStop: { url: 'assets/models/sign-stop.glb', collision: SIGN_POST_BOX },
  signIcy: { url: 'assets/models/sign-icy.glb', collision: SIGN_POST_BOX },

  // ASSET-22 — ROAD FURNITURE: the rural mailbox, ELEVEN flavours. 132–248 tris each (budget
  // 250, hard — this is the most-repeated object in the game), 2–6 flat materials, NO TEXTURES.
  // One generator, assets/models/src/mailbox.py, the steel-drum packaging: a flavour is a .glb
  // of its own, so a spawner brings in one mailbox, not a set.
  //
  // WHY ELEVEN AND NOT ONE. A single mailbox repeated down a road reads as a metronome. The kit
  // spends its variety on SILHOUETTE — a bank of three, a masonry pillar, a barn, a chicken and a
  // derelict do not look like the same object at 40 m — and then on the recolour pools below,
  // which are free. SIX OF THE ELEVEN REUSE THE SAME BOX unchanged and vary only what it is
  // mounted on; only the barn and the cast one replace the box itself. The ticket's 512x256 albedo (rust at the seams, timber grain, a faint house number)
  // was DROPPED: three of those four are wear, which ART-STYLE rule 1 names as the
  // anti-pattern and gas-pump already had stripped, and the fourth is sub-pixel lettering with
  // no addressing system behind it to carry information into. Five files also cannot share one
  // image (three.js does not dedupe across .glb loads), so a texture here costs five bakes.
  //
  // THE FLAG IS AN ADDRESSABLE CHILD NODE named `Flag`, parented to the body, origin ON its
  // pivot. Down is a transform, not a second model:   flag.rotation.x = +1.35   (~77 deg,
  // blade swings rearward to +Z). The axis is node-local X and the sign is derived, not
  // eyeballed — mailbox.py's header has the working. mailboxLeaning has NO Flag node on
  // purpose (its flag is snapped off): CHECK FOR THE NODE, do not assume it.
  //
  // NO POOL TAG, and the same rule as the flamingos and the road signs applies: do not invent
  // one to make these appear. Road furniture is PLACED FROM ROAD GEOMETRY, not scattered —
  // that is FEAT-72. And ASSET-22's own warning stands: a populated route wants FEAT-59's
  // deferred InstancedMesh path first, because cloning one mailbox per driveway at 3–5 draw
  // calls each is exactly the scatter case the per-mesh path is not for. A handful placed by
  // hand to prove the asset is fine; a paper route planned around them is not, yet.
  // Reachable meanwhile via spawnModel('mailboxClassic') etc.
  //
  // CURATED RECOLOUR POOL on MailBox (owner ruling 2026-08-21, gnome precedent). Five real
  // mailbox colours, LINEAR RGB, index 0 = the authored galvanised grey. Post, flag, hardware,
  // stone and cap are all FIXED. Seven flavours share it; the pillar, chicken and cast one have
  // shorter pools of their own, and the barn is never recoloured (owner, 2026-10-01).
  mailboxClassic: {
    url: 'assets/models/mailbox-classic.glb',
    // 132 tris. 0.223 wide (the flag is the widest part) x 1.235 tall (flag tip; the BOX top
    // is at the ticket's 1.15) x 0.478 deep. Knockable set dressing, not a wall.
    collision: { shape: 'box', size: [0.223, 1.235, 0.478] },
    palette: { MailBox: MAILBOX_PAINT },
  },
  mailboxTube: {
    url: 'assets/models/mailbox-tube.glb',
    // 212 tris. Same box on a steel pipe post, with a newspaper tube slung under it — the
    // paper-route drop point that reads as one from the road, and the thing news-roll.glb
    // actually goes in. The tube is deliberately oversize (0.145 bore vs a real 0.115) and
    // wears MailBox rather than the dark hardware colour: at true size in dark it rendered as
    // a flat bar on a dark post and vanished. Its bore is dark so the mouth reads as a hole.
    collision: { shape: 'box', size: [0.223, 1.235, 0.478] },
    palette: { MailBox: MAILBOX_PAINT },
  },
  mailboxLeaning: {
    url: 'assets/models/mailbox-leaning.glb',
    // 148 tris. The derelict: post canted on two axes and sitting 54 mm low, box dented and
    // crooked, door hanging open past horizontal over a real recessed cavity, flag snapped to
    // a bracket stub. NO `Flag` NODE.
    //
    // COLLISION IS THE BODY ONLY, 0.48 deep — NOT the 0.586 the bounding box reports. The
    // extra 106 mm is the door dangling in mid-air; boxing it would put an invisible wall out
    // over the road for a 12 mm sheet of steel you should be able to clip.
    collision: { shape: 'box', size: [0.285, 1.085, 0.480] },
    palette: { MailBox: MAILBOX_PAINT },
  },
  mailboxCluster: {
    url: 'assets/models/mailbox-cluster.glb',
    // 204 tris. Three small boxes on a shared rail between two posts — the shared-driveway
    // bank, and the multi-customer drop point ASSET-22's 2026-09-30 note anticipates ("a
    // cluster of mailboxes can serve several customers at one stop"). The one WIDE silhouette
    // in the kit, which is what breaks the rhythm of a road of single posts.
    //
    // Its three boxes use a RECESSED door (a rim ring stepping back to an inset cap) rather
    // than the proud slab the single-box flavours carry: three proud doors do not fit in 250
    // tris, and at a bank's viewing distance the rim shadow reads better than the slab edge.
    // One flag up, one snapped to a stub, one bare — the `Flag` node is the up one.
    collision: { shape: 'box', size: [0.840, 1.197, 0.400] },
    palette: { MailBox: MAILBOX_PAINT },
  },
  mailboxBucket: {
    url: 'assets/models/mailbox-bucket.glb',
    // 192 tris. Post set in a 5-gallon pail of concrete — the renter's fix, and
    // the cheapest thing in the kit to read as "nobody owns this place".
    collision: { shape: 'box', size: [0.268, 1.235, 0.478] },
    palette: { MailBox: MAILBOX_PAINT },
  },
  mailboxPlanter: {
    url: 'assets/models/mailbox-planter.glb',
    // 236 tris. Galvanised wash tub of flowers at the foot, a flat-capped post
    // that runs past the box (the pyramid finial read as a spike — removed
    // 2026-10-01). THE COUNTERWEIGHT TO THE
    // DERELICT: place these where a road should read as cared for.
    //
    // Its post runs straight THROUGH the box — both are closed solids, so the
    // overlap is invisible and it reads as a post standing behind the box, the
    // way the reference does.
    //
    // COLLISION IS THE TUB, 0.554 square — this is the one flavour whose
    // footprint is wider than its box, and a mailbox-sized collider would let
    // you drive through the planter.
    collision: { shape: 'box', size: [0.554, 1.235, 0.554] },
    palette: { MailBox: MAILBOX_PAINT },
  },
  mailboxBarn: {
    url: 'assets/models/mailbox-barn.glb',
    // 192 tris. A barn, cut down to the three cues that survive fog: a gable, a
    // dark roof overhanging on all four sides, and white trim on red. The
    // X-braced barn door IS the mailbox door — the gable end is the -Z face,
    // which is the opening, and that coincidence is why the silhouette works.
    //
    // NEVER RECOLOURED (owner, 2026-10-01): barn red is the only barn, so it
    // declares no palette at all.
    //
    // Walls raised 2026-10-01 (ridge 1.22 m). The flag now rides outboard of
    // the eave on a hardware standoff, so this one has a MailHardware draw call.
    collision: { shape: 'box', size: [0.303, 1.222, 0.486] },
  },
  mailboxLimb: {
    url: 'assets/models/mailbox-limb.glb',
    // 188 tris. A tree limb for the post, standard box on top — the owner's
    // call: reuse the box, change what it stands on. The limb WANDERS in x and
    // y as it rises and carries a lopped branch stub; a straight tapered
    // hexagon reads as a turned post, not as something cut out of the woodlot.
    collision: { shape: 'box', size: [0.257, 1.235, 0.478] },
    palette: { MailBox: MAILBOX_PAINT },
  },
  mailboxChicken: {
    url: 'assets/models/mailbox-chicken.glb',
    // 244 tris, the tightest fit in the kit. Jigsawn chicken cut-outs bolted to
    // a standard box — which is how the real ones are made, so flat plates thin
    // in X are both the cheap way and the honest way.
    //
    // THE WHOLE BIRD RECOLOURS WITH THE BOX: neck and tail share ChickenBody,
    // so a palette swap paints the chicken too. WHITE OR BLACK ONLY (owner,
    // 2026-10-01) — its own material and pool, authored cream. Comb and wattle reuse
    // MailFlag; beak and legs share ChickenBeak, so the one material the bird
    // added earns its draw call twice.
    //
    // 1.41 m tall — the tallest thing in the kit after the cast one. Its
    // collision is the box footprint; the bird is cut-outs you should be able
    // to clip.
    collision: { shape: 'box', size: [0.223, 1.410, 0.596] },
    palette: { ChickenBody: CHICKEN_PAINT },
  },
  mailboxFancy: {
    url: 'assets/models/mailbox-fancy.glb',
    // 248 tris, THREE MATERIALS (white casting, dark knob, flag). Rebuilt
    // 2026-10-01 from the owner's reference photo: a chunky panelled box
    // CANTILEVERED FORWARD (-Z, toward the road) off a square post on a wide
    // base sleeve, scroll bracket under it, name plaque on the lid, capped post
    // and ball above. Recolours on FancyWhite/FANCY_PAINT — white, black or
    // pewter only (owner, 2026-10-01).
    //
    // COLLISION IS THE POST AND SLEEVE ONLY. Boxes here are centred on the
    // origin with no offset, and the cantilevered box runs 0.47 m forward of
    // it - a box big enough to cover that would be solid air behind the post.
    // The mail box itself is clippable, like the chicken's cut-outs.
    collision: { shape: 'box', size: [0.188, 1.507, 0.188] },
    palette: { FancyWhite: FANCY_PAINT },
  },
  mailboxPillar: {
    url: 'assets/models/mailbox-pillar.glb',
    // 180 tris. Box on a dry-stacked stone pillar under a cast cap. The only wide dark base in
    // the kit, so it is the only flavour that reads as a PROPERTY rather than as road
    // furniture — use it where a driveway means money, not on a logging spur.
    //
    // A WALL, NOT KNOCKABLE: 0.53 x 0.50 of masonry is the one thing in this kit you should
    // not be able to drive through.
    //
    // PillarBox/PILLAR_PAINT, never the galvanised grey: grey box on grey stone
    // read as one monotone lump (owner, 2026-10-01).
    collision: { shape: 'box', size: [0.528, 1.273, 0.497] },
    palette: { PillarBox: PILLAR_PAINT },
  },
}

/** Every registry key carrying `tag`, in registry order — the pool a roster slot draws from. */
export function modelsTagged (tag) {
  return Object.keys(PROP_MODELS).filter(k => PROP_MODELS[k].tags?.includes(tag))
}
