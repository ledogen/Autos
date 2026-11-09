---
id: FEAT-184
type: feature
status: open
severity: major
opened: 2026-11-07
source: owner, 2026-11-07 tracker inbox
relates: FEAT-170 (today's tutorial evening at mom's), FEAT-147 (opening), FEAT-104 (stores: food is buyable),
  FEAT-93/94 (punctures, flats), FEAT-50 (fuel), FEAT-162 (wear and damage)
---
lane: A

# FEAT-184: the tutorial overhaul — alpha

Owner, verbatim: "The tutorial could probably be expanded It doesn't tell you how to change a tire, it doesn't tell
you how to eat food from your inventory, it doesn't tell you how to refuel at a fuel station It doesn't tell you about
wear and damage mechanics, etc. I think we expand it to be a bit longer Maybe you suffer a flat tire and have to change
it Maybe you have to go purchase a new spare or something And I'm not sure all of this will even make sense to happen
in the randomly generated world Maybe we should freeze a seed for this purpose or custom build a world to put all the
points of interest closer together So it's more manageable or something In general, tutorial needs and overhaul I'd
like to mark it to do before alpha"

Listed in MILESTONES.md § Release cuts → Alpha (owner: "before alpha").

## First: a plan with the owner's choices (Lane A)

Nothing gets built before the owner picks. The plan gives each choice with a recommendation:

- **The lessons, in order:** the flat and the spare (and buying one), eating from the inventory, refuelling at a
  pump, wear and damage, and anything else a run needs.
- **The world:** today's random world, a pinned tutorial seed, or a hand-built tutorial world with its points of
  interest close together. Give the cost and risk of each. The no-default-seed rule (CLAUDE.md) covers the
  player's run; a tutorial world is the owner's suggested exception.
- **Its length.**

## Acceptance

- [ ] The plan, answered by the owner.
- [ ] Then: set by the plan.

## The plan — three choices for the owner (Lane A, 2026-11-07)

**What today's tutorial teaches.** The firing at the burger joint, then mom's call. The evening drive home is the
"safe leg": the clock holds and nothing wears. On that drive it teaches the gas, brake and steering, the damage screen
(V) halfway, and parking with the handbrake near hers. Then the night at mom's, breakfast, her job card and the map,
the casserole to Larry's, and Larry's welcome (the deeds, the camp). First-use cards cover the rest the first time it
happens: the pump, the auto shop, sleepiness and camp, the rank bar. Nothing teaches a flat, the spare, eating from
the inventory, a refuel as an action, or what wear does.

**What is cheap to build.** A flat on cue is one flag on one corner (`damageModel.flat`), so a scripted puncture costs
almost nothing in any world. The routes to "the nearest gas station / auto shop" use the planner every job already
uses.

### Choice 1 — the lessons, in order

Recommended order. **New** marks a lesson that doesn't exist today.

*The evening, on the safe leg (no clock, no wear):*
1. **New: the ignition.** Hold I to start (today the first card is the pedals).
2. The pedals, steering and the GPS line (today's).
3. **New: refuel.** The tank starts low and the way home passes the nearest gas station: park at a pump, fill, pay.
4. **New: the flat.** Halfway home a tire goes flat on cue. Pull over and park, open the damage screen (V), read the
   flat corner, fit the spare. This replaces today's halfway card, and it teaches **wear and damage** on the same
   screen: the bars, their colours, what wears and what breaks.
5. Park at mom's and sleep (today's).

*The morning, on the real clock:*
6. **New: eat from the inventory.** Breakfast becomes an action: open the inventory (Tab) and eat one of mom's packed
   lunches, or press its quick key. Today the breakfast is automatic.
7. Mom's card and the map (today's).
8. **New: buy a spare.** You are riding on your spare. Her card sends you by the nearest auto shop on the way to
   Larry's: park in the bay, buy a mounted tire (the shop card already explains the shop).
9. The casserole to Larry's, and his welcome (today's).

The first-use cards stay for everything after: the job board, the rank bar, a store, camp, the camp's requisition.

