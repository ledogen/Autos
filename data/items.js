// ── FEAT-122: the item catalog — everything the player can OWN this run ──────────────────────
//
//   id       stable key — never rename once used. REWARDS (data/offers.js) grants by this id.
//            Its own namespace: THINGS' `spareTire` is a courier's cargo, this one is yours.
//   name     how the inventory says it
//   kind     'consumable' | 'food' | 'tool' | 'camp' | 'part'   (items.md §1 / §2 / §2b / §3)
//            Consumables and food STACK — one kind fills one slot. Tools, camp gear and unfitted
//            parts take a slot EACH (owner, 2026-10-16). Fitted parts take none (not built yet).
//   massKg   real load on the chassis while stowed (items.md rule 2 — a load, never a stat)
//   desc     described, never scored (SM-INV-10): no numbers, ever — the gate checks for digits
//   thumb    the thumbnail's file stem when it isn't the id (parts share one per kind)
//   rarity   parts only: the colour behind the icon (data/parts.js RARITY_COLOR)
//   use      the effect hook main.js supplies, if the effect is built. Usable items auto-bind to
//            a free quick slot (keys 1–4, items.md §1c).
//   uses     uses per unit (a pack, a roll), when more than one: the stack tracks the open one's `left`
//   capGal   a can's fill, gallons: the entry carries `gal`, and its mass is `kgPerGal` × gal on top
//   hold     food: game hours the meal holds hunger off (items.md §1d; src/day.js eat)

import { PARTS, partIcon } from './parts.js'

