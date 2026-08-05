// FEAT-61 — the character channel.
//
// DESIGN.md ratified the shape and it is deliberately small: **sequential cards, no dialogue
// options.** Dialogue in this game is RECEIVED, not negotiated — a guy with a van tells you how the
// job works and you listen. There is no branching, no reply, no affinity, and adding any of those is
// a design act that goes through the bible first, not a feature that creeps in through this file.
//
// Renderer-agnostic, the mission-panel/camp.js pattern: this module owns the queue and the
// once-per-run bookkeeping, main.js owns the DOM. It imports nothing.

/**
 * Card text may carry <span class="dlg-key">F</span> to colour a control glyph. THE CLASS IS THE
 * WHOLE MECHANISM — there is no markup parser and there must never be one; cards are authored
 * constants in data/dialogue.js, never player input, so the renderer can set innerHTML directly.
 */
export class DialogueSystem {
    constructor () {
        this._queue = []
        this._i = 0
        this._onDone = null
        // RUN-LAYER (SM-INV-12). A new run hears every briefing again, exactly like it re-earns the
        // route tier and the wallet — a run is a fresh start for the character, not just the truck.
        // Cleared by start(), the same shape EconomySystem.start() uses.
        this._seen = new Set()
    }

    /** Begin a story run: nothing seen, nothing playing. Called beside economySystem.start(). */
    start () {
        this._seen.clear()
        this.abort()
    }

    /** True while a card is on screen. main.js gates the advance key and the HUD on this. */
    get active () { return this._i < this._queue.length }

    /** The card to draw, or null. `{ speaker, text }` — text is trusted authored markup. */
    current () { return this.active ? this._queue[this._i] : null }

    /** 1-based position and length, for a "2 / 2" affordance. Null when nothing is playing. */
    progress () { return this.active ? { n: this._i + 1, of: this._queue.length } : null }

    /**
     * Queue a sequence and run it, unless `key` has already played this run.
     *
     * The seen-gate is the tutorial rule (owner): the second paper route must not re-explain the
     * throw. `onDone` fires either way — immediately when suppressed — because callers use it as
     * "the briefing is over, start the mission" and a skipped briefing still has to start it.
     *
     * A `key` of null always plays and is never recorded (one-off lines).
     */
    play (key, cards, onDone = null) {
        if (key !== null && this._seen.has(key)) { onDone?.(); return false }
        if (key !== null) this._seen.add(key)
        if (!cards?.length) { onDone?.(); return false }
        this._queue = cards
        this._i = 0
        this._onDone = onDone
        return true
    }

    /**
     * Advance one card; fire onDone after the last. This is the ONLY way a sequence ends normally —
     * press-any-key, per the brief.
     */
    advance () {
        if (!this.active) return
        this._i++
        if (!this.active) {
            const done = this._onDone
            this._queue = []; this._i = 0; this._onDone = null
            done?.()          // last, so a callback that starts another sequence isn't clobbered
        }
    }

    /**
     * Drop the sequence WITHOUT firing onDone — leaving story mode, not finishing a briefing.
     * The seen-flag stays set: you were shown the cards, and re-entering shouldn't replay them.
     */
    abort () {
        this._queue = []; this._i = 0; this._onDone = null
    }
}
