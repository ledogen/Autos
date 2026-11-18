---
id: FEAT-288
type: feature
status: open
severity: major
opened: 2026-11-18
source: owner, in chat, 2026-11-18 (the "tutorial monologue")
relates: FEAT-184, FEAT-217, FEAT-229, FEAT-120, BUG-203, BUG-183, DEC-422, DEC-353, DEC-357, data/tutorial.js, data/dialogue.js, src/main.js, src/menu-nav.js, src/hud-menu.js, src/gamepad.js, src/map2d.js, src/camera.js
---
lane: SM (tutorial)

# FEAT-288: Tutorial pass from the owner's 2026-11-18 monologue

## Next steps
Plan written (below, § Plan). Owner: answer card `feat288-tutorial-plan` (sleep form, speaker separation, the end menu, lunches, the flat's spot; every question has a default). Then one build agent per package, SERIALLY, in the order of § 8: P1 (dialogue only) and P7 (phone sounds) can start at once; P2 (the lock) gates P3a/P3b.

## Summary
A complete, simple tutorial: full dialogue and storytelling, a brief but complete explanation of every system, every control / menu / bar the player must use highlighted and everything else locked out, plus the specific fixes below.
The plan: one generic gate (the card on screen names the actions it allows and the elements it highlights; everything else is refused, in one place for keys, mouse and pad), ~40 itemised changes, 8 packages.

## Description
The owner's words, verbatim (2026-11-18, in chat):

> Tutorial monologue. I'm going to give you all of the game experience, user experience, player test context that I can and I'd like for you to build a simple tutorial with all of the elements including the completeness of dialogue and storytelling as well as a brief but complete explanation of every system in the game. Anywhere there is an interface between the player and a system that requires a control, looking in a certain place, understanding a menu or a bar, I would like for you to make an attempt to breeze over it. I would estimate that the current tutorial takes about 15 to 20 minutes depending on the player I like the slow rotation in the opening sequence, but you should also be able to rotate with the right stick freely, and if you stop then it will start slowly rotating again. We should add sound effects for the phone. I think a ringer can play over the ringer ring card and then a click or flipping a flip phone shut can play over the ending. I'd like to work in a portion of the tutorial that explains how to interact with the map I'd like it to explain the list on the side As well as controls for setting a waypoint to direct the player to the legend, but don't explain it. The drive to Larry's house is magnificent, exactly how I've always wanted it to be. You get the great landscape, you get to see the huge mountain. The tunnel is maybe a little bit early in the expose, but that's fine. We have to get rid of the "and that's how anything gets done around here" prompt. I find that incredibly cheesy. Mom should say something along the lines of "pull over and park out front with rb" The parking area should also be marked at mom's house. I noticed this bug is also in regular story mode. Mom's house should have a marked parking spot just like everyone else. When mom tosses the backpack out of the house it needs to do that thing where it flashes white or maybe it can get a bright aura but as it stands it's impossible to see in the shade of her house. I think having a quest item indicator will come in handy in the future too. Remove the word placeholder from all the text in the tutorial. I'll just do a script review later. When two characters speak back to back we have the ring ring card dividing them. Maybe there's a better technique or maybe an industry standard on how to separate dialogue from different characters. Katie's third card when you're outside Larry's should say anyway comma instead of hey comma. Tutorial missions should show their destination on the map and the route should be plotted on the map. Katie needs to guide you through the shopping process, how to select an item, how to check out. Right now it says fill up at a pump after you buy the food, but there's no text until you take off your parking brake about filling up. You shouldn't be able to break camp early when doing the camping lesson. I think press any key should override holding B for the B menu. Katie doesn't have to mention your last paycheck. I think your mom can do that. Move the flat to be a little bit earlier in the sequence before you go into the tunnel. It would be nice if we started highlighting the controls or the menu UI related to the tasks in the tutorial. For example, "Home" says... Was that a bang? "Press B to look at it." But really, the player needs to hold B. So we should highlight the "Hold B" region. And then they need to navigate. So once they're holding B, then it should highlight the specific option that they're trying to click on, which is "Vehicle Diagnostics." And the other two shouldn't be accessible during that time. Right, like lock the player out of every action that doesn't teach them a lesson. Then we should force them out of the diagnostics menu and into the inventory, force them to select the correct item etc. Otherwise they could like eat all their food in the tutorial by accident. Mom should give you your packed lunches when you leave on day one. They shouldn't be in your inventory until then. When you're in the auto shop it should be mom talking to you not uncle Larry. On the way out of the garage mom's car doesn't trigger until you shift into gear it should trigger as soon as you buy the tire. I thought I gave some notes that said "mom needs to force you to select exactly the right amount of sleep" we shouldn't let the player decide how much they're gonna sleep and then force set the time afterwards anyway. Did that message get lost in the ether? The player should leave the menu with the food vendor and then the tutorial should end. As it is right now, it's like you're talking to your boss and then you don't press anything and then you're talking to Larry.


### Plan (lane s, 2026-11-18): facts measured on main

Measured in the running game (own Vite :3891, headless Chrome through `tools/chrome-slot.sh`, a fresh profile, the
tutorial seed 1872706826; the probe script is not kept) and on the headless tutorial-seed build (`test/tutorial-seed.mjs`'s
own region, with a tunnel read added).

- **(a) The sleep lesson is built and working, on all three inputs.** The hours slider opens at 8 h (wake 05:30) and
  moves freely on the mouse, the keyboard arrows and the pad's D-pad. Pressing Sleep at any wake time but 06:30 is
  refused: the clock does not move and the line under the slider reads "Set this time instead: wake 06:30". Measured:
  mouse click (real pointer event) refused; keys (arrows to the Sleep button, Enter) refused; fake pad (D-pad, A)
  refused; 9 h (06:30) slept to clockH 6.50 exactly. So DEC-357 shipped as written. What the owner saw is the freedom to
  pick any time before pressing Sleep; he asks for more than a refusal (item 38).
- **(b) The end today.** Parked at the joint in the morning: the manager's card ("Don't come back asking to run the
  grill again…") is up within 0.1 s. One press, and 2 s later the phone rings: Larry's two cards and his click. No menu
  opens between them; the joint's job card (`#mission-panel`) never shows. The tutorial already reads "over" (`phase:
  free`) while the manager is still talking. On a later run (not the first playthrough) a world load sits between the
  manager and the ring (DEC-158). Code: `_eveningBeats` main.js:4968 plays PAYCHECK; `_checkOpeningEnd` main.js:5285
  pays, loads, and queues LARRY_CALL as soon as no card is up.
- **(c) Mom's parking mark.** main.js:3359 `if (!q.jobs) continue`: the orange ring is drawn only round a place that posts
  jobs (`jobs` is derived from data/offers.js SOURCES, poi.js:180). Mom's house posts none, so it gets no ring, in the
  tutorial and in every story run. Her door is a 25 m radius (camp.js:80 `campMomsRadiusM`), not the 10 m ring.
- **(d) The pack.** It lands at model-local (2.2, −3.5) of her trailer (data/tutorial.js PACK_TOSS), beside the stoop's
  foot, in the house's shade; on the tutorial seed at world (−40.7, −201.2). In the measured screenshot, parked at her
  door at 08:00, the pack is not visible at all. **No "flash white" exists for world items.** The nearest things in
  code: FEAT-97's fragile-load blink (an emissive tint on the load's own materials, red, debris.js:531) and the rank
  tile's white slam (index.html `rt-slam`, a HUD animation). Ground items have no highlight of any kind.
- **(e) Mom's card after the shop.** `tut-lights` fires on `_eveTowed && !serviceScreen.isOpen && !vehicleState.parked`
  (main.js:5028): it waits for the parking-brake latch to drop, which happens when the player shifts or presses the gas.
- **(f) The rest.**
  - The square-bracketed draft tag the owner wants gone is in the shown text of 7 cards (data/dialogue.js): `tut-picnic` card 3 (:154), `tut-gas` card 2
    (:162), `tut-pickup` (:210), `tut-snackcamp` (:215), `tut-vibe` both cards (:226, :227), `tut-campmade` (:231).
  - "and that's how anything gets done around here" is the end of `tut-park` (:186).
  - Katie's third card outside Larry's: the ring card is the first, so it is `tut-picnic`'s "Hey, since I know you got
    nothing going on today…" (:152), DEC-345's words.
  - Katie and the paycheck: `tut-katie`'s last card (:244, "Oh, and did you ever get your last paycheck?…") and the
    whole of `tut-morning` (:204, her morning call).
  - The auto-shop card in Larry's voice: `tut-service` (:133), played at the shop (main.js:6484) just before mom's
    `tut-shopfix`.
  - "Fill up at a pump": the HUD line reads "fill up at a pump" (main.js:7762) the moment the peanuts are bought, but
    mom's gas call waits for the brake to come off (main.js:4980, DEC-345's "as you take off the pbrake").
  - Breaking camp early: `_breakCamp` (main.js:7139) has no tutorial gate; the button is live from the moment camp is made.
  - The flat: it lands where the crow distance to mom's halves (main.js:5018). Measured on the drive home (camping area to
    mom's, 775 m along the line): flat at 433 m, tunnel 457–578 m. So the flat goes off 24 m before the portal, and the
    player is in the bore before they can stop. (Every leg has one tunnel: joint→mom 493–616 m, mom→Larry 199–323 m,
    Larry→station 1814–1939 m, station→camp 676–796 m.)
  - Packed lunches: every run is granted three at its start (main.js:9664, FEAT-173), the tutorial included.
  - "Press any key" vs B: on the pad, B in the driving layout opens the B menu directly (gamepad.js:295), without
    sending a key. A dialogue card that waits for "any key" therefore never sees B: the B menu opens over the card.
  - The map: tutorial legs draw no line and no pin on the map. The map's waypoint getter (main.js:2143) shows only the
    ranch's pin (DEC-346/356), with no line. The GPS line exists (`_homeGuide`), it is just not handed to the map.
  - Phone sounds: none in `src/`. The library (`python3 -I wip/sonniss/sort.py find phone` / `ring` / `telephone`) has
    no phone ring or flip-shut on disk; a "Vintage Telephones" pack (antique bells, the wrong era) is in a zip not kept.

### 1. Every item in the monologue

"Today" cites main as of e42a56ff. P-numbers are the packages in § 8.

| # | He asked | Today | Change (package) |
|---|---|---|---|
| 1 | A simple tutorial: complete dialogue and storytelling | The story stands (firing, mom, Larry, Katie, the worst day, the paycheck) | Keep the story; fill the gaps in § 2's script (P1, P3a, P3b) |
| 2 | A brief but complete explanation of every system | Several systems untaught (map list, waypoint, shop checkout, alarm, day clock, wallet, deeds) | § 2's coverage table: every system has a beat or a one-line mention |
| 3 | Breeze over every control, place to look, menu or bar | Cards name keys; nothing on screen points | The highlight half of the gate (§ 3) on every lesson beat (P2, P3a, P3b) |
| 4 | It takes 15–20 min today | — | Budget: +2.5 min of additions, −0.5 min of cuts (§ 2) |
| 5 | Keep the opening's slow rotation | `_updateFiringCam` main.js:5237, 0.05 rad/s | Unchanged |
| 6 | Rotate freely with the right stick | The orbit sets the camera angle every frame, so the stick does nothing | Stick (and right-mouse drag) take over (P6, § 6) |
| 7 | Stop touching it and the slow rotation resumes | — | Resume after 3 s idle, from where the player left it (P6) |
| 8 | A ringer over the ring card | Silent | Synthesised ring on every "Ring ring ring" card (P7, § 4) |
| 9 | A click / flip-phone shut over the ending | Silent | Synthesised flip-shut on every "<click>" card (P7) |
| 10 | Teach the map's list on the side | Untaught (mom's card only says "Press M for the map") | Map beat in Katie's picnic call (§ 2 beat 9) (P3b) |
| 11 | Teach setting a waypoint | Untaught | Same beat: drop a waypoint on the station (P3b) |
| 12 | Point at the legend, don't explain it | Untaught | Same beat: one card, the legend highlighted (P3b) |
| 13 | The drive to Larry's is "magnificent" | — | No change |
| 14 | The tunnel is a little early, "but that's fine" | joint→mom tunnel at 493 m | No change |
| 15 | Remove "and that's how anything gets done around here" | `tut-park` data/dialogue.js:186 | Cut (P1) |
| 16 | Mom: "pull over and park out front with RB" | `tut-park` names Space only, and "come to a full stop" (DEC-363) | New line, by input: RB / Space, keeps "come to a stop" (P1) |
| 17 | Mark the parking area at mom's | No ring (main.js:3359) | Draw the orange ring round her door (P4) |
| 18 | Same bug in regular story mode | Same code path | Same fix covers both (P4) |
| 19 | The tossed pack flashes white or gets an aura | Invisible in her shade; no highlight exists | Quest-item mark: white beam + emissive pulse (P5, § 5) |
| 20 | A reusable quest-item indicator | — | One flag on a world item, `quest: true` (P5) |
| 21 | Remove the draft tag word from all tutorial text | 7 cards (list above) | Strip the tag; the words become § 2's drafts (P1) |
| 22 | Two speakers back to back: a better technique? | The ring card is the only divider | Options + recommendation (§ 4); owner's call, card Q2 (P8) |
| 23 | Katie's third card at Larry's: "Anyway," not "Hey," | data/dialogue.js:152 | "Anyway, since I know…" (P1) |
| 24 | Tutorial missions show their destination on the map | Only the ranch's pin, no other leg | Every leg's door pinned on the map (P4) |
| 25 | …and the route plotted on the map | No line on the map | The leg's GPS line drawn on the map (P4) |
| 26 | Katie guides shopping: how to select an item | No shop lesson; the shelf is locked to the peanuts (DEC-356) | Katie's shop beat: the peanuts row highlighted, the rest locked (P3b) |
| 27 | …and how to check out | Untaught | Next card: the check-out button highlighted, discard locked (P3b) |
| 28 | "Fill up at a pump" shows after buying, but no words until the brake is off | HUD line main.js:7762 vs call main.js:4980 | Mom's gas call fires when the shop screen closes (P3b) |
| 29 | No breaking camp early in the camping lesson | `_breakCamp` main.js:7139, ungated | Break camp locked until Katie's talk ends (P3a) |
| 30 | "Press any key" should override holding B | B opens the B menu over a card (gamepad.js:295) | While a card waits for any key, B advances it (P3a) |
| 31 | Katie does not mention the last paycheck | `tut-katie` :244 and `tut-morning` :204 | Both lines leave Katie (P1) |
| 32 | …mom can do that | — | Mom says it at her door that night, and again at breakfast (P1) |
| 33 | Move the flat earlier, before the tunnel | Flat 433 m, tunnel 457 m (24 m short) | Flat at 250 m along the drive home, ~200 m before the portal (P4) |
| 34 | Highlight the control / menu region for the task: "Hold B", not "Press B" | Card says "press V"; nothing highlighted | The flat card names "hold B"; the "hold B" region is highlighted (P2, P3a) |
| 35 | Then highlight the option ("Vehicle Diagnostics"); the other two inaccessible | B menu lists every usable icon | The B menu lists only the beat's icon (P2) |
| 36 | Lock out every action that doesn't teach the lesson | Only spot locks (the shelf, the tire swap before V) | The gate's whitelist per beat (§ 3) (P2) |
| 37 | Force out of diagnostics into the inventory, force the right item | The card says "Tab, then the mounted tire"; nothing enforced | Diagnostics allows only "back"; then the B menu offers only the inventory; only the spare is usable (P3a) |
| 38 | Mom forces exactly the right sleep; no picking a time then force-setting it | Free slider, refused at the button (fact a) | Default: slider highlighted, Sleep greyed and unpressable until it reads 06:30; card Q1 offers "preset and locked" (P3a) |
| 39 | "Did that message get lost?" | It was not: DEC-357, built and working (fact a) | Answered on the card |
| 40 | Lunches from mom when you leave on day one, not before | Three at every run's start (main.js:9664) | Played tutorial: none until breakfast; mom hands them over then (card Q4 for the count) (P3a) |
| 41 | No eating all the food by accident | Inventory open whenever parked | Inventory use locked except the lesson's item (P2, P3a) |
| 42 | Mom, not Larry, at the auto shop | `tut-service` speaker 'Uncle Larry' (:133) | Mom's voice (P1) |
| 43 | Mom's card on the way out of the garage fires on buying the tire, not on shifting | Waits for the brake latch to drop (main.js:5028) | Fires when the tire's check-out lands (P4) |
| 44 | Leave the food vendor's menu, then the tutorial ends; today the boss talks, nothing is pressed, then Larry | Fact (b) | After the manager, the joint's job card opens; leaving it ends the tutorial; then Larry's call (P3b, card Q3) |

Sentence-by-sentence check, the monologue read again in order: intro sentence (1) · "breeze over it" (3) · "15 to 20
minutes" (4) · slow rotation (5) · right stick (6) · resumes (7) · sound effects for the phone (8) · ringer (8) · click /
flip (9) · map list (10) · waypoint (11) · legend (12) · drive to Larry's (13) · landscape / mountain (13) · tunnel (14) ·
"and that's how" (15) · "pull over and park out front with rb" (16) · parking area marked (17) · regular story mode (18) ·
marked spot like everyone else (17) · backpack flash / aura / shade (19) · quest item indicator (20) · the draft tag (21) ·
script review later (21: the owner writes the final words) · two characters back to back (22) · industry standard (22) ·
Katie "anyway" (23) · destination on map (24) · route on map (25) · shopping, select (26) · check out (27) · "fill up at
a pump" (28) · break camp early (29) · press any key vs B (30) · Katie's paycheck (31) · mom does it (32) · the flat
before the tunnel (33) · highlighting controls (34) · "Home says… Was that a bang?… Press B" (34) · hold B region (34) ·
Vehicle Diagnostics, other two locked (35) · lock out every action (36) · force out into inventory, select the item (37) ·
eat all their food (41) · lunches on day one (40) · not in inventory until then (40) · auto shop mom (42) · mom's card on
buying the tire (43) · sleep forced (38) · "lost in the ether" (39) · leave the food vendor's menu (44) · "talking to
your boss … then Larry" (44). Nothing dropped.

### 2. The lesson script, end to end

Draft dialogue: final-quality drafts in the established voices; the owner writes the final script later. No line is
tagged. "Key / pad" pairs are shown keyboard first; in game each card shows the active device only (FEAT-174 `kc-kb` /
`kc-pad`). **Base lock** (every tutorial beat, unless the row says more): driving (pedals, steering, gears), the
parking brake, the key, headlights, looking around, the map (open and close), pause, the skip hold (M / View), the
tutorial's reset (R / D-pad → held, DEC-362), and advancing cards. Everything else is refused: the B menu, Tab, V, Z,
X, G, J, the waypoint, every card button not named.

| # | Where | Speaker | Card text (draft) | Player must DO | Highlighted | Also unlocked (else base lock) |
|---|---|---|---|---|---|---|
| 1 | The joint, 07:00 | Katie (phone, already on) | "Alright, you made it. I'll let you go. Good luck with your boss — I bet he's real upset with you." → *click* | any key | — | the camera stick / right-drag (P6) |
| 2 | | The manager | "Billy, I've had it! This is the last time you'll be coming to work late, because you're fired. I don't want to see you in my kitchen anymore." | any key | — | — |
| 3 | The intro card | — | play / skip (unchanged) | pick one | — | — |
| 4 | | Mom (call, *ring*) | "Hey, how's everything going?" · "He what?… I can't believe it. Just like that, after all the time you've been there." · "Come on by the house, honey. I've got something for you." · "Press M / View for the map if you forgot the way." | any key | — | — |
| 5 | | Mom | "And honey — the truck won't start itself. Hold I / Y to turn the key." → *click* | start the engine | the start-the-truck hint | the key only (no pedals yet) |
| 6 | Driving | Mom | "Drive safe, honey. W and S / RT and LT are the gas and the brake; steer with A and D / the left stick. Follow the line on the road: the top of the screen says where it goes and how far." | — (clears on read) | the GPS line (top centre) | — |
| 6b | (manual gearbox only) | Mom | "You picked the stick shift: Shift / LB is the clutch, E / A shifts up, Q / X shifts down." | — | gear readout | — |
| 7 | 150 m from hers | Mom | "Pull over and park out front, in the marked spot. Come to a full stop, then Space / RB sets the parking brake." | park in her ring | the PARK badge; her ring in the world | — |
| 8 | Her door | Mom | "Take this pack over to your uncle. He left it behind. Also, here's a couple bucks for food." (pack tossed, quest-marked) | any key | the wallet | — |
| 9 | | Mom | "Pull up next to it, park, and press G / D-pad ↓ to load anything loose nearby. Then run it over to Larry's." | load the pack | the pack (quest mark) | G / D-pad ↓ |
| 10 | Larry's, parked | Larry (in person) | DEC-361's two cards, unchanged | any key | — | — |
| 11 | | Katie (call, *ring*) | "Hey Billy! How you doing? Sorry about yesterday…" · "Anyway, since I know you got nothing going on today, why don't we go picnic out at the old McGill ranch. I'll let you pick a spot and I'll meet you out there." · "Grab us a bag of peanuts at the gas station on your way, would you? Park out front of the store, not at the pumps." | any key | — | — |
| 12 | (map beat, same call) | Katie | "Not sure which station? Open your map: M / View." | open the map | the map key hint | map open |
| 13 | | Katie | "That list on the side shows every shop around here. Switch it to Shopping with Q / X, then walk it with ↑ ↓." | Shopping tab up | the list column and its tabs | the tab switch, list walking |
| 14 | | Katie | "There's the station. Drop a waypoint on it with N / Y, and your line goes straight there." | waypoint on the snack station | that station's row | the waypoint (that row only) |
| 15 | | Katie | "And the key to all those little marks is down in the corner." | any key | the legend | — |
| 16 | | Katie (holds the line) | "Holler when you're at the store." | close the map | — | map close |
| 17 | The store bay, shop open | Katie (still on) | "Got it? Pick the peanuts off the shelf: ↑ ↓ to the row, Enter / A to put them in your cart." | peanuts in the cart | the peanuts row | that row only |
| 18 | | Katie | "Now check out. That pays for whatever's in your cart." | check out | the check-out button, the wallet | check out only |
| 19 | | Katie | "Perfect. You know where to go, I'll see you there!" → *click* | any key, then leave the shop | the shop's leave button | leave |
| 20 | Shop closed (P3b moves the trigger here) | Mom (call, *ring*) | "Hey, is everything alright? I almost forgot, when I looked over the truck last night I noticed it was plumb outta gas." · "You're right there, honey. Back out of that spot, pull up at a pump and park." | park in a pump zone | the fuel gauge; the blue pump zones | — |
| 21 | The pump face | Mom (on the line) | "Hold F / A to pump. Fill her right up, every last dollar: you won't get far on fumes." | wallet empty (DEC-151) | the pump's handle prompt, the wallet | pump |
| 22 | | Mom | "There, that's better. Go on and have fun with Katie, honey." → *click* | — | the fuel gauge | — |
| 23 | The ranch (preset waypoint, DEC-356) | Katie (call, *ring*) | "Oh, you're already there? I'm just a couple minutes out. Go ahead and find a good spot. I'll just pull over where I see your truck." · "Hold B and pick the camping menu / Press Z to look for a campsite. Then drive slowly down the road to find the best site nearby. Anything flat enough will do!" | camp search on | the "hold B" region, then the camp icon | B menu = camp only; Z |
| 24 | Vibe bar on screen | Katie | "See that bar? That's the vibe. The yellow is how flat it is — that counts the most, you don't want to roll out of the tent." · "Purple is the view, green is shade from the trees, and blue is water close by. Fill the bar as far as you can, then park and make camp." → *click* | make camp | the vibe bar, then "make camp" | make camp only (no abandon, no truck) |
| 25 | Camp made | Katie (in person) | "Nice spot! Go ahead and break out that snack: select inventory and eat the peanuts." | eat the peanuts | camp's inventory button, then the peanuts | inventory: the peanuts only |
| 26 | | Katie | DEC-347's talk, cards 1–5 unchanged (what now, the expedition camp, good deeds, pace and tips); the good-deeds counter is highlighted on the deeds card. New last card: "Well, I better get going. Break camp whenever you're ready, and head on home." | any key | good deeds counter (card 2) | break camp, from the last card on |
| 26b | (one-line mention) | Katie | "If you ever pick up potatoes, you can cook them on the fire." | — | the cook button | — |
| 27 | 250 m into the drive home (before the tunnel) | Mom | "Was that a bang? That's a flat, honey. Pull over, come to a full stop and set the parking brake. Then hold B / press V and pick Vehicle Diagnostics." | open diagnostics | the "hold B" region, then the diagnostics icon | B menu = diagnostics only; V |
| 28 | Diagnostics open | Mom | "That's your truck, part by part, and how worn each one is: green is fine, red is trouble. The front left's flat. Back out with B / Esc." | close diagnostics | the front-left wheel row, then "back" | back only |
| 29 | | Mom | "Now put your spare on: hold B / Tab, the inventory, then the spare tire." | try the spare | "hold B", then the inventory icon, then the spare's row | B menu = inventory only; Tab; the spare's row only |
| 30 | | Mom | "The spare's flat too? Of course it is. Call a tow: hold B / X, the recovery menu." | open recovery | "hold B", then the recovery icon, then the tow | B menu = recovery only; X; the tow only |
| 31 | | Mom | "The tow takes you to the nearest auto shop. It's on me this time." | any key | — | — |
| 32 | The auto shop | Mom (was Larry) | "The shop fixes what you broke and sells what you need. Every repair has a price on it — drive gentle and you'll keep more of your pay." | any key | — | — |
| 33 | | Mom | "Get a good tire on that corner — that one's on me. Pick it, then check out." | buy the tire | the tire row, then check out | that row, check out |
| 34 | Tire bought (P4 moves the trigger here) | Mom | "It's pitch dark out there. L / the left stick click turns the headlights on. Follow the line home." · "And remember, honey: slowing down is the best way to avoid crashing." | lights on | the headlight key hint | — |
| 35 | Her door, night | Mom | "There you are! I'm so happy you're home, and safe." · "Oh my, you must be hungry by now. Just be careful: when you get hungry you run out of energy really quickly, and then you get tired." | any key | the hunger bar, then the energy bar | — |
| 36 | | Mom | "You can always rest here. It's better than sleeping in the truck. When you're out late, find flat ground off the road and make camp." | any key | — | — |
| 37 | | Mom | "Sleep is how a day ends. Set your alarm clock for 06:30: slide it until it reads wake 06:30, then sleep." | set 06:30, press Sleep | the slider (Sleep greyed until 06:30) | slider + Sleep only (card Q1) |
| 38 | | Mom | "And first thing tomorrow, go get your last paycheck from work." | any key | the HUD clock | — |
| 39 | Morning, 06:30 | Mom (in person) | "Morning! I packed you some lunches for the road. Eat one before you go: hold B / Tab, the inventory, a packed lunch." (lunches granted here) | eat a lunch | "hold B", then the inventory icon, then a lunch | B menu = inventory only; a lunch only |
| 40 | | Mom (in person, was Katie's call) | "Now go get that paycheck, honey. Drive safe." | any key | the GPS line | — |
| 41 | The joint, parked | The manager | DEC-277's line, unchanged | any key | — | — |
| 42 | | (the joint's job card opens) The manager | "Here's the board. That's who's asking, what it pays, and how long you've got." (was `tut-offer`, mom's) | leave the menu (B / Esc) | the card's parts, then its back button | browse and leave only (card Q3) |
| 43 | Menu left: the tutorial ends | Larry (call, *ring*) | DEC-326's two cards, unchanged → *click* | any key | — | base lock lifted: free will |

**Coverage: every player-facing system and its beat.** Driving 6 · gears / clutch 6b (manual only) · parking brake 7 ·
the B menu 23, 27–30, 39 · vehicle diagnostics 27–28 · inventory and eating 25, 39 · hunger 35 · energy and sleep 35–37
· the alarm clock 37 · money (wallet) 8, 18, 21 · fuel and pumps 20–22 · shops and checkout 17–19, 33 · the map: list 13,
waypoint 14, legend pointed at 15 · GPS 6, 40 · missions / offers and their timers 42 · ranks and pay 26 (Katie's pace
and tips card) · wear and damage 28, 32 · flats and the spare 27–30 · towing 30–31 · reset: not taught (DEC-321) · camp
23–24, 26 · cooking 26b · the day clock 38 · the run's goal 26, 43 · pick-up 9 · headlights 34.

**Not teachable in the tutorial; a one-line mention or left to first use:** ranks' timer bar (the first job's
`tut-rank` card, after the tutorial, as today; DEC-154 puts mission lessons after alpha) · cargo, fragile loads and
freight (the first such job's card) · Larry's paper route (Larry's "I have some work if you need it", beat 10) · the
camera modes (C / right stick click: no mention; the bindings list in pause) · pause and save-and-quit (no mention; DEC-411
gates it on parking, which the player learns at beat 7) · rising prices (the midnight overlay says it). Recommend no
extra card for any of these.

**Length.** Added: the map beat (4 cards + actions, ~45 s), the shop beat (3 cards, ~25 s), the forced diagnostics path
(+2 cards, ~15 s), the alarm (~10 s), mom's paycheck line (~5 s), the end menu (~20 s), the manual gearbox line (~5 s,
manual only), cooking (~5 s): about +2.2 min. Cut: mom's camping line folded into her rest card (−5 s), Katie's
paycheck card and Katie's morning call with its ring and click (−15 s), the flat 180 m earlier (−15 s of limping):
about −0.6 min. Net about +1.6 min. If that is too long, the next cut is beat 6b and 26b (−10 s), then the legend card
folded into beat 14 (−5 s).

### 3. The highlight-and-lock mechanism

**One idea: the card on screen is the step.** A lesson card already waits for its action (`until`, DEC-359) and the
game runs under it. Each such card gains two fields in data/dialogue.js:

- `allow`: the actions it unlocks, by the action names gamepad.js `BINDINGS` already uses (e.g. `'damage screen'`,
  `'inventory'`), plus DOM selectors of the card buttons / rows it unlocks (e.g. `'#cp-sleep-go'`, `'[data-id="spareTire"]'`).
- `hi`: the DOM selectors to highlight (e.g. `'#hud-b-hint'`, `'#dmg-icon'`).

While the tutorial drives (`_tutDrive()`), the allowed set is the base lock (§ 2) plus the current card's `allow`.
Outside the tutorial the gate returns "everything allowed" and clears its classes: it is a pure function of "in the
tutorial?" and "which card is up?", with no state of its own, so a skip (BUG-183) can never leave anything locked.

**Where it is enforced (one module, `src/tut-gate.js`, ~80 lines; four one-line hooks):**

1. **Keys, and the pad's buttons.** One capture-phase keydown listener (capture phase: it runs before every other key
   handler, as the dialogue's "press any key" one does, main.js:4385). It maps the key to its BINDINGS action and
   swallows the event when the action is not allowed. The pad needs nothing extra: gamepad.js turns every button into
   a synthetic key event (`sendKey`), so the same listener refuses it.
2. **The B menu.** hud-menu.js `items()` (the list of icons a B hold walks) filters out icons the gate does not allow.
   With one allowed icon the menu shows one entry, highlighted.
3. **Menus and cards: keyboard and pad.** menu-nav.js collects the walkable items (`ITEMS`) in one place; locked ones are
   left out, so the arrows / D-pad cannot land on them and Enter / A cannot press them.
4. **The mouse.** One capture-phase click listener on the document swallows a click on any button, row or HUD icon the
   gate locks. Locked elements also get `pointer-events: none` from the CSS below.
5. **Analog inputs** (pedals, steering) are never locked; the flat's accelerator cut (DEC-272) stays its own rule.
6. **The sleep slider** is the one value lock: its card's `allow` entry for `#cp-sleep-go` carries a condition (the
   slider reads the alarm). Until it is true the button is greyed and refused.

