// ── SM-3: the parts catalog — what can be bolted onto the truck ─────────────────────────────────
//
// items.md §3 is the design. A part is a SWAP OF VALUES THE PHYSICS ALREADY READS — fitting one is
// `Object.assign(params, part.patch)`, the data/transmissions.js pattern — never a stat on a card
// (SM-INV-10). Owner rulings 2026-10-20: families now (OEM / Sport / Off-road / Heavy-duty, §3d),
// brands later; a part taken off at the service center is sold or kept, and keeps its wear.
//
//   slot        which socket it fits. One part per slot; every slot has a STOCK part (`stock: true`)
//               carrying the 2002 Ranger's own values (data/ranger.js), so swapping back to stock
//               restores them exactly. Every part in a slot patches the SAME keys, and no two slots
//               share a key — test/parts.mjs pins both.
//   family      'oem' | 'sport' | 'offroad' | 'hd' | 'old' (items.md §3d; 'old' is §3g's bottom rung)
//   patch       the params it writes (absolute values for THIS truck — a part is for a Ranger)
//   load        FEAT-112 load ratings it brings (springs / dampers / tires) — the weakest of the three
//               sets the truck's limits, so a lone heavy-duty part moves nothing (§3f)
//   price       $ at day-1 rates — [DEFAULT] placeholders until FEAT-69 prices the repair economy
//   massKg      real load while stowed in inventory (a fitted part's mass is not modelled)
//   desc        described, never scored: no digits (test/parts.mjs checks)
//
// Durability per family is the SM-3 parts lever: damage.js setDurability() on each track the slot
// covers. Bigger = takes longer to wear. [DEFAULT] — §3d's ordering, not its numbers.
//
// ponytail: off-road and LT tires change grip and durability only. Their size and mass (§3g) wait on
// a path that resizes the wheels live — wheelRadius/wheelMass are fixed after load today.

export const SLOTS = {
    tires:     { name: 'Tires',             tracks: ['tireFL', 'tireFR', 'tireRL', 'tireRR'] },
    springs:   { name: 'Springs',           tracks: ['springFront', 'springRear'] },
    dampers:   { name: 'Dampers',           tracks: ['damperFront', 'damperRear'] },
    padsFront: { name: 'Front brake pads',  tracks: ['brakeFront'] },
    padsRear:  { name: 'Rear brake pads',   tracks: ['brakeRear'] },
    arb:       { name: 'Anti-roll bars',    tracks: [] },
    diff:      { name: 'Rear differential', tracks: [] },
    lift:      { name: 'Lift',              tracks: [] },
}

export const FAMILY_DURABILITY = { old: 0.6, oem: 1, sport: 0.7, offroad: 1.2, hd: 2 }

