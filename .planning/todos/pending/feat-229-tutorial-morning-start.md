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
Tutorial seed: 1872706826 pinned (DEC-402, supersedes DEC-351) on `land/tut-seed-search-r3`; owner drives it (card
`tutorial-seed-1872706826-drive`). Round 2 (DEC-353..357) is on main.
On `land/tut-round2`: the owner's round 2 (DEC-353) built — phone calls ring and click (DEC-354), Katie's lines
(DEC-355), the peanuts-only snack shelf and the ranch arrival / waypoint (DEC-356, supersedes DEC-346), sleepy after the
tire, the 06:30 alarm, the joint called "work" (DEC-357); BUG-189's fixes ride along. Owner: the placeholder lines (Katie's
snack ask, mom's gas lesson and send-off, the two vibe cards, Katie's camp-made card, mom's pick-up lesson), and whether
mom's in-drive lesson cards are phone calls (DEC-354 leaves them unframed). Earlier look cards stand (`tut-dialogue-look`,
`tutorial-test-drives`, `feat229-same-landing`, the defaults).

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
- [x] DEC-353 built (DEC-354..357): phone frame, Katie's lines, peanuts-only shelf, ranch arrival + waypoint both ways,
  sleepy after the tire (with blinks on the held clock), the 06:30 alarm, "work"; smoke `opening` walks each
- [ ] Owner: round 2's placeholders and the mom-lesson-cards-as-calls question (DEC-354)
- [x] Tutorial seed re-pinned to 1872706826 (DEC-402): data/tutorial.js, the seed gate's census constants, smoke literals
- [x] Owner: drives the tutorial on 1872706826 (card `tutorial-seed-1872706826-drive`)

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

- DEC-353 (owner's round 2): DEC-354 phone calls framed (ring, <click>); DEC-355 Katie's lines; DEC-356 peanuts-only shelf,
  arrival in the ranch's own zone, a camp short of it clears the pin (supersedes DEC-346); DEC-357 sleepy after the tire,
  the alarm at 06:30 (paycheck stamped 07:00), the joint is "work" in the tutorial.

## Open questions
- DEC-354: are mom's in-drive lesson cards (pedals, flat "Was that a bang?", damage, spare, tow, shop, lights, park) calls?
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
- 2026-11-16: DEC-351 pin (lane U, `land/tut-seed-pin`): data/tutorial.js, test/tutorial-seed.mjs constants (re-measured, match the study), test/gates.mjs desc, 3 smoke literals. Smoke finding: the BUG-173 shoulder pick read a flat g=0 from unstreamed height at a real 35 % slope and the truck rolled off; the pick now skips g<1e-9. Smoke boot,story,opening,newRun PASS twice. Shots in wip/tut-seed-pin/.
- 2026-11-16: DEC-353 round 2 on `land/tut-round2` (DEC-354..357; BUG-189). Smoke boot,story,opening,newRun PASS first
  run; card shots `wip/tut-round2/cards/`. Energy at the fix measured −0.42 h (exhausted; no blink could fire in the
  tutorial before). Unverified: the camp-short-of-the-pin path in a browser (logic only), a real pad.
- 2026-11-17: tutorial seed round 3 (lane a, `land/tut-seed-search-r3`, owner: "Which seed minimizes hard driving in the tutorial"). Whole-day
  index on the 7 driven legs (grade > 12 % per 10 %, ×1.5 down, + bends < 20 / 12 m, ×2 steep-and-tight; `wip/tut-seed-search-r3/hard.mjs`,
  score3.mjs) on 86 seeds: pinned 2528 hard m (57th of 71); top 1464815701 665, 1872706826 838, 3615534968 927, 3881445155 995,
  3270310529 1055; no round-2 seed survives. All five pass gate-at.mjs. Card `tutorial-seed-pick-r3` (r2 card moved to answered/).
  Unverified: the index for the ~250 near seeds outside the grade-proxy top 60 (proxy r = 0.83); stream-crossing counts.
- 2026-11-17: DEC-402 re-pin (lane a, `land/tut-seed-search-r3`): data/tutorial.js → 1872706826; test/tutorial-seed.mjs AT/KM/CROW from
  its census line (gate green); smoke reads TUTORIAL.seed, and its BUG-173 shoulder pick now centres on the joint on a 2 m grid (the
  seed's only flat shoulder is 264 m out; the 4 m grid around the truck found none). Walk + sheet: wip/tut-repin/sheet.jpg. Flagged:
  the flat lands on a 17.7 % climb beside a tunnel mouth. Full smoke PASS (wip/tut-repin/smoke.log); run 1 failed once at the DEC-357
  blink check (2 s window; passed in both other runs, the check now prints its state). pad-e2e ALL OK. Unverified: a real drive.
- 2026-11-20: owner, card tutorial-seed-1872706826-drive: "Drove it: good". The seed box is ticked; the ticket stays open for the dialogue boxes. The card also reported "Wrong way. Turn around" showing over the opening's cards on both seeds (not seed-specific); the owner did not comment, no ticket minted by the scribe.

