# Autos — The Opening

*Working design notes. Status: early concept. Downstream of `DESIGN.md`.
Companions: `missions.md`, `run-shape.md`, `spirits-and-pacts.md`, `items.md`.*

**Reconciliation note 2026-07-29:** terminology aligned to DESIGN.md (**spirits**, not sprites —
the naming is still flagged open in `IDEAS.md`). The uncle's dialogue channel is now specified.

---

## Core opening premise

The game opens on the player character stuck in a **mundane, dead-end day job** — flipping burgers, working a convenience store register, or similar. The tone is deliberate boredom: fluorescent lights, repetition, going nowhere.

This mundanity is the **emotional baseline** for the whole game. Everything that comes later — faster cars, riskier jobs, real freedom — is measured against the drudgery the player starts in. The player should *remember* the grill.

## The day job as a hub (not just a cutscene)

Rather than being a one-off intro, the day job persists as a **hub / income floor**:

- A reliable but pathetic source of money.
- A place the player can always fall back to.
- A constant reminder of what they're trying to escape.

This makes the first taste of driving feel like real progress, not just a menu transition.

It also does quiet economic work. The roguelike loop's central arithmetic is *bare completion pays nothing* — cruise all day and you end poorer than you started. The day job is the floor under that. It guarantees a run can't dead-end into zero, while paying so badly that taking it is always an admission of a bad day.

## The uncle

The paper route comes from **the player's uncle**, who runs the delivery service. He is the first person who gives the player a reason to drive.

His structural jobs:

1. **He is the bridge out of the day job.** The escape isn't a menu unlock, it's a family member with a stack of papers and nobody to run them.
2. **He is the progression gate for the paper route.** Better routes — longer, denser, further out, better paying — are not unlocked by an XP bar. They're unlocked by **him**, because the player has proven they can run the ones he already gave them. Access is a relationship, not a level.
3. **He is a fixture.** Like the day job, he stays available. The early game's two constants are the grill and the uncle.

### Why routing progression through a person rather than a stat

The rest of the game's progression is impersonal by design: XP unlocks regions, par comes from road geometry, wear comes from physics. Nothing negotiates with the player.

The uncle is the exception, and he should be the *only* early one. A person handing you a better route reads as trust earned. The same unlock delivered as "Delivery Skill Lv. 3" reads as a grind bar, and it retroactively makes the paper route feel like a farming activity rather than a job.

This also sets up the spirit system by contrast. Spirits watch behavior and intervene without being asked. The uncle is the mundane version of that relationship — someone who notices how you drive and adjusts what he offers you — introduced *before* anything supernatural does the same thing. By the time the first spirit makes a bargain, the player already understands the grammar of it.

**His channel is the chat pane** — sequential cards, no dialog options, dialogue received rather than
negotiated. That is the *character* channel and it is deliberately not the world-story channel
(SM-INV-11). The Roamer, by contrast, arrives through staged in-world beats, the doze, and parameter
states. So the player learns the mundane channel from an entirely ordinary person before the
supernatural one ever opens. See `missions.md` for the full pairing.

### Keep him mundane

He is not a spirit and should never behave like one. He has no domain, no ledger, no pact. He is a guy with a van and a route list.

That mundanity is an asset the horror layer will want later. "Missing people" is already a worldgen parameter state. The most legible person to notice the absence of — or the absence of — is the one the player has been taking work from since minute one.

*(No decision made here. Flagging that the opening's most ordinary character is also its most loaded one, and that keeping him boring now is what makes that available.)*

---

## Open question: tone

Not yet decided — shapes writing, art, and how absurd missions can get:

- **Straight & gritty** — a real "trapped in a dead-end life" story.
- **Arcade-nostalgic / tongue-in-cheek** — a wink toward the *Paperboy* lineage.

Worth noting the horror layer is easier to land from the gritty end, and easier to make *surprising* from the arcade end.

---

## Provenance

**Inherited from DESIGN.md:** the chat pane as the character channel (RATIFIED 2026-07-16); spirits
as the meta-progression carrier; the Roamer's separate delivery channels.

**Ratified by the project owner:** the dead-end day job opening, mundanity as emotional baseline, the day job persisting as a hub/income floor, the uncle as the source of paper missions, and route access progressing through the uncle. Tone remains open.

**Proposed here, not ratified:** the reasoning for person-gated over stat-gated progression, the uncle-as-contrast-to-sprites framing, and the suggestion that he stay mundane for later narrative use.
