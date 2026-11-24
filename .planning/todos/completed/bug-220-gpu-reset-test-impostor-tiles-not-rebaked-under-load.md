---
id: BUG-220
type: bug
status: closed
severity: minor
opened: 2026-11-18
source: lane agents, 2026-11-17 and 2026-11-18
---
lane: engine & world

# BUG-220: After a GPU reset, 8 tree-impostor atlas tiles are still empty when the test measures (seen twice under load)

## Next steps
Done on branch land/test-reliability-1121: the test was wrong. Move the ticket to completed when it lands.

## Summary
The gpu-reset test failed with 8 empty impostor-atlas tiles on first runs at load 9 to 11 and passed on re-runs (after FEAT-235 on 11-17, and on the BUG-217 branch on 11-18).

## Description
Twice is not noise. If a player's GPU resets under load, trees may show blank billboards until the re-bake completes: measure how long that is.

## Tracker
- [x] Cause found: the TEST (readback flake), not the game
- [x] Fix: test/gpu-reset.mjs; 5/5 at 1x and 5/5 at 4x throttle (GPU_THROTTLE=4)

## Decisions

## Open questions

## Links
FEAT-235, BUG-217

## Files

## Log
- 2026-11-18 minted by the orchestrator.
- 2026-11-21 lane agent: the game never re-bakes except in its context-restored listener (synchronous). With NO reset (--mode=none) the same atlas read 8, 0, 8, 8, 0 ... empty tiles (always aspen#0-3 + pine#0-3) on consecutive reads: `__impAtlasStats` readback is flaky, so one read proves nothing. Test now counts a tile empty only if empty on all of 5 reads and waits (bounded 60 s) until that count is back to its pre-reset value. 5/5 pass at 1x, 5/5 at 4x. Unexplained: why the readback flips (readRenderTargetPixels of the half-float atlas); the game does not read it back.

- 2026-11-21: closed. Verdict: the test, not the game (the atlas readback is flaky on single reads; the test now needs 5 agreeing reads and a bounded wait). 5/5 at 1x and 5/5 at 4x throttle. Open note: why the readback flips between 8 and 0 empty tiles with no reset is unexplained.
