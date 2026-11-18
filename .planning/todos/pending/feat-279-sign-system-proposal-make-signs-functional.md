---
id: FEAT-279
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "We should work on adding world clutter to make it feel more interesting. I'd like to see a proposal for making the sign system functional. I think wor…"
relates: FEAT-72, ASSET-31, FEAT-278
---
lane: Engine & world

# FEAT-279: A proposal for making the road-sign system functional

## Next steps
A lane writes the proposal for the owner, from FEAT-72's existing rules ("a sign that lies is worse than no sign"). No build yet.

## Summary
The signs are built (ASSET-31) but nothing places them. The owner wants a proposal for a functional sign system: little signs marking hairpin turns, steep grades and the like that reflect what the player is about to see.

## Description
Owner's words, verbatim (inbox 20261118013441-v9hd):

> We should work on adding world clutter to make it feel more interesting. I'd like to see a proposal for making the sign system functional. I think world clutter can go in after the initial loading screen. Since the player doesn't see it all at once, it can stream in slowly right after a new game is started. It would be cool to mark things like hairpin turns, steep grades, etc. with little signs that actually reflect what you are going to see. 
> Separately, but still as part of the world clutter system, I think we could put random mailboxes around.

One owner message (inbox 20261118013441-v9hd) split into three tickets: FEAT-278 (the clutter system and its streaming), FEAT-279 (the sign-system proposal), FEAT-280 (random mailboxes).

## Tracker
- [ ] A written proposal reaches the owner (what each sign marks, how it is placed from road geometry, how it never lies)
- [ ] The owner picks from it before anything is built

## Decisions

## Open questions
- Which hazards get a sign (hairpin, steep grade, others)?
- Is a proposal enough for the alpha, or is it post-alpha? He said nothing on release.

## Links
FEAT-72, ASSET-31, FEAT-278

## Files
FEAT-72 (road-furniture placement) · assets/models/sign-*.glb

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261118013441-v9hd).
