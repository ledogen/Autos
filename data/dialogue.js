// Authored dialogue lines (FEAT-61). Data only — no logic, no imports. src/dialogue.js runs these.
//
// The player is BILLY (DEC-343). He has just been fired from the burger joint (opening.md, ratified 2026-08-05)
// and has gone to his uncle Larry, who runs the delivery service, for a source of income.
//
// `text` is TRUSTED AUTHORED MARKUP: <span class="dlg-key">…</span> colours a control glyph. Never
// put player input or a formatted number through this field — the renderer sets innerHTML.
// A line that differs by input says it once per input: <span class="kc-kb">…</span><span class="kc-pad">…</span>,
// and CSS shows the half for the device driving now (body.pad-on), switching live (FEAT-174). Never both in words.
// A pad half's driving button that a pad layout moves carries data-pad="menu" (the side menu) or "brake" (the
// handbrake): main.js writes the chosen layout's button over it (DEC-431; Professor's B / RB as authored).

/** The uncle's one-time briefing, played the first time a paper route is accepted in a run. */
export const PAPER_ROUTE_INTRO = [
    {
        speaker: 'Uncle Larry',
        text: `So you're finally ready to run the paper route? Here's what ya gotta do.`,
    },
    {
        speaker: 'Uncle Larry',
        // FEAT-174: one version per input, swapped live (kc-kb / kc-pad, as keycap() does).
        text: `Drive near the customer's house and `
            + `<span class="kc-kb">hold <span class="dlg-key">F</span> to aim your throw</span>`
            + `<span class="kc-pad">aim your throw with the <span class="dlg-key">right stick</span></span>. `
            + `When you're happy with your aim, `
            + `<span class="kc-kb"><span class="dlg-key">release F</span></span><span class="kc-pad">tap <span class="dlg-key">RB</span></span> `
            + `to yeet that newspaper roll right onto their porch.`,
    },
]

/**
 * FEAT-184 (DEC-236, owner 2026-11-15): Larry's call — the run's opening cards, the owner's words exactly as written (the
 * owner writes dialogue: never correct them; DEC-343 renamed JJ to Billy). DEC-326: played on a skip (after the manager's check) and on a run with no
 * opening — a played tutorial hears LARRY_CALL instead, Katie having told it the camp (TUT 'tut-katie'). Two fills, both from the game, never typed (main.js _fillCamp): {dir} is the
 * expedition camp's true compass direction from the spawn (COMPASS below), {deeds} the camp's gate,
 * ECONOMY_PARAMS.campDeeds. Both are words or digits of our own, so they are safe in this markup.
 */
export const RUN_INTRO = [
    {
        speaker: 'Uncle Larry', phone: true,
        text: `Heyyo Billy, its your uncle Larry! Listen, I heard ol' <i>greasebeard</i> let you go. Just remember if you need a little cash `
            + `you can always sling a few papers on the route for me. If you prove you can deliver fast enough I can even expand the route.`,
    },
    {
        speaker: 'Uncle Larry', phone: true,
        text: `Speaking of work, I hear there's an expedition camp up at the old {dir} road. I think they're looking to make an new supply route. `
            + `I heard them say they'd take anyone with {deeds} good deeds to their name. Don't expect it to be easy if you join up with them, `
            + `but it might be the best way to get connected back up with the outside world`,
    },
    {
        speaker: 'Uncle Larry', phone: true,
        text: `Gettin' a good deed is as simple as taking delivery jobs and keeping the pace. Or sometimes getting the cargo there in one piece `
            + `is all that matters. Listen closely to the client because they'll tell ya exactly what they need.`,
    },
    {
        speaker: 'Uncle Larry', phone: true,
        text: `The client will also tell you the base pay ahead of time. Usually they tip better if you drive better. Some folks might even `
            + `throw in an item. Just be careful, you know how sometimes these roads can surprise ya.`,
    },
]

