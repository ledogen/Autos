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
On `land/tut-picnic`: the owner's picnic middle (DEC-345) built — Katie's call at Larry's, mom's gas call, the ranch on a
waypoint, Katie's camp walk-through (DEC-346..348); Billy (DEC-343, DEC-349) in the dialogue. Owner: the placeholder lines
(Katie's snack ask, mom's gas lesson and send-off, Katie's three camp cards) and whether her 17:00 talk keeps its words.
Landed before: the morning-start order (122a606f, DEC-304..308), the owner's dialogue pass (1bf41b62, DEC-320..326) and the seed
gate (f8ffe439). Owner: look cards `tut-dialogue-look` (review the lines; whether story mode's R / pad reset stays for the alpha;
the two agent lines), `tutorial-test-drives` (playtest), `feat229-same-landing` (open; DEC-299/304 may already answer it),
and the defaults (clock held + stamps, $6, tired at night, the skipper's line).

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
- [x] Revision 2 of the dive: played and skipped land at the same time, place and day (DEC-299); four options as beat lists
- [x] Owner answers the dive (revision 2): option 1, errands first, with a note (2026-11-16 08:21 UTC)
- [x] New decision records for the answers: DEC-304..308 (DEC-238, 239, 276, 282 superseded)
- [x] The chosen order built (`src/main.js` tutorial stages, `data/dialogue.js` placeholder lines)
- [x] The `opening` step of `test/cdp-smoke.mjs` walks the new order (green alone); `skipMenus` kept
- [x] The owner's dialogue pass built: Katie (DEC-320), mom's call and no taught reset (DEC-321), Larry's first meeting
  (DEC-322), the snack from a shopping spot (DEC-323), Katie's 17:00 call (DEC-324), the night (DEC-325), the morning and
  Larry's two cards (DEC-326); smoke `opening` updated
- [ ] Owner: the new lines reviewed; story mode's R / pad reset for the alpha
- [ ] Owner: placeholder lines and the defaults (clock held + stamps, $6, tired at night, the skipper's line)
- [x] DEC-345 built: Katie's picnic call at Larry's, mom's gas call, the ranch on a waypoint, Katie teaches the camp (DEC-346..348)
- [ ] Owner: DEC-345's placeholder lines, and Katie's 17:00 talk now in person (DEC-347)
- [x] Tutorial seed re-checked against the new order (`test/tutorial-seed.mjs`, DEC-304's legs)

## Decisions
- DEC-299 (owner, 2026-11-15/16): the tutorial is 24 in-game hours, fired about 07:00, free will about 07:00 the next
  morning; played and skipped runs enter free will at the same time of day and the same place (and, DEC-159, day).
- DEC-304: option 1, errands first (supersedes DEC-239). DEC-305: mom's errand on the firing day, her hand-over line
  (supersedes DEC-238). DEC-306: mom's money covers food and, unspoken, gas; $6 [DEFAULT] (supersedes DEC-276).
  DEC-307: the firing never mentions the paycheck; mom asks that night, reminds you next morning. DEC-308: DEC-282's
  gates for the whole firing day (supersedes DEC-282).
- Defaults the owner left blank: clock held while driving, stamps 08/09/10/17/21:30 (`TUT_STAMPS`); firing 07:00;
  energy pays the stamped hours (tired on the night drive); mom asks at her door that night.

- DEC-320..326 (owner's dialogue pass, 2026-11-16): Katie the best friend opens the firing on the phone (supersedes
  DEC-146's camp-first-from-mom); mom's call reacts, no reset taught; Larry met at his house offers the route and the
  pack (supersedes DEC-155's route-on-the-call); pumps shut and hidden until the peanuts; Katie's 17:00 call carries the
  camp and the paycheck (supersedes DEC-307); night: slow down, home safe (supersedes DEC-315); morning: Katie reminds,
  Larry's two cards, a skip keeps DEC-236's four (supersedes DEC-236).

- DEC-345 (owner, 2026-11-16): Katie's picnic at the old McGill ranch is the reason for the snack and the camp. DEC-346
  (supersedes DEC-304): the order stands; the drive to the camping area is on a waypoint with "drive out to the old McGill
  ranch", and Katie teaches the camp there. DEC-347 (supersedes DEC-324): her 17:00 talk is in person, same six cards and
  stamp. DEC-348 (supersedes DEC-320): Katie has no model; on the phone except at the camp. DEC-343/349: Billy.

## Open questions
- DEC-347: what Katie's 17:00 talk becomes now she is there in person (its "Hey, it's me." opener reads as a call).
- Everything in the dive's form.

## Links
- Deep dive, revision 2: `.planning/dives/FEAT-229-tutorial-same-landing.html`
- Revision 1 (replaced): `.planning/dives/FEAT-229-tutorial-morning-start.html`
- DEC-299
- The tutorial as built: FEAT-184, FEAT-217.

## Files
`src/main.js` (the opening, `OPENING_START`, `FREE_WILL`, `_eveningBeats`) · `data/dialogue.js` · `test/cdp-smoke.mjs`

## Log
- 2026-11-16: DEC-343: the main character is Billy; the fired-at-7:30 beat is Billy's. Docs only.
- 2026-11-15: ticket minted, dive written (lane A). Docs only.
- 2026-11-16: owner rejected revision 1 (missed same time of day and same place for played and skipped). DEC-299
  written; revision 2 of the dive: four options (joint errands-first, joint trouble-first, mom's, Larry's). Docs only.
- 2026-11-16: built option 1 on `land/feat-229` (records DEC-304..308). Smoke `opening` and `skipMenus` green alone;
  59 affected node gates green. Also fixed `_jointQuiet` (read "07:00 day 1" since DEC-159; now free will's 07:00).
  Unverified: the full smoke (every step after `story` now runs a morning), the seed's legs in the new order.
- 2026-11-16: box 3 on `land/tut-seed-gate`: `test/tutorial-seed.mjs` walks DEC-304's order with main.js's picks; legs 2.00 /
  0.70 / 2.72 / 2.11 / 3.86 (flat at 2.06, tow 0.53 crow) / 0.94 / 2.00 km, 12.5 km, 15 min wheel; TUT_STAMPS read from
  main.js. Gate green. Unguarded: a leg driven (the gate plans, never drives), a beat's trigger in main.js.
- 2026-11-16: DEC-345 built on `land/tut-picnic` (DEC-346..348; Billy per DEC-343/349). Affected node gates 10/10 green;
  smoke boot,story,opening,newRun PASS twice (one run in between failed at "make camp": the seated site re-graded "not
  flat" under load, the risk the step's comment names). Card shots: `wip/tut-picnic/`. Unverified: a real drive to the ranch.
- 2026-11-16: DEC-344 seed search (lane U, study only, nothing changed): 320 random seeds, 290 valid; pick 3590618618
  (route 112 m vs 144, roadside green 0.35 vs 0.18, joint sun clear; mom's wake sun blocked), runner-up 1273834102.
  Sheets + table: wip/tut-seed-search/RESULTS.md (git-invisible, in CarGame-land-gps). Awaits the owner's pick.
