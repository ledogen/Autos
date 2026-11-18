---
id: BUG-217
type: bug
status: open
severity: major
opened: 2026-11-18
source: owner, in chat, 2026-11-18, with capture autos-capture-1794991981756.json (tutorial, current main)
relates: QUAL-18, BUG-78, PERF-41, src/shadow-fade.js, src/main.js
---
lane: engine & world

# BUG-217: The fine shadow map's edge is visible about 20 m ahead and behind the truck, on ground already in coarse shadow

## Next steps
Owner look: `wip/bug-217/sheet.jpg` (before | after, numbers on each frame), then drive the two capture spots on the lane's dev server. "Good" → land `land/bug-217-shadow-seam`.

## Summary
Driving on a mountainside that is in the far (coarse) shadow, a darker patch of near (fine) shadow travels with the truck. Its edge is visible roughly 20 m ahead and 20 m behind.

## Description
Owner: "the glitch where I can see the shadow loading in the edge of the coarse shadow map is definitely there. I think the fine and coarse maps just don't match in brightness very well. So even though this this mountain is in coarse shadow, it still looks like as I drive into it the fine shadow is appearing out of nowhere. However, it's just moving with me, I think. What I can say is the shadow follows the truck, not the freecam. I can say it happens right here. … I can see the edge about 20 meters ahead of me and 20 meters behind me and it moves with the truck as I drive. Try matching the brightness between the two regions and then use screenshots to verify that it's fixed."

Owner, second capture (`wip/bug-217/capture-2.json`, same tutorial world): "Then around this spot in particular, it looks like there's two different shadow edges. They don't run at the same angle, but they do cross in approximately this point, and one of them moves a lot when I drive the truck by. The time in the tutorial is frozen, so it shouldn't really be moving at all, but it moves purely dependent on the position of the truck, so there seems like something wrong going there."

## Tracker
- [x] Reproduced at the capture's place, before screenshots kept (`wip/bug-217/before/`)
- [x] The brightness step across the near edge measured (ground in far shadow, inside vs outside the near map): 18.9 luma, 35 % darker
- [x] Cause named (below, Decisions)
- [x] After screenshots at the same place and sun: no visible edge; step −0.04 luma (`wip/bug-217/after/`, `sheet.jpg`)
- [x] Capture 2: the sliding hill-shadow edge reproduced (673 m² of ground changed brightness when the truck moved 20 m under a frozen sun) and gone (155 m², the truck's own shadow and grass shadows)
- [ ] Owner has looked

## Decisions
- **Cause.** Two sun lights split the key light K: near `sun` 40 %, far `sunFar` 60 %. BUG-78's coupling gave, per pixel,
  near·s_n + far·s_f·s_n (s_n, s_f = the near / far map's verdict, 0 shadow … 1 lit). On ground the far map shades
  (s_f = 0) that is 0.4 K where the near map says lit and 0 where it says shadow. Outside the ±40 m box s_n = 1, so
  far shadows are 0.4 K; inside, wherever the near map ALSO sees the hill, they drop to 0: the travelling dark patch.
  The near map sees a hill only partly: its shadow camera sits 200 m up-sun of the truck, so a hill further than
  that is behind its near plane, and the box ends at ±40 m (fade 33–40 m). Both cuts move with the truck. That is the
  sliding edge of capture 2 and the ~20 m edge of capture 1 (behind the truck the near plane cuts the hill off at
  ~22 m; ahead, the box fade at 33–40 m).
- **Fix (src/shadow-fade.js).** near·mix(1, s_n, s_f) + far·s_f·s_n. Outside the box and in its fade: K·(0.4 + 0.6·s_f),
  exactly as before. Far-lit ground: K·s_n (the near map's crisp detail, the truck's shadow at full strength, as before).
  Far-shadowed ground: 0.4 K whatever the near map says. The far map is sampled in the near light's pass and reused:
  same two lookups, a mix and a multiply more. No new pass or target.
- **Consequences, for the owner.** Hill shadows within ~40 m of the truck are now the far map's softer edge (0.25 m
  texels), not the near map's crisp one. The truck throws no visible shadow while it stands in a hill's shadow (no
  direct sun reaches there; before it threw one at the near light's share). Hill shadows stay at the authored 60 %
  strength everywhere; making them full strength (physically, a hill blocks all the sun) is one constant, the owner's call.

## Open questions

## Links
QUAL-18 (near edge fade), BUG-78 (near/far coupling), PERF-41.

## Files
src/shadow-fade.js, src/main.js

## Log
- 2026-11-18 minted by the orchestrator from the owner's chat message and capture.
- 2026-11-18 fixed on land/bug-217-shadow-seam (bfc280b7, src/shadow-fade.js). Shaded-ground step 18.9 → −0.04 luma (capture 1); low sun 17.8 → −0.07;
  capture 2 ground that changed brightness for a 20 m truck move 673 → 155 m² (the rest is the truck's shadow and grass). Noon unchanged.
  Gates 10/10 affected, cdp-smoke PASS (38 steps), pad-e2e ALL OK, gpu-reset PASS. Shots, sheet and tools: wip/bug-217/ (shots.mjs, measure.mjs, edge.mjs, sheet.mjs).
  Unverified: other quality tiers (only Ultra was shot), a moving sun, and the owner's own eyes. Card: owed/bug217-shadow-seam-look.json.
