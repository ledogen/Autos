// Mission-board content tables (FEAT-67). Data only — no logic, no imports.
// OWNER-AUTHORED lists (THINGS, REWARDS); SOURCES carries the numbers ruled 2026-09-26.
// Names live in data/offer-names.js. The rules these tables feed are in
// .planning/todos/pending/feat-67-visible-offer-board.md.
//
// ── FAMILIES ────────────────────────────────────────────────────────────────────────────────
// Every thing belongs to one mission family. The family sets the diamond colour and how the job
// is graded and paid:
//   delivery   — light, all about time; par pay                   (green)
//   fragile    — graded on shock to the load; par pay             (orange)
//   papers     — Larry's paper route; prices itself (FEAT-61)     (white)
//   haul       — a load in the BED, as rigid bodies (FEAT-88). Par pay × the share of the load
//                still aboard at delivery; the max scales per piece (HAUL_* below)
//   demolition — smash the props (FEAT-65)                        (red)
//   freight    — a heavy load STRAPPED (welded) in the bed (FEAT-96). Par pay; par, and so pay,
//                grow with mass (FREIGHT_PAR_SLACK_PER_KG below)   (blue)
//
// ── RANK GATES ──────────────────────────────────────────────────────────────────────────────
// A reward's `gates` lists which offer gates it may appear under: 'C' means "C or better", … 'S'
// means S only. Put a great reward on ['S'] only; a modest one on ['C', 'B']. D never earns a
// reward, so 'D' is never a gate.

// ── Things — what gets carried ──────────────────────────────────────────────────────────────
//
//   id       stable key (lowercase, no spaces) — never rename once used
//   phrase   how the card says it: "Deb needs {phrase} delivered to …"
//   family   one of the families above
//   massKg   [min, max] — rolled per offer, shown on the card as cargo weight
//            A modelled bed load is ONE number, as built ([m, m]) — the model is fixed, so is its
//            mass (owner, 2026-10-11); the derivation of each is in cargo.md.
//   pools    which sources may post it (keys of SOURCES below)
//   fetchBy  (optional, FEAT-102) classes that post a FETCH of this thing: "go get it and bring it
//            back" — drive to a pickup, park there, return to the poster (FEAT-89's fetch shape).
//   fetchFrom (optional) the pickup classes for a fetch. Defaults to `pools` (where it comes from).
//   passenger (optional) true when the thing is the poster themselves — the card says "a ride to …"
//   load     (freight, FEAT-96) the bed load's key in data/freight.js — the model the job straps in.
//            massKg is then the load's real mass, rolled per offer.
//   shockFloorG, breakG, sound  (fragile, FEAT-97) the felt g below which the load takes no harm,
//            the g one hit needs to destroy it, and its hit sound — spread from a tier below.
//   furniture (optional, FEAT-116) true for the pieces the furniture pad protects.
//   to       (optional, FEAT-100) the POI tags it may be delivered to — a class (`farm`) or a
//            fixture tag. Absent = generic: any POI or a roadside spot (cargo.md "From → to").
//            Tagged things only ever end at a matching POI, never roadside — unless the list
//            names 'roadside' too (BUG-88): then a matching POI or a roadside spot.
//   deadlineSlack (optional, FEAT-113) the deadline as par × (1 + slack), counted from accept.
//            Absent = the family default in DEADLINE_SLACK below.

// "Any normal giver" — cargo.md's blank From (option C). Not the food vendor, the haul yard or
// Larry: each has one kind of job and posts it outside the budget (pois.md § Job supply). Not the
// office or school (they only receive) nor the motorist (they post only their own ride) — owner,
// 2026-10-07.
const ANY_GIVER = ['generalStore', 'autoShop', 'workSite', 'residence', 'farm', 'doctor']
const YARD_TRADE = ['generalStore', 'gasStation', 'farm']   // FEAT-96: the palletised singles' circuit

// Households: a residence or a farm (a farm is a residence too — it carries the tag).
const HOME = ['residence', 'farm']
// FEAT-97: the household goods — sold by the general store, or moved house to house (owner, 2026-10-15).
const HOUSEWARES = ['generalStore', 'residence']

