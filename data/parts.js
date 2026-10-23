// ── SM-3: the parts catalog — what can be bolted onto the truck ─────────────────────────────────
//
// items.md §3 is the design. A part is a SWAP OF VALUES THE PHYSICS ALREADY READS — fitting one is
// `Object.assign(params, part.patch)`, the data/transmissions.js pattern — never a stat on a card
// (SM-INV-10). Owner rulings 2026-10-20: families now (OEM / Sport / Off-road / Heavy-duty, §3d),
// brands later; a part taken off at the service center is sold or kept, and keeps its wear.
//
//   SLOTS       the sockets on the truck: each covers at most ONE damage track (owner, 2026-10-20 —
//               a part is what the durability system tracks: one tire, or one axle's pair of springs,
//               shocks, brakes or roll bar), with its swap labour in game hours (`hours`, [DEFAULT]).
//               `takes` names the part slot it accepts when that isn't its own key: the four tire
//               corners all take a 'tire', so one race tire on one corner is the player's call. The
//               wheel is its own part under the tire (owner, 2026-10-21: the damage model already
//               tracks them apart), so the four wheel corners take a 'wheel' the same way.
//   slot        which socket (or, for tires and wheels, which kind of socket) it fits. Every socket has a STOCK
//               part (`stock: true`) carrying the 2002 Ranger's own values (data/ranger.js), so
//               swapping back to stock restores them exactly. Every part in a slot patches the SAME
//               keys, and no two slots share a key — test/parts.mjs pins both.
//   family      'oem' | 'sport' | 'offroad' | 'hd' | 'old' (items.md §3d; 'old' is §3g's bottom rung)
//   rarity      'common' | 'uncommon' | 'rare' | 'legendary' — how scarce it is, shown as the colour
//               behind its slot's shared icon (owner, 2026-10-20: race gear is rare, sport uncommon).
//               A colour, never a number (SM-INV-10).
//   icon        the thumbnail stem when the slot's won't do: brakes are pads OR drum shoes by what the
//               part is, not by axle (owner, 2026-10-21 — this truck has rear drums, a later one may not)
//   patch       the params it writes (absolute values for THIS truck — a part is for a Ranger)
//   grip        tires only: this tire's friction against the stock tire's (params.frictionCoeff stays
//               the truck-wide base). Per corner, so it is published per wheel (src/parts.js).
//   load        FEAT-112 load ratings it brings (springs / dampers / tires) — the weakest part sets
//               the truck's limits, so one heavy-duty axle (or three load-range tires) moves nothing
//   price       $ at day-1 rates — [DEFAULT] placeholders until FEAT-69 prices the repair economy
//   massKg      real load while stowed in inventory (a fitted part's mass is not modelled)
//   desc        described, never scored: no digits (test/parts.mjs checks)
//
// Durability per family is the SM-3 parts lever: damage.js setDurability() on the socket's track.
// Bigger = takes longer to wear. [DEFAULT] — §3d's ordering, not its numbers.
//
// ponytail: off-road and LT tires change grip and durability only. Their size and mass (§3g) wait on
// a path that resizes the wheels live — wheelRadius/wheelMass are fixed after load today.

