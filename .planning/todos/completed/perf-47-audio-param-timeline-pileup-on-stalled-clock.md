---
id: PERF-47
type: perf
status: closed
severity: minor
opened: 2026-11-13
source: perf lane, 2026-11-13 — the PERF-40 bench record at 08768a0b read main-thread 469 / 616 / 768 ms/s (drive / map / park) against 192 / 151 / 170 at b71cd825
relates: PERF-40, src/engine-audio.js, src/tire-audio.js, src/wind-audio.js, src/ambient-audio.js, src/knock-audio.js, src/rank-music.js, src/pump-audio.js, test/playtest-bench.mjs
---
lane: engine & world (the perf lane)

# PERF-47: A stalled audio clock piles up AudioParam events, and main-thread cost climbs without bound

## Next steps
None. Closed by the owner 2026-11-14 (see Decisions). Restart coreaudiod before the next bench record: the bench refuses a stalled host on its own.

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

### The fix (the game half, 2026-11-13)
`audioClockLive()` in engine-audio.js, next to `getAudioContext()`: over a 0.25 s wall window, did `ctx.currentTime`
advance at least 0.25 s per wall second? Judged per window, not per call, so every module gets the same answer in a
frame whatever order it calls in; a gap over 1 s (a hidden tab) re-anchors without a verdict. The nine per-frame
entries return early on false: updateEngineAudio, setCabView, setInTunnel, startCrankAudio, updateKnockAudio,
updateTireAudio, updateWindAudio, updateAmbientAudio, updateRankMusic. One-shots and on/off edges stay unguarded (a
bounded count). Resume needs no special case: the next setTargetAtTime ramps from where the param sits, so no pop.

Measured: free roam, seed 6, engine idling, parked 120 s, main-thread ms/s per second (wip/perf-47/park.mjs):

| clock | build | p50 | p99 | worst | first 10 s → last 10 s |
|---|---|---|---|---|---|
| stalled (this host, 0 s/s) | before | 330 | 392 | 396 | 176 → 383 |
| stalled | after | 175 | 194 | 199 | 160 → 170 (flat) |
| live (`--disable-audio-output`, 1.0 s/s) | before | 154 | 173 | 173 | |
| live | after | 153 | 174 | 174 | |

On the stalled host after the fix, setTargetAtTime leaves the profile's top 12. On a live clock its self time is
2.8 ms/s before, 3.1 after (CPU profile, 10 s): the healthy path is unchanged.

Skipping a re-schedule when the target value has not changed was NOT added: on a live clock all of setTargetAtTime
costs ~3 ms/s, so it would save at most that, against a value cache at all 85 call sites.

### Fix options considered
1. One `audioClockLive()` in engine-audio.js: is `ctx.currentTime` ahead of the last frame's value? Each
   per-frame `update*Audio` returns early when it is not. At 60 fps a live clock always moves (one render quantum
   is 2.9 ms), so a healthy session is unchanged. Recommended.
2. `cancelScheduledValues(now)` before each `setTargetAtTime`. That touches all 85 sites, and it changes the ramps.

## Tracker
- [x] Cause found: a host audio stall, not a code regression (profile + same-machine A/B)
- [x] The bench refuses a stalled host: the session FAILS before the drive with "the host's audio clock is stalled"
- [x] The game guards its per-frame automation on a live clock (option 1), proven by test/audio-clock-guard.mjs
      (a fake context with a held clock: 0 events after 0.5 s stalled, resumes in 0.2 s) and on the stalled host
- [x] Owner listen after landing: nothing should sound different ("sounds right", 2026-11-14)
- [ ] The bench's audio check passes on a healthy host (after coreaudiod is restarted). Left open at close: a host chore, not the game's; the check refuses a stalled host by itself.

## Decisions
- 2026-11-14, owner: "sounds right"

## Files
`test/playtest-bench.mjs` · `src/engine-audio.js` (audioClockLive) · `src/tire-audio.js` · `src/wind-audio.js` ·
`src/ambient-audio.js` · `src/knock-audio.js` · `src/rank-music.js` · `test/audio-clock-guard.mjs` · `test/gates.mjs`

## Log
- 2026-11-13: diagnosed. Raw data: CarGame-perf/wip/perf-regress (s1 = the A/B, prof1.log = the profile, s3 = the
  check tripping at 0.006 s/s). The 08768a0b record in history.jsonl is a host artifact. Recommend dropping it.
- 2026-11-13: game half. audioClockLive() guard on the nine per-frame entries; gate test/audio-clock-guard.mjs (fails
  on main: 23984 events in 9.5 s stalled). Stalled host parked 120 s: p50 330 → 175 ms/s, the climb gone. Live clock
  (Chrome's fake output) unchanged, 154 → 153. Raw: CarGame-perf/wip/perf-47 (park.mjs, before/after-*.json).
- 2026-11-14: closed by the owner after the listen (Decisions).

## Resolution (2026-11-14)
The guard (`audioClockLive()`) and the bench's stalled-clock refusal are on main. The owner heard no change. Closed.
