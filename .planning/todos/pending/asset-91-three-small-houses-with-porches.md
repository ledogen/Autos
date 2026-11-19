---
id: ASSET-91
type: asset
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "after f266 is settled: we can add a little more juice to the paper route mission type. lets build 3x small house poi models to add to the residences p…"
relates: FEAT-266, FEAT-74, FEAT-71, FEAT-277
---
lane: C (models)

# ASSET-91: Three small house POI models with porches, decks or landings, for the residences pool

## Next steps
Built and registered (no pool) on `land/asset-91-porch-houses`. Owner look owed: card `asset91-porch-houses-look`, sheet
`wip/asset-91/sheet.jpg` in main. On "Good": land, close this ticket. Placing them on the route is FEAT-295.

## Summary
Build three small house models for the residences pool, each with a porch, front deck, or stairs with a landing, so a thrown paper has something to land on. Authored per `.planning/research/ASSETS.md` and ART-STYLE.md.

## Description
Owner's words, verbatim (inbox 20261118013250-sf5w):

> after f266 is settled:
> we can add a little more juice to the paper route mission type. lets build 3x small house poi models to add to the residences pool. they should include porches or front decks or just stairs with a landing. 
> We should also add the mailboxes to Larry's pool.
> rework the paper target halo to have a small center spike to mark the "bullseye" about .5m smaller dia but slightly taller halo would work. change the paper halo to green. leave the center white.
> then we add physics to the thrown papers. what i want: ability to throw the paper at the wall of a house or the front door and have it fall down into the circle. Since the paper can land on top of the POI, we should detect when the paper has come to rest for more than a quarter second, and then count the shot scored where it lies Since we can't rely on it touching the ground like we do currently if it falls on a poi model
> what i dont want: A player to throw at the ground near a mailbox and it bounces out of the halo, scoring them a miss. The physics on the newspaper should have almost no rebound. If you throw it at the wall it should basically come to a dead stop and fall straight down. It should also have very high friction on the ground and we need to find some way to prevent it from rolling. Because it's cylindrically shaped it might just want to roll down all hills or after a toss keep its momentum and roll away. A couple things that come to mind are making its collision a short flat disc like coin shaped so it doesn't roll very easily, adding resistance to its roll axis, which but that one seems sketchy. Or, in a pinch, we can just score the paper where it lands the first time it touches the ground. If it hits a POI, we wait for it to fall down and freeze, but if it hits the ground, we just call it where it touches. I would love if it had predictable physics and a tendency to arrest its slide very quickly in a way that is intuitive to the player so you get both physics and the skill element of aiming, predicting the one small bounce or slide to make it stop right at the mailbox.

Paper-route juice, one owner message (inbox 20261118013250-sf5w) split into four tickets: ASSET-91 (houses), FEAT-275 (mailboxes in Larry's pool), FEAT-276 (halo), FEAT-277 (thrown-paper physics). He said it follows FEAT-266, which landed 2026-11-17.

## Tracker
- [x] Three small house .glb models, each with a porch, a front deck, or stairs with a landing (`cottage-porch`, `ranch-deck`, `cabin-landing`)
- [x] Authored to the asset convention (flat colours, faceted, no textures) with the ticket's tri budget and collision metadata (1484 / 1098 / 1266 tris; body + porch-floor boxes)
- [ ] Owner look (card asset91-porch-houses-look)
- [ ] The .glb ships (an asset ticket closes then; registering them in the pool is FEAT-74 / FEAT-295)

## Decisions
- One kit generator, three .glb (ASSETS.md kit rule): `assets/models/src/porch-houses.py`; `-- export`, `-- render` headless.
- Every porch floor is under 0.76 m (the real-world height above which a porch needs a guard), so no railing crosses
  the road side. The ranch deck's two end rails were built and removed: from an oblique thrower they stood in front of
  the door, and as soft (non-colliding) parts a paper would fly through them. The cabin's stair handrail is on the wall side for the same reason.
- Collision: body box to the eave + a solid porch-floor box (ground to floor top). Steps, stair, posts, porch roof and
  roofs are soft. NOTE: the doctor's office landing/steps are drive-through by owner ruling (2026-10-31); these porch
  floors are solid on purpose (a paper must rest on them), so the truck stops at a 0.40-0.72 m porch edge.

## Open questions
- Solid porch floors stop the truck (unlike the doctor's office landing). Owner's call on the card; the alternative is a paper-only collider, which does not exist yet.
- No recolour palette yet: three houses in a five-slot pool will repeat. A siding palette per house is a small follow-up if wanted.

## Links
FEAT-266, FEAT-74, FEAT-71, FEAT-153

## Files
assets/models/ · wip/

## Log
- 2026-11-17 minted by the scribe from the owner's inbox (20261118013250-sf5w).
- 2026-11-19 built: a8c53301 (generator + .glb), 7dc64d09 (registry). Gates dist-assets, model-palette, model-variant,
  poi-collider, tow-seat, poi-yard 6/6 green. Facing 0 inverted, z-fight 0, re-export byte-identical. Unverified: in-game
  look and the paper actually resting on the porch box (FEAT-295's card).
