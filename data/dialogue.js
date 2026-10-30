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
 * first day, this is the one place the player is told WHAT THE RUN IS FOR: six good deeds and the
 * expedition camp (FEAT-103). The uncle is the tutorial's voice (FEAT-147). Three cards, no more.
 */
export const RUN_INTRO = [
    {
        speaker: 'Uncle Larry',
        // FEAT-103: {dir} is the camp's true compass direction from the spawn, filled in at run start
        // (main.js _runIntro) from COMPASS below — never a number, so it is safe in this markup.
        text: `Jay. There's an expedition camped up at the {dir} road, looking for a way out of here. `
            + `They take on anyone with <span class="dlg-key">six good deeds</span> to their name. That's your way out too.`,
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

/** FEAT-103: the eight words for a bearing, clockwise from north (0° = −Z, the map's up). */
export const COMPASS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']

/** Sequence keys for DialogueSystem.play()'s once-per-run gate. */
export const DLG = {
    paperRouteIntro: 'paper-route-intro',
    runIntro: 'run-intro',
}