// FEAT-97 fragility tiers, in felt g (src/fragile.js). Measured on the freight-strap rig
// (test/fragile-cargo.mjs pins them): hard paved driving peaks ~0.6 g, ±4 cm washboard at 15 m/s
// ~1.3 g, a 1 m drop at speed ~4.7 g, a rollover 6–13 g. Free fall reads 1 g, so no floor sits
// below 1 — airtime is free, the landing is what costs. A floor AT 1 g took damage constantly
// (owner, 2026-10-15): glassware and delicate were pulled toward sturdy.
const GLASSWARE = { shockFloorG: 1.15, breakG: 4.0, sound: 'glass' }  // rough road nibbles; a crest landing destroys
const DELICATE  = { shockFloorG: 1.2, breakG: 4.75, sound: 'thud' }
const STURDY    = { shockFloorG: 1.3, breakG: 5.5, sound: 'thud' }    // a crest landing costs most of it; a roll ends it

export const THINGS = [
    // FEAT-88 haul. massKg is ignored for a haul thing — the card's weight is pieces × HAUL_BUNDLE_KG,
    // because the load is real bodies and its weight is whatever they weigh. Kept so the spec
    // stream draws the same numbers for every thing.
    { id: 'firewood',   phrase: 'firewood',               family: 'haul',     massKg: [0, 0],
      pools: ['firewoodYard'] },
    { id: 'takeout',    phrase: 'two bags of takeout',    family: 'delivery', massKg: [2, 5],
      pools: ['foodVendor'], deadlineSlack: 0.5 },
    { id: 'groceries',  phrase: 'a week of groceries',    family: 'delivery', massKg: [10, 25],
      pools: ['generalStore'] },
    { id: 'medication', phrase: 'their prescription',        family: 'delivery', massKg: [0.2, 0.5],
      pools: ['generalStore'] },
    // Courier, R1 (cargo.md), one thing per row there.
    { id: 'note',       phrase: 'a private note',          family: 'delivery', massKg: [0.1, 0.1],
      pools: ANY_GIVER },
    { id: 'memo',       phrase: 'a memo from the foreman', family: 'delivery', massKg: [0.1, 0.1],
      pools: ['workSite'] },
    { id: 'lunch',      phrase: 'lunch for their partner', family: 'delivery', massKg: [1, 2],
      pools: HOME },
    { id: 'glasses',    phrase: 'much-needed reading glasses', family: 'delivery', massKg: [0.1, 0.1],
      pools: HOME },
    { id: 'luckyBoots', phrase: 'their lucky boots',       family: 'delivery', massKg: [1.5, 3],
      pools: HOME },
    { id: 'campChair',  phrase: 'a camping chair',         family: 'delivery', massKg: [3, 5],
      pools: HOME },
    // Neighbour to neighbour (owner, 2026-10-08): household → household.
    { id: 'golfClubs',  phrase: 'golf clubs',              family: 'delivery', massKg: [9, 14],
      pools: HOME, to: HOME },
    { id: 'fruitCake',  phrase: 'fruit cake',              family: 'delivery', massKg: [1, 2],
      pools: HOME, to: HOME },
    { id: 'casserole',  phrase: 'tuna casserole',          family: 'delivery', massKg: [2, 3],
      pools: HOME, to: HOME },
    { id: 'homebrew',   phrase: 'homemade beer',           family: 'delivery', massKg: [5, 10],
      pools: HOME, to: HOME },
    { id: 'woodcraft',  phrase: 'Woodcraft Vol 2.',        family: 'delivery', massKg: [0.5, 1],
      pools: HOME, to: HOME },
    { id: 'tractorKeys', phrase: 'keys for the tractor',   family: 'delivery', massKg: [0.1, 0.1],
      pools: ANY_GIVER, to: ['farm'] },
    { id: 'classNotes', phrase: 'their class notes',       family: 'delivery', massKg: [0.3, 1],
      pools: HOME, to: ['school'] },
    { id: 'deck',       phrase: 'a presentation deck',     family: 'delivery', massKg: [0.5, 1.5],
      pools: HOME, to: ['office'] },
    // A 20 lb cylinder: ~7.7 kg of steel, plus 9.1 kg of propane when full. Full ones leave the
    // store or a gas station; empties go back to either from anywhere (owner, 2026-10-07).
    { id: 'propaneFull',  phrase: 'a full 20 lb propane tank',  family: 'delivery', massKg: [16, 18],
      pools: ['generalStore', 'gasStation'] },
    { id: 'propaneEmpty', phrase: 'an empty 20 lb propane tank', family: 'delivery', massKg: [7, 9],
      pools: ANY_GIVER.filter(k => k !== 'generalStore'), to: ['generalStore', 'gasStation'] },
    // General-store sundries (owner, 2026-10-07): store → anyone. They are also the tackle shop's
    // jobs — as FETCH (FEAT-102): go get them from the store and bring them back.
    { id: 'lightbulbs',   phrase: 'a box of lightbulbs',     family: 'delivery', massKg: [0.4, 0.8],
      pools: ['generalStore'], fetchBy: ['tackleShop'] },
    { id: 'screws',       phrase: 'a box of screws',         family: 'delivery', massKg: [0.5, 1.5],
      pools: ['generalStore'], fetchBy: ['tackleShop'] },
    { id: 'nails',        phrase: 'a box of nails',          family: 'delivery', massKg: [1, 3],
      pools: ['generalStore'], fetchBy: ['tackleShop'] },
    { id: 'ductTape',     phrase: 'a roll of duct tape',     family: 'delivery', massKg: [0.3, 0.5],
      pools: ['generalStore'], fetchBy: ['tackleShop'] },
    { id: 'paperTowels',  phrase: 'a pack of paper towels',  family: 'delivery', massKg: [1, 2],
      pools: ['generalStore'], fetchBy: ['tackleShop'] },
    { id: 'toiletPaper',  phrase: 'a pack of toilet paper',  family: 'delivery', massKg: [2, 4],
      pools: ['generalStore'], fetchBy: ['tackleShop'] },
    { id: 'rope',         phrase: 'a coil of rope',          family: 'delivery', massKg: [2, 5],
      pools: ['generalStore'], fetchBy: ['tackleShop'] },
    { id: 'string',       phrase: 'a ball of string',        family: 'delivery', massKg: [0.1, 0.3],
      pools: ['generalStore'], fetchBy: ['tackleShop'] },
    { id: 'paper',        phrase: 'a ream of paper',         family: 'delivery', massKg: [2.3, 2.6],
      pools: ['generalStore'], fetchBy: ['tackleShop'] },
    // The tackle shop's own goods (owner, 2026-10-16, BUG-88): shop → a roadside spot, a farm or a
    // residence (a farm carries the residence tag).
    { id: 'dryFlies',     phrase: 'a box of size-12 dry flies', family: 'delivery', massKg: [0.1, 0.1],
      pools: ['tackleShop'], to: ['residence', 'roadside'] },
    { id: 'spinners',     phrase: 'spinners and spoons',     family: 'delivery', massKg: [0.3, 0.6],
      pools: ['tackleShop'], to: ['residence', 'roadside'] },
    { id: 'sinkers',      phrase: 'a bag of lead sinkers',   family: 'delivery', massKg: [0.3, 0.6],
      pools: ['tackleShop'], to: ['residence', 'roadside'] },
    { id: 'monoLine',     phrase: 'a spool of 12 lb mono',   family: 'delivery', massKg: [0.1, 0.2],
      pools: ['tackleShop'], to: ['residence', 'roadside'] },
    { id: 'nightcrawlers', phrase: 'a dozen nightcrawlers',  family: 'delivery', massKg: [0.2, 0.3],
      pools: ['tackleShop'], to: ['residence', 'roadside'] },
    { id: 'landingNet',   phrase: 'a landing net',           family: 'delivery', massKg: [0.8, 1.2],
      pools: ['tackleShop'], to: ['residence', 'roadside'] },
    { id: 'tackleBox',    phrase: 'a tackle box',            family: 'delivery', massKg: [2, 4],
      pools: ['tackleShop'], to: ['residence', 'roadside'] },
    { id: 'paperClips',   phrase: 'a box of paper clips',    family: 'delivery', massKg: [0.1, 0.2],
      pools: ['generalStore'] },
    { id: 'kitchenShears', phrase: 'cooking scissors',       family: 'delivery', massKg: [0.1, 0.3],
      pools: ['generalStore'] },
    { id: 'turkeyBaster', phrase: 'a turkey baster',         family: 'delivery', massKg: [0.1, 0.2],
      pools: ['generalStore'] },
    // Cargo for the yard crews, not a player tool (items.md §7). sawmill/quarry are R2/R3 classes.
    { id: 'chainsaw',   phrase: 'a chainsaw',              family: 'delivery', massKg: [5, 7],
      pools: ['generalStore'], to: ['firewoodYard', 'sawmill', 'quarry', 'farm'] },
    { id: 'axe',        phrase: 'a splitting axe',         family: 'delivery', massKg: [2.5, 3.5],
      pools: ['generalStore'], to: ['firewoodYard', 'sawmill', 'quarry', 'farm'] },
    { id: 'shovel',     phrase: 'a shovel',                family: 'delivery', massKg: [1.5, 2.5],
      pools: ['generalStore'], to: ['firewoodYard', 'sawmill', 'quarry', 'farm'] },
    // The stranded motorist's other two jobs are FETCH (owner, 2026-10-08): a jerry can from a gas
    // station, or a spare tire from an auto shop. The jerry can is also a courier item (gas station →
    // anyone); the spare tire is fetch-only — the auto shop never posts it (it stays a bonus reward).
    // A 5 gal can: ~14 kg of fuel plus the can.
    { id: 'jerryCan',   phrase: 'a full jerry can',        family: 'delivery', massKg: [17, 19],
      pools: ['gasStation'], fetchBy: ['strandedMotorist'] },
    { id: 'spareTire',  phrase: 'a spare tire',            family: 'delivery', massKg: [10, 15],
      pools: [], fetchFrom: ['autoShop'], fetchBy: ['strandedMotorist'] },
    // A PASSENGER (cargo.md People): the motorist themselves, to an auto shop. `passenger` makes the
    // card read "needs a ride to …"; the mass is the person, riding in the cab.
    { id: 'motoristRide', phrase: 'a ride',                family: 'delivery', massKg: [55, 100],
      pools: ['strandedMotorist'], to: ['autoShop'], passenger: true },

    // Larry posts papers and nothing else (owner, 2026-09-26).
    { id: 'papers',     phrase: 'the morning papers',      family: 'papers',   massKg: [5, 8],
      pools: ['larrysHouse'] },

    // Auto shop parts (owner, 2026-09-26). The windshield is in the fragile block below.
    { id: 'muffler',       phrase: 'a muffler',              family: 'delivery', massKg: [8, 15],
      pools: ['autoShop'] },
    { id: 'wheelBearings', phrase: 'a set of wheel bearings', family: 'delivery', massKg: [2, 4],
      pools: ['autoShop'] },
    { id: 'driveShaft',    phrase: 'a drive shaft',          family: 'delivery', massKg: [12, 20],
      pools: ['autoShop'] },
    { id: 'bodyPanel',     phrase: 'a body panel',           family: 'delivery', massKg: [10, 25],
      pools: ['autoShop'] },
    { id: 'hubcap',        phrase: 'a hubcap',               family: 'delivery', massKg: [1, 2],
      pools: ['autoShop'] },
    { id: 'tailgate',      phrase: 'a tailgate',             family: 'delivery', massKg: [20, 30],
      pools: ['autoShop'] },
    { id: 'headlight',     phrase: 'a headlight',            family: 'delivery', massKg: [1.5, 3],
      pools: ['autoShop'] },
    { id: 'taillight',     phrase: 'a taillight',            family: 'delivery', massKg: [0.5, 1.5],
      pools: ['autoShop'] },

    // ── Freight (FEAT-96): strapped bed loads. One row per cargo.md Freight row that has a model and
    // a source (owner, 2026-10-10: cargo.md decides who posts; a BLANK "from" posts nowhere until the
    // owner rules a shipper). All R1 for now: there is one region. "any" is ANY_GIVER, minus a class
    // that is the thing's only destination.
    { id: 'tomatoes',     phrase: 'a pallet of tomatoes',     family: 'freight', massKg: [365, 365],
      pools: ['farm'], to: ['generalStore', 'residence'], load: 'producePalletTomatoes' },
    { id: 'squash',       phrase: 'a pallet of squash',       family: 'freight', massKg: [315, 315],
      pools: ['farm'], to: ['generalStore', 'residence'], load: 'producePalletSquash' },
    { id: 'peppers',      phrase: 'a pallet of peppers',      family: 'freight', massKg: [235, 235],
      pools: ['farm'], to: ['generalStore', 'residence'], load: 'producePalletPeppers' },
    { id: 'pottingSoil',  phrase: 'a pallet of potting soil', family: 'freight', massKg: [344, 344],
      pools: ['generalStore'], load: 'pottingSoilPallet' },
    { id: 'tyres',        phrase: 'eight tyres',              family: 'freight', massKg: [105, 105],
      pools: ['autoShop'], load: 'tireStack' },
    { id: 'propanePackFull',  phrase: 'a pallet of full propane tanks',  family: 'freight', massKg: [80, 80],
      pools: ['generalStore', 'gasStation'], load: 'propanePallet' },
    { id: 'propanePackEmpty', phrase: 'a pallet of empty propane tanks', family: 'freight', massKg: [43, 43],
      pools: ANY_GIVER.filter(k => k !== 'generalStore'), to: ['generalStore', 'gasStation'], load: 'propanePallet' },
    { id: 'softDrinks',   phrase: 'a pallet of soft drinks',  family: 'freight', massKg: [240, 240],
      pools: ['generalStore'], to: ['foodVendor', 'gasStation'], load: 'softDrinkPallet' },   // owner, 2026-10-11
    // The deliberate overloads (owner, 2026-10-10: let them roll) — past the Ranger's ~500–570 kg payload.
    // The four full drums (804 kg) are a later-region load and have no row until regions carry their
    // own freight (owner, 2026-10-12); the debug menu still straps them.
    { id: 'cinderBlocks', phrase: 'a pallet of cinder blocks', family: 'freight', massKg: [785, 785],
      pools: ['generalStore'], to: ['workSite'], load: 'cinderBlockPallet' },
    { id: 'concrete',     phrase: 'a pallet of concrete bags', family: 'freight', massKg: [670, 670],   // as built
      pools: ['generalStore'], to: ['workSite'], load: 'concretePallet' },
    { id: 'jobBox',       phrase: 'a job box',                family: 'freight', massKg: [175, 175],
      pools: ['residence'], to: ['workSite'], load: 'jobBox' },   // owner, 2026-10-11: from home to the site
    // The palletised singles and the ties: to and from the store, the gas station and the farms
    // (owner, 2026-10-12).
    { id: 'railwayTies',  phrase: 'five railway ties',        family: 'freight', massKg: [455, 455],
      pools: YARD_TRADE, to: YARD_TRADE, load: 'railwayTies' },
    { id: 'oilDrum',      phrase: 'a drum of oil',            family: 'freight', massKg: [213, 213],
      pools: YARD_TRADE, to: YARD_TRADE, load: 'drum' },
    { id: 'waterBarrel',  phrase: 'a barrel of water',        family: 'freight', massKg: [230, 230],
      pools: YARD_TRADE, to: YARD_TRADE, load: 'barrelPlastic' },
    { id: 'smallCrate',   phrase: 'a small crate',            family: 'freight', massKg: [30, 30],
      pools: YARD_TRADE, to: YARD_TRADE, load: 'smallCrate' },
    { id: 'largeCrate',   phrase: 'a large crate',            family: 'freight', massKg: [65, 65],
      pools: YARD_TRADE, to: YARD_TRADE, load: 'largeCrate' },

    // ── Fragile (FEAT-97): strapped like freight, and health-scored on the shocks the load feels.
    // Routes are the owner's 2026-10-15 ruling (cargo.md). The crated rows ride the large crate
    // with their contents as text. Pelican case and x-ray machine have no shipper yet, so no row.
    { id: 'milkBottles', phrase: 'a crate of milk bottles', family: 'fragile', massKg: [40, 40],
      pools: ['generalStore'], to: ['residence'], load: 'largeCrate', ...GLASSWARE },
    { id: 'canningJars', phrase: 'a crate of canning jars', family: 'fragile', massKg: [20, 20],
      pools: ['generalStore'], to: ['residence'], load: 'largeCrate', ...GLASSWARE },
    { id: 'eggs',        phrase: 'a crate of eggs',         family: 'fragile', massKg: [31, 31],
      pools: ['farm'], to: ['residence'], load: 'largeCrate', ...GLASSWARE, sound: 'thud' },
    { id: 'fineChina',   phrase: 'a crate of fine china',   family: 'fragile', massKg: [30, 30],
      pools: HOUSEWARES, to: ['residence'], load: 'largeCrate', ...GLASSWARE },
    { id: 'vase',        phrase: "grandma's vase",          family: 'fragile', massKg: [9, 9],
      pools: ['residence'], load: 'ornateVase', ...GLASSWARE },
    { id: 'ornateVase',  phrase: 'an ornate vase',          family: 'fragile', massKg: [9, 9],
      pools: HOUSEWARES, to: ['residence'], load: 'ornateVase', ...GLASSWARE },
    { id: 'mirror',      phrase: 'a full-length mirror',    family: 'fragile', massKg: [16, 16],
      pools: HOUSEWARES, to: ['residence'], load: 'fullLengthMirror', ...GLASSWARE, furniture: true },
    { id: 'windshield',  phrase: 'a windshield',            family: 'fragile', massKg: [14, 14],
      pools: ['autoShop'], load: 'largeCrate', ...DELICATE, sound: 'glass' },   // laminated, so tougher than plate (owner, 2026-10-15); crated until it has a model
    { id: 'glassPanes',  phrase: 'ten panes of glass',      family: 'fragile', massKg: [240, 240],
      pools: ['generalStore'], load: 'glassPanes', ...GLASSWARE },
    { id: 'diningChairs', phrase: 'four dining chairs',     family: 'fragile', massKg: [24, 24],
      pools: HOUSEWARES, to: ['residence'], load: 'diningChairs', ...DELICATE, furniture: true },
    { id: 'framedArtwork', phrase: 'a framed painting, crated', family: 'fragile', massKg: [16, 16],
      pools: HOUSEWARES, to: ['residence'], load: 'framedArtwork', ...DELICATE },
    { id: 'diningTable', phrase: 'a dining table',          family: 'fragile', massKg: [45, 45],
      pools: HOUSEWARES, to: ['residence'], load: 'diningTable', ...STURDY, furniture: true },
    { id: 'wardrobe',    phrase: 'a wardrobe',              family: 'fragile', massKg: [120, 120],
      pools: HOUSEWARES, to: ['residence'], load: 'wardrobe', ...STURDY, furniture: true },
    { id: 'gardenFountain', phrase: 'a garden fountain',    family: 'fragile', massKg: [200, 200],
      pools: ['generalStore'], load: 'gardenFountain', ...STURDY },
    { id: 'sculptureBronze', phrase: 'a bronze sculpture',  family: 'fragile', massKg: [120, 120],
      pools: HOUSEWARES, to: ['residence'], load: 'sculptureA', ...STURDY },
    { id: 'sculptureMarble', phrase: 'a marble sculpture',  family: 'fragile', massKg: [220, 220],
      pools: HOUSEWARES, to: ['residence'], load: 'sculptureB', ...STURDY },
    { id: 'uprightPiano', phrase: 'an upright piano',       family: 'fragile', massKg: [230, 230],
      pools: HOUSEWARES, to: ['residence'], load: 'uprightPiano', ...STURDY, sound: 'piano', furniture: true },
]