export const SLOTS = {
    tireFL:       { name: 'Front-left tire',   takes: 'tire', hours: 0.25, tracks: ['tireFL'] },
    tireFR:       { name: 'Front-right tire',  takes: 'tire', hours: 0.25, tracks: ['tireFR'] },
    tireRL:       { name: 'Rear-left tire',    takes: 'tire', hours: 0.25, tracks: ['tireRL'] },
    tireRR:       { name: 'Rear-right tire',   takes: 'tire', hours: 0.25, tracks: ['tireRR'] },
    wheelFL:      { name: 'Front-left wheel',  takes: 'wheel', hours: 0.5, tracks: ['wheelFL'] },
    wheelFR:      { name: 'Front-right wheel', takes: 'wheel', hours: 0.5, tracks: ['wheelFR'] },
    wheelRL:      { name: 'Rear-left wheel',   takes: 'wheel', hours: 0.5, tracks: ['wheelRL'] },
    wheelRR:      { name: 'Rear-right wheel',  takes: 'wheel', hours: 0.5, tracks: ['wheelRR'] },
    springsFront: { name: 'Front springs',     hours: 1.5,  tracks: ['springFront'] },
    springsRear:  { name: 'Rear springs',      hours: 1.5,  tracks: ['springRear'] },
    dampersFront: { name: 'Front shocks',      hours: 0.75, tracks: ['damperFront'] },
    dampersRear:  { name: 'Rear shocks',       hours: 0.75, tracks: ['damperRear'] },
    brakesFront:  { name: 'Front brakes',      hours: 1,    tracks: ['brakeFront'] },
    brakesRear:   { name: 'Rear brakes',       hours: 1,    tracks: ['brakeRear'] },
    arbFront:     { name: 'Front anti-roll bar', hours: 0.5, tracks: [] },
    arbRear:      { name: 'Rear anti-roll bar',  hours: 0.5, tracks: [] },
    diff:         { name: 'Rear differential', hours: 3,    tracks: [] },
    lift:         { name: 'Lift',              hours: 4,    tracks: [] },
    // The engine bay (owner, 2026-10-22): these were damage tracks with no part; exchange and the shop
    // shelf need them to exist as parts. Either headlight socket takes the one 'headlight' part.
    engine:       { name: 'Engine',            hours: 8,    tracks: ['engine'] },
    radiator:     { name: 'Radiator',          hours: 1.5,  tracks: ['radiator'] },
    airFilter:    { name: 'Air filter',        hours: 0.25, tracks: ['airFilter'] },
    headlightL:   { name: 'Left headlight',    takes: 'headlight', hours: 0.5, tracks: ['headlightL'] },
    headlightR:   { name: 'Right headlight',   takes: 'headlight', hours: 0.5, tracks: ['headlightR'] },
}

/** The part slot a socket accepts. */
export const takes = (socket) => SLOTS[socket].takes ?? socket
/** The sockets a part can go in (four for a tire or wheel, one for anything else, none for the spare —
 *  it goes on as its tire and its wheel, src/recovery.js fitSpare). */
export const socketsFor = (id) => PARTS[id]?.mounted ? [] : Object.keys(SLOTS).filter(s => takes(s) === PARTS[id]?.slot)
/** The inventory thumbnail's stem (assets/items/<stem>.png): the part's own `icon`, else its slot's —
 *  front and rear halves share one. */
export const partIcon = (id) => PARTS[id].icon ?? PARTS[id].slot.replace(/(Front|Rear)$/, '')

/** The tint behind a part's icon, per rarity (owner, 2026-10-20: gray, green, blue, orange). */
export const RARITY_COLOR = { common: '#8a929b', uncommon: '#4fa35a', rare: '#3f7fd6', legendary: '#e0892c' }

export const FAMILY_DURABILITY = { old: 0.6, oem: 1, sport: 0.7, offroad: 1.2, hd: 2 }

const LT_LOAD = { tires: { softKg: 800, hardKg: 1100, popKg: 850 } }
const HD_SPRINGS = { springs: { softKg: 800, hardKg: 1100 } }
const HD_DAMPERS = { dampers: { softKg: 800, hardKg: 1100 } }

