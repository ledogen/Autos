// Authored dialogue lines (FEAT-61). Data only — no logic, no imports. src/dialogue.js runs these.
//
// The player is JAY. He has just been fired from the burger joint (opening.md, ratified 2026-08-05)
// and has gone to his uncle Larry, who runs the delivery service, for a source of income.
//
// `text` is TRUSTED AUTHORED MARKUP: <span class="dlg-key">…</span> colours a control glyph. Never
// put player input or a formatted number through this field — the renderer sets innerHTML.

/** The uncle's one-time briefing, played the first time a paper route is accepted in a run. */
export const PAPER_ROUTE_INTRO = [
    {
        speaker: 'Uncle Larry',
        text: `So you're finally ready to run the paper route? Here's what ya gotta do.`,
    },
    {
        speaker: 'Uncle Larry',
        text: `Drive near the customer's house and hold <span class="dlg-key">F</span> to aim your `
            + `throw. when you're happy with your aim, <span class="dlg-key">release F</span> to `
            + `yeet that newspaper roll right onto their porch.`,
    },
]

/**
 * GAME-FEEL REVIEW 2026-10-23 (R-11): the run's opening cards — the goal, the deed rule, the pay
 * rule — played once when a story run goes live. Until FEAT-147 builds the firing and the uncle's
 * first day, this is the one place the player is told WHAT THE RUN IS FOR: ten good deeds (economy.js
 * campDeeds — keep the word in step, FEAT-168) and the
 * expedition camp (FEAT-103). The uncle is the tutorial's voice (FEAT-147). Three cards, no more.
 */
export const RUN_INTRO = [
    {
        speaker: 'Uncle Larry',
        // FEAT-103: {dir} is the camp's true compass direction from the spawn, filled in at run start
        // (main.js _runIntro) from COMPASS below — never a number, so it is safe in this markup.
        text: `Jay. There's an expedition camped up at the {dir} road, looking for a way out of here. `
            + `They take on anyone with <span class="dlg-key">ten good deeds</span> to their name. That's your way out too.`,
    },
    {
        speaker: 'Uncle Larry',
        text: `A good deed is a job done right &mdash; a <span class="dlg-key">B</span> or better. Scrape a C and it's half of one. `
            + `Every job card tells you what it's asking for. Read it before you take it.`,
    },
    {
        speaker: 'Uncle Larry',
        text: `Pay is a base you keep no matter what, plus a tip for driving it quick &mdash; unless the card offers you `
            + `an item instead of the tip. Your last paycheck's in the glovebox. Go.`,
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

/** Mom's call, the moment the firing ends: she sends the first job (data/offers.js FIRST_JOB). */
export const MOM_CALL = [
    { speaker: 'Mom', text: `Heard about the job, honey. Come by the house &mdash; I made your uncle a casserole and he isn't answering.` },
    { speaker: 'Mom', text: `Run it over to Larry's for me. He might have work for you. `
        + `Press <span class="dlg-key">M</span> for the map if you forgot the way home.` },
]

/** Larry, once the first job is put away: this card, then RUN_INTRO (the goal, the deed rule, the pay rule). */
export const LARRY_WELCOME = [
    { speaker: 'Uncle Larry', text: `Casserole, huh. Your mom worries. I heard about the burger place &mdash; their loss.` },
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
}
