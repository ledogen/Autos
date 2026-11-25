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
//   patch       the params it writes (absolute values for THIS truck — a part is for a Ranger). A part that fits
//               either axle (springs, shocks) names BOTH axles' keys, and a fit writes only its socket's (src/parts.js).
//   grip        tires only: this tire's friction against the stock tire's (params.frictionCoeff stays
//               the truck-wide base). Per corner, so it is published per wheel (src/parts.js).
//   load        FEAT-112 load ratings it brings (springs / dampers / tires) — the weakest part sets
//               the truck's limits, so one heavy-duty axle (or three load-range tires) moves nothing
//   price       $ at day-1 rates — [DEFAULT] placeholders until FEAT-69 prices the repair economy
//   massKg      real load while stowed in inventory. Fitted, only a bolt-on's mass is added to the chassis (DEC-373,
//               src/parts.js boltOnKg): every other part's stock mass is already inside params.mass
//   slots       FEAT-204 bolt-ons: inventory slots it adds while fitted (src/parts.js extraSlots; slots stack,
//               which a patch of `inventorySlots` could not: two sockets may not share a key)
//   armor       FEAT-204 bull bar: durability multiplier on its socket's `guards` track (src/parts.js _fit)
//   model       FEAT-204 bolt-ons: the .glb stem shown on the truck while fitted (assets/models/<stem>.glb);
//               `modelWith` { socket: stem } swaps it when that socket holds a part with a model too (DEC-340:
//               the light bar mounts to the roof rack). src/parts.js modModels picks; src/vehicle-model.js setMods shows.
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
    // FEAT-176: either axle takes the one 'springs' part (and the one 'dampers' part), as every corner takes a tire.
    springsFront: { name: 'Front springs',     takes: 'springs', hours: 1.5,  tracks: ['springFront'] },
    springsRear:  { name: 'Rear springs',      takes: 'springs', hours: 1.5,  tracks: ['springRear'] },
    dampersFront: { name: 'Front shocks',      takes: 'dampers', hours: 0.75, tracks: ['damperFront'] },
    dampersRear:  { name: 'Rear shocks',       takes: 'dampers', hours: 0.75, tracks: ['damperRear'] },
    brakesFront:  { name: 'Front brakes',      hours: 1,    tracks: ['brakeFront'] },
    brakesRear:   { name: 'Rear brakes',       hours: 1,    tracks: ['brakeRear'] },
    arbFront:     { name: 'Front anti-roll bar', hours: 0.5, tracks: [] },
    arbRear:      { name: 'Rear anti-roll bar',  hours: 0.5, tracks: [] },
    diff:         { name: 'Rear differential', hours: 3,    tracks: ['diff'] },   // FEAT-166: the clutch LSD's packs
    // FEAT-207: the rear axle's final-drive ratio — a part with no wear track, like the lift (the sizes Ford sold).
    axle:         { name: 'Final drive',   hours: 3,    tracks: [] },
    lift:         { name: 'Lift',              hours: 4,    tracks: [] },
    // The engine bay (owner, 2026-10-22): these were damage tracks with no part; exchange and the shop
    // shelf need them to exist as parts. Either headlight socket takes the one 'headlight' part.
    engine:       { name: 'Engine',            hours: 8,    tracks: ['engine'] },
    radiator:     { name: 'Radiator',          hours: 1.5,  tracks: ['radiator'] },
    // `fitX`: the shop's fitting charge as a fraction of REPAIR_SETUP's minimum (src/service.js fitLabour; default 1).
    // The filter's is a third (owner, 2026-11-06 playtest: "the installation cost should be cut by a factor of three"), then a sixth (DEC-482: halved).
    airFilter:    { name: 'Air filter',        hours: 0.25, tracks: ['airFilter'], fitX: 1 / 6 },
    headlightL:   { name: 'Left headlight',    takes: 'headlight', hours: 0.5, tracks: ['headlightL'] },
    headlightR:   { name: 'Right headlight',   takes: 'headlight', hours: 0.5, tracks: ['headlightR'] },
    // FEAT-204 bolt-ons (DEC-028: parts on the truck configuration, lost on death). `bolton`: the service screen's
    // Bolt-ons node lists them. No wear track of their own; the bull bar `guards` the front panel's (its part's
    // `armor` is that track's durability multiplier). There is no bed toolbox before the alpha (owner, 2026-11-17,
    // DEC-372): the model ships (ASSET-87) and waits on FEAT-253's bed-load placement. Fitting labour [DEFAULT].
    roofRack:     { name: 'Roof rack',         hours: 1,    tracks: [], bolton: true },
    bullBar:      { name: 'Bull bar',          hours: 1.5,  tracks: [], bolton: true, guards: 'armorFront' },
    lightBar:     { name: 'Light bar',         hours: 1,    tracks: [], bolton: true },
    // FEAT-325 (arc trial, owner 2026-11-23: "mods fit both engines. they also carry over if you upgrade the engine"): the
    // power mods. No wear track; `mod`: the service screen's Power mods node lists them. One forced-induction socket:
    // a turbo OR a supercharger. Labour hours [DEFAULT].
    intake:       { name: 'Intake',            hours: 0.5,  tracks: [], mod: true },
    exhaust:      { name: 'Exhaust',           hours: 1,    tracks: [], mod: true },
    flywheel:     { name: 'Flywheel',          hours: 3,    tracks: [], mod: true },
    cams:         { name: 'Cams',              hours: 4,    tracks: [], mod: true },
    chip:         { name: 'Engine tune',       hours: 0.25, tracks: [], mod: true },
    induction:    { name: 'Forced induction',  hours: 4,    tracks: [], mod: true },
}