// ── Rewards — the named bonus items ─────────────────────────────────────────────────────────
//
//   id       stable key — never rename once used
//   name     how the card says it
//   kind     'food' | 'consumable' | 'tool' | 'part'  (items.md §1 / §2 / §3)
//   gates    which offer gates it may appear under (see RANK GATES above)
//   pools    which sources may offer it
//
// An earned reward is granted into the inventory by its id (FEAT-122) — every id here must be in
// data/items.js ITEMS (the inventory gate checks). Its effect applies only if built.

export const REWARDS = [
    { id: 'chiliDog',   name: 'Chili dog',   kind: 'food',       gates: ['B', 'A'],
      pools: ['foodVendor'] },
    { id: 'coffee',     name: 'Coffee',      kind: 'consumable', gates: ['C', 'B'],
      pools: ['foodVendor', 'generalStore'] },
    { id: 'spareTire',  name: 'Spare tire',  kind: 'part',       gates: ['A', 'S'],
      pools: ['autoShop', 'strandedMotorist'] },
    // A 2 gal RotoPax: the jerry can (items.md §1), single-use. ~5.7 kg of gas + ~1.5 kg of can.
    { id: 'emergencyGas', name: 'Emergency gas', kind: 'consumable', gates: ['C', 'B'],
      pools: ['gasStation', 'strandedMotorist'] },
]

