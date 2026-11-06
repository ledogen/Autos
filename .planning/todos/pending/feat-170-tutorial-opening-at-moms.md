---
id: FEAT-170
type: feature
status: open
severity: major
opened: 2026-11-05
source: owner, 2026-11-05, driving FEAT-147 on :3731 — "opening is good for now. will definitely want a rewrite before alpha release… my proposal (ticket dont attempt to one shot)" (quoted in full below)
relates: FEAT-147 (the opening it rewrites; its firing scene stays), FEAT-169 (hunger: the breakfast beat needs it), FEAT-164 (camp), opening.md, mom's house POI (poi.js nearSpawn slot)
---
lane: A

# FEAT-170: The opening becomes a skippable tutorial evening at mom's

**Stage it. Do not one-shot it** (owner). Plan the stages in this ticket, get sign-off, then build one stage
per landing.

## The owner's proposal, verbatim

> you get fired at 6pm. same mom text. mission is already active to go to moms. here we give the controls
> tutorial, how to park, check the vehicle diagnostics, etc. clock is frozen. no damage. free reset to road
> (prompt appears when offroad). upon arrival you get no pay. you use the camp menu to sleep at moms. there is
> some dialogue then you sleep. it says something along the lines of "you can always rest at moms. its better
> than sleeping in the truck." brief overview of camping. and we can give context on the sleep mechanic here.
> in the morning she feeds you giving us a chance to talk about the food mechanic. then you have a job to
> deliver the casserole to larry.
>
> optionally the player can skip straight from the cutscene to leaving moms by holding the map button or pause
> or something. that way the tutorial is optional every playthrough but not obstructive. every playthrough
> starts the first paid job as a delivery to larry's.

## The shape, as read from that

1. **The firing at 6 pm.** FEAT-147's scene stays. The clock starts at 18:00, and mom's text follows as today.
2. **The drive to mom's is the tutorial.** It is an active, unpaid mission. On the way the game teaches the
   controls, parking, and the vehicle diagnostics.
   - The clock is frozen and there is no damage.
   - A free reset to the road is offered whenever you're off it (a prompt).
3. **Evening at mom's.** You arrive with no pay and sleep through the camp menu. Before you sleep: some
   dialogue, a brief overview of camping, and the sleep mechanic. "You can always rest at mom's. It's better
   than sleeping in the truck." Mom's house is a place you can always sleep.
4. **Morning.** Mom feeds you, which is the food / hunger beat (needs FEAT-169).
5. **The first paid job:** deliver the casserole to Larry. Every run starts its paid work here.
6. **Skippable every run.** A hold on one button skips from the end of the firing scene to leaving mom's in
   the morning, already fed, with the casserole job active. Use the map or pause button, the owner's
   suggestion; the hold must show a visible prompt, since hidden gestures are ruled out. The tutorial is
   optional but never in the way.

## Found on the same drive (a FEAT-147 bug, fixed before Lane A lands)

"i didnt have a job after the opening (no gps top bar not populated). mom did have a mission i could
optionally accept." FEAT-147's opening should hand you the courier run TO Larry as an active job. It
didn't. This is fixed in FEAT-147 now, not here.

## Acceptance

- [x] A staged plan in this ticket (stages, what each lands, what the owner checks at each), signed off (2026-11-06).
- [ ] Each stage lands on its own, behind cdp-smoke's opening step, with the skip path smoked too.
- [ ] Every run's first PAID job is the casserole to Larry, with or without the tutorial.
- [ ] The owner plays it through once with the tutorial and once skipping it.

## Staged plan — 2026-11-05 (Lane A; FOR SIGN-OFF, nothing built)

Four stages. Each one lands on its own, behind cdp-smoke's `opening` step plus a skip-path step. Every word on
a card is a PLACEHOLDER the owner rewrites (FEAT-148). FEAT-169 hunger is built (feature/run-shape 44badad6),
so the breakfast beat can feed you.