/** FEAT-222: every part id a socket takes (the debug part selector's dropdown; the inverse of socketsFor). */
export const partChoices = (socket) => Object.keys(PARTS).filter(id => !PARTS[id].mounted && PARTS[id].slot === takes(socket))

/** FEAT-176: ids retired when front and rear springs and shocks became one part each → the part now. A run save
 *  written before is renamed on load (src/save.js), so a saved truck, inventory or shelf keeps its parts. */
export const RENAMED = {
    springsFrontOEM: 'springsOEM', springsRearOEM: 'springsOEM', springsFrontHD: 'springsHD', springsRearHD: 'springsHD',
    springsFrontSport: 'springsSport', springsRearSport: 'springsSport',
    dampersFrontOEM: 'dampersOEM', dampersRearOEM: 'dampersOEM', dampersFrontHD: 'dampersHD', dampersRearHD: 'dampersHD',
    dampersFrontSport: 'dampersSport', dampersRearSport: 'dampersSport',
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

// FEAT-168 (owner, 2026-11-05: "put standard tires to .9 durability. sport to .8 old to .7"): old 0.6 → 0.7.
// The standard tire's 0.9 is its own (the oem family also covers springs and brakes); sport's 0.8 too.
export const FAMILY_DURABILITY = { old: 0.7, oem: 1, sport: 0.7, offroad: 1.2, hd: 2 }

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
    // FEAT-165 (owner, 2026-11-05: "Old $8 · Standard $18"): Old 7 → 8, Standard 15 → 18 — the price of
    // always being on the shelf. FEAT-168 then took the standard tire back into rotation.
    // FEAT-325 (arc trial, owner 2026-11-23): Old $6, Standard $10, Sport $15, All-terrain $15.
    tireOld:       { name: 'Old tire',             slot: 'tire', family: 'old', rarity: 'common', price: 6, massKg: 12, grip: 0.9,
                     patch: {}, desc: 'Cracked and dry rotted rubber. Slippery and fragile.' },
    tireStandard:  { name: 'Standard tire',        slot: 'tire', family: 'oem', rarity: 'common', price: 8, massKg: 12, grip: 1, stock: true,
                     durability: 0.9, patch: {}, desc: 'The factory all-season. Fine everywhere, great nowhere.' },
    spareTire:     { name: 'Mounted tire',         slot: 'tire', family: 'oem', rarity: 'common', price: 25, massKg: 21, grip: 1, mounted: { tire: 'tireStandard', wheel: 'wheelSteel' },
                     patch: {}, desc: 'A tire mounted on a wheel.' },
    tireSport:     { name: 'Sport tire',           slot: 'tire', family: 'sport', rarity: 'uncommon', price: 15, massKg: 11.5, grip: 1.1, durability: 0.8,
                     patch: {}, desc: 'Good grip on road. Worse off road.' },   // owner's words, 2026-11-05 (FEAT-167)
    tireOffroad:   { name: 'All-terrain tire',     slot: 'tire', family: 'offroad', rarity: 'uncommon', price: 15, massKg: 14.4, grip: 1,
                     patch: {}, desc: 'Chunky tread. At home on dirt, no worse on pavement. Heavy.' },
    tireLT:        { name: 'Load-range E tire',    slot: 'tire', family: 'hd', rarity: 'uncommon', price: 10, massKg: 15, grip: 0.95,
                     patch: {}, load: LT_LOAD,
                     desc: 'Stiff sidewalls built to carry a load. A little less grip.' },

    // ── Wheels — ONE wheel each, any corner, under its tire (owner, 2026-10-21). A bent one runs out
    //    of round (damage.js wheelRunoutAtZero); the shop straightens it or sells a new one.
    //    Roadside rule (owner, 2026-10-21): no tools to seat a bead, so a LOOSE tire or wheel is only
    //    ever mounted at the service center — the mounted spare is the roadside answer. A part's desc
    //    says plainly what it does.
    wheelSteel:    { name: 'Steel wheel',          slot: 'wheel', family: 'oem', rarity: 'common', price: 8, massKg: 9, stock: true,
                     patch: {}, desc: 'Standard. Heavy. Bends before it breaks.' },

    // ── Springs and shocks (§3f) — one axle's pair. Load ratings: §3f's package, [DEFAULT] numbers.
    // FEAT-176 (owner, 2026-11-06: "make front and rear springs and shocks interchangeable. Having only one part type
    // fitting in more slots gives the player more opportunities to get the part that they need"): ONE spring part and
    // ONE shock part per family, either axle. Each carries what it does on EACH axle — the front and rear values it had
    // as two parts — so the stock truck, heavy-duty and sport all behave exactly as before. Price is the old pair's
    // (they matched); mass is their mean.
    springsOEM:    { name: 'Stock springs', slot: 'springs', family: 'oem', rarity: 'common', price: 7, massKg: 15, stock: true,
                     patch: { suspensionStiffnessFront: 33000, suspensionStiffnessRear: 33000 }, desc: 'The factory springs.' },
    springsHD:     { name: 'Heavy-duty springs', slot: 'springs', family: 'hd', rarity: 'uncommon', price: 25, massKg: 19,
                     patch: { suspensionStiffnessFront: 46000, suspensionStiffnessRear: 52000 }, load: HD_SPRINGS,
                     desc: 'Stiffer springs. They hold the truck up under a load, and buck over bumps when empty.' },
    // Sport tier (owner, 2026-10-22): stiffer than stock, softer than HD, stock height, stock load
    // rating; Sport family, so they wear faster. [DEFAULT] +35% rate, +40% damping (the page's middle
    // options). Prices: springs $15, shocks $15 (re-asked against HD $25 and KEPT, owner 2026-10-24); heavy-duty is the endgame mod at $25 (owner, 2026-10-22).
    // Lowering springs (owner, 2026-10-22): they sit 30 mm under stock. `drop` (m, per axle) shortens the spring's
    // free length; the stiffer rate alone sags 29 mm (front) / 24 mm (rear) less than stock, so the drop
    // is that plus 30 mm. The bump stop is bolted to the body, so the bump travel shrinks by the same
    // drop (src/parts.js _rideHeight): about 30 mm less bump travel than stock at rest.
    springsSport:  { name: 'Sport springs', slot: 'springs', family: 'sport', rarity: 'uncommon', price: 15, massKg: 15,
                     drop: { Front: 0.059, Rear: 0.054 },
                     patch: { suspensionStiffnessFront: 44550, suspensionStiffnessRear: 44550 },
                     desc: 'Shorter, stiffer springs that drop the truck. Flat and sharp on pavement; they hit the stops sooner on rough ground and tire sooner.' },
    dampersOEM:    { name: 'Stock shocks', slot: 'dampers', family: 'oem', rarity: 'common', price: 6, massKg: 6, stock: true,
                     patch: { suspensionDampingFront: 3500, suspensionDampingRear: 4000 }, desc: 'Factory shocks, tuned for an empty bed.' },
    dampersHD:     { name: 'Heavy-duty shocks', slot: 'dampers', family: 'hd', rarity: 'uncommon', price: 25, massKg: 7,
                     patch: { suspensionDampingFront: 5000, suspensionDampingRear: 6000 }, load: HD_DAMPERS,
                     desc: 'Firm valving that settles a loaded truck. Busy and harsh when empty.' },
    dampersSport:  { name: 'Sport shocks', slot: 'dampers', family: 'sport', rarity: 'uncommon', price: 15, massKg: 6,
                     patch: { suspensionDampingFront: 4900, suspensionDampingRear: 5600 },
                     desc: 'Quick, firm valving. The truck stays flat and the ride gets busy. They wear out faster.' },
    // ── Brakes, per axle (DESIGN.md: pad grades per axle set the bias): pads up front, drum shoes at
    //    the rear on this truck. [DEFAULT] torques; the whole ladder rose 10 % with the stock brakes
    //    for ABS (FEAT-135, 2026-10-21).
    brakesFrontStd:  { name: 'Standard front pads',  slot: 'brakesFront', icon: 'pads', family: 'oem', rarity: 'common', price: 5, massKg: 2, stock: true,
                     patch: { maxBrakeTorqueFront: 1430 },
                     desc: 'Organic pads. Quiet, gentle, forgiving.' },
    brakesFrontSport:{ name: 'Sport front pads',     slot: 'brakesFront', icon: 'pads', family: 'sport', rarity: 'uncommon', price: 8, massKg: 2,
                     patch: { maxBrakeTorqueFront: 1705 },
                     desc: 'More stopping power.' },   // owner's words, 2026-11-05 (FEAT-167: "brakes")
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

    // ── Rear axle ratio (FEAT-207, owner 2026-11-13: findable mods, "shorter ratios a little rarer"). The patch is
    //    the existing `finalDrive` param (drivetrain.js); the stock ratio is data/ranger.js's 3.73. Prices [DEFAULT].
    axle345:       { name: '3.45 final drive', slot: 'axle', icon: 'diff', family: 'oem', rarity: 'common', price: 12, massKg: 8,
                     patch: { finalDrive: 3.45 }, desc: 'Tall gearing: lazier off the line, calmer at highway speed.' },
    axle355:       { name: '3.55 final drive', slot: 'axle', icon: 'diff', family: 'oem', rarity: 'common', price: 12, massKg: 8,
                     patch: { finalDrive: 3.55 }, desc: 'A little taller than the factory gearing.' },
    axle373:       { name: '3.73 final drive', slot: 'axle', icon: 'diff', family: 'oem', rarity: 'common', price: 10, massKg: 8, stock: true,
                     patch: { finalDrive: 3.73 }, desc: 'The factory gearing.' },
    axle410:       { name: '4.10 final drive', slot: 'axle', icon: 'diff', family: 'oem', rarity: 'uncommon', price: 20, massKg: 8,
                     patch: { finalDrive: 4.10 }, desc: 'Short gearing: pulls harder, turns more rpm at speed.' },

    // ── Rear differential (§3b — the canonical described-never-scored part).
    diffOpen:      { name: 'Open differential',    slot: 'diff', family: 'oem', rarity: 'common', price: 10, massKg: 30, stock: true,   // owner 11-04: "worth half as much" (20 → 10)
                     patch: { rearDiffMode: 'open' },
                     desc: 'Power goes to whichever rear wheel has the least grip.' },
    // FEAT-166 (owner 2026-11-04): the ladder is open → clutch-type LSD (temporary: its packs wear back to
    // an open diff, and a rebuild is a cash drain) → helical LSD (permanent). Price [DEFAULT].
    diffClutchLSD: { name: 'Clutch-type limited-slip differential', slot: 'diff', family: 'sport', rarity: 'uncommon', price: 25, massKg: 31,
                     durability: 1, rebuild: true, patch: { rearDiffMode: 'clutch' },
                     desc: 'Clutch packs share the drive until they wear out, then it is an open diff again. A shop can rebuild it, for a price.' },
    diffLSD:       { name: 'Helical limited-slip differential', slot: 'diff', family: 'sport', rarity: 'rare', price: 40, massKg: 32,
                     patch: { rearDiffMode: 'lsd' },
                     desc: 'Gears, not clutches, share the drive: nothing in it wears out. Pulls out of corners, and pushes into them.' },
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
    // FEAT-325 (arc trial): the engine is a real choice. `engine` names its data/engines.js entry and `torqueX` scales its
    // curve; src/parts.js engineFor() lays the entry, the power mods and the scale over params. The V6 stays the stock part
    // (data/ranger.js's own engine, free roam's), and the jalopy fits the I4 (src/jalopy.js). The V6 is $60 ("about 3 good
    // days of income") and every auto shop always carries it (data/shop-stock.js ALWAYS): "it's the tried and true boss prep
    // item". The I4 is detuned 10 % ("approved": 209 → 188 N·m); its torqueX is a debug slider (Story · Parts).
    engineStock:   { name: '3.0 L V6 engine',      slot: 'engine', family: 'oem', rarity: 'common', price: 60, massKg: 180, stock: true,
                     engine: 'vulcan30', torqueX: 1, patch: {}, desc: 'The factory six, on a pallet. A long day to swap.' },
    engineI4:      { name: '2.3 L four-cylinder engine', slot: 'engine', family: 'oem', rarity: 'common', price: 30, massKg: 150,
                     engine: 'duratec23', torqueX: 0.9, patch: {}, desc: 'A tired four-cylinder. It runs.' },
    radiatorStock: { name: 'Stock radiator',       slot: 'radiator', family: 'oem', rarity: 'common', price: 22, massKg: 7, stock: true,
                     patch: {}, desc: 'The factory radiator. Keeps the engine cool when it isn’t leaking.' },
    // items.md's ratified "Spare air filter" is this part: 15 min to fit at the roadside (`roadside`: src/recovery.js
    // fitRoadside) or at the shop, carries its own condition. $10 → $7 (owner, 2026-11-06 playtest: "reduced by 30%"); $7 → $3.50 (DEC-482: "air filter cost should be halved").
    airFilterStock:{ name: 'Air filter',           slot: 'airFilter', family: 'oem', rarity: 'common', price: 2.5, massKg: 0.5, stock: true,
                     roadside: true, patch: {}, desc: 'A paper filter. A clean one lets the engine breathe. Swaps in by hand, no shop needed.' },
    headlightStock:{ name: 'Headlight',            slot: 'headlight', family: 'oem', rarity: 'common', price: 6, massKg: 1.5, stock: true,
                     patch: {}, desc: 'A sealed beam lamp, either side.' },

    // ── FEAT-204 bolt-ons (DEC-028/129/340/341). Prices, masses, the armour factor and the light gain are [DEFAULT]
    //    (DEC-342, draft); the rack's +4 slots are the owner's (DEC-129). The light bar burns with the HIGH beams only (L, DEC-373):
    //    it raises the two head spots' intensity (headlightGain) and range (headlightReach), no lamp of its own (DEC-229).
//    `icon`: placeholder thumbnails (the lift kit's, the headlight's) until their own are rendered (assets/models/src/items.py).
    //    Gain 2 ≈ four 55 W pods beside two sealed beams; reach 2^(1/1.8) = 1.47 is where gain 2 lights the ground as
    //    brightly as the bare beam did at its own range (decay 1.8, vehicle-model.js HEAD_TUNE).
    roofRackNone:  { name: 'No roof rack',         slot: 'roofRack', family: 'oem', rarity: 'common', price: 0, massKg: 0, stock: true,
                     patch: {}, desc: 'A bare cab roof.' },
    // Masses (DEC-373, agent's figures from real parts; DEC-342's 16 / 22 / 8 were placeholders):
    //  · rack 13 kg: the Curt C18115 steel roof basket (1.05 x 0.94 m) is ~13 kg (29 lb, etrailer Q&A); ours is 1.15 x
    //    0.56 m, so ~0.85x its frame tube (~11 kg), plus ~2 kg of roof clamps.
    //  · bull bar 16 kg: Westin's Ultimate Bull Bar 32-3985 for the Ranger (one hoop + crossbar, 2.5-3 in tube) is listed
    //    at 34 lb; our 68 mm x 3 mm wall hoop + 60 mm crossbar + two mount plates comes to ~16-18 kg by length.
    //  · light bar 10 kg: four 6 in halogen pods (KC Daylighter, 3.1 lb = 1.4 kg each) 5.6 kg, the solo bridge bar (1.4 m of
    //    1.5 in tube) ~2.7 kg, brackets + relay harness ~1.5 kg. Rack-mounted it leaves the bridge bar off (~7 kg); one
    //    figure for both is an approximation of ~3 kg.
    roofRack:      { name: 'Roof rack',            slot: 'roofRack', family: 'offroad', rarity: 'uncommon', price: 40, massKg: 13,
                     slots: 4, model: 'mod-roof-rack', icon: 'lift', patch: {},
                     desc: 'A steel basket clamped to the cab roof. More room for gear.' },
    bullBarNone:   { name: 'No bull bar',          slot: 'bullBar', family: 'oem', rarity: 'common', price: 0, massKg: 0, stock: true,
                     patch: {}, desc: 'The factory bumper, on its own.' },
    bullBar:       { name: 'Bull bar',             slot: 'bullBar', family: 'offroad', rarity: 'uncommon', price: 35, massKg: 16,
                     armor: 1.5, model: 'mod-bull-bar', icon: 'lift', patch: {},
                     desc: 'A bent steel tube bolted to the frame horns. The front end takes a knock and keeps its shape.' },
    lightBarNone:  { name: 'No light bar',         slot: 'lightBar', family: 'oem', rarity: 'common', price: 0, massKg: 0, stock: true,
                     patch: { headlightGain: 1, headlightReach: 1 }, desc: 'Just the headlights.' },
    lightBar:      { name: 'Light bar',            slot: 'lightBar', family: 'offroad', rarity: 'uncommon', price: 25, massKg: 10,
                     model: 'mod-light-bar-solo', modelWith: { roofRack: 'mod-light-bar-rack' }, icon: 'headlight',
                     patch: { headlightGain: 2, headlightReach: 1.47 },
                     desc: 'Four round lamps on a bar, wired to the high beams. Night roads open up.' },

    // ── FEAT-325 power mods (arc trial). `torque`: a GAIN curve over rpm, [[rpm, gain], …], read the way the engine's own
    //    torque curve is (src/drivetrain.js engineTorqueAt: linear between points, flat past the ends); the engine's curve is
    //    multiplied by (1 + gain) at every rpm, mods compounding. `inertiaX` scales the engine's inertia (the manual gearbox's
    //    engine-speed state; the automatics' engine follows the converter with no inertia of its own). No boost lag: a turbo
    //    makes its gain the instant the rpm is there. Every number is a debug slider (Story · Parts). The starting numbers
    //    are the orchestrator's drafts; the first three prices follow "reduce costs by $5 for each". Names and descriptions
    //    are placeholders awaiting the owner's words. Icons: the engine's thumbnail until their own exist.
    intakeStock:   { name: 'Stock intake',         slot: 'intake', family: 'oem', rarity: 'common', price: 0, massKg: 0, stock: true,
                     icon: 'engine', patch: {}, desc: 'The factory air box.' },
    intakeMod:     { name: 'Intake',               slot: 'intake', family: 'sport', rarity: 'uncommon', price: 10, massKg: 3,
                     icon: 'engine', torque: [[2000, 0], [4500, 0.04]], patch: {}, desc: 'A freer air box and pipe. A little more pull up high.' },
    exhaustStock:  { name: 'Stock exhaust',        slot: 'exhaust', family: 'oem', rarity: 'common', price: 0, massKg: 0, stock: true,
                     icon: 'engine', patch: {}, desc: 'The factory pipes and muffler.' },
    exhaustMod:    { name: 'Exhaust',              slot: 'exhaust', family: 'sport', rarity: 'uncommon', price: 15, massKg: 12,
                     icon: 'engine', torque: [[0, 0.05]], patch: {}, desc: 'Wider pipes and a straight-through muffler. More pull everywhere.' },
    flywheelStock: { name: 'Stock flywheel',       slot: 'flywheel', family: 'oem', rarity: 'common', price: 0, massKg: 0, stock: true,
                     icon: 'engine', patch: {}, desc: 'The factory flywheel.' },
    flywheelLight: { name: 'Light flywheel',       slot: 'flywheel', family: 'sport', rarity: 'uncommon', price: 10, massKg: 6,
                     icon: 'engine', inertiaX: 0.6, patch: {}, desc: 'Less spinning mass. The engine revs up and down quicker.' },
    camsStock:     { name: 'Stock cams',           slot: 'cams', family: 'oem', rarity: 'common', price: 0, massKg: 0, stock: true,
                     icon: 'engine', patch: {}, desc: 'The factory camshafts.' },
    camsMod:       { name: 'Cams',                 slot: 'cams', family: 'sport', rarity: 'uncommon', price: 15, massKg: 5,
                     icon: 'engine', torque: [[2500, -0.03], [4000, 0.06]], patch: {}, desc: 'Longer valve timing. Pulls harder up high, softer down low.' },
    chipStock:     { name: 'Stock tune',           slot: 'chip', family: 'oem', rarity: 'common', price: 0, massKg: 0, stock: true,
                     icon: 'engine', patch: {}, desc: 'The factory engine computer.' },
    chipTune:      { name: 'Chip tune',            slot: 'chip', family: 'sport', rarity: 'uncommon', price: 10, massKg: 0.2,
                     icon: 'engine', torque: [[0, 0.03]], patch: {}, desc: 'A reflashed engine computer. A little more pull everywhere.' },
    inductionNone: { name: 'No forced induction',  slot: 'induction', family: 'oem', rarity: 'common', price: 0, massKg: 0, stock: true,
                     icon: 'engine', patch: {}, desc: 'The engine breathes on its own.' },
    turbo:         { name: 'Turbo',                slot: 'induction', family: 'sport', rarity: 'legendary', price: 60, massKg: 15,
                     icon: 'engine', torque: [[1500, 0], [3000, 0.25]], patch: {}, desc: 'Exhaust-driven boost. Much more pull from the middle up.' },
    supercharger:  { name: 'Supercharger',         slot: 'induction', family: 'sport', rarity: 'legendary', price: 60, massKg: 20,
                     icon: 'engine', torque: [[0, 0.2]], patch: {}, desc: 'Belt-driven boost. Much more pull everywhere.' },
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
    // FEAT-285 / DEC-419 (owner, 2026-11-17): the part-priced 0→100% rate is $4 for springs and dampers (was the part's own price:
    // stock $7 / $6, HD $25). REPAIR_SETUP (the labour) is untouched; both ride the day tier.
    spring:       { price: 4,    hours: 2 },     // re-arched
    damper:       { price: 4,    hours: 1.5 },   // rebuilt
    // Owner, 2026-10-22: a rebuild to the cap costs MORE than a used engine ($64 vs $60 new) — "it
    // should be more expensive to repair an engine than to swap in a used one"; a weld to 80% is $22,
    // the price of a new radiator. These are 0→100% rates, so × 0.8 is the cap's price.
    engine:       { price: 80,   hours: 4 },     // rebuilt
    radiator:     { price: 27.5, hours: 2 },     // welded
    alignment:    { price: 15,   hours: 0.5 },   // ONE job, all four corners, flat (owner, 2026-11-05); hours per corner's gap
    transmission: { price: 30,   hours: 3 },     // rebuilt
    // FEAT-166: new clutch packs for the clutch-type LSD — straight back to 100% (src/service.js
    // repairTargets), a cash drain by design (owner, 2026-11-04). [DEFAULT] $30 / 3 h from empty.
    diff:         { price: 30,   hours: 3 },
}
/** Every repair starts with this before the clock on the gap runs (owner, 2026-10-23): the shop's
 *  minimum charge, and the time to get at the part (half an hour to reach a damper before revalving
 *  it). It keeps the shop from being a pit stop that tops everything up to the cap. A part already off
 *  the truck, in the inventory, pays the charge but not the access time. owner $2 (2026-11-19, DEC-432; was $5) / 30 min [DEFAULT]. */