**How the highlight is drawn (UI-STYLE.md tokens only).** `.tut-hi`: a 2 px outline in `var(--key)` (#ffcf3c, the
palette's "press this" yellow), pulsing 1 Hz between full and 40 % opacity. `.tut-locked`: 35 % opacity,
`pointer-events: none`. Both are classes the gate sets on the poll (10 Hz, like menu-nav's sync), so a card that
re-renders its rows is re-marked within 100 ms. World things (the pack, her parking ring) are marked by the
quest-item mark (§ 5) and the rings, not by CSS.

**Proof.**
- A pure node gate, `test/tut-gate.mjs` (cheap): every `allow` action names a real BINDINGS action; every `hi` / `allow`
  selector exists in index.html or is a row the code renders; every lesson card in TUT has `until`.
- `test/cdp-smoke.mjs` (opening step): at the flat card, Tab (keyboard) does not open the inventory; a mouse click on the
  camp icon does nothing; `.tut-hi` is on `#hud-b-hint`; after a skip, no element carries `.tut-locked` and Tab opens the
  inventory again.
- `test/pad-e2e.mjs`: a fake-pad B hold at the flat card offers one B-menu entry (diagnostics); A on a locked shop row
  leaves the cart empty.

### 4. The phone

- **Sounds.** Nothing exists in `src/` and the library has no ring or flip-shut on disk (fact f). Recommend
  synthesising both, in the project's FEAT-120 pattern (one small `src/phone-audio.js`, Web Audio oscillators, no asset,
  no licence): the ring is an early-2000s cell ringer (two square-ish tones alternating at ~1.3 and ~1.6 kHz, 1 s on,
  played once per ring card); the flip-shut is two short filtered-noise ticks ~10 ms apart with a low body thump. They
  play when a ring card or a `<click>` card appears (`DialogueSystem._frame` already marks both). Each gets a take on the
  dashboard's Sounds tab for the owner's ear. If he prefers a real flip phone: FEAT-120's recording kit says a phone
  recording is fine for close one-shots.
- **Two speakers back to back (his question).** Standard techniques:
  1. A name plate plus a portrait that swaps with the speaker, often with the box moving to the speaker's side (visual
     novels, Fire Emblem, Persona). The card already has an empty portrait square.
  2. A fixed colour per character on the name (and the box's accent line), so the change is seen before it is read.
  3. A short transition on a change of speaker: the card drops out and the new one slides in (~0.2 s), no extra press.
  4. A system line for calls: "incoming call: Katie" and "call ended", which is what the ring and `<click>` cards do now.
  **Recommendation:** keep the ring card for an incoming call (now with its ring sound) and the `<click>` card with the
  flip sound; add 2 + 3 for every change of speaker (a colour per character, a 0.2 s slide); portraits later, when there
  is art. It is his call (card Q2).

### 5. The quest-item mark (the pack)

One reusable mark for an item the player must pick up: a flag `quest: true` on a world item. Recommend both parts:
- a thin vertical beam: the ring curtain's geometry (main.js `_ringGeo`, the alpha ramp that fades upward) at 0.25 m
  radius and 6 m tall, in the paper target's white, so it reads from the road and in shade;
- an emissive pulse on the item's own materials, white, 1 Hz (the FEAT-97 blink's mechanism, debris.js:531, in white).
Cost: one extra mesh and one cloned material set per marked item, about 40 lines; no measurable frame cost. The mark goes
when the item is picked up. The pulse alone was considered and rejected: from 15 m and in her shade the pack is too small
to read even when lit.