// ── Sources — which POIs post offers (ruled 2026-09-26) ─────────────────────────────────────
//
// Keyed by POI roster type (src/poi.js POI_ROSTER). A type that is NOT listed here posts nothing:
// mom's house, and the office and school, which only receive (owner, 2026-10-07).
//
// TWO KINDS OF SOURCE (FEAT-101, pois.md § Job supply):
//   ALWAYS-ON — a `slots` row. The place keeps its own slots, outside the budget: Larry, the haul
//              yard, the food vendor. Every slot is always full except while locked.
//   BUDGET    — a `cap` row. The region shares BUDGET_JOBS live jobs among every budget giver; when
//              one ends, its replacement lands on a uniformly random eligible giver.
//
//   slots      ALWAYS-ON: live offers at once. A [lo, hi] pair is rolled once per POI.
//   cap        BUDGET: the most budget jobs this place holds at once (live, taken or locked).
//   expiryH    offer lifetime in game-hours, as the centre value; EXPIRY_NOISE applies on top.
//              A [lo, hi] pair means the centre is rolled once per POI in that range. null = the
//              offer never expires and shows no timer (Larry, owner 2026-10-07).
//   lockH      (optional) lock length after a completion or cancel, replacing the fresh full expiry.
//   families   which families this source may post

// FEAT-50: places no job ever ends at. A lone gas pump has no one to hand anything to — it sells fuel
// and nothing else (owner, 2026-10-16) — so a generic delivery must never roll one as its drop-off.
// src/offer-board.js destWish filters on it.
export const NOT_A_DESTINATION = new Set(['gasPump'])