**Stage 1 — the evening's skeleton.** The opening run starts at 18:00, and the firing and mom's text play as
today. Her call then gives you an unpaid, guided "head home" leg to her house: the HUD line and the GPS, as
FEAT-147's first job has now. It is not a board offer, so there is no pay, rank or result card. Parked at
hers, her existing sleep card opens, its timer preset to wake at 07:00. You wake with the casserole job in
hand, taken at her house, so it starts from her start zone like any job from a pad. **The skip path lands in
the same place:** opening off means you start at mom's at 07:00 with the casserole in hand. So every run's
first paid job is the casserole from stage 1 on.
*Owner checks:* one drive with the opening on, and one start with it off.

**Stage 2 — hold to skip.** Through the firing and the evening, a visible prompt says "hold M to skip the
tutorial" (button TBD, Q2). Holding it for 1 s `[DEFAULT]` lands you where stage 1's skip does: at mom's, at
07:00, fed, casserole in hand. It is not a hidden gesture: the prompt is on screen the whole time.
*Owner checks:* skip at the firing, mid-drive, and at mom's door.

**Stage 3 — the safe drive.** While the "head home" leg is active:
- The clock is frozen, and so are energy and hunger.
- There is no damage and no wear.
- Whenever you are off the road, a prompt offers a free reset to it, using the existing reset to the nearest
  road with its cost waived.

These all end at mom's door.
*Owner checks:* crash it, drive off the road, reset.

**Stage 4 — the lessons.** Cards go on the existing `_tut` queue, which holds the sim while a card is up:
- **On the drive:** the controls, how to park (the brake latch), and the vehicle diagnostics (Tab / the damage
  screen).
- **At mom's in the evening:** you can always rest at mom's ("better than sleeping in the truck"), a brief
  overview of camping, and the sleep mechanic.
- **In the morning:** mom feeds you, which is `eat()` plus the food card. Then she hands over the casserole.

