---
id: FEAT-224
type: feature
status: open
severity: minor
opened: 2026-11-15
source: owner, 2026-11-15 — "even more visual juice i think we want ambient occlusion on the truck and on props in world. this should probably be locked to the high quality setting and above unless its really cheap (maybe just on truck)"
---
lane: Spare

# FEAT-224: Ambient occlusion on the truck and on world props

## Next steps
Spare, after FEAT-223: cost truck-only against truck + props; high quality and above unless the truck-only form is nearly free.

## Summary
Ambient occlusion: darkening in creases and where surfaces meet. Owner: high setting and above, unless truck-only is really cheap.

## Tracker
- [ ] Built to the owner's words above
- [ ] Owner has looked / driven it
- 2026-11-25: owner drove the baked vertex AO on :3895 (reach halved to 0.35 m at his word): "ok im not a fan. lets try a real screen space pass and measure the performance impact." Earlier: "i like the effect it gives the hero truck. it does overdarken the bed though since its a box. its almost closer to cell shading than ao". Vertex AO stays unlanded on land/feat-224-ao @ 79d304e7; screen-space prototype on proto/feat-224-ssao.
