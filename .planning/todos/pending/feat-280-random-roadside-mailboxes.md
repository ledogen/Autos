---
id: FEAT-280
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "We should work on adding world clutter to make it feel more interesting. I'd like to see a proposal for making the sign system functional. I think wor…"
relates: FEAT-72, FEAT-278, FEAT-275, ASSET-22
---
lane: Engine & world

# FEAT-280: Random mailboxes around the world, part of the clutter system

## Next steps
Owner look (card mailboxes-look): are lone roadside mailboxes (~1.9 per km) right, or only at houses? The main.js hook that draws them is not built (FEAT-275's Next steps). FEAT-278 can later stream them: they are `poiSystem.mailboxes()` records.

## Summary
Put random mailboxes around the world as part of the world-clutter system (separate from the signs).

## Description
Owner's words, verbatim (inbox 20261118013441-v9hd):

> We should work on adding world clutter to make it feel more interesting. I'd like to see a proposal for making the sign system functional. I think world clutter can go in after the initial loading screen. Since the player doesn't see it all at once, it can stream in slowly right after a new game is started. It would be cool to mark things like hairpin turns, steep grades, etc. with little signs that actually reflect what you are going to see. 
> Separately, but still as part of the world clutter system, I think we could put random mailboxes around.

One owner message (inbox 20261118013441-v9hd) split into three tickets: FEAT-278 (the clutter system and its streaming), FEAT-279 (the sign-system proposal), FEAT-280 (random mailboxes).

## Tracker
- [x] Mailboxes appear at random around the world (a seeded walk, one candidate per 150 m of road, ~1.9 per km after the reject tests; drawing needs the main.js hook)
- [ ] They come in through the world-clutter system (FEAT-278): that system does not exist yet; they are plain records (poiSystem.mailboxes()) so it can stream them

## Decisions
- Placement derived from road geometry: a verge 1.2 m past the shoulder edge, door to the road, never on the deck, a junction pad, a roster pad, in a bore, in water or in a ditch (ground within 0.7 m of the road top). Deterministic per seed, cold, nothing saved.
- Knockable (DEC-394), same masses as FEAT-275's.

## Open questions
- Where do random mailboxes go: along roads, at driveways, away from houses? Built: along roads, no house needed ("random mailboxes around"). CONFLICT to flag: a lone mailbox with no house reads as litter (the FEAT-71 rule: nothing spawns without an anchor that reads as habitation), and DEC-398 ("never any extra distractions") says only the route's houses are targets: a lone mailbox is not a target (no halo) but a player may aim at it. Owner's call: keep lone ones, only at house sites, or none.

## Links
FEAT-72, FEAT-278, FEAT-275, ASSET-22

## Files
assets/models/mailbox*.glb · the clutter system

## Log
- 2026-11-18 land/feat-275-280-mailboxes: poi.js _mailboxAt / _placeMailboxesOnEdge (poiMailboxSpacing 150, poiMailboxSep 60), test/mailbox-census.mjs (12 seeds). Draw needs the main.js hook.
- 2026-11-17 minted by the scribe from the owner's inbox (20261118013441-v9hd).
- 2026-11-18 proof: census 12 seeds PASS, random 1.7-1.9 per km, none on deck/pad/bore/water/ditch, door within 0.9 of the road. Found: main's FEAT-292 _evenRequisition throws on seed 6666666 at C=(0,0) R=2500 (mission.js:1290), not mailbox-related; census avoids that seed.