FEAT-147's later first-use cards stay as they are: the offer, the rank bar, the first pump, the first service
screen, the sleepy stage and the requisition. So does Larry's welcome after the casserole.
*Owner checks:* one full play-through with the tutorial, one skipping it (the ticket's acceptance).

**Questions for the owner, before stage 1:**
1. **Day 0 or day 1?** Does the evening count as day 1 of the run, so the morning job is on day 2 and the
   tutorial costs a run-day? Or is it a "day 0" before the run's day 1, which matches the skip path and
   today's runs? Recommended: **day 0**. Technical cost: the board's clock runs negative for the evening.
   It has no offers to time then, but it needs a check.
2. **Skip button:** map (M / pad's map button) or pause? Recommended: **M**, as you suggested. Pause already
   opens a menu.
3. **The setup page's opening toggle:** keep it (skip = no firing at all), or retire it once stage 2's hold
   exists, so the firing always plays? Recommended: **keep it until stage 2 lands, then retire it**, because
   it is two cards and Enter steps them.
4. **The evening drive's length:** the joint is sited anywhere, so joint → mom's can be 2–3 km on a wide seed.
   This is the open "joint→Mom's distance" call: re-site the joint near spawn (it reshuffles every seed's
   POI layout), or accept it as the tutorial's length?

## Owner's answers — 2026-11-06 (the tracker page's feat170-plan, "my answers in the note") — SIGNED OFF

> "all approved. we need to also explain the map. after waking and the player is in the truck they are prompted
> to look at mom's mission card which shows the route on the map. then it can say "you can always open the map
> with M/select". larry already has some text explaining the expedition camp. we should keep that and it can
> play after the player delivers the casserole"

1. **Day 0.** The evening is day 0 from 18:00; the run's day 1 starts at the morning wake.
2. **Hold M to skip** (the pad's map button, select).
3. **Keep the setup page's opening toggle until stage 2's hold lands, then retire it.**
4. **Accept the long drive.** The joint stays where it is sited; the tutorial is as long as the drive.

**Two beats added to the plan:**

- **The map beat (stage 4, the morning).** You wake in the truck at mom's. A card prompts you to look at mom's
  mission card, which is her parked offer panel; it shows the casserole's route on the map. A second card then
  says "you can always open the map with M/select" (placeholder words). **This settles a stage 1 detail:** on
  the tutorial path the casserole is ON OFFER at mom's when you wake, not in hand, so there is a card to point
  at. The skip path still starts with it in hand.
- **Larry's expedition-camp text stays** (`RUN_INTRO`, after `LARRY_WELCOME`). It plays once the casserole is
  put away, as it does today. From stage 1 on that is true on BOTH paths: a skipped run no longer plays it at
  go-live.

**Stage 1 as built from this** (supersedes its paragraph above where they differ):

- A new run with the opening on starts at **day 0, 18:00**, parked at the joint. The firing plays as today.
- Mom's call ends with **the evening leg**: no job and no pay. The GPS and the HUD line take you to her house
  ("x km to Mom's · park there to sleep"). Other givers' pads don't answer while it is on, so the casserole stays
  the run's first paid job.
- Parked at hers, her sleep card opens. The timer is preset to wake at 07:00.
- **Any sleep ends the evening**, at hers or at a camp elsewhere, and so does reaching 07:00 awake. The
  casserole is then posted at mom's. Her pad answers like a giver's: park there and her card opens, with the
  route on the map.
- **The skip path:** a new run with the opening off starts at mom's, day 1 07:00, with the casserole in hand
  (staging in her start zone).
- **On both paths,** Larry's welcome and his camp text play once the casserole is put away. The other
  first-use cards stay tutorial-only.
- Words are PLACEHOLDERS (FEAT-148): mom's call now sends you home for the night; the casserole is the
  morning's.

## Built — stage 1 (2026-11-06, feature/run-shape, Lane A; 2730c832, 8be8ecde, 4e7b400d)

- **`src/day.js`** `start(day = 1, hour = dayStartHour)`. The opening run calls `start(0, 18)`, so the evening's
  `clockH` runs from −6 to 7. Day 0 needs nothing else: `dayTier` clamps below day 1, the FEAT-168 `minDay`
  check reads day 0 from a negative `bornH`, and the midnight overlay adopts the first day it sees (0), so
  the night at mom's drops no "supplies are drying up".
- **`src/main.js`** (the opening section):
  - `_eveningLeg()` = the firing seen and `f0` still closed. It keeps no state of its own, so a save made
    mid-evening resumes into it (seen-keys are set when a sequence starts, so a mid-firing save does too).
  - In the evening, the GPS shows `_homeGuide()` (planned once from the joint, re-planned after a resume),
    the HUD reads "x km to Mom's · park there to sleep", and `_poiInReach` returns nothing.
  - The sleep timer is preset to `round(7 − clockH)`. Left at the preset, it wakes at 07:00 sharp. Any
    sleep (`_sleepAtCamp`) or reaching 07:00 awake (the run-HUD poll) calls `_endEvening()`, which runs
    `openFirst`. Her pad then answers like a giver's.
  - The skip: `_seatAt(mom)`, then at go-live `openFirst` + `_takeFirstJob` once the seat lands. The job
    stages in her start zone.
  - `_tut(…, always)` lets Larry's welcome + RUN_INTRO play in a skipped run too.
  - FEAT-147's `approachGuide` is gone; nothing takes the casserole away from her pad any more.
- **`data/dialogue.js`** MOM_CALL: placeholder words. She sends you home tonight; the casserole is the
  morning's.
- **cdp-smoke:** `story` is now the skip path. It checks the run starts at mom's at 07:00 with the job
  staging and no card, abandons the job, then checks Larry's welcome and his camp text (with its
  direction). `opening` checks the firing at day-0 18:00, the job-free evening (HUD + GPS), her sleep
  card preset to 07:00 and waking at 07:00 sharp with no midnight overlay, the casserole posted at the
  wake, and the casserole taken from her pad and staging. The midnight + hunger checks follow as before.
  `window.__gps()` is the new dev handle it reads.

  The `endings` step's win run puts the casserole down first: a win waits for no active job, and in play every
  requisition line is a job, so the casserole is long done by then.
- **Proof:** cdp-smoke **PASS, 23 steps, zero console errors** on the branch (merged with main bc7016e5);
  npm test affected 48/48 green.

*Owner checks (stage 1):* one new run with the opening on (fired at 6 pm, drive home, sleep at mom's, take
the casserole in the morning) and one with it off (start at mom's with it in hand; Larry after the drop).

## Built — stage 2 (2026-11-06, feature/run-shape, Lane A; 30e08eb5, 319193bb, b5db188e)

- **Hold M (the pad's View) for 1 s `[DEFAULT]` to skip.** A prompt sits bottom-left the whole time the opening
  can be skipped (`#skip-hint`, `_eveningLeg()`): "hold M to skip the tutorial" (PLACEHOLDER words), with its
  key as a keycap (View on the pad). A 2 px `--accent-system` bar fills over the hold.
- **A tap still opens the map.** While the opening can be skipped, M no longer toggles the map on the press: a
  release under the second opens it, the hold skips. While a card is up a tap does nothing, and M never
  advances a card. On the pad, View sends M down on the press and up on the release (`pad.skipHold`). Its
  1 s hold skips the opening instead of resetting the truck; the D-pad → hold and R still reset.
- **The skip (`_skipOpening`)** drops whatever card is up and the firing's camera, closes mom's sleep card if
  open, sleeps the night at hers to 07:00 (`daySystem.sleep`: energy, the meal), posts the casserole, seats the
  truck on her pad and puts the casserole in hand. This is the stage-1 skip path, now reached by the hold.
- **No first-use cards after a skip:** `DLG.skipped` joins the seen set, and `_tut` checks it. Larry's welcome +
  camp text still play after the casserole.
- **The setup page's opening toggle is retired** (owner 11-06): its row, its button and `_settings.opening`
  are gone. Every new run opens on the firing.
- cdp-smoke: `story` holds M through the firing (a real 1.3 s key hold) and lands at mom's with the casserole.
  `opening` taps M in the evening: the map opens and closes, and the evening stays on. `endings`' new runs
  skip the same way. pad-e2e no longer looks for the opening row.

## Built — the word stream + blip (2026-11-06, 2917fe6e; owner, feat120-blip)

Not a FEAT-170 stage, but it rides the same dialogue: cards type in a word every 80 ms `[DEFAULT]` (laid out
whole, words hidden, so nothing reflows). The first press, click or pad A fills the card; the next turns it.
One blip plays when a card is full (`result-audio.js playBlip`, pitch per speaker `[DEFAULT]`). Recorded in
FEAT-120's "Dialogue text blips" entry. Smoke 23/23.

## Built — stage 3, the safe drive (2026-11-06, de7c6b82)

While `_eveningLeg()` is on:
- the fixed step skips `daySystem.update`, so the clock, energy (and with it blinks and dozes) and hunger hold;
- it skips `damageModel.step`, so there is no wear, no impact damage, no puncture and no fatal crash (engine
  heat holds too);
- R (the pad's D-pad → hold; View is the skip in the opening) runs `_resetToRoad`: onto the nearest road point
  facing the truck's way along it (`roadSystem.queryNearest` + the map teleport's `_pickRoadDir`). The spawn
  re-seat is skipped.
- The evening's HUD line adds "off the road · R puts you back on it" (PLACEHOLDER words) whenever the truck is
  off the paved ribbon. `keycap(label, pad)` gained a pad override so the hint shows D-pad → and not View.

All of it ends at mom's: the sleep (or the skip) ends the evening leg. cdp-smoke `opening` checks that the
clock holds over 2 s of sim, and that a truck seated 25–45 m off the road sees the hint, presses R, and lands
within 5 m of the road with the hint gone. Affected gates 8/8.