*Alternatives:* put the flat on the morning drive instead (real stakes, real clock); drop the spare purchase and leave
it to the shop's first-use card (shorter); add a store stop for food (FEAT-104 made food buyable).

### Choice 2 — the world

| | **(a) The run's own world** (recommended) | **(b) A pinned tutorial seed** | **(c) A hand-built tutorial world** |
|---|---|---|---|
| What it is | The tutorial plays in the random world the run uses. Its stops are whatever is nearest: the nearest pump, the nearest auto shop. | One fixed seed, chosen because its stops sit close together. Every tutorial player gets that world. | An authored little map: its roads, ground and places laid by hand. |
| The player learns | Their own home: mom's, Larry's, the roads they will drive all run. | A world they leave. The run is a different world, so mom's and Larry's move. Or the tutorial world *is* the run, and every player who takes the tutorial plays the same world. | A world they leave, the same as (b). |
| Cost | Moderate. The scripted flat; routes via the nearest stops; the new cards; a census and a gate (like the casserole's) that every stop plans within a distance budget on random seeds. | Moderate. Pick and pin a seed, plus a gate on its distances. The story opening has to choose: it plays twice, or only in the tutorial world. | Large. The world is procedural end to end (roads routed, ground carved, places sited on pads). An authored world needs its own roads, ground and placement, a loader, and upkeep every time the world systems change. Weeks, not days. |
| Risk | The distances vary by seed. Some seeds may put the pump or the shop far off. The census measures it; past a budget, that lesson falls back to its first-use card. | Every world-generation change reshuffles it. BUG-121 moved every region once today, and BUG-131 moved houses. The gate catches it, and then a new seed has to be picked. | Highest. A second world to keep working. |
| The no-default-seed rule | Kept. | Your exception. | Your exception. |

**Recommendation: (a).** It teaches the world the run is played in, keeps one world, and needs no new world pipeline.
The scripted flat and the "nearest stop" routes make it manageable on any seed. Before building, I'd measure on random
seeds how far mom's is from her nearest pump and auto shop, so the distance budget is set from numbers.

### Choice 3 — its length

Today's tutorial is roughly 10–15 minutes played, an estimate, not timed.
- **(a) +5 min:** add the ignition, the flat, the refuel and eating (lessons 1, 3, 4, 6). No shop errand.
- **(b) +10 min (recommended):** all nine lessons, the spare purchase included. The refuel and the shop are stops on
  drives the tutorial already makes.
- **(c) A full first day:** (b) plus a store stop and a night at camp.

The hold-M skip stays (owner, 2026-11-06). The words on every new card are the owner's (FEAT-148); placeholders until then.

## Owner, 2026-11-07 (feat184-plan + inbox)

feat184-plan, verbatim: "I like the suggestions. I think we should try to make the tutorial a humorous story about the
main character having the worst day ever. I think it could be comedic that you get fired from your job, start driving
home, get a flat tire, Change it yourself, but the spare is also flat Then have to use the recovery menu to call a tow
truck Since so much time passes you have to drive home in the middle of the night, and it's dark and dark, etc.
Definitely still work in those lessons that you had in there i.e. Starting the engine GPS getting gas Damage screen
Buying a new spare Etc"

Inbox, verbatim: "Additional thoughts on the tutorial. Skipping the tutorial should completely clear it. For example, I
thought it was really slick that the first time a rank timer appears, we explain what it is, but it appeared after I
had already skipped the tutorial by canceling mom's first mission. And it's unacceptable to show it to a player who's
seen it before, who intentionally wanted to skip the tutorial. This ties into my thoughts about making the tutorial a
self-contained session. I think we might also allow players to check an option in settings to always skip the
tutorial. Or even after the first time you see the tutorial to enable permanent skipping of the tutorial unless you go
into the settings and press something specifically to be able to see the tutorial again. It should only really be
needed once And to supplement it, we'll have a help section that explains the mechanics to the players, but that's a
distant goal"

## The beat sheet — the worst day ever (Lane A, 2026-11-07, from the owner's answer)

The run's own world (choice 2a) and about +10 minutes (choice 3b), per the owner. Every card's words are
**PLACEHOLDER**: the words are the owner's (FEAT-148). Each beat names its lesson, its trigger and what it leaves
behind. "Today" marks a beat that exists and stays; **NEW** marks one to build.

| # | Beat (the story) | Lesson | Trigger |
|---|---|---|---|
| 1 | Fired at the burger joint, 6 pm, day 0. *Today.* | — | a new run |
| 2 | Mom calls: come home. *Today.* | — | the firing's cards end |
| 3 | **NEW** The truck won't start until you turn the key. | **The ignition**: hold I | mom's call ends; the engine is off |
| 4 | The road home, the GPS line on it. *Today's driving card.* | **Driving, steering, the GPS line** | the engine catches |
| 5 | **NEW** The gauge is on E, of course. The line runs by the nearest gas station first. | **Refuelling**: park at a pump, hold to pump, pay | the run starts with a nearly empty tank; the evening's GPS goes via the nearest station; the pump's card plays there |
| 6 | **NEW** Halfway home, a tire goes flat. | **The damage screen (V)**: the flat corner, the wear bars and their colours, what wears and what breaks. Then **fit the spare** from there | scripted: a flat on one corner once the truck is past half the drive from the station to mom's |
| 7 | **NEW** The spare is flat too. | **The recovery menu (X)**: call a tow | fitting the spare reveals it (the spare starts flat this run) |
| 8 | **NEW** Towed to the nearest auto shop. Hours go by. | **The shop**: buy a mounted tire and fit it (the service screen). *Buying a new spare.* | the tow lands at the shop; the screen opens on the Parts Shop with a tire on the shelf |
| 9 | **NEW** It's the middle of the night now, and dark. Drive home. | **Headlights** (L), and the GPS in the dark | leaving the shop; the tow and the shop moved the clock to ~midnight |
| 10 | Park at mom's and sleep. *Today.* | **Parking, the handbrake, sleep** | near hers |
| 11 | **NEW** Morning: eat something. | **Eating from the inventory**: Tab, or a quick key, a packed lunch | waking at hers; breakfast is no longer automatic |
| 12 | Mom's card and the map. *Today.* | **The job card, the map** | breakfast eaten |
| 13 | The casserole to Larry's. *Today.* | **The rank bar** (its first-use card) | the job starts |
| 14 | Larry's welcome and the camp. *Today.* | **Deeds, the expedition camp** | the casserole's result card |

**The evening stays safe**: the clock holds while you drive, nothing wears. Beats 7 and 8 move the clock on purpose
(the tow and the shop), which is what makes beat 9 night.

**Defaults for the owner** (`[DEFAULT]` until answered):
- **The tow is free** (mom's friend drives the tow truck). **The tire is paid** from your last paycheck: one real
  purchase in the tutorial.
- **The flat is on the front-left corner**, and the spare is the jalopy's own, flat.
- **The tank starts at an eighth**: enough to reach the nearest station, not mom's.
- **If the nearest station or shop is far** past a distance budget (set by the census in stage 2), that beat is
  skipped and its lesson is left to the first-use card. The story still reads, because the flat and the tow still
  happen.

### Skip, and the setting (the owner's inbox note)

- **Skipping clears the whole tutorial for the run**: every lesson card and every first-use card (the rank bar, the
  pump, the shop, sleep, camp). This is already true in a run (`_tut` checks the skipped mark, and the save carries it).
  The owner's rank-bar card came from cancelling mom's job, which BUG-117 removed.
- **NEW: Settings → "always skip the tutorial"**. When it is on, a new run starts where a skip lands (below), with no
  tutorial cards. It switches **on by itself** after the first tutorial is finished or skipped, and stays in this
  browser. Turning it off in Settings plays the tutorial on the next new run.
- **Where a skip lands — owner, 2026-11-07 22:51Z (tracker inbox, verbatim):** "Skipping the tutorial should actually
  land you at Larry's house with the mission complete I hate having a bunch of extra button clicks and typically I just
  teleport there anyway." **Built (Lane A, 2026-11-08):** a skip (the M / View hold, or the setting) sleeps the night at
  mom's as before (07:00 day 1, fed, her three lunches), then posts the casserole and **completes it on the board**
  (`_deliverFirstJob`: take + complete, no drive, no result card; BUG-117 left it no pay and no deed, so nothing
  settles). The truck is seated on the road in front of **Larry's** (startSeat, BUG-135). It replaced "mom's door, the
  casserole in hand". `[DEFAULT]`s: the clock stays at 07:00 (no drive time spent); **Larry's welcome + the run intro
  still play** — they carry the run's rules and the camp's direction for this seed, and the owner already saw them
  after every casserole. If those cards should go too on a skip, say so: it is one line.

### Stages (each lands on its own)

1. **Skip and the setting**: "always skip the tutorial", on after the first finished or skipped tutorial.
2. **The census**: on random seeds, the distances joint → nearest pump → mom's, and the nearest auto shop from the
   route home. Sets the beat 5 and beat 8 budgets.
3. **Beats 3 and 5**: the ignition card; the low tank; the GPS via the station; the pump lesson in sequence.
4. **Beats 6–8**: the scripted flat; the damage-screen lesson; the flat spare; the recovery menu; the tow to the shop;
   the shop lesson.
5. **Beats 9 and 11**: the night drive (headlights) and breakfast from the inventory.
6. **The smoke's opening step** rewritten for the whole sequence, timed against the +10 minutes.

### Stage 2 — the census (Lane A, 2026-11-07; `wip/feat184/census.mjs`, 12 random seeds, story regions)

| | min | median | max |
|---|---|---|---|
| the drive home, joint → mom's | 0.74 km | 2.85 km | 4.65 km |
| joint → the nearest gas station | 1.03 km | 4.03 km | 7.06 km |
| the detour via that station, over the drive home | 1.06 km | 5.80 km | 7.79 km |
| halfway home (the flat) → the nearest auto shop | 0.79 km | 1.91 km | 2.67 km |
| that shop → mom's | 0.35 km | 1.83 km | 3.21 km |

- **The tow to a shop always fits.** The nearest auto shop is within 2.7 km of the flat on every seed.
- **The station often doesn't fit.** Its detour is longer than the drive home itself on most seeds. With the budget at
  **4 km** `[DEFAULT]` (≈ 3–4 minutes of real driving; the evening holds the clock), 6 of 12 seeds get the refuel beat.
  The rest leave refuelling to the pump's first-use card. Raising the budget to 8 km would bring every seed in, at up
  to ~8 km of extra driving.

## Owner, 2026-11-08 18:27Z (tracker `feat184-look`: "changes") — the tutorial splits off from the run

Relayed by the orchestrator (cargame-c8). Verbatim:

> "My biggest immediate pain for me right now is having to skip the tutorial to go and assess other meaningful feature
> tweaks and updates I think what's in our best interest is to split the tutorial into its own menu option and leave it
> simply as an option for now so I can go and voluntarily test it Then build an intro that plays every single game that
> is easily skippable. Pretty much the intro cinematic plays where Jay gets fired then you drive to moms and sleep. once
> you wake up the player is in the game with free will. For alpha, we'll We have the tutorial play first thing And then
> it will appear as a main menu option thereafter We should enforce the player to play through the basic tutorial To
> clear the tutorial flag This will include all the main functions We should have a map, inventory, recovery screen
> campaign, food, tiredness, shopping, how to change a spare, etc. The goal is that it takes less than 10 minutes for a
> new player. Then we'll give the player the option of going to the main menu and starting their first game However,
> there should be optional content that essentially explains eachmission type and lets you drive through it as it
> gives tips. All of this tutorial content should happen on a fixed seed so we know the exact beats And can make sure
> no objective is too far away and that it plays smoothly. So to reiterate, the flow is brand new player drops into
> the game plays through the mandatory tutorial. This clears the tutorial flag and they have the option of Going back
> to the menu to start a new career game or continuing on with the optional tutorial content to help them better
> understand all of the systems. When they start a new game, there's always an intro cinematic and then a short scene
> setting drive to mom's house she feeds you and sets up the story. and then the player is on their own with free
> will faced with the run. For now, for testing, set the tutorial flag to complete so that I'm not faced with a
> tutorial every time I reload or clear the browser cache. Once you set this up, then I'll be ready to properly review
> the tutorial."

### Built at once — the immediate pain (bd5a6a95, desk edit, NOT YET RUN: low-power hold)

- **A "tutorial" button on the main menu** (`#mm-tutorial`, between "new game" and "settings"). It starts a run that
  plays today's opening, whatever the tutorial flag says.
- **The tutorial never touches the career save** (`_tutorialRun` in main.js):
  - starting it does not delete the saved run;
  - it never autosaves;
  - its pause menu has no "save & exit": its ways out are "main menu" and the towel;
  - if it ends (a fatal crash, the towel), nothing is deleted.
  So the owner can try it and press "continue" on the career run afterwards.
- **Its world** is the URL's `?seed=` when one is pinned (the harnesses use `?seed=6`), else random. The fixed tutorial
  seed waits for the plan below.
- **The tutorial flag starts complete.** The flag is the settings key `skipTutorial`, and its default is now `true`.
  A reload or a cleared cache gives a new game that starts where a skip lands, with no tutorial cards.
  - A stored "no" from the settings page still wins.
  - The owner's browser already has it on, since the first skip turned it on.
- cdp-smoke: the `opening` step now plays from the new button, with the flag left complete, on `?seed=6`. It checks
  that a planted career save comes back untouched and that `__autosave()` refuses. The `story` step turns the flag
  off before it tests the hold-M skip.

### Checked against DESIGN.md, opening.md and the earlier rulings — FLAGGED, not resolved

1. **Mom sets up the story; DESIGN.md and opening.md give that job to the uncle.**
   - DESIGN.md's 2026-10-23 pass, item (5): "the alpha story is three beats: the firing, the uncle (the tutorial's
     voice), the expedition camp".
   - opening.md: the uncle "is the way out after the firing", "the first person who gives the player a reason to drive".
   - Today the uncle is Uncle Larry (data/dialogue.js). His welcome after the casserole carries the run's rules and the
     camp's direction (`LARRY_WELCOME` + `RUN_INTRO`).
   - The note's intro ends at mom's wake with free will, and mom "sets up the story". Larry's beat is not in it.
   - Open: does mom now set up the story? Is the uncle still the way out? Where does the run's goal (the deeds, the
     expedition camp) get told?
