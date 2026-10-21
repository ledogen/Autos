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
//               corners all take a 'tire', so one race tire on one corner is the player's call.
//   slot        which socket (or, for tires, which kind of socket) it fits. Every socket has a STOCK
//               part (`stock: true`) carrying the 2002 Ranger's own values (data/ranger.js), so
//               swapping back to stock restores them exactly. Every part in a slot patches the SAME
//               keys, and no two slots share a key — test/parts.mjs pins both.
//   family      'oem' | 'sport' | 'offroad' | 'hd' | 'old' (items.md §3d; 'old' is §3g's bottom rung)
//   rarity      'common' | 'uncommon' | 'rare' | 'legendary' — how scarce it is, shown as the colour
//               behind its slot's shared icon (owner, 2026-10-20: race gear is rare, sport uncommon).
//               A colour, never a number (SM-INV-10).
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
    springsFront: { name: 'Front springs',     hours: 1.5,  tracks: ['springFront'] },
    springsRear:  { name: 'Rear springs',      hours: 1.5,  tracks: ['springRear'] },
    dampersFront: { name: 'Front shocks',      hours: 0.75, tracks: ['damperFront'] },
    dampersRear:  { name: 'Rear shocks',       hours: 0.75, tracks: ['damperRear'] },
    padsFront:    { name: 'Front brake pads',  hours: 1,    tracks: ['brakeFront'] },
    padsRear:     { name: 'Rear brake shoes',  hours: 1,    tracks: ['brakeRear'] },
    arbFront:     { name: 'Front anti-roll bar', hours: 0.5, tracks: [] },
    arbRear:      { name: 'Rear anti-roll bar',  hours: 0.5, tracks: [] },
    diff:         { name: 'Rear differential', hours: 3,    tracks: [] },
    lift:         { name: 'Lift',              hours: 4,    tracks: [] },
}

/** The part slot a socket accepts. */
export const takes = (socket) => SLOTS[socket].takes ?? socket
/** The sockets a part can go in (four for a tire, one for anything else). */
export const socketsFor = (id) => Object.keys(SLOTS).filter(s => takes(s) === PARTS[id]?.slot)
/** The inventory thumbnail's stem: front and rear halves share one icon (assets/items/<stem>.png) —
 *  except the brakes: pads up front, drum shoes at the rear (owner, 2026-10-21). */
export const partIcon = (id) => PARTS[id].slot === 'padsRear' ? 'shoes' : PARTS[id].slot.replace(/(Front|Rear)$/, '')

/** The tint behind a part's icon, per rarity (owner, 2026-10-20: gray, green, blue, orange). */
export const RARITY_COLOR = { common: '#8a929b', uncommon: '#4fa35a', rare: '#3f7fd6', legendary: '#e0892c' }

export const FAMILY_DURABILITY = { old: 0.6, oem: 1, sport: 0.7, offroad: 1.2, hd: 2 }

const LT_LOAD = { tires: { softKg: 800, hardKg: 1100, popKg: 850 } }
const HD_SPRINGS = { springs: { softKg: 800, hardKg: 1100 } }
const HD_DAMPERS = { dampers: { softKg: 800, hardKg: 1100 } }

