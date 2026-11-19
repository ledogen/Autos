---
id: FEAT-278
type: feature
status: in-progress
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "We should work on adding world clutter to make it feel more interesting. I'd like to see a proposal for making the sign system functional. I think wor…"
relates: FEAT-72, FEAT-71, FEAT-85, FEAT-279, FEAT-280, PERF-27
---
lane: Engine & world

# FEAT-278: World clutter: add it after the loading screen, streamed in slowly

## Next steps
Owner: "Good" (card `feat278-clutter-look`, 2026-11-19). The orchestrator lands `land/feat-275-280-mailboxes` first, then this
branch (it already carries main + mailboxes; the route-house mailboxes come in through `_clutter.add()` here). Signs
(FEAT-279's dive, DEC-430 own pool) come in through the same queue later.

## Summary
Add world clutter so the world feels more interesting. It goes in after the initial loading screen: the player does not see it all at once, so it streams in slowly right after a new game starts.

## Description
Owner's words, verbatim (inbox 20261118013441-v9hd):

> We should work on adding world clutter to make it feel more interesting. I'd like to see a proposal for making the sign system functional. I think world clutter can go in after the initial loading screen. Since the player doesn't see it all at once, it can stream in slowly right after a new game is started. It would be cool to mark things like hairpin turns, steep grades, etc. with little signs that actually reflect what you are going to see. 
> Separately, but still as part of the world clutter system, I think we could put random mailboxes around.

One owner message (inbox 20261118013441-v9hd) split into three tickets: FEAT-278 (the clutter system and its streaming), FEAT-279 (the sign-system proposal), FEAT-280 (random mailboxes).

## Tracker
- [ ] World clutter exists as one system, signs and mailboxes included: src/clutter.js carries the yards and (merged 2026-11-19) the route-house mailboxes; signs wait on FEAT-279
- [x] Owner look (card feat278-clutter-look): "Good", 2026-11-19
- [x] It is built after the loading screen and streams in after a new game starts, nearest the truck first (2026-11-18)
- [x] The loading screen (cold-load budget) does not get longer: rebuild 13.4 / 13.3 ms vs main 14.1 / 13.6 ms (go-live 14.0 s both)

## Decisions
- 2026-11-18 (lane, simplest design, the owner's to overrule): today's clutter is the FEAT-71 yards only; no new kind
  of clutter was invented (signs and mailboxes are the only ones he named, both held). Budget: ≤ 1 ms of main thread a
  frame (`CLUTTER_MS`, inside the PERF-33 shared budget), 0 added draw calls, 0 added triangles.
- Not instanced, measured: the clutter is many different models a few copies each (yards ~20 models over ~45 pieces;
  mailboxes 11 flavours × 3–7 primitives, signs 7 × 3). Instanced meshes cannot frustum-cull per copy, so they would draw
  every model region-wide each frame against today's 10 draw calls for all POIs in view. Instancing pays for many
  copies of one mesh, which the prop system already does.

## Open questions
- What counts as "clutter" beyond signs and mailboxes? He named only those two.
- ~~What budget does the stream stay inside?~~ ≤ 1 ms/frame, no draw calls added (Decisions).

## Links
FEAT-72 (road-furniture placement), FEAT-71, FEAT-85 (roadside cover), PERF-27

## Files
src/ (a new clutter module) · src/main.js load path

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261118013441-v9hd).
- 2026-11-18 built (dcf25663, merged main ecb56af6): src/clutter.js queue, spawnModel clones a loaded model synchronously,
  main.js queues the yards behind the loading screen and drains ≤ 1 ms/frame once it lifts. Gate clutter-stream (new);
  affected gates green; fingerprint-world ALL IDENTICAL to main. 2 seeds: the whole stream lands in 2 frames; p99 frame in
  the 10 s after load 54.8 / 56.3 ms vs main 48.8 / 62.9 (box at load 6–9: same). No 2 km drive bench: nothing of this runs after those 2 frames.
- 2026-11-18 on main 24929f9b merged: affected gates 24/24; smoke 1 failed at the known DEC-357 blink flake, re-run PASS
  40/40; pad-e2e ALL OK. Sheet wip/feat-278/sheet.jpg (seeds 4182, 77031, 1018248781; main | branch identical).
- 2026-11-19 landing prep after the owner's "Good": merged land/feat-275-280-mailboxes (with main 01f3ea28): 900dc1f3 resolved 2 main.js hunks (yards keep `_clutter.add`; the route-house mailbox loop now also queues through `_clutter` and its key joins the prefetch), b8a11803 clean. Affected gates 63/63 green; fingerprint-world vs main: only `poi` (seed6/seed11 origin story, the mailbox satellites), rest identical; tutorial seed 1872706826: only `poi` satellites (+1 mailbox per residence). Sweep: none of this branch's files reach the headless build, so the mailboxes sweep (400/400) covers it. cdp-smoke PASS 41 steps, pad-e2e ALL OK.
