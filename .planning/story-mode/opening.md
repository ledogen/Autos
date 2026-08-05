# Autos — The Opening

*Working design notes. Status: early concept. Downstream of `DESIGN.md`.
Companions: `missions.md`, `run-shape.md`, `spirits-and-pacts.md`, `items.md`.*

**Reconciliation note 2026-07-29:** terminology aligned to DESIGN.md (**spirits**, not sprites —
the naming is still flagged open in `IDEAS.md`). The uncle's dialogue channel is now specified.

**Amendment 2026-08-05 (owner ruling):** the day job does **not** persist. The game opens on the
player being **fired** from the burger joint, and they can never work there or earn from it again.
The income floor is the **newspaper route**, not the grill. The old §"The day job as a hub" said the
opposite and was itself owner-ratified; it has been replaced by §"The firing" and §"There is no
day-job income floor" below. This ruling supersedes it.

---

## Core opening premise

The game opens on the player character stuck in a **mundane, dead-end day job** — the burger joint,
flipping burgers under fluorescent lights. The tone is deliberate boredom: repetition, going nowhere.

This mundanity is the **emotional baseline** for the whole game. Everything that comes later — faster cars, riskier jobs, real freedom — is measured against the drudgery the player starts in. The player should *remember* the grill.

## The firing (the inciting incident)

**The player is fired from the burger joint, and that is where the game starts.** Not a job they
choose to leave, and not one they can go back to: they can **never work there again, and never earn
a cent from it**. The drudgery is established and then taken away in the same beat — the player is
not escaping the grill, they are out on the street without it.

This is what makes the uncle's stack of papers land. The paper route isn't a more exciting option
alongside a safe one; it is the only thing there is.

### There is no day-job income floor

The burger joint is **not a hub and not an income source**. It has no work to take, no wage, no
fallback. Anything that needs a reliable-but-pathetic floor under the economy is the **newspaper
route's** job (see `missions.md`) — that is what the route is *for*, and it is the only thing playing
that role.

The roguelike loop's central arithmetic is unchanged: *bare completion pays nothing*, cruise all day
and you end poorer than you started. The paper route is the floor under that. It guarantees a run
can't dead-end into zero, while paying so badly that leaning on it is always an admission of a bad
day.

### The last paycheck

**Proposed flavour, not yet ratified:** the final paycheck from the burger joint lands a couple of
days into the game — a small one-off sum arriving after the player has already started driving. It
is a closing door, not a floor: money from a life that has ended, and the last of it.

Design value: it puts a tiny windfall in the early economy at the exact moment the player is learning
that the route pays badly, and it dates the firing rather than leaving it as backstory.

### The burger joint afterwards

It stays in the world as a **POI and a landmark** (FEAT-60) — sited so the player keeps driving past
what they left. It may source a mission at some later point, for something entirely unrelated to
working there. What it will never be is employment or income.

## The uncle

The paper route comes from **the player's uncle**, who runs the delivery service. He is the first person who gives the player a reason to drive.

His structural jobs:

1. **He is the way out after the firing.** The escape isn't a menu unlock, it's a family member with a stack of papers and nobody to run them — arriving when the player has nothing else.
2. **He is the progression gate for the paper route.** Better routes — longer, denser, further out, better paying — are not unlocked by an XP bar. They're unlocked by **him**, because the player has proven they can run the ones he already gave them. Access is a relationship, not a level.
3. **He is a fixture.** He stays available. Since the grill does not, he is the early game's *only*
   constant — which is the point: the one thing the player can rely on is a person, not a job.

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

**Ratified by the project owner:** the dead-end day job opening, mundanity as emotional baseline, the uncle as the source of paper missions, and route access progressing through the uncle. Tone remains open.

**Ratified by the project owner 2026-08-05, superseding the above:** the game opens with the player
being **fired** from the burger joint; they can never work there or earn money from it again; there
is **no day-job income floor** — the newspaper route is the income floor; the burger joint may source
an unrelated mission later. (The prior ratification of "the day job persisting as a hub/income floor"
is withdrawn.)

**Proposed here, not ratified:** the reasoning for person-gated over stat-gated progression, the uncle-as-contrast-to-sprites framing, the suggestion that he stay mundane for later narrative use, and **the last paycheck arriving ~2 days in** (owner's own suggestion, floated not ruled).