export const SOURCES = {
    // ── always-on ──
    // Larry's paper route never expires and has no timer; after a round (or a cancel) he is
    // unavailable for 12 h, then a fresh offer appears (owner, 2026-10-07).
    larrysHouse:  { slots: 1,      expiryH: null, lockH: 12, families: ['papers'] },
    // FEAT-88/91: the region-1 haul yard. Haul only for now — FEAT-91 also has it give and take
    // courier jobs, which lands with FEAT-89.
    firewoodYard: { slots: 2,      expiryH: 24, families: ['haul'] },
    foodVendor:   { slots: [2, 3], expiryH: 2,  families: ['delivery'] },
    // ── the budget (FEAT-101) ──
    generalStore:     { cap: 2, expiryH: 24,       families: ['delivery', 'fragile', 'freight'] },
    autoShop:         { cap: 2, expiryH: 48,       families: ['delivery', 'freight', 'fragile'] },   // the windshield
    // The gas station posts work too, reversing "some stores are just stores" (2026-09-26).
    gasStation:       { cap: 2, expiryH: 24,       families: ['delivery', 'freight'] },
    workSite:         { cap: 2, expiryH: [24, 72], families: ['delivery', 'freight'] },
    residence:        { cap: 2, expiryH: [24, 72], families: ['delivery', 'fragile', 'demolition', 'freight'] },
    farm:             { cap: 2, expiryH: [24, 72], families: ['delivery', 'freight', 'fragile'] },
    doctor:           { cap: 2, expiryH: [24, 72], families: ['delivery', 'freight'] },
    strandedMotorist: { cap: 1, expiryH: [24, 72], families: ['delivery'] },
    // FEAT-102: fetches of the general-store sundries, plus its own goods out (BUG-88).
    tackleShop:       { cap: 2, expiryH: 24,       families: ['delivery'] },
}

