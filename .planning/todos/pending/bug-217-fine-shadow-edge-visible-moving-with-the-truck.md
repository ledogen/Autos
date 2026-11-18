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

Owner, after driving round 1 (chat, 2026-11-18): "Basically totally fixed. The only caveat is the weird double shadow near the specific capture I took is still kind of there. The shadow darkness changes right at the edge as you drive by that spot and I'm not sure why."

## Tracker
- [x] Reproduced at the capture's place, before screenshots kept (`wip/bug-217/before/`)
- [x] The brightness step across the near edge measured (ground in far shadow, inside vs outside the near map): 18.9 luma, 35 % darker
- [x] Cause named (below, Decisions)
- [x] After screenshots at the same place and sun: no visible edge; step −0.04 luma (`wip/bug-217/after/`, `sheet.jpg`)
- [x] Capture 2: the sliding hill-shadow edge reproduced (673 m² of ground changed brightness when the truck moved 20 m under a frozen sun) and gone (155 m², the truck's own shadow and grass shadows)
- [x] Owner drove round 1 (2026-11-18): "basically totally fixed", a residual at capture 2
- [x] Round 2: the residual second edge at capture 2 measured (edge-band swing 9.6 luma) and gone (2.2, still-truck noise 2.8)
- [ ] Owner has looked at round 2

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

- **Round 2 cause (the residual at capture 2).** Terrain still cast into the near map. Wherever the far map says lit or
  partly lit (its soft edge, s_f between 0 and 1), the round-1 blend still lets the near verdict in:
  K·(0.4·mix(1, s_n, s_f) + 0.6·s_f·s_n) is 0.4 + 0.6·s_f with s_n = 1 but 0.4·(1 − s_f) with s_n = 0 (0.7 vs 0.2 at
  s_f = 0.5). The near map's own copy of the hill's shadow is crisp, lies a little apart from the far map's soft edge
  (2 cm vs 0.25 m texels, different bias) and exists only where the near map sees the hill, which depends on the truck.
  So a second, straight, crisp edge ran beside the soft one and changed as the truck drove past. Measured at capture 2,
  fixed camera, truck at five positions 10 m apart: the near map darkened a strip 17 luma below the far-only value,
  and a 1.8 m patch of the edge swung up to 9.6 luma between truck positions (noise floor with a still truck: 2.8–3.5).
- **Round 2 fix (src/main.js shadow-pass wrapper).** Terrain chunks switch castShadow off around the NEAR pass only, so
  terrain casts into the far map alone. s_n now holds only non-terrain casters (truck, props, POIs, grass), so on
  ground with no such caster s_n = 1 and the light is K·(0.4 + 0.6·s_f) everywhere, its soft edge included. Shader
  unchanged (0 instructions); the CPU flips ~300 flags twice per near pass, and the near pass draws fewer triangles.
  Lost: terrain's crisp near-truck self-shadow (cut banks, berms) is now the far map's 0.25 m texels. Measured after:
  edge-band swing max 2.2 luma, the near-only dip is gone, noon and low-sun unchanged or better.
  Rejected: gating s_n with a smoothstep near s_f = 1 keeps the near map's crisp terrain edge wherever it lies
  just outside the far penumbra (the bias offset), still truck-dependent; terrain out of the near map is the principle itself.

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
- 2026-11-18 round 2 (c4e1fafe, src/main.js + a terrain.js comment): terrain casts into the far map only. Capture 2 edge-band
  swing 9.6 → 2.2 luma (still-truck noise 2.8). Merged main first (b5ffbd56). Gates 48/48 affected green; cdp-smoke PASS on the
  re-run (first run: the known DEC-357 sleepy-blink flake); pad-e2e ALL OK; gpu-reset PASS on the re-run (first: 8 impostor
  tiles unbaked at measure time under load 9–11). Sheet regenerated. Unverified: other tiers, the owner's eyes.