// ── FEAT-147: the opening ─────────────────────────────────────────────────────────────────────
// FEAT-229 (owner's dialogue pass, 2026-11-16, DEC-320..326): the lines below are written from the owner's paraphrases;
// the script is his to finalise.

/** DEC-320 → DEC-348: Billy's best friend, a voice only (no model, no POI): on the phone, and at the camping area in
 *  person, pulled over by your truck (DEC-345) with nothing drawn. One constant, so a rename is one edit. */
const KATIE = 'Katie'

/** DEC-354 (owner, 2026-11-16): the phone's framing cards — "a card that just says phone and then ring ring ring", and a
 *  call ends on "<click>" in the caller's name. A card said over the phone carries `phone: true` (`answered`: the call
 *  was already going, no ring; `holds`: the caller stays on the line into a later script, no click); src/dialogue.js
 *  frames each call. In person (her door, Larry's house, the manager, Katie at the camp): no field, neither card. */
export const PHONE = { ring: { speaker: 'Phone', text: `Ring ring ring` }, click: `&lt;click&gt;` }

/** The firing: played over the camera's slow move round the burger joint (owner, 2026-11-05), at 07:00 (DEC-299). DEC-320:
 *  Billy arrives late on the phone with Katie, who wishes him luck with the boss; the boss fires him. DEC-307 → DEC-324: not a
 *  word about the paycheck. */
export const FIRING = [
    { speaker: KATIE, phone: true, answered: true, text: `Alright, you made it. I'll let you go. Good luck with your boss &mdash; I bet he's real upset with you.` },
    { speaker: 'The manager', text: `Billy, I've had it! This is the last time you'll be coming to work late, because you're fired. I don't want to see you in my kitchen anymore.` },
]

/** Mom's call, once the player chose the tutorial at the intro's card (FEAT-184): her reaction to the firing (DEC-321),
 *  then come by the house (DEC-304); FEAT-184's key card last (the truck sits dead after her call), so the call's click
 *  comes after it (DEC-354). */
export const MOM_CALL = [
    { speaker: 'Mom', phone: true, text: `Hey, how's everything going?` },
    { speaker: 'Mom', phone: true, text: `He what?&hellip; I can't believe it. Just like that, after all the time you've been there.` },
    { speaker: 'Mom', phone: true, text: `Come on by the house, honey. I've got something for you.` },
    { speaker: 'Mom', phone: true, text: `Press <span class="dlg-key">M</span> for the map if you forgot the way.` },
    { speaker: 'Mom', phone: true, until: 'engine', allow: [], hi: ['#ignition-hint'], text: `And honey &mdash; the truck won't start itself. `
        + `<span class="kc-kb">Hold <span class="dlg-key">I</span></span><span class="kc-pad">Hold <span class="dlg-key">Y</span></span> to turn the key.` },
]

/** DEC-326: Larry's call once the played tutorial's last paycheck is in hand — two cards, how to beat the game. A skip
 *  (which never meets Larry or hears Katie's call) gets RUN_INTRO's four instead. */
export const LARRY_CALL = [
    { speaker: 'Uncle Larry', phone: true, text: `Heyyo Billy, its your uncle Larry! Take a look on the map and find yourself some work.` },
    { speaker: 'Uncle Larry', phone: true, text: `And collect those good deeds, so you can join up with the expedition camp and start looking for a new supply route.` },
]

/** FEAT-184 (DEC-153): the played tutorial's last act — parked at the burger joint the morning after, the last paycheck,
 *  at 07:00 on day 0, 24 h after the firing (DEC-159, DEC-299). The owner's words, character for character (DEC-277). */
export const PAYCHECK = [
    { speaker: 'The manager', text: `Don't come back asking to run the grill again. If someone want's their food delivered you can have a cut, but I dont want you running the kitchen no more.` },
]