export const REPAIR_SETUP = { price: 2, hours: 0.5 }
/** FEAT-162 (owner, 2026-11-06): a SEIZED engine (its track at exactly 0) rebuilds at this × the price
 *  of a full-wear repair — a placeholder until FEAT-69's re-price. A collapsed wheel is not repaired at
 *  all: it is scrap, replaced at the shop's wheel price (src/service.js repairTargets). */
export const SEIZED_REPAIR_X = 3
export const REPAIR_CAP = 0.8    // ratified by the owner 2026-10-24 (was [DEFAULT])
export const REPAIR_STEP = 0.05
/** The shop can still patch a flat: fixes the hole, not the wear — about a plug kit's price, and its
 *  half hour (owner, 2026-10-22). */
export const PATCH = { price: 5, hours: 0.5 }
/** FEAT-202 (owner, 2026-11-13): the oil change — every auto shop, always; a flat job straight back to
 *  new oil, never a part on the shelf. owner $6 (FEAT-69, 2026-11-17) / 30 min. */
export const OIL_CHANGE = { price: 4, hours: 0.5 }   // arc trial (owner, 2026-11-24): was 6

/** Tire work at the shop is two jobs, and every corner action is a count of them (owner, 2026-10-23):
 *  a BEAD job mounts or unmounts a tire on a wheel; a HUB swap takes a mounted tire off a corner or
 *  puts one on. A loose tire or wheel onto a corner is 2 hub + 2 bead (the old pair off and on, the
 *  old part off its partner, the new one on); a mounted tire is 2 hub; split or combine is 1 bead.
 *  The roadside has no bead tools: only the spare's hub swap (src/recovery.js). [DEFAULT] numbers,
 *  owner-approved. */
export const BEAD = { price: 1, hours: 0.25 }   // arc trial (owner, 2026-11-24: "a tire change is like $3 in labor"): was 2
export const HUB = { price: 0.5, hours: 1 / 6 }   // arc trial (owner, 2026-11-24: "swapping corners is like $1"): was 1

/** A part sold back to the shop fetches half its price × its condition (owner, 2026-10-20). */
export const SELL_FRACTION = 0.5
