// Authored dialogue lines (FEAT-61). Data only — no logic, no imports. src/dialogue.js runs these.
//
// The player is JAY. He has just been fired from the burger joint (opening.md, ratified 2026-08-05)
// and has gone to his uncle Larry, who runs the delivery service, for a source of income.
//
// `text` is TRUSTED AUTHORED MARKUP: <span class="dlg-key">…</span> colours a control glyph. Never
// put player input or a formatted number through this field — the renderer sets innerHTML.
// A line that differs by input says it once per input: <span class="kc-kb">…</span><span class="kc-pad">…</span>,
// and CSS shows the half for the device driving now (body.pad-on), switching live (FEAT-174). Never both in words.

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
 * owner writes dialogue: never correct them). Played once the last paycheck is in hand (DEC-155), and the one place the
 * player is told WHAT THE RUN IS FOR. Two fills, both from the game, never typed (main.js _runIntro): {dir} is the
 * expedition camp's true compass direction from the spawn (COMPASS below), {deeds} the camp's gate,
 * ECONOMY_PARAMS.campDeeds. Both are words or digits of our own, so they are safe in this markup.
 */
export const RUN_INTRO = [
    {
        speaker: 'Uncle Larry',
        text: `Heyyo JJ, its your uncle Larry! Listen, I heard ol' <i>greasebeard</i> let you go. Just remember if you need a little cash `
            + `you can always sling a few papers on the route for me. If you prove you can deliver fast enough I can even expand the route.`,
    },
    {
        speaker: 'Uncle Larry',
        text: `Speaking of work, I hear there's an expedition camp up at the old {dir} road. I think they're looking to make an new supply route. `
            + `I heard them say they'd take anyone with {deeds} good deeds to their name. Don't expect it to be easy if you join up with them, `
            + `but it might be the best way to get connected back up with the outside world`,
    },
    {
        speaker: 'Uncle Larry',
        text: `Gettin' a good deed is as simple as taking delivery jobs and keeping the pace. Or sometimes getting the cargo there in one piece `
            + `is all that matters. Listen closely to the client because they'll tell ya exactly what they need.`,
    },
    {
        speaker: 'Uncle Larry',
        text: `The client will also tell you the base pay ahead of time. Usually they tip better if you drive better. Some folks might even `
            + `throw in an item. Just be careful, you know how sometimes these roads can surprise ya.`,
    },
]

// ── FEAT-147: the opening ─────────────────────────────────────────────────────────────────────
// EVERY WORD BELOW IS A PLACEHOLDER (Lane A's draft, 2026-11-05) — the owner writes character text
// (FEAT-148). The beats are ruled; the lines are not.

/** The firing: played over the camera's slow move round the burger joint (owner, 2026-11-05), at 07:00 (DEC-299). DEC-307:
 *  a boss who overreacts, and not a word about the paycheck. PLACEHOLDER words. */
export const FIRING = [
    { speaker: 'The manager', text: `[placeholder] Jay! You're late! The grill's been cold twenty minutes and there's a line out the door!` },
    { speaker: 'The manager', text: `[placeholder] That's it. You're fired! Leave the hat and get out of my sight!` },
]

/** Mom's call, once the player chose the tutorial at the intro's card (FEAT-184): come by the house (DEC-304). Not a word
 *  about the paycheck on the firing day (DEC-307). PLACEHOLDER words. */
