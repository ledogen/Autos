---
id: FEAT-275
type: feature
status: open
severity: minor
opened: 2026-11-17
source: owner, 2026-11-17 (inbox) — "after f266 is settled: we can add a little more juice to the paper route mission type. lets build 3x small house poi models to add to the residences p…"
relates: FEAT-266, FEAT-276, FEAT-72, FEAT-71, ASSET-22
---
lane: Places and Missions

# FEAT-275: Add the mailboxes to Larry's pool

## Next steps
Owner look (card mailboxes-look). The src/main.js hook that draws the roadside ones is NOT built (another agent's file): `wip/mailboxes/main-hook.txt` in the lane worktree, ~6 lines, then the FEAT-276 halo has a mailbox to sit on.

## Summary
Put the mailbox models (ASSET-22, built, unplaced) into Larry's pool, so a paper route has a mailbox to aim at.

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
- [x] Mailbox models are in Larry's pool and appear as paper-route targets or beside them (data + placement done; the roadside ones need the main.js hook to DRAW — see Next steps)
- [ ] The target halo (FEAT-276) sits on a mailbox

## Decisions
- Read "Larry's pool" as the residence pool Larry's house is dressed from, plus the paper-route houses: a new pool tag `mailbox` (11 flavours, uniform draw per place), NOT `lawnFurniture` (eleven of them would swamp the yard scatter). Agent's reading, awaiting the owner's look.
- One mailbox per recipient house (the open question's recommended answer): Larry's and mom's pads carry one on the pad's road edge, every paper-route house one on its verge.
- Knockable, DEC-394: each flavour has a mass (8 kg classic .. 150 kg masonry pillar).

## Open questions
- How the mailboxes sit with the houses: one per recipient house, or standalone? He did not say.

## Links
FEAT-266, FEAT-276, FEAT-72, FEAT-71, ASSET-22

## Files
src/poi.js · data pools · assets/models/mailbox*.glb

## Log
- 2026-11-18 land/feat-275-280-mailboxes: pool tag + knock masses (data/prop-models.js), poi.js mailboxKey / dressYard pad mailbox / _mailboxAt route-house mailboxes, test/mailbox-census.mjs. Roadside draw needs the main.js hook (wip/mailboxes/main-hook.txt).
- 2026-11-17 minted by the scribe from the owner's inbox (20261118013250-sf5w).
- 2026-11-18 proof: test/mailbox-census.mjs 12 seeds PASS (120 route + 1904 random mailboxes, 1.88/km); affected gates 49/49 green after two fixes (dist-assets tag consumer, census seed); fingerprint-world vs main: only `poi` differs (seed6 + seed11 origin story windows); cdp-smoke PASS (39 steps) and pad-e2e ALL OK; sheet wip/mailboxes/sheet.jpg (Larry's, a yard house, mom's). Unverified: the roadside ones in the browser (needs the main.js hook).
