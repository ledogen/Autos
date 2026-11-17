---
id: DEC-353
status: standing
decided: 2026-11-16
area: story
governs: FEAT-229, FEAT-184, DEC-345, data/dialogue.js, src/main.js, tutorial, Katie, phone calls, peanuts, camp, alarm clock, sleepy, Sally's Deli
supersedes: 
---

# DEC-353: Tutorial feedback, round 2 (the owner's drive of the picnic flow)

**Ruling.** Owner, card tutorial-test-drives, 2026-11-16, whole and verbatim:

When Katie calls you after you speak with Larry at his house I'd like for the first card to read. "Hey Billy! How you
doing? Sorry about yesterday..."
We should also frame phone calls a little bit better. Maybe a card that just says phone and then ring ring ring text.
Then every dialogue that ends with the character on the phone should end with "<click>"
We need a little bit more direction when buying snacks at the gas station. Katie should tell you to buy the bag of
peanuts. And we need to control the menu so the player doesn't spend all their money.
Katie should say "Hold B and select the camping menu to look for a campsite. Then drive slowly down the road to find
the best site nearby. anything flat enough will do!"
We either need to wait until the player arrives at the McGill Ranch pin to show the camping instructions, or we need
to clear the waypoint as soon as the player makes camp. I never actually got to the pin, I was able to pitch camp, and
now it still shows the waypoint.
Katie should say "select inventory" instead of "hold B" at camp because the side menu doesn't work when you're at
camp, since B is bound to the UI back function.
Presumably Katie arrives at camp to meet you so she shouldn't say "hey, it's me"
New bug. I was camping. I wrapped up with Katie. Then it said press Y to start the truck even though I was still in
camp. I decided to try to break it so I started the truck and it immediately pinned to rev limiter like the throttle
was fully held. Then I returned to the truck. The throttle was still fully held until I tapped the accelerator.
I didn't notice any sleepy side effects driving home after the tire was fixed I think after fixing the tire we should
set the player's energy to sleepy so that they get the eye blinks but none of the more exaggerated effects then mom's
card about energy will make sense when you arrive there. If energy was already set to tired then I might have just
Lucky and not got the effects
Mom should use the terminology "set your alarm clock" when talking about sleep and we should force the player to set a
specific wake time like 6.30. Otherwise, the sleep menu can reject the button press and say "Set this time instead"
Because we set the time after the player wakes up anyway
Notice the situation that's ripe for bugs. The burger place is called Sally's Deli in the tutorial world but the
burger place will have a different name if you use an actual seed or if you exit this tutorial into a different seed.
I think the simplest way out is to just not display the name of the business in the tutorial. Just call it work or
something.

**Why.** The owner drove the picnic flow (DEC-345) on main and wrote this.

**Replaces.** Nothing by supersession; what each point changes in an older record is recorded by the build (DEC-354..357).

**Source.** ledorepo `answered/tutorial-test-drives.answer-2026-11-16b.json`.
