---
id: FEAT-229
type: feature
status: open
severity: major
opened: 2026-11-15
source: owner, 2026-11-15 inbox — "I just realized a huge glaring oversight with the intro we have the player fired at 7 30 pm and because of the neat continuity hack whereby the tutorial mission takes exactly 24 hours that means the player starts a brand new game at 7 30 pm …"
relates: FEAT-184, FEAT-217, FEAT-180, FEAT-170, DEC-152, DEC-159, DEC-150, DEC-155, DEC-282, src/main.js, data/dialogue.js, test/cdp-smoke.mjs
---
lane: A (tutorial)

# FEAT-229: The tutorial starts the run in the morning

## Next steps
Owner: answer the deep dive `.planning/dives/FEAT-229-tutorial-morning-start.html` (pick a beat order, the firing's time
and cause, the tutorial's clock, where a skip lands). Then lane A writes the new decision records and builds the order.
Seeds come after the beats are settled (owner's order).

## Summary
Today the firing is at 19:30 and the tutorial lasts exactly 24 in-game hours, so free will opens at 19:30: a new player
must sleep at once or drive all night. The owner wants the run to open on a fresh morning (about 06:30 to 07:30), with
every tutorial lesson kept. This ticket re-orders the story beats so that happens. The dive lays out four orders.

## Description
Owner, verbatim (inbox, 2026-11-15):
> I just realized a huge glaring oversight with the intro we have the player fired at 7 30 pm and because of the neat
> continuity hack whereby the tutorial mission takes exactly 24 hours that means the player starts a brand new game at
> 7 30 pm which basically means they have to go sleep immediately or drive in the darkness all night I definitely want
> the run to start with a brand new day because I think that is the most engaging gameplay loop gives you the prettiest
> visuals etc so I would like the game to start in the morning around 6.30 to 7.30 Maybe One option is the player shows
> up to work 30 minutes late and that is cause for the firing. In order to take up the bulk of the day with missions, I
> think we have to rearrange the story beats. Give me some options on how we can keep all the major lessons but have the
> player starting in the morning. One example would be mom has you drop the packet Larry's first, then reminds you to eat
> a snack from your inventory, then She reminds you to go pick up your last paycheck And she realizes that you didn't get
> paid yet. You're low on gas so you fill up on the way there Then maybe you suffer the flat tire tow and sleep at mom's.
> I think this is deserving of a deep dive. Let's settle on the story beats first and then look at seeds afterwards Since
> there's probably a seed that works for anything and it's more important that we build the best story and tutorial flow
> Placeholder lines are totally fine for us to build with for now. I'll touch everything up before the tutorial sign off.

The "exactly 24 h" is DEC-152 (the paycheck's clock goes to 19:30, `FREE_WILL` in `src/main.js`); DEC-159 puts those
24 h on day −1. The 19:30 firing itself is FEAT-180's "Keep dusk opening" (owner 2026-11-07, item 9), which has no record.

## Tracker
- [x] Deep dive: today's flow and its lessons, four morning-start orders, the clock question, a recommendation, the form
- [ ] Owner answers the dive
- [ ] New decision records for the answers (and the superseded ones flipped)
- [ ] The chosen order built (`src/main.js` tutorial stages, `data/dialogue.js` placeholder lines)
- [ ] The `opening` step of `test/cdp-smoke.mjs` walks the new order
- [ ] Tutorial seed re-checked against the new order (after the beats are settled)

## Open questions
- Everything in the dive's form.

## Links
- Deep dive: `.planning/dives/FEAT-229-tutorial-morning-start.html`
- The tutorial as built: FEAT-184, FEAT-217.

## Files
`src/main.js` (the opening, `OPENING_START`, `FREE_WILL`, `_eveningBeats`) · `data/dialogue.js` · `test/cdp-smoke.mjs`

## Log
- 2026-11-15: ticket minted, dive written (lane A). Docs only.