### 6. The opening camera

`_updateFiringCam` (main.js:5237) sets the camera's angle every frame from the clock, so input has no effect. Change:
while the right stick moves (or the mouse drags with the RIGHT button: the left click advances the card, main.js:4400),
the orbit stops setting the angle and camera.js's own look input turns it; after 3 s [DEFAULT] of no input the slow
rotation resumes from the current angle (its start angle re-based, so there is no jump). camera.js needs one small export
(read the current orbit angle) and its pad-look branch already runs under a focus. BUG-203 (the wrong-way alert over the
opening) rides along in the same package.

### 7. Conflicts with standing records

Each is partial: the record's other sentences stand. DEC-422 carries the monologue; where a sentence below disagrees, DEC-422 wins for that sentence
(DEC-124: the newest tutorial note wins). None is flipped to superseded, because each record holds rulings the monologue
does not touch.

| Record | Its ruling (the part in question) | Monologue sentence | Proposal |
|---|---|---|---|
| DEC-357 | "a wake time other than 06:30 is refused with 'Set this time instead: wake 06:30'"; "the night is not preset" | "mom needs to force you to select exactly the right amount of sleep … we shouldn't let the player decide how much they're gonna sleep and then force set the time afterwards" | The refusal becomes a control that cannot offer another time (card Q1). DEC-357's sleepy energy and "work" stand. |
| DEC-345 | "as you take off the pbrake to leave mom calls" | "it says fill up at a pump after you buy the food, but there's no text until you take off your parking brake" | Her call fires as the shop screen closes. |
| DEC-345 | Katie's words "Hey, since I know you got nothing going on today…" | "Katie's third card … should say anyway comma instead of hey comma" | "Anyway, since I know…" |
| DEC-326 | `tut-morning` is Katie's reminder about the paycheck | "Katie doesn't have to mention your last paycheck. I think your mom can do that." | Mom says it at night and at breakfast, in person; Katie's morning call goes. Larry's two cards stand. |
| DEC-347 | Katie's talk ends "asking you about your last paycheck. This way it's too late in the day" | same | Her last card drops the paycheck; mom carries it. |
| DEC-359 | As built: a card that waits "neither freezes the sim nor eats keys or clicks" | "lock the player out of every action that doesn't teach them a lesson" | A waiting card now refuses every action outside its lesson. Its ruling ("lock players into all lessons with guardrails") agrees; only the as-built sentence changes. |
| DEC-354 | The ring card and the `<click>` card frame every call | "Maybe there's a better technique or maybe an industry standard" | A question, not a ruling: kept until his answer (card Q2). |
| DEC-153 / DEC-326 | Larry calls after you pick up your last paycheck | "leave the menu with the food vendor and then the tutorial should end" | Still after the paycheck; the job menu sits in between. Compatible. |
| (FEAT-173, no record) | Every run starts with three packed lunches | "They shouldn't be in your inventory until then" | A played tutorial gets them at breakfast; a skip and every other run unchanged. |
| (poi.js:180 comment, no record) | Mom's house "wears no interaction ring" because she posts no jobs | "Mom's house should have a marked parking spot just like everyone else" | She gets the ring; the comment is rewritten. |

