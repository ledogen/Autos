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
/**
 * FEAT-288 P8 (DEC-426 Q2, owner: "each subsequent message from the same person can just be a card that cycles, but when
 * one person finishes speaking, their card slides out of frame, and when the next person starts speaking, their card
 * slides into frame from the opposite side"). How the card on screen moves from `prev` to `next` (either may be null:
 * nothing up). `side` is where the card now up came in from: -1 left, +1 right. Returns `{ out, in, side }`: the side
 * the old card leaves by (0 = it does not slide), the side the new one enters from (0 = it does not), and the new `side`.
 * The same speaker cycles in place. A card leaves by the side it came in from, so the next speaker enters from the other:
 * sides alternate per change of speaker, not per person. The first card of a showing enters from the left.
 */
export function cardSlide (prev, next, side) {
    if (prev && next && prev.speaker === next.speaker) return { out: 0, in: 0, side }
    const enter = next ? (prev ? -side : -1) : 0
    return { out: prev ? side : 0, in: enter, side: enter || side }
}

export class DialogueSystem {
    /** `phone` (DEC-354): `{ ring, click }`, the two framing cards' words (data/dialogue.js PHONE); see _frame. */
    constructor (phone = null) {
        this._phone = phone
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

    /** FEAT-42: the keys heard this run, for the run save — and back, so a resume replays none of them. */
    seen () { return [...this._seen] }
    restoreSeen (keys) { for (const k of keys) this._seen.add(k) }
    /** Has `key` played this run? (FEAT-147: whether the run opened on the firing.) */
    has (key) { return this._seen.has(key) }

    /** True while a card is on screen. main.js gates the advance key and the HUD on this. */
    get active () { return this._i < this._queue.length }

    /**
     * DEC-359: a card that tells the player to DO something carries `until: '<name>'` (main.js _UNTIL). It holds neither the
     * sim nor the keys: the player plays on under it, and it clears the moment the action is done (main.js
     * _untilTick), never on a click-through. `holding` is "a card is up that freezes the game and eats the press".
     */
    get holding () { return this.active && !this._queue[this._i].until }

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
        this._queue = this._frame(cards)
        this._i = 0
        this._onDone = onDone
        return true
    }

    /**
     * DEC-354 (owner, 2026-11-16): a phone call is framed — "a card that just says phone and then ring ring ring", and
     * "every dialogue that ends with the character on the phone should end with <click>". A card said over the phone
     * carries `phone: true`; each run of them gets the ring card before it, unless its first card is `answered: true`
     * (the call was already going), and a click card in the caller's name after it, unless its last card is
     * `holds: true` (the caller stays on the line into a later script). Built here once, never typed per script.
     */
    _frame (cards) {
        if (!this._phone || !cards.some(c => c.phone)) return cards
        const out = []
        cards.forEach((c, i) => {
            if (c.phone && !cards[i - 1]?.phone && !c.answered) out.push({ ...this._phone.ring, call: 'ring' })
            out.push(c)
            if (c.phone && !cards[i + 1]?.phone && !c.holds) out.push({ speaker: c.speaker, text: this._phone.click, call: 'click' })
        })
        return out
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
