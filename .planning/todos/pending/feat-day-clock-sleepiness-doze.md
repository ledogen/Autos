---
id: FEAT-47
type: feature
status: open
opened: 2026-07-29
severity: major
source: roadmap pass 2026-07-29 — the SM-1 gate
relates_to: >
  story mode SM-1 (.planning/story-mode/MILESTONES.md — "The Day"), DESIGN.md "The day and the clock"
  (SM-INV-1 doze-is-not-a-fail-state, SM-INV-3 no rendered countdown, SM-INV-6 camping, SM-INV-5
  wear=f(time,intensity)), run-shape.md (24-min days RATIFIED), sky.js SKY_CYCLE (time-of-day
  substrate, exists), FEAT-45 (dispersed camping areas), FEAT-37 (fishing — consumer),
  spirits-and-pacts.md #01 The Night Owl (tired-hours ledger, doze contact)
blocks: >
  the paper route (coverage mission — its budget IS the day), camping, fishing (FEAT-37), coffee,
  wear-as-f(time), The Night Owl, the Innkeeper's streak, and every mission type whose cost is time
note: "THE SM-1 GATE. src/ currently has par.js + mission.js (the wager) but NO day: grep finds no
sleepiness, no doze, no camping anywhere. This is the single dependency under most of story mode, and
it is cheap because SKY_CYCLE already drives time-of-day. Build the clock, not the economy."
---

# FEAT-47: The day clock — sleepiness + doze

## Context

Story mode's clock is **the day**, and it does not exist. `src/par.js` and `src/mission.js` already
implement the par economy (FEAT-29 + the beta mission harness), so the game can measure how hard you
drove — but there is nothing for that to press against. Per `.planning/story-mode/MILESTONES.md`,
SM-1 is the gate before SM-2's economy means anything, and a roadmap pass on 2026-07-29 confirmed it
is the blocking dependency under the paper route, camping, fishing, coffee, time-based wear, and the
Night Owl spirit.

**The substrate is already here.** `sky.js` exports `SKY_CYCLE` and drives time-of-day; this ticket
adds the run's *state* on top of it (day counter, sleepiness, doze), not a new rendering system.

**Scope discipline: build the clock, not the economy.** No currency, no XP, no wear model, no mission
changes. Those are SM-2/SM-3. The exit criterion is a *felt* day.

## Design constraints (from DESIGN.md — the invariants win)

- **SM-INV-1 — the doze is NOT a fail state.** It hands a mountain road to a driver with their eyes
  shut and lets the physics decide. It must never kill directly; death stays crash-or-breakdown.
- **SM-INV-3 — no rendered countdown, anywhere.** Sleepiness is read off *eyelids*, not a meter. The
  player learns "I am N km from anywhere I'd want to wake up" from the yawns, not a number. A debug
  readout behind the lil-gui panel is fine; a HUD gauge is not.
- **24-minute days [RATIFIED 2026-07-29]** (`run-shape.md`) → ~10–15 days per run. Not 24–48; the
  range was settled at the short end. **The clock therefore runs 60×** — one real minute is one
  in-game hour, one real second is one in-game minute. Useful sanity check when tuning the curve:
  "an hour of tired driving" is *sixty seconds* of play, and a truck holding 60 km/h covers one
  kilometre per in-game hour.
- **Coffee is a loan** — alert now, sleepier earlier tomorrow. Cost is in a different currency than
  the payout, and it lands *later*.
- **SM-INV-12** — the doze is live-reactive, so it is **flag-gated off in headless gates** (FEAT-26
  sets the precedent). The day clock itself should advance deterministically from a pinned `runState`.

## Scope

1. **Day clock.** 24 real minutes → one in-game day mapped onto `SKY_CYCLE`. A day counter. Day
   boundary is a real event other systems can subscribe to (`runState` advances at day/sleep/mission
   boundaries per SM-INV-12 — never mid-stream, never per-frame).
2. **Sleepiness state, in TWO BANDS** [RATIFIED 2026-07-31 — see DESIGN.md "The day and the clock"].
   Accrues across the waking day, and crosses two thresholds that mean different things:
   - **Sleepy** — the warning band. Yawns, heavy eyelids, **no doze**. The player reads it as *"I am
     N km from anywhere I'd want to wake up"* and goes looking for ground. Responsible play enters
     this band every single day.
   - **Tired** — the danger band. **The doze only happens here.**

   **Where that boundary sits is this ticket's central tuning decision**, and it is not just a feel
   question: every threshold in story mode keyed to "driven tired" (the Night Owl's ledger, the career
   record) is re-derived from it, and a boundary set too early makes a careful player look reckless.
   Expose both the scalar and the current band in the debug panel, not the HUD.
   **Build the accrual rate as `base × phaseMultiplier(timeOfDay)`, not a single scalar.** Cost now:
   one lookup. Cost later: a rewrite. The Night Owl's pact (ratified 2026-07-29 (b),
   `spirits-and-pacts.md` #01) is *exactly* this multiplier inverted — ~0 between dusk and dawn with a
   soft margin at the shoulders, and well above baseline in daylight — so if the phase term exists
   from day one the whole pact is a data change. **It must never touch day length**: the pact is a
   phase shift, not an extension, so nothing about it may reach `SKY_CYCLE` or the day counter.