/** Live budget jobs shared by every `cap` source in the region (owner, 2026-10-07: "about 12"). */
export const BUDGET_JOBS = 12

// ── Haul loads (FEAT-88, owner 2026-10-04) ──────────────────────────────────────────────────
//
// A haul offer rolls how many pieces it is, and the pay scales with that: a bigger load is a
// juicier job, and also more weight squatting the truck and more pieces to lose. That is the lever
// that lets the market pull the player between careers. Pay = the ordinary par line × pieces ×
// HAUL_PAY_PER_BUNDLE, then × (pieces aboard at delivery ÷ pieces in the offer) at settle.

/** [min, max] firewood bundles per offer, inclusive. Owner, 2026-10-05 (was 7–12 on the first drive). */
export const HAUL_BUNDLES = [10, 15]

/** kg per bundle. A real shrink-wrapped bundle is ~0.75 ft³, 10–12 kg (src/debris.js bundleA..C). */
export const HAUL_BUNDLE_KG = 11

/**
 * Pay per bundle as a fraction of an ordinary delivery over the same route. 1/10: a 10-bundle load
 * pays what a delivery would, 15 bundles pay 1.5× — the same 1×–1.5× spread the first 7–12 range had
 * at 1/8 (re-weighted with the range, owner 2026-10-05). PLACEHOLDER — tune on a drive.
 */