/** FEAT-184 (DEC-152, DEC-150): a skip lands outside the burger joint, and the manager hands over the last check. The
 *  line is the owner's words (FEAT-184 dive, 2026-11-14). */
export const BOSS_CHECK = [
    { speaker: 'The manager', text: `And just so you have no excuse to come back, here's your last check.` },
]

/** FEAT-184 (DEC-305, DEC-322 → DEC-361): parked at Larry's with his old pack — the first time Billy speaks with him. Two cards
 *  at most (owner, 2026-11-17: six was "way too long"): the greasebeard line and his sketch, then the work, the pack and the
 *  camp. The wording past the owner's sketch ("hang onto my old pack, bedroll and all") is a placeholder. */
export const LARRY_PACK = [
    { speaker: 'Uncle Larry', text: `Hey sport, I heard ol' <i>greasebeard</i> let you go. It's too bad you got fired.` },
    { speaker: 'Uncle Larry', text: `I have some work if you need it. Hang onto my old pack, bedroll and all, and remember to check out the expedition camp.` },
]

/**
 * First-use cards: each plays once, the first time the player meets the thing, and only in a run that
 * opened on the firing. They play once no other card is up and hold the sim while they are (main.js
 * _tut). Mom is the tutorial's voice; Katie calls after Larry's (the picnic, DEC-345), meets you at the camping area
 * (DEC-347). *
 * A lesson card (`until`, DEC-359) is also the tutorial gate's STEP (FEAT-288 P2, src/tut-gate.js): `allow` names the
 * locked actions it opens (gamepad.js BINDINGS names: 'inventory', 'damage screen', 'camp', 'recovery', …) and the card /
 * screen elements it frees (CSS selectors; an element matches when it or an ancestor does), and every other button, slot
 * and row of the in-game cards is locked while it is up. `hi` is what gets the yellow ring. test/tut-gate.mjs checks them.
 */
