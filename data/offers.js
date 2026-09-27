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
    { id: 'takeout',    phrase: 'two bags of takeout',    family: 'delivery', massKg: [2, 5],
      pools: ['burgerJoint'] },
    { id: 'groceries',  phrase: 'a week of groceries',    family: 'delivery', massKg: [10, 25],
      pools: ['generalStore', 'missionGiver'] },
    { id: 'medication', phrase: 'her prescription',        family: 'delivery', massKg: [0.2, 0.5],
      pools: ['missionGiver'] },
    { id: 'vase',       phrase: "grandma's vase",          family: 'fragile',  massKg: [3, 6],
      pools: ['missionGiver'] },
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
//   slots      live offers at once. Every slot is always full, except during a recycle.
//   expiryH    offer lifetime in game-hours, as the centre value; EXPIRY_NOISE applies on top.
//              A [lo, hi] pair means the centre is rolled once per POI in that range.
//   nameForm   'owned' | 'plain' | 'fixed' — which POI-name grammar (data/offer-names.js).
//              'fixed' keeps the roster's own label (Larry's).
//   families   which families this source may post

export const SOURCES = {
    generalStore: { slots: 2, expiryH: 24,       nameForm: 'plain', families: ['delivery', 'fragile'] },
    burgerJoint:  { slots: 3, expiryH: 2,        nameForm: 'owned', families: ['delivery'] },
    larrysHouse:  { slots: 1, expiryH: 72,       nameForm: 'fixed', families: ['papers'] },
    serviceShop:  { slots: 1, expiryH: 48,       nameForm: 'owned', families: ['delivery', 'freight'] },
    missionGiver: { slots: 1, expiryH: [24, 72], nameForm: 'plain', families: ['delivery', 'fragile', 'demolition'] },
}

/** ±fraction applied to every rolled expiry (ruled 2026-09-26: ±30 %). */
export const EXPIRY_NOISE = 0.3

/** Game-hours a slot sits empty after its mission is completed, rolled in [lo, hi]. */
export const RECYCLE_H = [12, 24]