export const PARTS = {
    // ── Tires (§3g) — ONE tire each, any corner. Grip is against the stock tire; dirt grip waits on
    //    FEAT-38. The spare is its own part (owner, 2026-10-20): a full-size spare on a steel wheel, new
    //    at ~$25 (owner, 2026-10-21; a worn one, 50–80%, comes from the reward pools).
    tireOld:       { name: 'Old tire',             slot: 'tire', family: 'old', rarity: 'common', price: 3, massKg: 20, grip: 0.9,
                     patch: {}, desc: 'Hard, cracked rubber off something else. It rolls.' },
    tireStandard:  { name: 'Standard tire',        slot: 'tire', family: 'oem', rarity: 'common', price: 6, massKg: 20, grip: 1, stock: true,
                     patch: {}, desc: 'The all-season tire the truck left the factory on.' },
    spareTire:     { name: 'Spare tire',           slot: 'tire', family: 'oem', rarity: 'common', price: 25, massKg: 20, grip: 1,
                     patch: {}, desc: 'A full-size spare on a steel wheel. Heavy to carry around.' },
    tireSport:     { name: 'Sport tire',           slot: 'tire', family: 'sport', rarity: 'uncommon', price: 8.5, massKg: 19, grip: 1.1,
                     patch: {}, desc: 'Soft and sticky on pavement. Lost on dirt, and it wears fast.' },
    tireOffroad:   { name: 'All-terrain tire',     slot: 'tire', family: 'offroad', rarity: 'uncommon', price: 9, massKg: 23, grip: 1,
                     patch: {}, desc: 'Chunky tread. No worse on pavement, and at home on dirt.' },
    tireLT:        { name: 'Load-range E tire',    slot: 'tire', family: 'hd', rarity: 'uncommon', price: 10, massKg: 24, grip: 0.95,
                     patch: {}, load: LT_LOAD,
                     desc: 'A stiff sidewall built to carry weight. Dull to steer, hard to pop.' },

    // ── Springs and shocks (§3f) — one axle's pair. Load ratings: §3f's package, [DEFAULT] numbers.
    springsFrontOEM: { name: 'Stock front springs', slot: 'springsFront', family: 'oem', rarity: 'common', price: 7, massKg: 14, stock: true,
                       patch: { suspensionStiffnessFront: 33000 }, desc: 'The factory coils.' },
    springsFrontHD:  { name: 'Heavy-duty front springs', slot: 'springsFront', family: 'hd', rarity: 'uncommon', price: 13, massKg: 17,
                       patch: { suspensionStiffnessFront: 46000 }, load: HD_SPRINGS,
                       desc: 'Stiffer coils. Hold the nose up under a load, and crash over bumps when empty.' },
    springsRearOEM:  { name: 'Stock rear springs',  slot: 'springsRear', family: 'oem', rarity: 'common', price: 7, massKg: 16, stock: true,
                       patch: { suspensionStiffnessRear: 33000 }, desc: 'The factory leaf packs.' },
    springsRearHD:   { name: 'Heavy-duty rear springs', slot: 'springsRear', family: 'hd', rarity: 'uncommon', price: 13, massKg: 21,
                       patch: { suspensionStiffnessRear: 52000 }, load: HD_SPRINGS,
                       desc: 'An extra leaf. Sits level under a load, bucks when empty.' },
    dampersFrontOEM: { name: 'Stock front shocks',  slot: 'dampersFront', family: 'oem', rarity: 'common', price: 6, massKg: 6, stock: true,
                       patch: { suspensionDampingFront: 3500 }, desc: 'Factory shocks, tuned for an empty bed.' },
    dampersFrontHD:  { name: 'Heavy-duty front shocks', slot: 'dampersFront', family: 'hd', rarity: 'uncommon', price: 11, massKg: 7,
                       patch: { suspensionDampingFront: 5000 }, load: HD_DAMPERS,
                       desc: 'Firm valving that settles a loaded truck. Busy and harsh when empty.' },
    dampersRearOEM:  { name: 'Stock rear shocks',   slot: 'dampersRear', family: 'oem', rarity: 'common', price: 6, massKg: 6, stock: true,
                       patch: { suspensionDampingRear: 4000 }, desc: 'Factory shocks, tuned for an empty bed.' },
    dampersRearHD:   { name: 'Heavy-duty rear shocks', slot: 'dampersRear', family: 'hd', rarity: 'uncommon', price: 11, massKg: 7,
                       patch: { suspensionDampingRear: 6000 }, load: HD_DAMPERS,
                       desc: 'Firm valving that settles a loaded bed. Busy and harsh when empty.' },
    // ── Brake pads, per axle (DESIGN.md: pad grades per axle set the bias). [DEFAULT] torques; the
    //    whole ladder rose 10 % with the stock brakes for ABS (FEAT-135, 2026-10-21).
    padsFrontStd:  { name: 'Standard front pads',  slot: 'padsFront', family: 'oem', rarity: 'common', price: 5, massKg: 2, stock: true,
                     patch: { maxBrakeTorqueFront: 1430 },
                     desc: 'Organic pads. Quiet, gentle, forgiving.' },
    padsFrontSport:{ name: 'Sport front pads',     slot: 'padsFront', family: 'sport', rarity: 'uncommon', price: 8, massKg: 2,
                     patch: { maxBrakeTorqueFront: 1705 },
                     desc: 'Semi-metallic. More bite up front, and they eat themselves faster.' },
    padsFrontRace: { name: 'Race front pads',      slot: 'padsFront', family: 'sport', rarity: 'rare', price: 12, massKg: 2,
                     patch: { maxBrakeTorqueFront: 1980 },
                     desc: 'Grabby and loud. Locks the fronts if you stab them.' },
    padsRearStd:   { name: 'Standard rear shoes',  slot: 'padsRear', family: 'oem', rarity: 'common', price: 5, massKg: 3, stock: true,
                     patch: { maxBrakeTorqueRear: 495 },
                     desc: 'Factory drum shoes, set soft so the light rear never locks.' },
    padsRearSport: { name: 'Sport rear shoes',     slot: 'padsRear', family: 'sport', rarity: 'uncommon', price: 8, massKg: 3,
                     patch: { maxBrakeTorqueRear: 660 },
                     desc: 'More rear bite. The back steps out sooner under hard braking.' },
    padsRearRace:  { name: 'Race rear shoes',      slot: 'padsRear', family: 'sport', rarity: 'rare', price: 12, massKg: 3,
                     patch: { maxBrakeTorqueRear: 825 },
                     desc: 'Aggressive rear lining. Brake while turning and the tail comes round.' },

    // ── Anti-roll bars (§3b — the ratified sport pair; stock is the code's 4500 front, no rear bar).
    arbFrontStock: { name: 'Stock front anti-roll bar', slot: 'arbFront', family: 'oem', rarity: 'common', price: 10, massKg: 8, stock: true,
                     patch: { arbStiffnessFront: 4500 }, desc: 'The factory front bar.' },
    arbFrontSport: { name: 'Sport front anti-roll bar', slot: 'arbFront', family: 'sport', rarity: 'uncommon', price: 10, massKg: 8,
                     patch: { arbStiffnessFront: 9500 }, desc: 'A thicker front bar. Flat and sharp on pavement, and it pushes.' },
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
    diffLocked:    { name: 'Locker',               slot: 'diff', family: 'offroad', rarity: 'rare', price: 35, massKg: 32,
                     patch: { rearDiffMode: 'locked' },
                     desc: 'Both rear wheels turn together, always. Unstoppable in mud, wrong on a tight turn.' },

    // ── Lift (§3g — the first Off-road part). Body offset: NEGATIVE raises the body. [DEFAULT] 5 cm.
    liftNone:      { name: 'No lift',              slot: 'lift', family: 'oem', rarity: 'common', price: 0, massKg: 0, stock: true,
                     patch: { suspensionBodyOffsetFront: 0.0, suspensionBodyOffsetRear: 0.035,
                              suspensionTravelFront: 0.25, suspensionTravelRear: 0.25 },
                     desc: 'Factory ride height.' },
    liftKit:       { name: 'Lift kit',             slot: 'lift', family: 'offroad', rarity: 'uncommon', price: 30, massKg: 20,
                     patch: { suspensionBodyOffsetFront: -0.05, suspensionBodyOffsetRear: -0.015,
                              suspensionTravelFront: 0.30, suspensionTravelRear: 0.30 },
                     desc: 'Spacers and longer shocks. Clears ruts and rocks; leans more, and rolls sooner.' },
}

