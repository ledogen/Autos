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

import { PARTS, partIcon } from './parts.js'

export const ITEMS = {
    coffee:       { name: 'Coffee',        kind: 'consumable', massKg: 0.5, use: 'coffee',
                    desc: 'Wakes you up now. You will feel it in the morning.' },
    chiliDog:     { name: 'Chili dog',     kind: 'food',       massKg: 0.3,
                    desc: 'Kinda gross.' },   // the owner's flavor line (setup page, 10-22)
    // P235/75R15 on a steel rim.
    spareTire:    { name: 'Mounted tire',  kind: 'part',       massKg: 18, use: 'spare',   // = RANGER_PARAMS.wheelMass
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
    // A pack of 5, 10% on a headlight, body panel or the radiator, 15 min a use (items.md §7). The
    // repair effect is the parts session's and isn't built, so for now it is carried only.
    zipTies:      { name: 'Zip ties',      kind: 'consumable', massKg: 0.2,
                    desc: "A mechanic's best friend." },
    // A ~0.35 kg roll, 3 uses (items.md §7): 20% on a body panel, 15 min, holds for the run. The repair
    // effect is the parts session's and isn't built, so for now it is carried only.
    ductTape:     { name: 'Duct tape',     kind: 'consumable', massKg: 0.35,
                    desc: 'Holds a panel on for the rest of the run. Not pretty, but it holds.' },
    // A low steel trolley jack, ~15 kg [DEFAULT]: takes 1 h off the spare change, never a plug repair
    // (owner, 2026-10-22 — "you don't need to jack to plug"). The time saving is the parts session's.
    quickJack:    { name: 'Quick-jack',    kind: 'tool',       massKg: 15,
                    desc: 'A low trolley jack that rolls under the truck. Gets a spare on quicker than the factory jack.' },

    // ── Backpacks (items.md §2c) — `packSlots` camp items ride inside; `reachM` is how far past the
    //    road edge camp may be (campRoadEdgeM — not wired yet: the starter's is today's tether).
    pack:         { name: 'Pack',          kind: 'pack',       massKg: 1.5, packSlots: 2, reachM: 40,
                    desc: 'An old canvas pack. Whatever is in it comes to camp.' },

    // ── Camp gear (items.md §2b) — `sleep` marks a sleeping item: the equipped pack always holds one.
    bedroll:      { name: 'Bedroll',       kind: 'camp',       massKg: 2.5, sleep: true,
                    desc: 'A rolled bed for the ground. Better than the dirt, not by much.' },
    // `rest` is the bonus on camp sleep's recovery rate while packed (owner, 2026-10-16), summed and
    // applied once (day.js recoveryRate). The beds replace the bedroll; the blanket and the sleeping
    // bag are add-ons in their own slot. Masses [DEFAULT].
    airMattress:  { name: 'Air mattress',  kind: 'camp',       massKg: 3,   sleep: true, rest: 0.05,
                    desc: 'Off the rocks, mostly. Leaks a little by morning.' },
    sleepingPad:  { name: 'Sleeping pad',  kind: 'camp',       massKg: 1,   sleep: true, rest: 0.10,
                    desc: 'A foam pad that keeps the cold ground away from you.' },
    deluxeSleepingPad: { name: 'Deluxe sleeping pad', kind: 'camp', massKg: 2, sleep: true, rest: 0.15,
                    desc: 'Thick and self-inflating. The best night you can have outdoors.' },
    blanket:      { name: 'Blanket',       kind: 'camp',       massKg: 1,   rest: 0.05,
                    desc: 'A wool blanket on top of whatever you sleep on.' },
    sleepingBag:  { name: 'Sleeping bag',  kind: 'camp',       massKg: 1.5, rest: 0.10,
                    desc: 'Zip in and stay warm. Goes on top of the bed.' },

    // ── Vehicle parts (data/parts.js), owned UNFITTED: a slot each, and the entry carries the part's
    //    wear as `cond`. A massless part ('No lift') is an absence, not a thing you can carry. The
    //    spare keeps its own line above (its icon, and `use`: fit it on a flat, roadside).
    ...Object.fromEntries(Object.entries(PARTS).filter(([id, p]) => p.massKg > 0 && id !== 'spareTire')
        .map(([id, p]) => [id, { name: p.name, kind: 'part', massKg: p.massKg, desc: p.desc, thumb: partIcon(id), rarity: p.rarity }])),
}

/** Kinds that stack into one slot per item kind. */
export const STACKING_KINDS = new Set(['consumable', 'food'])
