---
id: FEAT-276
type: feature
status: closed
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "after f266 is settled: we can add a little more juice to the paper route mission type. lets build 3x small house poi models to add to the residences p…"
relates: FEAT-266, FEAT-187, FEAT-282, FEAT-277
---
lane: Places and Missions

# FEAT-276: Paper target halo: green, centre spike marks the bullseye

## Next steps
Built on land/feat-276-277-paper-throw with FEAT-277; the owner looks at the halo (owed card paper-throw-try) and says which reading of ".5m smaller dia but slightly taller" he meant.

## Summary
Rework the paper target halo: a small centre spike marks the bullseye, the ring about 0.5 m smaller in diameter and slightly taller, the halo green, the centre white.

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
- [x] A small centre spike marks the bullseye
- [ ] The ring is about 0.5 m smaller in diameter and slightly taller than today (read as the SPIKE, see Open questions; the ring stays the 5 m scored circle)
- [x] The halo is green; the centre stays white

## Decisions

## Open questions
- Bullseye is within 0.5 m of the centre (FEAT-282): does the spike's size show that radius? He did not tie them. Built: the spike is 0.5 m across, so it marks the centre, not the 1 m bullseye disc (the old pip did).
- ".5m smaller dia but slightly taller halo": built as the centre spike (old pip 1 m × 0.5 m → 0.5 m across × 1 m tall, 0.5 m above the sink). If he meant the OUTER ring, it is a scoring change, not a look: the ring IS the scored circle (poiHouseTargetR 5 m), so 0.25 m off its radius moves the scoring rim and every tier with it. On the card.

## Links
FEAT-266, FEAT-187, FEAT-282, FEAT-277

## Files
the paper target halo (src/paper-route.js and its mesh)

## Log
- 2026-11-18 lane s: night look checked: ring (Lambert + headlights, FEAT-180) is readable with the low beams on, near-black with lights off like every prop; no src change. White spike is drawn (_targetPipMat, 0.25 m radius), thin at distance.
- 2026-11-18 lane s, land/feat-276-277-paper-throw: ring green (UI-STYLE --money #8ce99a, Lambert-lit like every ring), centre a white 0.5 × 1.0 m spike; the demolition halo keeps the old white ring and pip (DEC-414 names the paper's only). Sheet wip/paper-throw/sheet.jpg.
- 2026-11-17 minted by the scribe from the owner's inbox (20261118013250-sf5w).

- 2026-11-19: owner, in chat: "the spike should be even taller than it is on 8005. otherwise the throwing and physics is good. good damping too." Spike 1 m → 3 m. Landed on main. The porch throw is reviewed on FEAT-295.