/** The stock part for a socket. */
export const stockPart = (socket) => Object.keys(PARTS).find(id => PARTS[id].slot === takes(socket) && PARTS[id].stock)

// ── The service center's repair bench (owner accepted these placeholders 2026-10-20; FEAT-69 tunes).
// Per damage CLASS (src/damage.js TRACKS): `price` $ and `hours` to take ONE track from 0 to 100%, at
// day-1 rates. A partial repair is charged pro rata on the missing condition. `price: null` = the
// fitted part's price (a worn pair of springs costs a new pair).
export const REPAIRS = {
    tire:         { price: 6,    hours: 0.5 },
    wheel:        { price: 8,    hours: 1 },
    armor:        { price: 10,   hours: 2 },
    spring:       { price: null, hours: 2 },
    damper:       { price: null, hours: 1.5 },
    brake:        { price: null, hours: 1 },
    engine:       { price: 60,   hours: 4 },
    filter:       { price: 2,    hours: 0.5 },
    radiator:     { price: 20,   hours: 2 },
    headlights:   { price: 3,    hours: 0.5 },
    alignment:    { price: 4,    hours: 0.5 },
    transmission: { price: 30,   hours: 3 },
}

/** A part sold back to the shop fetches half its price × its condition (owner, 2026-10-20). */
export const SELL_FRACTION = 0.5
