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

/** The firing: played over the camera's slow move round the burger joint (owner, 2026-11-05). */
export const FIRING = [
    { speaker: 'The manager', text: `Jay. The grill's been cold twenty minutes and there's a line out the door.` },
    { speaker: 'The manager', text: `I'm letting you go. Leave the hat. And don't come back asking for shifts &mdash; there won't be any.` },
]

/** Mom's call, once the player chose the tutorial at the intro's card (FEAT-184): she sends you home for the night
 *  (FEAT-170). The morning goes back to the burger joint for the last paycheck (DEC-153). */
export const MOM_CALL = [
    { speaker: 'Mom', text: `Heard about the job, honey. Come home tonight &mdash; your old bed's made up.` },
    { speaker: 'Mom', text: `You can pick up your last check in the morning. `
        + `Press <span class="dlg-key">M</span> for the map if you forgot the way home.` },
]

/** FEAT-184 (DEC-153): the played tutorial's last act — parked at the burger joint the morning after, the last paycheck.
 *  Its clock goes to 19:30, 24 h after the firing (DEC-159). The owner's words, character for character (DEC-277). */
export const PAYCHECK = [
    { speaker: 'The manager', text: `Don't come back asking to run the grill again. If someone want's their food delivered you can have a cut, but I dont want you running the kitchen no more.` },
]

/** FEAT-184 (DEC-152, DEC-150): a skip lands outside the burger joint, and the manager hands over the last check. The
 *  line is the owner's words (FEAT-184 dive, 2026-11-14). */
export const BOSS_CHECK = [
    { speaker: 'The manager', text: `And just so you have no excuse to come back, here's your last check.` },
]

/** FEAT-184 (DEC-238): parked at Larry's with his old pack, he gives it to you — his old camping pack, bedroll and all.
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
    'tut-key': [{ speaker: 'Mom', text: `And honey &mdash; the truck won't start itself. `
        + `<span class="kc-kb">Hold <span class="dlg-key">I</span></span><span class="kc-pad">Hold <span class="dlg-key">Y</span></span> to turn the key.` }],
    // …and the gauge, when the tank starts near empty and the line runs by the nearest station (main.js _evePump).
    'tut-gas': [{ speaker: 'Mom', text: `Is that gauge on empty? Of course it is. The line takes you by the gas station first: `
        + `pull up at a pump and fill her up.` }],
    // FEAT-184 (DEC-151): the handbrake held at the evening's pump while pocket change is left. PLACEHOLDER words.
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
    // At hers in the evening, when her sleep card opens.
    'tut-moms': [
        { speaker: 'Mom', text: `You can always rest here. It's better than sleeping in the truck.` },
        { speaker: 'Mom', text: `When you're out late, find flat ground off the road and make camp. A nice spot rests you better than a bad one.` },
        { speaker: 'Mom', text: `Sleep is how a day ends. Pick how long on the timer &mdash; the bar shows how rested you'll wake up.` },
    ],
    // The morning: breakfast at hers (it feeds you), then her word about the paycheck.
    // FEAT-184 stage 5: breakfast is yours to eat — one of her packed lunches, from the inventory.
    'tut-breakfast': [{ speaker: 'Mom', text: `Morning! Eat something before you go &mdash; you'll run out of steam early on an empty stomach. `
        + `<span class="dlg-key">Tab</span>, and pick one of the lunches I packed you.` }],
    // FEAT-184 (DEC-153): woken, the morning goes back to the joint for the last paycheck. PLACEHOLDER words.
    'tut-morning': [{ speaker: 'Mom', text: `Your last check's waiting at that burger place. Follow the line, and park out front.` }],
    // FEAT-184 (DEC-238): the morning's errand — mom tosses Larry's old pack out her front door, and the pick-up lesson.
    // PLACEHOLDER words, both (the owner writes character text, FEAT-148); the lesson's keys are the game's (D-pad ↓ / G).
    'tut-errand': [{ speaker: 'Mom', text: `[placeholder] Before your check &mdash; take your uncle's old pack back to him. Here, catch!` }],
    'tut-pickup': [{ speaker: 'Mom', text: `[placeholder] Park next to it and `
        + `<span class="kc-kb">press <span class="dlg-key">G</span></span><span class="kc-pad">press <span class="dlg-key">D-pad ↓</span></span> `
        + `to load anything loose nearby. Then run it over to Larry's.` }],
    // FEAT-184 (DEC-239, DEC-276): the snack on the way to the paycheck — mom's few dollars, then (bought at the gas station)
    // the camping area to eat it in. PLACEHOLDER words, both (the owner writes character text, FEAT-148).
    'tut-snack': [{ speaker: 'Mom', text: `[placeholder] And here's a few dollars &mdash; get yourself a snack at the gas station on the way.` }],
    'tut-snackcamp': [{ speaker: 'Mom', text: `[placeholder] Now find a camping area &mdash; they're the yellow roads on the map. `
        + `Pull over in one, park, and eat your snack: <span class="dlg-key">Tab</span>.` }],
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
    morning: 'morning',          // FEAT-184 (DEC-153): the evening is over; the morning goes to the joint (mom says so: TUT 'tut-morning')
    paycheck: 'paycheck',        // FEAT-184: the tutorial's last act heard — free will from here
    larryPack: 'larry-pack',     // FEAT-184 (DEC-238): the errand's end — Larry gave you his old pack; the morning goes on to the joint
}