export const PARTS = {
    // ── Tires (§3g) — ONE tire each, any corner. Grip is against the stock tire; dirt grip waits on
    //    FEAT-38. Masses are the tire alone (a 225/70R15 is ~12 kg); the all-terrain is the standard
    //    one's × 1.2 (owner, 2026-10-21).
    //    Prices (owner, 2026-10-22): old $7, standard $15, sport $20, all-terrain $25. Sport grip +10% on pavement and wears ×1.25
    //    (`durability` 0.8 overrides its family). Its −10% and the all-terrain's +15% ON DIRT wait on
    //    FEAT-38: grip is one number per tire until the physics knows what each tire stands on.
    //    The spare is its own part (owner, 2026-10-20): a full-size spare MOUNTED on a steel wheel, new
    //    at ~$25 (owner, 2026-10-21; a worn one, 50–80%, comes from the reward pools). It is carried,
    //    never fitted as itself: `mounted` names what goes on the corner (src/recovery.js fitSpare).
    tireOld:       { name: 'Old tire',             slot: 'tire', family: 'old', rarity: 'common', price: 7, massKg: 12, grip: 0.9,
                     patch: {}, desc: 'Just a tire: hard, cracked rubber off something else. Can’t drive on it without a rim; the shop mounts it.' },
    tireStandard:  { name: 'Standard tire',        slot: 'tire', family: 'oem', rarity: 'common', price: 15, massKg: 12, grip: 1, stock: true,
                     patch: {}, desc: 'Just a tire, the all-season the truck left the factory on. Can’t drive on it without a rim; the shop mounts it.' },
    spareTire:     { name: 'Spare tire',           slot: 'tire', family: 'oem', rarity: 'common', price: 25, massKg: 21, grip: 1, mounted: { tire: 'tireStandard', wheel: 'wheelSteel' },
                     patch: {}, desc: 'A tire already mounted on a steel wheel. Bolt it on in place of a flat. Heavy to carry around.' },
    tireSport:     { name: 'Sport tire',           slot: 'tire', family: 'sport', rarity: 'uncommon', price: 20, massKg: 11.5, grip: 1.1, durability: 0.8,
                     patch: {}, desc: 'Just a tire, soft and sticky on pavement, lost on dirt, and it wears fast. Can’t drive on it without a rim; the shop mounts it.' },
    tireOffroad:   { name: 'All-terrain tire',     slot: 'tire', family: 'offroad', rarity: 'uncommon', price: 25, massKg: 14.4, grip: 1,
                     patch: {}, desc: 'Just a tire, chunky tread: no worse on pavement, at home on dirt. Can’t drive on it without a rim; the shop mounts it.' },
    tireLT:        { name: 'Load-range E tire',    slot: 'tire', family: 'hd', rarity: 'uncommon', price: 10, massKg: 15, grip: 0.95,
                     patch: {}, load: LT_LOAD,
                     desc: 'Just a tire, with a stiff sidewall built to carry weight. Can’t drive on it without a rim; the shop mounts it.' },

    // ── Wheels — ONE wheel each, any corner, under its tire (owner, 2026-10-21). A bent one runs out
    //    of round (damage.js wheelRunoutAtZero); the shop straightens it or sells a new one.
    //    Roadside rule (owner, 2026-10-21): no tools to seat a bead, so a LOOSE tire or wheel is only
    //    ever mounted at the service center — the mounted spare is the roadside answer. A part's desc
    //    says plainly what it does.
    wheelSteel:    { name: 'Steel wheel',          slot: 'wheel', family: 'oem', rarity: 'common', price: 8, massKg: 9, stock: true,
                     patch: {}, desc: 'Just a rim, no tire: pressed steel, the kind the truck came on. It bends before it breaks. The shop mounts a tire on it.' },

    // ── Springs and shocks (§3f) — one axle's pair. Load ratings: §3f's package, [DEFAULT] numbers.
    springsFrontOEM: { name: 'Stock front springs', slot: 'springsFront', family: 'oem', rarity: 'common', price: 7, massKg: 14, stock: true,
                       patch: { suspensionStiffnessFront: 33000 }, desc: 'The factory coils.' },
    springsFrontHD:  { name: 'Heavy-duty front springs', slot: 'springsFront', family: 'hd', rarity: 'uncommon', price: 25, massKg: 17,
                       patch: { suspensionStiffnessFront: 46000 }, load: HD_SPRINGS,
                       desc: 'Stiffer coils. Hold the nose up under a load, and crash over bumps when empty.' },
    springsRearOEM:  { name: 'Stock rear springs',  slot: 'springsRear', family: 'oem', rarity: 'common', price: 7, massKg: 16, stock: true,
                       patch: { suspensionStiffnessRear: 33000 }, desc: 'The factory leaf packs.' },
    springsRearHD:   { name: 'Heavy-duty rear springs', slot: 'springsRear', family: 'hd', rarity: 'uncommon', price: 25, massKg: 21,
                       patch: { suspensionStiffnessRear: 52000 }, load: HD_SPRINGS,
                       desc: 'An extra leaf. Sits level under a load, bucks when empty.' },
    // Sport tier (owner, 2026-10-22): stiffer than stock, softer than HD, stock height, stock load
    // rating; Sport family, so they wear faster. [DEFAULT] +35% rate, +40% damping (the page's middle
    // options). Prices: springs $15, shocks $15; heavy-duty is the endgame mod at $25 (owner, 2026-10-22).
    // Lowering springs (owner, 2026-10-22): they sit 30 mm under stock. `drop` (m) shortens the spring's
    // free length; the stiffer rate alone sags 29 mm (front) / 24 mm (rear) less than stock, so the drop
    // is that plus 30 mm. The bump stop is bolted to the body, so the bump travel shrinks by the same
    // drop (src/parts.js _rideHeight): about 30 mm less bump travel than stock at rest.
    springsFrontSport: { name: 'Sport front springs', slot: 'springsFront', family: 'sport', rarity: 'uncommon', price: 15, massKg: 14, drop: 0.059,
                       patch: { suspensionStiffnessFront: 44550 },
                       desc: 'Shorter, stiffer coils that drop the nose. Flat and sharp on pavement; they hit the stops sooner on rough ground and tire sooner.' },
    springsRearSport:  { name: 'Sport rear springs',  slot: 'springsRear', family: 'sport', rarity: 'uncommon', price: 15, massKg: 16, drop: 0.054,
                       patch: { suspensionStiffnessRear: 44550 },
                       desc: 'Lowering leaves, stiffer than stock. Squats less and corners flat; bottoms out sooner loaded or on rough ground, and they tire sooner.' },
    dampersFrontOEM: { name: 'Stock front shocks',  slot: 'dampersFront', family: 'oem', rarity: 'common', price: 6, massKg: 6, stock: true,
                       patch: { suspensionDampingFront: 3500 }, desc: 'Factory shocks, tuned for an empty bed.' },
    dampersFrontHD:  { name: 'Heavy-duty front shocks', slot: 'dampersFront', family: 'hd', rarity: 'uncommon', price: 25, massKg: 7,
                       patch: { suspensionDampingFront: 5000 }, load: HD_DAMPERS,
                       desc: 'Firm valving that settles a loaded truck. Busy and harsh when empty.' },
    dampersRearOEM:  { name: 'Stock rear shocks',   slot: 'dampersRear', family: 'oem', rarity: 'common', price: 6, massKg: 6, stock: true,
                       patch: { suspensionDampingRear: 4000 }, desc: 'Factory shocks, tuned for an empty bed.' },
    dampersRearHD:   { name: 'Heavy-duty rear shocks', slot: 'dampersRear', family: 'hd', rarity: 'uncommon', price: 25, massKg: 7,
                       patch: { suspensionDampingRear: 6000 }, load: HD_DAMPERS,
                       desc: 'Firm valving that settles a loaded bed. Busy and harsh when empty.' },
    dampersFrontSport: { name: 'Sport front shocks', slot: 'dampersFront', family: 'sport', rarity: 'uncommon', price: 15, massKg: 6,
                       patch: { suspensionDampingFront: 4900 },
                       desc: 'Quick, firm valving. The nose stays put and the ride gets busy. They wear out faster.' },
    dampersRearSport:  { name: 'Sport rear shocks',  slot: 'dampersRear', family: 'sport', rarity: 'uncommon', price: 15, massKg: 6,
                       patch: { suspensionDampingRear: 5600 },
                       desc: 'Quick, firm valving. The tail settles fast and the ride gets busy. They wear out faster.' },
    // ── Brakes, per axle (DESIGN.md: pad grades per axle set the bias): pads up front, drum shoes at
    //    the rear on this truck. [DEFAULT] torques; the whole ladder rose 10 % with the stock brakes
    //    for ABS (FEAT-135, 2026-10-21).
    brakesFrontStd:  { name: 'Standard front pads',  slot: 'brakesFront', icon: 'pads', family: 'oem', rarity: 'common', price: 5, massKg: 2, stock: true,
                     patch: { maxBrakeTorqueFront: 1430 },
                     desc: 'Organic pads. Quiet, gentle, forgiving.' },
    brakesFrontSport:{ name: 'Sport front pads',     slot: 'brakesFront', icon: 'pads', family: 'sport', rarity: 'uncommon', price: 8, massKg: 2,
                     patch: { maxBrakeTorqueFront: 1705 },
                     desc: 'Semi-metallic. More bite up front, and they eat themselves faster.' },
    brakesFrontRace: { name: 'Race front pads',      slot: 'brakesFront', icon: 'pads', family: 'sport', rarity: 'rare', price: 12, massKg: 2,
                     patch: { maxBrakeTorqueFront: 1980 },
                     desc: 'Grabby and loud. Locks the fronts if you stab them.' },
    brakesRearStd:   { name: 'Standard rear shoes',  slot: 'brakesRear', icon: 'shoes', family: 'oem', rarity: 'common', price: 5, massKg: 3, stock: true,
                     patch: { maxBrakeTorqueRear: 495 },
                     desc: 'Factory drum shoes, set soft so the light rear never locks.' },
    brakesRearSport: { name: 'Sport rear shoes',     slot: 'brakesRear', icon: 'shoes', family: 'sport', rarity: 'uncommon', price: 8, massKg: 3,
                     patch: { maxBrakeTorqueRear: 660 },
                     desc: 'More rear bite. The back steps out sooner under hard braking.' },
    brakesRearRace:  { name: 'Race rear shoes',      slot: 'brakesRear', icon: 'shoes', family: 'sport', rarity: 'rare', price: 12, massKg: 3,
                     patch: { maxBrakeTorqueRear: 825 },
                     desc: 'Aggressive rear lining. Brake while turning and the tail comes round.' },

    // ── Anti-roll bars (§3b — the ratified sport pair; stock is the code's 4500 front, no rear bar).
    arbFrontStock: { name: 'Stock front anti-roll bar', slot: 'arbFront', family: 'oem', rarity: 'common', price: 10, massKg: 8, stock: true,
                     patch: { arbStiffnessFront: 4500 }, desc: 'The factory front bar.' },
    arbFrontSport: { name: 'Sport front anti-roll bar', slot: 'arbFront', family: 'sport', rarity: 'uncommon', price: 10, massKg: 8,
                     patch: { arbStiffnessFront: 9500 }, desc: 'A thicker front bar. Flat and sharp on pavement, and it pushes.' },
    // A jalopy sometimes rolls in with its front bar gone (owner, 2026-10-21).
    arbFrontNone:  { name: 'No front anti-roll bar', slot: 'arbFront', family: 'oem', rarity: 'common', price: 0, massKg: 0,
                     patch: { arbStiffnessFront: 0 }, desc: 'The front wheels move free of each other. It leans, and it turns in.' },
    arbRearNone:   { name: 'No rear anti-roll bar', slot: 'arbRear', family: 'oem', rarity: 'common', price: 0, massKg: 0, stock: true,
                     patch: { arbStiffnessRear: 0 }, desc: 'The rear wheels move free of each other.' },
    arbRearSport:  { name: 'Sport rear anti-roll bar', slot: 'arbRear', family: 'sport', rarity: 'uncommon', price: 8, massKg: 6,
                     patch: { arbStiffnessRear: 6500 }, desc: 'Ties the rear wheels together. Rotates the truck; one bump becomes both wheels’ problem.' },

    // ── Rear differential (§3b — the canonical described-never-scored part).
    diffOpen:      { name: 'Open differential',    slot: 'diff', family: 'oem', rarity: 'common', price: 20, massKg: 30, stock: true,
                     patch: { rearDiffMode: 'open' },
                     desc: 'Power goes to whichever rear wheel has the least grip.' },
    diffLSD:       { name: 'Limited-slip differential', slot: 'diff', family: 'sport', rarity: 'rare', price: 40, massKg: 32,
                     patch: { rearDiffMode: 'lsd' },
                     desc: 'Clutch packs share the drive. Pulls out of corners, and pushes into them.' },
    // The welded diff replaces the locker (owner, 2026-10-22): "its cheaper … I do want a silly locked
    // diff option to show up occasionally". Same physics as a locker. Price [DEFAULT], under its $35.
    diffWelded:    { name: 'Welded differential', slot: 'diff', family: 'offroad', rarity: 'uncommon', price: 15, massKg: 30,
                     patch: { rearDiffMode: 'locked' },
                     desc: 'The spider gears welded solid. Both rear wheels turn together, always: they chirp and hop through every tight turn.' },

    // ── Lift (§3g — the first Off-road part). Body offset: NEGATIVE raises the body. [DEFAULT] 5 cm.
    liftNone:      { name: 'No lift',              slot: 'lift', family: 'oem', rarity: 'common', price: 0, massKg: 0, stock: true,
                     patch: { suspensionBodyOffsetFront: 0.0, suspensionBodyOffsetRear: 0.035,
                              suspensionRestLengthFront: 0.20, suspensionRestLengthRear: 0.22,
                              suspensionTravelFront: 0.25, suspensionTravelRear: 0.25 },
                     desc: 'Factory ride height.' },
    liftKit:       { name: 'Lift kit',             slot: 'lift', family: 'offroad', rarity: 'uncommon', price: 30, massKg: 20,
                     patch: { suspensionBodyOffsetFront: -0.05, suspensionBodyOffsetRear: -0.015,
                              suspensionRestLengthFront: 0.20, suspensionRestLengthRear: 0.22,
                              suspensionTravelFront: 0.30, suspensionTravelRear: 0.30 },
                     desc: 'Spacers and longer shocks. Clears ruts and rocks; leans more, and rolls sooner.' },

    // ── The engine bay (owner, 2026-10-22). Stock only for now: they patch nothing — the part IS its
    //    damage track's condition. Prices (owner, 2026-10-22): engine $60 — CHEAPER than a rebuild to
    //    the bench's cap ($64, REPAIRS.engine × REPAIR_CAP), radiator $22, the same as a weld to it,
    //    headlight $6; the filter is items.md's spare air filter. A crate engine is ~180 kg of load.
    //    (A different transmission is deferred: the gearbox type is the run-setup preset, FEAT-125/126.)
    engineStock:   { name: 'Stock engine',         slot: 'engine', family: 'oem', rarity: 'common', price: 60, massKg: 180, stock: true,
                     patch: {}, desc: 'The factory six, on a pallet. A long day to swap.' },
    radiatorStock: { name: 'Stock radiator',       slot: 'radiator', family: 'oem', rarity: 'common', price: 22, massKg: 7, stock: true,
                     patch: {}, desc: 'The factory radiator. Keeps the engine cool when it isn’t leaking.' },
    // items.md's ratified "Spare air filter" is this part: $10 new at the auto shop, 15 min to fit at the
    // roadside (`roadside`: src/recovery.js fitRoadside), carries its own condition.
    airFilterStock:{ name: 'Air filter',           slot: 'airFilter', family: 'oem', rarity: 'common', price: 10, massKg: 0.5, stock: true,
                     roadside: true, patch: {}, desc: 'A paper filter. A clean one lets the engine breathe. Swaps in by hand, no shop needed.' },
    headlightStock:{ name: 'Headlight',            slot: 'headlight', family: 'oem', rarity: 'common', price: 6, massKg: 1.5, stock: true,
                     patch: {}, desc: 'A sealed beam lamp, either side.' },
}