2. **Every run's first paid job is the casserole to Larry** (FEAT-170, owner 2026-11-05: "every playthrough starts the
   first paid job as a delivery to larry's"; its acceptance line says the same). The note says free will from the wake.
   Does the casserole stay as the first job (offered, not forced), or go?
3. **Where a skipped intro lands.** 2026-11-07: "Skipping the tutorial should actually land you at Larry's house with
   the mission complete". The new intro ends at mom's at the wake. Does a skip land there (07:00 day 1, fed), or still at
   Larry's?
4. **The skip in the mandatory tutorial.** 2026-11-06: "the hold-M skip stays". 2026-11-07: "Skipping the tutorial
   should completely clear it". The note says "enforce the player to play through the basic tutorial to clear the
   tutorial flag". Read as: the hold-M skip moves to the career intro, and the mandatory tutorial has no skip. Confirm.
5. **The "skip the tutorial" setting** (2026-11-07 inbox: "allow players to check an option in settings to always skip
   the tutorial"). Once the career never plays the tutorial, the setting means nothing. Retire it, or make it "always
   skip the intro"?
6. **A fixed seed.**
   - CLAUDE.md: "there is no default seed"; "every world the player did not pick is random" (owner, 2026-11-05/06).
   - FEAT-184 choice 2 was answered (a), the run's own world, on 2026-11-07. The note reverses that to (b).
   - There is a precedent: FEAT-62's scenarios already pin whole worlds by seed (data/scenarios.js "THE SEED IS THE
     WHOLE WORLD"), behind a gate.
   - So this reads as the owner's own exception: the tutorial is not a game. CLAUDE.md wants a line naming it once
     ruled.
   - Risk: every world-generation change can move the tutorial's places (BUG-121 moved every region once). It needs a
     gate that pins its beats, and a re-pick when that gate fails.
7. **SM-INV-11's constraint (1):** authored beats are "staged in the world, not an abstract cutscene layer". The "intro
   cinematic" stays the in-world camera orbit the firing already uses. Confirm that no cutscene layer is meant.
8. **The release cut of the optional per-mission content.** DESIGN.md's 2026-10-23 pass, item (8): "the alpha is a
   polished demo: little content, but complete". Is a tour of every mission type alpha, or later?
9. **The worst-day story** (2026-11-07: fired → flat → the spare is flat too → tow → the shop → the night drive). It was
   the career opening's. Does it become the mandatory tutorial's story? Read as yes: the lessons it carries (spare,
   recovery, shop) are on the note's list.
- Not conflicts, recorded: the player character is named **Jay** (new; for FEAT-148's words). "recovery screen
  campaign" is read as "the recovery screen, camping". "She feeds you" matches items.md ("the tutorial's night end fed,
  played or skipped, … three packed lunches (mom's)").

### Plan for the rest — to the orchestrator before anything is built (2026-11-08)

Each stage lands on its own. Stage 1 waits on answers 1–3; stages 3–4 on answer 4 and the seed.

1. **The career intro, every new game, skippable.**
   - The firing (today's in-world orbit) → mom's call → the drive to hers → the evening at hers: she feeds you and sets
     up the story → sleep → 07:00 day 1, free will.
   - The drive stays the safe leg: the clock holds and nothing wears. It carries no lessons.
   - The worst-day beats and the lesson cards leave the career path. They move to stage 3.
   - Hold M skips from the firing to the wake (where it lands is answer 3).
   - Most of this exists (FEAT-170 stages 1–4, FEAT-184 stage 3/4's beats). The work is trimming and re-pointing, plus
     the story cards (placeholders for FEAT-148).
2. **The tutorial seed.**
   - A census over candidate seeds, like stage 2's census, for: a short joint → mom's drive, a pump, an auto shop and a
     store close by, and every POI type the optional content needs within a short drive.
   - The pick is pinned as data (`data/tutorial.js`), with a headless gate on its distances and roster, the same
     pattern as scenario-route.
   - The owner picks from a short list with screenshots (the world-gen rule).
3. **The mandatory tutorial (< 10 minutes) on that seed.** The worst-day story carries the lessons, in about this
   order:
   - the ignition, the pedals and the GPS;
   - the map;
   - the refuel (now always close: the seed guarantees it);
   - the flat and the damage screen;
   - the spare (changing a tire);
   - the spare is flat too → the recovery screen (the tow);
   - the shop (buy a spare);
   - the inventory and eating;
   - tiredness and camping (the night);
   - the morning.
   It ends on a card: **main menu** or **more lessons**. Finishing it, and only finishing it, clears the flag. The
   smoke times the whole run against the 10 minutes.
4. **First launch.** While the flag is not complete, booting drops straight into the tutorial with no menu. After
   that, the menu button. The flag's default flips back to "not complete" only when the owner says so; today it stays
   complete per the note.
5. **The optional lessons, one per mission type** (if answer 8 says alpha). They live on the tutorial seed, one entry
   each, on the FEAT-62 scenario list's pattern (a pinned world, a start, a job handed over), with tip cards as you
   drive: courier, haul, freight / fragile, papers, the requisition, demolition, the expedition. About a day each,
   after stage 3.