2b. **The tired ledger — ONE counter: distance driven in the tired band.** Integrate ground covered
   while in the **tired** band only (not sleepy), run-layer, reset on death. No consumer yet. It is
   the Night Owl's summon condition (**~10 km**, single-run) and the source of the career record
   *"longest distance driven tired."*
   **Distance, deliberately, and not hours** [owner, 2026-07-31]: an hours counter fills while parked
   or crawling a meadow at 5 km/h, so it can be farmed in perfect safety. A distance counter only
   advances while the player is actually moving in the dark at a speed that can hurt them — the ledger
   should only tick while the player is exposed to the thing that makes it an achievement.
   Never rendered (SM-INV-3); debug-panel only. A handful of lines now, annoying to retrofit later.
3. **Coffee.** The loan: resets/suppresses sleepiness now, raises tomorrow's starting debt. One
   consumable, priced later.
4. **The doze.** Eyes-close overlay (~400 ms, per DESIGN.md) with **control attenuation** — inputs
   drop, they don't invert or randomize. Periods lengthen and recur more often as sleepiness climbs.
   Flag-gated for gates.
5. **Sleep → next day.** A commit action that advances the clock. **Full camping (SM-INV-6 quality
   scoring, campable-ground gating) is explicitly NOT in this ticket** — a stub "sleep here" that
   advances the day is enough to close SM-1's first half. Camping proper lands with FEAT-45.

## Explicitly out of scope

Currency · XP · the wear/condition model · mission changes · the chat pane · campsite quality
scoring · **the Night Owl himself** — no character, no passenger-seat mesh, no pact, no chat cards.
Only the three substrate pieces he needs — the **two bands** (§2), the **phase multiplier** (§2), and
the **tired-distance ledger** (§2b) — are in scope, and all three are useful to the day clock on their
own terms.

## Open questions (scope in plan mode)

- **Sleepiness curve shape, and where the sleepy→tired boundary sits.** Linear accrual, or
  flat-then-steep? Together these decide how many kilometres of *tired-band* driving a day affords,
  which is what the Night Owl's ~10 km is calibrated against — `spirits-and-pacts.md` #01 states
  outright that its number is a guess about this decision and must be re-derived once the bands exist.
  Second-order but worth deciding here: is the sleepy→tired crossing **signposted** to the player
  (a distinct cue, one time), or do they only learn it happened when the first doze arrives?
- **Does the doze attenuate or fully drop inputs?** "Controls drop" is the bible's phrasing.
  Attenuation is more honest and more frightening than a hard cut; confirm.
- **What the doze renders.** DESIGN.md wants it to eventually show *something* (the Roamer's channel,
  SM-INV-11). For this ticket: a black/fade overlay only. Do not build a story-frame hook yet, but
  don't design one out either.
- **Is time-of-day already player-visible enough** to read "the light is going," or does the last hour
  of the day need a stronger visual cue? The paper route's budget depends on this being legible.
- **Where does the day clock live** — a new `src/day.js`, or state on `StorySystem` (`src/story.js`)?
  Story-mode-only for now either way; Free Roam must be unaffected.

## Acceptance

- A 24-minute in-game day advances the sky through a full cycle and increments a day counter.
- Sleepiness accrues over the day and crosses **sleepy** (warning, no doze) then **tired** (dozes
  begin, lengthening and recurring as it climbs). The two bands are distinguishable in play, not just
  in the debug panel.
- **Tired-band distance accumulates as a run-layer counter** and resets on death. Debug-readable only.
- **A doze while driving is frightening and survivable** — the truck is handed to the physics for
  ~400 ms and the player recovers or doesn't. No direct kill (SM-INV-1).
- Coffee suppresses sleepiness now and makes the next day start worse.
- **No countdown, meter, or clock anywhere in the HUD** (SM-INV-3). Debug-panel readouts only.
- A stub sleep action advances to the next day.
- **The exit criterion, restated from MILESTONES:** a player naturally plans their day around getting
  somewhere sleepable, and dozing on a mountain road is terrifying.
- Headless gates unaffected: the doze is flag-gated off, the day clock advances from a pinned
  `runState`, and no existing gate regresses.
