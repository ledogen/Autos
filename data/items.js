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
//   use      the effect hook main.js supplies, if the effect is built. Usable items auto-bind to
//            a free quick slot (keys 1–4, items.md §1c).

export const ITEMS = {
    coffee:       { name: 'Coffee',        kind: 'consumable', massKg: 0.5, use: 'coffee',
                    desc: 'Wakes you up now. You will feel it in the morning.' },
    chiliDog:     { name: 'Chili dog',     kind: 'food',       massKg: 0.3,
                    desc: 'Still warm, for now.' },
    // P235/75R15 on a steel rim.
    spareTire:    { name: 'Spare tire',    kind: 'part',       massKg: 20,
                    desc: 'A full-size spare on a steel wheel. Heavy to carry around.' },
    // A 2 gal RotoPax: ~5.7 kg of gas + ~1.5 kg of can (data/offers.js REWARDS).
    emergencyGas: { name: 'Emergency gas', kind: 'consumable', massKg: 7.2, use: 'gas',
                    desc: 'A small can of gas, for when the gauge lies.' },
    // One plug per kit; the effect ('plug') is the parts session's (owner hand-off 2026-10-21).
    tirePlugKit:  { name: 'Tire plug kit', kind: 'consumable', massKg: 0.3, use: 'plug',
                    desc: 'Sticky string plugs and the tools to push one in. Fixes the hole, not the wear.' },
    // A 12 V portable inflator: a plug repair is 30 min in all with it, 2 h by hand (items.md §7).
    compressor:   { name: 'Compressor',    kind: 'tool',       massKg: 4,
                    desc: 'A little pump that runs off the lighter socket. Airs a tire up while you wait.' },

    // ── Backpacks (items.md §2c) — `packSlots` camp items ride inside; `reachM` is how far past the
    //    road edge camp may be (campRoadEdgeM — not wired yet: the starter's is today's tether).
    pack:         { name: 'Pack',          kind: 'pack',       massKg: 1.5, packSlots: 2, reachM: 40,
                    desc: 'An old canvas pack. Whatever is in it comes to camp.' },

    // ── Camp gear (items.md §2b) — `sleep` marks a sleeping item: the equipped pack always holds one.
    bedroll:      { name: 'Bedroll',       kind: 'camp',       massKg: 2.5, sleep: true,
                    desc: 'A rolled bed for the ground. Better than the dirt, not by much.' },
}

/** Kinds that stack into one slot per item kind. */
export const STACKING_KINDS = new Set(['consumable', 'food'])
