---
id: FEAT-277
type: feature
status: closed
severity: major
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "after f266 is settled: we can add a little more juice to the paper route mission type. lets build 3x small house poi models to add to the residences p…"
relates: FEAT-266, FEAT-64, FEAT-276, ASSET-91, FEAT-282, src/physics-engine.js
---
lane: Places and Missions

# FEAT-277: Thrown papers get physics; a shot scores where the paper comes to rest

## Next steps
Built on land/feat-276-277-paper-throw (lane s, 2026-11-18): the owner drives a round (owed card paper-throw-try) and lands it or asks for a change.

## Summary
Throwing a paper at a house wall or door should drop it into the circle. A shot scores where the paper comes to rest (still for more than 0.25 s), since it can land on a POI model. Almost no rebound, very high ground friction, and a way to stop it rolling.

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
- [x] A paper thrown at a wall or the front door stops dead and falls straight down into the circle (gate: drops 0.1–0.6 m off the wall)
- [x] A shot is scored where the paper has been at rest for more than 0.25 s, including on top of a POI model
- [x] Almost no rebound, very high ground friction; the paper does not roll away or down hills (gate: 0 cm on 10° and 20° banks)
- [x] A throw at the ground near a mailbox does not bounce out of the halo as a miss (413 throws: 0.5 % rest outside the circle, all from the rim)
- [ ] Predictable: the player can aim the one small bounce or slide to stop at the mailbox (owner's drive)

## Decisions
- Roll stop (Open question 1), lane's build: the collider is the asset's own flattened oval (an octagon prism inscribed in 90 × 66 × 420 mm, at the drawn 2×), thrown BROADSIDE with no spin, μ 3 (pair 1.55 on grass), e 0, plus the engine's rolling resistance 1. The coin was not needed; rolling resistance is the owner's option (2), "sketchy", kept because at 0 a paper rolls off a 20° bank. Owner to confirm on the card.
- At rest: centre speed < 0.1 m/s and spin < 1 rad/s for > 0.25 s; hard timeout 8 s after the throw (scored where it is then). A scored paper's body is destroyed and its mesh stays on the lawn (the 40-paper trail). At most 8 papers are bodies at once (a ninth throw settles the oldest where it is).

## Open questions
- Stopping the roll: (1) a short, flat, coin-shaped collider, (2) resistance on the roll axis (he called it "sketchy"), or (3) in a pinch, score where it first touches the ground, and wait to freeze only when it hits a POI. Built: the real oval shape + broadside + rolling resistance (see Decisions); on the card.

## Links
FEAT-266, FEAT-64, FEAT-276, ASSET-91, FEAT-282, src/physics-engine.js

## Files
src/paper-route.js · the thrown-paper body (physics-engine.js adapter only) · terrain-physics.js (POI colliders)

## Log
- 2026-11-18 lane s: look sheet redone (wip/paper-throw/sheet.mjs). Night panel was black because the truck's lights spawn OFF (default mode 0) and the first shot used the free camera; with low beams on the ring and spike read. Cyan beam = the free camera's Teleport-here cursor, not the halo. Aimed throw at the ring centre lands 0.28 m off (bullseye). `_paperSizeIdx` TDZ on early scenario click exists on main too: not touched, see report. No src change.
- 2026-11-18 lane s, land/feat-276-277-paper-throw: throw.js PaperThrows + debris.js 'paper' (authored hull, quadratic drag, rest clock); simulateThrow retired. Gate test/paper-throw.mjs; smoke papers step now waits for the paper to rest and score. 413-throw census (12 seeds, wip/paper-throw/measure.mjs): tiers before/after bullseye 3.9/5.3, great 44.1/42.9, ok 46.7/45.3, bad 5.3/6.1, miss 0/0.5 %; rest point vs old landing median 0.46 m, p90 1.70 m. fingerprint-physics identical to main.
- 2026-11-17 minted by the scribe from the owner's inbox (20261118013250-sf5w).

- 2026-11-19: owner, in chat: "the spike should be even taller than it is on 8005. otherwise the throwing and physics is good. good damping too." Spike 1 m → 3 m. Landed on main. The porch throw is reviewed on FEAT-295.
