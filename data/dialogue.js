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

/** Sequence keys for DialogueSystem.play()'s once-per-run gate. */
export const DLG = {
    paperRouteIntro: 'paper-route-intro',
}
