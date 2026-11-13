---
id: PERF-47
type: perf
status: open
severity: minor
opened: 2026-11-13
source: perf lane, 2026-11-13 — the PERF-40 bench record at 08768a0b read main-thread 469 / 616 / 768 ms/s (drive / map / park) against 192 / 151 / 170 at b71cd825
relates: PERF-40, src/engine-audio.js, src/tire-audio.js, src/wind-audio.js, src/ambient-audio.js, src/knock-audio.js, src/rank-music.js, src/pump-audio.js, test/playtest-bench.mjs
---
lane: engine & world (the perf lane)

# PERF-47: A stalled audio clock piles up AudioParam events, and main-thread cost climbs without bound

## Next steps
Bench half done on land/perf-regress (the bench refuses a stalled host). The game half, a guard in the audio
update path, is open: perf lane, when the orchestrator picks it. Owner: restart coreaudiod before the next bench record.

## Summary
When the host's audio output stops pulling samples, a running WebAudio context's clock (`ctx.currentTime`) stands
still. The game calls `AudioParam.setTargetAtTime` (schedule a value change on an audio parameter's timeline) on
every frame for the engine, tires, wind and ambience (85 call sites across seven modules). The browser drops a timeline's events only once the clock passes them. With the
clock stopped nothing is dropped, each new call has a longer list to insert into, and the cost climbs linearly
for the whole session. On 2026-11-13 the bench host's CoreAudio was wedged. That alone explains the record at 08768a0b.
No code in b71cd825..08768a0b caused it.

## Description
### What was measured (2026-11-13, one seed 1768572700, quiet machine)
- All of the extra cost is in the `frame.postStream` bucket. The render bucket FELL (82 → 47 ms/s driving).
  postStream per second on 08768a0b: 46 at the drive's start, then 143, 305, 388, 492 and 590 by 300 s; 573–589 on
  the map; 676–714 parked. The b71cd825 record from the night before stayed flat at 16–23 ms/s.
- A same-machine A/B, b71cd825 run today: it climbs the same way (23 → 302 driving, 356–371 parked). The code range
  is cleared.
- A CPU profile taken alongside the bench: `setTargetAtTime` self time was 107 ms/s at t = 40 s and 446 ms/s at
  t = 230 s. Nothing else grew.
- A fresh AudioContext in the bench page: `state` 'running', but `currentTime` advanced 0.006 s per 1 s of wall time.
- Outside Chrome: `afplay -v 0 Tink.aiff` (a 0.56 s sound) hung until it was killed at 8 s. coreaudiod had been up
  10 days.

### Player exposure
Any machine whose audio output stalls, for example a wedged audio daemon or possibly an output device that drops
out mid-session, takes the same unbounded climb. At about 2 ms/s per second of play, the main thread fills its
1000 ms/s in about 8 minutes. Not reproduced on a player machine. Normal audio never trips it.

### Fix options (the game half)
1. One `audioClockLive()` in engine-audio.js: is `ctx.currentTime` ahead of the last frame's value? Each
   per-frame `update*Audio` returns early when it is not. At 60 fps a live clock always moves (one render quantum
   is 2.9 ms), so a healthy session is unchanged. Recommended.
2. `cancelScheduledValues(now)` before each `setTargetAtTime`. That touches all 85 sites, and it changes the ramps.

## Tracker
- [x] Cause found: a host audio stall, not a code regression (profile + same-machine A/B)
- [x] The bench refuses a stalled host: the session FAILS before the drive with "the host's audio clock is stalled"
- [ ] The game guards its per-frame automation on a live clock (option 1), and is proven with a page-level test
      that pins the clock
- [ ] The bench's audio check passes on a healthy host (after coreaudiod is restarted)

## Files
`test/playtest-bench.mjs` · `src/engine-audio.js` (getAudioContext) and the six other `src/*-audio.js` / `rank-music.js`

## Log
- 2026-11-13: diagnosed. Raw data: CarGame-perf/wip/perf-regress (s1 = the A/B, prof1.log = the profile, s3 = the
  check tripping at 0.006 s/s). The 08768a0b record in history.jsonl is a host artifact. Recommend dropping it.
