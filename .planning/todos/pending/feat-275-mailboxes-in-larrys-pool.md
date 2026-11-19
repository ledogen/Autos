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
Owner: "Good: land it" (card `mailboxes-look-2`, 2026-11-19). The orchestrator lands `land/feat-275-280-mailboxes` FIRST, then FEAT-278's `land/feat-278-clutter-stream` (which carries this branch; there the route-house mailboxes stream in through `_clutter`). After landing: close this ticket; the halo-on-mailbox box moves to FEAT-276's follow-up.

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
- [x] Mailbox models are in Larry's pool (tag `mailbox`, ASSET-22's eleven, knockable)
- [x] DEC-429: every residence that is not an RV has one, on the road shoulder at its pad's end, door to the road, base on the drive surface (gate `mailbox-census`)
- [x] DEC-429: no lone roadside mailboxes (FEAT-280 withdrawn, code deleted; the gate asserts zero)
- [x] Every paper-route house has one on the shoulder in front of its target (orchestrator's reading; owner to confirm)
- [x] DEC-429: knocked down costs nothing and it stands again the next run / reload (nothing saved)
- [x] Owner look (card mailboxes-look-2): "Good: land it", 2026-11-19
- [ ] The target halo (FEAT-276) sits on a mailbox (the route-house boxes are there for it)

## Decisions
- Read "Larry's pool" as the residence pool Larry's house is dressed from: a new pool tag `mailbox` (11 flavours, uniform draw per place), NOT `lawnFurniture` (eleven of them would swamp the yard scatter). Agent's reading.
- Knockable, DEC-394: each flavour has a mass (8 kg classic .. 150 kg masonry pillar).
- 2026-11-18, owner (DEC-429): "remove the random clutter boxes ... bring larrys and mom's boxes out to the road. It's okay if they don't sit on the pad, just align them to the earthwork ... they should be on the shoulder. No penalty if the player knocks them down, they just respawn next time. Every residence that is not an RV should also get mailboxes."
- As built for DEC-429: post 0.5 m inside the shoulder's outer edge (7.0 m off the centreline; the lane ends at 5.0), at the pad end the seed picks (a blocked end tries the other, then slides along the road up to 4.5 m), height = sampleRoadTopY there (the drive surface). Residences = POIs tagged `residence` (mom's, Larry's, the five `residence` slots, the three farms: two barns and the produce stall, a farm is a residence per the 2026-10-07 ruling); RV = the model's `rv` flag (the Winnebago). Paper-route houses KEEP a box each, on the shoulder in front of the target (within 3 m along the road): the orchestrator's reading of "About 30% can remain just boxes wherever" (2026-11-18), on the owner's card to overrule. A spot whose nearest road is another stretch (a hairpin of its own run) is rejected.
- "Respawn next time" read as: standing again the next time the markers are built (a new run, a reload, re-entering story mode), like the lawn furniture; nothing is saved. It does NOT reset when you drive away and come back in the same session.

## Open questions
- Owner's aspiration (DEC-429), future work, nothing built: turn most of Larry's delivery targets into residence models with pads ("About 30% can remain just boxes wherever").
- Owner's aspiration (DEC-429), future work, nothing built: when Larry's mission is rebuilt, the objective is to throw the mail onto the PORCH of every residence on the route. Larry's current scoring is untouched.
- Respawn reading: should a knocked mailbox also stand again when you leave and come back in the same run? (A small main.js change if yes.)

## Links
FEAT-266, FEAT-276, FEAT-72, FEAT-71, ASSET-22

## Files
src/poi.js · data pools · assets/models/mailbox*.glb

## Log
- 2026-11-18 land/feat-275-280-mailboxes: pool tag + knock masses (data/prop-models.js), poi.js mailboxKey / dressYard pad mailbox / _mailboxAt route-house mailboxes, test/mailbox-census.mjs. Roadside draw needs the main.js hook (wip/mailboxes/main-hook.txt).
- 2026-11-17 minted by the scribe from the owner's inbox (20261118013250-sf5w).
- 2026-11-18 proof: test/mailbox-census.mjs 12 seeds PASS (120 route + 1904 random mailboxes, 1.88/km); affected gates 49/49 green after two fixes (dist-assets tag consumer, census seed); fingerprint-world vs main: only `poi` differs (seed6 + seed11 origin story windows); cdp-smoke PASS (39 steps) and pad-e2e ALL OK; sheet wip/mailboxes/sheet.jpg (Larry's, a yard house, mom's). Unverified: the roadside ones in the browser (needs the main.js hook).
- 2026-11-18 DEC-429 rework (land/feat-275-280-mailboxes, 1111342b..230aba97 + main merged 625eb5b0): lone boxes deleted; residence box on the shoulder at the pad end; route houses keep one in front of the target; RV none; main.js `_spawnSatellite` draws the route ones. Gate mailbox-census rewritten; census on 12 random seeds (wip/mailboxes/census-random12.log): 93/93 non-RV residences, 119/120 route houses (one on a hairpin), 27 RVs none. Affected gates 57/57 green; tutorial-seed PASS; fingerprint-world vs main: only `poi` differs (the list carries the mailbox satellites), network/surface/carve/tiles/water/props identical. Sheet wip/mailboxes/sheet2.jpg. 400-seed sweep detached (sweep-a/-b.log).
- 2026-11-19 landing prep after the owner's "Good: land it": main merged twice (d72a56f4, e32d0422 on main 01f3ea28, no conflicts). Affected gates 58/58 green; fingerprint-world vs main: only `poi` differs (seed6 + seed11 origin story), network/profiles/junctions/surface/carve/tiles/water/props identical; tutorial seed 1872706826 (one-window copy at its spawn): only `poi`, and only `satellites` (+1 mailbox on each of its 9 residences, every other satellite unchanged). 400-seed sweep 400/400 no throw (wip/mailboxes/sweep-1119.log). cdp-smoke PASS 41 steps, pad-e2e ALL OK.
