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

export const THINGS = [
    // FEAT-88 haul. massKg is ignored for a haul thing — the card's weight is pieces × HAUL_BUNDLE_KG,
    // because the load is real bodies and its weight is whatever they weigh. Kept so the spec
    // stream draws the same numbers for every thing.
    { id: 'firewood',   phrase: 'firewood',               family: 'haul',     massKg: [0, 0],
      pools: ['firewoodYard'] },
    { id: 'takeout',    phrase: 'two bags of takeout',    family: 'delivery', massKg: [2, 5],
      pools: ['burgerJoint'] },
    { id: 'groceries',  phrase: 'a week of groceries',    family: 'delivery', massKg: [10, 25],
      pools: ['generalStore', 'missionGiver'] },
    { id: 'medication', phrase: 'their prescription',        family: 'delivery', massKg: [0.2, 0.5],
      pools: ['missionGiver'] },
    { id: 'vase',       phrase: "grandma's vase",          family: 'fragile',  massKg: [3, 6],
      pools: ['missionGiver'] },

    // Larry posts papers and nothing else (owner, 2026-09-26).
    { id: 'papers',     phrase: 'the morning papers',      family: 'papers',   massKg: [5, 8],
      pools: ['larrysHouse'] },

    // Service shop parts (owner, 2026-09-26). The windshield is fragile, so it waits for that family.
    { id: 'muffler',       phrase: 'a muffler',              family: 'delivery', massKg: [8, 15],
      pools: ['serviceShop'] },
    { id: 'wheelBearings', phrase: 'a set of wheel bearings', family: 'delivery', massKg: [2, 4],
      pools: ['serviceShop'] },
    { id: 'driveShaft',    phrase: 'a drive shaft',          family: 'delivery', massKg: [12, 20],
      pools: ['serviceShop'] },
    { id: 'bodyPanel',     phrase: 'a body panel',           family: 'delivery', massKg: [10, 25],
      pools: ['serviceShop'] },
    { id: 'windshield',    phrase: 'a windshield',           family: 'fragile',  massKg: [12, 18],
      pools: ['serviceShop'] },
    { id: 'hubcap',        phrase: 'a hubcap',               family: 'delivery', massKg: [1, 2],
      pools: ['serviceShop'] },
    { id: 'tailgate',      phrase: 'a tailgate',             family: 'delivery', massKg: [20, 30],
      pools: ['serviceShop'] },
    { id: 'headlight',     phrase: 'a headlight',            family: 'delivery', massKg: [1.5, 3],
      pools: ['serviceShop'] },
    { id: 'taillight',     phrase: 'a taillight',            family: 'delivery', massKg: [0.5, 1.5],
      pools: ['serviceShop'] },
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
      pools: ['burgerJoint'] },
    { id: 'coffee',     name: 'Coffee',      kind: 'consumable', gates: ['C', 'B'],
      pools: ['burgerJoint', 'generalStore'] },
    { id: 'spareTire',  name: 'Spare tire',  kind: 'part',       gates: ['A', 'S'],
      pools: ['serviceShop'] },
]

// ── Sources — which POIs post offers (ruled 2026-09-26) ─────────────────────────────────────
//
// Keyed by POI roster type (src/poi.js POI_ROSTER). A type that is NOT listed here posts nothing
// (gas station, tackle shop, mom's house — "some stores are just stores").
//
//   slots      live offers at once. Every slot is always full, except after a completion or a cancel.
//   expiryH    offer lifetime in game-hours, as the centre value; EXPIRY_NOISE applies on top.
//              A [lo, hi] pair means the centre is rolled once per POI in that range.
//   minEmptyH  (optional, default 0) after a COMPLETION the slot never re-rolls sooner than this.
//              Larry's 24 h is what stops two paper rounds in one day (owner, 2026-09-27).
//   nameForm   'owned' | 'plain' | 'fixed' — which POI-name grammar (data/offer-names.js).
//              'fixed' keeps the roster's own label (Larry's). A missionGiver is named by its MODEL
//              instead (`giverName` in data/prop-models.js): 'home' → "the Hadley place", 'person' →
//              just the person ("Earl").
//   families   which families this source may post

// burgerJoint means ANY FOOD VENDOR (owner, 2026-09-26): the player delivers ready-made meals as an
// independent contractor (a Grubhub-style gig), not as staff — so this does not break opening.md's
// "never work there again". Later regions add more food vendors under their own rolled names. Food
// jobs are the bottom of the barrel: short, low-paying, posted often — filler for the last hours of
// a day when no good job fits.
export const SOURCES = {
    generalStore: { slots: 2, expiryH: 24,       nameForm: 'plain', families: ['delivery', 'fragile'] },
    burgerJoint:  { slots: 3, expiryH: 2,        nameForm: 'owned', families: ['delivery'] },
    larrysHouse:  { slots: 1, expiryH: 72,       nameForm: 'fixed', families: ['papers'], minEmptyH: 24 },
    serviceShop:  { slots: 1, expiryH: 48,       nameForm: 'owned', families: ['delivery', 'freight'] },
    missionGiver: { slots: 1, expiryH: [24, 72], nameForm: 'plain', families: ['delivery', 'fragile', 'demolition'] },
    // FEAT-88/91: the region-1 haul yard. Haul only for now — FEAT-91 also has it give and take
    // courier jobs, which lands with FEAT-89.
    firewoodYard: { slots: 2, expiryH: 24,       nameForm: 'owned', families: ['haul'] },
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