export const PARTS = {
    // ── Tires (§3g) — a set of four. Grip is frictionCoeff; dirt grip waits on FEAT-38.
    tiresOld:      { name: 'Old tires',            slot: 'tires', family: 'old', price: 12, massKg: 80,
                     patch: { frictionCoeff: 0.72 },
                     desc: 'Hard, cracked rubber off something else. They roll.' },
    tiresStandard: { name: 'Standard tires',       slot: 'tires', family: 'oem', price: 24, massKg: 80, stock: true,
                     patch: { frictionCoeff: 0.80 },
                     desc: 'The all-season tire the truck left the factory on.' },
    tiresSport:    { name: 'Sport tires',          slot: 'tires', family: 'sport', price: 34, massKg: 76,
                     patch: { frictionCoeff: 0.88 },
                     desc: 'Soft and sticky on pavement. Lost on dirt, and they wear fast.' },
    tiresOffroad:  { name: 'All-terrain tires',    slot: 'tires', family: 'offroad', price: 36, massKg: 92,
                     patch: { frictionCoeff: 0.80 },
                     desc: 'Chunky tread. No worse on pavement, and at home on dirt.' },
    tiresLT:       { name: 'Load-range E tires',   slot: 'tires', family: 'hd', price: 40, massKg: 96,
                     patch: { frictionCoeff: 0.76 },
                     load: { tires: { softKg: 800, hardKg: 1100, popKg: 850 } },
                     desc: 'Stiff sidewalls built to carry weight. Dull to steer, hard to pop.' },

    // ── Springs and dampers (§3f) — both axles. Load ratings: §3f's package, [DEFAULT] numbers.
    springsOEM:    { name: 'Stock springs',        slot: 'springs', family: 'oem', price: 14, massKg: 30, stock: true,
                     patch: { suspensionStiffnessFront: 33000, suspensionStiffnessRear: 33000 },
                     desc: 'Factory coils up front, factory leaves out back.' },
    springsHD:     { name: 'Heavy-duty springs',   slot: 'springs', family: 'hd', price: 26, massKg: 38,
                     patch: { suspensionStiffnessFront: 46000, suspensionStiffnessRear: 52000 },
                     load: { springs: { softKg: 800, hardKg: 1100 } },
                     desc: 'An extra leaf and stiffer coils. Sits level under a load, bucks when empty.' },
    dampersOEM:    { name: 'Stock shocks',         slot: 'dampers', family: 'oem', price: 12, massKg: 12, stock: true,
                     patch: { suspensionDampingFront: 3500, suspensionDampingRear: 4000 },
                     desc: 'Factory shocks, tuned for an empty bed.' },
    dampersHD:     { name: 'Heavy-duty shocks',    slot: 'dampers', family: 'hd', price: 22, massKg: 14,
                     patch: { suspensionDampingFront: 5000, suspensionDampingRear: 6000 },
                     load: { dampers: { softKg: 800, hardKg: 1100 } },
                     desc: 'Firm valving that settles a loaded truck. Busy and harsh when empty.' },

    // ── Brake pads, per axle (DESIGN.md: pad grades per axle set the bias). [DEFAULT] torques.
    padsFrontStd:  { name: 'Standard front pads',  slot: 'padsFront', family: 'oem', price: 5, massKg: 2, stock: true,
                     patch: { maxBrakeTorqueFront: 1300 },
                     desc: 'Organic pads. Quiet, gentle, forgiving.' },
    padsFrontSport:{ name: 'Sport front pads',     slot: 'padsFront', family: 'sport', price: 8, massKg: 2,
                     patch: { maxBrakeTorqueFront: 1550 },
                     desc: 'Semi-metallic. More bite up front, and they eat themselves faster.' },
    padsFrontRace: { name: 'Race front pads',      slot: 'padsFront', family: 'sport', price: 12, massKg: 2,
                     patch: { maxBrakeTorqueFront: 1800 },
                     desc: 'Grabby and loud. Locks the fronts if you stab them.' },
    padsRearStd:   { name: 'Standard rear shoes',  slot: 'padsRear', family: 'oem', price: 5, massKg: 3, stock: true,
                     patch: { maxBrakeTorqueRear: 450 },
                     desc: 'Factory drum shoes, set soft so the light rear never locks.' },
    padsRearSport: { name: 'Sport rear shoes',     slot: 'padsRear', family: 'sport', price: 8, massKg: 3,
                     patch: { maxBrakeTorqueRear: 600 },
                     desc: 'More rear bite. The back steps out sooner under hard braking.' },
    padsRearRace:  { name: 'Race rear shoes',      slot: 'padsRear', family: 'sport', price: 12, massKg: 3,
                     patch: { maxBrakeTorqueRear: 750 },
                     desc: 'Aggressive rear lining. Brake while turning and the tail comes round.' },

    // ── Anti-roll bars (§3b — the ratified sport pair; stock is the code's 4500 front, no rear).
    arbStock:      { name: 'Stock anti-roll bar',  slot: 'arb', family: 'oem', price: 10, massKg: 8, stock: true,
                     patch: { arbStiffnessFront: 4500, arbStiffnessRear: 0 },
                     desc: 'A front bar only. The rear wheels move free of each other.' },
    arbSport:      { name: 'Sport anti-roll bars', slot: 'arb', family: 'sport', price: 18, massKg: 14,
                     patch: { arbStiffnessFront: 9500, arbStiffnessRear: 6500 },
                     desc: 'A matched pair. Flat and sharp on pavement; one bump becomes both wheels’ problem.' },

    // ── Rear differential (§3b — the canonical described-never-scored part).
    diffOpen:      { name: 'Open differential',    slot: 'diff', family: 'oem', price: 20, massKg: 30, stock: true,
                     patch: { rearDiffMode: 'open' },
                     desc: 'Power goes to whichever rear wheel has the least grip.' },
    diffLSD:       { name: 'Limited-slip differential', slot: 'diff', family: 'sport', price: 40, massKg: 32,
                     patch: { rearDiffMode: 'lsd' },
                     desc: 'Clutch packs share the drive. Pulls out of corners, and pushes into them.' },
    diffLocked:    { name: 'Locker',               slot: 'diff', family: 'offroad', price: 35, massKg: 32,
                     patch: { rearDiffMode: 'locked' },
                     desc: 'Both rear wheels turn together, always. Unstoppable in mud, wrong on a tight turn.' },

    // ── Lift (§3g — the first Off-road part). Body offset: NEGATIVE raises the body. [DEFAULT] 5 cm.
    liftNone:      { name: 'No lift',              slot: 'lift', family: 'oem', price: 0, massKg: 0, stock: true,
                     patch: { suspensionBodyOffsetFront: 0.0, suspensionBodyOffsetRear: 0.035,
                              suspensionTravelFront: 0.25, suspensionTravelRear: 0.25 },
                     desc: 'Factory ride height.' },
    liftKit:       { name: 'Lift kit',             slot: 'lift', family: 'offroad', price: 30, massKg: 20,
                     patch: { suspensionBodyOffsetFront: -0.05, suspensionBodyOffsetRear: -0.015,
                              suspensionTravelFront: 0.30, suspensionTravelRear: 0.30 },
                     desc: 'Spacers and longer shocks. Clears ruts and rocks; leans more, and rolls sooner.' },
}

/** The stock part id for a slot. */
export const stockPart = (slot) => Object.keys(PARTS).find(id => PARTS[id].slot === slot && PARTS[id].stock)