export const TUT = {
    'tut-offer': [{ speaker: 'Mom', text: `That's the job card: who's asking, what it pays, how long you've got. `
        + `Every job has one. Take it when you're ready.` }],
    'tut-rank': [{ speaker: 'Mom', text: `The bar up top is the clock on this job. Keep it in the good part and you'll earn the tip.` }],
    'tut-fuel': [{ speaker: 'Mom', text: `Fill up here. That old truck drinks &mdash; keep an eye on the fuel gauge on the dashboard, `
        + `because running dry out there means a tow you can't afford.` }],   // DEC-363: mom's, not Larry's (placeholder words)
    'tut-service': [{ speaker: 'Mom', text: `The shop fixes what you broke and sells what you need. `
        + `Every repair has a price on it &mdash; drive gentle and you'll keep more of your pay.` }],
    'tut-sleep': [{ speaker: 'Uncle Larry', text: `Getting late. Find flat ground off the road and make camp, or sleep at your mom's. `
        + `The day is all the time you've got &mdash; whatever you didn't earn by dark, you didn't earn.` }],
    'tut-camp': [{ speaker: 'Uncle Larry', text: `That's enough good deeds. The expedition camp is taking you on &mdash; `
        + `they've posted what they need. Bring it and you're out of here.` }],

    // FEAT-170 stage 4: the opening's lessons, in mom's voice, in the order they come. PLACEHOLDER words
    // (Lane A's draft, 2026-11-06; the owner writes them — FEAT-148).
    // FEAT-184 (the worst day, stage 3): the key first — the truck sits dead after her call — then the pedals.
    // FEAT-229 (DEC-304): the order is the firing day's — to hers, Larry's, the station, a camping area, the trouble on the
    // way home, her bed — then the morning's drive to the paycheck.
    // (The key card is MOM_CALL's last, inside her call: DEC-354.)
    // FEAT-229 (DEC-345): parked at Larry's, his pack cards over, Katie calls — the picnic at the old McGill ranch is the
    // reason for the snack and the camp. DEC-355: her call opens "Hey Billy! How you doing? Sorry about yesterday..." (the
    // owner's words: the firing was this same morning, kept as he wrote it) and names the bag of peanuts. The owner's
    // words but the snack ask, a PLACEHOLDER.
    'tut-picnic': [
        { speaker: KATIE, phone: true, text: `Hey Billy! How you doing? Sorry about yesterday&hellip;` },
        { speaker: KATIE, phone: true, text: `Anyway, since I know you got nothing going on today, why don't we go picnic out at the old McGill ranch. `
            + `I'll let you pick a spot and I'll meet you out there.` },
        { speaker: KATIE, phone: true, text: `Grab us a bag of peanuts at the gas station on your way, would you?` },
        // FEAT-288 P3b (DEC-422: "explain the list on the side, setting a waypoint, direct the player to the legend"): the
        // map beat, inside her call — open the map, the Shopping list, a waypoint on her station (main.js fills {snack}
        // with its POI id; _tutWaypointOk takes a drop on it alone), the legend pointed at, the map closed. She holds the
        // line to the store (`holds`), where tut-shop picks the call up.
        { speaker: KATIE, phone: true, until: 'map', allow: [], text: `Not sure which station? Open your map: `
            + `<span class="kc-kb"><span class="dlg-key">M</span></span><span class="kc-pad"><span class="dlg-key">View</span></span>.` },
        { speaker: KATIE, phone: true, until: 'shoptab', allow: [], hi: ['#map-list-head [data-tab="shopping"]'],
            text: `That list on the side shows every shop around here. Switch it to Shopping: `
            + `<span class="kc-kb"><span class="dlg-key">Q</span></span><span class="kc-pad"><span class="dlg-key">X</span></span>.` },
        { speaker: KATIE, phone: true, until: 'waypoint', allow: ['map: drop / clear the waypoint'], hi: ['#map-list .ml-row[data-key="{snack}"]'],
            text: `There's the station. Walk the list to it with <span class="kc-kb"><span class="dlg-key">↑</span> <span class="dlg-key">↓</span></span>`
            + `<span class="kc-pad">the <span class="dlg-key">D-pad</span></span> and drop a waypoint on it: `
            + `<span class="kc-kb"><span class="dlg-key">N</span></span><span class="kc-pad"><span class="dlg-key">Y</span></span>.` },
        { speaker: KATIE, phone: true, holds: true, until: 'mapshut', allow: [], hi: ['#map-legend'],
            text: `And the key to all those little marks is down in the corner. Close the map `
            + `(<span class="kc-kb"><span class="dlg-key">M</span></span><span class="kc-pad"><span class="dlg-key">View</span></span>) and holler when you're at the store.` },
    ],
    // FEAT-288 P3b (DEC-422: "Katie needs to guide you through the shopping process, how to select an item, how to check
    // out"): parked at the store, the shop open, she is still on the line — the peanuts row and its add to cart only, then
    // check out only (discard and the cart's × locked: mom's money always covers the bag, main.js _momCash), then her
    // send-off (DEC-345, the owner's words) until you leave the shop, and her click. Mom's gas call follows (tut-gas).
    'tut-shop': [
        { speaker: KATIE, phone: true, answered: true, until: 'cart', allow: ['#svc-screen [data-item="bagOfPeanuts"]'],
            hi: ['#svc-screen .sv-line[data-item="bagOfPeanuts"]', '#svc-screen [data-item="bagOfPeanuts"] [data-act="stow"]'],
            text: `Got it? Pick the peanuts off the shelf: <span class="kc-kb"><span class="dlg-key">↑</span> <span class="dlg-key">↓</span> to the row, `
            + `<span class="dlg-key">Enter</span></span><span class="kc-pad">the <span class="dlg-key">D-pad</span> to the row, <span class="dlg-key">A</span></span> to open it, then add to cart.` },
        { speaker: KATIE, phone: true, until: 'bought', allow: ['#svc-screen [data-act="checkout"]'], hi: ['#svc-screen [data-act="checkout"]', '#svc-screen .sv-wallet'],
            text: `Now check out. That pays for whatever's in your cart.` },
        { speaker: KATIE, phone: true, until: 'shopshut', allow: [], hi: ['#svc-screen [data-act="close"]'], text: `You know where to go, I'll see you there!` },
    ],
    // …and the gauge, at the snack's station once the peanuts are bought, as the shop closes (main.js _evePump, DEC-306,
    // DEC-323; DEC-422 moved it off the brake). DEC-345: mom calls, the owner's words; then the lesson (a PLACEHOLDER). DEC-354: she
    // stays on the line through the fill-up (`holds`), and her send-off (tut-snackcamp) hangs up.
    'tut-gas': [
        { speaker: 'Mom', phone: true, text: `Hey, is everything alright? I almost forgot, when I looked over the truck last night I noticed it was plumb outta gas.` },
        { speaker: 'Mom', phone: true, holds: true, text: `You're right there, honey. Back out of that spot, pull up at a pump and fill her up. You can check how much is in the tank on the fuel gauge on the dashboard.` },
    ],
    // FEAT-184 (DEC-151): the handbrake held at the station's pump while money is left. PLACEHOLDER words.
    'tut-fillup': [{ speaker: 'Mom', phone: true, answered: true, holds: true, text: `Not yet, honey &mdash; fill it right up. Every last dollar: you won't get far on fumes.` }],
    // FEAT-184 stage 4, the worst day: the flat halfway home, the screen it shows on, the spare that's flat too, the tow,
    // and the shop it lands at (main.js _eveningBeats, _pickSpare, _toggleRecovery, _updateParkTriggers).
    // FEAT-288 P3a (DEC-422: "force them out of the diagnostics menu and into the inventory, force them to select the correct
    // item"): V (or the B menu's vehicle condition) and only that; then the screen to look at, its swap locked, until you
    // back out; then the inventory and the spare only, onto a corner in the picker; then the recovery menu's tow to the shop
    // (main.js _TUT_TOW). The pad's halves name hold B (kc-pad, FEAT-174).
    'tut-flat': [{ speaker: 'Mom', until: 'damage', allow: ['damage screen'], hi: ['#hud-b-hint', '#dmg-icon'], text: `Was that a bang? That's a flat, honey. Pull over, come to a full stop, set the handbrake, `
        + `and <span class="kc-kb">press <span class="dlg-key">V</span></span><span class="kc-pad">hold <span class="dlg-key" data-pad="menu">B</span> and pick vehicle condition</span> to look at it.` }],
    'tut-damage': [
        { speaker: 'Mom', until: 'diagback', allow: ['damage screen', '.ds-row', '.ds-part'],
            hi: ['#dmg-screen .ds-row[data-track="tireFL"]', '#dmg-screen .ds-part[data-track="tireFL"]', '#dmg-screen [data-act="close"]'],
            text: `That's your truck, part by part, and how worn each one is: green is fine, red is trouble. The front left's flat. `
            + `Back out with <span class="kc-kb"><span class="dlg-key">Esc</span></span><span class="kc-pad"><span class="dlg-key">B</span></span>.` },
        { speaker: 'Mom', until: 'spare', allow: ['inventory', '.inv-slot[data-id="spareTire"]', '#inv-screen:has(.inv-slot.sel[data-id="spareTire"]) :is([data-act="use"], [data-act="action"])', '#dmg-screen.picking'],
            hi: ['#hud-b-hint', '#inv-icon', '.inv-slot[data-id="spareTire"]', '#dmg-screen.picking .ds-pbtn[data-track="tireFL"]'],
            text: `Now put your spare on: <span class="kc-kb"><span class="dlg-key">Tab</span></span><span class="kc-pad">hold <span class="dlg-key" data-pad="menu">B</span> and pick the inventory</span>, then the mounted tire.` },
    ],
    'tut-spareflat': [{ speaker: 'Mom', until: 'recovery', allow: ['recovery'], hi: ['#hud-b-hint', '#recovery-icon'], text: `The spare's flat too? Of course it is. Call a tow: `
        + `<span class="kc-kb"><span class="dlg-key">X</span> is</span><span class="kc-pad">hold <span class="dlg-key" data-pad="menu">B</span> and pick</span> the recovery menu.` }],
    'tut-tow': [{ speaker: 'Mom', text: `The tow takes you to the nearest auto shop. It's on me this time.` }],
    // FEAT-184 (DEC-151): the tire is on mom — one mounted tire and its fitting, paid at the cart's check out (FEAT-212). PLACEHOLDER words.
    'tut-shopfix': [{ speaker: 'Mom', text: `Get a good tire on that corner &mdash; that one's on me. Check out at the counter, then come home, it's late.` }],
    // Stage 5: the night drive home after the shop.
    'tut-lights': [{ speaker: 'Mom', until: 'lights', allow: [], text: `It's pitch dark out there. `
        + `<span class="kc-kb"><span class="dlg-key">L</span> turns</span><span class="kc-pad">the <span class="dlg-key">left stick</span> click turns</span> `
        + `the headlights on. Follow the line home.` },
        { speaker: 'Mom', text: `And remember, honey: slowing down is the best way to avoid crashing.` }],   // DEC-325
    // On the drive home: right after her call, halfway there, and near her house (main.js _eveningBeats).
    'tut-drive': [{ speaker: 'Mom', text: `Drive safe, honey. <span class="dlg-key">W</span> and <span class="dlg-key">S</span> `
        + `are the gas and the brake; steer with <span class="kc-kb"><span class="dlg-key">A</span> and <span class="dlg-key">D</span></span>`
        + `<span class="kc-pad">the <span class="dlg-key">left stick</span></span>. Follow the line home.` }],   // FEAT-174: kc-kb / kc-pad, one per input
    'tut-park': [{ speaker: 'Mom', until: 'park', allow: [], hi: ['#poi-prompt'], text: `Pull over and park out front, in the marked spot. Come to a full stop, then `
        + `<span class="kc-kb">tap <span class="dlg-key">Space</span></span><span class="kc-pad">tap <span class="dlg-key" data-pad="brake">RB</span></span> to set the handbrake.` }],
    // At hers that night, when her sleep card opens: glad you're home safe (DEC-325), then hunger and energy (DEC-315: the
    // owner's words; true of day.js — past the last meal's hold energy drains faster than an hour per hour, and low energy
    // is sleepy, tired, exhausted), then her bed.
    'tut-home': [{ speaker: 'Mom', text: `There you are! I'm so happy you're home, and safe.` }],
    'tut-hungry': [{ speaker: 'Mom', text: `Oh my, you must be hungry by now. Just be careful: when you get hungry you run out of energy `
        + `really quickly, and then you get tired.` }],
    'tut-moms': [
        { speaker: 'Mom', text: `You can always rest here. It's better than sleeping in the truck.` },
        { speaker: 'Mom', text: `When you're out late, find flat ground off the road and make camp. A nice spot rests you better than a bad one.` },
        { speaker: 'Mom', text: `And first thing tomorrow, go get your last paycheck from work.` },   // DEC-422: mom's, not Katie's
        // DEC-357 / DEC-426 (Q1): the last card, as it waits for the night: sleep, the slider and its Sleep only (greyed
        // until the slider reads the alarm, main.js _syncSleepRow); "leave" is locked.
        { speaker: 'Mom', until: 'slept', allow: ['#cp-sleep', '#cp-hours', '#cp-sleep-go'], hi: ['#cp-sleep', '#cp-hours', '#cp-sleep-go:not(:disabled)'],
            text: `Sleep is how a day ends. Set your alarm clock for {alarm}: pick sleep and slide it until it reads wake {alarm}, then sleep. The bar shows how rested you'll wake up.` },
    ],
    // The morning: breakfast at hers (it feeds you), then mom's word about the paycheck (DEC-422).
    // FEAT-184 stage 5: breakfast is yours to eat — one of her packed lunches, from the inventory. DEC-422/426 (Q4): she hands
    // them over here (main.js grants four as you wake at hers), you eat one and leave with three; nothing else in the bag.
    'tut-breakfast': [{ speaker: 'Mom', until: 'lunch', allow: ['inventory', '.inv-slot[data-id="packedLunch"]', '#inv-screen:has(.inv-slot.sel[data-id="packedLunch"]) [data-act="use"]'],
        hi: ['#hud-b-hint', '#inv-icon', '#cp-item', '.inv-slot[data-id="packedLunch"]'], text: `Morning! I packed you some lunches for the road. Eat one before you go &mdash; `
        + `you'll run out of steam early on an empty stomach. Select <span class="dlg-key">inventory</span>, then a packed lunch.` }],
    // FEAT-184 (DEC-153, DEC-326): after breakfast, mom's reminder (DEC-422: it was Katie's) — the last drive on rails, back to the joint for the check.
    'tut-morning': [{ speaker: 'Mom', text: `Now go get that paycheck, honey. Drive safe.` }],
    // FEAT-229 (DEC-305): parked at her door on the firing day, her hand-over — she tosses Larry's old pack out her front
    // door — then the pick-up lesson. The hand-over is the owner's words (tidied only in capitals and punctuation); "a
    // couple bucks" is the peanuts' price plus the gas money she does not mention (DEC-306). The pick-up lesson is a
    // PLACEHOLDER; its keys are the game's (D-pad ↓ / G).
    'tut-handover': [{ speaker: 'Mom', text: `Take this pack over to your uncle. He left it behind. Also, here's a couple bucks for food.` }],
    'tut-pickup': [{ speaker: 'Mom', until: 'pickup', allow: [], hi: ['#poi-prompt'], quest: 'pack', text: `<span class="dlg-key">Park</span> next to it and `
        + `<span class="kc-kb">press <span class="dlg-key">G</span></span><span class="kc-pad">press <span class="dlg-key">D-pad ↓</span></span> `
        + `to load anything loose nearby. Then run it over to Larry's.` }],
    // FEAT-229 (DEC-346): the tank filled, mom sends you on your way (PLACEHOLDER words); the line already runs to the
    // camping area nearest the station (the old McGill ranch, DEC-345).
    'tut-snackcamp': [{ speaker: 'Mom', phone: true, answered: true, text: `There, that's better. Go on and have fun with Katie, honey.` }],
    // DEC-345/346: at the waypoint Katie calls (the owner's words), then she walks you through the camp: the camp menu, the
    // vibe bar's four terrain segments (camp.js VIBE_W: flat, view, shade, water), then the snack. Her camp instruction is
    // the owner's (DEC-355; the keyboard's half names its own key, Z, as every line by input does, FEAT-174); she stays on
    // the line through the hunt (`holds`) and the vibe cards hang up. The vibe cards are PLACEHOLDER words.
    'tut-ranch': [
        { speaker: KATIE, phone: true, text: `Oh, you're already there? I'm just a couple minutes out. Go ahead and find a good spot. I'll just pull over where I see your truck.` },
        { speaker: KATIE, phone: true, holds: true, until: 'campmenu', allow: ['camp'], hi: ['#hud-b-hint', '#camp-icon'], text: `<span class="kc-kb">Press <span class="dlg-key">Z</span></span><span class="kc-pad">Hold <span class="dlg-key" data-pad="menu">B</span> and select the camping menu</span> `
            + `to look for a campsite. Then drive slowly down the road to find the best site nearby. Anything flat enough will do!` },
    ],
    'tut-vibe': [
        { speaker: KATIE, phone: true, answered: true, text: `See that bar? That's the vibe. The yellow is how flat it is &mdash; that counts the most, you don't want to roll out of the tent.` },
        { speaker: KATIE, phone: true, text: `Purple is the view, green is shade from the trees, and blue is water close by. `
            + `Fill the bar as far as you can, then park and make camp.` },
    ],
    // DEC-355: at camp the side menu is not there (B is the card's back), so she names the camp card's own button.
    'tut-campmade': [{ speaker: KATIE, until: 'snack', allow: ['inventory', '.inv-slot[data-id="bagOfPeanuts"]', '#inv-screen:has(.inv-slot.sel[data-id="bagOfPeanuts"]) [data-act="use"]'],
        hi: ['#cp-item', '.inv-slot[data-id="bagOfPeanuts"]'], text: `Nice spot! Go ahead and break out that snack: select <span class="dlg-key">inventory</span> and eat the peanuts.` }],
    // DEC-324 → DEC-347: what now, the expedition camp and its good deeds (DEC-236's cards 2–4 in her voice), and the
    // send-off (DEC-422: the paycheck is mom's) — now said in person, she having pulled over by your truck (no model is drawn). {dir} and
    // {deeds} are filled from the game, as RUN_INTRO's are (main.js _fillCamp).
    'tut-katie': [
        { speaker: KATIE, text: `So what are you gonna do now that you don't have a job?` },   // DEC-355: in person, no opener
        { speaker: KATIE, text: `say, i hear theres an expedition camp up at the old {dir} road. I think they're looking to make a new supply route. `
            + `I heard them say they'd take anyone with {deeds} good deeds to their name.` },
        { speaker: KATIE, text: `Don't expect it to be easy if you join up with them, but it might be the best way to get connected back up with the outside world.` },
        { speaker: KATIE, text: `Getting a good deed is as simple as taking delivery jobs and keeping the pace. Or sometimes getting the cargo there in one piece `
            + `is all that matters. Listen closely to the customer, because they'll tell you exactly what they need.` },
        { speaker: KATIE, text: `The customer will also tell you the base pay ahead of time. Usually they tip better if you drive better. Some folks might even `
            + `throw in an item.` },
        { speaker: KATIE, text: `Well, I better get going. Break camp whenever you're ready, and head on home.` },   // DEC-422: the paycheck is mom's
    ],
}