/** The stock part for a socket. */
export const stockPart = (socket) => Object.keys(PARTS).find(id => PARTS[id].slot === takes(socket) && PARTS[id].stock)

// ── The service center's repair bench (owner accepted these placeholders 2026-10-20; FEAT-69 tunes).
// Per damage CLASS (src/damage.js TRACKS): `price` $ and `hours` to take ONE track from 0 to 100%, at
// day-1 rates, charged pro rata on the gap repaired. `price: null` = the fitted part's price (a worn
// pair of springs costs a new pair).
// A class missing here is REPLACE-ONLY (owner, 2026-10-22): tires, brakes, the air filter and the
// headlights are exchanged or bought, never repaired — "you can only replace pads". A repair reaches
// REPAIR_CAP at most, in REPAIR_STEP increments: only a new part is 100%. Alignment is an adjustment,
// not wear — it always goes straight back to 100%.
export const REPAIRS = {
    wheel:        { price: 8,    hours: 1 },     // straightened
    armor:        { price: 10,   hours: 2 },     // panel beaten
    spring:       { price: null, hours: 2 },     // re-arched
    damper:       { price: null, hours: 1.5 },   // rebuilt
    // Owner, 2026-10-22: a rebuild to the cap costs MORE than a used engine ($64 vs $60 new) — "it
    // should be more expensive to repair an engine than to swap in a used one"; a weld to 80% is $22,
    // the price of a new radiator. These are 0→100% rates, so × 0.8 is the cap's price.
    engine:       { price: 80,   hours: 4 },     // rebuilt
    radiator:     { price: 27.5, hours: 2 },     // welded
    alignment:    { price: 4,    hours: 0.5 },
    transmission: { price: 30,   hours: 3 },     // rebuilt
}
export const REPAIR_CAP = 0.8
export const REPAIR_STEP = 0.05
/** The shop can still patch a flat: fixes the hole, not the wear — about a plug kit's price, and its
 *  half hour (owner, 2026-10-22). */
export const PATCH = { price: 5, hours: 0.5 }

/** A part sold back to the shop fetches half its price × its condition (owner, 2026-10-20). */
export const SELL_FRACTION = 0.5
