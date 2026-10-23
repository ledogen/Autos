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
//                       Shape convention: { shape: 'box'|'hull-from-mesh'|'sphere'|'none', size: [x, y, z] m }
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
//                       file and nothing else. 'residence' = the homes a residence POI draws from.
//                       Owner ruling 2026-08-15: the per-POI choice is deterministic in the seed,
//                       and adding to a pool is ALLOWED to reshuffle which marker wears what.
//                       FEAT-71 satellite pools: 'lawnFurniture' (habitation — dresses a
//                       residence's yard) and 'yardClutter' (industry — dresses a farm's). Which
//                       pool a POI draws from is its CLASS (src/poi.js YARD_POOLS), never a slot.
//   yawOffset  number — extra yaw, in radians, applied on top of the pad yaw (which points model
//                       -Z at the road). The pad is 14 m along the road x 8 m across, so an asset
//                       whose length runs down its own -Z has only 8 m to live in unless it is
//                       turned. Default 0.
//   seat       number — FEAT-71, POI models only: metres the model slides from the pad centre AWAY
//                       from the road, so it stands at the back of the pad and leaves the road side
//                       for its yard. Default 0. The pad's corners are rounded only 1.5 m
//                       (poiPadCornerR), which is what lets a long body get back there.
//   seatAlong  number — FEAT-105, POI models only: metres the model slides along its OWN +X, for a
//                       model that stands at one end of its pad (the barn, yard beside it). Default 0.
//   pad        string — FEAT-105, POI models only: this model needs a BIGGER pad than the 14 x 8
//                       lay-by, NAMED from src/poi.js PAD_KINDS ('farm' = 22 x 11.2 m). Every model
//                       naming the same kind shares one pool of those pads, sited on their own tries;
//                       only they can hold it. Depth costs far more pads than length.
//   park       { x, z, halfX, halfZ } — ASSET-74, POI models only: the PARK box. Park with the truck
//                       inside it to be offered work — it replaces the round orange ring, and is drawn
//                       as an orange box curtain. Model frame, same convention as a slot's `drop`.
//                       Whatever else asks "is the truck parked at this POI" (FEAT-104's shop browse)
//                       reads the same box.
//   yardCount  [min, max] — FEAT-105, POI models only: how many satellites its yard takes. Default
//                       [3, 6]; a bigger yard says so.
//   yard       [{ x, z, halfX, halfZ }, ...] — FEAT-71, POI models only: the YARD, where satellites
//                       may stand. Rectangles in the MODEL's own frame (same convention as a roster
//                       slot's `drop`), on the ROAD side (owner, 2026-10-07: a yard behind the
//                       building is never seen). Generous is fine — the solver also clips every
//                       prop to the pad stadium and keeps it off the model's collision boxes.
//   yardYaw    number — FEAT-71, satellites only: yaw jitter, radians either side of "-Z faces the
//                       road". Default PI (any heading — a drum or a gnome). Small for things with
//                       a front or a grain: a chair looks at the road, a pallet squares to the house.
//   yardGroup  [min, max] — FEAT-71, satellites only: how many of this asset stand together. Real
//                       yards keep drums in twos and threes against each other, not evenly spaced.
//                       Default [1, 1].
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
  // ALSO farm yard clutter (FEAT-71) — as a static MESH only. The yard never makes a body of it; the
  // thrown-prop life above is a separate path and the two are not to be conflated (owner 2026-09-22).
  drumClosed: {
    url: 'assets/models/drum-closed.glb',
    collision: { shape: 'hull-from-mesh', size: [0.58, 0.85, 0.58] },
    tags: ['yardClutter'],
    yardGroup: [2, 3],
  },
  // ASSET-30's other two variants, static yard clutter only (FEAT-71). Same DrumPaint / DrumSteel
  // materials. Open: 316 tris, lid off, rolled rim — ticket collision cylinder r 0.29 h 0.85.
  // Crushed: 348 tris, 0.62 x 0.61 x 0.62 measured, 7° cant reseated on its contact points — the
  // ticket's box [0.58, 0.6, 0.58] under-covers the staved bulge, so this is the measured one.
  drumOpen: {
    url: 'assets/models/drum-open.glb',
    collision: { shape: 'hull-from-mesh', size: [0.58, 0.85, 0.58] },
    tags: ['yardClutter'],
    yardGroup: [1, 3],
  },
  drumCrushed: {
    url: 'assets/models/drum-crushed.glb',
    collision: { shape: 'box', size: [0.62, 0.61, 0.62] },
    tags: ['yardClutter'],
  },
  // ASSET-29 — 55-gallon HDPE barrel, 348 tris, 0.585 x 0.892 m, base-seated. BarrelBlue (the
  // recolour hook, unused — blue is the only plastic barrel) + BarrelBung. Ticket collision is a
  // cylinder r 0.29 h 0.89, 9 kg empty, recorded as its box; inert until dynamic props (FEAT-36).
  barrelPlastic: {
    url: 'assets/models/barrel-plastic.glb',
    collision: { shape: 'box', size: [0.585, 0.892, 0.585] },
    tags: ['yardClutter'],
    yardGroup: [1, 3],
  },

  // ASSET-27 — timber stringer pallet, empty. 268 tris, 1.00 x 0.145 x 1.20 m (stringers along -Z,
  // forks enter across X), base-seated; stacks flush at y = 0.145. One material (PalletWood) with
  // per-board vertex-colour tints, no textures. 20 kg (the pallet convention in cargo.md; the small one is 12).
  pallet: {
    url: 'assets/models/pallet.glb',
    collision: { shape: 'box', size: [1.00, 0.145, 1.20] },
    tags: ['yardClutter'],
    yardYaw: 0.15,   // squared to the yard, not strewn
    yardGroup: [1, 2],
  },
  // Small variant (owner, 2026-10-07) — 0.80 x 0.145 x 0.80 m, 244 tris, five top boards, same
  // construction, same pallet.py kit. The base for small freight (first user: ASSET-72's propane
  // 4-pack, which looked lost on the full pallet). Same height, so it stacks flush on itself.
  palletSmall: {
    url: 'assets/models/pallet-small.glb',
    collision: { shape: 'box', size: [0.80, 0.145, 0.80] },
  },

  // ASSET-28 / ASSET-68 — slatted wooden crates, one generator (assets/models/src/crate.py), four
  // .glb. Base-seated, stack flush. One material (CrateWood) with per-board vertex-colour tints;
  // the -fragile variants add one 512x512 image carrying only the FRAGILE / HANDLE WITH CARE
  // stencil (on the -Z and +Z faces). Small: 240 tris, 4 per pallet (2x2). Large: 300 tris, a
  // 0.81 m cube, 1 per pallet. mass_kg 18 / 45, inert until dynamic props (FEAT-36).
  // The plain two are farm yard clutter (FEAT-71); the FRAGILE stencil reads as freight in transit,
  // so those stay cargo only.
  smallCrate: { url: 'assets/models/small-crate.glb', collision: { shape: 'box', size: [0.58, 0.45, 0.45] },
    tags: ['yardClutter'], yardYaw: 0.3, yardGroup: [1, 3] },
  smallCrateFragile: { url: 'assets/models/small-crate-fragile.glb', collision: { shape: 'box', size: [0.58, 0.45, 0.45] } },
  largeCrate: { url: 'assets/models/large-crate.glb', collision: { shape: 'box', size: [0.81, 0.81, 0.81] },
    tags: ['yardClutter'], yardYaw: 0.3, yardGroup: [1, 2] },
  largeCrateFragile: { url: 'assets/models/large-crate-fragile.glb', collision: { shape: 'box', size: [0.81, 0.81, 0.81] } },
  testRock: {
    url: 'assets/models/test-rock.glb',
    collision: { shape: 'hull-from-mesh', size: [0.44, 0.4, 0.36] },
  },

  // ASSET-01 — pink lawn flamingo, two poses, 358 / 344 tris.  Lawn furniture:
  // scatter these WITH a POI, never on bare ground (ticket rule — without an
  // anchor a flamingo reads as litter, not habitation).
  //
  // 'lawnFurniture' — the FEAT-71 yard scatter, which only ever places them
  // inside a residence's yard.  Do NOT tag them residence: a flamingo is not a home.
  flamingoUp: {
    url: 'assets/models/flamingo-a.glb',
    // Head up, the tall alert pose.  0.16 wide x 0.87 tall x 0.49 long, the
    // length running down -Z (beak at z -0.278, tail at +0.216).  Knockable set
    // dressing, not a wall.
    collision: { shape: 'box', size: [0.16, 0.87, 0.50] },
    tags: ['lawnFurniture'],
    yardGroup: [1, 2],   // flamingos come in pairs
  },

  // ASSET-01 — the grazing pose.  SHORTER but LONGER: the neck swings forward
  // and down, so it is only 0.59 tall but reaches 0.73 along -Z — the longest
  // thing in this registry relative to its height.  Sized from the GLB, not
  // copied from its sibling.
  flamingoDown: {
    url: 'assets/models/flamingo-b.glb',
    collision: { shape: 'box', size: [0.16, 0.59, 0.73] },
    tags: ['lawnFurniture'],
    yardGroup: [1, 2],
  },

  // ASSET-24 — the player's campfire.  472 tris, 0.708 x 0.378 x 0.675 m, four
  // flat materials, no textures.  CAMP GEAR, not lawn furniture: it renders at
  // the player's own campsite under items.md's visible-kit rule, and per that
  // doc the bedroll-and-campfire is the DEFAULT camp with no modifier — so this
  // is on screen every night of a 12-day run.
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
  // 'lawnFurniture' — consumed by the FEAT-71 yard scatter (src/poi.js dressYard).
  // Do NOT add 'residence': a grill is not a home.
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

  // ASSET-05 — 20 lb exchange propane cylinder. 330 tris, 0.31 m dia x 0.46 m OVERALL (collar
  // included — owner 2026-10-07; the ticket's "excl. collar" stood it 1.8x its diameter).
  // Base-seated, valve outlet faces -Z through a collar window. Three materials, no textures:
  // TankPaint (off-white, deliberately NO palette — owner 2026-10-07), ValveBrass, TankDark (foot
  // ring + handwheel). ASSET-72's freight 4-pack reuses this mesh, so keep material names stable.
  // The ticket authored a cylinder (r 0.16, h 0.46, 17 kg full) — recorded as its bounding box
  // here because the registry convention is box/capsule; mass inert until dynamic props (FEAT-36).
  propaneTank: {
    url: 'assets/models/propane-tank.glb',
    // Both pools: a spare cylinder by the grill at a house, a row of them at a farm.
    tags: ['lawnFurniture', 'yardClutter'],
    collision: { shape: 'box', size: [0.31, 0.46, 0.31] },
    yardGroup: [1, 2],
  },

  // ASSET-06 kit — the folding camp chair, 160 tris, ChairFrame + ChairFabric, built by
  // lawn-furniture.py beside the awning. 0.67 x 1.01 x 0.67 m measured (z -0.28..0.40 — the back
  // leans to +Z, so the sitter faces -Z) — RESCALED x1.1 by the owner 2026-10-07 (CH_SCALE), and
  // splitting-yard.glb re-exported the same day so its two composited chairs match. No collider
  // there either.
  // Lawn furniture (FEAT-71): it faces the road, as someone sat out front watching it would.
  campChair: {
    url: 'assets/models/camp-chair.glb',
    collision: { shape: 'none', size: [0.672, 1.014, 0.672] },
    tags: ['lawnFurniture'],
    yardYaw: 0.5,
    yardGroup: [1, 2],
  },

  // ASSET-72 — propane 4-pack on the SMALL pallet, freight cargo (FEAT-96, strapped to the bed).
  // 1692 tris; 0.80 x 0.61 x 0.81 m — the two straps wrap 5 mm past the deck ends (Z) and over
  // the collars. Composited by propane-pallet.py from propane-tank.py + pallet.py (re-export it
  // after changing either): 2 x 2 tanks, outlets -Z, two straps over the collars and back through
  // the fork tunnels. One mesh, four materials (PalletWood + the tank's three), no textures.
  // Same model full or empty: 80 kg full / 43 empty (4 x 16.8 or 4 x 7.7, + the 12 kg small pallet;
  // cargo.md, as built), inert until
  // dynamic props (FEAT-36).
  propanePallet: {
    url: 'assets/models/propane-pallet.glb',
    collision: { shape: 'box', size: [0.80, 0.61, 0.81] },
  },

  // ASSET-02 — ceramic garden gnome, 500 tris, the classic STANDING lawn
  // ornament: boots, belted coat, beard over the chest, tall red hat.  Lawn
  // furniture, same rule as the flamingos: scatter WITH a POI, never on bare
  // ground.  'lawnFurniture' (FEAT-71), never 'residence'.
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
    // 0.412 wide x 0.800 tall x 0.330 deep, measured off the GLB — RESCALED x2
    // by the owner 2026-10-07 (gnome.py SCALE; it was the ticket's 0.40 m
    // figure).  THE MODEL IS NOT SYMMETRIC: the pose puts weight
    // on one leg, bends one arm to the belt and hangs the other at the hip.
    // X happens to come out even at -0.206 .. +0.206; Z is where the pose
    // shows, running -0.190 .. +0.140 (the nose and boot toes reach forward,
    // i.e. -Z).  This box is a size, not a centred extent, so it over-covers on
    // one side — the right way round for knockable set dressing.
    collision: { shape: 'box', size: [0.412, 0.800, 0.330] },
    tags: ['lawnFurniture'],
    yardYaw: 0.5,   // faces the road, like the chair (owner 2026-10-07)
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

  // ASSET-03 — segmented beach ball, 252 tris, 0.80 m across (RESCALED x2 by the
  // owner 2026-10-07 — beach-ball.py RADIUS 0.40; the ticket's ball was 0.40).  Six vertical
  // gores as five flat material slots, no texture (the ticket offers per-panel
  // slots as its own alternative and ART-STYLE rule 1 prefers it).
  //
  // *** ORIGIN IS THE SPHERE CENTRE, NOT BASE-SEATED. ***  Every other model in
  // this registry sits on y = 0; this one straddles it, because it is meant to
  // be simulated (FEAT-36) and a rigid body spins about its origin.  Anything
  // placing it statically MUST lift it by 0.40 or it sinks to its equator.
  //
  // mass_kg / restitution are inert until dynamic prop physics exists — carried
  // now so nothing is re-plumbed later, per FEAT-59's rule.  EVERY vertex sits
  // exactly on the r=0.40 sphere, so the visual is perfectly inscribed in its
  // collider and can never interpenetrate whatever it rests on.
  beachBall: {
    url: 'assets/models/beach-ball.glb',
    collision: {
      shape: 'sphere', radius: 0.40, size: [0.80, 0.80, 0.80],
      mass_kg: 0.15, restitution: 0.75,
    },
    // FEAT-71 lifts a sphere-shaped satellite by its radius (dressYard), per the note above.
    tags: ['lawnFurniture'],
  },

  // ── POI markers ───────────────────────────────────────────────────────────────────────────
  // The homes carry the 'residence' tag, so the roster's five residence slots draw from both.

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
    tags: ['residence'],
    // FEAT-71. Seated 1.7 m back: the rear wall (z +1.93) then stands 0.37 m off the pad's back
    // edge and the rear corners clear the 1.5 m pad corner by 0.18 m. The yard is the road side,
    // in two strips either side of the stoop (x 0.47..1.63, z -2.65..-2.0, measured off the GLB),
    // so the path from the door to the road stays clear. Front wall at z -1.93 incl. the eaves;
    // the pad's road-side edge is at model z -5.7.
    seat: 1.7,
    yard: [
      { x: -3.325, z: -3.875, halfX: 3.575, halfZ: 1.825 },
      { x:  4.375, z: -3.875, halfX: 2.525, halfZ: 1.825 },
    ],
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

  // ASSET-09 — Winnebago RV, 1818 tris. Somebody living out of it: a residence.
  winnebago: {
    url: 'assets/models/winnebago.glb',
    // 8.0 m long x 2.4 m body width x 3.14 m tall; length runs down -Z (the cab faces -Z).
    collision: { shape: 'box', size: [2.4, 3.2, 8.0] },
    // PARKED BROADSIDE, not nose-to-the-road. Unturned, its 8 m length would run ACROSS the pad's
    // 8 m width — nose exactly on the shoulder edge, zero margin, and every RV in the region
    // pointed at the tarmac like a row of cannons. Turned a quarter, the 8 m lies along the pad's
    // 14 m and only 2.4 m crosses it, which is also how a real one parks in a lay-by.
    yawOffset: Math.PI * 0.5,
    tags: ['residence'],
    // FEAT-71. Turned broadside, the model's +X is its RIGHT flank — the entry-door side on a US RV
    // — and it faces the road; the pad's back edge is model -X. Seated 2.2 m back, the far side
    // (mirrors at x -1.46) stands 0.34 m off the back edge and the yard is the strip between the
    // road-side flank and the pad's road edge (model x 6.2), clear of the mirrors.
    seat: 2.2,
    yard: [{ x: 3.9, z: 0, halfX: 2.3, halfZ: 6.9 }],
  },

  // ASSET-18 — broken-down car, 2464 tris (BrokenCar + BrokenCarGlass). The stranded motorist's
  // model (src/poi.js names it directly): it already tells you what the job is.
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
    // 'gasPump' IS A POOL OF ITS OWN, NOT 'residence' (owner ruling 2026-08-22): this POI is not a
    // home, it sells you fuel. FEAT-50 (owner, 2026-10-16) made it the src/poi.js gasPump slot — the
    // lone pump, four to a region — and NOT the gas station, which is a store with pumps (ASSET-13,
    // tag 'gasStation'). Do not re-tag it residence, or gasStation, to make it appear elsewhere.
    tags: ['gasPump'],
    // FEAT-50 PUMP ZONES — pull alongside and pull the handbrake to use the pump. One per side of
    // the island, model-local (+X along the island and the road, -Z toward the road — the same
    // frame as the general store's `park` box). Each takes the 4.6 x 1.85 m truck with slack: the
    // inner edge (|z| 0.95) stands 0.25 m off the island's collision face (|z| 0.70) so a mirror
    // clears it, the outer edge (|z| 2.95) stays inside the pad's 4 m half-width, and the length is
    // centred on the pumps (x +0.28), not on the pole. ASSET-13 authors its own for its islands.
    pumpZones: [
      { x: 0.28, z: -1.95, halfX: 2.6, halfZ: 1.0 },   // road side — the first pump's face (-Z)
      { x: 0.28, z:  1.95, halfX: 2.6, halfZ: 1.0 },   // far side — the back-to-back pump
    ],
  },

  // ASSET-66 — the farm BARN, 708 tris, 4 materials, 0 images. Gambrel roof, closed sliding
  // double doors + hayloft door on the gable, which faces -Z (the road). Walls 9.0 wide (X) x
  // 12.0 deep (Z), ridge 8.0; the roof overhang makes it 10.0 x 12.7 overall.
  // BODY ONLY: walls + plinth, up to the ridge. The roof overhang is left out (nothing drives
  // under a 3.7 m eave), and the box is loose over the upper roof corners, which only a flying
  // truck reaches.
  // THE FARM POI's model (src/poi.js farm slot), until FEAT-96 composites the farm (with ASSET-65/67 +
  // the produce stall). No pool tag — the slot names it — and do not tag it 'residence' to make it
  // appear anywhere else. Two entries, one .glb: how it stands depends on the pad it got.
  //
  // `barn` — ON ITS OWN FARM PAD (FEAT-105, owner 2026-10-08): 22 m along the road x 11.2 m deep,
  // the 'farm' pad kind (src/poi.js PAD_KINDS), shared with the general store. Gable — the doors — to the road, standing at one
  // end of the pad with the YARD BESIDE IT; length along the road is the cheap axis (roads follow
  // contours, so the ground slopes ACROSS them), which is why the pad grows long, not deep.
  //   seat 0.75: front wall 0.3 m inside the pad's road edge; back wall 1.2 m past its far edge,
  //   inside the 1.6 m band the carve grades flat beyond every pad (road-carve.js PAD_RIM_HOLD).
  //   seatAlong -5.5: the barn spans pad u -10.05..-0.95 of ±11, its front corners inside the
  //   1.5 m pad corner rounding, its back corners 1.26 m into the rim band.
  //   yard: road-side ground beside the barn, ~11.5 x 6.3 m (the pad centre is at model x +5.5,
  //   z -0.75), dressed with 5–9 clutter props.
  barn: {
    url: 'assets/models/barn.glb',
    collision: { shape: 'box', size: [9.1, 8.0, 12.1] },
    pad: 'farm',
    seat: 0.75,
    seatAlong: -5.5,
    yard: [{ x: 10.725, z: -3.225, halfX: 5.775, halfZ: 3.125 }],
    yardCount: [5, 9],
  },
  // `barnBroadside` — THE FALLBACK, on a 14 x 8 lay-by when a region has no spot for a farm pad
  // (owner 2026-10-08). Quarter-turned, its 12.1 m length lies along the pad's 14 m and only 9.1 m
  // crosses it; seated 0.6 m back, the front wall sits 0.05 m inside the pad's road edge and the
  // back wall 1.15 m into the rim band. The doors face up or down the road, and it fills the pad,
  // so it has NO YARD and no clutter.
  barnBroadside: {
    url: 'assets/models/barn.glb',
    collision: { shape: 'box', size: [9.1, 8.0, 12.1] },
    yawOffset: Math.PI * 0.5,
    seat: 0.6,
  },

  // ASSET-15 — the PRODUCE STALL, 1752 tris, 12 materials, one baked 512x384 sign. A towable trailer:
  // deck x -1.50..1.50, frame and tyres z ±1.13, the drawbar runs on to x +2.54 and the sign stands at
  // x +1.54..2.70 (measured off the GLB). Serving face and sign to -Z (the road), length along +X, so
  // it lies along a lay-by with no yawOffset.
  // ITS OWN FARM POI (FEAT-74, owner 2026-10-16): one of the three farm slots (src/poi.js), on an
  // ordinary lay-by — the player imagines the farmhouse just off the road. No pool tag: the slot
  // names it, the barn's precedent.
  // DECK MASS ONLY: frame, deck and crates up to 1.0 m. The drawbar, the sign and the roof are left
  // soft, so a mirror clip on them doesn't stop the truck dead.
  //   seat 2.0: the back of the frame (z +1.13) stands 0.87 m inside the pad's back edge.
  produceStall: {
    url: 'assets/models/produce-stall.glb',
    collision: { shape: 'box', size: [3.0, 1.0, 2.26] },
    seat: 2.0,
  },

  // ASSET-74 — the GENERAL STORE, 1062 tris, 5 materials, one 512x512 atlas (the hand-lettered
  // "Country Store" board, the ICE placard and the ice chest's two flat colours). Stucco walls under a
  // red board-and-batten gable, door and sign to -Z (the road), an ice chest on the +X concrete stoop.
  // The sign is generic on purpose: any named store stands on it.
  // Built by assets/models/src/general-store.py, which prints `seat` and `park` — copy them across.
  //
  // ON THE FARM PAD (owner, 2026-10-08), shared with the barn. You park on the BARE GRADED PAD in
  // front — no asphalt, no lines, no curb (owner, 2026-10-09: a paved lot did not fit the place).
  // seat 3.85 puts the park box's front edge ON the pad's road edge: you pull straight off the road
  // and reverse back out onto it. The back wall then stands 1.0 m (the rake 1.3 m) past the pad's far
  // edge, inside the 1.6 m band the carve grades flat (PAD_RIM_HOLD) — the barn's precedent. The
  // 0.15 m stoop is not a collider, like the barn's plinth.
  //
  // Two boxes: the walls to the ridge (rake and eaves left out), and the ice chest with its placard.
  // The chest needs its own: a pickup nosed up to the stoop overhangs it to within ~0.2 m of the
  // chest, and one box round both would wall off the stoop.
  generalStore: {
    url: 'assets/models/general-store.glb',
    collision: {
      shape: 'box', size: [7.1, 5.0, 5.6],
      boxes: [
        { c: [0, 2.5, 0], s: [7.1, 5.0, 5.6] },              // walls to the ridge
        { c: [3.55, 1.225, -3.305], s: [1.9, 2.15, 0.87] },  // ice chest + placard, on the apron
      ],
    },
    pad: 'farm',
    seat: 3.85,
    // 13.5 x 4.95 m: five pickups, road edge to 5 cm short of the stoop — flush with it, the
    // translucent curtain z-fights the concrete.
    park: { x: 0, z: -6.975, halfX: 6.75, halfZ: 2.475 },
  },

  // ASSET-13 — the GAS STATION, 1482 tris, 7 materials, one 1024x512 atlas (FOOD MART, GAS x3, ICE,
  // PROPANE, the pump register face). The station IS the convenience store (FEAT-123, owner 2026-10-16).
  // Layout by the owner (2026-10-19): the store at the back, ONE island right in front of its doors with
  // a lane either side running ALONG the street, so you drive straight through; two nose-in storefront
  // bays beside the store's +X end wall; one concrete slab, road edge to the store's back wall, under it all.
  // Built by assets/models/src/gas-station.py, which prints every number below — copy them across.
  //
  // ON THE FARM PAD (22 x 11.2 m), the big-pad kind it shares with the general store and the barns; a
  // region with no spot for one stands the placeholder cube on a lay-by (the slot's fallbackModel null).
  //   seat 0.6: the slab's road edge (model z -6.2) ON the pad's road edge (5.6). The store's back wall
  //   then stands 1.2 m past the far edge, inside the 1.6 m band the carve holds at pad depth
  //   (road-carve.js PAD_RIM_HOLD) — the barn's precedent.
  //   seatAlong -2.4: the slab (model x -5.5..10.3) centred on the pad, 3.1 m bare at each end.
  //
  // MATERIALS. StationFascia (white) and StationAccent (red) are the brand — recolourable, no palette
  // declared yet (nothing passes a variant). StationLamp (six soffit lenses) and StationSign (every
  // lettered face) are the NIGHT HOOKS: unlit in the file (ticket rule — no glow baked in); attach lights
  // / emissive at placement.
  //
  // COLLISION, per part, so the forecourt is DRIVABLE — never one box. The canopy (soffit 4.6 m, 2.8 m
  // over the truck), the slab, the stoop and the painted bays are not colliders.
  gasStation: {
    url: 'assets/models/gas-station.glb',
    collision: {
      shape: 'box', size: [9.0, 4.58, 5.0],
      boxes: [
        { c: [0, 2.29, 3.7], s: [9.0, 4.58, 5.0] },          // the store, to the coping
        { c: [0, 0.95, -3.0], s: [5.0, 1.9, 1.2] },          // the island, up to the pump's head
        { c: [-1.8, 2.3, -3.0], s: [0.5, 4.6, 0.5] },        // canopy post (collar width)
        { c: [1.8, 2.3, -3.0], s: [0.5, 4.6, 0.5] },         // canopy post
        { c: [3.63, 1.092, 0.7], s: [1.5, 2.184, 0.8] },     // ice chest + placard, on the stoop
        { c: [-3.7, 1.0, 0.72], s: [1.3, 2.0, 0.8] },        // propane cage + placard, on the stoop
      ],
    },
    pad: 'farm',
    seat: 0.6,
    seatAlong: -2.4,
    // FEAT-50 PUMP ZONES — one per lane, each side of the island (gasPump's convention: inner edge
    // 0.25 m off the island's collision face, the 4.6 x 1.85 m truck with slack). Each keeps 0.35 m to
    // the pad's road edge / the stoop face.
    pumpZones: [
      { x: 0, z: -4.85, halfX: 2.6, halfZ: 1.0 },   // road-side lane
      { x: 0, z: -1.15, halfX: 2.6, halfZ: 1.0 },   // store-side lane, in front of the doors
    ],
    // FEAT-123 STOREFRONT — the two bays, line to line (2.55 x 6.0 m each). 2.3 m along the road from
    // both pump zones, so parking for the shop never trips the pump; entered from the store-side lane.
    park: { x: 7.45, z: 2.8, halfX: 2.55, halfZ: 3.0 },
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

  // ---- 2026-10-10 promotion: the overnight review batch (36 models, 12 generators in src/). Measured off the
  // GLBs; cargo boxes are the LOAD without its straps (every strap runs out to the bed tie-downs at x = ±0.70,
  // so a strapped model's own bbox is 1.4 m wide). Untagged unless a live pool is its role: lawn furniture
  // goes to FEAT-71's pool; camp gear waits for FEAT-66, yard dressing for FEAT-91/74, bed cargo is listed
  // by data/freight.js (FEAT-96/97) and loose haul by FEAT-88 — never re-tag to make one appear.

  // ASSET-07 — potted plant, 324 tris. Thirteen geometry leaves on stems out of an 8-sided pot (no alpha cards,
  // ART-STYLE rule 7). The box is the POT; the leaves clip.
  pottedPlant: { url: 'assets/models/potted-plant.glb', collision: { shape: 'box', size: [0.32, 0.69, 0.32] }, tags: ['lawnFurniture'] },
  // ASSET-08 — brick fire ring, 644 tris, footing 3 cm below grade. One log pokes 13 cm past the ring; the box is
  // the ring, the log is clippable.
  firePit: { url: 'assets/models/fire-pit.glb', collision: { shape: 'box', size: [1.05, 0.33, 1.05] }, tags: ['lawnFurniture'] },
  // ASSET-12 — lumber yard kit, sawmill dressing (FEAT-91; pools FEAT-74). One generator, src/lumber.py, shared
  // with ASSET-38. Boards are modelled, ends in LumberEnd. Offcut pile was settled by a rigid-body sim and baked.
  lumberStack: { url: 'assets/models/lumber-stack.glb', collision: { shape: 'box', size: [1.30, 0.68, 4.05] } },   // 792 tris, 60 boards in two stickered units, no straps (a loose yard stack); no recolour hook
  timberRack: { url: 'assets/models/timber-rack.glb', collision: { shape: 'box', size: [5.19, 2.50, 1.50] } },   // 552 tris, orange three-post cantilever rack, timbers across the arms; no recolour hook
  offcutPile: { url: 'assets/models/offcut-pile.glb', collision: { shape: 'box', size: [2.50, 0.42, 2.99] } },   // 480 tris, 40 settled pieces; no recolour hook
  // ASSET-25 / ASSET-26 — camp gear: renders at the campsite under FEAT-66's slots, not placed from here.
  cookingKit: { url: 'assets/models/cooking-kit.glb', collision: { shape: 'box', size: [1.24, 1.08, 0.82] } },   // 388 tris, two iron A-frames, crossbar, chain, Dutch oven; no recolour hook
  shadeTarp: { url: 'assets/models/shade-tarp.glb', collision: { shape: 'none', size: [3.73, 2.01, 3.53] } },   // 224 tris, 3 x 2.4 m fabric with a loose skirt on leaning poles and guy lines — drive-through; no recolour hook
  // ASSET-38 — lumber bundle (freight) and the three loose boards it was split into for haul (FEAT-88: single
  // boards as physics bodies). THE BOARDS' ORIGIN IS THE BBOX CENTRE, not base-seated — rigid bodies.
  lumberBundle: { url: 'assets/models/lumber-bundle.glb', collision: { shape: 'hull-from-mesh', size: [0.56, 0.38, 1.78] } },   // 678 tris, 54 boards (1.73 m) under three bands, 1.78 m overall with the ragged ends — fits the 1.835 m bed with the tailgate shut; no recolour hook
  board2x4: { url: 'assets/models/board-2x4.glb', collision: { shape: 'hull-from-mesh', size: [0.09, 0.04, 1.80] } },   // 12 tris, 1.8 m; no recolour hook
  board2x6: { url: 'assets/models/board-2x6.glb', collision: { shape: 'hull-from-mesh', size: [0.14, 0.04, 1.80] } },   // 12 tris; no recolour hook
  board2x8: { url: 'assets/models/board-2x8.glb', collision: { shape: 'hull-from-mesh', size: [0.18, 0.04, 1.80] } },   // 12 tris; no recolour hook
  // Bed cargo, ASSET-39..64 — freight (FEAT-96) and fragile (FEAT-97). Loads ride long-axis down -Z so the straps
  // cross the bed. The ticket budgets (200–400) were overruled by the owner 2026-10-09: ≈1000-tri floor, model the
  // actual pieces, straps double-sided over the load's hull. debris.js hulls the mesh, straps included.
  pelicanCase: { url: 'assets/models/pelican-case.glb', collision: { shape: 'hull-from-mesh', size: [1.09, 0.61, 0.51] } },   // ASSET-39, 380 tris, black ribbed rolling case, no straps; recolour hook CaseShell
  glassPanes: { url: 'assets/models/glass-panes.glb', collision: { shape: 'hull-from-mesh', size: [1.02, 1.14, 1.40] } },   // ASSET-40, 284 tris, ten panes leaning on an A-frame, the 1.4 m ridge DOWN the bed and 1.02 m across so it sits between the wheelhouses (owner 2026-10-10); no recolour hook
  ornateVase: { url: 'assets/models/ornate-vase.glb', collision: { shape: 'hull-from-mesh', size: [0.50, 0.77, 0.50] } },   // ASSET-41, 400 tris; recolour hook VaseGlaze
  uprightPiano: { url: 'assets/models/upright-piano.glb', collision: { shape: 'hull-from-mesh', size: [0.62, 1.28, 1.54] } },   // ASSET-42, 482 tris, fallboard open, keyboard to the side; no recolour hook
  sculptureA: { url: 'assets/models/sculpture-a.glb', collision: { shape: 'hull-from-mesh', size: [0.80, 1.08, 0.80] } },   // ASSET-43, 166 tris, bronze abstract on a plinth; no recolour hook
  sculptureB: { url: 'assets/models/sculpture-b.glb', collision: { shape: 'hull-from-mesh', size: [0.80, 1.54, 0.80] } },   // ASSET-43, 678 tris, marble figure, face carved into the head's own rings; no recolour hook
  framedArtwork: { url: 'assets/models/framed-artwork.glb', collision: { shape: 'hull-from-mesh', size: [0.90, 0.15, 1.20] } },   // ASSET-44, 262 tris, crated, lying face up; no recolour hook
  xrayMachine: { url: 'assets/models/xray-machine.glb', collision: { shape: 'hull-from-mesh', size: [0.89, 1.74, 2.36] } },   // ASSET-45, 440 tris, lengthwise; no recolour hook
  softDrinkPallet: { url: 'assets/models/soft-drink-pallet.glb', collision: { shape: 'hull-from-mesh', size: [1.00, 0.65, 1.20] } },   // ASSET-46, 1706 tris, one brand, kraft trays, slip sheet on top; recolour hook SodaCan
  concretePallet: { url: 'assets/models/concrete-pallet.glb', collision: { shape: 'hull-from-mesh', size: [1.00, 0.47, 1.20] } },   // ASSET-47, 2384 tris, 18 bags six a layer; recolour hook ConcreteBag
  pottingSoilPallet: { url: 'assets/models/potting-soil-pallet.glb', collision: { shape: 'hull-from-mesh', size: [1.00, 0.53, 1.20] } },   // ASSET-47, 1952 tris, yellow bags with a green end third; recolour hook SoilBag
  drumStack: { url: 'assets/models/drum-stack.glb', collision: { shape: 'hull-from-mesh', size: [1.06, 0.85, 1.66] } },   // ASSET-48, 1352 tris, four of ASSET-30's closed drums ZIGZAGGED down the bed, no pallet (owner 2026-10-11: 2 x 2 was 1.18 m across the 1.09 m arch gap) — ±0.24 m alternating at a 0.36 m pitch, one strap each; recolour hook DrumPaint
  // Longer than the bed, so they ride ANGLED (owner 2026-10-10): front edge at the headboard, underside on the
  // tailgate's top edge, the rest hanging past the gate. The mesh's forward-most point is the headboard contact and
  // its lowest point (the strap anchors) is the floor, so main.js's bbox placement lands the overhang by itself.
  railwayTies: { url: 'assets/models/railway-ties.glb', collision: { shape: 'hull-from-mesh', size: [0.75, 0.94, 2.70] } },   // ASSET-52, 72 tris, five ties 3 + 2 tilted 13.3° from the floor at the headboard onto the gate; no recolour hook
  plywoodSheets: { url: 'assets/models/plywood-sheets.glb', collision: { shape: 'hull-from-mesh', size: [1.24, 0.60, 2.46] }, floorSeated: true },   // ASSET-54, 156 tris, twelve sheets tilted 8.7° on the wheelhouse front corners and the gate — the model already stands on the arches, so `floorSeated` keeps the loader from lifting it onto them again; no recolour hook
  cinderBlockPallet: { url: 'assets/models/cinder-block-pallet.glb', collision: { shape: 'hull-from-mesh', size: [1.00, 0.71, 1.20] } },   // ASSET-55, 778 tris, 45 blocks in three courses; no recolour hook
  producePalletTomatoes: { url: 'assets/models/produce-pallet-tomatoes.glb', collision: { shape: 'hull-from-mesh', size: [1.00, 0.72, 1.20] } },   // ASSET-56, 2880 tris, eight slatted crates on one fill, whole fruit clipped at the fill; recolour hook Produce
  producePalletSquash: { url: 'assets/models/produce-pallet-squash.glb', collision: { shape: 'hull-from-mesh', size: [1.00, 0.79, 1.20] } },   // ASSET-56, 2916 tris; recolour hook Produce
  producePalletPeppers: { url: 'assets/models/produce-pallet-peppers.glb', collision: { shape: 'hull-from-mesh', size: [1.00, 0.72, 1.20] } },   // ASSET-56, 2954 tris; recolour hook Produce
  jobBox: { url: 'assets/models/job-box.glb', collision: { shape: 'hull-from-mesh', size: [0.69, 0.66, 1.29] } },   // ASSET-57, 390 tris, green jobsite chest, its 1.2 m DOWN the bed so it sits between the wheelhouses, two straps over the lid (owner 2026-10-10); recolour hook JobBoxPaint
  diningChairs: { url: 'assets/models/dining-chairs.glb', collision: { shape: 'hull-from-mesh', size: [0.53, 0.90, 0.97] } },   // ASSET-59, 448 tris, two inverted pairs; recolour hook FurnWood
  diningTable: { url: 'assets/models/dining-table.glb', collision: { shape: 'hull-from-mesh', size: [0.90, 0.75, 1.60] } },   // ASSET-60, 534 tris, top down, its 1.6 m DOWN the bed (it is wider than the bed the other way), straps across between the legs; recolour hook FurnWood
  spareTire: { url: 'assets/models/spare-tire.glb', collision: { shape: 'hull-from-mesh', size: [0.73, 0.24, 0.73] } },   // the inventory spare's thumbnail model (assets/models/src/items.py export_glb), 2802 tris, P235/75R15 on a steel wheel LYING FLAT — its rest pose; the stranded motorist's loose bed load
  tireStack: { url: 'assets/models/tire-stack.glb', collision: { shape: 'hull-from-mesh', size: [1.00, 0.99, 1.33] } },   // ASSET-61, 2136 tris, two stacks of four on a pallet; no recolour hook
  gardenFountain: { url: 'assets/models/garden-fountain.glb', collision: { shape: 'hull-from-mesh', size: [1.04, 0.89, 1.04] } },   // ASSET-62, 570 tris, column in a nested basin; no recolour hook
  wardrobe: { url: 'assets/models/wardrobe.glb', collision: { shape: 'hull-from-mesh', size: [0.71, 2.00, 1.28] } },   // ASSET-63, 344 tris, STANDING 2 m — the high-CG load; recolour hook FurnWood
  fullLengthMirror: { url: 'assets/models/full-length-mirror.glb', collision: { shape: 'hull-from-mesh', size: [0.64, 1.70, 0.61] } },   // ASSET-64, 72 tris, leaning 7° on its kickstand, glass to the tailgate (owner 2026-10-10); no recolour hook
  // Palletised singles (FEAT-96, owner 2026-10-10): the freight list's drum, barrel and crates as ONE item on a
  // pallet under two straps, so each is a real bed load. The bare drumClosed / barrelPlastic / smallCrate /
  // largeCrate above are untouched for mixes and yard dressing. assets/models/src/freight-pallet.py.
  drumPallet: { url: 'assets/models/drum-pallet.glb', collision: { shape: 'hull-from-mesh', size: [0.80, 1.00, 0.80] } },   // 592 tris, closed drum on the small pallet; recolour hook DrumPaint
  barrelPallet: { url: 'assets/models/barrel-pallet.glb', collision: { shape: 'hull-from-mesh', size: [0.80, 1.04, 0.80] } },   // 612 tris, blue HDPE barrel on the small pallet; recolour hook BarrelBlue
  smallCratePallet: { url: 'assets/models/small-crate-pallet.glb', collision: { shape: 'hull-from-mesh', size: [0.80, 0.60, 0.80] } },   // 496 tris, one small crate on the small pallet; no recolour hook
  largeCratePallet: { url: 'assets/models/large-crate-pallet.glb', collision: { shape: 'hull-from-mesh', size: [1.00, 0.96, 1.20] } },   // 580 tris, the 0.81 m crate on the full pallet; no recolour hook
}

/** Every registry key carrying `tag`, in registry order — the pool a roster slot draws from. */
export function modelsTagged (tag) {
  return Object.keys(PROP_MODELS).filter(k => PROP_MODELS[k].tags?.includes(tag))
}