### 8. Work packages (built serially: each touches src/main.js)

| Pkg | Scope | Files | Proof | Needs | Model | Size |
|---|---|---|---|---|---|---|
| **P1** dialogue | Strip the bracketed draft tag (7 cards); `tut-park` new line (RB / Space, out front, full stop, no "how anything gets done"); "Anyway,"; `tut-service` to mom; Katie's paycheck lines out, mom's two in; § 2's draft words where a card's words change | data/dialogue.js, test/cdp-smoke.mjs (its word checks) | affected gates; smoke regexes updated (the orchestrator smokes after merge) | nothing: starts at once | Sonnet | S |
| **P2** the gate | `src/tut-gate.js`; the four hooks (keys, hud-menu `items()`, menu-nav `ITEMS`, click); `.tut-hi` / `.tut-locked` CSS; base lock; `allow` / `hi` on the existing until-cards (flat, damage, spare, recovery, campmenu, snack, lunch, pickup, park, lights, engine) | src/tut-gate.js (new), src/menu-nav.js, src/hud-menu.js, src/main.js, index.html, data/dialogue.js, test/tut-gate.mjs (new) | the node gate; smoke: locked Tab/click at the flat, nothing locked after a skip; pad-e2e: one B-menu entry | P1 landed | Opus | M–L |
| **P3a** lessons on the gate, part 1 | Forced diagnostics → inventory → spare (beats 27–30); break camp locked until Katie's last card; eating locked except the lesson's item; the sleep lesson (card Q1); lunches at breakfast (card Q4); B advances a waiting-for-any-key card | data/dialogue.js, src/main.js, src/gamepad.js | smoke: the flat path, break camp refused, the sleep button greyed until 06:30 then sleeps to 06:30, no lunch before breakfast; pad-e2e: B on a card advances it | P2; Q1, Q4 (defaults usable) | Sonnet | M |
| **P3b** lessons on the gate, part 2 | The map beat (12–16); the shop beat (17–19); mom's gas call on shop close; the end: the joint's job card after the manager, browse-only, leaving it ends the tutorial (card Q3) | data/dialogue.js, src/main.js, src/map2d.js (list / legend highlight hooks) | smoke: waypoint on the station, checkout, gas call before the brake moves, end sequence manager → job card → leave → Larry | P2; Q3 (default usable) | Sonnet | M |
| **P4** world fixes | Mom's ring (story-wide); every tutorial leg's line and door on the map; the flat at 250 m along the drive home; `tut-lights` on the tire's check-out | src/main.js, src/poi.js (comment), test/tutorial-seed.mjs (`KM.campFlat`, a "flat before the tunnel" check) | tutorial-seed gate (heavy, ~25 s); smoke; one screenshot of her ring | nothing: may go before P2; Q5 | Sonnet | S–M |
| **P5** quest-item mark | `quest: true` world items: beam + white pulse; the pack is the first | src/main.js (world items), data/tutorial.js | one before/after screenshot at her door, 08:00 | nothing | Sonnet | S |
| **P6** opening camera | Free rotation (stick, right-drag), resume after 3 s; BUG-203 rides along | src/main.js, src/camera.js | smoke: the stick turns the orbit, it resumes; no wrong-way alert over the opening | nothing | Sonnet | S |
| **P7** phone sounds | `src/phone-audio.js`: ring and flip-shut, played by the frame cards; Sounds-tab takes | src/phone-audio.js (new), src/main.js (one call in `_renderDialogue`), wip/audio/phone-*/ | the owner's ear (Sounds tab) | nothing: starts at once | Sonnet | S |
| **P8** speaker separation | Whatever Q2 picks (default: colour per character + 0.2 s slide on a speaker change) | src/dialogue.js or main.js `_renderDialogue`, index.html, data/dialogue.js (colours) | screenshots of a back-to-back change | Q2 | Sonnet | S |

