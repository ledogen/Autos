---
id: DEC-355
status: standing
decided: 2026-11-16
area: story
governs: FEAT-229, DEC-353, DEC-345, DEC-347, data/dialogue.js, Katie, tut-picnic, tut-ranch, tut-campmade, tut-katie, peanuts, camp, inventory
supersedes:
---

# DEC-355: Katie's lines, round 2: "Sorry about yesterday", the peanuts by name, the camp menu, "select inventory", no "Hey, it's me"

**Ruling.** Owner, card tutorial-test-drives, 2026-11-16 (DEC-353): "When Katie calls you after you speak with Larry at
his house I'd like for the first card to read. "Hey Billy! How you doing? Sorry about yesterday..."". "Katie should tell
you to buy the bag of peanuts." "Katie should say "Hold B and select the camping menu to look for a campsite. Then drive
slowly down the road to find the best site nearby. anything flat enough will do!"". "Katie should say "select inventory"
instead of "hold B" at camp because the side menu doesn't work when you're at camp, since B is bound to the UI back
function." "Presumably Katie arrives at camp to meet you so she shouldn't say "hey, it's me"". As built: `tut-picnic`
opens on that card (the firing was that same morning; the words are kept as he wrote them), then DEC-345's two lines; her
snack ask names "a bag of peanuts" (the agent's words, still marked [placeholder]); `tut-ranch`'s second card is his camp
line for the pad, and the keyboard's half reads "Press Z to look for a campsite. Then drive slowly ..." (every line by
input names its own key, FEAT-174); `tut-campmade` says "select inventory and eat the peanuts", the camp card's own
button (its other words still [placeholder]); `tut-katie` opens "So what are you gonna do now that you don't have a job?".

**Why.** The owner's drive of the picnic flow (DEC-345) on main.

**Replaces.** Nothing by supersession. DEC-345's first line at Larry's is now her second card; DEC-347's six cards stay
six, the first without its opener.

**Source.** DEC-353 (ledorepo `answered/tutorial-test-drives.answer-2026-11-16b.json`).