export const HAUL_PAY_PER_BUNDLE = 1 / 10

/**
 * Par on a haul is the route's par × this (owner, 2026-10-05: "the added weight slows the truck
 * slightly, so par should be ~10% longer"). Pay rides par, so the per-bundle rate is divided by the
 * same factor in the offer's payMult (src/offer-board.js) — a 10-bundle haul still pays exactly what
 * a courier job over that route pays; only the clock it is graded against is longer.
 */
export const HAUL_PAR_SLACK = 1.1

// ── Freight (FEAT-96) ───────────────────────────────────────────────────────────────────────
/**
 * A freight job's par is the route's par × (1 + this × kg). Pay rides par and is NOT divided back
 * out (unlike haul), so a heavier load pays more by the same factor — the ticket's one knob for
 * "mass scales both". Haul's precedent: HAUL_PAR_SLACK 1.1 at ~140 kg ≈ +0.07 per 100 kg, so a
 * 400 kg pallet gets 1.28. PLACEHOLDER — check against a headless empty-vs-loaded drive.
 */
export const FREIGHT_PAR_SLACK_PER_KG = 0.0007

/**
 * Freight is the EASY delivery (owner, 2026-10-11): strapped, it cannot be lost, so it grades
 * looser and tips less than haul, which can. Both are frozen onto the mission as contract terms.
 *
 * FREIGHT_TIME_SLACK — every rank threshold × this at accept, and the tip curve reads the ratio ÷
 * this: S comes easier (≤ 0.886 × par instead of 0.77) and D comes later (past 1.15 × par instead of
 * 1.0). Par pace grades B, not C.
 *
 * FREIGHT_TIP_MULT — a flat multiplier on the tip only. Base pay is untouched, so a heavy load keeps
 * its base-pay lead through par × FREIGHT_PAR_SLACK_PER_KG. At 0.5 a freight S pays 1.5 × base,
 * against 2 × base on haul and courier.
 */
