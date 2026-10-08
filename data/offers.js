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
//   freight    — heavy; flat pay by mass × distance, NOT BUILT    (blue)
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
//   pools    which sources may post it (keys of SOURCES below)
//   passenger (optional) true when the thing is the poster themselves — the card says "a ride to …"
//   to       (optional, FEAT-100) the POI tags it may be delivered to — a class (`farm`) or a
//            fixture tag. Absent = generic: any POI or a roadside spot (cargo.md "From → to").
//            Tagged things only ever end at a matching POI, never roadside.

// "Any normal giver" — cargo.md's blank From (option C). Not the food vendor, the haul yard or
// Larry: each has one kind of job and posts it outside the budget (pois.md § Job supply). Not the
// office or school (they only receive) nor the motorist (they post only their own ride) — owner,
// 2026-10-07.
const ANY_GIVER = ['generalStore', 'autoShop', 'workSite', 'residence', 'farm', 'doctor']

// Households: a residence or a farm (a farm is a residence too — it carries the tag).
const HOME = ['residence', 'farm']

export const THINGS = [
    // FEAT-88 haul. massKg is ignored for a haul thing — the card's weight is pieces × HAUL_BUNDLE_KG,
    // because the load is real bodies and its weight is whatever they weigh. Kept so the spec
    // stream draws the same numbers for every thing.
    { id: 'firewood',   phrase: 'firewood',               family: 'haul',     massKg: [0, 0],
      pools: ['firewoodYard'] },
    { id: 'takeout',    phrase: 'two bags of takeout',    family: 'delivery', massKg: [2, 5],
      pools: ['foodVendor'] },
    { id: 'groceries',  phrase: 'a week of groceries',    family: 'delivery', massKg: [10, 25],
      pools: ['generalStore'] },
    { id: 'medication', phrase: 'their prescription',        family: 'delivery', massKg: [0.2, 0.5],
      pools: ['generalStore'] },
    { id: 'vase',       phrase: "grandma's vase",          family: 'fragile',  massKg: [3, 6],
      pools: ['residence'] },
    // Courier, R1 (cargo.md), one thing per row there.
    { id: 'note',       phrase: 'a private note',          family: 'delivery', massKg: [0.1, 0.1],
      pools: ANY_GIVER },
    { id: 'memo',       phrase: 'a memo from the foreman', family: 'delivery', massKg: [0.1, 0.1],
      pools: ['workSite'] },
    { id: 'lunch',      phrase: 'lunch for the partner',   family: 'delivery', massKg: [1, 2],
      pools: HOME },
    { id: 'glasses',    phrase: 'much-needed reading glasses', family: 'delivery', massKg: [0.1, 0.1],
      pools: HOME },
    { id: 'tractorKeys', phrase: 'keys for the tractor',   family: 'delivery', massKg: [0.1, 0.1],
      pools: ANY_GIVER, to: ['farm'] },
    { id: 'classNotes', phrase: 'their class notes',       family: 'delivery', massKg: [0.3, 1],
      pools: HOME, to: ['school'] },
    { id: 'deck',       phrase: 'a presentation deck',     family: 'delivery', massKg: [0.5, 1.5],
      pools: HOME, to: ['office'] },
    // A 20 lb cylinder: ~7.7 kg of steel, plus 9.1 kg of propane when full. Full ones leave the
    // store or a gas station; empties go back to either from anywhere (owner, 2026-10-07). The gas
    // station posts nothing until FEAT-101 makes it a source, but it receives empties already.
    { id: 'propaneFull',  phrase: 'a full 20 lb propane tank',  family: 'delivery', massKg: [16, 18],
      pools: ['generalStore', 'gasStation'] },
    { id: 'propaneEmpty', phrase: 'an empty 20 lb propane tank', family: 'delivery', massKg: [7, 9],
      pools: ANY_GIVER.filter(k => k !== 'generalStore'), to: ['generalStore', 'gasStation'] },
    // Cargo for the yard crews, not a player tool (items.md §7). sawmill/quarry are R2/R3 classes.
    { id: 'chainsaw',   phrase: 'a chainsaw',              family: 'delivery', massKg: [5, 7],
      pools: ['generalStore'], to: ['firewoodYard', 'sawmill', 'quarry', 'farm'] },
    { id: 'axe',        phrase: 'a splitting axe',         family: 'delivery', massKg: [2.5, 3.5],
      pools: ['generalStore'], to: ['firewoodYard', 'sawmill', 'quarry', 'farm'] },
    { id: 'shovel',     phrase: 'a shovel',                family: 'delivery', massKg: [1.5, 2.5],
      pools: ['generalStore'], to: ['firewoodYard', 'sawmill', 'quarry', 'farm'] },
    // A PASSENGER (cargo.md People): the motorist themselves, to an auto shop. `passenger` makes the
    // card read "needs a ride to …"; the mass is the person, riding in the cab.
    { id: 'motoristRide', phrase: 'a ride',                family: 'delivery', massKg: [55, 100],
      pools: ['strandedMotorist'], to: ['autoShop'], passenger: true },

    // Larry posts papers and nothing else (owner, 2026-09-26).
    { id: 'papers',     phrase: 'the morning papers',      family: 'papers',   massKg: [5, 8],
      pools: ['larrysHouse'] },

    // Auto shop parts (owner, 2026-09-26). The windshield is fragile, so it waits for that family.
    { id: 'muffler',       phrase: 'a muffler',              family: 'delivery', massKg: [8, 15],
      pools: ['autoShop'] },
    { id: 'wheelBearings', phrase: 'a set of wheel bearings', family: 'delivery', massKg: [2, 4],
      pools: ['autoShop'] },
    { id: 'driveShaft',    phrase: 'a drive shaft',          family: 'delivery', massKg: [12, 20],
      pools: ['autoShop'] },
    { id: 'bodyPanel',     phrase: 'a body panel',           family: 'delivery', massKg: [10, 25],
      pools: ['autoShop'] },
    { id: 'windshield',    phrase: 'a windshield',           family: 'fragile',  massKg: [12, 18],
      pools: ['autoShop'] },
    { id: 'hubcap',        phrase: 'a hubcap',               family: 'delivery', massKg: [1, 2],
      pools: ['autoShop'] },
    { id: 'tailgate',      phrase: 'a tailgate',             family: 'delivery', massKg: [20, 30],
      pools: ['autoShop'] },
    { id: 'headlight',     phrase: 'a headlight',            family: 'delivery', massKg: [1.5, 3],
      pools: ['autoShop'] },
    { id: 'taillight',     phrase: 'a taillight',            family: 'delivery', massKg: [0.5, 1.5],
      pools: ['autoShop'] },
]