Order: P1 → P7 → P2 → P3a → P3b → P4 → P5 → P6 → P8. P1 and P7 can start now; P4, P5, P6 need no answer and may slot
anywhere after P1 if a lane is free; P3a/P3b take the defaults if the card is not answered.

## Tracker
- [x] Itemised plan + conflicts + questions written here (no code): § Plan, 44 items, DEC-422
- [ ] Owner answers card `feat288-tutorial-plan` (or the defaults stand)
- [ ] P1 dialogue: draft tags out, mom's parking line, "Anyway,", mom at the shop, the paycheck moves to mom
- [x] P7 phone sounds: ring and flip-shut, owner's ear
- [ ] P2 the gate: one lock + highlight for keys, mouse and pad; nothing locked after a skip
- [ ] P3a lessons 1: forced diagnostics → inventory → spare, break camp locked, eating locked, the sleep lesson, lunches at breakfast, B advances a card
- [ ] P3b lessons 2: the map beat, the shop beat, mom's gas call on leaving the shop, the end menu
- [ ] P4 world fixes: mom's ring (story-wide), legs on the map, the flat before the tunnel, mom's card on the tire's check-out
- [ ] P5 quest-item mark on the pack
- [ ] P6 opening camera: free rotation, resumes; BUG-203
- [ ] P8 speaker separation (after Q2)
- [ ] Owner has played it