export const FREIGHT_TIME_SLACK = 1.15

/**
 * Freight's weight bonus on PAY alone (owner, 2026-10-11): payMult × (1 + this × kg), on top of the
 * par stretch. Par grows 7 % per 100 kg and is the extra TIME the load costs; this adds 3 % per
 * 100 kg of money that time does not eat, so pay outgrows time and narrows the per-minute gap to
 * haul. Haul still wins at the top (a fast run with live bodies in the bed), freight is the reliable
 * earner. In the card's Base pay too.
 */
export const FREIGHT_PAY_PER_KG = 0.0003
export const FREIGHT_TIP_MULT = 0.5

// FEAT-113 DELIVERY DEADLINES (owner, 2026-10-15 — replaces the 10-14 fixed bands). A job must be
// delivered within par × (1 + slack) of game time, counted from accept: the deadline scales with
// the job, so a long run is never short-changed and a short one never sits in hand for days. A
// thing's own `deadlineSlack` overrides its family's. Owner-set: takeout +50 % (still generous for a
// new player), other courier +100 %, freight +300 % (2026-10-15, second pass); haul and fragile
// +200 % (third pass). papers is this side's pick, not a ruling yet. demolition has no things (and
// no code) yet — give it a slack the day it ships.
// A different clock from board expiry (EXPIRY_NOISE, SOURCES.expiryH): when an offer LEAVES the board.
export const DEADLINE_SLACK = {
    delivery:   1.0,
    fragile:    2.0,
    freight:    3.0,
    haul:       2.0,
    papers:     1.0,   // Larry's round is courier work
}

/** ±fraction applied to every rolled expiry (ruled 2026-09-26: ±30 %). */
export const EXPIRY_NOISE = 0.3

// THE LOCK RULE (owner, 2026-10-07 — reverses the 2026-09-27 completion rule). A COMPLETION and a
// CANCEL both lock the slot for a FRESH full expiry, counted from that moment (`lockH` overrides
// the length). Keeping the original timer let a player finish a job ten minutes before it expired
// and get a new one straight away. A locked budget slot stays parked on its place — which takes no
// new budget job until the lock clears — and then refills at a random eligible place. Cancelling
// is a button (the player phones the customer); nothing else cancels a job.

// ── Roll shares (owner, 2026-09-26) ─────────────────────────────────────────────────────────

/** 0..1 — share of offers that carry a bonus item. */
export const BONUS_CHANCE = 0.25

/**
 * Pay multiplier on an offer that carries a bonus. Bonus offers must pay LESS cash, or there is no
 * reason ever to skip one: take them only when you want the item. PLACEHOLDER — owner to set.
 */
export const BONUS_PAY_MULT = 0.5

/**
 * Gate weights — equal (owner, 2026-09-26). Reward value tracks gate difficulty through item
 * rarity (common → legendary), which arrives when items are fleshed out.
 */
export const GATE_WEIGHTS = { C: 1, B: 1, A: 1, S: 1 }

/** 0..1 — share of destinations that are another POI; the rest are roadside (LANDMARKS / place). */
export const DEST_POI_CHANCE = 0.5

/** People per source POI: usually one, sometimes two, rarely three. Relative weights. */
export const PEOPLE_PER_POI = { 1: 0.75, 2: 0.2, 3: 0.05 }
