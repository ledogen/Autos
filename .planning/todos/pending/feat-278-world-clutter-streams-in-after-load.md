---
id: FEAT-278
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "We should work on adding world clutter to make it feel more interesting. I'd like to see a proposal for making the sign system functional. I think wor…"
relates: FEAT-72, FEAT-71, FEAT-85, FEAT-279, FEAT-280, PERF-27
---
lane: Engine & world

# FEAT-278: World clutter: add it after the loading screen, streamed in slowly

## Next steps
Owner sees FEAT-279's proposal first; this ticket holds the system and its streaming rule.

## Summary
Add world clutter so the world feels more interesting. It goes in after the initial loading screen: the player does not see it all at once, so it streams in slowly right after a new game starts.

## Description
Owner's words, verbatim (inbox 20261118013441-v9hd):

> We should work on adding world clutter to make it feel more interesting. I'd like to see a proposal for making the sign system functional. I think world clutter can go in after the initial loading screen. Since the player doesn't see it all at once, it can stream in slowly right after a new game is started. It would be cool to mark things like hairpin turns, steep grades, etc. with little signs that actually reflect what you are going to see. 
> Separately, but still as part of the world clutter system, I think we could put random mailboxes around.

One owner message (inbox 20261118013441-v9hd) split into three tickets: FEAT-278 (the clutter system and its streaming), FEAT-279 (the sign-system proposal), FEAT-280 (random mailboxes).

## Tracker
- [ ] World clutter exists as one system, signs and mailboxes included
- [ ] It is built after the loading screen and streams in slowly after a new game starts
- [ ] The loading screen (cold-load budget) does not get longer

## Decisions

## Open questions
- What counts as "clutter" beyond signs and mailboxes? He named only those two.
- What budget (draw calls, frame ms) does the slow stream stay inside?

## Links
FEAT-72 (road-furniture placement), FEAT-71, FEAT-85 (roadside cover), PERF-27

## Files
src/ (a new clutter module) · src/main.js load path

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261118013441-v9hd).