## Decisions
- 2026-11-18, owner: the monologue (Description), recorded whole as DEC-422.
- 2026-11-18, owner (via the orchestrator, chat): on the sleep lesson, "I think it might always make you wake up at 630 but doesn't make the player choose 630. Or maybe it doesn't … I didn't actually try it, I just saw that it let me choose any time."

## Open questions
Each has a default a builder uses if the card is not answered.
- Q1 The sleep lesson's control. (A) the slider is highlighted and the player slides it to 06:30 themselves; Sleep is greyed and refuses until it reads 06:30 — **default**, it still teaches the alarm. (B) preset to 06:30 and locked, one button: shorter, teaches less.
- Q2 Separating two speakers back to back: **default** keep the ring card (now with sound) for an incoming call and the `<click>` card (with the flip sound); on any change of speaker, the name in that character's own colour and a 0.2 s slide. Alternatives: portraits that swap sides; a "call ended" system line instead of the `<click>` card.
- Q3 The end menu (the joint's job card): **default** browse-only (accept locked), leaving it ends the tutorial. Alternative: accept live on the first playthrough (the world does not reload there), which a later run cannot match.
- Q4 Lunches at breakfast: **default** she hands over four, you eat one and leave with three, the same as a skipper. Alternative: three, leaving with two.
- Q5 The flat's spot: **default** 250 m into the drive home, about 200 m before the tunnel's mouth (today 433 m, 24 m before it).

## Links
DEC-422 (this monologue). Card `feat288-tutorial-plan`. Earlier tutorial cards: `tutorial-test-drives`, `tut-dialogue-look`.

## Files
data/tutorial.js, data/dialogue.js, src/main.js, src/menu-nav.js, src/hud-menu.js, src/gamepad.js, src/map2d.js, src/camera.js, index.html; new: src/tut-gate.js, src/phone-audio.js, test/tut-gate.mjs

## Log
- 2026-11-18 minted by the orchestrator; the monologue is quoted in full above.
- 2026-11-18 the sleep note was not lost: it is DEC-357 ("a wake time other than 06:30 is refused with 'Set this time instead: wake 06:30'"). The plan must check in the browser whether that still works on main.
- 2026-11-18 lane s: plan written (§ Plan, 44 items, 8 packages), DEC-422, card feat288-tutorial-plan. Facts (a)–(f) measured on main (e42a56ff) in the browser and on the headless tutorial-seed build; no code changed.
- 2026-11-18 P7 built on land/feat-288-p7-phone: `src/phone-audio.js` (ring + flip-shut, synthesized), `call` marker on the frame cards in dialogue.js `_frame`, one hook in main.js `_renderDialogue`; Sounds-tab entries in FEAT-120. Owner's ear owed (card feat288-phone-sounds-ear); nobody has heard it.