// ── Rewards — the named bonus items ─────────────────────────────────────────────────────────
//
//   id       stable key — never rename once used
//   name     how the card says it
//   kind     'food' | 'consumable' | 'tool' | 'part'  (items.md §1 / §2 / §3)
//   gates    which offer gates it may appear under (see RANK GATES above)
//   pools    which sources may offer it
//
// Grants are STUBBED in FEAT-67: settlement records the award, nothing takes effect yet.

export const REWARDS = [
    { id: 'chiliDog',   name: 'Chili dog',   kind: 'food',       gates: ['B', 'A'],
      pools: ['foodVendor'] },
    { id: 'coffee',     name: 'Coffee',      kind: 'consumable', gates: ['C', 'B'],
      pools: ['foodVendor', 'generalStore'] },
    { id: 'spareTire',  name: 'Spare tire',  kind: 'part',       gates: ['A', 'S'],
      pools: ['autoShop'] },
]

// ── Sources — which POIs post offers (ruled 2026-09-26) ─────────────────────────────────────
//
// Keyed by POI roster type (src/poi.js POI_ROSTER). A type that is NOT listed here posts nothing:
// gas station and tackle shop (until FEAT-101), mom's house, and the office and school, which only
// receive (owner, 2026-10-07).
//
//   slots      live offers at once. Every slot is always full, except after a completion or a cancel.
//   expiryH    offer lifetime in game-hours, as the centre value; EXPIRY_NOISE applies on top.
//              A [lo, hi] pair means the centre is rolled once per POI in that range.
//   minEmptyH  (optional, default 0) after a COMPLETION the slot never re-rolls sooner than this.
//              Larry's 24 h is what stops two paper rounds in one day (owner, 2026-09-27).
//   families   which families this source may post

// foodVendor means ANY FOOD VENDOR (owner, 2026-09-26): the player delivers ready-made meals as an
// independent contractor (a Grubhub-style gig), not as staff — so this does not break opening.md's
// "never work there again". Later regions add more food vendors under their own rolled names. Food
// jobs are the bottom of the barrel: short, low-paying, posted often — filler for the last hours of
// a day when no good job fits.
export const SOURCES = {
    generalStore: { slots: 2, expiryH: 24,       families: ['delivery', 'fragile'] },
    foodVendor:   { slots: 3, expiryH: 2,        families: ['delivery'] },
    larrysHouse:  { slots: 1, expiryH: 72,       families: ['papers'], minEmptyH: 24 },
    autoShop:     { slots: 1, expiryH: 48,       families: ['delivery', 'freight'] },
    // FEAT-88/91: the region-1 haul yard. Haul only for now — FEAT-91 also has it give and take
    // courier jobs, which lands with FEAT-89.
    firewoodYard: { slots: 2, expiryH: 24,       families: ['haul'] },
    // Places and Missions (FEAT-98): the job site and the posting additional classes post ONE provisional
    // slot each, on the retired generic giver's timing, until FEAT-101's region budget replaces it.
    workSite:         { slots: 1, expiryH: [24, 72], families: ['delivery', 'freight'] },
    residence:        { slots: 1, expiryH: [24, 72], families: ['delivery', 'fragile', 'demolition'] },
    farm:             { slots: 1, expiryH: [24, 72], families: ['delivery', 'freight', 'fragile'] },
    doctor:           { slots: 1, expiryH: [24, 72], families: ['delivery'] },
    strandedMotorist: { slots: 1, expiryH: [24, 72], families: ['delivery'] },
}

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

/** ±fraction applied to every rolled expiry (ruled 2026-09-26: ±30 %). */
export const EXPIRY_NOISE = 0.3

// AFTER A COMPLETION (owner, 2026-09-27): no separate timer. The offer's original expiry keeps
// running while it is taken; the slot stays empty until it runs out (and at least `minEmptyH`
// after the completion), then rolls a new offer.
//
// AFTER A CANCEL (owner, 2026-09-27): the slot locks for the offer's FULL expiry length, counted
// from the moment of cancel — the giver is unhappy with you. The time left on the original timer
// plays no part, so cancelling an offer that has already expired is not free. Cancelling is a
// button (the player phones the customer); nothing else cancels a job.

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
