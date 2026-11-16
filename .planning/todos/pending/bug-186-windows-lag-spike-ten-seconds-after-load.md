---
id: BUG-186
type: bug
status: open
severity: major
opened: 2026-11-16
source: owner, 2026-11-16, inbox — "This is gonna be a really tricky bug to track down I think If I load up a world on the Windows machine and start driving about 9 or 10 seconds in, I get hit with a huge lag spike in frame drop Probably down to an average of 5 frames per second Very sporadic, not an even 5 fps It feels like the world catching up Also, sometimes when I drive for a very long time, it'll hit me again for like 5 or 10 minutes of driving It's the absolute worst if you spawn in and just immediately take off Especially if you're loading a save where the vehicle is already in motion. I haven't observed it on the Mac yet, but if it's from a newer build I haven't been testing on the Mac and it's very heavily loaded so I can't easily test on it without stopping everything. Or it could just be that the Mac is faster."
relates: PERF-50, PERF-45, FEAT-227, src/main.js, src/terrain.js
---
lane: Perf

# BUG-186: Windows: a lag spike to about 5 fps roughly 10 s after loading, and again on long drives

## Next steps
Perf lane: find what runs about 10 s after load and on streaming; reproduce on the Mac under CPU throttle if possible.

## Summary
On the Windows machine, 9 to 10 s after a world loads and the truck drives off, the frame rate drops to an uneven 5 fps for a while ("feels like the world catching up"). It recurs after long drives, and is worst when taking off at once or resuming a save already in motion. Not seen on the Mac, which is faster and has not run the newest build under test.

## Tracker
- [ ] What is scheduled about 10 s after load (shader pre-warm sweeps, far shadow, road network adoption, chunk backlog) listed with costs
- [ ] Reproduced, or the reason it cannot be on the Mac stated
- [ ] Fixed or bounded: worst frame after load, before and after
- [ ] Owner confirms on Windows

## Log
- 2026-11-16: filed from the owner's inbox note.
