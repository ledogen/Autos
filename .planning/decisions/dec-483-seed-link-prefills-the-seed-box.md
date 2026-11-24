---
id: DEC-483
status: standing
decided: 2026-11-23
area: ui
governs: src/main.js, su-seed, seed box, new-game card, ?seed=
supersedes: 
---

# DEC-483: A seed link prefills the new-game card's seed box

**Ruling.** "yes prepopulate the box". When the page is opened with `?seed=` in its address, the new-game card opens with that seed in its seed box. The player still picks the mode and presses start. With no `?seed=` the box opens blank, as before.

**Why.** The owner was copying the seed out of a link's address and typing it into the box: "it doesnt automatically open a run or anything. I usually just copy the seed from the URL and put it back".

**Replaces.** Nothing standing. It adds one exception to the 2026-09-06 call that the box is always blank (a code comment in `_openSetup`, not a record); that call's reason, never silently replaying the standing world, still holds for every launch without a link.

**Source.** Owner, in chat, 2026-11-23. Owner's words.