/** FEAT-148 (owner, 2026-10-31): the midnight overlay's words — the pressure is rising. The owner's lines. */
export const MIDNIGHT = { main: 'Supplies are drying up', sub: 'costs keep rising' }

/** FEAT-103: the eight words for a bearing, clockwise from north (0° = −Z, the map's up). */
export const COMPASS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']

/** Sequence keys for DialogueSystem.play()'s once-per-run gate. TUT's keys are their own. */
export const DLG = {
    paperRouteIntro: 'paper-route-intro',
    runIntro: 'run-intro',
    firing: 'firing',         // FEAT-147 — also how main.js knows the run opened on the firing
    momCall: 'mom-call',
    skipped: 'opening-skipped',   // FEAT-170: the opening was held-to-skip — no first-use cards this run
    bossCheck: 'boss-check',   // FEAT-184: the skip's last check
    played: 'tutorial-played',   // FEAT-184: "play the tutorial" chosen at the intro's card
    morning: 'morning',          // FEAT-184 (DEC-153): the firing day is over; the morning goes to the joint (Katie says so: TUT 'tut-morning')
    paycheck: 'paycheck',        // FEAT-184: the tutorial's last act heard — free will from here
    larryPack: 'larry-pack',     // FEAT-184 (DEC-305): the errand's end — Larry gave you his old pack; the day goes on to the station
}