export const MOM_CALL = [
    { speaker: 'Mom', text: `[placeholder] Heard about the job, honey. Come on by the house, I've got something for you.` },
    { speaker: 'Mom', text: `Press <span class="dlg-key">M</span> for the map if you forgot the way.` },
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

/** FEAT-184 (DEC-238, DEC-305): parked at Larry's with his old pack, he gives it to you — his old camping pack, bedroll and all.
 *  PLACEHOLDER: the owner writes these words (FEAT-148). */
export const LARRY_PACK = [
    { speaker: 'Uncle Larry', text: `[placeholder] My old pack! You know what, keep it &mdash; bedroll's still in it. You'll want it out there.` },
]

/**
 * First-use cards: each plays once, the first time the player meets the thing, and only in a run that
 * opened on the firing. They play once no other card is up and hold the sim while they are (main.js
 * _tut). Larry is the tutorial's voice once you have met him; before that it is mom.
 */
export const TUT = {
    'tut-offer': [{ speaker: 'Mom', text: `That's the job card: who's asking, what it pays, how long you've got. `
        + `Every job has one. Take it when you're ready.` }],
    'tut-rank': [{ speaker: 'Mom', text: `The bar up top is the clock on this job. Keep it in the good part and you'll earn the tip.` }],
    'tut-fuel': [{ speaker: 'Uncle Larry', text: `Fill up here. That old truck drinks &mdash; watch the gauge, `
        + `because running dry out there means a tow you can't afford.` }],
    'tut-service': [{ speaker: 'Uncle Larry', text: `The shop fixes what you broke and sells what you need. `
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
    'tut-key': [{ speaker: 'Mom', text: `And honey &mdash; the truck won't start itself. `
        + `<span class="kc-kb">Hold <span class="dlg-key">I</span></span><span class="kc-pad">Hold <span class="dlg-key">Y</span></span> to turn the key.` }],
    // …and the gauge, at the snack's station once the peanuts are bought (main.js _evePump, DEC-306).
    'tut-gas': [{ speaker: 'Mom', text: `Is that gauge on empty? Of course it is. While you're there, `
        + `pull up at a pump and fill her up.` }],
    // FEAT-184 (DEC-151): the handbrake held at the station's pump while money is left. PLACEHOLDER words.
    'tut-fillup': [{ speaker: 'Mom', text: `Not yet, honey &mdash; fill it right up. Every last dollar: you won't get far on fumes.` }],
    // FEAT-184 stage 4, the worst day: the flat halfway home, the screen it shows on, the spare that's flat too, the tow,
    // and the shop it lands at (main.js _eveningBeats, _pickSpare, _toggleRecovery, _updateParkTriggers).
    'tut-flat': [{ speaker: 'Mom', text: `Was that a bang? That's a flat, honey. Pull over, set the handbrake, `
        + `and press <span class="dlg-key">V</span> to look at it.` }],
    'tut-damage': [{ speaker: 'Mom', text: `That's your truck, part by part, and how worn each one is: green is fine, `
        + `red is trouble. The front left's flat. Put your spare on: <span class="dlg-key">Tab</span>, then the mounted tire.` }],
    'tut-spareflat': [{ speaker: 'Mom', text: `The spare's flat too? Of course it is. Call a tow: `
        + `<span class="dlg-key">X</span> is the recovery menu.` }],
    'tut-tow': [{ speaker: 'Mom', text: `The tow takes you to the nearest auto shop. It's on me this time.` }],
    // FEAT-184 (DEC-151): the tire is on mom — one mounted tire and its fitting, paid at the cart's check out (FEAT-212). PLACEHOLDER words.
    'tut-shopfix': [{ speaker: 'Mom', text: `Get a good tire on that corner &mdash; that one's on me. Check out at the counter, then come home, it's late.` }],
    // Stage 5: the night drive home after the shop.
    'tut-lights': [{ speaker: 'Mom', text: `It's pitch dark out there. `
        + `<span class="kc-kb"><span class="dlg-key">L</span> turns</span><span class="kc-pad">the <span class="dlg-key">left stick</span> click turns</span> `
        + `the headlights on. Follow the line home.` }],
    // On the drive home: right after her call, halfway there, and near her house (main.js _eveningBeats).
    'tut-drive': [{ speaker: 'Mom', text: `Drive safe, honey. <span class="dlg-key">W</span> and <span class="dlg-key">S</span> `
        + `are the gas and the brake; steer with <span class="kc-kb"><span class="dlg-key">A</span> and <span class="dlg-key">D</span></span>`
        + `<span class="kc-pad">the <span class="dlg-key">left stick</span></span>. Follow the line home.` }],   // FEAT-174: kc-kb / kc-pad, one per input
    'tut-park': [{ speaker: 'Mom', text: `Pull in at mine and stop. A tap of <span class="dlg-key">Space</span> sets the handbrake &mdash; `
        + `that's parking, and parking is how you get anything done around here.` }],
    // At hers that night, when her sleep card opens: first hunger and energy (DEC-315: the owner's words; true of day.js —
    // past the last meal's hold energy drains faster than an hour per hour, and low energy is sleepy, tired, exhausted),
    // then her question about last week's pay (DEC-307), then her bed.
    'tut-hungry': [{ speaker: 'Mom', text: `Oh my, you must be hungry by now. Just be careful: when you get hungry you run out of energy `
        + `really quickly, and then you get tired.` }],
    'tut-lastweek': [{ speaker: 'Mom', text: `[placeholder] Did they at least pay you for last week? &hellip; They didn't, did they. `
        + `Well, you go and get that check in the morning.` }],
    'tut-moms': [
        { speaker: 'Mom', text: `You can always rest here. It's better than sleeping in the truck.` },
        { speaker: 'Mom', text: `When you're out late, find flat ground off the road and make camp. A nice spot rests you better than a bad one.` },
        { speaker: 'Mom', text: `Sleep is how a day ends. Pick how long on the timer &mdash; the bar shows how rested you'll wake up.` },
    ],
    // The morning: breakfast at hers (it feeds you), then her word about the paycheck.
    // FEAT-184 stage 5: breakfast is yours to eat — one of her packed lunches, from the inventory.
    'tut-breakfast': [{ speaker: 'Mom', text: `Morning! Eat something before you go &mdash; you'll run out of steam early on an empty stomach. `
        + `<span class="dlg-key">Tab</span>, and pick one of the lunches I packed you.` }],
    // FEAT-184 (DEC-153, DEC-307): woken, her reminder — the last drive on rails, back to the joint for the check.
    // PLACEHOLDER words.
    'tut-morning': [{ speaker: 'Mom', text: `[placeholder] Don't forget, honey &mdash; go pick up that check. Follow the line, and park out front.` }],
    // FEAT-229 (DEC-305): parked at her door on the firing day, her hand-over — she tosses Larry's old pack out her front
    // door — then the pick-up lesson. The hand-over is the owner's words (tidied only in capitals and punctuation); "a
    // couple bucks" is the peanuts' price plus the gas money she does not mention (DEC-306). The pick-up lesson is a
    // PLACEHOLDER; its keys are the game's (D-pad ↓ / G).
    'tut-handover': [{ speaker: 'Mom', text: `Take this pack over to your uncle. He left it behind. Also, here's a couple bucks for food.` }],
    'tut-pickup': [{ speaker: 'Mom', text: `[placeholder] Park next to it and `
        + `<span class="kc-kb">press <span class="dlg-key">G</span></span><span class="kc-pad">press <span class="dlg-key">D-pad ↓</span></span> `
        + `to load anything loose nearby. Then run it over to Larry's.` }],
    // FEAT-229 (DEC-304): the snack bought (and the tank filled), the camping area — the camp's buttons and its card;
    // then, the snack eaten in camp, her supper call (main.js stamps 17:00 under it). PLACEHOLDER words, both.
    'tut-snackcamp': [{ speaker: 'Mom', text: `[placeholder] Now drive to a camping area &mdash; they're the yellow roads on the map. `
        + `In one, <span class="kc-kb">press <span class="dlg-key">Z</span></span><span class="kc-pad">hold <span class="dlg-key">B</span> for the camp</span> `
        + `to look for a campsite, pull up on a flat spot and park. Make camp, then eat your snack from the inventory.` }],
    'tut-supper': [{ speaker: 'Mom', text: `[placeholder] Honey, it's getting on for five. Break camp and come home for supper.` }],
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
    morning: 'morning',          // FEAT-184 (DEC-153): the firing day is over; the morning goes to the joint (mom says so: TUT 'tut-morning')
    paycheck: 'paycheck',        // FEAT-184: the tutorial's last act heard — free will from here
    larryPack: 'larry-pack',     // FEAT-184 (DEC-305): the errand's end — Larry gave you his old pack; the day goes on to the station
}