export const ITEMS = {
    coffee:       { name: 'Coffee',        kind: 'consumable', massKg: 0.5, use: 'coffee',
                    desc: 'Wakes you up now. You will feel it in the morning.' },
    chiliDog:     { name: 'Chili dog',     kind: 'food',       massKg: 0.3, use: 'eat', hold: 10,
                    desc: 'Kinda gross.' },   // the owner's flavor line (setup page, 10-22)
    // FEAT-168: the school's rare reward (owner, 2026-11-05: "school lunch?"). NEW: the words are a
    // placeholder for the owner's; the hold is the packed lunch's 8 h and the icon its bag [DEFAULT].
    schoolLunch:  { name: 'School lunch',  kind: 'food',       massKg: 0.5, use: 'eat', hold: 8, thumb: 'packedLunch',
                    desc: 'A brown-bag lunch from the school cafeteria.' },
    // FEAT-173 (owner, 2026-11-06: "three middle to weak food items… maybe a snack that mom provides"): every run
    // starts with three (main.js, the run's start). items.md §1d's packed lunch — a standard meal's 8 h, never
    // sold. PLACEHOLDER words for the owner's.
    packedLunch:  { name: 'Packed lunch',  kind: 'food',       massKg: 0.5, use: 'eat', hold: 8,
                    desc: 'Mom packed it for the road.' },
    // P235/75R15 on a steel rim: the standard tire (12 kg) + the steel wheel (9 kg), the realistic
    // figure (owner, 2026-10-23). Not RANGER_PARAMS.wheelMass, which is the suspension's unsprung mass.
    spareTire:    { name: 'Mounted tire',  kind: 'part',       massKg: PARTS.spareTire.massKg, use: 'spare',
                    desc: 'A tire mounted on a wheel.' },
    // A 2 gal RotoPax: ~5.7 kg of gas + ~1.5 kg of can (data/offers.js REWARDS).
    emergencyGas: { name: 'Emergency gas', kind: 'consumable', massKg: 7.2, use: 'gas',
                    desc: 'A small can of gas, for when the gauge lies.' },
    // One plug per kit; the effect ('plug') is the parts session's (owner hand-off 2026-10-21).
    tirePlugKit:  { name: 'Tire plug kit', kind: 'consumable', massKg: 0.3, use: 'plug',
                    desc: "I hope I don't have to use this." },   // the owner's flavor line (setup page, 10-22)
    // A haul reward (owner, 2026-10-22): a 3/8" rubber mat cut for a compact bed, ~15 kg. Effect unbuilt.
    rubberBedMat: { name: 'Rubber bed mat', kind: 'tool',      massKg: 15,
                    desc: 'A heavy rubber mat for the bed floor. Loose cargo stops sliding around.' },
    // A 12 V portable inflator: a plug repair is 30 min in all with it, 2 h by hand (items.md §7).
    compressor:   { name: 'Compressor',    kind: 'tool',       massKg: 4,
                    desc: 'A little pump that runs off the lighter socket. Airs a tire up while you wait.' },
    // Coffee's short, steep twin (items.md §1a): relief now, a crash later the same day (DAY_PARAMS).
    energyDrink:  { name: 'Energy drink',  kind: 'consumable', massKg: 0.5, use: 'energy',
                    desc: 'Hits fast and hard. The crash comes later the same day.' },
    // One bottle: radiator back up to half at most, a 15 min stop (items.md §7; main.js _pourStopLeak).
    stopLeak:     { name: 'Stop-leak',     kind: 'consumable', massKg: 0.5, use: 'stopLeak',
                    desc: "Maybe this will keep 'er going." },
    // A pack of 5, 10% on a headlight, body panel or the radiator, 15 min a use (items.md §7; the
    // effect is src/recovery.js FIELD_REPAIR).
    zipTies:      { name: 'Zip ties',      kind: 'consumable', massKg: 0.2, use: 'fieldRepair', uses: 5,
                    desc: "A mechanic's best friend." },
    // A ~0.35 kg roll, 3 uses (items.md §7): 20% on a body panel, 15 min, holds for the run (the
    // effect is src/recovery.js FIELD_REPAIR).
    ductTape:     { name: 'Duct tape',     kind: 'consumable', massKg: 0.35, use: 'fieldRepair', uses: 3,
                    desc: 'Holds a panel on for the rest of the run. Not pretty, but it holds.' },
    // A refillable 5 gal steel can (items.md §1, owner 2026-10-21/22): 4 kg empty, 18 kg full (E10 at
    // 2.82 kg/gal = src/fuel.js KG_PER_GAL). Poured parked, 10 min; refilled at any pump. A tool, so
    // each can is its own slot and remembers its fill.
    jerryCan:     { name: 'Jerry can',     kind: 'tool',       massKg: 2, use: 'jerry', capGal: 5, kgPerGal: 2.82,
                    desc: 'A plastic can of gas. Fill it at any pump.' },
    // A low steel trolley jack, ~15 kg [DEFAULT]: takes 1 h off the spare change, never a plug repair
    // (owner, 2026-10-22 — "you don't need to jack to plug"). The time saving is the parts session's.
    quickJack:    { name: 'Quick-jack',    kind: 'tool',       massKg: 15,
                    desc: 'A low trolley jack that rolls under the truck. Gets a spare on quicker than the factory jack.' },
    // FEAT-138: a real 48-inch farm jack, 13 kg. Rights a rolled truck where it lies, live in the physics
    // (src/hilift.js) — from the inventory menu, left or right (owner, 2026-10-22 / 10-31).
    hiLiftJack:   { name: 'Hi-lift jack',  kind: 'tool',       massKg: 13,
                    desc: 'A tall farm jack. Heaves a rolled truck back over, if the ground lets it.' },

    // ── Backpacks (items.md §2c) — `packSlots` camp items ride inside; `reachM` is how far past the
    //    road edge camp may be: the equipped pack's sets the night's tether (src/camp.js reachM, capped
    //    at 120 m).
    pack:         { name: 'Pack',          kind: 'pack',       massKg: 1.5, packSlots: 2, reachM: 40,
                    desc: 'An old canvas pack. Whatever is in it comes to camp.' },
    // FEAT-182: the other four. Slots, reach and mass are [DEFAULT] placeholders, owed by the owner; only
    // the Rucksack's place (between the Duffel and the Frame pack) is ruled. No source yet: the debug
    // grant hands them out until the owner rules shelf and/or rewards.
    daypack:      { name: 'Daypack',       kind: 'pack',       massKg: 0.8, packSlots: 2, reachM: 100,
                    desc: 'A light nylon daypack. Not much room, but it goes anywhere.' },
    duffel:       { name: 'Duffel',        kind: 'pack',       massKg: 3,   packSlots: 6, reachM: 15,
                    desc: 'A big canvas duffel. Takes the lot, but you won\'t carry it far from the truck.' },
    rucksack:     { name: 'Rucksack',      kind: 'pack',       massKg: 2,   packSlots: 4, reachM: 60,
                    desc: 'An old canvas rucksack with a top flap. Room for a proper camp.' },
    framePack:    { name: 'Frame pack',    kind: 'pack',       massKg: 3.5, packSlots: 6, reachM: 120,
                    desc: 'A big bag on an aluminium frame. Carries everything, a long way.' },

    // ── Camp gear (items.md §2b). FEAT-66: what is PACKED is what stands at camp. `campSlot` is where on
    //    the pad (src/camp-gear.js CAMP_SLOTS) and `model` the PROP_MODELS key; no `model` renders nothing
    //    (no placeholder art). Every slot but the bed shows one model.
    //    FEAT-171 (owner, 2026-11-05): THE BED IS THREE LAYERS — `bed` names an item's: 'ground' under
    //    'bedding' under 'blanket'. A pack holds one item per layer (packing a second swaps it), and the
    //    equipped pack always holds bedding: the bedroll, or the sleeping bag that replaces it. At camp
    //    they stack, each draped over the ones under it (src/camp-gear.js).
    bedroll:      { name: 'Bedroll',       kind: 'camp',       massKg: 2.5, bed: 'bedding', campSlot: 'bed', model: 'bedroll',
                    desc: 'A rolled bed for the ground. Better than the dirt, not by much.' },
    // `rest` is the bonus on camp sleep's recovery rate while packed (owner, 2026-10-16), summed and
    // applied once (day.js recoveryRate): ground +5/+10/+15 %, bedding 0/+10 %, blanket +5/+10 % — the
    // full kit +35 %. Masses [DEFAULT].
    airMattress:  { name: 'Air mattress',  kind: 'camp',       massKg: 3,   bed: 'ground', rest: 0.05, campSlot: 'bed', model: 'airMattress',
                    desc: 'Off the rocks, mostly. Leaks a little by morning.' },
    sleepingPad:  { name: 'Sleeping pad',  kind: 'camp',       massKg: 1,   bed: 'ground', rest: 0.10, campSlot: 'bed', model: 'sleepingPad',
                    desc: 'A foam pad that keeps the cold ground away from you.' },
    deluxeSleepingPad: { name: 'Deluxe sleeping pad', kind: 'camp', massKg: 2, bed: 'ground', rest: 0.15, campSlot: 'bed', model: 'deluxeSleepingPad',
                    desc: 'Thick and self-inflating. The best night you can have outdoors.' },
    blanket:      { name: 'Blanket',       kind: 'camp',       massKg: 1,   bed: 'blanket', rest: 0.05, campSlot: 'bed', model: 'blanket',
                    desc: 'A wool blanket on top of whatever you sleep on.' },
    quilt:        { name: 'Quilt',         kind: 'camp',       massKg: 2,   bed: 'blanket', rest: 0.10, campSlot: 'bed', model: 'quilt',
                    desc: 'A heavy patchwork quilt. Somebody spent a winter on it.' },   // ASSET-81
    sleepingBag:  { name: 'Sleeping bag',  kind: 'camp',       massKg: 1.5, bed: 'bedding', rest: 0.10, campSlot: 'bed', model: 'sleepingBag',
                    desc: 'Zip in and stay warm. Takes the bedroll\'s place.' },
    // The tent is the sleeping bag's size of bonus (owner, 2026-11-02) and stands over the bed.
    tent:         { name: 'Tent',          kind: 'camp',       massKg: 2.5, rest: 0.10, campSlot: 'shelter', model: 'tent',
                    desc: 'A small ridge tent. The weather happens outside it.' },
    // `fills` names the vibe segment the item gives back on the chosen site (camp.js vibeAssist): the
    // awning and the tarp both fill the shade deficit, trees or no trees (owner, 2026-11-02). Masses
    // [DEFAULT].
    awning:       { name: 'Awning',        kind: 'camp',       massKg: 8,   fills: 'shade', campSlot: 'shade', model: 'awning',
                    desc: 'A striped canopy on four poles. Shade wherever you pitch it.' },
    shadeTarp:    { name: 'Shade tarp',    kind: 'camp',       massKg: 2,   fills: 'shade', campSlot: 'shade', model: 'shadeTarp',
                    desc: 'A tarp, a pole and some line. Shade where there are no trees.' },
    // About fifty pounds of iron (items.md §2b). Its effect waits on groceries, which are not built.
    cookingKit:   { name: 'Cooking kit',   kind: 'camp',       massKg: 23,  campSlot: 'overFire', model: 'cookingKit',
                    desc: 'An iron A-frame and a Dutch oven to hang over the fire. Heavy.' },

    // ── Vehicle parts (data/parts.js), owned UNFITTED: a slot each, and the entry carries the part's
    //    wear as `cond`. A massless part ('No lift') is an absence, not a thing you can carry. The
    //    spare keeps its own line above (its icon, and `use`: fit it on a flat, roadside).
    ...Object.fromEntries(Object.entries(PARTS).filter(([id, p]) => p.massKg > 0 && id !== 'spareTire')
        .map(([id, p]) => [id, { name: p.name, kind: 'part', massKg: p.massKg, desc: p.desc, thumb: partIcon(id), rarity: p.rarity }])),
}

/** Kinds that stack into one slot per item kind. */
export const STACKING_KINDS = new Set(['consumable', 'food'])
