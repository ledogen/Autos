---
id: DEC-272
status: standing
decided: 2026-11-15
area: story
governs: FEAT-217, FEAT-184, DEC-151, src/main.js, src/vehicle.js, test/park-brake.mjs, tutorial, flat, throttle
supersedes:
---
# DEC-272: The tutorial's flat disables the accelerator until the tire is fixed; regular play never does

**Ruling.** "I think we also have to force the player to stop, maybe just disable the accelerator. Otherwise a player could just not notice it and keep driving around and not really get the point. To be clear, in the regular gameplay loop, we should never disable the accelerator though Just for the tutorial of this part." As built: from the tutorial evening's flat until a tire fixes it, W / RT give no throttle and W does not release the parking brake (`setThrottleCut(_flatOwed())`); the brake, the steering and the automatic's S reverse crawl stay.

**Why.** Nothing made the player stop for the flat.

**Replaces.** Nothing; extends DEC-151's traps by one.

**Source.** Owner, owed card feat217-try, 2026-11-15. Owner's words; the brake/steer/reverse scope is the agent's.
